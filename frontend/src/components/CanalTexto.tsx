import { Fragment, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { ArrowDown, Hash, Loader2, Pencil, Search, SendHorizontal, Trash2, Users } from "lucide-react";
import { LIMITE_MENSAGEM, mensagemDeErro, type Canal, type Usuario } from "../api";
import { usePerfil } from "../contexto/Perfil";
import { useToast } from "../contexto/Toasts";
import { useDigitando } from "../hooks/useDigitando";
import { useMensagens, type MensagemLocal } from "../hooks/useMensagens";
import { hora, imagensDoTexto, mesmoDia, partesTexto, quando, rotuloDia, soImagens, teclaAtalho, telaDeToque } from "../lib/util";
import type { MapaMembros } from "../tipos";
import { MidiasMensagem } from "./MidiasMensagem";
import { Avatar } from "./ui/Avatar";
import { Cabecalho } from "./ui/Cabecalho";
import { Dialogo } from "./ui/Dialogo";
import { Dica } from "./ui/Dica";

// mensagens seguidas da mesma pessoa em até 7 min ficam no mesmo bloco
const JANELA_GRUPO_MS = 7 * 60 * 1000;

type Props = {
    canal: Canal;
    eu: Usuario;
    membros: MapaMembros;
    membrosVisivel: boolean;
    onMembros: () => void;
    onBuscar: () => void;
    onMenu: () => void;
};

type Item = {
    chave: string;
    // só as que já estão salvas no back (as locais ainda não têm id e não dá pra editar)
    id?: string;
    autor: Usuario;
    conteudo: string;
    criadoEm: string;
    editadaEm: string | null;
    local?: MensagemLocal;
};

export function CanalTexto({ canal, eu, membros, membrosVisivel, onMembros, onBuscar, onMenu }: Props) {
    const { estado, mensagens, pendentes, temMais, carregandoMais, enviar, reenviar, descartar, editar, apagar, carregarMais } = useMensagens(canal.id, eu);
    const toast = useToast();
    const { abrirPerfil } = usePerfil();
    const { nomes: digitando, notificar } = useDigitando(canal.id, eu, membros);

    const listaRef = useRef<HTMLDivElement>(null);
    const conteudoRef = useRef<HTMLDivElement>(null);
    const noFimRef = useRef(true);
    // altura da rolagem antes de prepender histórico, pra manter a leitura no lugar
    const preservarRef = useRef<number | null>(null);
    const [novas, setNovas] = useState(false);
    // id da mensagem aberta no editor (uma por vez)
    const [editando, setEditando] = useState<string | null>(null);
    // mensagem esperando a confirmação pra ser apagada
    const [confirmando, setConfirmando] = useState<Item | null>(null);
    // quantos itens tinha na última renderização (pra diferenciar mensagem nova de apagada)
    const qtdAnterior = useRef(0);

    const itens: Item[] = [
        ...mensagens.map((m) => ({
            chave: m.id,
            id: m.id,
            // a mensagem guarda o autor de quando chegou; o membro tem a foto e o nome atuais
            autor: membros.get(m.autor.id) ?? m.autor,
            conteudo: m.conteudo,
            criadoEm: m.criadoEm,
            editadaEm: m.editadaEm,
        })),
        // se a atualização automática já trouxe a mensagem antes do envio terminar, não mostra duas vezes
        ...pendentes.filter((p) => !mensagens.some((m) =>
            m.autor.id === p.autor.id &&
            m.conteudo === p.conteudo &&
            new Date(m.criadoEm).getTime() >= new Date(p.criadoEm).getTime() - 10_000,
        )).map((p) => ({
            chave: p.idLocal,
            autor: membros.get(p.autor.id) ?? p.autor,
            conteudo: p.conteudo,
            criadoEm: p.criadoEm,
            editadaEm: null,
            local: p,
        })),
    ];

    // chegou mensagem: se você estava no fim, desce junto; se estava lendo acima, avisa
    useLayoutEffect(() => {
        const el = listaRef.current;
        const cresceu = itens.length > qtdAnterior.current;
        qtdAnterior.current = itens.length;
        if (!el) return;
        // acabamos de prepender histórico (rolar pra cima): mantém a posição de leitura
        if (preservarRef.current !== null) {
            el.scrollTop += el.scrollHeight - preservarRef.current;
            preservarRef.current = null;
            return;
        }
        // mensagem apagada não é mensagem nova: nem rola nem avisa
        if (!cresceu) return;
        if (noFimRef.current) {
            el.scrollTop = el.scrollHeight;
        } else if (itens.length > 0) {
            setNovas(true);
        }
    }, [itens.length]);

    // a altura muda sem mensagem nova (imagem que terminou de carregar, mensagem editada) ou a
    // área do chat encolhe (teclado do celular abrindo, campo de texto crescendo):
    // quem estava no fim continua no fim
    useEffect(() => {
        const lista = listaRef.current;
        const conteudo = conteudoRef.current;
        if (!lista || !conteudo) return;
        const observador = new ResizeObserver(() => {
            if (noFimRef.current) lista.scrollTop = lista.scrollHeight;
        });
        observador.observe(conteudo);
        observador.observe(lista);
        return () => observador.disconnect();
    }, []);

    function aoRolar() {
        const el = listaRef.current;
        if (!el) return;
        noFimRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        if (noFimRef.current) setNovas(false);
        // perto do topo: carrega mais antigas, guardando a altura pra preservar a posição
        if (el.scrollTop < 120 && temMais && !carregandoMais) {
            preservarRef.current = el.scrollHeight;
            carregarMais();
        }
    }

    function irProFim() {
        const el = listaRef.current;
        if (!el) return;
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
        setNovas(false);
    }

    // a mensagem sumiu enquanto a confirmação estava aberta (apagada em outra aba): fecha
    useEffect(() => {
        if (confirmando && !mensagens.some((m) => m.id === confirmando.id)) setConfirmando(null);
    }, [confirmando, mensagens]);

    async function apagarMensagem(mensagemId: string) {
        await apagar(mensagemId);
        if (editando === mensagemId) setEditando(null);
    }

    // Shift + clique apaga direto, sem perguntar
    function aoClicarLixeira(item: Item, shift: boolean) {
        if (!item.id) return;
        if (!shift) {
            setConfirmando(item);
            return;
        }
        apagarMensagem(item.id).catch((err) => toast.erro(mensagemDeErro(err)));
    }

    function aoEnviar(conteudo: string) {
        noFimRef.current = true;
        enviar(conteudo);
    }

    const indisponivel = estado === "indisponivel";

    return (
        <div className="vista">
            <Cabecalho icone={<Hash size={20} />} titulo={canal.nome} onMenu={onMenu}>
                <Dica texto={`Buscar (${teclaAtalho} K)`} lado="baixo">
                    <button className="botao-icone" onClick={onBuscar} aria-label="Buscar">
                        <Search size={19} />
                    </button>
                </Dica>
                <Dica texto={membrosVisivel ? "Ocultar membros" : "Mostrar membros"} lado="baixo">
                    <button
                        className={`botao-icone ${membrosVisivel ? "ativo" : ""}`}
                        onClick={onMembros}
                        aria-pressed={membrosVisivel}
                        aria-label="Membros"
                    >
                        <Users size={19} />
                    </button>
                </Dica>
            </Cabecalho>

            <div className="chat">
                <div className="chat-rolagem" ref={listaRef} onScroll={aoRolar}>
                    <div className="chat-conteudo" ref={conteudoRef}>
                        {!temMais && (
                            <div className="chat-inicio">
                                <span className="chat-inicio-icone"><Hash size={30} /></span>
                                <h2>Bem-vindo a #{canal.nome}</h2>
                                <p>Este é o começo do canal #{canal.nome}.</p>
                            </div>
                        )}

                        {estado === "carregando" && <EsqueletoMensagens />}

                        {estado === "indisponivel" && (
                            <div className="chat-aviso">
                                <strong>O chat de texto ainda não está disponível</strong>
                                <span>
                                    O servidor ainda não tem as rotas de mensagem. Assim que elas existirem, as conversas
                                    deste canal aparecem aqui. As salas de voz já têm um chat ao vivo.
                                </span>
                            </div>
                        )}

                        {estado === "erro" && (
                            <div className="chat-aviso">
                                <strong>Não foi possível carregar as mensagens</strong>
                                <span>Tentando de novo em alguns segundos…</span>
                            </div>
                        )}

                        {itens.map((item, i) => {
                            const anterior = itens[i - 1];
                            const data = new Date(item.criadoEm);
                            const dataAnterior = anterior ? new Date(anterior.criadoEm) : null;
                            const novoDia = !dataAnterior || !mesmoDia(dataAnterior, data);
                            const inicioGrupo =
                                novoDia ||
                                anterior.autor.id !== item.autor.id ||
                                data.getTime() - (dataAnterior?.getTime() ?? 0) > JANELA_GRUPO_MS;
                            const mensagemId = item.id;
                            // só as suas, e só depois de salvas (as que estão indo ainda não têm id)
                            const minha = !!mensagemId && item.autor.id === eu.id;
                            const emEdicao = !!mensagemId && editando === mensagemId;
                            const imagens = imagensDoTexto(item.conteudo);
                            // mensagem que é só o link da imagem: mostra só a imagem
                            const soImagem = soImagens(item.conteudo, imagens);

                            return (
                                <Fragment key={item.chave}>
                                    {novoDia && (
                                        <div className="divisor-dia" role="separator">
                                            <span>{rotuloDia(data)}</span>
                                        </div>
                                    )}
                                    <article
                                        className={`mensagem ${inicioGrupo ? "mensagem-inicio" : ""} ${item.local ? `mensagem-${item.local.estado}` : ""} ${emEdicao ? "mensagem-em-edicao" : ""}`}
                                        // tocar na sua mensagem foca ela, e o foco mostra editar/apagar
                                        // (no celular não tem hover; o Safari nem sempre simula)
                                        tabIndex={minha ? -1 : undefined}
                                    >
                                        {minha && !emEdicao && (
                                            <div className="mensagem-acoes">
                                                <Dica texto="Editar">
                                                    <button
                                                        className="botao-icone botao-icone-mini"
                                                        onClick={() => setEditando(mensagemId)}
                                                        aria-label="Editar mensagem"
                                                    >
                                                        <Pencil size={14} />
                                                    </button>
                                                </Dica>
                                                <Dica texto="Apagar (Shift + clique apaga direto)">
                                                    <button
                                                        className="botao-icone botao-icone-mini botao-icone-perigo"
                                                        onClick={(e) => aoClicarLixeira(item, e.shiftKey)}
                                                        aria-label="Apagar mensagem"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </Dica>
                                            </div>
                                        )}
                                        <div className="mensagem-lateral">
                                            {inicioGrupo ? (
                                                <button
                                                    className="mensagem-avatar"
                                                    onClick={(e) => abrirPerfil(item.autor, e.currentTarget)}
                                                    aria-label={`Perfil de ${item.autor.nome}`}
                                                    aria-haspopup="dialog"
                                                >
                                                    <Avatar nome={item.autor.nome} url={item.autor.avatarUrl} tamanho={38} />
                                                </button>
                                            ) : (
                                                <time className="mensagem-hora">{hora(data)}</time>
                                            )}
                                        </div>
                                        <div className="mensagem-corpo">
                                            {inicioGrupo && (
                                                <header className="mensagem-topo">
                                                    <button
                                                        className="mensagem-autor"
                                                        onClick={(e) => abrirPerfil(item.autor, e.currentTarget)}
                                                        aria-haspopup="dialog"
                                                    >
                                                        <strong>{item.autor.nome}</strong>
                                                    </button>
                                                    <time dateTime={item.criadoEm}>{quando(data)}</time>
                                                </header>
                                            )}
                                            {emEdicao ? (
                                                <EditorMensagem
                                                    inicial={item.conteudo}
                                                    onSalvar={async (conteudo) => {
                                                        await editar(mensagemId, conteudo);
                                                        setEditando(null);
                                                    }}
                                                    onCancelar={() => setEditando(null)}
                                                />
                                            ) : (
                                                <>
                                                    {!soImagem && (
                                                        <p className="mensagem-texto">
                                                            <Texto conteudo={item.conteudo} />
                                                            {item.editadaEm && (
                                                                <time className="mensagem-editada" dateTime={item.editadaEm}>
                                                                    {" "}({rotuloEditada(item.editadaEm)})
                                                                </time>
                                                            )}
                                                        </p>
                                                    )}
                                                    {imagens.length > 0 && <MidiasMensagem urls={imagens} autor={item.autor.nome} />}
                                                    {soImagem && item.editadaEm && (
                                                        <time className="mensagem-editada" dateTime={item.editadaEm}>
                                                            ({rotuloEditada(item.editadaEm)})
                                                        </time>
                                                    )}
                                                </>
                                            )}
                                            {item.local?.estado === "falhou" && (
                                                <div className="mensagem-erro">
                                                    Não foi enviada.
                                                    <button onClick={() => reenviar(item.chave)}>Tentar de novo</button>
                                                    <button onClick={() => descartar(item.chave)}>Descartar</button>
                                                </div>
                                            )}
                                        </div>
                                    </article>
                                </Fragment>
                            );
                        })}
                    </div>
                </div>

                {novas && (
                    <button className="chat-novas" onClick={irProFim}>
                        Novas mensagens <ArrowDown size={15} />
                    </button>
                )}

                <div className="chat-digitando" aria-live="polite">
                    {digitando.length > 0 && (
                        <>
                            <span className="chat-digitando-pontos" aria-hidden="true"><i /><i /><i /></span>
                            <span className="truncar">{textoDigitando(digitando)}</span>
                        </>
                    )}
                </div>

                <Compositor canalNome={canal.nome} desativado={indisponivel} onEnviar={aoEnviar} onDigitar={notificar} />
            </div>

            {confirmando?.id && (
                <ConfirmarApagar
                    item={confirmando}
                    onCancelar={() => setConfirmando(null)}
                    onApagar={async () => {
                        await apagarMensagem(confirmando.id!);
                        setConfirmando(null);
                    }}
                />
            )}
        </div>
    );
}

type ConfirmarProps = { item: Item; onCancelar: () => void; onApagar: () => Promise<void> };

// confirmação com a mensagem à mostra, pra não apagar a errada
function ConfirmarApagar({ item, onCancelar, onApagar }: ConfirmarProps) {
    const [apagando, setApagando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    async function confirmar() {
        setApagando(true);
        setErro(null);
        try {
            await onApagar(); // deu certo: quem chamou fecha
        } catch (err) {
            setErro(mensagemDeErro(err));
            setApagando(false);
        }
    }

    return (
        <Dialogo titulo="Apagar mensagem" descricao="Ela some pra todo mundo do canal, e não dá pra desfazer." onFechar={onCancelar}>
            <div className="formulario">
                <div className="apagar-previa">
                    <Avatar nome={item.autor.nome} url={item.autor.avatarUrl} tamanho={32} />
                    <div className="apagar-previa-corpo">
                        <header className="mensagem-topo">
                            <strong>{item.autor.nome}</strong>
                            <time dateTime={item.criadoEm}>{quando(new Date(item.criadoEm))}</time>
                        </header>
                        <p className="mensagem-texto apagar-previa-texto">
                            <Texto conteudo={item.conteudo} />
                        </p>
                    </div>
                </div>

                {!telaDeToque && <p className="apagar-dica">Dica: Shift + clique na lixeira apaga sem perguntar.</p>}

                {erro && <p className="texto-erro">{erro}</p>}

                <div className="formulario-acoes">
                    <button type="button" className="botao botao-fantasma" onClick={onCancelar}>Cancelar</button>
                    {/* foco aqui: Enter confirma, Esc cancela */}
                    <button type="button" className="botao botao-perigo" onClick={confirmar} disabled={apagando} autoFocus>
                        {apagando && <Loader2 size={16} className="girar" />}
                        Apagar
                    </button>
                </div>
            </div>
        </Dialogo>
    );
}

// texto da mensagem com os links clicáveis
function Texto({ conteudo }: { conteudo: string }) {
    return (
        <>
            {partesTexto(conteudo).map((parte, i) =>
                parte.link ? (
                    <a key={i} href={parte.valor} target="_blank" rel="noreferrer noopener">{parte.valor}</a>
                ) : (
                    <Fragment key={i}>{parte.valor}</Fragment>
                ),
            )}
        </>
    );
}

// "editada hoje às 14:32", "editada ontem às 09:10" ou "editada em 12/10/2026 às 14:32"
function rotuloEditada(data: string) {
    const d = new Date(data);
    const dia = rotuloDia(d);
    if (dia === "Hoje" || dia === "Ontem") return `editada ${dia.toLowerCase()} às ${hora(d)}`;
    return `editada em ${d.toLocaleDateString("pt-BR")} às ${hora(d)}`;
}

// textarea cresce conforme o texto, até `maximo` px (depois disso rola)
function useAlturaAutomatica(ref: RefObject<HTMLTextAreaElement | null>, texto: string, maximo = 220) {
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.style.height = "0px";
        el.style.height = `${Math.min(el.scrollHeight, maximo)}px`;
        // só mostra a barra de rolagem quando passar da altura máxima
        el.style.overflowY = el.scrollHeight > maximo ? "auto" : "hidden";
    }, [ref, texto, maximo]);
}

type EditorProps = { inicial: string; onSalvar: (conteudo: string) => Promise<void>; onCancelar: () => void };

// edição no lugar da mensagem: Enter salva, Shift+Enter quebra a linha, Esc cancela
function EditorMensagem({ inicial, onSalvar, onCancelar }: EditorProps) {
    const [texto, setTexto] = useState(inicial);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const ref = useRef<HTMLTextAreaElement>(null);

    useAlturaAutomatica(ref, texto);

    // abre com o cursor no fim do texto
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
    }, []);

    async function salvar() {
        const conteudo = texto.trim();
        // vazio não salva (ainda não tem como apagar mensagem); igual só fecha
        if (!conteudo || salvando) return;
        if (conteudo === inicial) {
            onCancelar();
            return;
        }
        setSalvando(true);
        setErro(null);
        try {
            await onSalvar(conteudo); // deu certo: quem chamou fecha o editor
        } catch (err) {
            setErro(mensagemDeErro(err));
            setSalvando(false);
        }
    }

    function aoTeclar(e: KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === "Escape") {
            e.preventDefault();
            onCancelar();
        } else if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            salvar();
        }
    }

    return (
        <div className="mensagem-editor">
            <div className="mensagem-editor-campo">
                <textarea
                    ref={ref}
                    rows={1}
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    onKeyDown={aoTeclar}
                    maxLength={LIMITE_MENSAGEM}
                    disabled={salvando}
                    aria-label="Editar mensagem"
                />
            </div>
            <div className="mensagem-editor-dica">
                {salvando ? (
                    <>
                        <Loader2 size={12} className="girar" /> Salvando…
                    </>
                ) : telaDeToque ? (
                    // no celular não tem Esc: ficam só os botões
                    <>
                        <button onClick={onCancelar}>Cancelar</button> ·{" "}
                        <button onClick={salvar} disabled={!texto.trim()}>Salvar</button>
                    </>
                ) : (
                    <>
                        esc para <button onClick={onCancelar}>cancelar</button> · enter para{" "}
                        <button onClick={salvar} disabled={!texto.trim()}>salvar</button>
                    </>
                )}
            </div>
            {erro && <p className="texto-erro">{erro}</p>}
        </div>
    );
}

// monta "Fulano está digitando…" conforme a quantidade de gente
function textoDigitando(nomes: string[]) {
    if (nomes.length === 1) return `${nomes[0]} está digitando…`;
    if (nomes.length === 2) return `${nomes[0]} e ${nomes[1]} estão digitando…`;
    if (nomes.length === 3) return `${nomes[0]}, ${nomes[1]} e ${nomes[2]} estão digitando…`;
    return "Várias pessoas estão digitando…";
}

type CompositorProps = { canalNome: string; desativado: boolean; onEnviar: (conteudo: string) => void; onDigitar: () => void };

function Compositor({ canalNome, desativado, onEnviar, onDigitar }: CompositorProps) {
    const [texto, setTexto] = useState("");
    const ref = useRef<HTMLTextAreaElement>(null);
    const restante = LIMITE_MENSAGEM - texto.length;

    useAlturaAutomatica(ref, texto);

    function enviar() {
        const conteudo = texto.trim();
        if (!conteudo || desativado) return;
        onEnviar(conteudo);
        setTexto("");
        // no celular o foco já fica no campo (o botão não rouba); focar de novo reabriria
        // o teclado de quem já tinha fechado
        if (!telaDeToque) ref.current?.focus();
    }

    function aoTeclar(e: KeyboardEvent<HTMLTextAreaElement>) {
        // Enter envia, Shift+Enter quebra a linha
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            enviar();
        }
    }

    return (
        <div className="compositor-area">
            <div className={`compositor ${desativado ? "desativado" : ""}`}>
                <textarea
                    ref={ref}
                    rows={1}
                    value={texto}
                    onChange={(e) => {
                        setTexto(e.target.value);
                        onDigitar();
                    }}
                    onKeyDown={aoTeclar}
                    maxLength={LIMITE_MENSAGEM}
                    placeholder={desativado ? "Chat de texto indisponível" : `Conversar em #${canalNome}`}
                    disabled={desativado}
                    autoFocus={!telaDeToque}
                    // a tecla Enter do teclado do celular vira "enviar"
                    enterKeyHint="send"
                />
                {restante <= 40 && <span className={`compositor-limite ${restante <= 10 ? "quase" : ""}`}>{restante}</span>}
                <button
                    className="compositor-enviar"
                    onClick={enviar}
                    // não tira o foco do campo: no celular o teclado fecharia e abriria de novo a cada envio
                    onMouseDown={(e) => e.preventDefault()}
                    disabled={desativado || !texto.trim()}
                    aria-label="Enviar"
                >
                    <SendHorizontal size={18} />
                </button>
            </div>
        </div>
    );
}

function EsqueletoMensagens() {
    return (
        <div className="esqueleto-mensagens" aria-hidden="true">
            {[68, 42, 80].map((largura, i) => (
                <div key={i} className="esqueleto-mensagem">
                    <span className="esqueleto esqueleto-avatar" />
                    <div>
                        <span className="esqueleto" style={{ width: 120, height: 12 }} />
                        <span className="esqueleto" style={{ width: `${largura}%`, height: 12 }} />
                    </div>
                </div>
            ))}
        </div>
    );
}
