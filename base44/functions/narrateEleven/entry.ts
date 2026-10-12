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
import { lerDetalhe, traduzirErro } from '../../shared/elevenErrors.ts';

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

    // TENTA VÁRIOS MODELOS. O plano decide quais aceita, e um modelo recusado
    // dava um erro que parecia "chave inválida" — quando a chave estava boa
    // (a lista de vozes funcionava com a mesma chave). Tentar por ordem e
    // reportar cada tentativa evita este falso diagnóstico.
    const MODELOS = [MODELO, 'eleven_turbo_v2_5', 'eleven_flash_v2_5'];
    const tentativas = [];
    let resposta = null;
    let modeloUsado = '';

    for (const m of MODELOS) {
      const r = await fetch(`${API}/text-to-speech/${encodeURIComponent(voz)}?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: { 'xi-api-key': chave, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: falado, model_id: m, voice_settings: TONS[tom] }),
      });

      if (r.ok) {
        resposta = r;
        modeloUsado = m;
        if (m !== MODELO) console.log(`[narrateEleven] "${MODELO}" recusado; funcionou com "${m}"`);
        break;
      }

      // O "detail" da ElevenLabs pode chegar como string, objeto ou lista —
      // a leitura partilhada trata os três formatos.
      const msg = lerDetalhe(await r.text().catch(() => ''));
      tentativas.push({ modelo: m, http: r.status, erro: String(msg).slice(0, 160) });
      console.warn(`[narrateEleven] modelo "${m}" falhou (HTTP ${r.status}): ${String(msg).slice(0, 120)}`);

      // Estes casos NÃO melhoram ao tentar outro modelo: parar poupa tempo e
      // não dá a impressão de que "quase funcionou".
      if (r.status === 401 || r.status === 403) break; // chave/permissão
      if (/exceeds your quota|credits remaining|paid_plan_required|payment_required|missing the permission/i.test(String(msg)))
        break; // cota/plano/permissão
    }

    if (!resposta) {
      const primeira = tentativas[0] || { http: 0, erro: 'sem resposta' };
      // A tradução usa a resposta DA SÍNTESE (não da lista de vozes): com o
      // contexto 'sintetizar', um 401 aponta para a permissão Text to Speech.
      const traduzido = traduzirErro(primeira.http, primeira.erro, {
        contexto: 'sintetizar',
        modelos: tentativas.map((t) => t.modelo),
      });
      return json(
        {
          ok: false,
          http: primeira.http,
          tipo: traduzido.tipo,
          permissao: traduzido.permissao || '',
          error: traduzido.msg,
          // Lista completa das tentativas — é isto que permite perceber o que
          // se passa quando o erro parece de chave mas não é.
          tentativas,
          detalhe: primeira.erro,
        },
        200,
      );
    }

    const bytes = new Uint8Array(await resposta.arrayBuffer());
    if (bytes.length < 200) return json({ ok: false, error: 'a ElevenLabs devolveu áudio vazio' }, 200);

    // Nome da voz, para a página poder CONFIRMAR qual foi usada. Sem isto, o
    // utilizador não tinha como saber se a sua escolha tinha pegado.
    let nomeVoz = '';
    try {
      const vr = await fetch(`${API}/voices/${encodeURIComponent(voz)}`, { headers: { 'xi-api-key': chave } });
      if (vr.ok) nomeVoz = (await vr.json())?.name || '';
    } catch {
      /* o nome é um extra: se falhar, o áudio já está bom */
    }

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
      nomeVoz,
      tom,
      modelo: modeloUsado,
      caracteres: texto.length,
      bytes: bytes.length,
      // Se não foi o modelo preferido, fica registado — o utilizador deve saber.
      nota: modeloUsado !== MODELO ? `O plano não aceita "${MODELO}"; usei "${modeloUsado}".` : '',
    });
  } catch (erro) {
    console.error('narrateEleven falhou', erro);
    return json({ ok: false, error: erro?.message || 'erro inesperado' }, 500);
  }
}