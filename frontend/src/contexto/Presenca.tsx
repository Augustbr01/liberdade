import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { gateway } from "../lib/gateway";

type Presenca = {
    estaOnline: (usuarioId: string) => boolean;
};

const Ctx = createContext<Presenca | null>(null);

type Props = { euId: string; children: ReactNode };

export function PresencaProvider({ euId, children }: Props) {
    const [online, setOnline] = useState(() => new Set<string>());

    useEffect(() => {
        setOnline(new Set());

        const aplicarInicial = (ids: string[]) => setOnline(new Set(ids));

        const parar = gateway.assinar((evento) => {
            if (evento.tipo === "PRESENCA_INICIAL") {
                aplicarInicial(evento.online);
                return;
            }
            if (evento.tipo !== "PRESENCA") return;
            setOnline((prev) => {
                const next = new Set(prev);
                if (evento.status === "ONLINE") next.add(evento.usuarioId);
                else next.delete(evento.usuarioId);
                return next;
            });
        });

        // reconectou: zera até o snapshot novo (evita mostrar quem já saiu)
        const pararReconexao = gateway.aoReconectar(() => setOnline(new Set()));

        return () => {
            parar();
            pararReconexao();
        };
    }, [euId]);

    const estaOnline = useCallback(
        (usuarioId: string) => usuarioId === euId || online.has(usuarioId),
        [euId, online],
    );

    const valor = useMemo(() => ({ estaOnline }), [estaOnline]);

    return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function usePresenca() {
    const ctx = useContext(Ctx);
    if (!ctx) throw new Error("usePresenca fora do PresencaProvider");
    return ctx;
}
