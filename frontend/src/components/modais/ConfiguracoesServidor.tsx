import { useEffect, useRef, useState, type FormEvent } from "react";
import { Ban, CalendarDays, Camera, Loader2 } from "lucide-react";
import { api, ErroApi, mensagemDeErro, problemaNaImagem, TIPOS_AVATAR, type Banimento, type ServidorDetalhe } from "../../api";
import { useToast } from "../../contexto/Toasts";
import { gateway } from "../../lib/gateway";
import { dataLonga, telaDeToque } from "../../lib/util";
import { Avatar, IconeServidor } from "../ui/Avatar";
import { Dialogo } from "../ui/Dialogo";

export type AbaConfiguracoes = "geral" | "banimentos";

// igual ao maxLength do body de POST /servidor/editar no back (e ao VarChar(100) do banco)
const LIMITE_NOME = 100;

const DESCRICOES: Record<AbaConfiguracoes, string> = {
    geral: "Todos os membros veem a mudança na hora.",
    banimentos: "Quem está aqui não entra de novo, nem com convite.",
};

type Props = {
    servidor: ServidorDetalhe;
    abaInicial: AbaConfiguracoes;
    onFechar: () => void;
    onSalvo: (atualizado: { id: string; nome: string }) => void;
    // o ícone troca na hora (o modal continua aberto)
    onIconeSalvo: (atualizado: { id: string; iconeUrl: string | null }) => void;
    // só vem pro dono: abre a confirmação de apagar o servidor
    onApagar?: () => void;
};

// configurações do servidor (só admin abre): ícone, nome e quem está banido
export function ConfiguracoesServidor({ servidor, abaInicial, onFechar, onSalvo, onIconeSalvo, onApagar }: Props) {
    const [aba, setAba] = useState(abaInicial);

    return (
        <Dialogo titulo="Configurações do servidor" descricao={DESCRICOES[aba]} largura={520} onFechar={onFechar}>
            <div className="abas" role="tablist">
                <button role="tab" aria-selected={aba === "geral"} className={aba === "geral" ? "ativa" : ""} onClick={() => setAba("geral")}>
                    Geral
                </button>
                <button
                    role="tab"
                    aria-selected={aba === "banimentos"}
                    className={aba === "banimentos" ? "ativa" : ""}
                    onClick={() => setAba("banimentos")}
                >
                    Banimentos
                </button>
            </div>

            {aba === "geral" ? (
                <Geral servidor={servidor} onFechar={onFechar} onSalvo={onSalvo} onIconeSalvo={onIconeSalvo} onApagar={onApagar} />
            ) : (
                <Banimentos servidorId={servidor.id} />
            )}
        </Dialogo>
    );
}

type GeralProps = Omit<Props, "abaInicial">;

function Geral({ servidor, onFechar, onSalvo, onIconeSalvo, onApagar }: GeralProps) {
    const [nome, setNome] = useState(servidor.nome);
    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    const final = nome.trim();
    const mudou = final !== servidor.nome;

    async function salvar(e: FormEvent) {
        e.preventDefault();
        if (!final || !mudou) return;
        setEnviando(true);
        setErro(null);
        try {
            onSalvo(await api.editarServidor(servidor.id, final));
        } catch (err) {
            setErro(mensagemDeErro(err));
        } finally {
            setEnviando(false);
        }
    }

    return (
        <>
            <form className="formulario" onSubmit={salvar}>
                <IconeEditavel servidor={servidor} nomeExibido={final || servidor.nome} onIconeSalvo={onIconeSalvo} />

                <label className="campo-rotulado">
                    <span className="rotulo">Nome do servidor</span>
                    <input
                        className="campo"
                        value={nome}
                        onChange={(e) => setNome(e.target.value)}
                        maxLength={LIMITE_NOME}
                        // no celular não abre o teclado sozinho (quem abriu pode ter vindo pelos banimentos)
                        autoFocus={!telaDeToque}
                        onFocus={(e) => e.target.select()}
                    />
                </label>

                {erro && <p className="texto-erro">{erro}</p>}

                <div className="formulario-acoes">
                    <button type="button" className="botao botao-fantasma" onClick={onFechar}>Cancelar</button>
                    <button className="botao botao-primario" disabled={enviando || !final || !mudou}>
                        {enviando && <Loader2 size={16} className="girar" />}
                        Salvar
                    </button>
                </div>
            </form>

            {/* só o dono: apagar fica separado no fim, longe do Salvar */}
            {onApagar && (
                <div className="zona-perigo">
                    <div>
                        <strong>Apagar servidor</strong>
                        <span>Some pra todo mundo, com os canais e as mensagens. Não dá pra desfazer.</span>
                    </div>
                    <button type="button" className="botao botao-pequeno botao-perigo-contorno" onClick={onApagar}>
                        Apagar servidor
                    </button>
                </div>
            )}
        </>
    );
}

type IconeEditavelProps = {
    servidor: ServidorDetalhe;
    // o nome como está no campo (a prévia acompanha o que você digita)
    nomeExibido: string;
    onIconeSalvo: (atualizado: { id: string; iconeUrl: string | null }) => void;
};

// ícone do servidor: clicar escolhe a imagem e já envia. Enquanto sobe, mostra a imagem escolhida
// com um spinner por cima; o corte quadrado e o webp são feitos no back (sharp), igual à foto de perfil
function IconeEditavel({ servidor, nomeExibido, onIconeSalvo }: IconeEditavelProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    // URL temporária (blob:) da imagem escolhida, enquanto ela sobe
    const [previa, setPrevia] = useState<string | null>(null);
    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    // libera a URL temporária quando troca ou o modal fecha
    useEffect(() => () => {
        if (previa) URL.revokeObjectURL(previa);
    }, [previa]);

    async function enviar(arquivo: File | undefined) {
        if (!arquivo || enviando) return;
        const problema = problemaNaImagem(arquivo);
        setErro(problema);
        if (problema) return;
        setPrevia(URL.createObjectURL(arquivo));
        setEnviando(true);
        try {
            const atualizado = await api.atualizarIconeServidor(servidor.id, arquivo);
            onIconeSalvo({ id: atualizado.id, iconeUrl: atualizado.iconeUrl });
        } catch (err) {
            // o 413 vem do plugin de upload, com a mensagem em inglês
            setErro(err instanceof ErroApi && err.status === 413 ? "A imagem deve ter no máximo 4 MB." : mensagemDeErro(err));
        } finally {
            setEnviando(false);
            setPrevia(null);
        }
    }

    return (
        <div className={`icone-editavel ${enviando ? "enviando" : ""}`}>
            <button
                type="button"
                className="icone-editavel-alvo"
                onClick={() => inputRef.current?.click()}
                disabled={enviando}
                aria-label="Trocar o ícone do servidor"
            >
                <IconeServidor nome={nomeExibido} url={previa ?? servidor.iconeUrl} tamanho={64} />
                <span className="icone-editavel-camada" aria-hidden>
                    {enviando ? <Loader2 size={20} className="girar" /> : <Camera size={20} />}
                </span>
            </button>

            <div className="icone-editavel-texto">
                <strong className="truncar">{nomeExibido}</strong>
                <button
                    type="button"
                    className="botao botao-pequeno botao-contorno"
                    onClick={() => inputRef.current?.click()}
                    disabled={enviando}
                >
                    {enviando ? "Enviando…" : "Trocar ícone"}
                </button>
                <span className="icone-editavel-dica">PNG, JPG, WebP ou GIF, até 4 MB.</span>
                {erro && <span className="texto-erro">{erro}</span>}
            </div>

            <input
                ref={inputRef}
                type="file"
                accept={TIPOS_AVATAR.join(",")}
                hidden
                onChange={(e) => {
                    enviar(e.target.files?.[0]);
                    // limpa pra conseguir escolher a mesma imagem de novo
                    e.target.value = "";
                }}
            />
        </div>
    );
}

type EstadoLista =
    | { tipo: "carregando" }
    | { tipo: "erro"; mensagem: string }
    | { tipo: "pronto"; banidos: Banimento[] };

// quem está banido, com a data, e o botão de tirar o banimento
function Banimentos({ servidorId }: { servidorId: string }) {
    const toast = useToast();
    const [estado, setEstado] = useState<EstadoLista>({ tipo: "carregando" });
    // muda pra buscar a lista de novo
    const [versao, setVersao] = useState(0);
    // de quem o banimento está sendo tirado agora (spinner no botão)
    const [removendo, setRemovendo] = useState<string | null>(null);

    useEffect(() => {
        let ativo = true;
        api.listarBanidos(servidorId)
            .then((banidos) => {
                if (ativo) setEstado({ tipo: "pronto", banidos });
            })
            .catch((err) => {
                if (ativo) setEstado({ tipo: "erro", mensagem: mensagemDeErro(err) });
            });
        return () => {
            ativo = false;
        };
    }, [servidorId, versao]);

    // outro admin baniu alguém com a lista aberta: busca de novo
    useEffect(
        () =>
            gateway.assinar((evento) => {
                if (evento.tipo === "MEMBROS" && evento.acao === "BANIDO" && evento.servidorId === servidorId) {
                    setVersao((v) => v + 1);
                }
            }),
        [servidorId],
    );

    function recarregar() {
        setEstado({ tipo: "carregando" });
        setVersao((v) => v + 1);
    }

    async function desbanir(banimento: Banimento) {
        const { usuario } = banimento;
        setRemovendo(usuario.id);
        try {
            await api.desbanirMembro(servidorId, usuario.id);
            setEstado((e) => (e.tipo === "pronto" ? { ...e, banidos: e.banidos.filter((b) => b.usuario.id !== usuario.id) } : e));
            toast.sucesso(`Banimento de ${usuario.nome} removido. A pessoa já pode entrar com um convite.`);
        } catch (err) {
            toast.erro(mensagemDeErro(err));
            // outro admin pode ter tirado antes: a lista nova mostra como está
            setVersao((v) => v + 1);
        } finally {
            setRemovendo(null);
        }
    }

    if (estado.tipo === "carregando") {
        return (
            <div className="banidos-esqueleto" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                    <div key={i} className="banido">
                        <span className="esqueleto banido-esqueleto-avatar" />
                        <div className="banido-texto">
                            <span className="esqueleto" style={{ width: 120 }} />
                            <span className="esqueleto" style={{ width: 180, height: 10 }} />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (estado.tipo === "erro") {
        return (
            <div className="banidos-vazio">
                <strong>Não deu pra carregar os banimentos</strong>
                <span>{estado.mensagem}</span>
                <button className="botao botao-pequeno botao-contorno" onClick={recarregar}>Tentar de novo</button>
            </div>
        );
    }

    if (estado.banidos.length === 0) {
        return (
            <div className="banidos-vazio">
                <span className="banidos-vazio-icone"><Ban size={22} /></span>
                <strong>Ninguém banido</strong>
                <span>Pra banir alguém, clique na pessoa (na lista de membros ou no chat) e escolha Banir.</span>
            </div>
        );
    }

    return (
        <>
            <span className="rotulo banidos-total">Banidos — {estado.banidos.length}</span>
            <ul className="banidos">
                {estado.banidos.map((banimento) => (
                    <li key={banimento.usuario.id} className="banido">
                        <Avatar nome={banimento.usuario.nome} url={banimento.usuario.avatarUrl} tamanho={36} />
                        <div className="banido-texto">
                            <strong className="truncar">{banimento.usuario.nome}</strong>
                            {/* banida desde esse dia (curto pra caber numa linha até no celular) */}
                            <span className="banido-data">
                                <CalendarDays size={13} />
                                <time dateTime={banimento.criadoEm}>Desde {dataLonga(banimento.criadoEm)}</time>
                            </span>
                        </div>
                        <button
                            className="botao botao-pequeno botao-contorno"
                            onClick={() => desbanir(banimento)}
                            disabled={removendo !== null}
                        >
                            {removendo === banimento.usuario.id && <Loader2 size={14} className="girar" />}
                            Remover banimento
                        </button>
                    </li>
                ))}
            </ul>
        </>
    );
}
