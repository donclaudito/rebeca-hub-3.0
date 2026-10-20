// ============================================================
//  Chamadas ao modelo da DeepSeek com a CHAVE DA APP
//
//  REGRA DO PROJETO: nenhuma função desta app usa
//  `integrations.Core.InvokeLLM` — isso gasta os créditos de integrações da
//  Base44. Tudo o que é IA passa por aqui, com o segredo `DEEPSEEK_API_KEY`
//  configurado na app (Configurações → Segredos).
//
//  Serve para os três casos que existem:
//    · só texto (prompts, temas)      → modelo de texto, mais barato;
//    · texto + imagens (Diretor)      → modelo com visão;
//    · resposta em JSON               → `response_format: json_object`.
//
//  Nada aqui depende de um browser: é uma chamada HTTP simples, compatível com
//  a API da OpenAI, por isso pode ser testada com um fetch falso.
// ============================================================
import { secrets } from 'base44:runtime';

export const DEEPSEEK = {
  url: 'https://api.deepseek.com',
  // `deepseek-flash` aceita imagens; `deepseek-chat` é o de texto.
  modeloVisao: 'deepseek-flash',
  modeloTexto: 'deepseek-chat',
  segredo: 'DEEPSEEK_API_KEY',
};

// A chave vem dos segredos da app (nunca do código nem do browser).
export function chaveDeepSeek() {
  try {
    return String(secrets.get(DEEPSEEK.segredo) || '').trim();
  } catch {
    return '';
  }
}

// Traduz as recusas conhecidas do serviço para algo accionável em português.
export function explicarErroDeepSeek(status, detalhe) {
  const d = String(detalhe || '');
  if (/no credits remaining|insufficient_quota|insufficient balance|exceeded your current quota/i.test(d)) {
    return 'A conta da DeepSeek está SEM SALDO. Carregue créditos em platform.deepseek.com (a chave é a mesma da app).';
  }
  if (status === 401 || status === 403 || /invalid api key|unauthorized|authentication fails/i.test(d)) {
    return `A chave da DeepSeek foi recusada. Confirme o segredo ${DEEPSEEK.segredo} nas Configurações da app.`;
  }
  if (status === 429 || /rate limit|resource.?exhausted/i.test(d)) {
    return 'Demasiados pedidos à DeepSeek em pouco tempo. Espere um pouco e tente outra vez.';
  }
  if (status === 503 || /high demand|unavailable|overloaded/i.test(d)) {
    return 'A DeepSeek está sobrecarregada agora. Espere um minuto e tente de novo.';
  }
  if (status === 404 || /model.*(not found|does not exist)|unknown model/i.test(d)) {
    return 'O modelo pedido não existe na DeepSeek. Confirme o nome do modelo.';
  }
  if (/does not support image|image.*not supported/i.test(d)) {
    return 'Este modelo da DeepSeek não consegue ver imagens. Use um modelo com visão.';
  }
  return d.slice(0, 300) || `a DeepSeek respondeu ${status}`;
}

// Tira as cercas ```json que alguns modelos põem à volta do JSON.
function limparJson(texto) {
  let t = String(texto || '').trim();
  if (t.startsWith('```')) t = t.replace(/^```[a-zA-Z]*\s*/, '').replace(/```\s*$/, '').trim();
  // Se vier texto antes/depois, corta pelo primeiro { e pelo último }.
  const i = t.indexOf('{');
  const f = t.lastIndexOf('}');
  if (i > 0 || (f >= 0 && f < t.length - 1)) {
    if (i >= 0 && f > i) t = t.slice(i, f + 1);
  }
  return t;
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// Uma chamada ao modelo. `imagens` são URLs (assinados) ou data URLs.
//
// `chave` e `buscar` existem para os testes poderem correr sem a nuvem; em
// produção não se passam (a chave vem dos segredos da app, o fetch é o normal).
//
// Devolve sempre um objeto — nunca lança:
//   { ok: true, dados, texto, modelo, ms }
//   { ok: false, erro, status }
export async function pedirJSON({
  texto = '',
  imagens = [],
  sistema = '',
  modelo = '',
  temperatura = 0.4,
  timeout = 60_000,
  chave = '',
  buscar = null,
} = {}) {
  const k = String(chave || chaveDeepSeek()).trim();
  const pedir = typeof buscar === 'function' ? buscar : fetch;
  if (!k) {
    return {
      ok: false,
      status: 400,
      erro:
        `Falta o segredo ${DEEPSEEK.segredo} na app. Configurações → Segredos → ${DEEPSEEK.segredo} = sk_... ` +
        'Nenhum crédito de integrações da Base44 é usado por esta app.',
    };
  }
  const instrucao = [String(texto || '').trim(), '', 'Responda SOMENTE com um objeto JSON válido, sem texto em volta.']
    .filter(Boolean)
    .join('\n');
  const conteudo = [{ type: 'text', text: instrucao }];
  for (const url of (Array.isArray(imagens) ? imagens : []).slice(0, 12)) {
    if (typeof url === 'string' && url && url.length < 4000) {
      conteudo.push({ type: 'image_url', image_url: { url, detail: 'low' } });
    }
  }
  const mensagens = [];
  if (sistema) mensagens.push({ role: 'system', content: String(sistema) });
  mensagens.push({ role: 'user', content: conteudo });

  const escolhido = String(modelo || (imagens.length ? DEEPSEEK.modeloVisao : DEEPSEEK.modeloTexto)).trim();
  const inicio = Date.now();

  for (let tentativa = 0; tentativa < 2; tentativa += 1) {
    let resposta;
    try {
      resposta = await pedir(`${DEEPSEEK.url}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${k}` },
        body: JSON.stringify({
          model: escolhido,
          messages: mensagens,
          temperature: temperatura,
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(timeout),
      });
    } catch (e) {
      const nome = e?.name || '';
      if (nome === 'TimeoutError' || nome === 'AbortError') {
        return {
          ok: false,
          status: 504,
          erro: 'A DeepSeek demorou demasiado a responder. Tente outra vez com menos imagens.',
        };
      }
      return { ok: false, status: 502, erro: `Não consegui falar com a DeepSeek: ${e?.message || e}` };
    }

    if (!resposta.ok) {
      const detalhe = await resposta.text().catch(() => '');
      // 429/503 passam em segundos: repete UMA vez antes de desistir.
      if ((resposta.status === 429 || resposta.status === 503) && tentativa === 0) {
        await espera(1500);
        continue;
      }
      console.error('deepseek falhou', resposta.status, detalhe.slice(0, 300));
      return { ok: false, status: resposta.status, erro: explicarErroDeepSeek(resposta.status, detalhe) };
    }

    const corpo = await resposta.json().catch(() => ({}));
    const textoResposta = corpo?.choices?.[0]?.message?.content;
    if (!textoResposta) {
      return { ok: false, status: 502, erro: 'A DeepSeek respondeu sem conteúdo. Tente outra vez.' };
    }
    let dados;
    try {
      dados = JSON.parse(limparJson(textoResposta));
    } catch {
      return {
        ok: false,
        status: 502,
        erro: 'A DeepSeek respondeu num formato que não consegui ler (não era JSON). Tente outra vez.',
      };
    }
    if (!dados || typeof dados !== 'object') {
      return { ok: false, status: 502, erro: 'A DeepSeek devolveu uma resposta vazia.' };
    }
    return { ok: true, dados, texto: textoResposta, modelo: escolhido, ms: Date.now() - inicio };
  }
  return { ok: false, status: 502, erro: 'A DeepSeek não respondeu depois de duas tentativas.' };
}
