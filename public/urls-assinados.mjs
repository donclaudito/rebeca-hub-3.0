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

// ---------------------------------------------------------------- sessão
//
// O pedido de URL assinado EXIGE autenticação. Sem Bearer válido a Base44
// devolve 422 (Unprocessable) — status enganoso para um problema de
// autenticação, mas é o comportamento dela, confirmado com o mesmo pedido e o
// mesmo corpo: 422 sem Bearer, 200 com Bearer.
//
// A plataforma Base44 injeta um shim no <head> de cada página que serve, e é ele
// que lê o token de `localStorage['base44_access_token']` e o põe em
// `Authorization`. É a MESMA chave lida aqui. Consequência prática: sem conta
// não há cabeçalho, o pedido falha de certeza, e fazê-lo só produz um erro 422
// vermelho no console de quem apenas abriu a app. Não se pede.
//
// O token é relido a cada pedido (é barato) e o que se guarda é o VALOR que a
// Base44 recusou. Assim, depois de entrar na conta o token muda e as miniaturas
// voltam sozinhas, sem recarregar a página.
const CHAVE_TOKEN = 'base44_access_token';

/** Token de sessão actual; '' se não há, null se não se consegue saber. */
export function tokenAtual() {
  try {
    const t = localStorage.getItem(CHAVE_TOKEN);
    return t == null ? '' : String(t);
  } catch {
    // Sem localStorage (testes sem browser, modo privado restrito) ou a
    // plataforma mudou de sítio o token: não se decide nada, deixa-se tentar.
    return null;
  }
}

// Valor do token que a Base44 já recusou. Vazio = nenhum.
let tokenRecusado = '';
// Token ilegível e a assinatura falhou: não há como comparar, desiste-se.
let desistiuCego = false;
let avisouDaSessao = false;
let avisouDeFaltaDeSessao = false;

const FALHA_DE_SESSAO = /40[13]|422|unauthorized|forbidden|unprocessable/i;

/** 'ok' | 'sem-token' | 'recusado' | 'desconhecido' */
function estadoDaSessao() {
  if (desistiuCego) return 'recusado';
  const t = tokenAtual();
  if (t === null) return 'desconhecido';
  if (!t) return 'sem-token';
  if (tokenRecusado && t === tokenRecusado) return 'recusado';
  return 'ok';
}

// Rede de segurança independente do texto do erro: ao fim de N falhas seguidas
// (fora o 429) desiste-se de pedir. Existe porque o erro do SDK pode não trazer
// status em `message` nem em `e.status`, e nesse caso nenhuma classificação
// funciona — mas insistir também não.
const FALHAS_ATE_DESISTIR = 3;
let falhasSeguidas = 0;

/** Verdadeiro quando não há sessão utilizável: pára de pedir até entrar. */
export function sessaoInvalida() {
  const e = estadoDaSessao();
  return e === 'sem-token' || e === 'recusado';
}

// Decide se vale a pena pedir, e explica à página porquê quando não vale.
function pararPorSessao() {
  const e = estadoDaSessao();
  if (e === 'sem-token') {
    avisarSemSessao();
    return true;
  }
  if (e === 'recusado') {
    avisarSessao();
    return true;
  }
  return false;
}

// Sem conta não é o mesmo que sessão expirada: quem nunca entrou não tem nada
// a expirar. O Painel diz isto em vez de falar em expiração.
function avisarSemSessao() {
  if (avisouDeFaltaDeSessao) return;
  avisouDeFaltaDeSessao = true;
  try {
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(new Event('rh-sem-sessao'));
    }
  } catch {
    /* sem janela (testes) */
  }
}

function avisarSessao() {
  if (avisouDaSessao) return;
  avisouDaSessao = true;
  try {
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(new Event('rh-sessao-invalida'));
    }
  } catch {
    /* sem janela (testes) */
  }
}

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

  // Sem sessão não há pedido que possa correr bem. Devolver vazio é o que os
  // chamadores já tratam (ficam com o ícone em vez da miniatura) e evita o erro
  // 422 no console de quem só abriu a app.
  if (pararPorSessao()) return '';

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
  // A verificação TEM de estar aqui dentro, não só em `assinar`.
  //
  // A fila serializa os pedidos: com 15 cartões, os 15 chamam `assinar` antes de
  // a primeira falha marcar o estado, e todos passam pela checagem feita lá
  // fora. Enfileirados, continuavam a sair um a um — 15 pedidos condenados.
  // Aqui, cada um que chega à vez vê o estado já marcado e desiste sem pedir.
  if (pararPorSessao()) return '';
  for (let tentativa = 0; tentativa < TENTATIVAS; tentativa += 1) {
    if (pararPorSessao()) return '';
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
      falhasSeguidas = 0;
      return url || '';
    } catch (e) {
      const msg = String((e && e.message) || e);
      const limitado = /429|too many requests|rate limit/i.test(msg);
      if (!limitado) {
        // Falha de sessão é terminal: marca e avisa uma única vez.
        //
        // A detecção NÃO pode depender só do texto. O erro do SDK não traz
        // necessariamente o status em `message` — e foi exactamente isso que
        // deixou passar ~20 pedidos depois da primeira correção: a mensagem não
        // casava com o padrão, o estado nunca era marcado e todos os cartões
        // insistiam. Por isso: status do erro (em várias formas conhecidas) OU
        // mensagem, e ainda o limite de falhas seguidas como último recurso.
        const estado = Number(
          (e && (e.status ?? e.statusCode ?? (e.response && e.response.status))) ?? NaN,
        );
        falhasSeguidas += 1;
        const deSessao =
          estado === 401 ||
          estado === 403 ||
          estado === 422 ||
          FALHA_DE_SESSAO.test(msg) ||
          falhasSeguidas >= FALHAS_ATE_DESISTIR;
        if (deSessao) {
          // Guarda-se o VALOR do token recusado (e não um simples "falhou"):
          // depois de entrar na conta o token muda, a comparação deixa de bater
          // e os pedidos voltam sozinhos.
          const t = tokenAtual();
          if (t === null) desistiuCego = true;
          else if (t) tokenRecusado = t;
          avisarSessao();
          throw new Error(
            'não consegui abrir os ficheiros privados: a sessão parece ter expirado. ' +
              'Entre novamente na sua conta e recarregue a página.',
          );
        }
        throw e;
      }
      if (tentativa === TENTATIVAS - 1) {
        avisarLimite();
        throw new Error('a Base44 está a limitar pedidos de ficheiros (429) — aguarde um minuto');
      }
      await new Promise((r) => setTimeout(r, 1200 * (tentativa + 1)));
    }
  }
  return '';
}
