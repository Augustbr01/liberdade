// O canvas 3D e o que vai dentro dele (luz, prédio, elevador, você e os outros).
//
// O canvas fica montado o tempo todo que o 3D está aberto: trocar de andar (ou criar/apagar
// canal) só troca o conteúdo, que entra nele por um "túnel". Assim existe um contexto WebGL
// só — criar e destruir contexto toda hora estressa a placa de vídeo (e o Chrome desliga a
// aceleração se o processo da GPU travar algumas vezes).
import { Suspense, useMemo, useRef, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Environment, Lightformer } from "@react-three/drei";
import tunnel from "tunnel-rat";
import type { Participant, Room, Track } from "livekit-client";
import type { ServidorDetalhe, Usuario } from "../../api";
import type { EstadoLed } from "../../tipos";
import type { InfoMonitor } from "./LanHouse";
import { AudioEspacial, type SomDaTV } from "./AudioEspacial";
import { Boneco, type Papel } from "./Boneco";
import { useConfigMundo } from "./config";
import { Destaque } from "./Destaque";
import { Elevador } from "./Elevador";
import { Hitboxes } from "./Hitboxes";
import { Jogador, type ControleToque, type PedidoJogador } from "./Jogador";
import type { Interativo, Planta, Ponto } from "./planta";
import type { LinhaChat } from "./Holograma";
import { Predio, type TelaNaTV, type YoutubeNaTV } from "./Predio";
import type { Pose } from "./rede";

export type Pessoa = {
    usuario: Usuario;
    lerAlvo: () => Pose | undefined;
    participante?: Participant | undefined;
    camera?: Track | undefined;
    telas: Track[];
    // a tela compartilhada dela só aparece pra você depois de clicar no selo
    telaAberta: boolean;
    telaMirada: boolean;
    // cargo no servidor: aparece uma etiqueta em cima do nome
    papel: Papel;
};

type Props = {
    planta: Planta;
    servidor: ServidorDetalhe;
    andar: number;
    pose: RefObject<Pose>;
    // você: o seu boneco aparece na terceira pessoa
    eu: Usuario;
    pessoas: Pessoa[];
    posicoes: Map<string, Ponto>;
    pessoasPorSala: Map<string, number>;
    salaDaCall: string | null;
    telasDaSala: TelaNaTV[];
    youtube: YoutubeNaTV | undefined;
    portaAberta: boolean;
    portaFechada: RefObject<boolean>;
    parado: boolean;
    toque: RefObject<ControleToque>;
    pedido: RefObject<PedidoJogador | null>;
    sala: Room | undefined;
    surdo: boolean;
    // call do hall: a voz cai mais com a distância (conversa de corredor)
    proximidade: boolean;
    // luz apagada (cinema com filme rolando, ou escolhido no controle da sala): a TV ilumina a sala
    escuro: boolean;
    // LEDs da sala da sua call (controle da sala) e a sala em que você está
    led: EstadoLed | null;
    salaAtual: string | null;
    // LAN house: o que aparece na segunda TV (lounge) e nos monitores (lugar ocupado -> quem senta e a tela dele)
    telasDaSala2: TelaNaTV[];
    youtube2: YoutubeNaTV | undefined;
    monitores: Map<string, InfoMonitor> | null;
    // chat da sua call, pro holograma da sala
    chat: LinhaChat[];
    telao: { x: number; y: number; z: number; rot: number } | null;
    // a tela que está na TV da sala, pras caixas de som
    somTV: SomDaTV | null;
    onSala: (id: string | null) => void;
    onFoco: (it: Interativo | null) => void;
    // o que dá pra usar agora (fica com o contorno aceso)
    destaque: Interativo | null;
    // selos/telas em cima de quem compartilha (pra mira) e de quem é o que está na mira
    alvosTela: Map<string, THREE.Object3D>;
    onMiraTela: (usuarioId: string | null) => void;
    onTravado: (travado: boolean) => void;
    onPostura: (postura: number) => void;
    // velocidade no chão, pro velocímetro
    velocidade: RefObject<number>;
};

export type Tunel = ReturnType<typeof tunnel>;
export const criarTunel = tunnel;

export function CanvasMundo({ tunel, onContexto }: { tunel: Tunel; onContexto: (perdido: boolean) => void }) {
    return (
        <Canvas
            className="mundo-canvas"
            dpr={[1, 1.5]}
            gl={{ antialias: true, powerPreference: "high-performance" }}
            camera={{ fov: 72, near: 0.05, far: 120, position: [0, 1.62, 0] }}
            onCreated={({ gl }) => {
                // a placa de vídeo pode "reiniciar" (driver, falta de memória); o three tenta voltar
                // sozinho, e se não voltar o Mundo3D oferece recarregar
                gl.domElement.addEventListener("webglcontextlost", () => onContexto(true));
                gl.domElement.addEventListener("webglcontextrestored", () => onContexto(false));
            }}
        >
            <color attach="background" args={["#08080a"]} />
            <fog attach="fog" args={["#08080a", 26, 80]} />

            {/* reflexos: um "estúdio" de luzes gerado uma vez só, sem baixar nada */}
            <Environment resolution={256} frames={1} environmentIntensity={0.55}>
                <color attach="background" args={["#111114"]} />
                <Lightformer form="rect" intensity={2.2} color="#eef0ff" position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[14, 3, 1]} />
                <Lightformer form="rect" intensity={1.2} color="#8b5cf6" position={[-8, 2, 6]} rotation-y={Math.PI / 2} scale={[10, 2, 1]} />
                <Lightformer form="rect" intensity={1.2} color="#22d3ee" position={[8, 2, 6]} rotation-y={-Math.PI / 2} scale={[10, 2, 1]} />
                <Lightformer form="ring" intensity={1.5} color="#ffffff" position={[0, 3, -10]} scale={4} />
            </Environment>

            <tunel.Out />
        </Canvas>
    );
}

// luz geral do andar. Escurece aos poucos (uns 2 s) quando o filme começa no cinema;
// só quem está lá dentro vê, porque as paredes do cinema tapam o resto
function Luzes({ escuro, telao }: { escuro: boolean; telao: Props["telao"] }) {
    const hemisferio = useRef<THREE.HemisphereLight>(null);
    const sol = useRef<THREE.DirectionalLight>(null);
    const ambiente = useRef<THREE.AmbientLight>(null);
    const tela = useRef<THREE.PointLight>(null);
    const nivel = useRef(0);
    const cena = useThree((s) => s.scene);

    useFrame((_, delta) => {
        nivel.current += ((escuro ? 1 : 0) - nivel.current) * Math.min(1, delta * 1.5);
        const n = nivel.current;
        // apagada: sobra quase só a luz dos LEDs e da tela
        if (hemisferio.current) hemisferio.current.intensity = 2.6 * (1 - n * 0.92);
        if (sol.current) sol.current.intensity = 0.8 * (1 - n * 0.97);
        if (ambiente.current) ambiente.current.intensity = 0.9 * (1 - n * 0.92);
        if (tela.current) tela.current.intensity = n * 5;
        cena.environmentIntensity = 0.55 * (1 - n * 0.85);
    });

    return (
        <>
            {/* luz física: ambiente/hemisfério precisam de intensidade alta pra clarear teto e paredes */}
            <hemisphereLight ref={hemisferio} args={["#e6e8ff", "#2a2a30", 2.6]} />
            <directionalLight ref={sol} position={[4, 10, 6]} intensity={0.8} color="#f0f2ff" />
            <ambientLight ref={ambiente} intensity={0.9} color="#e8eaff" />
            {/* o brilho da TV / telão na sala escura (apagado no resto do tempo) */}
            <pointLight
                ref={tela}
                position={telao ? [telao.x + Math.sin(telao.rot) * 2.5, telao.y, telao.z + Math.cos(telao.rot) * 2.5] : [0, -50, 0]}
                color="#c4d0ff"
                intensity={0}
                distance={18}
                decay={1.2}
            />
        </>
    );
}

// o andar em si (entra no CanvasMundo pelo túnel)
const SEM_TELAS: Track[] = [];

export function Cena(props: Props) {
    const { planta, pose } = props;
    const { mostrarHitbox } = useConfigMundo();
    // onde o Jogador desenha você (entre os ticks da física), pro seu boneco ir junto com a câmera
    const visual = useRef<Pose>({ ...pose.current });

    return (
        <>
            <Luzes escuro={props.escuro} telao={props.telao} />

            <Suspense fallback={null}>
                <Predio
                    planta={planta}
                    servidor={props.servidor}
                    andar={props.andar}
                    pessoasPorSala={props.pessoasPorSala}
                    salaDaCall={props.salaDaCall}
                    telasDaSala={props.telasDaSala}
                    youtube={props.youtube}
                    telasDaSala2={props.telasDaSala2}
                    youtube2={props.youtube2}
                    monitores={props.monitores}
                    salaEscura={props.escuro ? props.salaDaCall : null}
                    led={props.led}
                    salaAtual={props.salaAtual}
                    chat={props.chat}
                />
                <Elevador planta={planta} andar={props.andar} aberta={props.portaAberta} />
                {mostrarHitbox && <Hitboxes solidos={planta.solidos} />}
                <Destaque planta={planta} interativo={props.destaque} pose={pose} />
                {props.pessoas.map((p) => (
                    <Boneco
                        key={p.usuario.id}
                        usuario={p.usuario}
                        lerAlvo={p.lerAlvo}
                        participante={p.participante}
                        camera={p.camera}
                        telas={p.telas}
                        telaAberta={p.telaAberta}
                        telaMirada={p.telaMirada}
                        papel={p.papel}
                        alvosTela={props.alvosTela}
                        posicoes={props.posicoes}
                        solidos={planta.solidos}
                    />
                ))}
            </Suspense>

            <Jogador
                planta={planta}
                pose={pose}
                parado={props.parado}
                portaFechada={props.portaFechada}
                toque={props.toque}
                pedido={props.pedido}
                onSala={props.onSala}
                onFoco={props.onFoco}
                onTravado={props.onTravado}
                onPostura={props.onPostura}
                velocidade={props.velocidade}
                visual={visual}
            />
            {/* depois do Jogador: lê a posição já deste quadro (antes, ficaria um quadro atrás da câmera) */}
            <Suspense fallback={null}>
                <Boneco
                    usuario={props.eu}
                    lerAlvo={() => visual.current}
                    telas={SEM_TELAS}
                    telaAberta={false}
                    telaMirada={false}
                    papel={null}
                    proprio
                    alvosTela={props.alvosTela}
                    posicoes={props.posicoes}
                    solidos={planta.solidos}
                />
            </Suspense>
            <MiraTelas alvos={props.alvosTela} onMira={props.onMiraTela} />
            <AudioEspacial sala={props.sala} posicoes={props.posicoes} surdo={props.surdo} tv={props.somTV} proximidade={props.proximidade} />
        </>
    );
}

// o que está no centro da tela (a mira) entre os selos/telas em cima de quem compartilha
const ALCANCE_MIRA_TELA = 20;
function MiraTelas({ alvos, onMira }: { alvos: Map<string, THREE.Object3D>; onMira: (id: string | null) => void }) {
    const raio = useMemo(() => {
        const r = new THREE.Raycaster();
        r.far = ALCANCE_MIRA_TELA;
        return r;
    }, []);
    const centro = useMemo(() => new THREE.Vector2(0, 0), []);
    const atual = useRef<string | null>(null);

    useFrame(({ camera }) => {
        raio.setFromCamera(centro, camera);
        let melhor: string | null = null;
        let menor = Infinity;
        alvos.forEach((obj, id) => {
            const acerto = raio.intersectObject(obj, true)[0];
            if (acerto && acerto.distance < menor) {
                menor = acerto.distance;
                melhor = id;
            }
        });
        if (melhor !== atual.current) {
            atual.current = melhor;
            onMira(melhor);
        }
    });
    return null;
}
