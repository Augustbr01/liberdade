import { useMemo } from "react";
import { enderecoDoQuadro } from "../../lib/link";

type Props = {
    url: string;
    // false na TV do 3D: o iframe só mostra (o mouse é do jogo, não da página)
    clicavel?: boolean;
};

// o site que alguém mandou abrir na TV. Fica numa caixa isolada (sandbox) e sem mandar de onde veio.
// Sites que proíbem ser abertos aqui dentro ficam em branco: o dono do site é quem decide isso
export function QuadroLink({ url, clicavel = true }: Props) {
    const src = useMemo(() => enderecoDoQuadro(url), [url]);
    return (
        <iframe
            key={src}
            className="quadro-link"
            src={src}
            title="Site na TV"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture; clipboard-write"
            allowFullScreen
            referrerPolicy="no-referrer"
            loading="eager"
            style={clicavel ? undefined : { pointerEvents: "none" }}
        />
    );
}
