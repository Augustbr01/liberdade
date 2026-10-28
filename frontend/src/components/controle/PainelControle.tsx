import { useState, type ReactNode } from "react";
import { VideoTrack, type TrackReference } from "@livekit/components-react";
import { LayoutGrid, Lightbulb, LightbulbOff, Loader2, MonitorUp, PowerOff, Sparkles, SunDim, Tv, TvMinimalPlay, Volume1, Volume2, X } from "lucide-react";
import type { Usuario } from "../../api";
import { useControleSala } from "../../contexto/ControleSala";
import { useYoutubeSala } from "../../contexto/YoutubeSala";
import type { MapaMembros, ModoLuzes } from "../../tipos";
import { PainelYoutube } from "../youtube/PainelYoutube";
import { LED_PADRAO, ORDEM_PALETAS, PALETAS } from "../mundo/paletas";

type Aba = "controle" | "youtube";
// no tablet (3D) cada função tem a sua aba, pra caber sem rolar
type AbaTablet = "tv" | "som" | "luzes" | "youtube";

type Controle = ReturnType<typeof useControleSala>;
type Estado = NonNullable<Controle["estado"]>;
type Enviar = Controle["enviar"];

type Props = {
    membros: MapaMembros;
    eu: Usuario;
    // telas compartilhadas na call agora (pra escolher qual vai pra TV)
    telas: TrackReference[];
    abaInicial?: Aba;
    // no lugar do controle (ex.: fora de call não tem sala pra controlar)
    aviso?: string | undefined;
    // painel: a coluna do lado da call; tablet: deitado, com as abas do lado (o do 3D)
    formato?: "painel" | "tablet";
    // tablet: fechou no X e está esperando o mouse voltar pro jogo
    voltando?: boolean;
    // 3D: qual TV este tablet controla (o da mesa LAN = 1, o do lounge = 2)
    alvoTV?: 1 | 2;
    onFechar: () => void;
};

// o "tablet" da sala: o que aparece na TV, o som da TV, as luzes e o YouTube junto.
// Mexeu aqui, muda pra todo mundo da call
export function PainelControle(props: Props) {
    return props.formato === "tablet" ? <Tablet {...props} /> : <Painel {...props} />;
}

function Painel({ membros, eu, telas, abaInicial = "controle", aviso, onFechar }: Props) {
    const { estado, enviar } = useControleSala();
    const [aba, setAba] = useState<Aba>(abaInicial);
    const nome = useNome(membros, eu);

    return (
        <aside className="chat-sala controle-painel">
            <header className="chat-sala-topo">
                <div>
                    <strong>Controle da sala</strong>
                    <span>Todo mundo na call controla</span>
                </div>
                <button className="botao-icone" onClick={onFechar} aria-label="Fechar">
                    <X size={18} />
                </button>
            </header>

            <div className="controle-abas" role="tablist">
                <button role="tab" aria-selected={aba === "controle"} className={aba === "controle" ? "ativo" : ""} onClick={() => setAba("controle")}>
                    Controle
                </button>
                <button role="tab" aria-selected={aba === "youtube"} className={aba === "youtube" ? "ativo" : ""} onClick={() => setAba("youtube")}>
                    YouTube
                </button>
            </div>

            {aviso ? (
                <p className="controle-aviso">{aviso}</p>
            ) : aba === "youtube" ? (
                <PainelYoutube membros={membros} eu={eu} onFechar={onFechar} embutido />
            ) : estado === null ? (
                <p className="chat-sala-vazio">Carregando…</p>
            ) : (
                <div className="controle-corpo">
                    <SecaoTV estado={estado} enviar={enviar} telas={telas} nome={nome} />
                    <SecaoSom estado={estado} enviar={enviar} />
                    <SecaoLuzes estado={estado} enviar={enviar} />
                    <SecaoLeds estado={estado} enviar={enviar} />
                    {estado.ultima && <small className="texto-fraco">Última mudança por {nome(estado.ultima.usuarioId)}</small>}
                </div>
            )}
        </aside>
    );
}

const ABAS_TABLET: { id: AbaTablet; nome: string; descricao: string; icone: ReactNode }[] = [
    { id: "tv", nome: "TV", descricao: "O que aparece na TV da sala", icone: <Tv size={20} /> },
    { id: "som", nome: "Som", descricao: "Volume e caixas da sala", icone: <Volume2 size={20} /> },
    { id: "luzes", nome: "Luzes", descricao: "Iluminação e LEDs (no 3D)", icone: <Lightbulb size={20} /> },
    { id: "youtube", nome: "YouTube", descricao: "Assistir junto, no mesmo ponto do vídeo", icone: <TvMinimalPlay size={20} /> },
];

function Tablet({ membros, eu, telas, abaInicial = "controle", aviso, voltando = false, alvoTV, onFechar }: Props) {
    const { estado, enviar } = useControleSala();
    const [aba, setAba] = useState<AbaTablet>(abaInicial === "youtube" ? "youtube" : "tv");
    const nome = useNome(membros, eu);
    const atual = ABAS_TABLET.find((a) => a.id === aba)!;

    return (
        <div className="tablet-controle">
            <nav className="tablet-nav" role="tablist" aria-label="Controle da sala">
                <div className="tablet-nav-titulo">
                    <strong>Controle da sala</strong>
                    <span>Todo mundo na call controla</span>
                </div>
                {ABAS_TABLET.map((a) => (
                    <button
                        key={a.id}
                        role="tab"
                        aria-selected={aba === a.id}
                        className={aba === a.id ? "ativo" : ""}
                        onClick={() => setAba(a.id)}
                    >
                        {a.icone}
                        <span>{a.nome}</span>
                    </button>
                ))}
                {estado?.ultima && (
                    <small className="tablet-nav-rodape">Última mudança por {nome(estado.ultima.usuarioId)}</small>
                )}
            </nav>

            <div className="tablet-conteudo">
                <header className="tablet-topo">
                    <div>
                        <strong>{atual.nome}</strong>
                        <span>{atual.descricao}</span>
                    </div>
                    {voltando ? (
                        <span className="tablet-voltando">
                            <Loader2 size={14} className="girar" /> Voltando ao jogo…
                        </span>
                    ) : (
                        <button className="botao-icone" onClick={onFechar} aria-label="Fechar e voltar ao jogo" title="Fechar e voltar ao jogo">
                            <X size={18} />
                        </button>
                    )}
                </header>

                {aviso ? (
                    <p className="controle-aviso">{aviso}</p>
                ) : aba === "youtube" ? (
                    <PainelYoutube membros={membros} eu={eu} onFechar={onFechar} embutido />
                ) : estado === null ? (
                    <p className="chat-sala-vazio">Carregando…</p>
                ) : (
                    <div className="tablet-corpo">
                        {aba === "tv" && <SecaoTV estado={estado} enviar={enviar} telas={telas} nome={nome} grade {...(alvoTV ? { alvoFixo: alvoTV } : {})} />}
                        {aba === "som" && <SecaoSom estado={estado} enviar={enviar} grande />}
                        {aba === "luzes" && (
                            <div className="tablet-colunas">
                                <SecaoLuzes estado={estado} enviar={enviar} grande />
                                <SecaoLeds estado={estado} enviar={enviar} />
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function useNome(membros: MapaMembros, eu: Usuario) {
    return (id: string) => (id === eu.id ? "você" : membros.get(id)?.nome ?? "alguém");
}

// ---------- as funções (iguais no painel e no tablet; o tablet só arruma diferente) ----------

type SecaoTVProps = { estado: Estado; enviar: Enviar; telas: TrackReference[]; nome: (id: string) => string; grade?: boolean; alvoFixo?: 1 | 2 };

function SecaoTV({ estado, enviar, telas, nome, grade = false, alvoFixo }: SecaoTVProps) {
    const youtube = useYoutubeSala();
    // LAN house: duas TVs, cada uma com a sua escolha
    const duas = !!estado.tv2;
    const [alvoEscolhido, setAlvo] = useState<1 | 2>(1);
    const alvo = alvoFixo ?? alvoEscolhido;
    const tv = (alvo === 2 ? estado.tv2 : estado.tv) ?? { modo: "AUTO", identidade: null };
    const video = youtube.estado?.video;
    const env: Enviar = (cmd) => enviar(cmd.acao === "TV" || cmd.acao === "TV_TELA" ? { ...cmd, alvo } : cmd);

    return (
        <section>
            {duas && !alvoFixo && (
                <div className="controle-opcoes">
                    <Opcao ativo={alvo === 1} onClick={() => setAlvo(1)} icone={<Tv size={18} />} titulo="TV da call" descricao="A TV principal (monitores)" />
                    <Opcao ativo={alvo === 2} onClick={() => setAlvo(2)} icone={<Tv size={18} />} titulo="TV do lounge" descricao="A segunda TV, independente" />
                </div>
            )}
            {alvoFixo && <span className="rotulo">{alvoFixo === 2 ? "TV do lounge" : "Telão da mesa LAN"}</span>}
            {!grade && <span className="rotulo">Na TV</span>}
            <div className={grade ? "controle-grade" : "controle-opcoes"}>
                <Opcao
                    cartao={grade}
                    ativo={tv.modo === "AUTO"}
                    onClick={() => env({ acao: "TV", modo: "AUTO" })}
                    icone={<Sparkles size={grade ? 26 : 18} />}
                    titulo="Automático"
                    descricao="O YouTube, ou a primeira tela compartilhada"
                />
                <Opcao
                    cartao={grade}
                    ativo={tv.modo === "YOUTUBE"}
                    desligada={!video}
                    onClick={() => env({ acao: "TV", modo: "YOUTUBE" })}
                    icone={<TvMinimalPlay size={grade ? 26 : 18} />}
                    titulo="YouTube junto"
                    descricao={video?.titulo ?? "Nada tocando (coloque um vídeo na aba YouTube)"}
                />
                <Opcao
                    cartao={grade}
                    ativo={tv.modo === "MOSAICO"}
                    desligada={telas.length < 2}
                    onClick={() => env({ acao: "TV", modo: "MOSAICO" })}
                    icone={<LayoutGrid size={grade ? 26 : 18} />}
                    titulo="Mosaico"
                    descricao={telas.length < 2 ? "Todas as telas juntas (precisa de 2 ou mais)" : `As ${telas.length} telas compartilhadas ao mesmo tempo`}
                />
                {/* cada tela compartilhada, com a prévia ao vivo: toque pra mandar pra TV da sala */}
                {telas.map((t) => (
                    <Opcao
                        key={t.publication.trackSid}
                        cartao={grade}
                        ativo={tv.modo === "TELA" && tv.identidade === t.participant.identity}
                        onClick={() => env({ acao: "TV_TELA", identidade: t.participant.identity })}
                        icone={<MonitorUp size={grade ? 26 : 18} />}
                        previa={<VideoTrack trackRef={t} muted />}
                        titulo={t.participant.isLocal ? "Sua tela" : `Tela de ${nome(t.participant.identity)}`}
                        descricao="Compartilhando agora · mandar pra TV"
                    />
                ))}
                <Opcao
                    cartao={grade}
                    ativo={tv.modo === "DESLIGADA"}
                    onClick={() => env({ acao: "TV", modo: "DESLIGADA" })}
                    icone={<PowerOff size={grade ? 26 : 18} />}
                    titulo="Desligada"
                    descricao="Ninguém na TV (as telas continuam em cima das pessoas)"
                />
            </div>
            {telas.length === 0 && (
                <small className="texto-fraco">Quando alguém da call compartilhar a tela, ela aparece aqui pra ir pra TV.</small>
            )}
        </section>
    );
}

function SecaoSom({ estado, enviar, grande = false }: { estado: Estado; enviar: Enviar; grande?: boolean }) {
    // enquanto arrasta, mostra o volume escolhido; só manda ao soltar
    const [volume, setVolume] = useState<number | null>(null);
    const soltarVolume = () => {
        if (volume !== null) enviar({ acao: "VOLUME", volume });
        setVolume(null);
    };
    const valor = volume ?? estado.volume;

    return (
        <section>
            {!grande && <span className="rotulo">Som da TV</span>}
            <div className={`controle-volume ${grande ? "grande" : ""}`}>
                {grande && <span className="controle-volume-numero">{valor}<small>%</small></span>}
                <div className="controle-volume-barra">
                    <Volume1 size={18} />
                    <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={valor}
                        onChange={(e) => setVolume(Number(e.target.value))}
                        onPointerUp={soltarVolume}
                        onKeyUp={soltarVolume}
                        aria-label="Volume da TV"
                    />
                    {grande ? <Volume2 size={18} /> : <span>{valor}%</span>}
                </div>
            </div>
            <Alternar
                ligado={estado.surround}
                onMudar={(v) => enviar({ acao: "SURROUND", ligado: v })}
                titulo="Som surround"
                descricao="No 3D, o som da tela na TV sai pelas 5 caixas da sala: cada lugar ouve diferente. O YouTube não passa pelas caixas."
            />
        </section>
    );
}

function SecaoLuzes({ estado, enviar, grande = false }: { estado: Estado; enviar: Enviar; grande?: boolean }) {
    const modos: [ModoLuzes, string, ReactNode][] = [
        ["AUTO", "Automático", <SunDim key="a" size={grande ? 20 : 16} />],
        ["ACESAS", "Acesas", <Lightbulb key="b" size={grande ? 20 : 16} />],
        ["APAGADAS", "Apagadas", <LightbulbOff key="c" size={grande ? 20 : 16} />],
    ];
    return (
        <section>
            <span className="rotulo">{grande ? "Iluminação" : "Luzes (no 3D)"}</span>
            <div className={`controle-segmentos ${grande ? "grande" : ""}`} role="radiogroup">
                {modos.map(([modo, texto, icone]) => (
                    <button
                        key={modo}
                        role="radio"
                        aria-checked={estado.luzes === modo}
                        className={estado.luzes === modo ? "ativo" : ""}
                        onClick={() => enviar({ acao: "LUZES", modo })}
                    >
                        {icone} {texto}
                    </button>
                ))}
            </div>
            <small className="texto-fraco">No automático, o cinema apaga quando o filme começa.</small>
        </section>
    );
}

function SecaoLeds({ estado, enviar }: { estado: Estado; enviar: Enviar }) {
    const led = estado.led ?? LED_PADRAO;
    return (
        <section>
            <span className="rotulo">LEDs da sala (no 3D)</span>
            <div className="controle-paletas" role="radiogroup" aria-label="Cor dos LEDs">
                {ORDEM_PALETAS.map((p) => {
                    const ativa = led.paleta === p;
                    return (
                        <button
                            key={p}
                            role="radio"
                            aria-checked={ativa}
                            className={ativa ? "ativo" : ""}
                            onClick={() => enviar({ acao: "LED", paleta: p, ligado: true })}
                            title={PALETAS[p].nome}
                        >
                            <span className="controle-paleta-cores" style={{ background: `linear-gradient(135deg, ${PALETAS[p].a} 50%, ${PALETAS[p].b} 50%)` }} />
                            <span>{PALETAS[p].nome}</span>
                        </button>
                    );
                })}
            </div>
            <Alternar
                ligado={led.ciclo}
                onMudar={(v) => enviar({ acao: "LED", ciclo: v })}
                titulo="Ciclo RGB"
                descricao={'As cores vão girando devagar e os LEDs "respiram".'}
            />
            <Alternar
                ligado={led.ligado}
                onMudar={(v) => enviar({ acao: "LED", ligado: v })}
                titulo="LEDs ligados"
                descricao="Fitas, painéis e o brilho da sala. Com a luz apagada, sobram só os LEDs e a TV."
            />
        </section>
    );
}

function Alternar({ ligado, onMudar, titulo, descricao }: { ligado: boolean; onMudar: (v: boolean) => void; titulo: string; descricao: string }) {
    return (
        <label className="controle-alternar">
            <input type="checkbox" checked={ligado} onChange={(e) => onMudar(e.target.checked)} />
            <span>
                <strong>{titulo}</strong>
                <small>{descricao}</small>
            </span>
        </label>
    );
}

type OpcaoProps = {
    ativo: boolean;
    desligada?: boolean;
    // cartao: em pé, com o ícone (ou a prévia) grande em cima — a grade do tablet
    cartao?: boolean;
    onClick: () => void;
    icone: ReactNode;
    previa?: ReactNode;
    titulo: string;
    descricao: string;
};

function Opcao({ ativo, desligada = false, cartao = false, onClick, icone, previa, titulo, descricao }: OpcaoProps) {
    return (
        <button
            className={`controle-opcao ${ativo ? "ativo" : ""} ${previa ? "com-previa" : ""} ${cartao ? "cartao" : ""}`}
            onClick={onClick}
            disabled={desligada}
            aria-pressed={ativo}
        >
            {previa ? <span className="controle-previa">{previa}</span> : <span className="controle-opcao-icone">{icone}</span>}
            <span className="controle-opcao-texto">
                <strong className="truncar">{titulo}</strong>
                <small className="truncar">{descricao}</small>
            </span>
        </button>
    );
}
