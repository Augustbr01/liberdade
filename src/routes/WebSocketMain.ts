import type { FastifyPluginAsync } from "fastify";
import { conectar, enviarSnapshot, marcarVivo, publicarParaServidor} from "./eventosConexao";
import { buscarServidor } from "../config/CacheTyping";
import { entrarNoAndar, lerPose, moverNoAndar, sairDoAndar } from "../mundo";
import { aplicarComando, estadoYoutube, lerComando } from "../youtube";
import { aplicarComandoSala, estadoSala, lerComandoSala } from "../controleSala";
import { estaNaCall } from "../eventosCall";
import { prisma } from "../../lib/prisma";
export const routeWebSocket : (FastifyPluginAsync) = async (fastify) => {

    fastify.addHook('onRequest', async (req,rep) => {
        try {
            await req.jwtVerify();
        }catch(e) {
            return rep.code(400).send("acesso negado");
        }
    })
                                            
    fastify.get("/gateway", {websocket: true}, async (socket,req) => {
        const desconectar = conectar(req.user.id,socket);

        // andar do mundo 3D em que esta aba está (null = fora do 3D)
        let andar: string | null = null;
        // cada MUNDO_ENTRAR/MUNDO_SAIR muda o número: um ENTRAR que ainda está
        // conferindo o banco não vale mais se outro pedido chegou depois
        let pedido = 0;

        socket.on("close", () => {
            desconectar();
            pedido++;
            if(andar) sairDoAndar(andar,req.user.id,socket);
            andar = null;
        })

        socket.on("pong", () => {
            marcarVivo(socket);
        })

        try {
            await enviarSnapshot(req.user.id,socket);
        }catch(e) {
            console.log("erro grave");
        }

        socket.on("message", async (raw) => {
            try {

                const msg = JSON.parse(raw.toString());

                if(msg?.tipo === "DIGITANDO" && typeof msg.canalId === "string") {

                    const idServidor = await buscarServidor(msg.canalId);

                    if(!idServidor) {
                        return;
                    }

                    await publicarParaServidor(idServidor,{tipo:"DIGITANDO",canalId:msg.canalId,usuarioId:req.user.id})
                }

                if(msg?.tipo === "MUNDO_MOVER") {
                    const pose = lerPose(msg);
                    if(andar && pose) moverNoAndar(andar,req.user.id,socket,pose);
                    return;
                }

                if(msg?.tipo === "MUNDO_ENTRAR" && typeof msg.servidorId === "string") {
                    const pose = lerPose(msg);
                    if(!pose) return;

                    const meu = ++pedido;
                    const membro = await prisma.usuarioServidor.findUnique({where: {usuarioId_servidorId: {usuarioId:req.user.id,servidorId:msg.servidorId}},select: {id:true}});

                    if(!membro || meu !== pedido || socket.readyState !== socket.OPEN) return;

                    if(andar && andar !== msg.servidorId) sairDoAndar(andar,req.user.id,socket);
                    andar = msg.servidorId;
                    entrarNoAndar(msg.servidorId,req.user.id,socket,pose);
                    return;
                }

                // controle da sala (tablet): mesmo esquema do YouTube junto logo abaixo
                if(msg?.tipo === "SALA_PEDIR" && typeof msg.canalId === "string") {
                    const idServidor = await buscarServidor(msg.canalId);
                    if(!idServidor) return;
                    const membro = await prisma.usuarioServidor.findUnique({where: {usuarioId_servidorId: {usuarioId:req.user.id,servidorId:idServidor}},select: {id:true}});
                    if(!membro || socket.readyState !== socket.OPEN) return;
                    socket.send(JSON.stringify({tipo:"SALA_ESTADO",estado:estadoSala(msg.canalId)}));
                    return;
                }

                if(msg?.tipo === "SALA_COMANDO" && typeof msg.canalId === "string") {
                    const comando = lerComandoSala(msg);
                    if(!comando) return;
                    const idServidor = msg.canalId.startsWith("hall-") ? msg.canalId.slice("hall-".length) : await buscarServidor(msg.canalId);
                    if(!idServidor) return;
                    const membro = await prisma.usuarioServidor.findUnique({where: {usuarioId_servidorId: {usuarioId:req.user.id,servidorId:idServidor}},select:{id:true}});
                    const naCall = await estaNaCall(msg.canalId,req.user.id);
                    if(!naCall && !membro) {
                        if(socket.readyState === socket.OPEN) socket.send(JSON.stringify({tipo:"SALA_ERRO",canalId:msg.canalId,mensagem:"Entre na call para usar o controle da sala."}));
                        return;
                    }
                    await publicarParaServidor(idServidor,{tipo:"SALA_ESTADO",estado:aplicarComandoSala(msg.canalId,req.user.id,comando)});
                    return;
                }

                // YouTube junto: quem é do servidor pode ver o estado da sala...
                if(msg?.tipo === "YT_PEDIR" && typeof msg.canalId === "string") {
                    const idServidor = await buscarServidor(msg.canalId);
                    if(!idServidor) return;
                    const membro = await prisma.usuarioServidor.findUnique({where: {usuarioId_servidorId: {usuarioId:req.user.id,servidorId:idServidor}},select: {id:true}});
                    if(!membro || socket.readyState !== socket.OPEN) return;
                    socket.send(JSON.stringify({tipo:"YT_ESTADO",agora:Date.now(),estado:estadoYoutube(msg.canalId)}));
                    return;
                }

                // ...mas só quem está na call controla
                if(msg?.tipo === "YT_COMANDO" && typeof msg.canalId === "string") {
                    const comando = lerComando(msg);
                    if(!comando) return;

                    const erro = (mensagem: string) => {
                        if(socket.readyState === socket.OPEN) socket.send(JSON.stringify({tipo:"YT_ERRO",canalId:msg.canalId,mensagem}));
                    };

                    const idServidor = msg.canalId.startsWith("hall-") ? msg.canalId.slice("hall-".length) : await buscarServidor(msg.canalId);
                    if(!idServidor) return;

                    const membro = await prisma.usuarioServidor.findUnique({where: {usuarioId_servidorId: {usuarioId:req.user.id,servidorId:idServidor}},select:{id:true}});
                    const naCall = await estaNaCall(msg.canalId,req.user.id);
                    if(!naCall && !membro) return erro("Entre na call para controlar o vídeo.");

                    const resultado = await aplicarComando(msg.canalId,req.user.id,comando);
                    if(typeof resultado === "string") return erro(resultado);
                    if(resultado) await publicarParaServidor(idServidor,{tipo:"YT_ESTADO",agora:Date.now(),estado:resultado});
                    return;
                }

                if(msg?.tipo === "MUNDO_SAIR") {
                    pedido++;
                    if(andar) sairDoAndar(andar,req.user.id,socket);
                    andar = null;
                }
            }catch(e) {
                return;
            }
        })
    })
}
