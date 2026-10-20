import { useConnectionState, useIsSpeaking, useParticipants } from "@livekit/components-react";
import { ConnectionState, Track, type Participant } from "livekit-client";
import { HeadphoneOff, MicOff, Video } from "lucide-react";
import type { Usuario } from "../../api";
import { usePerfil } from "../../contexto/Perfil";
import { usePublicando } from "../../hooks/usePublicando";
import type { MapaMembros } from "../../tipos";
import { Avatar } from "../ui/Avatar";

type Props = {
    membros: MapaMembros;
    eu: Usuario;
    surdo: boolean;
    // clicar no "ao vivo" de alguém: abre a chamada assistindo a tela dessa pessoa
    onAssistir: (identity: string) => void;
};

// quem está na sala em que VOCÊ está conectado, direto do LiveKit (tempo real, com quem está falando)
export function PessoasAoVivo({ membros, eu, surdo, onAssistir }: Props) {
    const participantes = useParticipants();
    const estado = useConnectionState();

    if (estado !== ConnectionState.Connected) return null;

    return (
        <ul className="voz-pessoas">
            {participantes.map((p) => (
                <PessoaAoVivo
                    key={p.identity}
                    participante={p}
                    membros={membros}
                    eu={eu}
                    surdo={p.isLocal && surdo}
                    onAssistir={onAssistir}
                />
            ))}
        </ul>
    );
}

type PessoaProps = {
    participante: Participant;
    membros: MapaMembros;
    eu: Usuario;
    surdo: boolean;
    onAssistir: (identity: string) => void;
};

function PessoaAoVivo({ participante, membros, eu, surdo, onAssistir }: PessoaProps) {
    const falando = useIsSpeaking(participante);
    const micMutado = !usePublicando(participante, Track.Source.Microphone);
    const compartilhando = usePublicando(participante, Track.Source.ScreenShare);
    const cameraLigada = usePublicando(participante, Track.Source.Camera);
    // antes de conectar, o participante local ainda não tem identity: usa os seus dados
    const membro = participante.isLocal ? eu : membros.get(participante.identity);
    const nome = membro?.nome ?? participante.name ?? "Convidado";
    const { abrirPerfil } = usePerfil();

    return (
        <li className={falando ? "falando" : ""}>
            <button
                className="voz-pessoa-quem"
                onClick={(e) => abrirPerfil(membro ?? { id: participante.identity, nome, avatarUrl: null }, e.currentTarget)}
                aria-haspopup="dialog"
            >
                <Avatar nome={nome} url={membro?.avatarUrl} tamanho={22} falando={falando} />
                <span className="truncar">{nome}</span>
            </button>
            <span className="voz-pessoa-estado">
                {cameraLigada && <Video size={13} aria-label="Câmera ligada" />}
                {micMutado && <MicOff size={13} aria-label="Microfone desligado" />}
                {surdo && <HeadphoneOff size={13} aria-label="Áudio desligado" />}
                {compartilhando && (
                    <button
                        className="voz-ao-vivo"
                        onClick={() => onAssistir(participante.identity)}
                        title={participante.isLocal ? "Ver o que você está compartilhando" : `Assistir a tela de ${nome}`}
                    >
                        Ao vivo
                    </button>
                )}
            </span>
        </li>
    );
}
