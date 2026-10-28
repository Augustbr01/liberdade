import type { Canal, Membro, Mensagem, Usuario } from "./api";

// a chamada em que você está (continua ativa enquanto você navega pelos canais)
export type Voz = {
    canal: Canal;
    servidorId: string;
    servidorNome: string;
    desde: number;
    // quando a chamada da sala começou pra todo mundo (ISO, vem do back); sem ele, conta do `desde`
    inicioSala?: string;
    // call do hall do mundo 3D (não é um canal de verdade; some quando você sai do 3D)
    hall?: boolean;
};

// identity do LiveKit (= id do usuário) -> dados do membro
export type MapaMembros = Map<string, Usuario>;

// onde alguém está no mundo 3D: x/z no chão, y = altura dos pés (pulo, degraus do cinema),
// virado para `rot` (radianos); postura: 0 em pé, 1 agachado, 2 deslizando, 3 sentado, 4 deitado;
// item: o que está segurando (0 nada, 1 tablet); pitch: olhando pra cima (+) ou pra baixo (-)
export type PoseJogador = { usuarioId: string; x: number; z: number; y: number; rot: number; pitch: number; postura: number; item: number };

// YouTube assistido junto numa sala de voz (igual ao back, src/interface/Evento.ts).
// `posicao` é onde o vídeo estava no instante `em` (relógio do servidor)
export type VideoYoutube = { videoId: string; titulo: string; por: string; duracao: number | null };
export type ItemFilaYoutube = { id: string; videoId: string; titulo: string; por: string };
export type EstadoYoutube = {
    canalId: string;
    video: VideoYoutube | null;
    tocando: boolean;
    posicao: number;
    em: number;
    fila: ItemFilaYoutube[];
    ultima: { usuarioId: string; acao: string } | null;
};
export type ComandoYoutube =
    | { acao: "TOCAR_AGORA" | "FILA"; videoId: string }
    | { acao: "PLAY" | "PAUSE" | "PROXIMO" | "PARAR" }
    | { acao: "PULAR_PARA"; segundos: number }
    | { acao: "REMOVER"; itemId: string }
    | { acao: "TERMINOU"; videoId: string }
    | { acao: "DURACAO"; videoId: string; segundos: number };

// controle da sala (o "tablet"): o que aparece na TV, volume e surround da TV, e as luzes
// MOSAICO: todas as telas compartilhadas ao mesmo tempo, em grade
export type ModoTV = "AUTO" | "YOUTUBE" | "TELA" | "MOSAICO" | "DESLIGADA";
export type ModoLuzes = "AUTO" | "ACESAS" | "APAGADAS";
// LEDs da sala gamer. paleta null = a cor padrão da sala (cada sala tem a sua)
export type PaletaLed = "NEON" | "BRASA" | "AURORA" | "SAKURA" | "MONO";
export type EstadoLed = { paleta: PaletaLed | null; ciclo: boolean; ligado: boolean };
export type EstadoSala = {
    canalId: string;
    // TELA: a tela compartilhada de `identidade` (usuarioId)
    tv: { modo: ModoTV; identidade: string | null };
    volume: number;
    surround: boolean;
    luzes: ModoLuzes;
    led: EstadoLed;
    ultima: { usuarioId: string; acao: string } | null;
};
export type ComandoSala =
    | { acao: "TV"; modo: "AUTO" | "YOUTUBE" | "MOSAICO" | "DESLIGADA" }
    | { acao: "TV_TELA"; identidade: string }
    | { acao: "VOLUME"; volume: number }
    | { acao: "SURROUND"; ligado: boolean }
    | { acao: "LUZES"; modo: ModoLuzes }
    | { acao: "LED"; paleta?: PaletaLed; ciclo?: boolean; ligado?: boolean };

// eventos que o servidor empurra pelo WebSocket (/api/gateway).
// precisa bater com o `Evento` do back (eventosConexao.ts)
export type EventoGateway =
    // inicioCall: quando a chamada da sala começou (o back manda junto; serve quando a sala estava vazia)
    | { tipo: "ENTROU_NA_CALL"; canalId: string; usuarioId: string; inicioCall?: string | null }
    | { tipo: "SAIU_DA_CALL"; canalId: string; usuarioId: string }
    // alguém começou (ABRIU) ou parou (FECHOU) de compartilhar a tela numa sala de voz
    | { tipo: "TELA"; canalId: string; usuarioId: string; statusTela: "ABRIU" | "FECHOU" }
    | { tipo: "CANAL_CRIADO"; servidorId: string; canal: Canal }
    | { tipo: "CANAL_APAGADO"; servidorId: string; canalId: string }
    // o dono apagou o servidor: some pra todo mundo que era membro
    | { tipo: "SERVIDOR_APAGADO"; servidorId: string }
    // o servidor mudou: o que vier (nome, ícone) troca; o que não vier fica como está
    | { tipo: "UPDATE_SERVER"; servidorId: string; nome?: string; iconeUrl?: string | null }
    // alguém entrou (por convite) ou saiu da lista de membros (saiu, expulso ou banido), ou virou
    // admin (PROMOVIDO) ou deixou de ser (REBAIXADO) e continua no servidor.
    // usuarioId diz quem. No ENTROU, `usuario` traz nome e foto pra pessoa já aparecer na lista;
    // sem ele (ou sem usuarioId), o front rebusca o servidor
    | { tipo: "MEMBROS"; servidorId: string; acao: "ENTROU" | "SAIU" | "EXPULSO" | "BANIDO" | "PROMOVIDO" | "REBAIXADO"; usuarioId?: string; usuario?: Usuario }
    | { tipo: "MENSAGEM_CRIADA"; servidorId: string; canalId: string; mensagem: Mensagem }
    | { tipo: "MENSAGEM_EDITADA"; servidorId: string; canalId: string; mensagem: Mensagem }
    | { tipo: "MENSAGEM_DELETADA"; servidorId: string; canalId: string; mensagem: { id: string } }
    | { tipo: "DIGITANDO"; canalId: string; usuarioId: string }
    // alguém entrou no servidor por convite
    // mundo 3D: quem já estava no andar (ao entrar), quem se mexeu e quem saiu
    | { tipo: "MUNDO_ESTADO"; servidorId: string; jogadores: PoseJogador[] }
    | { tipo: "MUNDO_POSICOES"; servidorId: string; jogadores: PoseJogador[] }
    | { tipo: "MUNDO_SAIU"; servidorId: string; usuarioId: string }
    // YouTube junto: estado novo da sala (agora = relógio do servidor, pra acertar a diferença)
    | { tipo: "YT_ESTADO"; agora: number; estado: EstadoYoutube }
    | { tipo: "YT_ERRO"; canalId: string; mensagem: string }
    | { tipo: "SALA_ESTADO"; estado: EstadoSala }
    | { tipo: "SALA_ERRO"; canalId: string; mensagem: string }
    // snapshot ao (re)conectar: ids online entre quem compartilha servidor com você (sem você)
    | { tipo: "PRESENCA_INICIAL"; online: string[] }
    // alguém ficou online ou offline (delay de 5s depois da última aba fechar)
    | { tipo: "PRESENCA"; usuarioId: string; status: "ONLINE" | "OFFLINE" };

// o que o CLIENTE manda pelo WebSocket (entrada). O servidor carimba a identidade
// (usuarioId) a partir do socket — o cliente só diz "onde".
export type MensagemCliente =
    | { tipo: "DIGITANDO"; canalId: string }
    | { tipo: "MUNDO_ENTRAR"; servidorId: string; x: number; z: number; y: number; rot: number; pitch: number; postura: number; item: number }
    | { tipo: "MUNDO_MOVER"; x: number; z: number; y: number; rot: number; pitch: number; postura: number; item: number }
    | { tipo: "MUNDO_SAIR" }
    | { tipo: "YT_PEDIR"; canalId: string }
    | ({ tipo: "YT_COMANDO"; canalId: string } & ComandoYoutube)
    | { tipo: "SALA_PEDIR"; canalId: string }
    | ({ tipo: "SALA_COMANDO"; canalId: string } & ComandoSala);
