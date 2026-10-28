import type { ModeloSala, TipoCanal } from "../../generated/prisma/enums"

type Canal = {
    id: string,
    tipo : TipoCanal
    modelo : ModeloSala
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

// onde alguém está no mundo 3D: x/z no chão, y = altura dos pés (pulo, degraus do cinema),
// rot = para onde está virado (radianos), postura = 0 em pé, 1 agachado, 2 deslizando, 3 sentado, 4 deitado,
// item = o que está segurando (0 nada, 1 tablet), pitch = olhando pra cima (+) ou pra baixo (-), em radianos
export type PoseJogador = { usuarioId: string; x: number; z: number; y: number; rot: number; pitch: number; postura: number; item: number }

// YouTube assistido junto numa sala de voz. `posicao` é onde o vídeo estava no instante `em`
// (Date.now() do servidor); tocando, cada um calcula onde ele está agora a partir daí
export type VideoYoutube = { videoId: string; titulo: string; por: string; duracao: number | null }
export type ItemFilaYoutube = { id: string; videoId: string; titulo: string; por: string }
export type EstadoYoutube = {
    canalId: string;
    video: VideoYoutube | null;
    tocando: boolean;
    posicao: number;
    em: number;
    fila: ItemFilaYoutube[];
    ultima: { usuarioId: string; acao: string } | null;
}

// controle da sala (o "tablet"): o que aparece na TV, volume e surround da TV, e as luzes
export type ModoTV = "AUTO" | "YOUTUBE" | "TELA" | "MOSAICO" | "DESLIGADA"
export type ModoLuzes = "AUTO" | "ACESAS" | "APAGADAS"
// LEDs da sala gamer. paleta null = a cor padrão da sala (cada sala tem a sua)
export type PaletaLed = "NEON" | "BRASA" | "AURORA" | "SAKURA" | "MONO"
export type EstadoLed = { paleta: PaletaLed | null; ciclo: boolean; ligado: boolean }
export type EstadoSala = {
    canalId: string;
    // TELA: a tela compartilhada de `identidade` (usuarioId)
    tv: { modo: ModoTV; identidade: string | null };
    // segunda TV (lounge da LanHouse): mesmo formato; salas de uma TV só nunca mexem nela
    tv2: { modo: ModoTV; identidade: string | null };
    volume: number;
    surround: boolean;
    luzes: ModoLuzes;
    led: EstadoLed;
    ultima: { usuarioId: string; acao: string } | null;
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
    | {tipo: "MUNDO_ESTADO"; servidorId: string; jogadores: PoseJogador[]}
    | {tipo: "MUNDO_POSICOES"; servidorId: string; jogadores: PoseJogador[]}
    | {tipo: "MUNDO_SAIU"; servidorId: string; usuarioId: string}
    | {tipo: "YT_ESTADO"; agora: number; estado: EstadoYoutube}
    | {tipo: "YT_ERRO"; canalId: string; mensagem: string}
    | {tipo: "SALA_ESTADO"; estado: EstadoSala}
    | {tipo: "SALA_ERRO"; canalId: string; mensagem: string}
