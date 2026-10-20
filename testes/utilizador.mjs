// Testes do "quem está a usar" (estudio-utilizador.mjs).
//
// O que se está a evitar: `GET /entities/User/me -> 401` na consola a cada
// visita anónima. A app não deve perguntar "quem está" quando não há sessão
// nenhuma, e deve esquecer um token que já não vale.
import { readFileSync } from 'node:fs';

const raiz = 'E:/youtube rebeca2/rebeca-hub-3.0-base44/public/';
const BASE = 'file:///E:/youtube%20rebeca2/rebeca-hub-3.0-base44/public/';
const html = readFileSync(raiz + 'index.html', 'utf8');

const falhas = [];
const ok = (m) => console.log('  ok:', m);
const fail = (m) => { console.error('  FALHOU:', m); falhas.push(m); };
const check = (c, bom, mau) => (c ? ok(bom) : fail(mau));

// ---- DOM mínimo (só o que este módulo toca) ----
class El {
  constructor(id = '') {
    this.id = id; this.hidden = false; this.disabled = false; this.textContent = '';
    this.title = ''; this.value = ''; this.dataset = {}; this._l = {}; this._classes = new Set();
    this.classList = {
      toggle: (c, f) => (f ? this._classes.add(c) : this._classes.delete(c)),
      contains: (c) => this._classes.has(c),
      add: (c) => this._classes.add(c),
      remove: (c) => this._classes.delete(c),
    };
  }
  addEventListener(t, fn) { (this._l[t] = this._l[t] || []).push(fn); }
  setAttribute() {} removeAttribute() {} querySelector() { return null; }
  close() { this.open = false; } showModal() { this.open = true; }
  focus() {}
}

const reg = new Map();
for (const m of html.matchAll(/id="([A-Za-z0-9_-]+)"/g)) {
  const el = new El(m[1]);
  const tag = html.slice(m.index, m.index + 160).split('>')[0];
  if (/\shidden/.test(tag)) el.hidden = true;
  reg.set(m[1], el);
}

const guardado = {};
globalThis.localStorage = {
  getItem: (k) => (k in guardado ? guardado[k] : null),
  setItem: (k, v) => { guardado[k] = String(v); },
  removeItem: (k) => { delete guardado[k]; },
};
globalThis.document = {
  getElementById: (id) => reg.get(id) || null,
  createElement: () => new El(),
  createTextNode: (t) => ({ nodeType: 3, textContent: String(t) }),
  addEventListener() {},
};
globalThis.window = { confirm: () => true, addEventListener() {} };

const chamadas = { me: 0, logout: 0 };
let respostaMe = null; // null = sem sessão (401)

globalThis.__base44Falso = {
  auth: {
    me: async () => {
      chamadas.me += 1;
      if (respostaMe instanceof Error) throw respostaMe;
      if (!respostaMe) {
        const erro = new Error('Request failed with status code 401');
        erro.response = { status: 401 };
        throw erro;
      }
      return respostaMe;
    },
    logout: () => { chamadas.logout += 1; delete guardado.base44_access_token; },
  },
};

const mod = await import(BASE + 'estudio-utilizador.mjs');

const estado = () => reg.get('user-estado').textContent;
const entrarVisivel = () => reg.get('btn-user-entrar').hidden === false;
const sairVisivel = () => reg.get('btn-user-sair').hidden === false;

function arrancar() {
  chamadas.me = 0;
  chamadas.logout = 0;
  reg.get('user-estado').textContent = '';
  mod.iniciarUtilizador({
    toast: () => {},
    clienteBase44: async () => globalThis.__base44Falso,
  });
}

console.log('\n[1] Sem sessão guardada NÃO se pergunta ao servidor (nada de 401)');
{
  delete guardado.base44_access_token;
  arrancar();
  await new Promise((r) => setTimeout(r, 60));
  check(chamadas.me === 0, `não chamou auth.me() (${chamadas.me} pedidos)`, `${chamadas.me} pedidos — ia dar 401`);
  check(estado() === 'sem conta', `mostra "sem conta" ("${estado()}")`, estado());
  check(entrarVisivel() && !sairVisivel(), 'e o botão "Entrar" está à vista', 'botões trocados');
}

console.log('\n[2] Com sessão guardada, mostra quem está');
{
  guardado.base44_access_token = 'token-bom';
  respostaMe = { id: 'u1', email: 'ana@exemplo.pt', full_name: 'Ana Silva' };
  arrancar();
  await new Promise((r) => setTimeout(r, 60));
  check(chamadas.me === 1, `perguntou uma vez (${chamadas.me})`, String(chamadas.me));
  check(/Ana Silva/.test(estado()), `mostra o nome ("${estado()}")`, estado());
  check(!entrarVisivel() && sairVisivel(), 'com "Sair" à vista e "Entrar" escondido', 'botões trocados');
}

console.log('\n[3] Token inválido (401): esquece a sessão e não fica a insistir');
{
  guardado.base44_access_token = 'token-velho';
  respostaMe = null; // auth.me() → 401
  arrancar();
  await new Promise((r) => setTimeout(r, 80));
  check(chamadas.me === 1, 'tentou uma vez', String(chamadas.me));
  check(chamadas.logout === 1, `limpou a sessão inválida (${chamadas.logout} logout)`, `${chamadas.logout} logouts`);
  check(estado() === 'sem conta', `e volta a "sem conta" ("${estado()}")`, estado());

  // No carregamento SEGUINTE já não há token: não se pergunta nada.
  chamadas.me = 0;
  arrancar();
  await new Promise((r) => setTimeout(r, 60));
  check(chamadas.me === 0, 'no carregamento seguinte já não faz pedido nenhum', `${chamadas.me} pedidos`);
}

console.log('\n[4] O cliente do SDK tem os analytics desligados');
{
  const cliente = readFileSync('E:/youtube rebeca2/rebeca-hub-3.0-base44/src/base44Client.js', 'utf8');
  check(/analytics:\s*\{\s*enabled:\s*false\s*\}/.test(cliente), 'analytics: { enabled: false } no createClient', 'analytics ainda ligado');
  check(/export const temSessao/.test(cliente), 'e há temSessao() para saber se há sessão sem pedir nada', 'sem temSessao()');
  const utilizador = readFileSync(raiz + 'estudio-utilizador.mjs', 'utf8');
  check(/base44_access_token/.test(utilizador), 'o módulo do utilizador olha para o token guardado', 'não olha');
  check(/temTokenGuardado\(\)/.test(utilizador), 'e não pergunta ao servidor sem sessão', 'pergunta sempre');
}

console.log(falhas.length ? `\n=== ${falhas.length} FALHA(S) ===` : '\n=== UTILIZADOR OK ===');
process.exit(falhas.length ? 1 : 0);
