// Você em primeira pessoa (ou em terceira, com a câmera atrás da cabeça): mouse (com o ponteiro travado) ou toque pra olhar,
// WASD/setas ou o joystick da tela pra andar. Esbarra nas paredes e nos móveis,
// sobe os degraus do cinema, pula (Espaço ou rodinha pra baixo), anda devagar (Shift) e senta.
// Ctrl (um toque, como no CoD): parado agacha/levanta; correndo, desliza e volta a ficar em pé.
// No ar correndo (bunny hop), o Ctrl desliza assim que encostar no chão.
// C deita no chão (rasteja devagar) e levanta; deslizando, termina o deslize deitado.
//
// A movimentação é a da Source/CS: aceleração e atrito no chão, controle no ar (air strafe)
// e bunny hop — pular no tick em que encosta no chão não perde velocidade pro atrito.
// A física roda em ticks fixos de 64 por segundo (como o CS2) e a câmera interpola entre eles.
import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type * as THREE from "three";
import { estaDigitando } from "../../lib/util";
import { fovVertical, lerConfig, radianosPorPonto } from "./config";
import { ALTURA_AGACHADO, ALTURA_CORPO, ALTURA_DEITADO, alturaChao, mover, pontoLivre, solidoDeRet, DEGRAU_MAXIMO } from "./colisao";
import {
    dentro, ALTURA, ALTURA_ELEVADOR, ALTURA_HALL,
    type Assento, type Interativo, type Planta, type Ponto,
} from "./planta";
import { POSTURA, type Pose } from "./rede";

// 1 unidade do CS = 1 polegada
const U = 0.0254;
// altura dos olhos acima dos pés em cada postura (64 e 46 unidades no CS)
const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const OLHOS = { [POSTURA.EM_PE]: 64 * U, [POSTURA.AGACHADO]: 46 * U, [POSTURA.DESLIZANDO]: 38 * U, [POSTURA.SENTADO]: 1.15, [POSTURA.DEITADO]: 0.3 } as Record<number, number>;

const TICK = 1 / 64;
const VELOCIDADE = 250 * U; // a de quem corre com a faca no CS
const FATOR_DEVAGAR = 0.52; // Shift
const FATOR_AGACHADO = 0.34;
const FATOR_DEITADO = 0.35; // rastejando (~1,3 m/s)
const ACELERACAO = 5.5; // sv_accelerate
const ATRITO = 5.2; // sv_friction
const PARADA = 80 * U; // sv_stopspeed
const ACELERACAO_AR = 12; // sv_airaccelerate
const MAXIMO_AR = 30 * U; // o quanto o ar deixa somar na direção que você aperta
const GRAVIDADE = 800 * U;
const PULO = 301.993 * U;

// deslize (Ctrl correndo): impulso, quanto perde por segundo, quanto dura, e o quanto dá pra curvar
const DESLIZE_MINIMO = 0.75 * VELOCIDADE; // abaixo disso o Ctrl só agacha
const DESLIZE_IMPULSO = 1.4 * VELOCIDADE;
const DESLIZE_FREIO = 7; // m/s²
const DESLIZE_DURACAO = 0.75;
const DESLIZE_CURVA = 1.6; // rad/s
const DESLIZE_ESPERA = 0.5; // entre um deslize e outro

const SENSIBILIDADE_TOQUE = 0.005;
// apertar uma destas com o mouse solto já volta pro jogo
const TECLAS_DE_ANDAR = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"]);
const LIMITE_OLHAR = Math.PI / 2 - 0.02;
// travar o mouse recusado (a espera do Chrome depois do Esc): tenta de novo a cada tanto, até desistir
const INTERVALO_TRAVAR = 200;
const JANELA_TRAVAR = 3000;
// o quanto a mira pode passar longe do centro do tablet e ainda contar
const RAIO_MIRA_TABLET = 0.28;
// terceira pessoa: a câmera fica atrás da cabeça e um pouco acima (pra cabeça não tapar a mira).
// Ela é uma bolinha desse raio: bate em parede, móvel, teto e chão e chega mais perto
const DISTANCIA_3P = 2.6;
const ALTURA_3P = 0.3;
const RAIO_CAMERA = 0.18;
const PASSO_CAMERA = 0.1;

export type ControleToque = {
    // joystick: -1..1 em cada eixo (y negativo = pra frente)
    andar: { x: number; y: number };
    // quanto girou desde o último quadro (px)
    olhar: { x: number; y: number };
    // botões da tela: pular (uma vez) e agachar (liga/desliga)
    pular: boolean;
    agachado: boolean;
};

// pedidos de fora (o Mundo3D decide se o lugar está livre)
// travar: volta o mouse pro jogo (fechou um painel com Esc)
export type PedidoJogador = { tipo: "sentar"; assento: Assento } | { tipo: "levantar" } | { tipo: "travar" };

type Props = {
    planta: Planta;
    pose: RefObject<Pose>;
    // modal aberto etc.: fica parado
    parado: boolean;
    portaFechada: RefObject<boolean>;
    toque: RefObject<ControleToque>;
    pedido: RefObject<PedidoJogador | null>;
    // velocidade no chão agora (m/s), pro velocímetro
    velocidade: RefObject<number>;
    // onde o seu boneco aparece (a posição entre os ticks, a mesma da câmera), pra terceira pessoa
    visual: RefObject<Pose>;
    onSala: (salaId: string | null) => void;
    onFoco: (interativo: Interativo | null) => void;
    onTravado: (travado: boolean) => void;
    onPostura: (postura: number) => void;
};

export function Jogador({ planta, pose, parado, portaFechada, toque, pedido, velocidade, visual, onSala, onFoco, onTravado, onPostura }: Props) {
    const { camera, gl } = useThree();
    const teclas = useRef(new Set<string>());
    // pulo apertado (tecla ou rodinha): vale pro próximo tick, e só se estiver no chão nele
    const querPular = useRef(false);
    const olhar = useRef({ yaw: pose.current.rot, pitch: 0 });
    const fisica = useRef({
        vx: 0, vz: 0, vy: 0, noChao: true,
        // posição do tick anterior (a câmera fica entre ele e o atual)
        antes: { x: pose.current.x, y: pose.current.y, z: pose.current.z },
        acumulado: 0,
        olhos: OLHOS[POSTURA.EM_PE], cameraY: pose.current.y + OLHOS[POSTURA.EM_PE],
        assento: null as Assento | null,
        agachado: false,
        // deslizando: o tempo que falta (0 = não); e a espera até poder deslizar de novo
        deslize: 0,
        esperaDeslize: 0,
        // Ctrl no ar correndo: desliza quando encostar no chão
        deslizeNaQueda: false,
        // rastejando: a câmera balança junto com as puxadas dos braços
        faseRasteja: 0, balancoRasteja: 0,
    });
    // agachado pelo Ctrl (liga/desliga com um toque; o deslize só termina agachado sem espaço pra levantar)
    const agachadoLigado = useRef(false);
    // deitado pelo C (liga/desliga; só levanta se tiver espaço)
    const deitadoLigado = useRef(false);
    // Ctrl / C apertado: vale pro próximo quadro
    const apertouCtrl = useRef(false);
    const apertouC = useRef(false);
    // o que o último toque no Ctrl fez (Ctrl + rodinha é zoom: aí o agachar desse toque é desfeito)
    const acaoCtrl = useRef<"agachar" | "deslizar" | "zoom" | null>(null);
    // o botão de agachar da tela (toque) também conta como um toque no Ctrl
    const agachadoToqueAntes = useRef(false);
    // zoom com Ctrl + rodinha (1 = normal): o alvo muda na hora, a câmera chega nele suave
    const zoomAlvo = useRef(1);
    const zoom = useRef(1);
    // terceira pessoa: a distância que a câmera quer (vai e volta suave ao trocar de visão) e a de
    // agora (encurta na hora quando bate em algo e volta devagar quando libera)
    const recuo = useRef({ quer: lerConfig().terceiraPessoa ? DISTANCIA_3P : 0, real: 0 });
    const sala = useRef<string | null>(null);
    const foco = useRef<string | null>(null);
    const postura = useRef<number>(POSTURA.EM_PE);
    // trava o mouse no jogo (definida no efeito, que tem o canvas)
    const travarMouse = useRef<() => void>(() => {});
    const paradoRef = useRef(parado);
    paradoRef.current = parado;

    // a primeira sala é a de onde você nasceu (sem disparar entrar na call de novo)
    if (sala.current === null) {
        sala.current = planta.salas.find((s) => dentro(s.ret, pose.current))?.canalId ?? null;
    }

    useEffect(() => {
        const canvas = gl.domElement;
        // o YouTube na TV deixa o canvas sem receber clique (o iframe fica atrás dele),
        // então o clique que trava o mouse é ouvido no elemento de fora
        const area = canvas.parentElement ?? canvas;
        const travado = () => document.pointerLockElement === canvas;

        // O Chrome não deixa travar de novo logo depois do Esc (~1 s): o clique nessa espera é
        // recusado. Em vez de perder o clique, tenta de novo sozinho até dar (o clique continua
        // valendo como gesto por alguns segundos)
        let tentativa: number | undefined;
        let desistirEm = 0;
        const pedir = (bruta: boolean) => {
            if (travado() || paradoRef.current) return;
            let pedido: Promise<void> | void;
            try {
                pedido = bruta ? canvas.requestPointerLock({ unadjustedMovement: true }) : canvas.requestPointerLock();
            } catch (erro) {
                falhou(erro, bruta);
                return;
            }
            Promise.resolve(pedido).catch((erro: unknown) => falhou(erro, bruta));
        };
        const falhou = (erro: unknown, bruta: boolean) => {
            // navegador sem entrada bruta: vai sem
            const nome = (erro as Error | undefined)?.name;
            if (bruta && (nome === "NotSupportedError" || nome === "TypeError")) {
                pedir(false);
                return;
            }
            if (performance.now() > desistirEm) return;
            window.clearTimeout(tentativa);
            tentativa = window.setTimeout(() => pedir(bruta), INTERVALO_TRAVAR);
        };
        const travar = () => {
            window.clearTimeout(tentativa);
            desistirEm = performance.now() + JANELA_TRAVAR;
            // entrada bruta: o movimento do mouse sem a aceleração do sistema (nem todo navegador tem)
            pedir(lerConfig().entradaBruta);
        };

        travarMouse.current = () => {
            if (!travado()) travar();
        };

        const aoClicar = (e: MouseEvent) => {
            // no toque não tem ponteiro pra travar: lá quem olha é o arrastar
            const tipo = (e as PointerEvent).pointerType;
            if ((tipo && tipo !== "mouse") || !("requestPointerLock" in canvas)) return;
            if (!paradoRef.current && !travado()) travar();
        };
        const aoRodar = (e: WheelEvent) => {
            // Ctrl + rodinha: zoom (pra cima aproxima, pra baixo volta ao normal). Só dentro do 3D:
            // em cima de um painel (chat, controle) fica o zoom da página do navegador
            if (e.ctrlKey) {
                if (!travado() && !(e.target instanceof Node && area.contains(e.target))) return;
                e.preventDefault();
                // o Ctrl desse giro era pro zoom, não pra agachar: desfaz
                if (acaoCtrl.current === "agachar") agachadoLigado.current = !agachadoLigado.current;
                if (acaoCtrl.current === "deslizar") fisica.current.deslizeNaQueda = false;
                acaoCtrl.current = "zoom";
                // linhas (Firefox) viram pixels; um "clique" da rodinha (~100 px) dá ~1,3×,
                // e o pinça do touchpad (deltas pequenos) vai suave
                const px = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1);
                zoomAlvo.current = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomAlvo.current * Math.exp(-px * 0.0025)));
                if (zoomAlvo.current < 1.02) zoomAlvo.current = 1;
                return;
            }
            // rodinha pra baixo pula ("bind mwheeldown +jump"); pra cima não faz nada
            if (!travado() || paradoRef.current || e.deltaY <= 0) return;
            querPular.current = true;
        };
        const aoMudarTrava = () => onTravado(travado());
        const aoMexer = (e: MouseEvent) => {
            if (!travado() || paradoRef.current) return;
            const cfg = lerConfig();
            // com zoom, o mouse anda menos (como mira de luneta): o mesmo gesto cobre o mesmo pedaço da tela
            const rad = radianosPorPonto(cfg.sensibilidade) / zoom.current;
            olhar.current.yaw -= e.movementX * rad;
            const y = cfg.inverterY ? -e.movementY : e.movementY;
            olhar.current.pitch = Math.max(-LIMITE_OLHAR, Math.min(LIMITE_OLHAR, olhar.current.pitch - y * rad));
        };
        const aoApertar = (e: KeyboardEvent) => {
            if (estaDigitando(e) || e.metaKey || e.altKey) return;
            if (e.code === "ControlLeft" || e.code === "ControlRight") {
                // um toque por aperto (segurar não repete); só jogando (com o mouse travado)
                if (!e.repeat && travado()) apertouCtrl.current = true;
                return;
            }
            if (e.code === "KeyC" && !e.ctrlKey) {
                if (!e.repeat && travado()) apertouC.current = true;
                return;
            }
            // jogando, os atalhos do navegador com Ctrl (Ctrl+D, Ctrl+S...) não disparam.
            // Ctrl+W, Ctrl+T e Ctrl+N o navegador não deixa bloquear (ver aoSair)
            if (e.ctrlKey) {
                if (!travado()) return;
                e.preventDefault();
            }
            // mouse solto (fechou um painel com Esc, por exemplo): começar a andar já volta pro jogo.
            // O navegador só deixa travar o mouse depois de uma tecla ou clique — e o Esc não conta
            if (TECLAS_DE_ANDAR.has(e.code) && !travado() && !paradoRef.current) travar();
            teclas.current.add(e.code);
            if (e.code === "Space") {
                // sem isso o Espaço rola a página ou clica no botão que estiver com foco
                e.preventDefault();
                if (!e.repeat) querPular.current = true;
            }
        };
        const aoSoltar = (e: KeyboardEvent) => {
            teclas.current.delete(e.code);
            if (e.code === "ControlLeft" || e.code === "ControlRight") acaoCtrl.current = null;
        };
        // Ctrl+W fecha a aba e nenhum site consegue bloquear. Jogando (mouse travado), pelo menos
        // o navegador pergunta "Sair do site?" antes, em vez de fechar direto
        const aoSair = (e: BeforeUnloadEvent) => {
            if (!travado()) return;
            e.preventDefault();
            e.returnValue = "";
        };
        const aoSairDaJanela = () => teclas.current.clear();

        area.addEventListener("click", aoClicar);
        // não passivo: o Ctrl + rodinha precisa do preventDefault pra não dar zoom na página
        document.addEventListener("wheel", aoRodar, { passive: false });
        document.addEventListener("pointerlockchange", aoMudarTrava);
        document.addEventListener("mousemove", aoMexer);
        window.addEventListener("keydown", aoApertar);
        window.addEventListener("keyup", aoSoltar);
        window.addEventListener("blur", aoSairDaJanela);
        window.addEventListener("beforeunload", aoSair);
        return () => {
            window.clearTimeout(tentativa);
            window.removeEventListener("beforeunload", aoSair);
            area.removeEventListener("click", aoClicar);
            document.removeEventListener("wheel", aoRodar);
            document.removeEventListener("pointerlockchange", aoMudarTrava);
            document.removeEventListener("mousemove", aoMexer);
            window.removeEventListener("keydown", aoApertar);
            window.removeEventListener("keyup", aoSoltar);
            window.removeEventListener("blur", aoSairDaJanela);
            if (document.pointerLockElement === canvas) document.exitPointerLock();
        };
    }, [gl, onTravado]);

    // abriu um modal: solta o mouse e as teclas
    useEffect(() => {
        if (!parado) return;
        teclas.current.clear();
        if (document.pointerLockElement === gl.domElement) document.exitPointerLock();
    }, [parado, gl]);

    // a porta do elevador fechada também é parede
    const portaElevador = useMemo(() => solidoDeRet(planta.portaElevador, 0, ALTURA_ELEVADOR), [planta]);
    const solidos = () => (portaFechada.current ? [...planta.solidos, portaElevador] : planta.solidos);

    // altura do teto onde você está (pra não atravessar com o pulo)
    function teto(p: Ponto) {
        if (dentro(planta.elevador, p)) return ALTURA_ELEVADOR;
        const s = planta.salas.find((q) => dentro(q.ret, p));
        if (s) return s.altura;
        if (dentro(planta.hall, p)) return ALTURA_HALL;
        return ALTURA;
    }

    // levanta e fica em pé na frente do lugar (um pouco mais longe se ali estiver ocupado)
    function levantar() {
        const f = fisica.current;
        const a = f.assento;
        if (!a) return;
        const p = pose.current;
        const fx = -Math.sin(a.rot);
        const fz = -Math.cos(a.rot);
        const tentativas: Ponto[] = [0.8, 1.1, 1.4].map((d) => ({ x: a.x + fx * d, z: a.z + fz * d }));
        const alvo = tentativas.find((q) => pontoLivre(solidos(), q, a.y)) ?? tentativas[0]!;
        p.x = alvo.x;
        p.z = alvo.z;
        p.y = alturaChao(solidos(), alvo, a.y);
        f.antes = { x: p.x, y: p.y, z: p.z };
        f.assento = null;
        f.vx = f.vz = f.vy = 0;
        f.noChao = true;
    }

    // ---------- um tick da física (Source) ----------

    function atrito(dt: number) {
        const f = fisica.current;
        const vel = Math.hypot(f.vx, f.vz);
        if (vel < 0.001) {
            f.vx = f.vz = 0;
            return;
        }
        const controle = vel < PARADA ? PARADA : vel;
        const nova = Math.max(0, vel - controle * ATRITO * dt);
        f.vx *= nova / vel;
        f.vz *= nova / vel;
    }

    // soma velocidade na direção desejada até chegar em `desejada` (no ar, só até MAXIMO_AR
    // na direção apertada — é isso que deixa ganhar velocidade virando o mouse com A/D no pulo)
    function acelerar(dirX: number, dirZ: number, desejada: number, aceleracao: number, limite: number, dt: number) {
        const f = fisica.current;
        const atual = f.vx * dirX + f.vz * dirZ;
        const falta = Math.min(desejada, limite) - atual;
        if (falta <= 0) return;
        const soma = Math.min(aceleracao * desejada * dt, falta);
        f.vx += soma * dirX;
        f.vz += soma * dirZ;
    }

    // cabe em pé aqui (pra levantar do agachado)? Embaixo da prateleira, não
    function cabeEmPe(p: Ponto & { y: number }) {
        return pontoLivre(solidos(), p, p.y, p.y + ALTURA_CORPO);
    }
    function cabeAgachado(p: Ponto & { y: number }) {
        return pontoLivre(solidos(), p, p.y, p.y + ALTURA_AGACHADO);
    }

    // sai do deitado: fica em pé, ou agachado se só couber agachado (embaixo da prateleira)
    function levantarDoChao() {
        const p = pose.current;
        if (cabeEmPe(p)) agachadoLigado.current = false;
        else if (cabeAgachado(p)) agachadoLigado.current = true;
        else return;
        deitadoLigado.current = false;
    }

    // um toque no C: deita / levanta. Deslizando, termina o deslize no chão (como no CoD)
    function apertarDeitar() {
        const f = fisica.current;
        if (!f.noChao) return;
        if (deitadoLigado.current) {
            levantarDoChao();
            return;
        }
        if (f.deslize > 0) {
            f.deslize = 0;
            f.esperaDeslize = DESLIZE_ESPERA;
        }
        deitadoLigado.current = true;
        agachadoLigado.current = false;
    }

    // um toque no Ctrl (ou no botão de agachar da tela)
    function apertarAgachar() {
        const f = fisica.current;
        if (f.deslize > 0) return;
        // deitado: o Ctrl sobe pro agachado (se couber)
        if (deitadoLigado.current) {
            if (!cabeAgachado(pose.current)) return;
            deitadoLigado.current = false;
            agachadoLigado.current = true;
            acaoCtrl.current = "agachar";
            return;
        }
        const vel = Math.hypot(f.vx, f.vz);
        const rapido = !agachadoLigado.current && vel >= DESLIZE_MINIMO;
        // correndo: desliza (com um impulso pra frente, como no CoD)
        if (f.noChao && rapido && f.esperaDeslize <= 0) {
            comecarDeslize();
            acaoCtrl.current = "deslizar";
            return;
        }
        // no ar correndo (bunny hop): fica guardado e desliza ao encostar no chão; outro toque desiste
        if (!f.noChao && (rapido || f.deslizeNaQueda)) {
            f.deslizeNaQueda = !f.deslizeNaQueda;
            acaoCtrl.current = "deslizar";
            return;
        }
        // parado ou devagar: agacha / levanta (se tiver espaço pra ficar em pé)
        if (agachadoLigado.current) {
            if (!cabeEmPe(pose.current)) return;
            agachadoLigado.current = false;
        } else {
            agachadoLigado.current = true;
        }
        acaoCtrl.current = "agachar";
    }

    function comecarDeslize() {
        const f = fisica.current;
        const vel = Math.hypot(f.vx, f.vz);
        const k = Math.max(vel, DESLIZE_IMPULSO) / vel;
        f.vx *= k;
        f.vz *= k;
        f.deslize = DESLIZE_DURACAO;
    }

    // um tick deslizando: perde velocidade aos poucos, curva só um pouco, e termina em pé
    // (agachado só se acabar num lugar onde não dá pra levantar, como embaixo da prateleira)
    function deslizar(dt: number, dirX: number, dirZ: number) {
        const f = fisica.current;
        const vel = Math.hypot(f.vx, f.vz);
        const nova = Math.max(0, vel - DESLIZE_FREIO * dt);
        let angulo = Math.atan2(f.vz, f.vx);
        if (dirX || dirZ) {
            let diferenca = Math.atan2(dirZ, dirX) - angulo;
            diferenca = Math.atan2(Math.sin(diferenca), Math.cos(diferenca));
            // só curva pra onde aponta mais ou menos pra frente (pra trás não freia nem vira)
            if (Math.abs(diferenca) < Math.PI / 2) angulo += Math.max(-DESLIZE_CURVA * dt, Math.min(DESLIZE_CURVA * dt, diferenca));
        }
        f.vx = Math.cos(angulo) * nova;
        f.vz = Math.sin(angulo) * nova;
        f.deslize -= dt;
        if (f.deslize <= 0 || nova < VELOCIDADE * FATOR_AGACHADO) {
            f.deslize = 0;
            f.esperaDeslize = DESLIZE_ESPERA;
            agachadoLigado.current = !cabeEmPe(pose.current);
        }
    }

    function tick(dt: number, frente: number, lado: number, devagar: boolean, pular: boolean) {
        const f = fisica.current;
        const p = pose.current;
        f.antes = { x: p.x, y: p.y, z: p.z };
        f.esperaDeslize = Math.max(0, f.esperaDeslize - dt);
        // deitado, o pulo só levanta (não sai do chão)
        if (pular && f.noChao && deitadoLigado.current) {
            levantarDoChao();
            pular = false;
        }
        // pulou: levanta. Do deslize é o "slide cancel": sai pulando e mantém o embalo
        if (pular && f.noChao) {
            if (f.deslize > 0) {
                f.deslize = 0;
                f.esperaDeslize = DESLIZE_ESPERA;
            }
            if (agachadoLigado.current && cabeEmPe(p)) agachadoLigado.current = false;
        }
        const deslizando = f.deslize > 0;
        const deitado = deitadoLigado.current;
        // deslizando, o corpo fica baixo como agachado (passa por baixo do que o agachado passa)
        const agachar = !deitado && (deslizando || agachadoLigado.current);
        f.agachado = agachar;
        const alturaCorpo = deitado ? ALTURA_DEITADO : agachar ? ALTURA_AGACHADO : ALTURA_CORPO;

        // direção que você quer ir, no andar: frente = (-sen yaw, -cos yaw); direita = (cos yaw, -sen yaw)
        const yaw = olhar.current.yaw;
        const intensidade = Math.min(1, Math.hypot(frente, lado));
        let dirX = 0;
        let dirZ = 0;
        if (intensidade > 0.05) {
            const norma = Math.hypot(frente, lado);
            const fr = frente / norma;
            const la = lado / norma;
            dirX = -Math.sin(yaw) * fr + Math.cos(yaw) * la;
            dirZ = -Math.cos(yaw) * fr - Math.sin(yaw) * la;
        }
        const desejada = VELOCIDADE * (deitado ? FATOR_DEITADO : agachar ? FATOR_AGACHADO : devagar ? FATOR_DEVAGAR : 1) * intensidade;

        if (f.noChao) {
            if (pular) {
                // pulou: sai do chão antes do atrito (bhop no tick certo não perde nada)
                f.vy = PULO;
                f.noChao = false;
            } else if (!deslizando) {
                atrito(dt);
            }
        }
        if (deslizando && f.noChao) deslizar(dt, dirX, dirZ);
        else if (f.noChao) acelerar(dirX, dirZ, desejada, ACELERACAO, Infinity, dt);
        else acelerar(dirX, dirZ, desejada, ACELERACAO_AR, MAXIMO_AR, dt);

        // andar com colisão: o que fica acima do degrau que dá pra subir (e abaixo da cabeça) é parede
        const lista = solidos();
        const novo = mover(p, { x: p.x + f.vx * dt, z: p.z + f.vz * dt }, lista, p.y, p.y + alturaCorpo);
        // bateu: a velocidade fica só no que deu pra andar (desliza na parede, não acumula)
        const realX = (novo.x - p.x) / dt;
        const realZ = (novo.z - p.z) / dt;
        if (Math.abs(realX) < Math.abs(f.vx)) f.vx = realX;
        if (Math.abs(realZ) < Math.abs(f.vz)) f.vz = realZ;
        p.x = novo.x;
        p.z = novo.z;

        // chão, gravidade e teto
        const chao = alturaChao(lista, p, p.y);
        if (f.noChao) {
            // desce degrau pequeno colado no chão; mais alto que isso, cai
            if (p.y - chao > DEGRAU_MAXIMO) {
                f.noChao = false;
                f.vy = 0;
            } else {
                p.y = chao;
            }
        }
        if (!f.noChao) {
            f.vy -= GRAVIDADE * dt;
            p.y += f.vy * dt;
            // o limite é a câmera não passar do teto (pela cabeça, o pulo do CS bateria nos 3,2 m do corredor)
            const limite = teto(p) - 0.1 - OLHOS[deitado ? POSTURA.DEITADO : agachar ? POSTURA.AGACHADO : POSTURA.EM_PE];
            if (p.y > limite && f.vy > 0) {
                p.y = limite;
                f.vy = 0;
            }
            if (p.y <= chao) {
                p.y = chao;
                f.vy = 0;
                f.noChao = true;
            }
        }
        // aterrissou com o Ctrl guardado do ar: já entra deslizando (o pulo no tick seguinte
        // é o slide cancel, então dá pra emendar o bhop)
        if (f.noChao && f.deslizeNaQueda) {
            f.deslizeNaQueda = false;
            const rapido = !agachadoLigado.current && !deitadoLigado.current && Math.hypot(f.vx, f.vz) >= DESLIZE_MINIMO;
            if (rapido && f.deslize <= 0 && f.esperaDeslize <= 0) comecarDeslize();
        }
        // deslizou pra fora de uma beirada: cai com o embalo, já sem deslizar
        if (!f.noChao && f.deslize > 0) {
            f.deslize = 0;
            f.esperaDeslize = DESLIZE_ESPERA;
        }
    }

    useFrame((_, delta) => {
        // aba em segundo plano / travada: não tenta recuperar segundos de física de uma vez
        const dt = Math.min(delta, 0.25);
        const t = teclas.current;
        const p = pose.current;
        const f = fisica.current;
        const toq = toque.current;
        const cfg = lerConfig();

        // campo de visão das configurações, estreitado pelo zoom
        const cam = camera as THREE.PerspectiveCamera;
        zoom.current += (zoomAlvo.current - zoom.current) * (1 - Math.exp(-14 * dt));
        if (Math.abs(zoom.current - zoomAlvo.current) < 0.002) zoom.current = zoomAlvo.current;
        const fov = (2 * Math.atan(Math.tan((fovVertical(cfg.fov) * Math.PI) / 360) / zoom.current) * 180) / Math.PI;
        if (Math.abs(cam.fov - fov) > 0.01) {
            cam.fov = fov;
            cam.updateProjectionMatrix();
        }

        // olhar pelo toque
        if (toq.olhar.x || toq.olhar.y) {
            olhar.current.yaw -= toq.olhar.x * SENSIBILIDADE_TOQUE;
            olhar.current.pitch = Math.max(-LIMITE_OLHAR, Math.min(LIMITE_OLHAR, olhar.current.pitch - toq.olhar.y * SENSIBILIDADE_TOQUE));
            toq.olhar.x = 0;
            toq.olhar.y = 0;
        }
        if (toq.pular) {
            querPular.current = true;
            toq.pular = false;
        }

        let frente = 0;
        let lado = 0;
        if (!paradoRef.current) {
            if (t.has("KeyW") || t.has("ArrowUp")) frente += 1;
            if (t.has("KeyS") || t.has("ArrowDown")) frente -= 1;
            if (t.has("KeyD") || t.has("ArrowRight")) lado += 1;
            if (t.has("KeyA") || t.has("ArrowLeft")) lado -= 1;
            frente -= toq.andar.y;
            lado += toq.andar.x;
        }
        const intensidade = Math.min(1, Math.hypot(frente, lado));
        // Ctrl (ou o botão de agachar da tela): agacha/levanta, ou desliza se estiver correndo
        const tocouAgachar = toq.agachado !== agachadoToqueAntes.current;
        agachadoToqueAntes.current = toq.agachado;
        if ((apertouCtrl.current || tocouAgachar) && !paradoRef.current && !f.assento) apertarAgachar();
        if (apertouC.current && !paradoRef.current && !f.assento) apertarDeitar();
        apertouCtrl.current = false;
        apertouC.current = false;
        const devagar = t.has("ShiftLeft") || t.has("ShiftRight");
        const segurandoPulo = t.has("Space") && !paradoRef.current;

        // ---------- sentar / levantar ----------
        const pedidoAgora = pedido.current;
        pedido.current = null;
        // fechou o painel por uma tecla (T): volta pro jogo. Vale porque a tecla acabou de ser
        // apertada (o navegador só deixa travar o mouse logo depois de uma tecla ou clique)
        if (pedidoAgora?.tipo === "travar") {
            // o painel fechou neste mesmo instante e o React ainda não redesenhou: tenta no próximo quadro
            if (paradoRef.current) pedido.current = pedidoAgora;
            else travarMouse.current();
        }
        if (pedidoAgora?.tipo === "sentar" && !f.assento) {
            const a = pedidoAgora.assento;
            f.assento = a;
            deitadoLigado.current = false;
            f.deslizeNaQueda = false;
            p.x = a.x;
            p.z = a.z;
            p.y = a.y;
            f.antes = { x: p.x, y: p.y, z: p.z };
            f.vx = f.vz = f.vy = 0;
            olhar.current.yaw = a.rot;
            olhar.current.pitch = 0;
        } else if (f.assento && (pedidoAgora?.tipo === "levantar" || querPular.current || intensidade > 0.3)) {
            querPular.current = false;
            levantar();
        }

        let novaPostura: number;
        if (f.assento) {
            // sentado: só olha em volta
            novaPostura = POSTURA.SENTADO;
            f.acumulado = 0;
        } else {
            f.acumulado += dt;
            while (f.acumulado >= TICK) {
                const pular = !paradoRef.current && (querPular.current || (cfg.autoBhop && segurandoPulo));
                querPular.current = false;
                tick(TICK, frente, lado, devagar, pular && f.noChao);
                f.acumulado -= TICK;
            }
            novaPostura = deitadoLigado.current ? POSTURA.DEITADO : f.deslize > 0 ? POSTURA.DESLIZANDO : agachadoLigado.current ? POSTURA.AGACHADO : POSTURA.EM_PE;
        }
        velocidade.current = f.assento ? 0 : Math.hypot(f.vx, f.vz);

        // ---------- câmera (entre o tick anterior e o atual) ----------
        const alfa = f.assento ? 1 : f.acumulado / TICK;
        const x = f.antes.x + (p.x - f.antes.x) * alfa;
        const y = f.antes.y + (p.y - f.antes.y) * alfa;
        const z = f.antes.z + (p.z - f.antes.z) * alfa;
        f.olhos += (OLHOS[novaPostura] - f.olhos) * Math.min(1, dt * 12);
        const alvoY = y + f.olhos;
        // no chão suaviza (degrau não dá tranco); no ar segue direto
        f.cameraY = f.noChao ? f.cameraY + (alvoY - f.cameraY) * Math.min(1, dt * 18) : alvoY;
        const rastejando = novaPostura === POSTURA.DEITADO ? Math.min(1, velocidade.current / 0.8) : 0;
        f.balancoRasteja += (rastejando - f.balancoRasteja) * Math.min(1, dt * 8);
        f.faseRasteja += velocidade.current * dt * 5;
        const puxa = Math.sin(f.faseRasteja) * f.balancoRasteja;
        const { yaw, pitch } = olhar.current;
        const r = recuarCamera(x, f.cameraY, z, yaw, pitch, cfg.terceiraPessoa ? DISTANCIA_3P : 0, dt);
        // o balanço de rastejar é dos olhos: some conforme a câmera sai da cabeça
        const balanco = puxa * 0.025 * (1 - r / DISTANCIA_3P);
        camera.position.set(
            x + Math.sin(yaw) * Math.cos(pitch) * r,
            f.cameraY + Math.abs(balanco) - Math.sin(pitch) * r + (ALTURA_3P * r) / DISTANCIA_3P,
            z + Math.cos(yaw) * Math.cos(pitch) * r,
        );
        camera.rotation.set(pitch, yaw, balanco, "YXZ");

        p.rot = olhar.current.yaw;
        p.pitch = olhar.current.pitch;
        p.postura = novaPostura;
        if (novaPostura !== postura.current) {
            postura.current = novaPostura;
            onPostura(novaPostura);
        }

        Object.assign(visual.current, p, { x, y, z });

        atualizarSala(p);
        atualizarFoco(p, olhar.current.yaw, olhar.current.pitch, f.cameraY, !!f.assento);
    });

    // terceira pessoa: anda com a câmera pra trás da cabeça em passos curtos até a distância
    // desejada ou até bater em algo. Devolve a distância de agora (0 = primeira pessoa)
    function recuarCamera(x: number, olhosY: number, z: number, yaw: number, pitch: number, alvo: number, dt: number) {
        const rc = recuo.current;
        rc.quer += (alvo - rc.quer) * (1 - Math.exp(-8 * dt));
        if (Math.abs(alvo - rc.quer) < 0.005) rc.quer = alvo;
        if (rc.quer < 0.01) {
            rc.real = 0;
            return 0;
        }
        const lista = solidos();
        const tx = Math.sin(yaw) * Math.cos(pitch);
        const ty = -Math.sin(pitch);
        const tz = Math.cos(yaw) * Math.cos(pitch);
        const passos = Math.ceil(rc.quer / PASSO_CAMERA);
        let livre = 0;
        for (let i = 1; i <= passos; i++) {
            const d = (rc.quer * i) / passos;
            const q = { x: x + tx * d, z: z + tz * d };
            const cy = olhosY + ty * d + (ALTURA_3P * d) / DISTANCIA_3P;
            if (cy > teto(q) - RAIO_CAMERA || cy < alturaChao(lista, q, cy) + RAIO_CAMERA) break;
            // pés lá embaixo: assim qualquer coisa que passe da altura da bolinha conta (não só o
            // que é alto demais pra subir andando)
            if (!pontoLivre(lista, q, cy - RAIO_CAMERA - DEGRAU_MAXIMO, cy + RAIO_CAMERA, RAIO_CAMERA)) break;
            livre = d;
        }
        rc.real = livre < rc.real ? livre : rc.real + (livre - rc.real) * (1 - Math.exp(-6 * dt));
        return rc.real;
    }

    function atualizarSala(p: Ponto) {
        const atual = planta.salas.find((s) => s.canalId === sala.current);
        // sai só quando passa bem da porta, entra só quando já está dentro: sem pisca-pisca na soleira
        if (atual && dentro(atual.ret, p, 0.1)) return;
        const nova = planta.salas.find((s) => dentro(s.ret, p, -0.3))?.canalId ?? null;
        if (nova === sala.current) return;
        sala.current = nova;
        onSala(nova);
    }

    // a mira (o centro da tela) acerta este retângulo em pé (centro, normal pra onde olha, eixo da largura)?
    function miraNoRetangulo(
        h: Ponto & { y: number; nx: number; nz: number; ux: number; uz: number; largura: number; altura: number },
        alcance: number, p: Ponto, yaw: number, pitch: number, olhosY: number,
    ) {
        // direção da câmera
        const dx = -Math.sin(yaw) * Math.cos(pitch);
        const dy = Math.sin(pitch);
        const dz = -Math.cos(yaw) * Math.cos(pitch);
        // olhando pra frente da tela?
        const deFrente = dx * h.nx + dz * h.nz;
        if (deFrente >= -0.05) return false;
        // onde o raio da mira encontra o plano da tela
        const t = ((h.x - p.x) * h.nx + (h.z - p.z) * h.nz) / deFrente;
        if (t <= 0 || t > alcance) return false;
        const u = (p.x + dx * t - h.x) * h.ux + (p.z + dz * t - h.z) * h.uz;
        const v = olhosY + dy * t - h.y;
        return Math.abs(u) <= h.largura / 2 && Math.abs(v) <= h.altura / 2;
    }

    // a mira acerta a tela do holograma do chat desta sala?
    function miraNoChat(it: Interativo, p: Ponto, yaw: number, pitch: number, olhosY: number) {
        const h = planta.salas.find((s) => s.canalId === it.canalId)?.chat;
        return !!h && miraNoRetangulo(h, it.raio, p, yaw, pitch, olhosY);
    }

    // a mira passa perto do tablet desta sala? (uma bola em volta dele: o tablet é pequeno e
    // mirar no retângulo exato seria chato)
    function miraNoTablet(it: Interativo, p: Ponto, yaw: number, pitch: number, olhosY: number) {
        const sl = planta.salas.find((s) => s.canalId === it.canalId);
        const tb = it.alvo === 2 ? sl?.tablet2 : sl?.tablet;
        if (!tb) return false;
        const dx = -Math.sin(yaw) * Math.cos(pitch);
        const dy = Math.sin(pitch);
        const dz = -Math.cos(yaw) * Math.cos(pitch);
        const cx = tb.x - p.x;
        const cy = tb.y - olhosY;
        const cz = tb.z - p.z;
        // até onde o raio anda pra chegar mais perto do centro do tablet
        const t = cx * dx + cy * dy + cz * dz;
        if (t <= 0 || t > it.raio) return false;
        return Math.hypot(cx - dx * t, cy - dy * t, cz - dz * t) <= RAIO_MIRA_TABLET;
    }

    function atualizarFoco(p: Ponto, yaw: number, pitch: number, olhosY: number, sentado: boolean) {
        let melhor: Interativo | null = null;
        let menor = Infinity;
        // holograma do chat e tablet: só com a mira em cima, e aí ganham dos outros (foi de propósito)
        let mirado: Interativo | null = null;
        for (const it of planta.interativos) {
            if (it.tipo === "chat" || it.tipo === "tablet") {
                if (mirado) continue;
                const mirou = it.tipo === "chat" ? miraNoChat(it, p, yaw, pitch, olhosY) : miraNoTablet(it, p, yaw, pitch, olhosY);
                if (mirou) mirado = it;
                continue;
            }
            // sentado, os outros lugares não interessam (levanta com Espaço)
            if (sentado && it.tipo === "assento") continue;
            const d = Math.hypot(it.x - p.x, it.z - p.z);
            if (d > it.raio) continue;
            // precisa estar mais ou menos olhando pra ele
            const dirX = (it.x - p.x) / (d || 1);
            const dirZ = (it.z - p.z) / (d || 1);
            const alinhado = -Math.sin(yaw) * dirX - Math.cos(yaw) * dirZ;
            if (d > 0.6 && alinhado < 0.2) continue;
            if (d < menor) {
                menor = d;
                melhor = it;
            }
        }
        if (mirado) melhor = mirado;
        const id = melhor?.id ?? null;
        if (id !== foco.current) {
            foco.current = id;
            onFoco(melhor);
        }
    }

    return null;
}
