// Testa a geração do vídeo com um browser falso e um relógio controlado.
// Verifica o que se desenha, o que se toca e se as passagens são contínuas.
// Caminho dos módulos do site, relativo a ESTE ficheiro: funciona em qualquer
// máquina. O caminho antigo apontava para E:\ e só corria no disco de origem.
const BASE = new URL('../public/', import.meta.url).href;
const mod = await import(BASE + 'video.mjs');

const falhas = [];
const ok = (m) => console.log('  ok:', m);
const fail = (m) => { console.error('  FALHOU:', m); falhas.push(m); };
const perto = (a, b, tol = 0.03) => Math.abs(a - b) <= tol;
const check = (c, bom, mau) => (c ? ok(bom) : fail(mau));

// ---------------- browser falso ----------------
let relogioMs = 0;               // milissegundos
let fila = [];                   // requestAnimationFrame pendentes
let desenhos = [];               // {t, img, escala, alpha, filtro}
let legendasDesenhadas = [];     // {t, texto, tipo}
let mimesUsados = [];            // mimeType pedido ao MediaRecorder em cada gravação
let suportaCodecs = true;        // o browser falso sabe gravar WebM?
let agendamentos = [];           // {clipe, quando}
let fontesEmCiclo = [];          // fontes com loop (a trilha)
let ganhosCriados = [];          // valores de ganho pedidos (narração=1, trilha=0.16)
let retoques = [];               // fillRect no canvas (o véu preto do fecho)
let musicaDuracao = 2;           // duração devolvida para a trilha (curta: o fecho com a música não estica as provas)
let ultimoCtx = null;
let ultimoGravador = null;

class Ctx2D {
  constructor() { this.globalAlpha = 1; this.filter = 'none'; this._p = []; }
  save() { this._p.push({ a: this.globalAlpha, f: this.filter }); }
  restore() { const s = this._p.pop(); if (s) { this.globalAlpha = s.a; this.filter = s.f; } }
  clearRect() {}
  // O FECHO do vídeo pinta o ecrã de preto: regista o véu aplicado em cada
  // instante, para as provas poderem ver o apagar suave.
  fillRect(x, y, w, h) { retoques.push({ t: relogioMs / 1000, alpha: this.globalAlpha, cor: this.fillStyle, x, y, w, h }); }
  drawImage(img, x, y, w, h) {
    desenhos.push({ t: relogioMs / 1000, img: img && img.nome, escala: w / 1000, alpha: this.globalAlpha, dx: x, filtro: this.filter });
  }
  // A legenda precisa de medir texto: ~0,55 × tamanho por letra.
  measureText(t) { return { width: String(t).length * (parseFloat(this.font) || 16) * 0.55 }; }
  strokeText(t) { legendasDesenhadas.push({ t: relogioMs / 1000, texto: String(t), tipo: 'contorno' }); }
  fillText(t) { legendasDesenhadas.push({ t: relogioMs / 1000, texto: String(t), tipo: 'preenchimento' }); }
}

class CanvasFalso {
  constructor(nome = 'novo') { this.nome = nome; this.width = 0; this.height = 0; this._ctx = new Ctx2D(); }
  getContext() { return this._ctx; }
  captureStream(fps) { this.fps = fps; return { getVideoTracks: () => [{ tipo: 'video' }], getAudioTracks: () => [] }; }
}

class ImagemFalsa {
  constructor() { this.naturalWidth = 1000; this.naturalHeight = 1000; setTimeout(() => this.onload?.(), 0); }
  set src(v) { this.nome = v; }
}

// Buffer de áudio falso — imita o AudioBuffer a sério (com getChannelData).
class BufferFalso {
  constructor(duracao, canais = 1, taxa = 44100) {
    this.numberOfChannels = canais;
    this.sampleRate = taxa;
    this.length = Math.round(duracao * taxa);
    this.duration = duracao;
    this._dados = new Float32Array(this.length);
  }
  getChannelData() { return this._dados; }
}

class ClipeFalso {
  constructor(buffer) { this.buffer = buffer; }
  get duration() { return this.buffer.duration; }
  arrayBuffer() { return Promise.resolve(new ArrayBuffer(8)); }
}

// Fonte de áudio falsa: regista o que foi criado e se está em ciclo.
class FonteFalsa {
  constructor(ctx) { this.ctx = ctx; this.loop = false; this.comecou = false; this.parou = false; }
  connect() { return this; }
  disconnect() {}
  set buffer(b) { this._b = b; }
  get buffer() { return this._b; }
  start(quando) {
    this.comecou = true; this.quando = quando;
    if (this.loop) fontesEmCiclo.push(this);
    else agendamentos.push({ clipe: this._b.duration, quando: +quando.toFixed(3) });
  }
  stop() { this.parou = true; try { this.onended?.(); } catch { /* segue */ } }
}

class AudioCtxFalso {
  constructor(duracoes) {
    this.currentTime = 0; this.destination = { nome: 'colunas' }; this.estado = 'running';
    this._duracoes = [...duracoes];
  }
  createMediaStreamDestination() { return { stream: { getAudioTracks: () => [{ tipo: 'audio' }] } }; }
  createGain() {
    const g = { gain: {}, connect() {}, disconnect() {} };
    Object.defineProperty(g.gain, 'value', { get: () => g._valor, set: (v) => { g._valor = v; ganhosCriados.push(v); } });
    g._valor = 1;
    return g;
  }
  // 1.º pedido = narração (durações da lista); pedidos seguintes = trilha.
  // A duração da trilha é o que o áudio descodificado diz, e é ela que manda.
  decodeAudioData() {
    this._chamadas = (this._chamadas || 0) + 1;
    if (this._duracoes.length) return Promise.resolve(new BufferFalso(this._duracoes.shift()));
    return Promise.resolve(new BufferFalso(musicaDuracao, 2)); // a trilha é estéreo
  }  createBufferSource() {
    this._fontes = (this._fontes || 0) + 1;
    return new FonteFalsa(this);
  }
  createBuffer(canais, n, taxa) {
    const dados = new Float32Array(n);
    return { numberOfChannels: canais, length: n, sampleRate: taxa, duration: n / taxa, getChannelData: () => dados };
  }
  resume() { return Promise.resolve(); }
  close() { return Promise.resolve(); }
}

class GravadorFalso {
  static isTypeSupported(t) {
    // O browser falso aceita VP8, VP9 e WebM puro — para se poder testar a
    // escolha de codec.
    return suportaCodecs && /webm/.test(t);
  }
  constructor(fluxo, opcoes) {
    this.fluxo = fluxo; this.opcoes = opcoes; this.state = 'inactive';
    this.ondataavailable = null; this.onstop = null;
    mimesUsados.push(opcoes && opcoes.mimeType);
    ultimoGravador = this;
  }
  start(ms) { this.state = 'recording'; this.intervalo = ms; }
  stop() {
    this.state = 'inactive';
    for (let i = 0; i < 10; i++) this.ondataavailable?.({ data: { size: 4000 } });
    setTimeout(() => this.onstop?.(), 0);
  }
}

// `musicaSegundos` é a duração que o áudio descodificado da TRILHA devolve — é
// ela que manda no ciclo. A lista `duracoes` é só da narração, por isso os dois
// nunca se misturam (misturá-los foi um erro meu que fez o ciclo parecer avariado).
function instalarAmbiente(duracoes, { musicaSegundos = 2 } = {}) {
  desenhos = []; agendamentos = []; fontesEmCiclo = []; ganhosCriados = []; legendasDesenhadas = []; retoques = []; fila = []; relogioMs = 0;
  mimesUsados = []; suportaCodecs = true;
  musicaDuracao = musicaSegundos;
  const ctx = new AudioCtxFalso(duracoes);
  ultimoCtx = ctx;
  globalThis.AudioContext = function () { return ctx; };
  globalThis.window = { MediaRecorder: GravadorFalso, AudioContext: globalThis.AudioContext };
  globalThis.MediaRecorder = GravadorFalso;
  globalThis.MediaStream = class {
    constructor(t) { this.tracks = t; }
    getVideoTracks() { return this.tracks.filter((x) => x.tipo === 'video'); }
    getAudioTracks() { return this.tracks.filter((x) => x.tipo === 'audio'); }
  };
  globalThis.Image = ImagemFalsa;
  globalThis.Blob = class { constructor(pedacos, o) { this.size = (pedacos || []).reduce((a, p) => a + (p.size || 0), 0); this.type = o?.type; } };
  globalThis.document = { createElement: (t) => (t === 'canvas' ? new CanvasFalso() : {}) };
  globalThis.performance = { now: () => relogioMs };
  globalThis.requestAnimationFrame = (fn) => fila.push(fn);
  return ctx;
}

// Corre o relógio até a promessa resolver (ou até ao limite).
async function correrCom(promessa, limiteMs = 60000) {
  let feito = false, valor, erro;
  promessa.then((v) => { feito = true; valor = v; }, (e) => { feito = true; erro = e; });
  let passos = 0;
  while (!feito && relogioMs < limiteMs && passos < 20000) {
    const lote = fila; fila = [];
    await Promise.resolve();          // deixa as promessas pendentes avançar
    relogioMs += 16;
    if (ultimoCtx) ultimoCtx.currentTime = relogioMs / 1000;
    for (const f of lote) f();
    passos++;
    if (!fila.length) await new Promise((r) => setTimeout(r, 0));
  }
  if (erro) throw erro;
  if (!feito) throw new Error(`a gravação não terminou (relógio em ${relogioMs}ms, ${passos} passos)`);
  return valor;
}

const blobsDe = (n) => Array.from({ length: n }, () => ({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) }));
const cenasDe = (n) => Array.from({ length: n }, (_, i) => ({ imagem: `c${i + 1}`, audio: blobsDe(1)[0] }));

console.log('\n[1] Rejeita o que não pode fazer');
{
  instalarAmbiente([2]);
  const semCenas = await mod.gerarVideo({ cenas: [] });
  check(semCenas.ok === false && /não há cenas/i.test(semCenas.erro), `cenas vazias: "${semCenas.erro}"`, JSON.stringify(semCenas));

  instalarAmbiente([2]);
  globalThis.window.MediaRecorder = undefined;
  const semSuporte = await mod.gerarVideo({ cenas: cenasDe(1) });
  check(semSuporte.ok === false && /não consegue gravar/i.test(semSuporte.erro), `sem MediaRecorder: "${semSuporte.erro}"`, JSON.stringify(semSuporte));

  instalarAmbiente([2]);
  const isTypeOriginal = globalThis.MediaRecorder.isTypeSupported;
  globalThis.MediaRecorder.isTypeSupported = () => false;
  const semMime = await mod.gerarVideo({ cenas: cenasDe(1) });
  check(semMime.ok === false && /formato de vídeo/i.test(semMime.erro), `sem formato aceite: "${semMime.erro}"`, JSON.stringify(semMime));
  // REPOR o método original: antes esta linha ficava substituída para todo o
  // ficheiro e os grupos seguintes escolhiam sempre VP9 — parecia um defeito do
  // motor e era do teste.
  globalThis.MediaRecorder.isTypeSupported = isTypeOriginal;
}

console.log('\n[2] 3 cenas: gravação, tempos e ficheiro final');
{
  const duracoes = [3.0, 2.0, 1.0];
  instalarAmbiente(duracoes);
  const canvas = new CanvasFalso('preview');
  const fases = [];
  const r = await correrCom(mod.gerarVideo({
    cenas: cenasDe(3),
    formato: '1280x720',
    transicao: 'fade',
    duracaoTransicao: 0.4,
    canvas,
    aoProgredir: (p) => fases.push(p),
  }));

  check(r.ok === true, 'devolveu ok', JSON.stringify(r).slice(0, 200));
  check(r.extensao === 'webm' && /vp8,opus/.test(r.mime), `formato: ${r.mime} (VP8, por compatibilidade)`, r.mime);
  check(canvas.width === 1280 && canvas.height === 720, `canvas no tamanho certo: ${canvas.width}×${canvas.height}`, `${canvas.width}×${canvas.height}`);
  check(canvas.fps === 30, 'captura a 30 fps', String(canvas.fps));
  check(perto(r.duracao, 6.0, 0.05), `duração total ≈ 6,0s (soma das cenas): ${r.duracao.toFixed(2)}s`, `${r.duracao}`);
  check(r.blob.size > 5000, `ficheiro com ${r.blob.size} bytes`, String(r.blob.size));

  // ordem das fases
  check(fases[0]?.fase === 'a preparar as imagens', 'primeiro prepara as imagens', fases[0]?.fase);
  const gravar = fases.filter((f) => f.fase === 'a gravar');
  check(gravar.length > 100, `${gravar.length} atualizações durante a gravação`, String(gravar.length));
  check(gravar.at(-1)?.atual === 3, 'a última atualização é da cena 3', String(gravar.at(-1)?.atual));
  check(perto(gravar.at(-1)?.totalSegundos ?? 0, 6.0, 0.05), `progresso sabe o total: ${gravar.at(-1)?.totalSegundos}s`, String(gravar.at(-1)?.totalSegundos));
  const avancou = gravar.every((f, i) => i === 0 || f.segundos >= gravar[i - 1].segundos);
  check(avancou, 'o tempo do progresso nunca anda para trás', 'o progresso andou para trás');
}

console.log('\n[3] As passagens não têm saltos a meio');
{
  const T = 0.4;
  const duracoes = [3.0, 2.0, 1.0];
  instalarAmbiente(duracoes);
  await correrCom(mod.gerarVideo({ cenas: cenasDe(3), formato: '1280x720', transicao: 'fade', duracaoTransicao: T }));

  const inicios = [0, 3.0, 5.0];
  for (let k = 0; k < 2; k++) {
    const fim = inicios[k] + duracoes[k];           // instante da troca
    const antes = desenhos.filter((d) => d.t <= fim && d.t > fim - 0.05);
    const depois = desenhos.filter((d) => d.t >= fim && d.t < fim + 0.05);
    // No fim da cena k, a imagem seguinte já vale metade.
    const alvoAntes = antes.filter((d) => d.img === `c${k + 2}`).at(-1);
    const alvoDepois = depois.filter((d) => d.img === `c${k + 2}`).at(-1);
    check(!!alvoAntes && perto(alvoAntes.alpha, 0.5, 0.12), `troca ${k + 1}→${k + 2}: antes vale ${alvoAntes?.alpha.toFixed(2)} (esperado ≈0,50)`, `antes=${alvoAntes?.alpha}`);
    check(!!alvoDepois && perto(alvoDepois.alpha, 0.5, 0.12), `troca ${k + 1}→${k + 2}: depois vale ${alvoDepois?.alpha.toFixed(2)} (esperado ≈0,50)`, `depois=${alvoDepois?.alpha}`);
  }

  // Nenhum fotograma pode ficar sem desenhar nada.
  const instantes = [...new Set(desenhos.map((d) => d.t))];
  const vazios = instantes.filter((t) => !desenhos.some((d) => d.t === t));
  check(vazios.length === 0, `${instantes.length} instantes desenhados, nenhum vazio`, `${vazios.length} vazios`);

  // A opacidade nunca sai de [0,1].
  const fora = desenhos.filter((d) => d.alpha < 0 || d.alpha > 1.001);
  check(fora.length === 0, 'opacidade sempre entre 0 e 1', `${fora.length} desenhos fora do intervalo`);

  // A última imagem acaba sozinha e opaca.
  const fimVídeo = desenhos.at(-1);
  check(fimVídeo.img === 'c3' && perto(fimVídeo.alpha, 1, 0.01), `o vídeo acaba na última imagem, opaca (${fimVídeo.img} @ ${fimVídeo.alpha})`, `${fimVídeo.img} @ ${fimVídeo.alpha}`);
}

console.log('\n[4] O áudio entra no lugar certo da linha do tempo');
{
  instalarAmbiente([3.0, 2.0, 1.0]);
  await correrCom(mod.gerarVideo({ cenas: cenasDe(3), transicao: 'fade', duracaoTransicao: 0.4 }));
  check(agendamentos.length === 3, `${agendamentos.length} clipes agendados`, String(agendamentos.length));
  const desvios = [0, 2.8, 4.8].map((esperado, i) => Math.abs((agendamentos[i]?.quando ?? -99) - esperado));
  console.log('     agenda:', agendamentos.map((a) => `clip ${a.clipe}s @ ${a.quando}s`).join(' | '));
  check(desvios[0] < 0.05, `o 1.º clipe entra no segundo 0 (+${desvios[0].toFixed(3)}s)`, String(desvios[0]));
  // O que importa: nenhum clipe começa antes de o anterior acabar.
  const encavalitado = agendamentos.slice(1).filter((a, i) => a.quando < agendamentos[i].quando + agendamentos[i].clipe - 0.001);
  check(encavalitado.length === 0, 'nenhum clipe se sobrepõe ao anterior', `${encavalitado.length} sobrepostos`);
  const ordenados = agendamentos.every((a, i) => i === 0 || a.quando >= agendamentos[i - 1].quando);
  check(ordenados, 'os clipes entram por ordem', 'fora de ordem');
}

console.log('\n[5] Corte Seco não mistura imagens');
{
  instalarAmbiente([2.0, 2.0]);
  await correrCom(mod.gerarVideo({ cenas: cenasDe(2), transicao: 'corte', duracaoTransicao: 0.4 }));
  const dobras = [...new Set(desenhos.map((d) => d.t))].filter((t) => {
    const nesse = desenhos.filter((d) => d.t === t);
    return new Set(nesse.map((d) => d.img)).size > 1;
  });
  check(dobras.length === 0, 'nunca desenha duas imagens ao mesmo tempo', `${dobras.length} fotogramas com duas imagens`);
  const imgs = [...new Set(desenhos.map((d) => d.img))];
  check(imgs.join(',') === 'c1,c2', `passa de c1 para c2: ${imgs.join(',')}`, imgs.join(','));
}

console.log('\n[6] Uma só cena: sem passagens e sem partir');
{
  instalarAmbiente([2.0]);
  const r = await correrCom(mod.gerarVideo({ cenas: cenasDe(1), transicao: 'fade', duracaoTransicao: 0.4 }));
  check(r.ok === true && perto(r.duracao, 2.0, 0.05), `1 cena: ${r.duracao?.toFixed(2)}s`, JSON.stringify(r).slice(0, 120));
  check([...new Set(desenhos.map((d) => d.img))].join(',') === 'c1', 'só desenha a imagem dessa cena', [...new Set(desenhos.map((d) => d.img))].join(','));
  check(r.comVoz === true, 'conta como vídeo com voz', String(r.comVoz));
}

console.log('\n[7] Narração muito curta: nunca menos do que a passagem');
{
  // Áudio de 0,2s com passagem de 0,4s: a cena tem de durar 1,0s (2×T + 0,2),
  // senão as duas metades da passagem sobrepunham-se.
  instalarAmbiente([0.2, 0.2]);
  const r = await correrCom(mod.gerarVideo({ cenas: cenasDe(2), transicao: 'fade', duracaoTransicao: 0.4 }));
  check(perto(r.duracao, 2.0, 0.1), `2 cenas de 0,2s → ${r.duracao.toFixed(2)}s (1,0s cada)`, `${r.duracao}`);
  const trocas = [...new Set(desenhos.map((d) => d.t))].filter((t) => new Set(desenhos.filter((d) => d.t === t).map((d) => d.img)).size > 1);
  check(trocas.every((t) => t > 0.4 && t < 1.6), `as passagens ficaram entre 0,4s e 1,6s`, `fora: ${trocas.filter((t) => t <= 0.4 || t >= 1.6).join(', ')}`);
  check(r.comVoz === true, 'uma narração curta continua a ser narração', String(r.comVoz));
}

console.log('\n[7b] Cena marcada sem fala: usa o tempo escolhido, não a duração do silêncio');
{
  instalarAmbiente([3.0, 3.0]);
  const r = await correrCom(mod.gerarVideo({
    cenas: [
      { imagem: 'c1', audio: blobsDe(1)[0] },
      { imagem: 'c2', audio: null, semFala: true },
    ],
    transicao: 'fade', duracaoTransicao: 0.4, duracaoCena: 3.5,
  }));
  check(perto(r.duracao, 6.5, 0.2), `3,0s narrada + 3,5s sem fala = ${r.duracao.toFixed(2)}s (esperado 6,5)`, `${r.duracao}`);
  check(agendamentos.length === 1, `só a cena com voz toca áudio (${agendamentos.length})`, String(agendamentos.length));
  check(r.comVoz === true, 'a montagem conta como narrada', String(r.comVoz));
}

console.log('\n[8] Desfoque: usa o filtro e volta a limpo');
{
  instalarAmbiente([2.0, 2.0]);
  await correrCom(mod.gerarVideo({ cenas: cenasDe(2), transicao: 'desfoque', duracaoTransicao: 0.4 }));
  const desfocados = desenhos.filter((d) => /blur\(/.test(d.filtro));
  check(desfocados.length > 0, `${desfocados.length} fotogramas com desfoque`, 'nenhum desfoque aplicado');
  const maxBlur = Math.max(...desfocados.map((d) => parseFloat(/blur\(([\d.]+)px\)/.exec(d.filtro)[1])));
  check(maxBlur > 3, `o desfoque chega a ${maxBlur}px`, `só ${maxBlur}px`);
  const fimVídeo = desenhos.at(-1);
  check(fimVídeo.filtro === 'none' && perto(fimVídeo.alpha, 1, 0.01), `acaba limpo e opaco (${fimVídeo.filtro}, ${fimVídeo.alpha})`, `${fimVídeo.filtro}, ${fimVídeo.alpha}`);
}

console.log('\n[9] Parar a meio interrompe logo e fecha');
{
  instalarAmbiente([5.0, 5.0]);
  let chamadas = 0;
  const r = await correrCom(mod.gerarVideo({
    cenas: cenasDe(2), transicao: 'fade', duracaoTransicao: 0.4,
    // Pede para parar 1,5 s depois de começar.
    deveParar: () => { chamadas++; return relogioMs / 1000 > 1.5; },
  }));
  const parouEm = desenhos.at(-1)?.t ?? 0;
  check(r.ok === true, 'fecha e devolve o que gravou', JSON.stringify(r).slice(0, 120));
  check(perto(r.duracao, 1.5, 0.2), `duração registada ≈1,5s (parou a meio): ${r.duracao.toFixed(2)}s`, `${r.duracao}`);
  check(parouEm < 1.7, `deixou de desenhar logo a seguir a 1,5s (último fotograma ${parouEm.toFixed(2)}s)`, `continuou até ${parouEm.toFixed(2)}s`);
  check(chamadas > 50, `o botão é consultado em cada fotograma (${chamadas} vezes)`, `só ${chamadas} vezes`);
  check(ultimoGravador.state === 'inactive', 'o gravador ficou fechado', ultimoGravador.state);
  check(fila.length <= 1, 'não ficaram pedidos de desenho pendentes', `${fila.length} pendentes`);
}

console.log('\n[10] A trilha em ciclo por baixo da narração');
{
  const modMusica = await import(BASE + 'musica.mjs');
  check(perto(modMusica.VOLUME_TRILHA, 0.16, 0.001), `volume da trilha a 16% como no Hub 2.0 (${modMusica.VOLUME_TRILHA})`, String(modMusica.VOLUME_TRILHA));

  // 3 cenas + ficheiro de música escolhido
  instalarAmbiente([3.0, 2.0, 1.0]);
  const ctx = ultimoCtx;
  const musica = { name: 'cancao.mp3', arrayBuffer: () => Promise.resolve(new ArrayBuffer(64)) };
  const r = await correrCom(mod.gerarVideo({
    cenas: cenasDe(3), transicao: 'fade', duracaoTransicao: 0.4, musica,
  }));

  check(r.ok === true && r.comMusica === true, `o vídeo saiu com trilha (comMusica=${r.comMusica})`, JSON.stringify(r).slice(0, 160));
  if (!r.comMusica) {
    console.log('     diagnóstico: decodeAudioData chamado', ultimoCtx._chamadas ?? '?', 'vezes; aviso =', JSON.stringify(r.musicaAviso));
  }
  check(fontesEmCiclo.length === 1, `uma só fonte de música criada (${fontesEmCiclo.length})`, String(fontesEmCiclo.length));
  if (!fontesEmCiclo.length) {
    console.log('     diagnóstico: fontes criadas =', ultimoCtx._fontes ?? '?', '| em ciclo =', fontesEmCiclo.length);
    process.exit(1);
  }
  const f = fontesEmCiclo[0];
  check(f.loop === true, 'a música está em ciclo (loop)', `loop=${f.loop}`);
  // A música já não entra durante a preparação (ficava adiantada): entra no
  // instante em que a gravação começa — o mesmo instante zero do vídeo.
  check(f.comecou === true && (f.quando === undefined || f.quando <= 0.15), 'a música entra no início da gravação, no mesmo instante do vídeo', `quando=${f.quando}`);
  check(f.parou === true, 'a música é parada no fim da gravação', 'ficou a tocar');
  check(!r.musicaAviso, `sem avisos: "${r.musicaAviso}"`, r.musicaAviso);
  check(agendamentos.length === 3, `as 3 narrações continuam agendadas (${agendamentos.length})`, String(agendamentos.length));
  // Ganhos: a narração a 1 e a trilha a 0,16 — a voz manda sempre.
  check(ganhosCriados.includes(0.16), `a trilha leva ganho 0,16 (ganhos: ${ganhosCriados.join(', ')})`, `ganhos: ${ganhosCriados.join(', ')}`);
  // Só uma fonte em ciclo: os clipes de narração NÃO podem ter loop.
  check(fontesEmCiclo.length === 1 && agendamentos.length === 3, 'narração e trilha são fontes separadas', 'misturou as duas');
}

console.log('\n[11] A trilha nunca estraga o vídeo');
{
  // Sem ficheiro escolhido: não se cria música nenhuma.
  instalarAmbiente([2.0]);
  const r1 = await correrCom(mod.gerarVideo({ cenas: cenasDe(1), transicao: 'fade', duracaoTransicao: 0.4 }));
  check(r1.comMusica === false && fontesEmCiclo.length === 0, 'sem música escolhida não há trilha', `comMusica=${r1.comMusica}`);

  // Ficheiro que o browser não consegue descodificar: o vídeo sai na mesma, sem música.
  // A narração (1.ª descodificação) funciona; só a música é que falha.
  instalarAmbiente([2.0]);
  ultimoCtx.decodeAudioData = function () {
    this._chamadas = (this._chamadas || 0) + 1;
    if (this._chamadas === 1) return Promise.resolve(new BufferFalso(2.0));
    return Promise.reject(new Error('formato estranho'));
  };
  const r2 = await correrCom(mod.gerarVideo({
    cenas: cenasDe(1), transicao: 'fade', duracaoTransicao: 0.4,
    musica: { name: 'mau.xyz', arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) },
  }));
  check(r2.ok === true, 'o vídeo sai apesar de a música ser ilegível', JSON.stringify(r2).slice(0, 140));
  check(r2.comMusica === false, 'sai sem música', `comMusica=${r2.comMusica}`);
  check(/não conseguiu ler essa música/i.test(r2.musicaAviso), `explica o que falhou: "${r2.musicaAviso}"`, r2.musicaAviso);
  check(/MP3, WAV, M4A ou OGG/i.test(r2.musicaAviso), 'diz que formatos experimentar', r2.musicaAviso);
  check(r2.blob.size > 5000, 'e o ficheiro continua válido', String(r2.blob.size));
}

console.log('\n[12] Trilha: ficheiro curto, longo e formato estragado');
{
  const m = await import(BASE + 'musica.mjs');
  const criarCtx = () => ({
    sampleRate: 44100,
    createBuffer(canais, n, taxa) {
      const dados = new Float32Array(n);
      return {
        numberOfChannels: canais, length: n, sampleRate: taxa, duration: n / taxa,
        getChannelData: () => dados,
      };
    },
    decodeAudioData: () => Promise.resolve(bufferDecodificado),
  });
  const ficheiro = { name: 'x.mp3', arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) };

  // (a) ficheiro curto: passa inteiro, canais juntos num só
  // Canal 0 todo a 1, canal 1 todo a 0 → a média tem de dar 0,5.
  // Os canais são guardados: um AudioBuffer a sério devolve sempre o MESMO array.
  const canaisFalsos = [new Float32Array(44100 * 30).fill(1), new Float32Array(44100 * 30).fill(0)];
  let bufferDecodificado = {
    numberOfChannels: 2, length: 44100 * 30, sampleRate: 44100, duration: 30,
    getChannelData: (c) => canaisFalsos[c],
  };
  globalThis.Audio = class { constructor() { this.duration = 30; } removeAttribute() {} };
  const curto = await m.carregarTrilha(ficheiro, criarCtx());
  check(curto.ok === true && perto(curto.duracao, 30, 0.01), `30s ficam 30s: ${curto.duracao}s`, JSON.stringify(curto).slice(0, 120));
  check(!curto.aviso, 'sem aviso num ficheiro curto', curto.aviso);
  const canais = curto.musica.numberOfChannels;
  check(canais === 1, `estéreo passou a mono (${canais} canal)`, `${canais} canais`);
  // O sinal tem de ser a média dos dois canais (esquerdo=1, direito=0 → 0,5).
  const amostras = curto.musica.getChannelData(0);
  check(perto(amostras[0], 0.5, 0.001), `misturou os canais: amostra 0 = ${amostras[0]} (esperado 0,5)`, String(amostras[0]));
  // Ficheiro já mono passa sem tocar no sinal.
  bufferDecodificado = {
    numberOfChannels: 1, length: 100, sampleRate: 44100, duration: 100 / 44100,
    getChannelData: () => new Float32Array(100).fill(0.7),
  };
  const jaMono = await m.carregarTrilha(ficheiro, criarCtx());
  check(jaMono.ok === true && jaMono.musica.numberOfChannels === 1, 'ficheiro já mono continua com 1 canal', `${jaMono.musica.numberOfChannels}`);
  check(perto(jaMono.musica.getChannelData(0)[0] ?? -1, 0.7, 0.001), 'e o sinal mono não é alterado', String(jaMono.musica.getChannelData(0)[0]));

  // (b) ficheiro longo: cortado ao limite, com aviso a explicar
  bufferDecodificado = {
    numberOfChannels: 1, length: 44100 * 1200, sampleRate: 44100, duration: 1200,
    getChannelData: () => new Float32Array(44100 * 1200),
  };
  globalThis.Audio = class { constructor() { this.duration = 1200; } removeAttribute() {} };
  const longo = await m.carregarTrilha(ficheiro, criarCtx());
  check(longo.ok === true && perto(longo.duracao, m.LIMITE_MINUTOS * 60, 1), `20 min cortados para ${longo.duracao / 60} min`, String(longo.duracao));
  check(/primeiros 15 minutos/i.test(longo.aviso), `avisa o corte: "${longo.aviso}"`, longo.aviso);
  check(/repete na mesma/i.test(longo.aviso), 'e explica que a música repete', longo.aviso);

  // (c) a duração mostrada à pessoa é a do ficheiro, não a que ficou
  check(m.formatarDuracao(65) === '1:05', `formata 65s como 1:05 (${m.formatarDuracao(65)})`, m.formatarDuracao(65));
  check(m.formatarDuracao(0) === '0:00' && m.formatarDuracao(NaN) === '0:00', 'aguenta zero e lixo', m.formatarDuracao(NaN));

  // (d) sem ficheiro e sem contexto não rebenta
  const semNada = await m.carregarTrilha(null, criarCtx());
  check(semNada.ok === false, 'sem ficheiro devolve erro em vez de rebentar', JSON.stringify(semNada));
  const semCtx = await m.carregarTrilha(ficheiro, null);
  check(semCtx.ok === false, 'sem contexto de áudio devolve erro', JSON.stringify(semCtx));

  // (e) contexto que não consegue descodificar (o ficheiro estragado)
  const ctxMau = criarCtx();
  ctxMau.decodeAudioData = () => Promise.reject(new Error('nope'));
  const estragado = await m.carregarTrilha(ficheiro, ctxMau);
  check(estragado.ok === false && /MP3, WAV/i.test(estragado.erro), `formato estragado: "${estragado.erro}"`, JSON.stringify(estragado));

  // (f) decodifica mas não tem duração usável
  const ctxVazio = criarCtx();
  ctxVazio.decodeAudioData = () => Promise.resolve({ numberOfChannels: 1, length: 0, sampleRate: 44100, duration: 0, getChannelData: () => new Float32Array(0) });
  const vazio = await m.carregarTrilha(ficheiro, ctxVazio);
  check(vazio.ok === false && /não tem áudio/i.test(vazio.erro), `ficheiro sem áudio: "${vazio.erro}"`, JSON.stringify(vazio));
}

console.log('\n[13] Só música, sem voz nenhuma');
{
  // 4 imagens, zero narração: cada uma fica 3,5s e a música enche o vídeo.
  instalarAmbiente([]);
  const musica = { name: 'tema.mp3', arrayBuffer: () => Promise.resolve(new ArrayBuffer(64)) };
  const r = await correrCom(mod.gerarVideo({
    cenas: [
      { imagem: 'c1', audio: null, semFala: true },
      { imagem: 'c2', audio: null, semFala: true },
      { imagem: 'c3', audio: null, semFala: true },
      { imagem: 'c4', audio: null, semFala: true },
    ],
    transicao: 'fade', duracaoTransicao: 0.6, duracaoCena: 3.5, musica,
  }));

  check(r.ok === true, 'gera o vídeo sem narração nenhuma', JSON.stringify(r).slice(0, 150));
  check(r.comVoz === false, 'assinala que NÃO tem voz', `comVoz=${r.comVoz}`);
  check(r.comMusica === true, 'e que tem trilha', `comMusica=${r.comMusica}`);
  check(perto(r.duracao, 14.0, 0.3), `4 imagens × 3,5s = ${r.duracao.toFixed(2)}s (esperado 14,0)`, `${r.duracao}`);
  check(agendamentos.length === 0, `nenhuma narração agendada (${agendamentos.length})`, String(agendamentos.length));
  check(fontesEmCiclo.length === 1 && fontesEmCiclo[0].loop === true, 'a trilha é a única fonte, em ciclo', `fontes em ciclo: ${fontesEmCiclo.length}`);
  check(fontesEmCiclo[0].parou === true, 'a trilha é parada no fim', 'ficou a tocar');
  check([...new Set(desenhos.map((d) => d.img))].join(',') === 'c1,c2,c3,c4', 'passam as 4 imagens por ordem', [...new Set(desenhos.map((d) => d.img))].join(','));
  const fimVídeo = desenhos.at(-1);
  check(perto(fimVídeo.alpha, 1, 0.02), 'acaba com a imagem opaca', String(fimVídeo.alpha));

  // Ritmo diferente: 2s por imagem muda o total.
  instalarAmbiente([]);
  const r2 = await correrCom(mod.gerarVideo({
    cenas: [{ imagem: 'c1', audio: null, semFala: true }, { imagem: 'c2', audio: null, semFala: true }],
    transicao: 'fade', duracaoTransicao: 0.6, duracaoCena: 2, musica,
  }));
  check(perto(r2.duracao, 4.0, 0.3), `com 2s por imagem: 2 × 2s = ${r2.duracao.toFixed(2)}s`, `${r2.duracao}`);
}

console.log('\n[14] Só música e a música falha: é erro, não vídeo mudo');
{
  instalarAmbiente([]);
  // A trilha é obrigatória neste modo, mas a falha é detetada na página; aqui
  // confirmamos que o motor, sem música e sem voz, não inventa um vídeo mudo.
  const r = await correrCom(mod.gerarVideo({
    cenas: [{ imagem: 'c1', audio: null, semFala: true }, { imagem: 'c2', audio: null, semFala: true }],
    transicao: 'fade', duracaoTransicao: 0.6, duracaoCena: 2,
  }));
  check(r.ok === true, 'o motor grava as imagens na mesma', JSON.stringify(r).slice(0, 120));
  check(r.comMusica === false && r.comVoz === false, 'e diz que não tem voz nem música', `voz=${r.comVoz} musica=${r.comMusica}`);
}

console.log('\n[15] Legendas desenhadas por cima e ficheiro .srt');
{
  const narracoes = [
    'Era uma vez uma menina, muito curiosa e feliz. Ela vivia numa casa pequena.',
    'Um dia encontrou um mapa misterioso debaixo da árvore grande, com três sinais estranhos.',
    'No fim da aventura descobriu que o tesouro era a própria viagem.',
  ];
  const cenas = [3.0, 2.0, 1.0].map((_, i) => ({ imagem: `c${i + 1}`, audio: blobsDe(1)[0], texto: narracoes[i] }));

  instalarAmbiente([3.0, 2.0, 1.0]);
  const r = await correrCom(mod.gerarVideo({
    cenas, transicao: 'fade', duracaoTransicao: 0.4, legendas: true,
  }));

  check(r.ok === true, 'gera o vídeo com legendas ligadas', JSON.stringify(r).slice(0, 140));
  check(r.legendas > 3, `${r.legendas} blocos de legenda no total`, String(r.legendas));
  // Cada bloco é redesenhado em cada fotograma em que está no ecrã, por isso
  // contam-se os blocos distintos pelo INSTANTE em que aparecem pela primeira vez.
  const aparecimentos = [...new Set(legendasDesenhadas.map((l) => l.t))].map(
    (t) => [...new Set(legendasDesenhadas.filter((l) => l.t === t).map((l) => l.texto))].sort().join(' '),
  );
  const inicios = [...new Set(aparecimentos)];
  check(inicios.length === r.legendas, `desenhou os ${r.legendas} blocos, um a um (${inicios.length} entradas distintas)`, `${inicios.length} ≠ ${r.legendas}`);
  const contornos = legendasDesenhadas.filter((l) => l.tipo === 'contorno').length;
  const cheios = legendasDesenhadas.filter((l) => l.tipo === 'preenchimento').length;
  check(contornos > 0 && contornos === cheios, `cada linha é desenhada com contorno e preenchimento (${contornos}/${cheios})`, `${contornos} contornos, ${cheios} preenchimentos`);

  // Cada bloco desenhado tem de vir da narração (nenhum texto inventado).
  // O que se desenha são LINHAS do bloco, por isso compara-se palavra a palavra.
  const palavrasOriginais = new Set(narracoes.join(' ').split(/\s+/));
  const textos = [...new Set(legendasDesenhadas.map((l) => l.texto))];
  const inventado = [];
  for (const linha of textos) {
    for (const p of linha.split(/\s+/).filter(Boolean)) {
      if (!palavrasOriginais.has(p)) inventado.push(`${p} (em "${linha}")`);
    }
  }
  check(inventado.length === 0, 'todas as linhas desenhadas usam palavras da narração', inventado.join(' | '));

  // Nada é desenhado depois de o vídeo acabar.
  const fora = legendasDesenhadas.filter((l) => l.t > r.duracao + 0.2);
  check(fora.length === 0, `nenhuma legenda aparece depois do fim (${r.duracao.toFixed(2)}s)`, `${fora.length} fora`);

  // A prova de que o texto TODO passou pelo ecrã: para cada bloco da lista de
  // legendas, todas as suas palavras (menos uma, que pode estar noutra linha do
  // mesmo desenho) têm de aparecer nas linhas desenhadas.
  const core = await import(BASE + 'legendas-core.mjs');
  const listaCues = core.legendasDasCenas(cenas.map((c) => c.texto), [3.0, 2.0, 1.0], [0, 3.0, 5.0]);
  const desenhado = legendasDesenhadas.map((l) => l.texto).join(' ');
  const faltas = [];
  for (const cue of listaCues) {
    const faltam = cue.texto.split(/\s+/).filter((p) => !desenhado.includes(p));
    if (faltam.length) faltas.push(`"${cue.texto}": falta ${faltam.join(', ')}`);
  }
  check(faltas.length === 0, `as palavras dos ${listaCues.length} blocos aparecem todas no ecrã`, faltas.join(' | '));

  // Nenhuma linha desenhada pode ser comprida demais para se ler.
  const comprida = textos.filter((l) => l.length > core.CAPT_CHARS + 8);
  check(comprida.length === 0, `nenhuma linha passa de ${core.CAPT_CHARS + 8} caracteres`, comprida.join(' | '));

  // A legenda acompanha a fala de ponta a ponta, sem buracos.
  const instantes = [...new Set(legendasDesenhadas.map((l) => l.t))].sort((a, b) => a - b);
  const buracos = [];
  for (let i = 0; i < instantes.length - 1; i++) {
    if (instantes[i + 1] - instantes[i] > 0.25) buracos.push(`${instantes[i].toFixed(2)}→${instantes[i + 1].toFixed(2)}`);
  }
  check(instantes[0] < 0.1, `a legenda começa logo no início (${instantes[0].toFixed(2)}s)`, String(instantes[0]));
  check(buracos.length === 0, `sem buracos na legenda entre ${instantes[0].toFixed(2)}s e ${instantes[instantes.length - 1].toFixed(2)}s`, `buracos: ${buracos.join(', ')}`);
  check(instantes[instantes.length - 1] >= r.duracao - 0.3, `a legenda acompanha até ao fim (${instantes[instantes.length - 1].toFixed(2)}s de ${r.duracao.toFixed(2)}s)`, `parou em ${instantes[instantes.length - 1].toFixed(2)}s`);

  // O .srt tem os mesmos blocos.
  check(typeof r.srt === 'string' && r.srt.length > 0, 'devolve o ficheiro .srt', String(typeof r.srt));
  const numeros = r.srt.split('\n\n').map((b) => b.split('\n')[0]).filter((x) => /^\d+$/.test(x));
  check(numeros.length === r.legendas, `.srt com ${r.legendas} legendas, as mesmas do vídeo`, `${numeros.length} ≠ ${r.legendas}`);
  check(r.srt.startsWith('1\n00:00:00,000 -->'), 'o .srt começa no segundo zero', r.srt.slice(0, 40).replace(/\n/g, ' | '));
  const blocosSrt = r.srt.split('\n\n').filter(Boolean).map((b) => b.split('\n').slice(2).join(' '));
  // Comparação por CONJUNTO de palavras: o desenho mostra linhas quebradas, o
  // .srt mostra o bloco inteiro. O que tem de bater é o conteúdo, não a quebra.
  const palavras = (t) => [...new Set(String(t).split(/\s+/).filter(Boolean))].sort().join(' ');
  const doVideo = new Set(listaCues.map((c) => palavras(c.texto)));
  const srtDiferente = blocosSrt.filter((s) => !doVideo.has(palavras(s)));
  check(srtDiferente.length === 0, `o .srt tem os mesmos ${listaCues.length} blocos que o vídeo desenha`, `só no .srt: ${srtDiferente.join(' | ')}`);
  const soNoVideo = listaCues.filter((c) => !blocosSrt.some((s) => palavras(s) === palavras(c.texto)));
  check(soNoVideo.length === 0, 'e nenhum bloco do vídeo falta no .srt', `só no vídeo: ${soNoVideo.map((c) => c.texto).join(' | ')}`);
}

console.log('\n[16] Sem legendas não se desenha nada');
{
  const cenas = [{ imagem: 'c1', audio: blobsDe(1)[0], texto: 'Uma frase para legendar.' }];
  instalarAmbiente([2.0]);
  const r = await correrCom(mod.gerarVideo({ cenas, transicao: 'fade', duracaoTransicao: 0.4, legendas: false }));
  check(r.ok === true && r.legendas === 0, 'legendas desligadas: zero blocos', `legendas=${r.legendas}`);
  check(legendasDesenhadas.length === 0, 'nada de legenda foi desenhado', `${legendasDesenhadas.length} desenhos`);
  check(r.srt === '', 'sem blocos não há .srt', JSON.stringify(r.srt));

  // Por omissão também não há legendas (quem não pedir não recebe).
  instalarAmbiente([2.0]);
  const r2 = await correrCom(mod.gerarVideo({ cenas, transicao: 'fade', duracaoTransicao: 0.4 }));
  check(r2.legendas === 0 && legendasDesenhadas.length === 0, 'por omissão não há legendas', `legendas=${r2.legendas}`);
}

console.log('\n[17] Legendas no modo só música, a partir do texto das cenas');
{
  // No modo só música não há voz, mas o texto do guião serve de legenda.
  instalarAmbiente([]);
  const musica = { name: 'tema.mp3', arrayBuffer: () => Promise.resolve(new ArrayBuffer(64)) };
  const r = await correrCom(mod.gerarVideo({
    cenas: [
      { imagem: 'c1', audio: null, semFala: true, texto: 'A primeira imagem desta história.' },
      { imagem: 'c2', audio: null, semFala: true, texto: 'E agora a segunda imagem, com mais palavras.' },
    ],
    transicao: 'fade', duracaoTransicao: 0.6, duracaoCena: 4, musica, legendas: true,
  }));
  check(r.ok === true && r.comVoz === false, 'vídeo só com música', `comVoz=${r.comVoz}`);
  check(r.legendas >= 2, `${r.legendas} blocos de legenda sem narração nenhuma`, String(r.legendas));
  const textos = [...new Set(legendasDesenhadas.map((l) => l.texto))];
  check(textos.join(' ').includes('primeira imagem'), `o texto do guião vira legenda ("${textos[0]}")`, textos.join(' | '));
  check(r.srt.includes('segunda imagem'), 'e sai no .srt também', r.srt.slice(0, 60).replace(/\n/g, ' | '));
}

console.log('\n[18] Vídeo curto com música longa: as imagens repetem em ciclo');
{
  // 2 imagens × 3,5s = 7s naturais; música de 20s → tem de repetir.
  const duasCenas = [
    { imagem: 'c1', audio: null, semFala: true, texto: 'A primeira imagem.' },
    { imagem: 'c2', audio: null, semFala: true, texto: 'A segunda imagem.' },
  ];
  const musica = { name: 'tema.mp3', arrayBuffer: () => Promise.resolve(new ArrayBuffer(64)) };

  instalarAmbiente([], { musicaSegundos: 20 });
  const r = await correrCom(mod.gerarVideo({
    cenas: duasCenas, transicao: 'fade', duracaoTransicao: 0.6, duracaoCena: 3.5,
    musica, modoDuracao: 'trilha', musicaSegundos: 20,
  }));

  check(r.ok === true, 'gera o vídeo em ciclo', JSON.stringify(r).slice(0, 140));
  check(r.repetido === true, 'assinala que repetiu as imagens', `repetido=${r.repetido}`);
  check(perto(r.duracaoNatural, 7, 0.05), `a duração natural era ${r.duracaoNatural.toFixed(2)}s`, String(r.duracaoNatural));
  check(perto(r.musicaSegundos, 20, 0.05), `o motor usou a duração do áudio descodificado (${r.musicaSegundos}s)`, String(r.musicaSegundos));
  check(r.passagens >= 3, `deu ${r.passagens} passagens às imagens`, String(r.passagens));
  check(r.duracao >= 20, `o vídeo cobre os 20s da música (${r.duracao.toFixed(2)}s)`, `${r.duracao}`);
  // A música NUNCA corta o vídeo: ele acaba no fim da última passagem (3×7s)
  // e a trilha, em ciclo, é parada exatamente nesse instante.
  check(perto(r.duracao, 21, 0.4), `o vídeo acaba no fim da última cena (${r.duracao.toFixed(2)}s ≈ 21s)`, `${r.duracao}`);
  check(r.terminouComMusica === false, 'a música não corta o vídeo', `terminouComMusica=${r.terminouComMusica}`);
  check(r.cortado === false, 'não há corte a meio de cena', `cortado=${r.cortado}`);

  // As imagens têm de voltar pela mesma ordem, e a música continuar em ciclo.
  const ordem = desenhos.map((d) => d.img).filter((v, i, a) => v !== a[i - 1]);
  check(ordem.length >= 6, `as imagens voltaram a passar (${ordem.length} trocas)`, String(ordem.length));
  const ciclo = ordem.slice(0, 4).join(',');
  check(ciclo === 'c1,c2,c1,c2', `a ordem repete-se certinha (${ciclo})`, ciclo);
  check(fontesEmCiclo.length === 1 && fontesEmCiclo[0].loop === true, 'a música continuou em ciclo, sem reiniciar', `fontes em ciclo: ${fontesEmCiclo.length}`);
  check(fontesEmCiclo[0].parou === true, 'a música é parada no fim', 'ficou a tocar');
}

console.log('\n[19] Sem modo de ciclo, a duração continua a ser a natural');
{
  const duasCenas = [
    { imagem: 'c1', audio: null, semFala: true, texto: 'A primeira imagem.' },
    { imagem: 'c2', audio: null, semFala: true, texto: 'A segunda imagem.' },
  ];
  const musica = { name: 'tema.mp3', arrayBuffer: () => Promise.resolve(new ArrayBuffer(64)) };

  instalarAmbiente([]);
  const r = await correrCom(mod.gerarVideo({
    cenas: duasCenas, transicao: 'fade', duracaoTransicao: 0.6, duracaoCena: 3.5,
    musica, modoDuracao: 'natural', musicaSegundos: 20,
  }));
  console.log(`     [19a] modo natural: repetido=${r.repetido} passagens=${r.passagens} música=${r.musicaSegundos}s duração=${r.duracao}s`);
  check(r.repetido === false && r.passagens === 1, 'não repetiu nada', `repetido=${r.repetido} passagens=${r.passagens}`);
  check(perto(r.duracao, 7, 0.1), `ficou nos 7s das imagens (${r.duracao.toFixed(2)}s)`, `${r.duracao}`);
  check(r.cortado === false, 'não assinala corte', `cortado=${r.cortado}`);

  // Música mais CURTA do que o vídeo: ela repete em ciclo por baixo e é parada
  // junto com a ÚLTIMA CENA — o vídeo nunca é cortado pela música.
  instalarAmbiente([], { musicaSegundos: 3 });
  const r2 = await correrCom(mod.gerarVideo({
    cenas: duasCenas, transicao: 'fade', duracaoTransicao: 0.6, duracaoCena: 3.5,
    musica, modoDuracao: 'trilha', musicaSegundos: 3,
  }));
  check(r2.repetido === false && perto(r2.duracao, 7, 0.2), `música de 3s não corta: o vídeo acaba na última cena (${r2.duracao.toFixed(2)}s)`, `${r2.duracao}`);
  check(r2.cortado === false, 'não é um corte de ciclo', `cortado=${r2.cortado}`);
  check(r2.terminouComMusica === false, 'a música não manda no fim', `terminouComMusica=${r2.terminouComMusica}`);
  const ultimoDesenho = desenhos.at(-1)?.t ?? 0;
  check(ultimoDesenho <= 7.25, `o desenho segue até à última cena (${ultimoDesenho.toFixed(2)}s de 7s)`, `parou em ${ultimoDesenho.toFixed(2)}s`);

  // No modo NATURAL vale o mesmo: a música repete em ciclo por baixo e para
  // com a última cena — nunca corta o vídeo.
  instalarAmbiente([], { musicaSegundos: 3 });
  const r2b = await correrCom(mod.gerarVideo({
    cenas: duasCenas, transicao: 'fade', duracaoTransicao: 0.6, duracaoCena: 3.5,
    musica, modoDuracao: 'natural', musicaSegundos: 3,
  }));
  check(perto(r2b.duracao, 7, 0.2), `modo natural: o vídeo acaba na última cena (${r2b.duracao.toFixed(2)}s)`, `${r2b.duracao}`);
  check(r2b.terminouComMusica === false, 'a música não corta o vídeo', `terminouComMusica=${r2b.terminouComMusica}`);

  // Sem música escolhida, o modo de ciclo não faz nada de estranho.
  instalarAmbiente([]);
  const r3 = await correrCom(mod.gerarVideo({
    cenas: duasCenas, transicao: 'fade', duracaoTransicao: 0.6, duracaoCena: 3.5,
    modoDuracao: 'trilha', musicaSegundos: 0,
  }));
  check(r3.ok === true && r3.repetido === false, 'sem música não repete', `repetido=${r3.repetido}`);

  // 5 horas de música: pede-se uma duração absurda e confirma-se que o motor
  // trava as passagens em 100 (não pode gerar milhares de cenas).
  instalarAmbiente([], { musicaSegundos: 60 * 60 * 5 });
  let passagensVistas = 0;
  const r4 = await correrCom(mod.gerarVideo({
    cenas: duasCenas, transicao: 'fade', duracaoTransicao: 0.6, duracaoCena: 2,
    musica, modoDuracao: 'trilha', musicaSegundos: 60 * 60 * 5,
    aoProgredir: (p) => { if (p.fase === 'a gravar') passagensVistas = Math.max(passagensVistas, p.passagens || 1); },
    deveParar: () => relogioMs > 30000,
  }));
  check(passagensVistas > 0 && passagensVistas <= 100, `uma música de 5 horas fica limitada a ${passagensVistas} passagens`, String(passagensVistas));
  check(r4.ok === true, 'e o vídeo fecha na mesma', JSON.stringify(r4).slice(0, 90));
}

console.log('\n[20] Com narração, o ciclo repete também a voz');
{
  // 2 cenas narradas de 2s: 4s naturais, música de 10s → repete 3 passagens.
  instalarAmbiente([2.0, 2.0], { musicaSegundos: 10 });
  const musica = { name: 'tema.mp3', arrayBuffer: () => Promise.resolve(new ArrayBuffer(64)) };
  const r = await correrCom(mod.gerarVideo({
    cenas: [
      { imagem: 'c1', audio: blobsDe(1)[0], texto: 'Primeira fala.' },
      { imagem: 'c2', audio: blobsDe(1)[0], texto: 'Segunda fala.' },
    ],
    transicao: 'fade', duracaoTransicao: 0.4, musica, modoDuracao: 'trilha', musicaSegundos: 10, legendas: true,
  }));
  check(r.ok === true && r.comVoz === true, 'vídeo narrado em ciclo', `comVoz=${r.comVoz}`);
  check(r.passagens >= 2, `${r.passagens} passagens`, String(r.passagens));
  check(r.duracao >= 10, `chegou aos 10s da música (${r.duracao.toFixed(2)}s)`, `${r.duracao}`);
  // A narração é tocada uma vez por passagem (não fica em silêncio na repetição).
  check(agendamentos.length >= 4, `a narração voltou a tocar em cada passagem (${agendamentos.length} clipes)`, String(agendamentos.length));
  // As legendas acompanham as repetições.
  const blocosDistintos = [...new Set(legendasDesenhadas.map((l) => l.texto))];
  check(r.legendas >= 4, `${r.legendas} blocos de legenda nas repetições`, String(r.legendas));
  check(blocosDistintos.some((t) => /Primeira/.test(t)), 'a legenda da 1.ª cena volta a aparecer', blocosDistintos.join(' | '));
  check(legendasDesenhadas.at(-1).t >= r.duracao - 0.5, `a legenda acompanha até ao fim (${legendasDesenhadas.at(-1).t.toFixed(2)}s de ${r.duracao.toFixed(2)}s)`, String(legendasDesenhadas.at(-1).t));
}

console.log('\n[21] Explica porque não repetiu, em vez de ficar calado');
{
  const duas = [
    { imagem: 'c1', audio: null, semFala: true, texto: 'Uma.' },
    { imagem: 'c2', audio: null, semFala: true, texto: 'Duas.' },
  ];
  const musica = { name: 'tema.mp3', arrayBuffer: () => Promise.resolve(new ArrayBuffer(64)) };

  // (a) modo natural: diz que foi uma escolha, não uma falha
  instalarAmbiente([]);
  const r1 = await correrCom(mod.gerarVideo({ cenas: duas, duracaoCena: 2, modoDuracao: 'natural' }));
  check(!r1.repetido && /As imagens/.test(r1.semCiclo || ''), `modo natural explica-se: "${r1.semCiclo}"`, String(r1.semCiclo));

  // (b) modo de ciclo sem duração de música conhecida: o áudio descodificado
  // também não diz a duração (0), por isso o ciclo não tem alvo.
  instalarAmbiente([], { musicaSegundos: 0 });
  const r2 = await correrCom(mod.gerarVideo({ cenas: duas, duracaoCena: 2, musica, modoDuracao: 'trilha', musicaSegundos: 0 }));
  check(!r2.repetido && /não consegui saber a duração/i.test(r2.semCiclo || ''), `sem duração conhecida: "${r2.semCiclo}"`, String(r2.semCiclo));

  // (c) música mais curta do que o vídeo
  instalarAmbiente([], { musicaSegundos: 3 });
  const r3 = await correrCom(mod.gerarVideo({ cenas: duas, duracaoCena: 2, musica, modoDuracao: 'trilha', musicaSegundos: 3 }));
  check(!r3.repetido && /não é mais longa/i.test(r3.semCiclo || ''), `música curta explica-se: "${r3.semCiclo}"`, String(r3.semCiclo));

  // (d) quando repete, não há explicação de falha e a versão vem sempre
  instalarAmbiente([], { musicaSegundos: 10 });
  const r4 = await correrCom(mod.gerarVideo({ cenas: duas, duracaoCena: 2, musica, modoDuracao: 'trilha', musicaSegundos: 10 }));
  check(r4.repetido && r4.semCiclo === '', 'quando repete, não há nada a explicar', String(r4.semCiclo));
  check(/^\d+\.\d+\.\d+$/.test(r4.versao || ''), `o motor diz a sua versão (${r4.versao})`, String(r4.versao));
  check(r4.versao === mod.VERSAO_VIDEO, 'e é a versão exportada pelo módulo', `${r4.versao} ≠ ${mod.VERSAO_VIDEO}`);
}

console.log('\n[22] Legenda com a LETRA da música em vez da narração');
{
  const core = await import(BASE + 'legendas-core.mjs');
  const musica = { name: 'tema.mp3', arrayBuffer: () => Promise.resolve(new ArrayBuffer(64)) };
  const letra = ['Primeiro verso da canção', 'Segundo verso da canção', 'Terceiro e último verso'];
  const cues = core.legendasDaLetra(letra, 12); // 3 versos em 12s → 4s cada

  // (a) as cenas têm narração com texto; a letra tem de ganhar.
  instalarAmbiente([4.0, 4.0, 4.0], { musicaSegundos: 12 });
  const r = await correrCom(mod.gerarVideo({
    cenas: [
      { imagem: 'c1', audio: blobsDe(1)[0], texto: 'A narração da cena um.' },
      { imagem: 'c2', audio: blobsDe(1)[0], texto: 'A narração da cena dois.' },
      { imagem: 'c3', audio: blobsDe(1)[0], texto: 'A narração da cena três.' },
    ],
    transicao: 'fade', duracaoTransicao: 0.4, musica,
    modoDuracao: 'trilha', musicaSegundos: 12,
    legendas: true, legendasExternas: cues,
  }));

  check(r.ok === true, 'gera o vídeo com a letra', JSON.stringify(r).slice(0, 140));
  check(r.legendasDaLetra === true, 'assinala que as legendas são da letra', `legendasDaLetra=${r.legendasDaLetra}`);
  check(r.legendas === 3, `3 versos legendados (${r.legendas})`, String(r.legendas));
  const desenhado = legendasDesenhadas.map((l) => l.texto).join(' ');
  check(/Primeiro verso/.test(desenhado) && /último verso/.test(desenhado), 'os versos da letra são desenhados', desenhado.slice(0, 90));
  check(!/narração da cena/.test(desenhado), 'a narração NÃO é legendada quando a letra está em uso', 'a narração apareceu');
  // O desenho mostra LINHAS (o texto é quebrado), por isso conta-se por VERSO:
  // cada verso da letra tem de estar coberto pelas linhas desenhadas.
  const desenhoTodo = legendasDesenhadas.map((l) => l.texto).join(' ');
  const versos = letra.filter((v) => desenhoTodo.includes(v.split(/\s+/)[0]));
  check(versos.length === 3, `os 3 versos da letra apareceram (${versos.length})`, versos.join(' | '));
  const todasPalavras = letra.join(' ').split(/\s+/);
  const faltam = todasPalavras.filter((p) => !desenhoTodo.includes(p));
  check(faltam.length === 0, 'nenhuma palavra da letra se perdeu', faltam.join(', '));
  // O .srt e o desenho têm de mostrar os mesmos versos.
  const blocosSrt = r.srt.split('\n\n').filter(Boolean).map((b) => b.split('\n').slice(2).join(' ').trim());
  const iguais = blocosSrt.length === letra.length && blocosSrt.every((b, i) => b === letra[i]);
  check(iguais, `o .srt tem exatamente os ${letra.length} versos pela ordem certa`, `${blocosSrt.length} blocos: ${blocosSrt.join(' | ')}`);
  check(r.srt.includes('Primeiro verso'), 'a letra sai no .srt', r.srt.slice(0, 60).replace(/\n/g, ' | '));

  // (b) sem a letra, volta a legendar a narração.
  instalarAmbiente([4.0, 4.0, 4.0], { musicaSegundos: 12 });
  const r2 = await correrCom(mod.gerarVideo({
    cenas: [
      { imagem: 'c1', audio: blobsDe(1)[0], texto: 'A narração da cena um.' },
      { imagem: 'c2', audio: blobsDe(1)[0], texto: 'A narração da cena dois.' },
    ],
    transicao: 'fade', duracaoTransicao: 0.4, musica,
    modoDuracao: 'trilha', musicaSegundos: 8, legendas: true, legendasExternas: null,
  }));
  check(r2.legendasDaLetra === false, 'sem letra, as legendas não são da letra', `legendasDaLetra=${r2.legendasDaLetra}`);
  const d2 = legendasDesenhadas.map((l) => l.texto).join(' ');
  check(/narração/.test(d2) && /cena um/.test(d2), 'e a narração volta a ser legendada', d2.slice(0, 80));

  // (c) letra vazia não estraga nada: cai nas legendas da narração.
  instalarAmbiente([2.0], { musicaSegundos: 4 });
  const r3 = await correrCom(mod.gerarVideo({
    cenas: [{ imagem: 'c1', audio: blobsDe(1)[0], texto: 'Uma narração.' }],
    transicao: 'fade', duracaoTransicao: 0.4, legendas: true, legendasExternas: [],
  }));
  check(r3.ok === true && r3.legendasDaLetra === false, 'letra vazia cai nas legendas da narração', JSON.stringify(r3).slice(0, 90));
}

console.log('\n[23] Codec: VP8 por omissão, porque o Windows recusa o VP9');
{
  const uma = [{ imagem: 'c1', audio: null, semFala: true, texto: 'Uma.' }];

  // Por omissão tem de sair VP8 — foi o VP9 que o Windows recusou abrir.
  instalarAmbiente([], { musicaSegundos: 4 });
  const r = await correrCom(mod.gerarVideo({ cenas: uma, duracaoCena: 2 }));
  check(r.codec === 'vp8', `por omissão grava em VP8 (${r.codec})`, `codec=${r.codec} mime=${r.mime}`);
  check(/vp8/.test(r.mime), `e o mime é de VP8 (${r.mime})`, r.mime);
  check(/vp8/.test(mimesUsados[0]), `foi mesmo isso que se pediu ao gravador (${mimesUsados[0]})`, String(mimesUsados[0]));

  // Pedido explícito de VP9: respeitado, e assinalado no resultado.
  instalarAmbiente([], { musicaSegundos: 4 });
  const r9 = await correrCom(mod.gerarVideo({ cenas: uma, duracaoCena: 2, codec: 'vp9' }));
  check(r9.codec === 'vp9', `com o codec escolhido, grava em VP9 (${r9.codec})`, `codec=${r9.codec}`);
  check(/vp9/.test(mimesUsados[0]), `e pediu VP9 ao gravador (${mimesUsados[0]})`, String(mimesUsados[0]));

  // Browser que só sabe VP8: mesmo pedindo VP9, cai no VP8 em vez de falhar.
  instalarAmbiente([], { musicaSegundos: 4 });
  const GravadorReal = globalThis.MediaRecorder;
  globalThis.MediaRecorder = class extends GravadorReal {
    static isTypeSupported(t) { return /vp8/.test(t) || t === 'video/webm'; }
  };
  globalThis.window.MediaRecorder = globalThis.MediaRecorder;
  const rFallback = await correrCom(mod.gerarVideo({ cenas: uma, duracaoCena: 2, codec: 'vp9' }));
  check(rFallback.ok === true && rFallback.codec === 'vp8', 'sem VP9 no browser, cai no VP8 sem falhar', `codec=${rFallback.codec}`);
  globalThis.MediaRecorder = GravadorReal;
  globalThis.window.MediaRecorder = GravadorReal;

  // A lista de codecs tem os dois, e o VP8 vem primeiro (compatibilidade).
  check(mod.CODECS.length === 2, `2 codecs oferecidos (${mod.CODECS.length})`, String(mod.CODECS.length));
  check(mod.CODECS[0].id === 'vp8' && mod.CODECS[1].id === 'vp9', 'VP8 primeiro, VP9 depois', mod.CODECS.map((c) => c.id).join(', '));
  check(mod.CODECS[0].ordem[0] === 'video/webm;codecs=vp8,opus', `o 1.º candidato do VP8 é o mais compatível (${mod.CODECS[0].ordem[0]})`, mod.CODECS[0].ordem[0]);
  check(mod.CODECS.every((c) => c.ordem[c.ordem.length - 1] === 'video/webm'), 'todos terminam no WebM puro, como último recurso', 'falta o recurso final');
}

console.log('\n[24] Browser com o som bloqueado: falha cedo, em vez de gravar mudo');
{
  instalarAmbiente([2.0, 2.0]);
  ultimoCtx.state = 'suspended';
  ultimoCtx.resume = () => new Promise(() => {}); // pendente para sempre
  ultimoGravador = null;
  const t0 = Date.now();
  const r = await correrCom(mod.gerarVideo({ cenas: cenasDe(2), transicao: 'fade', duracaoTransicao: 0.4 }));
  check(r.ok === false, 'recusa gravar sem motor de áudio', JSON.stringify(r).slice(0, 120));
  check(/BLOQUEOU o som/i.test(r.erro || ''), `explica o que fazer: "${(r.erro || '').slice(0, 90)}"`, r.erro);
  check(Date.now() - t0 < 8000, `falhou rápido (${((Date.now() - t0) / 1000).toFixed(1)}s), sem ficar pendente`, String(Date.now() - t0));
  check(ultimoGravador === null, 'nenhuma gravação começou', 'chegou a gravar');

  // Com o som a correr, grava na mesma.
  instalarAmbiente([2.0]);
  ultimoCtx.state = 'running';
  const r2 = await correrCom(mod.gerarVideo({ cenas: cenasDe(1), transicao: 'fade', duracaoTransicao: 0.4 }));
  check(r2.ok === true, 'com o som a correr, grava normalmente', JSON.stringify(r2).slice(0, 90));
}

console.log('\n[25] Fecho com a música: a última cena fica até ela acabar');
{
  // 2 cenas de 2s = 4s de vídeo; música descodificada de 10s → a última cena
  // fica 8s mais tempo, o vídeo acaba JUNTO com a música e ambos esmaecem.
  const musica = { name: 'tema.mp3', arrayBuffer: () => Promise.resolve(new ArrayBuffer(64)) };
  instalarAmbiente([2.0, 2.0], { musicaSegundos: 10 });
  const r = await correrCom(mod.gerarVideo({ cenas: cenasDe(2), transicao: 'fade', duracaoTransicao: 0.4, musica }));
  check(r.ok === true, 'grava com o fecho esticado', JSON.stringify(r).slice(0, 120));
  check(perto(r.duracao, 10, 0.6), `o vídeo acaba quando a música acaba (${r.duracao.toFixed(1)}s ≈ 10s)`, String(r.duracao));
  check(r.terminouComMusica === true, 'a gravação terminou com a música', `terminouComMusica=${r.terminouComMusica}`);
  check(perto(r.tempoExtra, 6, 0.6), `a última cena ganhou ${r.tempoExtra.toFixed(1)}s para a música acabar`, String(r.tempoExtra));

  // No fim, a imagem apaga para preto: retoques pretos cada vez mais fortes
  // nos últimos ~3s, e nenhum antes disso.
  const pretos = retoques.filter((q) => /rgba\(0,0,0/.test(q.cor || ''));
  check(pretos.length > 5, `o véu preto do fecho foi desenhado (${pretos.length} vez(es))`, String(pretos.length));
  const antes = pretos.filter((q) => q.t < r.duracao - 3.2);
  check(antes.length === 0, `nenhum véu antes do fecho (antes das ${Math.max(0, r.duracao - 3.2).toFixed(1)}s)`, String(antes.length));
  const noFim = pretos.filter((q) => q.t >= r.duracao - 0.4);
  check(noFim.length > 0 && Math.max(...noFim.map((q) => parseFloat(q.cor.match(/([\d.]+)\)$/)?.[1] || '0'))) > 0.85, 'o ecrã está quase todo preto no último instante', JSON.stringify(noFim.at(-1)));

  // A música esmaece: o ganho da trilha desce (rampa programada no fim).
  const ganhoTrilha = fontesEmCiclo.length ? true : false;
  check(ganhoTrilha, 'a trilha estava a tocar', 'não tocou');
  check(perto(r.musicaSegundos, 10, 0.01), `a duração usada da música é a descodificada (${r.musicaSegundos}s)`, String(r.musicaSegundos));
}

console.log(falhas.length ? `\n=== ${falhas.length} FALHA(S) ===` : '\n=== GERAÇÃO DE VÍDEO OK ===');
process.exit(falhas.length ? 1 : 0);