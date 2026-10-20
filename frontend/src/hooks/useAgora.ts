import { useEffect, useState } from "react";

// relógio que atualiza sozinho (cronômetro da chamada, tempo das salas). Os toques caem na virada
// de cada segundo do relógio: assim dois cronômetros da mesma sala na tela trocam juntos
export function useAgora(passo = 1000) {
    const [agora, setAgora] = useState(() => Date.now());

    useEffect(() => {
        let repetir: number | undefined;
        const primeiro = window.setTimeout(() => {
            setAgora(Date.now());
            repetir = window.setInterval(() => setAgora(Date.now()), passo);
        }, passo - (Date.now() % passo));
        return () => {
            window.clearTimeout(primeiro);
            window.clearInterval(repetir);
        };
    }, [passo]);

    return agora;
}
