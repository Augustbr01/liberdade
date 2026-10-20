// sons curtos de entrada/saída de call, gerados via Web Audio (sem arquivo).
// pra usar sons reais depois, troque o corpo por `new Audio("/sons/entrada.mp3").play()`.
let ctx: AudioContext | null = null;

function contexto(): AudioContext | null {
    try {
        if (!ctx) {
            const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!AC) return null;
            ctx = new AC();
        }
        return ctx;
    } catch {
        return null;
    }
}

// entrada = duas notas subindo; saída = descendo
export function somVoz(tipo: "entrada" | "saida") {
    const c = contexto();
    if (!c) return;
    if (c.state === "suspended") void c.resume();

    const notas = tipo === "entrada" ? [523.25, 783.99] : [783.99, 523.25];
    notas.forEach((freq, i) => {
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(c.destination);

        const t = c.currentTime + i * 0.1;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02); // ataque
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16); // decaimento
        osc.start(t);
        osc.stop(t + 0.18);
    });
}
