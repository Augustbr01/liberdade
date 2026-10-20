interface ParticipanteCall {
    usuarioId : string,
    mostrandoTela: boolean
}


const calls = new Map<string, Map<string,ParticipanteCall>>()
const inicioCalls = new Map<string,Date>();

export function entrouNaCall(canalId: string, usuarioId: string) {
    const set = calls.get(canalId) ?? new Map<string,ParticipanteCall>();

    if(!set.has(usuarioId)) {
        set.set(usuarioId,{usuarioId:usuarioId,mostrandoTela:false});
    }

    if(!inicioCalls.has(canalId)) {
        inicioCalls.set(canalId,new Date());
    }

    calls.set(canalId,set);
}

export function saiuDaCall(canalId: string, usuarioId: string) {
    const set = calls.get(canalId); 

    set?.delete(usuarioId);

    if (set && set.size === 0) {
        calls.delete(canalId);
        inicioCalls.delete(canalId);
    }
}

export function devolverTempoCall(canalId:string) {
    return inicioCalls.get(canalId);
}

export function participantesDaCall(canalId: string) {
    return [...(calls.get(canalId)?.keys() ?? [])];
}

export function limparCall(canalId: string) {
    calls.delete(canalId);
    inicioCalls.delete(canalId);
}

export function mudarTela(canalId: string,usuarioId: string,mostrandoTela: boolean) {
    const participante = calls.get(canalId)?.get(usuarioId);

    if(participante) participante.mostrandoTela = mostrandoTela; 
}

export function telasDaCall(canalId: string) {
    return [...(calls.get(canalId)?.values() ?? [])].filter((p) => p.mostrandoTela).map((p) => p.usuarioId);
}