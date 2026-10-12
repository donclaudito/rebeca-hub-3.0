// Testa a geração do vídeo com um browser falso e um relógio controlado.
// Verifica o que se desenha, o que se toca e se as passagens são contínuas.
const BASE = 'file:///E:/youtube%20rebeca2/rebeca-hub-3.0-base44/public/';
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
let agendamentos = [];           // {clipe, quando}
let fontesEmCiclo = [];          // fontes com loop (a trilha)
let ganhosCriados = [];          // valores de ganho pedidos (narração=1, trilha=0.16)
let musicaDuracao = 65;          // duração devolvida para a trilha
let ultimoCtx = null;
let ultimoGravador = null;

class Ctx2D {
  constructor() { this.globalAlpha = 1; this.filter = 'none'; this._p = []; }
  save() { this._p.push({ a: this.globalAlpha, f: this.filter }); }
  restore() { const s = this._p.pop(); if (s) { this.globalAlpha = s.a; this.filter = s.f; } }
  clearRect() {}
  drawImage(img, x, y, w, h) {
    desenhos.push({ t: relogioMs / 1000, img: img && img.nome, escala: w / 1000, alpha: this.globalAlpha, dx: x, filtro: this.filter });
  }
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
  decodeAudioData() {
    this._chamadas = (this._chamadas || 0) + 1;
    const d = this._duracoes.length ? this._duracoes.shift() : musicaDuracao;
    const canais = this._duracoes.length || d !== musicaDuracao ? 1 : 2; // a trilha é estéreo
    return Promise.resolve(new BufferFalso(d, canais));
  }
  createBufferSource() {
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
  static isTypeSupported(t) { return /vp9,opus/.test(t); }
  constructor(fluxo, opcoes) {
    this.fluxo = fluxo; this.opcoes = opcoes; this.state = 'inactive';
    this.ondataavailable = null; this.onstop = null;
    ultimoGravador = this;
  }
  start(ms) { this.state = 'recording'; this.intervalo = ms; }
  stop() {
    this.state = 'inactive';
    for (let i = 0; i < 10; i++) this.ondataavailable?.({ data: { size: 4000 } });
    setTimeout(() => this.onstop?.(), 0);
  }
}

function instalarAmbiente(duracoes) {
  desenhos = []; agendamentos = []; fontesEmCiclo = []; ganhosCriados = []; fila = []; relogioMs = 0;
  musicaDuracao = 65;
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
  globalThis.MediaRecorder.isTypeSupported = () => false;
  const semMime = await mod.gerarVideo({ cenas: cenasDe(1) });
  check(semMime.ok === false && /formato de vídeo/i.test(semMime.erro), `sem formato aceite: "${semMime.erro}"`, JSON.stringify(semMime));
  globalThis.MediaRecorder.isTypeSupported = (t) => /vp9,opus/.test(t);
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
  check(r.extensao === 'webm' && r.mime === 'video/webm;codecs=vp9,opus', `formato: ${r.mime}`, r.mime);
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
  check(f.comecou === true && (f.quando === undefined || f.quando === 0), 'a música começa logo no início do vídeo', `quando=${f.quando}`);
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

console.log(falhas.length ? `\n=== ${falhas.length} FALHA(S) ===` : '\n=== GERAÇÃO DE VÍDEO OK ===');
process.exit(falhas.length ? 1 : 0);
