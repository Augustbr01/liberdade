import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { StartAudio, useConnectionState, useParticipants, useTracks, type TrackReferenceOrPlaceholder } from "@livekit/components-react";
import { ConnectionState, Track } from "livekit-client";
import { Loader2, MessageSquare, PanelRightClose, PanelRightOpen, Volume2 } from "lucide-react";
import type { Usuario } from "../../api";
import { useChatSala } from "../../contexto/ChatSala";
import { chaveBloco, useFocoChamada } from "../../contexto/FocoChamada";
import { useAgora } from "../../hooks/useAgora";
import { larguraNaGrade, OrdemDeChegada, resolverFoco } from "../../lib/palco";
import { cronometro, estaDigitando } from "../../lib/util";
import type { MapaMembros, Voz } from "../../tipos";
import { Cabecalho } from "../ui/Cabecalho";
import { Dica } from "../ui/Dica";
import { AcaoBloco, Bloco } from "./Bloco";
import { ChatAoVivo } from "./ChatAoVivo";
import { Controles } from "./Controles";

type Props = {
    voz: Voz;
    eu: Usuario;
    membros: MapaMembros;
    onSair: () => void;
    onMenu: () => void;
};

type DadosBloco = { chave: string; trackRef: TrackReferenceOrPlaceholder; tela: boolean; local: boolean };

// espaço entre os quadros (igual ao gap do CSS)
const VAO = 10;
// sem mexer o mouse por esse tempo assistindo um destaque, os controles somem
const OCIOSO_MS = 3000;

const telaCheiaSuportada = typeof document !== "undefined" && !!document.fullscreenEnabled;

function entrarEmTelaCheia(el: HTMLElement | null) {
    // Safari antigo não devolve promise; recusa (sem gesto do usuário etc.) só não faz nada
    try {
        void el?.requestFullscreen()?.catch(() => {});
    } catch {
        // sem suporte
    }
}

export function Palco({ voz, eu, membros, onSair, onMenu }: Props) {
    const estado = useConnectionState();
    const participantes = useParticipants();
    const { naoLidas } = useChatSala();
    const { escolha, focar, verGrade, automatico } = useFocoChamada();
    const [chatAberto, setChatAberto] = useState(false);
    const [faixaOculta, setFaixaOculta] = useState(false);
    const agora = useAgora();
    const conectado = estado === ConnectionState.Connected;

    // uma câmera por pessoa (placeholder quando está desligada) + as telas compartilhadas
    const tracks = useTracks(
        [
            { source: Track.Source.Camera, withPlaceholder: true },
            { source: Track.Source.ScreenShare, withPlaceholder: false },
        ],
        { onlySubscribed: false },
    );

    // telas primeiro (as dos outros antes da sua), depois as câmeras
    const blocos = useMemo<DadosBloco[]>(() => {
        const peso = (b: DadosBloco) => (b.tela ? (b.local ? 1 : 0) : 2);
        return tracks
            .map((t) => ({
                chave: chaveBloco(t.participant.identity, t.source),
                trackRef: t,
                tela: t.source === Track.Source.ScreenShare,
                local: t.participant.isLocal,
            }))
            .sort((a, b) => peso(a) - peso(b));
    }, [tracks]);

    const existentes = useMemo(() => new Set(blocos.map((b) => b.chave)), [blocos]);

    // telas dos outros, da que começou primeiro pra mais recente
    const telasRemotas = blocos.filter((b) => b.tela && !b.local).map((b) => b.chave);
    const assinaturaTelas = telasRemotas.join("|");
    const ordem = useRef(new OrdemDeChegada());
    // só recalcula quando o conjunto de telas muda (a ordem guarda estado entre renderizações)
    const telasPorChegada = useMemo(() => ordem.current.atualizar(telasRemotas), [assinaturaTelas]);
    const telaMaisRecente = telasPorChegada[telasPorChegada.length - 1] ?? null;

    const chaveFoco = resolverFoco(escolha, existentes, telaMaisRecente);
    const focado = (chaveFoco && blocos.find((b) => b.chave === chaveFoco)) || null;
    const outros = focado ? blocos.filter((b) => b !== focado) : blocos;

    // alguém começou a compartilhar: sai da grade que você escolheu e mostra a tela nova
    const telasAntes = useRef(new Set(telasRemotas));
    useEffect(() => {
        const chegou = telasRemotas.some((k) => !telasAntes.current.has(k));
        telasAntes.current = new Set(telasRemotas);
        if (chegou && escolha?.chave === null) automatico();
    }, [assinaturaTelas]);

    // o quadro fixado sumiu (a pessoa saiu ou parou de compartilhar): volta pro automático
    useEffect(() => {
        if (conectado && escolha?.chave && !existentes.has(escolha.chave)) automatico();
    }, [conectado, escolha, existentes, automatico]);

    // ---------- tela cheia ----------

    const principalRef = useRef<HTMLDivElement>(null);
    const [telaCheia, setTelaCheia] = useState(false);
    // pedido feito de um quadro da grade: espera ele virar destaque pra ocupar a tela
    const pedirTelaCheia = useRef(false);

    useEffect(() => {
        const aoMudar = () => setTelaCheia(!!principalRef.current && document.fullscreenElement === principalRef.current);
        document.addEventListener("fullscreenchange", aoMudar);
        return () => document.removeEventListener("fullscreenchange", aoMudar);
    }, []);

    useEffect(() => {
        if (!pedirTelaCheia.current || !principalRef.current) return;
        pedirTelaCheia.current = false;
        entrarEmTelaCheia(principalRef.current);
    }, [chaveFoco]);

    const alternarTelaCheia = useCallback(() => {
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
        else entrarEmTelaCheia(principalRef.current);
    }, []);

    const telaCheiaDe = useCallback((chave: string) => {
        pedirTelaCheia.current = true;
        focar(chave);
    }, [focar]);

    // F: tela cheia do destaque (ou da tela mais recente, se você estiver na grade)
    useEffect(() => {
        if (!telaCheiaSuportada) return;
        const aoTeclar = (e: KeyboardEvent) => {
            if (estaDigitando(e) || e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== "f") return;
            if (chaveFoco) alternarTelaCheia();
            else if (telaMaisRecente) telaCheiaDe(telaMaisRecente);
        };
        window.addEventListener("keydown", aoTeclar);
        return () => window.removeEventListener("keydown", aoTeclar);
    }, [chaveFoco, telaMaisRecente, alternarTelaCheia, telaCheiaDe]);

    // ---------- controles somem enquanto você assiste ----------

    const temFoco = !!focado;
    const [ocioso, setOcioso] = useState(false);
    const timerOcioso = useRef<number | undefined>(undefined);

    const acordar = useCallback(() => {
        setOcioso(false);
        window.clearTimeout(timerOcioso.current);
        timerOcioso.current = window.setTimeout(() => setOcioso(true), OCIOSO_MS);
    }, []);

    useEffect(() => {
        if (!temFoco) {
            window.clearTimeout(timerOcioso.current);
            setOcioso(false);
            return;
        }
        acordar();
        return () => window.clearTimeout(timerOcioso.current);
    }, [temFoco, acordar]);

    const sozinho = conectado && participantes.length <= 1;

    return (
        <div className="vista">
            <Cabecalho
                icone={<Volume2 size={20} />}
                titulo={voz.canal.nome}
                // o tempo da sala (o mesmo da lista de canais); sem ele, desde que você entrou
                descricao={conectado ? cronometro(agora - (voz.inicioSala ? Date.parse(voz.inicioSala) : voz.desde)) : "Conectando…"}
                onMenu={onMenu}
            >
                <Dica texto={chatAberto ? "Fechar chat" : "Chat da sala"} lado="baixo">
                    <button
                        className={`botao-icone ${chatAberto ? "ativo" : ""}`}
                        onClick={() => setChatAberto((v) => !v)}
                        aria-pressed={chatAberto}
                        aria-label="Chat da sala"
                    >
                        <MessageSquare size={19} />
                        {naoLidas > 0 && !chatAberto && <span className="ponto-novo" />}
                    </button>
                </Dica>
            </Cabecalho>

            <div className="palco">
                <div
                    className={`palco-cena ${temFoco ? "com-foco" : ""} ${ocioso && temFoco ? "ocioso" : ""}`}
                    onMouseMove={temFoco ? acordar : undefined}
                    onPointerDown={temFoco ? acordar : undefined}
                    onKeyDown={temFoco ? acordar : undefined}
                >
                    {!conectado && (
                        <div className="palco-aviso">
                            <Loader2 size={15} className="girar" />
                            {estado === ConnectionState.Reconnecting ? "Reconectando…" : "Conectando à sala…"}
                        </div>
                    )}

                    {sozinho && !temFoco && <div className="palco-aviso palco-sozinho">Só você por aqui. Quem entrar aparece na hora.</div>}

                    {focado ? (
                        <div className={`cena-foco ${faixaOculta || outros.length === 0 ? "sem-faixa" : ""}`}>
                            <div
                                className="foco-principal"
                                ref={principalRef}
                                onDoubleClick={telaCheiaSuportada ? alternarTelaCheia : undefined}
                            >
                                <Bloco
                                    key={focado.chave}
                                    trackRef={focado.trackRef}
                                    membros={membros}
                                    eu={eu}
                                    modo="destaque"
                                    onDesfocar={verGrade}
                                    onTelaCheia={telaCheiaSuportada ? alternarTelaCheia : undefined}
                                    emTelaCheia={telaCheia}
                                    extras={
                                        outros.length > 0 && !telaCheia && (
                                            <AcaoBloco
                                                dica={faixaOculta ? `Mostrar os outros (${outros.length})` : "Esconder os outros"}
                                                onClick={() => setFaixaOculta((v) => !v)}
                                            >
                                                {faixaOculta ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
                                            </AcaoBloco>
                                        )
                                    }
                                />
                            </div>

                            {!faixaOculta && outros.length > 0 && (
                                <div className="foco-faixa">
                                    {outros.map((b) => (
                                        <Bloco
                                            key={b.chave}
                                            trackRef={b.trackRef}
                                            membros={membros}
                                            eu={eu}
                                            modo="miniatura"
                                            onFocar={() => focar(b.chave)}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <Grade
                            blocos={blocos}
                            membros={membros}
                            eu={eu}
                            onFocar={focar}
                            onTelaCheia={telaCheiaSuportada ? telaCheiaDe : undefined}
                        />
                    )}

                    <StartAudio label="Clique para ativar o som da sala" className="ativar-audio" />

                    <Controles onSair={onSair} />
                </div>

                {chatAberto && <ChatAoVivo membros={membros} eu={eu} onFechar={() => setChatAberto(false)} />}
            </div>
        </div>
    );
}

type GradeProps = {
    blocos: DadosBloco[];
    membros: MapaMembros;
    eu: Usuario;
    onFocar: (chave: string) => void;
    onTelaCheia?: (chave: string) => void;
};

// todo mundo do mesmo tamanho, o maior que couber no espaço que sobra
// (mede a área de verdade: muda com o chat aberto, a lista de membros, o tamanho da janela)
function Grade({ blocos, membros, eu, onFocar, onTelaCheia }: GradeProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [area, setArea] = useState({ largura: 0, altura: 0 });

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const medir = () => setArea({ largura: el.clientWidth, altura: el.clientHeight });
        medir();
        const observador = new ResizeObserver(medir);
        observador.observe(el);
        return () => observador.disconnect();
    }, []);

    const largura = larguraNaGrade(blocos.length, area.largura, area.altura, VAO);

    return (
        <div className="cena-grade" ref={ref}>
            {blocos.map((b) => (
                <Bloco
                    key={b.chave}
                    trackRef={b.trackRef}
                    membros={membros}
                    eu={eu}
                    modo="grade"
                    largura={largura || undefined}
                    onFocar={() => onFocar(b.chave)}
                    onTelaCheia={onTelaCheia ? () => onTelaCheia(b.chave) : undefined}
                />
            ))}
        </div>
    );
}
