// LAN house (sala de voz com 20 lugares): mesa LAN com 10 setups (monitor curvo, teclado, mousepad,
// headset e cadeira gamer) e um lounge com sofá em U e TV. Grafite escuro e LEDs de duas cores
// (A = principal, B = secundária), seguindo a paleta que escolherem no controle da sala.
//
// Mesmo esquema da sala gamer: o desenho é feito uma vez só, no espaço da sala (ver LAN em planta.ts),
// e juntado numa geometria por material (instancing entre as salas). Os LEDs são por sala, porque
// cada sala tem a sua cor. As TVs e os tablets são do Predio; as telas dos monitores, daqui:
// cada monitor mostra a tela compartilhada de quem está sentado nele.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Track } from "livekit-client";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { EstadoLed } from "../../tipos";
import { useTexturaVideo } from "./midia";
import { Instancias, material } from "./Moveis";
import { ALTURA, LAN, TOTENS_LAN, idAssentoLan, modulosSofaLan, zSetupLan, type SalaPlanta } from "./planta";
import { BALDES_LED, FORCA_LED, Montagem, coresLed, useMateriaisLed } from "./SalaGamer";
import { texturaTexto } from "./texturas";

const H = ALTURA;
const BZ = -LAN.meiaZ;
const MX = LAN.meiaX;
const MZ = LAN.meiaZ;
const TH = LAN.mesa.altura;

// tamanho (m) da tela do monitor: 16:9, curva de 1400R como o do desenho
const MON_L = 0.624;
const MON_A = 0.351;
const CURVA = 1.4;

// o que é a "cor de destaque" da cadeira (cor A da paleta a 45%): muda por sala, então vai com os LEDs
const BALDES_POR_SALA = [...BALDES_LED, "acento"] as readonly string[];

// materiais dos móveis (iguais em todas as salas)
const MATERIAIS: Record<string, THREE.Material> = {
    fundo: material("#141418", 0.85),
    ripa: material("#0e0e11", 0.85),
    mesa: material("#0c0c0f", 0.35, 0.3),
    pe: material("#09090b", 0.8),
    divisoria: material("#0a0a0c", 0.8),
    escuro: material("#0b0b0d", 0.5),
    escuro2: material("#18181d", 0.6),
    pad: material("#0e0e11", 1),
    tecla: material("#1d1d23", 0.55),
    cadeira: material("#1c1c22", 0.8),
    cadeiraEscura: material("#111114", 0.6),
    totem: material("#0b0b0d", 0.4, 0.3),
    painelTeto: material("#0b0b0d", 0.5),
    haste: material("#222226", 0.8),
    balcao: material("#0d0d10", 0.5),
    tampo: material("#18181c", 0.3, 0.3),
    geladeira: material("#0b0b0d", 0.4),
    fridgeTela: new THREE.MeshBasicMaterial({ color: 0x9aa4c0 }),
    rack: material("#0d0d10", 0.5),
    caixa: material("#050506", 0.3),
    branco: material("#e9e9ec", 0.35),
    controle: material("#1a1a1f", 0.4),
    fab: material("#26262d", 0.95),
    cush: material("#2f2f37", 0.95),
    pil: material("#3d3d47", 1),
    plinth: material("#0a0a0c", 0.6),
    tapete: material("#19191f", 1),
    filete: material("#2c2c36", 1),
    mesaCentro: material("#0c0c0f", 0.2, 0.4),
    pedestal: material("#0c0c0f", 0.4),
    placa: material("#18181c", 0.5),
};

// teclado de 70 teclas (a mesma grade do desenho): [x, z, escala em x], em unidades de tecla
const U = 0.019;
const TECLAS: [number, number, number][] = (() => {
    const linhas = [
        [1, 0.5, 1, 1, 1, 1, 0.5, 1, 1, 1, 1, 0.5, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2],
        [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5],
        [1.75, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.25],
        [2.25, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.75],
        [1.25, 1.25, 1.25, 6.25, 1.25, 1.25, 1.25, 1.25],
    ];
    const lista: [number, number, number][] = [];
    linhas.forEach((linha, r) => {
        let x = -7.5;
        const zz = (r - 2.5) * U + (r === 0 ? -0.004 : 0);
        linha.forEach((w, j) => {
            const vao = r === 0 && (j === 1 || j === 6 || j === 11);
            if (!vao) lista.push([(x + w / 2) * U, zz, (w * U - 0.004) / (U - 0.004)]);
            x += w;
        });
    });
    return lista;
})();

// entorta a geometria em x (monitor curvo)
function curvar<T extends THREE.BufferGeometry>(g: T): T {
    const pos = g.getAttribute("position");
    for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) + pos.getX(i) ** 2 / (2 * CURVA));
    g.computeVertexNormals();
    return g;
}

const matriz = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) =>
    new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));

// desenha dentro de um espaço girado/deslocado (grupo)
function com(k: Montagem, m: THREE.Matrix4, desenhar: () => void) {
    const antes = k.base;
    k.base = antes.clone().multiply(m);
    desenhar();
    k.base = antes;
}

type Kit = { solidos: [string, THREE.BufferGeometry, THREE.Material][]; leds: Map<string, THREE.BufferGeometry> };
let kit: Kit | null = null;

function montarKit(): Kit {
    if (kit) return kit;
    const k = new Montagem();
    const plano = (l: number, a: number) => new THREE.PlaneGeometry(l, a);
    const arred = (balde: string, l: number, a: number, p: number, r: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) =>
        k.por(balde, new RoundedBoxGeometry(l, a, p, 3, r), x, y, z, rx, ry, rz);

    const LX = LAN.lanX;
    const GX = LAN.loungeX;
    const TL = LAN.mesa.comprimento;
    const TW = LAN.mesa.largura;
    const z0 = LAN.mesa.z0;
    const tz = z0 + TL / 2;

    // ---------- casca: parede da tela com ripas, sanca de LED e a luz lavando as paredes ----------
    k.caixa("fundo", 2 * MX, H, 0.02, 0, H / 2, BZ + 0.011);
    for (let i = 0; i < 79; i++) k.caixa("ripa", 0.07, H - 0.3, 0.05, -MX + 0.1 + i * 0.2, H / 2 - 0.1, BZ + 0.035);
    const cy = H - 0.06;
    k.caixa("ledA", 2 * MX - 0.2, 0.025, 0.025, 0, cy, BZ + 0.1);
    k.caixa("ledA", 0.025, 0.025, 2 * MZ - 0.2, -MX + 0.1, cy, 0);
    k.caixa("ledA", 0.025, 0.025, 2 * MZ - 0.2, MX - 0.1, cy, 0);
    k.caixa("ledA", 2 * MX - 0.2, 0.025, 0.025, 0, cy, MZ - 0.1);
    const yLav = H - 0.08 - 0.6;
    k.por("lavagemA", plano(2 * MX - 0.4, 1.2), 0, yLav, BZ + 0.07);
    k.por("lavagemA", plano(2 * MX - 0.4, 1.2), 0, yLav, MZ - 0.012, 0, Math.PI, 0);
    k.por("lavagemA", plano(2 * MZ - 0.4, 1.2), -MX + 0.012, yLav, 0, 0, Math.PI / 2, 0);
    k.por("lavagemA", plano(2 * MZ - 0.4, 1.2), MX - 0.012, yLav, 0, 0, -Math.PI / 2, 0);

    // ---------- telão da mesa LAN: moldura de LED e a luz atrás dele ----------
    {
        const { y: sy, largura: sw } = LAN.tv1;
        const sh = (sw * 9) / 16;
        k.caixa("ledA", sw + 0.26, 0.03, 0.02, LX, sy + sh / 2 + 0.1, BZ + 0.07);
        k.caixa("ledA", sw + 0.26, 0.03, 0.02, LX, sy - sh / 2 - 0.1, BZ + 0.07);
        k.caixa("ledA", 0.03, sh + 0.2, 0.02, LX - sw / 2 - 0.13, sy, BZ + 0.07);
        k.caixa("ledA", 0.03, sh + 0.2, 0.02, LX + sw / 2 + 0.13, sy, BZ + 0.07);
        k.por("brilhoA", plano(5.8, 3.4), LX, sy, BZ + 0.06);
    }

    // ---------- mesa LAN: tampo, LED nas bordas, pés, glow no chão e a divisória dos monitores ----------
    k.caixa("mesa", TW, 0.045, TL, LX, TH - 0.022, tz);
    for (const s of [-1, 1]) {
        k.caixa("ledA", 0.015, 0.012, TL - 0.1, LX + s * (TW / 2 - 0.04), TH - 0.055, tz);
        for (const z of [z0 + 0.2, tz, z0 + TL - 0.2]) k.caixa("pe", 0.06, TH - 0.05, 0.06, LX + s * (TW / 2 - 0.15), (TH - 0.05) / 2, z);
    }
    k.por("brilhoA", plano(3.4, TL + 1.2), LX, 0.004, tz, -Math.PI / 2);
    k.caixa("divisoria", 0.04, 0.32, TL - 0.1, LX, TH + 0.16, tz);
    k.caixa("ledB", 0.05, 0.015, TL - 0.1, LX, TH + 0.33, tz);

    // ---------- um setup (monitor, teclado, mousepad, mouse, headset e cadeira) ----------
    // s = -1 / 1: o lado da mesa. O monitor olha pra fora (pra quem senta); as telas ficam por fora, em MonitoresLan
    const setup = (s: number, z: number, i: number) => {
        com(k, matriz(LX + s * 0.28, TH, z, 0, (s * Math.PI) / 2, 0), () => {
            for (const a of [-0.55, 0.55]) k.caixa("escuro", 0.028, 0.012, 0.2, Math.sin(a) * 0.08, 0.006, 0.02 + Math.cos(a) * 0.02, a);
            k.por("escuro", new THREE.CylinderGeometry(0.045, 0.05, 0.014, 24), 0, 0.007, -0.04);
            k.por("escuro", new THREE.BoxGeometry(0.05, 0.34, 0.022), 0, 0.18, -0.045, 0.06);
            k.caixa("ledA", 0.012, 0.14, 0.004, 0, 0.17, -0.057);
            com(k, matriz(0, 0.43, 0, -0.04, 0, 0), () => {
                k.por("escuro", curvar(new THREE.BoxGeometry(0.64, 0.375, 0.014, 24, 1, 1)), 0, 0, 0);
                k.por("escuro2", curvar(new THREE.BoxGeometry(0.64, 0.022, 0.02, 24, 1, 1)), 0, -0.195, 0.002);
                k.caixa("ledA", 0.026, 0.004, 0.002, 0, -0.195, 0.013);
                k.caixa("escuro", 0.34, 0.22, 0.045, 0, -0.02, -0.03);
                k.por("ledB", new THREE.TorusGeometry(0.075, 0.004, 6, 40), 0, 0, -0.054);
                k.por("brilhoB", plano(0.32, 0.32), 0, 0, -0.056, 0, Math.PI, 0);
            });
        });

        // mousepad XL com borda de LED, teclado com underglow, mouse
        const kx = LX + s * 0.6;
        k.caixa("pad", 0.36, 0.004, 0.86, kx, TH + 0.002, z);
        k.caixa("ledA", 0.006, 0.005, 0.86, kx + 0.18, TH + 0.003, z);
        k.caixa("ledA", 0.006, 0.005, 0.86, kx - 0.18, TH + 0.003, z);
        k.caixa("ledA", 0.36, 0.005, 0.006, kx, TH + 0.003, z + 0.43);
        k.caixa("ledA", 0.36, 0.005, 0.006, kx, TH + 0.003, z - 0.43);
        com(k, matriz(kx - s * 0.02, TH + 0.004, z + s * 0.08, 0, (s * Math.PI) / 2, 0), () => {
            com(k, matriz(0, 0, 0, 0.05, 0, 0), () => {
                k.caixa("escuro", 0.31, 0.018, 0.128, 0, 0.009, 0);
                k.caixa("ledB", 0.314, 0.004, 0.132, 0, 0.002, 0);
                k.caixa("ledB", 0.292, 0.002, 0.11, 0, 0.0185, 0);
                for (const [x, zz, w] of TECLAS) k.por("tecla", new THREE.BoxGeometry(U - 0.004, 0.009, U - 0.004), x, 0.025, zz, 0, 0, 0, [w, 1, 1]);
            });
        });
        k.por("escuro", new THREE.SphereGeometry(1, 16, 10), kx, TH + 0.016, z - s * 0.28, 0, 0, 0, [0.055, 0.02, 0.033]);
        k.caixa("ledB", 0.012, 0.004, 0.004, kx - s * 0.035, TH + 0.03, z - s * 0.28);

        // headset num suporte, com anéis de LED nas conchas
        const hz = z - s * 0.47;
        const hx = LX + s * 0.52;
        k.por("escuro", new THREE.CylinderGeometry(0.05, 0.06, 0.012, 20), hx, TH + 0.006, hz);
        k.por("escuro", new THREE.CylinderGeometry(0.01, 0.01, 0.24, 8), hx, TH + 0.12, hz);
        com(k, matriz(hx, TH + 0.24 - 0.09, hz, 0, Math.PI / 2, 0), () => {
            k.por("escuro2", new THREE.TorusGeometry(0.085, 0.012, 8, 24, Math.PI), 0, 0, 0);
            for (const e of [-1, 1]) {
                k.por("escuro", new THREE.CylinderGeometry(0.045, 0.045, 0.04, 20), e * 0.09, -0.015, 0, 0, 0, Math.PI / 2);
                k.por("ledA", new THREE.TorusGeometry(0.04, 0.005, 6, 24), e * 0.112, -0.015, 0, 0, Math.PI / 2, 0);
            }
        });

        // cadeira gamer (a frente dela é o +z local; a pessoa senta no centro dela)
        com(k, matriz(LX + s * LAN.cadeiraX, 0, z, 0, (-s * Math.PI) / 2 + (i % 2 ? 0.08 : -0.06), 0), () => {
            for (let n = 0; n < 5; n++) {
                const th = (n * Math.PI * 2) / 5;
                k.caixa("cadeiraEscura", 0.3, 0.03, 0.045, 0.15 * Math.cos(th), 0.07, -0.15 * Math.sin(th), th);
            }
            k.por("cadeiraEscura", new THREE.CylinderGeometry(0.03, 0.03, 0.34, 10), 0, 0.25, 0);
            k.caixa("cadeira", 0.52, 0.1, 0.5, 0, 0.47, 0);
            for (const e of [-1, 1]) {
                k.caixa("acento", 0.07, 0.07, 0.5, e * 0.245, 0.53, 0);
                k.caixa("cadeiraEscura", 0.04, 0.22, 0.04, e * 0.3, 0.6, -0.02);
                k.caixa("cadeiraEscura", 0.08, 0.03, 0.26, e * 0.3, 0.72, 0.02);
            }
            com(k, matriz(0, 0.52, -0.24, -0.14, 0, 0), () => {
                k.caixa("cadeira", 0.5, 0.82, 0.1, 0, 0.43, 0);
                for (const e of [-1, 1]) k.caixa("acento", 0.07, 0.66, 0.13, e * 0.255, 0.38, 0.015);
                k.caixa("acento", 0.06, 0.55, 0.006, 0, 0.42, 0.052);
                k.caixa("cadeiraEscura", 0.26, 0.12, 0.07, 0, 0.72, 0.08);
            });
        });
    };
    for (let i = 0; i < 5; i++) {
        setup(-1, zSetupLan(i), i);
        setup(1, zSetupLan(i), i + 1);
    }

    // ---------- teto: barras de LED suspensas sobre a mesa e os painéis de luz ----------
    for (const s of [-1, 1]) {
        k.caixa("painelTeto", 0.06, 0.04, TL - 0.4, LX + s * 0.85, H - 0.45, tz);
        k.caixa("ledB", 0.035, 0.012, TL - 0.5, LX + s * 0.85, H - 0.476, tz);
        for (const z of [tz - 2.4, tz + 2.4]) k.por("haste", new THREE.CylinderGeometry(0.004, 0.004, 0.43, 4), LX + s * 0.85, H - 0.215, z);
    }
    const paineis: [number, number][] = [[LX, tz - 2], [LX, tz], [LX, tz + 2], [GX, -2], [GX, 1.2], [0, -0.5]];
    for (const [x, z] of paineis) {
        k.caixa("painelTeto", 1.12, 0.04, 1.12, x, H - 0.02, z);
        k.por("anel", plano(1.0, 1.0), x, H - 0.041, z, Math.PI / 2);
    }

    // ---------- totens de LED (A / B alternando), com a luz lavando a parede e o teto ----------
    TOTENS_LAN.forEach(([x, z], i) => {
        const led = i % 2 ? "ledB" : "ledA";
        const brilho = i % 2 ? "brilhoB" : "brilhoA";
        const naParedeDoCorredor = z > 0; // de frente pra -z; os da parede da direita, de frente pra -x
        k.por("totem", new THREE.CylinderGeometry(0.13, 0.15, 0.03, 24), x, 0.015, z);
        k.caixa("totem", 0.1, 2.1, 0.1, x, 1.08, z);
        k.caixa("totem", 0.12, 0.03, 0.12, x, 2.145, z);
        k.caixa(led, 0.08, 0.008, 0.08, x, 2.164, z);
        if (naParedeDoCorredor) {
            k.caixa(led, 0.03, 1.95, 0.012, x, 1.08, z - 0.051);
            k.por(brilho, plano(1.0, 2.8), x, 1.3, MZ - 0.01, 0, Math.PI, 0);
        } else {
            k.caixa(led, 0.012, 1.95, 0.03, x - 0.051, 1.08, z);
            k.por(brilho, plano(1.0, 2.8), MX - 0.01, 1.3, z, 0, -Math.PI / 2, 0);
        }
        k.por(brilho, plano(1.6, 1.6), x, H - 0.003, z, Math.PI / 2);
    });

    // letreiro: o brilho atrás dele (o texto é por sala, em Letreiro)
    k.por("brilhoB", plano(3.6, 1.6), -MX + 0.02, 2.25, 0, 0, Math.PI / 2, 0);

    // ---------- balcão e geladeira (canto do fundo, do lado da mesa LAN) ----------
    {
        const { x: bx, z: bz } = LAN.balcao;
        k.caixa("balcao", 2.6, 1.0, 0.6, bx, 0.5, bz);
        k.caixa("tampo", 2.7, 0.04, 0.7, bx, 1.02, bz);
        k.caixa("ledB", 2.5, 0.015, 0.015, bx, 0.05, bz - 0.31);
        k.por("brilhoB", plano(3.0, 1.0), bx, 0.005, bz - 0.6, -Math.PI / 2);
        const { x: fx, z: fz } = LAN.geladeira;
        k.caixa("geladeira", 0.7, 1.9, 0.6, fx, 0.95, fz);
        k.por("fridgeTela", plano(0.56, 1.6), fx, 1.0, fz - 0.305, 0, Math.PI, 0);
    }

    // ---------- lounge: rack e a TV, sofá em U, mesa de centro hexagonal e tapete ----------
    {
        const { y: ty, largura: tw } = LAN.tv2;
        const th = (tw * 9) / 16;
        k.caixa("ledB", tw + 0.1, 0.025, 0.02, GX, ty + th / 2 + 0.06, BZ + 0.06);
        k.caixa("ledB", tw + 0.1, 0.025, 0.02, GX, ty - th / 2 - 0.06, BZ + 0.06);
        k.caixa("ledB", 0.025, th + 0.12, 0.02, GX - tw / 2 - 0.05, ty, BZ + 0.06);
        k.caixa("ledB", 0.025, th + 0.12, 0.02, GX + tw / 2 + 0.05, ty, BZ + 0.06);
        k.por("brilhoB", plano(5.2, 3.3), GX, ty, BZ + 0.05);
        k.caixa("rack", 3.8, 0.4, 0.45, GX, 0.25, BZ + 0.3);
        k.caixa("ledA", 3.6, 0.015, 0.015, GX, 0.05, BZ + 0.53);
        k.por("brilhoA", plano(4.2, 0.9), GX, 0.005, BZ + 0.8, -Math.PI / 2);
        k.caixa("caixa", 1.1, 0.08, 0.1, GX - 0.3, 0.49, BZ + 0.25);
        k.caixa("branco", 0.42, 0.08, 0.32, GX + 0.9, 0.49, BZ + 0.3);
    }

    {
        const { modulo: SW, canto: CW } = LAN.sofa;
        const cxo = 2 * SW + CW / 2;
        com(k, matriz(GX, 0, LAN.sofa.z, 0, Math.PI, 0), () => {
            for (const m of modulosSofaLan()) {
                const { w, costas } = m;
                com(k, matriz(m.xu, 0, m.zu, 0, m.ryu, 0), () => {
                    arred("plinth", w - 0.08, 0.1, 0.83, 0.02, 0, 0.06, -0.02);
                    k.caixa("ledA", w - 0.12, 0.012, 0.012, 0, 0.03, 0.4);
                    arred("fab", w, 0.2, 0.95, 0.04, 0, 0.21, 0);
                    const esq = costas.includes("l") ? 0.2 : 0;
                    const dir = costas.includes("r") ? 0.2 : 0;
                    const cw = w - esq - dir - 0.02;
                    const cx = (esq - dir) / 2;
                    arred("cush", cw, 0.17, 0.74, 0.07, cx, 0.39, 0.09);
                    if (costas.includes("b")) {
                        arred("fab", w, 0.52, 0.2, 0.06, 0, 0.56, -0.375);
                        arred("cush", cw, 0.42, 0.2, 0.09, cx, 0.66, -0.2, -0.13);
                    }
                    if (esq) {
                        arred("fab", 0.2, 0.52, 0.95, 0.06, -w / 2 + 0.1, 0.56, 0);
                        arred("cush", 0.2, 0.42, 0.6, 0.09, -w / 2 + 0.29, 0.66, 0.15, 0, 0, 0.13);
                    }
                    if (dir) {
                        arred("fab", 0.2, 0.52, 0.95, 0.06, w / 2 - 0.1, 0.56, 0);
                        arred("cush", 0.2, 0.42, 0.6, 0.09, w / 2 - 0.29, 0.66, 0.15, 0, 0, -0.13);
                    }
                    k.por("brilhoA", plano(w + 0.5, 1.4), 0, 0.004, 0.25, -Math.PI / 2);
                });
            }
            // encosto no fim de cada braço
            const fim = CW / 2 + 2 * SW + 0.1;
            for (const s of [-1, 1]) {
                arred("plinth", 0.95, 0.1, 0.18, 0.02, s * cxo, 0.06, fim - 0.01);
                arred("fab", 0.95, 0.55, 0.2, 0.06, s * cxo, 0.33, fim);
            }
            // almofadas decorativas
            arred("pil", 0.42, 0.4, 0.13, 0.06, -cxo - 0.12, 0.72, -0.12, -0.2, 0.2, 0);
            arred("pil", 0.42, 0.4, 0.13, 0.06, cxo + 0.12, 0.72, -0.12, -0.2, -0.2, 0);
            arred("pil", 0.4, 0.38, 0.12, 0.06, 0.5, 0.72, -0.12, -0.2);
        });

        const { x: mx, z: mz } = LAN.mesaCentro;
        k.por("tapete", new THREE.CylinderGeometry(2.0, 2.0, 0.02, 6), mx, 0.01, mz, 0, Math.PI / 6, 0);
        k.por("filete", new THREE.RingGeometry(1.72, 1.77, 6, 1, Math.PI / 6 + Math.PI / 2), mx, 0.022, mz, -Math.PI / 2);
        k.por("mesaCentro", new THREE.CylinderGeometry(0.5, 0.5, 0.05, 6), mx, 0.42, mz);
        k.por("ledA", new THREE.CylinderGeometry(0.512, 0.512, 0.012, 6), mx, 0.39, mz);
        k.por("pedestal", new THREE.CylinderGeometry(0.1, 0.2, 0.38, 6), mx, 0.19, mz);
        k.caixa("branco", 0.16, 0.03, 0.1, mx - 0.3, 0.46, mz + 0.2, 0.4);
        k.caixa("controle", 0.16, 0.03, 0.1, mx + 0.3, 0.46, mz - 0.2, -0.3);
    }

    // ---------- interruptor da luz, na parede do corredor ----------
    k.caixa("placa", 0.09, 0.14, 0.015, LAN.interruptor.x, LAN.interruptor.y, MZ - 0.0075);
    k.caixa("ledB", 0.02, 0.02, 0.004, LAN.interruptor.x, LAN.interruptor.y, MZ - 0.016);

    const tudo = k.juntar();
    const leds = new Map<string, THREE.BufferGeometry>();
    const solidos: [string, THREE.BufferGeometry, THREE.Material][] = [];
    tudo.forEach((g, chave) => {
        if (BALDES_POR_SALA.includes(chave)) {
            leds.set(chave, g);
            return;
        }
        const mat = MATERIAIS[chave];
        if (mat) solidos.push([chave, g, mat]);
    });
    kit = { solidos, leds };
    return kit;
}

// ---------- LEDs da sala (com a paleta dela) e as cadeiras (cor A a 45%) ----------

function LedsDaLan({ sala, led, apagada }: { sala: SalaPlanta; led: EstadoLed | null; apagada: boolean }) {
    const { leds } = montarKit();
    const mats = useMateriaisLed(sala.canalId, led, apagada);
    const acento = useMemo(() => new THREE.MeshStandardMaterial({ color: "#444444", roughness: 0.85 }), []);
    useEffect(() => () => acento.dispose(), [acento]);

    const a = useRef(new THREE.Color()).current;
    const b = useRef(new THREE.Color()).current;
    const estado = useRef(led);
    estado.current = led;
    useFrame(({ clock }) => {
        coresLed(sala.canalId, estado.current, clock.elapsedTime, a, b);
        acento.color.copy(a).multiplyScalar(0.45);
    });

    return (
        <group position={[sala.centro.x, 0, sala.centro.z]} rotation={[0, sala.tv.rot, 0]}>
            {BALDES_POR_SALA.map((chave) => {
                const g = leds.get(chave);
                if (!g) return null;
                if (chave === "acento") return <mesh key={chave} geometry={g} material={acento} />;
                const mat = mats[chave as keyof typeof mats];
                return <mesh key={chave} geometry={g} material={mat} renderOrder={chave.startsWith("led") || chave === "anel" ? 0 : 2} />;
            })}
            <Letreiro sala={sala} led={led} />
        </group>
    );
}

// neon "LAN HOUSE" na parede da esquerda, na cor B
function Letreiro({ sala, led }: { sala: SalaPlanta; led: EstadoLed | null }) {
    const { textura, aspecto } = useMemo(() => texturaTexto(["LAN HOUSE"], { largura: 1024, altura: 256, tamanho: 150, peso: 700, cor: "#ffffff" }), []);
    useEffect(() => () => textura.dispose(), [textura]);
    const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: textura, transparent: true, toneMapped: false, depthWrite: false }), [textura]);
    useEffect(() => () => mat.dispose(), [mat]);
    const a = useRef(new THREE.Color()).current;
    const b = useRef(new THREE.Color()).current;
    const estado = useRef(led);
    estado.current = led;
    useFrame(({ clock }) => {
        const k = coresLed(sala.canalId, estado.current, clock.elapsedTime, a, b);
        mat.color.copy(b).multiplyScalar(FORCA_LED * k + 0.03);
    });
    return (
        <mesh material={mat} position={[-MX + 0.03, 2.25, 0]} rotation={[0, Math.PI / 2, 0]} scale={[2.4, 2.4 / aspecto, 1]}>
            <planeGeometry args={[1, 1]} />
        </mesh>
    );
}

// ---------- monitores: a tela de quem está sentado ----------

// o que cada lugar ocupado mostra: o nome (pra tela de espera) e a tela compartilhada dele, se tiver
export type InfoMonitor = { nome: string; track: Track | undefined };

let geoTela: THREE.PlaneGeometry | null = null;
const telaCurva = () => (geoTela ??= curvar(new THREE.PlaneGeometry(MON_L, MON_A, 24, 1)));

const DESLIGADO = new THREE.MeshBasicMaterial({ color: "#050507" });

// um monitor: desligado (lugar vazio), tela de espera com o nome (sentou mas não compartilha)
// ou a tela compartilhada de quem está sentado
function MonitorTela({ x, z, ry, info }: { x: number; z: number; ry: number; info: InfoMonitor | undefined }) {
    const video = useTexturaVideo(info?.track, 640, 360);
    const nome = info?.nome;
    const espera = useMemo(() => {
        if (!nome) return null;
        return texturaTexto(
            [{ texto: nome, tamanho: 58, peso: 700 }, { texto: "sem tela compartilhada", tamanho: 26, cor: "#8a8a92", peso: 400 }],
            { largura: 512, altura: 288, fundo: "#10162a" },
        );
    }, [nome]);
    useEffect(() => () => espera?.textura.dispose(), [espera]);

    // a tela do vídeo cabe inteira no monitor (faixa preta se não for 16:9)
    const [fx, fy] = video ? (video.aspecto > MON_L / MON_A ? [1, MON_L / MON_A / video.aspecto] : [(video.aspecto * MON_A) / MON_L, 1]) : [1, 1];

    return (
        <group position={[x, TH, z]} rotation={[0, ry, 0]}>
            <group position={[0, 0.43, 0]} rotation={[-0.04, 0, 0]}>
                {video ? (
                    <mesh key="video" geometry={telaCurva()} position={[0, 0.006, 0.0075]} scale={[fx, fy, 1]}>
                        <meshBasicMaterial map={video.textura} toneMapped={false} />
                    </mesh>
                ) : espera ? (
                    <mesh key="espera" geometry={telaCurva()} position={[0, 0.006, 0.0075]}>
                        <meshBasicMaterial map={espera.textura} toneMapped={false} />
                    </mesh>
                ) : (
                    <mesh key="off" geometry={telaCurva()} material={DESLIGADO} position={[0, 0.006, 0.0075]} />
                )}
            </group>
        </group>
    );
}

function MonitoresLan({ sala, monitores }: { sala: SalaPlanta; monitores: Map<string, InfoMonitor> | null }) {
    return (
        <group position={[sala.centro.x, 0, sala.centro.z]} rotation={[0, sala.tv.rot, 0]}>
            {[0, 1, 2, 3, 4].flatMap((i) =>
                ([-1, 1] as const).map((s) => (
                    <MonitorTela
                        key={s + ":" + i}
                        x={LAN.lanX + s * 0.28}
                        z={zSetupLan(i)}
                        ry={(s * Math.PI) / 2}
                        info={monitores?.get(idAssentoLan(sala.canalId, s, i))}
                    />
                )),
            )}
        </group>
    );
}

type Props = {
    salas: SalaPlanta[];
    // a sala da sua call usa o LED do controle; as outras, a cor padrão delas
    salaDaCall: string | null;
    led: EstadoLed | null;
    salaEscura: string | null;
    // lugar ocupado -> quem está sentado e a tela dele (só na sala da sua call)
    monitores: Map<string, InfoMonitor> | null;
};

// todas as LAN houses do andar
export function SalasLanHouse({ salas, salaDaCall, led, salaEscura, monitores }: Props) {
    const { solidos } = montarKit();
    const matrizes = useMemo(
        () => salas.map((s) => new THREE.Matrix4().makeRotationY(s.tv.rot).setPosition(s.centro.x, 0, s.centro.z)),
        [salas],
    );
    if (salas.length === 0) return null;
    return (
        <>
            {solidos.map(([chave, geometria, mat]) => (
                <Instancias key={chave + "|" + matrizes.length} geometria={geometria} material={mat} matrizes={matrizes} />
            ))}
            {salas.map((s) => (
                <group key={s.canalId}>
                    <LedsDaLan sala={s} led={s.canalId === salaDaCall ? led : null} apagada={s.canalId === salaEscura} />
                    <MonitoresLan sala={s} monitores={s.canalId === salaDaCall ? monitores : null} />
                </group>
            ))}
        </>
    );
}
