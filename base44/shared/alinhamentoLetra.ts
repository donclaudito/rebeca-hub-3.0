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
  return versos.map((verso) => {
    const tamanho = [...normalizar(verso)].length;
    if (!tamanho) throw new Error('Retire as linhas sem palavras da letra.');
    const inicio = letras[cursor].inicio;
    const fim = Math.min(duracao, letras[cursor + tamanho - 1].fim);
    cursor += tamanho;
    return { texto: verso, inicio, fim };
  });
}