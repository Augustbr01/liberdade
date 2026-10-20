import { useEffect, useRef, useState, type FormEvent } from "react";
import { SendHorizontal, X } from "lucide-react";
import type { Usuario } from "../../api";
import { useChatSala, type MensagemSala } from "../../contexto/ChatSala";
import { hora, telaDeToque } from "../../lib/util";
import type { MapaMembros } from "../../tipos";
import { Avatar } from "../ui/Avatar";

// mensagens seguidas da mesma pessoa em até 3 min ficam no mesmo bloco
const JANELA_GRUPO_MS = 3 * 60 * 1000;

type Grupo = { chave: string; identidade: string; local: boolean; mensagens: MensagemSala[] };

function agrupar(mensagens: MensagemSala[]) {
    const grupos: Grupo[] = [];
    for (const m of mensagens) {
        const identidade = m.from?.identity ?? "?";
        const ultimo = grupos[grupos.length - 1];
        const ultimaMsg = ultimo?.mensagens[ultimo.mensagens.length - 1];
        if (ultimo && ultimaMsg && ultimo.identidade === identidade && m.timestamp - ultimaMsg.timestamp < JANELA_GRUPO_MS) {
            ultimo.mensagens.push(m);
        } else {
            grupos.push({ chave: m.id, identidade, local: !!m.from?.isLocal, mensagens: [m] });
        }
    }
    return grupos;
}

type Props = { membros: MapaMembros; eu: Usuario; onFechar: () => void };

// chat da chamada: só quem está na sala vê, e some quando a chamada acaba
export function ChatAoVivo({ membros, eu, onFechar }: Props) {
    const { mensagens, enviar, enviando, marcarLidas } = useChatSala();
    const [texto, setTexto] = useState("");
    const listaRef = useRef<HTMLDivElement>(null);

    // painel aberto = tudo lido; e desce até a última mensagem. Rola só a lista:
    // o scrollIntoView rolava a página junto no celular com o teclado aberto
    useEffect(() => {
        marcarLidas();
        const lista = listaRef.current;
        if (lista) lista.scrollTop = lista.scrollHeight;
    }, [mensagens.length, marcarLidas]);

    async function submeter(e: FormEvent) {
        e.preventDefault();
        const conteudo = texto.trim();
        if (!conteudo) return;

        setTexto("");
        try {
            await enviar(conteudo);
        } catch {
            setTexto(conteudo);
        }
    }

    return (
        <aside className="chat-sala">
            <header className="chat-sala-topo">
                <div>
                    <strong>Chat da sala</strong>
                    <span>Some quando a chamada acaba</span>
                </div>
                <button className="botao-icone" onClick={onFechar} aria-label="Fechar chat">
                    <X size={18} />
                </button>
            </header>

            <div className="chat-sala-lista" ref={listaRef}>
                {mensagens.length === 0 && <p className="chat-sala-vazio">Nenhuma mensagem ainda.</p>}

                {agrupar(mensagens).map((g) => {
                    const primeira = g.mensagens[0];
                    const membro = g.local ? eu : membros.get(g.identidade);
                    const nome = membro?.nome ?? primeira.from?.name ?? "Convidado";

                    return (
                        <div key={g.chave} className="chat-sala-grupo">
                            <Avatar nome={nome} url={membro?.avatarUrl} tamanho={28} />
                            <div className="chat-sala-corpo">
                                <span className="chat-sala-autor">
                                    {nome} <time>{hora(primeira.timestamp)}</time>
                                </span>
                                {g.mensagens.map((m) => (
                                    <p key={m.id}>{m.message}</p>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>

            <form className="chat-sala-compor" onSubmit={submeter}>
                <input
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    placeholder="Mensagem para a sala"
                    maxLength={500}
                    // no celular, abrir o chat não abre o teclado sozinho (dá pra só ler)
                    autoFocus={!telaDeToque}
                    enterKeyHint="send"
                />
                {/* não tira o foco do campo: no celular o teclado fecharia a cada envio */}
                <button
                    className="botao-icone"
                    disabled={!texto.trim() || enviando}
                    aria-label="Enviar"
                    onMouseDown={(e) => e.preventDefault()}
                >
                    <SendHorizontal size={18} />
                </button>
            </form>
        </aside>
    );
}
