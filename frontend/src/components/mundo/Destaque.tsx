// Contorno brilhante em volta do que você pode usar agora (o que está na mira ou perto, com o E
// disponível): o quadro do canal de texto, o tablet, o holograma do chat, o lugar pra sentar e o
// elevador. Desenhado por cima de tudo (sem teste de profundidade), pulsando de leve.
import { useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { dentro, ESPESSURA, type Interativo, type Planta } from "./planta";
import type { Pose } from "./rede";

const COR = "#eef1ff";
// grossura da linha e quanto ela fica pra fora do objeto
const LINHA = 0.025;

type Moldura = {
    // onde fica e pra onde olha (giro em y, e depois inclinação em x)
    pos: [number, number, number];
    rot: number;
    inclinacao: number;
    largura: number;
    altura: number;
    // quanto sai pra frente do objeto (não fica dentro dele)
    frente: number;
    // elevador: a moldura da porta (de fora) ou o painel (de dentro da cabine)
    so?: "fora" | "dentro";
};

const geometrias = new Map<string, THREE.ShapeGeometry>();
// retângulo arredondado vazado (só a borda)
function contorno(largura: number, altura: number) {
    const chave = `${largura.toFixed(3)}x${altura.toFixed(3)}`;
    let g = geometrias.get(chave);
    if (g) return g;
    const raio = Math.min(largura, altura) * 0.12;
    const ret = (l: number, a: number, r: number) => {
        const s = new THREE.Path();
        const x = -l / 2;
        const y = -a / 2;
        s.moveTo(x + r, y);
        s.lineTo(x + l - r, y);
        s.quadraticCurveTo(x + l, y, x + l, y + r);
        s.lineTo(x + l, y + a - r);
        s.quadraticCurveTo(x + l, y + a, x + l - r, y + a);
        s.lineTo(x + r, y + a);
        s.quadraticCurveTo(x, y + a, x, y + a - r);
        s.lineTo(x, y + r);
        s.quadraticCurveTo(x, y, x + r, y);
        return s;
    };
    const fora = new THREE.Shape(ret(largura, altura, raio).getPoints(8));
    fora.holes.push(ret(largura - LINHA * 2, altura - LINHA * 2, Math.max(0.001, raio - LINHA)));
    g = new THREE.ShapeGeometry(fora, 8);
    geometrias.set(chave, g);
    return g;
}

function molduras(planta: Planta, it: Interativo): Moldura[] {
    if (it.tipo === "texto") {
        const q = planta.quadros.find((x) => x.canalId === it.canalId);
        return q ? [{ pos: [q.x, 1.65, q.z], rot: q.rot, inclinacao: 0, largura: 2.26, altura: 1.5, frente: 0.07 }] : [];
    }
    if (it.tipo === "tablet") {
        const sl = planta.salas.find((s) => s.canalId === it.canalId);
        const t = it.alvo === 2 ? sl?.tablet2 : sl?.tablet;
        return t ? [{ pos: [t.x, t.y, t.z], rot: t.rot, inclinacao: t.inclinacao, largura: 0.4, altura: 0.3, frente: 0.012 }] : [];
    }
    if (it.tipo === "chat") {
        const h = planta.salas.find((s) => s.canalId === it.canalId)?.chat;
        return h ? [{ pos: [h.x, h.y, h.z], rot: Math.atan2(h.nx, h.nz), inclinacao: 0, largura: h.largura + 0.16, altura: h.altura + 0.16, frente: 0.02 }] : [];
    }
    if (it.tipo === "assento") {
        const a = planta.assentos.find((x) => x.id === it.assentoId);
        // deitada em cima da almofada
        return a ? [{ pos: [a.x, a.y + 0.53, a.z], rot: a.rot, inclinacao: -Math.PI / 2, largura: 0.58, altura: 0.54, frente: 0 }] : [];
    }
    // elevador: de fora, a moldura da porta; de dentro da cabine, o painel de andares (ver Elevador)
    const H = planta.hall.z2;
    return [
        { pos: [0, 1.26, H - ESPESSURA / 2 - 0.04], rot: Math.PI, inclinacao: 0, largura: 2.64, altura: 2.64, frente: 0, so: "fora" },
        { pos: [planta.elevador.x2 - ESPESSURA / 2 - 0.012, 1.3, H + 0.55], rot: -Math.PI / 2, inclinacao: 0, largura: 0.36, altura: 0.66, frente: 0.02, so: "dentro" },
    ];
}

export function Destaque({ planta, interativo, pose }: { planta: Planta; interativo: Interativo | null; pose: RefObject<Pose> }) {
    const lista = useMemo(() => (interativo ? molduras(planta, interativo) : []), [planta, interativo]);
    const grupos = useRef<(THREE.Group | null)[]>([]);
    const materialLinha = useMemo(
        () => new THREE.MeshBasicMaterial({ color: COR, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
        [],
    );
    const materialFundo = useMemo(
        () => new THREE.MeshBasicMaterial({ color: COR, transparent: true, opacity: 0.06, depthTest: false, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
        [],
    );
    // sempre que muda o que está em destaque, ele "chega" um pouco maior e encolhe pro lugar
    const surgiu = useRef(0);
    const ultimo = useRef<string | null>(null);

    useFrame(({ clock }, delta) => {
        const id = interativo?.id ?? null;
        if (id !== ultimo.current) {
            ultimo.current = id;
            surgiu.current = 0;
        }
        surgiu.current = Math.min(1, surgiu.current + delta * 6);
        const escala = 1 + (1 - surgiu.current) * 0.08;
        materialLinha.opacity = (0.6 + Math.sin(clock.elapsedTime * 4) * 0.25) * surgiu.current;
        const naCabine = dentro(planta.elevador, pose.current);
        lista.forEach((m, i) => {
            const g = grupos.current[i];
            if (!g) return;
            g.visible = !m.so || (m.so === "dentro") === naCabine;
            g.scale.setScalar(escala);
        });
    });

    return (
        <>
            {lista.map((m, i) => (
                <group key={`${interativo?.id}-${i}`} position={m.pos} rotation={[0, m.rot, 0]}>
                    <group rotation={[m.inclinacao, 0, 0]}>
                        <group ref={(g) => { grupos.current[i] = g; }} position={[0, 0, m.frente]}>
                            <mesh geometry={contorno(m.largura, m.altura)} material={materialLinha} renderOrder={20} />
                            <mesh material={materialFundo} renderOrder={19}>
                                <planeGeometry args={[m.largura - LINHA * 2, m.altura - LINHA * 2]} />
                            </mesh>
                        </group>
                    </group>
                </group>
            ))}
        </>
    );
}
