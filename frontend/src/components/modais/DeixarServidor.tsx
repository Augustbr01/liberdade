import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { mensagemDeErro, type ServidorResumo } from "../../api";
import { telaDeToque } from "../../lib/util";
import { IconeServidor } from "../ui/Avatar";
import { Dialogo } from "../ui/Dialogo";

// sair: só você deixa o servidor (volta com convite); apagar: o dono acaba com ele pra todo mundo
export type ModoDeixar = "sair" | "apagar";

type Props = {
    modo: ModoDeixar;
    servidor: ServidorResumo;
    onFechar: () => void;
    // chama a API; se der erro, o modal mostra e continua aberto
    onConfirmar: () => Promise<void>;
};

// confirmação de sair do servidor (simples) ou de apagar (digitando o nome, porque não tem volta)
export function DeixarServidor({ modo, servidor, onFechar, onConfirmar }: Props) {
    const [nome, setNome] = useState("");
    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const apagar = modo === "apagar";
    // apagar só libera com o nome do servidor digitado igual
    const liberado = !apagar || nome.trim() === servidor.nome.trim();

    async function confirmar(e: FormEvent) {
        e.preventDefault();
        if (!liberado || enviando) return;
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
        <Dialogo titulo={apagar ? "Apagar servidor" : "Sair do servidor"} onFechar={onFechar}>
            <form className="formulario" onSubmit={confirmar}>
                <div className="expulsar-quem">
                    <IconeServidor nome={servidor.nome} url={servidor.iconeUrl} tamanho={40} />
                    <div>
                        <strong className="truncar">{servidor.nome}</strong>
                        <span>{apagar ? "some pra todos os membros" : "sai da sua lista de servidores"}</span>
                    </div>
                </div>

                <p className="texto-fraco">
                    {apagar
                        ? "Isso apaga o servidor pra todo mundo, com os canais, as mensagens, os convites e os banimentos. Não dá pra desfazer."
                        : "Você deixa de ver os canais e as mensagens. Pra voltar, vai precisar de um convite novo."}
                </p>

                {apagar && (
                    <label className="campo-rotulado">
                        <span className="confirmar-nome">
                            Pra confirmar, digite <strong>{servidor.nome}</strong>
                        </span>
                        <input
                            className="campo"
                            value={nome}
                            onChange={(e) => setNome(e.target.value)}
                            autoComplete="off"
                            spellCheck={false}
                            autoFocus={!telaDeToque}
                        />
                    </label>
                )}

                {erro && <p className="texto-erro">{erro}</p>}

                <div className="formulario-acoes">
                    <button type="button" className="botao botao-fantasma" onClick={onFechar}>Cancelar</button>
                    {/* sair: foco aqui (Enter confirma, Esc cancela); apagar: o foco fica no campo do nome */}
                    <button className="botao botao-perigo" disabled={!liberado || enviando} autoFocus={!apagar}>
                        {enviando && <Loader2 size={16} className="girar" />}
                        {apagar ? "Apagar servidor" : "Sair do servidor"}
                    </button>
                </div>
            </form>
        </Dialogo>
    );
}
