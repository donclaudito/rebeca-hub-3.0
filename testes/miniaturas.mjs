// Miniaturas do Painel: o que causava o 429 (Too Many Requests) da Base44.
//
// O defeito: ao abrir o Painel pedia-se um URL assinado por cada vídeo de uma
// vez, e ao voltar ao Painel pedia-se TUDO outra vez. Agora há cache e um pedido
// de cada vez. Este teste conta os pedidos ao servidor e a sobreposição.
import { readFileSync } from 'node:fs';

const raiz = 'E:/youtube rebeca2/rebeca-hub-3.0-base44/public/';
const BASE_M = 'file:///E:/youtube%20rebeca2/rebeca-hub-3.0-base44/public/';
const html = readFileSync(raiz + 'index.html', 'utf8');

const falhas = [];
const ok = (m) => console.log('  ok:', m);
const fail = (m) => { console.error('  FALHOU:', m); falhas.push(m); };
const check = (c, bom, mau) => (c ? ok(bom) : fail(mau));

class El {
  constructor(id = '') {
    this.id = id; this.tagName = 'DIV';
    this.children = []; this.listeners = {}; this.dataset = {}; this.style = {};
    this._text = ''; this._html = ''; this.value = ''; this.hidden = false; this.open = false;
    this.className = ''; this.src = ''; this.alt = ''; this.title = '';
    this.classList = { _s: new Set(), add: (...c) => c.forEach((x) => this.classList._s.add(x)), remove: () => {}, toggle: () => {}, contains: (c) => this.classList._s.has(c) };
  }
  get textContent() { return this._text; } set textContent(v) { this._text = String(v); }
  get innerHTML() { return this._html; } set innerHTML(v) { this._html = String(v); if (v === '') this.children = []; }
  append(...n) { n.forEach((x) => this.children.push(x)); } appendChild(n) { this.children.push(n); return n; }
  remove() {} setAttribute() {} removeAttribute() {} querySelector() { return null; } querySelectorAll() { return []; }
  replaceChildren(...n) { this.children = [...n]; }
  addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  removeEventListener() {}
  dispatchEvent(ev) { (this.listeners[ev.type] || []).forEach((f) => f(ev)); }
  click() { if (typeof this.onclick === 'function') this.onclick({ preventDefault() {} }); this.dispatchEvent({ type: 'click' }); }
  pause() {} play() { return Promise.resolve(); }
  showModal() { this.open = true; } close() { this.open = false; }
  set innerText(v) { this._text = String(v); }
}

const reg = new Map();
for (const m of html.matchAll(/id="([A-Za-z0-9_-]+)"/g)) {
  const el = new El(m[1]);
  const tag = html.slice(m.index, m.index + 160).split('>')[0];
  if (/\shidden/.test(tag)) el.hidden = true;
  reg.set(m[1], el);
}

const store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
const sessao = {};
globalThis.sessionStorage = { getItem: (k) => (k in sessao ? sessao[k] : null), setItem: (k, v) => { sessao[k] = String(v); }, removeItem: (k) => { delete sessao[k]; } };
globalThis.location = { pathname: '/', search: '', hash: '' };
globalThis.history = { replaceState: () => {} };
globalThis.document = {
  getElementById: (id) => reg.get(id) || null,
  createElement: () => new El(),
  createTextNode: (t) => ({ nodeType: 3, textContent: String(t) }),
  _l: {},
  addEventListener(t, fn) { (this._l[t] = this._l[t] || []).push(fn); },
  dispatch(t, ev = {}) { ((this._l[t] || [])).forEach((f) => f({ preventDefault() {}, ...ev })); },
  querySelector: () => null, querySelectorAll: () => [], documentElement: new El(), visibilityState: 'visible',
};
globalThis.window = {
  location: globalThis.location, _l: {},
  addEventListener(t, fn) { (this._l[t] = this._l[t] || []).push(fn); },
  dispatchEvent(e) { ((this._l[e.type] || [])).forEach((f) => f(e)); },
  scrollTo() {}, MediaRecorder: class { static isTypeSupported() { return true; } }, AudioContext: class {},
  speechSynthesis: { getVoices: () => [], speak() {}, cancel() {} }, confirm: () => true,
};
globalThis.Event = class { constructor(t) { this.type = t; } };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; this.detail = o?.detail; } };
globalThis.performance = { now: () => Date.now() };
globalThis.speechSynthesis = globalThis.window.speechSynthesis;
globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
globalThis.requestAnimationFrame = () => 1;
globalThis.URL.createObjectURL = () => 'blob:x';
globalThis.URL.revokeObjectURL = () => {};
globalThis.Blob = class { constructor() { this.size = 10; this.type = ''; } };
globalThis.FormData = class { append() {} };
globalThis.FileReader = class { readAsDataURL() {} };
globalThis.Audio = class { constructor() { this.duration = 30; } set src(v) { this._s = v; } get src() { return this._s; } addEventListener() {} load() {} play() { return Promise.resolve(); } pause() {} removeAttribute() {} };
globalThis.AudioContext = globalThis.window.AudioContext;
globalThis.MediaRecorder = globalThis.window.MediaRecorder;
globalThis.MediaStream = class { constructor(t) { this.tracks = t; } getTracks() { return this.tracks; } getVideoTracks() { return this.tracks; } getAudioTracks() { return []; } };
globalThis.Image = class { constructor() { setTimeout(() => { this.naturalWidth = 800; this.naturalHeight = 600; this.onload?.(); }, 0); } };
globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, items: [] }), blob: async () => new globalThis.Blob() });
if (!globalThis.crypto) globalThis.crypto = {};
globalThis.crypto.randomUUID = () => 'uuid-1';
globalThis.atob = (b) => Buffer.from(b, 'base64').toString('binary');
globalThis.btoa = (b) => Buffer.from(b, 'binary').toString('base64');

// ---- a Base44 falsa, a CONTAR os pedidos de URL assinado ----
const N = 6; // 6 vídeos no Painel
const videos = Array.from({ length: N }, (_, i) => ({
  id: `v${i + 1}`,
  nome: `Vídeo ${i + 1}`,
  projetoId: '',
  duracao: 30,
  video_tamanho: 1024,
  video_uri: `private/v${i + 1}.webm`,
  thumb_uri: `private/t${i + 1}.jpg`,
  formato: '16:9',
  codec: 'vp8',
  comVoz: true,
  legendas: 2,
  created_date: new Date().toISOString(),
}));

const contagem = { assinar: 0, dentro: 0, maximoDentro: 0, instantes: [] };
globalThis.__base44Falso = {
  functions: { invoke: async () => ({ ok: true }), fetch: async () => ({ ok: true, json: async () => ({}) }) },
  entities: {
    VideoProducao: { filter: async () => ({ items: videos.slice() }), create: async (r) => r, update: async () => ({}), delete: async () => ({}) },
    Link: { filter: async () => ({ items: [] }), create: async () => ({}) },
    Projeto: { filter: async () => ({ items: [] }), create: async () => ({ id: 'n1' }) },
  },
  integrations: {
    Core: {
      CreateFileSignedUrl: async ({ file_uri }) => {
        contagem.assinar += 1;
        contagem.instantes.push(Date.now());
        contagem.dentro += 1;
        contagem.maximoDentro = Math.max(contagem.maximoDentro, contagem.dentro);
        await new Promise((r) => setTimeout(r, 20)); // latência do servidor
        contagem.dentro -= 1;
        return { signed_url: `https://x/${file_uri}` };
      },
      UploadPrivateFile: async () => ({ file_uri: 'private/x.webm' }),
    },
  },
  auth: { me: async () => ({ id: 'u1', email: 'a@b.pt', full_name: 'Ana' }), logout() {}, setToken() {}, isAuthenticated: async () => true },
};

function absoluto(texto) {
  return texto
    .replace(/await import\('@\/base44Client\.js'\)/g, '({ base44: globalThis.__base44Falso })')
    .replace(/^import \{ ehFicheiroVideo \} from '.\/estudio-video-carregado\.mjs';$/m, 'const ehFicheiroVideo = () => false;')
    .replace(/await import\('\.\/([\w.-]+\.mjs)'\)/g, (_m, nome) => `await import('${BASE_M}${nome}')`);
}

const erros = [];
process.on('uncaughtException', (e) => { erros.push(e.message); console.error('  ERRO:', e.message); });
process.on('unhandledRejection', (e) => { const m = (e && e.message) || String(e); if (!/pause|mediaDevices|AudioContext/.test(m)) { erros.push(m); console.error('  REJEIÇÃO:', m); } });

new Function(absoluto(readFileSync(raiz + 'painel.js', 'utf8')))();
document.dispatch('DOMContentLoaded');
await new Promise((r) => setTimeout(r, 2500)); // tempo para a fila dos 6 pedidos

console.log('\n[1] Abrir o Painel com 6 vídeos: um pedido por miniatura, UM DE CADA VEZ');
{
  check(contagem.maximoDentro <= 1, `nunca houve dois pedidos ao mesmo tempo (máx. ${contagem.maximoDentro})`, `chegaram ${contagem.maximoDentro} pedidos em paralelo`);
  check(contagem.assinar === N, `${contagem.assinar} pedidos para ${N} miniaturas`, `${contagem.assinar} pedidos (esperado ${N})`);
  const pausas = contagem.instantes.slice(1).map((t, i) => t - contagem.instantes[i]);
  const maisCurta = pausas.length ? Math.min(...pausas) : 0;
  check(maisCurta >= 300, `os pedidos ficam separados no tempo (o mais curto: ${maisCurta} ms)`, `dois pedidos a ${maisCurta} ms de distância (rajada)`);
}

console.log('\n[2] Voltar ao Painel não assina NADA outra vez (cache)');
{
  const antes = contagem.assinar;
  reg.get('btn-ir-estudio').click();
  await new Promise((r) => setTimeout(r, 60));
  reg.get('btn-ir-painel').click(); // mostrarVista('painel') → carregar()
  await new Promise((r) => setTimeout(r, 1500));
  check(contagem.assinar === antes, `regressar ao Painel não fez pedidos novos (${contagem.assinar} no total)`, `fez ${contagem.assinar - antes} pedidos novos`);
  check(reg.get('grade').children.length === N, `os ${N} cartões continuam no Painel (${reg.get('grade').children.length})`, String(reg.get('grade').children.length));
}

console.log('\n[3] Recarregar a página também aproveita os URLs guardados');
{
  // sessionStorage mantém-se (é o mesmo separador); a lista volta a ser pedida.
  const antes = contagem.assinar;
  reg.get('btn-recarregar')?.click?.();
  await new Promise((r) => setTimeout(r, 1200));
  check(contagem.assinar === antes, `o botão "recarregar" não assina de novo (${contagem.assinar} no total)`, `fez ${contagem.assinar - antes} pedidos novos`);
}

console.log('\n[4] Sem erros de JavaScript');
if (erros.length) erros.slice(0, 4).forEach((e) => fail('erro: ' + e));
else ok('nenhum erro não tratado');

console.log(falhas.length ? `\n=== ${falhas.length} FALHA(S) ===` : '\n=== MINIATURAS OK ===');
process.exit(falhas.length ? 1 : 0);
