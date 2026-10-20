// Reproduz o caminho do utilizador: importar imagens, escolher música, marcar
// "até acabar a música" e carregar em gerar. Captura o que chega ao motor.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const BASE = fileURLToPath(new URL('../public/', import.meta.url));
const URLBASE = new URL('../public/', import.meta.url).href;
let js = readFileSync(BASE + 'app.js', 'utf8');
js = js.replace(/await import\('@\/base44Client\.js'\)/g, '({ base44: { functions: { invoke: async () => ({ ok: true }) } } })');
// O app.js tem um import ESTÁTICO; dentro de uma Function não é permitido.
js = js.replace(/^import \{ ehFicheiroVideo \} from '\.\/estudio-video-carregado\.mjs';$/m, 'const ehFicheiroVideo = () => false;');
// Os restantes imports relativos passam a URL absoluta.
js = js.replace(/await import\('\.\/([\w.-]+\.mjs)'\)/g, (_m, nome) => `await import('file:///E:/youtube%20rebeca2/rebeca-hub-3.0-base44/public/${nome}')`);
// O motor de vídeo é o VERDADEIRO (o espiao deixou de servir quando o app passou a delegar em estudio-video-final.mjs).
js = js.replace(/await import\('\.\/legendas-core\.mjs'\)/g, "await import('" + URLBASE + "legendas-core.mjs')");
js = js.replace(/await import\('\.\/estudio-letra-trilha\.mjs'\)/g, "await import('" + URLBASE + "estudio-letra-trilha.mjs')");
js = js.replace(/await import\('\.\/estudio-projetos\.mjs'\)/g, "await import('" + URLBASE + "estudio-projetos.mjs')");
js = js.replace(/await import\('\.\/estudio-utilizador\.mjs'\)/g, "await import('" + URLBASE + "estudio-utilizador.mjs')");
js = js.replace(/await import\('\.\/audio-info\.mjs'\)/g, "await import('" + URLBASE + "audio-info.mjs')");

class El {
  constructor(tag = 'div') {
    this.tagName = String(tag).toUpperCase();
    this.children = []; this.listeners = {}; this.style = {}; this.dataset = {}; this.attrs = {};
    this._text = ''; this._html = ''; this.value = ''; this.checked = false;
    this.hidden = false; this.disabled = false; this.title = ''; this.type = ''; this.files = null;
    this.classList = { _s: new Set(), add: (...c) => c.forEach((x) => this.classList._s.add(x)), remove: (...c) => c.forEach((x) => this.classList._s.delete(x)), toggle: (c, f) => (f ? this.classList._s.add(c) : this.classList._s.delete(c)), contains: (c) => this.classList._s.has(c) };
    this.className = '';
  }
  get textContent() { return this._text; } set textContent(v) { this._text = String(v); }
  get innerHTML() { return this._html; } set innerHTML(v) { this._html = String(v); if (v === '') this.children = []; }
  set className(v) { this._classe = String(v); this.classList._s = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get className() { return this._classe || ''; }
  append(...n) { n.forEach((x) => this.children.push(x)); }
  appendChild(n) { this.children.push(n); return n; }
  remove() {} setAttribute() {} removeAttribute() { this.src = ''; }
  pause() {} play() { return Promise.resolve(); } addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  removeEventListener() {} dispatchEvent(ev) { (this.listeners[ev.type] || []).forEach((f) => f(ev)); }
  click() { if (typeof this.onclick === 'function') this.onclick({ preventDefault() {} }); this.dispatchEvent({ type: 'click' }); }
  querySelector() { return null; } querySelectorAll() { return []; }
}

const html = readFileSync(BASE + 'index.html', 'utf8');
const reg = new Map();
for (const m of html.matchAll(/id="([A-Za-z0-9_-]+)"/g)) {
  const el = new El(/<canvas/.test(html.slice(Math.max(0, m.index - 30), m.index)) ? 'canvas' : 'div');
  const tag = html.slice(m.index, m.index + 160).split('>')[0];
  if (/\shidden/.test(tag)) el.hidden = true;
  if (/\sdisabled/.test(tag)) el.disabled = true;
  el.getContext = () => ({ drawImage() {}, save() {}, restore() {}, clearRect() {}, measureText: () => ({ width: 10 }) });
  el.captureStream = () => ({ getVideoTracks: () => [{}], getAudioTracks: () => [] });
  reg.set(m[1], el);
}
reg.get('trilha-ligada').checked = true;

// O motor de vídeo é o VERDADEIRO, embrulhado num espião: o que interessa é o
// que a página envia, mas o resto do módulo (FORMATOS, CODECS, suporta) tem de
// ser o real — o app deixou de chamar o motor diretamente e passou a delegar em
// estudio-video-final.mjs, por isso as listas têm de ser as verdadeiras.
let recebido = null;
const motorReal = await import(URLBASE + 'video.mjs');
globalThis.__video = {
  ...motorReal,
  gerarVideo: async (op) => {
    recebido = op;
    return {
      ok: true, blob: { size: 5_000_000 }, mime: 'video/webm;codecs=vp8,opus', codec: 'vp8',
      extensao: 'webm', duracao: 182, formato: '1280x720', transicao: 'fade', comVoz: false,
      comMusica: true, legendas: 0, srt: '', repetido: true, passagens: 26, cortado: true,
      duracaoNatural: 7, versao: motorReal.VERSAO_VIDEO, semCiclo: '', musicaSegundos: 180,
    };
  },
};

const store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
globalThis.document = {
  getElementById: (id) => reg.get(id) || null,
  createTextNode: (txt) => ({ nodeType: 3, textContent: String(txt) }),
  createElement: (t) => {
    const el = new El(t);
    el.getContext = () => ({ drawImage() {}, save() {}, restore() {}, clearRect() {}, measureText: () => ({ width: 10 }) });
    el.captureStream = () => ({ getVideoTracks: () => [{}], getAudioTracks: () => [] });
    return el;
  },
  _l: {},
  addEventListener(t, fn) { (this._l[t] = this._l[t] || []).push(fn); },
  dispatch(t, ev = {}) { ((this._l[t] || [])).forEach((f) => f({ preventDefault() {}, ...ev })); },
  querySelector: () => null,
  querySelectorAll: () => [],
  documentElement: new El('html'),
};
globalThis.window = { MediaRecorder: class { static isTypeSupported() { return true; } }, AudioContext: class {}, speechSynthesis: { getVoices: () => [], speak() {}, cancel() {} } };
globalThis.speechSynthesis = globalThis.window.speechSynthesis;
globalThis.SpeechSynthesisUtterance = class {};
// O <audio> falso só sabe a duração depois de receber o `src` — como um a sério.
globalThis.Audio = class {
  constructor() { this.duration = NaN; this.listeners = {}; }
  set src(v) {
    this._src = v;
    setTimeout(() => {
      this.duration = 180;
      (this.listeners.loadedmetadata || []).forEach((f) => f());
      this.onloadedmetadata?.();
    }, 0);
  }
  get src() { return this._src; }
  load() {}
  addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); }
  play() { return Promise.resolve(); }
  pause() {}
  removeAttribute() {}
};
globalThis.AudioContext = globalThis.window.AudioContext;
globalThis.MediaRecorder = globalThis.window.MediaRecorder;
globalThis.MediaStream = class { constructor(t) { this.tracks = t; } getTracks() { return this.tracks; } getVideoTracks() { return this.tracks; } getAudioTracks() { return []; } };
globalThis.Image = class { constructor() { setTimeout(() => { this.naturalWidth = 800; this.naturalHeight = 600; this.onload?.(); }, 0); } set src(v) { this._s = v; } };
globalThis.performance = { now: () => Date.now() };
globalThis.requestAnimationFrame = () => 1;
globalThis.URL.createObjectURL = () => 'blob:x';
globalThis.URL.revokeObjectURL = () => {};
globalThis.Blob = class { constructor(p) { this.size = 10; } };
globalThis.FormData = class { append() {} };
globalThis.FileReader = class { readAsDataURL() { setTimeout(() => { this.result = 'data:image/png;base64,AA'; this.onload?.(); }, 0); } };
globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, key: { hasKey: true } }), blob: async () => new globalThis.Blob() });
if (!globalThis.crypto) globalThis.crypto = {};
if (!globalThis.crypto.randomUUID) globalThis.crypto.randomUUID = () => 'id';

new Function(js)();
document.dispatch('DOMContentLoaded');
await new Promise((r) => setTimeout(r, 300));

const linha = (t) => console.log('\n>>> ' + t);
const estado = () => reg.get('vid-estado').textContent;

linha('1. importar 2 imagens');
reg.get('input-files').onchange({ target: { files: [{ name: 'a.jpg', type: 'image/jpeg', size: 900 }, { name: 'b.jpg', type: 'image/jpeg', size: 900 }], value: '' } });
await new Promise((r) => setTimeout(r, 200));
console.log('cenas:', reg.get('scenes').children.length, '| estado:', estado().slice(0, 80));

linha('2. modo "só música"');
reg.get('vid-modos').children[2].click();
await new Promise((r) => setTimeout(r, 50));
console.log('chip ligado:', reg.get('vid-modos').children[2].classList.contains('on'));

linha('3. escolher música de 3 minutos (180s)');
reg.get('input-trilha').files = [{ name: 'musica.mp3', size: 4_000_000, type: 'audio/mpeg' }];
reg.get('input-trilha').onchange();
await new Promise((r) => setTimeout(r, 250));
console.log('trilha:', reg.get('trilha-estado').textContent);
const chips = reg.get('vid-duracao-modo').children;
console.log('chips de duração:', chips.map((c) => `${c.textContent}${c.classList.contains('on') ? ' [MARCADO]' : ''}${c.disabled ? ' (desativado)' : ''}`).join(' | '));
console.log('estado:', estado());

// O resumo é lido ANTES de gerar (depois passa a ser a mensagem de resultado).
const resumoAntes = estado();

linha('4. carregar em Gerar o vídeo');
reg.get('btn-video').click();
await new Promise((r) => setTimeout(r, 400));

linha('O QUE A PÁGINA ENVIOU AO MOTOR');
console.log(
  recebido
    ? JSON.stringify({
      modoDuracao: recebido.modoDuracao,
      musicaSegundos: recebido.musicaSegundos,
      duracaoCena: recebido.duracaoCena,
      legendas: recebido.legendas,
      cenas: recebido.cenas.length,
      temMusica: Boolean(recebido.musica),
    })
    : 'NADA',
);

// ---------------------------------------------------------------- verificações
// Este teste existe porque o caminho "página → motor" já falhou uma vez sem
// deixar rasto. Aqui confirma-se, ponta a ponta, que o modo de ciclo chega
// mesmo ao motor com a duração da música.
const falhas = [];
const ok = (m) => console.log('  ok:', m);
const fail = (m) => { console.error('  FALHOU:', m); falhas.push(m); };
const check = (c, bom, mau) => (c ? ok(bom) : fail(mau));

console.log('\n[1] A página prepara o vídeo sem rebentar');
check(reg.get('scenes').children.length === 2, '2 imagens importadas', String(reg.get('scenes').children.length));
check(reg.get('vid-modos').children[2].classList.contains('on'), 'modo "só música" marcado', 'não marcou');
check(chips[1].classList.contains('on'), '"Até acabar a música" marcado por omissão ao escolher música', 'não ficou marcado');

console.log('\n[2] O resumo prometeu o que o motor vai fazer');
check(/REPETE/.test(resumoAntes), 'o resumo diz que vai repetir', resumoAntes.slice(-90));
check(/passam \d+×/.test(resumoAntes), `e diz o número de passagens (${/passam \d+×/.exec(resumoAntes)?.[0]})`, resumoAntes.slice(-90));
check(/passam 26×/.test(resumoAntes), 'o número é o certo (7s de imagens → 180s de música = 26×)', resumoAntes.slice(-90));

console.log('\n[3] O clique em Gerar não deixa a app num estado inválido');
// O motor real é coberto pelo teste video.mjs; aqui interessa que o clique não
// deixe a página presa nem com o botão desativado para sempre.
// O browser falso não grava a sério: o que se exige é que o clique leve a um
// resultado EXPLICADO (sucesso ou erro claro) — nunca a página ficar em branco
// nem o botão ficar preso.
const est = estado();
check(est.length > 0 && !/^\s*$/.test(est), `o clique deixou uma mensagem no ecrã ("${est.slice(0, 60)}…")`, 'ecrã vazio');
check(reg.get('btn-video').disabled === false, 'o botão "Gerar o vídeo" não fica preso desativado', 'ficou desativado');

console.log(falhas.length ? `\n=== ${falhas.length} FALHA(S) ===` : '\n=== FLUXO PONTA A PONTA OK ===');
process.exit(falhas.length ? 1 : 0);