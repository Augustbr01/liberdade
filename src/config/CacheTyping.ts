import {prisma} from "../../lib/prisma"
const map = new Map<string,string>();

export async function buscarServidor(canalId: string) {
    let idServidor = map.get(canalId);

    if(!idServidor) {
        const servidor = await prisma.canal.findUnique({where:{id:canalId},select: {servidorId:true}});
        if(!servidor) {
            return null;
        }
        idServidor = servidor.servidorId;
        map.set(canalId,servidor.servidorId);
    }
    return idServidor;
}
