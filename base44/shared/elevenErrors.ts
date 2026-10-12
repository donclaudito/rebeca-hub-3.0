// ============================================================
//  elevenErrors — leitura e tradução dos erros da ElevenLabs
//
//  Partilhado por listElevenVoices (listar vozes) e narrateEleven (sintetizar).
//  A ElevenLabs devolve "detail" em vários formatos — string, objeto
//  ({status, message}) ou lista de objetos — e usa 401 para quase tudo:
//  chave inválida, permissão em falta E cota esgotada. Ler e classificar aqui,
//  uma vez só, evita que as duas funções repitam a lógica (ou a traduzam de
//  maneiras diferentes).
// ============================================================

const URL_CHAVES = 'https://elevenlabs.io/app/settings/api-keys';

// Nomes humanos para as permissões que a API costuma exigir. Uma permissão
// desconhecida é mostrada com o nome cru — nunca inventamos um significado.
const NOMES_PERMISSAO = {
  voices_read: 'Voices (Read)',
  text_to_speech: 'Text to Speech',
  speech_history_read: 'History (Read)',
  speaker_profiles_read: 'Speakers (Read)',
};

// Extração: devolve TEXTO legível de qualquer formato de "detail".
export function lerDetalhe(texto) {
  let dados = null;
  try {
    dados = JSON.parse(texto);
  } catch {
    /* não era JSON: devolve o texto cru */
  }
  const d = dados?.detail ?? dados;
  if (d == null) return String(texto || '').trim();
  if (typeof d === 'string') return d.trim();
  if (Array.isArray(d)) {
    // Listas de erros de validação: junta as mensagens que existirem.
    const partes = d.map((x) => (typeof x === 'string' ? x : x?.message || '')).filter(Boolean);
    return partes.join('; ') || JSON.stringify(d).slice(0, 250);
  }
  if (typeof d === 'object') {
    if (d.message) return String(d.message).trim();
    // {status: 'detected_xxx'} sem mensagem: mostra o código legível.
    if (typeof d.status === 'string') return d.status.replace(/_/g, ' ');
    return JSON.stringify(d).slice(0, 250);
  }
  return String(d);
}

// Classificação + tradução. Recebe o detalhe JÁ extraído por lerDetalhe.
// contexto: 'listar' (a chamada era a lista de vozes) ou 'sintetizar' (era
// a síntese) — a mesma recusa orienta o utilizador de forma diferente.
export function traduzirErro(status, detalhe, opcoes = {}) {
  const contexto = opcoes.contexto === 'sintetizar' ? 'sintetizar' : 'listar';
  const d = String(detalhe || '');

  // COTA ESGOTADA — vem disfarçada de 401 ("chave inválida"). O texto é o
  // único sinal fiável, por isso é verificado em primeiro lugar.
  const restam = /(\d+) credits? remaining/i.exec(d)?.[1];
  const precisa = /while (\d+) credits? (?:are|is) required/i.exec(d)?.[1];
  const total = /quota of (\d+)/i.exec(d)?.[1];
  if (/exceeds your quota|credits? remaining|quota of \d+/i.test(d)) {
    return {
      tipo: 'cota',
      msg:
        'A sua conta ElevenLabs está SEM CRÉDITOS: ' +
        `restam ${restam ?? '0'} de ${total ?? '?'} caracteres` +
        (precisa ? `, e este pedido precisa de ${precisa}` : '') +
        '. Veja o uso em https://elevenlabs.io/app/subscription. Enquanto isso, use a 🌐 Voz do browser, gratuita e sem chave.',
    };
  }

  // PERMISSÃO EM FALTA — a API diz qual. As permissões de uma chave podem ser
  // EDITADAS: não afirmamos que é preciso criar outra chave.
  const permissao = /missing the permission ["\u201c\u201d]?([\w_]+)/i.exec(d)?.[1];
  if (permissao) {
    const nomeHumano = NOMES_PERMISSAO[permissao] || 'a permissão que falta';
    return {
      tipo: 'permissao',
      permissao,
      msg:
        `A chave da ElevenLabs não tem a permissão "${permissao}" (${nomeHumano}). ` +
        `As permissões de uma chave podem ser editadas em ${URL_CHAVES}: ligue ${nomeHumano} e use a mesma chave.`,
    };
  }

  // PLANO GRATUITO — recusa as vozes da biblioteca (402); só acontece na síntese.
  if (status === 402 || /paid_plan_required|payment_required/i.test(d)) {
    return {
      tipo: 'plano',
      msg:
        'A sua conta está no plano gratuito e recusa as vozes da BIBLIOTECA (Bella, Rachel, Elli, Adam, Domi). ' +
        'Use uma voz da SUA conta: clique em "Carregar as minhas vozes" e escolha uma da lista.',
    };
  }

  if (status === 429 || /rate limit|too many/i.test(d)) {
    return { tipo: 'rate', msg: 'Demasiados pedidos em pouco tempo. Espere um pouco e tente outra vez.' };
  }

  // MODELO RECUSADO — só faz sentido na síntese, onde se tenta mais de um.
  if (status === 422 || /model.*not|not.*available|unsupported.*model|invalid.*model|deprecated/i.test(d)) {
    const modelos = (opcoes.modelos || []).join(', ');
    return {
      tipo: 'modelo',
      msg:
        `Nenhum dos modelos disponíveis foi aceite${modelos ? ` (${modelos})` : ''}. ` +
        'O seu plano pode não incluir a síntese de voz pela API: https://elevenlabs.io/app/subscription',
    };
  }

  if (/voice_not_found|does not exist/i.test(d)) {
    return {
      tipo: 'voz',
      msg: 'Esta voz não existe na sua conta. Clique em "Carregar as minhas vozes" e escolha outra.',
    };
  }

  // RECUSADA — 401/403 sem outro sinal. Na síntese, um 401 pode ser permissão
  // de Text to Speech quando a lista de vozes funcionou com a mesma chave.
  if (status === 401 || status === 403 || /invalid api key|unauthorized/i.test(d)) {
    return {
      tipo: 'recusada',
      msg:
        contexto === 'sintetizar'
          ? 'A chave da ElevenLabs foi recusada na síntese. Se a lista de vozes funcionou, a chave é válida mas pode não ter ' +
            `a permissão Text to Speech: edite as permissões da chave em ${URL_CHAVES}.`
          : `A chave da ElevenLabs foi recusada. Confirme que copiou a chave completa em ${URL_CHAVES}.`,
    };
  }

  return { tipo: 'outro', msg: d.slice(0, 280) || `a ElevenLabs respondeu ${status}` };
}