import { useCallback, useSyncExternalStore } from "react";
import { ParticipantEvent, type Participant, type Track } from "livekit-client";

// tudo que pode ligar ou desligar uma fonte (tela, câmera, microfone) de alguém
const EVENTOS = [
    ParticipantEvent.TrackPublished,
    ParticipantEvent.TrackUnpublished,
    ParticipantEvent.TrackSubscribed,
    ParticipantEvent.TrackUnsubscribed,
    ParticipantEvent.TrackMuted,
    ParticipantEvent.TrackUnmuted,
    ParticipantEvent.LocalTrackPublished,
    ParticipantEvent.LocalTrackUnpublished,
] as const;

// se a pessoa está mandando essa fonte agora (publicada e não mutada).
// Substitui o useIsMuted do LiveKit nesses casos: ele não ouve o TrackUnpublished de quem
// é remoto, e quando alguém parava de compartilhar a tela continuava "ao vivo" pros outros
export function usePublicando(participante: Participant, fonte: Track.Source) {
    const assinar = useCallback((avisar: () => void) => {
        for (const evento of EVENTOS) participante.on(evento, avisar);
        return () => {
            for (const evento of EVENTOS) participante.off(evento, avisar);
        };
    }, [participante]);

    return useSyncExternalStore(assinar, () => {
        const publicacao = participante.getTrackPublication(fonte);
        return !!publicacao && !publicacao.isMuted;
    });
}
