import type { EscolhaFoco } from "../contexto/FocoChamada";

// Lógica do palco da chamada sem React, pra dar pra testar sozinha.

// Largura de cada quadro (16:9) que deixa todos os `n` do maior tamanho possível
// dentro de uma área `largura` x `altura`, testando cada número de colunas.
export function larguraNaGrade(n: number, largura: number, altura: number, vao: number, proporcao = 16 / 9) {
    if (n <= 0 || largura <= 0 || altura <= 0) return 0;
    let melhor = 0;
    for (let colunas = 1; colunas <= n; colunas++) {
        const linhas = Math.ceil(n / colunas);
        const pelaLargura = (largura - vao * (colunas - 1)) / colunas;
        const pelaAltura = ((altura - vao * (linhas - 1)) / linhas) * proporcao;
        melhor = Math.max(melhor, Math.min(pelaLargura, pelaAltura));
    }
    return Math.max(0, Math.floor(melhor));
}

// Qual quadro fica em destaque (null = grade).
// - automático: a tela de outra pessoa que começou por último
// - fixado: o quadro escolhido, enquanto ele existir (se sumir, volta pro automático)
// - grade: você pediu a grade
export function resolverFoco(escolha: EscolhaFoco, existentes: ReadonlySet<string>, telaMaisRecente: string | null) {
    if (escolha === null) return telaMaisRecente;
    if (escolha.chave === null) return null;
    return existentes.has(escolha.chave) ? escolha.chave : telaMaisRecente;
}

// Mantém a ordem de chegada das chaves entre renderizações: quem já estava fica com o
// número que tinha, quem chegou ganha o próximo, quem saiu é esquecido.
export class OrdemDeChegada {
    private vistos = new Map<string, number>();
    private contador = 0;

    // devolve as chaves da mais antiga pra mais nova
    atualizar(chaves: readonly string[]) {
        const atuais = new Set(chaves);
        for (const chave of [...this.vistos.keys()]) {
            if (!atuais.has(chave)) this.vistos.delete(chave);
        }
        for (const chave of chaves) {
            if (!this.vistos.has(chave)) this.vistos.set(chave, ++this.contador);
        }
        return [...chaves].sort((a, b) => this.vistos.get(a)! - this.vistos.get(b)!);
    }
}
