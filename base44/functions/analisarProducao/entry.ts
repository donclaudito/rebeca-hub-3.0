// ============================================================
//  analisarProducao — análise do Diretor de Fotografia
//
//  Recebe as imagens da montagem (a miniatura do vídeo pronto + as cenas, por
//  ordem) e os dados da gravação, e pede a um modelo com VISÃO uma análise
//  estruturada nos 4 pontos: composição/ritmo, sincronia com o áudio,
//  melhorias de pós-produção e um prompt refinado (em inglês) para regerar.
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

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return json({ ok: false, error: 'Entre na app para usar a análise.' }, 401);

    // Desembrulha o payload (o SDK pode mandar { data: {...} }).
    const bruto = await req.json().catch(() => ({}));
    const corpo =
      bruto && typeof bruto === 'object' && !Array.isArray(bruto) && bruto.data && typeof bruto.data === 'object'
        ? { ...bruto, ...bruto.data }
        : bruto || {};

    // Até 9 imagens (miniatura + cenas), cada uma pelo seu file_uri privado —
    // nunca um URL vindo de fora.
    const arquivos = (Array.isArray(corpo.arquivos) ? corpo.arquivos : [])
      .filter((a) => a && typeof a.uri === 'string' && a.uri && a.uri.length < 500)
      .slice(0, 9)
      .map((a) => ({ nome: corte(a.nome, 80), uri: a.uri }));
    if (!arquivos.length) {
      return json({ ok: false, error: 'Envie as imagens da montagem (miniatura e cenas).' }, 400);
    }

    // Assina cada imagem (as imagens da app são privadas): o modelo precisa de
    // um URL aberto por alguns minutos para as ler.
    const assinados = await Promise.allSettled(
      arquivos.map(async (a) => {
        const r = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
          file_uri: a.uri,
          expires_in: 600,
        });
        return { nome: a.nome, url: r.signed_url };
      }),
    );
    const urls = assinados
      .filter((x) => x.status === 'fulfilled' && x.value && x.value.url)
      .map((x) => x.value);
    if (!urls.length) {
      return json({ ok: false, error: 'Não consegui abrir as imagens da montagem.' }, 502);
    }

    // Os dados da gravação entram como texto: é o contexto de montagem que a
    // imagem sozinha não diz (duração, transição, epílogo, ciclo, legendas…).
    const meta = corpo.meta && typeof corpo.meta === 'object' ? corpo.meta : {};
    const linhas = [];
    const adicionar = (rotulo, valor) => {
      if (valor !== undefined && valor !== null && valor !== '') linhas.push(`- ${rotulo}: ${valor}`);
    };
    adicionar('Duração do vídeo (s)', meta.duracao);
    adicionar('Formato/resolução', meta.formato);
    adicionar('Transição entre cenas', meta.transicao);
    adicionar('Duração da transição (s)', meta.duracaoTransicao);
    adicionar('Tem narração', meta.comVoz);
    adicionar('Tem trilha sonora', meta.comMusica);
    adicionar('Duração da música (s)', meta.musicaSegundos);
    adicionar('Modo de duração (natural ou em ciclo até a música acabar)', meta.modoDuracao);
    adicionar('Passagens do ciclo', meta.passagens);
    adicionar('Orientação do encerramento', meta.orientacao);
    adicionar('Duração do epílogo (s)', meta.epilogo);
    adicionar('Duração da introdução (s)', meta.intro);
    adicionar('Blocos de legenda', meta.legendas);
    adicionar('Legenda vem da letra da música', meta.letraDaMusica);
    adicionar('Codec', meta.codec);
    adicionar('Número de cenas', meta.cenas);

    const resposta = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: [
        'Você é um Diretor de Fotografia e Editor de Vídeo Profissional analisando um vídeo infantil montado no browser a partir de imagens fixas, com transições, narração opcional e trilha sonora opcional.',
        'As imagens em anexo, por ordem: a PRIMEIRA é um fotograma do vídeo pronto (miniatura, captada no início da gravação); as seguintes são as cenas, na ordem em que aparecem no vídeo.',
        'Analise o conjunto e devolva EXATAMENTE estes quatro campos:',
        '- composicao: "Composição e Ritmo Visual" — enquadramento, luz e cor das cenas; se há imagens repetidas ou monótonas; se a transição escolhida funciona com este material; e se a passagem para a cena final (epílogo, com a orientação escolhida) é natural ou brusca.',
        '- sincronia: "Sincronização com Áudio/Música" — como a imagem se alinha com a duração da música (ciclo de repetições, epílogo calibrado para o fim da música, fecho com esmaecimento de som e imagem); diga se a intensidade visual acompanha o encerramento do áudio e onde desalinha.',
        '- melhorias: de 3 a 6 sugestões CONCRETAS de pós-produção (cortes, ajustes de cor/color grading, efeitos visuais, transições, ritmo), cada uma com um titulo curto e um detalhe prático — preferindo o que se resolve nos controlos da própria app (transição, duração de cada imagem, epílogo, legendas, codec, tempo de cena) e dizendo claramente o que exige um editor externo.',
        '- promptRefinado: se as imagens tiverem falhas de geração (personagens inconsistentes entre cenas, artefactos, texto escrito na imagem, enquadramento fraco, iluminação incoerente), UM prompt refinado em INGLÊS, pronto para colar num gerador de imagens, que corrige essas falhas e mantém o estilo infantil com proporção 16:9, uma frase rica sem listas. Se as imagens estiverem boas, devolva um prompt que eleve ainda mais a qualidade.',
        'Responda em português do Brasil, concreto e sem enrolação — exceto promptRefinado, que é sempre em inglês.',
        '',
        'Dados da montagem:',
        ...linhas,
      ].join('\n'),
      file_urls: urls.map((u) => u.url),
      response_json_schema: {
        type: 'object',
        properties: {
          composicao: { type: 'string' },
          sincronia: { type: 'string' },
          melhorias: {
            type: 'array',
            items: {
              type: 'object',
              properties: { titulo: { type: 'string' }, detalhe: { type: 'string' } },
              required: ['titulo', 'detalhe'],
            },
          },
          promptRefinado: { type: 'string' },
        },
        required: ['composicao', 'sincronia', 'melhorias', 'promptRefinado'],
      },
    });

    const melhorias = Array.isArray(resposta?.melhorias)
      ? resposta.melhorias
          .filter((m) => m && (m.titulo || m.detalhe))
          .slice(0, 8)
          .map((m) => ({ titulo: corte(m.titulo, 120), detalhe: corte(m.detalhe, 600) }))
      : [];
    const composicao = corte(resposta?.composicao, 4000);
    const sincronia = corte(resposta?.sincronia, 4000);
    const promptRefinado = corte(resposta?.promptRefinado, 4000);
    if (!composicao || !sincronia) {
      return json({ ok: false, error: 'A IA não devolveu a análise. Tente outra vez.' }, 502);
    }
    return json({ ok: true, composicao, sincronia, melhorias, promptRefinado });
  } catch (erro) {
    console.error('analisarProducao falhou', erro);
    return json({ ok: false, error: erro?.message || 'erro inesperado' }, 500);
  }
}