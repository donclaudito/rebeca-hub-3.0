// ============================================================
//  generateNarration — função de nuvem do Rebeca Hub 3.0
//
//  Recebe as imagens e devolve a narração de cada uma, pedida a um modelo
//  com visão. É esta função que guarda a chave da API (como segredo da app),
//  por isso o seu computador deixa de precisar de estar ligado — e a chave
//  nunca chega ao browser.
//
//  A chave declara-se nas Configurações da app na Base44, com o nome:
//      DEEPSEEK_API_KEY
//  (ou OPENAI_API_KEY / GROQ_API_KEY / GEMINI_API_KEY, conforme o serviço)
// ============================================================
import { secrets } from 'base44:runtime';

// Serviço de visão. A DeepSeek é a predefinida porque tem o modelo `deepseek-flash`,
// que aceita imagens e é barato. Qualquer serviço compatível com a OpenAI serve.
const SERVICOS = {
  deepseek: { url: 'https://api.deepseek.com', modelo: 'deepseek-flash', segredo: 'DEEPSEEK_API_KEY' },
  openai: { url: 'https://api.openai.com/v1', modelo: 'gpt-4o-mini', segredo: 'OPENAI_API_KEY' },
  groq: { url: 'https://api.groq.com/openai/v1', modelo: 'meta-llama/llama-4-scout-17b-16e-instruct', segredo: 'GROQ_API_KEY' },
  gemini: {
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    modelo: 'gemini-2.5-flash',
    segredo: 'GEMINI_API_KEY',
  },
};

const MAX_IMAGENS = 40;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024; // 20 MB de imagens por pedido

const json = (corpo, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

// O prompt: é aqui que a narração nasce das imagens.
function construirPrompt({ quantas, tom, extra, minimo, maximo, idioma }) {
  return [
    `Você é narrador de histórias infantis. Receberá ${quantas} imagem(ns) NA ORDEM em que aparecem no vídeo.`,
    `Sua tarefa: OLHAR as imagens e escrever a narração de cada uma, em ${idioma}.`,
    '',
    'REGRAS:',
    `1. Escreva exatamente ${quantas} narração(ões), uma por imagem, na mesma ordem.`,
    `2. Cada narração deve ter entre ${minimo} e ${maximo} palavras — curta, para ser lida em voz alta.`,
    '3. Descreva o que REALMENTE aparece na imagem: personagens, ações, objetos, cores e o que muda de uma para a outra.',
    '4. A narração deve formar UMA história contínua: a imagem 1 apresenta, as do meio desenvolvem e a última conclui.',
    '5. Linguagem simples, frases curtas, presente do indicativo. Sem emojis, sem markdown, sem numeração no texto.',
    '6. Não invente elementos que não aparecem nas imagens nem contradiga o que elas mostram.',
    tom ? `7. Tom: ${tom}.` : '',
    extra ? `8. Orientação extra do autor (respeite sempre): ${extra}` : '',
    '',
    'Devolva SOMENTE um objeto JSON válido, sem texto em volta, neste formato exato:',
    '{"titulo":"título curto do vídeo","narracoes":[{"indice":1,"texto":"narração da imagem 1"}]}',
  ]
    .filter(Boolean)
    .join('\n');
}

// Traduz as recusas conhecidas dos serviços para algo accionável.
function explicarErro(status, detalhe) {
  const d = String(detalhe || '');
  if (/no credits remaining|insufficient_quota|insufficient balance|exceeded your current quota/i.test(d)) {
    return 'A conta deste serviço está SEM SALDO. Carregue créditos no painel do serviço, ou mude de serviço nas Configurações da app.';
  }
  if (status === 401 || status === 403 || /invalid api key|unauthorized|authentication fails/i.test(d)) {
    return 'A chave da API foi recusada. Confirme o segredo nas Configurações da app (nomes: DEEPSEEK_API_KEY, OPENAI_API_KEY, GROQ_API_KEY, GEMINI_API_KEY).';
  }
  if (status === 429 || /rate limit/i.test(d)) return 'Demasiados pedidos em pouco tempo. Espere um pouco e tente outra vez.';
  if (status === 404 || /model.*(not found|does not exist)|unknown model/i.test(d)) {
    return 'O modelo indicado não existe neste serviço. Confirme o nome do modelo nas Configurações da app.';
  }
  if (/does not support image|image.*not supported/i.test(d)) return 'Este modelo não consegue ver imagens. Escolha um modelo com visão.';
  return d.slice(0, 300) || `o serviço respondeu ${status}`;
}

export default async function (req) {
  try {
    if (req.method !== 'POST') return json({ ok: false, error: 'Use POST.' }, 405);

    // ---- ler as imagens e as opções ----
    // A FUNÇÃO ACEITA TRÊS FORMATOS, porque o SDK da Base44 escolhe entre eles
    // conforme o conteúdo:
    //   - multipart/form-data, quando há ficheiros File (o SDK converte sozinho);
    //   - JSON com { imagens: [...] };
    //   - JSON com { data: { imagens: [...] } } (o SDK pode embrulhar o payload).
    // Ler só um deles foi um defeito real: a função respondia 400 "Nenhuma
    // imagem recebida" quando o formato não era o esperado.
    let imagens = [];
    let campos = {};
    const tipo = req.headers.get('content-type') || '';

    if (tipo.includes('multipart/form-data')) {
      const form = await req.formData();
      for (const [chave, valor] of form.entries()) {
        if (valor && typeof valor === 'object' && typeof valor.arrayBuffer === 'function') {
          imagens.push({ nome: valor.name || `imagem-${imagens.length + 1}`, ficheiro: valor });
        } else {
          campos[chave] = String(valor);
        }
      }
    } else {
      const bruto = await req.json().catch(() => ({}));
      // Desembrulha camadas: { data: {...} }, { body: {...} } ou o próprio objeto.
      const corpo =
        bruto && typeof bruto === 'object' && !Array.isArray(bruto) && bruto.data && typeof bruto.data === 'object'
          ? { ...bruto, ...bruto.data }
          : bruto && typeof bruto === 'object' && !Array.isArray(bruto) && bruto.body && typeof bruto.body === 'object'
            ? { ...bruto, ...bruto.body }
            : bruto || {};

      campos = corpo;
      // As imagens podem vir como lista direta, ou dentro de `imagens`/`images`.
      const lista = Array.isArray(corpo) ? corpo : corpo.imagens || corpo.images || [];
      imagens = (Array.isArray(lista) ? lista : []).map((i, n) => ({
        nome: i?.nome || i?.name || `imagem-${n + 1}`,
        dataUrl: i?.dataUrl || i?.data_url || i?.url || (typeof i === 'string' ? i : ''),
      }));
      // Uma imagem sem data URL não serve: descarta-se em vez de rebentar depois.
      imagens = imagens.filter((i) => typeof i.dataUrl === 'string' && i.dataUrl.startsWith('data:'));
    }

    if (!imagens.length) {
      // Diagnóstico útil em vez de uma mensagem seca: diz o que chegou.
      const recebido = tipo.includes('multipart') ? 'multipart sem ficheiros' : `JSON com as chaves: ${Object.keys(campos).join(', ') || '(nenhuma)'}`;
      return json(
        {
          ok: false,
          error:
            'Nenhuma imagem recebida. A função aceita imagens em multipart (ficheiros) ou em JSON, ' +
            'no campo "imagens" como lista de { nome, dataUrl }. ' +
            `Recebi: ${recebido}.`,
        },
        400,
      );
    }
    if (imagens.length > MAX_IMAGENS) {
      return json({ ok: false, error: `Máximo de ${MAX_IMAGENS} imagens por geração (recebi ${imagens.length}).` }, 400);
    }

    // ---- escolher o serviço e a chave ----
    const nomeServico = String(campos.servico || 'deepseek').toLowerCase();
    const servico = SERVICOS[nomeServico] || SERVICOS.deepseek;
    const chave = secrets.get(servico.segredo) || secrets.get('VISION_API_KEY');
    if (!chave) {
      return json(
        {
          ok: false,
          error:
            `Falta o segredo ${servico.segredo} nas Configurações da app. ` +
            'Sem ele a narração não pode ser gerada (é o que mantém a sua chave fora do browser).',
        },
        400,
      );
    }

    // ---- montar o pedido ao modelo ----
    const conteudo = [];
    conteudo.push({
      type: 'text',
      text: construirPrompt({
        quantas: imagens.length,
        tom: campos.tom || '',
        extra: campos.extra || '',
        minimo: Math.max(4, Number(campos.minWords) || 12),
        maximo: Math.max(6, Number(campos.maxWords) || 30),
        idioma: campos.idioma || 'português do Brasil',
      }),
    });

    let total = 0;
    for (const [i, img] of imagens.entries()) {
      let dataUrl = img.dataUrl;
      if (!dataUrl) {
        const bytes = new Uint8Array(await img.ficheiro.arrayBuffer());
        total += bytes.length;
        if (total > MAX_TOTAL_BYTES) {
          return json({ ok: false, error: 'As imagens somam demasiado. Gere em duas vezes, com menos imagens.' }, 400);
        }
        const mime = img.ficheiro.type || 'image/jpeg';
        // btoa sobre binário: converte em blocos para não estourar a pilha.
        let binario = '';
        for (let p = 0; p < bytes.length; p += 0x8000) {
          binario += String.fromCharCode.apply(null, bytes.subarray(p, p + 0x8000));
        }
        dataUrl = `data:${mime};base64,${btoa(binario)}`;
      }
      conteudo.push({ type: 'text', text: `Imagem ${i + 1}:` });
      // `detail: low` chega para descrever a cena e custa muito menos.
      conteudo.push({ type: 'image_url', image_url: { url: dataUrl, detail: 'low' } });
    }

    const inicio = Date.now();
    const resposta = await fetch(`${servico.url.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chave}` },
      body: JSON.stringify({
        model: campos.modelo || servico.modelo,
        messages: [{ role: 'user', content: conteudo }],
        temperature: 0.8,
        response_format: { type: 'json_object' },
      }),
    });

    const texto = await resposta.text();
    if (!resposta.ok) {
      let detalhe = texto.slice(0, 400);
      try {
        detalhe = JSON.parse(texto)?.error?.message || detalhe;
      } catch {
        /* texto cru */
      }
      return json({ ok: false, error: explicarErro(resposta.status, detalhe), detalhe: String(detalhe).slice(0, 200) }, 502);
    }

    // ---- ler a resposta ----
    let pacote = null;
    try {
      pacote = JSON.parse(texto);
    } catch {
      return json({ ok: false, error: 'Resposta ilegível do serviço.' }, 502);
    }
    const bruto = pacote?.choices?.[0]?.message?.content ?? '';
    let obj = null;
    try {
      obj = typeof bruto === 'string' ? JSON.parse(bruto) : bruto;
    } catch {
      const limpo = String(bruto).replace(/```json/gi, '').replace(/```/g, '').trim();
      try {
        obj = JSON.parse(limpo);
      } catch {
        return json({ ok: false, error: 'O modelo não devolveu JSON válido.', bruto: String(bruto).slice(0, 300) }, 502);
      }
    }

    const lista = Array.isArray(obj?.narracoes) ? obj.narracoes : Array.isArray(obj?.narrations) ? obj.narrations : [];
    if (!lista.length) return json({ ok: false, error: 'O modelo não devolveu narrações.', bruto: String(bruto).slice(0, 300) }, 502);

    const cenas = imagens.map((img, i) => {
      const achado = lista[i] || lista.find((x) => Number(x?.indice ?? x?.index) === i + 1);
      return {
        filename: img.nome,
        index: i + 1,
        texto: String(achado?.texto ?? achado?.text ?? achado?.narration ?? '').trim(),
      };
    });

    return json({
      ok: true,
      titulo: obj?.titulo || obj?.title || '',
      scenes: cenas,
      modelo: campos.modelo || servico.modelo,
      servico: nomeServico,
      ms: Date.now() - inicio,
    });
  } catch (erro) {
    console.error('generateNarration falhou', erro);
    return json({ ok: false, error: erro?.message || 'erro inesperado' }, 500);
  }
}
