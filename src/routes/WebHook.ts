import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { receiver } from "../config/WebWookConfig";
import {prisma} from "../../lib/prisma"
import { devolverTempoCall, entrouNaCall, mudarTela, saiuDaCall } from "../eventosCall";
import { publicarParaServidor } from "./eventosConexao";
import { statusTela } from "../interface/Evento";
import { TrackSource } from "livekit-server-sdk";
export const routeHook : (FastifyPluginAsyncTypebox) = async (fastify) => {
    fastify.post("/livekit/webhook", async (req,rep) => {
        console.log("entrou");
        let evento;
        try {
            evento = await receiver.receive(req.body as string,req.headers.authorization);
        }catch(e) {
            console.log(e);
            return rep.code(400).send({mensagem:"ASSINATURA LIVEKIT INVÁLIDA"});
        }

        const canalId = evento.room?.name;
        const usuarioId = evento.participant?.identity;

        if(!canalId || !usuarioId) return rep.code(200).send({mensagem:"INVALIDA"});

        const servidor = await prisma.servidor.findFirst({where: {canais: {some: {id: canalId}}},select: {id:true}});

        if(!servidor) {
            return rep.code(200).send();
        }

        if(evento.event === "participant_joined") {
            entrouNaCall(canalId,usuarioId);
            await publicarParaServidor(servidor?.id,{tipo:"ENTROU_NA_CALL",canalId:canalId,usuarioId:usuarioId,inicioCall: devolverTempoCall(canalId)})
        }

        if(evento.event === "participant_left") {
            saiuDaCall(canalId,usuarioId);
            await publicarParaServidor(servidor?.id, {tipo:"SAIU_DA_CALL",canalId:canalId,usuarioId:usuarioId})
        }

        const ehTela = evento.track?.source === TrackSource.SCREEN_SHARE;

        if(evento.event === "track_published" && ehTela) {
            mudarTela(canalId,usuarioId,true);
            await publicarParaServidor(servidor.id,{tipo:"TELA",canalId:canalId,usuarioId:usuarioId,statusTela:statusTela.ABRIU});
        }

        if(evento.event === "track_unpublished" && ehTela) {
            mudarTela(canalId,usuarioId,false);
            await publicarParaServidor(servidor.id,{tipo:"TELA",canalId:canalId,usuarioId:usuarioId,statusTela:statusTela.FECHOU});
        }

        return rep.code(200).send();
    })
}