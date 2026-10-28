// Sala gamer (a sala de voz comum): grafite escuro, ripas acústicas e LEDs de duas cores
// (A = principal, B = secundária) com a paleta escolhida no controle da sala.
//
// O desenho é feito uma vez só, no espaço da sala (ver GAMER em planta.ts), e juntado numa
// geometria por material. Os móveis de todas as salas saem num desenho por material
// (instancing); os LEDs são por sala, porque cada sala tem a sua cor.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { EstadoLed } from "../../tipos";
import { Instancias, material } from "./Moveis";
import { paletaDaSala } from "./paletas";
import { ALTURA, GAMER, LAN, type SalaPlanta } from "./planta";
import { texturaBrilho, texturaLavagem } from "./texturas";

const H = ALTURA;
const M = GAMER.meia;
const B = -M; // parede da TV

// tela do fliperama: pixel art pequena
function texturaFliperama() {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    g.fillStyle = "#0b0b10";
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 18; i++) {
        g.fillStyle = ["#7c5cff", "#22d3ee", "#f2f2f4"][i % 3];
        g.fillRect(((i * 37) % 112) + 4, ((i * 23) % 100) + 6, 10, 10);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    return t;
}

// materiais dos móveis (iguais em todas as salas)
const SOLIDOS: Record<string, THREE.Material> = {
    fundo: material("#141418", 0.85),
    ripa: material("#0e0e11", 0.85),
    rack: material("#0d0d10", 0.5),
    branco: material("#e9e9ec", 0.35),
    caixa: material("#0b0b0d", 0.5),
    cone: material("#18181c", 0.85),
    tapete: material("#19191f", 1),
    filete: material("#2c2c36", 1),
    mesa: material("#0c0c0f", 0.2, 0.4),
    pe: material("#0c0c0f", 0.4),
    controle: material("#1a1a1f", 0.4),
    tecido: material("#26262d", 0.85),
    almofada: material("#2e2e36", 0.85),
    decorativa: material("#3a3a44", 0.85),
    puff: material("#202027", 1),
    puff2: material("#24242c", 1),
    hexApagado: material("#17171b", 0.6),
    prateleira: material("#0f0f12", 0.85),
    figura: material("#2b2b33", 0.85),
    figura2: material("#1d1d22", 0.85),
    fliperama: material("#0f0f12", 0.5),
    painel: material("#18181d", 0.85),
    vaso: material("#0c0c0e", 0.5),
    folha: new THREE.MeshStandardMaterial({ color: "#1e3f2f", roughness: 0.85, flatShading: true }),
    galho: material("#2a1d14", 0.85),
    haste: material("#222226", 0.85),
};

// o que é LED (muda de cor por sala)
export const BALDES_LED = ["ledA", "ledB", "brilhoA", "brilhoB", "lavagemA", "anel"] as const;
type BaldeLed = (typeof BALDES_LED)[number];

// junta peças soltas em uma geometria por "balde" (material). Também usada pelo cinema
export class Montagem {
    baldes = new Map<string, THREE.BufferGeometry[]>();
    base = new THREE.Matrix4();

    por(balde: string, geo: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, escala: [number, number, number] = [1, 1, 1]) {
        const m = new THREE.Matrix4().compose(
            new THREE.Vector3(x, y, z),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
            new THREE.Vector3(...escala),
        );
        // tudo sem índice: o merge exige que todas sejam iguais nisso
        const g = geo.index ? geo.toNonIndexed() : geo.clone();
        g.applyMatrix4(m.premultiply(this.base));
        const lista = this.baldes.get(balde) ?? [];
        lista.push(g);
        this.baldes.set(balde, lista);
    }

    caixa(balde: string, l: number, a: number, p: number, x: number, y: number, z: number, ry = 0) {
        this.por(balde, new THREE.BoxGeometry(l, a, p), x, y, z, 0, ry);
    }

    // desenha dentro de um grupo (posição + giro em y)
    dentro(x: number, z: number, ry: number, desenhar: () => void) {
        const antes = this.base;
        this.base = antes.clone().multiply(new THREE.Matrix4().makeRotationY(ry).setPosition(x, 0, z));
        desenhar();
        this.base = antes;
    }

    juntar() {
        const saida = new Map<string, THREE.BufferGeometry>();
        this.baldes.forEach((lista, chave) => {
            const g = mergeGeometries(lista);
            lista.forEach((p) => p.dispose());
            if (g) {
                g.computeBoundingSphere();
                saida.set(chave, g);
            }
        });
        return saida;
    }
}

let kit: { solidos: [string, THREE.BufferGeometry, THREE.Material][]; leds: Map<string, THREE.BufferGeometry> } | null = null;

function montarKit() {
    if (kit) return kit;
    const k = new Montagem();
    const plano = (l: number, a: number) => new THREE.PlaneGeometry(l, a);
    const arred = (l: number, a: number, p: number, r = 0.05) => new RoundedBoxGeometry(l, a, p, 2, r);

    // ---------- parede da TV: fundo + ripas acústicas ----------
    k.por("fundo", plano(2 * M, H), 0, H / 2, B + 0.004);
    for (let i = 0; i < 39; i++) k.caixa("ripa", 0.07, H - 0.3, 0.05, -3.8 + i * 0.2, H / 2 - 0.1, B + 0.03);

    // ---------- sanca de LED (A) no perímetro + a luz dela lavando as paredes ----------
    const cy = H - 0.06;
    k.caixa("ledA", 2 * M - 0.2, 0.025, 0.025, 0, cy, B + 0.1);
    k.caixa("ledA", 2 * M - 0.2, 0.025, 0.025, 0, cy, M - 0.1);
    k.caixa("ledA", 0.025, 0.025, 2 * M - 0.2, -M + 0.1, cy, 0);
    k.caixa("ledA", 0.025, 0.025, 2 * M - 0.2, M - 0.1, cy, 0);
    const lav = 0.8;
    const ly = H - 0.08 - lav / 2;
    k.por("lavagemA", plano(2 * M - 0.2, lav), 0, ly, B + 0.06);
    k.por("lavagemA", plano(2 * M - 0.2, lav), 0, ly, M - 0.01, 0, Math.PI);
    k.por("lavagemA", plano(2 * M - 0.2, lav), -M + 0.01, ly, 0, 0, Math.PI / 2);
    k.por("lavagemA", plano(2 * M - 0.2, lav), M - 0.01, ly, 0, 0, -Math.PI / 2);

    // ---------- bias light atrás da TV (a TV em si é do Predio) ----------
    const sy = 1.75;
    const bz = B + 0.12;
    k.caixa("ledA", 4.24, 0.03, 0.02, 0, sy + 1.22, bz);
    k.caixa("ledA", 4.24, 0.03, 0.02, 0, sy - 1.22, bz);
    k.caixa("ledA", 0.03, 2.47, 0.02, -2.12, sy, bz);
    k.caixa("ledA", 0.03, 2.47, 0.02, 2.12, sy, bz);
    k.por("brilhoA", plano(5.8, 3.4), 0, sy, B + 0.07);

    // ---------- rack, console e fita embaixo (B) ----------
    const rz = GAMER.rack.z;
    k.caixa("rack", GAMER.rack.largura, 0.42, 0.48, 0, 0.27, rz);
    k.caixa("ledB", GAMER.rack.largura - 0.2, 0.02, 0.02, 0, 0.05, rz + 0.25);
    k.por("brilhoB", plano(3.8, 1.0), 0, 0.006, rz + 0.55, -Math.PI / 2);
    k.caixa("branco", 0.42, 0.08, 0.32, 1.0, 0.52, rz + 0.02);
    k.caixa("ledB", 0.12, 0.004, 0.004, 1.0, 0.545, rz + 0.185);

    // ---------- torres de som com anéis de LED (B) ----------
    for (const t of GAMER.torres) {
        k.caixa("caixa", 0.36, 1.12, 0.36, t.x, 0.56, t.z);
        const fz = t.z + 0.185;
        k.por("cone", new THREE.CylinderGeometry(0.12, 0.12, 0.02, 32), t.x, 0.42, fz, Math.PI / 2);
        k.por("cone", new THREE.CylinderGeometry(0.06, 0.06, 0.02, 24), t.x, 0.82, fz, Math.PI / 2);
        k.por("ledB", new THREE.TorusGeometry(0.135, 0.008, 8, 48), t.x, 0.42, fz + 0.012);
        k.por("ledB", new THREE.TorusGeometry(0.075, 0.006, 8, 32), t.x, 0.82, fz + 0.012);
    }

    // ---------- tapete e mesa de centro hexagonais (borda de LED A) ----------
    const { x: mx, z: mz, raio } = GAMER.mesa;
    k.por("tapete", new THREE.CylinderGeometry(2.2, 2.2, 0.02, 6), mx, 0.01, mz, 0, Math.PI / 6);
    k.por("filete", new THREE.RingGeometry(1.92, 1.98, 6, 1, Math.PI / 6 + Math.PI / 2), mx, 0.022, mz, -Math.PI / 2);
    k.por("mesa", new THREE.CylinderGeometry(raio, raio, 0.05, 6), mx, 0.44, mz);
    k.por("ledA", new THREE.CylinderGeometry(raio + 0.015, raio + 0.015, 0.012, 6), mx, 0.41, mz);
    k.por("pe", new THREE.CylinderGeometry(0.1, 0.22, 0.4, 6), mx, 0.2, mz);
    // controles de videogame (o tablet fica no meio, é do Predio)
    k.caixa("branco", 0.16, 0.03, 0.1, mx - 0.33, 0.48, mz + 0.18, 0.4);
    k.caixa("controle", 0.16, 0.03, 0.1, mx + 0.3, 0.48, mz - 0.22, -0.3);

    // ---------- sofá em V: duas asas, vértice atrás, abertas pra TV ----------
    const L = GAMER.comprimentoAsa;
    for (const a of GAMER.asas) {
        k.dentro(a.x, a.z, a.giro, () => {
            k.por("tecido", arred(L, 0.36, 0.95, 0.06), 0, 0.24, 0);
            for (const x of [-0.6, 0.55]) k.por("almofada", arred(1.1, 0.14, 0.8, 0.06), x, 0.49, -0.05);
            k.por("tecido", arred(L, 0.5, 0.24, 0.08), 0, 0.72, 0.4);
            k.por("tecido", arred(0.24, 0.6, 0.95, 0.07), a.fora * (L / 2 - 0.1), 0.42, 0);
            k.por("decorativa", arred(0.45, 0.4, 0.12, 0.05), a.fora * 0.75, 0.75, 0.22, -0.2, a.fora * 0.15, 0);
            // underglow (A): fita embaixo da frente + brilho no chão
            k.caixa("ledA", L - 0.3, 0.015, 0.015, 0, 0.05, -0.47);
            k.por("brilhoA", plano(L + 0.8, 1.6), 0, 0.026, -0.1, -Math.PI / 2);
        });
    }
    // mesinha do vértice: sem LED (fica no primeiro plano de quem senta e estoura)
    k.por("mesa", new THREE.CylinderGeometry(GAMER.mesinha.raio, GAMER.mesinha.raio, 0.5, 6), GAMER.mesinha.x, 0.25, GAMER.mesinha.z);

    // ---------- puffs ----------
    for (const p of GAMER.puffs) {
        k.por("puff", new THREE.SphereGeometry(0.55, 24, 16), p.x, 0.3, p.z, 0, p.giro, 0, [1, 0.6, 1.05]);
        k.por("puff2", new THREE.SphereGeometry(0.4, 24, 16), p.x + Math.sin(p.giro) * 0.25, 0.55, p.z + Math.cos(p.giro) * 0.25, -0.4, p.giro, 0, [1, 0.8, 0.5]);
    }

    // ---------- painéis hexagonais na parede esquerda (A, B e apagados) ----------
    const hex = new THREE.CylinderGeometry(0.21, 0.21, 0.03, 6);
    const hexes: [number, number, string][] = [[0, 0, "ledA"], [1, 0, "ledB"], [1, -1, "ledA"], [0, 1, "hexApagado"], [-1, 1, "ledA"], [2, -1, "hexApagado"], [2, 0, "ledA"], [-1, 0, "ledB"], [3, -1, "ledB"]];
    for (const [q, r, balde] of hexes) k.por(balde, hex, -M + 0.03, 1.85 + q * 0.19 + r * 0.38, -1.0 + q * 0.33, 0, 0, Math.PI / 2);
    k.por("brilhoA", plano(2.6, 1.8), -M + 0.012, 2.0, -0.5, 0, Math.PI / 2);

    // ---------- prateleiras flutuantes na parede direita (fita B embaixo) ----------
    const shX = M - 0.16;
    const pz = GAMER.prateleira.z;
    for (const y of [1.55, 2.15]) {
        k.caixa("prateleira", 0.3, 0.04, GAMER.prateleira.comprimento, shX, y, pz);
        k.caixa("ledB", 0.02, 0.012, GAMER.prateleira.comprimento - 0.1, shX - 0.12, y - 0.025, pz);
    }
    const figuras = ["branco", "figura", "decorativa", "figura2"];
    [-0.8, -0.4, 0.05, 0.5, 0.85].forEach((dz, i) => k.caixa(figuras[i % 4], 0.14, 0.2 + (i % 3) * 0.06, 0.1, shX, 1.67 + (i % 3) * 0.03, pz + dz));
    [-0.7, -0.1, 0.6].forEach((dz, i) => k.por(figuras[(i + 1) % 4], new THREE.SphereGeometry(0.07, 16, 12), shX, 2.24, pz + dz));
    k.por("brilhoB", plano(2.4, 1.4), M - 0.012, 1.3, pz, 0, -Math.PI / 2);

    // ---------- fliperama no canto da frente ----------
    const f = GAMER.fliperama;
    k.dentro(f.x, f.z, f.giro, () => {
        k.caixa("fliperama", 0.72, 1.8, 0.6, 0, 0.9, 0);
        k.caixa("ledB", 0.74, 0.2, 0.08, 0, 1.68, 0.32);
        k.por("telaFliperama", plano(0.58, 0.5), 0, 1.28, 0.305);
        k.por("painel", new THREE.BoxGeometry(0.72, 0.08, 0.3), 0, 0.95, 0.4, 0.25);
        [-0.15, 0.05, 0.15].forEach((x, i) => k.por(i ? "ledA" : "ledB", new THREE.CylinderGeometry(0.025, 0.025, 0.02, 16), x, 1.0, 0.42));
    });

    // ---------- planta low-poly no outro canto ----------
    const v = GAMER.vaso;
    k.por("vaso", new THREE.CylinderGeometry(0.24, 0.18, 0.45, 12), v.x, 0.225, v.z);
    for (const [x, y, z, r] of [[0, 1.0, 0, 0.42], [0.18, 1.35, 0.1, 0.32], [-0.15, 1.25, -0.1, 0.3]]) {
        k.por("folha", new THREE.IcosahedronGeometry(r, 0), v.x + x, y, v.z + z);
    }
    k.por("galho", new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6), v.x, 0.7, v.z);

    // ---------- anel de luz no teto, em cima da mesa ----------
    k.por("anel", new THREE.TorusGeometry(0.85, 0.025, 8, 96), mx, H - 0.25, mz, Math.PI / 2);
    for (const a of [0, 2.1, 4.2]) k.por("haste", new THREE.CylinderGeometry(0.004, 0.004, 0.25, 4), mx + Math.cos(a) * 0.85, H - 0.125, mz + Math.sin(a) * 0.85);

    const tudo = k.juntar();
    const telaFliperama = new THREE.MeshBasicMaterial({ map: texturaFliperama() });
    const leds = new Map<string, THREE.BufferGeometry>();
    const solidos: [string, THREE.BufferGeometry, THREE.Material][] = [];
    tudo.forEach((g, chave) => {
        if ((BALDES_LED as readonly string[]).includes(chave)) leds.set(chave, g);
        else solidos.push([chave, g, chave === "telaFliperama" ? telaFliperama : SOLIDOS[chave]]);
    });
    kit = { solidos, leds };
    return kit;
}

// força das fitas: acima de 1 elas "acendem" (sem tone mapping), mas sem passar muito,
// senão o canal estoura e a cor muda (laranja vira amarelo)
export const FORCA_LED = 1.5;

// cores dos LEDs agora (com o ciclo RGB, se ligado). Devolve a intensidade (0 = desligados)
const hsl = { h: 0, s: 0, l: 0 };
export function coresLed(canalId: string, led: EstadoLed | null, t: number, a: THREE.Color, b: THREE.Color) {
    const p = paletaDaSala(canalId, led);
    a.set(p.a);
    b.set(p.b);
    let k = 1;
    if (led?.ciclo) {
        a.getHSL(hsl);
        a.setHSL((hsl.h + t * 0.04) % 1, hsl.s, hsl.l);
        b.getHSL(hsl);
        b.setHSL((hsl.h + t * 0.04) % 1, hsl.s, hsl.l);
        k = 0.8 + 0.2 * Math.sin(t * 1.6);
    }
    if (led && !led.ligado) k = 0;
    return k;
}

const ANEL_ACESO = new THREE.Color("#ffe6c8").multiplyScalar(2.2);
const ANEL_APAGADO = new THREE.Color("#222226");

function brilho(mapa: THREE.Texture, opacidade: number) {
    return new THREE.MeshBasicMaterial({ transparent: true, opacity: opacidade, alphaMap: mapa, blending: THREE.AdditiveBlending, depthWrite: false });
}

export type MateriaisLed = Record<BaldeLed, THREE.MeshBasicMaterial>;

// os materiais de LED de uma sala, seguindo a paleta dela (e o ciclo RGB) a cada quadro.
// Também usados pelo cinema
export function useMateriaisLed(canalId: string, led: EstadoLed | null, apagada: boolean): MateriaisLed {
    const mats = useMemo(() => ({
        ledA: new THREE.MeshBasicMaterial({ toneMapped: false }),
        ledB: new THREE.MeshBasicMaterial({ toneMapped: false }),
        brilhoA: brilho(texturaBrilho(), 0.35),
        brilhoB: brilho(texturaBrilho(), 0.35),
        lavagemA: brilho(texturaLavagem(), 0.22),
        anel: new THREE.MeshBasicMaterial({ toneMapped: false }),
    }) satisfies MateriaisLed, []);
    useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

    const a = useRef(new THREE.Color()).current;
    const b = useRef(new THREE.Color()).current;
    const estado = useRef({ led, apagada });
    estado.current = { led, apagada };

    useFrame(({ clock }) => {
        const k = coresLed(canalId, estado.current.led, clock.elapsedTime, a, b);
        mats.ledA.color.copy(a).multiplyScalar(FORCA_LED * k + 0.02);
        mats.ledB.color.copy(b).multiplyScalar(FORCA_LED * k + 0.02);
        mats.brilhoA.color.copy(a).multiplyScalar(k);
        mats.brilhoB.color.copy(b).multiplyScalar(k);
        mats.lavagemA.color.copy(a).multiplyScalar(k);
        mats.anel.color.copy(estado.current.apagada ? ANEL_APAGADO : ANEL_ACESO);
    });
    return mats;
}

// os LEDs de uma sala (6 desenhos), com os materiais dela
function LedsDaSala({ sala, led, apagada }: { sala: SalaPlanta; led: EstadoLed | null; apagada: boolean }) {
    const { leds } = montarKit();
    const mats = useMateriaisLed(sala.canalId, led, apagada);

    return (
        <group position={[sala.centro.x, 0, sala.centro.z]} rotation={[0, sala.tv.rot, 0]}>
            {BALDES_LED.map((chave) => {
                const g = leds.get(chave);
                return g ? <mesh key={chave} geometry={g} material={mats[chave]} renderOrder={chave.startsWith("led") || chave === "anel" ? 0 : 2} /> : null;
            })}
        </group>
    );
}

type Props = {
    salas: SalaPlanta[];
    // a sala da sua call usa o LED do controle; as outras, a cor padrão delas
    salaDaCall: string | null;
    led: EstadoLed | null;
    salaEscura: string | null;
};

// todas as salas gamer do andar
export function SalasGamer({ salas, salaDaCall, led, salaEscura }: Props) {
    const { solidos } = montarKit();
    const matrizes = useMemo(
        () => salas.map((s) => new THREE.Matrix4().makeRotationY(s.tv.rot).setPosition(s.centro.x, 0, s.centro.z)),
        [salas],
    );
    if (salas.length === 0) return null;
    return (
        <>
            {solidos.map(([chave, geometria, mat]) => (
                <Instancias key={`${chave}|${matrizes.length}`} geometria={geometria} material={mat} matrizes={matrizes} />
            ))}
            {salas.map((s) => (
                <LedsDaSala key={s.canalId} sala={s} led={s.canalId === salaDaCall ? led : null} apagada={s.canalId === salaEscura} />
            ))}
        </>
    );
}

// luzes de verdade dos LEDs. Sempre as mesmas 8 (trocar a quantidade de luzes recompila todos
// os materiais e a tela engasga): elas vão pra sala gamer em que você está e apagam fora dela
const LUZES: { cor: "a" | "b" | "anel"; x: number; y: number; z: number; forca: number; alcance: number }[] = [
    { cor: "a", x: 0, y: 1.75, z: B + 0.6, forca: 4, alcance: 5 }, // bias da TV
    { cor: "a", x: -M + 0.6, y: H - 0.3, z: 1.0, forca: 3.5, alcance: 6 }, // sanca
    { cor: "a", x: M - 0.6, y: H - 0.3, z: 1.0, forca: 3.5, alcance: 6 },
    { cor: "a", x: -M + 0.6, y: 2.0, z: -0.8, forca: 3, alcance: 4 }, // painéis hex
    { cor: "b", x: 0, y: 0.15, z: GAMER.rack.z + 0.8, forca: 1.6, alcance: 3 }, // rack
    { cor: "a", x: 0, y: 0.1, z: 1.7, forca: 1.6, alcance: 2.8 }, // sofá (o contorno dele no escuro)
    { cor: "b", x: M - 0.7, y: 1.4, z: -1.8, forca: 2, alcance: 3 }, // prateleiras e fliperama
    { cor: "anel", x: GAMER.mesa.x, y: H - 0.4, z: GAMER.mesa.z, forca: 14, alcance: 9 }, // anel do teto
];
// as 8 luzes da LAN house (mesmo número: ver o aviso acima), no espaço da sala
const LUZES_LAN: typeof LUZES = [
    { cor: "anel", x: LAN.lanX, y: H - 0.4, z: -0.7, forca: 14, alcance: 9 }, // painéis de teto da mesa LAN
    { cor: "anel", x: LAN.loungeX, y: H - 0.4, z: -0.4, forca: 14, alcance: 9 }, // painéis de teto do lounge
    { cor: "a", x: LAN.lanX, y: LAN.tv1.y, z: -LAN.meiaZ + 0.6, forca: 3, alcance: 4.5 }, // bias do telão
    { cor: "a", x: LAN.lanX, y: 0.25, z: -0.7, forca: 1.5, alcance: 3.5 }, // underglow da mesa
    { cor: "b", x: LAN.loungeX, y: LAN.tv2.y, z: -LAN.meiaZ + 0.5, forca: 2.2, alcance: 3.5 }, // moldura da TV do lounge
    { cor: "a", x: LAN.loungeX, y: 0.15, z: 1.0, forca: 1.4, alcance: 3 }, // sofá em U
    { cor: "b", x: LAN.lanX, y: H - 0.7, z: -0.7, forca: 2, alcance: 4 }, // barras suspensas
    { cor: "a", x: 0, y: H - 0.3, z: 0, forca: 3.5, alcance: 7 }, // sanca
];
const COR_ANEL = new THREE.Color("#ffe6c8");

export function LuzesSalaGamer({ sala, led, apagada }: { sala: SalaPlanta | null; led: EstadoLed | null; apagada: boolean }) {
    const refs = useRef<(THREE.PointLight | null)[]>([]);
    const a = useRef(new THREE.Color()).current;
    const b = useRef(new THREE.Color()).current;
    const v = useRef(new THREE.Vector3()).current;
    const estado = useRef({ sala, led, apagada });
    estado.current = { sala, led, apagada };

    useFrame(({ clock }) => {
        const { sala: s, led: l, apagada: escura } = estado.current;
        const k = s ? coresLed(s.canalId, l, clock.elapsedTime, a, b) : 0;
        // a LAN house tem as suas 8 luzes (a mesma quantidade: trocar recompilaria os materiais)
        (s?.modelo === "LANHOUSE" ? LUZES_LAN : LUZES).forEach((def, i) => {
            const luz = refs.current[i];
            if (!luz) return;
            if (!s) {
                luz.intensity = 0;
                return;
            }
            const c = Math.cos(s.tv.rot);
            const sn = Math.sin(s.tv.rot);
            luz.position.copy(v.set(s.centro.x + def.x * c + def.z * sn, def.y, s.centro.z - def.x * sn + def.z * c));
            if (def.cor === "anel") {
                luz.color.copy(COR_ANEL);
                luz.intensity = escura ? 0 : def.forca;
            } else {
                luz.color.copy(def.cor === "a" ? a : b);
                // com a luz da sala acesa, os LEDs iluminam menos (70%)
                luz.intensity = def.forca * k * (escura ? 1 : 0.7);
            }
        });
    });

    return (
        <>
            {LUZES.map((def, i) => (
                <pointLight key={i} ref={(l) => { refs.current[i] = l; }} intensity={0} distance={def.alcance} decay={2} position={[0, -50, 0]} />
            ))}
        </>
    );
}
