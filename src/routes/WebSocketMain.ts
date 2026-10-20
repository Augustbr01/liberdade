import type { FastifyPluginAsync } from "fastify";
import { conectar, enviarSnapshot, marcarVivo, publicarParaServidor} from "./eventosConexao";
import { buscarServidor } from "../config/CacheTyping";
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

        socket.on("close", () => {
            desconectar();
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
            }catch(e) {
                return;
            }
        })
    })
}