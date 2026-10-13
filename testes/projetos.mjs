// Testes dos projetos guardados: o módulo (IndexedDB) e o caminho real de
// guardar e voltar a abrir um trabalho.
//
// O IndexedDB é substituído por um falso em memória que fala a MESMA linguagem
// (open/transaction/objectStore/put/getAll/get/delete), para o código correr sem
// browser. Isto testa o que o módulo faz, não o browser.
import { readFileSync } from 'node:fs';

const BASE = 'file:///E:/youtube%20rebeca2/rebeca-hub-3.0-base44/public/';
const raiz = 'E:/youtube rebeca2/rebeca-hub-3.0-base44/public/';

const falhas = [];
const ok = (m) => console.log('  ok:', m);
const fail = (m) => { console.error('  FALHOU:', m); falhas.push(m); };
const perto = (a, b, tol = 0.001) => Math.abs(a - b) <= tol;
const check = (c, bom, mau) => (c ? ok(bom) : fail(mau));

// ---------------- IndexedDB falso ----------------
function criarIndexedDBFalso() {
  const dados = new Map();
  const estado = { puts: 0, deletes: 0, gets: 0 };

  const criarLoja = () => ({
    put(registo) {
      estado.puts++;
      dados.set(registo.id, registo);
      return { result: registo.id };
    },
    get(id) {
      estado.gets++;
      return { result: dados.get(id) };
    },
    getAll() {
      return { result: [...dados.values()] };
    },
    delete(id) {
      estado.deletes++;
      dados.delete(id);
      return { result: undefined };
    },
    clear() {
      dados.clear();
      return { result: undefined };
    },
    createIndex() {},
  });

  const db = {
    objectStoreNames: { contains: () => true },
    transaction() {
      const loja = criarLoja();
      const t = { objectStore: () => loja, error: null };
      // A transação "termina" no microtask seguinte, como uma a sério.
      queueMicrotask(() => t.oncomplete && t.oncomplete());
      return t;
    },
    close() {},
  };

  globalThis.indexedDB = {
    open() {
      const pedido = { result: db, error: null };
      queueMicrotask(() => {
        if (pedido.onupgradeneeded) pedido.onupgradeneeded();
        if (pedido.onsuccess) pedido.onsuccess();
      });
      return pedido;
    },
  };
  return { dados, estado };
}

// ---------------- Blob falso ----------------
class BlobFalso {
  constructor(partes = [], opcoes = {}) {
    this.partes = partes;
    this.type = (opcoes && opcoes.type) || '';
    this.size = partes.reduce((s, p) => s + (typeof p === 'string' ? p.length : p.byteLength || p.size || 0), 0);
  }
  async arrayBuffer() { return new ArrayBuffer(this.size); }
}
globalThis.Blob = BlobFalso;

const mod = await import(BASE + 'projetos.mjs');
const { dados } = criarIndexedDBFalso();

console.log('\n[1] Guardar, listar e ler um projeto');
{
  const cenas = [
    { nome: 'a.jpg', imagem: new BlobFalso(['x'.repeat(1000)]), texto: 'Primeira cena.', audio: new BlobFalso(['a'.repeat(500)]), audioExt: 'audio/webm', previaVoz: '' },
    { nome: 'b.jpg', imagem: new BlobFalso(['y'.repeat(2000)]), texto: '', audio: null, audioExt: '', previaVoz: '' },
    { nome: 'c.jpg', imagem: new BlobFalso(['z'.repeat(3000)]), texto: 'Terceira.', audio: new BlobFalso(['b'.repeat(700)]), audioExt: 'audio/webm', previaVoz: '' },
  ];
  const guardado = await mod.guardarProjeto({ id: 'p1', nome: 'A Borboleta', criadoEm: 1000, cenas, config: { tom: 'acolhedora' } });
  check(guardado.guardadoEm > 0, 'o projeto fica com a hora em que foi guardado', String(guardado.guardadoEm));
  check(dados.size === 1, `ficou 1 projeto no arquivo (${dados.size})`, String(dados.size));

  const lista = await mod.listarProjetos();
  check(lista.length === 1, `a lista tem 1 projeto (${lista.length})`, String(lista.length));
  const p = lista[0];
  check(p.id === 'p1' && p.nome === 'A Borboleta', `nome e id certos (${p.nome})`, JSON.stringify(p));
  check(p.imagens === 3, `conta 3 imagens (${p.imagens})`, String(p.imagens));
  check(p.comTexto === 2, `conta 2 cenas com texto (${p.comTexto})`, String(p.comTexto));
  check(p.comAudio === 2, `conta 2 cenas com áudio (${p.comAudio})`, String(p.comAudio));
  check(p.miniatura instanceof BlobFalso, 'a miniatura é a imagem da 1.ª cena', String(p.miniatura));
  check(perto(p.bytes, 1000 + 500 + 2000 + 3000 + 700, 1), `soma o tamanho de tudo (${p.bytes} bytes)`, String(p.bytes));
  // A lista NÃO pode trazer as imagens todas (senão abre devagar).
  check(p.imagem === undefined && p.cenas === undefined, 'a lista não traz as imagens nem o áudio', 'trouxe tudo');

  const inteiro = await mod.lerProjeto('p1');
  check(inteiro && inteiro.cenas.length === 3, 'ler o projeto traz as 3 cenas', String(inteiro && inteiro.cenas.length));
  check(inteiro.cenas[0].texto === 'Primeira cena.', 'o texto de cada cena volta intacto', inteiro.cenas[0].texto);
  check(inteiro.cenas[0].imagem instanceof BlobFalso, 'a imagem volta como ficheiro', String(inteiro.cenas[0].imagem));
  check(inteiro.config.tom === 'acolhedora', 'as preferências voltam com o projeto', JSON.stringify(inteiro.config));
  check(inteiro.criadoEm === 1000, 'a data de criação mantém-se', String(inteiro.criadoEm));
}

console.log('\n[2] O mais recente vem primeiro');
{
  await mod.guardarProjeto({ id: 'p2', nome: 'Segundo', criadoEm: 2000, cenas: [] });
  await new Promise((r) => setTimeout(r, 5));
  await mod.guardarProjeto({ id: 'p3', nome: 'Terceiro', criadoEm: 3000, cenas: [] });
  const lista = await mod.listarProjetos();
  check(lista.length === 3, `3 projetos no arquivo (${lista.length})`, String(lista.length));
  check(lista[0].id === 'p3', `o mais recente vem primeiro (${lista[0].nome})`, lista.map((x) => x.nome).join(', '));
  check(lista[0].guardadoEm >= lista[1].guardadoEm, 'a ordem é pela hora de guardar', 'ordem errada');
}

console.log('\n[3] Guardar outra vez substitui, não duplica');
{
  const antes = dados.size;
  await mod.guardarProjeto({ id: 'p1', nome: 'A Borboleta (revista)', criadoEm: 1000, cenas: [{ nome: 'a.jpg', imagem: new BlobFalso(['x']), texto: 'Novo texto.', audio: null, audioExt: '', previaVoz: '' }] });
  check(dados.size === antes, `o arquivo continua com ${antes} projeto(s)`, `${dados.size} ≠ ${antes}`);
  const p = await mod.lerProjeto('p1');
  check(p.nome === 'A Borboleta (revista)' && p.cenas.length === 1, 'o projeto ficou com o conteúdo novo', JSON.stringify({ nome: p.nome, cenas: p.cenas.length }));
}

console.log('\n[4] Apagar um projeto');
{
  const apagou = await mod.apagarProjeto('p2');
  check(apagou === true, 'apagar devolve true', String(apagou));
  const lista = await mod.listarProjetos();
  check(!lista.some((p) => p.id === 'p2'), 'o projeto apagado desapareceu da lista', lista.map((p) => p.id).join(', '));
  check((await mod.lerProjeto('p2')) === null, 'e já não se consegue abrir', 'ainda abriu');
  check(lista.length === 2, `sobraram 2 projetos (${lista.length})`, String(lista.length));
}

console.log('\n[5] Tamanhos e datas legíveis');
{
  check(mod.tamanhoLegivel(0) === '0 B', `0 bytes → "${mod.tamanhoLegivel(0)}"`, mod.tamanhoLegivel(0));
  check(mod.tamanhoLegivel(2048) === '2 kB', `2048 → "${mod.tamanhoLegivel(2048)}"`, mod.tamanhoLegivel(2048));
  check(/1\.5 MB/.test(mod.tamanhoLegivel(1572864)), `1,5 MB → "${mod.tamanhoLegivel(1572864)}"`, mod.tamanhoLegivel(1572864));
  check(/GB/.test(mod.tamanhoLegivel(3 * 1073741824)), `3 GB → "${mod.tamanhoLegivel(3 * 1073741824)}"`, mod.tamanhoLegivel(3 * 1073741824));
  check(mod.tamanhoLegivel(undefined) === '0 B', 'tamanho inválido não rebenta', mod.tamanhoLegivel(undefined));

  const agora = 1_700_000_000_000;
  check(mod.quandoFoi(agora - 10_000, agora) === 'agora mesmo', `10s → "${mod.quandoFoi(agora - 10000, agora)}"`, mod.quandoFoi(agora - 10000, agora));
  check(/3 min/.test(mod.quandoFoi(agora - 180_000, agora)), `3 min → "${mod.quandoFoi(agora - 180000, agora)}"`, mod.quandoFoi(agora - 180000, agora));
  check(/2 h/.test(mod.quandoFoi(agora - 7_200_000, agora)), `2 h → "${mod.quandoFoi(agora - 7200000, agora)}"`, mod.quandoFoi(agora - 7200000, agora));
  check(mod.quandoFoi(agora - 90_000_000, agora) === 'ontem', `1 dia → "${mod.quandoFoi(agora - 90000000, agora)}"`, mod.quandoFoi(agora - 90000000, agora));
  check(/\d{2}\/\d{2}\/\d{4}/.test(mod.quandoFoi(agora - 40 * 86_400_000, agora)), 'mais de uma semana mostra a data', mod.quandoFoi(agora - 40 * 86400000, agora));
  check(mod.quandoFoi(0, agora) === '—', 'sem data mostra travessão', mod.quandoFoi(0, agora));
}

console.log('\n[6] Guardar tudo sem nada guardado não rebenta');
{
  await mod.apagarTudo();
  const lista = await mod.listarProjetos();
  check(lista.length === 0, 'depois de apagar tudo, a lista está vazia', String(lista.length));
  check((await mod.lerProjeto('nao-existe')) === null, 'abrir um id inexistente devolve null', 'não devolveu null');
  check(mod.tamanhoDe(null) === 0, 'tamanhoDe(null) devolve 0', String(mod.tamanhoDe(null)));
  check(mod.tamanhoDe({}) === 0, 'tamanhoDe({}) devolve 0', String(mod.tamanhoDe({})));
}

// ---------------------------------------------------------------- caminho real
// Agora o app.js verdadeiro: importar imagens, guardar, limpar e reabrir.
class El {
  constructor(tag = 'div') {
    this.tagName = String(tag).toUpperCase();
    this.children = []; this.listeners = {}; this.style = {}; this.dataset = {}; this.attrs = {};
    this._text = ''; this._html = ''; this.value = ''; this.checked = false;
    this.hidden = false; this.disabled = false; this.title = ''; this.type = ''; this.files = null;
    this.width = 0; this.height = 0; this.src = ''; this.alt = '';
    this.classList = { _s: new Set(), add: (...c) => c.forEach((x) => this.classList._s.add(x)), remove: (...c) => c.forEach((x) => this.classList._s.delete(x)), toggle: (c, f) => (f ? this.classList._s.add(c) : this.classList._s.delete(c)), contains: (c) => this.classList._s.has(c) };
    this.className = '';
  }
  get textContent() { return this._text; } set textContent(v) { this._text = String(v); }
  get innerHTML() { return this._html; } set innerHTML(v) { this._html = String(v); if (v === '') this.children = []; }
  set className(v) { this._classe = String(v); this.classList._s = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get className() { return this._classe || ''; }
  append(...n) { n.forEach((x) => this.children.push(x)); }
  appendChild(n) { this.children.push(n); return n; }
  remove() {} setAttribute() { } removeAttribute() { this.src = ''; }
  addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  removeEventListener() {} dispatchEvent(ev) { (this.listeners[ev.type] || []).forEach((f) => f(ev)); }
  click() { if (typeof this.onclick === 'function') this.onclick({ preventDefault() {} }); this.dispatchEvent({ type: 'click' }); }
  querySelector() { return null; } querySelectorAll() { return []; }
  pause() {} play() { return Promise.resolve(); }
}

const html = readFileSync(raiz + 'index.html', 'utf8');
const reg = new Map();
for (const m of html.matchAll(/id="([A-Za-z0-9_-]+)"/g)) {
  const el = new El(/<canvas/.test(html.slice(Math.max(0, m.index - 30), m.index)) ? 'canvas' : 'div');
  const tag = html.slice(m.index, m.index + 160).split('>')[0];
  if (/\shidden/.test(tag)) el.hidden = true;
  if (/\sdisabled/.test(tag)) el.disabled = true;
  el.getContext = () => ({ drawImage() {}, save() {}, restore() {}, clearRect() {}, measureText: () => ({ width: 10 }) });
  el.captureStream = () => ({ getVideoTracks: () => [{}], getAudioTracks: () => [] });
  if (/id="trilha-ligada"/.test(html.slice(m.index - 6, m.index + 20))) el.checked = true;
  reg.set(m[1], el);
}

const store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
globalThis.document = {
  getElementById: (id) => reg.get(id) || null,
  createElement: (t) => { const el = new El(t); el.getContext = () => ({ drawImage() {}, save() {}, restore() {}, clearRect() {}, measureText: () => ({ width: 10 }) }); el.captureStream = () => ({ getVideoTracks: () => [{}], getAudioTracks: () => [] }); return el; },
  _l: {}, addEventListener(t, fn) { (this._l[t] = this._l[t] || []).push(fn); },
  dispatch(t, ev = {}) { ((this._l[t] || [])).forEach((f) => f({ preventDefault() {}, ...ev })); },
  documentElement: new El('html'),
};
globalThis.window = { MediaRecorder: class { static isTypeSupported() { return true; } }, AudioContext: class {}, speechSynthesis: { getVoices: () => [], speak() {}, cancel() {} }, confirm: () => true };
globalThis.speechSynthesis = globalThis.window.speechSynthesis;
globalThis.SpeechSynthesisUtterance = class {};
globalThis.Audio = class { constructor() { this.duration = 30; this.listeners = {}; } set src(v) { this._s = v; setTimeout(() => { (this.listeners.loadedmetadata || []).forEach((f) => f()); this.onloadedmetadata?.(); }, 0); } get src() { return this._s; } load() {} addEventListener(e, f) { (this.listeners[e] = this.listeners[e] || []).push(f); } play() { return Promise.resolve(); } pause() {} removeAttribute() {} };
globalThis.AudioContext = globalThis.window.AudioContext;
globalThis.MediaRecorder = globalThis.window.MediaRecorder;
globalThis.MediaStream = class { constructor(t) { this.tracks = t; } getTracks() { return this.tracks; } getVideoTracks() { return this.tracks; } getAudioTracks() { return []; } };
globalThis.Image = class { constructor() { setTimeout(() => { this.naturalWidth = 800; this.naturalHeight = 600; this.onload?.(); }, 0); } };
globalThis.performance = { now: () => Date.now() };
globalThis.requestAnimationFrame = () => 1;
globalThis.URL.createObjectURL = () => 'blob:falso';
globalThis.URL.revokeObjectURL = () => {};
globalThis.FormData = class { append() {} };
globalThis.FileReader = class { readAsDataURL() { setTimeout(() => { this.result = 'data:image/png;base64,AAAA'; this.onload?.(); }, 0); } };
globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, key: { hasKey: true } }), blob: async () => new BlobFalso(['audio']) });
if (!globalThis.crypto) globalThis.crypto = {};
let nId = 0;
globalThis.crypto.randomUUID = () => `id-${++nId}`;
globalThis.atob = (b64) => Buffer.from(b64, 'base64').toString('binary');
globalThis.btoa = (bin) => Buffer.from(bin, 'binary').toString('base64');

let js = readFileSync(raiz + 'app.js', 'utf8');
js = js.replace(/await import\('@\/base44Client\.js'\)/g, '({ base44: { functions: { invoke: async () => ({ ok: true }) } } })');
js = js.replace(/await import\('\.\/video\.mjs'\)/g, `await import('${BASE}video.mjs')`);
js = js.replace(/await import\('\.\/audio-info\.mjs'\)/g, `await import('${BASE}audio-info.mjs')`);
js = js.replace(/await import\('\.\/legendas-core\.mjs'\)/g, `await import('${BASE}legendas-core.mjs')`);
js = js.replace(/await import\('\.\/projetos\.mjs'\)/g, `await import('${BASE}projetos.mjs')`);

new Function(js)();
document.dispatch('DOMContentLoaded');
await new Promise((r) => setTimeout(r, 400));

console.log('\n[7] Guardar e reabrir no app verdadeiro');
{
  // Importa 2 imagens e escreve texto.
  reg.get('input-files').onchange({ target: { files: [{ name: 'a.jpg', type: 'image/jpeg', size: 900 }, { name: 'b.jpg', type: 'image/jpeg', size: 900 }], value: '' } });
  await new Promise((r) => setTimeout(r, 400));
  check(reg.get('scenes').children.length === 2, '2 cenas criadas', String(reg.get('scenes').children.length));

  const ta = reg.get('scenes').children[0].children[1].children.find((c) => c.tagName === 'TEXTAREA');
  ta.value = 'A borboleta pousou na flor.';
  ta.dispatchEvent({ type: 'input' });
  reg.get('projeto-nome').value = 'A Borboleta';
  await new Promise((r) => setTimeout(r, 60));

  // Guarda.
  reg.get('btn-projeto-guardar').click();
  await new Promise((r) => setTimeout(r, 900));
  const est = reg.get('projeto-estado').textContent;
  check(/guardado/i.test(est), `o estado confirma o guardar: "${est}"`, est);
  check(/A Borboleta/.test(est), 'e diz o nome do projeto', est);

  // A lista tem de o mostrar.
  reg.get('btn-projetos-ver').click();
  await new Promise((r) => setTimeout(r, 400));
  check(reg.get('projetos-ul').children.length === 1, `a lista mostra 1 projeto (${reg.get('projetos-ul').children.length})`, String(reg.get('projetos-ul').children.length));
  const linha = reg.get('projetos-ul').children[0];
  check(/A Borboleta/.test(linha.children[1].children[0].textContent), `com o nome certo ("${linha.children[1].children[0].textContent}")`, linha.children[1].children[0].textContent);
  check(/2 imagem/.test(linha.children[1].children[1].textContent), `e o resumo: "${linha.children[1].children[1].textContent}"`, linha.children[1].children[1].textContent);
  check(/1 com texto/.test(linha.children[1].children[1].textContent), 'conta as cenas com texto', linha.children[1].children[1].textContent);

  // Limpa tudo e confirma que ficou vazio.
  reg.get('btn-clear').click();
  await new Promise((r) => setTimeout(r, 300));
  check(reg.get('scenes').children.length === 0, 'depois de limpar, não há cenas', String(reg.get('scenes').children.length));

  // Reabre o projeto: as imagens e o texto têm de voltar.
  const abrir = reg.get('projetos-ul').children[0].children[2].children[0];
  abrir.click();
  await new Promise((r) => setTimeout(r, 900));
  check(reg.get('scenes').children.length === 2, `o projeto reabriu com 2 cenas (${reg.get('scenes').children.length})`, String(reg.get('scenes').children.length));
  const ta2 = reg.get('scenes').children[0].children[1].children.find((c) => c.tagName === 'TEXTAREA');
  check(ta2.value === 'A borboleta pousou na flor.', `e o texto voltou ("${ta2.value}")`, ta2.value);
  check(reg.get('projeto-nome').value === 'A Borboleta', `o nome do projeto voltou ("${reg.get('projeto-nome').value}")`, reg.get('projeto-nome').value);
  const est2 = reg.get('projeto-estado').textContent;
  check(/aberto/i.test(est2), `o estado confirma a abertura: "${est2}"`, est2);
}

console.log('\n[8] Guardar sem imagens avisa em vez de guardar vazio');
{
  // Depois de "Limpar", o próximo "Guardar" tem de criar um projeto NOVO (não
  // escrever por cima do que estava aberto) e, sem imagens, tem de avisar.
  const antes = (await mod.listarProjetos()).length;
  // Limpa primeiro, para ficar mesmo sem imagens (é o caso que se quer testar).
  reg.get('btn-clear').click();
  await new Promise((r) => setTimeout(r, 250));
  reg.get('btn-projeto-guardar').click();
  await new Promise((r) => setTimeout(r, 300));
  const t = reg.get('toast').textContent;
  check(/Importe as imagens/i.test(t), `avisa que faltam imagens: "${t}"`, t);
  check((await mod.listarProjetos()).length === antes, 'não guardou nada', String((await mod.listarProjetos()).length));

  // Importa outra vez e guarda com outro nome: tem de criar um 2.º projeto.
  // A ORDEM importa: primeiro "Limpar" (que fecha o projeto aberto e limpa as
  // cenas), depois importar e guardar. Ao contrário, o "Guardar" escrevia por
  // cima do projeto que estava aberto.
  reg.get('input-files').onchange({ target: { files: [{ name: 'c.jpg', type: 'image/jpeg', size: 900 }], value: '' } });
  await new Promise((r) => setTimeout(r, 400));
  reg.get('btn-clear').click();
  await new Promise((r) => setTimeout(r, 300));
  check(reg.get('scenes').children.length === 0, 'limpou antes de guardar o novo', String(reg.get('scenes').children.length));

  reg.get('input-files').onchange({ target: { files: [{ name: 'd.jpg', type: 'image/jpeg', size: 900 }], value: '' } });
  await new Promise((r) => setTimeout(r, 400));
  reg.get('projeto-nome').value = 'Outro trabalho';
  reg.get('btn-projeto-guardar').click();
  await new Promise((r) => setTimeout(r, 700));
  const lista = await mod.listarProjetos();
  check(lista.length === antes + 1, `ficaram 2 projetos, não 1 por cima do outro (${lista.length})`, `${lista.length}`);
  check(lista.some((p) => p.nome === 'Outro trabalho'), 'o novo projeto está na lista', lista.map((p) => p.nome).join(', '));
  check(lista.some((p) => p.nome === 'A Borboleta'), 'e o anterior continua lá, intacto', lista.map((p) => p.nome).join(', '));
}

console.log(falhas.length ? `\n=== ${falhas.length} FALHA(S) ===` : '\n=== PROJETOS OK ===');
process.exit(falhas.length ? 1 : 0);
