// ============================================================
//  sugerirTemas — função de nuvem do Rebeca Hub 3.0
//
//  Recebe palavras-chave e/ou o link de um vídeo do YouTube e
//  devolve sugestões de TEMAS para vídeos infantis (0–12 anos),
//  ordenadas do potencial estimado mais alto ao mais baixo.
//  As notas são estimativas da IA — nunca métricas reais do
//  YouTube (não há YouTube Data API nem busca na internet aqui).
// ============================================================
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

const json = (corpo, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

// Extrai o id de um link do YouTube (watch?v=, youtu.be/, shorts/, embed/, live/).
function extrairYoutube(link) {
  const m = String(link || '').match(
    /(?:youtube\.com\/(?:watch\?(?:[a-z=&_-]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{6,20})/i,
  );
  return m ? m[1] : '';
}

const MAX_SUGESTOES = 12;

export default async function (req) {
  try {
    if (req.method !== 'POST') return json({ ok: false, error: 'Use POST.' }, 405);

    // Desembrulha o payload (o SDK pode mandar { data: {...} }).
    const bruto = await req.json().catch(() => ({}));
    const corpo =
      bruto && typeof bruto === 'object' && !Array.isArray(bruto) && bruto.data && typeof bruto.data === 'object'
        ? { ...bruto, ...bruto.data }
        : bruto || {};

    // Entrada limitada: nada de texto gigante ou campos estranhos passando adiante.
    const palavras = String(corpo.palavrasChave || '').trim().slice(0, 300);
    const link = String(corpo.link || '').trim().slice(0, 500);
    if (!palavras && !link) {
      return json({ ok: false, error: 'Informe palavras-chave ou o link de um vídeo do YouTube.' }, 400);
    }
    const videoId = link ? extrairYoutube(link) : '';
    if (link && !videoId) {
      return json({ ok: false, error: 'Esse link não parece ser de um vídeo do YouTube.' }, 400);
    }

    const base44 = createClientFromRequest(req);

    // Com link, a IA pesquisa na internet o vídeo e similares (Gemini com busca).
    const comLink = Boolean(videoId);
    const prompt = [
      'Você é um pesquisador de temas para vídeos INFANTIS no YouTube (público de 0 a 12 anos; conteúdo sempre seguro e apropriado para crianças).',
      palavras ? `Palavras-chave do usuário: "${palavras}".` : '',
      videoId
        ? `Vídeo de referência informado pelo usuário: https://www.youtube.com/watch?v=${videoId} (id ${videoId}).`
        : '',
      comLink
        ? 'COM O LINK: pesquise na internet ESSE vídeo (título real, canal, tema) e VÍDEOS SIMILARES de sucesso no YouTube para o mesmo público infantil. Analise o que faz esses vídeos funcionarem (formato, tema, tom) e use isso para fundamentar as sugestões. Em "videoInfo" devolva o que CONFIRMOU sobre o vídeo (titulo e canal reais; em "observacao", uma linha com o que aprendeu; se não encontrou o vídeo, diga isso — NUNCA invente título, canal ou números de visualização). Em "videosSimilares" liste de 3 a 5 vídeos infantis similares de sucesso que encontrou (titulo, canal, url — URL real do YouTube; se não achou, devolva a lista vazia). NUNCA afirme ter assistido aos vídeos.'
        : 'Sem link: baseie-se no seu conhecimento sobre conteúdo infantil de sucesso no YouTube. NUNCA afirme ter acessado a internet.',
      '',
      'Tarefa: devolva de 8 a 10 sugestões de TEMAS de vídeos infantis RELACIONADOS, já ordenadas do potencial MAIS ALTO ao MAIS BAIXO —',
      'ou seja, primeiro os temas que você estima serem MAIS PROCURADOS por pais e crianças nesse público, depois os demais.',
      'Cada sugestão deve ter:',
      '- tema: o assunto do vídeo, curto;',
      '- tituloIdeia: um título pronto e chamativo em português do Brasil, apropriado para crianças;',
      '- justificativa: 1 a 2 frases explicando por que esse tema tem esse potencial para o público infantil;',
      '- potencial: nota de 1 a 10, sua estimativa de interesse/demanda (sem dados reais);',
      '- faixa: a faixa etária recomendada dentro de 0-12 (ex.: "4 a 8 anos").',
      '',
      'Também devolva "tema": uma linha resumindo o tema central pedido.',
      'Importante: as notas são ESTIMATIVAS suas, não métricas verificadas do YouTube. Nada de conteúdo assustador, violento ou impróprio.',
    ]
      .filter(Boolean)
      .join('\n');

    const inicio = Date.now();
    const resposta = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      // A busca na internet só vale a pena (e só é suportada) quando há link.
      ...(comLink ? { model: 'gemini_3_8_flash', add_context_from_internet: true } : {}),
      response_json_schema: {
        type: 'object',
        properties: {
          tema: { type: 'string' },
          videoInfo: {
            type: 'object',
            properties: {
              titulo: { type: 'string' },
              canal: { type: 'string' },
              observacao: { type: 'string' },
            },
          },
          videosSimilares: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                titulo: { type: 'string' },
                canal: { type: 'string' },
                url: { type: 'string' },
              },
              required: ['titulo', 'url'],
            },
          },
          sugestoes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                tema: { type: 'string' },
                tituloIdeia: { type: 'string' },
                justificativa: { type: 'string' },
                potencial: { type: 'integer' },
                faixa: { type: 'string' },
              },
              required: ['tema', 'tituloIdeia', 'justificativa', 'potencial', 'faixa'],
            },
          },
        },
        required: ['tema', 'sugestoes'],
      },
    });

    const limpas = (Array.isArray(resposta?.sugestoes) ? resposta.sugestoes : [])
      .slice(0, MAX_SUGESTOES)
      .map((s) => ({
        tema: String(s?.tema || '').trim().slice(0, 160),
        tituloIdeia: String(s?.tituloIdeia || '').trim().slice(0, 200),
        justificativa: String(s?.justificativa || '').trim().slice(0, 400),
        potencial: Math.max(1, Math.min(10, Math.round(Number(s?.potencial) || 5))),
        faixa: String(s?.faixa || '').trim().slice(0, 60),
      }))
      .filter((s) => s.tema);

    if (!limpas.length) {
      return json({ ok: false, error: 'A IA não devolveu sugestões. Tente outra vez.' }, 502);
    }

    return json({
      ok: true,
      tema: String(resposta?.tema || palavras || '').trim().slice(0, 160),
      videoInfo:
        resposta?.videoInfo && typeof resposta.videoInfo === 'object'
          ? {
              titulo: String(resposta.videoInfo.titulo || '').trim().slice(0, 200),
              canal: String(resposta.videoInfo.canal || '').trim().slice(0, 120),
              observacao: String(resposta.videoInfo.observacao || '').trim().slice(0, 300),
            }
          : null,
      videosSimilares: (Array.isArray(resposta?.videosSimilares) ? resposta.videosSimilares : [])
        .map((v) => ({
          titulo: String(v?.titulo || '').trim().slice(0, 200),
          canal: String(v?.canal || '').trim().slice(0, 120),
          url: /^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(String(v?.url || '')) ? String(v.url) : '',
        }))
        .filter((v) => v.titulo && v.url)
        .slice(0, 5),
      sugestoes: limpas,
      ms: Date.now() - inicio,
      aviso:
        'As notas são estimativas da IA sobre o interesse do público infantil — não são métricas reais de visualização do YouTube.',
    });
  } catch (erro) {
    console.error('sugerirTemas falhou', erro);
    return json({ ok: false, error: erro?.message || 'erro inesperado' }, 500);
  }
}