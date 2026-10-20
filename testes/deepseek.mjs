// Testes da chamada à DeepSeek (base44/shared/deepseek.ts).
//
// Regra do projeto: NENHUMA função da app usa `integrations.Core.InvokeLLM` —
// isso gasta créditos de integrações da Base44. Tudo passa por este módulo, com
// o segredo DEEPSEEK_API_KEY da app. Os testes abaixo provam o comportamento e
// a regra (a última secção lê os ficheiros das funções e falha se voltar a
// aparecer um InvokeLLM).
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const raiz = 'E:/youtube rebeca2/rebeca-hub-3.0-base44/base44/';

const falhas = [];
const ok = (m) => console.log('  ok:', m);
const fail = (m) => { console.error('  FALHOU:', m); falhas.push(m); };
const check = (c, bom, mau) => (c ? ok(bom) : fail(mau));

// O módulo importa `base44:runtime` (só existe dentro da Base44). Aqui troca-se
// por um `secrets` falso, como os outros testes fazem com o cliente da app.
const fonte = readFileSync(join(raiz, 'shared', 'deepseek.ts'), 'utf8');
const preparado = fonte.replace(
  /^import \{ secrets \} from 'base44:runtime';$/m,
  'const secrets = globalThis.__secrets;',
);
const temp = join(tmpdir(), `deepseek-teste-${Date.now()}.mjs`);
writeFileSync(temp, preparado, 'utf8');

// Os segredos falsos têm de existir ANTES de o módulo ser importado (ele lê o
// `secrets` uma vez, no arranque).
const guardado = {};
globalThis.__secrets = { get: (k) => guardado[k] || '' };

const mod = await import(`file://${temp.replace(/\\/g, '/')}`);

const respostaJSON = (obj) => ({
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ message: { content: typeof obj === 'string' ? obj : JSON.stringify(obj) } }] }),
  text: async () => '',
});

console.log('\n[1] Sem a chave configurada: explica e NÃO chama nada');
{
  delete guardado.DEEPSEEK_API_KEY;
  let chamou = 0;
  const r = await mod.pedirJSON({ texto: 'olá', buscar: async () => { chamou += 1; return respostaJSON({}); } });
  check(r.ok === false, 'falha em vez de fingir que funcionou', JSON.stringify(r));
  check(/DEEPSEEK_API_KEY/.test(r.erro), `diz o nome do segredo ("${r.erro.slice(0, 70)}…")`, r.erro);
  check(/crédito/i.test(r.erro), 'diz que não usa créditos da Base44', r.erro);
  check(chamou === 0, 'não chegou a chamar o serviço', String(chamou));
}

console.log('\n[2] Resposta normal: devolve o JSON (mesmo com cercas ```)');
{
  guardado.DEEPSEEK_API_KEY = 'sk-teste';
  let corpoPedido = null;
  const r = await mod.pedirJSON({
    texto: 'devolve o tema',
    buscar: async (url, opcoes) => {
      corpoPedido = { url, opcoes, corpo: JSON.parse(opcoes.body) };
      return respostaJSON('```json\n{"tema":"borboletas","sugestoes":[{"tema":"jardim"}]}\n```');
    },
  });
  check(r.ok === true, 'terminou bem', JSON.stringify(r).slice(0, 120));
  check(r.dados?.tema === 'borboletas', `leu o campo ("${r.dados?.tema}")`, JSON.stringify(r.dados));
  check(r.dados?.sugestoes?.length === 1, 'leu a lista', JSON.stringify(r.dados?.sugestoes));
  check(/api\.deepseek\.com\/chat\/completions$/.test(corpoPedido.url), `pede ao endpoint certo (${corpoPedido.url})`, corpoPedido.url);
  check(/^Bearer sk-teste$/.test(corpoPedido.opcoes.headers.Authorization), 'envia a chave da app no cabeçalho', corpoPedido.opcoes.headers.Authorization);
  check(corpoPedido.corpo.response_format?.type === 'json_object', 'pede JSON ao serviço', JSON.stringify(corpoPedido.corpo.response_format));
  check(corpoPedido.corpo.model === 'deepseek-chat', `só texto usa o modelo de texto (${corpoPedido.corpo.model})`, corpoPedido.corpo.model);
}

console.log('\n[3] Com imagens: usa o modelo com visão e envia as imagens');
{
  guardado.DEEPSEEK_API_KEY = 'sk-teste';
  let corpo = null;
  const r = await mod.pedirJSON({
    texto: 'olha para estas cenas',
    imagens: ['https://x/1.jpg', 'https://x/2.jpg'],
    buscar: async (_u, o) => {
      corpo = JSON.parse(o.body);
      return respostaJSON({ composicao: 'ok' });
    },
  });
  check(r.ok === true, 'correu bem', JSON.stringify(r).slice(0, 100));
  check(corpo.model === 'deepseek-flash', `usa o modelo com visão (${corpo.model})`, corpo.model);
  const conteudo = corpo.messages[corpo.messages.length - 1].content;
  const imagens = conteudo.filter((c) => c.type === 'image_url');
  check(imagens.length === 2, `enviou as 2 imagens (${imagens.length})`, String(imagens.length));
  check(imagens[0].image_url.url === 'https://x/1.jpg', 'com os endereços certos', imagens[0]?.image_url?.url);
  check(imagens[0].image_url.detail === 'low', 'em modo "low" (barato e suficiente)', imagens[0]?.image_url?.detail);
}

console.log('\n[4] Chave recusada (401): mensagem accionável');
{
  guardado.DEEPSEEK_API_KEY = 'sk-má';
  const r = await mod.pedirJSON({
    texto: 'x',
    buscar: async () => ({ ok: false, status: 401, text: async () => '{"error":"invalid api key"}', json: async () => ({}) }),
  });
  check(r.ok === false && r.status === 401, 'devolve o estado 401', JSON.stringify(r));
  check(/recusada/i.test(r.erro) && /DEEPSEEK_API_KEY/.test(r.erro), `diz o que fazer ("${r.erro.slice(0, 60)}…")`, r.erro);
}

console.log('\n[5] 429: tenta uma vez mais e consegue');
{
  guardado.DEEPSEEK_API_KEY = 'sk-teste';
  let tentativas = 0;
  const r = await mod.pedirJSON({
    texto: 'x',
    buscar: async () => {
      tentativas += 1;
      if (tentativas === 1) return { ok: false, status: 429, text: async () => 'rate limit', json: async () => ({}) };
      return respostaJSON({ tema: 'ok' });
    },
  });
  check(r.ok === true && r.dados.tema === 'ok', 'ao 2.º pedido lá vai', JSON.stringify(r).slice(0, 80));
  check(tentativas === 2, `tentou 2 vezes (${tentativas})`, String(tentativas));
}

console.log('\n[6] 429 sempre: desiste com explicação');
{
  guardado.DEEPSEEK_API_KEY = 'sk-teste';
  let tentativas = 0;
  const r = await mod.pedirJSON({
    texto: 'x',
    buscar: async () => {
      tentativas += 1;
      return { ok: false, status: 429, text: async () => 'rate limit', json: async () => ({}) };
    },
  });
  check(r.ok === false, 'devolve erro', JSON.stringify(r).slice(0, 80));
  check(/Demasiados pedidos/i.test(r.erro), `explica o limite ("${r.erro.slice(0, 50)}…")`, r.erro);
  check(tentativas === 2, `tentou 2 vezes antes de desistir (${tentativas})`, String(tentativas));
}

console.log('\n[7] Resposta que não é JSON não passa por boa');
{
  guardado.DEEPSEEK_API_KEY = 'sk-teste';
  const r = await mod.pedirJSON({ texto: 'x', buscar: async () => respostaJSON('Desculpe, não posso ajudar.') });
  check(r.ok === false, 'dá erro em vez de devolver lixo', JSON.stringify(r).slice(0, 80));
  check(/formato|JSON/i.test(r.erro), `diz porquê ("${r.erro.slice(0, 60)}…")`, r.erro);
}

console.log('\n[8] Nenhuma função usa os créditos de integrações da Base44');
{
  const problemas = [];
  const percorrer = (pasta) => {
    for (const nome of readdirSync(pasta)) {
      const caminho = join(pasta, nome);
      if (statSync(caminho).isDirectory()) {
        percorrer(caminho);
        continue;
      }
      if (!nome.endsWith('.ts')) continue;
      const texto = readFileSync(caminho, 'utf8');
      // Ignora comentários: a regra é sobre chamadas, não sobre menções.
      const codigo = texto
        .split('\n')
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .join('\n');
      if (/integrations\.Core\.InvokeLLM/.test(codigo)) problemas.push(nome);
    }
  };
  percorrer(join(raiz, 'functions'));
  check(problemas.length === 0, 'nenhuma função chama InvokeLLM', `ainda chamam: ${problemas.join(', ')}`);

  const prompts = readFileSync(join(raiz, 'functions', 'gerarPrompts', 'entry.ts'), 'utf8');
  check(/pedirJSON/.test(prompts), 'gerarPrompts usa a DeepSeek', 'não usa');
  const temas = readFileSync(join(raiz, 'functions', 'sugerirTemas', 'entry.ts'), 'utf8');
  check(/pedirJSON/.test(temas), 'sugerirTemas usa a DeepSeek', 'não usa');
  const diretor = readFileSync(join(raiz, 'functions', 'analisarProducao', 'entry.ts'), 'utf8');
  check(/pedirJSON/.test(diretor), 'a análise do Diretor usa a DeepSeek (com visão)', 'não usa');
  check(/ao da app|DEEPSEEK_API_KEY|pedirJSON/.test(diretor), 'e não os créditos da Base44', 'fala de créditos');
}

console.log(falhas.length ? `\n=== ${falhas.length} FALHA(S) ===` : '\n=== DEEPSEEK OK ===');
process.exit(falhas.length ? 1 : 0);
