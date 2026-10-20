// Conexão WebSocket única com o /api/gateway. Os hooks se inscrevem aqui em vez
// de ficar perguntando ao servidor (polling). É um singleton de módulo: existe
// uma conexão por aba, compartilhada por todo mundo que chama `assinar`.
import type { EventoGateway, MensagemCliente } from "../tipos";

type Ouvinte = (evento: EventoGateway) => void;

const ouvintes = new Set<Ouvinte>();
const ouvintesReconexao = new Set<() => void>();

let ws: WebSocket | null = null;
let tentativa = 0;
let desligado = true; // começa desligado; conectar() liga ao logar
let reconexao: number | undefined;

function endereco() {
    // http->ws, https->wss, no mesmo host (o proxy repassa /api pro Fastify)
    return `${location.origin.replace(/^http/, "ws")}/api/gateway`;
}

function abrir() {
    if (desligado) return;
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return;

    const atual = new WebSocket(endereco());
    ws = atual;

    atual.onopen = () => {
        tentativa = 0;
        // (re)conectou: avisa quem precisa rebuscar o snapshot (pode ter perdido
        // eventos enquanto a conexão esteve caída)
        ouvintesReconexao.forEach((f) => f());
    };

    atual.onmessage = (e) => {
        let evento: EventoGateway;
        try {
            evento = JSON.parse(e.data);
        } catch {
            return;
        }
        ouvintes.forEach((o) => o(evento));
    };

    atual.onclose = () => {
        if (ws === atual) ws = null;
        if (desligado) return;
        // reconexão com recuo exponencial (1s, 2s, 4s… teto 15s) + um tanto aleatório
        // pra não reconectar todo mundo no mesmo instante depois de uma queda
        const espera = Math.min(1000 * 2 ** tentativa, 15_000) + Math.random() * 500;
        tentativa++;
        reconexao = window.setTimeout(abrir, espera);
    };

    // onerror não precisa de ação: o onclose vem logo depois e cuida da reconexão
}

export const gateway = {
    // chamar ao logar
    conectar() {
        desligado = false;
        abrir();
    },
    // chamar ao deslogar
    desconectar() {
        desligado = true;
        tentativa = 0;
        window.clearTimeout(reconexao);
        ws?.close();
        ws = null;
    },
    // manda uma mensagem pro servidor (só se o socket estiver aberto)
    enviar(dados: MensagemCliente) {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(dados));
    },
    // ouvir todos os eventos; devolve a função que cancela a inscrição
    assinar(o: Ouvinte) {
        ouvintes.add(o);
        return () => {
            ouvintes.delete(o);
        };
    },
    // rodar algo a cada (re)conexão — use pra rebuscar o que pode ter se perdido
    aoReconectar(f: () => void) {
        ouvintesReconexao.add(f);
        return () => {
            ouvintesReconexao.delete(f);
        };
    },
};
