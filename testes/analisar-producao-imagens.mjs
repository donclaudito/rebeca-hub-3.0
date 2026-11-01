// O 400 do "Diretor" (analisarProducao): a função mandava URLs assinados à
// DeepSeek, e ela NÃO os consegue descarregar ("Failed to download image from
// <url>"). Agora as imagens seguem em base64 DENTRO do pedido — e o servidor já
// não assina nem descarrega ficheiros, que é o que gasta os créditos de
// integrações da Base44 (o 402 que aparecia na consola).
// Estes testes provam o formato, os limites e que nada vai pelo armazenamento.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const raiz = 'E:/youtube rebeca2/rebeca-hub-3.0-base44/base44/';

const falhas = [];
const ok = (m) => console.log('  ok:', m);
const fail = (m) => {
  console.error('  FALHOU:', m);
  falhas.push(m);
};
const check = (c, bom, mau) => (c ? ok(bom) : fail(mau));

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const pngDataUrl = (bytes = PNG) => `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;

// ---- carregar a função com a nuvem trocada por globais falsos ----
const fonteFn = readFileSync(join(raiz, 'functions', 'analisarProducao', 'entry.ts'), 'utf8');
const preparado = fonteFn
  .replace(
    /import \{ createClientFromRequest \} from 'npm:@base44\/sdk@[^']*';/,
    'const createClientFromRequest = (req) => globalThis.__cliente(req);',
  )
  .replace(
    /import \{ pedirJSON \} from '\.\.\/\.\.\/shared\/deepseek\.ts';/,
    'const pedirJSON = (a) => globalThis.__pedirJSON(a);',
  );
const tempFn = join(tmpdir(), `analisarProducao-${Date.now()}.mjs`);
writeFileSync(tempFn, preparado, 'utf8');

// O cliente falso NÃO tem integrações: se a função tentar assinar um ficheiro
// (gastando créditos), o teste rebenta aqui em vez de passar despercebido.
globalThis.__cliente = () => ({
  auth: { me: async () => ({ id: 'u1', email: 'teste@exemplo.pt' }) },
  get asServiceRole() {
    throw new Error('a análise tentou usar asServiceRole (créditos de integrações)');
  },
  get integrations() {
    throw new Error('a análise tentou usar integrations (créditos de integrações)');
  },
});

let pedidoIA = null;
globalThis.__pedirJSON = async (args) => {
  pedidoIA = args;
  return {
    ok: true,
    dados: {
      enquadramento: 'Personagem centrada.',
      composicao: 'Luz suave.',
      sincronia: 'A música fecha com a última imagem.',
      melhorias: [{ titulo: 'Cor', detalhe: 'aquecer' }],
      promptRefinado: 'A cheerful girl in a garden, soft pastel colours, 16:9.',
    },
  };
};

// Nenhum descarregamento de ficheiros é permitido: as imagens vêm no pedido.
const descargas = [];
globalThis.fetch = async (url) => {
  descargas.push(String(url));
  throw new Error('a análise tentou descarregar um ficheiro do armazenamento');
};

const fn = (await import(`file://${tempFn.replace(/\\/g, '/')}`)).default;
const chamar = (corpo) => fn({ method: 'POST', json: async () => corpo });

// Uma cena com a imagem DENTRO do pedido (o contrato novo).
const corpo = (imagens) => ({
  arquivos: imagens.map((dataUrl, i) => ({ nome: `cena-${i + 1}.jpg`, dataUrl })),
  meta: { duracao: 42, formato: '1280x720', cenas: imagens.length },
  enquadramento: null,
});

console.log('\n[1] As imagens chegam em base64 e seguem assim para a IA');
{
  pedidoIA = null;
  const r = await chamar(corpo([pngDataUrl(), pngDataUrl()]));
  const d = await r.json();
  check(d.ok === true, `a análise corre (${r.status})`, JSON.stringify(d).slice(0, 160));
  check(Array.isArray(pedidoIA?.imagens) && pedidoIA.imagens.length === 2, 'levou 2 imagens para a IA', String(pedidoIA?.imagens?.length));
  check(
    pedidoIA.imagens.every((u) => u.startsWith('data:image/png;base64,')),
    'todas vão como data URL em base64',
    String(pedidoIA.imagens.map((u) => u.slice(0, 40))),
  );
  check(
    pedidoIA.imagens.every((u) => !/^https?:/i.test(u)),
    'nenhuma imagem vai por URL (era isso que dava 400)',
    String(pedidoIA.imagens.map((u) => u.slice(0, 40))),
  );
  check(descargas.length === 0, 'nada foi descarregado do armazenamento (0 créditos)', descargas.join(', '));
}

console.log('\n[2] Uma imagem estragada não mata a análise');
{
  pedidoIA = null;
  const r = await chamar(corpo(['data:text/plain;base64,bmFkYQ==', pngDataUrl()]));
  const d = await r.json();
  check(d.ok === true, 'a análise corre com a que sobrou', JSON.stringify(d).slice(0, 120));
  check(pedidoIA?.imagens?.length === 1, `levou 1 imagem (${pedidoIA?.imagens?.length})`, String(pedidoIA?.imagens?.length));
}

console.log('\n[3] Uma imagem enorme fica de fora (o pedido não rebenta)');
{
  pedidoIA = null;
  const grande = Buffer.alloc(3_300_000, 7);
  grande[0] = 0x89;
  grande[1] = 0x50;
  grande[2] = 0x4e;
  grande[3] = 0x47;
  const r = await chamar(corpo([pngDataUrl(grande), pngDataUrl()]));
  const d = await r.json();
  check(d.ok === true, 'a análise corre', JSON.stringify(d).slice(0, 120));
  check(pedidoIA?.imagens?.length === 1, 'a gigante ficou de fora', String(pedidoIA?.imagens?.length));
}

console.log('\n[4] Imagem que não é imagem: erro claro (502), não silêncio');
{
  const naoImagem = `data:image/jpeg;base64,${Buffer.from('nao sou imagem').toString('base64')}`;
  const r = await chamar(corpo([naoImagem, naoImagem]));
  const d = await r.json();
  check(r.status === 502, `responde 502 (${r.status})`, String(r.status));
  check(/Não consegui ler as imagens/i.test(String(d.error)), `explica o que falhou ("${String(d.error).slice(0, 60)}…")`, String(d.error));
  check(/formato não aceite/i.test(JSON.stringify(d.debug?.motivos || [])), 'diz que o formato não é aceite', JSON.stringify(d.debug).slice(0, 120));
}

console.log('\n[5] Sem imagens: 400 com o pedido certo');
{
  const r = await chamar({ arquivos: [], meta: {} });
  const d = await r.json();
  check(r.status === 400, `responde 400 (${r.status})`, String(r.status));
  check(/Envie as imagens/i.test(String(d.error)), 'diz o que enviar', String(d.error));
}

console.log('\n[6] Pedido só com ficheiros privados (uri): recusado SEM gastar créditos');
{
  pedidoIA = null;
  descargas.length = 0;
  const r = await chamar({
    arquivos: [
      { nome: 'a.jpg', uri: 'private/a.jpg' },
      { nome: 'b.jpg', uri: 'private/b.jpg' },
    ],
    meta: {},
  });
  const d = await r.json();
  check(r.status === 502, `responde 502 (${r.status})`, String(r.status));
  check(/créditos/i.test(String(d.error) + JSON.stringify(d.debug || {})), `explica que não gasta créditos ("${String(d.error).slice(0, 70)}…")`, String(d.error));
  check(descargas.length === 0, 'não descarregou nada do armazenamento', descargas.join(', '));
  check(pedidoIA === null, 'e não chegou a pedir nada à IA', JSON.stringify(pedidoIA).slice(0, 80));
}

console.log('\n[6] O pedido à DeepSeek leva max_tokens (modelo que "pensa")');
{
  const fonte = readFileSync(join(raiz, 'shared', 'deepseek.ts'), 'utf8').replace(
    /^import \{ secrets \} from 'base44:runtime';$/m,
    'const secrets = globalThis.__secrets;',
  );
  const temp = join(tmpdir(), `deepseek-${Date.now()}.mjs`);
  writeFileSync(temp, fonte, 'utf8');
  const guardado = { DEEPSEEK_API_KEY: 'sk-teste' };
  globalThis.__secrets = { get: (k) => guardado[k] || '' };
  const mod = await import(`file://${temp.replace(/\\/g, '/')}`);

  let enviado = null;
  const r1 = await mod.pedirJSON({
    texto: 'devolve {"a":1} em JSON',
    buscar: async (_url, opcoes) => {
      enviado = JSON.parse(opcoes.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: '{"a":1}' } }] }),
        text: async () => '',
      };
    },
  });
  check(r1.ok === true, 'resposta normal continua a funcionar', JSON.stringify(r1).slice(0, 100));
  check(Number(enviado?.max_tokens) >= 1000, `envia max_tokens (${enviado?.max_tokens})`, String(enviado?.max_tokens));

  // content vazio + finish_reason=length: explicar em vez de "sem conteúdo".
  const r2 = await mod.pedirJSON({
    texto: 'devolve JSON',
    buscar: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ finish_reason: 'length', message: { content: '' } }] }),
      text: async () => '',
    }),
  });
  check(r2.ok === false, 'não finge que correu', JSON.stringify(r2).slice(0, 100));
  check(/tokens/i.test(String(r2.erro)), `o erro fala do limite de tokens ("${String(r2.erro).slice(0, 70)}…")`, String(r2.erro));
}

console.log('\n[8] O formato vem dos BYTES, não do cabeçalho do data URL');
{
  pedidoIA = null;
  // Cabeçalho diz JPEG, os bytes são PNG: tem de sair como PNG.
  const disfarcado = `data:image/jpeg;base64,${PNG.toString('base64')}`;
  const r = await chamar(corpo([disfarcado]));
  const d = await r.json();
  check(d.ok === true, 'a análise corre', JSON.stringify(d).slice(0, 120));
  check(
    String(pedidoIA?.imagens?.[0] || '').startsWith('data:image/png;base64,'),
    'cabeçalho dizia image/jpeg, os bytes são PNG -> vai como PNG',
    String(pedidoIA?.imagens?.[0] || '').slice(0, 40),
  );
}

console.log('\n[9] Arquivos sem identificador: 400 que diz quantos chegaram');
{
  const r = await chamar({ arquivos: [{ nome: 'x' }, {}], meta: {} });
  const d = await r.json();
  check(r.status === 400, `responde 400 (${r.status})`, String(r.status));
  check(/chegaram 2/i.test(String(d.error)), `diz quantos ficheiros chegaram ("${String(d.error).slice(0, 70)}…")`, String(d.error));
  check(d.debug && d.debug.recebidos === 2, 'leva o número no debug', JSON.stringify(d.debug));
}

// ---- helpers para os testes da chamada à DeepSeek ----
const carregarDeepseek = async () => {
  const fonte = readFileSync(join(raiz, 'shared', 'deepseek.ts'), 'utf8').replace(
    /^import \{ secrets \} from 'base44:runtime';$/m,
    'const secrets = globalThis.__secrets;',
  );
  const temp = join(tmpdir(), `deepseek-${Date.now()}-${Math.random().toString(16).slice(2)}.mjs`);
  writeFileSync(temp, fonte, 'utf8');
  globalThis.__secrets = { get: () => 'sk-teste' };
  return import(`file://${temp.replace(/\\/g, '/')}`);
};

const respostaCom = (conteudo, finish = 'stop') => ({
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ finish_reason: finish, message: { content: conteudo } }] }),
  text: async () => '',
});

console.log('\n[10] JSON com texto à volta e cercas ainda é lido');
{
  const mod = await carregarDeepseek();
  const r = await mod.pedirJSON({
    texto: 'devolve JSON',
    buscar: async () => respostaCom('Aqui está:\n```json\n{"a":1,"b":{"c":[1,2]}}\n```\nEspero que ajude.'),
  });
  check(r.ok === true, 'terminou bem', JSON.stringify(r).slice(0, 100));
  check(r.dados?.a === 1 && r.dados?.b?.c?.[1] === 2, 'leu o objeto no meio do texto', JSON.stringify(r.dados));
}

console.log('\n[11] Resposta que não é JSON: repete, e a segunda vale');
{
  const mod = await carregarDeepseek();
  let chamadas = 0;
  const r = await mod.pedirJSON({
    texto: 'devolve JSON',
    buscar: async () => {
      chamadas += 1;
      return chamadas === 1
        ? respostaCom('Desculpe, não consigo analisar estas imagens.')
        : respostaCom('{"enquadramento":"ok"}');
    },
  });
  check(r.ok === true, 'terminou bem à segunda', JSON.stringify(r).slice(0, 110));
  check(chamadas === 2, `fez 2 chamadas (${chamadas})`, String(chamadas));
  check(r.dados?.enquadramento === 'ok', 'usou a segunda resposta', JSON.stringify(r.dados));
}

console.log('\n[12] JSON cortado pelo limite de tokens: repete com mais orçamento');
{
  const mod = await carregarDeepseek();
  const corpos = [];
  const r = await mod.pedirJSON({
    texto: 'devolve JSON',
    buscar: async (_u, opcoes) => {
      corpos.push(JSON.parse(opcoes.body));
      return corpos.length === 1
        ? respostaCom('{"enquadramento":"A cena está", "composicao":"', 'length')
        : respostaCom('{"enquadramento":"ok","composicao":"ok"}');
    },
  });
  check(r.ok === true, 'terminou bem à segunda', JSON.stringify(r).slice(0, 110));
  check(corpos.length === 2, `2 chamadas (${corpos.length})`, String(corpos.length));
  check(
    (corpos[1]?.max_tokens || 0) > (corpos[0]?.max_tokens || 0),
    `o segundo pedido tem mais tokens (${corpos[0]?.max_tokens} -> ${corpos[1]?.max_tokens})`,
    JSON.stringify(corpos.map((c) => c.max_tokens)),
  );
}

console.log(falhas.length ? `\n=== ${falhas.length} FALHA(S) ===` : '\n=== DIRETOR: IMAGENS EM BASE64 OK ===');
process.exit(falhas.length ? 1 : 0);
