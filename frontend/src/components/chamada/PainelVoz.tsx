import { useConnectionState } from "@livekit/components-react";
import { ConnectionState } from "livekit-client";
import { MonitorUp, MonitorX, PhoneOff, Signal, Video, VideoOff } from "lucide-react";
import { useControleVoz } from "../../contexto/ControleVoz";
import { useAgora } from "../../hooks/useAgora";
import { cronometro } from "../../lib/util";
import type { Voz } from "../../tipos";
import { Dica } from "../ui/Dica";

type Props = { voz: Voz; onAbrir: () => void; onSair: () => void };

// fica no rodapé da lista de canais enquanto você está numa sala
export function PainelVoz({ voz, onAbrir, onSair }: Props) {
    const estado = useConnectionState();
    // mesmo estado da barra da chamada (e a tela usa a qualidade escolhida lá)
    const { camera, tela } = useControleVoz();
    const agora = useAgora();

    const conectado = estado === ConnectionState.Connected;
    const status = conectado
        ? "Voz conectada"
        : estado === ConnectionState.Reconnecting ? "Reconectando…" : "Conectando…";

    return (
        <div className={`painel-voz ${conectado ? "" : "esperando"}`}>
            <div className="painel-voz-topo">
                <span className="painel-voz-sinal"><Signal size={16} /></span>
                <button className="painel-voz-info" onClick={onAbrir} title="Abrir a sala">
                    <strong>{status}</strong>
                    <span className="truncar">{voz.canal.nome} · {voz.servidorNome}</span>
                </button>
                <span className="painel-voz-tempo">{conectado ? cronometro(agora - (voz.inicioSala ? Date.parse(voz.inicioSala) : voz.desde)) : ""}</span>
                <Dica texto="Desconectar">
                    <button className="botao-icone botao-icone-perigo" onClick={onSair} aria-label="Desconectar">
                        <PhoneOff size={17} />
                    </button>
                </Dica>
            </div>

            <div className="painel-voz-acoes">
                <button
                    className={`painel-voz-botao ${camera.ligada ? "ligado" : ""}`}
                    onClick={camera.alternar}
                    disabled={!conectado || camera.pendente}
                >
                    {camera.ligada ? <Video size={16} /> : <VideoOff size={16} />}
                    Câmera
                </button>
                {/* sem compartilhamento de tela no navegador (celular): a câmera fica com a linha toda */}
                {tela.suportada && (
                    <button
                        className={`painel-voz-botao ${tela.ativa ? "ligado" : ""}`}
                        onClick={tela.alternar}
                        disabled={!conectado || tela.pendente}
                    >
                        {tela.ativa ? <MonitorX size={16} /> : <MonitorUp size={16} />}
                        {tela.ativa ? "Parar" : "Tela"}
                    </button>
                )}
            </div>
        </div>
    );
}
