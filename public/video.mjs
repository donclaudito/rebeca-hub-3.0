// ============================================================
//  Geração do vídeo no proprio browser
//
//  Não há ffmpeg na nuvem, por isso o vídeo é montado aqui: o browser desenha
//  as imagens num canvas com as transições, toca a narração de cada cena e
//  grava tudo em tempo real com MediaRecorder.
//
//  Em troca de não precisar de servidor nenhum, sai em WebM (VP9/VP8 + Opus),
//  que o Chrome, o Edge, o Firefox, o YouTube e o VLC leem. Para MP4, use a
//  versão local, que tem ffmpeg.
//
//  CONSEQUÊNCIA HONESTA: gravar em tempo real demora o tempo do vídeo. Um vídeo
//  de 2 minutos leva 2 minutos a gravar.
// ============================================================

import { blocoAtivo, legendasDasCenas, legendasParaSrt, ressincronizarPelaVoz } from './legendas-core.mjs';
import { erroNosTempos } from './legendas-tempos.mjs';
import { calcularRecorte, caixaUtil, janelaVisivel } from './enquadramento.mjs';
import { criarGestorAgua } from './efeito-agua.mjs';
import { escalarCues } from './srt.mjs';

// Versão do motor. Aparece no resumo da página: serve para saber, sem dúvidas,
// qual build está a correr no browser (um build antigo em cache foi uma das
// causas de "não funcionou" que já apanhei).
export const VERSAO_VIDEO = '3.9.10';

// Duração do FECHO: nos últimos segundos do vídeo (quando há trilha), a música
// esmaece até ao silêncio e a imagem apaga suavemente para preto.
export const FECHO_SEGUNDOS = 3;

export const FORMATOS = [
  { id: '1920x1080', rotulo: 'Horizontal 1920×1080 (YouTube)', w: 1920, h: 1080 },
  { id: '1280x720', rotulo: 'Horizontal 1280×720 (leve)', w: 1280, h: 720 },
  { id: '1080x1920', rotulo: 'Vertical 1080×1920 (Shorts/Reels)', w: 1080, h: 1920 },
  { id: '720x1280', rotulo: 'Vertical 720×1280 (leve)', w: 720, h: 1280 },
  { id: '1080x1080', rotulo: 'Quadrado 1080×1080 (Instagram)', w: 1080, h: 1080 },
];

export const TRANSICOES = [
  { id: 'fade', rotulo: 'Fade Suave', nota: 'escurece e clareia entre imagens' },
  { id: 'corte', rotulo: 'Corte Seco', nota: 'passa sem efeito' },
  { id: 'slideleft', rotulo: 'Deslizar Lateral', nota: 'a imagem nova entra pela direita' },
  { id: 'zoom', rotulo: 'Zoom', nota: 'aproxima-se antes de trocar' },
  { id: 'desfoque', rotulo: 'Desfocar', nota: 'desfoca antes de trocar' },
];

export const DURACOES = [
  { id: 0.4, rotulo: 'Rápida (0,4s)' },
  { id: 0.6, rotulo: 'Normal (0,6s)' },
  { id: 0.9, rotulo: 'Suave (0,9s)' },
  { id: 1.4, rotulo: 'Lenta (1,4s)' },
];

// Quanto tempo cada imagem fica no ecrã quando a cena não tem narração.
// É o que dá o ritmo do modo "só música" (sem voz nenhuma).
export const DURACOES_CENA = [
  { id: 2, rotulo: 'Rápido (2s)' },
  { id: 3.5, rotulo: 'Normal (3,5s)' },
  { id: 5, rotulo: 'Calmo (5s)' },
  { id: 8, rotulo: 'Lento (8s)' },
];

export const DURACAO_SEM_VOZ = 3.5;

// Modos de duração:
//  - 'natural': o vídeo dura o que durar a narração das cenas;
//  - 'trilha':  as cenas REPETEM em ciclo até a música acabar. É o que resolve
//    o caso de um vídeo curto (poucas imagens) com uma música longa: em vez de
//    a música ser cortada a meio, as imagens voltam a passar.
export const MODOS_DURACAO = [
  { id: 'natural', rotulo: 'As imagens' },
  { id: 'trilha', rotulo: 'Até acabar a música' },
];

// Orientação do encerramento: COMO o vídeo acaba. Com orientação escolhida e
// uma imagem final designada, essa imagem é TIRADA do ciclo (não repete) e
// aparece no FIM, parada, como epílogo — cada opção dá-lhe um movimento:
//  - 'natureza': aproximação lenta (a luz instala-se na imagem de fecho);
//  - 'narrativa': a câmara sobe e revela a imagem final parada;
//  - 'clipe': a imagem fica quieta e apaga suavemente para preto com o fim
//    da música (ou do vídeo).
export const ORIENTACOES = [
  { id: '', rotulo: 'Sem orientação', nota: 'a montagem acaba como sempre' },
  { id: 'natureza', rotulo: '🌿 Natureza / Cinematográfico', nota: 'termina numa imagem de fecho parada, em epílogo, com aproximação lenta' },
  { id: 'narrativa', rotulo: '🧒 Narrativa / Personagem', nota: 'a câmara sobe e revela a imagem final parada, como epílogo da história' },
  { id: 'clipe', rotulo: '🎵 Clipe Musical / Minimalista', nota: 'termina numa imagem só e apaga suavemente para preto com o fim da música' },
];

// Limite de segurança: 100 passagens. Sem isto, uma música de 3 horas com
// imagens de 1 s gerava milhares de cenas e enchia a memória.
const MAX_PASSAGENS = 100;

//  Silêncio usado numa cena sem narração, quando as outras têm voz. Curto de
//  propósito: numa montagem narrada, uma cena sem fala não deve arrastar-se.
const SILENCIO_CURTO = 2;

// Porque é que o ciclo NÃO foi aplicado. Dizer isto é o que transforma um
// "não funcionou" numa causa concreta.
function explicarSemCiclo(modoDuracao, alvo, natural) {
  if (modoDuracao !== 'trilha') return 'o modo de duração escolhido foi "As imagens"';
  if (!(alvo > 0)) return 'não consegui saber a duração da música';
  if (!(alvo > natural)) return `a música (${alvo.toFixed(1)}s) não é mais longa do que o vídeo (${natural.toFixed(1)}s)`;
  return '';
}

// Uma cena sem narração fica com o tempo escolhido, em vez da duração do
// silêncio que lá foi posto, para não arrastar a montagem.
// Cena de vídeo: a duração é a DO PRÓPRIO FICHEIRO (duracaoVideo), não a do
// silêncio nem a do clipe de narração — ela manda no ritmo da montagem.
function duracoesDasCenas(marcaSemFala, clipes, T, duracaoCena, cenas = []) {
  const fixa = Math.max(2 * T + 0.2, Number(duracaoCena) || DURACAO_SEM_VOZ);
  return clipes.map((c, i) => {
    const doVideo = duracaoDaCenaDeVideo(cenas[i]);
    if (doVideo > 0) return Math.max(2 * T + 0.2, doVideo);
    return marcaSemFala[i] ? fixa : Math.max(2 * T + 0.2, c.duration);
  });
}

// Duração de uma cena de vídeo depois do CORTE escolhido (início/fim);
// sem corte válido, é a duração inteira do ficheiro.
function duracaoDaCenaDeVideo(c) {
  const total = Number(c?.duracaoVideo);
  if (!(Number.isFinite(total) && total > 0)) return 0;
  const ini = Number(c?.videoInicio);
  const fim = Number(c?.videoFim);
  if (Number.isFinite(ini) && Number.isFinite(fim) && fim > ini) {
    return Math.max(0.2, Math.min(fim, total) - Math.max(0, ini));
  }
  return total;
}

// Repete a lista de cenas até chegar à duração pedida.
//
// Devolve os itens já com `_passagem` e `_texto` (o texto da cena original), que
// é o que o desenho usa para saber qual passagem está no ecrã. A repetição é
// INTEIRA: conta-se o número de passagens que cobre a música, ARREDONDANDO PARA
// CIMA. O vídeo acaba sempre no fim da última cena — nunca é cortado pela
// música: a trilha, que toca em ciclo, é parada exatamente nesse instante.
function repetirAte(itens, duracoes, alvo, maxPassagens = MAX_PASSAGENS) {
  const natural = duracoes.reduce((a, d) => a + d, 0);
  if (!itens.length || !natural || !(alvo > natural)) return { itens: [], duracoes: [], passagens: 1 };
  const n = Math.min(maxPassagens, Math.max(2, Math.ceil(alvo / natural)));
  const todos = [];
  const todasDur = [];
  for (let p = 0; p < n; p++) {
    itens.forEach((item, i) => {
      todos.push({ ...item, _passagem: p, _texto: item.texto || '' });
      todasDur.push(duracoes[i]);
    });
  }
  return { itens: todos, duracoes: todasDur, passagens: n };
}

// Formatos de gravação, por ordem de COMPATIBILIDADE (não por qualidade).
//
// PORQUE O VP8 VEM PRIMEIRO: o VP9 no WebM é mal suportado fora dos browsers.
// O Windows recusa esses ficheiros com o erro 0xC00D36C4 ("não é possível abrir
// ... suporte ao tipo de arquivo"), que foi exatamente o que aconteceu. O VP8 é
// lido pelo Windows, pelos browsers, pelo VLC, pelo DaVinci e pelo YouTube — e
// o Rebeca Hub 2.0 também punha o VP8 primeiro por este motivo.
//
// O VP9 fica disponível como escolha, para quem precisar de ficheiros mais
// pequenos e só for usar o vídeo em browsers ou no YouTube.
export const CODECS = [
  {
    id: 'vp8',
    rotulo: '⬛ Compatível (VP8)',
    nota: 'abre no Windows, VLC, YouTube e browsers — é o mais seguro',
    ordem: ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp8', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp9', 'video/webm'],
  },
  {
    id: 'vp9',
    rotulo: '🟪 Mais pequeno (VP9)',
    nota: 'ficheiro menor, mas o Windows pode recusar abri-lo; use em browsers ou no YouTube',
    ordem: ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp8', 'video/webm'],
  },
];

export const CODEC_PREDEFINIDO = 'vp8';

// Escolhe o melhor formato de gravação que o browser aceita, começando pela
// ordem de compatibilidade. Sempre pelo MENOS um caminho: o `video/webm` puro
// fica no fim de todas as listas.
export function escolherMime(preferencia = CODEC_PREDEFINIDO) {
  const escolhido = CODECS.find((c) => c.id === preferencia) || CODECS[0];
  for (const c of escolhido.ordem) {
    try {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      /* continua */
    }
  }
  return '';
}

export function suporta() {
  try {
    return Boolean(
      window.MediaRecorder &&
        window.AudioContext &&
        typeof document.createElement('canvas').captureStream === 'function' &&
        typeof document.createElement('canvas').getContext === 'function',
    );
  } catch {
    return false;
  }
}

const carregarImagem = (url) =>
  new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('não consegui ler uma das imagens'));
    i.src = url;
  });

// Cena de VÍDEO: carrega o ficheiro como <video>; cada fotograma é desenhado
// durante a gravação e o som entra pela ligação ao destino do gravador.
const carregarVideo = (url) =>
  new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.preload = 'auto';
    v.playsInline = true;
    v.onloadeddata = () => resolve(v);
    v.onerror = () => reject(new Error('não consegui ler um dos vídeos da montagem'));
    v.src = url;
  });

// O enquadramento de cada imagem fica aqui, indexado pela própria imagem
// (WeakMap: não segura memória depois de a imagem sair).
//
// Guarda duas coisas:
//   fonte       → que zona da imagem usar (tira barras pretas que a imagem já
//                 traga); `null` = a imagem inteira;
//   deslocamento → onde começa a janela visível, em pixels da `fonte`.
//
// O DESENHO lê isto sozinho. Antes, só o fotograma "parado" recebia o recorte e
// as transições desenhavam centrado — a imagem saltava e via-se a mesma imagem
// duas vezes com enquadramentos diferentes (o "fantasma" no vídeo).
const enquadramentos = new WeakMap();

function enquadramentoDe(img) {
  return img ? enquadramentos.get(img) || null : null;
}

// Analisa uma imagem e guarda o recorte que mantém o assunto no meio.
//
// A análise é feita numa cópia PEQUENA (no máximo 160 px): o mapa de detalhe
// custa o mesmo por pixel e ler a imagem original inteira num telemóvel seria
// lento sem ganhar nada — o sítio do personagem vê-se igual em miniatura.
function analisarEnquadramento(img, alvoW, alvoH, modo) {
  if (modo !== 'personagem') return null;
  try {
    const mw = img.naturalWidth || img.videoWidth || 0;
    const mh = img.naturalHeight || img.videoHeight || 0;
    if (!mw || !mh) return null;
    const maxLado = 160;
    const escala = Math.min(1, maxLado / Math.max(mw, mh));
    const l = Math.max(1, Math.round(mw * escala));
    const a = Math.max(1, Math.round(mh * escala));
    const c = document.createElement('canvas');
    c.width = l;
    c.height = a;
    const g = c.getContext('2d', { willReadFrequently: true });
    if (!g) return null;
    g.drawImage(img, 0, 0, l, a);
    const dados = g.getImageData(0, 0, l, a).data;

    // 1) A zona ÚTIL: imagens geradas trazem por vezes uma barra preta (em
    //    baixo, tipicamente). Sem isto o vídeo mostrava a barra preta.
    const util = caixaUtil(dados, l, a);
    const usaUtil = util.x0 > 0 || util.y0 > 0 || util.x1 < l || util.y1 < a;
    const area = usaUtil ? util : null;

    // 2) O RECORTE dentro dessa zona.
    const ajuste = calcularRecorte({ largura: l, altura: a, alvoW, alvoH, dados, modo, area });

    // 3) Converter para pixels da imagem original. O que o desenho precisa é o
    //    deslocamento RELATIVO AO CENTRO: a imagem é desenhada centrada e é a
    //    partir daí que se anda para o lado. Com o valor absoluto (o que estava)
    //    o recorte andava o dobro do devido e caía fora do assunto — daí ora
    //    aparecer a perna, ora a cabeça.
    const fator = 1 / escala;
    const { vw, vh, sobraX, sobraY } = janelaVisivel(l, a, alvoW, alvoH);
    const sx = util.x0 * fator;
    const sy = util.y0 * fator;
    const sw = (util.x1 - util.x0) * fator;
    const sh = (util.y1 - util.y0) * fator;
    const relX = ajuste.x * fator - sx - Math.max(0, sw - vw * fator) / 2;
    const relY = ajuste.y * fator - sy - Math.max(0, sh - vh * fator) / 2;

    const final = {
      sx,
      sy,
      sw,
      sh,
      relX,
      relY,
      // `fonte` só quando há mesmo uma zona a excluir (barra preta).
      fonte: usaUtil ? { x: Math.round(sx), y: Math.round(sy), w: Math.max(1, Math.round(sw)), h: Math.max(1, Math.round(sh)) } : null,
    };
    enquadramentos.set(img, final);
    return final;
  } catch {
    return null; // imagem protegida por CORS ou canvas bloqueado: recorte centrado
  }
}

// Desenha a imagem (ou o fotograma atual do vídeo) a cobrir o canvas inteiro
// (recorta o que sobra), sem deformar.
//
// O enquadramento (recorte inteligente e zona útil) vem dos `enquadramentos`,
// portanto aplica-se a TODOS os desenhos — imagem parada, transições e epílogo.
// `escala`, `deslocamentoX` e `deslocamentoY` são os movimentos das transições
// (zoom e deslizar) e do epílogo, somados por cima do enquadramento.
function desenharCobrindo(ctx, img, w, h, escala = 1, deslocamentoX = 0, deslocamentoY = 0) {
  const e = enquadramentoDe(img);
  const completa = img.naturalWidth || img.videoWidth || 1;
  const completaH = img.naturalHeight || img.videoHeight || 1;
  const fonte = e && e.fonte ? e.fonte : null;
  const fonteW = e ? e.sw : completa;
  const fonteH = e ? e.sh : completaH;

  const proporcao = Math.max(w / fonteW, h / fonteH) * escala;
  const dw = fonteW * proporcao;
  const dh = fonteH * proporcao;
  // A deslocação anda COM o zoom (usa a mesma proporção), senão o assunto fugia
  // do sítio ao aproximar.
  const ax = e ? -e.relX * proporcao : 0;
  const ay = e ? -e.relY * proporcao : 0;
  const x = (w - dw) / 2 + deslocamentoX + ax;
  const y = (h - dh) / 2 + deslocamentoY + ay;
  if (fonte) ctx.drawImage(img, fonte.x, fonte.y, fonte.w, fonte.h, x, y, dw, dh);
  else ctx.drawImage(img, x, y, dw, dh);
}

// Desenha o EPILOGO: a imagem final, parada no essencial, com o movimento
// da orientação escolhida. p vai de 0 (começo do epílogo) a 1 (fim).
function desenharEpilogo(ctx, w, h, de, img, tLocal, dur, orientacao, T) {
  const p = dur > 0 ? Math.min(1, Math.max(0, tLocal / dur)) : 1;
  ctx.save();
  // ENTRADA: a imagem final chega a esbater da anterior (nos primeiros T s).
  if (de && T > 0 && tLocal < T) {
    desenharCobrindo(ctx, de, w, h);
    ctx.globalAlpha = Math.min(1, Math.max(0, tLocal / T));
  } else {
    ctx.globalAlpha = 1;
  }
  if (orientacao === 'natureza') {
    // Aproximação lenta: a imagem de fecho instala-se (push-in suave).
    desenharCobrindo(ctx, img, w, h, 1 + 0.1 * p);
  } else if (orientacao === 'narrativa') {
    // A câmara sobe e assenta na imagem final parada (plano-herói).
    const escala = Math.max(1.04, 1.28 - 0.24 * p);
    const deslocamentoY = h * 0.1 * (1 - p);
    desenharCobrindo(ctx, img, w, h, escala, 0, deslocamentoY);
  } else if (orientacao === 'clipe') {
    // Imagem única, quieta; apaga para preto nos últimos 1,5s.
    desenharCobrindo(ctx, img, w, h);
    const restante = dur - tLocal;
    if (restante < 1.5) {
      ctx.fillStyle = `rgba(0,0,0,${(1 - Math.max(0, restante) / 1.5).toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);
    }
  } else {
    desenharCobrindo(ctx, img, w, h);
  }
  ctx.restore();
}

// Desenha um instante da passagem entre a imagem `de` e a imagem `para`.
// t vai de 0 (só a anterior) a 1 (só a seguinte).
function desenharTransicao(ctx, w, h, de, para, t, tipo) {
  ctx.save();
  switch (tipo) {
    case 'corte':
      desenharCobrindo(ctx, t < 0.5 ? de : para, w, h);
      break;

    case 'slideleft':
      desenharCobrindo(ctx, de, w, h, 1, -w * t);
      desenharCobrindo(ctx, para, w, h, 1, w * (1 - t));
      break;

    case 'zoom':
      desenharCobrindo(ctx, de, w, h, 1 + 0.12 * t);
      ctx.globalAlpha = t;
      desenharCobrindo(ctx, para, w, h, 1.12 - 0.12 * t);
      break;

    case 'desfoque':
      // Desfoca a imagem que está a sair e vai abrindo a que entra. Se o browser
      // não souber desfocar, fica a passagem suave — nunca falha.
      if ('filter' in ctx) {
        ctx.filter = `blur(${(t * 10).toFixed(1)}px)`;
        desenharCobrindo(ctx, de, w, h);
        ctx.filter = 'none';
        ctx.globalAlpha = t;
      } else {
        ctx.globalAlpha = 1;
      }
      desenharCobrindo(ctx, para, w, h);
      break;

    case 'fade':
    default:
      desenharCobrindo(ctx, de, w, h);
      ctx.globalAlpha = t;
      desenharCobrindo(ctx, para, w, h);
      break;
  }
  ctx.restore();
}

// Prepara a função que desenha o vídeo num instante do tempo.
//
// Regra: com N cenas há N-1 passagens. A passagem k ocupa os últimos T segundos
// da cena k e os primeiros T segundos da cena k+1 — ou seja, é UMA passagem de
// 2T segundos, desenhada ao meio por cada uma das duas cenas. Assim o valor de
// `t` liga sem salto no meio (0,5 no fim de uma = 0,5 no início da outra).
//
// A legenda é desenhada por cima, já depois de a imagem estar no sítio. Liga-se
// e desliga-se por instante (nada de guardar estado), para que um bloco que
// atravesse uma transição continue a aparecer.
function criarDesenhador({ ctx, w, h, imagens, inicios, duracoes, T, transicao, legendas = [], desenharLegenda = null, epilogoEm = -1, orientacaoEpilogo = '', fechoEm = -1, aguaGestor = null }) {
  const corte = transicao === 'corte';
  const n = imagens.length;
  const querLegenda = Boolean(desenharLegenda && legendas.length);

  // O que desenhar para a cena `indice` no instante `tempo`: a imagem original,
  // ou o canvas com a água já ondulada. O efeito é atualizado AQUI, um instante
  // antes de ser desenhado — se fosse atualizado para todas as cenas, seriam 25
  // desenhos por fotograma.
  const quadro = (indice, tempo) => {
    const original = imagens[indice];
    if (!aguaGestor || !original) return original;
    const efeito = aguaGestor.pedir(indice, original);
    if (!efeito) return original;
    efeito.atualizar(tempo);
    return efeito.canvas;
  };

  // FECHO: com trilha sonora, a imagem apaga suavemente para preto nos últimos
  // segundos do vídeo, ao mesmo tempo que a música esmaece — nenhum dos dois é
  // cortado a seco.
  const aplicarFecho = (agora) => {
    if (fechoEm <= 0 || agora <= fechoEm) return;
    const a = Math.min(1, Math.max(0, (agora - fechoEm) / FECHO_SEGUNDOS));
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgba(0,0,0,${a.toFixed(3)})`;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  };

  return (k, agora) => {
    const inicio = inicios[k];
    const dur = duracoes[k];
    const tLocal = agora - inicio;

    // EPILOGO: a imagem final, com o movimento da orientação — não passa
    // pelas passagens de transição nem repete nada.
    if (k === epilogoEm && orientacaoEpilogo) {
      desenharEpilogo(ctx, w, h, k > 0 ? quadro(k - 1, agora) : null, quadro(k, agora), tLocal, dur, orientacaoEpilogo, T);
      if (querLegenda) {
        const bloco = blocoAtivo(legendas, agora);
        if (bloco) desenharLegenda(ctx, bloco.texto, w, h);
      }
      aplicarFecho(agora);
      return;
    }

    // Passagem de ENTRADA (ainda a acabar a da cena anterior).
    if (k > 0 && !corte && tLocal < T) {
      const t = 0.5 + (Math.max(0, tLocal) / T) * 0.5;
      desenharTransicao(ctx, w, h, quadro(k - 1, agora), quadro(k, agora), Math.min(1, t), transicao);
    } else if (k < n - 1 && !corte && tLocal > dur - T) {
      // Passagem de SAÍDA (começa o fim desta cena).
      const t = Math.min(1, Math.max(0, (tLocal - (dur - T)) / T)) * 0.5;
      desenharTransicao(ctx, w, h, quadro(k, agora), quadro(k + 1, agora), t, transicao);
    } else {
      // Sem passagem: a imagem da cena, quieta. O enquadramento é aplicado
      // pelo próprio desenharCobrindo (imagem parada, transições e epílogo).
      ctx.save();
      ctx.globalAlpha = 1;
      if ('filter' in ctx) ctx.filter = 'none';
      desenharCobrindo(ctx, quadro(k, agora), w, h);
      ctx.restore();
    }

    // A legenda entra por cima de tudo, transição incluída.
    if (querLegenda) {
      const bloco = blocoAtivo(legendas, agora);
      if (bloco) desenharLegenda(ctx, bloco.texto, w, h);
    }

    aplicarFecho(agora);
  };
}

// ---- som ----
// O áudio vai para as colunas E para o gravador, através de um
// MediaStreamAudioDestinationNode.
function criarSequenciaAudio() {
  const ctx = new AudioContext();
  const destino = ctx.createMediaStreamDestination();
  const ganho = ctx.createGain();
  ganho.gain.value = 1;
  ganho.connect(destino);
  ganho.connect(ctx.destination); // ouve-se enquanto grava

  return { ctx, destino, ganho, clipes: [] };
}

// Descodifica a narração de cada cena.
//
// `semFala[i]` é a marca explícita de "esta cena não tem voz". É uma marca e não
// uma adivinha pela duração: uma narração curta (2 s) é uma narração como as
// outras e tem de mandar no ritmo da cena. Só as cenas sem fala é que ficam com
// um silêncio curto, para não arrastarem a montagem.
async function descodificarClipes(seq, blobs, semFala) {
  const clipes = [];
  for (const [i, b] of blobs.entries()) {
    const semVoz = !b || semFala[i];
    if (semVoz) {
      clipes.push(seq.ctx.createBuffer(1, Math.floor(seq.ctx.sampleRate * SILENCIO_CURTO), seq.ctx.sampleRate));
      continue;
    }
    const dados = await b.arrayBuffer();
    clipes.push(await seq.ctx.decodeAudioData(dados.slice(0)));
  }
  seq.clipes = clipes;
  return clipes;
}

// Grava o vídeo. cenas: [{ imagem: url, audio: Blob|null, semFala?: bool }]
// `audio: null` ou `semFala: true` = cena sem voz: nesse caso vale `duracaoCena`.
// `canvas` (opcional): o canvas onde desenhar. Se vier da página, o utilizador
// VÊ a montagem enquanto grava — é também a forma de confirmar que está certo.
export async function gerarVideo({
  cenas,
  formato = '1280x720',
  transicao = 'fade',
  duracaoTransicao = 0.6,
  // 'desligado' | 'suave' | 'medio' | 'forte' — ondulação na zona da água.
  agua = 'desligado',
  // Onde começa a água, em fração da altura (0 = topo, 1 = fundo). 0,62 deixava
  // a ondulação a apanhar o corpo do patinho nas imagens horizontais: a água
  // começa mais em baixo.
  linhaAgua = 0.62,
  fps = 30,
  canvas: canvasDado = null,
  musica = null,
  // Duração de uma cena sem narração (o modo "só música" usa isto para todas).
  duracaoCena = DURACAO_SEM_VOZ,
  // Legendas incrustadas no vídeo, com o texto de cada cena. Desligado por omissão.
  legendas = false,
  // Como cortar a imagem para caber no formato: 'personagem' (procura o assunto e
  // centra-o) ou 'centro' (recorte centrado).
  enquadramento = 'personagem',
  // Legendas já prontas (a letra da música, distribuída pelo tempo). Quando vêm,
  // substituem as legendas tiradas da narração: as duas juntas enchiam o ecrã.
  legendasExternas = null,
  // As legendas externas foram importadas de um .srt? Então esticam-se para
  // caber na duração REAL do vídeo — que só aqui se conhece.
  legendasAjustar = false,
  // Os tempos acima vêm do RASCUNHO da página (não confirmados)? Então o motor
  // re-temporiza os versos ao canto REAL da faixa que vai gravar. Tempos
  // conferidos ou alinhados palavra a palavra NUNCA são alterados.
  legendasRascunho = false,
  // 'natural' (duração das cenas) ou 'trilha' (repete as cenas até a música acabar).
  modoDuracao = 'natural',
  // Codec de gravação: 'vp8' (compatível, por omissão) ou 'vp9' (mais pequeno).
  codec = CODEC_PREDEFINIDO,
  // Duração da música, para saber quantas passagens dar. Vem da página, que a
  // mede ao escolher o ficheiro (medir aqui obrigava a descodificar antes).
  musicaSegundos = 0,
  // Orientação do encerramento ('' | 'natureza' | 'narrativa' | 'clipe') e a
  // cena que fecha o vídeo (índice): sai no fim como epílogo, sem repetir.
  orientacao = '',
  cenaFinal = -1,
  // VÁRIAS cenas de epílogo (índices, pela ordem do projeto). Quando vêm,
  // substituem a cena única: todas saem do ciclo e voltam no fim, e a duração
  // total do epílogo divide-se entre elas.
  cenasFinais = [],
  // A cena que ABRE o vídeo (índice): pelo mesmo raciocínio do epílogo, sai da
  // sequência/ciclo e volta no COMEÇO, parada, como introdução.
  cenaInicial = -1,
  // VÁRIAS cenas de introdução (índices, pela ordem do projeto). Quando vêm,
  // substituem a cena única: todas saem do ciclo e voltam no começo, e a
  // duração total da introdução divide-se entre elas.
  cenasIniciais = [],
  // Tempos da introdução e do epílogo escolhidos na página (em segundos;
  // 0 = automático: cerca de 5s na introdução, epílogo acompanha o fim da música).
  duracaoIntro = 0,
  duracaoEpilogo = 0,
  aoProgredir = () => {},
  deveParar = () => false,
}) {
  const querLegendas = Boolean(legendas);
  if (querLegendas && Array.isArray(legendasExternas)) {
    const erro = erroNosTempos(legendasExternas);
    if (erro) return { ok: false, erro };
  }

  if (!suporta()) {
    return { ok: false, erro: 'Este browser não consegue gravar vídeo. Use o Chrome ou o Edge.' };
  }
  const mime = escolherMime(codec);
  if (!mime) return { ok: false, erro: 'Este browser não grava no formato de vídeo necessário.' };
  if (!cenas || !cenas.length) return { ok: false, erro: 'Não há cenas com narração para montar.' };

  const alvo = FORMATOS.find((f) => f.id === formato) || FORMATOS[1];
  const T = Math.min(2, Math.max(0.2, Number(duracaoTransicao) || 0.6));

  const canvas = canvasDado || document.createElement('canvas');
  canvas.width = alvo.w;
  canvas.height = alvo.h;
  const ctx = canvas.getContext('2d', { alpha: false });

  // 1) PRÉ-VOO DE ENTRADA
  //
  // A montagem acontece no próprio browser, sem servidor: não há limite de corpo
  // de pedido a proteger. O que mata este pipeline é outro: memória. Cada imagem
  // é descodificada para desenhar no canvas, e o custo é proporcional aos PIXEIS
  // (4 bytes por pixel em RGBA), não aos bytes do ficheiro comprimido.
  //
  // Sem esta guarda, o utilizador descobre o problema do pior modo possível: a
  // aba fecha a meio da gravação, ou grava durante minutos e o resultado sai
  // truncado. Recusar ANTES é mais barato e a mensagem pode ser acionável.
  //
  // Os limites são folgados de propósito: servem para travar o absurdo, não para
  // incomodar quem trabalha. Ajustáveis aqui, num sítio só.
  const LIMITE_PIXEIS = 180_000_000; // ~180 MP no total (~720 MB de RGBA no pior caso)
  const LIMITE_BYTES = 200 * 1024 * 1024; // 200 MB, quando a página souber os bytes
  const AVISO_PIXEIS = Math.floor(LIMITE_PIXEIS * 0.6);
  const avisos = [];

  const pixeisDe = (fonte) => {
    const w = Number(fonte && (fonte.naturalWidth || fonte.videoWidth)) || 0;
    const h = Number(fonte && (fonte.naturalHeight || fonte.videoHeight)) || 0;
    return w > 0 && h > 0 ? w * h : 0;
  };

  // Bytes só existem se a página os declarar em cena.bytes: aqui chegam URLs, não
  // File. Medir por fetch seria uma segunda leitura inteira de cada imagem.
  let bytesDeclarados = 0;
  let algumaCenaDeclaraBytes = false;
  for (const c of cenas) {
    const b = Number(c && c.bytes);
    if (Number.isFinite(b) && b > 0) {
      algumaCenaDeclaraBytes = true;
      bytesDeclarados += b;
    }
  }
  if (algumaCenaDeclaraBytes && bytesDeclarados > LIMITE_BYTES) {
    return {
      ok: false,
      erro:
        `As imagens somam ${(bytesDeclarados / 1048576).toFixed(0)} MB e o limite desta montagem é ` +
        `${Math.round(LIMITE_BYTES / 1048576)} MB. Reduza o número de cenas ou exporte as imagens em JPEG mais leve.`,
    };
  }

  // 1) carregar as imagens
  aoProgredir({ fase: 'a preparar as imagens', atual: 0, total: cenas.length });
  // Cada fonte é uma Image (cena de imagem) ou um <video> (cena de vídeo).
  const imagens = [];
  const elementosVideo = [];
  for (const [i, c] of cenas.entries()) {
    const fonte = c.video ? await carregarVideo(c.imagem) : await carregarImagem(c.imagem);
    imagens.push(fonte);
    // Depois de carregada, procura-se onde está o assunto — é isto que impede o
    // recorte de cortar a cara do personagem ou tirá-lo de quadro.
    if (!c.video) analisarEnquadramento(fonte, alvo.w, alvo.h, enquadramento);
    elementosVideo.push(c.video ? fonte : null);
    aoProgredir({ fase: 'a preparar as imagens', atual: i + 1, total: cenas.length });
  }

  // Agora que as dimensões são conhecidas, o orçamento de pixels pode ser medido.
  // A mensagem diz o valor medido e o limite: sem números, o utilizador não sabe
  // se está perto nem o que cortar.
  {
    let pixeisTotais = 0;
    let maior = 0;
    let maiorIndice = 0;
    for (const [i, fonte] of imagens.entries()) {
      const p = pixeisDe(fonte);
      pixeisTotais += p;
      if (p > maior) { maior = p; maiorIndice = i; }
    }
    if (pixeisTotais > LIMITE_PIXEIS) {
      return {
        ok: false,
        erro:
          `As ${cenas.length} cenas somam ${(pixeisTotais / 1e6).toFixed(0)} MP de imagem e o limite desta ` +
          `montagem é ${Math.round(LIMITE_PIXEIS / 1e6)} MP. A maior é a cena ${maiorIndice + 1} ` +
          `(${(maior / 1e6).toFixed(1)} MP). Reduza o número de cenas ou exporte-as em JPEG a ` +
          `${alvo.w}×${alvo.h}, que é o tamanho usado no vídeo.`,
      };
    }
    if (pixeisTotais > AVISO_PIXEIS) {
      avisos.push(
        `A montagem usa ${(pixeisTotais / 1e6).toFixed(0)} MP de imagem (limite ` +
        `${Math.round(LIMITE_PIXEIS / 1e6)} MP). Se a aba fechar ou a gravação falhar, ` +
        'reduza o número de cenas ou o tamanho das imagens.',
      );
    }
  }

  // 2) preparar o áudio
  const seq = criarSequenciaAudio();

  // O CONTEXTO DE ÁUDIO TEM DE ESTAR A CORRER. Se o browser o deixar SUSPENSO
  // (bloqueio de reprodução automática, página incorporada sem permissão), o
  // gravador capta SILÊNCIO: o vídeo sai mudo e ninguém sabe porquê. Por isso
  // se tenta acordar com um prazo curto (alguns browsers deixam o resume()
  // pendente para sempre) e, se não correr, falha AGORA com instruções — em
  // vez de gravar minutos de vídeo mudo.
  const ctxACorrer = () =>
    Promise.race([
      seq.ctx.resume().then(
        () => !seq.ctx.state || seq.ctx.state === 'running',
        () => false,
      ),
      new Promise((r) => setTimeout(() => r(false), 1200)),
    ]);
  if (!(await ctxACorrer())) {
    try { await seq.ctx.close(); } catch { /* já fechado */ }
    return {
      ok: false,
      erro:
        'O browser BLOQUEOU o som antes de o vídeo começar — a gravação sairia muda. ' +
        'Clique em qualquer lugar da página e clique outra vez em "🎬 Gerar o vídeo". ' +
        'Se estiver a ver o Rebeca Hub dentro de outra página (janela incorporada), ' +
        'abra-o num separador próprio: ' + (window.location?.origin || ''),
    };
  }

  const marcaSemFala = cenas.map((c) => Boolean(c.semFala) || !c.audio);
  let clipes;
  try {
    clipes = await descodificarClipes(seq, cenas.map((c) => c.audio), marcaSemFala);
  } catch (e) {
    try { await seq.ctx.close(); } catch { /* já fechado */ }
    return { ok: false, erro: `não consegui ler o áudio de uma cena: ${e.message}` };
  }

  // 2b) a trilha sonora (opcional). Se falhar, o vídeo sai sem música e a
  // página é avisada — nunca se perde o trabalho por causa da trilha.
  // Aqui ela só é CARREGADA (descodificada): entra a TOCAR no instante exato
  // em que a gravação começa (junto a gravador.start, lá em baixo). Se
  // entrasse já, ficava adiantada em relação ao vídeo — e a letra, que é
  // temporizada a partir do segundo zero do vídeo, saía atrasada.
  let trilha = null;
  let musicaAviso = '';
  let musicaReal = 0;
  let musicaBuffer = null;
  let modTrilha = null;
  let avisoTrilha = '';
  if (musica) {
    try {
      modTrilha = await import('./musica.mjs');
      const r = await modTrilha.carregarTrilha(musica, seq.ctx);
      if (r.ok) {
        // Este valor é a verdade sobre a duração: vem do áudio já descodificado,
        // não de um <audio> a ler metadados. Serve de segunda opinião à página.
        musicaReal = r.duracao;
        musicaBuffer = r.musica;
        avisoTrilha = r.aviso;
      } else {
        musicaAviso = r.erro;
      }
    } catch (e) {
      musicaAviso = `não consegui usar a trilha: ${e.message}`;
    }
  }

  // Há narração? Se não houver nenhuma, isto é uma montagem só com música:
  // cada imagem fica o tempo escolhido em vez de seguir uma voz que não existe.
  const temVoz = marcaSemFala.some((sem) => !sem);

  // Duração natural de cada cena: a do seu áudio, nunca menos do que a passagem
  // precisa (senão as duas passagens sobrepunham-se). Sem voz, é a duração fixa.
  const duracoes = duracoesDasCenas(marcaSemFala, clipes, T, duracaoCena, cenas);

  // O SOM das cenas de vídeo vem do próprio ficheiro, tocado em tempo real e
  // ligado ao mesmo destino da narração e da trilha (entra no vídeo gravado).
  for (const [i, v] of elementosVideo.entries()) {
    if (!v) continue;
    try {
      // O volume (ou o mudo) da cena passa por um ganho próprio, antes do
      // ganho geral — é o "Ajustar áudio" da edição da cena.
      const ganhoDaCena = seq.ctx.createGain();
      ganhoDaCena.gain.value = cenas[i].videoMudo
        ? 0
        : Math.max(0, Math.min(1, Number(cenas[i].videoVolume ?? 1)));
      seq.ctx.createMediaElementSource(v).connect(ganhoDaCena);
      ganhoDaCena.connect(seq.ganho);
    } catch (e) {
      try { await seq.ctx.close(); } catch { /* já fechado */ }
      return { ok: false, erro: `não consegui ligar o som de um vídeo da montagem: ${e.message}` };
    }
  }
  const natural = duracoes.reduce((a, d) => a + d, 0);

  // O vídeo é curto e a música é longa? Em vez de cortar a música, as imagens
  // repetem-se em ciclo até a música acabar (é o que o modo 'trilha' faz).
  //
  // A duração que manda é a do áudio JÁ DESCODIFICADO (musicaReal), que é a
  // verdade; a que a página mediu (musicaSegundos) só serve se esta faltar.
  // Sem esta ordem, uma leitura de metadados falhada deixava o vídeo curto e a
  // música cortada a meio, sem ninguém saber porquê.
  const duracaoMusica = musicaReal > 0 ? musicaReal : Number(musicaSegundos) || 0;
  const alvoMusica = modoDuracao === 'trilha' ? duracaoMusica : 0;

  // Orientação do encerramento: as cenas finais são TIRADAS da sequência/ciclo
  // e voltam no FIM, pela ordem do projeto — nunca repetem com as outras.
  // Uma só cena (projetos antigos, `cenaFinal`) vale como lista de uma.
  const idxFinalDado = Number(cenaFinal);
  const idxFinal0 =
    Number.isInteger(idxFinalDado) && idxFinalDado >= 0 && idxFinalDado < cenas.length ? idxFinalDado : -1;
  const finaisDadas = (Array.isArray(cenasFinais) ? cenasFinais : [])
    .map((i) => Number(i))
    .filter((i) => Number.isInteger(i) && i >= 0 && i < cenas.length);
  const finais = finaisDadas.length
    ? [...new Set(finaisDadas)].sort((a, b) => a - b)
    : idxFinal0 >= 0
      ? [idxFinal0]
      : [];
  const comEpilogo = Boolean(orientacao) && finais.length >= 1 && cenas.length > finais.length;

  // A mesma ideia no começo: a imagem inicial sai da sequência/ciclo e ABRE o
  // vídeo, parada. Se for uma das imagens do epílogo, fica só com o epílogo.
  const idxInicialDado = Number(cenaInicial);
  const iniciaisDadas = (Array.isArray(cenasIniciais) ? cenasIniciais : [])
    .map((i) => Number(i))
    .filter((i) => Number.isInteger(i) && i >= 0 && i < cenas.length);
  const iniciaisBrutas = iniciaisDadas.length
    ? [...new Set(iniciaisDadas)].sort((a, b) => a - b)
    : idxInicialDado >= 0 && idxInicialDado < cenas.length ? [idxInicialDado] : [];
  // Uma cena não pode ser introdução E epílogo: se estiver nos dois, fica
  // apenas no epílogo (como antes, quando a introdução era única).
  const iniciais = iniciaisBrutas.filter((i) => !finais.includes(i));
  // Só há introdução se sobrar pelo menos uma cena para o corpo do vídeo.
  const comIntro = iniciais.length > 0 && cenas.length > finais.length + iniciais.length;

  const fora = comEpilogo || comIntro ? (i) => finais.includes(i) || iniciais.includes(i) : () => false;
  const base = cenas
    .map((c, i) => ({ ...c, _fonte: i, _passagem: 0, _texto: c.texto || '' }))
    .filter((_, i) => !fora(i));
  const durBase = comEpilogo || comIntro ? duracoes.filter((_, i) => !fora(i)) : duracoes;

  // Com música e epílogo, o epílogo fecha o vídeo EM CIMA DO FIM da música:
  // o ciclo leva o número de passagens que chega mais perto do fim da música
  // deixando o epílogo caber, e o epílogo leva EXATAMENTE o tempo que falta —
  // assim a música acaba junto com o epílogo, sem recomeçar por baixo dele.
  // Tempos FIXOS escolhidos na página (limitados a 1–60s por segurança).
  const durIntroEscolhida = Math.min(60, Math.max(0, Number(duracaoIntro) || 0));
  const durEpEscolhida = Math.min(60, Math.max(0, Number(duracaoEpilogo) || 0));

  let alvoCiclo = alvoMusica;
  let alvoEp = 0;
  if (comEpilogo && alvoMusica > 0) {
    if (durEpEscolhida > 0) {
      // Com tempo FIXO no epílogo, o ciclo é contado para a música caber nele —
      // e a música acaba JUNTO com o vídeo (o excesso é cortado no fim).
      const durEp0 = durEpEscolhida;
      const reservado = (comIntro ? durIntroEscolhida || Math.max(5, 2 * T + 0.4) : 0) + durEp0;
      const naturalBase = durBase.reduce((a, d) => a + d, 0) || 1;
      const nEp = Math.min(MAX_PASSAGENS, Math.max(0, Math.floor((alvoMusica - reservado) / naturalBase)));
      // Um cabelo abaixo do alvo: o ciclo arredonda para cima e fica com nEp.
      alvoCiclo = nEp > 0 ? nEp * naturalBase - 0.001 : 0;
    } else {
      const durEp0 = Math.max(5, 2 * T + 0.4);
      const reservado = comIntro ? Math.max(5, 2 * T + 0.4) : 0;
      const naturalBase = durBase.reduce((a, d) => a + d, 0) || 1;
      const nEp = Math.min(MAX_PASSAGENS, Math.max(1, Math.floor((alvoMusica - durEp0 - reservado) / naturalBase)));
      alvoCiclo = nEp * naturalBase - 0.001;
      alvoEp = alvoMusica - reservado - nEp * naturalBase;
    }
  }

  const repetido = repetirAte(base, durBase, alvoCiclo);
  const semCiclo = explicarSemCiclo(modoDuracao, alvoMusica, natural);

  const passagens = repetido.passagens;
  const ciclos = repetido.itens.length ? repetido.itens : base;
  const durFinal = repetido.itens.length ? repetido.duracoes : durBase;

  // A introdução entra ANTES do ciclo: 5s parados (ou 2 passagens de transição
  // + margem), com a narração dela a tocar por baixo — como o epílogo no fim.
  // VÁRIAS cenas: a duração TOTAL é a mesma e divide-se por igual entre elas,
  // pela ordem do projeto.
  let durIntro = 0;
  if (comIntro) {
    durIntro = durIntroEscolhida > 0 ? durIntroEscolhida : Math.max(5, 2 * T + 0.4);
    const durCada = durIntro / iniciais.length;
    const novasIniciais = iniciais.map((ii) => ({
      ...cenas[ii],
      _fonte: ii,
      _passagem: 0,
      _texto: cenas[ii].texto || '',
      _intro: true,
    }));
    // Todas entram no COMEÇO, pela ordem do projeto (unshift preserva a ordem).
    ciclos.unshift(...novasIniciais);
    durFinal.unshift(...iniciais.map(() => durCada));
  }

  // O epílogo entra DEPOIS do ciclo: cabe no tempo que sobra da música
  // (entre 2,5s e 12s) ou, sem música, é um epílogo de 5s. VÁRIAS cenas: a
  // duração TOTAL é a mesma e divide-se por igual entre elas, pela ordem do
  // projeto; só a ÚLTIMA recebe o movimento da orientação.
  if (comEpilogo) {
    let durEp = durEpEscolhida > 0 ? durEpEscolhida : Math.max(5, 2 * T + 0.4);
    // Com música e tempo AUTOMÁTICO: o epílogo leva EXATAMENTE o que falta até
    // o vídeo acabar no segundo em que a música (em ciclo) acaba.
    if (durEpEscolhida <= 0 && alvoEp > 0) durEp = Math.max(2.5, Math.min(12, alvoEp));
    const durCada = durEp / finais.length;
    for (const fi of finais) {
      ciclos.push({
        ...cenas[fi],
        _fonte: fi,
        _passagem: 0,
        _texto: cenas[fi].texto || '',
        _epilogo: true,
      });
      durFinal.push(durCada);
    }
  }

  // Os clipes e marcas seguem a lista FINAL (com introdução e epílogo): assim
  // a narração deles também toca, no seu lugar exato da linha do tempo.
  const clipesFinal = ciclos.map((c) => clipes[c._fonte]);
  const marcaFinal = ciclos.map((c) => marcaSemFala[c._fonte]);

  const inicios = [];
  let soma = 0;
  for (const d of durFinal) {
    inicios.push(soma);
    soma += d;
  }
  let total = soma;
  // A música nunca corta o vídeo: ele acaba sempre no fim da última cena.
  const cortado = false;

  // 2c) legendas: ou a LETRA da música (já temporizada pela página), ou o corte
  // da narração em blocos curtos, temporizados dentro da cena. O que for
  // desenhado é o mesmo que sai no .srt.
  let listaCues = [];
  let desenharLegenda = null;
  const externas = Array.isArray(legendasExternas) ? legendasExternas.filter((c) => c && c.texto) : [];
  if (querLegendas && externas.length) {
    // Tempos da letra. Quando vêm do RASCUNHO, re-temporizam-se ao canto REAL
    // da faixa que vai gravar (a análise da página pode ter faltado ou ficado
    // desatualizada — o canto é a única verdade). Confirmados, ficam como vêm:
    // a prévia, o vídeo e o SRT usam a MESMA lista.
    let lista = externas;
    if (legendasRascunho && musicaBuffer && modTrilha) {
      try {
        const corrigidas = ressincronizarPelaVoz(externas, modTrilha.analisarVozDeBuffer(musicaBuffer)?.secoes);
        if (corrigidas?.length) lista = corrigidas;
      } catch {
        /* sem análise do motor, ficam os tempos da página */
      }
    }
    listaCues = lista.map((c) => ({ texto: c.texto, inicio: c.inicio, fim: c.fim }));
  } else if (querLegendas) {
    listaCues = legendasDasCenas(ciclos.map((c) => c._texto || ''), durFinal, inicios);
  }
  if (listaCues.length) {
    try {      const mod = await import('./legendas.mjs');
      await mod.carregarFontesLegenda();
      desenharLegenda = (ctxDestino, texto, largura, altura) =>
        mod.desenharLegenda(ctxDestino, texto, largura, altura, { cor: mod.CAPT_COR, contorno: mod.CAPT_CONTORNO });
    } catch (e) {
      listaCues = [];
      console.warn('legendas desligadas:', e && e.message);
    }
  }

  // FECHO COM A MÚSICA: se ela ainda não acabou quando a última cena termina,
  // a última cena fica MAIS TEMPO no ecrã — o tempo exato que falta para a
  // música chegar ao fim. Só então o vídeo acaba. As legendas foram calculadas
  // ANTES deste acréscimo, de propósito: os blocos da narração ficam no tempo
  // da fala real, sem se esticarem pelo tempo extra de silêncio.
  // Tempo FIXO no epílogo manda: não se estica a última cena para a música
  // acabar junto — a trilha, em ciclo, é parada exatamente no fim do vídeo.
  const epilogoFixo = comEpilogo && durEpEscolhida > 0;
  let acrescentoFim = 0;
  if (duracaoMusica > 0 && total < duracaoMusica && !epilogoFixo) {
    acrescentoFim = duracaoMusica - total;
    durFinal[durFinal.length - 1] += acrescentoFim;
    inicios.length = 0;
    let somaFecho = 0;
    for (const d of durFinal) {
      inicios.push(somaFecho);
      somaFecho += d;
    }
    total = somaFecho;
  }
  // Com trilha, o vídeo acaba NO INSTANTE em que a música acaba — nunca antes.
  const terminouComMusica = duracaoMusica > 0 && Math.abs(total - duracaoMusica) < 0.5;

  // Legendas vindas de um .srt importado: agora que a duração do vídeo está
  // fechada, esticam-se para caber. É o "adaptar ao vídeo" — feito aqui porque
  // só aqui se sabe quanto dura, e antes de desenhar e de gerar o .srt.
  if (legendasAjustar && listaCues.length && total > 0) {
    const fim = listaCues[listaCues.length - 1].fim;
    if (fim > 0) listaCues = escalarCues(listaCues, total / fim);
  }

  // 3) começar a gravar
  const fluxoVideo = canvas.captureStream(fps);
  const fluxo = new MediaStream([...fluxoVideo.getVideoTracks(), ...seq.destino.stream.getAudioTracks()]);
  const gravador = new MediaRecorder(fluxo, { mimeType: mime, videoBitsPerSecond: 5_000_000 });
  const pedacos = [];
  gravador.ondataavailable = (e) => { if (e.data && e.data.size) pedacos.push(e.data); };
  const parado = new Promise((r) => { gravador.onstop = r; });

  // 2) VIGIA DE TEMPO
  //
  // O laço de desenho termina quando o RELÓGIO DO ÁUDIO chega ao fim. Se o
  // AudioContext suspender a meio (trocar de aba, economia de energia, vídeo de
  // outra origem), `relogio()` deixa de avançar: o laço nunca atinge o fim, o
  // gravador nunca para e o ecrã fica em "a montar" indefinidamente, sem erro.
  //
  // Por isso o prazo é medido em TEMPO DE PAREDE (performance.now), que não
  // depende do áudio. Em paralelo há um setTimeout como rede de segurança: em aba
  // oculta o requestAnimationFrame pode nem ser chamado, e só o temporizador
  // garante que algo acontece.
  //
  // O prazo é folgado — 1,5x a duração esperada + 30 s — para não abortar uma
  // gravação saudável e lenta.
  let estourou = false;
  const inicioParede = performance.now();
  // Usa `total` e NÃO `totalEfetivo`: este último só é declarado mais abaixo, e
  // referenciá-lo aqui daria ReferenceError por zona morta do const.
  const prazoMs = Math.max(
    60_000,
    Math.round(total * 1000 * 1.5) + 30_000,
  );
  const jaEstourou = () => performance.now() - inicioParede > prazoMs;
  // Em aba oculta o requestAnimationFrame pode deixar de ser chamado: o laço
  // fica preso à espera do fotograma seguinte. Parar o gravador não basta — é
  // preciso resolver a promessa pendente para o `finally` da limpeza correr.
  let resolverQuadro = null;
  const pararPorPrazo = () => {
    if (estourou) return;
    estourou = true;
    try { if (gravador.state !== 'inactive') gravador.stop(); } catch { /* já parado */ }
    try { if (resolverQuadro) resolverQuadro(); } catch { /* já resolvido */ }
  };
  const vigia = setTimeout(pararPorPrazo, prazoMs);

  // A MÚSICA NUNCA CORTA O VÍDEO. O vídeo acaba com a ÚLTIMA CENA (ou com o
  // epílogo); a trilha, que toca em ciclo, continua por baixo e é parada
  // exatamente nesse instante — a música termina junto com a última cena.
  const totalEfetivo = total;

  // Repete as imagens na mesma ordem da primeira passagem (a imagem de cada
  // cena vem do ficheiro original; `ciclos` só diz qual toca em cada momento).
  const imagensFinal = ciclos.map((c) => imagens[c._fonte]);

  // Água em movimento (opcional): um gestor só para este export, que cria e
  // recicla os efeitos à medida das cenas. Fica nulo quando o nível é
  // 'desligado' ou quando o browser não tem WebGL2 — e aí nada muda.
  const aguaGestor = agua && agua !== 'desligado' ? criarGestorAgua({ nivel: agua, linhaAgua }) : null;

  // O primeiro fotograma tem de existir antes de gravar, senão o vídeo começa preto.
  const desenhar = criarDesenhador({
    ctx, w: alvo.w, h: alvo.h, imagens: imagensFinal, inicios, duracoes: durFinal, T, transicao,
    legendas: listaCues, desenharLegenda,
    epilogoEm: comEpilogo ? ciclos.length - 1 : -1,
    orientacaoEpilogo: comEpilogo ? orientacao : '',
    // Com trilha, a imagem apaga para preto nos últimos segundos do vídeo.
    fechoEm: duracaoMusica > 0 ? total - Math.min(FECHO_SEGUNDOS, total / 2) : -1,
    aguaGestor,
  });
  desenhar(0, 0);

  gravador.start(250);
  const inicioAudio = seq.ctx.currentTime;

  // A MÚSICA ENTRA AGORA, no primeiro instante gravado — e não antes. Era
  // ligada durante a preparação, quando o relógio do vídeo ainda não tinha
  // começado: ficava ADIANTADA e a letra, temporizada a partir do segundo
  // zero do vídeo, saía ATRASADA em relação a ela. Começando aqui, letra e
  // música partem do MESMO instante.
  if (musicaBuffer && modTrilha) {
    try {
      trilha = modTrilha.tocarTrilha({ ctx: seq.ctx, destino: seq.destino, musica: musicaBuffer, quando: inicioAudio });
      musicaAviso = avisoTrilha;
      // E acaba SUAVE: nos últimos segundos a trilha esmaece até ao silêncio,
      // terminando exatamente no fim do vídeo — junto com o apagar da imagem.
      if (trilha.comecou && trilha.esmaecerAte) {
        trilha.esmaecerAte(trilha.comecouEm + totalEfetivo, Math.min(FECHO_SEGUNDOS, Math.max(0.3, totalEfetivo)));
      }
    } catch (e) {
      musicaAviso = `não consegui usar a trilha: ${e.message}`;
    }
  }

  // 4) desenhar e tocar, cena a cena, em tempo real
  // Imagens e legendas seguem o relógio do áudio gravado, não outro relógio
  // que possa derivar ou avançar durante uma suspensão do AudioContext.
  const relogio = () => Math.max(0, seq.ctx.currentTime - inicioAudio);
  const agoraCtx = () => seq.ctx.currentTime;
  let acumulado = 0;
  const totalCenas = ciclos.length;

  try {
    for (let i = 0; i < totalCenas; i++) {
      if (deveParar()) break;
      if (estourou) break;

      // Sem voz nenhuma não há clipe de narração para tocar — quem enche o
      // áudio é a trilha, em ciclo. Também não se toca o silêncio das cenas
      // sem fala numa montagem narrada.
      if (!marcaFinal[i]) {
        const fonte = seq.ctx.createBufferSource();
        fonte.buffer = clipesFinal[i];
        fonte.connect(seq.ganho);
        // Cada clipe entra no seu lugar exato da linha do tempo.
        try { fonte.start(agoraCtx() + Math.max(0, inicios[i] - relogio())); } catch { /* já tocou */ }
      }

      // Cena de vídeo: recomeça o ficheiro e toca — o fotograma atual é o que
      // o desenho apanha (também nas passagens com a cena em ciclo).
      const fonteAtual = imagensFinal[i];
      const cenaDeVideo = fonteAtual && fonteAtual.tagName === 'VIDEO';
      if (cenaDeVideo) {
        try {
          // Começa no INÍCIO do corte escolhido (não no começo do ficheiro).
          fonteAtual.currentTime = Math.max(0, Number(cenas[ciclos[i]._fonte].videoInicio) || 0);
          await fonteAtual.play();
        } catch {
          /* segue com o fotograma parado; a cena continua */
        }
      }

      let interrompido = false;
      await new Promise((resolve) => {
        resolverQuadro = resolve;
        const quadro = () => {
          const agora = relogio();
          // O "Parar" é ouvido a cada fotograma, não só entre cenas.
          const pedido = deveParar();
          // O prazo de parede é ouvido a cada fotograma: cobre o caso em que o
          // relógio do áudio congelou e `agora` nunca mais avança.
          if (jaEstourou()) {
            pararPorPrazo();
            resolve();
            return;
          }
          if (agora >= inicios[i] + durFinal[i] || pedido) {
            interrompido = pedido;
            resolve();
            return;
          }
          desenhar(i, agora);
          aoProgredir({
            fase: 'a gravar',
            atual: (Number.isInteger(ciclos[i]._fonte) ? ciclos[i]._fonte : i % cenas.length) + 1,
            total: cenas.length,
            passagem: (ciclos[i]._passagem || 0) + 1,
            passagens,
            segundos: agora,
            totalSegundos: totalEfetivo,
          });
          requestAnimationFrame(quadro);
        };
        requestAnimationFrame(quadro);
      });

      if (cenaDeVideo) {
        try { fonteAtual.pause(); } catch { /* já parou */ }
      }

      // Só conta o tempo que chegou a ser gravado.
      acumulado = Math.min(totalEfetivo, Math.max(acumulado, relogio()));
      if (interrompido) break;
    }

    // Os contextos WebGL do efeito são recursos escassos (~16 por aba): fecham-se
    // aqui, senão três exports seguidos esgotavam-nos.
    aguaGestor?.limpar();
  } finally {
    // Deixa o último fotograma entrar e fecha — mesmo que algo falhe a meio.
    // A música para JUNTO: o vídeo acaba na última cena e a trilha é cortada aí.
    await new Promise((r) => setTimeout(r, 250));
    if (trilha) trilha.parar();
    if (gravador.state !== 'inactive') gravador.stop();
    await parado;

    // 3) LIMPEZA DETERMINÍSTICA
    //
    // Cada render deixava recursos presos: as faixas do canvas.captureStream e do
    // destino de áudio nunca eram paradas, e os <video> das cenas ficavam com o
    // ficheiro aberto. Uma renderização vazava; várias seguidas acumulavam até a
    // aba ficar lenta ou o browser cortar a captura.
    //
    // A limpeza fica no finally para correr também nos caminhos de erro e de
    // cancelamento — é exatamente aí que ninguém se lembra dela.
    clearTimeout(vigia);
    for (const f of [fluxo, fluxoVideo, seq.destino.stream]) {
      try { for (const t of f.getTracks()) t.stop(); } catch { /* já parado */ }
    }
    for (const v of elementosVideo) {
      if (!v) continue;
      try { v.pause(); } catch { /* já parado */ }
      try { v.removeAttribute('src'); v.load(); } catch { /* já limpo */ }
    }
    try { await seq.ctx.close(); } catch { /* já fechado */ }
  }

  if (estourou) {
    return {
      ok: false,
      erro:
        `A gravação passou do prazo de ${Math.round(prazoMs / 1000)} s para um vídeo de ` +
        `${totalEfetivo.toFixed(0)} s e foi interrompida. O mais provável é o browser ter ` +
        'suspenso o áudio — deixe esta aba visível e em primeiro plano durante a gravação. ' +
        'O que já tinha sido gravado não foi aproveitado.',
    };
  }

  const blob = new Blob(pedacos, { type: mime });
  if (blob.size < 5000) {
    pedacos.length = 0;
    return { ok: false, erro: 'a gravação ficou vazia — tente outra vez, sem mudar de janela durante a gravação' };
  }

  return {
    ok: true,
    blob,
    mime,
    // O que ficou REALMENTE gravado (pode não ser o que se pediu, se o browser
    // não souber fazer aquele codec).
    codec: /vp9/.test(mime) ? 'vp9' : /vp8/.test(mime) ? 'vp8' : 'desconhecido',
    extensao: 'webm',
    duracao: acumulado,
    formato: alvo.id,
    comVoz: temVoz,
    transicao,
    comMusica: Boolean(trilha && trilha.comecou),
    musicaAviso,
    legendas: listaCues.length,
    srt: listaCues.length ? legendasParaSrt(listaCues) : '',
    legendasDaLetra: Boolean(querLegendas && externas.length),
    passagens,
    cenasPorPassagem: cenas.length,
    repetido: Boolean(repetido.itens.length),
    cortado,
    // Com trilha, o vídeo acaba NO INSTANTE em que a música acaba: se faltava
    // tempo, a última cena fica mais tempo no ecrã (tempoExtra), com som e
    // imagem a esmaecer juntos no fecho.
    terminouComMusica,
    tempoExtra: acrescentoFim,
    duracaoNatural: natural,
    versao: VERSAO_VIDEO,
    semCiclo,
    // A duração da música que o motor realmente usou (do áudio descodificado).
    musicaSegundos: duracaoMusica,
    // Orientação aplicada e duração do epílogo (0 = sem epílogo).
    orientacao: comEpilogo ? orientacao : '',
    // Duração TOTAL do epílogo (somadas as cenas finais) e quantas foram.
    epilogo: comEpilogo ? durFinal.slice(-finais.length).reduce((a, d) => a + d, 0) : 0,
    cenasEpilogo: comEpilogo ? finais.length : 0,
    // Duração da introdução (0 = sem introdução) e quantas cenas a abriram.
    intro: comIntro ? durIntro : 0,
    cenasIntro: comIntro ? iniciais.length : 0,
    // Avisos do pré-voo (campo aditivo: a página pode ignorar).
    avisos,
  };
}
