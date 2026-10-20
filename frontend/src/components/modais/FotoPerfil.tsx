import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { Camera, Loader2 } from "lucide-react";
import { api, ErroApi, mensagemDeErro, problemaNaImagem, TIPOS_AVATAR, type Usuario } from "../../api";
import { telaDeToque, temFotoPropria } from "../../lib/util";
import { Avatar } from "../ui/Avatar";
import { Dialogo } from "../ui/Dialogo";

type Props = {
    eu: Usuario;
    onFechar: () => void;
    onPronto: (usuario: Usuario, removida: boolean) => void;
};

export function FotoPerfil({ eu, onFechar, onPronto }: Props) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [arquivo, setArquivo] = useState<File | null>(null);
    const [previa, setPrevia] = useState<string | null>(null);
    const [arrastando, setArrastando] = useState(false);
    // qual botão está esperando o back (desabilita os dois)
    const [acao, setAcao] = useState<"salvar" | "remover" | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const ocupado = acao !== null;

    // a prévia é uma URL temporária do navegador (blob:), liberada ao trocar de arquivo ou fechar
    useEffect(() => {
        if (!arquivo) return;
        const url = URL.createObjectURL(arquivo);
        setPrevia(url);
        return () => URL.revokeObjectURL(url);
    }, [arquivo]);

    function escolher(novo: File | undefined) {
        if (!novo) return;
        const problema = problemaNaImagem(novo);
        setErro(problema);
        if (!problema) setArquivo(novo);
    }

    function soltar(e: DragEvent) {
        e.preventDefault();
        setArrastando(false);
        escolher(e.dataTransfer.files[0]);
    }

    async function salvar(e: FormEvent) {
        e.preventDefault();
        if (!arquivo) return;
        setAcao("salvar");
        setErro(null);
        try {
            onPronto(await api.atualizarAvatar(arquivo), false);
        } catch (err) {
            // o 413 vem do plugin de upload, com a mensagem em inglês
            setErro(err instanceof ErroApi && err.status === 413 ? "A imagem deve ter no máximo 4 MB." : mensagemDeErro(err));
        } finally {
            setAcao(null);
        }
    }

    async function remover() {
        setAcao("remover");
        setErro(null);
        try {
            onPronto(await api.removerAvatar(), true);
        } catch (err) {
            setErro(mensagemDeErro(err));
        } finally {
            setAcao(null);
        }
    }

    return (
        <Dialogo titulo="Foto de perfil" descricao="Aparece pra todo mundo nos seus servidores." largura={400} onFechar={onFechar}>
            <form className="formulario" onSubmit={salvar}>
                <div
                    className={`foto-perfil ${arrastando ? "arrastando" : ""}`}
                    onDragOver={(e) => {
                        e.preventDefault();
                        setArrastando(true);
                    }}
                    onDragLeave={() => setArrastando(false)}
                    onDrop={soltar}
                >
                    <button
                        type="button"
                        className="foto-perfil-alvo"
                        onClick={() => inputRef.current?.click()}
                        disabled={ocupado}
                        aria-label="Escolher imagem"
                    >
                        {/* fit: cover em círculo = o mesmo corte que o sharp faz no back */}
                        <Avatar nome={eu.nome} url={previa ?? eu.avatarUrl} tamanho={120} />
                        <span className="foto-perfil-camada" aria-hidden>
                            <Camera size={24} />
                        </span>
                    </button>

                    <button
                        type="button"
                        className="botao botao-pequeno botao-contorno"
                        onClick={() => inputRef.current?.click()}
                        disabled={ocupado}
                    >
                        {arquivo ? "Escolher outra" : "Escolher imagem"}
                    </button>
                    <p className="foto-perfil-dica">
                        PNG, JPG, WebP ou GIF (animado também), até 4 MB.
                        {!telaDeToque && " Também dá pra arrastar a imagem até aqui."}
                    </p>

                    <input
                        ref={inputRef}
                        type="file"
                        accept={TIPOS_AVATAR.join(",")}
                        hidden
                        onChange={(e) => {
                            escolher(e.target.files?.[0]);
                            // limpa pra conseguir escolher o mesmo arquivo de novo
                            e.target.value = "";
                        }}
                    />
                </div>

                {erro && <p className="texto-erro">{erro}</p>}

                <div className="formulario-acoes">
                    {/* só com foto própria salva: o avatar padrão do Discord não tem o que remover.
                        Com uma imagem nova escolhida, a ação da vez é salvar */}
                    {temFotoPropria(eu.avatarUrl) && !arquivo && (
                        <button type="button" className="botao botao-remover" onClick={remover} disabled={ocupado}>
                            {acao === "remover" && <Loader2 size={16} className="girar" />}
                            Remover foto
                        </button>
                    )}
                    <button type="button" className="botao botao-fantasma" onClick={onFechar}>Cancelar</button>
                    <button className="botao botao-primario" disabled={ocupado || !arquivo}>
                        {acao === "salvar" && <Loader2 size={16} className="girar" />}
                        Salvar foto
                    </button>
                </div>
            </form>
        </Dialogo>
    );
}
