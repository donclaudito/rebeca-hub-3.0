// "✏️ Reeditar projeto": o botão vive DENTRO da janela de detalhes do vídeo.
// Depois de o carregar, a janela tem de FECHAR e o estúdio tem de aparecer com o
// projeto original. O defeito era esse: a vista mudava por baixo, mas a janela
// modal continuava aberta por cima do estúdio (e a bloquear os cliques), o que
// dava a impressão de o botão não fazer nada.
//
// Corre o painel.js e o app.js VERDADEIROS num DOM falso, com IndexedDB falso.
import { readFileSync } from 'node:fs';

const raiz = 'E:/youtube rebeca2/rebeca-hub-3.0-base44/public/';
const html = readFileSync(raiz + 'index.html', 'utf8');

const falhas = [];
const ok = (m) => console.log('  ok:', m);
const fail = (m) => { console.error('  FALHOU:', m); falhas.push(m); };
const check = (c, bom, mau) => (c ? ok(bom) : fail(mau));

class El {
  constructor(id = '') {
    this.id = id;
    this.tagName = 'DIV';
    this.children = []; this.listeners = {}; this.dataset = {}; this.style = {};
    this._text = ''; this._html = ''; this.value = ''; this.checked = false;
    this.hidden = false; this.disabled = false; this.title = ''; this.className = '';
    this.open = false; // <dialog>: fechado
    this.classList = { _s: new Set(), add: (...c) => c.forEach((x) => this.classList._s.add(x)), remove: (...c) => c.forEach((x) => this.classList._s.delete(x)), toggle: (c, f) => (f ? this.classList._s.add(c) : this.classList._s.delete(c)), contains: (c) => this.classList._s.has(c) };
  }
  get textContent() { return this._text; } set textContent(v) { this._text = String(v); }
  get innerHTML() { return this._html; } set innerHTML(v) { this._html = String(v); if (v === '') this.children = []; }
  append(...n) { n.forEach((x) => this.children.push(x)); }
  appendChild(n) { this.children.push(n); return n; }
  remove() {} setAttribute() {} removeAttribute() {} querySelector() { return null; } querySelectorAll() { return []; }
  replaceChildren(...n) { this.children = [...n]; }
  addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  removeEventListener() {}
  dispatchEvent(ev) { (this.listeners[ev.type] || []).forEach((f) => f(ev)); }
  click() { if (typeof this.onclick === 'function') this.onclick({ preventDefault() {} }); this.dispatchEvent({ type: 'click' }); }
  pause() {} play() { return Promise.resolve(); }
  showModal() { this.open = true; } close() { this.open = false; }
}

const reg = new Map();
for (const m of html.matchAll(/id="([A-Za-z0-9_-]+)"/g)) {
  const el = new El(m[1]);
  const tag = html.slice(m.index, m.index + 160).split('>')[0];
  if (/\shidden/.test(tag)) el.hidden = true;
  reg.set(m[1], el);
}

// ---------------- IndexedDB falso (o dos projetos) ----------------
function criarIndexedDBFalso() {
  const dados = new Map();
  const criarLoja = () => ({
    put(r) { dados.set(r.id, r); return { result: r.id }; },
    get(id) { return { result: dados.get(id) }; },
    getAll() { return { result: [...dados.values()] }; },
    delete(id) { dados.delete(id); return { result: undefined }; },
    clear() { dados.clear(); return { result: undefined }; },
    createIndex() {},
  });
  const db = {
    objectStoreNames: { contains: () => true },
    transaction() {
      const loja = criarLoja();
      const t = { objectStore: () => loja, error: null };
      queueMicrotask(() => t.oncomplete && t.oncomplete());
      return t;
    },
    close() {},
  };
  globalThis.indexedDB = {
    open() {
      const pedido = { result: db, error: null };
      queueMicrotask(() => { pedido.onupgradeneeded?.(); pedido.onsuccess?.(); });
      return pedido;
    },
  };
  return dados;
}

const store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
globalThis.location = { pathname: '/', search: '', hash: '' };
globalThis.history = { replaceState: (_a, _b, url) => { const h = String(url).split('#')[1] || ''; globalThis.location.hash = h ? `#${h}` : ''; } };
globalThis.document = {
  getElementById: (id) => reg.get(id) || null,
  createElement: () => new El(),
  createTextNode: (t) => ({ nodeType: 3, textContent: String(t) }),
  _l: {},
  addEventListener(t, fn) { (this._l[t] = this._l[t] || []).push(fn); },
  dispatch(t, ev = {}) { ((this._l[t] || [])).forEach((f) => f({ preventDefault() {}, ...ev })); },
  querySelector: () => null,
  querySelectorAll: () => [],
  documentElement: new El(),
  visibilityState: 'visible',
};
globalThis.window = {
  location: globalThis.location,
  _l: {},
  addEventListener(t, fn) { (this._l[t] = this._l[t] || []).push(fn); },
  dispatchEvent(e) { ((this._l[e.type] || [])).forEach((f) => f(e)); },
  scrollTo() {},
  MediaRecorder: class { static isTypeSupported() { return true; } },
  AudioContext: class {},
  speechSynthesis: { getVoices: () => [], speak() {}, cancel() {} },
  confirm: () => true,
};
globalThis.Event = class { constructor(t) { this.type = t; } };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; this.detail = o?.detail; } };
globalThis.performance = { now: () => Date.now() };
globalThis.speechSynthesis = globalThis.window.speechSynthesis;
globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
globalThis.requestAnimationFrame = () => 1;
globalThis.URL.createObjectURL = () => 'blob:x';
globalThis.URL.revokeObjectURL = () => {};
globalThis.Blob = class { constructor(p = []) { this.size = 10; this.type = ''; this.partes = p; } };
globalThis.FormData = class { append() {} };
globalThis.FileReader = class { readAsDataURL() {} };
globalThis.Audio = class { constructor() { this.duration = 30; } set src(v) { this._s = v; } get src() { return this._s; } addEventListener() {} load() {} play() { return Promise.resolve(); } pause() {} removeAttribute() {} };
globalThis.AudioContext = globalThis.window.AudioContext;
globalThis.MediaRecorder = globalThis.window.MediaRecorder;
globalThis.MediaStream = class { constructor(t) { this.tracks = t; } getTracks() { return this.tracks; } getVideoTracks() { return this.tracks; } getAudioTracks() { return []; } };
globalThis.Image = class { constructor() { setTimeout(() => { this.naturalWidth = 800; this.naturalHeight = 600; this.onload?.(); }, 0); } };
globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, items: [] }), blob: async () => new globalThis.Blob() });
if (!globalThis.crypto) globalThis.crypto = {};
globalThis.crypto.randomUUID = () => 'uuid-novo';
globalThis.atob = (b) => Buffer.from(b, 'base64').toString('binary');
globalThis.btoa = (b) => Buffer.from(b, 'binary').toString('base64');

// O vídeo que o Painel lista e que aponta para o projeto guardado cá.
const videos = [{
  id: 'v1', nome: 'A Borboleta', projetoId: 'p-1', duracao: 30, video_tamanho: 2048,
  video_uri: 'private/v.webm', thumb_uri: '', formato: '16:9', codec: 'vp8',
  comVoz: true, comMusica: false, legendas: 3, created_date: new Date().toISOString(),
}];
globalThis.__base44Falso = {
  functions: { invoke: async () => ({ ok: true }), fetch: async () => ({ ok: true, json: async () => ({}) }) },
  entities: {
    VideoProducao: { filter: async () => ({ items: videos.slice() }), create: async (r) => r, update: async () => ({}), delete: async () => ({}) },
    Link: { filter: async () => ({ items: [] }), create: async () => ({}) },
    Projeto: { filter: async () => ({ items: [] }), create: async () => ({ id: 'nuvem-1' }), update: async () => ({}), delete: async () => ({}) },
  },
  integrations: { Core: {
    CreateFileSignedUrl: async () => ({ signed_url: 'https://x/1' }),
    UploadPrivateFile: async () => ({ file_uri: 'private/x.webm' }),
  } },
  auth: { me: async () => ({ id: 'u1', email: 'a@b.pt', full_name: 'Ana' }), logout() {}, setToken() {}, isAuthenticated: async () => true },
};

const BASE_M = 'file:///E:/youtube%20rebeca2/rebeca-hub-3.0-base44/public/';
function absoluto(texto) {
  return texto
    .replace(/await import\('@\/base44Client\.js'\)/g, '({ base44: globalThis.__base44Falso })')
    .replace(/^import \{ ehFicheiroVideo \} from '.\/estudio-video-carregado\.mjs';$/m, 'const ehFicheiroVideo = () => false;')
    .replace(/await import\('\.\/([\w.-]+\.mjs)'\)/g, (_m, nome) => `await import('${BASE_M}${nome}')`);
}

const dados = criarIndexedDBFalso();
// O projeto original, já guardado neste computador.
dados.set('p-1', {
  id: 'p-1',
  nome: 'A Borboleta',
  criadoEm: new Date().toISOString(),
  cenas: [
    { imagem: new globalThis.Blob(['x']), nome: 'a.jpg', texto: 'A borboleta pousou na flor.', audioExt: 'mp3' },
    { imagem: new globalThis.Blob(['y']), nome: 'b.jpg', texto: 'Depois voou para o jardim.', audioExt: 'mp3' },
  ],
  config: { formato: '16:9', motor: 'browser' },
});

const erros = [];
process.on('uncaughtException', (e) => { erros.push(e.message); console.error('  ERRO:', e.message); });
process.on('unhandledRejection', (e) => { const m = (e && e.message) || String(e); if (!/pause|mediaDevices|AudioContext|is not a function/.test(m)) { erros.push(m); console.error('  REJEIÇÃO:', m); } });

new Function(absoluto(readFileSync(raiz + 'painel.js', 'utf8')))();
new Function(absoluto(readFileSync(raiz + 'app.js', 'utf8')))();
document.dispatch('DOMContentLoaded');
await new Promise((r) => setTimeout(r, 500));

const vista = () => ({
  drop: !reg.get('drop').hidden,
  estudio: !reg.get('workspace').hidden,
  painel: !reg.get('painel-section').hidden,
});

console.log('\n[1] O cartão do vídeo abre a janela de detalhes');
{
  check(vista().painel === true, 'começa no Painel', JSON.stringify(vista()));
  const cartao = reg.get('grade').children[0];
  check(Boolean(cartao), `o vídeo aparece na lista (${reg.get('grade').children.length} cartão(ões))`, 'a lista está vazia');
  // article → [miniatura, corpo] ; corpo → [nome, meta, etiquetas, acoes]
  const acoes = cartao.children[1].children[3];
  const ver = acoes.children[0];
  check(String(ver.textContent).includes('Ver detalhes'), `o botão "Ver detalhes" existe ("${ver.textContent}")`, String(ver.textContent));
  ver.click();
  await new Promise((r) => setTimeout(r, 400));
  check(reg.get('dlg-detalhes').open === true, 'a janela de detalhes abriu', 'não abriu');
  check(reg.get('det-titulo').textContent === 'A Borboleta', `o título é o do vídeo ("${reg.get('det-titulo').textContent}")`, reg.get('det-titulo').textContent);
}

console.log('\n[2] "✏️ Reeditar projeto" fecha a janela e volta ao estúdio');
{
  const btn = reg.get('btn-det-reeditar');
  check(typeof btn.onclick === 'function', 'o botão "✏️ Reeditar projeto" está ligado', 'sem onclick');
  btn.click();
  await new Promise((r) => setTimeout(r, 900));

  const estado = {
    janela: reg.get('dlg-detalhes').open,
    ...vista(),
    nome: reg.get('projeto-nome').value,
    cenas: reg.get('scenes').children.length,
    toast: reg.get('toast').textContent,
  };
  console.log('     [estado]', JSON.stringify(estado));

  check(estado.janela === false, 'a janela de detalhes FECHOU (não fica por cima do estúdio)', 'a janela continua aberta por cima');
  check(estado.painel === false, 'o Painel saiu de cena', 'o Painel continua à vista');
  check(estado.estudio === true, 'o estúdio está à vista', 'o estúdio não apareceu');
  check(estado.nome === 'A Borboleta', `o projeto carregado é o certo ("${estado.nome}")`, `nome errado: "${estado.nome}"`);
  check(estado.cenas === 2, `as 2 cenas do projeto voltaram (${estado.cenas})`, `cenas: ${estado.cenas}`);
  check(!/não está neste computador nem na nuvem/i.test(estado.toast), 'sem aviso de "projeto em falta"', estado.toast);
  check(!/ainda não está pronto/i.test(estado.toast), 'o estúdio estava pronto quando o pedido chegou', estado.toast);
}

console.log('\n[3] O atalho ✏️ do próprio cartão também abre o projeto');
{
  reg.get('btn-ir-painel').click();
  await new Promise((r) => setTimeout(r, 500));
  const cartao = reg.get('grade').children[0];
  const acoes = cartao.children[1].children[3];
  const reedit = acoes.children[2]; // ✏️
  check(String(reedit.textContent).includes('✏️'), `o botão ✏️ do cartão existe ("${reedit.textContent}")`, String(reedit.textContent));
  reedit.click();
  await new Promise((r) => setTimeout(r, 900));
  const estado = { janela: reg.get('dlg-detalhes').open, ...vista(), nome: reg.get('projeto-nome').value };
  console.log('     [estado]', JSON.stringify(estado));
  check(estado.painel === false && estado.estudio === true, 'foi para o estúdio', JSON.stringify(estado));
  check(estado.nome === 'A Borboleta', `com o projeto certo ("${estado.nome}")`, estado.nome);
}

console.log('\n[4] Sem erros de JavaScript');
if (erros.length) erros.slice(0, 4).forEach((e) => fail('erro: ' + e));
else ok('nenhum erro não tratado');

console.log(falhas.length ? `\n=== ${falhas.length} FALHA(S) ===` : '\n=== REEDITAR OK ===');
process.exit(falhas.length ? 1 : 0);
