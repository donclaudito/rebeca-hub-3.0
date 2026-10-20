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

// Os botões do cartão, pelos títulos (a ordem e a estrutura podem mudar).
const acoesDoCartao = (cartao) => cartao.children.find((c) => String(c.className || '').includes('cartao-acoes'));
const botaoDoCartao = (cartao, titulo) =>
  acoesDoCartao(cartao).children.find((b) => String(b.title || '').toLowerCase().includes(titulo));

console.log('\n[4] Apagar um vídeo que o servidor já não tem (404) tira-o do Painel');
{
  // Era o erro da consola: DELETE em VideoProducao/<id> → 404. O cartão voltava
  // na atualização seguinte e cada tentativa era outro 404.
  globalThis.__base44Falso.entities.VideoProducao.delete = async (id) => {
    if (id === 'v1') {
      const e = new Error('Request failed with status code 404');
      e.status = 404;
      throw e;
    }
    return {};
  };

  const cartao = reg.get('grade').children[0];
  const apagar = botaoDoCartao(cartao, 'apagar do painel');
  check(Boolean(apagar), `há um botão 🗑 no cartão ("${apagar && apagar.textContent}")`, 'sem botão de apagar');
  apagar.click();
  await new Promise((r) => setTimeout(r, 400));

  const msg = reg.get('toast').textContent;
  check(/já não existe no servidor|Retirei-o/i.test(msg), `explica o que aconteceu ("${msg.slice(0, 60)}")`, msg);
  check(reg.get('grade').children.length === N - 1, `o cartão saiu da lista (${reg.get('grade').children.length} de ${N})`, `continuam ${reg.get('grade').children.length}`);

  // E não volta a aparecer ao atualizar o Painel.
  reg.get('btn-recarregar')?.click?.();
  await new Promise((r) => setTimeout(r, 800));
  check(reg.get('grade').children.length === N - 1, `depois de atualizar continua fora (${reg.get('grade').children.length})`, `voltou a aparecer (${reg.get('grade').children.length})`);

  const ocultos = JSON.parse(globalThis.localStorage.getItem('rh3ocultos') || '[]');
  check(ocultos.includes('v1'), 'o id fica guardado como oculto (não volta em nenhuma sessão)', JSON.stringify(ocultos));
}

console.log('\n[5] 🏷️ Muda o nome do cartão no Painel (o "Projeto sem nome")');
{
  // O nome do cartão é o do VÍDEO, copiado quando o vídeo foi guardado. Mudar o
  // nome do projeto no estúdio não mudava este cartão — daqui muda-se.
  const renomeados = [];
  globalThis.__base44Falso.entities.VideoProducao.update = async (id, dados) => {
    renomeados.push({ id, nome: dados && dados.nome });
    const v = videos.find((x) => x.id === id);
    if (v && dados) v.nome = dados.nome;
    return { ...(v || {}), ...dados };
  };
  globalThis.window.prompt = () => 'A Borboleta no jardim';

  const cartao = reg.get('grade').children[0];
  const nomear = botaoDoCartao(cartao, 'mudar o nome');
  check(Boolean(nomear), `há um botão 🏷️ no cartão ("${nomear && nomear.textContent}")`, 'sem botão de nome');
  nomear.click();
  await new Promise((r) => setTimeout(r, 400));

  check(renomeados.length === 1, `pediu a mudança de nome ao servidor (${renomeados.length} pedido)`, `${renomeados.length} pedidos`);
  check(renomeados[0] && renomeados[0].nome === 'A Borboleta no jardim', `com o nome novo ("${renomeados[0] && renomeados[0].nome}")`, String(renomeados[0] && renomeados[0].nome));
  const titulo = reg.get('grade').children[0].children[1].children[0].textContent;
  check(titulo === 'A Borboleta no jardim', `o cartão passa a mostrar o nome novo ("${titulo}")`, `continua "${titulo}"`);

  // Cancelar não muda nada.
  globalThis.window.prompt = () => null;
  botaoDoCartao(reg.get('grade').children[0], 'mudar o nome').click();
  await new Promise((r) => setTimeout(r, 200));
  check(renomeados.length === 1, 'cancelar a janela não faz pedido nenhum', `${renomeados.length} pedidos`);
}

console.log('\n[6] Cada vídeo aparece como na lista de projetos: miniatura · nome · Abrir');
{
  // O utilizador conhecia a lista de projetos do estúdio e o Painel era uma
  // grelha de cartões grandes. Agora é a MESMA forma: uma linha por vídeo.
  const cartao = reg.get('grade').children[0];
  check(String(cartao.className).includes('video-cartao'), 'cada vídeo é uma linha (.video-cartao)', String(cartao.className));
  const [mini, corpo, acoes] = cartao.children;
  check(String(mini.className).includes('miniatura'), '1.º: a miniatura à esquerda', String(mini && mini.className));
  check(String(corpo.className).includes('cartao-corpo'), '2.º: o bloco de texto', String(corpo && corpo.className));
  check(String(acoes.className).includes('cartao-acoes'), '3.º: as ações à direita', String(acoes && acoes.className));

  const nome = corpo.children[0];
  const meta = corpo.children[1];
  check(String(nome.className).includes('cartao-nome'), 'com o nome em destaque', String(nome.className));
  check(String(meta.className).includes('cartao-meta'), 'e uma linha de detalhes', String(meta.className));
  const partes = String(meta.textContent).split('·').map((x) => x.trim()).filter(Boolean);
  check(partes.length >= 4, `a linha de detalhes tem formato, tamanho, duração e quando (${partes.join(' | ')})`, meta.textContent);
  check(partes[partes.length - 1] === 'agora mesmo' || /^há /.test(partes[partes.length - 1]), `o "quando" é relativo, como na lista de projetos ("${partes[partes.length - 1]}")`, partes[partes.length - 1]);

  const primeiro = acoes.children[0];
  check(/Abrir/i.test(String(primeiro.textContent)), `o botão principal é "Abrir" ("${primeiro.textContent}")`, String(primeiro.textContent));

  // E o CSS tem mesmo a lista em coluna (não a grelha antiga).
  const css = readFileSync('E:/youtube rebeca2/rebeca-hub-3.0-base44/public/painel.css', 'utf8');
  check(/\.grade \{[^}]*display: flex;[^}]*flex-direction: column/.test(css), 'o CSS põe a lista em coluna', 'o CSS ainda tem grelha');
  check(/\.miniatura \{[^}]*width: 58px/.test(css), 'a miniatura é pequena (58 px)', 'a miniatura não tem tamanho fixo');
}

console.log('\n[7] Sem erros de JavaScript');
if (erros.length) erros.slice(0, 4).forEach((e) => fail('erro: ' + e));
else ok('nenhum erro não tratado');

console.log(falhas.length ? `\n=== ${falhas.length} FALHA(S) ===` : '\n=== MINIATURAS OK ===');
process.exit(falhas.length ? 1 : 0);
