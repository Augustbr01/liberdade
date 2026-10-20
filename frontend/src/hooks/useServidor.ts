import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Permissao, type ServidorDetalhe, type ServidorResumo } from "../api";
import { gateway } from "../lib/gateway";
import type { EventoGateway } from "../tipos";

// aplica um evento do gateway no servidor em memória.
// eventos de outro servidor (canal que não é daqui) são ignorados.
// tira alguém da lista de membros e de qualquer sala de voz em que estivesse
export function removerMembro(s: ServidorDetalhe, usuarioId: string): ServidorDetalhe {
    return {
        ...s,
        membros: s.membros.filter((m) => m.usuario.id !== usuarioId),
        canais: s.canais.map((c) =>
            c.participantes
                ? { ...c, participantes: c.participantes.filter((p) => p.id !== usuarioId), telas: (c.telas ?? []).filter((id) => id !== usuarioId) }
                : c,
        ),
    };
}

// promovido ou rebaixado: só troca a permissão (a lista de membros reagrupa sozinha).
// Chega pela resposta da ação e pelo evento; o segundo não muda nada
export function definirPermissao(s: ServidorDetalhe, usuarioId: string, permissao: Permissao): ServidorDetalhe {
    if (!s.membros.some((m) => m.usuario.id === usuarioId && m.permissao !== permissao)) return s;
    return { ...s, membros: s.membros.map((m) => (m.usuario.id === usuarioId ? { ...m, permissao } : m)) };
}

// o UPDATE_SERVER traz só o que mudou (nome, ícone ou os dois): o resto fica como está
export function atualizarResumo<T extends ServidorResumo>(s: T, mudanca: { nome?: string; iconeUrl?: string | null }): T {
    return {
        ...s,
        nome: mudanca.nome ?? s.nome,
        iconeUrl: mudanca.iconeUrl !== undefined ? mudanca.iconeUrl : s.iconeUrl,
    };
}

function aplicar(s: ServidorDetalhe, evento: EventoGateway): ServidorDetalhe {
    if (evento.tipo === "ENTROU_NA_CALL" || evento.tipo === "SAIU_DA_CALL") {
        if (!s.canais.some((c) => c.id === evento.canalId)) return s;
        const usuario = s.membros.find((m) => m.usuario.id === evento.usuarioId)?.usuario;
        return {
            ...s,
            canais: s.canais.map((c) => {
                if (c.id !== evento.canalId) return c;
                const atuais = c.participantes ?? [];
                if (evento.tipo === "ENTROU_NA_CALL") {
                    // a chamada começou agora: sala que estava vazia ganha o início. O do back vale pra
                    // todo mundo; sem ele (back antigo), "agora" fica a menos de um segundo do certo
                    const inicioCall = evento.inicioCall ?? c.inicioCall ?? (atuais.length === 0 ? new Date().toISOString() : null);
                    if (!usuario || atuais.some((p) => p.id === usuario.id)) return inicioCall === c.inicioCall ? c : { ...c, inicioCall };
                    return { ...c, participantes: [...atuais, usuario], inicioCall };
                }
                // saiu da sala: se estava compartilhando, a tela sai junto; saiu o último, a chamada acabou
                const participantes = atuais.filter((p) => p.id !== evento.usuarioId);
                return {
                    ...c,
                    participantes,
                    telas: (c.telas ?? []).filter((id) => id !== evento.usuarioId),
                    inicioCall: participantes.length === 0 ? null : c.inicioCall,
                };
            }),
        };
    }
    if (evento.tipo === "MEMBROS") {
        if (evento.servidorId !== s.id || !evento.usuarioId) return s;
        if (evento.acao === "ENTROU") {
            // veio com nome e foto: entra no fim da lista na hora (a lista é por ordem de entrada).
            // Sem eles, quem assina o gateway rebusca o servidor
            const usuario = evento.usuario;
            if (!usuario || s.membros.some((m) => m.usuario.id === usuario.id)) return s;
            return { ...s, membros: [...s.membros, { permissao: "MEMBRO", usuario }] };
        }
        // continua no servidor, só muda de grupo
        if (evento.acao === "PROMOVIDO") return definirPermissao(s, evento.usuarioId, "ADMIN");
        if (evento.acao === "REBAIXADO") return definirPermissao(s, evento.usuarioId, "MEMBRO");
        // saiu, foi expulso ou banido
        return removerMembro(s, evento.usuarioId);
    }
    if (evento.tipo === "TELA") {
        if (!s.canais.some((c) => c.id === evento.canalId)) return s; // não é daqui
        return {
            ...s,
            canais: s.canais.map((c) => {
                if (c.id !== evento.canalId) return c;
                const atuais = c.telas ?? [];
                if (evento.statusTela === "ABRIU") {
                    return atuais.includes(evento.usuarioId) ? c : { ...c, telas: [...atuais, evento.usuarioId] };
                }
                return { ...c, telas: atuais.filter((id) => id !== evento.usuarioId) };
            }),
        };
    }
    if (evento.tipo === "CANAL_CRIADO") {
        // o evento é de outro servidor, ou eu mesmo já adicionei esse canal ao criar
        if (evento.servidorId !== s.id || s.canais.some((c) => c.id === evento.canal.id)) return s;
        return { ...s, canais: [...s.canais, evento.canal] };
    }
    if (evento.tipo === "CANAL_APAGADO") {
        if (!s.canais.some((c) => c.id === evento.canalId)) return s; // não é daqui
        return { ...s, canais: s.canais.filter((c) => c.id !== evento.canalId) };
    }
    if (evento.tipo === "UPDATE_SERVER") {
        if (evento.servidorId !== s.id) return s;
        return atualizarResumo(s, evento);
    }
    return s;
}

// carrega o servidor aberto e o mantém atualizado pelo gateway (canais, membros,
// quem está nas salas). Sem polling: o servidor empurra as mudanças.
export function useServidor(id: string | null, aoErrar: (err: unknown) => void) {
    const [servidor, setServidor] = useState<ServidorDetalhe | null>(null);
    const aoErrarRef = useRef(aoErrar);
    // o servidor de agora, pro ouvinte do gateway consultar sem re-assinar
    const atualRef = useRef<ServidorDetalhe | null>(null);

    useEffect(() => {
        aoErrarRef.current = aoErrar;
    }, [aoErrar]);

    useEffect(() => {
        atualRef.current = servidor;
    }, [servidor]);

    useEffect(() => {
        setServidor(null);
        if (!id) return;

        let ativo = true;
        const buscar = (silencioso: boolean) =>
            api.obterServidor(id)
                .then((s) => {
                    if (ativo) setServidor(s);
                })
                .catch((err) => {
                    if (ativo && !silencioso) aoErrarRef.current(err);
                });

        // uma rebusca por vez (vários eventos da mesma pessoa nova chegam juntos)
        let rebuscando = false;
        const rebuscar = () => {
            if (rebuscando) return;
            rebuscando = true;
            buscar(true).finally(() => {
                rebuscando = false;
            });
        };

        // alguém que não está na lista carregada (entrou no servidor depois: o back ainda não
        // avisa quando alguém entra). Sem os dados dessa pessoa ela nem aparece na sala de voz
        const desconhecido = (usuarioId: string) => {
            const s = atualRef.current;
            return !!s && s.id === id && !s.membros.some((m) => m.usuario.id === usuarioId);
        };

        buscar(false);

        // a cada (re)conexão, rebusca o snapshot pra não ficar sem o que passou
        // enquanto a conexão esteve caída
        const pararReconexao = gateway.aoReconectar(() => buscar(true));
        // mudanças ao vivo (entrar/sair de call) chegam aqui
        const pararEventos = gateway.assinar((evento) => {
            if (!ativo) return;
            // saiu alguém, mas o evento não diz quem: só dá pra rebuscar a lista
            if (evento.tipo === "MEMBROS" && evento.servidorId === id && !evento.usuarioId) {
                rebuscar();
                return;
            }
            // pessoa nova entrou numa sala daqui ou mandou mensagem aqui: rebusca (o snapshot já
            // vem com ela na sala). A mensagem em si chega pelo useMensagens do mesmo jeito
            let quem: string | null = null;
            if (evento.tipo === "ENTROU_NA_CALL" && atualRef.current?.canais.some((c) => c.id === evento.canalId)) {
                quem = evento.usuarioId;
            } else if (evento.tipo === "MENSAGEM_CRIADA" && evento.servidorId === id) {
                quem = evento.mensagem.autor.id;
            } else if (evento.tipo === "MEMBROS" && evento.acao === "ENTROU" && evento.servidorId === id && !evento.usuario) {
                // entrou alguém, mas o evento não trouxe nome e foto
                quem = evento.usuarioId ?? null;
            }
            if (quem && desconhecido(quem)) {
                rebuscar();
                return;
            }
            setServidor((s) => (s ? aplicar(s, evento) : s));
        });

        return () => {
            ativo = false;
            pararReconexao();
            pararEventos();
        };
    }, [id]);

    const recarregar = useCallback(() => {
        if (!id) return;
        api.obterServidor(id)
            // só troca se ainda for o mesmo servidor aberto
            .then((s) => setServidor((atual) => (atual?.id === s.id ? s : atual)))
            .catch(() => {});
    }, [id]);

    return { servidor, setServidor, recarregar };
}
