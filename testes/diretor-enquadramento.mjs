// A "🎥 Análise do Diretor" de ponta a ponta: a auditoria de enquadramento
// corre ANTES da IA, aparece no diálogo, segue no pedido, entra nas melhorias e
// condiciona o prompt refinado.
//
// Corre o estudio-analise.mjs verdadeiro, com a nuvem falsa: o que se prova é o
// que o utilizador vê no diálogo e o que vai no prompt.
import { readFileSync } from 'node:fs';

const BASE = 'file:///E:/youtube%20rebeca2/rebeca-hub-3.0-base44/public/';
const raiz = 'E:/youtube rebeca2/rebeca-hub-3.0-base44/public/';
const html = readFileSync(raiz + 'index.html', 'utf8');

const falhas = [];
const ok = (m) => console.log('  ok:', m);
const fail = (m) => { console.error('  FALHOU:', m); falhas.push(m); };
const check = (c, bom, mau) => (c ? ok(bom) : fail(mau));

// ---- DOM falso (só o que a análise usa) ----
class El {
  constructor(id = '') {
    this.id = id; this.children = []; this.hidden = false; this.open = false;
    this._text = ''; this._html = ''; this.value = ''; this.className = '';
    this.title = ''; this.disabled = false; this.dataset = {}; this.style = {};
    this.width = 0; this.height = 0; this._ctx = null;
  }
  get textContent() { return this._text; } set textContent(v) { this._text = String(v); }
  get innerHTML() { return this._html; } set innerHTML(v) { this._html = String(v); if (v === '') this.children = []; }
  append(...n) { n.forEach((x) => this.children.push(x)); }
  appendChild(n) { this.children.push(n); return n; }
  replaceChildren(...n) { this.children = [...n]; }
  remove() {} setAttribute() {} removeAttribute() {} addEventListener() {} removeEventListener() {}
  select() { this.selecionado = true; }
  focus() { this.focado = true; }
  showModal() { this.open = true; } close() { this.open = false; }
  querySelector() { return null; } querySelectorAll() { return []; }
  getContext() {
    // Devolve os pixels do "personagem" desta imagem de teste.
    return {
      drawImage() {},
      getImageData: () => ({ data: globalThis.__pixelsDoTeste(), width: globalThis.__lado, height: globalThis.__lado }),
    };
  }
}

const reg = new Map();
for (const m of html.matchAll(/id="([A-Za-z0-9_-]+)"/g)) {
  const el = new El(m[1]);
  const tag = html.slice(m.index, m.index + 160).split('>')[0];
  if (/\shidden/.test(tag)) el.hidden = true;
  reg.set(m[1], el);
}

globalThis.document = {
  getElementById: (id) => reg.get(id) || null,
  createElement: (t) => new El(t),
  createTextNode: (t) => ({ nodeType: 3, textContent: String(t) }),
  _l: {},
  addEventListener() {},
};
globalThis.window = { addEventListener() {}, dispatchEvent() {} };
globalThis.URL.createObjectURL = () => 'blob:x';
globalThis.URL.revokeObjectURL = () => {};
globalThis.Blob = class { constructor() { this.size = 10; this.type = 'image/jpeg'; } };
globalThis.File = class { constructor(partes, nome) { this.name = nome; this.size = 10; } };

// Imagem falsa: 200×300 com o personagem a começar na LINHA 0 (a cabeça sai
// pela borda de cima) — é a falta mais grave e a que exige gerar de novo.
const lado = 200;
globalThis.__lado = lado;
let dadosCache = null;
globalThis.__pixelsDoTeste = () => {
  if (dadosCache) return dadosCache;
  const l = lado, a = lado;
  const dados = new Uint8ClampedArray(l * a * 4);
  for (let i = 0; i < l * a; i++) {
    dados[i * 4] = 200; dados[i * 4 + 1] = 220; dados[i * 4 + 2] = 240; dados[i * 4 + 3] = 255;
  }
  // Personagem: xadrez de alto contraste, de y=0 a y=150, x=70..130.
  for (let y = 0; y < 150; y++) {
    for (let x = 70; x < 130; x++) {
      const q = (Math.floor(x / 2) + Math.floor(y / 2)) % 2;
      const i = y * l + x;
      const v = q ? 10 : 250;
      dados[i * 4] = v; dados[i * 4 + 1] = v; dados[i * 4 + 2] = v;
    }
  }
  dadosCache = dados;
  return dados;
};
globalThis.Image = class {
  constructor() { this.naturalWidth = lado; this.naturalHeight = lado; setTimeout(() => this.onload?.(), 0); }
  set src(v) { this._src = v; }
  get src() { return this._src; }
};
if (!globalThis.crypto) globalThis.crypto = {};
globalThis.crypto.randomUUID = () => 'uuid-1';

// ---- nuvem falsa: o que vai no pedido e o que o Diretor responde ----
const pedido = { arquivos: null, meta: null, enquadramento: null };
globalThis.__base44Falso = {
  integrations: { Core: {
    UploadPrivateFile: async ({ file }) => ({ file_uri: `private/${file?.name || 'x'}.jpg` }),
  } },
  functions: {
    invoke: async (_nome, corpo) => {
      pedido.arquivos = corpo.arquivos;
      pedido.meta = corpo.meta;
      pedido.enquadramento = corpo.enquadramento;
      return {
        ok: true,
        enquadramento: 'O personagem está cortado em cima na primeira cena.',
        composicao: 'Boa luz, ritmo calmo.',
        sincronia: 'A música fecha com a última imagem.',
        melhorias: [{ titulo: 'Cor', detalhe: 'aquecer ligeiramente' }],
        promptRefinado: 'A cheerful little girl playing in a sunny garden, soft pastel colours.',
      };
    },
  },
};

const mod = await import(BASE + 'estudio-analise.mjs');

const avisos = [];
const ctx = {
  state: {
    images: [{ name: 'cena1.jpg', file: new Blob() }],
    videoFormato: '1920x1080',
    _miniatura: null,
  },
  $: (id) => reg.get(id),
  toast: (m) => avisos.push(String(m)),
  clienteBase44: async () => globalThis.__base44Falso,
  videoAtual: () => ({ blob: new Blob(), r: { duracao: 30 } }),
};

mod.iniciarAnalise(ctx);

console.log('\n[1] A análise mede o enquadramento ANTES de chamar a IA');
{
  const btn = reg.get('btn-video-analise');
  await mod.analisarDiretor();
  await new Promise((r) => setTimeout(r, 600));

  check(Boolean(pedido.enquadramento), 'o pedido à IA levou a auditoria de enquadramento', 'foi sem auditoria');
  const cenas = pedido.enquadramento?.cenas || [];
  check(cenas.length === 1, `levou as cenas medidas (${cenas.length})`, String(cenas.length));
  check(
    (pedido.enquadramento?.faltas || []).some((f) => /cabeça/i.test(f)),
    `as faltas incluem a cabeça cortada ("${(pedido.enquadramento?.faltas || []).join(' | ')}")`,
    JSON.stringify(pedido.enquadramento?.faltas),
  );
}

console.log('\n[2] O diálogo mostra o enquadramento medido e o que o Diretor viu');
{
  const texto = reg.get('analise-enquadramento-texto').textContent;
  check(/A corrigir/i.test(texto), `explica o que há a corrigir ("${texto.slice(0, 70)}…")`, texto);
  const itens = reg.get('analise-enquadramento').children;
  check(itens.length === 1, `lista a cena com problema (${itens.length})`, String(itens.length));
  const linha = itens[0] ? itens[0].children.map((c) => c.textContent).join('') : '';
  check(/⛔/.test(linha) && /cortada|cabeça/i.test(linha), `marca a cena como grave ("${linha.slice(0, 80)}")`, linha);
  check(
    /cortado em cima/i.test(reg.get('analise-enquadramento-ia').textContent),
    'mostra também a leitura do Diretor sobre o enquadramento',
    reg.get('analise-enquadramento-ia').textContent,
  );
}

console.log('\n[3] As faltas entram nas melhorias e no prompt refinado');
{
  const melhorias = reg.get('analise-melhorias').children;
  const primeiro = melhorias[0] ? melhorias[0].children.map((c) => c.textContent).join('') : '';
  check(/Enquadramento \(medido\)/i.test(primeiro), `a 1.ª melhoria é o enquadramento medido ("${primeiro.slice(0, 70)}")`, primeiro);

  const prompt = reg.get('analise-prompt').value;
  check(/sunny garden/i.test(prompt), 'o prompt do Diretor mantém-se', prompt.slice(0, 60));
  check(/Framing requirements/i.test(prompt), 'e ganha a exigência de enquadramento em inglês', prompt.slice(-120));
  check(/head, hands and feet fully visible/i.test(prompt), 'com cabeça, mãos e pés visíveis', prompt.slice(-120));
}

console.log('\n[4] Sem erros no caminho');
{
  const erros = avisos.filter((a) => /falhou|❌/i.test(a));
  check(erros.length === 0, `nenhum aviso de falha (${avisos.length} aviso(s))`, erros.join(' | '));
  const estado = reg.get('analise-estado').textContent;
  check(/pronta/i.test(estado), `o diálogo termina em "análise pronta" ("${estado.slice(0, 70)}")`, estado);
}

console.log(falhas.length ? `\n=== ${falhas.length} FALHA(S) ===` : '\n=== DIRETOR COM ENQUADRAMENTO OK ===');
process.exit(falhas.length ? 1 : 0);
