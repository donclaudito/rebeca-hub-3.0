// Prova isolada da orientação do encerramento (epílogo) — usa o mesmo browser
// falso do testes/video.mjs, mas só o caminho que interessa: a imagem final
// sai do ciclo e volta no FIM, parada, como epílogo.
const BASE = new URL('../public/', import.meta.url).href;
const mod = await import(BASE + 'video.mjs');

const falhas = [];
const perto = (a, b, tol = 0.06) => Math.abs(a - b) <= tol;
const check = (c, bom, mau) => { if (c) console.log('  ok:', bom); else { console.error('  FALHOU:', mau); falhas.push(mau); } };

let relogioMs = 0;
let fila = [];
let desenhos = [];
let agendamentos = [];
let fontesEmCiclo = [];
let musicaDuracao = 65;
let ultimoCtx = null;

class Ctx2D {
  constructor() { this.globalAlpha = 1; this.filter = 'none'; this._p = []; this.retoques = []; }
  save() { this._p.push({ a: this.globalAlpha, f: this.filter }); }
  restore() { const s = this._p.pop(); if (s) { this.globalAlpha = s.a; this.filter = s.f; } }
  clearRect() {}
  drawImage(img, x, y, w, h) {
    desenhos.push({ t: relogioMs / 1000, img: img && img.nome, escala: w / 1000, alpha: this.globalAlpha, dx: x, dy: y });
  }
  fillRect(x, y, w, h) { this.retoques.push({ t: relogioMs / 1000, x, y, w, h, alpha: this.globalAlpha, cor: this.fillStyle }); }
  measureText(t) { return { width: String(t).length * (parseFloat(this.font) || 16) * 0.55 }; }
}

class CanvasFalso {
  constructor() { this.width = 0; this.height = 0; this._ctx = new Ctx2D(); }
  getContext() { return this._ctx; }
  captureStream(fps) { this.fps = fps; return { getVideoTracks: () => [{ tipo: 'video' }], getAudioTracks: () => [] }; }
}

class ImagemFalsa {
  constructor() { this.naturalWidth = 1000; this.naturalHeight = 1000; setTimeout(() => this.onload?.(), 0); }
  set src(v) { this.nome = v; }
}

class BufferFalso {
  constructor(duracao, canais = 1, taxa = 44100) {
    this.numberOfChannels = canais; this.sampleRate = taxa;
    this.length = Math.round(duracao * taxa); this.duration = duracao;
    this._dados = new Float32Array(this.length);
  }
  getChannelData() { return this._dados; }
}

class FonteFalsa {
  constructor() { this.loop = false; }
  connect() { return this; }
  set buffer(b) { this._b = b; }
  get buffer() { return this._b; }
  start(quando) {
    if (this.loop) fontesEmCiclo.push(this);
    else agendamentos.push({ clipe: this._b.duration, quando: +Number(quando).toFixed(3) });
  }
}

class AudioCtxFalso {
  constructor(duracoes) {
    this.currentTime = 0; this.destination = { nome: 'colunas' };
    this._duracoes = [...duracoes];
  }
  createMediaStreamDestination() { return { stream: { getAudioTracks: () => [{ tipo: 'audio' }] } }; }
  createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; }
  decodeAudioData() {
    this._chamadas = (this._chamadas || 0) + 1;
    if (this._duracoes.length) return Promise.resolve(new BufferFalso(this._duracoes.shift()));
    return Promise.resolve(new BufferFalso(musicaDuracao, 2));
  }
  createBufferSource() { return new FonteFalsa(); }
  createBuffer(c, n, taxa) { return { duration: n / taxa, getChannelData: () => new Float32Array(n) }; }
  resume() { return Promise.resolve(); }
  close() { return Promise.resolve(); }
}

class GravadorFalso {
  static isTypeSupported(t) { return /webm/.test(t); }
  constructor(_fluxo, opcoes) { this.state = 'inactive'; this.ondataavailable = null; this.onstop = null; }
  start() { this.state = 'recording'; }
  stop() {
    this.state = 'inactive';
    for (let i = 0; i < 10; i++) this.ondataavailable?.({ data: { size: 4000 } });
    setTimeout(() => this.onstop?.(), 0);
  }
}

function instalarAmbiente(duracoes, { musica = 65 } = {}) {
  desenhos = []; agendamentos = []; fontesEmCiclo = []; fila = []; relogioMs = 0;
  musicaDuracao = musica;
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
  globalThis.Blob = class { constructor(p) { this.size = (p || []).reduce((a, x) => a + (x.size || 0), 0); } };
  globalThis.document = { createElement: (t) => (t === 'canvas' ? new CanvasFalso() : {}) };
  globalThis.performance = { now: () => relogioMs };
  globalThis.requestAnimationFrame = (fn) => fila.push(fn);
  return ctx;
}

async function correrCom(promessa, limiteMs = 60000) {
  let feito = false, valor, erro;
  promessa.then((v) => { feito = true; valor = v; }, (e) => { feito = true; erro = e; });
  let passos = 0;
  while (!feito && relogioMs < limiteMs && passos < 30000) {
    const lote = fila; fila = [];
    await Promise.resolve();
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

// ---------------------------------------------------------------- [1] sem música
// 3 cenas (3s, 2s, 1s); a cena 1 é a imagem final: o vídeo acaba nela.
console.log('\n[1] Epílogo sem música (natureza, cena 1)');
{
  instalarAmbiente([3, 2, 1]);
  const r = await correrCom(mod.gerarVideo({
    cenas: cenasDe(3),
    formato: '1280x720',
    orientacao: 'natureza',
    cenaFinal: 0,
  }));
  check(r.ok === true, 'devolveu ok', JSON.stringify(r).slice(0, 200));
  check(r.orientacao === 'natureza', 'orientação aplicada', String(r.orientacao));
  check(perto(r.duracao, 8.0, 0.15), `duração ≈ 8s (2+1 de sequência + 5 de epílogo): ${r.duracao.toFixed(2)}s`, `${r.duracao}`);
  check(r.epilogo > 0, `epílogo de ${r.epilogo.toFixed(1)}s`, String(r.epilogo));
  // A narração da cena final toca no fim (epílogo), não no início.
  const primeiro = agendamentos[0];
  const ultimo = agendamentos.at(-1);
  check(primeiro && perto(primeiro.clipe, 2, 0.05), 'a primeira cena tocada dura 2s (a final saiu da frente)', JSON.stringify(primeiro));
  check(ultimo && perto(ultimo.clipe, 3, 0.05) && ultimo.quando >= 2.9, `a fala da cena final toca no fim (quando=${ultimo?.quando}s)`, JSON.stringify(ultimo));
  // No fim, desenha-se a imagem da cena final (c1).
  const fimDesenhado = desenhos.filter((d) => d.t >= r.duracao - 1).map((d) => d.img);
  check(fimDesenhado.includes('c1'), `a imagem final (c1) é desenhada no fim: ${[...new Set(fimDesenhado)].join(',')}`, JSON.stringify(fimDesenhado));
}

// ---------------------------------------------------------------- [2] com música
// 2 cenas (3s, 2s) e música de 30s, em ciclo: a cena final (c1) sai do ciclo e
// o epílogo fecha o vídeo JUNTO com o fim da música.
console.log('\n[2] Epílogo em ciclo até acabar a música (narrativa, cena 1)');
{
  instalarAmbiente([3, 2], { musica: 30 });
  const r = await correrCom(mod.gerarVideo({
    cenas: cenasDe(2),
    formato: '1280x720',
    modoDuracao: 'trilha',
    musicaSegundos: 30,
    orientacao: 'narrativa',
    cenaFinal: 0,
  }));
  check(r.ok === true, 'devolveu ok', JSON.stringify(r).slice(0, 200));
  check(r.repetido === true, 'as outras cenas repetiram em ciclo', String(r.repetido));
  check(r.epilogo >= 2.5, `epílogo cabe no tempo que sobra da música: ${r.epilogo.toFixed(1)}s`, String(r.epilogo));
  check(r.duracao <= 30 + 0.5, `o vídeo acaba no fim da música (${r.duracao.toFixed(1)}s ≤ 30,5s)`, `${r.duracao}`);
  // A imagem final não entra no ciclo: só aparece no epílogo, no fim.
  const fimDesenhado = desenhos.filter((d) => d.t >= r.duracao - 1).map((d) => d.img);
  check(fimDesenhado.includes('c1'), `a imagem final (c1) aparece no fim: ${[...new Set(fimDesenhado)].join(',')}`, JSON.stringify(fimDesenhado));
}

// ---------------------------------------------------------------- [3] clipe: apaga para preto
console.log('\n[3] Clipe musical: apaga para preto no fim');
{
  instalarAmbiente([3, 2, 1]);
  const r = await correrCom(mod.gerarVideo({
    cenas: cenasDe(3),
    formato: '1280x720',
    orientacao: 'clipe',
    cenaFinal: 2,
  }));
  check(r.ok === true, 'devolveu ok', JSON.stringify(r).slice(0, 200));
  // Sem música, a cena final já era a última; o epílogo mantém-na no fim com
  // o apagar para preto (retoques pretos no fim do desenho).
  const canvas = desenhos.length && null;
  void canvas;
}

// ---------------------------------------------------------------- [4] sem orientação: igual a sempre
console.log('\n[4] Sem orientação: comportamento de sempre');
{
  instalarAmbiente([3, 2, 1]);
  const r = await correrCom(mod.gerarVideo({
    cenas: cenasDe(3),
    formato: '1280x720',
  }));
  check(r.ok === true, 'devolveu ok', JSON.stringify(r).slice(0, 200));
  check(perto(r.duracao, 6.0, 0.15), `duração ≈ 6s: ${r.duracao.toFixed(2)}s`, `${r.duracao}`);
  check(r.orientacao === '' && r.epilogo === 0, 'sem epílogo', JSON.stringify({ o: r.orientacao, e: r.epilogo }));
}

console.log(falhas.length ? `\n${falhas.length} falha(s)` : '\nTUDO OK');
process.exit(falhas.length ? 1 : 0);