// "Poder carregar numa pasta vários vídeos": o botão 🎬 Carregar vídeo passou a
// aceitar VÁRIOS ficheiros de uma vez. Vários entram todos como cenas de vídeo,
// pela ordem dos nomes (ordem natural: "clipe 2" antes de "clipe 10"), com
// progresso — e um que não se consiga ler fica de fora com aviso.
import { readFileSync } from 'node:fs';

const raiz = 'E:/youtube rebeca2/rebeca-hub-3.0-base44/public/';
const html = readFileSync(raiz + 'index.html', 'utf8');
const mod = await import('file:///E:/youtube%20rebeca2/rebeca-hub-3.0-base44/public/estudio-video-carregado.mjs');

const falhas = [];
const ok = (m) => console.log('  ok:', m);
const fail = (m) => { console.error('  FALHOU:', m); falhas.push(m); };
const check = (c, bom, mau) => (c ? ok(bom) : fail(mau));

class El {
  constructor(id = '') {
    this.id = id; this.hidden = false; this._text = ''; this.children = []; this.open = false;
    this.onclick = null; this.onchange = null; this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
  }
  get textContent() { return this._text; } set textContent(v) { this._text = String(v); }
  append(...n) { n.forEach((x) => this.children.push(x)); }
  click() { if (typeof this.onclick === 'function') this.onclick({ preventDefault() {} }); }
  showModal() { this.open = true; }
  close() { this.open = false; }
}

const reg = new Map();
for (const m of html.matchAll(/id="([A-Za-z0-9_-]+)"/g)) {
  const el = new El(m[1]);
  const tag = html.slice(m.index, m.index + 200).split('>')[0];
  if (/\shidden/.test(tag)) el.hidden = true;
  reg.set(m[1], el);
}

// <video> falso: a duração vem do NOME do ficheiro (blob:v1.mp4 → 5s).
function novoVideo() {
  const v = {};
  Object.defineProperty(v, 'src', {
    set(url) {
      const nome = String(url).replace('blob:', '');
      setTimeout(() => {
        if (/mau/.test(nome)) return v.onerror?.();
        v.videoWidth = 1280; v.videoHeight = 720;
        v.duration = /v2/.test(nome) ? 7 : 5;
        v.onloadedmetadata?.();
      }, 0);
    },
  });
  return v;
}

globalThis.document = {
  getElementById: (id) => reg.get(id) || null,
  createElement: (t) => (t === 'video' ? novoVideo() : new El(t)),
  createTextNode: (t) => ({ nodeType: 3, textContent: String(t) }),
  addEventListener() {},
  querySelector: () => null,
  querySelectorAll: () => [],
};
globalThis.window = { addEventListener() {}, dispatchEvent() {} };
let n = 0;
// `globalThis.crypto` é só de leitura em Node: mexe-se na propriedade.
if (!globalThis.crypto) globalThis.crypto = {};
try {
  globalThis.crypto.randomUUID = () => `id-${++n}`;
} catch {
  Object.defineProperty(globalThis, 'crypto', { value: { randomUUID: () => `id-${++n}` }, configurable: true });
}
globalThis.URL.createObjectURL = (f) => `blob:${f && f.name}`;
globalThis.URL.revokeObjectURL = () => {};

const toasts = [];
const state = { images: [] };
let renderizadas = 0;
mod.iniciar({
  state,
  toast: (msg, kind) => toasts.push({ msg, kind }),
  renderThumbs: () => {},
  renderScenes: () => { renderizadas += 1; },
  updateLayout: () => {},
  clienteBase44: async () => ({}),
});

const video = (nome, tipo = 'video/mp4') => ({ name: nome, type: tipo, size: 1000 });

console.log('\n[1] O botão aceita vários ficheiros');
{
  check(/id="input-video"[^>]*\bmultiple\b/.test(html), 'o <input id="input-video"> tem `multiple`', 'o input só aceita um');
  const modFonte = readFileSync(raiz + 'estudio-video-carregado.mjs', 'utf8');
  check(/carregarVideosFicheiros\(e\.target\.files\)/.test(modFonte), 'o handler passa a LISTA de ficheiros', 'só passa o primeiro');
  check(/multiple|vários|vários vídeos/i.test(html.split('btn-video-load')[1] || ''), 'o botão diz que se podem escolher vários', 'o botão não avisa');
  const app = readFileSync(raiz + 'app.js', 'utf8');
  check(/carregarVideosFicheiros\(videos\)/.test(app), 'arrastar vários vídeos também entra em todos', 'arrastar só apanha um');
}

console.log('\n[2] Separa vídeos do resto, e ordena como uma pessoa conta');
{
  const lista = [video('clipe 10.mp4'), video('clipe 2.mp4'), { name: 'leia-me.txt', type: 'text/plain' }, video('nota.mov', 'video/quicktime')];
  const { videos, recusados } = mod.filtrarVideos(lista);
  check(videos.length === 3, `3 vídeos reconhecidos (${videos.map((v) => v.name).join(', ')})`, String(videos.length));
  check(recusados.length === 1 && recusados[0] === 'leia-me.txt', `o .txt fica de fora (${recusados.join(', ')})`, recusados.join(','));
  const ordem = mod.ordenarPorNome(videos).map((v) => v.name);
  check(ordem[0] === 'clipe 2.mp4' && ordem[1] === 'clipe 10.mp4',
    `ordem natural: ${ordem.join(' · ')}`, `ordem errada: ${ordem.join(' · ')}`);
}

console.log('\n[3] Vários de uma vez entram todos, pela ordem certa');
{
  state.images.length = 0; toasts.length = 0; renderizadas = 0;
  await mod.carregarVideosFicheiros([
    video('v2.mp4'), video('v1.mp4'), video('mau.mp4'), { name: 'musica.mp3', type: 'audio/mpeg' },
  ]);
  await new Promise((r) => setTimeout(r, 120));
  const nomes = state.images.map((i) => i.name);
  check(nomes.length === 2, `2 cenas de vídeo criadas (${nomes.join(', ')})`, `${nomes.length}: ${nomes.join(', ')}`);
  check(nomes[0] === 'v1.mp4' && nomes[1] === 'v2.mp4', `entraram pela ordem dos nomes (${nomes.join(' → ')})`, nomes.join(' → '));
  check(state.images.every((i) => i.video === true), 'todas marcadas como vídeo', JSON.stringify(state.images.map((i) => i.video)));
  const duracoes = state.images.map((i) => i.duracao);
  check(duracoes[0] === 5 && duracoes[1] === 7, `cada uma com a sua duração (${duracoes.join(', ')}s)`, duracoes.join(','));
  check(renderizadas >= 1, 'a lista foi redesenhada', String(renderizadas));
  const textos = toasts.map((t) => t.msg).join(' | ');
  check(/não são vídeo/i.test(textos), 'avisa do ficheiro que não é vídeo', textos);
  check(/2 vídeo\(s\) na montagem/i.test(textos), `diz quantos entraram ("${textos.split(' | ').at(-1)}")`, textos);
  check(/ordem dos nomes/i.test(textos), 'explica a ordem com que entraram', textos);
  check(/mau\.mp4/.test(textos), 'diz qual ficou de fora (sem duração legível)', textos);
}

console.log('\n[4] Um só continua a perguntar o destino');
{
  state.images.length = 0; toasts.length = 0;
  await mod.carregarVideosFicheiros([video('so-um.mp4')]);
  const dlg = reg.get('dlg-destino');
  check(dlg.open === true, 'abriu a janela "estúdio ou Painel"', 'não perguntou o destino');
  check(mod.videoPendente && mod.videoPendente.name === 'so-um.mp4', `guardou o ficheiro pendente (${mod.videoPendente && mod.videoPendente.name})`, 'sem ficheiro pendente');
  check(state.images.length === 0, 'ainda não criou cena (espera a escolha)', String(state.images.length));
}

console.log('\n[5] Sem vídeos legíveis: diz que não conseguiu');
{
  state.images.length = 0; toasts.length = 0;
  await mod.carregarVideosFicheiros([video('mau1.mp4'), video('mau2.mp4')]);
  await new Promise((r) => setTimeout(r, 120));
  const textos = toasts.map((t) => t.msg).join(' | ');
  check(state.images.length === 0, 'não inventa cenas', String(state.images.length));
  check(/não consegui ler nenhum/i.test(textos), `avisa ("${textos.split(' | ').at(-1)}")`, textos);
}

console.log(falhas.length ? `\n=== ${falhas.length} FALHA(S) ===` : '\n=== VÁRIOS VÍDEOS OK ===');
process.exit(falhas.length ? 1 : 0);
