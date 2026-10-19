// Converte palavras alinhadas em versos, sem repartir tempo nem preencher pausas.
const normalizar = (texto) => String(texto || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

export function versosAlinhados(texto, palavras, duracao) {
  const versos = texto.split(/\r?\n/).map((v) => v.trim()).filter(Boolean);
  if (!Array.isArray(palavras) || !palavras.length || palavras.length > 12000) throw new Error('Não foi possível reconhecer os tempos. Ajuste os versos manualmente.');
  const letras = [];
  let transcrito = '', anterior = 0;
  for (const palavra of palavras) {
    const token = normalizar(palavra.text);
    if (!token) continue;
    const inicio = palavra.start, fim = palavra.end;
    if (!Number.isFinite(inicio) || !Number.isFinite(fim) || inicio < anterior - 0.001 || fim <= inicio || fim > duracao + 0.1) {
      throw new Error('O alinhamento devolveu palavras sem tempos válidos. Confira a letra e ajuste manualmente.');
    }
    transcrito += token;
    for (const letra of token) letras.push({ inicio, fim });
    anterior = fim;
  }
  if (transcrito !== versos.map(normalizar).join('')) throw new Error('O alinhamento não corresponde à letra completa. Confira o texto cantado, incluindo repetições.');
  let cursor = 0;
  const cues = versos.map((verso) => {
    const tamanho = [...normalizar(verso)].length;
    if (!tamanho) throw new Error('Retire as linhas sem palavras da letra.');
    const inicio = letras[cursor].inicio;
    const fim = Math.min(duracao, letras[cursor + tamanho - 1].fim);
    cursor += tamanho;
    return { texto: verso, inicio, fim };
  });
  // CORTE NO MEIO DE UMA PALAVRA: os versos contam-se por LETRAS, e o corte
  // entre dois versos pode cair dentro da MESMA palavra (o reconhecimento
  // divide os tokens como quer — ex.: "quatr" + "o" para "quat" / "ro").
  // Nesse caso o verso de trás herdava o fim da palavra inteira e o verso
  // seguinte, que começa nessa mesma palavra, começava ANTES do fim do
  // anterior ("Legenda N: o início sobrepõe a legenda anterior"). Assente o
  // corte: o verso de trás termina onde a palavra partilhada começa.
  for (let i = 1; i < cues.length; i++) {
    const a = cues[i - 1], b = cues[i];
    if (b.inicio >= a.fim - 0.001) continue;
    if (b.inicio > a.inicio) {
      a.fim = b.inicio;
    } else {
      // O verso de trás está inteiro dentro da mesma palavra (raríssimo):
      // reparte o tempo da palavra entre os dois.
      const meio = (a.inicio + a.fim) / 2;
      a.fim = meio;
      b.inicio = meio;
    }
  }
  return cues;
}