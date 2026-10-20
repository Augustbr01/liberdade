import { useEffect, useRef } from "react";
import type { Usuario } from "../api";
import { gateway } from "../lib/gateway";
import { somVoz } from "../lib/som";
import type { Voz } from "../tipos";

// toca um som quando alguém entra/sai da call em que VOCÊ está (menos você mesmo)
export function useSonsDeVoz(voz: Voz | null, eu: Usuario | null | undefined) {
    // a call atual num ref: o ouvinte lê sempre a atual sem re-assinar a cada troca
    const vozRef = useRef(voz);
    useEffect(() => {
        vozRef.current = voz;
    }, [voz]);

    const euId = eu?.id;
    useEffect(() => {
        if (!euId) return;
        return gateway.assinar((evento) => {
            if (evento.tipo !== "ENTROU_NA_CALL" && evento.tipo !== "SAIU_DA_CALL") return;
            const v = vozRef.current;
            if (!v || evento.canalId !== v.canal.id) return; // só na call em que estou
            if (evento.usuarioId === euId) return;           // não toca pro meu próprio evento
            somVoz(evento.tipo === "ENTROU_NA_CALL" ? "entrada" : "saida");
        });
    }, [euId]);
}
