// Testa a aba de vídeo: controlos, deteção de suporte e o caminho de erro.
import { readFileSync } from 'node:fs';

const BASE = 'E:\\youtube rebeca2\\rebeca-hub-3.0-base44\\public\\';
const html = readFileSync(BASE + 'index.html', 'utf8');
const falhas = [];
const ok = (m) => console.log('  ok:', m);
const fail = (m) => { console.error('  FALHOU:', m); falhas.push(m); };
const check = (c, bom, mau) => (c ? ok(bom) : fail(mau));

class El {
  constructor(tag = 'div') {
    this.tagName = String(tag).toUpperCase();
    this.children = []; this.listeners = {}; this.style = {}; this.dataset = {}; this.attrs = {};
    this._text = ''; this._html = ''; this.value = ''; this.checked = false;
    this.hidden = false; this.disabled = false; this.className = ''; this.title = '';
    this.type = ''; this.src = ''; this.alt = ''; this.href = ''; this.download = ''; this.placeholder = '';
    this.width = 0; this.height = 0;
    this.classList = {
      _s: new Set(),
      add: (...c) => c.forEach((x) => this.classList._s.add(x)),
      remove: (...c) => c.forEach((x) => this.classList._s.delete(x)),
      toggle: (c, f) => (f ? this.classList._s.add(c) : this.classList._s.delete(c)),
      contains: (c) => this.classList._s.has(c),
    };
  }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v); }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); if (v === '') this.children = []; }
  append(...n) { n.forEach((x) => this.children.push(x)); }
  appendChild(n) { this.children.push(n); return n; }
  remove() {}
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  removeEventListener() {}
  dispatchEvent(ev) { (this.listeners[ev.type] || []).forEach((f) => f(ev)); }
  click() {
    const ev = { type: 'click', preventDefault() {}, stopPropagation() {} };
    if (typeof this.onclick === 'function') this.onclick(ev);
    this.dispatchEvent(ev);
  }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  showModal() { this.open = true; }
  close() { this.open = false; }
}

// Extrai os data-* de um bloco, linha a linha (o HTML tem os botões em linhas próprias).
function bloco(html, id) {
  const linhas = html.split('\n');
  const i = linhas.findIndex((l) => l.includes(`id="${id}"`));
  if (i < 0) return '';
  const out = [linhas[i]];
  for (let j = i + 1; j < linhas.length; j++) {
    out.push(linhas[j]);
    if (linhas[j].includes('</div>')) break;
  }
  return out.join('\n');
}

function montar(suportaVideo) {
  const reg = new Map();
  for (const m of html.matchAll(/id="([A-Za-z0-9_-]+)"/g)) {
    const tag = html.slice(m.index, m.index + 160);
    const el = new El(/<canvas/.test(html.slice(Math.max(0, m.index - 30), m.index)) ? 'canvas' : 'div');
    if (/\shidden/.test(tag.split('>')[0])) el.hidden = true;
    if (/\sdisabled/.test(tag.split('>')[0])) el.disabled = true;
    reg.set(m[1], el);
  }
  for (const id of ['abas-esq', 'abas-dir']) {
    const b = bloco(html, id);
    for (const m of b.matchAll(/data-tab="([^"]+)"/g)) {
      const btn = new El('button'); btn.className = 'aba' + (/class="aba on"/.test(html) && b.indexOf('aba on') < m.index ? ' on' : '');
      btn.dataset.tab = m[1]; reg.get(id).append(btn);
    }
  }
  for (const [idG, atr] of [['motores', 'motor'], ['modos', 'modo'], ['tons-eleven', 'tom']]) {
    const b = bloco(html, idG);
    for (const m of b.matchAll(new RegExp(`data-${atr}="([^"]+)"`, 'g'))) {
      const btn = new El('button'); btn.className = 'chip'; btn.dataset[atr] = m[1]; reg.get(idG).append(btn);
    }
  }
  const cv = reg.get('vid-preview');
  cv.getContext = () => ({ drawImage() {}, save() {}, restore() {}, clearRect() {} });
  if (suportaVideo) cv.captureStream = () => ({ getVideoTracks: () => [{}], getAudioTracks: () => [] });
  return reg;
}

function ambiente(reg, suportaVideo) {
  const store = {};
  globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  globalThis.document = {
    getElementById: (id) => reg.get(id) || null,
    createElement: (t) => {
      const el = new El(t);
      el.getContext = () => ({ drawImage() {}, save() {}, restore() {}, clearRect() {} });
      if (suportaVideo) el.captureStream = () => ({ getVideoTracks: () => [{}], getAudioTracks: () => [] });
      return el;
    },
    addEventListener(t, fn) { (this._l = this._l || {}); (this._l[t] = this._l[t] || []).push(fn); },
    dispatch(t, ev = {}) { ((this._l || {})[t] || []).forEach((f) => f({ preventDefault() {}, ...ev })); },
    documentElement: new El('html'),
  };
  const MR = class {
    static isTypeSupported(t) { return suportaVideo && /webm/.test(t); }
  };
  globalThis.window = suportaVideo ? { MediaRecorder: MR, speechSynthesis: { speaking: false, getVoices: () => [], speak() {}, cancel() {} } } : { speechSynthesis: { speaking: false, getVoices: () => [], speak() {}, cancel() {} } };
  globalThis.speechSynthesis = globalThis.window.speechSynthesis;
  globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  globalThis.Audio = class {
    constructor() { this.duration = 65; setTimeout(() => this.onloadedmetadata?.(), 0); }
    play() { setTimeout(() => this.onended?.(), 5000); return Promise.resolve(); }
    pause() {}
    removeAttribute() {}
  };
  globalThis.AudioContext = class { constructor() { this.state = 'running'; } createAnalyser() { return { fftSize: 1024, getByteTimeDomainData(a) { a.fill(128); } }; } createMediaStreamSource() { return { connect() {} }; } createMediaStreamDestination() { return { stream: { getAudioTracks: () => [{}] } }; } createGain() { return { gain: { value: 1 }, connect() {} }; } createBufferSource() { return { connect() {}, start() {} }; } decodeAudioData() { return Promise.resolve({ duration: 4 }); } resume() { return Promise.resolve(); } close() { return Promise.resolve(); } };
  globalThis.MediaStream = class { constructor(t) { this.tracks = t; } getTracks() { return this.tracks; } getVideoTracks() { return this.tracks; } getAudioTracks() { return []; } };
  globalThis.Image = class { constructor() { setTimeout(() => { this.naturalWidth = 1280; this.naturalHeight = 720; this.onload?.(); }, 5); } set src(v) { this._src = v; } get src() { return this._src; } };
  globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 16);
  if (!globalThis.crypto.randomUUID) globalThis.crypto.randomUUID = () => 'id-' + Math.random().toString(16).slice(2);
  globalThis.URL.createObjectURL = () => 'blob:fake';
  globalThis.URL.revokeObjectURL = () => {};
  globalThis.FormData = class { constructor() { this.campos = {}; } append(k, v, n) { (this.campos[k] = this.campos[k] || []).push(n ?? v); } };
  globalThis.Blob = class {};
  globalThis.FileReader = class { readAsDataURL() { setTimeout(() => { this.result = 'data:application/octet-stream;base64,AAAA'; this.onload?.(); }, 3); } };
  globalThis.fetch = async (u) => {
    const s = String(u);
    if (s.includes('/api/health')) return { ok: true, json: async () => ({ ok: true, key: { hasKey: true } }) };
    if (s.includes('/api/voices')) return { ok: true, json: async () => ({ ok: true, voices: [{ name: 'Microsoft Maria Desktop', lang: 'pt-BR' }] }) };
    if (s.startsWith('blob:')) return { ok: true, blob: async () => new Blob() };
    return { ok: true, json: async () => ({ ok: true }) };
  };
  globalThis.__base44Falso = { functions: { invoke: async () => ({ ok: true }) } };
  return store;
}

const VIDEO_URL = 'file:///E:/youtube%20rebeca2/rebeca-hub-3.0-base44/public/video.mjs';
const src = readFileSync(BASE + 'app.js', 'utf8')
  .replace(/await import\('@\/base44Client\.js'\)/g, '({ base44: globalThis.__base44Falso })')
  .replace(/await import\('\.\/video\.mjs'\)/g, `await import('${VIDEO_URL}')`);
const erros = [];
process.on('uncaughtException', (e) => erros.push('uncaught: ' + e.message));
process.on('unhandledRejection', (e) => erros.push('rejeicao: ' + (e && e.message ? e.message : e)));

async function arrancar(suportaVideo) {
  const reg = montar(suportaVideo);
  ambiente(reg, suportaVideo);
  new Function(src)();
  document.dispatch('DOMContentLoaded');
  await new Promise((r) => setTimeout(r, 300));
  return reg;
}

console.log('\n[1] Browser COM suporte: controlos prontos');
{
  const reg = await arrancar(true);
  const abas = reg.get('abas-esq');
  check(abas.children.length === 3, `3 abas à esquerda (${abas.children.map((b) => b.textContent).join(' | ')})`, `${abas.children.length}: ${abas.children.map((b) => b.textContent).join(', ')}`);
  check(reg.get('vid-formato').children.length === 5, `5 formatos no seletor (${reg.get('vid-formato').children.map((o) => o.textContent).join(', ')})`, `${reg.get('vid-formato').children.length}`);
  const ct = reg.get('vid-transicoes');
  check(ct.children.length === 5, `5 transições (${ct.children.map((b) => b.textContent).join(', ')})`, `${ct.children.length}`);
  check(reg.get('vid-duracoes').children.length === 4, `4 durações (${reg.get('vid-duracoes').children.map((b) => b.textContent).join(', ')})`, `${reg.get('vid-duracoes').children.length}`);
  check(ct.children.filter((b) => b.classList.contains('on')).length === 1, 'exatamente uma transição marcada', `${ct.children.filter((b) => b.classList.contains('on')).length} marcadas`);
  const tagBtn = html.slice(html.indexOf('id="btn-video"'), html.indexOf('id="btn-video"') + 120);
  check(!/\bdisabled\b/.test(tagBtn.split('>')[0]), 'botão de gerar ativo (sem disabled no HTML)', `HTML: ${tagBtn.split('>')[0]}`);
  check(reg.get('vid-preview').hidden === true, 'canvas escondido no início', 'devia começar escondido');
}

console.log('\n[2] Escolher transição e formato fica guardado');
{
  const reg = await arrancar(true);
  const ct = reg.get('vid-transicoes');
  ct.children[2].click();
  check(ct.children[2].classList.contains('on'), `"${ct.children[2].textContent}" marcada`, 'não marcou');
  check(ct.children.filter((b) => b.classList.contains('on')).length === 1, 'só uma marcada', 'mais de uma');
  const cd = reg.get('vid-duracoes');
  cd.children[3].click();
  check(cd.children[3].classList.contains('on'), `duração "${cd.children[3].textContent}" marcada`, 'não marcou');
  const sel = reg.get('vid-formato');
  sel.value = '1080x1920';
  sel.onchange();
  const g = JSON.parse(globalThis.localStorage.getItem('rh3nuvem') || '{}');
  check(g.videoFormato === '1080x1920' && g.videoTransicao === ct.children[2].dataset.id && g.videoDuracao === Number(cd.children[3].dataset.id),
    `guardado: formato=${g.videoFormato} transicao=${g.videoTransicao} duracao=${g.videoDuracao}`,
    `guardado errado: ${JSON.stringify({ f: g.videoFormato, t: g.videoTransicao, d: g.videoDuracao })}`);
}

console.log('\n[3] Sem suporte de gravação: avisa e desativa');
{
  const reg = await arrancar(false);
  check(reg.get('btn-video').disabled === true, 'botão desativado', 'devia estar desativado');
  const est = reg.get('vid-estado').textContent;
  check(/não consegue gravar vídeo/i.test(est), `aviso: "${est.slice(0, 60)}…"`, `estado: ${est}`);
}

console.log('\n[4] Sem narração: diz o que fazer antes de tentar gravar');
{
  const reg = await arrancar(true);
  reg.get('btn-video').click();
  await new Promise((r) => setTimeout(r, 200));
  const est = reg.get('vid-estado').textContent;
  check(/Gere a narração primeiro/i.test(est), `pede a narração: "${est.slice(0, 60)}…"`, `estado: ${est}`);
}

console.log('\n[5] Com texto mas sem áudio: explica onde o gerar');
{
  const reg = await arrancar(true);
  const input = reg.get('input-files');
  input.onchange({ target: { files: [{ name: 'c1.jpg', type: 'image/jpeg', size: 900 }], value: '' } });
  await new Promise((r) => setTimeout(r, 150));
  const cena = reg.get('scenes').children[0];
  check(!!cena, 'cena criada após importar imagem', 'não criou cena');
  const ta = cena.children[1].children.find((c) => c.tagName === 'TEXTAREA');
  check(!!ta, 'campo de texto da cena existe', 'não achou a textarea');
  ta.value = 'Era uma vez uma menina.';
  ta.dispatchEvent({ type: 'input' });
  reg.get('btn-video').click();
  await new Promise((r) => setTimeout(r, 250));
  const est = reg.get('vid-estado').textContent;
  check(/Ainda não há áudio/i.test(est), 'explica que falta o áudio', `estado: ${est}`);
  check(/Gerar o áudio de todas as cenas/i.test(est), 'diz onde gerar o áudio', `estado: ${est}`);
}

console.log('\n[6] Botão Parar existe e começa escondido');
{
  const reg = await arrancar(true);
  check(reg.get('btn-video-parar').hidden === true, 'Parar escondido no início', 'devia estar escondido');
}

console.log('\n[7] Trilha sonora: escolher, ouvir, tirar');
{
  const reg = await arrancar(true);
  const est = reg.get('trilha-estado');
  check(/Nenhuma música escolhida/i.test(est.textContent), `começa sem trilha: "${est.textContent.slice(0, 44)}…"`, est.textContent);
  check(reg.get('btn-trilha-ouvir').hidden === true, 'sem música, o "Ouvir" está escondido', 'está visível');
  check(reg.get('btn-trilha-tirar').hidden === true, 'sem música, o "Tirar" está escondido', 'está visível');
  check(reg.get('trilha-ligada').disabled === true, 'a caixa "usar a música" está desativada sem música', 'está ativa');
  check(reg.get('trilha-ligada').checked === false, 'a caixa aparece desmarcada sem música', 'aparece marcada');

  // Escolher uma música: o estado tem de mudar sozinho.
  reg.get('input-trilha').files = [{ name: 'cancao.mp3', size: 3_500_000, type: 'audio/mpeg' }];
  reg.get('input-trilha').onchange();
  await new Promise((r) => setTimeout(r, 120));

  check(/cancao\.mp3/.test(est.textContent), `mostra o nome do ficheiro: "${est.textContent}"`, est.textContent);
  check(/1:05/.test(est.textContent), 'mostra a duração lida do ficheiro (65s → 1:05)', est.textContent);
  check(reg.get('btn-trilha-ouvir').hidden === false, 'o "▶️ Ouvir" aparece', 'continua escondido');
  check(reg.get('btn-trilha-tirar').hidden === false, 'o "🗑 Tirar" aparece', 'continua escondido');
  check(reg.get('trilha-ligada').disabled === false, 'a caixa fica utilizável', 'continua desativada');
  check(reg.get('trilha-ligada').checked === true, 'a música entra ligada por omissão', 'entrou desligada');

  // Aviso de que a música entrou no vídeo.
  const g = JSON.parse(globalThis.localStorage.getItem('rh3nuvem') || '{}');
  check(g.musicaLigada !== false, 'a escolha fica guardada na configuração', JSON.stringify(g.musicaLigada));

  // Ouvir → o botão passa a "Parar"; parar volta a "Ouvir".
  reg.get('btn-trilha-ouvir').click();
  await new Promise((r) => setTimeout(r, 30));
  const ouvir = reg.get('btn-trilha-ouvir');
  check(/Parar/.test(ouvir.textContent), `a tocar: botão diz "${ouvir.textContent}"`, ouvir.textContent);
  ouvir.click();
  await new Promise((r) => setTimeout(r, 20));
  check(/Ouvir/.test(ouvir.textContent), `parado: botão diz "${ouvir.textContent}"`, ouvir.textContent);

  // Tirar → volta ao estado inicial.
  reg.get('btn-trilha-tirar').click();
  await new Promise((r) => setTimeout(r, 20));
  check(/Nenhuma música escolhida/i.test(est.textContent), 'depois de tirar, volta a "sem trilha"', est.textContent);
  check(reg.get('btn-trilha-ouvir').hidden === true, 'e o "Ouvir" desaparece outra vez', 'ficou visível');
}

console.log('\n[8] Sem erros de JavaScript');
if (erros.length) erros.slice(0, 5).forEach((e) => fail(e));
else ok('nenhum erro não tratado');

console.log(falhas.length ? `\n=== ${falhas.length} FALHA(S) ===` : '\n=== ABA DE VÍDEO OK ===');
process.exit(falhas.length ? 1 : 0);
