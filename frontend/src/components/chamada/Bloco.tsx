import { useCallback, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
    VideoTrack, isTrackReference, useConnectionQualityIndicator, useIsMuted, useIsSpeaking,
    type TrackReferenceOrPlaceholder,
} from "@livekit/components-react";
import { ConnectionQuality, Track } from "livekit-client";
import {
    Eye, EyeOff, Loader2, Maximize2, MicOff, Minimize2, MonitorUp, Pin, PinOff, Volume1, Volume2, VolumeX, WifiOff,
} from "lucide-react";
import type { Usuario } from "../../api";
import { useControleVoz, type TipoVolume } from "../../contexto/ControleVoz";
import { useCliqueFora } from "../../hooks/useCliqueFora";
import { usePublicando } from "../../hooks/usePublicando";
import { avatarReal } from "../../lib/util";
import type { MapaMembros } from "../../tipos";
import { Avatar } from "../ui/Avatar";
import { Dica } from "../ui/Dica";

// grade: todos do mesmo tamanho; destaque: o quadro grande; miniatura: a faixa ao lado do destaque
export type ModoBloco = "grade" | "destaque" | "miniatura";

type Props = {
    trackRef: TrackReferenceOrPlaceholder;
    membros: MapaMembros;
    eu: Usuario;
    modo: ModoBloco;
    // na grade: largura calculada pra todo mundo caber
    largura?: number;
    // grade e miniatura: clicar no quadro (ou no alfinete) põe ele em destaque
    onFocar?: () => void;
    // destaque: volta pra grade
    onDesfocar?: () => void;
    onTelaCheia?: () => void;
    emTelaCheia?: boolean;
    // botões a mais na barra do quadro (ex.: esconder a faixa)
    extras?: ReactNode;
};

// um quadro da chamada: vídeo da câmera/tela ou o avatar da pessoa
export function Bloco({ trackRef, membros, eu, modo, largura, onFocar, onDesfocar, onTelaCheia, emTelaCheia, extras }: Props) {
    const participante = trackRef.participant;
    const falando = useIsSpeaking(participante);
    const videoMutado = useIsMuted(trackRef);
    const micMutado = !usePublicando(participante, Track.Source.Microphone);
    // a tela só tem volume próprio se veio com áudio (aba com som, sistema)
    const semAudioNaTela = !usePublicando(participante, Track.Source.ScreenShareAudio);
    const { quality } = useConnectionQualityIndicator({ participant: participante });
    const { volumeDe } = useControleVoz();
    // a sua tela fica escondida por padrão: se for a tela inteira, a prévia se repete dentro dela
    const [previa, setPrevia] = useState(false);

    // antes de conectar, o participante local ainda não tem identity: usa os seus dados
    const local = participante.isLocal;
    const membro = local ? eu : membros.get(participante.identity);
    const nome = membro?.nome ?? participante.name ?? "Convidado";
    const ehTela = trackRef.source === Track.Source.ScreenShare;
    const minhaTela = ehTela && local;
    const temVideo = isTrackReference(trackRef) && !videoMutado;
    const mostrarVideo = temVideo && (!minhaTela || previa);
    // publicado, mas o vídeo ainda não chegou (acabou de começar ou trocou de qualidade)
    const carregando = mostrarVideo && isTrackReference(trackRef) && !trackRef.publication.track;
    const fundo = avatarReal(membro?.avatarUrl);

    const tipoVolume: TipoVolume | null = local ? null : ehTela ? (semAudioNaTela ? null : "tela") : "voz";
    const silenciadoPorVoce = !local && !ehTela && volumeDe(participante.identity, "voz") === 0;

    const clicavel = modo !== "destaque" && !!onFocar;
    const rotulo = ehTela ? (local ? "Sua tela" : `Tela de ${nome}`) : nome;

    return (
        <div
            className={[
                "bloco",
                `bloco-${modo}`,
                falando && !ehTela ? "falando" : "",
                ehTela ? "bloco-tela" : "",
                clicavel ? "clicavel" : "",
            ].join(" ")}
            style={largura ? { width: largura } : undefined}
            onClick={clicavel ? onFocar : undefined}
        >
            {/* a mídia fica numa camada que corta nos cantos; o quadro em si não corta,
                pra o painel de volume poder sair dele em quadros pequenos */}
            <div className="bloco-midia">
                {mostrarVideo ? (
                    <VideoTrack trackRef={trackRef} className={local && !ehTela ? "espelhado" : ""} />
                ) : minhaTela ? (
                    <div className="bloco-aviso">
                        <MonitorUp size={modo === "miniatura" ? 20 : 28} />
                        <strong>Você está compartilhando</strong>
                        {modo !== "miniatura" && <span>Os outros estão vendo o que você escolheu mostrar.</span>}
                    </div>
                ) : (
                    <div className="bloco-sem-video">
                        {fundo && <span className="bloco-fundo" style={{ backgroundImage: `url(${JSON.stringify(fundo)})` }} />}
                        <Avatar nome={nome} url={membro?.avatarUrl} tamanho="auto" falando={falando} className="bloco-avatar" />
                    </div>
                )}

                {carregando && (
                    <span className="bloco-carregando" aria-label="Carregando">
                        <Loader2 size={22} className="girar" />
                    </span>
                )}
            </div>

            {ehTela && <span className="bloco-ao-vivo">Ao vivo</span>}

            {modo !== "miniatura" && (
                // cliques aqui não podem chegar no quadro (que põe em destaque / tela cheia)
                <div className="bloco-acoes" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                    {minhaTela && (
                        <AcaoBloco dica={previa ? "Esconder a prévia" : "Ver a prévia"} onClick={() => setPrevia((v) => !v)}>
                            {previa ? <EyeOff size={16} /> : <Eye size={16} />}
                        </AcaoBloco>
                    )}
                    {tipoVolume && <ControleVolume usuarioId={participante.identity} tipo={tipoVolume} nome={nome} />}
                    {modo === "grade" && onFocar && (
                        <AcaoBloco dica="Destacar" onClick={onFocar}>
                            <Pin size={16} />
                        </AcaoBloco>
                    )}
                    {modo === "destaque" && onDesfocar && !emTelaCheia && (
                        <AcaoBloco dica="Voltar para a grade" onClick={onDesfocar}>
                            <PinOff size={16} />
                        </AcaoBloco>
                    )}
                    {onTelaCheia && (
                        <AcaoBloco dica={emTelaCheia ? "Sair da tela cheia (F)" : "Tela cheia (F)"} onClick={onTelaCheia}>
                            {emTelaCheia ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                        </AcaoBloco>
                    )}
                    {extras}
                </div>
            )}

            <div className="bloco-rotulo">
                {ehTela ? <MonitorUp size={14} /> : micMutado && <MicOff size={14} className="bloco-mudo" />}
                <span className="truncar">{rotulo}</span>
                {silenciadoPorVoce && <VolumeX size={13} className="bloco-mudo" aria-label="Silenciado por você" />}
                {quality === ConnectionQuality.Poor && <WifiOff size={13} className="bloco-sinal" aria-label="Conexão instável" />}
            </div>
        </div>
    );
}

type AcaoProps = { dica: string; ativo?: boolean; onClick: () => void; children: ReactNode };

export function AcaoBloco({ dica, ativo, onClick, children }: AcaoProps) {
    return (
        <Dica texto={dica} lado="baixo">
            <button className={`bloco-acao ${ativo ? "ativo" : ""}`} onClick={onClick} aria-label={dica} aria-pressed={ativo}>
                {children}
            </button>
        </Dica>
    );
}

type VolumeProps = { usuarioId: string; tipo: TipoVolume; nome: string };

// volume só pra você: da voz de alguém ou do áudio da tela que ele compartilha
function ControleVolume({ usuarioId, tipo, nome }: VolumeProps) {
    const { volumeDe, definirVolume } = useControleVoz();
    const [aberto, setAberto] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const fechar = useCallback(() => setAberto(false), []);
    useCliqueFora(ref, aberto, fechar);

    const volume = volumeDe(usuarioId, tipo);
    const porcento = Math.round(volume * 100);
    const Icone = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

    return (
        <div className="bloco-volume" ref={ref}>
            <AcaoBloco dica={tipo === "tela" ? "Volume da transmissão" : `Volume de ${nome}`} ativo={aberto} onClick={() => setAberto((v) => !v)}>
                <Icone size={16} />
            </AcaoBloco>
            {aberto && (
                <div className="bloco-volume-painel">
                    <span className="rotulo">{tipo === "tela" ? "Áudio da transmissão" : `Volume de ${nome}`}</span>
                    <div className="bloco-volume-linha">
                        <input
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            value={porcento}
                            onChange={(e) => definirVolume(usuarioId, tipo, Number(e.target.value) / 100)}
                            aria-label="Volume"
                            style={{ "--preenchido": `${porcento}%` } as CSSProperties}
                        />
                        <span className="bloco-volume-valor">{porcento}%</span>
                    </div>
                    <button className="bloco-volume-silenciar" onClick={() => definirVolume(usuarioId, tipo, volume === 0 ? 1 : 0)}>
                        {volume === 0 ? <Volume2 size={14} /> : <VolumeX size={14} />}
                        {volume === 0 ? "Voltar a ouvir" : "Silenciar só pra mim"}
                    </button>
                </div>
            )}
        </div>
    );
}
