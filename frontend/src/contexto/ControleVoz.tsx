import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
    RoomAudioRenderer, useConnectionState, useLocalParticipant, useRemoteParticipants, useTrackToggle,
} from "@livekit/components-react";
import { ConnectionState, ScreenSharePresets, Track, type VideoPreset } from "livekit-client";
import { lerArmazenado, salvarArmazenado } from "../lib/util";
import { useToast } from "./Toasts";

// ---------- compartilhamento de tela ----------

export type QualidadeTela = "texto" | "video" | "maxima";

type Perfil = {
    titulo: string;
    detalhe: string;
    preset: VideoPreset;
    // diz pro navegador o que priorizar quando a rede aperta
    dica: "detail" | "motion";
    degradacao: RTCDegradationPreference;
};

export const QUALIDADES_TELA: Record<QualidadeTela, Perfil> = {
    texto: {
        titulo: "Texto e código",
        detalhe: "1080p · 15 fps · mais nítido",
        preset: ScreenSharePresets.h1080fps15,
        dica: "detail",
        degradacao: "maintain-resolution",
    },
    video: {
        titulo: "Vídeo e jogos",
        detalhe: "720p · 30 fps · mais fluido",
        preset: ScreenSharePresets.h720fps30,
        dica: "motion",
        degradacao: "maintain-framerate",
    },
    maxima: {
        titulo: "Máxima",
        detalhe: "1080p · 30 fps · precisa de internet boa",
        preset: ScreenSharePresets.h1080fps30,
        dica: "motion",
        degradacao: "balanced",
    },
};

type PreferenciasTela = { qualidade: QualidadeTela; audio: boolean };

const CHAVE_TELA = "liberdade:tela";
const CHAVE_VOLUMES = "liberdade:volumes";

// celular e alguns navegadores não têm getDisplayMedia
const TELA_SUPORTADA = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;

// ---------- volume por pessoa ----------

export type TipoVolume = "voz" | "tela";
// 0 a 1 por pessoa (id do usuário = identity no LiveKit); ausente = 100%
type Volumes = Record<string, Partial<Record<TipoVolume, number>>>;

// o LiveKit só reaplica o volume num áudio que reconecta se ele for "verdadeiro"
// (`if (this.elementVolume)`), então 0 voltaria a tocar alto. Um valor inaudível resolve
const volumeReal = (v: number) => (v <= 0 ? 0.0001 : Math.min(v, 1));

type ControleVoz = {
    conectado: boolean;
    micLigado: boolean;
    micPendente: boolean;
    alternarMic: () => void;
    surdo: boolean;
    alternarSurdo: () => void;
    camera: { ligada: boolean; pendente: boolean; alternar: () => void };
    tela: {
        ativa: boolean;
        pendente: boolean;
        suportada: boolean;
        qualidade: QualidadeTela;
        comAudio: boolean;
        definirQualidade: (qualidade: QualidadeTela) => void;
        definirAudio: (ligado: boolean) => void;
        alternar: () => void;
        // escolher outra tela/janela sem sair do compartilhamento
        trocar: () => void;
    };
    volumeDe: (usuarioId: string, tipo: TipoVolume) => number;
    definirVolume: (usuarioId: string, tipo: TipoVolume, valor: number) => void;
};

const Ctx = createContext<ControleVoz | null>(null);

type Props = {
    // preferências guardadas no App (sobrevivem a trocar de sala)
    micPreferido: boolean;
    setMicPreferido: (ligado: boolean) => void;
    surdo: boolean;
    setSurdo: (surdo: boolean) => void;
    children: ReactNode;
};

// microfone e "áudio desligado" funcionam dentro e fora da chamada:
// fora dela viram preferência (você entra já mutado), dentro dela agem na hora.
// Câmera, tela e volumes ficam aqui também, pra barra da chamada e o painel lateral
// mostrarem o mesmo estado. Os avisos de falha de câmera/microfone saem do
// onMediaDeviceFailure do LiveKitRoom (no App), por isso os toggles aqui só engolem o erro
export function ControleVozProvider({ micPreferido, setMicPreferido, surdo, setSurdo, children }: Props) {
    const toast = useToast();
    const estado = useConnectionState();
    const conectado = estado === ConnectionState.Connected;
    const { localParticipant, isScreenShareEnabled } = useLocalParticipant();

    // ---------- microfone e áudio ----------

    const mic = useTrackToggle({ source: Track.Source.Microphone, onDeviceError: () => setMicPreferido(false) });

    const micLigado = conectado ? mic.enabled : micPreferido;
    const micAntesDeSurdo = useRef(micLigado);
    const alternarFaixa = mic.toggle;

    const definirMic = useCallback((ligar: boolean) => {
        setMicPreferido(ligar);
        if (conectado) alternarFaixa(ligar);
    }, [conectado, alternarFaixa, setMicPreferido]);

    const alternarMic = useCallback(() => {
        // ligar o microfone também volta a ouvir a sala
        if (!micLigado && surdo) setSurdo(false);
        definirMic(!micLigado);
    }, [micLigado, surdo, setSurdo, definirMic]);

    const alternarSurdo = useCallback(() => {
        if (surdo) {
            setSurdo(false);
            if (micAntesDeSurdo.current) definirMic(true);
        } else {
            // quem desliga o áudio também fica mudo, e o microfone volta ao religar
            micAntesDeSurdo.current = micLigado;
            setSurdo(true);
            if (micLigado) definirMic(false);
        }
    }, [surdo, micLigado, setSurdo, definirMic]);

    // ---------- câmera ----------

    const cameraToggle = useTrackToggle({ source: Track.Source.Camera, onDeviceError: () => {} });
    const alternarCamera = cameraToggle.toggle;
    const camera = useMemo(() => ({
        ligada: cameraToggle.enabled,
        pendente: cameraToggle.pending,
        alternar: () => void alternarCamera(),
    }), [cameraToggle.enabled, cameraToggle.pending, alternarCamera]);

    // ---------- tela ----------

    const [prefsTela, setPrefsTela] = useState<PreferenciasTela>(() =>
        lerArmazenado<PreferenciasTela>(CHAVE_TELA, { qualidade: "texto", audio: true }),
    );
    const [telaPendente, setTelaPendente] = useState(false);

    const atualizarPrefsTela = useCallback((mudanca: Partial<PreferenciasTela>) => {
        setPrefsTela((atual) => {
            const novo = { ...atual, ...mudanca };
            salvarArmazenado(CHAVE_TELA, novo);
            return novo;
        });
    }, []);

    const iniciarTela = useCallback(async () => {
        const perfil = QUALIDADES_TELA[prefsTela.qualidade] ?? QUALIDADES_TELA.texto;
        setTelaPendente(true);
        try {
            await localParticipant.setScreenShareEnabled(
                true,
                {
                    audio: prefsTela.audio,
                    systemAudio: prefsTela.audio ? "include" : "exclude",
                    resolution: perfil.preset.resolution,
                    contentHint: perfil.dica,
                    // não oferece a própria aba do Liberdade (viraria um túnel infinito)
                    selfBrowserSurface: "exclude",
                    // o Chrome mostra "compartilhar esta aba" pra trocar de aba sem parar
                    surfaceSwitching: "include",
                },
                { screenShareEncoding: perfil.preset.encoding, degradationPreference: perfil.degradacao },
            );
        } catch (err) {
            const nome = err instanceof Error ? err.name : "";
            const texto = err instanceof Error ? err.message : "";
            // bloqueado pelo sistema (macOS sem permissão de gravação de tela)
            if (nome === "NotAllowedError" && /system/i.test(texto)) {
                toast.erro("O sistema bloqueou a captura de tela. Libere o navegador nas permissões de gravação de tela.");
            } else if (nome === "DeviceUnsupportedError") {
                toast.erro("Seu navegador não permite compartilhar a tela.");
            } else if (nome !== "NotAllowedError" && nome !== "AbortError") {
                // NotAllowedError/AbortError comuns = você fechou a janela de escolha: não é erro
                toast.erro("Não consegui compartilhar a tela.");
            }
        } finally {
            setTelaPendente(false);
        }
    }, [localParticipant, prefsTela, toast]);

    const pararTela = useCallback(async () => {
        setTelaPendente(true);
        try {
            await localParticipant.setScreenShareEnabled(false);
        } finally {
            setTelaPendente(false);
        }
    }, [localParticipant]);

    const tela = useMemo<ControleVoz["tela"]>(() => ({
        ativa: isScreenShareEnabled,
        pendente: telaPendente,
        suportada: TELA_SUPORTADA,
        qualidade: prefsTela.qualidade,
        comAudio: prefsTela.audio,
        definirQualidade: (qualidade) => atualizarPrefsTela({ qualidade }),
        definirAudio: (audio) => atualizarPrefsTela({ audio }),
        alternar: () => void (isScreenShareEnabled ? pararTela() : iniciarTela()),
        // a janela de escolha precisa nascer do clique: para e já pede de novo
        trocar: () => void pararTela().then(iniciarTela),
    }), [isScreenShareEnabled, telaPendente, prefsTela, atualizarPrefsTela, pararTela, iniciarTela]);

    // ---------- volume por pessoa ----------

    const [volumes, setVolumes] = useState<Volumes>(() => lerArmazenado<Volumes>(CHAVE_VOLUMES, {}));
    const remotos = useRemoteParticipants();

    // aplica em quem está na sala; o LiveKit guarda por fonte e reaplica quando o áudio
    // (re)conecta, então quem chega depois ou volta a compartilhar já vem no volume certo
    useEffect(() => {
        for (const p of remotos) {
            const v = volumes[p.identity];
            p.setVolume(volumeReal(v?.voz ?? 1), Track.Source.Microphone);
            p.setVolume(volumeReal(v?.tela ?? 1), Track.Source.ScreenShareAudio);
        }
    }, [remotos, volumes]);

    const volumeDe = useCallback((usuarioId: string, tipo: TipoVolume) => volumes[usuarioId]?.[tipo] ?? 1, [volumes]);

    const definirVolume = useCallback((usuarioId: string, tipo: TipoVolume, valor: number) => {
        setVolumes((atual) => {
            const novo = { ...atual, [usuarioId]: { ...atual[usuarioId], [tipo]: valor } };
            salvarArmazenado(CHAVE_VOLUMES, novo);
            return novo;
        });
    }, []);

    const valor = useMemo<ControleVoz>(() => ({
        conectado,
        micLigado,
        micPendente: conectado && mic.pending,
        alternarMic,
        surdo,
        alternarSurdo,
        camera,
        tela,
        volumeDe,
        definirVolume,
    }), [conectado, micLigado, mic.pending, alternarMic, surdo, alternarSurdo, camera, tela, volumeDe, definirVolume]);

    return (
        <Ctx.Provider value={valor}>
            <RoomAudioRenderer muted={surdo} />
            {children}
        </Ctx.Provider>
    );
}

export function useControleVoz() {
    const valor = useContext(Ctx);
    if (!valor) throw new Error("useControleVoz precisa estar dentro do ControleVozProvider");
    return valor;
}
