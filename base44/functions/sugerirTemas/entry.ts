// ============================================================
//  sugerirTemas — função de nuvem do Rebeca Hub 3.0
//
//  Recebe palavras-chave e/ou o link de um vídeo do YouTube e
//  devolve sugestões de TEMAS para vídeos infantis (0–12 anos),
//  ordenadas do potencial estimado mais alto ao mais baixo.
//  As notas de potencial são estimativas da IA. Quando há link e a chave
//  YOUTUBE_API_KEY está configurada, o vídeo de referência e os similares
//  vêm da API oficial do YouTube (dados reais); sem chave, a IA pesquisa
//  na internet (Gemini com busca).
// ============================================================
import { secrets } from 'base44:runtime';
import { pedirJSON } from '../../shared/deepseek.ts';

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

// ---------------------------------------------------------------- YouTube Data API
// Busca DADOS REAIS na API oficial: o vídeo de referência (título, canal,
// visualizações) e vídeos similares (busca pelo título do vídeo, ou pelas
// palavras-chave, com a contagem de visualizações de cada um).
// Qualquer falha devolve null — a app segue com o caminho antigo (IA + web).
async function buscarNoYoutube(videoId, palavras, chave) {
  try {
    const opcoes = { signal: AbortSignal.timeout(10000) };
    const url = (caminho, params) =>
      `https://www.googleapis.com/youtube/v3/${caminho}?${new URLSearchParams({ ...params, key: chave })}`;

    let videoRef = null;
    if (videoId) {
      const r = await fetch(url('videos', { part: 'snippet,statistics', id: videoId }), opcoes);
      if (!r.ok) return null;
      const d = await r.json();
      const v = d?.items?.[0];
      if (v) {
        videoRef = {
          id: videoId,
          titulo: String(v.snippet?.title || '').slice(0, 200),
          canal: String(v.snippet?.channelTitle || '').slice(0, 120),
          visualizacoes: Number(v.statistics?.viewCount) || 0,
        };
      }
    }

    const consulta = (videoRef?.titulo || palavras || '').trim();
    if (!consulta) return videoRef ? { videoRef, similares: [] } : null;

    // Duas buscas na API: "similares" (por relevância) e "mais vistos"
    // (ordenados pela API por visualizações). As visualizações reais de
    // ambas vêm de UM só videos.list com todos os ids juntos.
    const buscarLista = async (params) => {
      const r = await fetch(
        url('search', { part: 'snippet', type: 'video', relevanceLanguage: 'pt', ...params }),
        opcoes,
      );
      if (!r.ok) return [];
      const d = await r.json();
      return (d?.items || [])
        .map((i) => ({
          id: i.id?.videoId,
          titulo: String(i.snippet?.title || '').slice(0, 200),
          canal: String(i.snippet?.channelTitle || '').slice(0, 120),
        }))
        .filter((v) => v.id && v.id !== videoId && v.titulo);
    };
    const [similaresAchados, vistosAchados] = await Promise.all([
      buscarLista({ maxResults: '6', q: consulta.slice(0, 200) }),
      buscarLista({ maxResults: '8', order: 'viewCount', q: consulta.slice(0, 200) }),
    ]);

    const todos = [
      ...similaresAchados,
      ...vistosAchados.filter((v) => !similaresAchados.some((s) => s.id === v.id)),
    ];
    const ids = todos.map((v) => v.id).join(',');
    const statsPorId = {};
    if (ids) {
      const rStats = await fetch(url('videos', { part: 'statistics', id: ids }), opcoes);
      if (rStats.ok) {
        const dStats = await rStats.json();
        for (const v of dStats?.items || []) statsPorId[v.id] = Number(v.statistics?.viewCount) || 0;
      }
    }
    const comStats = (lista) => lista.map((v) => ({ ...v, visualizacoes: statsPorId[v.id] || 0 }));
    return {
      videoRef,
      similares: comStats(similaresAchados).slice(0, 5),
      maisVistos: comStats(vistosAchados).slice(0, 5),
    };
  } catch {
    return null;
  }
}

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

    const comLink = Boolean(videoId);

    // DADOS REAIS: com a chave da YouTube Data API, buscamos o vídeo de
    // referência (se houver link), os similares e os mais visualizados na
    // API oficial — valendo também para buscas só com palavras-chave.
    // Sem chave, ou em falha, a app segue com o caminho antigo (IA + web).
    const chaveYoutube = (secrets.get('YOUTUBE_API_KEY') || '').trim();
    const dadosApi = chaveYoutube ? await buscarNoYoutube(videoId, palavras, chaveYoutube) : null;
    const fonteReal = Boolean(dadosApi?.videoRef) || (dadosApi?.similares?.length || 0) > 0;
    const linhaDados = [
      dadosApi?.videoRef
        ? `DADOS REAIS (API oficial do YouTube) do vídeo de referência: "${dadosApi.videoRef.titulo}" — canal "${dadosApi.videoRef.canal}" — ${dadosApi.videoRef.visualizacoes} visualizações.`
        : '',
      (dadosApi?.similares?.length || 0) > 0
        ? 'DADOS REAIS (API oficial do YouTube) de vídeos similares, com visualizações reais: ' +
          dadosApi.similares.map((v) => `"${v.titulo}" (canal "${v.canal}", ${v.visualizacoes} visualizações)`).join('; ')
        : '',
      (dadosApi?.maisVistos?.length || 0) > 0
        ? 'DADOS REAIS (API oficial do YouTube) dos vídeos MAIS VISUALIZADOS para essa busca, em ordem de visualizações: ' +
          dadosApi.maisVistos.map((v) => `"${v.titulo}" (canal "${v.canal}", ${v.visualizacoes} visualizações)`).join('; ')
        : '',
    ].filter(Boolean);

    const prompt = [
      'Você é um pesquisador de temas para vídeos INFANTIS no YouTube (público de 0 a 12 anos; conteúdo sempre seguro e apropriado para crianças).',
      palavras ? `Palavras-chave do usuário: "${palavras}".` : '',
      videoId
        ? `Vídeo de referência informado pelo usuário: https://www.youtube.com/watch?v=${videoId} (id ${videoId}).`
        : '',
      fonteReal
        ? comLink
          ? 'COM O LINK: você recebeu DADOS REAIS da API oficial do YouTube logo abaixo (o vídeo de referência, similares e os mais visualizados). Fundamente as sugestões e as justificativas NELES (o que os vídeos reais têm em comum: formato, tema, tom, escala de visualizações). NÃO invente nem corrija esses dados e NÃO precisa devolver "videoInfo" nem "videosSimilares" — a resposta final já leva os dados reais. NUNCA afirme ter assistido aos vídeos.'
          : 'Você recebeu DADOS REAIS da API oficial do YouTube logo abaixo: os vídeos MAIS VISUALIZADOS para as palavras-chave. Fundamente as sugestões e as justificativas NELES (o que esses vídeos têm em comum: formato, tema, tom, escala de visualizações). NÃO invente nem corrija esses dados. NUNCA afirme ter assistido aos vídeos.'
        : comLink
          ? 'COM O LINK: pesquise na internet ESSE vídeo (título real, canal, tema) e VÍDEOS SIMILARES de sucesso no YouTube para o mesmo público infantil. Analise o que faz esses vídeos funcionarem (formato, tema, tom) e use isso para fundamentar as sugestões. Em "videoInfo" devolva o que CONFIRMOU sobre o vídeo (titulo e canal reais; em "observacao", uma linha com o que aprendeu; se não encontrou o vídeo, diga isso — NUNCA invente título, canal ou números de visualização). Em "videosSimilares" liste de 3 a 5 vídeos infantis similares de sucesso que encontrou (titulo, canal, url — URL real do YouTube; faixa: a faixa etária infantil recomendada; se não achou, devolva a lista vazia). NUNCA afirme ter assistido aos vídeos.'
          : 'Sem link: baseie-se no seu conhecimento sobre conteúdo infantil de sucesso no YouTube. NUNCA afirme ter acessado a internet.',
      ...linhaDados,
      fonteReal
        ? 'Também devolva "faixas": para CADA vídeo dos DADOS REAIS abaixo, um objeto {titulo: o título EXATAMENTE como aparece nos dados; faixa: a faixa etária infantil recomendada, uma destas: "0 a 3 anos", "4 a 7 anos", "8 a 12 anos"}.'
        : '',
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
    // DeepSeek com a chave da app: SEM créditos de integrações da Base44.
    // (O modelo da DeepSeek não navega na internet; quando o utilizador dá um
    // link sem dados reais da API do YouTube, a análise é feita a partir do que
    // o modelo sabe — o pedido diz isso e proíbe inventar números.)
    const chamada = await pedirJSON({
      temperatura: 0.7,
      texto: [
        ...prompt,
        '',
        'Formato exato da resposta (JSON):',
        '{"tema":"...","videoInfo":{"titulo":"...","canal":"...","observacao":"..."},' +
          '"videosSimilares":[{"titulo":"...","canal":"...","url":"...","faixa":"..."}],' +
          '"faixas":[{"titulo":"...","faixa":"..."}],' +
          '"sugestoes":[{"tema":"...","tituloIdeia":"...","justificativa":"...","potencial":8,"faixa":"4 a 8 anos"}]}',
      ].join('\n'),
    });
    if (!chamada.ok) {
      return json({ ok: false, error: chamada.erro }, chamada.status && chamada.status >= 400 ? chamada.status : 502);
    }
    const resposta = chamada.dados;

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

    // A IA classifica os vídeos (reais ou achados na web) por faixa etária:
    // "faixas" casa pelo título normalizado; sem classificação, o vídeo sai
    // sem faixa e só aparece no filtro "Todas as idades".
    const chaveDe = (t) => String(t || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const mapaFaixas = {};
    for (const f of Array.isArray(resposta?.faixas) ? resposta.faixas : []) {
      const k = chaveDe(f?.titulo);
      if (k && !mapaFaixas[k]) mapaFaixas[k] = String(f?.faixa || '').trim().slice(0, 60);
    }
    const faixaDe = (titulo, direto) => mapaFaixas[chaveDe(titulo)] || String(direto || '').trim().slice(0, 60);

    return json({
      ok: true,
      tema: String(resposta?.tema || palavras || '').trim().slice(0, 160),
      // "videoInfo" só existe com LINK — a IA nunca o inventa numa busca
      // só de palavras-chave (antes aparecia um "canal" fabricado).
      videoInfo: !videoId
        ? null
        : dadosApi?.videoRef
          ? {
              titulo: dadosApi.videoRef.titulo,
              canal: dadosApi.videoRef.canal,
              observacao: 'Dados reais obtidos na API oficial do YouTube.',
              visualizacoes: dadosApi.videoRef.visualizacoes,
            }
          : resposta?.videoInfo && typeof resposta.videoInfo === 'object'
          ? {
              titulo: String(resposta.videoInfo.titulo || '').trim().slice(0, 200),
              canal: String(resposta.videoInfo.canal || '').trim().slice(0, 120),
              observacao: String(resposta.videoInfo.observacao || '').trim().slice(0, 300),
              visualizacoes: 0,
            }
          : null,
      // Com dados reais da API, os similares SÃO os vídeos reais encontrados.
      videosSimilares: (dadosApi?.similares?.length
        ? dadosApi.similares.map((v) => ({
            titulo: v.titulo,
            canal: v.canal,
            url: `https://www.youtube.com/watch?v=${v.id}`,
            visualizacoes: v.visualizacoes || 0,
            faixa: faixaDe(v.titulo, v.faixa),
          }))
        : (Array.isArray(resposta?.videosSimilares) ? resposta.videosSimilares : []).map((v) => ({
            titulo: String(v?.titulo || '').trim().slice(0, 200),
            canal: String(v?.canal || '').trim().slice(0, 120),
            url: /^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(String(v?.url || '')) ? String(v.url) : '',
            visualizacoes: 0,
            faixa: faixaDe(v.titulo, v.faixa),
          }))
      )
        .filter((v) => v.titulo && v.url)
        .slice(0, 5),
      // Os mais visualizados só existem com dados da API — nunca inventados.
      maisVistos: (dadosApi?.maisVistos || [])
        .map((v) => ({
          titulo: v.titulo,
          canal: v.canal,
          url: `https://www.youtube.com/watch?v=${v.id}`,
          visualizacoes: v.visualizacoes || 0,
          faixa: faixaDe(v.titulo),
        }))
        .filter((v) => v.titulo && v.url)
        .slice(0, 5),
      sugestoes: limpas,
      ms: Date.now() - inicio,
      aviso:
        'As notas de potencial são estimativas da IA. As visualizações do vídeo de referência, dos similares e dos mais visualizados vêm da API oficial do YouTube (dados reais).',
    });
  } catch (erro) {
    console.error('sugerirTemas falhou', erro);
    return json({ ok: false, error: erro?.message || 'erro inesperado' }, 500);
  }
}