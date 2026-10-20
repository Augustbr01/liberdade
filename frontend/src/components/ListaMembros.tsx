import { Crown, Volume2, X } from "lucide-react";
import type { Membro, ServidorDetalhe, Usuario } from "../api";
import { usePerfil } from "../contexto/Perfil";
import { Avatar } from "./ui/Avatar";
import { Dica } from "./ui/Dica";

type Props = {
    servidor: ServidorDetalhe;
    eu: Usuario;
    // id do usuário -> nome da sala em que está
    emChamada: Map<string, string>;
    // em tela estreita a lista abre por cima do chat e tem o próprio botão de fechar
    onFechar: () => void;
};

// coluna da direita: quem faz parte do servidor
export function ListaMembros({ servidor, eu, emChamada, onFechar }: Props) {
    const admins = servidor.membros.filter((m) => m.permissao === "ADMIN");
    const membros = servidor.membros.filter((m) => m.permissao !== "ADMIN");

    // uma lista só (títulos e pessoas lado a lado, cada um com sua chave): quem vira admin ou deixa
    // de ser muda de grupo sem o React recriar o botão, e o cartão de perfil aberto nele continua preso
    const grupo = (id: string, titulo: string, lista: Membro[]) =>
        lista.length === 0
            ? []
            : [
                  <span key={`titulo-${id}`} className="rotulo membros-titulo">{titulo} — {lista.length}</span>,
                  ...lista.map(({ usuario }) => (
                      <LinhaMembro
                          key={usuario.id}
                          usuario={usuario}
                          dono={usuario.id === servidor.dono.id}
                          ehVoce={usuario.id === eu.id}
                          sala={emChamada.get(usuario.id)}
                      />
                  )),
              ];

    return (
        <aside className="lista-membros" aria-label="Membros">
            <header className="lista-membros-topo">
                <strong>Membros</strong>
                <span className="lista-membros-total">{servidor.membros.length}</span>
                <button className="botao-icone" onClick={onFechar} aria-label="Fechar a lista de membros">
                    <X size={18} />
                </button>
            </header>
            {[...grupo("admins", "Admins", admins), ...grupo("membros", "Membros", membros)]}
        </aside>
    );
}

type LinhaProps = { usuario: Usuario; dono: boolean; ehVoce: boolean; sala: string | undefined };

function LinhaMembro({ usuario, dono, ehVoce, sala }: LinhaProps) {
    const { abrirPerfil } = usePerfil();

    return (
        <button className="membro" onClick={(e) => abrirPerfil(usuario, e.currentTarget)} aria-haspopup="dialog">
            <Avatar nome={usuario.nome} url={usuario.avatarUrl} tamanho={32} />
            <div className="membro-texto">
                <span className="membro-nome">
                    <span className="truncar">{usuario.nome}</span>
                    {dono && (
                        <Dica texto="Dono do servidor">
                            <Crown size={14} className="membro-coroa" aria-label="Dono do servidor" />
                        </Dica>
                    )}
                </span>
                {sala ? (
                    <span className="membro-status">
                        <Volume2 size={12} /> <span className="truncar">{sala}</span>
                    </span>
                ) : (
                    ehVoce && <span className="membro-status">Você</span>
                )}
            </div>
        </button>
    );
}
