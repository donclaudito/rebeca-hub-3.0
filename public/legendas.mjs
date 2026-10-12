// ============================================================
//  Legendas — a parte que desenha (precisa do canvas e das fontes)
//
//  As contas (corte em blocos, temporização, .srt) estão em legendas-core.mjs.
//  Aqui só vive o que precisa do browser: carregar a fonte e desenhar o bloco.
// ============================================================

import { CAPT_FONTE, CAPT_LINHAS, ajustarTamanho } from './legendas-core.mjs';

export { CAPT_COR, CAPT_CONTORNO } from './legendas-core.mjs';

// Carrega a fonte cartoon do Google Fonts uma única vez por página.
//
// Se a rede falhar, o vídeo NÃO pode ficar à espera: a família tem alternativas
// locais ("Komika Axis", "Comic Sans MS", cursive), e o desenho funciona na
// mesma. Por isso há um limite de tempo e o erro é engolido de propósito.
let fontesCarregadas = null;

export function carregarFontesLegenda() {
  if (fontesCarregadas) return fontesCarregadas;

  fontesCarregadas = new Promise((resolve) => {
    const pronto = () => resolve(true);
    const limite = setTimeout(() => resolve(false), 5000);
    try {
      if (typeof document === 'undefined') {
        clearTimeout(limite);
        resolve(false);
        return;
      }
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${CAPT_FONTE.google}&display=block`;
      link.onload = () => {
        const familia = CAPT_FONTE.family.split(',')[0].replace(/"/g, '');
        if (!document.fonts || !document.fonts.load) {
          clearTimeout(limite);
          pronto();
          return;
        }
        Promise.all([
          document.fonts.load(`${CAPT_FONTE.weight} 40px ${familia}`),
          document.fonts.ready,
        ])
          .then(() => {
            clearTimeout(limite);
            pronto();
          })
          .catch(() => {
            clearTimeout(limite);
            pronto(); // desenha com a alternativa local
          });
      };
      link.onerror = () => {
        clearTimeout(limite);
        resolve(false);
      };
      document.head.appendChild(link);
    } catch {
      clearTimeout(limite);
      resolve(false);
    }
  });

  return fontesCarregadas;
}

// Legenda incrustada no vídeo: fonte cartoon, cor sólida, contorno preto grosso
// e sombra — legível sobre qualquer fundo e em no máximo 2 linhas.
//
// O tamanho base é proporcional à largura (3,4%), por isso o mesmo desenho
// funciona em 1920×1080 e em 720×1280 sem ajustes.
export function desenharLegenda(ctx, texto, w, h, estilo = {}) {
  if (!texto) return;
  const tamanhoBase = Math.round(w * 0.034);
  const larguraMax = w - 160;
  const familiaEm = (tamanho) => `${CAPT_FONTE.weight} ${tamanho}px ${CAPT_FONTE.family}`;
  const medirEm = (tamanho) => (t) => {
    ctx.font = familiaEm(tamanho);
    return ctx.measureText(t).width;
  };

  const { tamanho, linhas } = ajustarTamanho(medirEm, texto, larguraMax, tamanhoBase);
  if (!linhas.length) return;

  ctx.save();
  ctx.font = familiaEm(tamanho);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const alturaLinha = Math.round(tamanho * 1.18);
  const contorno = Math.max(3, Math.min(5, Number(estilo.contorno) || 4)) * (w / 1280);
  let y = h - linhas.length * alturaLinha - Math.round(h * 0.08);
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = contorno * 1.6;
  ctx.shadowOffsetY = contorno * 0.6;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = contorno;
  ctx.fillStyle = estilo.cor || '#FBBF24';
  linhas.forEach((linha) => {
    ctx.strokeText(linha, w / 2, y);
    ctx.fillText(linha, w / 2, y);
    y += alturaLinha;
  });
  ctx.restore();
}

export { CAPT_LINHAS };
