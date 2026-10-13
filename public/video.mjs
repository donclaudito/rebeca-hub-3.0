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
export const VERSAO_VIDEO = '3.4.0';

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
function duracoesDasCenas(marcaSemFala, clipes, T, duracaoCena) {
  const fixa = Math.max(2 * T + 0.2, Number(duracaoCena) || DURACAO_SEM_VOZ);
  return clipes.map((c, i) => (marcaSemFala[i] ? fixa : Math.max(2 * T + 0.2, c.duration)));
}

// Repete a lista de cenas até chegar à duração pedida.
//
// Devolve os itens já com `_passagem` e `_texto` (o texto da cena original), que
// é o que o desenho usa para saber qual passagem está no ecrã. A repetição é
// INTEIRA: conta-se o número de passagens que cobre a música, por isso o vídeo
// pode passar um pouco do fim da música — nunca fica cortado a meio de uma
// imagem, e a última passagem é uma passagem certa.
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
//
// A legenda é desenhada por cima, já depois de a imagem estar no sítio. Liga-se
// e desliga-se por instante (nada de guardar estado), para que um bloco que
// atravesse uma transição continue a aparecer.
function criarDesenhador({ ctx, w, h, imagens, inicios, duracoes, T, transicao, legendas = [], desenharLegenda = null }) {
  const corte = transicao === 'corte';
  const n = imagens.length;
  const querLegenda = Boolean(desenharLegenda && legendas.length);

  return (k, agora) => {
    const inicio = inicios[k];
    const dur = duracoes[k];
    const tLocal = agora - inicio;

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
  // Duração da música, para saber quantas passagens dar. Vem da página, que a
  // mede ao escolher o ficheiro (medir aqui obrigava a descodificar antes).
  musicaSegundos = 0,
  aoProgredir = () => {},
  deveParar = () => false,
}) {
  const querLegendas = Boolean(legendas);

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
  const duracoes = duracoesDasCenas(marcaSemFala, clipes, T, duracaoCena);
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
  const repetido = repetirAte(cenas, duracoes, alvoMusica);
  const semCiclo = explicarSemCiclo(modoDuracao, alvoMusica, natural);

  const passagens = repetido.passagens;
  const ciclos = repetido.itens.length ? repetido.itens : cenas.map((c) => ({ ...c, _passagem: 0, _texto: c.texto || '' }));
  const durFinal = repetido.itens.length ? repetido.duracoes : duracoes;
  const clipesFinal = ciclos.map((c, i) => clipes[i % cenas.length]);
  const marcaFinal = ciclos.map((c, i) => marcaSemFala[i % cenas.length]);

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

  // Repete as imagens na mesma ordem da primeira passagem (a imagem de cada
  // cena vem do ficheiro original; `ciclos` só diz qual toca em cada momento).
  const imagensFinal = ciclos.map((c, i) => imagens[i % imagens.length]);

  // O primeiro fotograma tem de existir antes de gravar, senão o vídeo começa preto.
  const desenhar = criarDesenhador({
    ctx, w: alvo.w, h: alvo.h, imagens: imagensFinal, inicios, duracoes: durFinal, T, transicao,
    legendas: listaCues, desenharLegenda,
  });
  desenhar(0, 0);

  try { await seq.ctx.resume(); } catch { /* já a correr */ }
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

      let interrompido = false;
      await new Promise((resolve) => {
        const quadro = () => {
          const agora = relogio();
          // O "Parar" é ouvido a cada fotograma, não só entre cenas.
          const pedido = deveParar();
          if (agora >= inicios[i] + durFinal[i] || pedido) {
            interrompido = pedido;
            resolve();
            return;
          }
          desenhar(i, agora);
          aoProgredir({
            fase: 'a gravar',
            atual: (i % cenas.length) + 1,
            total: cenas.length,
            passagem: (ciclos[i]._passagem || 0) + 1,
            passagens,
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
    // Sem voz, este tempo extra é música a tocar por cima do último fotograma.
    await new Promise((r) => setTimeout(r, 250));
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
    duracaoNatural: natural,
    versao: VERSAO_VIDEO,
    semCiclo,
    // A duração da música que o motor realmente usou (do áudio descodificado).
    musicaSegundos: duracaoMusica,
  };
}
