// ============================================================
//  listElevenVoices — lista as vozes da conta ElevenLabs
//
//  A chave vive como SEGREDO da app (ELEVENLABS_API_KEY) e nunca é devolvida
//  ao browser. Se a chave ainda não estiver configurada, responde com uma
//  explicação em vez de um erro seco.
//
//  Porque isto existe: no plano gratuito a ElevenLabs RECUSA as vozes da
//  biblioteca (erro 402 paid_plan_required) e só aceita as vozes da própria
//  conta. Sem esta lista, o utilizador não tem como saber quais servem.
// ============================================================
import { secrets } from 'base44:runtime';

const API = 'https://api.elevenlabs.io/v1';

const json = (corpo, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

// As 5 vozes do Rebeca Hub 2.0, que a interface também oferece. Ficam marcadas
// na resposta para a tela poder explicar quando o plano as recusa.
const VOZES_DO_APP = {
  EXAVITQu4vr4xnSDxMaL: 'Suave (Bella)',
  '21m00Tcm4TlvDq8ikWAM': 'Calma (Rachel)',
  MF3mGyEYCl7XYWbV9V6O: 'Alegre (Elli)',
  pNInz6obpgDQGcFmaJgB: 'Grave (Adam)',
  AZnzlk1XvdvUeBnXmlld: 'Energética (Domi)',
};

export default async function (req) {
  try {
    const chave = secrets.get('ELEVENLABS_API_KEY');
    if (!chave) {
      return json(
        {
          ok: false,
          semChave: true,
          error:
            'Falta o segredo ELEVENLABS_API_KEY nas Configurações da app. ' +
            'Crie uma chave em https://elevenlabs.io/app/developers/api-keys e depois, ' +
            'no terminal do projeto, corra: base44 secrets set ELEVENLABS_API_KEY=sk_a_sua_chave',
        },
        200,
      );
    }

    const resposta = await fetch(`${API}/voices`, { headers: { 'xi-api-key': chave } });
    const texto = await resposta.text();
    let dados = null;
    try {
      dados = JSON.parse(texto);
    } catch {
      /* resposta não era JSON */
    }

    if (!resposta.ok) {
      const detalhe = dados?.detail?.message || dados?.detail || texto.slice(0, 250);
      const recusada =
        resposta.status === 401 || resposta.status === 403 || /invalid api key|unauthorized/i.test(String(detalhe));
      return json(
        {
          ok: false,
          recusada,
          http: resposta.status,
          error: recusada
            ? 'A chave da ElevenLabs foi recusada. Confirme que copiou a chave completa de https://elevenlabs.io/app/developers/api-keys'
            : String(detalhe).slice(0, 250),
          detalhe: String(detalhe).slice(0, 200),
        },
        200,
      );
    }

    const vozes = (dados?.voices || []).map((v) => ({
      id: v.voice_id,
      nome: v.name,
      categoria: v.category || '',
      descricao: (v.labels && (v.labels.description || v.labels.accent)) || v.description || '',
      doApp: Boolean(VOZES_DO_APP[v.voice_id]),
      rotuloDoApp: VOZES_DO_APP[v.voice_id] || '',
      previsualizacao: v.preview_url || '',
    }));

    return json({
      ok: true,
      vozes,
      total: vozes.length,
      // Quantas são da biblioteca (as que o plano gratuito recusa)
      biblioteca: vozes.filter((v) => v.categoria === 'premade' || v.categoria === 'professional').length,
    });
  } catch (erro) {
    console.error('listElevenVoices falhou', erro);
    return json({ ok: false, error: erro?.message || 'erro inesperado' }, 500);
  }
}
