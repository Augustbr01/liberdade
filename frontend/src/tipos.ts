import type { Canal, ConexaoVoz, Mensagem, Usuario } from "./api";

// a chamada em que você está (continua ativa enquanto você navega pelos canais)
export type Voz = {
    canal: Canal;
    servidorId: string;
    servidorNome: string;
    conexao: ConexaoVoz;
    desde: number;
    // quando a chamada da sala começou pra todo mundo (ISO, vem do back); sem ele, conta do `desde`
    inicioSala?: string;
};

// identity do LiveKit (= id do usuário) -> dados do membro
export type MapaMembros = Map<string, Usuario>;

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
    | { tipo: "DIGITANDO"; canalId: string; usuarioId: string };

// o que o CLIENTE manda pelo WebSocket (entrada). O servidor carimba a identidade
// (usuarioId) a partir do socket — o cliente só diz "onde".
export type MensagemCliente = { tipo: "DIGITANDO"; canalId: string };
