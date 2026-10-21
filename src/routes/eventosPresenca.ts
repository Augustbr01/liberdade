import { prisma } from "../../lib/prisma";
import { Status } from "../interface/Evento";
import { publicarParaUsuarios } from "./eventosConexao";

const servidoresDoUsuario = new Map<string,Set<string>>();
const membrosServidores = new Map<string,Set<string>>();

interface mapObject {
    idUsuario : string,
    idServidor: string
}

export async function adicionarServidorUsuario(dados : mapObject) {

    const servidores = servidoresDoUsuario.get(dados.idUsuario);

    servidores?.add(dados.idServidor);

    const membros = await prisma.usuarioServidor.findMany({where:{servidorId:dados.idServidor},select:{usuarioId:true}});
    
    const set = new Set<string>();

    for(const element of membros) {
        set.add(element.usuarioId);
    }

    set.delete(dados.idUsuario);

    membrosServidores.set(dados.idServidor,set);
}

export async function removerServidorUsuario(dados : mapObject) {
    const servidores = servidoresDoUsuario.get(dados.idUsuario);

    servidores?.delete(dados.idServidor);

    membrosServidores.get(dados.idServidor)?.clear();
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