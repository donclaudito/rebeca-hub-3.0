import { versosDaLetra, legendasDaLetra, CAPT_PISO } from './legendas-core.mjs';

export function chaveDaLetra(state) {
  const f = state.musicaFicheiro;
  return JSON.stringify([versosDaLetra(state.letra), f ? [f.name, f.size, f.lastModified] : null]);
}
export function temposManuais(state) {
  const salvo = state.legendasLetra;
  return salvo?.chave === chaveDaLetra(state) && Array.isArray(salvo.cues) ? salvo.cues : null;
}
// Ordena as legendas pelo tempo e assenta os cortes: a lista sai sempre em
// ordem (pelo início), e NENHUMA pode começar antes de a anterior acabar —
// quem chega cedo demais espera pelo fim da anterior; quem ficou sem tempo de
// ecrã ganha o piso mínimo. É o mesmo resultado que a página mostra, o que o
// vídeo desenha e o que sai no .srt.
export function ordenarLegendas(cues, duracao = Infinity) {
  const originais = Array.isArray(cues) ? cues : [];
  const fimTudo = Number(duracao);
  const fim = Number.isFinite(fimTudo) && fimTudo > 0 ? fimTudo : Infinity;
  const ordenadas = originais
    .map((c) => ({ texto: String(c?.texto || ''), inicio: Number(c?.inicio), fim: Number(c?.fim) }))
    .filter((c) => c.texto && Number.isFinite(c.inicio) && Number.isFinite(c.fim))
    .sort((a, b) => a.inicio - b.inicio || a.fim - b.fim);
  for (let i = 0; i < ordenadas.length; i++) {
    const c = ordenadas[i];
    if (i > 0 && c.inicio < ordenadas[i - 1].fim - 0.001) c.inicio = ordenadas[i - 1].fim;
    if (c.fim > fim) c.fim = fim;
    if (c.fim <= c.inicio) c.fim = Math.min(fim, c.inicio + CAPT_PISO); // Math.min(∞, x) = x
  }
  const mudou = ordenadas.length !== originais.length
    || ordenadas.some(
      (c, i) =>
        c.texto !== String(originais[i]?.texto || '')
        || Math.abs(c.inicio - Number(originais[i]?.inicio)) > 0.0005
        || Math.abs(c.fim - Number(originais[i]?.fim)) > 0.0005,
    );
  return { cues: ordenadas, mudou };
}

export function cuesDaLetra(state) {
  const manual = temposManuais(state);
  if (manual) return ordenarLegendas(manual, state.musicaSegundos).cues;
  // Rascunho: os versos seguem os TRECHOS DE CANTO (de analisarVoz, em
  // musica.mjs) — o texto entra quando a voz entra e as pausas instrumentais
  // (intro, interlúdio) ficam sem legenda. Sem trechos úteis (canto contínuo,
  // análise falhada ou faltando), divisão igual de sempre.
  return legendasDaLetra(versosDaLetra(state.letra), state.musicaSegundos, {
    secoes: state.musicaVoz?.secoes || null,
  });
}
export function erroNosTempos(cues, duracao = Infinity) {
  for (let i = 0; i < cues.length; i++) {
    const { inicio, fim } = cues[i];
    const linha = `Legenda ${i + 1}: `;
    if (!Number.isFinite(inicio) || !Number.isFinite(fim)) return linha + 'informe início e fim válidos (mm:ss.mmm).';
    if (inicio < 0) return linha + 'o início não pode ser negativo.';
    if (fim <= inicio) return linha + 'o fim deve ser maior que o início.';
    if (fim > duracao + 0.001) return linha + 'o fim ultrapassa a duração da música.';
    if (i && inicio < cues[i - 1].fim - 0.001) return linha + 'o início sobrepõe a legenda anterior.';
  }
  return '';
}
export function formatarTempo(valor) {
  const ms = Math.round(Math.max(0, valor) * 1000);
  return `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}
export function lerTempo(valor) {
  const texto = String(valor).trim().replace(',', '.');
  if (!texto) return NaN;
  if (/^\d+(?:\.\d{1,3})?$/.test(texto)) return Number(texto);
  const partes = /^(\d+):([0-5]\d)(?:\.(\d{1,3}))?$/.exec(texto);
  return partes ? Number(partes[1]) * 60 + Number(partes[2]) + Number(`0.${partes[3] || 0}`) : NaN;
}
