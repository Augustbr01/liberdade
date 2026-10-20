// FNV-1a: transforma um texto num número estável (o mesmo texto sempre dá o mesmo número)
export function hash(texto: string) {
    let h = 2166136261;
    for (let i = 0; i < texto.length; i++) {
        h ^= texto.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

// tons de cinza pros avatares sem foto: neutros, só pra diferenciar uma pessoa da outra
const TONS = ["#2a2a2f", "#303036", "#36363c", "#3d3d44"];

export function tomNeutro(texto: string) {
    return TONS[hash(texto) % TONS.length];
}

export function iniciais(nome: string) {
    const partes = nome.trim().split(/[\s._-]+/).filter(Boolean);
    if (partes.length === 0) return "?";
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return (partes[0][0] + partes[1][0]).toUpperCase();
}

// mostra qualquer avatar que o back mandar, inclusive os padrão do Discord
// (embed/avatars). As iniciais só entram quando não há URL ou a imagem falha.
export function avatarReal(url: string | null | undefined) {
    return url ?? null;
}

// quem não subiu foto fica com um avatar padrão do Discord (embed/avatars/N.png),
// sorteado pelo back no cadastro e ao remover a foto
export function temFotoPropria(url: string | null | undefined) {
    return !!url && !url.includes("cdn.discordapp.com/embed/avatars/");
}

// "Sessão" e "sessao" viram a mesma coisa na busca
export function normalizar(texto: string) {
    return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function estaDigitando(e: KeyboardEvent) {
    const el = e.target as HTMLElement | null;
    if (!el) return false;
    return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

export function cronometro(ms: number) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const dois = (n: number) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${dois(m)}:${dois(s)}` : `${dois(m)}:${dois(s)}`;
}

export function hora(data: number | string | Date) {
    return new Date(data).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function mesmoDia(a: Date, b: Date) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// "Hoje", "Ontem" ou "12 de outubro de 2026"
export function rotuloDia(data: Date) {
    const hoje = new Date();
    const ontem = new Date();
    ontem.setDate(hoje.getDate() - 1);
    if (mesmoDia(data, hoje)) return "Hoje";
    if (mesmoDia(data, ontem)) return "Ontem";
    return dataLonga(data);
}

// "7 de outubro de 2026" (sempre com dia, mês e ano)
export function dataLonga(data: string | Date) {
    return new Date(data).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
}

// "Hoje às 14:32", "Ontem às 09:10" ou "12/10/2026 14:32"
export function quando(data: string | Date) {
    const d = new Date(data);
    const dia = rotuloDia(d);
    if (dia === "Hoje" || dia === "Ontem") return `${dia} às ${hora(d)}`;
    return `${d.toLocaleDateString("pt-BR")} ${hora(d)}`;
}

// separa os links do texto pra virarem <a>
const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])/g;

export function partesTexto(texto: string) {
    return texto.split(URL_RE).map((valor, i) => ({ link: i % 2 === 1, valor }));
}

// formatos que o back aceita como imagem (os mesmos da foto de perfil)
const EXTENSAO_IMAGEM = /\.(png|jpe?g|webp|gif)$/i;
// mais que isso numa mensagem só vira link (não deixa uma mensagem encher a tela)
const MAX_IMAGENS = 4;

// links de imagem da mensagem, pra mostrar a imagem em vez de só o link.
// Só https (http seria bloqueado numa página https) e pela extensão do caminho,
// então "foto.png?v=2" conta e uma página do Tenor/Giphy (sem extensão) não
export function imagensDoTexto(texto: string) {
    const urls: string[] = [];
    for (const { link, valor } of partesTexto(texto)) {
        if (!link || urls.includes(valor)) continue;
        try {
            const url = new URL(valor);
            if (url.protocol === "https:" && EXTENSAO_IMAGEM.test(url.pathname)) urls.push(valor);
        } catch {
            // parece link mas não é uma URL válida
        }
        if (urls.length === MAX_IMAGENS) break;
    }
    return urls;
}

// a mensagem é só imagem (links de imagem e espaços): aí o texto some e fica só a imagem
export function soImagens(texto: string, imagens: string[]) {
    return imagens.length > 0 && partesTexto(texto).every((p) => (p.link ? imagens.includes(p.valor) : !p.valor.trim()));
}

// aceita o link inteiro (https://.../convite/<id>) ou só o id
export function extrairIdConvite(texto: string) {
    return texto.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0] ?? null;
}

export function idLocal() {
    return typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function lerArmazenado<T>(chave: string, padrao: T): T {
    try {
        const valor = localStorage.getItem(chave);
        return valor === null ? padrao : (JSON.parse(valor) as T);
    } catch {
        return padrao;
    }
}

export function salvarArmazenado(chave: string, valor: unknown) {
    try {
        localStorage.setItem(chave, JSON.stringify(valor));
    } catch {
        // sem armazenamento (aba anônima bloqueada etc.): só não lembra
    }
}

export function removerArmazenado(chave: string) {
    try {
        localStorage.removeItem(chave);
    } catch {
        // sem armazenamento: não tinha nada pra remover
    }
}

export const ehMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.userAgent);
export const teclaAtalho = ehMac ? "⌘" : "Ctrl";

// celular/tablet (toque, sem mouse). Aí um campo não deve se focar sozinho:
// isso abre o teclado e cobre metade da tela só por abrir um canal
export const telaDeToque = typeof window !== "undefined" && window.matchMedia("(hover: none) and (pointer: coarse)").matches;
