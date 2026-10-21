import {WebSocket} from "ws"
import {Status, type Evento} from "../interface/Evento"
import { prisma } from "../../lib/prisma";
import { avisarPresenca, buscarMembrosServidor, buscarServidoresUsuario} from "./eventosPresenca";
const conexoes = new Map<string,Set<WebSocket>>();
const vivos = new WeakMap<WebSocket,boolean>();
const online = new Set<string>();
const timersOffline = new Map<string, NodeJS.Timeout>();
export function conectar(usuarioId: string, ws:WebSocket) {
    const set = conexoes.get(usuarioId) ?? new Set<WebSocket>();

    set.add(ws);
    conexoes.set(usuarioId,set);

    const timer = timersOffline.get(usuarioId);

    if(timer) {
        clearTimeout(timer);
        timersOffline.delete(usuarioId);
    }

    const eraOnline = online.has(usuarioId);
    if (!eraOnline) {
        online.add(usuarioId);
        void avisarPresenca(usuarioId, Status.ONLINE);
    }

    return () => {
        set.delete(ws);
        if(set.size === 0 && conexoes.get(usuarioId) === set) {
            conexoes.delete(usuarioId);
            const antigo = timersOffline.get(usuarioId);

            if(antigo) {
                clearTimeout(antigo);
            }
            timersOffline.set(usuarioId, setTimeout(() => {
                timersOffline.delete(usuarioId);
                if(conexoes.has(usuarioId)) return;
                online.delete(usuarioId);
                avisarPresenca(usuarioId,Status.OFFLINE);
            },5000))
        }
    }
}

let intervalo : NodeJS.Timeout | undefined;

export function iniciarHeartbeat() {
    intervalo = setInterval(() => {
        for(const set of conexoes.values()) {
            for(const element of set) {
                if(vivos.get(element) === false) {
                    element.terminate();
                } else {
                    vivos.set(element,false);
                    if(element.readyState === WebSocket.OPEN) {
                        element.ping();
                    }
                }
            }
        }
    }, 30000);
}

export function pararHeartbeat() {
    if(intervalo) {
        clearInterval(intervalo);
    }
}

export function marcarVivo(ws : WebSocket) {
    vivos.set(ws,true);
}

export async function enviarSnapshot(usuarioId: string,ws: WebSocket) {
    const servidores = await buscarServidoresUsuario(usuarioId);

    const listas = await Promise.all([...servidores].map((e) => buscarMembrosServidor(e)));

    const onlines = new Set<String>();

    for(const membros of listas) {
        for(const id of membros) {
            if(online.has(id)) {
                onlines.add(id);
            }
        }
    }

    onlines.delete(usuarioId);

    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ tipo: "PRESENCA_INICIAL", online: [...onlines] }));
    }
}

export async function publicarParaUsuarios(ids : string[], evento: Evento) {
    const msg = JSON.stringify(evento);

    for(const id of ids) {
        conexoes.get(id)?.forEach((ws) => {
            if (ws.readyState === WebSocket.OPEN) ws.send(msg);
        })
    }
}

export async function publicarParaServidor(servidorId: string, evento : Evento) {
    const entidades = await prisma.usuarioServidor.findMany({where: {servidorId:servidorId},select: {usuarioId:true}});

    publicarParaUsuarios(entidades.map((e) => e.usuarioId),evento);
}