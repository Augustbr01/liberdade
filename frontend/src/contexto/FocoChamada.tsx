import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Track } from "livekit-client";

// identifica um quadro da chamada: a câmera ou a tela de alguém
export const chaveBloco = (identity: string, source: Track.Source) => `${identity}:${source}`;
export const chaveTela = (identity: string) => chaveBloco(identity, Track.Source.ScreenShare);

// null = automático (a tela mais recente de outra pessoa vira destaque sozinha)
// { chave: "..." } = você fixou esse quadro
// { chave: null } = você escolheu ver a grade
export type EscolhaFoco = { chave: string | null } | null;

type FocoChamada = {
    escolha: EscolhaFoco;
    focar: (chave: string) => void;
    // pra quando você ainda vai entrar na sala ("ao vivo" de uma sala em que você não está):
    // o destaque zera a cada chamada nova, então fica guardado e vale na próxima
    focarAoEntrar: (chave: string) => void;
    verGrade: () => void;
    automatico: () => void;
};

const Ctx = createContext<FocoChamada | null>(null);

// fica acima das telas: o destaque sobrevive a sair e voltar pra sala, e a lista de
// canais consegue mandar "assistir a tela de fulano". Zera a cada chamada nova (desde)
export function FocoChamadaProvider({ desde, children }: { desde: number | null; children: ReactNode }) {
    const [escolha, setEscolha] = useState<EscolhaFoco>(null);
    const aoEntrar = useRef<string | null>(null);

    useEffect(() => {
        setEscolha(aoEntrar.current ? { chave: aoEntrar.current } : null);
        aoEntrar.current = null;
    }, [desde]);

    const focar = useCallback((chave: string) => setEscolha({ chave }), []);
    const focarAoEntrar = useCallback((chave: string) => {
        aoEntrar.current = chave;
    }, []);
    const verGrade = useCallback(() => setEscolha({ chave: null }), []);
    const automatico = useCallback(() => setEscolha(null), []);

    const valor = useMemo(
        () => ({ escolha, focar, focarAoEntrar, verGrade, automatico }),
        [escolha, focar, focarAoEntrar, verGrade, automatico],
    );

    return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useFocoChamada() {
    const valor = useContext(Ctx);
    if (!valor) throw new Error("useFocoChamada precisa estar dentro do FocoChamadaProvider");
    return valor;
}
