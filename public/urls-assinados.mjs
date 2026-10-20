// ============================================================
//  URLs assinados dos ficheiros privados (vídeos, miniaturas, imagens e áudio
//  dos projetos guardados na nuvem).
//
//  PROBLEMA: cada ficheiro privado precisa de um URL assinado, e a Base44
//  responde **429 Too Many Requests** quando chegam muitos pedidos seguidos.
//  Abrir o Painel com 12 vídeos pedia 12 URLs de uma vez; abrir um projeto da
//  nuvem pedia 2 por cena. E era um ciclo vicioso: o 429 fazia a miniatura
//  falhar, o `onerror` pedia outro URL, e a rajada crescia.
//
//  SOLUÇÃO, toda aqui:
//    1. CACHE — o URL fica guardado (sessionStorage) com a validade. Voltar ao
//       Painel, mudar de vista ou recarregar a página já não assina nada.
//    2. UM PEDIDO DE CADA VEZ, com uma pausa mínima entre eles.
//    3. RECUO no 429 — espera 1,2 s, depois 2,4 s, e desiste com uma mensagem
//       clara (nunca um "não sei o que aconteceu").
//
//  Este módulo não sabe falar com a Base44: recebe `pedir`, uma função que faz
//  o pedido. Assim é o mesmo código para o Painel e para os projetos, e pode ser
//  testado sem browser.
// ============================================================

export const CACHE = 'rh3urls';
export const PAUSA_ENTRE_PEDIDOS = 350; // ms entre pedidos
export const VALIDADE_COMODA = 5 * 60 * 1000; // só vale a pena reutilizar se faltar mais do que isto
export const TENTATIVAS = 3;

function lerCache() {
  try {
    const cru = sessionStorage.getItem(CACHE);
    const o = cru ? JSON.parse(cru) : {};
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

function gravarCache(o) {
  try {
    sessionStorage.setItem(CACHE, JSON.stringify(o));
  } catch {
    /* modo privado cheio: segue sem cache */
  }
}

const chaveDe = (uri, expira) => `${expira}|${uri}`;

let fila = Promise.resolve();
let ultimoPedidoEm = 0;
let avisouDoLimite = false;

// Avisa a página de que a Base44 está a limitar pedidos (o Painel mostra o
// aviso). Uma vez por carregamento.
function avisarLimite() {
  if (avisouDoLimite) return;
  avisouDoLimite = true;
  try {
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(new Event('rh-limite-pedidos'));
    }
  } catch {
    /* sem janela (testes) */
  }
}

// Esquece um URL guardado (quando expirou, por exemplo).
export function esquecer(uri, expira = 24 * 60 * 60) {
  const cache = lerCache();
  delete cache[chaveDe(uri, expira)];
  gravarCache(cache);
}

// O URL assinado de `uri`, em cache quando possível.
//
// `opts.pedir(uri, expira)` → Promise<string> com o URL (obrigatório na 1.ª vez
// que se pede este URI; nas seguintes pode vir de cache).
// `opts.renovar` → ignora o URL em cache e pede um novo.
export async function assinar(uri, expira = 24 * 60 * 60, opts = {}) {
  if (!uri) return '';
  const pedir = opts.pedir;
  const chave = chaveDe(uri, expira);

  if (!opts.renovar) {
    const guardado = lerCache()[chave];
    if (guardado && guardado.url && guardado.exp - Date.now() > VALIDADE_COMODA) return guardado.url;
  }
  if (typeof pedir !== 'function') {
    // Sem forma de pedir: usa o que estiver em cache, mesmo a expirar.
    const guardado = lerCache()[chave];
    return guardado && guardado.url ? guardado.url : '';
  }

  const meu = fila.then(() => pedirComRecuo(pedir, uri, expira, chave));
  // A fila segue mesmo que este pedido falhe (senão ficava tudo parado).
  fila = meu.then(
    () => undefined,
    () => {
      /* quem pediu trata do erro */
    },
  );
  return meu;
}

async function pedirComRecuo(pedir, uri, expira, chave) {
  for (let tentativa = 0; tentativa < TENTATIVAS; tentativa += 1) {
    const pausa = Math.max(0, PAUSA_ENTRE_PEDIDOS - (Date.now() - ultimoPedidoEm));
    if (pausa) await new Promise((r) => setTimeout(r, pausa));
    ultimoPedidoEm = Date.now();
    try {
      const url = await pedir(uri, expira);
      if (url) {
        const cache = lerCache();
        cache[chave] = { url, exp: Date.now() + expira * 1000 };
        gravarCache(cache);
      }
      return url || '';
    } catch (e) {
      const msg = String((e && e.message) || e);
      const limitado = /429|too many requests|rate limit/i.test(msg);
      if (!limitado) throw e;
      if (tentativa === TENTATIVAS - 1) {
        avisarLimite();
        throw new Error('a Base44 está a limitar pedidos de ficheiros (429) — aguarde um minuto');
      }
      await new Promise((r) => setTimeout(r, 1200 * (tentativa + 1)));
    }
  }
  return '';
}
