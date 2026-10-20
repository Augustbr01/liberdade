import { useCallback, useRef, useState, type ReactNode } from "react";
import { ChevronDown, DoorOpen, Hash, Loader2, Plus, Settings, Trash2, UserPlus, Volume2 } from "lucide-react";
import type { Canal, ServidorDetalhe, TipoCanal, Usuario } from "../api";
import { useControleVoz } from "../contexto/ControleVoz";
import { chaveTela, useFocoChamada } from "../contexto/FocoChamada";
import { usePerfil } from "../contexto/Perfil";
import { useCliqueFora } from "../hooks/useCliqueFora";
import type { MapaMembros, Voz } from "../tipos";
import { PessoasAoVivo } from "./chamada/AoVivo";
import { PainelVoz } from "./chamada/PainelVoz";
import { TempoSala } from "./chamada/TempoSala";
import { PainelUsuario } from "./PainelUsuario";
import { Avatar } from "./ui/Avatar";
import { Dica } from "./ui/Dica";

type Props = {
    servidor: ServidorDetalhe | null;
    carregando: boolean;
    canalAtualId: string | null;
    voz: Voz | null;
    entrandoEm: string | null;
    eu: Usuario;
    souAdmin: boolean;
    membros: MapaMembros;
    onCanal: (canal: Canal) => void;
    onApagarCanal: (canal: Canal) => void;
    onConvidar: () => void;
    onNovoCanal: (tipo: TipoCanal) => void;
    onConfiguracoes: () => void;
    // o dono não sai (o servidor ficaria sem dono): pra ele o menu não tem "Sair"
    souDono: boolean;
    onSairServidor: () => void;
    onAbrirChamada: () => void;
    onSairChamada: () => void;
    onEditarFoto: () => void;
    onSairConta: () => void;
};

// segunda coluna: canais do servidor, quem está nas salas, chamada atual e você
export function PainelCanais(props: Props) {
    const { servidor, carregando, canalAtualId, voz, entrandoEm, eu, souAdmin, membros } = props;
    const { surdo } = useControleVoz();
    const { focar, focarAoEntrar } = useFocoChamada();
    const { abrirPerfil } = usePerfil();

    // "ao vivo" de alguém na sala: destaca a tela dessa pessoa e abre a chamada
    // "ao vivo" numa sala em que você não está: entra e já abre a tela da pessoa
    function entrarEAssistir(canal: Canal, identity: string) {
        focarAoEntrar(chaveTela(identity));
        props.onCanal(canal);
    }

    function assistir(identity: string) {
        focar(chaveTela(identity));
        props.onAbrirChamada();
    }

    const texto = servidor?.canais.filter((c) => c.tipo === "TEXTO") ?? [];
    const salas = servidor?.canais.filter((c) => c.tipo === "VOZ") ?? [];

    return (
        <aside className="painel-canais">
            {servidor ? (
                <CabecalhoServidor
                    servidor={servidor}
                    souAdmin={souAdmin}
                    onConvidar={props.onConvidar}
                    onNovoCanal={props.onNovoCanal}
                    onConfiguracoes={props.onConfiguracoes}
                    souDono={props.souDono}
                    onSair={props.onSairServidor}
                />
            ) : (
                <div className="painel-canais-topo">
                    {carregando && <span className="esqueleto" style={{ width: "60%", height: 14 }} />}
                </div>
            )}

            <nav className="lista-canais">
                {servidor ? (
                    <>
                        <Grupo titulo="Canais de texto" onCriar={souAdmin ? () => props.onNovoCanal("TEXTO") : undefined}>
                            {texto.map((c) => (
                                <div key={c.id} className="canal-linha">
                                    <button
                                        className={`canal ${canalAtualId === c.id ? "ativo" : ""}`}
                                        onClick={() => props.onCanal(c)}
                                        aria-current={canalAtualId === c.id ? "page" : undefined}
                                    >
                                        <Hash size={18} className="canal-icone" />
                                        <span className="truncar">{c.nome}</span>
                                    </button>
                                    {souAdmin && <AcoesCanal canal={c} onApagar={props.onApagarCanal} />}
                                </div>
                            ))}
                        </Grupo>

                        <Grupo titulo="Salas de voz" onCriar={souAdmin ? () => props.onNovoCanal("VOZ") : undefined}>
                            {salas.map((c) => {
                                const conectado = voz?.canal.id === c.id;
                                const pessoas = c.participantes ?? [];
                                return (
                                    <div key={c.id} className="sala">
                                        <div className="canal-linha">
                                            <button
                                                className={`canal ${canalAtualId === c.id ? "ativo" : ""} ${conectado ? "conectado" : ""}`}
                                                onClick={() => props.onCanal(c)}
                                            >
                                                <Volume2 size={18} className="canal-icone" />
                                                <span className="truncar">{c.nome}</span>
                                                {/* há quanto tempo a chamada da sala está rolando (pra quem está fora também) */}
                                                {c.inicioCall && (pessoas.length > 0 || conectado) && (
                                                    <TempoSala inicio={c.inicioCall} className="canal-tempo" />
                                                )}
                                                {entrandoEm === c.id && <Loader2 size={14} className="girar canal-carregando" />}
                                            </button>
                                            {souAdmin && <AcoesCanal canal={c} onApagar={props.onApagarCanal} />}
                                        </div>

                                        {conectado ? (
                                            <PessoasAoVivo membros={membros} eu={eu} surdo={surdo} onAssistir={assistir} />
                                        ) : (
                                            pessoas.length > 0 && (
                                                <ul className="voz-pessoas">
                                                    {pessoas.map((p) => (
                                                        <li key={p.id}>
                                                            <button
                                                                className="voz-pessoa-quem"
                                                                onClick={(e) => abrirPerfil(p, e.currentTarget)}
                                                                aria-haspopup="dialog"
                                                            >
                                                                <Avatar nome={p.nome} url={p.avatarUrl} tamanho={22} />
                                                                <span className="truncar">{p.nome}</span>
                                                            </button>
                                                            {c.telas?.includes(p.id) && (
                                                                <span className="voz-pessoa-estado">
                                                                    <button
                                                                        className="voz-ao-vivo"
                                                                        onClick={() => entrarEAssistir(c, p.id)}
                                                                        title={`Entrar e assistir a tela de ${p.nome}`}
                                                                    >
                                                                        Ao vivo
                                                                    </button>
                                                                </span>
                                                            )}
                                                        </li>
                                                    ))}
                                                </ul>
                                            )
                                        )}
                                    </div>
                                );
                            })}
                        </Grupo>
                    </>
                ) : (
                    carregando && <EsqueletoCanais />
                )}
            </nav>

            {voz && <PainelVoz voz={voz} onAbrir={props.onAbrirChamada} onSair={props.onSairChamada} />}
            <PainelUsuario
                eu={eu}
                salaAtual={voz?.canal.nome ?? null}
                onEditarFoto={props.onEditarFoto}
                onSair={props.onSairConta}
            />
        </aside>
    );
}

type CabecalhoProps = {
    servidor: ServidorDetalhe;
    souAdmin: boolean;
    souDono: boolean;
    onSair: () => void;
    onConvidar: () => void;
    onNovoCanal: (tipo: TipoCanal) => void;
    onConfiguracoes: () => void;
};

// nome do servidor; vira um menu: admin tem as ações do servidor, e quem não é dono pode sair
function CabecalhoServidor({ servidor, souAdmin, souDono, onConvidar, onNovoCanal, onConfiguracoes, onSair }: CabecalhoProps) {
    const [aberto, setAberto] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const fechar = useCallback(() => setAberto(false), []);
    useCliqueFora(ref, aberto, fechar);

    // sem nada pra mostrar no menu (não acontece hoje: o dono sempre é admin)
    if (!souAdmin && souDono) {
        return (
            <div className="painel-canais-topo">
                <strong className="truncar">{servidor.nome}</strong>
            </div>
        );
    }

    function executar(acao: () => void) {
        fechar();
        acao();
    }

    return (
        <div className="menu-ancora" ref={ref}>
            <button
                className={`painel-canais-topo clicavel ${aberto ? "aberto" : ""}`}
                onClick={() => setAberto((v) => !v)}
                aria-expanded={aberto}
                aria-haspopup="menu"
            >
                <strong className="truncar">{servidor.nome}</strong>
                <ChevronDown size={18} className="painel-canais-seta" />
            </button>

            {aberto && (
                <div className="menu menu-servidor" role="menu">
                    {souAdmin && (
                        <>
                            <button role="menuitem" className="menu-item" onClick={() => executar(onConvidar)}>
                                Convidar pessoas <UserPlus size={16} />
                            </button>
                            <span className="menu-separador" />
                            <button role="menuitem" className="menu-item" onClick={() => executar(() => onNovoCanal("TEXTO"))}>
                                Criar canal de texto <Hash size={16} />
                            </button>
                            <button role="menuitem" className="menu-item" onClick={() => executar(() => onNovoCanal("VOZ"))}>
                                Criar sala de voz <Volume2 size={16} />
                            </button>
                            <span className="menu-separador" />
                            <button role="menuitem" className="menu-item" onClick={() => executar(onConfiguracoes)}>
                                Configurações do servidor <Settings size={16} />
                            </button>
                        </>
                    )}
                    {!souDono && (
                        <>
                            {souAdmin && <span className="menu-separador" />}
                            <button role="menuitem" className="menu-item menu-item-perigo" onClick={() => executar(onSair)}>
                                Sair do servidor <DoorOpen size={16} />
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

// engrenagem que aparece no hover do canal (admin) e abre o menu de ações
function AcoesCanal({ canal, onApagar }: { canal: Canal; onApagar: (c: Canal) => void }) {
    const [aberto, setAberto] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const fechar = useCallback(() => setAberto(false), []);
    useCliqueFora(ref, aberto, fechar);

    return (
        <div className={`canal-acoes menu-ancora ${aberto ? "fixo" : ""}`} ref={ref}>
            <Dica texto="Configurações">
                <button
                    className="botao-icone botao-icone-mini canal-acao"
                    onClick={() => setAberto((v) => !v)}
                    aria-label={`Configurações do canal ${canal.nome}`}
                    aria-haspopup="menu"
                    aria-expanded={aberto}
                >
                    <Settings size={15} />
                </button>
            </Dica>

            {aberto && (
                <div className="menu menu-canal" role="menu">
                    <button
                        role="menuitem"
                        className="menu-item menu-item-perigo"
                        onClick={() => {
                            fechar();
                            onApagar(canal);
                        }}
                    >
                        Apagar canal <Trash2 size={16} />
                    </button>
                </div>
            )}
        </div>
    );
}

function Grupo({ titulo, onCriar, children }: { titulo: string; onCriar?: (() => void) | undefined; children: ReactNode }) {
    return (
        <section className="grupo-canais">
            <div className="grupo-canais-topo">
                <span className="rotulo">{titulo}</span>
                {onCriar && (
                    <Dica texto="Criar">
                        <button className="botao-icone botao-icone-mini" onClick={onCriar} aria-label={`Criar em ${titulo}`}>
                            <Plus size={15} />
                        </button>
                    </Dica>
                )}
            </div>
            {children}
        </section>
    );
}

function EsqueletoCanais() {
    return (
        <div className="esqueleto-canais" aria-hidden="true">
            {[54, 70, 46, 62, 50].map((largura, i) => (
                <span key={i} className="esqueleto" style={{ width: `${largura}%` }} />
            ))}
        </div>
    );
}
