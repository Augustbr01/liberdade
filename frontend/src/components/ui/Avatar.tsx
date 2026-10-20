import { useEffect, useState, type CSSProperties } from "react";
import { avatarReal, iniciais, tomNeutro } from "../../lib/util";

type AvatarProps = {
    nome: string;
    url?: string | null;
    // "auto" deixa o CSS decidir o tamanho (blocos da chamada)
    tamanho?: number | "auto";
    falando?: boolean;
    className?: string;
};

export function Avatar({ nome, url, tamanho = 32, falando, className = "" }: AvatarProps) {
    const [falhou, setFalhou] = useState(false);
    const imagem = avatarReal(url);

    useEffect(() => setFalhou(false), [imagem]);

    const estilo: CSSProperties = tamanho === "auto"
        ? {}
        : { width: tamanho, height: tamanho, fontSize: Math.max(10, Math.round(tamanho * 0.38)) };

    return (
        <span className={`avatar ${falando ? "falando" : ""} ${className}`} style={estilo}>
            {imagem && !falhou ? (
                <img src={imagem} alt="" draggable={false} onError={() => setFalhou(true)} />
            ) : (
                <span className="avatar-iniciais" style={{ background: tomNeutro(nome) }}>{iniciais(nome)}</span>
            )}
        </span>
    );
}

type IconeServidorProps = { nome: string; url?: string | null; tamanho?: number };

export function IconeServidor({ nome, url, tamanho = 40 }: IconeServidorProps) {
    // a imagem não carregou (apagada, link quebrado): volta pras iniciais, igual no Avatar
    const [falhou, setFalhou] = useState(false);
    useEffect(() => setFalhou(false), [url]);

    return (
        <span
            className="icone-servidor"
            style={{ width: tamanho, height: tamanho, fontSize: Math.round(tamanho * 0.34), borderRadius: Math.round(tamanho * 0.3) }}
        >
            {url && !falhou ? <img src={url} alt="" draggable={false} onError={() => setFalhou(true)} /> : iniciais(nome)}
        </span>
    );
}
