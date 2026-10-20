// ============================================================
//  Enquadramento: onde cortar a imagem no vídeo
//
//  PROBLEMA: quando a imagem e o vídeo têm proporções diferentes, alguma coisa
//  tem de ser cortada. O recorte centrado (o que estava) só funciona se o
//  personagem estiver no meio da imagem. Numa imagem gerada por IA, o sujeito
//  aparece frequentemente deslocado (regra dos terços) — e o recorte centrado
//  corta-lhe a cara ou tira-o de quadro.
//
//  SOLUÇÃO: antes de cortar, procura-se onde está o "assunto" — as zonas com
//  mais variação de cor e detalhe, que é onde estão caras, olhos, contornos e o
//  corpo do personagem. O recorte desloca-se para ficar com essa zona no meio.
//
//  Este ficheiro NÃO desenha nada: recebe os dados dos pixels e devolve o
//  deslocamento. Assim as contas podem ser testadas sem canvas.
// ============================================================

// Quanto do centro conta como "assunto", por defeito. Uma ligeira preferência
// pelo centro evita que o recorte salte para uma árvore com folhas ao canto
// (muita variação e pouca importância). Não é a regra dos terços: é só um
// desempate para o que está mais perto do meio.
export const PESO_CENTRO = 0.35;

// Mapa de "importância" de cada pixel: soma do gradiente horizontal e vertical
// (a variação local de cor). Zonas lisas — céu, parede, chão — dão perto de 0;
// caras, olhos, folhas e contornos dão valores altos.
export function mapaDeDetalhe(dados, largura, altura) {
  const n = largura * altura;
  const mapa = new Float32Array(n);
  const lum = (i) => 0.2126 * dados[i * 4] + 0.7152 * dados[i * 4 + 1] + 0.0722 * dados[i * 4 + 2];
  for (let y = 1; y < altura - 1; y++) {
    for (let x = 1; x < largura - 1; x++) {
      const i = y * largura + x;
      const gx = lum(i + 1) - lum(i - 1);
      const gy = lum(i + largura) - lum(i - largura);
      mapa[i] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return mapa;
}

// Soma de uma janela rectangular, com somas acumuladas (rápido: uma passagem).
function somasAcumuladas(mapa, largura, altura) {
  const acum = new Float64Array((largura + 1) * (altura + 1));
  for (let y = 0; y < altura; y++) {
    let linha = 0;
    for (let x = 0; x < largura; x++) {
      linha += mapa[y * largura + x];
      acum[(y + 1) * (largura + 1) + (x + 1)] = acum[y * (largura + 1) + (x + 1)] + linha;
    }
  }
  return acum;
}

function somaJanela(acum, largura, x0, y0, w, h) {
  const L = largura + 1;
  const a = acum[y0 * L + x0];
  const b = acum[y0 * L + (x0 + w)];
  const c = acum[(y0 + h) * L + x0];
  const d = acum[(y0 + h) * L + (x0 + w)];
  return d - b - c + a;
}

// Onde cortar uma imagem de `largura`×`altura` para preencher `alvoW`×`alvoH`.
//
// Devolve { x, y } — quanto tirar de cada lado (em pixels da imagem original).
// O centro está em (largura - corte) / 2, portanto `x` é o deslocamento em
// relação ao centro: 0 é recorte centrado.
//
// `modo`:
//   'centro'      → recorte centrado (o comportamento antigo);
//   'personagem'  → procura a zona com mais detalhe (o padrão).
export function calcularRecorte({ largura, altura, alvoW, alvoH, dados, modo = 'personagem', pesoCentro = PESO_CENTRO }) {
  const base = { x: 0, y: 0 };
  if (!(largura > 0) || !(altura > 0) || !(alvoW > 0) || !(alvoH > 0)) return base;

  // A imagem é desenhada a cobrir: usa-se a maior das duas escalas.
  const escala = Math.max(alvoW / largura, alvoH / altura);
  const dw = Math.round(largura * escala);
  const dh = Math.round(altura * escala);
  if (dw <= alvoW + 1 && dh <= alvoH + 1) return base; // não há nada a cortar

  // Em coordenadas da imagem original, a janela visível é do tamanho
  // alvo/escala. O que sobra é o que pode deslizar.
  const vw = Math.min(largura, Math.round(alvoW / escala));
  const vh = Math.min(altura, Math.round(alvoH / escala));
  const sobraX = Math.max(0, largura - vw);
  const sobraY = Math.max(0, altura - vh);
  if (!sobraX && !sobraY) return base;
  if (modo !== 'personagem' || !dados || dados.length < largura * altura * 4) {
    return { x: Math.round(sobraX / 2), y: Math.round(sobraY / 2) };
  }

  const mapa = mapaDeDetalhe(dados, largura, altura);
  const acum = somasAcumuladas(mapa, largura, altura);
  // Total do mapa, para o peso do centro não depender do tamanho da imagem.
  const total = sobraX || sobraY ? somaJanela(acum, largura, 0, 0, Math.max(1, vw), Math.max(1, vh)) : 1;
  const medio = total > 0 ? total / (vw * vh) : 1;

  // Procura por passos: uma volta fina seria desperdício (o olho não nota
  // 3 px de diferença) e isto corre no telemóvel.
  const passo = Math.max(4, Math.round(Math.min(largura, altura) / 80));
  let melhor = null;
  const cx = sobraX / 2;
  const cy = sobraY / 2;
  for (let y = 0; y <= sobraY; y += passo) {
    for (let x = 0; x <= sobraX; x += passo) {
      const detalhe = somaJanela(acum, largura, x, y, vw, vh);
      // Distância ao centro, normalizada 0..1 em cada eixo.
      const dx = sobraX ? (x - cx) / (sobraX / 2) : 0;
      const dy = sobraY ? (y - cy) / (sobraY / 2) : 0;
      const centrado = 1 - Math.min(1, Math.sqrt(dx * dx + dy * dy) / Math.SQRT2);
      const valor = detalhe / (vw * vh * (medio || 1)) + pesoCentro * centrado;
      if (!melhor || valor > melhor.valor) melhor = { x, y, valor };
    }
  }
  if (!melhor) return { x: Math.round(sobraX / 2), y: Math.round(sobraY / 2) };
  return { x: Math.min(sobraX, Math.max(0, melhor.x)), y: Math.min(sobraY, Math.max(0, melhor.y)) };
}
