import { useCallback, useEffect, useRef, useState } from "react";
import type { Usuario } from "../api";
import { gateway } from "../lib/gateway";
import type { MapaMembros } from "../tipos";

// quanto tempo o "digitando" de alguém fica no ar depois do último evento dele
const DURACAO_MS = 5000;
// no máximo um aviso de "estou digitando" a cada tantos ms (não a cada tecla)
const THROTTLE_MS = 3000;

// recebe os eventos DIGITANDO do canal e devolve quem está digitando (nomes),
// além de `notificar()` pra avisar que você está digitando.
export function useDigitando(canalId: string, eu: Usuario, membros: MapaMembros) {
    const [ids, setIds] = useState<string[]>([]);
    const timers = useRef<Map<string, number>>(new Map());

    useEffect(() => {
        // troca de canal: zera tudo
        setIds([]);
        timers.current.forEach((t) => clearTimeout(t));
        timers.current.clear();

        const parar = gateway.assinar((evento) => {
            // a mensagem chegou: quem mandou parou de digitar (não espera os 5s pra sumir)
            if (evento.tipo === "MENSAGEM_CRIADA" && evento.canalId === canalId) {
                const autor = evento.mensagem.autor.id;
                const timer = timers.current.get(autor);
                if (timer) clearTimeout(timer);
                timers.current.delete(autor);
                setIds((lista) => (lista.includes(autor) ? lista.filter((x) => x !== autor) : lista));
                return;
            }
            if (evento.tipo !== "DIGITANDO" || evento.canalId !== canalId) return;
            if (evento.usuarioId === eu.id) return; // não mostra você mesmo

            const id = evento.usuarioId;
            // reinicia o timer de expiração dessa pessoa
            const anterior = timers.current.get(id);
            if (anterior) clearTimeout(anterior);
            setIds((lista) => (lista.includes(id) ? lista : [...lista, id]));
            const t = window.setTimeout(() => {
                timers.current.delete(id);
                setIds((lista) => lista.filter((x) => x !== id));
            }, DURACAO_MS);
            timers.current.set(id, t);
        });

        return () => {
            parar();
            timers.current.forEach((t) => clearTimeout(t));
            timers.current.clear();
        };
    }, [canalId, eu.id]);

    // resolve os ids em nomes pelo mapa de membros (ignora quem não está no mapa)
    const nomes = ids
        .map((id) => membros.get(id)?.nome)
        .filter((n): n is string => n !== undefined);

    // avisa que você está digitando, no máximo 1x a cada THROTTLE_MS
    const ultimoEnvio = useRef(0);
    const notificar = useCallback(() => {
        const agora = Date.now();
        if (agora - ultimoEnvio.current < THROTTLE_MS) return;
        ultimoEnvio.current = agora;
        gateway.enviar({ tipo: "DIGITANDO", canalId });
    }, [canalId]);

    return { nomes, notificar };
}
