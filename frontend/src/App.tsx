import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { LiveKitRoom } from "@livekit/components-react";
import { DisconnectReason, MediaDeviceFailure, ScreenSharePresets, VideoPresets, type RoomOptions } from "livekit-client";
import { Ban, Bird, Camera, DoorOpen, Hash, Loader2, LogOut, PhoneOff, Plus, Settings, Ticket, Trash2, UserPlus, Users, Volume2 } from "lucide-react";
import {
    api, mensagemDeErro, talvezDeslogado,
    type Canal, type ServidorResumo, type TipoCanal, type Usuario,
} from "./api";
import { ChatSalaProvider } from "./contexto/ChatSala";
import { ControleVozProvider } from "./contexto/ControleVoz";
import { FocoChamadaProvider } from "./contexto/FocoChamada";
import { PerfilProvider } from "./contexto/Perfil";
import { ToastProvider, useToast } from "./contexto/Toasts";
import { atualizarResumo, definirPermissao, removerMembro, useServidor } from "./hooks/useServidor";
import { useSonsDeVoz } from "./hooks/useSonsDeVoz";
import { gateway } from "./lib/gateway";
import { pessoasNaSala } from "./lib/salas";
import { extrairIdConvite, lerArmazenado, removerArmazenado, salvarArmazenado } from "./lib/util";
import type { MapaMembros, Voz } from "./tipos";
import { BarraServidores } from "./components/BarraServidores";
import { CanalTexto } from "./components/CanalTexto";
import { VistaVoz } from "./components/chamada/VistaVoz";
import { ListaMembros } from "./components/ListaMembros";
import { Login } from "./components/Login";
import { Convidar } from "./components/modais/Convidar";
import { ConfiguracoesServidor, type AbaConfiguracoes } from "./components/modais/ConfiguracoesServidor";
import { FotoPerfil } from "./components/modais/FotoPerfil";
import { NovoCanal } from "./components/modais/NovoCanal";
import { NovoServidor, type AbaServidor } from "./components/modais/NovoServidor";
import { DeixarServidor, type ModoDeixar } from "./components/modais/DeixarServidor";
import { RemoverMembro, type ModoRemocao } from "./components/modais/RemoverMembro";
import { PainelCanais } from "./components/PainelCanais";
import { Paleta, type ItemPaleta } from "./components/Paleta";
import { SemServidor } from "./components/SemServidor";
import { IconeServidor } from "./components/ui/Avatar";
import { Cabecalho } from "./components/ui/Cabecalho";

const CHAVE_CONVITE = "liberdade:convite";
// tempo pra fazer o login e voltar com o convite ainda guardado
const VALIDADE_CONVITE_MS = 60 * 60 * 1000;
const CHAVE_SERVIDOR = "liberdade:servidor";
const CHAVE_CANAIS = "liberdade:canais";
const CHAVE_MEMBROS = "liberdade:membros";
const CHAVE_MIC = "liberdade:microfone";

// qualidade da chamada: 720p com camadas menores pra conexões fracas, voz com redução de ruído
const OPCOES_SALA: RoomOptions = {
    adaptiveStream: true,
    dynacast: true,
    videoCaptureDefaults: { resolution: VideoPresets.h720.resolution },
    audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    publishDefaults: {
        simulcast: true,
        videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
        screenShareEncoding: ScreenSharePresets.h1080fps15.encoding,
        dtx: true,
        red: true,
    },
};

// nomes dos erros do navegador ao abrir microfone/câmera
const ERROS_DE_DISPOSITIVO = new Set(["NotAllowedError", "NotFoundError", "NotReadableError", "OverconstrainedError", "AbortError"]);

type ModalAberto =
    | { tipo: "servidor"; aba: AbaServidor }
    | { tipo: "convidar" }
    | { tipo: "canal"; tipoCanal: TipoCanal }
    | { tipo: "foto" }
    | { tipo: "configuracoes"; aba: AbaConfiguracoes }
    | { tipo: "remover"; modo: ModoRemocao; usuario: Usuario }
    | { tipo: "deixar"; modo: ModoDeixar }
    | null;

// modais que só admin usa: quem perde o admin com um deles aberto fica sem ele
const SO_ADMIN = new Set<NonNullable<ModalAberto>["tipo"]>(["convidar", "canal", "configuracoes", "remover"]);

// quem abre /convite/<id> sem estar logado passa pelo login e volta pra "/",
// então o id fica guardado até dar pra usar. Fica no localStorage, que vale pra todas
// as abas: o login do Discord pode voltar em outra (no celular, ele abre o app do Discord)
type ConviteGuardado = { id: string; ate: number };

function guardarConviteDaUrl() {
    const id = location.pathname.startsWith("/convite/") ? extrairIdConvite(location.pathname) : null;
    if (id) {
        salvarArmazenado(CHAVE_CONVITE, { id, ate: Date.now() + VALIDADE_CONVITE_MS } satisfies ConviteGuardado);
        history.replaceState(null, "", "/");
    }
}

function convitePendente() {
    const guardado = lerArmazenado<ConviteGuardado | null>(CHAVE_CONVITE, null);
    return guardado && guardado.ate > Date.now() ? guardado.id : null;
}

export default function App() {
    return (
        <ToastProvider>
            <Aplicacao />
        </ToastProvider>
    );
}

function Aplicacao() {
    const toast = useToast();

    // undefined = verificando, null = deslogado
    const [eu, setEu] = useState<Usuario | null | undefined>(undefined);
    const [servidores, setServidores] = useState<ServidorResumo[] | null>(null);
    const [servidorId, setServidorId] = useState<string | null>(null);
    // contagem de mensagens não lidas por servidor (o badge +1 na barra)
    const [naoLidos, setNaoLidos] = useState<Record<string, number>>({});
    // último canal aberto em cada servidor (só os de texto são lembrados entre visitas)
    const [canalPorServidor, setCanalPorServidor] = useState<Record<string, string>>(() => lerArmazenado(CHAVE_CANAIS, {}));
    const [voz, setVoz] = useState<Voz | null>(null);
    // muda só quando você troca direto de uma sala pra outra (força uma conexão nova)
    const [sessaoVoz, setSessaoVoz] = useState(0);
    const [entrandoEm, setEntrandoEm] = useState<string | null>(null);
    const [micPreferido, setMicPreferido] = useState(() => lerArmazenado(CHAVE_MIC, true));
    const [surdo, setSurdo] = useState(false);
    // em tela estreita (até 1100px, igual ao CSS) a lista de membros cobre o conteúdo,
    // então sempre começa fechada
    const [membrosVisivel, setMembrosVisivel] = useState(() => window.innerWidth > 1100 && lerArmazenado(CHAVE_MEMBROS, true));
    const [modal, setModal] = useState<ModalAberto>(null);
    const [paletaAberta, setPaletaAberta] = useState(false);
    const [menuAberto, setMenuAberto] = useState(false);

    useEffect(() => salvarArmazenado(CHAVE_MIC, micPreferido), [micPreferido]);
    // só salva quando você mesmo mostra/oculta (abrir no celular não muda a escolha do computador)
    const alternarMembros = useCallback(() => {
        setMembrosVisivel((v) => {
            salvarArmazenado(CHAVE_MEMBROS, !v);
            return !v;
        });
    }, []);
    // fechar a lista que abriu por cima do chat (fundo escuro ou o X dela) não muda a escolha salva
    const fecharMembros = useCallback(() => setMembrosVisivel(false), []);

    const tratarErro = useCallback(async (err: unknown) => {
        // o erro pode ser só "não encontrado" ou a sessão ter vencido: o /dataUser tira a dúvida
        if (talvezDeslogado(err)) {
            const aindaLogado = await api.eu().then(() => true, () => false);
            if (!aindaLogado) {
                setEu(null);
                return;
            }
        }
        toast.erro(mensagemDeErro(err));
    }, [toast]);

    const { servidor: servidorCarregado, setServidor } = useServidor(eu ? servidorId : null, tratarErro);
    // evita mostrar por um instante o servidor anterior enquanto o novo carrega
    const servidor = servidorCarregado?.id === servidorId ? servidorCarregado : null;

    // 1. quem sou eu?
    useEffect(() => {
        guardarConviteDaUrl();
        api.eu().then(setEu).catch(() => setEu(null));
    }, []);

    // 2. logado: usa o convite pendente (se tiver) e carrega os servidores
    const euId = eu?.id;

    // conexão em tempo real: abre ao logar, fecha ao sair
    useEffect(() => {
        if (!euId) return;
        gateway.conectar();
        return () => gateway.desconectar();
    }, [euId]);

    // servidor aberto num ref: o ouvinte abaixo lê sempre o atual sem re-assinar
    const servidorIdRef = useRef(servidorId);
    useEffect(() => {
        servidorIdRef.current = servidorId;
    }, [servidorId]);

    // mensagem nova num servidor que não estou vendo → +1 no badge daquele servidor
    useEffect(() => {
        if (!euId) return;
        return gateway.assinar((evento) => {
            if (evento.tipo !== "MENSAGEM_CRIADA") return;
            if (evento.mensagem.autor.id === euId) return;        // não conta o que eu mandei
            if (evento.servidorId === servidorIdRef.current) return; // já estou nesse servidor
            setNaoLidos((n) => ({ ...n, [evento.servidorId]: (n[evento.servidorId] ?? 0) + 1 }));
        });
    }, [euId]);

    // servidor mudou de nome ou de ícone (por você ou outro admin): atualiza a barra de servidores.
    // O servidor aberto se atualiza sozinho no useServidor
    useEffect(() => {
        if (!euId) return;
        return gateway.assinar((evento) => {
            if (evento.tipo !== "UPDATE_SERVER") return;
            setServidores((lista) => lista && lista.map((s) => (s.id === evento.servidorId ? atualizarResumo(s, evento) : s)));
        });
    }, [euId]);

    const servidoresRef = useRef(servidores);
    useEffect(() => {
        servidoresRef.current = servidores;
    }, [servidores]);

    // um servidor deixou de ser seu (você saiu, foi expulso ou banido, ou ele foi apagado): some da
    // barra, a chamada de lá cai e você vai pra outro. A ação e o evento do gateway chamam isso os
    // dois, em qualquer ordem: o primeiro faz tudo e avisa, o segundo não acha mais o servidor e para
    const deixarServidor = useCallback((servidorId: string, tipoAviso: "sucesso" | "info", aviso: (nome: string) => string) => {
        const lista = servidoresRef.current ?? [];
        const servidor = lista.find((s) => s.id === servidorId);
        if (!servidor) return;
        servidoresRef.current = lista.filter((s) => s.id !== servidorId); // já vale pro próximo chamado
        setServidores((atual) => atual && atual.filter((s) => s.id !== servidorId));
        setVoz((v) => (v && v.servidorId === servidorId ? null : v));
        setNaoLidos((n) => (n[servidorId] ? { ...n, [servidorId]: 0 } : n));
        if (servidorIdRef.current === servidorId) setServidorId(lista.find((s) => s.id !== servidorId)?.id ?? null);
        toast[tipoAviso](aviso(servidor.nome));
    }, [toast]);

    // você saiu de um servidor (por outra aba ou aparelho), foi expulso ou banido.
    // Você entrou num: aparece na barra das suas outras abas. Virou admin ou deixou de ser: avisa
    // (os menus de admin aparecem ou somem sozinhos, pela lista de membros)
    useEffect(() => {
        if (!euId) return;
        return gateway.assinar((evento) => {
            if (evento.tipo !== "MEMBROS" || evento.usuarioId !== euId) return;
            const daqui = evento.servidorId;
            if (evento.acao === "PROMOVIDO" || evento.acao === "REBAIXADO") {
                const nome = (servidoresRef.current ?? []).find((s) => s.id === daqui)?.nome;
                if (!nome) return;
                if (evento.acao === "PROMOVIDO") {
                    toast.info(`Agora você é admin de ${nome}.`);
                    return;
                }
                toast.info(`Você não é mais admin de ${nome}.`);
                // estava no meio de algo que só admin faz aqui: o back ia recusar, então fecha
                if (servidorIdRef.current === daqui) setModal((m) => (m && SO_ADMIN.has(m.tipo) ? null : m));
                return;
            }
            // você entrou num servidor: nesta aba já aparece pela resposta do convite; numas outras
            // abas ou aparelhos ele ainda não está na barra, então busca a lista de novo
            if (evento.acao === "ENTROU") {
                if (!(servidoresRef.current ?? []).some((s) => s.id === daqui)) api.listarServidores().then(setServidores).catch(() => {});
                return;
            }
            if (evento.acao === "SAIU") deixarServidor(daqui, "info", (nome) => `Você saiu de ${nome}.`);
            else deixarServidor(daqui, "info", (nome) => `Um admin te ${evento.acao === "BANIDO" ? "baniu" : "removeu"} de ${nome}.`);
        });
    }, [euId, deixarServidor, toast]);

    // o dono apagou um servidor em que você está
    useEffect(() => {
        if (!euId) return;
        return gateway.assinar((evento) => {
            if (evento.tipo !== "SERVIDOR_APAGADO") return;
            deixarServidor(evento.servidorId, "info", (nome) => `O servidor ${nome} foi apagado pelo dono.`);
        });
    }, [euId, deixarServidor]);

    // som de entrada/saída na call em que você está (menos o seu próprio)
    useSonsDeVoz(voz, eu);

    useEffect(() => {
        if (!euId) return;
        let ativo = true;

        (async () => {
            const convite = convitePendente();
            removerArmazenado(CHAVE_CONVITE);

            let abrir: string | null = null;
            if (convite) {
                try {
                    const { servidor: novo } = await api.entrarConvite(convite);
                    abrir = novo.id;
                    toast.sucesso(`Você entrou em ${novo.nome}`);
                } catch (err) {
                    toast.erro(mensagemDeErro(err));
                }
            }

            try {
                const lista = await api.listarServidores();
                if (!ativo) return;
                const ultimo = lerArmazenado<string | null>(CHAVE_SERVIDOR, null);
                setServidores(lista);
                setServidorId(abrir ?? (lista.some((s) => s.id === ultimo) ? ultimo : lista[0]?.id ?? null));
            } catch (err) {
                if (!ativo) return;
                setServidores([]);
                tratarErro(err);
            }
        })();

        return () => {
            ativo = false;
        };
    }, [euId, toast, tratarErro]);

    // Ctrl/⌘ + K abre a busca rápida
    useEffect(() => {
        const aoTeclar = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                setPaletaAberta((v) => !v);
            }
        };
        window.addEventListener("keydown", aoTeclar);
        return () => window.removeEventListener("keydown", aoTeclar);
    }, []);

    // canal aberto: o último deste servidor, ou o primeiro de texto
    const canalAtual = useMemo(() => {
        if (!servidor) return null;
        return (
            servidor.canais.find((c) => c.id === canalPorServidor[servidor.id]) ??
            servidor.canais.find((c) => c.tipo === "TEXTO") ??
            servidor.canais[0] ??
            null
        );
    }, [servidor, canalPorServidor]);

    // em tela estreita a lista de membros fica por cima do chat: se o canal mudar com ela aberta
    // (canal apagado, troca de servidor), fecha, em vez de reabrir sozinha no canal seguinte
    const canalAtualId = canalAtual?.id;
    useEffect(() => {
        if (window.matchMedia("(max-width: 1100px)").matches) setMembrosVisivel(false);
    }, [canalAtualId]);

    const membros: MapaMembros = useMemo(
        () => new Map((servidor?.membros ?? []).map((m) => [m.usuario.id, m.usuario])),
        [servidor],
    );

    const souAdmin = !!eu && !!servidor?.membros.some((m) => m.usuario.id === eu.id && m.permissao === "ADMIN");
    // o dono não sai do servidor (ele ficaria sem dono): no lugar de "sair", ele pode apagar
    const souDono = !!eu && servidor?.dono.id === eu.id;

    // ---------- navegação ----------

    const irParaServidor = useCallback((id: string) => {
        setServidorId(id);
        setMenuAberto(false);
        salvarArmazenado(CHAVE_SERVIDOR, id);
        // abriu o servidor: zera o badge dele
        setNaoLidos((n) => (n[id] ? { ...n, [id]: 0 } : n));
    }, []);

    const selecionarCanal = useCallback((idServidor: string, canal: Canal) => {
        setCanalPorServidor((mapa) => ({ ...mapa, [idServidor]: canal.id }));
        if (canal.tipo === "TEXTO") {
            salvarArmazenado(CHAVE_CANAIS, { ...lerArmazenado<Record<string, string>>(CHAVE_CANAIS, {}), [idServidor]: canal.id });
        }
        setMenuAberto(false);
    }, []);

    // ---------- chamada ----------

    async function entrarNaVoz(canal: Canal) {
        if (!servidor || entrandoEm || voz?.canal.id === canal.id) return;
        setEntrandoEm(canal.id);
        try {
            const conexao = await api.tokenVoz(canal.id);
            if (voz) setSessaoVoz((n) => n + 1);
            setVoz({ canal, servidorId: servidor.id, servidorNome: servidor.nome, conexao, desde: Date.now() });
            // o gateway avisa os outros que você entrou (ENTROU_NA_CALL); nada a recarregar
        } catch (err) {
            tratarErro(err);
        } finally {
            setEntrandoEm(null);
        }
    }

    // clicar numa sala de voz já entra nela; num canal de texto, abre o chat
    function abrirCanal(canal: Canal) {
        if (!servidor) return;
        selecionarCanal(servidor.id, canal);
        if (canal.tipo === "VOZ") entrarNaVoz(canal);
    }

    const sairDaVoz = useCallback(() => {
        setVoz(null);
        // o gateway avisa os outros que você saiu (SAIU_DA_CALL)
    }, []);

    function abrirChamada() {
        if (!voz) return;
        irParaServidor(voz.servidorId);
        selecionarCanal(voz.servidorId, voz.canal);
    }

    async function sairDaConta() {
        setVoz(null);
        await api.sair().catch(() => {});
        setEu(null);
        setServidores(null);
        setServidorId(null);
    }

    const idVoz = voz?.canal.id;

    // o início da sala em que você está vem do servidor (é o mesmo pra todo mundo). Guardado na voz,
    // continua valendo quando você vai pra outro servidor e a lista de canais de lá some
    const inicioDaMinhaSala = voz && servidor?.id === voz.servidorId
        ? servidor.canais.find((c) => c.id === voz.canal.id)?.inicioCall ?? null
        : null;
    useEffect(() => {
        if (!inicioDaMinhaSala) return;
        setVoz((v) => (v && v.canal.id === idVoz && v.inicioSala !== inicioDaMinhaSala ? { ...v, inicioSala: inicioDaMinhaSala } : v));
    }, [inicioDaMinhaSala, idVoz]);

    // callbacks estáveis: o LiveKitRoom refaz a conexão quando eles mudam
    const aoDesconectar = useCallback((motivo?: DisconnectReason) => {
        // ignora o aviso da sala antiga quando você troca de sala
        setVoz((v) => (v && v.canal.id === idVoz ? null : v));
        // saiu por conta própria (botão, trocou de sala, foi expulso do servidor): sem aviso
        if (motivo === undefined || motivo === DisconnectReason.CLIENT_INITIATED) return;
        if (motivo === DisconnectReason.ROOM_DELETED) {
            // o back apaga a sala no LiveKit junto com o canal
            toast.info("A sala de voz foi apagada.");
        } else if (motivo === DisconnectReason.DUPLICATE_IDENTITY) {
            toast.info("Você entrou nessa sala em outra aba ou aparelho.");
        } else if (motivo === DisconnectReason.PARTICIPANT_REMOVED) {
            toast.info("Você foi removido da sala.");
        } else {
            toast.info("Você foi desconectado da sala.");
        }
    }, [idVoz, toast]);

    const aoErroNaSala = useCallback((err: Error) => {
        if (err.name === "ConnectionError") {
            setVoz(null);
            toast.erro("Não foi possível conectar à sala de voz.");
            return;
        }
        // falha de microfone/câmera (sem permissão, sem aparelho, em uso por outro programa)
        // já é avisada pelo onMediaDeviceFailure
        if (ERROS_DE_DISPOSITIVO.has(err.name)) return;
        toast.erro(err.message);
    }, [toast]);

    // único lugar que avisa falha de câmera/microfone (os botões só desfazem o estado)
    const aoFalharDispositivo = useCallback((falha?: MediaDeviceFailure, tipo?: MediaDeviceKind) => {
        // sem tipo = compartilhamento de tela: quem avisa é o botão da tela,
        // e fechar a janela de escolher a tela nem é erro
        if (tipo !== "audioinput" && tipo !== "videoinput") return;
        const [oDispositivo, dispositivo] = tipo === "videoinput" ? ["a câmera", "câmera"] : ["o microfone", "microfone"];
        if (falha === MediaDeviceFailure.PermissionDenied) {
            toast.erro(`Sem permissão pra usar ${oDispositivo}. Libere nas configurações do navegador.`);
        } else if (falha === MediaDeviceFailure.NotFound) {
            toast.erro(`Nenhum${tipo === "videoinput" ? "a" : ""} ${dispositivo} encontrad${tipo === "videoinput" ? "a" : "o"}.`);
        } else if (falha === MediaDeviceFailure.DeviceInUse) {
            toast.erro(`${oDispositivo[0].toUpperCase()}${oDispositivo.slice(1)} está sendo usad${tipo === "videoinput" ? "a" : "o"} por outro programa.`);
        } else {
            toast.erro(`Não consegui acessar ${oDispositivo}. Confira as permissões do navegador.`);
        }
    }, [toast]);

    // ---------- respostas dos modais ----------

    function aoCriarOuEntrarServidor(novo: ServidorResumo, aba: AbaServidor) {
        setServidores((lista) => (lista?.some((s) => s.id === novo.id) ? lista : [...(lista ?? []), novo]));
        irParaServidor(novo.id);
        setModal(null);
        toast.sucesso(aba === "criar" ? `Servidor ${novo.nome} criado` : `Você entrou em ${novo.nome}`);
    }

    function aoCriarCanal(novo: Canal) {
        if (!servidor) return;
        // dedup: o CANAL_CRIADO do WS pode ter adicionado antes da resposta do POST
        setServidor((s) => (s && !s.canais.some((c) => c.id === novo.id) ? { ...s, canais: [...s.canais, novo] } : s));
        setModal(null);
        // abre o canal novo (numa sala de voz, abre a tela dela sem entrar sozinho)
        selecionarCanal(servidor.id, novo);
    }

    function aoEditarServidor(atualizado: { id: string; nome: string }) {
        // atualiza na hora pra quem editou; o UPDATE_SERVER chega pros outros (e pra você também, sem efeito)
        setServidores((lista) => lista && lista.map((s) => (s.id === atualizado.id ? { ...s, nome: atualizado.nome } : s)));
        setServidor((s) => (s && s.id === atualizado.id ? { ...s, nome: atualizado.nome } : s));
        setModal(null);
        toast.sucesso("Servidor atualizado");
    }

    // ícone novo: troca na barra e no servidor aberto na hora (o modal continua aberto, dá pra
    // mexer no nome também). O UPDATE_SERVER chega pros outros
    function aoTrocarIcone(atualizado: { id: string; iconeUrl: string | null }) {
        const mudanca = { iconeUrl: atualizado.iconeUrl };
        setServidores((lista) => lista && lista.map((s) => (s.id === atualizado.id ? atualizarResumo(s, mudanca) : s)));
        setServidor((s) => (s && s.id === atualizado.id ? atualizarResumo(s, mudanca) : s));
        toast.sucesso("Ícone do servidor atualizado");
    }

    // igual à regra do back: admin expulsa e bane só membro comum (os outros admins e você ficam
    // de fora). O dono sempre é ADMIN, mas fica protegido pelo id também, por garantia
    function podeModerar(alvo: Usuario) {
        if (!servidor || !eu || !souAdmin || alvo.id === eu.id || alvo.id === servidor.dono.id) return false;
        return servidor.membros.some((m) => m.usuario.id === alvo.id && m.permissao !== "ADMIN");
    }

    function papelDe(alvo: Usuario): "dono" | "admin" | null {
        if (!servidor) return null;
        if (alvo.id === servidor.dono.id) return "dono";
        return servidor.membros.some((m) => m.usuario.id === alvo.id && m.permissao === "ADMIN") ? "admin" : null;
    }

    // igual à regra do back: qualquer admin dá ou tira admin de quem está no servidor, menos do
    // dono. Você mesmo também fica de fora (tirar o próprio admin por engano não tem volta)
    function podeMudarCargo(alvo: Usuario) {
        if (!servidor || !eu || !souAdmin || alvo.id === eu.id || alvo.id === servidor.dono.id) return false;
        return servidor.membros.some((m) => m.usuario.id === alvo.id);
    }

    // deu certo: muda de grupo na hora (o evento chega depois e não muda nada); deu errado: avisa
    async function mudarCargo(usuario: Usuario, admin: boolean) {
        if (!servidor) return;
        const idServidor = servidor.id;
        try {
            if (admin) await api.promoverMembro(idServidor, usuario.id);
            else await api.rebaixarMembro(idServidor, usuario.id);
        } catch (err) {
            toast.erro(mensagemDeErro(err));
            return;
        }
        setServidor((s) => (s && s.id === idServidor ? definirPermissao(s, usuario.id, admin ? "ADMIN" : "MEMBRO") : s));
        toast.sucesso(admin ? `${usuario.nome} agora é admin.` : `${usuario.nome} não é mais admin.`);
    }

    // o erro sobe pro modal mostrar; deu certo: some da lista na hora (o evento chega depois)
    async function removerDoServidor(modo: ModoRemocao, usuario: Usuario) {
        if (!servidor) return;
        const idServidor = servidor.id;
        if (modo === "banir") await api.banirMembro(idServidor, usuario.id);
        else await api.expulsarMembro(idServidor, usuario.id);
        setServidor((s) => (s && s.id === idServidor ? removerMembro(s, usuario.id) : s));
        setModal(null);
        toast.sucesso(modo === "banir" ? `Você baniu ${usuario.nome} do servidor.` : `Você expulsou ${usuario.nome} do servidor.`);
    }

    // o erro sobe pro modal mostrar; deu certo: o servidor some na hora (o evento do gateway chega
    // depois e não faz nada, porque o servidor já saiu da lista)
    async function confirmarDeixar(modo: ModoDeixar) {
        if (!servidor) return;
        const idServidor = servidor.id;
        if (modo === "apagar") await api.apagarServidor(idServidor);
        else await api.sairDoServidor(idServidor);
        setModal(null);
        deixarServidor(idServidor, "sucesso", (nome) => (modo === "apagar" ? `Você apagou o servidor ${nome}.` : `Você saiu de ${nome}.`));
    }

    function aoTrocarFoto(atualizado: Usuario, removida: boolean) {
        const trocar = (u: Usuario) => (u.id === atualizado.id ? { ...u, avatarUrl: atualizado.avatarUrl } : u);
        setEu((u) => u && trocar(u));
        // você também aparece no servidor aberto: lista de membros e salas de voz
        setServidor((s) => s && {
            ...s,
            membros: s.membros.map((m) => ({ ...m, usuario: trocar(m.usuario) })),
            canais: s.canais.map((c) => (c.participantes ? { ...c, participantes: c.participantes.map(trocar) } : c)),
        });
        setModal(null);
        toast.sucesso(removida ? "Foto de perfil removida" : "Foto de perfil atualizada");
    }

    const apagarCanal = useCallback(async (canal: Canal) => {
        if (!window.confirm(`Apagar o canal "${canal.nome}"? Isso não pode ser desfeito.`)) return;
        try {
            await api.apagarCanal(canal.id);
            // some na hora pra quem apagou; o CANAL_APAGADO também chega e é idempotente
            setServidor((s) => (s ? { ...s, canais: s.canais.filter((c) => c.id !== canal.id) } : s));
        } catch (err) {
            tratarErro(err);
        }
    }, [setServidor, tratarErro]);

    // ---------- dados derivados ----------

    // id do usuário -> sala em que está (aparece na lista de membros)
    const emChamada = useMemo(() => {
        const mapa = new Map<string, string>();
        if (!servidor || !eu) return mapa;
        for (const c of servidor.canais) {
            if (c.tipo !== "VOZ") continue;
            for (const p of pessoasNaSala(c, voz, eu)) mapa.set(p.id, c.nome);
        }
        return mapa;
    }, [servidor, voz, eu]);

    const itensPaleta: ItemPaleta[] = [];
    if (servidor) {
        for (const c of servidor.canais) {
            itensPaleta.push({
                id: c.id,
                grupo: servidor.nome,
                titulo: c.nome,
                dica: c.tipo === "TEXTO" ? "Canal de texto" : "Sala de voz",
                icone: c.tipo === "TEXTO" ? <Hash size={16} /> : <Volume2 size={16} />,
                acao: () => abrirCanal(c),
            });
        }
    }
    for (const s of servidores ?? []) {
        if (s.id === servidorId) continue;
        itensPaleta.push({
            id: `servidor-${s.id}`,
            grupo: "Servidores",
            titulo: s.nome,
            icone: <IconeServidor nome={s.nome} url={s.iconeUrl} tamanho={20} />,
            acao: () => irParaServidor(s.id),
        });
    }
    if (servidor && souAdmin) {
        itensPaleta.push(
            { id: "convidar", grupo: "Ações", titulo: "Convidar pessoas", dica: servidor.nome, icone: <UserPlus size={16} />, acao: () => setModal({ tipo: "convidar" }) },
            { id: "novo-canal", grupo: "Ações", titulo: "Criar canal de texto", dica: servidor.nome, icone: <Hash size={16} />, acao: () => setModal({ tipo: "canal", tipoCanal: "TEXTO" }) },
            { id: "nova-sala", grupo: "Ações", titulo: "Criar sala de voz", dica: servidor.nome, icone: <Volume2 size={16} />, acao: () => setModal({ tipo: "canal", tipoCanal: "VOZ" }) },
            { id: "configuracoes", grupo: "Ações", titulo: "Configurações do servidor", dica: servidor.nome, icone: <Settings size={16} />, acao: () => setModal({ tipo: "configuracoes", aba: "geral" }) },
            { id: "banimentos", grupo: "Ações", titulo: "Banimentos", dica: servidor.nome, icone: <Ban size={16} />, acao: () => setModal({ tipo: "configuracoes", aba: "banimentos" }) },
        );
    }
    if (servidor) {
        itensPaleta.push(
            souDono
                ? { id: "apagar-servidor", grupo: "Ações", titulo: "Apagar servidor", dica: servidor.nome, icone: <Trash2 size={16} />, acao: () => setModal({ tipo: "deixar", modo: "apagar" }) }
                : { id: "sair-servidor", grupo: "Ações", titulo: "Sair do servidor", dica: servidor.nome, icone: <DoorOpen size={16} />, acao: () => setModal({ tipo: "deixar", modo: "sair" }) },
        );
    }
    itensPaleta.push(
        { id: "novo-servidor", grupo: "Ações", titulo: "Criar servidor", icone: <Plus size={16} />, acao: () => setModal({ tipo: "servidor", aba: "criar" }) },
        { id: "entrar-convite", grupo: "Ações", titulo: "Entrar com convite", icone: <Ticket size={16} />, acao: () => setModal({ tipo: "servidor", aba: "entrar" }) },
    );
    // a lista de membros só aparece nos canais de texto (numa sala de voz o botão não faria nada)
    if (servidor && canalAtual?.tipo === "TEXTO") {
        itensPaleta.push({
            id: "membros",
            grupo: "Ações",
            titulo: membrosVisivel ? "Ocultar membros" : "Mostrar membros",
            icone: <Users size={16} />,
            acao: alternarMembros,
        });
    }
    if (voz) {
        itensPaleta.push({ id: "sair-sala", grupo: "Ações", titulo: "Sair da sala de voz", dica: voz.canal.nome, icone: <PhoneOff size={16} />, acao: sairDaVoz });
    }
    itensPaleta.push(
        { id: "foto-perfil", grupo: "Ações", titulo: "Alterar foto de perfil", icone: <Camera size={16} />, acao: () => setModal({ tipo: "foto" }) },
        { id: "sair-conta", grupo: "Ações", titulo: "Sair da conta", icone: <LogOut size={16} />, acao: sairDaConta },
    );

    // ---------- telas ----------

    if (eu === undefined) {
        return (
            <div className="tela-carregando">
                <Bird size={28} strokeWidth={1.8} />
                <Loader2 size={20} className="girar" />
            </div>
        );
    }

    if (eu === null) {
        return <Login convidado={convitePendente() !== null} />;
    }

    const abrirMenu = () => setMenuAberto(true);
    let conteudo: ReactNode;

    if (servidores === null || (servidorId && !servidor)) {
        conteudo = <VistaCarregando onMenu={abrirMenu} />;
    } else if (servidores.length === 0) {
        conteudo = (
            <SemServidor
                onCriar={() => setModal({ tipo: "servidor", aba: "criar" })}
                onEntrar={() => setModal({ tipo: "servidor", aba: "entrar" })}
                onMenu={abrirMenu}
            />
        );
    } else if (!servidor || !canalAtual) {
        conteudo = (
            <SemCanais
                nome={servidor?.nome ?? ""}
                souAdmin={souAdmin}
                onCriar={() => setModal({ tipo: "canal", tipoCanal: "TEXTO" })}
                onMenu={abrirMenu}
            />
        );
    } else if (canalAtual.tipo === "TEXTO") {
        conteudo = (
            <CanalTexto
                key={canalAtual.id}
                canal={canalAtual}
                eu={eu}
                membros={membros}
                membrosVisivel={membrosVisivel}
                onMembros={alternarMembros}
                onBuscar={() => setPaletaAberta(true)}
                onMenu={abrirMenu}
            />
        );
    } else {
        conteudo = (
            <VistaVoz
                canal={canalAtual}
                eu={eu}
                membros={membros}
                voz={voz}
                pessoas={pessoasNaSala(canalAtual, voz, eu)}
                entrando={entrandoEm === canalAtual.id}
                onEntrar={() => entrarNaVoz(canalAtual)}
                onSair={sairDaVoz}
                onMenu={abrirMenu}
            />
        );
    }

    const mostrarMembros = !!servidor && membrosVisivel && canalAtual?.tipo === "TEXTO";

    return (
        // a sala de voz fica em volta de tudo: a chamada continua enquanto você navega.
        // entrar/sair só liga e desliga a conexão; trocar direto de sala muda a key
        // e cria uma conexão nova (desconecta da antiga e conecta na nova)
        <LiveKitRoom
            key={sessaoVoz}
            serverUrl={voz?.conexao.url}
            token={voz?.conexao.token}
            connect={!!voz}
            audio={micPreferido && !surdo}
            video={false}
            options={OPCOES_SALA}
            className={`app ${menuAberto ? "menu-aberto" : ""} ${mostrarMembros ? "com-membros" : ""}`}
            onDisconnected={aoDesconectar}
            onError={aoErroNaSala}
            onMediaDeviceFailure={aoFalharDispositivo}
        >
            <ControleVozProvider micPreferido={micPreferido} setMicPreferido={setMicPreferido} surdo={surdo} setSurdo={setSurdo}>
                <ChatSalaProvider desde={voz?.desde ?? null}>
                    <FocoChamadaProvider desde={voz?.desde ?? null}>
                        <PerfilProvider
                            eu={eu}
                            membros={membros}
                            servidorId={servidorId}
                            onEditarFoto={() => setModal({ tipo: "foto" })}
                            papelDe={papelDe}
                            podeMudarCargo={podeMudarCargo}
                            onMudarCargo={mudarCargo}
                            podeModerar={podeModerar}
                            onExpulsar={(usuario) => setModal({ tipo: "remover", modo: "expulsar", usuario })}
                            onBanir={(usuario) => setModal({ tipo: "remover", modo: "banir", usuario })}
                        >
                            <div className="navegacao">
                                <BarraServidores
                                    servidores={servidores ?? []}
                                    atualId={servidorId}
                                    servidorDaChamada={voz?.servidorId ?? null}
                                    naoLidos={naoLidos}
                                    onEscolher={irParaServidor}
                                    onAdicionar={() => setModal({ tipo: "servidor", aba: "criar" })}
                                />
                                <PainelCanais
                                    servidor={servidor}
                                    carregando={servidores === null || (!!servidorId && !servidor)}
                                    canalAtualId={canalAtual?.id ?? null}
                                    voz={voz}
                                    entrandoEm={entrandoEm}
                                    eu={eu}
                                    souAdmin={souAdmin}
                                    membros={membros}
                                    onCanal={abrirCanal}
                                    onApagarCanal={apagarCanal}
                                    onConvidar={() => setModal({ tipo: "convidar" })}
                                    onNovoCanal={(tipoCanal) => setModal({ tipo: "canal", tipoCanal })}
                                    onConfiguracoes={() => setModal({ tipo: "configuracoes", aba: "geral" })}
                                    souDono={souDono}
                                    onSairServidor={() => setModal({ tipo: "deixar", modo: "sair" })}
                                    onAbrirChamada={abrirChamada}
                                    onSairChamada={sairDaVoz}
                                    onEditarFoto={() => setModal({ tipo: "foto" })}
                                    onSairConta={sairDaConta}
                                />
                            </div>

                            {menuAberto && <div className="fundo-escuro" onClick={() => setMenuAberto(false)} />}

                            <main className="principal">{conteudo}</main>

                            {mostrarMembros && servidor && (
                                <>
                                    <div className="fundo-escuro so-sobreposto" onClick={fecharMembros} />
                                    <ListaMembros servidor={servidor} eu={eu} emChamada={emChamada} onFechar={fecharMembros} />
                                </>
                            )}

                            {modal?.tipo === "servidor" && (
                                <NovoServidor abaInicial={modal.aba} onFechar={() => setModal(null)} onPronto={aoCriarOuEntrarServidor} />
                            )}
                            {modal?.tipo === "convidar" && servidor && (
                                <Convidar servidor={servidor} onFechar={() => setModal(null)} />
                            )}
                            {modal?.tipo === "canal" && servidor && (
                                <NovoCanal
                                    servidorId={servidor.id}
                                    tipoInicial={modal.tipoCanal}
                                    onFechar={() => setModal(null)}
                                    onCriado={aoCriarCanal}
                                />
                            )}
                            {modal?.tipo === "remover" && servidor && (
                                <RemoverMembro
                                    modo={modal.modo}
                                    usuario={modal.usuario}
                                    servidorNome={servidor.nome}
                                    onFechar={() => setModal(null)}
                                    onConfirmar={() => removerDoServidor(modal.modo, modal.usuario)}
                                />
                            )}
                            {modal?.tipo === "deixar" && servidor && (
                                <DeixarServidor
                                    modo={modal.modo}
                                    servidor={servidor}
                                    onFechar={() => setModal(null)}
                                    onConfirmar={() => confirmarDeixar(modal.modo)}
                                />
                            )}
                            {modal?.tipo === "configuracoes" && servidor && (
                                <ConfiguracoesServidor
                                    servidor={servidor}
                                    abaInicial={modal.aba}
                                    onFechar={() => setModal(null)}
                                    onSalvo={aoEditarServidor}
                                    onIconeSalvo={aoTrocarIcone}
                                    onApagar={souDono ? () => setModal({ tipo: "deixar", modo: "apagar" }) : undefined}
                                />
                            )}
                            {modal?.tipo === "foto" && (
                                <FotoPerfil eu={eu} onFechar={() => setModal(null)} onPronto={aoTrocarFoto} />
                            )}
                            {paletaAberta && <Paleta itens={itensPaleta} onFechar={() => setPaletaAberta(false)} />}
                        </PerfilProvider>
                    </FocoChamadaProvider>
                </ChatSalaProvider>
            </ControleVozProvider>
        </LiveKitRoom>
    );
}

function VistaCarregando({ onMenu }: { onMenu: () => void }) {
    return (
        <div className="vista">
            <Cabecalho titulo="" onMenu={onMenu} />
            <div className="vista-centro">
                <Loader2 size={22} className="girar texto-fraco" />
            </div>
        </div>
    );
}

type SemCanaisProps = { nome: string; souAdmin: boolean; onCriar: () => void; onMenu: () => void };

function SemCanais({ nome, souAdmin, onCriar, onMenu }: SemCanaisProps) {
    return (
        <div className="vista">
            <Cabecalho titulo={nome} onMenu={onMenu} />
            <div className="vista-centro">
                <div className="estado-vazio">
                    <strong>Este servidor ainda não tem canais</strong>
                    {souAdmin ? (
                        <button className="botao botao-primario" onClick={onCriar}>
                            <Plus size={16} /> Criar canal
                        </button>
                    ) : (
                        <span>Quando um admin criar um canal, ele aparece aqui.</span>
                    )}
                </div>
            </div>
        </div>
    );
}
