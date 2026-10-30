// O que se guarda na nuvem tem de APARECER no Painel.
//
// Dois defeitos reais deste caminho:
//  1. o Painel só listava VÍDEOS. Um projeto guardado com "☁️ Guardar na nuvem"
//     (sem vídeo) não aparecia em lado nenhum — o utilizador via "guardei na
//     nuvem e não apareceu".
//  2. a lista do Painel recarregava no máximo de 30 em 30 s: ir logo ao Painel
//     depois de guardar mostrava a lista antiga, sem o que acabou de ser gravado.
//
// Corre o painel.js VERDADEIRO num DOM falso, com IndexedDB falso.
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
    this.open = false;
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

// ---------------- IndexedDB falso (o dos projetos locais) ----------------
const dadosLocais = new Map();
globalThis.indexedDB = {
  open() {
    const loja = {
      put(r) { dadosLocais.set(r.id, r); return { result: r.id }; },
      get(id) { return { result: dadosLocais.get(id) }; },
      getAll() { return { result: [...dadosLocais.values()] }; },
      delete(id) { dadosLocais.delete(id); return { result: undefined }; },
      clear() { dadosLocais.clear(); return { result: undefined }; },
      createIndex() {},
    };
    const db = {
      objectStoreNames: { contains: () => true },
      transaction() {
        const t = { objectStore: () => loja, error: null };
        queueMicrotask(() => t.oncomplete && t.oncomplete());
        return t;
      },
      close() {},
    };
    const pedido = { result: db, error: null };
    queueMicrotask(() => { pedido.onupgradeneeded?.(); pedido.onsuccess?.(); });
    return pedido;
  },
};

const store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
globalThis.localStorage.setItem('base44_access_token', 'token-de-teste');
globalThis.localStorage.setItem('rh3vista', 'painel');
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
const eventosJanela = [];
globalThis.window = {
  location: globalThis.location,
  _l: {},
  addEventListener(t, fn) { (this._l[t] = this._l[t] || []).push(fn); },
  dispatchEvent(e) { eventosJanela.push(e); ((this._l[e.type] || [])).forEach((f) => f(e)); },
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
globalThis.Blob = class { constructor(p = []) { this.size = 10; this.type = ''; } };
globalThis.FormData = class { append() {} };
globalThis.FileReader = class { readAsDataURL() {} };
globalThis.Audio = class { constructor() { this.duration = 30; } set src(v) { this._s = v; } get src() { return this._s; } addEventListener() {} load() {} play() { return Promise.resolve(); } pause() {} removeAttribute() {} };
globalThis.AudioContext = globalThis.window.AudioContext;
globalThis.MediaRecorder = globalThis.window.MediaRecorder;
globalThis.Image = class { constructor() { setTimeout(() => { this.naturalWidth = 800; this.naturalHeight = 600; this.onload?.(); }, 0); } };
globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, items: [] }), blob: async () => new globalThis.Blob() });
if (!globalThis.crypto) globalThis.crypto = {};
globalThis.crypto.randomUUID = () => 'uuid-teste';
globalThis.atob = (b) => Buffer.from(b, 'base64').toString('binary');
globalThis.btoa = (b) => Buffer.from(b, 'binary').toString('base64');

// ---------------- a nuvem falsa ----------------
const ID_COM_VIDEO = 'aaaaaaaaaaaaaaaaaaaaaaaa'; // 24 hex = id de projeto na nuvem
const ID_SEM_VIDEO = 'bbbbbbbbbbbbbbbbbbbbbbbb';
let filtrosDeProjetos = 0;

const videos = [
  {
    id: 'v1', nome: 'A Borboleta', projetoId: ID_COM_VIDEO, duracao: 30, video_tamanho: 2048,
    video_uri: 'private/v.webm', thumb_uri: '', formato: '16:9', codec: 'vp8',
    comVoz: true, comMusica: false, legendas: 3, created_date: new Date().toISOString(),
  },
];
const projetosNuvem = [
  { id: ID_COM_VIDEO, nome: 'A Borboleta', cenas: JSON.stringify([{ nome: 'a.jpg', imagem_uri: '', audio_uri: '' }]), updated_date: new Date().toISOString() },
  { id: ID_SEM_VIDEO, nome: 'Só o projeto', cenas: JSON.stringify([{ nome: 'b.jpg', imagem_uri: '', audio_uri: '' }, { nome: 'c.jpg', imagem_uri: '', audio_uri: '' }]), updated_date: new Date().toISOString() },
];

globalThis.__base44Falso = {
  functions: { invoke: async () => ({ ok: true }), fetch: async () => ({ ok: true, json: async () => ({}) }) },
  entities: {
    VideoProducao: {
      filter: async () => ({ items: videos.slice() }),
      create: async (r) => r, update: async () => ({}), delete: async () => ({}),
    },
    Projeto: {
      filter: async () => { filtrosDeProjetos += 1; return { items: projetosNuvem.map((p) => ({ ...p })) }; },
      get: async (id) => projetosNuvem.find((p) => p.id === id) || null,
      create: async () => ({ id: 'novo' }), update: async () => ({}), delete: async () => ({}),
    },
    Link: { filter: async () => ({ items: [] }), create: async () => ({}) },
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
    .replace(/await import\('\.\/([\w.-]+\.mjs)'\)/g, (_m, nome) => `await import('${BASE_M}${nome}')`);
}

// O `reeditar` verdadeiro abre o projeto pela nuvem, e esse caminho passa pelo
// cliente `@/base44Client.js` (um alias do Vite, que o Node não resolve). Aqui
// substitui-se só o corpo dele por uma espiã: o que este teste prova é que o
// botão da lista manda o ID DA NUVEM certo — abrir o projeto já é provado em
// testes/reeditar.mjs.
const fonteDoPainel = absoluto(readFileSync(raiz + 'painel.js', 'utf8')).replace(
  'async function reeditar(p) {',
  'async function reeditar(p) { globalThis.__reeditado = p; if (globalThis.__espiarReeditar) return;',
);
new Function(fonteDoPainel)();
await new Promise((r) => setTimeout(r, 600));

const secao = () => reg.get('painel-nuvem');
const itens = () => (reg.get('painel-nuvem-lista') || { children: [] }).children;
const textos = () => itens().map((li) => li.children.map((c) => c.textContent).join(' | '));

console.log('\n[1] O projeto guardado na nuvem APARECE no Painel');
{
  check(secao() && secao().hidden === false, 'a secção "Projetos guardados na nuvem" aparece', 'a secção ficou escondida');
  check(itens().length === 1, `só o projeto que ainda não tem vídeo é listado (${itens().length})`, `${itens().length}: ${textos().join(' // ')}`);
  const t = textos()[0] || '';
  check(/Só o projeto/.test(t), `é o projeto certo ("${t.slice(0, 60)}")`, t);
  check(!/A Borboleta/.test(t), 'o projeto que já tem vídeo não é duplicado', t);
  check(/2 cena/.test(t), 'diz quantas cenas tem', t);
  check(/guardado/.test(t), 'diz quando foi guardado', t);
  const botao = (itens()[0] || { children: [] }).children.find((c) => /Abrir no estúdio/.test(c.textContent));
  check(Boolean(botao), 'tem o botão de abrir no estúdio', JSON.stringify((itens()[0] || {}).children?.map?.((c) => c.textContent)));
}

console.log('\n[2] Abrir um deles pede o projeto da NUVEM ao estúdio');
{
  globalThis.__reeditado = null;
  globalThis.__espiarReeditar = true;
  const botao = (itens()[0] || { children: [] }).children.find((c) => /Abrir no estúdio/.test(c.textContent));
  botao.click();
  await new Promise((r) => setTimeout(r, 200));
  const p = globalThis.__reeditado;
  check(Boolean(p), `o botão pediu para abrir (${JSON.stringify(p)})`, 'não pediu nada');
  check(p && p.projetoId === ID_SEM_VIDEO, `mandou o id do projeto na nuvem (${p && p.projetoId})`, String(p && p.projetoId));
  check(p && /Só o projeto/.test(p.nome || ''), `com o nome certo (${p && p.nome})`, String(p && p.nome));
}

console.log('\n[3] Guardar na nuvem recarrega a lista JÁ (sem esperar 30 s)');
{
  const antes = filtrosDeProjetos;
  globalThis.window.dispatchEvent(new globalThis.Event('rh-guardado-na-nuvem'));
  await new Promise((r) => setTimeout(r, 400));
  check(filtrosDeProjetos > antes, `a lista de projetos foi pedida outra vez (${antes} → ${filtrosDeProjetos})`, `ficou em ${filtrosDeProjetos}`);
  // O evento do vídeo também força (é o outro botão "Guardar na nuvem").
  const antes2 = filtrosDeProjetos;
  globalThis.window.dispatchEvent(new globalThis.Event('rh-video-guardado'));
  await new Promise((r) => setTimeout(r, 400));
  check(filtrosDeProjetos > antes2, `o aviso do vídeo também recarrega (${antes2} → ${filtrosDeProjetos})`, `ficou em ${filtrosDeProjetos}`);
}

console.log('\n[4] Sem sessão não se pede nada');
{
  const origem = globalThis.localStorage.getItem;
  globalThis.localStorage.getItem = (k) => (k === 'base44_access_token' ? null : origem(k));
  const antes = filtrosDeProjetos;
  globalThis.window.dispatchEvent(new globalThis.Event('rh-guardado-na-nuvem'));
  await new Promise((r) => setTimeout(r, 400));
  check(filtrosDeProjetos === antes, 'sem token não há pedidos à nuvem', `pediu ${filtrosDeProjetos - antes} vez(es)`);
  check(secao().hidden === true, 'e a secção fica escondida', 'a secção continuou à vista');
  globalThis.localStorage.getItem = origem;
}

console.log('\n[5] O estúdio avisa o Painel ao guardar');
{
  const est = readFileSync(raiz + 'estudio-projetos.mjs', 'utf8');
  check(/rh-guardado-na-nuvem/.test(est), 'o projeto guardado na nuvem avisa o Painel', 'não avisa');
  const app = readFileSync(raiz + 'app.js', 'utf8');
  check(/rh-video-guardado/.test(app), 'o vídeo guardado na nuvem avisa o Painel', 'não avisa');
  const painel = readFileSync(raiz + 'painel.js', 'utf8');
  check(/carregarProjetosNuvem/.test(painel), 'o Painel pede a lista de projetos da nuvem', 'não pede');
}

console.log(falhas.length ? `\n=== ${falhas.length} FALHA(S) ===` : '\n=== PAINEL DA NUVEM OK ===');
process.exit(falhas.length ? 1 : 0);
