// Mundo 3D: o servidor aberto vira um andar do prédio, as salas de voz viram salas
// de verdade. Entrar pela porta = entrar na call; sair dela = sair da call.
// Carregado sob demanda (o three.js só baixa quando alguém abre o 3D).
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as EventoPonteiro, type ReactNode, type RefObject } from "react";
import { VideoTrack, useConnectionState, useMaybeRoomContext, useRemoteParticipants, useTracks, type TrackReference } from "@livekit/components-react";
import { ConnectionState, Track } from "livekit-client";
import { ChevronsDown, ChevronsUp, Keyboard, Loader2, LogOut, MonitorUp, MousePointerClick, Settings, SwitchCamera, Tablet, X } from "lucide-react";
import type { Object3D } from "three";
import type { Canal, ServidorDetalhe, ServidorResumo, Usuario } from "../../api";
import { useChatSala } from "../../contexto/ChatSala";
import { fonteDaTV, useControleSala } from "../../contexto/ControleSala";
import { useControleVoz } from "../../contexto/ControleVoz";
import { useYoutubeSala } from "../../contexto/YoutubeSala";
import { pessoasNaSala } from "../../lib/salas";
import { estaDigitando } from "../../lib/util";
import type { MapaMembros, Voz } from "../../tipos";
import type { InfoMonitor } from "./LanHouse";
import { CanalTexto } from "../CanalTexto";
import { ChatAoVivo } from "../chamada/ChatAoVivo";
import { Controles } from "../chamada/Controles";
import { IconeServidor } from "../ui/Avatar";
import { PainelControle } from "../controle/PainelControle";
import type { SomDaTV } from "./AudioEspacial";
import { lerConfig, mudarConfig, useConfigMundo } from "./config";
import { ConfigMundo, Velocimetro } from "./ConfigMundo";
import type { Papel } from "./Boneco";
import { CanvasMundo, Cena, criarTunel, type Pessoa, type Tunel } from "./Cena";
import type { LinhaChat } from "./Holograma";
import type { TelaNaTV, YoutubeNaTV } from "./Predio";
import type { ControleToque, PedidoJogador } from "./Jogador";
import { dentro, gerarPlanta, nascerNaSala, type Interativo, type Ponto } from "./planta";
import { ITEM, POSTURA, useJogadoresDoAndar, type Pose } from "./rede";
import { AvisoSoftware, ContextoPerdido, Limite3D, SemWebGL, verificarWebGL } from "./SemWebGL";
import { ListaTeclas } from "./Teclas";
import { TelaCarregando } from "./TelaCarregando";
import { carregarFontes } from "./texturas";

type Props = {
    servidor: ServidorDetalhe | null;
    servidores: ServidorResumo[];
    eu: Usuario;
    membros: MapaMembros;
    voz: Voz | null;
    entrandoEm: string | null;
    onEntrarSala: (canal: Canal) => void;
    onSairSala: () => void;
    // busca antes os tokens das calls do andar (salas e hall): trocar de sala fica rápido
    onAquecerCalls: (servidorId: string, canaisVoz: string[]) => void;
    // a conexão com a call falhou e está tentando de novo sozinha
    tentandoDeNovo: boolean;
    // call do hall do andar (hall + corredor); mudo: entra com o microfone desligado
    onEntrarHall: (opcoes?: { mudo?: boolean }) => void;
    onTrocarAndar: (servidorId: string) => void;
    // chegou a posição de alguém que não está na lista de membros: recarrega o servidor
    onMembroDesconhecido?: () => void;
    onFechar: () => void;
};

const ehToque = () => typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;

export default function Mundo3D(props: Props) {
    const [fontesProntas, setFontesProntas] = useState(false);
    useEffect(() => {
        carregarFontes().then(() => setFontesProntas(true));
    }, []);

    // dá pra desenhar em 3D aqui? (sem placa de vídeo não dá, ou dá bem devagar)
    const [suporte, setSuporte] = useState(verificarWebGL);
    const [avisoSoftware, setAvisoSoftware] = useState(true);
    const [contextoPerdido, setContextoPerdido] = useState(false);
    // muda pra montar a cena do zero ("tentar de novo", "recarregar o 3D")
    const [tentativa, setTentativa] = useState(0);
    // por onde o andar manda o conteúdo pro canvas (que não é recriado ao trocar de andar)
    const [tunel] = useState(criarTunel);
    // a primeira chegada (vindo da tela normal) entra na call do hall mutado; as trocas de andar não
    const chegouAgora = useRef(true);
    const remontar = () => {
        setSuporte(verificarWebGL());
        setContextoPerdido(false);
        setTentativa((n) => n + 1);
    };

    const { servidor } = props;
    // criou ou apagou canal: a planta muda, então o andar é montado de novo
    const chave = servidor ? `${servidor.id}:${servidor.canais.map((c) => c.id).join(",")}:${tentativa}` : "";
    const semWebGL = <SemWebGL onTentar={remontar} onFechar={props.onFechar} />;

    // a tela de carregamento fica um instante depois do andar montar (o primeiro quadro
    // compila os shaders e engasga) e some devagar por cima dele
    const pronto = !!servidor && fontesProntas;
    const [cortina, setCortina] = useState<"cobrindo" | "saindo" | null>("cobrindo");
    useEffect(() => {
        if (!pronto) {
            setCortina("cobrindo");
            return;
        }
        const saindo = window.setTimeout(() => setCortina("saindo"), 300);
        const fim = window.setTimeout(() => setCortina(null), 800);
        return () => {
            window.clearTimeout(saindo);
            window.clearTimeout(fim);
        };
    }, [pronto]);

    return (
        <div className="mundo">
            {!suporte.ok ? (
                semWebGL
            ) : (
                <Limite3D key={tentativa} fallback={semWebGL}>
                    <CanvasMundo tunel={tunel} onContexto={setContextoPerdido} />
                    {pronto && <Andar key={chave} {...props} servidor={servidor} tunel={tunel} chegouAgora={chegouAgora} />}
                    {cortina && <TelaCarregando texto="Chegando no andar…" saindo={cortina === "saindo"} />}
                    {contextoPerdido && <ContextoPerdido onRecarregar={remontar} />}
                    {suporte.software && avisoSoftware && <AvisoSoftware onFechar={() => setAvisoSoftware(false)} />}
                </Limite3D>
            )}
            <button className="mundo-sair" onClick={props.onFechar}>
                <LogOut size={16} />
                Sair do 3D
            </button>
        </div>
    );
}

// acao/iconeToque: no toque, o botão da dica faz isso (em vez do E/F) e mostra esse ícone
type Dica = { tecla?: string; texto: string; carregando?: boolean; acao?: () => void; iconeToque?: ReactNode };

type PropsAndar = Props & {
    servidor: ServidorDetalhe;
    tunel: Tunel;
    chegouAgora: RefObject<boolean>;
};

function Andar({
    servidor, servidores, eu, membros, voz, entrandoEm, tentandoDeNovo,
    onEntrarSala, onSairSala, onEntrarHall, onAquecerCalls, onTrocarAndar, onMembroDesconhecido, tunel, chegouAgora,
}: PropsAndar) {
    const { surdo } = useControleVoz();
    const youtube = useYoutubeSala();
    const controle = useControleSala();
    const sala = useMaybeRoomContext();
    const remotos = useRemoteParticipants();
    // faixas sem vídeo (ainda não recebidas, ou câmera desligada) são ignoradas mais abaixo
    const faixas = useTracks([Track.Source.Camera, Track.Source.ScreenShare], { onlySubscribed: false });

    // a planta só depende de quais canais existem, e o Andar é recriado quando isso muda
    const [planta] = useState(() => gerarPlanta(servidor.canais));
    const canais = useMemo(() => new Map(servidor.canais.map((c) => [c.id, c])), [servidor.canais]);
    const idsSalas = useMemo(() => new Set(planta.salas.map((s) => s.canalId)), [planta]);
    const andar = Math.max(1, servidores.findIndex((s) => s.id === servidor.id) + 1);
    const vozNoAndar = voz && idsSalas.has(voz.canal.id) ? voz.canal.id : null;

    // já estava numa call daqui? aparece dentro da sala; senão, no elevador
    const [inicio] = useState(() => {
        const salaDaCall = planta.salas.find((s) => s.canalId === vozNoAndar);
        return salaDaCall ? nascerNaSala(salaDaCall) : planta.nascer;
    });
    const pose = useRef<Pose>({ ...inicio, y: 0, pitch: 0, postura: POSTURA.EM_PE, item: ITEM.NADA });
    const posicoes = useRef(new Map<string, Ponto>()).current;
    const toque = useRef<ControleToque>({ andar: { x: 0, y: 0 }, olhar: { x: 0, y: 0 }, pular: false, agachado: false });
    const pedido = useRef<PedidoJogador | null>(null);
    const [postura, setPostura] = useState<number>(POSTURA.EM_PE);
    const [agachadoToque, setAgachadoToque] = useState(false);
    const noElevador = dentro(planta.elevador, inicio);

    const [salaAtual, setSalaAtual] = useState<string | null>(() => planta.salas.find((s) => dentro(s.ret, inicio))?.canalId ?? null);
    const [foco, setFoco] = useState<Interativo | null>(null);
    const [travado, setTravado] = useState(false);
    // fechou o tablet no X: o clique deixa travar o mouse de novo, então já volta pro jogo.
    // O tablet só some quando o mouse estiver travado (se o navegador ainda estiver na espera
    // dele depois de soltar o mouse, o tablet espera aberto, mostrando "voltando ao jogo")
    const [voltandoDoTablet, setVoltandoDoTablet] = useState(false);
    useEffect(() => {
        if (!voltandoDoTablet) return;
        if (travado) {
            setControleAberto(null);
            setVoltandoDoTablet(false);
            return;
        }
        // não deu (o navegador recusou de vez): fecha mesmo assim, e o clique volta pro jogo
        const t = window.setTimeout(() => {
            setControleAberto(null);
            setVoltandoDoTablet(false);
        }, 3200);
        return () => window.clearTimeout(t);
    }, [voltandoDoTablet, travado]);
    // quando o mouse foi solto (Esc): a barra do "clique para jogar" mostra a espera do navegador
    const [soltouEm, setSoltouEm] = useState<number | null>(null);
    const travadoAntes = useRef(travado);
    useEffect(() => {
        if (travadoAntes.current && !travado) setSoltouEm(performance.now());
        travadoAntes.current = travado;
    }, [travado]);
    const [portaAberta, setPortaAberta] = useState(!noElevador);
    const portaFechada = useRef(!portaAberta);
    const [seletorAberto, setSeletorAberto] = useState(false);
    const [chatId, setChatId] = useState<string | null>(null);
    // o chat da call (aberto pelo holograma da sala)
    const [chatCallAberto, setChatCallAberto] = useState(false);
    const chatSala = useChatSala();
    // o controle da sala (tablet), aberto na aba Controle ou YouTube. Aberto = tablet na mão
    // (os outros veem o seu boneco segurando)
    const [controleAberto, setControleAberto] = useState<"controle" | "youtube" | null>(null);
    useEffect(() => {
        pose.current.item = controleAberto ? ITEM.TABLET : ITEM.NADA;
    }, [controleAberto]);
    const config = useConfigMundo();
    const velocidade = useRef(0);
    const [configAberta, setConfigAberta] = useState(false);
    const [telaCheia, setTelaCheia] = useState(false);
    const [toqueAtivo] = useState(ehToque);

    const { alvos, ids } = useJogadoresDoAndar(servidor.id, eu.id, pose);

    // alguém andando aqui que a lista de membros ainda não conhece (entrou no servidor depois
    // que ela foi carregada e o aviso se perdeu): recarrega uma vez por pessoa, sem ficar em loop
    const jaPedidos = useRef(new Set<string>());
    useEffect(() => {
        const novos = ids.filter((id) => !membros.has(id) && !jaPedidos.current.has(id));
        if (novos.length === 0) return;
        novos.forEach((id) => jaPedidos.current.add(id));
        onMembroDesconhecido?.();
    }, [ids, membros, onMembroDesconhecido]);

    // chegou de elevador: a porta abre logo depois
    useEffect(() => {
        if (!noElevador) return;
        const t = window.setTimeout(() => setPortaAberta(true), 700);
        return () => window.clearTimeout(t);
    }, [noElevador]);

    useEffect(() => {
        portaFechada.current = !portaAberta;
    }, [portaAberta]);

    // ---------- entrar e sair das calls andando ----------

    useEffect(() => {
        chegouAgora.current = false;
    }, [chegouAgora]);

    const aoMudarSala = useCallback((id: string | null) => setSalaAtual(id), []);

    // A call segue o lugar onde você está: dentro de uma sala, a call dela; no hall, no corredor
    // ou no elevador, a call do hall do andar (entra mutado: quem passa não sai falando).
    // Aqui só se diz qual call; levar a conexão até lá (fila, troca no meio de outra, quedas)
    // é com o gerenciador de call (lib/gerenciadorCall), então pedir de novo nunca atrapalha
    const idHall = `hall-${servidor.id}`;
    const alvoCall = salaAtual ?? idHall;
    const callAgora = voz?.canal.id ?? null;
    // o último pedido, como "pra onde | de onde". Se a entrada falhar (sem permissão, por
    // exemplo), a call volta pra nenhuma e não fica pedindo em loop — dá pra tentar com E.
    // Se você sair de propósito (botão de sair), também não volta sozinho
    const callPedida = useRef<string | null>(null);
    const entrar = useRef({ onEntrarSala, onEntrarHall, canais });
    entrar.current = { onEntrarSala, onEntrarHall, canais };
    useEffect(() => {
        if (callAgora === alvoCall) {
            callPedida.current = `${alvoCall}|null`;
            return;
        }
        const pedido = `${alvoCall}|${callAgora}`;
        if (callPedida.current === pedido) return;
        // espera um instante: passar pela porta e voltar logo não troca de call à toa
        // (fora de call, entra na hora)
        const espera = window.setTimeout(() => {
            callPedida.current = pedido;
            const { onEntrarSala: sala, onEntrarHall: hall, canais: lista } = entrar.current;
            const canal = salaAtual ? lista.get(salaAtual) : undefined;
            if (canal) sala(canal);
            else hall({ mudo: true });
        }, callAgora ? 200 : 0);
        return () => window.clearTimeout(espera);
    }, [alvoCall, callAgora, salaAtual]);
    // "Conectando…": pedida e a conexão ainda não chegou, ou prestes a pedir (não falhou)
    const conectando = !!salaAtual && (
        entrandoEm === salaAtual
        || (callAgora !== salaAtual && callPedida.current !== `${salaAtual}|${callAgora}`)
    );

    // a barra da call só aparece com a conexão aberta de verdade (deu erro, some). Numa troca de
    // sala a conexão fecha e reabre em ~0,3 s: só some se ficar um tempo sem, pra não piscar
    const conectadoNaCall = useConnectionState() === ConnectionState.Connected;
    const [barraDaCall, setBarraDaCall] = useState(conectadoNaCall);
    useEffect(() => {
        if (conectadoNaCall) {
            setBarraDaCall(true);
            return;
        }
        const t = window.setTimeout(() => setBarraDaCall(false), 800);
        return () => window.clearTimeout(t);
    }, [conectadoNaCall]);

    // os tokens das calls deste andar, buscados antes: a troca de sala não espera o backend
    useEffect(() => {
        onAquecerCalls(servidor.id, planta.salas.map((s) => s.canalId));
    }, [onAquecerCalls, servidor.id, planta]);

    // ---------- quem aparece no andar ----------

    const remotosPorId = useMemo(() => new Map(remotos.map((p) => [p.identity, p])), [remotos]);

    const midia = useMemo(() => {
        const porPessoa = new Map<string, { camera?: Track; telas: Track[] }>();
        const telasDaCall: TrackReference[] = [];
        for (const t of faixas) {
            if (!t.publication.track || t.publication.isMuted) continue;
            if (t.source === Track.Source.ScreenShare) telasDaCall.push(t);
            if (t.participant.isLocal) continue;
            const m = porPessoa.get(t.participant.identity) ?? { telas: [] };
            if (t.source === Track.Source.Camera) m.camera = t.publication.track;
            else m.telas.push(t.publication.track);
            porPessoa.set(t.participant.identity, m);
        }
        return { porPessoa, telasDaCall };
    }, [faixas]);

    // telas compartilhadas em cima das pessoas: só aparecem (e só baixam o vídeo) pra você
    // depois de mirar no selo "AO VIVO" e clicar. Clicar na tela aberta fecha
    const [telasAbertas, setTelasAbertas] = useState<ReadonlySet<string>>(() => new Set());
    const [miraTela, setMiraTela] = useState<string | null>(null);
    const alvosTela = useRef(new Map<string, Object3D>()).current;
    const alternarTela = useCallback((id: string) => {
        setTelasAbertas((antes) => {
            const novas = new Set(antes);
            if (!novas.delete(id)) novas.add(id);
            return novas;
        });
    }, []);
    // parou de compartilhar: esquece (se compartilhar de novo, volta como selo)
    useEffect(() => {
        setTelasAbertas((antes) => {
            const novas = new Set([...antes].filter((id) => (midia.porPessoa.get(id)?.telas.length ?? 0) > 0));
            return novas.size === antes.size ? antes : novas;
        });
    }, [midia]);
    const miraTelaRef = useRef(miraTela);
    miraTelaRef.current = miraTela;
    useEffect(() => {
        // jogando (mouse travado), o clique vai pro que está na mira
        const aoClicar = (e: MouseEvent) => {
            if (e.button !== 0 || !document.pointerLockElement || !miraTelaRef.current) return;
            alternarTela(miraTelaRef.current);
        };
        document.addEventListener("mousedown", aoClicar);
        return () => document.removeEventListener("mousedown", aoClicar);
    }, [alternarTela]);

    // igual ao cartão de perfil: o dono aparece como dono, os outros admins como admin
    const papeis = useMemo(() => {
        const mapa = new Map<string, Papel>();
        for (const m of servidor.membros) if (m.permissao === "ADMIN") mapa.set(m.usuario.id, "admin");
        mapa.set(servidor.dono.id, "dono");
        return mapa;
    }, [servidor.membros, servidor.dono.id]);

    const pessoas: Pessoa[] = [];
    const andando = new Set(ids);
    const comMidia = (id: string) => ({
        papel: papeis.get(id) ?? null,
        participante: remotosPorId.get(id),
        camera: midia.porPessoa.get(id)?.camera,
        telas: midia.porPessoa.get(id)?.telas ?? [],
        telaAberta: telasAbertas.has(id),
        telaMirada: miraTela === id,
    });
    for (const id of ids) {
        const usuario = membros.get(id);
        if (usuario) pessoas.push({ usuario, lerAlvo: () => alvos.get(id), ...comMidia(id) });
    }

    // lugares ocupados por quem está no 3D (sentado em cima do assento), inclusive você
    const ocupadosNo3D = new Set<string>();
    const ocupar = (p: Pose) => {
        if (p.postura !== POSTURA.SENTADO) return;
        const a = planta.assentos.find((q) => Math.hypot(q.x - p.x, q.z - p.z) < 0.35);
        if (a) ocupadosNo3D.add(a.id);
    };
    alvos.forEach(ocupar);
    ocupar(pose.current);
    const ocupados = new Set(ocupadosNo3D);

    // quem está na call pelo modo clássico senta nos lugares livres da sala (sempre na mesma
    // ordem, pra todo mundo ver a pessoa no mesmo lugar); sem lugar, fica em pé
    for (const s of planta.salas) {
        const fora = (canais.get(s.canalId)?.participantes ?? [])
            .filter((p) => p.id !== eu.id && !andando.has(p.id))
            .sort((a, b) => a.id.localeCompare(b.id));
        const livres = s.assentos.filter((a) => !ocupadosNo3D.has(a.id));
        fora.forEach((usuario, i) => {
            const assento = livres[i];
            const lugar = s.lugares[(i - livres.length) % s.lugares.length];
            const alvo: Pose = assento
                ? { x: assento.x, z: assento.z, y: assento.y, rot: assento.rot, pitch: 0, postura: POSTURA.SENTADO, item: ITEM.NADA }
                : { ...lugar, y: 0, pitch: 0, postura: POSTURA.EM_PE, item: ITEM.NADA };
            if (assento) ocupados.add(assento.id);
            pessoas.push({ usuario, lerAlvo: () => alvo, ...comMidia(usuario.id) });
        });
    }
    const assentosPorId = useMemo(() => new Map(planta.assentos.map((a) => [a.id, a])), [planta]);

    const pessoasPorSala = new Map<string, number>();
    for (const s of planta.salas) {
        const canal = canais.get(s.canalId);
        pessoasPorSala.set(s.canalId, canal ? pessoasNaSala(canal, voz, eu).length : 0);
    }

    // o que vai na TV da sala da sua call: o que escolheram no controle da sala (tablet)
    const fonte = fonteDaTV(controle.estado, youtube.estado, midia.telasDaCall);
    const salaDaCall = planta.salas.find((s) => s.canalId === vozNoAndar);
    // na TV: uma tela, ou todas em mosaico (com o nome de quem compartilha)
    const telasDaSala: TelaNaTV[] = (fonte.tipo === "tela" ? [fonte.tela] : fonte.tipo === "mosaico" ? fonte.telas : []).flatMap((t) =>
        t.publication.track ? [{ track: t.publication.track, nome: t.participant.isLocal ? "Você" : membros.get(t.participant.identity)?.nome ?? "Alguém" }] : []);

    // YouTube junto na TV: mais alto perto da TV, mais baixo no fundo da sala, vezes o volume do controle
    const volumeTV = useRef(100);
    const volumeControle = useRef(100);
    volumeControle.current = controle.estado?.volume ?? 100;
    useEffect(() => {
        if (!salaDaCall) return;
        // na sala gamer o sofá fica a ~5,5 m da TV: só começa a cair depois de 4,5 m
        const cheio = salaDaCall.modelo === "CINEMA" ? 2.5 : 4.5;
        const t = window.setInterval(() => {
            const d = Math.hypot(pose.current.x - salaDaCall.tv.x, pose.current.z - salaDaCall.tv.z);
            volumeTV.current = Math.max(25, Math.min(100, 100 - (d - cheio) * 9)) * (volumeControle.current / 100);
        }, 300);
        return () => window.clearInterval(t);
    }, [salaDaCall]);

    const youtubeNaTV: YoutubeNaTV | undefined = salaDaCall && fonte.tipo === "youtube" && youtube.estado?.video
        ? { estado: youtube.estado, posicaoAgora: youtube.posicaoAgora, enviar: youtube.enviar, volume: volumeTV, mudo: surdo }
        : undefined;

    // LAN house: a segunda TV (lounge) — por enquanto espelha a mesma escolha do tablet (tv2 não tem estado próprio no controle ainda)
    const fonte2 = fonteDaTV(controle.estado, youtube.estado, midia.telasDaCall, 2);
    const telasDaSala2: TelaNaTV[] = (fonte2.tipo === "tela" ? [fonte2.tela] : fonte2.tipo === "mosaico" ? fonte2.telas : []).flatMap((t) =>
        t.publication.track ? [{ track: t.publication.track, nome: t.participant.isLocal ? "Você" : membros.get(t.participant.identity)?.nome ?? "Alguém" }] : []);
    const youtubeNaTV2: YoutubeNaTV | undefined = salaDaCall && fonte2.tipo === "youtube" && youtube.estado?.video
        ? { estado: youtube.estado, posicaoAgora: youtube.posicaoAgora, enviar: youtube.enviar, volume: volumeTV, mudo: surdo }
        : undefined;

    // monitores da LAN house: cada assento ocupado -> quem está sentado e a tela dele (só na sala da sua call)
    const monitores = new Map<string, InfoMonitor>();
    if (salaDaCall) {
        const canal = canais.get(salaDaCall.canalId);
        if (canal && canal.modelo === "LANHOUSE") {
            // quem está no 3D sentado nessa sala
            for (const [id, p] of posicoes) {
                const assento = planta.assentos.find((a) => a.salaId === salaDaCall.canalId && Math.hypot(a.x - p.x, a.z - p.z) < 0.35);
                if (assento && assento.id.startsWith(salaDaCall.canalId + ":lan:")) {
                    const participante = remotosPorId.get(id);
                    const telaPub = participante?.getTrackPublication(Track.Source.ScreenShare);
                    const tela = telaPub?.track;
                    monitores.set(assento.id, { nome: participante?.name ?? "Alguém", track: tela });
                }
            }
            // quem está pelo modo clássico na sala (fora do 3D)
            const participantes = (canais.get(salaDaCall.canalId)?.participantes ?? []).filter((p) => p.id !== eu.id && !pessoas.some((pp) => pp.usuario.id === p.id));
            const ocupados = new Set<string>();
            for (const p of pessoas) {
                if (p.lerAlvo()?.postura === 1) { // POSTURA.SENTADO
                    const alvo = p.lerAlvo(); const a = alvo ? planta.assentos.find((q) => Math.hypot(q.x - alvo.x, q.z - alvo.z) < 0.35) : null;
                    if (a) ocupados.add(a.id);
                }
            }
            const livres = planta.assentos.filter((a) => a.salaId === salaDaCall.canalId && !ocupados.has(a.id));
            participantes.forEach((usuario, i) => {
                const assento = livres[i];
                if (assento && usuario) {
                    monitores.set(assento.id, { nome: usuario.nome, track: undefined });
                }
            });
        }
    }

    // o som da tela que está na TV sai pelas caixas da sala (a sua própria tela você não ouve)
    const somTV: SomDaTV | null = salaDaCall && fonte.tipo === "tela" && !fonte.tela.participant.isLocal && controle.estado
        ? {
              identidade: fonte.tela.participant.identity,
              caixas: salaDaCall.caixasSom,
              tela: { x: salaDaCall.tv.x, y: salaDaCall.tv.y, z: salaDaCall.tv.z },
              surround: controle.estado.surround,
              volume: controle.estado.volume,
              // até onde as caixas soam cheias: o sofá da sala gamer fica a ~5,5 m das torres
              alcance: salaDaCall.modelo === "CINEMA" ? 5 : 4.5,
              reverb: salaDaCall.modelo === "CINEMA" ? 1.2 : 0.8,
          }
        : null;

    // luz: no automático, o cinema apaga com filme rolando; o controle da sala pode forçar acesa/apagada.
    // Só vale dentro da sala da sua call (é dela que você tem o controle)
    const cinema = planta.salas.find((s) => s.canalId === salaAtual && s.modelo === "CINEMA");
    const filmeRolando = (fonte.tipo === "youtube" && !!youtube.estado?.tocando) || fonte.tipo === "tela" || fonte.tipo === "mosaico";
    const luzes = controle.estado?.luzes ?? "AUTO";
    const naSalaDaCall = !!salaDaCall && salaAtual === salaDaCall.canalId;
    const escuro = naSalaDaCall && (luzes === "APAGADAS" || (luzes === "AUTO" && !!cinema && filmeRolando));

    // chat da call no holograma da sala: com o nome de cada um como na lista de membros
    const chatHolograma = useMemo<LinhaChat[]>(
        () => chatSala.mensagens.slice(-30).map((m) => ({
            id: m.id,
            nome: m.from?.isLocal ? eu.nome : membros.get(m.from?.identity ?? "")?.nome ?? m.from?.name ?? "Convidado",
            texto: m.message,
            local: !!m.from?.isLocal,
        })),
        [chatSala.mensagens, eu.nome, membros],
    );

    // ---------- teclas E e F ----------

    const noCanal = salaAtual ? canais.get(salaAtual) : undefined;
    // o que o E faz agora (o que está na mira/perto ganha de entrar na call)
    const dicaE: Dica | null =
        foco?.tipo === "elevador" ? { tecla: "E", texto: "Escolher andar" }
        : foco?.tipo === "texto" ? { tecla: "E", texto: `Abrir #${canais.get(foco.canalId ?? "")?.nome ?? ""}` }
        : foco?.tipo === "tablet" && foco.canalId === vozNoAndar
            ? { tecla: "E", texto: "Controle da sala" }
        : foco?.tipo === "chat" && foco.canalId === vozNoAndar ? { tecla: "E", texto: "Escrever no chat da call" }
        : foco?.tipo === "assento"
            ? ocupados.has(foco.assentoId ?? "") ? { texto: "Lugar ocupado" } : { tecla: "E", texto: "Sentar" }
        : conectando ? { texto: tentandoDeNovo ? "Sem conexão com a call · tentando de novo…" : "Conectando à call…", carregando: true }
        : salaAtual && vozNoAndar !== salaAtual ? { tecla: "E", texto: "Entrar na call" }
        : null;
    // o que está na mira/perto e dá pra usar com o E: fica com o contorno aceso
    const focoUsavel = !!foco && (
        foco.tipo === "elevador" || foco.tipo === "texto"
        || ((foco.tipo === "tablet" || foco.tipo === "chat") && foco.canalId === vozNoAndar)
        || (foco.tipo === "assento" && !ocupados.has(foco.assentoId ?? ""))
    );
    // as teclas que dá pra usar agora, lado a lado no canto da tela; os avisos sem tecla
    // (conectando, lugar ocupado) ficam no meio, em cima da barra da call
    const dicaTela: Dica | null = miraTela
        ? {
            tecla: "Clique",
            texto: `${telasAbertas.has(miraTela) ? "Fechar" : "Ver"} a tela de ${membros.get(miraTela)?.nome ?? "alguém"}`,
            acao: () => alternarTela(miraTela),
            iconeToque: <MonitorUp size={18} />,
        }
        : null;
    const dicas: Dica[] = [
        ...(dicaTela ? [dicaTela] : []),
        ...(dicaE ? [dicaE] : []),
        ...(salaAtual && midia.telasDaCall.length > 0 ? [{ tecla: "F", texto: "Ver a tela compartilhada" }] : []),
        // no toque, levantar é o botão de pular
        ...(postura === POSTURA.SENTADO && !toqueAtivo ? [{ tecla: "Espaço", texto: "Levantar" }] : []),
    ];
    const botoes = dicas.filter((d) => d.tecla);
    const avisos = dicas.filter((d) => !d.tecla);

    const soltarMouse = () => {
        if (document.pointerLockElement) document.exitPointerLock();
    };

    const fecharTabletPeloX = () => {
        setVoltandoDoTablet(true);
        pedido.current = { tipo: "travar" };
    };

    const acoes = useRef({ e: () => {}, f: () => {}, t: () => {} });
    acoes.current.e = () => {
        if (foco?.tipo === "elevador") {
            soltarMouse();
            setSeletorAberto(true);
        } else if (foco?.tipo === "texto" && foco.canalId) {
            soltarMouse();
            setControleAberto(null);
            setChatCallAberto(false);
            setChatId(foco.canalId);
        } else if (foco?.tipo === "chat" && foco.canalId === vozNoAndar) {
            soltarMouse();
            setControleAberto(null);
            setChatId(null);
            setChatCallAberto(true);
        } else if (foco?.tipo === "tablet" && foco.canalId === vozNoAndar) {
            soltarMouse();
            setChatId(null);
            setChatCallAberto(false);
            setControleAberto("controle");
        } else if (foco?.tipo === "assento") {
            const assento = assentosPorId.get(foco.assentoId ?? "");
            if (assento && !ocupados.has(assento.id)) pedido.current = { tipo: "sentar", assento };
        } else if (noCanal && vozNoAndar !== noCanal.id && entrandoEm !== noCanal.id) {
            onEntrarSala(noCanal);
        }
    };
    // T: pega/guarda o tablet (o controle da sala da sua call)
    acoes.current.t = () => {
        if (controleAberto) {
            // guardou o tablet: volta direto pro jogo (o T conta como ação pro navegador)
            setControleAberto(null);
            pedido.current = { tipo: "travar" };
            return;
        }
        soltarMouse();
        setChatId(null);
        setChatCallAberto(false);
        setControleAberto("controle");
    };
    acoes.current.f = () => {
        if (salaAtual && midia.telasDaCall.length > 0) {
            soltarMouse();
            setTelaCheia(true);
        }
    };

    useEffect(() => {
        const aoTeclar = (e: KeyboardEvent) => {
            // Esc fecha qualquer painel aberto (chat de texto, chat da call, tablet, configurações,
            // elevador, tela cheia) — inclusive digitando, porque os painéis abrem com o cursor
            // na caixa de texto
            if (e.code === "Escape") {
                // o Esc já foi usado lá dentro (ex.: cancelar a edição de uma mensagem)
                if (e.defaultPrevented) return;
                // o navegador não deixa o Esc travar o mouse de novo: depois dele, é só começar a
                // andar (W A S D) ou clicar que volta pro jogo (ver Jogador)
                setSeletorAberto(false);
                setTelaCheia(false);
                setControleAberto(null);
                setChatCallAberto(false);
                setChatId(null);
                setConfigAberta(false);
                if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
                return;
            }
            if (estaDigitando(e) || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
            // preventDefault: o painel que abre foca um campo de texto, e sem isso a própria
            // tecla ("e") seria digitada nele
            if (e.code === "KeyE") {
                e.preventDefault();
                acoes.current.e();
            }
            if (e.code === "KeyF") {
                e.preventDefault();
                acoes.current.f();
            }
            if (e.code === "KeyT") {
                e.preventDefault();
                acoes.current.t();
            }
            if (e.code === "KeyV") {
                e.preventDefault();
                mudarConfig({ terceiraPessoa: !lerConfig().terceiraPessoa });
            }
            if (e.code === "KeyO") {
                e.preventDefault();
                setConfigAberta((v) => !v);
            }
        };
        window.addEventListener("keydown", aoTeclar);
        return () => window.removeEventListener("keydown", aoTeclar);
    }, []);

    // ---------- elevador ----------

    const trocando = useRef<number | undefined>(undefined);
    useEffect(() => () => window.clearTimeout(trocando.current), []);

    function irParaAndar(id: string) {
        setSeletorAberto(false);
        if (id === servidor.id) return;
        // fecha a porta e "sobe": a troca de servidor recria o andar
        setPortaAberta(false);
        trocando.current = window.setTimeout(() => onTrocarAndar(id), 900);
    }

    const parado = seletorAberto || telaCheia || configAberta;
    const canalChat = chatId ? canais.get(chatId) : undefined;
    const lugar = noCanal
        ? `${noCanal.nome}${vozNoAndar === noCanal.id ? " · na call" : ""}`
        : voz?.hall && voz.servidorId === servidor.id ? "Hall e corredor · na call do hall" : "Hall e corredor";

    return (
        <>
            <tunel.In>
                <Cena
                    planta={planta}
                    servidor={servidor}
                    andar={andar}
                    pose={pose}
                    eu={eu}
                    pessoas={pessoas}
                    posicoes={posicoes}
                    pessoasPorSala={pessoasPorSala}
                    salaDaCall={vozNoAndar}
                    telasDaSala={telasDaSala}
                    youtube={youtubeNaTV}
                    telasDaSala2={telasDaSala2}
                    youtube2={youtubeNaTV2}
                    monitores={monitores}
                    portaAberta={portaAberta}
                    portaFechada={portaFechada}
                    parado={parado}
                    toque={toque}
                    pedido={pedido}
                    sala={sala}
                    proximidade={!!voz?.hall}
                    surdo={surdo}
                    escuro={escuro}
                    led={controle.estado?.led ?? null}
                    salaAtual={salaAtual}
                    chat={chatHolograma}
                    telao={naSalaDaCall && salaDaCall ? { x: salaDaCall.tv.x, y: salaDaCall.tv.y, z: salaDaCall.tv.z, rot: salaDaCall.tv.rot } : null}
                    somTV={somTV}
                    onPostura={setPostura}
                    onSala={aoMudarSala}
                    onFoco={setFoco}
                    destaque={focoUsavel ? foco : null}
                    alvosTela={alvosTela}
                    onMiraTela={setMiraTela}
                    onTravado={setTravado}
                    velocidade={velocidade}
                />
            </tunel.In>

            <div className="mundo-hud">
                <div className="mundo-local">
                    <IconeServidor nome={servidor.nome} url={servidor.iconeUrl} tamanho={32} />
                    <div>
                        <strong className="truncar">{servidor.nome}</strong>
                        <span className="truncar">{andar}º andar · {lugar}</span>
                    </div>
                </div>

                {travado && <span className="mundo-mira" />}
                {config.mostrarVelocidade && <Velocimetro velocidade={velocidade} />}

                <button className="mundo-config-botao" onClick={() => setConfigAberta(true)} aria-label="Configurações (O)" title="Configurações (O)">
                    <Settings size={18} />
                </button>
                <button
                    className={`mundo-config-botao mundo-visao-botao ${config.terceiraPessoa ? "ativo" : ""}`}
                    onClick={() => mudarConfig({ terceiraPessoa: !config.terceiraPessoa })}
                    aria-label="Terceira pessoa (V)"
                    aria-pressed={config.terceiraPessoa}
                    title={config.terceiraPessoa ? "Voltar pra primeira pessoa (V)" : "Terceira pessoa (V)"}
                >
                    <SwitchCamera size={18} />
                </button>

                {!travado && !toqueAtivo && !parado && !canalChat && !chatCallAberto && !controleAberto && (
                    // mouse solto: "clique pra jogar" um pouco acima do centro e, embaixo, o card das teclas
                    <div className="mundo-pausa">
                        <CardJogar soltouEm={soltouEm} />
                        <div className="mundo-pausa-teclas">
                            <header>
                                <Keyboard size={15} />
                                <strong>Teclas</strong>
                            </header>
                            <ListaTeclas />
                        </div>
                    </div>
                )}

                {avisos.length > 0 && !controleAberto && (
                    <div className="mundo-avisos">
                        {avisos.map((aviso) => (
                            <div key={aviso.texto} className="mundo-dica">
                                {aviso.carregando && <Loader2 size={14} className="girar" />}
                                <span>{aviso.texto}</span>
                            </div>
                        ))}
                    </div>
                )}

                {botoes.length > 0 && !controleAberto && (
                    <div className={`mundo-dicas ${toqueAtivo ? "toque" : ""}`}>
                        {botoes.map((dica) => (
                            <div key={`${dica.tecla}${dica.texto}`} className="mundo-dica">
                                {toqueAtivo
                                    ? <button className="mundo-dica-botao" onClick={dica.acao ?? (() => (dica.tecla === "F" ? acoes.current.f() : acoes.current.e()))}>{dica.iconeToque ?? dica.tecla}</button>
                                    : <kbd>{dica.tecla}</kbd>}
                                <span>{dica.texto}</span>
                            </div>
                        ))}
                    </div>
                )}

                {voz && barraDaCall && (
                    <div className="mundo-controles">
                        {/* no hall não tem compartilhar tela: ela é pra TV de uma sala */}
                        <Controles onSair={onSairSala} semTela={!!voz.hall} />
                    </div>
                )}
            </div>

            {toqueAtivo && !parado && <ControlesToque toque={toque} />}

            {toqueAtivo && !parado && (
                <div className="mundo-botoes-toque">
                    <button
                        className={agachadoToque ? "ativo" : ""}
                        onClick={() => {
                            toque.current.agachado = !toque.current.agachado;
                            setAgachadoToque(toque.current.agachado);
                        }}
                        aria-label="Agachar"
                        aria-pressed={agachadoToque}
                    >
                        <ChevronsDown size={22} />
                    </button>
                    <button onClick={() => { toque.current.pular = true; }} aria-label={postura === POSTURA.SENTADO ? "Levantar" : "Pular"}>
                        <ChevronsUp size={22} />
                    </button>
                    <button className={controleAberto ? "ativo" : ""} onClick={() => acoes.current.t()} aria-label="Tablet" aria-pressed={!!controleAberto}>
                        <Tablet size={20} />
                    </button>
                </div>
            )}

            {canalChat && (
                <aside className="mundo-chat">
                    <CanalTexto
                        key={canalChat.id}
                        canal={canalChat}
                        eu={eu}
                        membros={membros}
                        membrosVisivel={false}
                        onMembros={() => {}}
                        onBuscar={() => {}}
                        onMenu={() => {}}
                    />
                    <button className="botao-icone mundo-chat-fechar" onClick={() => setChatId(null)} aria-label="Fechar o chat">
                        <X size={18} />
                    </button>
                </aside>
            )}

            {/* chat da call, aberto pelo holograma da sala (só dá pra abrir estando na call dela) */}
            {chatCallAberto && salaDaCall && (
                <div className="mundo-chat mundo-chat-call">
                    <ChatAoVivo membros={membros} eu={eu} onFechar={() => setChatCallAberto(false)} />
                </div>
            )}

            {/* o painel só vale dentro da call da sala (é quem pode controlar) */}
            {/* o tablet na mão: sobe da parte de baixo da tela (dá pra continuar andando com WASD) */}
            {controleAberto && (
                <div className="mundo-tablet">
                    <div className="mundo-tablet-tela">
                        <PainelControle
                            key={controleAberto}
                            membros={membros}
                            eu={eu}
                            telas={midia.telasDaCall}
                            abaInicial={controleAberto}
                            formato="tablet"
                            aviso={
                                !voz ? "Entre numa sala de voz pra controlar a TV, o som e as luzes dela."
                                : voz.hall ? "No hall não tem TV. Entre numa sala pra controlar a TV, o som e as luzes dela."
                                : undefined
                            }
                            onFechar={fecharTabletPeloX}
                            voltando={voltandoDoTablet}
                        />
                    </div>
                </div>
            )}

            {configAberta && <ConfigMundo onFechar={() => setConfigAberta(false)} />}

            {seletorAberto && (
                <div className="mundo-modal" onClick={() => setSeletorAberto(false)}>
                    <div className="mundo-elevador" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Escolher andar">
                        <div className="mundo-elevador-topo">
                            <strong>Para qual andar?</strong>
                            <button className="botao-icone" onClick={() => setSeletorAberto(false)} aria-label="Fechar">
                                <X size={18} />
                            </button>
                        </div>
                        <ul>
                            {[...servidores].map((s, i) => ({ s, n: i + 1 })).reverse().map(({ s, n }) => (
                                <li key={s.id}>
                                    <button className={`mundo-andar ${s.id === servidor.id ? "atual" : ""}`} onClick={() => irParaAndar(s.id)}>
                                        <span className="mundo-andar-numero">{n}</span>
                                        <IconeServidor nome={s.nome} url={s.iconeUrl} tamanho={28} />
                                        <span className="truncar">{s.nome}</span>
                                        {s.id === servidor.id && <small>você está aqui</small>}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}

            {telaCheia && midia.telasDaCall.length > 0 && (
                <TelaCheia telas={midia.telasDaCall} membros={membros} eu={eu} onFechar={() => setTelaCheia(false)} />
            )}
        </>
    );
}

// o Chrome só deixa travar o mouse de novo ~1 s depois do Esc
const ESPERA_MOUSE_MS = 1100;

// "Clique para jogar". Logo depois do Esc, uma barra esvazia enquanto o navegador não libera
// o mouse (clicar nessa hora já vale: o jogo trava sozinho quando der, ver Jogador)
function CardJogar({ soltouEm }: { soltouEm: number | null }) {
    const [, atualizar] = useState(0);
    const passou = soltouEm === null ? Infinity : performance.now() - soltouEm;
    const esperando = passou < ESPERA_MOUSE_MS;
    useEffect(() => {
        if (!esperando) return;
        const t = window.setTimeout(() => atualizar((n) => n + 1), ESPERA_MOUSE_MS - passou);
        return () => window.clearTimeout(t);
    }, [esperando, soltouEm]);

    return (
        <div className={`mundo-pausa-jogar ${esperando ? "esperando" : ""}`}>
            <MousePointerClick size={22} />
            <div>
                <strong>{esperando ? "Só um instante…" : "Clique para jogar"}</strong>
                <span>
                    {esperando
                        ? "O navegador já libera o mouse. Pode clicar que volta sozinho"
                        : <>ou comece a andar com <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></>}
                </span>
            </div>
            {esperando && (
                <span
                    key={soltouEm}
                    className="mundo-pausa-barra"
                    style={{ animationDuration: `${ESPERA_MOUSE_MS}ms`, animationDelay: `-${Math.round(passou)}ms` }}
                />
            )}
        </div>
    );
}

function TelaCheia({ telas, membros, eu, onFechar }: { telas: TrackReference[]; membros: MapaMembros; eu: Usuario; onFechar: () => void }) {
    const [escolhida, setEscolhida] = useState(0);
    const atual = telas[Math.min(escolhida, telas.length - 1)];
    const nome = (t: TrackReference) => (t.participant.isLocal ? eu.nome : membros.get(t.participant.identity)?.nome ?? t.participant.name ?? "Alguém");

    return (
        <div className="mundo-modal mundo-tela-cheia" onClick={onFechar}>
            <div className="mundo-tela-cheia-topo" onClick={(e) => e.stopPropagation()}>
                {telas.map((t, i) => (
                    <button key={t.publication.trackSid} className={`botao ${i === escolhida ? "botao-primario" : ""}`} onClick={() => setEscolhida(i)}>
                        <MonitorUp size={15} /> {t.participant.isLocal ? "Sua tela" : `Tela de ${nome(t)}`}
                    </button>
                ))}
                <button className="botao-icone" onClick={onFechar} aria-label="Fechar">
                    <X size={18} />
                </button>
            </div>
            <div className="mundo-tela-cheia-video" onClick={(e) => e.stopPropagation()}>
                <VideoTrack trackRef={atual} />
            </div>
        </div>
    );
}

// celular/tablet: metade esquerda é o joystick, metade direita gira a câmera
function ControlesToque({ toque }: { toque: RefObject<ControleToque> }) {
    const RAIO = 56;
    const [base, setBase] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
    const joystick = useRef<{ id: number; x: number; y: number } | null>(null);
    const olhar = useRef<{ id: number; x: number; y: number } | null>(null);

    const aoTocar = (e: EventoPonteiro<HTMLDivElement>) => {
        if (e.pointerType === "mouse") return;
        e.currentTarget.setPointerCapture(e.pointerId);
        if (e.clientX < window.innerWidth / 2 && joystick.current === null) {
            joystick.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
            setBase({ x: e.clientX, y: e.clientY, dx: 0, dy: 0 });
        } else if (olhar.current === null) {
            olhar.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
        }
    };

    const aoMover = (e: EventoPonteiro<HTMLDivElement>) => {
        const j = joystick.current;
        if (j && e.pointerId === j.id) {
            let dx = e.clientX - j.x;
            let dy = e.clientY - j.y;
            const d = Math.hypot(dx, dy);
            if (d > RAIO) {
                dx = (dx / d) * RAIO;
                dy = (dy / d) * RAIO;
            }
            toque.current.andar.x = dx / RAIO;
            toque.current.andar.y = dy / RAIO;
            setBase({ x: j.x, y: j.y, dx, dy });
        } else if (olhar.current?.id === e.pointerId) {
            toque.current.olhar.x += e.clientX - olhar.current.x;
            toque.current.olhar.y += e.clientY - olhar.current.y;
            olhar.current.x = e.clientX;
            olhar.current.y = e.clientY;
        }
    };

    const aoSoltar = (e: EventoPonteiro<HTMLDivElement>) => {
        if (e.pointerId === joystick.current?.id) {
            joystick.current = null;
            toque.current.andar.x = 0;
            toque.current.andar.y = 0;
            setBase(null);
        }
        if (olhar.current?.id === e.pointerId) olhar.current = null;
    };

    return (
        <div className="mundo-toque" onPointerDown={aoTocar} onPointerMove={aoMover} onPointerUp={aoSoltar} onPointerCancel={aoSoltar}>
            {base ? (
                <span className="mundo-joystick" style={{ left: base.x, top: base.y }}>
                    <span style={{ transform: `translate(${base.dx}px, ${base.dy}px)` }} />
                </span>
            ) : (
                <span className="mundo-toque-ajuda">
                    Arraste à esquerda para andar e à direita para olhar
                </span>
            )}
        </div>
    );
}
