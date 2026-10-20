import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Lado = "cima" | "baixo" | "direita";
type Props = { texto: string; lado?: Lado; children: ReactNode };

// distância do elemento e das bordas da janela
const VAO = 8;
const MARGEM = 8;

// foco que veio do teclado (Tab). No clique e no toque o navegador também foca o botão,
// e aí a dica não deve aparecer
function focoDeTeclado(el: Element) {
    try {
        return el.matches(":focus-visible");
    } catch {
        return false; // navegador sem :focus-visible
    }
}

// dica (tooltip) desenhada fora da árvore, pra não ser cortada por áreas com rolagem.
// Só aparece com mouse ou teclado: no toque não existe "tirar o mouse de cima",
// então ela ficava presa na tela depois de tocar no botão
export function Dica({ texto, lado = "cima", children }: Props) {
    const ref = useRef<HTMLSpanElement>(null);
    const [alvo, setAlvo] = useState<DOMRect | null>(null);

    const mostrar = () => setAlvo(ref.current?.getBoundingClientRect() ?? null);
    const esconder = () => setAlvo(null);

    return (
        <span
            ref={ref}
            className="dica-alvo"
            onPointerEnter={(e) => {
                if (e.pointerType === "mouse") mostrar();
            }}
            onPointerLeave={esconder}
            onPointerDown={esconder}
            onFocus={(e) => {
                if (focoDeTeclado(e.target)) mostrar();
            }}
            onBlur={esconder}
        >
            {children}
            {alvo && createPortal(<Balao texto={texto} lado={lado} alvo={alvo} />, document.body)}
        </span>
    );
}

type BalaoProps = { texto: string; lado: Lado; alvo: DOMRect };

function Balao({ texto, lado, alvo }: BalaoProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [posicao, setPosicao] = useState<{ left: number; top: number } | null>(null);

    // mede e encaixa dentro da janela: um botão colado na borda (o de membros, no canto
    // direito) cortava a dica no meio
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const { width, height } = el.getBoundingClientRect();
        let left: number;
        let top: number;
        if (lado === "direita") {
            left = alvo.right + VAO;
            top = alvo.top + alvo.height / 2 - height / 2;
        } else {
            left = alvo.left + alvo.width / 2 - width / 2;
            top = lado === "baixo" ? alvo.bottom + VAO : alvo.top - VAO - height;
        }
        left = Math.min(Math.max(left, MARGEM), window.innerWidth - width - MARGEM);
        top = Math.min(Math.max(top, MARGEM), window.innerHeight - height - MARGEM);
        setPosicao({ left, top });
    }, [texto, lado, alvo]);

    return (
        // primeiro mede escondida, depois aparece já no lugar certo
        <div ref={ref} className="dica" style={posicao ?? { visibility: "hidden" }} role="tooltip">
            {texto}
        </div>
    );
}
