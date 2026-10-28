// O andar em si: paredes, pisos, tetos, luzes, janelas, letreiros, quadros e TVs.
import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { useThree, type ThreeElements } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { Track } from "livekit-client";
import type { Canal, ServidorDetalhe } from "../../api";
import type { ComandoYoutube, EstadoLed, EstadoYoutube } from "../../tipos";
import { PlayerYoutube } from "../youtube/PlayerYoutube";
import { useTexturaVideo } from "./midia";
import { material, Moveis } from "./Moveis";
import { PALETAS, paletaDaSala } from "./paletas";
import {
    ALTURA, ALTURA_HALL, ALTURA_PORTA, ESPESSURA, dentro,
    type Degrau, type Parede, type Planta, type Ret, type SalaPlanta, type TipoParede,
} from "./planta";
import { Holograma, type LinhaChat } from "./Holograma";
import { FORCA_LED, LuzesSalaGamer, SalasGamer } from "./SalaGamer";
import { LedsCinema } from "./CinemaGamer";
import { SalasLanHouse, type InfoMonitor } from "./LanHouse";
import {
    repetida, texturaBrilho, texturaCarpete, texturaCidade, texturaLavagem, texturaLuz, texturaPisoEscuro, texturaRipado, texturaTexto,
    type LinhaTexto,
} from "./texturas";

const PORTA_MEIA = 0.9;

// grafite neutro, no tom da interface do app
const COR_PAREDE: Record<TipoParede, THREE.MeshStandardMaterial> = {
    parede: material("#1b1b20", 0.85),
    hall: material("#212127", 0.85),
    metal: material("#2c2d33", 0.3, 0.85),
};
const RODAPE = material("#09090b", 0.6);
const TETO = material("#0d0d10", 0.85);
const METAL_PRETO = material("#0c0c0f", 0.4, 0.5);

const BRILHO = new THREE.MeshBasicMaterial({ color: "#eef1ff", toneMapped: false });

const CAIXA_SOM = material("#0b0b0d", 0.5);
const TELA_SOM = material("#18181c", 1);

// LEDs do hall e do corredor: sempre a paleta Neon (as salas têm a delas)
const NEON = PALETAS.NEON;
const LED_A = new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON.a).multiplyScalar(FORCA_LED), toneMapped: false });
const LED_B = new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON.b).multiplyScalar(FORCA_LED), toneMapped: false });

// brilho de LED (aditivo, some nas bordas). mapa: "radial" (mancha) ou "lavagem" (sanca na parede)
const brilhos = new Map<string, THREE.MeshBasicMaterial>();
function brilhoLed(cor: string, mapa: "radial" | "lavagem", opacidade: number) {
    const chave = `${cor}|${mapa}|${opacidade}`;
    let m = brilhos.get(chave);
    if (!m) {
        m = new THREE.MeshBasicMaterial({
            color: cor,
            transparent: true,
            opacity: opacidade,
            alphaMap: mapa === "radial" ? texturaBrilho() : texturaLavagem(),
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        brilhos.set(chave, m);
    }
    return m;
}

// fita de LED de uma cor qualquer (o filete das portas usa a cor da sala)
const fitas = new Map<string, THREE.MeshBasicMaterial>();
function fitaLed(cor: string, forca: number) {
    const chave = `${cor}|${forca}`;
    let m = fitas.get(chave);
    if (!m) {
        m = new THREE.MeshBasicMaterial({ color: new THREE.Color(cor).multiplyScalar(forca), toneMapped: false });
        fitas.set(chave, m);
    }
    return m;
}

// cinema no estilo da sala gamer: revestimento acústico grafite, teto quase preto (com o céu de
// estrelas) e degraus grafite. Os LEDs (sanca, bias do telão, fita nos degraus) são do CinemaGamer
const TECIDO_CINEMA = material("#17171c", 0.95);
const TETO_CINEMA = material("#0b0b0e", 1);
const DEGRAU_CINEMA = material("#1c1c22", 1);
const VELUDO = new THREE.MeshStandardMaterial({ color: "#1d1d25", roughness: 0.9, side: THREE.DoubleSide });

// cortina com dobras: um plano com ondas
const DOBRAS = (() => {
    const g = new THREE.PlaneGeometry(1.4, 1, 28, 1);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 22) * 0.05);
    g.computeVertexNormals();
    return g;
})();

const CAIXA = new THREE.BoxGeometry(1, 1, 1);
const PLANO = new THREE.PlaneGeometry(1, 1);

// muitas caixas com o mesmo material num desenho só (paredes, rodapés)
function Caixas({ caixas, material: mat }: { caixas: Parede[]; material: THREE.Material }) {
    const ref = useRef<THREE.InstancedMesh>(null);

    useLayoutEffect(() => {
        const malha = ref.current;
        if (!malha) return;
        const m = new THREE.Matrix4();
        const pos = new THREE.Vector3();
        const escala = new THREE.Vector3();
        const giro = new THREE.Quaternion();
        caixas.forEach((c, i) => {
            pos.set((c.x1 + c.x2) / 2, (c.base + c.topo) / 2, (c.z1 + c.z2) / 2);
            escala.set(c.x2 - c.x1, c.topo - c.base, c.z2 - c.z1);
            malha.setMatrixAt(i, m.compose(pos, giro, escala));
        });
        malha.instanceMatrix.needsUpdate = true;
        malha.computeBoundingSphere();
    }, [caixas]);

    if (caixas.length === 0) return null;
    return <instancedMesh key={caixas.length} ref={ref} args={[CAIXA, mat, caixas.length]} />;
}

// planos soltos (com giro em y) num desenho só: lavagem das sancas, brilhos
type PlanoSolto = { x: number; y: number; z: number; ry: number; largura: number; altura: number; deitado?: boolean };
function Planos({ planos, material: mat }: { planos: PlanoSolto[]; material: THREE.Material }) {
    const ref = useRef<THREE.InstancedMesh>(null);
    useLayoutEffect(() => {
        const malha = ref.current;
        if (!malha) return;
        const m = new THREE.Matrix4();
        const giro = new THREE.Quaternion();
        const euler = new THREE.Euler();
        planos.forEach((p, i) => {
            giro.setFromEuler(euler.set(p.deitado ? -Math.PI / 2 : 0, p.ry, 0, "YXZ"));
            malha.setMatrixAt(i, m.compose(new THREE.Vector3(p.x, p.y, p.z), giro, new THREE.Vector3(p.largura, p.altura, 1)));
        });
        malha.instanceMatrix.needsUpdate = true;
        malha.computeBoundingSphere();
    }, [planos]);
    if (planos.length === 0) return null;
    return <instancedMesh key={planos.length} ref={ref} args={[PLANO, mat, planos.length]} renderOrder={2} />;
}

function Piso({ ret, textura, metros, rugosidade, metal = 0, y = 0, cor = "#ffffff" }: { ret: Ret; textura: THREE.Texture; metros: number; rugosidade: number; metal?: number; y?: number; cor?: string }) {
    const largura = ret.x2 - ret.x1;
    const fundo = ret.z2 - ret.z1;
    const mapa = useMemo(() => repetida(textura, largura / metros, fundo / metros), [textura, largura, fundo, metros]);
    useEffect(() => () => mapa.dispose(), [mapa]);
    return (
        <mesh geometry={PLANO} position={[(ret.x1 + ret.x2) / 2, y, (ret.z1 + ret.z2) / 2]} rotation={[-Math.PI / 2, 0, 0]} scale={[largura, fundo, 1]}>
            <meshStandardMaterial map={mapa} roughness={rugosidade} metalness={metal} color={cor} />
        </mesh>
    );
}

function Teto({ ret, altura, mat = TETO }: { ret: Ret; altura: number; mat?: THREE.Material }) {
    return (
        <mesh
            geometry={PLANO}
            material={mat}
            position={[(ret.x1 + ret.x2) / 2, altura, (ret.z1 + ret.z2) / 2]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[ret.x2 - ret.x1, ret.z2 - ret.z1, 1]}
        />
    );
}

// mancha de luz pintada no chão
function PocaDeLuz({ x, z, raio, forca = 1 }: { x: number; z: number; raio: number; forca?: number }) {
    return (
        <mesh geometry={PLANO} position={[x, 0.012, z]} rotation={[-Math.PI / 2, 0, 0]} scale={[raio * 2, raio * 2, 1]} renderOrder={1}>
            <meshBasicMaterial map={texturaLuz()} transparent opacity={forca} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
    );
}

type PlacaProps = ThreeElements["group"] & {
    linhas: (string | LinhaTexto)[];
    opcoes?: Parameters<typeof texturaTexto>[1];
    largura: number;
};

// texto desenhado num plano (letreiros, plaquinhas, quadros)
function Placa({ linhas, opcoes, largura, ...grupo }: PlacaProps) {
    // recria a textura só quando o texto muda de verdade (não a cada render)
    const chave = JSON.stringify([linhas, opcoes]);
    const { textura, aspecto } = useMemo(() => texturaTexto(linhas, opcoes), [chave]);
    useEffect(() => () => textura.dispose(), [textura]);
    return (
        <group {...grupo}>
            <mesh geometry={PLANO} scale={[largura, largura / aspecto, 1]}>
                <meshBasicMaterial map={textura} transparent toneMapped={false} />
            </mesh>
        </group>
    );
}

// janela com a cidade lá fora. Fica colada na parede, virada pra dentro
function Janela({ largura, altura, semente, ...grupo }: ThreeElements["group"] & { largura: number; altura: number; semente: number }) {
    const vaos = Math.max(1, Math.round(largura / 1.4));
    return (
        <group {...grupo}>
            <mesh geometry={PLANO} scale={[largura, altura, 1]}>
                <meshBasicMaterial map={texturaCidade(semente)} toneMapped={false} />
            </mesh>
            {/* caixilhos */}
            {Array.from({ length: vaos + 1 }, (_, i) => (
                <mesh key={i} geometry={CAIXA} material={METAL_PRETO} position={[-largura / 2 + (i * largura) / vaos, 0, 0.03]} scale={[0.07, altura + 0.07, 0.06]} />
            ))}
            <mesh geometry={CAIXA} material={METAL_PRETO} position={[0, altura / 2, 0.03]} scale={[largura + 0.07, 0.07, 0.06]} />
            <mesh geometry={CAIXA} material={METAL_PRETO} position={[0, -altura / 2, 0.06]} scale={[largura + 0.2, 0.08, 0.16]} />
        </group>
    );
}

// YouTube junto tocando na TV da sala da sua call
export type YoutubeNaTV = {
    estado: EstadoYoutube;
    posicaoAgora: () => number;
    enviar: (comando: ComandoYoutube) => void;
    volume: RefObject<number>;
    mudo: boolean;
};

// tamanho do player em px: o drei converte px em metros por distanceFactor / 400
const PX_YOUTUBE = 1280;

const SEM_TELAS: TelaNaTV[] = [];

// uma tela compartilhada que vai pra TV, com o nome de quem compartilha (aparece no mosaico)
export type TelaNaTV = { track: Track; nome: string };

// TV da sala (ou o telão do cinema): o YouTube junto, a tela compartilhada da call em que
// você está (ou várias, em mosaico), ou o nome da sala
// destaque: a cor B dos LEDs da sala (o "CINEMA" do telão)
function TV({ sala, nome, telas, youtube, destaque, posicao, subtitulo }: { sala: SalaPlanta; nome: string; telas: TelaNaTV[]; youtube: YoutubeNaTV | undefined; destaque: string; posicao?: SalaPlanta["tv"]; subtitulo?: string }) {
    const cinema = sala.modelo === "CINEMA";
    const tv = posicao ?? sala.tv;
    const video = useTexturaVideo(telas.length === 1 ? telas[0]!.track : undefined, cinema ? 1920 : 1280, cinema ? 1080 : 720);
    // onde o <Html> pendura o iframe: sem isso o drei troca de elemento quando o canvas
    // liga os eventos, recria a raiz React e o player some (a raiz velha apaga a nova)
    const gl = useThree((s) => s.gl);
    const portal = useMemo(() => ({ current: gl.domElement.parentElement as HTMLElement }), [gl]);
    const L = tv.largura;
    const A = L * 9 / 16;
    // a tela cabe inteira dentro do 16:9, com faixa preta se precisar
    const [vl, va] = video ? (video.aspecto > 16 / 9 ? [L, L / video.aspecto] : [A * video.aspecto, A]) : [L, A];

    return (
        <group position={[tv.x, tv.y, tv.z]} rotation={[0, tv.rot, 0]}>
            {cinema ? (
                // cortinas de veludo dos dois lados do telão
                [-1, 1].map((s) => (
                    <mesh key={s} geometry={DOBRAS} material={VELUDO} position={[s * (L / 2 + 0.42), sala.altura / 2 - tv.y - 0.1, 0.12]} scale={[0.56, sala.altura - 0.25, 1]} />
                ))
            ) : null /* sala gamer: a bias light e as ripas atrás da TV são da SalaGamer */}
            <mesh geometry={CAIXA} material={material("#060607", 0.4)} position={[0, 0, 0.02]} scale={[L + (cinema ? 0.2 : 0.08), A + (cinema ? 0.2 : 0.08), 0.05]} />
            {youtube ? (
                // o YouTube não vira textura (iframe de outro site): o próprio iframe fica atrás
                // do canvas, posicionado em 3D, e um plano "fura" o canvas onde é a tela da TV
                <Html transform occlude="blending" portal={portal} position={[0, 0, 0.05]} distanceFactor={(L / PX_YOUTUBE) * 400}>
                    <div className="youtube-tv" style={{ width: PX_YOUTUBE, height: (PX_YOUTUBE * 9) / 16 }}>
                        <PlayerYoutube
                            estado={youtube.estado}
                            posicaoAgora={youtube.posicaoAgora}
                            enviar={youtube.enviar}
                            volume={youtube.volume}
                            mudo={youtube.mudo}
                            clicavel={false}
                        />
                    </div>
                </Html>
            ) : telas.length > 1 ? (
                <Mosaico telas={telas} largura={L} altura={A} pixels={cinema ? 1920 : 1280} />
            ) : video ? (
                <mesh geometry={PLANO} position={[0, 0, 0.05]} scale={[vl, va, 1]}>
                    <meshBasicMaterial map={video.textura} toneMapped={false} />
                </mesh>
            ) : (
                <Placa
                    position={[0, 0, 0.05]}
                    largura={L}
                    linhas={cinema
                        ? [{ texto: "CINEMA", tamanho: 40, cor: destaque, peso: 700 }, { texto: nome, tamanho: 84, peso: 700 }, { texto: "Coloque um vídeo do YouTube ou compartilhe a tela", tamanho: 26, cor: "#85858e", peso: 500 }]
                        : [{ texto: nome, tamanho: 64, cor: "#f2f2f4", peso: 600 }, { texto: subtitulo ?? "Ninguém compartilhando a tela", tamanho: 26, cor: "#8a8a92", peso: 400 }]}
                    opcoes={{ largura: 1024, altura: 576, fundo: cinema ? "#101013" : "#0f0f12" }}
                />
            )}
        </group>
    );
}
// várias telas ao mesmo tempo na TV: grade quase quadrada (2 = lado a lado, 3-4 = 2×2, 5-6 = 3×2...),
// com a última linha centralizada. pixels = largura do vídeo da TV inteira (cada tela pede a sua parte)
function Mosaico({ telas, largura, altura, pixels }: { telas: TelaNaTV[]; largura: number; altura: number; pixels: number }) {
    const n = telas.length;
    const colunas = Math.ceil(Math.sqrt(n));
    const linhas = Math.ceil(n / colunas);
    const vao = largura * 0.008;
    const cl = (largura - vao * (colunas + 1)) / colunas;
    const ca = (altura - vao * (linhas + 1)) / linhas;
    const px = Math.max(640, Math.round(pixels / colunas));
    return (
        <>
            {telas.map((t, i) => {
                const col = i % colunas;
                const lin = Math.floor(i / colunas);
                const naLinha = lin === linhas - 1 ? n - lin * colunas : colunas;
                const x = -(naLinha * cl + (naLinha - 1) * vao) / 2 + cl / 2 + col * (cl + vao);
                const y = altura / 2 - vao - ca / 2 - lin * (ca + vao);
                return <CelulaMosaico key={t.track.sid ?? i} tela={t} x={x} y={y} largura={cl} altura={ca} pixels={px} />;
            })}
        </>
    );
}

function CelulaMosaico({ tela, x, y, largura, altura, pixels }: { tela: TelaNaTV; x: number; y: number; largura: number; altura: number; pixels: number }) {
    const video = useTexturaVideo(tela.track, pixels, Math.round((pixels * 9) / 16));
    // o nome de quem compartilha, no canto de baixo da tela
    const etiqueta = useMemo(
        () => texturaTexto([{ texto: tela.nome, tamanho: 34, peso: 600 }], { largura: Math.max(180, tela.nome.length * 21 + 64), altura: 60, fundo: "rgba(10, 10, 12, 0.78)", raio: 14 }),
        [tela.nome],
    );
    useEffect(() => () => etiqueta.textura.dispose(), [etiqueta]);
    const [vl, va] = video ? (video.aspecto > largura / altura ? [largura, largura / video.aspecto] : [altura * video.aspecto, altura]) : [largura, altura];
    const ea = altura * 0.1;
    const el = ea * etiqueta.aspecto;
    const margem = altura * 0.035;

    return (
        <group position={[x, y, 0.05]}>
            {/* um mesh pra cada caso (key): se o React reaproveitasse o material, a cor do "carregando"
                ficava nele e escurecia o vídeo (a textura é multiplicada pela cor) */}
            {video ? (
                <mesh key="video" geometry={PLANO} scale={[vl, va, 1]}>
                    <meshBasicMaterial map={video.textura} toneMapped={false} />
                </mesh>
            ) : (
                <mesh key="vazio" geometry={PLANO} scale={[largura, altura, 1]}>
                    <meshBasicMaterial color="#0f0f12" />
                </mesh>
            )}
            <mesh geometry={PLANO} position={[-largura / 2 + el / 2 + margem, -altura / 2 + ea / 2 + margem, 0.003]} scale={[el, ea, 1]}>
                <meshBasicMaterial map={etiqueta.textura} transparent depthWrite={false} toneMapped={false} />
            </mesh>
        </group>
    );
}

// cor: a cor principal dos LEDs da sala (o filete acende nela quando tem gente lá dentro)
function Porta({ sala, nome, pessoas, cor }: { sala: SalaPlanta; nome: string; pessoas: number; cor: string }) {
    const { porta, lado } = sala;
    const virada = -lado * Math.PI / 2; // de frente pro corredor
    const meia = 0.9;
    const xFace = porta.x - lado * (ESPESSURA / 2 + 0.045);
    return (
        <group>
            {/* batentes de metal preto */}
            {[-1, 1].map((s) => (
                <mesh key={s} geometry={CAIXA} material={METAL_PRETO} position={[porta.x, ALTURA_PORTA / 2, porta.z + s * (meia + 0.04)]} scale={[ESPESSURA + 0.08, ALTURA_PORTA, 0.08]} />
            ))}
            <mesh geometry={CAIXA} material={METAL_PRETO} position={[porta.x, ALTURA_PORTA + 0.04, porta.z]} scale={[ESPESSURA + 0.08, 0.08, meia * 2 + 0.16]} />
            {/* filete de LED aceso na cor da sala quando tem gente lá dentro */}
            <mesh geometry={CAIXA} material={fitaLed(cor, pessoas > 0 ? FORCA_LED : 0.2)} position={[xFace, ALTURA_PORTA - 0.01, porta.z]} scale={[0.01, 0.025, meia * 2]} />
            {pessoas > 0 && (
                <mesh geometry={PLANO} material={brilhoLed(cor, "radial", 0.3)} position={[porta.x - lado * 0.9, 0.014, porta.z]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.8, 2.6, 1]} renderOrder={2} />
            )}
            <Placa
                position={[porta.x - lado * (ESPESSURA / 2 + 0.012), 2.82, porta.z]}
                rotation={[0, virada, 0]}
                largura={1.5}
                linhas={[
                    { texto: sala.modelo === "CINEMA" ? `Cinema · ${nome}` : sala.modelo === "LANHOUSE" ? `LAN · ${nome}` : nome, tamanho: 58, cor: "#f2f2f4", peso: 600 },
                    { texto: pessoas === 0 ? "vazia" : pessoas === 1 ? "1 pessoa" : `${pessoas} pessoas`, tamanho: 34, cor: pessoas > 0 ? cor : "#8a8a92", peso: 500 },
                ]}
                opcoes={{ largura: 768, altura: 220, fundo: "rgba(10, 10, 13, 0.92)", raio: 18 }}
            />
        </group>
    );
}

// por dentro do cinema: revestimento nas paredes (com o vão da porta) e os degraus
function DecoracaoCinema({ sala, degraus }: { sala: SalaPlanta; degraus: Degrau[] }) {
    const { ret, lado, porta, altura } = sala;
    const caixas = useMemo(() => {
        const t = 0.04;
        const xFora = lado > 0 ? ret.x2 : ret.x1;
        const xDentro = lado > 0 ? ret.x1 : ret.x2;
        const faixaX = (x: number, para: number) => (para > 0 ? { x1: x, x2: x + t } : { x1: x - t, x2: x });
        const parede = (r: Ret, base = 0, topo = altura): Parede => ({ ...r, base, topo, tipo: "parede" });
        const fora = faixaX(xFora, -lado);
        const dentroX = faixaX(xDentro, lado);
        const z1Porta = porta.z - PORTA_MEIA - 0.06;
        const z2Porta = porta.z + PORTA_MEIA + 0.06;
        return {
            tecido: [
                parede({ ...fora, z1: ret.z1, z2: ret.z2 }),
                parede({ x1: ret.x1, x2: ret.x2, z1: ret.z1, z2: ret.z1 + t }),
                parede({ x1: ret.x1, x2: ret.x2, z1: ret.z2 - t, z2: ret.z2 }),
                parede({ ...dentroX, z1: ret.z1, z2: z1Porta }),
                parede({ ...dentroX, z1: z2Porta, z2: ret.z2 }),
                parede({ ...dentroX, z1: z1Porta, z2: z2Porta }, ALTURA_PORTA + 0.08, altura),
            ],
            degraus: degraus.filter((d) => dentro(ret, { x: (d.x1 + d.x2) / 2, z: (d.z1 + d.z2) / 2 })).map((d) => parede(d, 0, d.topo)),
        };
    }, [ret, lado, porta, altura, degraus]);

    return (
        <group>
            <Caixas caixas={caixas.tecido} material={TECIDO_CINEMA} />
            <Caixas caixas={caixas.degraus} material={DEGRAU_CINEMA} />
        </group>
    );
}

// soundbar embaixo da TV e caixas de parede (as torres e o pedestal são móveis instanciados)
function CaixasSom({ sala }: { sala: SalaPlanta }) {
    return (
        <>
            {[...sala.caixasSom, ...(sala.caixasSom2 ?? [])].filter((c) => c.tipo === "barra" || c.tipo === "parede").map((c, i) => (
                <group key={i} position={[c.x, c.y, c.z]} rotation={[0, c.rot, 0]}>
                    <mesh
                        geometry={CAIXA}
                        material={CAIXA_SOM}
                        scale={c.tipo === "barra" ? [1.5, 0.11, 0.12] : [0.28, 0.42, 0.2]}
                    />
                    <mesh
                        geometry={CAIXA}
                        material={TELA_SOM}
                        position={[0, 0, c.tipo === "barra" ? 0.061 : 0.101]}
                        scale={c.tipo === "barra" ? [1.44, 0.08, 0.004] : [0.24, 0.38, 0.004]}
                    />
                </group>
            ))}
        </>
    );
}

// o tablet do controle da sala, com a tela acesa
function Tablet({ tablet, titulo = "CONTROLE DA SALA" }: { tablet: SalaPlanta["tablet"]; titulo?: string }) {
    return (
        <group position={[tablet.x, tablet.y, tablet.z]} rotation={[0, tablet.rot, 0]}>
            <group rotation={[tablet.inclinacao, 0, 0]}>
                <mesh geometry={CAIXA} material={material("#111113", 0.3, 0.4)} scale={[0.3, 0.2, 0.014]} />
                <Placa
                    position={[0, 0, 0.0075]}
                    largura={0.27}
                    linhas={[
                        { texto: titulo, tamanho: 30, cor: "#a78bfa", peso: 700 },
                        { texto: "TV  ·  Som  ·  Luzes", tamanho: 44, peso: 600 },
                        { texto: "YouTube junto", tamanho: 32, cor: "#b4b4bb", peso: 500 },
                    ]}
                    opcoes={{ largura: 512, altura: 360, fundo: "#16161a" }}
                />
            </group>
        </group>
    );
}

type Props = {
    planta: Planta;
    servidor: ServidorDetalhe;
    andar: number;
    pessoasPorSala: Map<string, number>;
    // sala da call em que você está (se for deste andar) e as telas que aparecem na TV dela
    salaDaCall: string | null;
    telasDaSala: TelaNaTV[];
    youtube: YoutubeNaTV | undefined;
    // LAN house: o que aparece na segunda TV (lounge) e nos monitores (lugar ocupado -> quem senta e a tela dele)
    telasDaSala2: TelaNaTV[];
    youtube2: YoutubeNaTV | undefined;
    monitores: Map<string, InfoMonitor> | null;
    // sala com a luz apagada agora (o anel do teto dela também apaga)
    salaEscura: string | null;
    // LEDs da sala da sua call (paleta, ciclo RGB, ligados), do controle da sala
    led: EstadoLed | null;
    // a sala em que você está agora: as luzes de verdade dos LEDs vão pra ela
    salaAtual: string | null;
    // mensagens do chat da sua call, pro holograma da sala dela
    chat: LinhaChat[];
};

export function Predio({ planta, servidor, andar, pessoasPorSala, salaDaCall, telasDaSala, youtube, telasDaSala2, youtube2, monitores, salaEscura, led, salaAtual, chat }: Props) {
    const { hall, corredor, elevador, salas, quadros } = planta;
    const H = hall.z2;
    const canais = useMemo(() => new Map<string, Canal>(servidor.canais.map((c) => [c.id, c])), [servidor.canais]);

    const porTipo = useMemo(() => {
        const grupos: Record<TipoParede, Parede[]> = { parede: [], hall: [], metal: [] };
        for (const p of [...planta.paredes, ...planta.vergas]) grupos[p.tipo].push(p);
        return grupos;
    }, [planta]);

    const rodapes = useMemo(
        () => planta.paredes
            .filter((p) => p.tipo !== "metal")
            .map((p) => ({ ...p, x1: p.x1 - 0.015, x2: p.x2 + 0.015, z1: p.z1 - 0.015, z2: p.z2 + 0.015, base: 0, topo: 0.12 })),
        [planta],
    );

    const salasTexto = salas.map((s) => ({
        nome: canais.get(s.canalId)?.nome ?? "",
        pessoas: pessoasPorSala.get(s.canalId) ?? 0,
    }));
    const linhasDiretorio: LinhaTexto[] = [
        { texto: "SALAS DE VOZ", tamanho: 40, cor: NEON.b, peso: 700 },
        ...(salasTexto.length === 0
            ? [{ texto: "Nenhuma sala ainda", tamanho: 44, cor: "#8a8a92", peso: 500 }]
            : salasTexto.slice(0, 7).map((s) => ({
                  texto: `${s.nome}  ·  ${s.pessoas === 0 ? "vazia" : s.pessoas === 1 ? "1 pessoa" : `${s.pessoas} pessoas`}`,
                  tamanho: 46,
                  cor: s.pessoas > 0 ? "#f2f2f4" : "#8a8a92",
                  peso: 500,
              }))),
        ...(salasTexto.length > 7 ? [{ texto: `+ ${salasTexto.length - 7} salas pelo corredor`, tamanho: 36, cor: "#8a8a92", peso: 500 }] : []),
    ];

    const pisoEscuro = texturaPisoEscuro();
    const ripadoLetreiro = useMemo(() => repetida(texturaRipado(), 3.6, 1), []);
    const zLuzes = useMemo(() => {
        const lista: number[] = [];
        for (let z = -2; z > corredor.z1 + 1; z -= 4) lista.push(z);
        return lista;
    }, [corredor.z1]);

    const salasGamer = useMemo(() => salas.filter((s) => s.modelo === "PADRAO"), [salas]);
    const salasLan = useMemo(() => salas.filter((s) => s.modelo === "LANHOUSE"), [salas]);
    // as luzes de verdade dos LEDs vão pra sala em que você está (gamer ou LAN house)
    const salaDosLeds = [...salasGamer, ...salasLan].find((s) => s.canalId === salaAtual) ?? null;

    // LEDs do hall e do corredor: sanca (A) no alto das paredes, a luz dela lavando a parede,
    // e fita (B) no rodapé do corredor
    const leds = useMemo(() => {
        const fita = (x1: number, x2: number, z1: number, z2: number, base: number, topo: number): Parede => ({ x1, x2, z1, z2, base, topo, tipo: "parede" });
        const t = 0.025;
        const yHall = ALTURA_HALL - 0.06;
        const yCorr = ALTURA - 0.06;
        const m = 0.1 + 0.1; // da face da parede
        const L = hall.x2; // metade da largura do prédio
        const sanca = [
            // hall: as quatro paredes
            fita(-L + m, L - m, m, m + t, yHall, yHall + t),
            fita(-L + m, L - m, H - m - t, H - m, yHall, yHall + t),
            fita(-L + m, -L + m + t, m, H - m, yHall, yHall + t),
            fita(L - m - t, L - m, m, H - m, yHall, yHall + t),
            // corredor: as duas laterais e o fundo
            ...[-1, 1].map((s) => fita(s * (corredor.x2 - m) - t / 2, s * (corredor.x2 - m) + t / 2, corredor.z1 + m, corredor.z2 - 0.1, yCorr, yCorr + t)),
            fita(corredor.x1 + m, corredor.x2 - m, corredor.z1 + m, corredor.z1 + m + t, yCorr, yCorr + t),
            // portal de entrada do corredor, do lado do hall
            ...[-1, 1].map((s) => fita(s * (corredor.x2 + 0.06) - 0.015, s * (corredor.x2 + 0.06) + 0.015, ESPESSURA / 2 + 0.01, ESPESSURA / 2 + 0.03, 0, ALTURA + 0.06)),
            fita(corredor.x1 - 0.08, corredor.x2 + 0.08, ESPESSURA / 2 + 0.01, ESPESSURA / 2 + 0.03, ALTURA + 0.045, ALTURA + 0.075),
        ];
        // fita B no pé das paredes do corredor (para nas portas, como o rodapé)
        const rodapeLed = planta.paredes
            .filter((p) => p.tipo === "parede" && p.z2 <= 0.01 && Math.abs(Math.abs((p.x1 + p.x2) / 2) - corredor.x2) < 0.01)
            .map((p) => {
                const s = Math.sign(p.x1 + p.x2);
                const x = s * (corredor.x2 - ESPESSURA / 2 - 0.03);
                return fita(x - 0.01, x + 0.01, p.z1 + 0.05, p.z2 - 0.05, 0.13, 0.145);
            });
        const lav = (x: number, z: number, ry: number, largura: number, topo: number, altura: number): PlanoSolto => ({ x, y: topo - altura / 2, z, ry, largura, altura });
        const lavagens = [
            lav(0, ESPESSURA / 2 + 0.012, 0, 2 * L - 0.4, ALTURA_HALL - 0.08, 1.2),
            lav(0, H - ESPESSURA / 2 - 0.012, Math.PI, 2 * L - 0.4, ALTURA_HALL - 0.08, 1.2),
            lav(-L + ESPESSURA / 2 + 0.012, H / 2, Math.PI / 2, H - 0.4, ALTURA_HALL - 0.08, 1.2),
            lav(L - ESPESSURA / 2 - 0.012, H / 2, -Math.PI / 2, H - 0.4, ALTURA_HALL - 0.08, 1.2),
            ...[-1, 1].map((s) => lav(s * (corredor.x2 - ESPESSURA / 2 - 0.012), (corredor.z1 + corredor.z2) / 2, -s * Math.PI / 2, corredor.z2 - corredor.z1 - 0.3, ALTURA - 0.08, 0.8)),
            lav(0, corredor.z1 + ESPESSURA / 2 + 0.012, 0, corredor.x2 * 2 - 0.4, ALTURA - 0.08, 0.8),
        ];
        // brilho no chão: na entrada do corredor e ao longo da fita do rodapé
        const manchas: PlanoSolto[] = [
            { x: 0, y: 0.014, z: 0.9, ry: 0, largura: 5.2, altura: 2.2, deitado: true },
            ...rodapeLed.map((r) => ({ x: (r.x1 + r.x2) / 2 - Math.sign(r.x1) * 0.35, y: 0.013, z: (r.z1 + r.z2) / 2, ry: 0, largura: 0.9, altura: r.z2 - r.z1, deitado: true })),
        ];
        return { sanca, rodapeLed, lavagens, manchas };
    }, [planta, hall.x2, H, corredor]);

    return (
        <group>
            {/* ---------- estrutura ---------- */}
            <Caixas caixas={porTipo.parede} material={COR_PAREDE.parede} />
            <Caixas caixas={porTipo.hall} material={COR_PAREDE.hall} />
            <Caixas caixas={porTipo.metal} material={COR_PAREDE.metal} />
            <Caixas caixas={rodapes} material={RODAPE} />

            <Piso ret={hall} textura={pisoEscuro} metros={2.4} rugosidade={0.38} metal={0.15} cor="#1c1c21" />
            <Piso ret={corredor} textura={pisoEscuro} metros={2} rugosidade={0.42} metal={0.15} cor="#19191e" />
            <Piso ret={{ x1: -0.9, x2: 0.9, z1: corredor.z1 + 0.6, z2: -0.4 }} textura={texturaCarpete()} metros={1} rugosidade={1} y={0.008} cor="#2a2a32" />
            {salas.map((s) => s.modelo === "CINEMA"
                ? <Piso key={s.canalId} ret={s.ret} textura={texturaCarpete()} metros={1} rugosidade={1} cor="#18181d" />
                : <Piso key={s.canalId} ret={s.ret} textura={pisoEscuro} metros={2} rugosidade={0.45} metal={0.15} cor="#17171b" />)}
            <Piso ret={elevador} textura={texturaCarpete()} metros={1} rugosidade={1} cor="#2e2e35" />

            <Teto ret={hall} altura={ALTURA_HALL} />
            <Teto ret={corredor} altura={ALTURA} />
            {salas.map((s) => <Teto key={s.canalId} ret={s.ret} altura={s.altura} mat={s.modelo === "CINEMA" ? TETO_CINEMA : TETO} />)}

            {/* ---------- LEDs do hall e do corredor ---------- */}
            <Caixas caixas={leds.sanca} material={LED_A} />
            <Caixas caixas={leds.rodapeLed} material={LED_B} />
            <Planos planos={leds.lavagens} material={brilhoLed(NEON.a, "lavagem", 0.28)} />
            <Planos planos={leds.manchas.slice(0, 1)} material={brilhoLed(NEON.a, "radial", 0.3)} />
            <Planos planos={leds.manchas.slice(1)} material={brilhoLed(NEON.b, "radial", 0.18)} />

            {/* ---------- hall ---------- */}
            {[-5, 0, 5].map((x) => (
                <mesh key={x} geometry={CAIXA} material={BRILHO} position={[x, ALTURA_HALL - 0.02, H / 2]} scale={[0.06, 0.03, H - 2.5]} />
            ))}
            {[-5, 0, 5].flatMap((x) => [H * 0.28, H * 0.72].map((z) => <PocaDeLuz key={`${x}:${z}`} x={x} z={z} raio={3.2} forca={0.4} />))}

            {/* parede da frente: letreiro do servidor (esquerda) e diretório das salas (direita) */}
            <mesh geometry={PLANO} position={[-6, ALTURA_HALL / 2, ESPESSURA / 2 + 0.005]} scale={[7.2, ALTURA_HALL, 1]}>
                <meshStandardMaterial map={ripadoLetreiro} roughness={0.7} />
            </mesh>
            {/* brilho atrás do nome e fita embaixo dele */}
            <mesh geometry={PLANO} material={brilhoLed(NEON.a, "radial", 0.35)} position={[-6, 2.55, ESPESSURA / 2 + 0.012]} scale={[8, 3.2, 1]} renderOrder={2} />
            <mesh geometry={CAIXA} material={LED_A} position={[-6, 1.72, ESPESSURA / 2 + 0.02]} scale={[5.6, 0.025, 0.02]} />
            <Placa
                position={[-6, 2.55, ESPESSURA / 2 + 0.02]}
                largura={6.2}
                linhas={[
                    { texto: `${andar}º ANDAR`, tamanho: 54, cor: NEON.b, peso: 600 },
                    { texto: servidor.nome, tamanho: 150, cor: "#f2f2f4", peso: 700 },
                ]}
                opcoes={{ largura: 2048, altura: 560 }}
            />
            {/* diretório com moldura de LED */}
            <Placa
                position={[6, 2, ESPESSURA / 2 + 0.02]}
                largura={4.4}
                linhas={linhasDiretorio}
                opcoes={{ largura: 1280, altura: 800, fundo: "rgba(12, 12, 15, 0.95)", raio: 24, alinhar: "left" }}
            />
            {[-1, 1].map((s) => (
                <group key={s}>
                    <mesh geometry={CAIXA} material={LED_B} position={[6, 2 + s * 1.43, ESPESSURA / 2 + 0.015]} scale={[4.3, 0.02, 0.02]} />
                    <mesh geometry={CAIXA} material={LED_B} position={[6 + s * 2.26, 2, ESPESSURA / 2 + 0.015]} scale={[0.02, 2.7, 0.02]} />
                </group>
            ))}
            <mesh geometry={PLANO} material={brilhoLed(NEON.b, "radial", 0.22)} position={[6, 2, ESPESSURA / 2 + 0.008]} scale={[6.2, 4.2, 1]} renderOrder={2} />

            {/* parede do fundo: janelas dos lados do elevador */}
            {[-1, 1].map((s) => (
                <Janela key={s} position={[s * 6.3, 2.15, H - ESPESSURA / 2 - 0.01]} rotation={[0, Math.PI, 0]} largura={5.6} altura={2.9} semente={s > 0 ? 2 : 1} />
            ))}
            {[-1, 1].map((s) => (
                <mesh key={s} geometry={PLANO} position={[s * 2.3, ALTURA_HALL / 2, H - ESPESSURA / 2 - 0.005]} rotation={[0, Math.PI, 0]} scale={[2, ALTURA_HALL, 1]}>
                    <meshStandardMaterial map={texturaRipado()} roughness={0.7} />
                </mesh>
            ))}

            {/* canais de texto: telas nas paredes laterais, com fita de LED embaixo */}
            {quadros.map((q) => (
                <group key={q.canalId} position={[q.x, 1.65, q.z]} rotation={[0, q.rot, 0]}>
                    <mesh geometry={CAIXA} material={METAL_PRETO} position={[0, 0, 0.02]} scale={[2.1, 1.35, 0.05]} />
                    <Placa
                        position={[0, 0, 0.05]}
                        largura={1.96}
                        linhas={[
                            { texto: `# ${canais.get(q.canalId)?.nome ?? ""}`, tamanho: 76, cor: "#f2f2f4", peso: 600 },
                            { texto: "canal de texto", tamanho: 34, cor: "#8a8a92", peso: 500 },
                        ]}
                        opcoes={{ largura: 1024, altura: 640, fundo: "#0f0f12" }}
                    />
                    <mesh geometry={CAIXA} material={LED_B} position={[0, -0.71, 0.03]} scale={[1.9, 0.02, 0.02]} />
                    <mesh geometry={PLANO} material={brilhoLed(NEON.b, "radial", 0.25)} position={[0, -0.2, 0.004]} scale={[3, 2.2, 1]} renderOrder={2} />
                </group>
            ))}

            {/* ---------- corredor ---------- */}
            {zLuzes.map((z) => (
                <group key={z}>
                    <mesh geometry={CAIXA} material={BRILHO} position={[0, ALTURA - 0.02, z]} scale={[0.5, 0.03, 0.5]} />
                    <PocaDeLuz x={0} z={z} raio={2.2} forca={0.5} />
                </group>
            ))}
            <Janela position={[0, 1.65, corredor.z1 + ESPESSURA / 2 + 0.01]} largura={3.2} altura={2.3} semente={3} />

            {/* ---------- salas ---------- */}
            <SalasGamer salas={salasGamer} salaDaCall={salaDaCall} led={led} salaEscura={salaEscura} />
            <SalasLanHouse salas={salasLan} salaDaCall={salaDaCall} led={led} salaEscura={salaEscura} monitores={monitores} />
            <LuzesSalaGamer sala={salaDosLeds} led={salaDosLeds?.canalId === salaDaCall ? led : null} apagada={!!salaDosLeds && salaDosLeds.canalId === salaEscura} />
            {salas.map((s) => {
                const nome = canais.get(s.canalId)?.nome ?? "";
                const ledDaSala = s.canalId === salaDaCall ? led : null;
                const paleta = paletaDaSala(s.canalId, ledDaSala);
                return (
                    <group key={s.canalId}>
                        <Porta sala={s} nome={nome} pessoas={pessoasPorSala.get(s.canalId) ?? 0} cor={paleta.a} />
                        <TV
                            sala={s}
                            nome={nome}
                            telas={s.canalId === salaDaCall ? telasDaSala : SEM_TELAS}
                            youtube={s.canalId === salaDaCall ? youtube : undefined}
                            destaque={paleta.b}
                            subtitulo={s.modelo === "LANHOUSE" ? "Telão da mesa LAN · ninguém compartilhando a tela" : undefined}
                        />
                        {s.tv2 && (
                            <TV
                                sala={s}
                                posicao={s.tv2}
                                nome={nome}
                                telas={s.canalId === salaDaCall ? telasDaSala2 : SEM_TELAS}
                                youtube={s.canalId === salaDaCall ? youtube2 : undefined}
                                destaque={paleta.b}
                                subtitulo="TV do lounge · ninguém compartilhando a tela"
                            />
                        )}
                        {s.modelo === "CINEMA" ? (
                            <>
                                <DecoracaoCinema sala={s} degraus={planta.degraus} />
                                <LedsCinema sala={s} degraus={planta.degraus} led={ledDaSala} />
                            </>
                        ) : s.modelo === "PADRAO" ? (
                            <Holograma sala={s} nomeSala={nome} mensagens={s.canalId === salaDaCall ? chat : null} led={ledDaSala} />
                        ) : null /* LAN house: os LEDs e a decoração são da SalasLanHouse */}
                        <CaixasSom sala={s} />
                        <Tablet tablet={s.tablet} titulo={s.tablet2 ? "TELÃO · MESA LAN" : undefined} />
                        {s.tablet2 && <Tablet tablet={s.tablet2} titulo="TV · LOUNGE" />}
                    </group>
                );
            })}

            <Moveis moveis={planta.moveis} />
        </group>
    );
}
