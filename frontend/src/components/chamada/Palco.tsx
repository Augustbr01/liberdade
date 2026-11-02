import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { StartAudio, isTrackReference, useConnectionState, useParticipants, useTracks, type TrackReferenceOrPlaceholder } from "@livekit/components-react";
import { ConnectionState, Track } from "livekit-client";
import {
    ExternalLink, Globe, Loader2, Maximize2, MessageSquare, Minimize2, PanelRightClose, PanelRightOpen, Pin, PinOff, TabletSmartphone,
    TvMinimalPlay, Volume2,
} from "lucide-react";
import type { Usuario } from "../../api";
import { useChatSala } from "../../contexto/ChatSala";
import { useControleSala } from "../../contexto/ControleSala";
import { useControleVoz } from "../../contexto/ControleVoz";
import { chaveBloco, chaveTela, useFocoChamada } from "../../contexto/FocoChamada";
import { useYoutubeSala } from "../../contexto/YoutubeSala";
import { useAgora } from "../../hooks/useAgora";
import { nomeDoSite } from "../../lib/link";
import { larguraNaGrade, OrdemDeChegada, resolverFoco } from "../../lib/palco";
import { cronometro, estaDigitando } from "../../lib/util";
import type { MapaMembros, Voz } from "../../tipos";
import { Cabecalho } from "../ui/Cabecalho";
import { Dica } from "../ui/Dica";
import { PainelControle } from "../controle/PainelControle";
import { ControlesYoutube } from "../youtube/PainelYoutube";
import { PlayerYoutube } from "../youtube/PlayerYoutube";
import { QuadroLink } from "../link/QuadroLink";
import { AcaoBloco, Bloco, type ModoBloco } from "./Bloco";
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

// o YouTube assistido junto também é um quadro que dá pra pôr em destaque
const CHAVE_YOUTUBE = "youtube";
// o site aberto na TV pelo tablet também
const CHAVE_LINK = "link";

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
    const { surdo } = useControleVoz();
    const youtube = useYoutubeSala();
    const controle = useControleSala();
    // um painel lateral por vez: o chat da sala, ou o controle da sala (aberto na aba Controle ou YouTube)
    const [painel, setPainel] = useState<"chat" | "controle" | "youtube" | null>(null);
    const chatAberto = painel === "chat";
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

    // com o mundo 3D aberto o vídeo toca na TV da sala de lá (um player só)
    const videoYoutube = youtube.estado?.video && !youtube.noMundo ? youtube.estado : null;
    // volume da TV escolhido no controle da sala
    const volumeYoutube = useRef(100);
    volumeYoutube.current = controle.estado?.volume ?? 100;

    // site aberto na TV pelo controle da sala (com o 3D aberto ele aparece na TV de lá)
    const tvSala = controle.estado?.tv;
    const linkTV = tvSala?.modo === "LINK" && tvSala.url && !youtube.noMundo ? tvSala.url : null;

    const existentes = useMemo(() => {
        const chaves = new Set(blocos.map((b) => b.chave));
        if (videoYoutube) chaves.add(CHAVE_YOUTUBE);
        if (linkTV) chaves.add(CHAVE_LINK);
        return chaves;
    }, [blocos, videoYoutube, linkTV]);

    // telas dos outros, da que começou primeiro pra mais recente
    const telasRemotas = blocos.filter((b) => b.tela && !b.local).map((b) => b.chave);
    const assinaturaTelas = telasRemotas.join("|");
    const ordem = useRef(new OrdemDeChegada());
    // só recalcula quando o conjunto de telas muda (a ordem guarda estado entre renderizações)
    const telasPorChegada = useMemo(() => ordem.current.atualizar(telasRemotas), [assinaturaTelas]);
    const telaMaisRecente = telasPorChegada[telasPorChegada.length - 1] ?? null;

    // o automático segue o que escolheram pra TV no controle da sala (o tablet):
    // desligada ou mosaico = grade (todo mundo junto); uma tela específica; o YouTube; senão a tela mais recente
    const tv = controle.estado?.tv;
    const telaDaTV = tv?.modo === "TELA" && tv.identidade ? chaveTela(tv.identidade) : null;
    const destaqueAutomatico = tv?.modo === "DESLIGADA" || tv?.modo === "MOSAICO"
        ? null
        : linkTV ? CHAVE_LINK
        : telaDaTV && existentes.has(telaDaTV) ? telaDaTV : videoYoutube ? CHAVE_YOUTUBE : telaMaisRecente;

    const chaveFoco = resolverFoco(escolha, existentes, destaqueAutomatico);
    const focaYoutube = chaveFoco === CHAVE_YOUTUBE && !!videoYoutube;
    const focaLink = chaveFoco === CHAVE_LINK && !!linkTV;
    const focado = (!focaYoutube && !focaLink && chaveFoco && blocos.find((b) => b.chave === chaveFoco)) || null;
    const outros = focado ? blocos.filter((b) => b !== focado) : blocos;
    // o YouTube e o site na faixa ao lado de outro destaque
    const youtubeNaFaixa = !!videoYoutube && !focaYoutube;
    const linkNaFaixa = !!linkTV && !focaLink;
    const qtdOutros = outros.length + (youtubeNaFaixa ? 1 : 0) + (linkNaFaixa ? 1 : 0);

    // alguém começou a compartilhar: sai da grade que você escolheu e mostra a tela nova
    const telasAntes = useRef(new Set(telasRemotas));
    useEffect(() => {
        const chegou = telasRemotas.some((k) => !telasAntes.current.has(k));
        telasAntes.current = new Set(telasRemotas);
        if (chegou && escolha?.chave === null) automatico();
    }, [assinaturaTelas]);

    // começou um vídeo no YouTube junto: mesma coisa
    const videoId = videoYoutube?.video?.videoId ?? null;
    const videoAntes = useRef(videoId);
    useEffect(() => {
        const comecou = videoId !== null && videoId !== videoAntes.current;
        videoAntes.current = videoId;
        if (comecou && escolha?.chave === null) automatico();
    }, [videoId]);

    // mexeram na TV pelo controle da sala: todo mundo volta a seguir a TV
    const escolhaTV = tv ? `${tv.modo}|${tv.identidade ?? ""}|${tv.url ?? ""}` : null;
    const tvAntes = useRef(escolhaTV);
    useEffect(() => {
        const mudou = tvAntes.current !== null && escolhaTV !== null && escolhaTV !== tvAntes.current;
        tvAntes.current = escolhaTV;
        if (mudou) automatico();
    }, [escolhaTV]);

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

    const temFoco = !!focado || focaYoutube || focaLink;
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
                <Dica texto={painel === "controle" ? "Fechar" : "Controle da sala"} lado="baixo">
                    <button
                        className={`botao-icone ${painel === "controle" ? "ativo" : ""}`}
                        onClick={() => setPainel((v) => (v === "controle" ? null : "controle"))}
                        aria-pressed={painel === "controle"}
                        aria-label="Controle da sala"
                    >
                        <TabletSmartphone size={19} />
                    </button>
                </Dica>
                <Dica texto={painel === "youtube" ? "Fechar" : "Assistir junto (YouTube)"} lado="baixo">
                    <button
                        className={`botao-icone ${painel === "youtube" ? "ativo" : ""}`}
                        onClick={() => setPainel((v) => (v === "youtube" ? null : "youtube"))}
                        aria-pressed={painel === "youtube"}
                        aria-label="Assistir junto"
                    >
                        <TvMinimalPlay size={19} />
                        {youtube.estado?.video && painel !== "youtube" && <span className="ponto-novo" />}
                    </button>
                </Dica>
                <Dica texto={chatAberto ? "Fechar chat" : "Chat da sala"} lado="baixo">
                    <button
                        className={`botao-icone ${chatAberto ? "ativo" : ""}`}
                        onClick={() => setPainel((v) => (v === "chat" ? null : "chat"))}
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

                    {focado || focaYoutube || focaLink ? (
                        <div className={`cena-foco ${faixaOculta || qtdOutros === 0 ? "sem-faixa" : ""}`}>
                            <div
                                className="foco-principal"
                                ref={principalRef}
                                // no YouTube o clique pausa/continua pra todos: dois cliques não viram tela cheia
                                onDoubleClick={telaCheiaSuportada && !focaYoutube && !focaLink ? alternarTelaCheia : undefined}
                            >
                                {focaLink && linkTV ? (
                                    <div className="bloco bloco-destaque bloco-link">
                                        <div className="bloco-midia">
                                            <QuadroLink url={linkTV} />
                                        </div>
                                        <div className="bloco-acoes" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                                            <a className="botao-icone" href={linkTV} target="_blank" rel="noopener noreferrer" title="Abrir em outra aba (se a página ficar em branco, o site não deixa abrir aqui)" aria-label="Abrir o site em outra aba">
                                                <ExternalLink size={16} />
                                            </a>
                                            {!telaCheia && (
                                                <AcaoBloco dica="Voltar para a grade" onClick={verGrade}>
                                                    <PinOff size={16} />
                                                </AcaoBloco>
                                            )}
                                            {telaCheiaSuportada && (
                                                <AcaoBloco dica={telaCheia ? "Sair da tela cheia (F)" : "Tela cheia (F)"} onClick={alternarTelaCheia}>
                                                    {telaCheia ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                                                </AcaoBloco>
                                            )}
                                            {qtdOutros > 0 && !telaCheia && (
                                                <AcaoBloco
                                                    dica={faixaOculta ? `Mostrar os outros (${qtdOutros})` : "Esconder os outros"}
                                                    onClick={() => setFaixaOculta((v) => !v)}
                                                >
                                                    {faixaOculta ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
                                                </AcaoBloco>
                                            )}
                                        </div>
                                    </div>
                                ) : focaYoutube && videoYoutube ? (
                                    <div className="bloco bloco-destaque bloco-youtube">
                                        <div className="bloco-midia">
                                            <PlayerYoutube
                                                estado={videoYoutube}
                                                posicaoAgora={youtube.posicaoAgora}
                                                enviar={youtube.enviar}
                                                volume={volumeYoutube}
                                                mudo={surdo}
                                            />
                                        </div>
                                        <ControlesYoutube compacto />
                                        <div className="bloco-acoes" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                                            {!telaCheia && (
                                                <AcaoBloco dica="Voltar para a grade" onClick={verGrade}>
                                                    <PinOff size={16} />
                                                </AcaoBloco>
                                            )}
                                            {telaCheiaSuportada && (
                                                <AcaoBloco dica={telaCheia ? "Sair da tela cheia (F)" : "Tela cheia (F)"} onClick={alternarTelaCheia}>
                                                    {telaCheia ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                                                </AcaoBloco>
                                            )}
                                            {qtdOutros > 0 && !telaCheia && (
                                                <AcaoBloco
                                                    dica={faixaOculta ? `Mostrar os outros (${qtdOutros})` : "Esconder os outros"}
                                                    onClick={() => setFaixaOculta((v) => !v)}
                                                >
                                                    {faixaOculta ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
                                                </AcaoBloco>
                                            )}
                                        </div>
                                    </div>
                                ) : focado && (
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
                                            qtdOutros > 0 && !telaCheia && (
                                                <AcaoBloco
                                                    dica={faixaOculta ? `Mostrar os outros (${qtdOutros})` : "Esconder os outros"}
                                                    onClick={() => setFaixaOculta((v) => !v)}
                                                >
                                                    {faixaOculta ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
                                                </AcaoBloco>
                                            )
                                        }
                                    />
                                )}
                            </div>

                            {!faixaOculta && qtdOutros > 0 && (
                                <div className="foco-faixa">
                                    {youtubeNaFaixa && videoYoutube && (
                                        <CartaoYoutube titulo={videoYoutube.video!.titulo} modo="miniatura" onFocar={() => focar(CHAVE_YOUTUBE)} />
                                    )}
                                    {linkNaFaixa && linkTV && (
                                        <CartaoLink url={linkTV} modo="miniatura" onFocar={() => focar(CHAVE_LINK)} />
                                    )}
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
                            youtube={videoYoutube?.video?.titulo ?? null}
                            link={linkTV}
                            membros={membros}
                            eu={eu}
                            onFocar={focar}
                            onTelaCheia={telaCheiaSuportada ? telaCheiaDe : undefined}
                        />
                    )}

                    <StartAudio label="Clique para ativar o som da sala" className="ativar-audio" />

                    <Controles onSair={onSair} />
                </div>

                {chatAberto && <ChatAoVivo membros={membros} eu={eu} onFechar={() => setPainel(null)} />}
                {(painel === "controle" || painel === "youtube") && (
                    <PainelControle
                        key={painel}
                        membros={membros}
                        eu={eu}
                        telas={tracks.filter((t) => t.source === Track.Source.ScreenShare).filter(isTrackReference)}
                        abaInicial={painel}
                        onFechar={() => setPainel(null)}
                    />
                )}
            </div>
        </div>
    );
}

type GradeProps = {
    blocos: DadosBloco[];
    // título do vídeo do YouTube junto, se tiver um (entra como mais um quadro)
    youtube: string | null;
    // endereço do site aberto na TV, se tiver
    link: string | null;
    membros: MapaMembros;
    eu: Usuario;
    onFocar: (chave: string) => void;
    onTelaCheia?: (chave: string) => void;
};

// todo mundo do mesmo tamanho, o maior que couber no espaço que sobra
// (mede a área de verdade: muda com o chat aberto, a lista de membros, o tamanho da janela)
function Grade({ blocos, youtube, link, membros, eu, onFocar, onTelaCheia }: GradeProps) {
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

    const largura = larguraNaGrade(blocos.length + (youtube !== null ? 1 : 0) + (link !== null ? 1 : 0), area.largura, area.altura, VAO);

    return (
        <div className="cena-grade" ref={ref}>
            {youtube !== null && (
                <CartaoYoutube titulo={youtube} modo="grade" largura={largura || undefined} onFocar={() => onFocar(CHAVE_YOUTUBE)} />
            )}
            {link !== null && <CartaoLink url={link} modo="grade" largura={largura || undefined} onFocar={() => onFocar(CHAVE_LINK)} />}
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

// o site da TV fora do destaque: só um cartão (a página só carrega no destaque)
function CartaoLink({ url, modo, largura, onFocar }: { url: string; modo: Exclude<ModoBloco, "destaque">; largura?: number; onFocar: () => void }) {
    return (
        <div className={`bloco bloco-${modo} bloco-tela clicavel`} style={largura ? { width: largura } : undefined} onClick={onFocar}>
            <div className="bloco-midia">
                <div className="bloco-aviso">
                    <Globe size={modo === "miniatura" ? 20 : 28} />
                    <strong>Site na TV</strong>
                    {modo !== "miniatura" && <span>Clique pra abrir a página.</span>}
                </div>
            </div>
            {modo === "grade" && (
                <div className="bloco-acoes" onClick={(e) => e.stopPropagation()}>
                    <AcaoBloco dica="Destacar" onClick={onFocar}>
                        <Pin size={16} />
                    </AcaoBloco>
                </div>
            )}
            <div className="bloco-rotulo">
                <Globe size={14} />
                <span className="truncar">{nomeDoSite(url)}</span>
            </div>
        </div>
    );
}

type CartaoYoutubeProps = { titulo: string; modo: Exclude<ModoBloco, "destaque">; largura?: number; onFocar: () => void };

// o YouTube junto fora do destaque: só um cartão (o player é um só, no destaque)
function CartaoYoutube({ titulo, modo, largura, onFocar }: CartaoYoutubeProps) {
    return (
        <div className={`bloco bloco-${modo} bloco-tela clicavel`} style={largura ? { width: largura } : undefined} onClick={onFocar}>
            <div className="bloco-midia">
                <div className="bloco-aviso">
                    <TvMinimalPlay size={modo === "miniatura" ? 20 : 28} />
                    <strong>Assistindo junto</strong>
                    {modo !== "miniatura" && <span>Clique pra ver o vídeo.</span>}
                </div>
            </div>
            {modo === "grade" && (
                <div className="bloco-acoes" onClick={(e) => e.stopPropagation()}>
                    <AcaoBloco dica="Destacar" onClick={onFocar}>
                        <Pin size={16} />
                    </AcaoBloco>
                </div>
            )}
            <div className="bloco-rotulo">
                <TvMinimalPlay size={14} />
                <span className="truncar">{titulo}</span>
            </div>
        </div>
    );
}
