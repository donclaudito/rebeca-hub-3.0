// ============================================================
//  Auditoria de enquadramento das cenas
//
//  A "🎥 Análise do Diretor" olhava para a miniatura e para as imagens, mas o
//  enquadramento era só uma opinião do modelo. Aqui mede-se: para cada imagem
//  calcula-se a CAIXA do personagem e a JANELA que o vídeo mostra (as mesmas
//  contas do motor, em enquadramento.mjs) e diz-se, em números:
//
//    - quanto da cabeça ficou fora;           (perda de cima)
//    - quanto da parte de baixo ficou fora;   (perda de baixo)
//    - se a imagem já vem cortada na cabeça;  (falha da imagem, não do recorte)
//    - quanto o personagem está descentrado;
//    - se não há personagem identificável.
//
//  Isto é o que permite ao Diretor CONDICIONAR a IA: cada falta vira uma
//  exigência concreta no prompt refinado ("corpo inteiro dentro do quadro 16:9,
//  cabeça com folga acima, pés visíveis") em vez de um "enquadramento fraco".
//
//  `avaliarEnquadramento` é puro (recebe pixels) — testável sem browser.
//  `auditarCenas` carrega as imagens e aplica-o a cada uma.
// ============================================================
import { caixaDoAssunto, caixaUtil, calcularRecorte, janelaVisivel } from './enquadramento.mjs';

// A partir de que percentagem do quadro se considera que "saiu da cena".
const PERDA_GRAVE = 2; // % da janela: cabeça cortada
const PERDA_BAIXO = 5; // % da janela: parte de baixo cortada
const DESCENTRADO = 0.15; // desvio do centro (fração da largura da janela)
const BORDA = 0.02; // a caixa toca a borda da imagem (2% do lado)

const pct = (v) => Math.round(v * 100);

// O diagnóstico de UMA imagem, em números.
//
// `dados` = pixels RGBA da imagem, `largura`×`altura` (qualquer tamanho; a
// análise corre numa cópia pequena, como no motor).
//
// `modoImagem` tem de ser o mesmo que o vídeo vai usar, senão a auditoria
// acusa um corte que o vídeo não faz:
//   'inteira'   → a imagem aparece toda, com barras desfocadas; não há recorte,
//                 portanto não se pode falar em "corta a cabeça";
//   'preencher' → o motor corta para encher o quadro 16:9; aí sim mede-se a perda.
export function avaliarEnquadramento({ dados, largura, altura, alvoW, alvoH, modo = 'personagem', modoImagem = 'inteira' }) {
  const vazio = {
    temAssunto: false,
    dentroDoQuadro: false,
    perdaTopo: 0,
    perdaBaixo: 0,
    perdaEsq: 0,
    perdaDir: 0,
    tocaTopo: false,
    tocaBaixo: false,
    desvioCentro: 0,
    margemTopo: 0,
    gravidade: 'ok',
    avisos: [],
  };
  if (!(largura > 0) || !(altura > 0) || !dados || dados.length < largura * altura * 4) {
    return { ...vazio, avisos: ['imagem sem dados para analisar'] };
  }

  const util = caixaUtil(dados, largura, altura);
  const usaUtil = util.x0 > 0 || util.y0 > 0 || util.x1 < largura || util.y1 < altura;
  const area = usaUtil ? util : null;
  const caixa = caixaDoAssunto(dados, largura, altura, area);
  if (!caixa) {
    return { ...vazio, avisos: ['não consegui identificar o personagem nesta imagem'] };
  }

  const { vw, vh } = janelaVisivel(largura, altura, alvoW, alvoH);
  const preenche = modoImagem === 'preencher';
  // Em "inteira" a janela é a imagem toda: nada é cortado pelo vídeo.
  const recorte = preenche ? calcularRecorte({ largura, altura, alvoW, alvoH, dados, modo, area }) : { x: 0, y: 0 };
  const janelaW = preenche ? vw : largura;
  const janelaH = preenche ? vh : altura;

  // Quanto do personagem fica FORA da janela do vídeo (em % da janela).
  const perdaTopo = janelaH > 0 ? Math.max(0, recorte.y - caixa.y0) / janelaH : 0;
  const perdaBaixo = janelaH > 0 ? Math.max(0, caixa.y1 - (recorte.y + janelaH)) / janelaH : 0;
  const perdaEsq = janelaW > 0 ? Math.max(0, recorte.x - caixa.x0) / janelaW : 0;
  const perdaDir = janelaW > 0 ? Math.max(0, caixa.x1 - (recorte.x + janelaW)) / janelaW : 0;

  // A imagem em si já vem cortada? (a caixa do personagem encosta à borda)
  //   `toca*`   = muito perto da borda (enquadramento apertado);
  //   `noLimite*` = literalmente na borda (a imagem está cortada ali).
  const margemBorda = Math.max(1, Math.round(Math.min(largura, altura) * BORDA));
  const tocaTopo = caixa.y0 <= margemBorda;
  const tocaBaixo = caixa.y1 >= altura - margemBorda;
  const noLimiteTopo = caixa.y0 <= 1;
  const noLimiteBaixo = caixa.y1 >= altura - 1;

  // Descentrado: distância do centro do personagem ao centro da janela.
  const centroPessoa = (caixa.x0 + caixa.x1) / 2;
  const centroJanela = recorte.x + janelaW / 2;
  const desvioCentro = janelaW > 0 ? Math.abs(centroPessoa - centroJanela) / janelaW : 0;

  // Folga acima da cabeça (fração da janela). 0 = encostada ao topo.
  const margemTopo = janelaH > 0 ? Math.max(0, caixa.y0 - recorte.y) / janelaH : 0;

  const avisos = [];
  let gravidade = 'ok';
  const piorar = (nivel) => {
    const rank = { ok: 0, media: 1, grave: 2 };
    if (rank[nivel] > rank[gravidade]) gravidade = nivel;
  };

  if (perdaTopo * 100 >= PERDA_GRAVE) {
    avisos.push(`o recorte corta a cabeça (${pct(perdaTopo)}% do quadro)`);
    piorar('grave');
  } else if (noLimiteTopo) {
    // A cabeça está na primeira linha da imagem: a imagem já vem cortada, e
    // nenhum recorte a recupera — só gerar de novo.
    avisos.push('a imagem já vem cortada na cabeça (a cabeça sai pela borda de cima)');
    piorar('grave');
  } else if (tocaTopo) {
    avisos.push('a cabeça está encostada à borda de cima da imagem');
    piorar('media');
  }
  if (perdaBaixo * 100 >= PERDA_BAIXO) {
    avisos.push(`a parte de baixo fica fora do quadro (${pct(Math.min(1, perdaBaixo))}%)`);
    piorar('media');
  } else if (noLimiteBaixo) {
    avisos.push('a imagem já vem cortada em baixo (os pés saem pela borda)');
    piorar('media');
  } else if (tocaBaixo) {
    avisos.push('os pés encostam à borda de baixo da imagem');
    piorar('media');
  }
  if (desvioCentro >= DESCENTRADO) {
    avisos.push(`o personagem está descentrado (${pct(desvioCentro)}% para o lado)`);
    piorar('media');
  }
  if (perdaEsq > 0.05 || perdaDir > 0.05) {
    avisos.push(`o recorte corta o personagem de lado (${pct(Math.max(perdaEsq, perdaDir))}%)`);
    piorar('media');
  }

  return {
    temAssunto: true,
    dentroDoQuadro: perdaTopo * 100 < PERDA_GRAVE && perdaBaixo * 100 < PERDA_BAIXO,
    perdaTopo: pct(perdaTopo),
    perdaBaixo: pct(perdaBaixo),
    perdaEsq: pct(perdaEsq),
    perdaDir: pct(perdaDir),
    tocaTopo,
    tocaBaixo,
    desvioCentro: pct(desvioCentro),
    margemTopo: pct(margemTopo),
    gravidade,
    avisos,
  };
}

// ---- carregar as imagens e avaliar todas as cenas ----

function carregarImagem(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('não consegui ler uma das imagens'));
    };
    img.src = url;
  });
}

// Pixels de uma cópia pequena (o mesmo truque do motor: o sítio do personagem
// vê-se igual em miniatura e é muito mais rápido).
function pixelsDaImagem(img, maxLado = 192) {
  const mw = img.naturalWidth || img.width || 0;
  const mh = img.naturalHeight || img.height || 0;
  if (!mw || !mh) throw new Error('imagem sem tamanho');
  const escala = Math.min(1, maxLado / Math.max(mw, mh));
  const l = Math.max(1, Math.round(mw * escala));
  const a = Math.max(1, Math.round(mh * escala));
  const c = document.createElement('canvas');
  c.width = l;
  c.height = a;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) throw new Error('sem canvas');
  g.drawImage(img, 0, 0, l, a);
  return { dados: g.getImageData(0, 0, l, a).data, largura: l, altura: a };
}

// Avalia todas as cenas (no máximo `limite`) e resume.
export async function auditarCenas(imagens, alvoW, alvoH, { modo = 'personagem', modoImagem = 'inteira', limite = 12 } = {}) {
  const cenas = [];
  for (const img of (imagens || []).slice(0, limite)) {
    const nome = img.name || 'imagem';
    try {
      const el = await carregarImagem(img.file || img);
      const { dados, largura, altura } = pixelsDaImagem(el);
      const d = avaliarEnquadramento({ dados, largura, altura, alvoW, alvoH, modo, modoImagem });
      cenas.push({ nome, ...d });
    } catch (e) {
      cenas.push({
        nome,
        temAssunto: false,
        gravidade: 'media',
        avisos: [`não consegui analisar esta imagem (${e.message})`],
      });
    }
  }
  return { cenas, modoImagem, ...resumir(cenas) };
}

// O resumo: o que há a corrigir e o que dizer ao Diretor.
export function resumir(cenas) {
  const lista = Array.isArray(cenas) ? cenas : [];
  const graves = lista.filter((c) => c.gravidade === 'grave');
  const medias = lista.filter((c) => c.gravidade === 'media');
  const cabecaCortada = lista.filter((c) =>
    (c.avisos || []).some((a) => /corta a cabeça|cortada na cabeça|borda de cima/i.test(a)),
  );
  const pesFora = lista.filter((c) =>
    (c.avisos || []).some((a) => /parte de baixo|borda de baixo|cortada em baixo|pés saem|pés encostam/i.test(a)),
  );
  const descentradas = lista.filter((c) => (c.desvioCentro || 0) >= pct(DESCENTRADO));
  const semAssunto = lista.filter((c) => !c.temAssunto);

  const faltas = [];
  if (cabecaCortada.length) faltas.push(`${cabecaCortada.length} cena(s) com a cabeça cortada ou no limite de cima`);
  if (pesFora.length) faltas.push(`${pesFora.length} cena(s) em que o personagem não cabe todo (pés/parte de baixo fora)`);
  if (descentradas.length) faltas.push(`${descentradas.length} cena(s) com o personagem fora do centro`);
  if (semAssunto.length) faltas.push(`${semAssunto.length} cena(s) sem personagem identificável`);

  const total = lista.length;
  const boas = total - new Set([...graves, ...medias].map((c) => c.nome)).size;
  const veredicto = !total
    ? 'sem cenas para analisar'
    : faltas.length
      ? `${boas} de ${total} cenas com o enquadramento em ordem`
      : `todas as ${total} cenas com o personagem inteiro e centrado`;

  return {
    total,
    graves: graves.length,
    medias: medias.length,
    cabecaCortada: cabecaCortada.map((c) => c.nome),
    pesFora: pesFora.map((c) => c.nome),
    descentradas: descentradas.map((c) => c.nome),
    semAssunto: semAssunto.map((c) => c.nome),
    faltas,
    veredicto,
    // Exigências que o prompt refinado tem de incluir (é isto que "condiciona a IA").
    exigencias: faltas.length
      ? [
          'corpo inteiro dentro do quadro 16:9, com folga acima da cabeça',
          'cabeça, mãos e pés todos visíveis, nenhum membro cortado',
          'personagem centrado no quadro, a ocupar sensivelmente metade da altura',
        ]
      : [],
  };
}

// O parágrafo em inglês que se junta ao prompt refinado quando há faltas. Se o
// prompt do modelo já falar disto, não se repete.
export function clausulaDeEnquadramento(exigencias) {
  const lista = Array.isArray(exigencias) && exigencias.length;
  if (!lista) return '';
  return (
    'Framing requirements: keep the whole character inside the 16:9 frame — head, hands and feet fully visible, ' +
    'comfortable headroom above the head, subject centred and occupying roughly half of the frame height; ' +
    'no cropped limbs, no extreme close-ups, generous safe margins on every side.'
  );
}
