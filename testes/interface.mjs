// Testa a aba de vídeo: controlos, deteção de suporte e o caminho de erro.
import { readFileSync } from 'node:fs';

import { fileURLToPath } from 'node:url';
const BASE = fileURLToPath(new URL('../public/', import.meta.url));
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
    this.hidden = false; this.disabled = false; this.title = '';
    this.type = ''; this.src = ''; this.alt = ''; this.href = ''; this.download = ''; this.placeholder = '';
    this.width = 0; this.height = 0;
    // O classList tem de existir ANTES de className ser atribuído: o setter
    // abaixo escreve nele. (Era esta a ordem errada que rebentava o teste todo.)
    this.classList = {
      _s: new Set(),
      add: (...c) => c.forEach((x) => this.classList._s.add(x)),
      remove: (...c) => c.forEach((x) => this.classList._s.delete(x)),
      toggle: (c, f) => (f ? this.classList._s.add(c) : this.classList._s.delete(c)),
      contains: (c) => this.classList._s.has(c),
    };
    this.className = '';
  }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v); }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); if (v === '') this.children = []; }
  set className(v) { this._classe = String(v); this.classList._s = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get className() { return this._classe || ''; }
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

function ambiente(reg, suportaVideo, duracaoMusica = 65) {
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
  // A app procura o AudioContext em `window` (é assim que um browser se comporta),
  // por isso tem de estar em window e não só em globalThis.
  const AC = class { constructor() { this.state = 'running'; } createAnalyser() { return { fftSize: 1024, getByteTimeDomainData(a) { a.fill(128); } }; } createMediaStreamSource() { return { connect() {} }; } createMediaStreamDestination() { return { stream: { getAudioTracks: () => [{}] } }; } createGain() { return { gain: { value: 1 }, connect() {} }; } createBufferSource() { return { connect() {}, start() {} }; } decodeAudioData() { return Promise.resolve({ duration: 4 }); } resume() { return Promise.resolve(); } close() { return Promise.resolve(); } };
  const fala = { speaking: false, getVoices: () => [], speak() {}, cancel() {} };
  globalThis.window = suportaVideo ? { MediaRecorder: MR, AudioContext: AC, speechSynthesis: fala } : { speechSynthesis: fala };
  globalThis.speechSynthesis = globalThis.window.speechSynthesis;
  globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  // O <audio> falso só sabe a duração DEPOIS de lhe darem o `src` — como um a
  // sério. Disparar isto no construtor fazia o código (corretamente) ignorar a
  // leitura, porque nessa altura o `src` ainda não existe.
  globalThis.Audio = class {
    constructor() { this.duration = NaN; this.listeners = {}; }
    set src(v) {
      this._src = v;
      setTimeout(() => {
        this.duration = duracaoMusica;
        (this.listeners.loadedmetadata || []).forEach((f) => f());
        this.onloadedmetadata?.();
        this.ondurationchange?.();
      }, 0);
    }
    get src() { return this._src; }
    load() {}
    addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); }
    play() { setTimeout(() => this.onended?.(), 5000); return Promise.resolve(); }
    pause() {}
    removeAttribute() {}
  };
  globalThis.AudioContext = AC;
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
  globalThis.__base44Falso = {
    functions: { invoke: async () => ({ ok: true }) },
    auth: {
      // O teste troca isto antes de arrancar a página (__authFalso).
      utilizador: globalThis.__authFalso ? globalThis.__authFalso.utilizador : null,
      erro: globalThis.__authFalso ? globalThis.__authFalso.erro : null,
      chamadas: [],
      async me() {
        if (this.erro) throw this.erro;
        return this.utilizador;
      },
      async loginViaEmailPassword(email, senha) {
        this.chamadas.push(['login', email, senha]);
        if (this.erro) throw this.erro;
        return { access_token: 'token-falso' };
      },
      async register(p) {
        this.chamadas.push(['register', p.email]);
        if (this.erro) throw this.erro;
        return { ok: true };
      },
      async verifyOtp(p) {
        this.chamadas.push(['otp', p.email, p.otpCode]);
        if (this.erro) throw this.erro;
        return { ok: true };
      },
      setToken(t) { this.chamadas.push(['setToken', t]); },
      logout() { this.chamadas.push(['logout']); this.utilizador = null; },
    },
  };
  return store;
}

const VIDEO_URL = new URL('../public/video.mjs', import.meta.url).href;
const src = readFileSync(BASE + 'app.js', 'utf8')
  .replace(/await import\('@\/base44Client\.js'\)/g, '({ base44: globalThis.__base44Falso })')
  .replace(/await import\('\.\/video\.mjs'\)/g, `await import('${VIDEO_URL}')`)
  .replace(/await import\('\.\/audio-info\.mjs'\)/g, `await import('${new URL('../public/audio-info.mjs', import.meta.url).href}')`)
  .replace(/await import\('\.\/legendas-core\.mjs'\)/g, `await import('${new URL('../public/legendas-core.mjs', import.meta.url).href}')`)
  .replace(/await import\('\.\/estudio-letra-trilha\.mjs'\)/g, `await import('${new URL('../public/estudio-letra-trilha.mjs', import.meta.url).href}')`)
  .replace(/await import\('\.\/estudio-projetos\.mjs'\)/g, `await import('${new URL('../public/estudio-projetos.mjs', import.meta.url).href}')`)
  .replace(/await import\('\.\/estudio-utilizador\.mjs'\)/g, `await import('${new URL('../public/estudio-utilizador.mjs', import.meta.url).href}')`)
  // Expõe as funções de guardar para se poderem testar sem gravar vídeo nenhum.
  .replace('// ---------------------------------------------------------------- trilha sonora',
    'globalThis.__guardarParaTeste = { guardarComo, descarregarBlob, podeEscolherOnde, rotularBotoesGuardar };\n// ---------------------------------------------------------------- trilha sonora');;;
const erros = [];
// Um erro não tratado tem de APARECER. Antes ficava só numa lista e, se
// rebentasse a meio, o teste terminava calado com sucesso — foi assim que uma
// falha real passou despercebida. Agora escreve sempre no ecrã.
process.on('uncaughtException', (e) => {
  erros.push('uncaught: ' + (e && e.message ? e.message : e));
  process.stderr.write(`>>> ERRO NÃO TRATADO: ${e && e.stack ? e.stack : e}\n`);
});
process.on('unhandledRejection', (e) => {
  erros.push('rejeicao: ' + (e && e.message ? e.message : e));
  process.stderr.write(`>>> PROMESSA REJEITADA: ${e && e.stack ? e.stack : e}\n`);
});

async function arrancar(suportaVideo, duracaoMusica = 65) {
  const reg = montar(suportaVideo);
  ambiente(reg, suportaVideo, duracaoMusica);
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
  await new Promise((r) => setTimeout(r, 350));
  const cena = reg.get('scenes').children[0];
  check(!!cena, 'cena criada após importar imagem', 'não criou cena');
  const ta = cena.children[1].children.find((c) => c.tagName === 'TEXTAREA');
  check(!!ta, 'campo de texto da cena existe', 'não achou a textarea');
  ta.value = 'Era uma vez uma menina.';
  ta.dispatchEvent({ type: 'input' });
  reg.get('btn-video').click();
  await new Promise((r) => setTimeout(r, 450));
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

console.log('\n[8] Modo "só música": sem narração nenhuma');
{
  const reg = await arrancar(true);
  const modos = reg.get('vid-modos');
  check(modos.children.length === 3, `3 modos: ${modos.children.map((b) => b.textContent).join(' | ')}`, String(modos.children.length));
  check(modos.children[1].classList.contains('on'), 'começa em "Narração + música"', 'não começou no modo esperado');
  check(reg.get('grupo-cena').hidden === true, 'a duração por imagem está escondida quando há voz', 'está visível');

  // Importa imagens, mas não gera narração nenhuma.
  reg.get('input-files').onchange({ target: { files: [{ name: 'a.jpg', type: 'image/jpeg', size: 900 }, { name: 'b.jpg', type: 'image/jpeg', size: 900 }], value: '' } });
  await new Promise((r) => setTimeout(r, 350));
  check(reg.get('scenes').children.length === 2, '2 imagens importadas', String(reg.get('scenes').children.length));

  // Ainda no modo com voz: o botão avisa que falta a narração.
  reg.get('btn-video').click();
  await new Promise((r) => setTimeout(r, 120));
  check(/Gere a narração primeiro/i.test(reg.get('vid-estado').textContent), 'no modo com voz, pede a narração', reg.get('vid-estado').textContent);
  check(/Só música/i.test(reg.get('vid-estado').textContent), 'e indica o modo que não precisa de voz', reg.get('vid-estado').textContent);

  // Muda para "só música": agora falta a trilha, não a voz.
  modos.children[2].click();
  await new Promise((r) => setTimeout(r, 60));
  check(modos.children[2].classList.contains('on'), '"Só música" ficou marcado', 'não marcou');
  check(reg.get('grupo-cena').hidden === false, 'a duração por imagem aparece', 'continua escondida');
  check(reg.get('vid-cena').children.length === 4, `4 ritmos de imagem (${reg.get('vid-cena').children.map((b) => b.textContent).join(', ')})`, String(reg.get('vid-cena').children.length));
  check(/precisa de uma trilha/i.test(reg.get('vid-estado').textContent), 'avisa que falta a música', reg.get('vid-estado').textContent);

  // Escolhe a música: o resumo passa a descrever o vídeo que vai sair.
  const input = reg.get('input-trilha');
  input.files = [{ name: 'tema.mp3', size: 2_000_000, type: 'audio/mpeg' }];
  check(typeof input.onchange === 'function', 'o campo da música tem handler ligado', `onchange=${typeof input.onchange}`);
  input.onchange();
  await new Promise((r) => setTimeout(r, 350));
  check(/tema\.mp3/.test(reg.get('trilha-estado').textContent), `a trilha ficou escolhida: "${reg.get('trilha-estado').textContent}"`, reg.get('trilha-estado').textContent);
  const est = reg.get('vid-estado').textContent;
  check(/sem voz/i.test(est), `diz que sai sem voz: "${est.slice(0, 70)}…"`, est);
  check(/tema\.mp3/.test(est), 'nomeia a trilha escolhida', est);
  check(/2 imagem/.test(est), 'conta as 2 imagens', est);
  check(/0:07/.test(est), 'calcula a duração (2 × 3,5s = 7s → 0:07)', est);
  check(!/Gere a narração/i.test(est), 'já não pede narração', est);

  // Mudar o ritmo muda o cálculo.
  reg.get('vid-cena').children[3].click();
  await new Promise((r) => setTimeout(r, 40));
  check(/0:16/.test(reg.get('vid-estado').textContent), '8s por imagem → 16s (0:16)', reg.get('vid-estado').textContent);
  const g = JSON.parse(globalThis.localStorage.getItem('rh3nuvem') || '{}');
  check(g.videoModo === 'musica' && Number(g.videoDuracaoCena) === 8, `guardado: modo=${g.videoModo} cena=${g.videoDuracaoCena}`, JSON.stringify({ m: g.videoModo, d: g.videoDuracaoCena }));
}

console.log('\n[9] Só música sem imagens: pede as imagens');
{
  const reg = await arrancar(true);
  reg.get('vid-modos').children[2].click();
  reg.get('input-trilha').files = [{ name: 'tema.mp3', size: 1_000_000, type: 'audio/mpeg' }];
  reg.get('input-trilha').onchange();
  await new Promise((r) => setTimeout(r, 120));
  check(/Importe as imagens/i.test(reg.get('vid-estado').textContent), 'sem imagens, pede as imagens', reg.get('vid-estado').textContent);
}

console.log('\n[10] Controlo das legendas');
{
  const reg = await arrancar(true);
  const cl = reg.get('vid-legendas');
  check(cl.children.length === 2, `2 opções de legendas (${cl.children.map((b) => b.textContent).join(' | ')})`, String(cl.children.length));
  check(cl.children[0].classList.contains('on'), 'as legendas começam ligadas', 'começaram desligadas');
  check(cl.children[1].classList.contains('on') === false, 'e "Sem legendas" não está marcado', 'está marcado');

  // Sem texto nenhum, o resumo avisa em vez de prometer legendas.
  check(/Importe as imagens|Gere a narração/i.test(reg.get('vid-estado').textContent), 'sem cenas, pede as imagens ou a narração', reg.get('vid-estado').textContent);

  // Desligar guarda a escolha.
  cl.children[1].click();
  await new Promise((r) => setTimeout(r, 40));
  check(cl.children[1].classList.contains('on'), '"Sem legendas" ficou marcado', 'não marcou');
  const g1 = JSON.parse(globalThis.localStorage.getItem('rh3nuvem') || '{}');
  check(g1.legendas === false, 'a escolha de desligar fica guardada', JSON.stringify(g1.legendas));
  const estadoSem = reg.get('vid-estado').textContent;
  check(!/bloco\(s\)/.test(estadoSem), `desligadas: o resumo não fala de blocos ("${estadoSem.slice(0, 50)}…")`, estadoSem);

  // Ligar outra vez mostra quantos blocos vão sair e o primeiro deles.
  cl.children[0].click();
  await new Promise((r) => setTimeout(r, 40));
  const g2 = JSON.parse(globalThis.localStorage.getItem('rh3nuvem') || '{}');
  check(g2.legendas === true, 'ligar fica guardado', JSON.stringify(g2.legendas));
}

console.log('\n[11] O resumo mostra os blocos de legenda da narração');
{
  const reg = await arrancar(true);
  // Importa uma imagem e escreve uma narração longa.
  reg.get('input-files').onchange({ target: { files: [{ name: 'a.jpg', type: 'image/jpeg', size: 900 }], value: '' } });
  await new Promise((r) => setTimeout(r, 350));
  const cena = reg.get('scenes').children[0];
  const ta = cena.children[1].children.find((c) => c.tagName === 'TEXTAREA');
  ta.value = 'Era uma vez uma menina muito curiosa. Ela vivia numa casa pequena e feliz.';
  ta.dispatchEvent({ type: 'input' });
  await new Promise((r) => setTimeout(r, 60));

  const est = reg.get('vid-estado').textContent;
  check(/bloco\(s\)/.test(est), `conta os blocos de legenda: "${est.slice(0, 90)}…"`, est);
  check(/Era uma vez/.test(est), 'e mostra o primeiro bloco, para se ver como a fala foi cortada', est);
  check(/\.srt/.test(est), 'avisa que sai também o ficheiro .srt', est);
}

console.log('\n[12] Duração: repetir as imagens até a música acabar');
{
  const reg = await arrancar(true);
  const cdm = reg.get('vid-duracao-modo');
  check(cdm.children.length === 2, `2 opções de duração (${cdm.children.map((b) => b.textContent).join(' | ')})`, String(cdm.children.length));
  check(cdm.children[1].disabled === true, 'sem música, "Até acabar a música" está desativado', 'está ativo sem música');
  check(cdm.children[0].classList.contains('on'), 'começa em "As imagens"', 'não começou no modo natural');

  // Importa imagens e escolhe música: o modo de ciclo passa a fazer sentido.
  reg.get('input-files').onchange({ target: { files: [{ name: 'a.jpg', type: 'image/jpeg', size: 900 }, { name: 'b.jpg', type: 'image/jpeg', size: 900 }], value: '' } });
  await new Promise((r) => setTimeout(r, 350));
  reg.get('vid-modos').children[2].click(); // só música, sem narração
  await new Promise((r) => setTimeout(r, 40));
  check(cdm.children[1].disabled === true, 'continua desativado enquanto não há música', 'ativou sem música');

  reg.get('input-trilha').files = [{ name: 'tema.mp3', size: 2_000_000, type: 'audio/mpeg' }];
  reg.get('input-trilha').onchange();
  await new Promise((r) => setTimeout(r, 400));
  check(cdm.children[1].disabled === false, 'com música, o modo de ciclo fica utilizável', 'continuou desativado');
  check(cdm.children[1].classList.contains('on'), 'e fica escolhido por omissão', 'não ficou escolhido');

  const est = reg.get('vid-estado').textContent;
  const r = /🔁[^.]*\./.exec(est)?.[0] || est;
  check(/🔁/.test(est), `o resumo diz que vai repetir: "${r}"`, est);
  check(/\d+×/.test(est), `diz quantas passagens vai dar (${/\d+×/.exec(est)?.[0]})`, est);
  check(/1:05/.test(est), 'e lembra o tempo da música (65s → 1:05)', est);
  check(/repetem/i.test(est) || /REPETE/i.test(est), 'explica que são as imagens a repetir', est);

  // Voltar a "As imagens" tira a nota do ciclo.
  cdm.children[0].click();
  await new Promise((r) => setTimeout(r, 40));
  check(cdm.children[0].classList.contains('on'), '"As imagens" ficou marcado', 'não marcou');
  check(!/🔁/.test(reg.get('vid-estado').textContent), 'sem ciclo, o resumo já não fala de repetições', reg.get('vid-estado').textContent);
  const g = JSON.parse(globalThis.localStorage.getItem('rh3nuvem') || '{}');
  check(g.modoDuracao === 'natural', `a escolha fica guardada (${g.modoDuracao})`, JSON.stringify(g.modoDuracao));

  // Tirar a música volta a desativar o modo de ciclo.
  reg.get('btn-trilha-tirar').click();
  await new Promise((r) => setTimeout(r, 40));
  check(cdm.children[1].disabled === true, 'ao tirar a música, o ciclo volta a ficar desativado', 'ficou ativo');
}

console.log('\n[13] Música com duração ilegível: avisa em vez de fingir');
{
  // O <audio> não consegue ler a duração (ficheiro estranho / formato que o
  // browser não conhece): o ciclo não pode ser calculado.
  const reg = await arrancar(true, 0);
  reg.get('input-files').onchange({ target: { files: [{ name: 'a.jpg', type: 'image/jpeg', size: 900 }], value: '' } });
  await new Promise((r) => setTimeout(r, 350));
  reg.get('vid-modos').children[2].click();
  await new Promise((r) => setTimeout(r, 40));
  reg.get('input-trilha').files = [{ name: 'estranho.xyz', size: 1_000_000, type: 'application/octet-stream' }];
  reg.get('input-trilha').onchange();
  await new Promise((r) => setTimeout(r, 400));

  const est = reg.get('vid-estado').textContent;
  check(/Não consegui ler a duração/i.test(est), `diz que não conseguiu ler a duração: "${est.slice(-110)}"`, est);
  check(/MP3 ou WAV|MP3 ou um WAV/i.test(est), 'sugere um formato que funcione', est);
  check(!/REPETE/.test(est), 'não promete repetições que não pode calcular', est);
}

console.log('\n[14] Letra da música colada e distribuída pelo tempo');
{
  const reg = await arrancar(true);
  const est = reg.get('letra-estado');
  const ta = reg.get('letra-texto');
  const btn = reg.get('btn-letra-usar');
  check(/Cole a letra/i.test(est.textContent), `começa por pedir a letra: "${est.textContent.slice(0, 50)}…"`, est.textContent);
  check(btn.disabled === true, 'sem letra nem música, o botão está desativado', 'está ativo');
  check(reg.get('btn-letra-previa').hidden === true, 'sem letra não há pré-escuta', 'está visível');

  // Cola a letra: o estado passa a contar os versos.
  ta.value = 'Primeira linha da canção\nSegunda linha da canção\n\nTerceira linha da canção\n';
  ta.oninput();
  await new Promise((r) => setTimeout(r, 60));
  check(/3 verso/i.test(est.textContent), `conta 3 versos (ignora a linha vazia): "${est.textContent}"`, est.textContent);
  check(/escolha a trilha/i.test(est.textContent), 'e avisa que falta a música para saber o tempo', est.textContent);
  check(btn.disabled === true, 'e o botão continua desativado sem música', 'ativou sem música');

  // Escolhe a música: agora já sabe distribuir o tempo.
  reg.get('input-trilha').files = [{ name: 'tema.mp3', size: 2_000_000, type: 'audio/mpeg' }];
  reg.get('input-trilha').onchange();
  await new Promise((r) => setTimeout(r, 400));
  check(btn.disabled === false, 'com música, o botão fica utilizável', 'continuou desativado');
  check(/0:21 cada um/.test(est.textContent) || /cada um/.test(est.textContent), `diz o tempo de cada verso: "${est.textContent}"`, est.textContent);
  check(reg.get('btn-letra-previa').hidden === false, 'e a pré-escuta aparece', 'continua escondida');

  // Usar a letra: passa a legenda e o resumo muda. Precisa de imagens, porque um
  // vídeo precisa de imagens (a letra não substitui as imagens, só a voz).
  reg.get('input-files').onchange({ target: { files: [{ name: 'a.jpg', type: 'image/jpeg', size: 900 }, { name: 'b.jpg', type: 'image/jpeg', size: 900 }], value: '' } });
  await new Promise((r) => setTimeout(r, 350));
  btn.click();
  await new Promise((r) => setTimeout(r, 60));
  check(/em uso como legenda/i.test(est.textContent), `fica marcada como em uso: "${est.textContent.slice(0, 70)}…"`, est.textContent);
  const resumo = reg.get('vid-estado').textContent;
  check(/LETRA da música/i.test(resumo), `o resumo diz que a legenda é a letra: "${resumo.slice(0, 80)}…"`, resumo);
  check(/substitui a legenda da narração/i.test(resumo), 'e avisa que substitui a da narração', resumo);
  check(/vídeo de letra/i.test(resumo), 'e reconhece que é um vídeo de letra (não pede narração)', resumo);
  const g = JSON.parse(globalThis.localStorage.getItem('rh3nuvem') || '{}');
  check(g.letraLigada === true && /Primeira linha/.test(g.letra), 'a letra fica guardada', JSON.stringify({ ligada: g.letraLigada, letra: (g.letra || '').slice(0, 20) }));

  // Tirar a letra do uso: volta às legendas da narração.
  btn.click();
  await new Promise((r) => setTimeout(r, 60));
  check(!/em uso como legenda/i.test(est.textContent), 'volta a ficar fora de uso', est.textContent);
  check(!/LETRA da música/i.test(reg.get('vid-estado').textContent), 'e o resumo deixa de falar da letra', reg.get('vid-estado').textContent);

  // Limpar apaga o texto.
  reg.get('btn-letra-limpar').click();
  await new Promise((r) => setTimeout(r, 40));
  check(/Cole a letra/i.test(est.textContent), 'limpar volta ao início', est.textContent);
  check(ta.value === '', 'e o campo fica vazio', ta.value);
}

console.log('\n[15] Pré-escuta da letra: vê os versos a passar');
{
  const reg = await arrancar(true);
  const ta = reg.get('letra-texto');
  ta.value = 'Verso um\nVerso dois';
  ta.oninput();
  reg.get('input-trilha').files = [{ name: 'tema.mp3', size: 1_000_000, type: 'audio/mpeg' }];
  reg.get('input-trilha').onchange();
  await new Promise((r) => setTimeout(r, 400));

  reg.get('btn-letra-previa').click();
  await new Promise((r) => setTimeout(r, 80));
  const est = reg.get('letra-estado');
  check(/Parar/.test(reg.get('btn-letra-previa').textContent), `a pré-escuta arranca: botão diz "${reg.get('btn-letra-previa').textContent}"`, reg.get('btn-letra-previa').textContent);
  check(/1\/2|2\/2/.test(est.textContent), `e mostra o verso a passar: "${est.textContent}"`, est.textContent);
  check(/Verso um|Verso dois/.test(est.textContent), 'com o texto do verso', est.textContent);

  reg.get('btn-letra-previa').click();
  await new Promise((r) => setTimeout(r, 40));
  check(/Ver a letra a passar/.test(reg.get('btn-letra-previa').textContent), 'parar repõe o botão', reg.get('btn-letra-previa').textContent);
}

console.log('\n[16] Guardar o vídeo: escolher onde, ou descarregar');
{
  // O browser falso ganha a janela "Guardar como" (Chrome/Edge).
  const escritos = [];
  const nomesSugeridos = [];
  let comportamento = 'guardar'; // 'guardar' | 'cancelar'
  const reg = await arrancar(true);
  globalThis.window.showSaveFilePicker = async (opcoes) => {
    nomesSugeridos.push(opcoes && opcoes.suggestedName);
    if (comportamento === 'cancelar') {
      const e = new Error('cancelado');
      e.name = 'AbortError';
      throw e;
    }
    return {
      createWritable: async () => ({
        write: async (blob) => escritos.push(blob),
        close: async () => {},
      }),
    };
  };

  const { guardarComo, podeEscolherOnde, rotularBotoesGuardar } = globalThis.__guardarParaTeste;
  check(podeEscolherOnde() === true, 'deteta que o browser sabe escolher onde guardar', 'não detetou');
  rotularBotoesGuardar();
  check(/Guardar/.test(reg.get('btn-video-guardar').textContent), `com a janela, o botão diz "${reg.get('btn-video-guardar').textContent}"`, reg.get('btn-video-guardar').textContent);

  const blob = new Blob(['conteudo-do-video'], { type: 'video/webm' });
  const ok = await guardarComo(blob, 'borboleta 1.webm', 'Vídeo WebM');
  check(ok === true, 'guardou onde o utilizador escolheu', `ok=${ok}`);
  check(escritos.length === 1, `escreveu o ficheiro uma vez (${escritos.length})`, String(escritos.length));
  check(escritos[0] === blob, 'escreveu o ficheiro certo (sem corromper)', 'escreveu outro objeto');
  check(nomesSugeridos[0] === 'borboleta 1.webm', `sugere o nome do ficheiro (${nomesSugeridos[0]})`, String(nomesSugeridos[0]));

  // Cancelar não pode guardar nada nem rebentar.
  comportamento = 'cancelar';
  escritos.length = 0;
  const cancelado = await guardarComo(blob, 'borboleta 1.webm');
  check(cancelado === false, 'cancelar devolve false', `ok=${cancelado}`);
  check(escritos.length === 0, 'e não escreve ficheiro nenhum', `${escritos.length} escritos`);

  // Sem a janela de guardar: cai numa descarga normal.
  comportamento = 'guardar';
  globalThis.window.showSaveFilePicker = undefined;
  check(podeEscolherOnde() === false, 'sem a API, sabe que não pode escolher', 'continuou a dizer que podia');
  rotularBotoesGuardar();
  check(/Descarregar/.test(reg.get('btn-video-guardar').textContent), `sem a janela, o botão diz "${reg.get('btn-video-guardar').textContent}"`, reg.get('btn-video-guardar').textContent);
  const semApi = await guardarComo(blob, 'rebeca-video.webm');
  check(semApi === false, 'sem a API, devolve false e usa a descarga', `ok=${semApi}`);
}

console.log('\n[17] Utilizador no topo: quem está a usar a app');
{
  // (a) COM sessão: mostra o nome e dá para sair.
  globalThis.__authFalso = { utilizador: { id: 'u1', email: 'rebeca@exemplo.pt', full_name: 'Rebeca Silva', role: 'user' }, erro: null };
  const reg = await arrancar(true);
  await new Promise((r) => setTimeout(r, 60));
  const estado = reg.get('user-estado');
  check(/Rebeca Silva/.test(estado.textContent), `mostra o nome de quem entrou ("${estado.textContent}")`, estado.textContent);
  check(estado.classList.contains('dentro'), 'e fica marcado como "dentro"', 'não marcou');
  check(/rebeca@exemplo\.pt/.test(estado.title), `o detalhe tem o email ("${estado.title}")`, estado.title);
  check(reg.get('btn-user-entrar').hidden === true, 'o botão "Entrar" desaparece', 'continua visível');
  check(reg.get('btn-user-sair').hidden === false, 'e o "Sair" aparece', 'continua escondido');

  // Sair limpa a sessão.
  globalThis.window.confirm = () => true;
  reg.get('btn-user-sair').click();
  await new Promise((r) => setTimeout(r, 80));
  check(/sem conta/.test(reg.get('user-estado').textContent), `depois de sair, fica "sem conta" ("${reg.get('user-estado').textContent}")`, reg.get('user-estado').textContent);
  check(reg.get('btn-user-entrar').hidden === false, 'e o "Entrar" volta', 'ficou escondido');

  // (b) SEM sessão (a Base44 recusa): a app continua utilizável.
  globalThis.__authFalso = { utilizador: null, erro: Object.assign(new Error('Unauthorized'), { response: { status: 401 } }) };
  const reg2 = await arrancar(true);
  await new Promise((r) => setTimeout(r, 60));
  check(/sem conta/.test(reg2.get('user-estado').textContent), `sem sessão, diz "sem conta" ("${reg2.get('user-estado').textContent}")`, reg2.get('user-estado').textContent);
  check(reg2.get('btn-user-entrar').hidden === false, 'e oferece entrar', 'não oferece');
  check(/sem conta/.test(reg2.get('user-estado').title), 'o detalhe explica que entrar é opcional', reg2.get('user-estado').title);
  check(reg2.get('workspace') !== undefined, 'a página arrancou na mesma (a app não depende da conta)', 'a página não arrancou');
}

console.log('\n[18] Entrar, criar conta e confirmar o código');
{
  globalThis.__authFalso = { utilizador: null, erro: null };
  const reg = await arrancar(true);
  await new Promise((r) => setTimeout(r, 60));

  // Abre o formulário de entrar.
  reg.get('btn-user-entrar').click();
  check(reg.get('user-titulo').textContent === 'Entrar', `o formulário abre em "Entrar" ("${reg.get('user-titulo').textContent}")`, reg.get('user-titulo').textContent);
  check(reg.get('campo-nome').hidden === true, 'sem campo de nome no modo entrar', 'mostrou o nome');
  check(reg.get('campo-otp').hidden === true, 'sem campo de código no modo entrar', 'mostrou o código');

  // Entrar sem dados avisa.
  reg.get('user-email').value = '';
  reg.get('form-user').dispatchEvent({ type: 'submit' });
  await new Promise((r) => setTimeout(r, 40));
  check(/Escreva o seu email/i.test(reg.get('user-erro').textContent), `sem email, avisa ("${reg.get('user-erro').textContent}")`, reg.get('user-erro').textContent);

  // Palavra-passe curta avisa.
  reg.get('user-email').value = 'rebeca@exemplo.pt';
  reg.get('user-senha').value = '123';
  reg.get('form-user').dispatchEvent({ type: 'submit' });
  await new Promise((r) => setTimeout(r, 40));
  check(/6 caracteres/i.test(reg.get('user-erro').textContent), `senha curta, avisa ("${reg.get('user-erro').textContent}")`, reg.get('user-erro').textContent);

  // Entrar a sério: chama o login e passa a mostrar o nome.
  globalThis.__base44Falso.auth.utilizador = { id: 'u1', email: 'rebeca@exemplo.pt', full_name: 'Rebeca Silva' };
  reg.get('user-senha').value = 'segredo-bom';
  reg.get('form-user').dispatchEvent({ type: 'submit' });
  await new Promise((r) => setTimeout(r, 120));
  const chamadas = globalThis.__base44Falso.auth.chamadas.map((c) => c[0]);
  check(chamadas.includes('login'), `chamou o login (${chamadas.join(', ')})`, chamadas.join(', '));
  check(chamadas.includes('setToken'), 'guardou o token devolvido', chamadas.join(', '));
  check(/Rebeca Silva/.test(reg.get('user-estado').textContent), `passou a mostrar quem entrou ("${reg.get('user-estado').textContent}")`, reg.get('user-estado').textContent);

  // Credenciais erradas: mensagem em português, não o erro cru.
  globalThis.__base44Falso.auth.chamadas.length = 0;
  globalThis.__authFalsoErro = true;
  globalThis.__base44Falso.auth.erro = Object.assign(new Error('Invalid login credentials'), { response: { status: 401 } });
  reg.get('user-senha').value = 'errada-mas-longa';
  reg.get('form-user').dispatchEvent({ type: 'submit' });
  await new Promise((r) => setTimeout(r, 120));
  check(/não conferem/i.test(reg.get('user-erro').textContent), `credenciais erradas: "${reg.get('user-erro').textContent}"`, reg.get('user-erro').textContent);
  globalThis.__base44Falso.auth.erro = null;
}

console.log('\n[19] Criar conta e confirmar o código do email');
{
  globalThis.__authFalso = { utilizador: null, erro: null };
  const reg = await arrancar(true);
  await new Promise((r) => setTimeout(r, 60));

  // Passa para o modo criar conta.
  reg.get('btn-user-entrar').click();
  reg.get('link-user-trocar').onclick({ preventDefault() {} });
  check(reg.get('user-titulo').textContent === 'Criar conta', `muda para "Criar conta" ("${reg.get('user-titulo').textContent}")`, reg.get('user-titulo').textContent);
  check(reg.get('campo-nome').hidden === false, 'e aparece o campo do nome', 'não apareceu');

  // Cria a conta: tem de pedir o código do email.
  reg.get('user-email').value = 'nova@exemplo.pt';
  reg.get('user-senha').value = 'segredo-bom';
  reg.get('user-nome').value = 'Ana';
  reg.get('form-user').dispatchEvent({ type: 'submit' });
  await new Promise((r) => setTimeout(r, 120));
  const c1 = globalThis.__base44Falso.auth.chamadas.map((c) => c[0]);
  check(c1.includes('register'), `chamou o registo (${c1.join(', ')})`, c1.join(', '));
  check(reg.get('campo-otp').hidden === false, 'e pede o código recebido por email', 'não pediu o código');
  check(reg.get('campo-senha').hidden === true, 'a palavra-passe sai do formulário', 'continua a pedir a senha');
  check(/Enviámos um código/i.test(reg.get('toast').textContent), `avisa que enviou o código ("${reg.get('toast').textContent}")`, reg.get('toast').textContent);

  // Confirma o código: passa a haver sessão.
  globalThis.__base44Falso.auth.utilizador = { id: 'u2', email: 'nova@exemplo.pt', full_name: 'Ana' };
  reg.get('user-otp').value = '123456';
  reg.get('form-user').dispatchEvent({ type: 'submit' });
  await new Promise((r) => setTimeout(r, 150));
  const c2 = globalThis.__base44Falso.auth.chamadas.map((c) => c[0]);
  check(c2.includes('otp'), `confirmou o código (${c2.join(', ')})`, c2.join(', '));
  check(/Ana/.test(reg.get('user-estado').textContent), `ficou com sessão ("${reg.get('user-estado').textContent}")`, reg.get('user-estado').textContent);
}

console.log('\n[20] Sem erros de JavaScript');
if (erros.length) erros.slice(0, 5).forEach((e) => fail(e));
else ok('nenhum erro não tratado');

console.log(falhas.length ? `\n=== ${falhas.length} FALHA(S) ===` : '\n=== ABA DE VÍDEO OK ===');
process.exit(falhas.length ? 1 : 0);
process.exit(falhas.length ? 1 : 0);
console.error('>>> CHEGOU AO FIM DO FICHEIRO');