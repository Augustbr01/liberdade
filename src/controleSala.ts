import type { EstadoSala, ModoLuzes, PaletaLed } from "./interface/Evento";

// controle da sala (o "tablet" do mundo 3D): um estado por sala de voz, em memória, no
// mesmo esquema do YouTube junto. Quem está na call manda comandos; todo mundo segue o estado
const salas = new Map<string, EstadoSala>();

export type ComandoSala =
    | { acao: "TV"; modo: "AUTO" | "YOUTUBE" | "MOSAICO" | "DESLIGADA"; alvo: 1 | 2 }
    | { acao: "TV_TELA"; identidade: string; alvo: 1 | 2 }
    | { acao: "VOLUME"; volume: number }
    | { acao: "SURROUND"; ligado: boolean }
    | { acao: "LUZES"; modo: ModoLuzes }
    | { acao: "LED"; paleta?: PaletaLed; ciclo?: boolean; ligado?: boolean };

const MODOS_TV = ["AUTO", "YOUTUBE", "MOSAICO", "DESLIGADA"];
const MODOS_LUZES = ["AUTO", "ACESAS", "APAGADAS"];
const PALETAS = ["NEON", "BRASA", "AURORA", "SAKURA", "MONO"];

// o cliente manda qualquer coisa: só passa o que tem o formato certo
export function lerComandoSala(msg: any): ComandoSala | null {
    // qual TV (a LanHouse tem duas); sem o campo é a primeira
    const alvo: 1 | 2 = msg?.alvo === 2 ? 2 : 1;
    switch (msg?.acao) {
        case "TV":
            return MODOS_TV.includes(msg.modo) ? { acao: "TV", modo: msg.modo, alvo } : null;
        case "TV_TELA":
            return typeof msg.identidade === "string" && msg.identidade.length <= 64 ? { acao: "TV_TELA", identidade: msg.identidade, alvo } : null;
        case "VOLUME":
            return typeof msg.volume === "number" && Number.isFinite(msg.volume) ? { acao: "VOLUME", volume: Math.round(Math.max(0, Math.min(100, msg.volume))) } : null;
        case "SURROUND":
            return typeof msg.ligado === "boolean" ? { acao: "SURROUND", ligado: msg.ligado } : null;
        case "LUZES":
            return MODOS_LUZES.includes(msg.modo) ? { acao: "LUZES", modo: msg.modo } : null;
        case "LED": {
            // muda só o que veio (paleta, ciclo RGB e/ou liga-desliga)
            const cmd: ComandoSala = { acao: "LED" };
            if (msg.paleta !== undefined) {
                if (!PALETAS.includes(msg.paleta)) return null;
                cmd.paleta = msg.paleta;
            }
            if (msg.ciclo !== undefined) {
                if (typeof msg.ciclo !== "boolean") return null;
                cmd.ciclo = msg.ciclo;
            }
            if (msg.ligado !== undefined) {
                if (typeof msg.ligado !== "boolean") return null;
                cmd.ligado = msg.ligado;
            }
            return cmd;
        }
        default:
            return null;
    }
}

function padrao(canalId: string): EstadoSala {
    return { canalId, tv: { modo: "AUTO", identidade: null }, tv2: { modo: "AUTO", identidade: null }, volume: 80, surround: true, luzes: "AUTO", led: { paleta: null, ciclo: false, ligado: true }, ultima: null };
}

export function estadoSala(canalId: string) {
    return salas.get(canalId) ?? padrao(canalId);
}

export function aplicarComandoSala(canalId: string, usuarioId: string, cmd: ComandoSala): EstadoSala {
    const e = salas.get(canalId) ?? padrao(canalId);
    if (cmd.acao === "TV") e[cmd.alvo === 2 ? "tv2" : "tv"] = { modo: cmd.modo, identidade: null };
    if (cmd.acao === "TV_TELA") e[cmd.alvo === 2 ? "tv2" : "tv"] = { modo: "TELA", identidade: cmd.identidade };
    if (cmd.acao === "VOLUME") e.volume = cmd.volume;
    if (cmd.acao === "SURROUND") e.surround = cmd.ligado;
    if (cmd.acao === "LUZES") e.luzes = cmd.modo;
    if (cmd.acao === "LED") {
        if (cmd.paleta) e.led.paleta = cmd.paleta;
        if (cmd.ciclo !== undefined) e.led.ciclo = cmd.ciclo;
        if (cmd.ligado !== undefined) e.led.ligado = cmd.ligado;
    }
    e.ultima = { usuarioId, acao: cmd.acao };
    salas.set(canalId, e);
    return e;
}

// a call esvaziou ou a sala foi apagada. Devolve true se tinha algo pra limpar
export function limparSala(canalId: string) {
    return salas.delete(canalId);
}
