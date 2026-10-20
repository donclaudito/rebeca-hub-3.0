// Testes da navegação entre vistas: Painel ↔ Estúdio ↔ Temas.
//
// Carrega o index.html e o painel.js VERDADEIROS num DOM falso e confirma que
// cada botão mostra a vista certa — e, principalmente, que o ecrã inicial (a zona
// de arrastar imagens) não reaparece por cima do Painel. Era esse o defeito: o
// "📺 Painel" caía na página inicial.
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
    this.classList = { _s: new Set(), add: (...c) => c.forEach((x) => this.classList._s.add(x)), remove: (...c) => c.forEach((x) => this.classList._s.delete(x)), toggle: (c, f) => (f ? this.classList._s.add(c) : this.classList._s.delete(c)), contains: (c) => this.classList._s.has(c) };
  }
  get textContent() { return this._text; } set textContent(v) { this._text = String(v); }
  get innerHTML() { return this._html; } set innerHTML(v) { this._html = String(v); if (v === '') this.children = []; }
  append(...n) { n.forEach((x) => this.children.push(x)); }
  appendChild(n) { this.children.push(n); return n; }
  remove() {} querySelector() { return null; } querySelectorAll() { return []; }
  replaceChildren(...n) { this.children = [...n]; }
  addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  removeEventListener() {}
  // Atributos a sério: o aria-current dos separadores é verificado nas provas.
  setAttribute(k, v) { (this.attrs = this.attrs || {})[k] = String(v); }
  getAttribute(k) { return (this.attrs && this.attrs[k] !== undefined ? this.attrs[k] : null); }
  removeAttribute(k) { if (this.attrs) delete this.attrs[k]; }
  dispatchEvent(ev) { (this.listeners[ev.type] || []).forEach((f) => f(ev)); }
  click() { if (typeof this.onclick === 'function') this.onclick({ preventDefault() {} }); this.dispatchEvent({ type: 'click' }); }
  pause() {} play() { return Promise.resolve(); }
}

const reg = new Map();
for (const m of html.matchAll(/id="([A-Za-z0-9_-]+)"/g)) {
  const el = new El(m[1]);
  const tag = html.slice(m.index, m.index + 160).split('>')[0];
  if (/\shidden/.test(tag)) el.hidden = true;
  if (/^<button/.test(html.slice(Math.max(0, m.index - 40), m.index).split('<').pop() ? `<${html.slice(Math.max(0, m.index - 40), m.index).split('<').pop()}` : '')) el.tagName = 'BUTTON';
  reg.set(m[1], el);
}

const store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
globalThis.location = { pathname: '/', search: '', hash: '' };
globalThis.history = { replaceState: (_a, _b, url) => { const h = String(url).split('#')[1] || ''; globalThis.location.hash = h ? `#${h}` : ''; } };
globalThis.document = {
  getElementById: (id) => reg.get(id) || null,
  createElement: () => new El(),
  _l: {},
  addEventListener(t, fn) { (this._l[t] = this._l[t] || []).push(fn); },
  dispatch(t, ev = {}) { ((this._l[t] || [])).forEach((f) => f({ preventDefault() {}, ...ev })); },
  documentElement: new El(),
};
globalThis.window = {
  location: globalThis.location,
  addEventListener(t, fn) { (this._l = this._l || {}); (this._l[t] = this._l[t] || []).push(fn); },
  dispatchEvent(e) { ((this._l || {})[e.type] || []).forEach((f) => f(e)); },
  MediaRecorder: class { static isTypeSupported() { return true; } },
  AudioContext: class {},
  speechSynthesis: { getVoices: () => [], speak() {}, cancel() {} },
  confirm: () => true,
};
globalThis.Event = class { constructor(t) { this.type = t; } };
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
globalThis.FormData = class { append() {} };
globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, items: [] }), blob: async () => new globalThis.Blob() });
if (!globalThis.crypto) globalThis.crypto = {};
globalThis.crypto.randomUUID = () => 'id-1';
globalThis.atob = (b) => Buffer.from(b, 'base64').toString('binary');
globalThis.btoa = (b) => Buffer.from(b, 'binary').toString('base64');

// O cliente da Base44 é falso: o painel pede a lista de vídeos.
globalThis.__base44Falso = {
  functions: { invoke: async () => ({ ok: true }), fetch: async () => ({ ok: true, json: async () => ({}) }) },
  entities: {
    VideoProducao: { filter: async () => ({ items: [] }), create: async () => ({}), update: async () => ({}), delete: async () => ({}) },
    Link: { filter: async () => ({ items: [] }), create: async () => ({}) },
    Projeto: { filter: async () => ({ items: [] }), create: async () => ({}) },
  },
  integrations: { Core: { CreateFileSignedUrl: async () => ({ signed_url: 'https://x/1' }) } },
  auth: { me: async () => ({ id: 'u1', email: 'a@b.pt', full_name: 'Ana' }), logout() {}, setToken() {}, isAuthenticated: async () => true },
};

const BASE_M = 'file:///E:/youtube%20rebeca2/rebeca-hub-3.0-base44/public/';

// Os módulos usam `await import('./x.mjs')` relativo; dentro de uma Function isso
// não tem referência de origem, por isso passa-se a URL absoluta.
function absoluto(texto) {
  return texto.replace(/await import\('\.\/([\w.-]+\.mjs)'\)/g, (_m, nome) => `await import('${BASE_M}${nome}')`);
}

const srcPainel = absoluto(
  readFileSync(raiz + 'painel.js', 'utf8').replace(
    /await import\('@\/base44Client\.js'\)/g,
    '({ base44: globalThis.__base44Falso })',
  ).replace(/^import \{ ehFicheiroVideo \} from '.\/estudio-video-carregado\.mjs';$/m, 'const ehFicheiroVideo = () => false;'),
);
const srcApp = absoluto(
  readFileSync(raiz + 'app.js', 'utf8').replace(
    /await import\('@\/base44Client\.js'\)/g,
    '({ base44: globalThis.__base44Falso })',
  ).replace(/^import \{ ehFicheiroVideo \} from '.\/estudio-video-carregado\.mjs';$/m, 'const ehFicheiroVideo = () => false;'),
);

const erros = [];
process.on('uncaughtException', (e) => { erros.push(e.message); console.error('  ERRO:', e.message); });
process.on('unhandledRejection', (e) => { erros.push(String(e && e.message)); console.error('  REJEIÇÃO:', e && e.message); });

// A ORDEM DA PÁGINA: os dois módulos correm antes do DOMContentLoaded, e o
// app.js arranca no DOMContentLoaded (que vem depois). É esta a ordem que
// acontecia no browser e que fazia o ecrã inicial voltar por cima do Painel.
new Function(srcPainel)();
new Function(srcApp)();
document.dispatch('DOMContentLoaded');
await new Promise((r) => setTimeout(r, 400));

const vista = () => ({
  drop: !reg.get('drop').hidden,
  estudio: !reg.get('workspace').hidden,
  painel: !reg.get('painel-section').hidden,
  pesquisa: !reg.get('pesquisa-section').hidden,
});

// Os três separadores: nenhum escondido, e o da vista atual marcado.
const separadores = () => ({
  painel: reg.get('btn-ir-painel'),
  estudio: reg.get('btn-ir-estudio'),
  pesquisa: reg.get('btn-ir-pesquisa'),
});
const todosVisiveis = () => Object.values(separadores()).every((b) => b && b.hidden === false);
const marcado = () => {
  const s = separadores();
  const ativos = Object.entries(s).filter(([, b]) => b && b.classList.contains('ativo')).map(([n]) => n);
  return ativos.length === 1 ? ativos[0] : ativos.join('+') || '(nenhum)';
};

console.log('\n[1] O app abre no Painel, não no ecrã inicial');
{
  const v = vista();
  check(v.painel === true, 'o painel está visível ao abrir', JSON.stringify(v));
  check(v.drop === false, 'a zona de arrastar imagens NÃO aparece por cima do painel', JSON.stringify(v));
  check(v.pesquisa === false, 'a pesquisa está escondida', JSON.stringify(v));
  check(todosVisiveis(), 'os TRÊS separadores estão à vista (Painel · Estúdio · Temas)', 'falta algum separador');
  check(marcado() === 'painel', `e o "Painel" está marcado como o sítio onde estamos (${marcado()})`, marcado());
  check(reg.get('btn-ir-painel').getAttribute('aria-current') === 'page', 'com aria-current="page" para leitores de ecrã', 'sem aria-current');
  check(globalThis.localStorage.getItem('rh3vista') === 'painel', 'o estado da vista fica guardado', String(globalThis.localStorage.getItem('rh3vista')));
}

console.log('\n[2] Do estúdio, o botão "Painel" leva ao Painel — à primeira');
{
  reg.get('btn-ir-estudio').click();
  await new Promise((r) => setTimeout(r, 120));
  let v = vista();
  check(v.drop === true && v.painel === false, 'o estúdio abre (zona de arrastar à vista, painel fora)', JSON.stringify(v));
  check(marcado() === 'estudio', `e o separador "Estúdio" fica marcado (${marcado()})`, marcado());
  check(todosVisiveis(), 'o "Painel" continua à vista, mesmo não sendo a vista atual', 'o botão desapareceu');

  // UMA vez. Tem de chegar ao painel, com a zona de arrastar fora do caminho.
  reg.get('btn-ir-painel').click();
  await new Promise((r) => setTimeout(r, 150));
  v = vista();
  check(v.painel === true, 'com um só clique, o painel aparece', JSON.stringify(v));
  check(v.drop === false, 'e o ecrã inicial NÃO aparece por cima', JSON.stringify(v));
  check(v.estudio === false, 'e o estúdio sai de cena', JSON.stringify(v));
  check(marcado() === 'painel', 'o separador volta a marcar "Painel"', marcado());
  check(globalThis.localStorage.getItem('rh3vista') === 'painel', 'a vista fica guardada como painel', String(globalThis.localStorage.getItem('rh3vista')));
}

console.log('\n[3] O hash acompanha a vista (para o "voltar" e os favoritos)');
{
  reg.get('btn-ir-estudio').click();
  await new Promise((r) => setTimeout(r, 120));
  check(globalThis.location.hash === '#estudio', `no estúdio, o endereço fica "#estudio" (${globalThis.location.hash})`, globalThis.location.hash);
  reg.get('btn-ir-painel').click();
  await new Promise((r) => setTimeout(r, 150));
  check(globalThis.location.hash === '', `no painel, o endereço volta a limpo (${JSON.stringify(globalThis.location.hash)})`, globalThis.location.hash);
  // Temas também tem endereço próprio.
  reg.get('btn-ir-pesquisa').click();
  await new Promise((r) => setTimeout(r, 150));
  check(globalThis.location.hash === '#temas', `nos temas, o endereço fica "#temas" (${globalThis.location.hash})`, globalThis.location.hash);
  check(vista().pesquisa === true, 'e a vista de temas aparece', JSON.stringify(vista()));
  check(marcado() === 'pesquisa', 'com o separador "Temas" marcado', marcado());
  reg.get('btn-ir-painel').click();
  await new Promise((r) => setTimeout(r, 150));
}

console.log('\n[4] Ida e volta várias vezes, sem o ecrã inicial a aparecer');
{
  let problema = '';
  for (let i = 0; i < 4; i++) {
    reg.get('btn-ir-estudio').click();
    await new Promise((r) => setTimeout(r, 60));
    let v = vista();
    if (!v.drop || v.painel) problema = `ida ${i + 1}: ${JSON.stringify(v)}`;
    if (marcado() !== 'estudio') problema = `ida ${i + 1}: separador ${marcado()}`;
    reg.get('btn-ir-painel').click();
    await new Promise((r) => setTimeout(r, 60));
    v = vista();
    if (!v.painel || v.drop || v.estudio) problema = `volta ${i + 1}: ${JSON.stringify(v)}`;
    if (marcado() !== 'painel') problema = `volta ${i + 1}: separador ${marcado()}`;
  }
  check(problema === '', 'em 4 idas e voltas, cada vista aparece sozinha e o separador acompanha', problema);
}

console.log('\n[5] "Novo projeto" abre o estúdio limpo');
{
  reg.get('btn-painel-novo').click();
  await new Promise((r) => setTimeout(r, 150));
  const v = vista();
  check(v.drop === true && v.painel === false, `o estúdio abre (${JSON.stringify(v)})`, JSON.stringify(v));
  check(globalThis.localStorage.getItem('rh3vista') === 'estudio', 'guardado como estúdio', String(globalThis.localStorage.getItem('rh3vista')));
}

console.log('\n[6] A casa é o Painel, mesmo que a última sessão tenha ficado no estúdio');
{
  // O endereço manda: sem hash, abre no painel — não retoma a vista antiga.
  globalThis.localStorage.setItem('rh3vista', 'estudio');
  globalThis.location.hash = '';
  window.dispatchEvent(new Event('hashchange'));
  await new Promise((r) => setTimeout(r, 200));
  const v = vista();
  check(v.painel === true && v.drop === false, `abrir sem endereço dá no painel (${JSON.stringify(v)})`, JSON.stringify(v));
  check(marcado() === 'painel', 'e o separador diz "Painel"', marcado());

  // Mas um endereço com #estudio continua a abrir o estúdio (favorito/link).
  globalThis.location.hash = '#estudio';
  window.dispatchEvent(new Event('hashchange'));
  await new Promise((r) => setTimeout(r, 200));
  check(vista().drop === true, '#estudio abre o estúdio', JSON.stringify(vista()));
  check(marcado() === 'estudio', 'com o separador certo', marcado());
  // E volta ao painel para as provas seguintes.
  reg.get('btn-ir-painel').click();
  await new Promise((r) => setTimeout(r, 150));
}

console.log('\n[7] Sem erros de JavaScript');
if (erros.length) erros.slice(0, 5).forEach((e) => fail('erro: ' + e));
else ok('nenhum erro não tratado');

console.log(falhas.length ? `\n=== ${falhas.length} FALHA(S) ===` : '\n=== NAVEGAÇÃO OK ===');
process.exit(falhas.length ? 1 : 0);
