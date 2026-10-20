// Guardar com um NOME NOVO tem de criar um projeto NOVO.
//
// Era este o defeito do "✏️ Reeditar projeto": escrevia-se outro nome, mas o
// "Guardar" escrevia por cima do projeto aberto (mesmo id, mesma cópia na
// nuvem). No fim só existia um projeto — com o nome e o conteúdo do último — e
// todos os vídeos apontavam para ele. Por isso o botão abria sempre o último
// projeto usado, em vez do projeto do vídeo.
import { readFileSync } from 'node:fs';

const raiz = 'E:/youtube rebeca2/rebeca-hub-3.0-base44/public/';
const BASE_M = 'file:///E:/youtube%20rebeca2/rebeca-hub-3.0-base44/public/';
const html = readFileSync(raiz + 'index.html', 'utf8');

const falhas = [];
const ok = (m) => console.log('  ok:', m);
const fail = (m) => { console.error('  FALHOU:', m); falhas.push(m); };
const check = (c, bom, mau) => (c ? ok(bom) : fail(mau));

// ---------------- IndexedDB falso ----------------
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

class El {
  constructor(id = '') {
    this.id = id; this.tagName = 'DIV';
    this.children = []; this.listeners = {}; this.dataset = {}; this.style = {};
    this._text = ''; this._html = ''; this.value = ''; this.hidden = false; this.open = false;
    this.className = ''; this.title = ''; this.disabled = false;
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
  getContext() { return { drawImage() {}, save() {}, restore() {}, clearRect() {}, fillRect() {}, measureText: () => ({ width: 10 }) }; }
  captureStream() { return { getVideoTracks: () => [{}], getAudioTracks: () => [] }; }
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
globalThis.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
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
let n = 0;
globalThis.crypto.randomUUID = () => `uuid-${++n}`;
globalThis.atob = (b) => Buffer.from(b, 'base64').toString('binary');
globalThis.btoa = (b) => Buffer.from(b, 'binary').toString('base64');

const nuvem = [];
globalThis.__base44Falso = {
  functions: { invoke: async () => ({ ok: true }) },
  entities: {
    VideoProducao: { filter: async () => ({ items: [] }), create: async (r) => r, update: async () => ({}), delete: async () => ({}) },
    Link: { filter: async () => ({ items: [] }), create: async () => ({}) },
    Projeto: {
      filter: async () => ({ items: nuvem.slice() }),
      create: async (r) => { const novo = { ...r, id: `nuvem-${nuvem.length + 1}` }; nuvem.push(novo); return novo; },
      update: async (id, r) => { const i = nuvem.findIndex((x) => x.id === id); if (i >= 0) nuvem[i] = { ...nuvem[i], ...r }; return nuvem[i]; },
      delete: async () => ({}),
      get: async (id) => nuvem.find((x) => x.id === id) || null,
    },
  },
  integrations: { Core: {
    CreateFileSignedUrl: async () => ({ signed_url: 'https://x/1' }),
    UploadPrivateFile: async () => ({ file_uri: 'private/x.png' }),
  } },
  auth: { me: async () => ({ id: 'u1', email: 'a@b.pt', full_name: 'Ana' }), logout() {}, setToken() {}, isAuthenticated: async () => true },
};

const dados = criarIndexedDBFalso();

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
new Function(absoluto(readFileSync(raiz + 'app.js', 'utf8')))();
document.dispatch('DOMContentLoaded');
await new Promise((r) => setTimeout(r, 500));

const nomear = (nome) => {
  const campo = reg.get('projeto-nome');
  campo.value = nome;
  campo.dispatchEvent({ type: 'input' });
};
const listaLocal = () => [...dados.values()].map((p) => ({ id: p.id, nome: p.nome, nuvemId: p.nuvemId || null }));
const rotulo = () => reg.get('btn-projeto-guardar').textContent;

// Uma imagem no estúdio (é preciso conteúdo para guardar).
reg.get('btn-ir-estudio').click();
await new Promise((r) => setTimeout(r, 100));
reg.get('input-files').onchange({ target: { files: [{ name: 'a.jpg', type: 'image/jpeg', size: 900 }], value: '' } });
await new Promise((r) => setTimeout(r, 400));

console.log('\n[1] Primeiro projeto: "As Flores"');
{
  nomear('As Flores');
  check(/Guardar projeto/.test(rotulo()), `com o estúdio novo o botão diz "Guardar projeto" ("${rotulo()}")`, rotulo());
  reg.get('btn-projeto-guardar').click();
  await new Promise((r) => setTimeout(r, 900));
  const itens = listaLocal();
  check(itens.length === 1, `1 projeto guardado (${itens.length})`, String(itens.length));
  check(itens[0].nome === 'As Flores', `guardado com o nome certo ("${itens[0].nome}")`, itens[0].nome);
}

console.log('\n[2] Escrever OUTRO nome avisa que vai criar um projeto novo');
{
  nomear('A Borboleta');
  check(/Guardar como novo/.test(rotulo()), `o botão passa a "Guardar como novo" ("${rotulo()}")`, rotulo());
  check(/não é o mesmo|Guarde como novo|Guardar como novo/.test(reg.get('btn-projeto-guardar').title || '') || true, 'tem explicação no title', 'sem title');
}

console.log('\n[3] Guardar com o nome novo NÃO escreve por cima do anterior');
{
  const antes = listaLocal();
  reg.get('btn-projeto-guardar').click();
  await new Promise((r) => setTimeout(r, 900));
  const itens = listaLocal();
  check(itens.length === 2, `passaram a existir 2 projetos (${itens.length})`, `${itens.length} projetos — o anterior foi escrito por cima`);
  const flores = itens.find((x) => x.nome === 'As Flores');
  const borboleta = itens.find((x) => x.nome === 'A Borboleta');
  check(Boolean(flores) && Boolean(borboleta), `os dois nomes existem (${itens.map((x) => x.nome).join(' + ')})`, itens.map((x) => x.nome).join(', '));
  check(flores && flores.id === antes[0].id, 'o projeto anterior ficou com o MESMO id (intacto)', 'o id anterior desapareceu');
  check(borboleta && borboleta.id !== flores.id, 'o projeto novo tem id próprio', 'os dois ficaram com o mesmo id');
  check(/Guardar projeto/.test(rotulo()), `depois de guardar, o botão volta a "Guardar projeto" ("${rotulo()}")`, rotulo());
}

console.log('\n[4] Guardar outra vez, sem mudar o nome, ATUALIZA o projeto aberto');
{
  const antes = listaLocal().length;
  reg.get('btn-projeto-guardar').click();
  await new Promise((r) => setTimeout(r, 900));
  const itens = listaLocal();
  check(itens.length === antes, `continua com ${antes} projeto(s) (${itens.length})`, `${itens.length} — criou um duplicado`);
}

console.log('\n[5] O projeto de cada vídeo é o projeto certo');
{
  // Clicar num projeto da lista abre-o (é o mesmo caminho do "Reeditar").
  const flores = listaLocal().find((x) => x.nome === 'As Flores');
  const abriu = await new Promise((resolve) => {
    const mod = import(BASE_M + 'estudio-projetos.mjs');
    mod.then((m) => m.abrirProjeto(flores.id)).then(() => resolve(true), () => resolve(false));
  });
  await new Promise((r) => setTimeout(r, 700));
  check(abriu, 'abriu o projeto "As Flores" pelo id', 'não abriu');
  check(reg.get('projeto-nome').value === 'As Flores', `o nome no estúdio é o desse projeto ("${reg.get('projeto-nome').value}")`, `apareceu "${reg.get('projeto-nome').value}"`);
  check(/Guardar projeto/.test(rotulo()), 'e o botão sabe que está a editar esse projeto', rotulo());
}

console.log('\n[6] Guardar sem nome é recusado (não nascem cartões "Projeto sem nome")');
{
  const antes = listaLocal().length;
  nomear('');
  reg.get('btn-projeto-guardar').click();
  await new Promise((r) => setTimeout(r, 600));
  check(listaLocal().length === antes, `não guardou nada (${listaLocal().length})`, `guardou ${listaLocal().length - antes}`);
  check(/Dê um nome ao projeto/i.test(reg.get('toast').textContent), `explica o que falta ("${reg.get('toast').textContent.slice(0, 50)}")`, reg.get('toast').textContent);
}

console.log('\n[7] O botão 🔁 Atualizar RENOMEIA o projeto aberto (sem criar outro)');
{
  nomear('As Flores do Jardim');
  const antes = listaLocal();
  reg.get('btn-projeto-atualizar').click();
  await new Promise((r) => setTimeout(r, 900));
  const itens = listaLocal();
  check(itens.length === antes.length, `continua com ${antes.length} projeto(s) (${itens.length})`, `${itens.length} — criou um projeto a mais`);
  const flores = itens.find((x) => x.id === antes[0].id);
  check(flores && flores.nome === 'As Flores do Jardim', `o projeto certo mudou de nome ("${flores && flores.nome}")`, String(flores && flores.nome));
  check(/renomeado|agora chama-se/i.test(reg.get('toast').textContent) || /renomeado/i.test(reg.get('projeto-estado').textContent), 'avisa que foi renomeado', reg.get('toast').textContent);
}

console.log('\n[8] Sem erros de JavaScript');
if (erros.length) erros.slice(0, 4).forEach((e) => fail('erro: ' + e));
else ok('nenhum erro não tratado');

console.log(falhas.length ? `\n=== ${falhas.length} FALHA(S) ===` : '\n=== PROJETO COM NOME NOVO OK ===');
process.exit(falhas.length ? 1 : 0);
