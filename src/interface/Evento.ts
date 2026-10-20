import type { TipoCanal } from "../../generated/prisma/enums"

type Canal = {
    id: string,
    tipo : TipoCanal
    criado_em : Date
    nome: string,
}

type Mensagem = {
    id: string
    conteudo : string | null,
    criadoEm : Date | null
    editadaEm : Date | null
    autor: {id: string;nome:string;avatarUrl: string | null}
}

type MensagemDeletada = {
    id: string
}

export enum statusTela {
    ABRIU = "ABRIU",
    FECHOU = "FECHOU"
}

export enum AcaoUsuario {
    EXPULSO = "EXPULSO",
    PROMOVIDO = "PROMOVIDO",
    REBAIXADO = "REBAIXADO",
    BANIDO = "BANIDO",
    ENTROU = "ENTROU",
    SAIU = "SAIU"
}

export enum Status {
    ONLINE = "ONLINE",
    OFFLINE = "OFFLINE"
}

export type Evento =
    | {tipo: "MEMBROS";servidorId: string,usuarioId : string;acao: AcaoUsuario}
    | {tipo:"TELA";canalId:string;usuarioId : string; statusTela: statusTela}
    | { tipo: "ENTROU_NA_CALL"; canalId: string; usuarioId: string;inicioCall? : Date | undefined}
    | { tipo: "SAIU_DA_CALL"; canalId: string; usuarioId: string }
    | { tipo: "MENSAGEM_CRIADA";servidorId: string;canalId: string; mensagem: Mensagem }
    | {tipo: "PRESENCA";usuarioId: string,status:Status}
    | {tipo: "MENSAGEM_EDITADA";servidorId: string; canalId: string; mensagem: Mensagem}
    | {tipo: "MENSAGEM_DELETADA";servidorId: string;canalId: string; mensagem: MensagemDeletada}                                    
    | { tipo: "CANAL_CRIADO"; servidorId: string ;canal: Canal }
    | {tipo: "CANAL_APAGADO"; servidorId : string ;canalId: string }
    | {tipo: "UPDATE_SERVER"; servidorId: string; nome? : string | null,iconeUrl? : string | null}
    | {tipo: "DIGITANDO"; usuarioId : string,canalId: string}