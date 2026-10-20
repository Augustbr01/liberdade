import {WebSocket} from "ws"
import {Status, type Evento} from "../interface/Evento"
import { prisma } from "../../lib/prisma";
const conexoes = new Map<string,Set<WebSocket>>();
const vivos = new WeakMap<WebSocket,boolean>();
export function conectar(usuarioId: string, ws:WebSocket) {
    const set = conexoes.get(usuarioId) ?? new Set<WebSocket>();

    set.add(ws);

    conexoes.set(usuarioId,set);

    return () => {
        set.delete(ws);
        if(set.size === 0 && conexoes.get(usuarioId) === set) conexoes.delete(usuarioId);
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

async function avisarPresenca(usuarioId : string,status : Status) {
    try {
        const entidades = await prisma.usuarioServidor.findMany({where: {servidor: {membros: {some: {usuarioId:usuarioId}}}},select:{usuarioId:true}});

        const ids = [...new Set(entidades.map((l) => l.usuarioId))];

        await publicarParaUsuarios(ids,{tipo:"PRESENCA",usuarioId:usuarioId,status: status});
    }catch(e) {
        console.log("Erro ao avisar presença!");
    }
}

export async function publicarParaUsuarios(ids : string[], evento: Evento) {
    const msg = JSON.stringify(evento);

    for(const id of ids) {
        conexoes.get(id)?.forEach((ws) => {
            if(ws.readyState === ws.OPEN) ws.send(msg);
        })
    }
}

export async function publicarParaServidor(servidorId: string, evento : Evento) {
    const entidades = await prisma.usuarioServidor.findMany({where: {servidorId:servidorId},select: {usuarioId:true}});

    publicarParaUsuarios(entidades.map((e) => e.usuarioId),evento);
}