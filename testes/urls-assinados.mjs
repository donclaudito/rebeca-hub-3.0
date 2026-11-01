// Testes dos URLs assinados: cache, fila de um pedido de cada vez e recuo no 429.
//
// O que se está a evitar é concreto: o Painel pedia um URL por miniatura de uma
// vez (12 vídeos = 12 pedidos seguidos) e a Base44 respondia
// **429 Too Many Requests**.
const BASE = 'file:///E:/youtube%20rebeca2/rebeca-hub-3.0-base44/public/';
const mod = await import(BASE + 'urls-assinados.mjs');

const falhas = [];
const ok = (m) => console.log('  ok:', m);
const fail = (m) => { console.error('  FALHOU:', m); falhas.push(m); };
const check = (c, bom, mau) => (c ? ok(bom) : fail(mau));

// sessionStorage falso (o módulo guarda aí a cache).
const guardado = {};
globalThis.sessionStorage = {
  getItem: (k) => (k in guardado ? guardado[k] : null),
  setItem: (k, v) => { guardado[k] = String(v); },
  removeItem: (k) => { delete guardado[k]; },
};
// window falso, só para o evento do limite.
const eventos = [];
globalThis.window = { dispatchEvent: (e) => eventos.push(e && e.type) };
globalThis.Event = class { constructor(t) { this.type = t; } };

const limpar = () => { for (const k of Object.keys(guardado)) delete guardado[k]; };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('\n[1] O mesmo ficheiro só se assina UMA vez (cache)');
{
  limpar();
  let pedidos = 0;
  const pedir = async () => { pedidos += 1; return `https://x/${pedidos}`; };
  const a = await mod.assinar('private/video.webm', 3600, { pedir });
  const b = await mod.assinar('private/video.webm', 3600, { pedir });
  const c = await mod.assinar('private/video.webm', 3600, { pedir });
  check(pedidos === 1, `3 pedidos do mesmo ficheiro = 1 só chamada ao servidor (${pedidos})`, `${pedidos} chamadas (a cache não está a servir)`);
  check(a === b && b === c, 'os três devolvem o mesmo URL', `${a} / ${b} / ${c}`);

  // Outro prazo é outro URL (outra chave na cache).
  const d = await mod.assinar('private/video.webm', 600, { pedir });
  check(d !== a, 'pedir com outra validade devolve um URL novo', 'devolveu o mesmo');
  check(pedidos === 2, `e faz um pedido novo (${pedidos})`, String(pedidos));

  // `renovar` ignora a cache.
  const e = await mod.assinar('private/video.webm', 3600, { pedir, renovar: true });
  check(e !== a && pedidos === 3, `renovar pede outro (${pedidos} pedidos)`, `${pedidos} pedidos`);
}

console.log('\n[2] Um pedido de cada vez, com pausa (sem rajada)');
{
  limpar();
  const ordem = [];
  let dentro = 0;
  let maximoDentro = 0;
  const instantes = [];
  const pedir = async (uri) => {
    dentro += 1;
    maximoDentro = Math.max(maximoDentro, dentro);
    instantes.push(Date.now());
    await espera(30); // simula a latência do servidor
    dentro -= 1;
    ordem.push(uri);
    return `https://x/${uri}`;
  };
  const uris = ['a', 'b', 'c', 'd', 'e'].map((n) => `private/${n}.webm`);
  const t0 = Date.now();
  await Promise.all(uris.map((u) => mod.assinar(u, 3600, { pedir })));
  const total = Date.now() - t0;

  check(maximoDentro === 1, `nunca houve dois pedidos ao mesmo tempo (máx. ${maximoDentro})`, `chegaram ${maximoDentro} pedidos ao mesmo tempo`);
  check(ordem.join(',') === uris.join(','), 'os pedidos saem por ordem', ordem.join(','));
  const maisCurto = Math.min(...instantes.slice(1).map((t, i) => t - instantes[i]));
  check(maisCurto >= mod.PAUSA_ENTRE_PEDIDOS - 40, `as chamadas ficam separadas (a mais curta: ${maisCurto} ms)`, `duas chamadas com ${maisCurto} ms de intervalo`);
  check(total >= mod.PAUSA_ENTRE_PEDIDOS * (uris.length - 1), `5 ficheiros levam o tempo das pausas (${total} ms)`, `${total} ms`);
}

console.log('\n[3] 429: recua e tenta outra vez');
{
  limpar();
  let tentativas = 0;
  const pedir = async () => {
    tentativas += 1;
    if (tentativas < 3) throw new Error('Request failed with status code 429');
    return 'https://x/ao-fim';
  };
  const url = await mod.assinar('private/limite.webm', 3600, { pedir });
  check(url === 'https://x/ao-fim', 'ao 2.º recuo lá consegue', String(url));
  check(tentativas === 3, `tentou 3 vezes (${tentativas})`, String(tentativas));
}

console.log('\n[4] 429 sempre: desiste com uma explicação (e avisa a página)');
{
  limpar();
  eventos.length = 0;
  let tentativas = 0;
  const pedir = async () => {
    tentativas += 1;
    throw new Error('Request failed with status code 429 Too Many Requests');
  };
  let erro = null;
  try {
    await mod.assinar('private/sempre.webm', 3600, { pedir });
  } catch (e) {
    erro = e;
  }
  check(Boolean(erro), 'dá erro em vez de ficar pendente', 'não deu erro');
  check(/429|limitar/i.test(String(erro && erro.message)), `o erro explica o 429 ("${String(erro && erro.message).slice(0, 60)}...")`, String(erro && erro.message));
  check(eventos.includes('rh-limite-pedidos'), 'avisa a página (rh-limite-pedidos) para mostrar o aviso', 'não avisou');
  check(tentativas === mod.TENTATIVAS, `tentou ${mod.TENTATIVAS} vezes antes de desistir (${tentativas})`, String(tentativas));

  // Um erro que NÃO é 429 não se repete: é um problema real, diz logo.
  limpar();
  let outros = 0;
  const pedirOutro = async () => {
    outros += 1;
    throw new Error('ficheiro não existe');
  };
  try {
    await mod.assinar('private/nao-existe.webm', 3600, { pedir: pedirOutro });
  } catch {
    /* esperado */
  }
  check(outros === 1, `um erro que não é 429 não é repetido (${outros} tentativa)`, `${outros} tentativas`);
}

console.log('\n[5] A fila não fica presa quando um pedido falha');
{
  limpar();
  const pedir = async (uri) => {
    if (uri === 'private/mau.webm') throw new Error('sem permissão');
    return `https://x/${uri}`;
  };
  const falhou = mod.assinar('private/mau.webm', 3600, { pedir }).catch(() => 'falhou');
  const bom = await mod.assinar('private/bom.webm', 3600, { pedir });
  check(bom === 'https://x/private/bom.webm', 'o pedido seguinte passa na mesma', String(bom));
  check((await falhou) === 'falhou', 'e o que falhou dá erro a quem pediu', 'não deu erro');
}

console.log('\n[6] 402 (sem créditos): para logo, avisa e explica — não é sessão nem rajada');
{
  limpar();
  let tentativas = 0;
  const pedir = async () => {
    tentativas += 1;
    const e = new Error('Request failed with status code 402');
    e.response = { status: 402 };
    throw e;
  };
  let erro = null;
  try {
    await mod.assinar('private/pago.webm', 3600, { pedir });
  } catch (e) {
    erro = e;
  }
  check(Boolean(erro), 'dá erro em vez de ficar pendente', 'não deu erro');
  check(/cr[eé]ditos/i.test(String(erro && erro.message)), `o erro fala de créditos ("${String(erro && erro.message).slice(0, 70)}…")`, String(erro && erro.message));
  check(!/sess[ãa]o/i.test(String(erro && erro.message)), 'não manda entrar na conta (não é problema de sessão)', String(erro && erro.message));
  check(tentativas === 1, `não repete o pedido (${tentativas} tentativa)`, `${tentativas} tentativas`);
  check(eventos.includes('rh-sem-creditos'), 'avisa a página (rh-sem-creditos)', eventos.join(', '));
  check(!eventos.includes('rh-sessao-invalida'), 'e não marca a sessão como inválida', eventos.join(', '));

  // A mensagem é a mesma que os outros módulos usam (uma só frase na app).
  check(/SEM CRÉDITOS/.test(mod.MENSAGEM_CREDITOS), 'a mensagem está no módulo dos URLs', 'sem mensagem');
}

console.log(falhas.length ? `\n=== ${falhas.length} FALHA(S) ===` : '\n=== URLS ASSINADOS OK ===');
process.exit(falhas.length ? 1 : 0);
