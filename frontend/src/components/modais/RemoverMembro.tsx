import { useState } from "react";
import { Loader2 } from "lucide-react";
import { mensagemDeErro, type Usuario } from "../../api";
import { Avatar } from "../ui/Avatar";
import { Dialogo } from "../ui/Dialogo";

// expulsar: sai, mas volta com um convite novo; banir: sai e não volta até tirarem o banimento
export type ModoRemocao = "expulsar" | "banir";

const TEXTOS: Record<ModoRemocao, { titulo: string; sai: string; explicacao: string; botao: string }> = {
    expulsar: {
        titulo: "Expulsar do servidor",
        sai: "sai de",
        explicacao: "A pessoa deixa de ver os canais e as mensagens, e só volta se receber um novo convite.",
        botao: "Expulsar",
    },
    banir: {
        titulo: "Banir do servidor",
        sai: "sai e não volta para",
        explicacao:
            "A pessoa sai do servidor e não consegue entrar de novo, nem com convite. Dá pra desfazer em Configurações do servidor → Banimentos.",
        botao: "Banir",
    },
};

type Props = {
    modo: ModoRemocao;
    usuario: Usuario;
    servidorNome: string;
    onFechar: () => void;
    // chama a API; se der erro, o modal mostra e continua aberto
    onConfirmar: () => Promise<void>;
};

// confirmação antes de expulsar ou banir alguém do servidor
export function RemoverMembro({ modo, usuario, servidorNome, onFechar, onConfirmar }: Props) {
    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const textos = TEXTOS[modo];

    async function confirmar() {
        setEnviando(true);
        setErro(null);
        try {
            await onConfirmar(); // deu certo: quem chamou fecha
        } catch (err) {
            setErro(mensagemDeErro(err));
            setEnviando(false);
        }
    }

    return (
        <Dialogo titulo={textos.titulo} onFechar={onFechar}>
            <div className="formulario">
                <div className="expulsar-quem">
                    <Avatar nome={usuario.nome} url={usuario.avatarUrl} tamanho={40} />
                    <div>
                        <strong className="truncar">{usuario.nome}</strong>
                        <span>{textos.sai} {servidorNome}</span>
                    </div>
                </div>

                <p className="texto-fraco">{textos.explicacao}</p>

                {erro && <p className="texto-erro">{erro}</p>}

                <div className="formulario-acoes">
                    <button type="button" className="botao botao-fantasma" onClick={onFechar}>Cancelar</button>
                    {/* foco aqui: Enter confirma, Esc cancela */}
                    <button type="button" className="botao botao-perigo" onClick={confirmar} disabled={enviando} autoFocus>
                        {enviando && <Loader2 size={16} className="girar" />}
                        {textos.botao}
                    </button>
                </div>
            </div>
        </Dialogo>
    );
}
