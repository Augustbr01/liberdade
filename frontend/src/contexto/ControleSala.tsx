import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { TrackReference } from "@livekit/components-react";
import { Track } from "livekit-client";
import { gateway } from "../lib/gateway";
import type { ComandoSala, EstadoSala, EstadoYoutube } from "../tipos";
import { useToast } from "./Toasts";

type ControleSala = {
    // null = fora de call, ou o estado ainda não chegou
    estado: EstadoSala | null;
    enviar: (comando: ComandoSala) => void;
};

const Ctx = createContext<ControleSala | null>(null);

// controle da sala da call atual (o "tablet" do mundo 3D, que também vale no modo clássico).
// Mesmo esquema do YouTube junto: o estado chega pelo gateway e quem está na call muda
export function ControleSalaProvider({ canalId, children }: { canalId: string | null; children: ReactNode }) {
    const toast = useToast();
    const [estado, setEstado] = useState<EstadoSala | null>(null);

    useEffect(() => {
        setEstado(null);
        if (!canalId) return;

        const pedir = () => gateway.enviar({ tipo: "SALA_PEDIR", canalId });
        pedir();
        const pararReconexao = gateway.aoReconectar(pedir);
        const pararEventos = gateway.assinar((evento) => {
            if (evento.tipo === "SALA_ESTADO" && evento.estado.canalId === canalId) setEstado(evento.estado);
            if (evento.tipo === "SALA_ERRO" && evento.canalId === canalId) toast.erro(evento.mensagem);
        });

        return () => {
            pararReconexao();
            pararEventos();
        };
    }, [canalId, toast]);

    const enviar = useCallback((comando: ComandoSala) => {
        if (canalId) gateway.enviar({ tipo: "SALA_COMANDO", canalId, ...comando });
    }, [canalId]);

    const valor = useMemo<ControleSala>(() => ({ estado, enviar }), [estado, enviar]);
    return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useControleSala() {
    const valor = useContext(Ctx);
    if (!valor) throw new Error("useControleSala precisa estar dentro do ControleSalaProvider");
    return valor;
}

export type FonteTV = { tipo: "youtube" } | { tipo: "tela"; tela: TrackReference } | { tipo: "mosaico"; telas: TrackReference[] } | { tipo: "nada" };

// o que aparece na TV da sala (e no destaque do modo clássico), pelo que escolheram no tablet.
// Se a escolha não existe mais (a pessoa parou de compartilhar, o vídeo acabou), volta pro automático
export function fonteDaTV(sala: EstadoSala | null, youtube: EstadoYoutube | null, telas: TrackReference[], alvo: 1 | 2 = 1): FonteTV {
    const temYoutube = !!youtube?.video;
    const telaDe = (id: string | null) => telas.find((t) => t.participant.identity === id && t.source === Track.Source.ScreenShare);
    // alvo 2 = a segunda TV da LanHouse (sem estado dela ainda, é automática)
    const tv = (alvo === 2 ? sala?.tv2 : sala?.tv) ?? { modo: "AUTO" as const, identidade: null };
    const modo = tv.modo;

    if (modo === "DESLIGADA") return { tipo: "nada" };
    // mosaico com uma tela só é a tela inteira; sem nenhuma, cai no automático
    if (modo === "MOSAICO") {
        const todas = telas.filter((t) => t.source === Track.Source.ScreenShare);
        if (todas.length > 1) return { tipo: "mosaico", telas: todas };
        if (todas[0]) return { tipo: "tela", tela: todas[0] };
    }
    if (modo === "YOUTUBE" && temYoutube) return { tipo: "youtube" };
    if (modo === "TELA") {
        const tela = telaDe(tv.identidade);
        if (tela) return { tipo: "tela", tela };
    }
    if (temYoutube) return { tipo: "youtube" };
    return telas[0] ? { tipo: "tela", tela: telas[0] } : { tipo: "nada" };
}
