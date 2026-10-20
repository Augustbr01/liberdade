import { Bird, Plus } from "lucide-react";
import type { ServidorResumo } from "../api";
import { IconeServidor } from "./ui/Avatar";
import { Dica } from "./ui/Dica";

type Props = {
    servidores: ServidorResumo[];
    atualId: string | null;
    // servidor da chamada em andamento (ganha um ícone de voz)
    servidorDaChamada: string | null;
    // mensagens não lidas por servidor (o badge +1)
    naoLidos: Record<string, number>;
    onEscolher: (id: string) => void;
    onAdicionar: () => void;
};

// coluna da esquerda: troca de servidor com um clique
export function BarraServidores({ servidores, atualId, servidorDaChamada, naoLidos, onEscolher, onAdicionar }: Props) {
    return (
        <nav className="barra-servidores" aria-label="Servidores">
            <span className="barra-marca" aria-hidden="true">
                <Bird size={20} strokeWidth={1.8} />
            </span>
            <span className="barra-separador" />

            <div className="barra-lista">
                {servidores.map((s) => {
                    const nao = naoLidos[s.id] ?? 0;
                    return (
                        <Dica key={s.id} texto={s.nome} lado="direita">
                            <button
                                className={`barra-item ${s.id === atualId ? "ativo" : ""}`}
                                onClick={() => onEscolher(s.id)}
                                aria-label={nao > 0 ? `${s.nome} (${nao} não lidas)` : s.nome}
                                aria-current={s.id === atualId ? "page" : undefined}
                            >
                                <span className="barra-indicador" />
                                <IconeServidor nome={s.nome} url={s.iconeUrl} tamanho={40} />
                                {s.id === servidorDaChamada && <span className="barra-em-chamada" />}
                                {nao > 0 && <span className="barra-badge">{nao > 99 ? "99+" : nao}</span>}
                            </button>
                        </Dica>
                    );
                })}

                <Dica texto="Adicionar servidor" lado="direita">
                    <button className="barra-item barra-adicionar" onClick={onAdicionar} aria-label="Adicionar servidor">
                        <span className="icone-servidor icone-adicionar">
                            <Plus size={20} />
                        </span>
                    </button>
                </Dica>
            </div>
        </nav>
    );
}
