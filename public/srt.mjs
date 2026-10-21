// ============================================================
//  Leitor de .srt (SubRip).
//
//  Serve para o contrário do que a app já fazia: em vez de EXPORTAR as
//  legendas do vídeo, importar um .srt feito fora (ou corrigido à mão) e
//  usá-lo como as legendas do vídeo. Os tempos vêm em segundos.
//
//  É deliberadamente tolerante: aceita BOM, CRLF, índices opcionais,
//  vírgula ou ponto nos milissegundos, várias linhas por bloco e etiquetas
//  HTML/bibliotecas (<i>, {\an8}) que os editores costumam deixar.
// ============================================================

const segundos = (h, m, s, ms) => +h * 3600 + +m * 60 + +s + Number(String(ms).padEnd(3, '0')) / 1000;

/** @returns {{cues: Array<{inicio:number,fim:number,texto:string}>, total:number, problemas:string[]}} */
export function lerSrt(texto) {
  const cru = String(texto || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n');

  const cues = [];
  const problemas = [];

  for (const bloco of cru.split(/\n{2,}/)) {
    const linhas = bloco
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (!linhas.length) continue;

    // A primeira linha pode ser o número da sequência.
    let i = /^\d+$/.test(linhas[0]) ? 1 : 0;
    const linhaTempo = linhas[i] || '';
    const m = linhaTempo.match(
      /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/,
    );
    if (!m) {
      problemas.push(`bloco sem tempo: ${linhaTempo.slice(0, 40) || '(vazio)'}`);
      continue;
    }

    const inicio = segundos(m[1], m[2], m[3], m[4]);
    const fim = segundos(m[5], m[6], m[7], m[8]);
    const corpo = linhas
      .slice(i + 1)
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .replace(/\{[^}]*\}/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!corpo) {
      problemas.push(`bloco sem texto em ${inicio.toFixed(1)}s`);
      continue;
    }
    if (!(fim > inicio)) {
      problemas.push(`tempo invertido em ${inicio.toFixed(1)}s`);
      continue;
    }
    cues.push({ inicio, fim, texto: corpo });
  }

  cues.sort((a, b) => a.inicio - b.inicio);
  return { cues, total: cues.length ? cues[cues.length - 1].fim : 0, problemas };
}

/** Estica ou encolhe todos os tempos pelo mesmo factor. */
export function escalarCues(cues, factor) {
  const f = Number(factor);
  if (!Number.isFinite(f) || f <= 0 || Math.abs(f - 1) < 0.02) return cues.map((c) => ({ ...c }));
  return cues.map((c) => ({ inicio: c.inicio * f, fim: c.fim * f, texto: c.texto }));
}

/** Resumo curto para a interface: "23 blocos · 1:58". */
export function resumoDoSrt(total, blocos) {
  const mm = Math.floor(total / 60);
  const ss = Math.round(total % 60);
  return `${blocos} bloco(s) · ${mm}:${String(ss).padStart(2, '0')}`;
}
