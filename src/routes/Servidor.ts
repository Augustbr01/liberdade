import { RecordPattern, Type, type FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import {prisma} from "../../lib/prisma"
import { Permissao,TipoCanal } from "../../generated/prisma/enums";
import { devolverTempoCall, limparCall, participantesDaCall, telasDaCall } from "../eventosCall";
import { publicarParaServidor, publicarParaUsuarios } from "./eventosConexao";
import { roomService } from "../config/RoomService";
import { AcaoUsuario } from "../interface/Evento";
export const RotasServidor : (FastifyPluginAsyncTypebox) = async (fastify) => {

    fastify.addHook("onRequest", async (req,rep) => {
        try {
            await req.jwtVerify();
        }catch(e) {
            return rep.code(404).send({mensagem:"ERRO AO VALIDAR USUÁRIO"});
        }
    })

    fastify.post("/servidor/criar", {schema: {body: Type.Object({nomeServidor:Type.String({minLength: 1, maxLength: 100})})}} ,async (req,rep) => {
        const idUsuario = req.user.id;
        const {nomeServidor} = req.body;
        const entidade = await prisma.servidor.create({
            data: {
                nome: nomeServidor,
                donoId: idUsuario,
                membros: {
                    create: {
                        usuarioId: idUsuario,
                        permissao: "ADMIN"
                    }
                },
                canais: {
                    create: [
                        {nome: "Geral", tipo: "TEXTO"},
                        {nome:"Geral", tipo:"VOZ"}
                    ]
                }
            },
            select: {
                id:true,
                nome: true,
                iconeUrl:true
            }
        })

        if(!entidade) {
            return rep.code(400).send({mensagem:"Erro ao criar servidor"});
        }

        return rep.code(200).send(entidade);
    })

    fastify.get("/servidor/listar", async (req,rep) => {
        const idUsuario = req.user.id;

        const entidades = await prisma.servidor.findMany({where: {membros: {some: {usuarioId:idUsuario}}},select: {
            id:true,
            nome: true,
            iconeUrl:true
        },orderBy: {criadoEm: "asc"}});

        return rep.code(200).send(entidades);
    })

    fastify.get("/servidor/mensagens/:canalId", {schema: {params: Type.Object({canalId:Type.String()}),querystring: Type.Object({idUltima:Type.Optional(Type.String())})}}, async (req,rep) => {
        const {canalId} = req.params;
        const {idUltima} = req.query;
        const idUsuario = req.user.id;

        const isMembro = await prisma.canal.findUnique({where:{id:canalId,servidor: {membros: {some: {usuarioId:idUsuario}}}}});

        if(!isMembro) {
            return rep.code(401).send({mensagem:"Não autorizado!"});
        }

        const mensagens = await prisma.mensagem.findMany({where:{canalId:canalId},...(idUltima ? {cursor: {id:idUltima},skip: 1 } : {}),orderBy: {criadoEm: "desc"},take:50,select: {id:true,conteudo:true,criadoEm:true,editadaEm:true,autorId:true,autor: {select: {id:true,nome:true,avatarUrl:true}}}});

        return rep.code(200).send(mensagens.reverse());
    })
    
    fastify.post("/servidor/permissao", {schema:{body:Type.Object({idServidor:Type.String(),membroSofrendo:Type.String(),tipo:Type.Enum(Permissao)})}} ,async (req,rep) => {
        const usuarioId = req.user.id;
        const {idServidor,membroSofrendo,tipo} = req.body;

        const isAdmin = await prisma.servidor.findMany({where:{id:idServidor, membros: {some: {usuarioId:usuarioId,permissao: Permissao.ADMIN}}}});

        if(!isAdmin) {
            return rep.code(401).send({mensagem:"Acesso negado"});
        }
    })

    fastify.get("/servidor/banidos/:id", {schema:{params:Type.Object({id:Type.String()})}},async (req,rep) => {
        const usuarioId = req.user.id;

        const {id} = req.params;

        const isAdmin = await prisma.usuarioServidor.findUnique({where:{permissao:Permissao.ADMIN,usuarioId_servidorId:{usuarioId:usuarioId,servidorId:id}}});

        if(!isAdmin) {
            return rep.code(401).send({mensagem:"Acesso negado!"});
        }

        const banimentos = await prisma.banimentoServidor.findMany({where:{servidorId:id},select:{criadoEm:true,usuario: {select: {id:true,nome:true,avatarUrl:true}}}});

        return rep.code(200).send(banimentos);
    })

    fastify.post("/servidor/banir", {schema: {body: Type.Object({servidorId:Type.String(),membroId:Type.String()})}}, async (req,rep) => {
        const usuarioId = req.user.id;
        const {servidorId,membroId} = req.body;

        const isAdmin = await prisma.usuarioServidor.findUnique({where: {permissao: Permissao.ADMIN,usuarioId_servidorId: {usuarioId:usuarioId,servidorId:servidorId}}});

        if(!isAdmin) {
            return rep.code(401).send({mensagem:"Acesso não autorizado!"});
        }

        const atual = new Date();

        try {
            await prisma.$transaction([
                prisma.usuarioServidor.delete({where:{permissao: Permissao.MEMBRO,usuarioId_servidorId: {usuarioId:membroId,servidorId:servidorId}}}),
                prisma.banimentoServidor.create({data: {servidorId:servidorId,usuarioId:membroId,criadoEm:atual}})
            ])
        }catch(e) {
            return rep.code(401).send({mensagem:"Erro ao banir usuário"});
        }
        await publicarParaServidor(servidorId,{tipo:"MEMBROS",servidorId:servidorId,usuarioId:membroId,acao: AcaoUsuario.BANIDO});
        await publicarParaUsuarios([membroId],{tipo:"MEMBROS",servidorId:servidorId,usuarioId:membroId,acao: AcaoUsuario.BANIDO});

        return rep.code(201).send({ok:true});
    })

    fastify.post("/servidor/desbanir", {schema: {body: Type.Object({servidorId:Type.String(),membroId:Type.String()})}} ,async (req,rep) => {
        const usuarioId = req.user.id;
        const {servidorId,membroId} = req.body;

        const isAdmin = await prisma.usuarioServidor.findUnique({where:{permissao: Permissao.ADMIN,usuarioId_servidorId:{usuarioId:usuarioId,servidorId:servidorId}}});

        if(!isAdmin) {
            return rep.code(401).send({mensagem:"Sem permissão!"});
        }

        try {
            await prisma.banimentoServidor.delete({where:{usuarioId_servidorId:{usuarioId:membroId,servidorId:servidorId}}});
        }catch(e) {
            return rep.code(404).send({mensagem:"Falha ao retirar banimento!"});
        }

        return rep.code(201).send({ok:true});
    })

    fastify.post("/servidor/mensagem/criar", {schema: {body: Type.Object({canalId: Type.String(),mensagem:Type.String({minLength: 1,maxLength:1000})})}} ,async (req,rep) => {
        const {canalId,mensagem} = req.body;
        const usuarioId = req.user.id;

        const canal = await prisma.canal.findUnique({where:{id:canalId,servidor: {membros: {some: {usuarioId:usuarioId}}}},select:{servidorId:true}});
        if(!canal) {
            return rep.code(404).send({mensagem:"Sem permissão ou não encontrado"});
        }
        
        const createMsg = await prisma.mensagem.create({data: {autorId:usuarioId,canalId:canalId,conteudo:mensagem},select: {id:true,conteudo:true,criadoEm:true,editadaEm:true,autor: {select: {id:true,nome:true,avatarUrl:true}}}});

        await publicarParaServidor(canal.servidorId,{tipo:"MENSAGEM_CRIADA",servidorId:canal.servidorId,canalId,mensagem: {id:createMsg.id,editadaEm:null,conteudo:createMsg.conteudo,criadoEm:createMsg.criadoEm,autor: {id:createMsg.autor.id,nome:createMsg.autor.nome,avatarUrl:createMsg.autor.avatarUrl}}});

        return rep.code(201).send(createMsg);
    })
    
    fastify.post("/servidor/editar/mensagem", {schema: {body: Type.Object({mensagemId:Type.String(),canalId:Type.String(),mensagem:Type.String({minLength: 1, maxLength:1000})})}}, async (req,rep) => {
        const {mensagem,mensagemId,canalId} = req.body;
        const idUser = req.user.id;
        const isMembro = await prisma.canal.findUnique({where:{mensagens: {some: {id:mensagemId,autorId:idUser}},id:canalId,servidor: {membros: {some: {usuarioId:idUser}}}},select: {servidorId:true}});

        if(!isMembro) {
            return rep.code(401).send({mensagem:"Sem permissão!"});
        }

        try {
            const update = await prisma.mensagem.update({where:{id:mensagemId,autorId:idUser},data: {editadaEm: new Date(),conteudo:mensagem},select: {conteudo:true,id:true,criadoEm:true,editadaEm:true,autor: {select: {id:true,nome:true,avatarUrl:true}}}});
            await publicarParaServidor(isMembro.servidorId,{tipo:"MENSAGEM_EDITADA",servidorId:isMembro.servidorId,canalId:canalId,mensagem:{conteudo:update.conteudo,id:update.id,criadoEm:update.criadoEm,editadaEm:update.editadaEm,autor: {nome:update.autor.nome,id:update.autor.id,avatarUrl:update.autor.avatarUrl}}});
            return rep.code(201).send(update);
        }catch(e) {
            return rep.code(400).send({mensagem:"Falha ao editar mensagem!"});
        }
    })

    fastify.post("/servidor/excluir/mensagem", {schema: {body: Type.Object({canalId:Type.String(),mensagemId:Type.String()})}} ,async (req,rep) => {
        const idUsuario = req.user.id;
        const {canalId,mensagemId} = req.body;
        const canal = await prisma.canal.findUnique({where:{id:canalId,mensagens: {some: {id:mensagemId,autorId:idUsuario}},servidor: {membros: {some: {usuarioId:idUsuario}}}},select: {id:true,servidor: {select: {id:true}}}});

        if(!canal) {
            return rep.code(400).send({mensagem:"Erro ao deletar a mensagem!"});
        }

        const deleteU = await prisma.mensagem.deleteMany({where:{id:mensagemId,autorId:idUsuario}});

        if(deleteU.count === 0) {
            return rep.code(400).send({mensagem:"Falha ao deletar mensagem!"});
        }

        await publicarParaServidor(canal.servidor.id,{tipo:"MENSAGEM_DELETADA",servidorId:canal.servidor.id,canalId:canal.id,mensagem: {id:mensagemId}});
        
        return rep.code(201).send({mensagem:"Mensagem deletada com sucesso!"});
    })

    fastify.post("/servidor/editar", {schema: {body:Type.Object({idServidor: Type.String(),nomeCanal:Type.String({minLength: 1, maxLength: 100})})}} ,async (req,rep) => {
        const {idServidor,nomeCanal} = req.body;
        const idUsuario = req.user.id;

        try {
            const updateE = await prisma.servidor.update({where: {id:idServidor, membros: {some: {servidorId:idServidor,usuarioId:idUsuario,permissao: Permissao.ADMIN}}},data: {nome: nomeCanal},select: {id:true,nome:true}});
            await publicarParaServidor(idServidor,{tipo: "UPDATE_SERVER",servidorId:idServidor,nome:nomeCanal});
            return rep.code(200).send(updateE);
        }catch(e) {
            return rep.code(400).send({mensagem:"Ocorreu um erro ao atualizar os dados do servidor"});
        }
    })

    fastify.get("/servidor/:id", {schema: {params: Type.Object({id:Type.String()})}} ,async (req,rep) => {
        const {id} = req.params;
        const idUsuario = req.user.id;

        const entidade = await prisma.servidor.findUnique({where:{id:id, membros: {some: {usuarioId:idUsuario,servidorId:id}}},select: {
            iconeUrl:true,
            id:true,
            nome:true,
            dono: {
                select: {
                    id: true,
                    nome:true,
                    avatarUrl:true
                }
            },
            membros: {
                select: {
                    permissao: true,
                    usuario: {
                        select: {
                            id:true,
                            nome:true,
                            avatarUrl:true,
                            entrou_em:true,
                        }
                    }
                },
                orderBy: {entrouEm: "asc"}
            },
            canais: {
                select: {
                    id:true,
                    nome:true,
                    tipo: true,
                },
                orderBy: {criadoEm: "asc"}
            }
        }});

        if(!entidade) {
            return rep.code(404).send({mensagem:"Erro ao buscar servidor!"});
        }

        const pessoasVoz = Object.fromEntries(entidade.canais.filter((a) => a.tipo === TipoCanal.VOZ).map((c) => [c.id,participantesDaCall(c.id)]));
        const iniciosVoz = Object.fromEntries(entidade.canais.filter((a) => a.tipo === TipoCanal.VOZ).map((c) => [c.id,devolverTempoCall(c.id)]));
        const telas = Object.fromEntries(entidade.canais.filter((a) => a.tipo === TipoCanal.VOZ).map((v) => [v.id,telasDaCall(v.id)]));

        return rep.code(200).send({...entidade,pessoasVoz,telas,iniciosVoz});
    })

    fastify.post("/servidor/convite-criar", {schema: {body: Type.Object({idServidor:Type.String(),expiraEm:Type.Optional(Type.Integer({minimum: 60, maximum: 60 * 60 * 24 * 30}))})}} ,async (req,rep) => {
        const {idServidor,expiraEm} = req.body;
        const idUsuario = req.user.id;

        const entidade = await prisma.usuarioServidor.findUnique({where: {usuarioId_servidorId: {usuarioId:idUsuario,servidorId:idServidor}, permissao: Permissao.ADMIN}});

        if(!entidade) {
            return rep.code(401).send({mensagem:"Você não possui permissão"});
        }

        const convite = await prisma.convite.create({data: {
            servidorId: idServidor,
            criadoPorId: idUsuario,
            expiraEm: !expiraEm ? null : new Date(Date.now() + (expiraEm * 1000))
        },select: {
            id:true,
            criadoEm:true,
            expiraEm:true
        }})

        return rep.code(200).send(convite);
    })

    fastify.post("/expulsar/membro",{schema: {body: Type.Object({idServidor:Type.String(),idMembro: Type.String()})}},async (req,rep) => {
        const {idServidor,idMembro} = req.body;
        const idUsuario = req.user.id;

        const isAdmin = await prisma.usuarioServidor.findUnique({where:{usuarioId_servidorId: {usuarioId:idUsuario,servidorId:idServidor},permissao: Permissao.ADMIN}});

        if(!isAdmin) {
            return rep.code(401).send({mensagem:"Acesso não permitido"});
        }

        try {
            await prisma.usuarioServidor.delete({where:{usuarioId_servidorId:{usuarioId:idMembro,servidorId:idServidor},permissao: {not: Permissao.ADMIN}}});
            await publicarParaServidor(idServidor,{tipo:"MEMBROS",servidorId:idServidor,usuarioId:idMembro,acao: AcaoUsuario.EXPULSO});
            await publicarParaUsuarios([idMembro],{tipo:"MEMBROS",servidorId:idServidor,usuarioId:idMembro,acao: AcaoUsuario.EXPULSO});
            return rep.code(204).send({ok:true});
        }catch(e) {
            return rep.code(400).send({mensagem:"Não foi possível remover o membro!"});
        }
    })

    fastify.post("/servidor/sala-criar", {schema: {body: Type.Object({servidorId: Type.String(),tipoSala: Type.Enum(TipoCanal),nomeCanal: Type.String({minLength: 1, maxLength: 50})})}},async (req,rep) => {
        const {servidorId,tipoSala,nomeCanal} = req.body;
        const idUsuario = req.user.id;

        const servidor = await prisma.servidor.findFirst({where:{id:servidorId, membros: {some: {usuarioId: idUsuario, permissao: Permissao.ADMIN}}}});

        if(!servidor) {
            return rep.code(404).send({mensagem:"erro"});
        }

        const canal = await prisma.canal.create({data: {
            servidorId:servidorId,
            nome:nomeCanal,
            tipo:tipoSala
        },select: {
            id:true,
            nome:true,
            criadoEm: true,
            tipo:true
        }})

        await publicarParaServidor(servidorId,{tipo:"CANAL_CRIADO",servidorId,canal:{id:canal.id,tipo: canal.tipo,criado_em:canal.criadoEm,nome:canal.nome}})
        return rep.code(201).send(canal);
    })

    fastify.delete("/servidor/sala-deletar/:idSala", {schema: {params: Type.Object({idSala:Type.String()})}} ,async (req,rep) => {
        const {idSala} = req.params;
        const idUsuario = req.user.id;
        
        const servidor = await prisma.canal.findUnique({where: {id:idSala},select: {servidorId: true,tipo: true,nome: true,criadoEm:true}});

        if(!servidor) {
            return rep.code(404).send({mensagem:"Servidor não encontrado"});
        }

        const deletar = await prisma.canal.deleteMany({where: {id:idSala, servidor: {membros: {some: {usuarioId:idUsuario,permissao: Permissao.ADMIN}}}}});


        if(deletar.count === 0) {
            return rep.code(400).send({mensagem:"Falha deletar o canal"});
        }

        if(servidor.tipo === TipoCanal.VOZ) {
            limparCall(idSala);
            await roomService.deleteRoom(idSala).catch((e) => {});
        }

        await publicarParaServidor(servidor.servidorId, {tipo: "CANAL_APAGADO",servidorId:servidor.servidorId,canalId:idSala});

        return rep.code(200).send({mensagem:"Canal deletado com sucesso"})
    })

    fastify.post("/servidor/rebaixar", {schema: {body:Type.Object({servidorId:Type.String(),membroId:Type.String()})}} ,async (req,rep) => {
        const usuarioId = req.user.id
        const {servidorId,membroId} = req.body;

        const isAdmin = await prisma.usuarioServidor.findUnique({where:{permissao:Permissao.ADMIN,usuarioId_servidorId:{usuarioId:usuarioId,servidorId:servidorId}},select: {servidor: {select: {donoId:true}}}});

        if(!isAdmin) {
            return rep.code(403).send({mensagem:"Sem permissão!"});
        }

        if(membroId === isAdmin.servidor.donoId) {
            return rep.code(403).send({mensagem:"O dono não pode ser rebaixado!"});
        }

        try {
            await prisma.usuarioServidor.update({where:{usuarioId_servidorId:{usuarioId:membroId,servidorId:servidorId}},data:{permissao: Permissao.MEMBRO}});
        }catch(e) {
            return rep.code(400).send({mensagem:"Falha ao rebaixar usuário!"});
        }
        await publicarParaServidor(servidorId,{tipo:"MEMBROS",servidorId:servidorId,usuarioId:membroId,acao: AcaoUsuario.REBAIXADO});

        return rep.code(204).send({ok:true});
    })

    fastify.post("/servidor/promover", {schema: {body: Type.Object({servidorId:Type.String(),membroId:Type.String()})}},async (req,rep) => {
        const usuarioId = req.user.id;
        const {servidorId,membroId} = req.body;

        const isAdmin = await prisma.usuarioServidor.findUnique({where:{permissao:Permissao.ADMIN,usuarioId_servidorId:{usuarioId:usuarioId,servidorId:servidorId}}});

        if(!isAdmin) {
            return rep.code(403).send({mensagem:"Sem permissão!"});
        }

        try {
            await prisma.usuarioServidor.update({where:{usuarioId_servidorId:{usuarioId:membroId,servidorId:servidorId}},data: {permissao: Permissao.ADMIN}});
        }catch(e) {
            return rep.code(400).send({mensagem:"Falha ao promover usuário!"});
        }
        await publicarParaServidor(servidorId,{tipo:"MEMBROS",servidorId:servidorId,usuarioId:membroId,acao: AcaoUsuario.PROMOVIDO});
        return rep.code(204).send();
    })

    fastify.post("/servidor/convite/:id",{schema: {params: Type.Object({id: Type.String()})}},async (req,rep) => {
        const idUsuario = req.user.id;
        const {id} = req.params;

        const entidade = await prisma.convite.findFirst({where: {id:id, OR: [{expiraEm:null},{expiraEm: {gt: new Date()}}]}, select: {servidorId: true,servidor: {select: {membros: {where: {usuarioId:idUsuario}}}}}});
        
        if(!entidade) {
            return rep.code(400).send({mensagem:"Código inválido ou expirado"});
        }

        if(entidade.servidor.membros.length > 0) {
            return rep.code(400).send({mensagem:"Você já é membro deste servidor"});
        }

        const isBanido = await prisma.banimentoServidor.findUnique({where: {usuarioId_servidorId: {usuarioId:idUsuario,servidorId:entidade.servidorId}},select: {id:true}});

        if(isBanido) {
            return rep.code(403).send({mensagem:"Você está banido deste servidor!"});
        }

        const criado = await prisma.usuarioServidor.create({data: {
            usuarioId:idUsuario,
            servidorId:entidade.servidorId
        }, select: {
            servidor: {
                select: {
                    id:true,
                    nome:true,
                    iconeUrl:true
                }
            }
        }})

        await publicarParaServidor(entidade.servidorId,{tipo:"MEMBROS",servidorId:entidade.servidorId,usuarioId:idUsuario,acao: AcaoUsuario.ENTROU});

        return rep.code(200).send(criado);
    })

    fastify.post("/servidor/sair", {schema:{body: Type.Object({servidorId:Type.String()})}}, async (req,rep) => {
        const usuarioId = req.user.id;
        const {servidorId} = req.body;
        try {

            const isDono = await prisma.servidor.findUnique({where:{id:servidorId,donoId:usuarioId}});

            if(isDono) {
                return rep.code(403).send({mensagem:"Um dono não pode sair do servidor,apague o servidor nas configurações"});
            }

            await prisma.usuarioServidor.delete({where:{usuarioId_servidorId:{usuarioId:usuarioId,servidorId:servidorId}}});
        }catch(e) {
            console.log("opa")
            return rep.code(400).send({mensagem:"Falha ao sair do servidor!"});
        }
        await publicarParaServidor(servidorId,{tipo:"MEMBROS",servidorId:servidorId,usuarioId:usuarioId,acao: AcaoUsuario.SAIU});
        await publicarParaUsuarios([usuarioId],{tipo:"MEMBROS",servidorId:servidorId,usuarioId:usuarioId,acao: AcaoUsuario.SAIU});

        return rep.code(204).send({ok:true});
    })
}