// ============================================================
//  narrateEleven — sintetiza narração com a voz escolhida da ElevenLabs
//
//  Corre na nuvem, por isso a chave (segredo ELEVENLABS_API_KEY) nunca chega ao
//  browser. Devolve o MP3 em base64, para a página o poder guardar e descarregar.
//
//  IMPORTANTE: no plano gratuito a ElevenLabs recusa as vozes da BIBLIOTECA
//  (as 5 do app: Bella, Rachel, Elli, Adam, Domi) com erro 402. As vozes da
//  própria conta — as que aparecem em listElevenVoices — funcionam.
// ============================================================
import { secrets } from 'base44:runtime';

const API = 'https://api.elevenlabs.io/v1';
const MODELO = 'eleven_multilingual_v2';

// Parâmetros de atuação por tom (os mesmos do Rebeca Hub 2.0).
const TONS = {
  acolhedora: { stability: 0.65, similarity_boost: 0.85, style: 0.2, use_speaker_boost: true },
  animada: { stability: 0.25, similarity_boost: 0.75, style: 0.65, use_speaker_boost: true },
  misteriosa: { stability: 0.35, similarity_boost: 0.7, style: 0.5, use_speaker_boost: true },
  dramatica: { stability: 0.2, similarity_boost: 0.65, style: 0.8, use_speaker_boost: true },
};

// Marcas de atuação que a ElevenLabs interpreta. Entram só no texto enviado —
// o texto guardado no projeto fica limpo.
const MARCAS = {
  animada: '[excited]',
  acolhedora: '[softly]',
  misteriosa: '[whispers]',
  dramatica: '[gasp]',
};

const json = (corpo, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

// Traduz as recusas conhecidas para algo accionável.
function explicar(status, detalhe) {
  const d = String(detalhe || '');
  if (/paid_plan_required|payment_required|402/.test(`${status} ${d}`)) {
    return (
      'A sua conta ElevenLabs está no plano gratuito e recusa as vozes da BIBLIOTECA ' +
      '(as do app: Bella, Rachel, Elli, Adam, Domi — erro 402). ' +
      'Use uma voz da SUA conta: clique em "Carregar as minhas vozes" e escolha uma da lista.'
    );
  }
  if (status === 401 || status === 403 || /invalid api key|api key is invalid|unauthorized/i.test(d)) {
    return 'A chave da ElevenLabs foi recusada. Copie-a de novo em https://elevenlabs.io/app/developers/api-keys';
  }
  if (status === 429 || /quota|rate limit|too many/i.test(d)) {
    return 'Atingiu o limite de caracteres do seu plano ElevenLabs. Espere pela renovação, ou use a voz do browser para esta narração.';
  }
  if (/voice_not_found|does not exist/i.test(d)) {
    return 'Esta voz não existe na sua conta. Clique em "Carregar as minhas vozes" e escolha outra.';
  }
  return String(d).slice(0, 280) || `a ElevenLabs respondeu ${status}`;
}

export default async function (req) {
  try {
    if (req.method !== 'POST') return json({ ok: false, error: 'Use POST.' }, 405);

    const corpo = await req.json().catch(() => ({}));
    const texto = String(corpo?.texto || '').trim();
    const voz = String(corpo?.voz || '').trim();
    const tom = TONS[corpo?.tom] ? corpo.tom : 'acolhedora';

    if (!texto) return json({ ok: false, error: 'Falta o texto da narração.' }, 400);
    if (!voz) return json({ ok: false, error: 'Falta escolher a voz.' }, 400);
    // A ElevenLabs corta em 4000 caracteres; avisamos em vez de cortar em silêncio.
    if (texto.length > 4000) {
      return json(
        { ok: false, error: `O texto tem ${texto.length} caracteres e o limite da ElevenLabs é 4000. Divida esta cena.` },
        400,
      );
    }

    const chave = secrets.get('ELEVENLABS_API_KEY');
    if (!chave) {
      return json(
        {
          ok: false,
          semChave: true,
          error:
            'Falta o segredo ELEVENLABS_API_KEY. Crie uma chave em https://elevenlabs.io/app/developers/api-keys ' +
            'e corra:  base44 secrets set ELEVENLABS_API_KEY=sk_a_sua_chave',
        },
        400,
      );
    }

    const marca = MARCAS[tom];
    const falado = marca ? `${marca} ${texto}` : texto;

    const resposta = await fetch(`${API}/text-to-speech/${encodeURIComponent(voz)}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': chave, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: falado,
        model_id: MODELO,
        voice_settings: TONS[tom],
      }),
    });

    if (!resposta.ok) {
      const detalhe = await resposta.text().catch(() => '');
      let msg = detalhe.slice(0, 300);
      try {
        msg = JSON.parse(detalhe)?.detail?.message || JSON.parse(detalhe)?.detail || msg;
      } catch {
        /* texto cru */
      }
      console.warn(`[narrateEleven] voz ${voz} recusada (HTTP ${resposta.status}): ${String(msg).slice(0, 150)}`);
      return json({ ok: false, http: resposta.status, error: explicar(resposta.status, msg), detalhe: String(msg).slice(0, 200) }, 200);
    }

    const bytes = new Uint8Array(await resposta.arrayBuffer());
    if (bytes.length < 200) return json({ ok: false, error: 'a ElevenLabs devolveu áudio vazio' }, 200);

    // base64 em blocos, para não estourar a pilha com áudio longo.
    let binario = '';
    for (let p = 0; p < bytes.length; p += 0x8000) {
      binario += String.fromCharCode.apply(null, bytes.subarray(p, p + 0x8000));
    }

    return json({
      ok: true,
      audioB64: btoa(binario),
      tipo: 'audio/mpeg',
      voz,
      tom,
      caracteres: texto.length,
      bytes: bytes.length,
    });
  } catch (erro) {
    console.error('narrateEleven falhou', erro);
    return json({ ok: false, error: erro?.message || 'erro inesperado' }, 500);
  }
}
