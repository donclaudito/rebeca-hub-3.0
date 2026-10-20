// ============================================================
//  Enquadramento: onde cortar a imagem no vídeo
//
//  PROBLEMA: quando a imagem e o vídeo têm proporções diferentes, alguma coisa
//  tem de ser cortada. Numa imagem gerada por IA (quadrada ou 4:3) para um
//  vídeo 16:9 perde-se ~44% da ALTURA. Se o recorte for pelo meio — ou pelo
//  sítio com mais detalhe, que num personagem é o tronco — corta-se a CABEÇA.
//  Era isso que aparecia no vídeo: ora a perna, ora o tronco, sem cabeça.
//
//  SOLUÇÃO: procura-se a CAIXA do assunto (linhas e colunas onde está o
//  detalhe que interessa) e coloca-se a janela a partir do TOPO dessa caixa,
//  com uma folga fixa por cima (a "folga de cabeça"). Resultado:
//     - a cabeça nunca é cortada;
//     - todas as cenas ficam com a cabeça à mesma altura → montagem coordenada;
//     - se o assunto couber inteiro com folga, é ele que fica centrado.
//
//  Este ficheiro NÃO desenha nada: recebe os dados dos pixels e devolve o
//  deslocamento. Assim as contas podem ser testadas sem canvas.
// ============================================================

// Quanto do centro conta como "assunto" quando não há caixa de assunto clara.
// Uma ligeira preferência pelo centro evita que o recorte salte para uma árvore
// com folhas ao canto (muita variação e pouca importância).
export const PESO_CENTRO = 0.35;

// Quanto do pico do perfil de detalhe já conta como "aqui está o assunto".
export const LIMIAR_ASSUNTO = 0.4;

// Folga por cima da cabeça, em fração da altura da janela. É esta constante que
// dá a MESMA altura de cabeça a todas as cenas (coordenação entre planos).
export const FOLGA_CABECA = 0.09;

// Quando o assunto cabe na janela com pelo menos esta folga, centra-se o
// assunto em vez de o colar ao topo.
const FOLGA_PARA_CENTRAR = 0.12;

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

const limitar = (v, min, max) => Math.min(max, Math.max(min, v));

// Tamanho da janela visível, em pixels da imagem, e quanto sobra para deslizar.
// É a base de todas as contas: diz quanto da imagem cabe no vídeo.
export function janelaVisivel(largura, altura, alvoW, alvoH) {
  const escala = Math.max(alvoW / largura, alvoH / altura);
  const vw = Math.min(largura, Math.round(alvoW / escala));
  const vh = Math.min(altura, Math.round(alvoH / escala));
  return { vw, vh, sobraX: Math.max(0, largura - vw), sobraY: Math.max(0, altura - vh) };
}

// Perfis de detalhe: quanto detalhe há em cada LINHA e em cada COLUNA.
// Uma pessoa em pé dá um perfil de linhas que só sobe onde ela está: a primeira
// linha acima do limiar é, na prática, o topo da cabeça.
export function perfisDeDetalhe(mapa, largura, altura, area = null) {
  const x0 = area ? limitar(area.x0, 0, largura - 1) : 0;
  const x1 = area ? limitar(area.x1, x0 + 1, largura) : largura;
  const y0 = area ? limitar(area.y0, 0, altura - 1) : 0;
  const y1 = area ? limitar(area.y1, y0 + 1, altura) : altura;
  const linhas = new Float64Array(altura);
  const colunas = new Float64Array(largura);
  for (let y = y0; y < y1; y++) {
    let soma = 0;
    for (let x = x0; x < x1; x++) {
      const v = mapa[y * largura + x];
      soma += v;
      colunas[x] += v;
    }
    linhas[y] = soma;
  }
  return { linhas, colunas, caixa: { x0, y0, x1, y1 } };
}

function primeiroAcima(perfil, limiar, de, ate) {
  for (let i = de; i < ate; i++) if (perfil[i] >= limiar) return i;
  return -1;
}

function ultimoAcima(perfil, limiar, de, ate) {
  for (let i = ate - 1; i >= de; i--) if (perfil[i] >= limiar) return i;
  return -1;
}

// A CAIXA do assunto: o rectângulo onde está o que interessa.
//
// Devolve { x0, y0, x1, y1 } em pixels da imagem (x1/y1 já fora do rectângulo),
// ou `null` quando não há um assunto identificável (imagem de paisagem, imagem
// toda ela detalhada, ou sem dados).
export function caixaDoAssunto(dados, largura, altura, area = null) {
  if (!(largura > 0) || !(altura > 0) || !dados || dados.length < largura * altura * 4) return null;
  const mapa = mapaDeDetalhe(dados, largura, altura);
  const { linhas, colunas, caixa } = perfisDeDetalhe(mapa, largura, altura, area);

  let picoLinhas = 0;
  for (let y = caixa.y0; y < caixa.y1; y++) if (linhas[y] > picoLinhas) picoLinhas = linhas[y];
  let picoColunas = 0;
  for (let x = caixa.x0; x < caixa.x1; x++) if (colunas[x] > picoColunas) picoColunas = colunas[x];
  if (!(picoLinhas > 0) || !(picoColunas > 0)) return null;

  const topo = primeiroAcima(linhas, picoLinhas * LIMIAR_ASSUNTO, caixa.y0, caixa.y1);
  const base = ultimoAcima(linhas, picoLinhas * LIMIAR_ASSUNTO, caixa.y0, caixa.y1);
  const esq = primeiroAcima(colunas, picoColunas * LIMIAR_ASSUNTO, caixa.x0, caixa.x1);
  const dir = ultimoAcima(colunas, picoColunas * LIMIAR_ASSUNTO, caixa.x0, caixa.x1);
  if (topo < 0 || base <= topo || esq < 0 || dir <= esq) return null;

  const resultado = { x0: esq, y0: topo, x1: dir + 1, y1: base + 1 };
  // Assunto que ocupa a imagem quase toda não dá indicação nenhuma (é o caso de
  // um fundo muito detalhado). Mais vale o recorte por detalhe com peso central.
  if (resultado.y1 - resultado.y0 > 0.98 * altura && resultado.x1 - resultado.x0 > 0.98 * largura) return null;
  return resultado;
}

// Zona ÚTIL da imagem: tira as barras pretas que algumas imagens geradas já
// trazem (uma faixa preta em baixo, por exemplo). Só corta faixas escuras,
// uniformes e de tamanho moderado — uma cena nocturna não é uma barra preta.
export function caixaUtil(dados, largura, altura) {
  const inteira = { x0: 0, y0: 0, x1: largura, y1: altura };
  if (!(largura > 2) || !(altura > 2) || !dados || dados.length < largura * altura * 4) return inteira;
  const lum = (x, y) => {
    const i = (y * largura + x) * 4;
    return 0.2126 * dados[i] + 0.7152 * dados[i + 1] + 0.0722 * dados[i + 2];
  };
  const linhaEscura = (y) => {
    let soma = 0;
    let soma2 = 0;
    for (let x = 0; x < largura; x += Math.max(1, Math.floor(largura / 40))) {
      const v = lum(x, y);
      soma += v;
      soma2 += v * v;
    }
    const n = Math.ceil(largura / Math.max(1, Math.floor(largura / 40)));
    const media = soma / n;
    const desvio = Math.sqrt(Math.max(0, soma2 / n - media * media));
    return media < 24 && desvio < 8;
  };
  const colunaEscura = (x) => {
    let soma = 0;
    let soma2 = 0;
    for (let y = 0; y < altura; y += Math.max(1, Math.floor(altura / 40))) {
      const v = lum(x, y);
      soma += v;
      soma2 += v * v;
    }
    const n = Math.ceil(altura / Math.max(1, Math.floor(altura / 40)));
    const media = soma / n;
    const desvio = Math.sqrt(Math.max(0, soma2 / n - media * media));
    return media < 24 && desvio < 8;
  };

  // No máximo 30% de cada lado: mais do que isso já não é uma barra, é imagem.
  const limiteY = Math.floor(altura * 0.3);
  const limiteX = Math.floor(largura * 0.3);
  let topo = 0;
  while (topo < limiteY && linhaEscura(topo)) topo++;
  let base = altura;
  while (altura - base < limiteY && base > topo + 1 && linhaEscura(base - 1)) base--;
  let esq = 0;
  while (esq < limiteX && colunaEscura(esq)) esq++;
  let dir = largura;
  while (largura - dir < limiteX && dir > esq + 1 && colunaEscura(dir - 1)) dir--;

  // Nada de novo, ou sobrou pouco: fica a imagem inteira.
  if ((base - topo) < altura * 0.5 || (dir - esq) < largura * 0.5) return inteira;
  if (topo === 0 && esq === 0 && base === altura && dir === largura) return inteira;
  return { x0: esq, y0: topo, x1: dir, y1: base };
}

// Onde pôr a janela (vw×vh) para o assunto `c` ficar bem enquadrado.
function posicionarAssunto(c, { vw, vh, sobraX, sobraY }) {
  const alt = c.y1 - c.y0;
  const folga = vh - alt;
  // Cabe inteiro com folga → centra-se (mostra o corpo todo, equilibrado).
  // Não cabe → manda a CABEÇA: a folga é fixa, igual em todas as cenas.
  const y = folga >= FOLGA_PARA_CENTRAR * vh ? c.y0 - folga / 2 : c.y0 - FOLGA_CABECA * vh;
  const x = (c.x0 + c.x1) / 2 - vw / 2;
  return { x: limitar(Math.round(x), 0, sobraX), y: limitar(Math.round(y), 0, sobraY) };
}

// Onde cortar uma imagem de `largura`×`altura` para preencher `alvoW`×`alvoH`.
//
// Devolve { x, y } — o canto superior esquerdo da janela visível, em pixels da
// imagem (0 = encostado à esquerda/topo). Com `x` e `y` a zero a janela está no
// canto; o recorte centrado é (sobraX/2, sobraY/2).
//
// `modo`:
//   'centro'      → recorte centrado (o comportamento antigo);
//   'personagem'  → segue o assunto e nunca corta a cabeça (o padrão).
// `area` (opcional): a zona útil da imagem, quando a imagem traz barras pretas.
export function calcularRecorte({ largura, altura, alvoW, alvoH, dados, modo = 'personagem', pesoCentro = PESO_CENTRO, area = null }) {
  const base = { x: 0, y: 0 };
  if (!(largura > 0) || !(altura > 0) || !(alvoW > 0) || !(alvoH > 0)) return base;

  // A imagem é desenhada a cobrir: usa-se a maior das duas escalas.
  const escala = Math.max(alvoW / largura, alvoH / altura);
  const dw = Math.round(largura * escala);
  const dh = Math.round(altura * escala);
  if (dw <= alvoW + 1 && dh <= alvoH + 1) return base; // não há nada a cortar

  // Em coordenadas da imagem original, a janela visível é do tamanho
  // alvo/escala. O que sobra é o que pode deslizar.
  const { vw, vh, sobraX, sobraY } = janelaVisivel(largura, altura, alvoW, alvoH);
  if (!sobraX && !sobraY) return base;

  const centrado = { x: Math.round(sobraX / 2), y: Math.round(sobraY / 2) };
  if (modo !== 'personagem' || !dados || dados.length < largura * altura * 4) return centrado;

  // 1) Há um assunto identificável? Então é ele que manda no enquadramento.
  const caixa = caixaDoAssunto(dados, largura, altura, area);
  if (caixa) return posicionarAssunto(caixa, { vw, vh, sobraX, sobraY });

  // 2) Sem assunto claro: procura-se a zona com mais detalhe, com um empate a
  //    favor do centro (evita saltar para folhagem ao canto).
  const mapa = mapaDeDetalhe(dados, largura, altura);
  const acum = somasAcumuladas(mapa, largura, altura);
  const total = somaJanela(acum, largura, 0, 0, Math.max(1, vw), Math.max(1, vh));
  const medio = total > 0 ? total / (vw * vh) : 1;

  const passo = Math.max(4, Math.round(Math.min(largura, altura) / 80));
  let melhor = null;
  const cx = sobraX / 2;
  const cy = sobraY / 2;
  for (let y = 0; y <= sobraY; y += passo) {
    for (let x = 0; x <= sobraX; x += passo) {
      const detalhe = somaJanela(acum, largura, x, y, vw, vh);
      const dx = sobraX ? (x - cx) / (sobraX / 2) : 0;
      const dy = sobraY ? (y - cy) / (sobraY / 2) : 0;
      const centro = 1 - Math.min(1, Math.sqrt(dx * dx + dy * dy) / Math.SQRT2);
      const valor = detalhe / (vw * vh * (medio || 1)) + pesoCentro * centro;
      if (!melhor || valor > melhor.valor) melhor = { x, y, valor };
    }
  }
  if (!melhor) return centrado;
  return { x: limitar(melhor.x, 0, sobraX), y: limitar(melhor.y, 0, sobraY) };
}
