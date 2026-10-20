// ============================================================
//  gerarPrompts — função de nuvem do Rebeca Hub 3.0
//
//  Recebe um tema sugerido na pesquisa (ex.: "Hora de Dormir: O Panda
//  vai para a cama") e devolve um PROMPT de imagem (em inglês, para
//  geradores de imagem) e os PROMPTS de música (estilo + letra) para
//  geradores como o Suno. Conteúdo sempre infantil e seguro.
// ============================================================
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

const json = (corpo, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

const corte = (t, n) => String(t || '').trim().slice(0, n);

export default async function (req) {
  try {
    if (req.method !== 'POST') return json({ ok: false, error: 'Use POST.' }, 405);

    // Desembrulha o payload (o SDK pode mandar { data: {...} }).
    const bruto = await req.json().catch(() => ({}));
    const corpo =
      bruto && typeof bruto === 'object' && !Array.isArray(bruto) && bruto.data && typeof bruto.data === 'object'
        ? { ...bruto, ...bruto.data }
        : bruto || {};

    const tema = corte(corpo.tema, 200);
    const titulo = corte(corpo.tituloIdeia, 200);
    const faixa = corte(corpo.faixa, 60);
    if (!tema && !titulo) {
      return json({ ok: false, error: 'Informe o tema.' }, 400);
    }

    const base44 = createClientFromRequest(req);
    const resposta = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: [
        'Você cria PROMPTS prontos para produzir vídeos infantis no YouTube (conteúdo sempre seguro e apropriado para crianças).',
        `Tema: "${tema || titulo}".`,
        titulo ? `Título pronto da ideia: "${titulo}".` : '',
        faixa ? `Faixa etária: ${faixa}.` : '',
        '',
        'Devolva exatamente três campos:',
        '- promptImagem: UM prompt detalhado, em INGLÊS, para geradores de imagem (Midjourney, DALL·E e afins). Descreve a CENA PRINCIPAL da capa/primeira cena do vídeo: personagens, ação, cenário, iluminação, estilo (animação 2D ou 3D fofa, cores alegres, estilo infantil), terminando com a proporção 16:9. Texto corrido, uma frase rica, sem listas, sem marcas. Conteúdo 100% apropriado para crianças.',
        "- musicaEstilo: em INGLÊS, uma linha descrevendo o ESTILO da música para geradores como o Suno: gênero (ex.: gentle children's lullaby), instrumentos, andamento, clima e voz. Sem marcações de seção.",
        "- musicaLetra: LETRA completa em português do Brasil, cantável, apropriada à faixa etária, coerente com o tema. SOMENTE a letra pura: NUNCA use marcações de seção nem de estrutura ([Verso 1], [Refrão], [Ponte], [Chorus], (Refrão)…), nem títulos, nem negrito (**assim**), nem comentários. Apenas os versos, um por linha. No mínimo dois versos e um refrão; versos curtos (4 a 8 palavras), vocabulário simples.",
      ]
        .filter(Boolean)
        .join('\n'),
      response_json_schema: {
        type: 'object',
        properties: {
          promptImagem: { type: 'string' },
          musicaEstilo: { type: 'string' },
          musicaLetra: { type: 'string' },
        },
        required: ['promptImagem', 'musicaEstilo', 'musicaLetra'],
      },
    });

    // Só letra pura: sem marcações de seção ([Verso 1], [Refrão]…), sem negrito
    // e sem linhas vazias dobradas. A defesa fica aqui porque nem toda a IA
    // obedece ao pedido, e uma marcação vira legenda no vídeo.
    const soLetraPura = (letra) => {
      const SECAO = /pre[- ]?chorus|pré[- ]?refrão|pré[- ]?refrao|interlúdio|interlude|instrumental|refrão|refrao|chorus|verse|verso|bridge|ponte|outro|intro|solo|drop/i;
      return String(letra || '')
        .split('\n')
        .map((l) => l.replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim())
        // Linhas só de marcação ([Verso 2], (Refrão)…) saem da letra.
        .filter((l) => !(/^\[[^\]]*\]$/.test(l) || (/^\([^\)]*\)$/.test(l) && SECAO.test(l))))
        .filter(Boolean)
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    };
    const letraBruta = corte(resposta?.musicaLetra, 6000);
    const promptImagem = corte(resposta?.promptImagem, 2000);
    const musicaEstilo = corte(resposta?.musicaEstilo, 600);
    const musicaLetra = soLetraPura(letraBruta) || letraBruta;
    if (!promptImagem || !musicaLetra) {
      return json({ ok: false, error: 'A IA não devolveu os prompts. Tente outra vez.' }, 502);
    }
    return json({ ok: true, promptImagem, musicaEstilo, musicaLetra });
  } catch (erro) {
    console.error('gerarPrompts falhou', erro);
    return json({ ok: false, error: erro?.message || 'erro inesperado' }, 500);
  }
}