import { useAgora } from "../../hooks/useAgora";
import { cronometro } from "../../lib/util";

type Props = {
    // ISO (do back) ou milissegundos (Date.now())
    inicio: string | number;
    className?: string;
};

// há quanto tempo uma chamada está rolando. É um componente à parte porque o relógio
// redesenha a cada segundo: assim só esse número muda, não a lista inteira de canais
export function TempoSala({ inicio, className }: Props) {
    const agora = useAgora();
    const desde = typeof inicio === "number" ? inicio : Date.parse(inicio);
    if (Number.isNaN(desde)) return null;

    return <span className={className}>{cronometro(agora - desde)}</span>;
}
