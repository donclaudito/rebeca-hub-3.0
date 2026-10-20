// ============================================================
//  Trilha sonora do vídeo — o ficheiro vem do computador do utilizador
//
//  Decisão: a app NÃO traz música dentro dela. O Rebeca Hub 2.0 também não
//  trazia (a entidade MusicPlaylist guardava só nomes e moods; a música real
//  vinha de fora, por URL). Trazer faixas dentro da app obrigaria a alguns MB
//  por faixa, a contabilidade de licença de cada uma e a uma fonte que pode
//  sair do ar. Escolher um ficheiro do computador — tal como as imagens —
//  mantém o app leve, não gasta licenças e funciona offline.
//
//  A música toca EM CICLO, por baixo da narração, a 16% de volume — o mesmo
//  valor que o Hub 2.0 usava e que já se sabe que deixa a voz mandar.
// ============================================================

// Volume da música em relação à narração (1 = voz). Igual ao Hub 2.0.
export const VOLUME_TRILHA = 0.16;

// Acima disto pedimos um ficheiro mais curto: descodificar 15 minutos de áudio
// para o telemóvel é pesado, e a música repete de qualquer forma.
export const LIMITE_MINUTOS = 15;

// Tipos que o <audio> do browser lê de forma fiável.
export const TIPOS_ACEITES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/ogg',
  'audio/webm',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
  'audio/flac',
];

const MINUTOS = LIMITE_MINUTOS * 60;

// "1:23" — para o utilizador confirmar que escolheu a faixa certa.
export function formatarDuracao(segundos) {
  const s = Math.max(0, Math.round(Number(segundos) || 0));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

// Junta os canais num só. A música de fundo não precisa de estéreo, e metade
// dos canais é metade da memória durante a gravação.
function paraMono(buffer) {
  if (buffer.numberOfChannels < 2) return buffer;
  const n = buffer.length;
  const mono = buffer.getChannelData(0);
  const segundo = buffer.getChannelData(1);
  for (let i = 0; i < n; i++) mono[i] = (mono[i] + segundo[i]) * 0.5;
  // Sem isto o buffer continuava a dizer que tinha 2 canais. Em AudioBuffer a
  // sério a propriedade é só de leitura, por isso a atribuição é protegida.
  try {
    buffer.numberOfChannels = 1;
  } catch {
    /* fica a dizer 2 canais, mas o 2.º já não é usado */
  }
  return buffer;
}

// Corta o que passa do limite (e liberta o resto).
function cortar(buffer, segundos, ctx) {
  if (buffer.duration <= segundos) return buffer;
  const n = Math.floor(segundos * buffer.sampleRate);
  const novo = ctx.createBuffer(1, n, buffer.sampleRate);
  novo.getChannelData(0).set(buffer.getChannelData(0).subarray(0, n));
  return novo;
}

// Lê o ficheiro escolhido e devolve a música pronta a tocar.
// Devolve sempre { ok } — nunca atira, para a página poder explicar o que falhou.
export async function carregarTrilha(ficheiro, ctx) {
  if (!ficheiro) return { ok: false, erro: 'Não escolheu nenhuma música.' };
  if (!ctx) return { ok: false, erro: 'O áudio do browser não está disponível.' };

  let dados;
  try {
    dados = await ficheiro.arrayBuffer();
  } catch {
    return { ok: false, erro: 'Não consegui ler o ficheiro de música.' };
  }

  let buffer;
  try {
    // `slice(0)` porque decodeAudioData consome o ArrayBuffer.
    buffer = await ctx.decodeAudioData(dados.slice(0));
  } catch {
    return {
      ok: false,
      erro: 'O browser não conseguiu ler essa música. Experimente um MP3, WAV, M4A ou OGG.',
    };
  }

  if (!buffer || !buffer.duration || !isFinite(buffer.duration)) {
    return { ok: false, erro: 'Esse ficheiro não tem áudio que se possa usar.' };
  }

  const aviso = buffer.duration > MINUTOS
    ? `A música tinha ${formatarDuracao(buffer.duration)}; usei só os primeiros ${LIMITE_MINUTOS} minutos (repete na mesma).`
    : '';

  const musica = cortar(paraMono(buffer), MINUTOS, ctx);
  return { ok: true, musica, duracao: musica.duration, aviso };
}

// ============================================================
//  Achar ONDE se canta — para a letra da legenda seguir o canto.
// ============================================================

// Analisa a música e devolve os trechos com voz: é onde os versos da legenda
// devem aparecer. Não é transcrição (nunca diz O QUE se canta): mede o volume
// da música em janelas de 50 ms, compara com o piso da faixa (percentil baixo)
// e chama de "voz" o som que fica claramente acima dele. Pausas curtas
// (respiração entre linhas) não partem o trecho; rajadas curtíssimas
// (percussão, aplauso) não contam como canto. Se o som for contínuo do
// princípio ao fim, os trechos não dizem nada de útil e voltam vazios — a
// página fica com a divisão igual de sempre.
export async function analisarVoz(ficheiro) {
  if (!ficheiro) return null;
  let dados;
  try {
    dados = await ficheiro.arrayBuffer();
  } catch {
    return null;
  }
  let ctx = null;
  try {
    ctx = new AudioContext();
  } catch {
    return null;
  }
  let buffer;
  try {
    buffer = await ctx.decodeAudioData(dados.slice(0));
  } catch {
    try { await ctx.close(); } catch { /* já fechado */ }
    return null;
  }
  try { await ctx.close(); } catch { /* já fechado */ }
  return analisarVozDeBuffer(buffer);
}

// A MESMA análise, sobre um buffer JÁ descodificado — o que o motor do vídeo
// tem em mãos quando a trilha foi carregada. O motor usa-a para RESSINCRONIZAR
// a letra ao canto real na hora de gravar: assim os versos seguem o canto
// mesmo que a análise da página tenha faltado (página recarregada, análise
// ainda a correr ou falhada).
export function analisarVozDeBuffer(buffer) {
  if (!buffer || !buffer.duration || !isFinite(buffer.duration)) return null;

  const QUADRO = 0.05; // janelas de 50 ms
  const mono = paraMono(buffer);
  const taxa = mono.sampleRate;
  const janela = Math.max(1, Math.floor(taxa * QUADRO));
  const n = Math.floor(mono.length / janela);
  if (n < 40) return null;

  const amostras = mono.getChannelData(0);
  const rms = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    const o = i * janela;
    for (let k = 0; k < janela; k += 2) {
      const v = amostras[o + k];
      s += v * v;
    }
    rms[i] = Math.sqrt(s / (janela / 2));
  }
  const ordenado = Float32Array.from(rms).sort();
  const piso = ordenado[Math.floor(n * 0.35)] || 0;
  const limite = piso * 2 + 1e-4;

  const comVoz = new Uint8Array(n);
  for (let i = 0; i < n; i++) comVoz[i] = rms[i] > limite ? 1 : 0;
  const MIN_VOZ = Math.round(0.5 / QUADRO); // rajada curta não é canto
  const MAX_BURACO = Math.round(2.5 / QUADRO); // respiração não parte o trecho
  const secoes = [];
  let aberto = -1;
  let buraco = -1;
  for (let i = 0; i <= n; i++) {
    const ativo = i < n && comVoz[i] === 1;
    if (ativo) {
      if (aberto < 0) aberto = i;
      buraco = -1;
    } else if (aberto >= 0) {
      if (buraco < 0) buraco = i;
      if (i - buraco >= MAX_BURACO) {
        if (buraco - aberto >= MIN_VOZ) secoes.push({ inicio: aberto * QUADRO, fim: buraco * QUADRO });
        aberto = -1;
        buraco = -1;
      }
    }
  }
  if (aberto >= 0 && n - aberto >= MIN_VOZ) secoes.push({ inicio: aberto * QUADRO, fim: n * QUADRO });

  // A análise cobre o MESMO tempo que o motor do vídeo vai usar (a faixa em
  // mono, cortada ao limite): as marcações da letra ficam já no tempo certo.
  const duracao = Math.min(buffer.duration, MINUTOS);
  const cobertura = secoes.reduce((a, s) => a + (s.fim - s.inicio), 0) / duracao;
  const util = cobertura > 0.05 && cobertura < 0.97;
  return {
    duracao,
    // O instante em que a voz entra pela primeira vez (a intro instrumental
    // termina aqui): é onde o primeiro verso entra.
    vozInicio: util && secoes.length ? secoes[0].inicio : 0,
    // Vazios quando o canto é contínuo: não há nada a corrigir.
    secoes: util ? secoes : [],
    cobertura: Number(cobertura.toFixed(3)),
  };
}

// Liga a música ao destino da gravação. Fica em ciclo e começa já — o vídeo
// abre na primeira imagem, por isso a música não fica desfasada da narração.
export function tocarTrilha({ ctx, destino, musica, quando = null }) {
  const ganho = ctx.createGain();
  ganho.gain.value = VOLUME_TRILHA;
  ganho.connect(destino);

  const fonte = ctx.createBufferSource();
  fonte.buffer = musica;
  fonte.loop = true;
  fonte.connect(ganho);

  let comecou = false;
  let comecouEm = 0;
  try {
    // `quando` PROGRAMA o início (a música entra no instante exato da gravação,
    // o que mantém a letra alinhada com ela); sem ele, começa já.
    comecouEm = Number.isFinite(quando) && quando !== null ? Number(quando) : ctx.currentTime;
    fonte.start(comecouEm);
    comecou = true;
  } catch {
    /* sem música é melhor do que sem vídeo */
  }

  return {
    comecou,
    // O instante (no relógio do AudioContext) em que a música começou. É o que
    // permite ao motor saber o segundo EXATO em que ela vai acabar.
    comecouEm,
    // Esmaece a música até ao instante `fimEm` (no relógio do AudioContext):
    // o volume desce a zero nos últimos `duracao` segundos e a música acaba
    // suave, em vez de ser cortada a seco no fim do vídeo.
    esmaecerAte(fimEm, duracao = 2) {
      try {
        const d = Math.max(0.3, Number(duracao) || 2);
        ganho.gain.cancelScheduledValues(comecouEm);
        ganho.gain.setValueAtTime(VOLUME_TRILHA, fimEm - d);
        ganho.gain.linearRampToValueAtTime(0.0001, fimEm);
      } catch {
        /* sem esmaecimento é melhor do que sem gravação */
      }
    },
    parar() {
      try {
        if (comecou) fonte.stop();
      } catch {
        /* já parou */
      }
      try {
        fonte.disconnect();
        ganho.disconnect();
      } catch {
        /* já desligado */
      }
    },
  };
}
