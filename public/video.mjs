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

// Escolhe o melhor formato de gravação que o browser aceita.
export function escolherMime() {
  const candidatos = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for (const c of candidatos) {
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

// Desenha a imagem a cobrir o canvas inteiro (recorta o que sobra), sem deformar.
function desenharCobrindo(ctx, img, w, h, escala = 1, deslocamentoX = 0) {
  const proporcao = Math.max(w / img.naturalWidth, h / img.naturalHeight) * escala;
  const dw = img.naturalWidth * proporcao;
  const dh = img.naturalHeight * proporcao;
  ctx.drawImage(img, (w - dw) / 2 + deslocamentoX, (h - dh) / 2, dw, dh);
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
function criarDesenhador({ ctx, w, h, imagens, inicios, duracoes, T, transicao }) {
  const corte = transicao === 'corte';
  const n = imagens.length;

  return (k, agora) => {
    const inicio = inicios[k];
    const dur = duracoes[k];
    const tLocal = agora - inicio;

    // Passagem de ENTRADA (ainda a acabar a da cena anterior).
    if (k > 0 && !corte && tLocal < T) {
      const t = 0.5 + (Math.max(0, tLocal) / T) * 0.5;
      return desenharTransicao(ctx, w, h, imagens[k - 1], imagens[k], Math.min(1, t), transicao);
    }

    // Passagem de SAÍDA (começa o fim desta cena).
    if (k < n - 1 && !corte && tLocal > dur - T) {
      const t = Math.min(1, Math.max(0, (tLocal - (dur - T)) / T)) * 0.5;
      return desenharTransicao(ctx, w, h, imagens[k], imagens[k + 1], t, transicao);
    }

    // Sem passagem: a imagem da cena, quieta.
    ctx.save();
    ctx.globalAlpha = 1;
    if ('filter' in ctx) ctx.filter = 'none';
    desenharCobrindo(ctx, imagens[k], w, h);
    ctx.restore();
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

async function descodificarClipes(seq, blobs) {
  const clipes = [];
  for (const b of blobs) {
    const dados = await b.arrayBuffer();
    clipes.push(await seq.ctx.decodeAudioData(dados.slice(0)));
  }
  seq.clipes = clipes;
  return clipes;
}

// Grava o vídeo. cenas: [{ imagem: url, audio: Blob }]
// `canvas` (opcional): o canvas onde desenhar. Se vier da página, o utilizador
// VÊ a montagem enquanto grava — é também a forma de confirmar que está certo.
export async function gerarVideo({
  cenas,
  formato = '1280x720',
  transicao = 'fade',
  duracaoTransicao = 0.6,
  fps = 30,
  canvas: canvasDado = null,
  aoProgredir = () => {},
  deveParar = () => false,
}) {
  if (!suporta()) {
    return { ok: false, erro: 'Este browser não consegue gravar vídeo. Use o Chrome ou o Edge.' };
  }
  const mime = escolherMime();
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
  const imagens = [];
  for (const [i, c] of cenas.entries()) {
    imagens.push(await carregarImagem(c.imagem));
    aoProgredir({ fase: 'a preparar as imagens', atual: i + 1, total: cenas.length });
  }

  // 2) preparar o áudio
  const seq = criarSequenciaAudio();
  let clipes;
  try {
    clipes = await descodificarClipes(seq, cenas.map((c) => c.audio));
  } catch (e) {
    try { await seq.ctx.close(); } catch { /* já fechado */ }
    return { ok: false, erro: `não consegui ler o áudio de uma cena: ${e.message}` };
  }

  // Duração de cada cena = duração do seu áudio; nunca menos do que a passagem
  // precisa (senão as duas passagens sobrepunham-se).
  const duracoes = clipes.map((c) => Math.max(2 * T + 0.2, c.duration));
  const inicios = [];
  let soma = 0;
  for (const d of duracoes) {
    inicios.push(soma);
    soma += d;
  }
  const total = soma;

  // 3) começar a gravar
  const fluxoVideo = canvas.captureStream(fps);
  const fluxo = new MediaStream([...fluxoVideo.getVideoTracks(), ...seq.destino.stream.getAudioTracks()]);
  const gravador = new MediaRecorder(fluxo, { mimeType: mime, videoBitsPerSecond: 5_000_000 });
  const pedacos = [];
  gravador.ondataavailable = (e) => { if (e.data && e.data.size) pedacos.push(e.data); };
  const parado = new Promise((r) => { gravador.onstop = r; });

  // O primeiro fotograma tem de existir antes de gravar, senão o vídeo começa preto.
  const desenhar = criarDesenhador({ ctx, w: alvo.w, h: alvo.h, imagens, inicios, duracoes, T, transicao });
  desenhar(0, 0);

  try { await seq.ctx.resume(); } catch { /* já a correr */ }
  gravador.start(250);

  // 4) desenhar e tocar, cena a cena, em tempo real
  const inicio = performance.now();
  const relogio = () => (performance.now() - inicio) / 1000;
  const agoraCtx = () => seq.ctx.currentTime;
  let acumulado = 0;

  try {
    for (let i = 0; i < cenas.length; i++) {
      if (deveParar()) break;

      const fonte = seq.ctx.createBufferSource();
      fonte.buffer = clipes[i];
      fonte.connect(seq.ganho);
      // Cada clipe entra no seu lugar exato da linha do tempo.
      try { fonte.start(agoraCtx() + Math.max(0, inicios[i] - relogio())); } catch { /* já tocou */ }

      let interrompido = false;
      await new Promise((resolve) => {
        const quadro = () => {
          const agora = relogio();
          // O "Parar" é ouvido a cada fotograma, não só entre cenas.
          const pedido = deveParar();
          if (agora >= inicios[i] + duracoes[i] || pedido) {
            interrompido = pedido;
            resolve();
            return;
          }
          desenhar(i, agora);
          aoProgredir({
            fase: 'a gravar',
            atual: i + 1,
            total: cenas.length,
            segundos: agora,
            totalSegundos: total,
          });
          requestAnimationFrame(quadro);
        };
        requestAnimationFrame(quadro);
      });

      // Só conta o tempo que chegou a ser gravado.
      acumulado = Math.min(total, Math.max(acumulado, relogio()));
      if (interrompido) break;
    }
  } finally {
    // Deixa o último fotograma entrar e fecha — mesmo que algo falhe a meio.
    await new Promise((r) => setTimeout(r, 250));
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
    extensao: 'webm',
    duracao: acumulado,
    formato: alvo.id,
    transicao,
  };
}
