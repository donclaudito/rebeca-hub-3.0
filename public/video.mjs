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

import { blocoAtivo, legendasDasCenas, legendasParaSrt } from './legendas-core.mjs';

// Versão do motor. Aparece no resumo da página: serve para saber, sem dúvidas,
// qual build está a correr no browser (um build antigo em cache foi uma das
// causas de "não funcionou" que já apanhei).
export const VERSAO_VIDEO = '3.8.0';

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
// INTEIRA: conta-se o número de passagens que cobre a música. O corte final,
// porém, é sempre o da MÚSICA: quando ela acaba, a gravação é encerrada naquele
// instante (ver fimDaMusica em gerarVideo) — o vídeo dura exatamente a trilha.
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

// Desenha a imagem (ou o fotograma atual do vídeo) a cobrir o canvas inteiro
// (recorta o que sobra), sem deformar.
function desenharCobrindo(ctx, img, w, h, escala = 1, deslocamentoX = 0, deslocamentoY = 0) {
  const mw = img.naturalWidth || img.videoWidth || 1;
  const mh = img.naturalHeight || img.videoHeight || 1;
  const proporcao = Math.max(w / mw, h / mh) * escala;
  const dw = mw * proporcao;
  const dh = mh * proporcao;
  ctx.drawImage(img, (w - dw) / 2 + deslocamentoX, (h - dh) / 2 + deslocamentoY, dw, dh);
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
function criarDesenhador({ ctx, w, h, imagens, inicios, duracoes, T, transicao, legendas = [], desenharLegenda = null, epilogoEm = -1, orientacaoEpilogo = '' }) {
  const corte = transicao === 'corte';
  const n = imagens.length;
  const querLegenda = Boolean(desenharLegenda && legendas.length);

  return (k, agora) => {
    const inicio = inicios[k];
    const dur = duracoes[k];
    const tLocal = agora - inicio;

    // EPILOGO: a imagem final, com o movimento da orientação — não passa
    // pelas passagens de transição nem repete nada.
    if (k === epilogoEm && orientacaoEpilogo) {
      desenharEpilogo(ctx, w, h, k > 0 ? imagens[k - 1] : null, imagens[k], tLocal, dur, orientacaoEpilogo, T);
      if (querLegenda) {
        const bloco = blocoAtivo(legendas, agora);
        if (bloco) desenharLegenda(ctx, bloco.texto, w, h);
      }
      return;
    }

    // Passagem de ENTRADA (ainda a acabar a da cena anterior).
    if (k > 0 && !corte && tLocal < T) {
      const t = 0.5 + (Math.max(0, tLocal) / T) * 0.5;
      desenharTransicao(ctx, w, h, imagens[k - 1], imagens[k], Math.min(1, t), transicao);
    } else if (k < n - 1 && !corte && tLocal > dur - T) {
      // Passagem de SAÍDA (começa o fim desta cena).
      const t = Math.min(1, Math.max(0, (tLocal - (dur - T)) / T)) * 0.5;
      desenharTransicao(ctx, w, h, imagens[k], imagens[k + 1], t, transicao);
    } else {
      // Sem passagem: a imagem da cena, quieta.
      ctx.save();
      ctx.globalAlpha = 1;
      if ('filter' in ctx) ctx.filter = 'none';
      desenharCobrindo(ctx, imagens[k], w, h);
      ctx.restore();
    }

    // A legenda entra por cima de tudo, transição incluída.
    if (querLegenda) {
      const bloco = blocoAtivo(legendas, agora);
      if (bloco) desenharLegenda(ctx, bloco.texto, w, h);
    }
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
  fps = 30,
  canvas: canvasDado = null,
  musica = null,
  // Duração de uma cena sem narração (o modo "só música" usa isto para todas).
  duracaoCena = DURACAO_SEM_VOZ,
  // Legendas incrustadas no vídeo, com o texto de cada cena. Desligado por omissão.
  legendas = false,
  // Legendas já prontas (a letra da música, distribuída pelo tempo). Quando vêm,
  // substituem as legendas tiradas da narração: as duas juntas enchiam o ecrã.
  legendasExternas = null,
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
  aoProgredir = () => {},
  deveParar = () => false,
}) {
  const querLegendas = Boolean(legendas);

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

  // 1) carregar as imagens
  aoProgredir({ fase: 'a preparar as imagens', atual: 0, total: cenas.length });
  // Cada fonte é uma Image (cena de imagem) ou um <video> (cena de vídeo).
  const imagens = [];
  const elementosVideo = [];
  for (const [i, c] of cenas.entries()) {
    const fonte = c.video ? await carregarVideo(c.imagem) : await carregarImagem(c.imagem);
    imagens.push(fonte);
    elementosVideo.push(c.video ? fonte : null);
    aoProgredir({ fase: 'a preparar as imagens', atual: i + 1, total: cenas.length });
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
  let trilha = null;
  let musicaAviso = '';
  let musicaReal = 0;
  if (musica) {
    try {
      const mod = await import('./musica.mjs');
      const r = await mod.carregarTrilha(musica, seq.ctx);
      if (r.ok) {
        // Este valor é a verdade sobre a duração: vem do áudio já descodificado,
        // não de um <audio> a ler metadados. Serve de segunda opinião à página.
        musicaReal = r.duracao;
        trilha = mod.tocarTrilha({ ctx: seq.ctx, destino: seq.destino, musica: r.musica });
        musicaAviso = r.aviso;
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

  // Orientação do encerramento: a imagem final é TIRADA da sequência/ciclo e
  // volta no FIM, parada, como epílogo — nunca repete com as outras.
  const idxFinalDado = Number(cenaFinal);
  const idxFinal =
    Number.isInteger(idxFinalDado) && idxFinalDado >= 0 && idxFinalDado < cenas.length ? idxFinalDado : -1;
  const comEpilogo = Boolean(orientacao) && idxFinal >= 0 && cenas.length > 1;
  const base = cenas
    .map((c, i) => ({ ...c, _fonte: i, _passagem: 0, _texto: c.texto || '' }))
    .filter((_, i) => i !== (comEpilogo ? idxFinal : -1));
  const durBase = comEpilogo ? duracoes.filter((_, i) => i !== idxFinal) : duracoes;

  // Com música e epílogo: se dá para chegar ao fim da música com UMA passagem
  // a menos, reservo esse tempo para o epílogo — assim ele acaba JUNTO com a
  // música, em vez de ser cortado a meio.
  let alvoCiclo = alvoMusica;
  if (comEpilogo && alvoMusica > 0) {
    const naturalBase = durBase.reduce((a, d) => a + d, 0);
    const cheio = Math.min(MAX_PASSAGENS, Math.max(2, Math.ceil(alvoMusica / naturalBase)));
    const menor = (cheio - 1) * naturalBase;
    if (cheio > 1 && alvoMusica - menor >= 2.5) alvoCiclo = menor + 0.001;
  }

  const repetido = repetirAte(base, durBase, alvoCiclo);
  const semCiclo = explicarSemCiclo(modoDuracao, alvoMusica, natural);

  const passagens = repetido.passagens;
  const ciclos = repetido.itens.length ? repetido.itens : base;
  const durFinal = repetido.itens.length ? repetido.duracoes : durBase;
  const clipesFinal = ciclos.map((c) => clipes[c._fonte]);
  const marcaFinal = ciclos.map((c) => marcaSemFala[c._fonte]);

  // O epílogo entra DEPOIS do ciclo: cabe no tempo que sobra da música
  // (entre 2,5s e 12s) ou, sem música, é um epílogo de 5s.
  if (comEpilogo) {
    let durEp = Math.max(5, 2 * T + 0.4);
    if (alvoMusica > 0) {
      const antes = durFinal.reduce((a, d) => a + d, 0);
      durEp = Math.max(2.5, Math.min(12, alvoMusica - antes));
    }
    ciclos.push({
      ...cenas[idxFinal],
      _fonte: idxFinal,
      _passagem: 0,
      _texto: cenas[idxFinal].texto || '',
      _epilogo: true,
    });
    durFinal.push(durEp);
  }

  const inicios = [];
  let soma = 0;
  for (const d of durFinal) {
    inicios.push(soma);
    soma += d;
  }
  const total = soma;
  const cortado = Boolean(repetido.itens.length) && total > alvoMusica;

  // 2c) legendas: ou a LETRA da música (já temporizada pela página), ou o corte
  // da narração em blocos curtos, temporizados dentro da cena. O que for
  // desenhado é o mesmo que sai no .srt.
  let listaCues = [];
  let desenharLegenda = null;
  const externas = Array.isArray(legendasExternas) ? legendasExternas.filter((c) => c && c.texto) : [];
  if (querLegendas && externas.length) {
    // A letra repete com as imagens? Não: a letra acompanha a MÚSICA, que toca
    // uma vez. Se o vídeo tem passagens, a letra fica só na primeira.
    listaCues = externas.map((c) => ({ texto: c.texto, inicio: c.inicio, fim: c.fim }));
  } else if (querLegendas) {
    listaCues = legendasDasCenas(ciclos.map((c) => c._texto || ''), durFinal, inicios);
  }
  if (listaCues.length) {
    try {
      const mod = await import('./legendas.mjs');
      await mod.carregarFontesLegenda();
      desenharLegenda = (ctxDestino, texto, largura, altura) =>
        mod.desenharLegenda(ctxDestino, texto, largura, altura, { cor: mod.CAPT_COR, contorno: mod.CAPT_CONTORNO });
    } catch (e) {
      listaCues = [];
      console.warn('legendas desligadas:', e && e.message);
    }
  }

  // 3) começar a gravar
  const fluxoVideo = canvas.captureStream(fps);
  const fluxo = new MediaStream([...fluxoVideo.getVideoTracks(), ...seq.destino.stream.getAudioTracks()]);
  const gravador = new MediaRecorder(fluxo, { mimeType: mime, videoBitsPerSecond: 5_000_000 });
  const pedacos = [];
  gravador.ondataavailable = (e) => { if (e.data && e.data.size) pedacos.push(e.data); };
  const parado = new Promise((r) => { gravador.onstop = r; });

  // O FIM DA MÚSICA MANDA NO FIM DO VÍDEO. A trilha começa com a gravação; o
  // instante em que ela acaba, convertido para o relógio do vídeo, é o segundo
  // exato em que a gravação para — a meio de uma cena, se precisar. Sem trilha
  // (ou sem duração conhecida) não há corte: vale o comportamento de sempre.
  const ctxNoComeco = seq.ctx.currentTime;
  const fimDaMusica =
    trilha && trilha.comecou && duracaoMusica > 0
      ? trilha.comecouEm + duracaoMusica - ctxNoComeco
      : 0;
  const totalEfetivo = fimDaMusica > 0 ? Math.min(total, fimDaMusica) : total;

  // A legenda não passa do fim: o bloco que atravessasse o fim da música é
  // aparado, e o que começaria depois dele é deitado fora. O .srt sai igual
  // ao que foi desenhado.
  if (fimDaMusica > 0 && listaCues.length) {
    const dentro = [];
    for (const c of listaCues) {
      if (c.inicio >= fimDaMusica) break;
      dentro.push({ ...c, fim: Math.min(c.fim, fimDaMusica) });
    }
    listaCues = dentro;
  }

  // Repete as imagens na mesma ordem da primeira passagem (a imagem de cada
  // cena vem do ficheiro original; `ciclos` só diz qual toca em cada momento).
  const imagensFinal = ciclos.map((c) => imagens[c._fonte]);

  // O primeiro fotograma tem de existir antes de gravar, senão o vídeo começa preto.
  const desenhar = criarDesenhador({
    ctx, w: alvo.w, h: alvo.h, imagens: imagensFinal, inicios, duracoes: durFinal, T, transicao,
    legendas: listaCues, desenharLegenda,
    epilogoEm: comEpilogo ? ciclos.length - 1 : -1,
    orientacaoEpilogo: comEpilogo ? orientacao : '',
  });
  desenhar(0, 0);

  gravador.start(250);

  // 4) desenhar e tocar, cena a cena, em tempo real
  const inicio = performance.now();
  const relogio = () => (performance.now() - inicio) / 1000;
  const agoraCtx = () => seq.ctx.currentTime;
  let acumulado = 0;
  const totalCenas = ciclos.length;

  try {
    for (let i = 0; i < totalCenas; i++) {
      if (deveParar()) break;

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
      let acabouMusica = false;
      await new Promise((resolve) => {
        const quadro = () => {
          const agora = relogio();
          // O "Parar" é ouvido a cada fotograma, não só entre cenas.
          const pedido = deveParar();
          // A MÚSICA ACABOU: encerra no mesmo instante, a meio da cena se
          // precisar. É o vídeo que segue a trilha, e não o contrário.
          const fimMusicaAgora = fimDaMusica > 0 && agora >= fimDaMusica;
          if (agora >= inicios[i] + durFinal[i] || pedido || fimMusicaAgora) {
            interrompido = pedido;
            acabouMusica = fimMusicaAgora;
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
      if (interrompido || acabouMusica) break;
    }
  } finally {
    // Deixa o último fotograma entrar e fecha — mesmo que algo falhe a meio.
    // Quando o corte foi da MÚSICA, o fecho é quase imediato: não se grava
    // música a tocar DEPOIS de ela já ter acabado.
    await new Promise((r) => setTimeout(r, fimDaMusica > 0 ? 80 : 250));
    if (trilha) trilha.parar();
    if (gravador.state !== 'inactive') gravador.stop();
    await parado;
    try { await seq.ctx.close(); } catch { /* já fechado */ }
  }

  const blob = new Blob(pedacos, { type: mime });
  if (blob.size < 5000) {
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
    // A gravação acabou NO SEGUNDO EM QUE A MÚSICA ACABOU, em vez de seguir
    // até ao fim de uma imagem ou de um ciclo.
    terminouComMusica: fimDaMusica > 0 && total > fimDaMusica,
    duracaoNatural: natural,
    versao: VERSAO_VIDEO,
    semCiclo,
    // A duração da música que o motor realmente usou (do áudio descodificado).
    musicaSegundos: duracaoMusica,
    // Orientação aplicada e duração do epílogo (0 = sem epílogo).
    orientacao: comEpilogo ? orientacao : '',
    epilogo: comEpilogo ? durFinal[durFinal.length - 1] : 0,
  };
}
