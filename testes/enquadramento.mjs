// Testes do enquadramento: a imagem é cortada de modo a manter o assunto no
// meio, em vez de cortar sempre pelo centro.
const BASE = 'file:///E:/youtube%20rebeca2/rebeca-hub-3.0-base44/public/';
const enf = await import(BASE + 'enquadramento.mjs');

const falhas = [];
const ok = (m) => console.log('  ok:', m);
const fail = (m) => { console.error('  FALHOU:', m); falhas.push(m); };
const check = (c, bom, mau) => (c ? ok(bom) : fail(mau));

// Constrói os pixels de uma imagem: fundo liso e um "personagem" (um bloco com
// xadrez de alto contraste) na posição pedida.
function imagemComPersonagem(largura, altura, bloco) {
  const dados = new Uint8ClampedArray(largura * altura * 4);
  for (let i = 0; i < largura * altura; i++) {
    dados[i * 4] = 200; dados[i * 4 + 1] = 220; dados[i * 4 + 2] = 240; dados[i * 4 + 3] = 255;
  }
  if (!bloco) return dados;
  const [bx, by, bw, bh] = bloco;
  for (let y = by; y < Math.min(altura, by + bh); y++) {
    for (let x = bx; x < Math.min(largura, bx + bw); x++) {
      // Xadrez: cada 2 px muda de cor → gradiente alto → conta como "assunto".
      const q = (Math.floor(x / 2) + Math.floor(y / 2)) % 2;
      const i = y * largura + x;
      const v = q ? 10 : 250;
      dados[i * 4] = v; dados[i * 4 + 1] = v; dados[i * 4 + 2] = v; dados[i * 4 + 3] = 255;
    }
  }
  return dados;
}

console.log('\n[1] Mapa de detalhe: fundo liso dá ~0, o assunto dá alto');
{
  const l = 40, a = 40;
  const dados = imagemComPersonagem(l, a, [20, 10, 10, 10]);
  const mapa = enf.mapaDeDetalhe(dados, l, a);
  const canto = mapa[2 * l + 2];
  const dentro = mapa[15 * l + 25];
  check(canto < 1, `no fundo liso o detalhe é ~0 (${canto.toFixed(2)})`, String(canto));
  check(dentro > canto * 10, `no assunto o detalhe é muito maior (${dentro.toFixed(0)} vs ${canto.toFixed(2)})`, `${dentro} vs ${canto}`);
  check(mapa.length === l * a, 'o mapa tem um valor por pixel', String(mapa.length));
}

console.log('\n[2] Imagem já no formato do vídeo não é cortada');
{
  const r = enf.calcularRecorte({ largura: 1280, altura: 720, alvoW: 1280, alvoH: 720, dados: null });
  check(r.x === 0 && r.y === 0, 'mesmo formato: recorte zero', JSON.stringify(r));
}

console.log('\n[3] Assunto deslocado: o recorte segue-o');
{
  // Imagem quadrada (600×600) para vídeo 16:9 (1280×720): corta-se em altura,
  // por isso o que interessa é o deslocamento vertical.
  const l = 300, a = 300;
  // Personagem na parte de BAIXO (y=200..260).
  const dadosBaixo = imagemComPersonagem(l, a, [130, 200, 40, 60]);
  const rBaixo = enf.calcularRecorte({ largura: l, altura: a, alvoW: 1280, alvoH: 720, dados: dadosBaixo, modo: 'personagem' });
  const centradoY = (a - a * (720 / 1280) / (1280 / 1280)) / 2;
  // A janela visível tem 300*(720/1280) = 168.75 px de altura; com 300 px de
  // imagem, sobram ~131 px. Centrado seria ~65; o personagem em baixo, mais.
  check(rBaixo.y > 70, `com o personagem em baixo, o recorte desce (y=${rBaixo.y})`, `y=${rBaixo.y}`);
  check(rBaixo.y <= Math.round(300 - 300 * 720 / 1280), `e não sai da imagem (y=${rBaixo.y})`, `y=${rBaixo.y}`);

  // Personagem na parte de CIMA (y=10..70): o recorte tem de subir.
  const dadosCima = imagemComPersonagem(l, a, [130, 10, 40, 60]);
  const rCima = enf.calcularRecorte({ largura: l, altura: a, alvoW: 1280, alvoH: 720, dados: dadosCima, modo: 'personagem' });
  check(rCima.y < rBaixo.y, `com o personagem em cima, o recorte sobe (${rCima.y} < ${rBaixo.y})`, `${rCima.y} vs ${rBaixo.y}`);
  check(rCima.y >= 0, 'e nunca fica negativo', String(rCima.y));
}

console.log('\n[4] Assunto à direita: desloca na horizontal');
{
  // Vídeo vertical (720×1280) a partir de imagem horizontal (600×300):
  // corta-se em largura → o que conta é o deslocamento horizontal.
  const l = 300, a = 150;
  const direita = enf.calcularRecorte({ largura: l, altura: a, alvoW: 720, alvoH: 1280, dados: imagemComPersonagem(l, a, [200, 50, 60, 40]), modo: 'personagem' });
  const esquerda = enf.calcularRecorte({ largura: l, altura: a, alvoW: 720, alvoH: 1280, dados: imagemComPersonagem(l, a, [20, 50, 60, 40]), modo: 'personagem' });
  const maxX = Math.round(l - l * (720 / 1280) / (720 / 720) / (1280 / 720) * (1280 / 720));
  check(direita.x > esquerda.x, `o assunto à direita desloca o recorte para a direita (${direita.x} > ${esquerda.x})`, `${direita.x} vs ${esquerda.x}`);
  check(esquerda.x >= 0 && direita.x >= 0, 'nenhum recorte fica negativo', JSON.stringify({ esquerda, direita }));
}

console.log('\n[5] Modo "centro" é o recorte antigo, exatamente no meio');
{
  const l = 300, a = 200;
  // Assunto na parte de CIMA, longe do centro do recorte: é aí que a diferença
  // entre "cortar pelo meio" e "seguir o assunto" fica visível.
  const dados = imagemComPersonagem(l, a, [240, 8, 40, 40]);
  const centro = enf.calcularRecorte({ largura: l, altura: a, alvoW: 1280, alvoH: 720, dados, modo: 'centro' });
  check(Number.isFinite(centro.x) && Number.isFinite(centro.y), `o modo centro devolve um recorte válido (${JSON.stringify(centro)})`, JSON.stringify(centro));

  // O modo "personagem" tem de DAR OUTRA COISA que o centro, neste caso.
  const inteligente = enf.calcularRecorte({ largura: l, altura: a, alvoW: 1280, alvoH: 720, dados, modo: 'personagem' });
  const diferente = inteligente.x !== centro.x || inteligente.y !== centro.y;
  check(diferente, `com o assunto fora do centro, o resultado difere do centrado (${JSON.stringify(inteligente)} vs ${JSON.stringify(centro)})`, 'deu igual ao centro');
  check(inteligente.y < centro.y, `e sobe para o apanhar (${inteligente.y} < ${centro.y})`, `${inteligente.y} vs ${centro.y}`);
}

console.log('\n[6] Sem dados de pixels: cai no recorte centrado, sem rebentar');
{
  const r = enf.calcularRecorte({ largura: 300, altura: 200, alvoW: 1280, alvoH: 720, dados: null, modo: 'personagem' });
  check(Number.isFinite(r.x) && Number.isFinite(r.y), `sem dados, devolve um recorte válido (${JSON.stringify(r)})`, JSON.stringify(r));
  const r2 = enf.calcularRecorte({ largura: 300, altura: 200, alvoW: 1280, alvoH: 720, dados: new Uint8ClampedArray(4), modo: 'personagem' });
  check(Number.isFinite(r2.x) && Number.isFinite(r2.y), 'dados incompletos também não rebentam', JSON.stringify(r2));
  const r3 = enf.calcularRecorte({ largura: 0, altura: 0, alvoW: 1280, alvoH: 720, dados: null });
  check(r3.x === 0 && r3.y === 0, 'imagem sem tamanho devolve zero', JSON.stringify(r3));
  const r4 = enf.calcularRecorte({ largura: 300, altura: 200, alvoW: 0, alvoH: 0, dados: null });
  check(r4.x === 0 && r4.y === 0, 'alvo sem tamanho devolve zero', JSON.stringify(r4));
}

console.log('\n[7] O recorte nunca sai da imagem');
{
  // Vários formatos, com o assunto em todos os cantos.
  const casos = [
    [400, 300, 1920, 1080], [300, 400, 1920, 1080], [500, 500, 1080, 1920],
    [100, 900, 1280, 720], [900, 100, 720, 1280], [640, 480, 1080, 1080],
  ];
  const problemas = [];
  for (const [l, a, aw, ah] of casos) {
    for (const bloco of [[0, 0, 40, 40], [l - 40, 0, 40, 40], [0, a - 40, 40, 40], [l - 40, a - 40, 40, 40], [l / 2 - 20, a / 2 - 20, 40, 40]]) {
      const r = enf.calcularRecorte({ largura: l, altura: a, alvoW: aw, alvoH: ah, dados: imagemComPersonagem(l, a, bloco), modo: 'personagem' });
      const escala = Math.max(aw / l, ah / a);
      const sobraX = Math.max(0, Math.round(l - aw / escala));
      const sobraY = Math.max(0, Math.round(a - ah / escala));
      if (r.x < 0 || r.y < 0) problemas.push(`${l}x${a}→${aw}x${ah}: negativo ${JSON.stringify(r)}`);
      if (r.x > sobraX + 1) problemas.push(`${l}x${a}→${aw}x${ah}: x=${r.x} > sobra ${sobraX}`);
      if (r.y > sobraY + 1) problemas.push(`${l}x${a}→${aw}x${ah}: y=${r.y} > sobra ${sobraY}`);
    }
  }
  check(problemas.length === 0, `em ${casos.length * 5} combinações de formato e posição, o recorte fica sempre dentro`, problemas.slice(0, 4).join(' | '));
}

console.log('\n[8] NUNCA cortar a cabeça: personagem em pé numa imagem retrato');
{
  // Imagem 300×400 (retrato) com o personagem de corpo inteiro: cabeça no topo
  // (y=60), pés em baixo (y=380). Para um vídeo 16:9 a janela só tem ~169 px de
  // altura — o corpo NÃO cabe. Era aqui que o vídeo mostrava o tronco e cortava
  // a cabeça.
  const l = 300, a = 400;
  const dados = imagemComPersonagem(l, a, [120, 60, 60, 320]);
  const r = enf.calcularRecorte({ largura: l, altura: a, alvoW: 1920, alvoH: 1080, dados, modo: 'personagem' });
  const vh = Math.round(1080 / (1920 / l));
  const centradoY = Math.round((a - vh) / 2);

  check(r.y <= 60, `a janela começa ACIMA da cabeça (y=${r.y} ≤ 60)`, `y=${r.y} corta a cabeça`);
  check(r.y >= 0, `e nunca sai da imagem (y=${r.y})`, String(r.y));
  check(centradoY > 60, `(o recorte centrado, y=${centradoY}, cortava a cabeça — era o defeito)`, 'o caso não mostra o defeito');

  // A folga por cima da cabeça é a mesma em qualquer imagem (é o que dá
  // coordenação entre planos): ~9% da altura da janela.
  const folga = 60 - r.y;
  const esperada = enf.FOLGA_CABECA * vh;
  check(Math.abs(folga - esperada) <= 2, `folga de cabeça de ${folga} px (~${esperada.toFixed(1)} px, ${(enf.FOLGA_CABECA * 100).toFixed(0)}% da janela)`, `folga ${folga} vs ${esperada.toFixed(1)}`);
}

console.log('\n[9] Coordenação: em cenas diferentes, a cabeça fica à mesma altura');
{
  // O mesmo personagem em duas posições verticais diferentes: o enquadramento
  // tem de o pôr à MESMA altura relativa — senão a montagem "salta".
  const l = 300, a = 400;
  const alta = enf.calcularRecorte({ largura: l, altura: a, alvoW: 1920, alvoH: 1080, dados: imagemComPersonagem(l, a, [120, 60, 60, 320]), modo: 'personagem' });
  const baixa = enf.calcularRecorte({ largura: l, altura: a, alvoW: 1920, alvoH: 1080, dados: imagemComPersonagem(l, a, [120, 140, 60, 240]), modo: 'personagem' });
  const alturaAlta = 60 - alta.y;
  const alturaBaixa = 140 - baixa.y;
  check(Math.abs(alturaAlta - alturaBaixa) <= 2, `a cabeça fica à mesma altura nos dois planos (${alturaAlta} px e ${alturaBaixa} px do topo)`, `${alturaAlta} vs ${alturaBaixa}`);
}

console.log('\n[10] Assunto que cabe inteiro é centrado (não é colado ao topo)');
{
  const l = 300, a = 400;
  // Personagem pequeno no meio-baixo: cabe na janela com folga.
  const dados = imagemComPersonagem(l, a, [130, 200, 40, 90]);
  const r = enf.calcularRecorte({ largura: l, altura: a, alvoW: 1920, alvoH: 1080, dados, modo: 'personagem' });
  const vh = Math.round(1080 / (1920 / l));
  const centroAssunto = 200 + 90 / 2;
  const centroJanela = r.y + vh / 2;
  check(Math.abs(centroAssunto - centroJanela) <= 6, `o assunto fica centrado (centro ${centroAssunto} vs janela ${centroJanela.toFixed(1)})`, `centro ${centroAssunto} vs ${centroJanela.toFixed(1)}`);
}

console.log('\n[11] Barra preta que a imagem já traga é ignorada');
{
  const l = 200, a = 200;
  const dados = imagemComPersonagem(l, a, [80, 40, 40, 80]);
  // Barra preta em baixo, como apareceu num dos vídeos.
  for (let y = 150; y < a; y++) {
    for (let x = 0; x < l; x++) {
      const i = (y * l + x) * 4;
      dados[i] = 0; dados[i + 1] = 0; dados[i + 2] = 0; dados[i + 3] = 255;
    }
  }
  const caixa = enf.caixaUtil(dados, l, a);
  check(caixa.y1 <= 152 && caixa.y1 >= 148, `a barra preta de baixo é cortada (zona útil termina em y=${caixa.y1})`, `y1=${caixa.y1}`);
  check(caixa.x0 === 0 && caixa.x1 === l, 'sem barras laterais, a largura fica toda', JSON.stringify(caixa));
  // A imagem inteira colorida não perde nada.
  const inteira = enf.caixaUtil(imagemComPersonagem(l, a, [80, 40, 40, 80]), l, a);
  check(inteira.x0 === 0 && inteira.y0 === 0 && inteira.x1 === l && inteira.y1 === a, 'imagem sem barras fica inteira', JSON.stringify(inteira));
  // Uma cena escura (noite) NÃO é uma barra preta.
  const noite = new Uint8ClampedArray(l * a * 4).fill(40);
  const cNoite = enf.caixaUtil(noite, l, a);
  check(cNoite.y1 === a, 'cena escura não é confundida com barra preta', JSON.stringify(cNoite));
}

console.log(falhas.length ? `\n=== ${falhas.length} FALHA(S) ===` : '\n=== ENQUADRAMENTO OK ===');
process.exit(falhas.length ? 1 : 0);
