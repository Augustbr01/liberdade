// Planta de um andar: tudo que é posição fica aqui (paredes, salas, móveis, colisão),
// gerado a partir dos canais do servidor. Os componentes 3D só desenham o que sai daqui.
//
// Eixos: x = esquerda/direita, z = frente/trás (andar pelo corredor = ir para -z), y = altura.
//
//            z = fim  ┌──┐
//     sala 2 (esq.)   │  │   sala 3 (dir.)
//     sala 0 (esq.)   │  │   sala 1 (dir.)
//            z = 0  ──┘  └──
//                  hall (quadros dos canais de texto nas paredes laterais)
//            z = H  ── elevador ──
//
// As salas entram no lado do corredor que estiver mais curto. Sala comum (a sala gamer) ocupa
// 8 m de corredor; cinema ocupa 16 m (telão no fundo, poltronas em degraus subindo pra trás).
import type { Canal, ModeloSala } from "../../api";
import { solidoDeRet, type Solido } from "./colisao";

export type Ret = { x1: number; z1: number; x2: number; z2: number };
export type TipoParede = "parede" | "hall" | "metal";
// caixa de y = base até y = topo
export type Parede = Ret & { base: number; topo: number; tipo: TipoParede };
export type Ponto = { x: number; z: number };

export type TipoMovel = "sofa" | "mesa" | "planta" | "tapete" | "poltrona" | "torre" | "pedestal";
// rot: giro em torno de y (0 = o "frente" do móvel aponta para +z); y: altura do chão embaixo dele
export type Movel = Ponto & { tipo: TipoMovel; rot: number; cor?: string; raio?: number; y?: number };

// lugar pra sentar. y = altura do chão embaixo do assento; rot = pra onde olha quem senta
export type Assento = Ponto & { id: string; salaId: string | null; y: number; rot: number };

// piso elevado (degraus do cinema): dentro dele o chão fica na altura `topo`
export type Degrau = Ret & { topo: number };

// caixa de som do surround da sala. Ordem: frente esquerda, centro, frente direita,
// traseira esquerda, traseira direita (esquerda/direita de quem olha pra TV)
export type CaixaSom = Ponto & { y: number; tipo: "torre" | "barra" | "parede" | "oculta"; rot: number };

export type SalaPlanta = {
    canalId: string;
    modelo: ModeloSala;
    // -1 = à esquerda do corredor, 1 = à direita
    lado: -1 | 1;
    ret: Ret;
    centro: Ponto;
    porta: Ponto;
    // altura do teto
    altura: number;
    // TV (ou telão): centro, altura do centro e largura da tela
    tv: Ponto & { rot: number; y: number; largura: number };
    // assentos da sala, na ordem em que quem está pelo modo clássico vai ocupando
    assentos: Assento[];
    caixasSom: CaixaSom[];
    // o controle da sala: deitado na mesa de centro (sala gamer) ou num pedestal (cinema)
    tablet: Ponto & { y: number; rot: number; inclinacao: number };
    // LAN house: a segunda TV (lounge) com o seu próprio tablet e caixas de som, e o interruptor da luz.
    // O tablet/caixas "de cima" (tv, tablet, caixasSom) são da primeira TV (o telão da mesa LAN)
    tv2?: Ponto & { rot: number; y: number; largura: number };
    tablet2?: Ponto & { y: number; rot: number; inclinacao: number };
    caixasSom2?: CaixaSom[];
    interruptor?: Ponto;
    // quem está pelo modo clássico e não coube nos assentos fica em pé aqui
    lugares: (Ponto & { rot: number })[];
    // holograma do chat da call (sala gamer): o retângulo dele no andar, pra saber se a mira está
    // em cima. Centro (x, y, z), normal (nx, nz: pra onde a tela olha) e eixo da largura (ux, uz)
    chat: (Ponto & { y: number; nx: number; nz: number; ux: number; uz: number; largura: number; altura: number }) | null;
};

export type Quadro = Ponto & { canalId: string; rot: number };
// alvo (tablet): qual TV ele controla (1 = a TV da sala, 2 = a segunda TV da LAN house)
export type Interativo = Ponto & { id: string; raio: number; tipo: "elevador" | "texto" | "assento" | "tablet" | "chat" | "interruptor"; canalId?: string; assentoId?: string; alvo?: 1 | 2 };

export type Planta = {
    paredes: Parede[];
    // pedaço de parede acima das portas: só desenho, não bloqueia
    vergas: Parede[];
    moveis: Movel[];
    // tudo que o jogador não atravessa (paredes, degraus, móveis), no formato e altura de verdade
    solidos: Solido[];
    salas: SalaPlanta[];
    assentos: Assento[];
    degraus: Degrau[];
    quadros: Quadro[];
    interativos: Interativo[];
    hall: Ret;
    corredor: Ret;
    elevador: Ret;
    portaElevador: Ret;
    nascer: Ponto & { rot: number };
};

export const ESPESSURA = 0.2;
export const ALTURA = 3.2;
export const ALTURA_HALL = 4.2;
export const ALTURA_PORTA = 2.4;
export const ALTURA_ELEVADOR = 2.6;
export const ALTURA_CINEMA = 5;
export { DEGRAU_MAXIMO, RAIO_JOGADOR } from "./colisao";

const LARGURA = 10; // metade da largura do prédio
const CORREDOR = 2; // metade da largura do corredor
const VAGA = 8; // comprimento de uma sala comum ao longo do corredor
const VAGA_CINEMA = 16;
const VAGA_LAN = 16; // a LAN house ocupa 16 m de corredor (mesa LAN de um lado, lounge do outro)
const FILAS_CINEMA = 5;
const POLTRONAS_POR_FILA = 9;
const FUNDO_FILA = 1.9; // profundidade de cada degrau
const ALTURA_DEGRAU = 0.32;
const PORTA = 1.8;
const ELEVADOR = 1.3; // metade da largura da cabine
const FUNDO_ELEVADOR = 2.4;
const QUADROS_POR_PAREDE = 4;
const ESPACO_QUADRO = 2.6;

const e = ESPESSURA / 2;

// parede ao longo de x (em z fixo), com vãos [x1, x2] abertos nela
function paredeX(z: number, x1: number, x2: number, topo: number, tipo: TipoParede, vaos: [number, number][] = []): Parede[] {
    const pedacos: Parede[] = [];
    let inicio = x1;
    for (const [a, b] of [...vaos].sort((p, q) => p[0] - q[0])) {
        if (a > inicio) pedacos.push({ x1: inicio, x2: a, z1: z - e, z2: z + e, base: 0, topo, tipo });
        inicio = Math.max(inicio, b);
    }
    if (x2 > inicio) pedacos.push({ x1: inicio, x2, z1: z - e, z2: z + e, base: 0, topo, tipo });
    return pedacos;
}

// parede ao longo de z (em x fixo)
function paredeZ(x: number, z1: number, z2: number, topo: number, tipo: TipoParede, vaos: [number, number][] = []): Parede[] {
    return paredeX(0, z1, z2, topo, tipo, vaos).map((p) => ({ ...p, x1: x - e, x2: x + e, z1: p.x1, z2: p.x2 }));
}

// um ponto com giro (o "espaço" de um móvel, de uma sala, de uma asa do sofá)
type Referencia = Ponto & { rot: number };

// um espaço dentro de outro: o ponto (lx, lz) do pai, girado mais `giro`
function compor(pai: Referencia, lx: number, lz: number, giro = 0): Referencia {
    return { ...doMovel(pai, lx, lz), rot: pai.rot + giro };
}

// caixa de meia-largura hx e meio-fundo hz, de y = base até y = topo, no espaço `r`
function caixa(r: Referencia, hx: number, hz: number, topo: number, base = 0): Solido {
    return { forma: "caixa", x: r.x, z: r.z, rot: r.rot, hx, hz, base, topo };
}

function cilindro(p: Ponto, raio: number, topo: number, base = 0): Solido {
    return { forma: "cilindro", x: p.x, z: p.z, raio, base, topo };
}

// o que um móvel ocupa, peça por peça, com as medidas do desenho (Moveis.tsx)
function solidosDoMovel(m: Movel): Solido[] {
    const y = m.y ?? 0;
    if (m.tipo === "sofa") {
        // frente pra +z: assento com almofadas, encosto atrás e os dois braços
        return [
            caixa(m, 1.2, 0.475, y + 0.59, y),
            caixa(compor(m, 0, -0.36), 1.2, 0.12, y + 0.98, y),
            ...[-1.09, 1.09].map((x) => caixa(compor(m, x, 0), 0.11, 0.475, y + 0.76, y)),
        ];
    }
    // tampo sextavado (a mesa do hall)
    if (m.tipo === "mesa") return [cilindro(m, 0.56, y + 0.465, y)];
    // vaso e a copa (a copa só pega da altura do vaso pra cima)
    if (m.tipo === "planta") return [cilindro(m, 0.24, y + 0.52, y), cilindro(m, 0.36, y + 1.85, y + 0.6)];
    if (m.tipo === "torre") return [caixa(m, 0.16, 0.17, y + 1.1, y)];
    if (m.tipo === "pedestal") return [cilindro(m, 0.23, y + 1.02, y)];
    // tapete: plano no chão. Poltronas do cinema: a fileira inteira bloqueia junto (ver salaCinema)
    return [];
}

// leva um ponto do espaço do móvel (lx, lz) pro andar
function doMovel(m: Ponto & { rot: number }, lx: number, lz: number): Ponto {
    const c = Math.cos(m.rot);
    const s = Math.sin(m.rot);
    return { x: m.x + lx * c + lz * s, z: m.z - lx * s + lz * c };
}

// os três lugares de um sofá; quem senta olha pra frente do sofá
function assentosDoSofa(m: Movel, salaId: string | null, prefixo: string): Assento[] {
    return [0, -0.65, 0.65].map((lx, i) => ({ ...doMovel(m, lx, 0.05), id: `${prefixo}:${i}`, salaId, y: 0, rot: m.rot + Math.PI }));
}

export function dentro(r: Ret, p: Ponto, folga = 0) {
    return p.x > r.x1 - folga && p.x < r.x2 + folga && p.z > r.z1 - folga && p.z < r.z2 + folga;
}

export function gerarPlanta(canais: Pick<Canal, "id" | "tipo" | "modelo">[]): Planta {
    const voz = canais.filter((c) => c.tipo === "VOZ");
    const texto = canais.filter((c) => c.tipo === "TEXTO");

    // o hall cresce se tiver mais canais de texto do que cabe nas paredes
    const porParede = Math.max(QUADROS_POR_PAREDE, Math.ceil(texto.length / 2));
    const H = Math.max(12, porParede * ESPACO_QUADRO + 2);

    const paredes: Parede[] = [];
    const vergas: Parede[] = [];
    const moveis: Movel[] = [];
    const degraus: Degrau[] = [];
    const solidosExtra: Solido[] = [];

    // ---------- hall ----------
    paredes.push(...paredeX(H, -LARGURA, LARGURA, ALTURA_HALL, "hall", [[-1.1, 1.1]]));
    vergas.push({ x1: -1.1, x2: 1.1, z1: H - e, z2: H + e, base: ALTURA_ELEVADOR - 0.2, topo: ALTURA_HALL, tipo: "hall" });
    paredes.push(...paredeZ(-LARGURA, 0, H, ALTURA_HALL, "hall"));
    paredes.push(...paredeZ(LARGURA, 0, H, ALTURA_HALL, "hall"));
    paredes.push(...paredeX(0, -LARGURA, LARGURA, ALTURA_HALL, "hall", [[-CORREDOR, CORREDOR]]));
    vergas.push({ x1: -CORREDOR, x2: CORREDOR, z1: -e, z2: e, base: ALTURA, topo: ALTURA_HALL, tipo: "hall" });

    // ---------- elevador (cabine atrás da parede do fundo do hall) ----------
    paredes.push(...paredeZ(-ELEVADOR, H, H + FUNDO_ELEVADOR, ALTURA_ELEVADOR, "metal"));
    paredes.push(...paredeZ(ELEVADOR, H, H + FUNDO_ELEVADOR, ALTURA_ELEVADOR, "metal"));
    paredes.push(...paredeX(H + FUNDO_ELEVADOR, -ELEVADOR, ELEVADOR, ALTURA_ELEVADOR, "metal"));

    // ---------- salas de voz: cada uma no lado do corredor que estiver mais curto ----------
    // quanto de corredor cada lado já usou, e a altura da última parede de cada lado
    // (o cinema é mais alto e precisa completar a parede que divide com a sala anterior)
    const usado = { [-1]: 0, [1]: 0 } as Record<-1 | 1, number>;
    const alturaAnterior = { [-1]: ALTURA_HALL, [1]: ALTURA_HALL } as Record<-1 | 1, number>;

    const salas: SalaPlanta[] = voz.map((canal) => {
        const lado: -1 | 1 = usado[1] < usado[-1] ? 1 : -1;
        const cinema = canal.modelo === "CINEMA";
        const lan = canal.modelo === "LANHOUSE";
        const comprimento = cinema ? VAGA_CINEMA : lan ? VAGA_LAN : VAGA;
        const altura = cinema ? ALTURA_CINEMA : ALTURA;
        const zPerto = -usado[lado];
        const zLonge = zPerto - comprimento;
        usado[lado] += comprimento;

        const xFora = lado * LARGURA;
        const xMin = Math.min(lado * CORREDOR, xFora);
        const xMax = Math.max(lado * CORREDOR, xFora);

        paredes.push(...paredeZ(xFora, zLonge, zPerto, altura, "parede"));
        paredes.push(...paredeX(zLonge, xMin, xMax, altura, "parede"));
        // parede mais alta que a vizinha: completa por cima (só desenho)
        if (altura > alturaAnterior[lado]) {
            vergas.push({ x1: xMin, x2: xMax, z1: zPerto - e, z2: zPerto + e, base: alturaAnterior[lado], topo: altura, tipo: "parede" });
        }
        if (altura > ALTURA) {
            vergas.push({ x1: lado * CORREDOR - e, x2: lado * CORREDOR + e, z1: zLonge, z2: zPerto, base: ALTURA, topo: altura, tipo: "parede" });
        }
        alturaAnterior[lado] = altura;

        const base = {
            canalId: canal.id,
            lado,
            ret: { x1: xMin + e, x2: xMax - e, z1: zLonge + e, z2: zPerto - e },
            altura,
        };
        return cinema
            ? salaCinema(base, zLonge, zPerto, moveis, degraus, solidosExtra)
            : lan
                ? salaLanHouse(base, zLonge, zPerto, moveis, solidosExtra)
                : salaComum(base, zLonge, zPerto, solidosExtra);
    });
    const fim = -Math.max(VAGA, usado[-1], usado[1]) - 2;

    // ---------- corredor, com as portas das salas ----------
    const portas = (lado: number) =>
        salas.filter((s) => s.lado === lado).map((s): [number, number] => [s.porta.z - PORTA / 2, s.porta.z + PORTA / 2]);
    paredes.push(...paredeZ(-CORREDOR, fim, 0, ALTURA, "parede", portas(-1)));
    paredes.push(...paredeZ(CORREDOR, fim, 0, ALTURA, "parede", portas(1)));
    paredes.push(...paredeX(fim, -CORREDOR, CORREDOR, ALTURA, "parede"));
    for (const s of salas) {
        vergas.push({
            x1: s.porta.x - e, x2: s.porta.x + e, z1: s.porta.z - PORTA / 2, z2: s.porta.z + PORTA / 2,
            base: ALTURA_PORTA, topo: ALTURA, tipo: "parede",
        });
    }

    // ---------- canais de texto: quadros nas paredes laterais do hall ----------
    const quadros: Quadro[] = texto.map((canal, i) => {
        const lado = i < porParede ? -1 : 1;
        const n = i % porParede;
        return {
            canalId: canal.id,
            x: lado * (LARGURA - e - 0.03),
            z: H - 2.2 - n * ESPACO_QUADRO,
            rot: lado < 0 ? Math.PI / 2 : -Math.PI / 2,
        };
    });

    // ---------- móveis do hall ----------
    const zLounge = H / 2;
    moveis.push(
        { tipo: "tapete", x: 5.6, z: zLounge, rot: 0, cor: "#19191f", raio: 3 },
        { tipo: "mesa", x: 5.6, z: zLounge, rot: 0 },
        { tipo: "sofa", x: 5.6, z: zLounge - 2.1, rot: 0, cor: "#26262d" },
        { tipo: "sofa", x: 5.6, z: zLounge + 2.1, rot: Math.PI, cor: "#26262d" },
        { tipo: "planta", x: -2.1, z: H - 0.7, rot: 0 },
        { tipo: "planta", x: 2.1, z: H - 0.7, rot: 0 },
        { tipo: "planta", x: -LARGURA + 0.7, z: 0.8, rot: 0 },
        { tipo: "planta", x: LARGURA - 0.7, z: 0.8, rot: 0 },
        { tipo: "planta", x: LARGURA - 0.7, z: H - 0.8, rot: 0 },
    );
    if (texto.length <= porParede) moveis.push({ tipo: "planta", x: -LARGURA + 0.7, z: H - 0.8, rot: 0 });

    // os sofás do hall também dão pra sentar
    const assentos: Assento[] = [
        ...salas.flatMap((s) => s.assentos),
        ...moveis.filter((m) => m.tipo === "sofa" && dentro({ x1: -LARGURA, x2: LARGURA, z1: 0, z2: H }, m))
            .flatMap((m, i) => assentosDoSofa(m, null, `hall:${i}`)),
    ];

    const interativos: Interativo[] = [
        { id: "elevador", tipo: "elevador", x: 0, z: H + 0.3, raio: 1.9 },
        ...quadros.map((q): Interativo => ({
            id: `texto-${q.canalId}`,
            tipo: "texto",
            canalId: q.canalId,
            x: q.x + (q.x < 0 ? 1 : -1),
            z: q.z,
            raio: 1.6,
        })),
        ...assentos.map((a): Interativo => ({ id: `assento-${a.id}`, tipo: "assento", assentoId: a.id, x: a.x, z: a.z, raio: 1.15 })),
        // tablet: só com a mira em cima dele (ver Jogador), até 3,6 m dos olhos (alcança do sofá e dos puffs)
        ...salas.map((s): Interativo => ({ id: `tablet-${s.canalId}`, tipo: "tablet", canalId: s.canalId, alvo: 1, x: s.tablet.x, z: s.tablet.z, raio: 3.6 })),
        // LAN house: o tablet da segunda TV (lounge) e o interruptor da luz (perto e olhando, como o elevador)
        ...salas.flatMap((s): Interativo[] => (s.tablet2 ? [{ id: `tablet2-${s.canalId}`, tipo: "tablet", canalId: s.canalId, alvo: 2, x: s.tablet2.x, z: s.tablet2.z, raio: 3.6 }] : [])),
        ...salas.flatMap((s): Interativo[] => (s.interruptor ? [{ id: `interruptor-${s.canalId}`, tipo: "interruptor", canalId: s.canalId, x: s.interruptor.x, z: s.interruptor.z, raio: 1.5 }] : [])),
        // holograma do chat: só com a mira em cima da tela dele (ver Jogador), até 9 m
        ...salas.flatMap((s): Interativo[] => (s.chat ? [{ id: `chat-${s.canalId}`, tipo: "chat", canalId: s.canalId, x: s.chat.x, z: s.chat.z, raio: 9 }] : [])),
    ];

    const solidos: Solido[] = [
        ...paredes.map((p) => solidoDeRet(p, p.base, p.topo)),
        // degraus do cinema: dá pra subir andando (cada um tem menos que DEGRAU_MAXIMO)
        ...degraus.map((d) => solidoDeRet(d, 0, d.topo)),
        ...moveis.flatMap(solidosDoMovel),
        ...solidosExtra,
    ];

    return {
        paredes,
        vergas,
        moveis,
        solidos,
        salas,
        assentos,
        degraus,
        quadros,
        interativos,
        hall: { x1: -LARGURA, x2: LARGURA, z1: 0, z2: H },
        corredor: { x1: -CORREDOR, x2: CORREDOR, z1: fim, z2: 0 },
        elevador: { x1: -ELEVADOR, x2: ELEVADOR, z1: H, z2: H + FUNDO_ELEVADOR },
        portaElevador: { x1: -1.1, x2: 1.1, z1: H - 0.06, z2: H + 0.06 },
        nascer: { x: 0, z: H + FUNDO_ELEVADOR / 2 + 0.1, rot: 0 },
    };
}

type BaseSala = Pick<SalaPlanta, "canalId" | "lado" | "ret" | "altura">;

// ---------- sala gamer (a sala comum) ----------
// Medidas no "espaço da sala": origem no centro do piso, -z = parede da TV, +x = lado da porta.
// O andar leva pro mundo girando pelo tv.rot da sala (ver noMundo). O desenho (SalaGamer.tsx)
// usa as mesmas medidas, então colisão, assentos e móveis batem.
export const GAMER = {
    meia: 3.9, // metade do vão interno: a sala tem 7,8 × 7,8 m
    tvZ: -3.7,
    mesa: { x: 0, z: 0.2, raio: 0.58 },
    // sofá em V: dois módulos com o vértice pra trás, abertos pra TV. fora = lado do braço
    asas: [
        { x: -1.2, z: 2.15, giro: -0.48, fora: -1 },
        { x: 1.2, z: 2.15, giro: 0.48, fora: 1 },
    ],
    comprimentoAsa: 2.4,
    mesinha: { x: 0, z: 3.0, raio: 0.28 },
    rack: { z: -3.5, largura: 3.2 },
    torres: [-2.55, 2.55].map((x) => ({ x, z: -3.45 })),
    puffs: [
        { x: -2.95, z: -1.35, giro: -0.5 },
        { x: -3.0, z: 0.35, giro: -0.8 },
    ],
    fliperama: { x: 3.25, z: -2.85, giro: -0.7 },
    vaso: { x: -3.4, z: -3.35 },
    prateleira: { z: -1.2, comprimento: 2.0 },
    portaX: 2.6,
    // holograma do chat da call na parede da porta, atrás do sofá (quem está no sofá vira e vê)
    holograma: { x: -0.8, y: 2.0, largura: 3.6, altura: 1.8 },
} as const;

// do espaço da sala pro andar
function noMundo(sala: Ponto & { rot: number }, lx: number, lz: number): Ponto {
    return doMovel(sala, lx, lz);
}

// sala gamer: TV na parede de fora, rack e torres embaixo, mesa hexagonal no meio,
// sofá em V atrás dela, puffs, fliperama e prateleiras. A porta fica num canto (o sofá ocupa o meio)
function salaComum(base: BaseSala, zLonge: number, zPerto: number, solidos: Solido[]): SalaPlanta {
    const { lado, canalId } = base;
    const zc = (zPerto + zLonge) / 2;
    const xc = lado * (CORREDOR + LARGURA) / 2;
    const virada = -lado * Math.PI / 2; // de frente pra sala, como a TV
    const sala = { x: xc, z: zc, rot: virada };
    const g = GAMER;
    const p = (lx: number, lz: number) => noMundo(sala, lx, lz);

    // assentos: três por asa do sofá (do braço pro vértice) e os dois puffs
    const assentosAsa = g.asas.map((a, i) =>
        [0.62, -0.08, -0.78].map((f, k): Assento => {
            const local = doMovel({ x: a.x, z: a.z, rot: a.giro }, f * a.fora, -0.08);
            return { ...p(local.x, local.z), id: `${canalId}:${i}:${k}`, salaId: canalId, y: 0, rot: a.giro + virada };
        }),
    );
    const assentos: Assento[] = [
        // as duas asas intercaladas: o meio de cada uma primeiro, depois as pontas
        ...[1, 0, 2].flatMap((k) => [assentosAsa[0][k], assentosAsa[1][k]]),
        ...g.puffs.map((pf, i): Assento => ({ ...p(pf.x + 0.12, pf.z - 0.05), id: `${canalId}:puff:${i}`, salaId: canalId, y: 0, rot: -0.35 + virada })),
    ];

    // lugares em pé em volta da mesa, do lado da TV (atrás dela fica o sofá). Passou de 7, abre uma roda maior
    const roda = (raio: number, graus: number[]) => graus.map((d) => {
        const a = (d * Math.PI) / 180;
        return { x: g.mesa.x + Math.sin(a) * raio, z: g.mesa.z - Math.cos(a) * raio };
    });
    const lugares = [
        ...roda(1.3, [0, -40, 40, -80, 80, -115, 115]),
        ...roda(2.1, [0, -20, 20, -55, 55, -90, 90]),
        { x: -1.0, z: -2.5 },
        { x: 1.0, z: -2.5 },
    ].map((l) => ({ ...p(l.x, l.z), rot: Math.atan2(l.x - g.mesa.x, l.z - g.mesa.z) + virada }));

    // os móveis como sólidos, peça por peça, com as medidas do desenho (SalaGamer.tsx)
    const ref: Referencia = sala;
    const L = g.comprimentoAsa / 2;
    solidos.push(
        // sofá em V: em cada asa (frente pra -z), assento com almofadas, encosto e o braço de fora
        ...g.asas.flatMap((a) => {
            const asa = compor(ref, a.x, a.z, a.giro);
            return [
                caixa(asa, L, 0.475, 0.56),
                caixa(compor(asa, 0, 0.4), L, 0.12, 0.97),
                caixa(compor(asa, a.fora * (L - 0.1), 0), 0.12, 0.475, 0.72),
            ];
        }),
        // mesas sextavadas (mesa de centro e a do vértice do sofá)
        cilindro(p(g.mesa.x, g.mesa.z), 0.56, 0.465),
        cilindro(p(g.mesinha.x, g.mesinha.z), g.mesinha.raio, 0.5),
        caixa(compor(ref, 0, g.rack.z), g.rack.largura / 2, 0.24, 0.48),
        ...g.torres.map((t) => caixa(compor(ref, t.x, t.z), 0.18, 0.18, 1.12)),
        // puffs: a bola achatada e o encosto atrás
        ...g.puffs.flatMap((pf) => [
            cilindro(p(pf.x, pf.z), 0.52, 0.6),
            cilindro(p(pf.x + Math.sin(pf.giro) * 0.25, pf.z + Math.cos(pf.giro) * 0.25), 0.32, 0.87, 0.3),
        ]),
        // fliperama: o gabinete e o painel dos botões, que avança pra frente
        ...(() => {
            const f = compor(ref, g.fliperama.x, g.fliperama.z, g.fliperama.giro);
            return [caixa(f, 0.36, 0.3, 1.8), caixa(compor(f, 0, 0.42), 0.36, 0.13, 1.0, 0.85)];
        })(),
        // vaso e a copa da planta
        cilindro(p(g.vaso.x, g.vaso.z), 0.24, 0.45),
        cilindro(p(g.vaso.x, g.vaso.z), 0.4, 1.7, 0.58),
        // prateleiras na parede (dá pra passar agachado embaixo da de baixo)
        ...[1.55, 2.15].map((y) => caixa(compor(ref, g.meia - 0.16, g.prateleira.z), 0.15, g.prateleira.comprimento / 2, y + 0.02, y - 0.02)),
    );

    // surround: torres dos lados da TV, soundbar em cima do rack e duas caixas nas paredes do fundo.
    // Quem olha pra TV olha pra -z da sala; a direita dessa pessoa é +x
    const torre = (i: number): CaixaSom => ({ ...p(g.torres[i].x, g.torres[i].z), y: 1.0, tipo: "torre", rot: virada });
    // traseiras um pouco atrás do sofá e não muito acima de quem está sentado (orelha em ~1,1 m)
    const naParede = (s: -1 | 1): CaixaSom => ({ ...p(s * (g.meia - 0.12), 3.0), y: 2.0, tipo: "parede", rot: -s * Math.PI / 2 + virada });
    const caixasSom: CaixaSom[] = [
        torre(0),
        { ...p(0, g.rack.z - 0.08), y: 0.535, tipo: "barra", rot: virada },
        torre(1),
        naParede(-1),
        naParede(1),
    ];

    const tv = p(0, g.tvZ);
    const porta = p(g.portaX, g.meia + e);
    return {
        ...base,
        modelo: "PADRAO",
        centro: { x: xc, z: zc },
        // a porta fica exatamente na parede do corredor
        porta: { x: lado * CORREDOR, z: porta.z },
        tv: { ...tv, rot: virada, y: 1.75, largura: 4.0 },
        assentos,
        caixasSom,
        // deitado no tampo da mesa hexagonal (topo em 0,465)
        tablet: { ...p(g.mesa.x, g.mesa.z), y: 0.473, rot: virada, inclinacao: -Math.PI / 2 },
        lugares,
        // a tela do holograma fica 14 cm à frente da parede da porta, virada pra dentro da sala (-z)
        chat: {
            ...p(g.holograma.x, g.meia - 0.14),
            y: g.holograma.y,
            ...(() => {
                const c = Math.cos(virada);
                const sn = Math.sin(virada);
                // direções do espaço da sala pro andar: -z (normal) e +x (largura)
                return { nx: -sn, nz: -c, ux: c, uz: -sn };
            })(),
            largura: g.holograma.largura,
            altura: g.holograma.altura,
        },
    };
}

// cinema: telão na parede do fundo (zLonge), porta perto dele, e fileiras de poltronas
// em degraus subindo até o fundo. O corredor lateral (do lado da porta) vira escada
function salaCinema(base: BaseSala, zLonge: number, zPerto: number, moveis: Movel[], degraus: Degrau[], solidos: Solido[]): SalaPlanta {
    const { lado, canalId, ret } = base;
    const xc = lado * (CORREDOR + LARGURA) / 2;
    const zFilas = zLonge + 5; // começo dos degraus: 5 m de chão livre na frente do telão

    const assentos: Assento[] = [];
    for (let fila = 0; fila < FILAS_CINEMA; fila++) {
        const z1 = zFilas + fila * FUNDO_FILA;
        const ultima = fila === FILAS_CINEMA - 1;
        const topo = (fila + 1) * ALTURA_DEGRAU;
        degraus.push({ x1: ret.x1, x2: ret.x2, z1, z2: ultima ? ret.z2 : z1 + FUNDO_FILA, topo });

        // poltronas no fundo do degrau (na frente fica o espaço das pernas), olhando pro telão
        const zPoltrona = z1 + 1.3;
        for (let k = 0; k < POLTRONAS_POR_FILA; k++) {
            const x = lado * (CORREDOR + 1.6 + k * 0.72);
            moveis.push({ tipo: "poltrona", x, z: zPoltrona, rot: Math.PI, y: topo, cor: "#2a2a33" });
            assentos.push({ id: `${canalId}:${fila}:${k}`, salaId: canalId, x, z: zPoltrona, y: topo, rot: 0 });
        }
        // a fileira bloqueia inteira; entra-se pelo espaço das pernas, vindo do corredor lateral
        const xs = [lado * (CORREDOR + 1.25), lado * (CORREDOR + 1.6 + (POLTRONAS_POR_FILA - 1) * 0.72 + 0.4)];
        solidos.push(solidoDeRet({ x1: Math.min(...xs), x2: Math.max(...xs), z1: zPoltrona - 0.32, z2: zPoltrona + 0.38 }, topo, topo + 1.15));
    }

    // ordem de ocupação de quem está pelo modo clássico: fileiras do meio e poltronas do centro primeiro
    const meio = (POLTRONAS_POR_FILA - 1) / 2;
    const ordemFila = [2, 1, 3, 0, 4];
    assentos.sort((p, q) => {
        const [, fp, kp] = p.id.split(":").map(Number);
        const [, fq, kq] = q.id.split(":").map(Number);
        return ordemFila.indexOf(fp) - ordemFila.indexOf(fq) || Math.abs(kp - meio) - Math.abs(kq - meio);
    });

    // surround: as da frente atrás do telão (como num cinema), as traseiras nas paredes laterais.
    // Quem olha pro telão olha pra -z; a direita dessa pessoa é +x
    const zFundo = ret.z2 - 4;
    const caixasSom: CaixaSom[] = [
        { x: xc - 2.4, y: 2.6, z: zLonge + 0.5, tipo: "oculta", rot: 0 },
        { x: xc, y: 2.6, z: zLonge + 0.5, tipo: "oculta", rot: 0 },
        { x: xc + 2.4, y: 2.6, z: zLonge + 0.5, tipo: "oculta", rot: 0 },
        { x: ret.x1 + 0.16, y: 3.4, z: zFundo, tipo: "parede", rot: Math.PI / 2 },
        { x: ret.x2 - 0.16, y: 3.4, z: zFundo, tipo: "parede", rot: -Math.PI / 2 },
    ];
    const pedestal = { x: lado * (CORREDOR + 1.3), z: zLonge + 3.7 };
    moveis.push({ tipo: "pedestal", x: pedestal.x, z: pedestal.z, rot: 0 });

    return {
        ...base,
        modelo: "CINEMA",
        caixasSom,
        // em cima do pedestal, inclinado pra quem chega pela porta
        tablet: { x: pedestal.x, y: 1.08, z: pedestal.z, rot: -lado * Math.PI / 2, inclinacao: -0.6 },
        centro: { x: xc, z: (zLonge + zPerto) / 2 },
        porta: { x: lado * CORREDOR, z: zLonge + 2.2 },
        tv: { x: xc, z: zLonge + e + 0.06, rot: 0, y: 2.75, largura: 7.1 },
        chat: null,
        assentos,
        // não coube nas 45 poltronas: em pé na frente do telão
        lugares: Array.from({ length: 12 }, (_, n) => ({ x: xc + (n % 6 - 2.5) * 1.1, z: zLonge + 2.8 + Math.floor(n / 6) * 1.1, rot: 0 })),
    };
}

// ---------- LAN house ----------
// Medidas no "espaço da sala" (igual à sala gamer): origem no centro do piso, -z = parede da TV
// (a de fora), +z = parede do corredor (a porta), x ao longo do corredor. A sala tem 15,8 × 7,8 m:
// de um lado a mesa LAN (10 PCs, telão na parede) e do outro o lounge (sofá em U + TV).
// O desenho (LanHouse.tsx) usa estas medidas, então colisão, assentos e móveis batem.
export const LAN = {
    meiaX: 7.9,
    meiaZ: 3.9,
    lanX: -4,
    loungeX: 4,
    mesa: { z0: -3.72, comprimento: 6.05, largura: 1.7, altura: 0.75 },
    cadeiraX: 1.28,
    sofa: { z: 0.9, modulo: 0.85, canto: 0.95 },
    mesaCentro: { x: 4, z: -0.45 },
    portaX: -0.4,
    interruptor: { x: 0.9, y: 1.3 },
    tv1: { x: -4, y: 1.98, largura: 4.0 },
    tv2: { x: 4, y: 1.72, largura: 3.6 },
    pedestal: { x: -4, z: 2.85 },
    balcao: { x: -5.6, z: 3.55 },
    geladeira: { x: -7.45, z: 3.55 },
} as const;

// o setup i (0..4) de cada lado da mesa fica neste z
export const zSetupLan = (i: number) => LAN.mesa.z0 + 0.6 + i * 1.2;
export const idAssentoLan = (canalId: string, lado: -1 | 1, i: number) => canalId + ":lan:" + (lado < 0 ? 0 : 1) + ":" + i;

// módulos do sofá em U, no espaço do sofá (origem no meio das costas, girado 180° na sala: o U abre pra TV).
// xu/zu: centro do módulo; ryu: pra onde ele olha (0 = pra frente do U); w: largura; costas: b = atrás, l/r = laterais
export type ModuloSofaLan = { xu: number; zu: number; ryu: number; w: number; costas: string };
export function modulosSofaLan(): ModuloSofaLan[] {
    const { modulo: SW, canto: CW } = LAN.sofa;
    const cxo = 2 * SW + CW / 2;
    const lista: ModuloSofaLan[] = [];
    for (let i = 0; i < 4; i++) lista.push({ xu: -1.5 * SW + i * SW, zu: 0, ryu: 0, w: SW, costas: "b" });
    lista.push({ xu: -cxo, zu: 0, ryu: 0, w: CW, costas: "bl" }, { xu: cxo, zu: 0, ryu: 0, w: CW, costas: "br" });
    for (let i = 0; i < 2; i++) {
        const zu = CW / 2 + SW / 2 + i * SW;
        lista.push({ xu: -cxo, zu, ryu: Math.PI / 2, w: SW, costas: "b" }, { xu: cxo, zu, ryu: -Math.PI / 2, w: SW, costas: "b" });
    }
    return lista;
}

// totens de LED: x, z no espaço da sala (parede do corredor, mais dois na parede da direita)
export const TOTENS_LAN: readonly (readonly [number, number])[] = [
    [-3.4, 3.68], [-2.2, 3.68], [1.9, 3.68], [3.1, 3.68], [4.3, 3.68], [5.5, 3.68], [6.7, 3.68],
    [7.68, -1.5], [7.68, 1.5],
];

// LAN house: 10 setups na mesa + 10 lugares no sofá em U, duas TVs (cada uma com o seu tablet)
function salaLanHouse(base: BaseSala, zLonge: number, zPerto: number, moveis: Movel[], solidos: Solido[]): SalaPlanta {
    const { lado, canalId } = base;
    const zc = (zPerto + zLonge) / 2;
    const xc = lado * (CORREDOR + LARGURA) / 2;
    const virada = -lado * Math.PI / 2;
    const sala: Referencia = { x: xc, z: zc, rot: virada };
    const L = LAN;
    const BZ = -L.meiaZ;
    const p = (lx: number, lz: number) => noMundo(sala, lx, lz);
    const tzMesa = L.mesa.z0 + L.mesa.comprimento / 2;

    // 10 PCs, de frente pra trás, esquerda e direita da mesa. Quem senta olha pra mesa
    const assentos: Assento[] = [];
    for (let i = 0; i < 5; i++) {
        for (const s of [-1, 1] as const) {
            assentos.push({ ...p(L.lanX + s * L.cadeiraX, zSetupLan(i)), id: idAssentoLan(canalId, s, i), salaId: canalId, y: 0, rot: s * Math.PI / 2 + virada });
        }
    }

    // sofá em U: 10 lugares. O sofá está girado 180° na sala, então (xu, zu) vira (loungeX - xu, sofa.z - zu)
    const modulos = modulosSofaLan();
    const doSofa = (xu: number, zu: number) => ({ x: L.loungeX - xu, z: L.sofa.z - zu });
    const ordemSofa = [1, 2, 0, 3, 4, 5, 6, 7, 8, 9];
    ordemSofa.forEach((k, n) => {
        const m = modulos[k]!;
        const c = doSofa(m.xu, m.zu);
        // um pouco pra frente do centro do módulo (a almofada do assento é mais pra frente)
        const frente = { x: -Math.sin(m.ryu), z: -Math.cos(m.ryu) };
        assentos.push({ ...p(c.x + frente.x * 0.06, c.z + frente.z * 0.06), id: canalId + ":sofa:" + n, salaId: canalId, y: 0, rot: m.ryu + virada });
    });

    // ---------- colisão ----------
    const ref: Referencia = sala;
    solidos.push(
        // a mesa LAN (os monitores e a divisória ficam em cima dela)
        caixa(compor(ref, L.lanX, tzMesa), L.mesa.largura / 2, L.mesa.comprimento / 2, L.mesa.altura),
        // só o encosto de cada cadeira bloqueia (o assento é onde a pessoa senta)
        ...[-1, 1].flatMap((s) => [0, 1, 2, 3, 4].map((i) => caixa(compor(ref, L.lanX + s * (L.cadeiraX + 0.3), zSetupLan(i)), 0.07, 0.27, 1.25))),
        // balcão e geladeira
        caixa(compor(ref, L.balcao.x, L.balcao.z), 1.3, 0.3, 1.04),
        caixa(compor(ref, L.geladeira.x, L.geladeira.z), 0.35, 0.3, 1.9),
        // rack da TV do lounge e a mesa de centro
        caixa(compor(ref, L.loungeX, BZ + 0.3), 1.9, 0.225, 0.45),
        cilindro(p(L.mesaCentro.x, L.mesaCentro.z), 0.5, 0.45),
    );
    // sofá: em cada módulo, o assento com almofadas, o encosto e as laterais dos cantos
    for (const m of modulos) {
        const c = doSofa(m.xu, m.zu);
        const mod = compor(ref, c.x, c.z, m.ryu + Math.PI);
        solidos.push(caixa(mod, m.w / 2, 0.475, 0.56));
        if (m.costas.includes("b")) solidos.push(caixa(compor(mod, 0, -0.375), m.w / 2, 0.1, 0.98));
        if (m.costas.includes("l")) solidos.push(caixa(compor(mod, -m.w / 2 + 0.1, 0), 0.1, 0.475, 0.98));
        if (m.costas.includes("r")) solidos.push(caixa(compor(mod, m.w / 2 - 0.1, 0), 0.1, 0.475, 0.98));
    }
    // encosto no fim de cada braço do U
    {
        const { modulo: SW, canto: CW } = L.sofa;
        const cxo = 2 * SW + CW / 2;
        const endZ = CW / 2 + 2 * SW + 0.1;
        for (const s of [-1, 1]) {
            const c = doSofa(s * cxo, endZ);
            solidos.push(caixa(compor(ref, c.x, c.z, Math.PI), 0.475, 0.1, 0.9));
        }
    }
    // totens de LED nas paredes
    for (const [x, z] of TOTENS_LAN) solidos.push(caixa(compor(ref, x, z), 0.07, 0.07, 2.15));

    // plantas nos cantos do fundo e no canto da porta
    for (const [x, z] of [[-L.meiaX + 0.5, BZ + 0.5], [L.meiaX - 0.5, BZ + 0.5], [L.meiaX - 0.5, L.meiaZ - 0.6]] as const) {
        const w = p(x, z);
        moveis.push({ tipo: "planta", x: w.x, z: w.z, rot: 0 });
    }
    // o pedestal do tablet do telão (na ponta da mesa LAN)
    const pedestal = p(L.pedestal.x, L.pedestal.z);
    moveis.push({ tipo: "pedestal", x: pedestal.x, z: pedestal.z, rot: 0 });

    // surround de cada TV: três atrás da parede (ocultas) e duas na parede do corredor
    const surround = (cx: number): CaixaSom[] => [
        { ...p(cx - 2.4, BZ + 0.5), y: 2.4, tipo: "oculta", rot: virada },
        { ...p(cx, BZ + 0.5), y: 2.4, tipo: "oculta", rot: virada },
        { ...p(cx + 2.4, BZ + 0.5), y: 2.4, tipo: "oculta", rot: virada },
        { ...p(cx - 2.4, L.meiaZ - 0.12), y: 2.0, tipo: "parede", rot: Math.PI + virada },
        { ...p(cx + 2.4, L.meiaZ - 0.12), y: 2.0, tipo: "parede", rot: Math.PI + virada },
    ];

    // quem está pelo modo clássico e não coube nos 20 lugares fica em pé entre as duas áreas
    const lugares = Array.from({ length: 12 }, (_, n) => {
        const l = { x: -1.6 + (n % 4) * 1.0, z: -2.4 + Math.floor(n / 4) * 0.9 };
        return { ...p(l.x, l.z), rot: virada };
    });

    const porta = p(L.portaX, L.meiaZ + e);
    return {
        ...base,
        modelo: "LANHOUSE",
        centro: { x: xc, z: zc },
        porta: { x: lado * CORREDOR, z: porta.z },
        tv: { ...p(L.tv1.x, BZ + 0.08), rot: virada, y: L.tv1.y, largura: L.tv1.largura },
        tv2: { ...p(L.tv2.x, BZ + 0.08), rot: virada, y: L.tv2.y, largura: L.tv2.largura },
        assentos,
        caixasSom: surround(L.lanX),
        caixasSom2: surround(L.loungeX),
        // o tablet do telão: num pedestal na ponta da mesa, inclinado pra quem chega pela porta
        tablet: { ...pedestal, y: 1.08, rot: virada, inclinacao: -0.6 },
        // o tablet da TV do lounge: deitado na mesa de centro (topo em 0,445)
        tablet2: { ...p(L.mesaCentro.x, L.mesaCentro.z), y: 0.452, rot: virada, inclinacao: -Math.PI / 2 },
        interruptor: p(L.interruptor.x, L.meiaZ - 0.12),
        lugares,
        chat: null,
    };
}

// onde a pessoa aparece ao abrir o 3D já numa call deste andar: logo depois da porta da sala
export function nascerNaSala(sala: SalaPlanta): Ponto & { rot: number } {
    return { x: sala.porta.x + sala.lado * 1.4, z: sala.porta.z, rot: -sala.lado * Math.PI / 2 };
}
