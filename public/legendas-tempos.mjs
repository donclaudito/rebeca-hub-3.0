import { versosDaLetra, legendasDaLetra } from './legendas-core.mjs';

export function chaveDaLetra(state) {
  const f = state.musicaFicheiro;
  return JSON.stringify([versosDaLetra(state.letra), f ? [f.name, f.size, f.lastModified] : null]);
}
export function temposManuais(state) {
  const salvo = state.legendasLetra;
  return salvo?.chave === chaveDaLetra(state) && Array.isArray(salvo.cues) ? salvo.cues : null;
}
export function cuesDaLetra(state) {
  const manual = temposManuais(state);
  if (manual) return manual.map((c) => ({ ...c }));
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
