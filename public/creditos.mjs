// ============================================================
//  Créditos de integrações da Base44 (erro 402)
//
//  REGRA DO PROJETO: a IA desta app NUNCA usa os créditos de integrações da
//  Base44 (fala directamente com a DeepSeek, com o segredo da app). Só o
//  ARMAZENAMENTO de ficheiros (UploadPrivateFile / CreateFileSignedUrl) é que
//  é integração paga — e quando os créditos acabam a Base44 responde **402**.
//
//  Sem isto, guardar um projeto com 6 cenas disparava 12 pedidos e 12 erros
//  iguais na consola, e o utilizador só via "não consegui guardar".
// ============================================================

// O erro traz o estado em sítios diferentes conforme a camada: AxiosError
// (`response.status`), erro do SDK (`status`) ou uma mensagem já formatada.
export function semCreditos(e) {
  const estado = Number(e?.status ?? e?.statusCode ?? e?.response?.status ?? NaN);
  if (estado === 402) return true;
  return /402|payment required|sem cr[eé]ditos|insufficient (balance|credit)|exceeded your current quota/i.test(
    String((e && (e.message || e.erro)) || e || ''),
  );
}

// A frase que o utilizador vê. Diz o que NÃO foi possível, o que continua a
// funcionar e o que fazer — em vez de "erro 402" e nada mais.
export const MENSAGEM_SEM_CREDITOS =
  'A conta Base44 está SEM CRÉDITOS de integrações (erro 402), por isso não é possível guardar ' +
  'ficheiros na nuvem. O trabalho no estúdio não se perdeu: o vídeo pode ser descarregado e o ' +
  'projeto fica guardado neste computador. Para voltar a guardar na nuvem, carregue créditos em ' +
  'app.base44.com (Settings → Billing).';
