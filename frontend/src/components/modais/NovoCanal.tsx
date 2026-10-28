import { useState, type FormEvent, type ReactNode } from "react";
import { Clapperboard, Hash, Loader2, Monitor, Sofa, Volume2 } from "lucide-react";
import { api, mensagemDeErro, type Canal, type ModeloSala, type TipoCanal } from "../../api";
import { Dialogo } from "../ui/Dialogo";

type Props = {
    servidorId: string;
    tipoInicial: TipoCanal;
    onFechar: () => void;
    onCriado: (canal: Canal) => void;
};

// canal de texto fica minúsculo e com hífen no lugar de espaço
function nomeFinal(nome: string, tipo: TipoCanal) {
    const limpo = nome.trim();
    return tipo === "TEXTO" ? limpo.toLowerCase().replace(/\s+/g, "-") : limpo;
}

export function NovoCanal({ servidorId, tipoInicial, onFechar, onCriado }: Props) {
    const [tipo, setTipo] = useState<TipoCanal>(tipoInicial);
    const [modelo, setModelo] = useState<ModeloSala>("PADRAO");
    const [nome, setNome] = useState("");
    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    const final = nomeFinal(nome, tipo);

    async function criar(e: FormEvent) {
        e.preventDefault();
        setEnviando(true);
        setErro(null);
        try {
            onCriado(await api.criarCanal(servidorId, final, tipo, tipo === "VOZ" ? modelo : undefined));
        } catch (err) {
            setErro(mensagemDeErro(err));
        } finally {
            setEnviando(false);
        }
    }

    return (
        <Dialogo titulo="Criar canal" onFechar={onFechar}>
            <form className="formulario" onSubmit={criar}>
                <div className="campo-rotulado">
                    <span className="rotulo">Tipo</span>
                    <div className="tipos-canal" role="radiogroup">
                        <OpcaoTipo
                            ativo={tipo === "TEXTO"}
                            onClick={() => setTipo("TEXTO")}
                            icone={<Hash size={20} />}
                            titulo="Texto"
                            descricao="Mensagens, links e avisos"
                        />
                        <OpcaoTipo
                            ativo={tipo === "VOZ"}
                            onClick={() => setTipo("VOZ")}
                            icone={<Volume2 size={20} />}
                            titulo="Voz"
                            descricao="Conversa por voz, vídeo e tela"
                        />
                    </div>
                </div>

                {tipo === "VOZ" && (
                    <div className="campo-rotulado">
                        <span className="rotulo">Sala no mundo 3D</span>
                        <div className="tipos-canal" role="radiogroup">
                            <OpcaoTipo
                                ativo={modelo === "PADRAO"}
                                onClick={() => setModelo("PADRAO")}
                                icone={<Sofa size={20} />}
                                titulo="Sala comum"
                                descricao="Sofás, mesa e uma TV"
                            />
                            <OpcaoTipo
                                ativo={modelo === "CINEMA"}
                                onClick={() => setModelo("CINEMA")}
                                icone={<Clapperboard size={20} />}
                                titulo="Cinema"
                                descricao="Telão, poltronas e luz que apaga no filme"
                            />
                            <OpcaoTipo
                                ativo={modelo === "LANHOUSE"}
                                onClick={() => setModelo("LANHOUSE")}
                                icone={<Monitor size={20} />}
                                titulo="LAN House"
                                descricao="Mesa LAN com 10 PCs, lounge com TV e 20 lugares"
                            />
                        </div>
                    </div>
                )}

                <label className="campo-rotulado">
                    <span className="rotulo">Nome</span>
                    <span className="campo campo-com-icone">
                        {tipo === "TEXTO" ? <Hash size={16} /> : <Volume2 size={16} />}
                        <input
                            value={nome}
                            onChange={(e) => setNome(e.target.value)}
                            maxLength={50}
                            placeholder={tipo === "TEXTO" ? "novo-canal" : "Nova sala"}
                            autoFocus
                        />
                    </span>
                </label>

                {erro && <p className="texto-erro">{erro}</p>}

                <div className="formulario-acoes">
                    <button type="button" className="botao botao-fantasma" onClick={onFechar}>Cancelar</button>
                    <button className="botao botao-primario" disabled={enviando || !final}>
                        {enviando && <Loader2 size={16} className="girar" />}
                        Criar canal
                    </button>
                </div>
            </form>
        </Dialogo>
    );
}

type OpcaoProps = { ativo: boolean; onClick: () => void; icone: ReactNode; titulo: string; descricao: string };

function OpcaoTipo({ ativo, onClick, icone, titulo, descricao }: OpcaoProps) {
    return (
        <button type="button" role="radio" aria-checked={ativo} className={`tipo-canal ${ativo ? "ativo" : ""}`} onClick={onClick}>
            <span className="tipo-canal-icone">{icone}</span>
            <span className="tipo-canal-texto">
                <strong>{titulo}</strong>
                <span>{descricao}</span>
            </span>
            <span className="tipo-canal-radio" />
        </button>
    );
}
