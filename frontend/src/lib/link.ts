// Abrir um link qualquer na TV da sala: o tablet manda o endereço, a TV mostra o site num iframe.
// Só funciona com sites que deixam ser abertos dentro de outra página (o dono do site decide, com
// X-Frame-Options / CSP), então aqui só arrumamos o endereço e avisamos dos sites que bloqueiam.

// o que a pessoa digitou vira um endereço https completo, ou null (mesma regra do servidor)
export function normalizarLink(bruto: string): string | null {
    let texto = bruto.trim();
    if (!texto || texto.length > 2000 || /\s/.test(texto)) return null;
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(texto)) {
        if (/^[a-z][a-z0-9+.-]*:/i.test(texto) && !/^[^/:]+:\d+(\/|$)/.test(texto)) return null;
        texto = `https://${texto}`;
    }
    try {
        const url = new URL(texto);
        if (url.protocol !== "http:" && url.protocol !== "https:") return null;
        if (url.username || url.password) return null;
        if (!url.hostname.includes(".") && !url.hostname.startsWith("[")) return null;
        url.protocol = "https:";
        return url.toString();
    } catch {
        return null;
    }
}

const sem_www = (host: string) => host.replace(/^(www|m|mobile)\./, "");

// links de vídeo/música que têm uma versão "embutível" própria: troca pelo player do serviço
export function enderecoDoQuadro(link: string): string {
    let url: URL;
    try {
        url = new URL(link);
    } catch {
        return link;
    }
    const host = sem_www(url.hostname.toLowerCase());
    const caminho = url.pathname.split("/").filter(Boolean);
    const inicio = url.searchParams.get("t") ?? url.searchParams.get("start");
    const segundos = inicio && /^\d+$/.test(inicio) ? `&start=${inicio}` : "";

    if (host === "youtube.com" || host === "music.youtube.com") {
        const id = caminho[0] === "watch" ? url.searchParams.get("v") : ["shorts", "live", "embed"].includes(caminho[0] ?? "") ? caminho[1] : null;
        if (id && /^[\w-]{11}$/.test(id)) return `https://www.youtube.com/embed/${id}?autoplay=1${segundos}`;
        const lista = caminho[0] === "playlist" ? url.searchParams.get("list") : null;
        if (lista) return `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(lista)}&autoplay=1`;
    }
    if (host === "youtu.be" && caminho[0] && /^[\w-]{11}$/.test(caminho[0])) return `https://www.youtube.com/embed/${caminho[0]}?autoplay=1${segundos}`;
    if (host === "vimeo.com" && caminho[0] && /^\d+$/.test(caminho[0])) return `https://player.vimeo.com/video/${caminho[0]}?autoplay=1`;
    if (host === "twitch.tv" && caminho[0]) {
        const pai = `parent=${encodeURIComponent(window.location.hostname)}`;
        if (caminho[0] === "videos" && caminho[1] && /^\d+$/.test(caminho[1])) return `https://player.twitch.tv/?video=${caminho[1]}&${pai}&autoplay=true`;
        if (/^\w{2,25}$/.test(caminho[0]) && caminho.length === 1) return `https://player.twitch.tv/?channel=${caminho[0]}&${pai}&autoplay=true`;
    }
    if (host === "open.spotify.com" && ["track", "album", "playlist", "episode", "show", "artist"].includes(caminho[0] ?? "") && caminho[1]) {
        return `https://open.spotify.com/embed/${caminho[0]}/${caminho[1]}`;
    }
    return link;
}

// sites que na prática nunca abrem dentro de outra página (mandam X-Frame-Options/CSP): se for um
// desses, o tablet avisa antes de a TV ficar em branco
const BLOQUEIAM = [
    "google.com", "instagram.com", "facebook.com", "x.com", "twitter.com", "netflix.com", "web.whatsapp.com", "whatsapp.com",
    "linkedin.com", "tiktok.com", "amazon.com", "amazon.com.br", "primevideo.com", "disneyplus.com", "max.com", "hbomax.com",
    "globoplay.globo.com", "github.com", "discord.com", "reddit.com", "mercadolivre.com.br", "bing.com", "paypal.com",
];

export function provavelmenteBloqueia(link: string): boolean {
    try {
        const host = sem_www(new URL(link).hostname.toLowerCase());
        if (enderecoDoQuadro(link) !== link) return false;
        return BLOQUEIAM.some((d) => host === d || host.endsWith(`.${d}`));
    } catch {
        return false;
    }
}

export function nomeDoSite(link: string): string {
    try {
        return sem_www(new URL(link).hostname);
    } catch {
        return link;
    }
}
