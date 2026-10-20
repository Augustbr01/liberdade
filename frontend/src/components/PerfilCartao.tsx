import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Ban, CalendarDays, Camera, Loader2, ShieldMinus, ShieldPlus, UserMinus } from "lucide-react";
import type { Usuario } from "../api";
import { avatarReal, dataLonga } from "../lib/util";
import { Avatar } from "./ui/Avatar";

type Props = {
    usuario: Usuario;
    ehVoce: boolean;
    // ainda está no servidor aberto (quem saiu só aparece pelas mensagens antigas)
    membro: boolean;
    // o elemento clicado: o cartão abre do lado dele
    ancora: HTMLElement;
    onFechar: () => void;
    onEditarFoto: () => void;
    // o que a pessoa é no servidor aberto (aparece do lado do nome)
    papel: "dono" | "admin" | null;
    // só vem quando você pode dar ou tirar admin dessa pessoa; `admin` é como ela está agora
    cargo?: { admin: boolean; mudar: () => Promise<void> };
    // só vem quando você pode expulsar e banir essa pessoa do servidor aberto
    moderacao?: { expulsar: () => void; banir: () => void };
};

// distância mínima das bordas da janela e do elemento clicado
const MARGEM = 8;
const VAO = 10;
// até essa largura (celular) o cartão não cabe do lado de quem foi clicado: vira uma folha embaixo
const LARGURA_FOLHA = 600;

// "folha" = preso embaixo, na largura da tela (o CSS posiciona)
type Posicao = { left: number; top: number } | "folha";

// cartão de perfil que abre ao clicar em alguém (membros, chat, salas de voz)
export function PerfilCartao({ usuario, ehVoce, membro, ancora, onFechar, onEditarFoto, papel, cargo, moderacao }: Props) {
    const ref = useRef<HTMLDivElement>(null);
    const [posicao, setPosicao] = useState<Posicao | null>(null);
    // esperando o back responder o "tornar admin" / "remover como admin"
    const [mudandoCargo, setMudandoCargo] = useState(false);

    // ao lado do que foi clicado: à direita se couber, senão à esquerda; sempre dentro da janela
    const posicionar = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        // o elemento sumiu (mensagem apagada, lista recarregada): não tem do lado de quem abrir
        if (!ancora.isConnected) {
            onFechar();
            return;
        }
        // no celular, do lado de quem foi clicado ele cobriria justamente a lista de onde abriu
        if (window.innerWidth <= LARGURA_FOLHA) {
            setPosicao("folha");
            return;
        }
        const alvo = ancora.getBoundingClientRect();
        const { width, height } = el.getBoundingClientRect();
        let left = alvo.right + VAO;
        if (left + width > window.innerWidth - MARGEM) left = alvo.left - VAO - width;
        left = Math.min(Math.max(left, MARGEM), window.innerWidth - width - MARGEM);
        const top = Math.min(Math.max(alvo.top, MARGEM), window.innerHeight - height - MARGEM);
        setPosicao({ left, top });
    }, [ancora, onFechar]);

    // virou admin ou deixou de ser: quem abriu mudou de grupo na lista e o cartão mudou de altura
    useLayoutEffect(() => posicionar(), [posicionar, usuario, papel]);

    // fecha com clique fora ou Esc. Clicar no próprio elemento que abriu não conta: quem alterna é ele.
    // Rolagem só acompanha quem abriu (o chat rola sozinho quando chega mensagem, e isso fechava o
    // cartão); fecha se essa pessoa sair de vista. A janela mudar de largura fecha (o layout muda);
    // mudar só de altura é o teclado do celular abrindo ou fechando, e aí só reposiciona
    useEffect(() => {
        const largura = window.innerWidth;
        const aoClicar = (e: MouseEvent) => {
            const alvo = e.target as Node;
            if (ref.current?.contains(alvo) || ancora.contains(alvo)) return;
            onFechar();
        };
        const aoTeclar = (e: KeyboardEvent) => {
            if (e.key === "Escape") onFechar();
        };
        const aoRolar = (e: Event) => {
            // rolou dentro do cartão, ou é a folha do celular (que não fica presa a quem abriu)
            if (ref.current?.contains(e.target as Node) || window.innerWidth <= LARGURA_FOLHA) return;
            const alvo = ancora.getBoundingClientRect();
            const area = e.target instanceof Element
                ? e.target.getBoundingClientRect()
                : { top: 0, bottom: window.innerHeight };
            if (alvo.bottom < area.top || alvo.top > area.bottom) onFechar();
            else posicionar();
        };
        const aoRedimensionar = () => {
            if (window.innerWidth !== largura) onFechar();
            else posicionar();
        };
        document.addEventListener("mousedown", aoClicar);
        document.addEventListener("keydown", aoTeclar);
        document.addEventListener("scroll", aoRolar, true);
        window.addEventListener("resize", aoRedimensionar);
        return () => {
            document.removeEventListener("mousedown", aoClicar);
            document.removeEventListener("keydown", aoTeclar);
            document.removeEventListener("scroll", aoRolar, true);
            window.removeEventListener("resize", aoRedimensionar);
        };
    }, [ancora, onFechar, posicionar]);

    const fundo = avatarReal(usuario.avatarUrl);

    // o cartão fica aberto: deu certo, o botão vira o contrário e a etiqueta do nome muda
    function mudarCargo() {
        if (!cargo || mudandoCargo) return;
        setMudandoCargo(true);
        cargo.mudar().finally(() => setMudandoCargo(false));
    }

    return createPortal(
        <div
            ref={ref}
            className={`perfil ${posicao === "folha" ? "perfil-folha" : ""}`}
            role="dialog"
            aria-label={`Perfil de ${usuario.nome}`}
            // primeiro mede escondido, depois aparece já no lugar certo
            style={posicao === null ? { visibility: "hidden" } : posicao === "folha" ? undefined : posicao}
        >
            <div className="perfil-capa">
                {/* a própria foto, desfocada, vira a capa */}
                {fundo && <span className="perfil-capa-imagem" style={{ backgroundImage: `url(${JSON.stringify(fundo)})` }} />}
            </div>

            <div className="perfil-avatar">
                <Avatar nome={usuario.nome} url={usuario.avatarUrl} tamanho={84} />
            </div>

            <div className="perfil-corpo">
                <div className="perfil-nome">
                    <strong className="truncar">{usuario.nome}</strong>
                    {papel && <span className="perfil-tag">{papel === "dono" ? "Dono" : "Admin"}</span>}
                    {ehVoce && <span className="perfil-tag">Você</span>}
                </div>

                {usuario.entrou_em && (
                    <div className="perfil-secao">
                        <span className="rotulo">No Liberdade desde</span>
                        <span className="perfil-data">
                            <CalendarDays size={15} />
                            {dataLonga(usuario.entrou_em)}
                        </span>
                    </div>
                )}

                {!membro && <p className="perfil-aviso">Não faz mais parte deste servidor.</p>}

                {ehVoce && (
                    <button className="botao botao-pequeno botao-largo botao-contorno" onClick={onEditarFoto}>
                        <Camera size={14} />
                        Alterar foto
                    </button>
                )}

                {(cargo || moderacao) && (
                    <div className="perfil-moderacao">
                        {cargo && (
                            <button
                                className="botao botao-pequeno botao-contorno perfil-moderacao-cargo"
                                onClick={mudarCargo}
                                disabled={mudandoCargo}
                            >
                                {mudandoCargo ? (
                                    <Loader2 size={14} className="girar" />
                                ) : cargo.admin ? (
                                    <ShieldMinus size={14} />
                                ) : (
                                    <ShieldPlus size={14} />
                                )}
                                {cargo.admin ? "Remover como admin" : "Tornar admin"}
                            </button>
                        )}
                        {moderacao && (
                            <>
                                <button className="botao botao-pequeno botao-perigo-contorno" onClick={moderacao.expulsar}>
                                    <UserMinus size={14} />
                                    Expulsar
                                </button>
                                <button className="botao botao-pequeno botao-perigo-contorno" onClick={moderacao.banir}>
                                    <Ban size={14} />
                                    Banir
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>,
        document.body,
    );
}
