import { prisma } from "../../lib/prisma";
import { Status } from "../interface/Evento";
import { publicarParaUsuarios } from "./eventosConexao";
import {WebSocket} from "ws"

const servidoresDoUsuario = new Map<string,Set<string>>();
const membrosServidores = new Map<string,Set<string>>();

/** Antes do PRESENCA_INICIAL: evita lista de membros/servidores desatualizada no cache. */
export function refrescarCacheSnapshot(usuarioId: string) {
    const servidores = servidoresDoUsuario.get(usuarioId);
    if (servidores) {
        for (const servidorId of servidores) {
            membrosServidores.delete(servidorId);
        }
    }
    servidoresDoUsuario.delete(usuarioId);
}

export async function buscarServidoresUsuario(idUsuario : string) {

    const existe = servidoresDoUsuario.get(idUsuario);

    if(existe) {
        return existe;
    }

    const entidades = await prisma.usuarioServidor.findMany({where:{usuarioId:idUsuario},select:{servidorId:true}});
                                

    const array = new Set(entidades.map((e) => e.servidorId));

    servidoresDoUsuario.set(idUsuario,array);

    return array;
}

export async function buscarMembrosServidor(servidorId: string) {
    const existe = membrosServidores.get(servidorId);

    if(existe) {
        return existe;
    }

    const entidades = await prisma.usuarioServidor.findMany({where:{servidorId:servidorId},select:{usuarioId:true}});

    const array = new Set(entidades.map((e) => e.usuarioId));

    membrosServidores.set(servidorId,array);


    return array;
}

export async function avisarPresenca(usuarioId: string,status:Status) {
    const servidores = await buscarServidoresUsuario(usuarioId);

    const lista = await Promise.all([...servidores].map((id) => buscarMembrosServidor(id)));

    const destinatarios = new Set<string>();

    for (const membros of lista) {
        for (const id of membros) {
            destinatarios.add(id);
        }
    }

    destinatarios.delete(usuarioId);

    await publicarParaUsuarios([...destinatarios],{tipo:"PRESENCA",usuarioId:usuarioId,status:status});
}