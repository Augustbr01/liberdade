import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, X } from "lucide-react";

type Props = {
    urls: string[];
    // quem mandou (pro texto alternativo)
    autor: string;
};

const ehGif = (url: string) => /\.gif$/i.test(new URL(url).pathname);

// imagens/GIFs de uma mensagem. Hoje vêm dos links do texto; quando o chat tiver upload,
// os anexos (do R2) podem passar por aqui também
export function MidiasMensagem({ urls, autor }: Props) {
    const [aberta, setAberta] = useState<string | null>(null);

    return (
        <div className="mensagem-midias">
            {urls.map((url) => (
                <Midia key={url} url={url} autor={autor} onAbrir={() => setAberta(url)} />
            ))}
            {aberta && <VisualizadorImagem url={aberta} autor={autor} onFechar={() => setAberta(null)} />}
        </div>
    );
}

type MidiaProps = { url: string; autor: string; onAbrir: () => void };

function Midia({ url, autor, onAbrir }: MidiaProps) {
    const [estado, setEstado] = useState<"carregando" | "pronta" | "falhou">("carregando");

    // não é imagem de verdade, sumiu ou o site bloqueou: volta a ser o link
    if (estado === "falhou") {
        return (
            <a className="midia-link" href={url} target="_blank" rel="noreferrer noopener">
                {url}
            </a>
        );
    }

    return (
        <button
            className={`midia ${estado === "carregando" ? "carregando" : ""}`}
            onClick={onAbrir}
            aria-label={`Abrir imagem enviada por ${autor}`}
        >
            <img
                src={url}
                alt=""
                loading="lazy"
                decoding="async"
                // não conta pro site da imagem de qual página ela foi aberta
                referrerPolicy="no-referrer"
                onLoad={() => setEstado("pronta")}
                onError={() => setEstado("falhou")}
            />
            {estado === "pronta" && ehGif(url) && <span className="midia-gif">GIF</span>}
        </button>
    );
}

type VisualizadorProps = { url: string; autor: string; onFechar: () => void };

// a imagem em tamanho grande, por cima de tudo; Esc ou clique fora fecha
function VisualizadorImagem({ url, autor, onFechar }: VisualizadorProps) {
    useEffect(() => {
        const aoTeclar = (e: KeyboardEvent) => {
            if (e.key === "Escape") onFechar();
        };
        window.addEventListener("keydown", aoTeclar);
        return () => window.removeEventListener("keydown", aoTeclar);
    }, [onFechar]);

    return createPortal(
        <div className="visualizador" onClick={onFechar} role="dialog" aria-modal="true" aria-label={`Imagem enviada por ${autor}`}>
            <button className="visualizador-fechar" onClick={onFechar} aria-label="Fechar">
                <X size={20} />
            </button>
            <img src={url} alt="" referrerPolicy="no-referrer" onClick={(e) => e.stopPropagation()} />
            <a
                className="visualizador-original"
                href={url}
                target="_blank"
                rel="noreferrer noopener"
                onClick={(e) => e.stopPropagation()}
            >
                <ExternalLink size={14} />
                Abrir original
            </a>
        </div>,
        document.body,
    );
}
