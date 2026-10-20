// Prova rápida: VÁRIAS cenas na introdução (cenasIniciais), como no epílogo.
const BASE = new URL('../public/', import.meta.url).href;
const mod = await import(BASE + 'video.mjs');

let relogioMs = 0, fila = [], desenhos = [], agendamentos = [], fontesEmCiclo = [];
let musicaDuracao = 0, ultimoCtx = null;
const perto = (a, b, tol = 0.05) => Math.abs(a - b) <= tol;

class Ctx2D {
  constructor() { this.globalAlpha = 1; this.filter = 'none'; this._p = []; }
  save() { this._p.push({ a: this.globalAlpha, f: this.filter }); }
  restore() { const s = this._p.pop(); if (s) { this.globalAlpha = s.a; this.filter = s.f; } }
  clearRect() {}
  fillRect() {}
  drawImage(img, x, y, w, h) { desenhos.push({ t: relogioMs / 1000, img: img && img.nome, alpha: this.globalAlpha }); }
  measureText(t) { return { width: String(t).length * 8 }; }
  strokeText() {}
  fillText() {}
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
  constructor(ctx) { this.ctx = ctx; this.loop = false; this.comecou = false; this.parou = false; }
  connect() { return this; }
  disconnect() {}
  set buffer(b) { this._b = b; }
  get buffer() { return this._b; }
  start(quando) { this.comecou = true; this.quando = quando; if (this.loop) fontesEmCiclo.push(this); else agendamentos.push({ clipe: this._b.duration, quando: +quando.toFixed(3) }); }
  stop() { this.parou = true; try { this.onended?.(); } catch {} }
}
class AudioCtxFalso {
  constructor(duracoes) { this.currentTime = 0; this.destination = {}; this.estado = 'running'; this._duracoes = [...duracoes]; }
  createMediaStreamDestination() { return { stream: { getAudioTracks: () => [{ tipo: 'audio' }] } }; }
  createGain() { const g = { gain: {}, connect() {}, disconnect() {} }; g.gain.value = 1; return g; }
  decodeAudioData() { this._chamadas = (this._chamadas || 0) + 1; if (this._duracoes.length) return Promise.resolve(new BufferFalso(this._duracoes.shift())); return Promise.resolve(new BufferFalso(musicaDuracao, 2)); }
  createBufferSource() { this._fontes = (this._fontes || 0) + 1; return new FonteFalsa(this); }
  createBuffer(c, n, taxa) { const d = new Float32Array(n); return { numberOfChannels: c, length: n, sampleRate: taxa, duration: n / taxa, getChannelData: () => d }; }
  resume() { return Promise.resolve(); }
  close() { return Promise.resolve(); }
}
class GravadorFalso {
  static isTypeSupported(t) { return /webm/.test(t); }
  constructor() { this.state = 'inactive'; this.ondataavailable = null; this.onstop = null; }
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; for (let i = 0; i < 10; i++) this.ondataavailable?.({ data: { size: 4000 } }); setTimeout(() => this.onstop?.(), 0); }
}

function instalar(duracoes) {
  desenhos = []; agendamentos = []; fontesEmCiclo = []; fila = []; relogioMs = 0; musicaDuracao = 0;
  const ctx = new AudioCtxFalso(duracoes);
  ultimoCtx = ctx;
  globalThis.AudioContext = function () { return ctx; };
  globalThis.window = { MediaRecorder: GravadorFalso, AudioContext: globalThis.AudioContext };
  globalThis.MediaRecorder = GravadorFalso;
  globalThis.MediaStream = class { constructor(t) { this.tracks = t; } getVideoTracks() { return this.tracks.filter((x) => x.tipo === 'video'); } getAudioTracks() { return this.tracks.filter((x) => x.tipo === 'audio'); } };
  globalThis.Image = ImagemFalsa;
  globalThis.Blob = class { constructor(p, o) { this.size = (p || []).reduce((a, x) => a + (x.size || 0), 0); this.type = o?.type; } };
  globalThis.document = { createElement: (t) => (t === 'canvas' ? new CanvasFalso() : {}) };
  globalThis.performance = { now: () => relogioMs };
  globalThis.requestAnimationFrame = (fn) => fila.push(fn);
  return ctx;
}
async function correrCom(promessa, limiteMs = 60000) {
  let feito = false, valor, erro;
  promessa.then((v) => { feito = true; valor = v; }, (e) => { feito = true; erro = e; });
  let passos = 0;
  while (!feito && relogioMs < limiteMs && passos < 20000) {
    const lote = fila; fila = [];
    await Promise.resolve();
    relogioMs += 16;
    if (ultimoCtx) ultimoCtx.currentTime = relogioMs / 1000;
    for (const f of lote) f();
    passos++;
    if (!fila.length) await new Promise((r) => setTimeout(r, 0));
  }
  if (erro) throw erro;
  if (!feito) throw new Error(`não terminou (relógio ${relogioMs}ms)`);
  return valor;
}
const blobsDe = (n) => Array.from({ length: n }, () => ({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) }));
const falhas = [];
const check = (c, bom, mau) => { console.log(c ? '  ok: ' + bom : '  FALHOU: ' + mau); if (!c) falhas.push(mau); };

// 3 cenas de 2s; cenas 0 e 1 vão para a INTRODUÇÃO (2s cada), a cena 2 fecha.
instalar([2.0, 2.0, 2.0]);
const r = await correrCom(mod.gerarVideo({
  cenas: [
    { imagem: 'i1', audio: blobsDe(1)[0], texto: 'intro um' },
    { imagem: 'i2', audio: blobsDe(1)[0], texto: 'intro dois' },
    { imagem: 'c3', audio: blobsDe(1)[0], texto: 'fim' },
  ],
  transicao: 'fade', duracaoTransicao: 0.4, duracaoIntro: 4, cenasIniciais: [0, 1],
}));
check(r.ok === true, 'gerou o vídeo', JSON.stringify(r).slice(0, 140));
check(perto(r.intro, 4), `introdução total = 4s (${r.intro})`, String(r.intro));
check(r.cenasIntro === 2, `2 cenas de introdução (${r.cenasIntro})`, String(r.cenasIntro));
check(perto(r.duracao, 6, 0.3), `duração ≈ 6s (2s intro + 2s corpo + 2s fim): ${r.duracao.toFixed(2)}`, String(r.duracao));
// Os fotogramas de transição desenham as DUAS imagens; a ordem certa vê-se
// pela primeira aparição de cada uma.
const ordem = [...new Set(desenhos.map((d) => d.img))];
check(ordem.join(',') === 'i1,i2,c3', `ordem: ${ordem.join(' → ')}`, ordem.join(','));
const clipes = agendamentos.map((a) => a.clipe);
check(clipes.length === 3, `3 clipes narrados, a introdução tocada: ${clipes.join(', ')}`, clipes.join(','));

// Fecho: introdução E epílogo juntos (cenas diferentes), ambos no lugar certo.
instalar([2.0, 2.0, 2.0]);
const r2 = await correrCom(mod.gerarVideo({
  cenas: [
    { imagem: 'i1', audio: blobsDe(1)[0], texto: 'um' },
    { imagem: 'meio', audio: blobsDe(1)[0], texto: 'dois' },
    { imagem: 'c3', audio: blobsDe(1)[0], texto: 'tres' },
  ],
  transicao: 'fade', duracaoTransicao: 0.4, duracaoIntro: 2, duracaoEpilogo: 2,
  orientacao: 'natureza',
  cenaInicial: 0, cenasIniciais: [0], cenaFinal: 2, cenasFinais: [2],
}));
check(r2.ok === true, 'gerou com intro e epílogo', JSON.stringify(r2).slice(0, 140));
check(perto(r2.intro, 2) && perto(r2.epilogo, 2), `intro ${r2.intro}s e epílogo ${r2.epilogo}s`, `${r2.intro}/${r2.epilogo}`);
const ordem2 = [...new Set(desenhos.map((d) => d.img))];
check(ordem2.join(',') === 'i1,meio,c3', `ordem: ${ordem2.join(' → ')}`, ordem2.join(','));

console.log(falhas.length ? `\n=== ${falhas.length} FALHA(S) ===` : '\n=== INTRODUÇÃO COM VÁRIAS CENAS OK ===');
process.exit(falhas.length ? 1 : 0);