// ============================================================
//  Rebeca Hub 3.0 (nuvem) — utilizador (quem está a usar a app)
//
//  Extraído do app.js para o ficheiro principal continuar leve.
//
//  A app NÃO obriga a entrar: tudo o que é essencial (imagens,
//  narração, vídeo e projetos guardados no computador) funciona
//  sem conta. A conta serve para a app saber quem está a
//  trabalhar e para o trabalho poder ficar associado a uma pessoa
//  na Base44. Por isso não há redirecionamento para um ecrã de
//  login obrigatório — isso fecharia a app a quem só a quer
//  experimentar.
// ============================================================

const $ = (id) => document.getElementById(id);

let toast = () => {};
let clienteBase44 = () => { throw new Error('cliente não chegou'); };

export function iniciarUtilizador(ctx) {
  toast = ctx.toast || toast;
  clienteBase44 = ctx.clienteBase44 || clienteBase44;
  arrancar();
}

let utilizadorAtual = null;

function mostrarEstadoUser(texto, dentro = false) {
  const el = $('user-estado');
  if (!el) return;
  el.textContent = texto;
  el.classList.toggle('dentro', dentro);
}

function nomeDoUtilizador(u) {
  if (!u) return '';
  const nome = (u.full_name || '').trim();
  if (nome) return nome;
  return String(u.email || '').split('@')[0] || u.email || 'utilizador';
}

// A chave onde o SDK guarda o token da sessão (utils/auth-utils do SDK:
// "base44_access_token"). Ler daqui é local e instantâneo — não faz pedido.
const CHAVE_TOKEN = 'base44_access_token';

function temTokenGuardado() {
  try {
    return Boolean(localStorage.getItem(CHAVE_TOKEN));
  } catch {
    return false;
  }
}

function estadoSemConta() {
  utilizadorAtual = null;
  mostrarEstadoUser('sem conta');
  const el = $('user-estado');
  if (el) el.title = 'a app funciona sem conta; entrar é opcional';
  const entrar = $('btn-user-entrar');
  const sair = $('btn-user-sair');
  if (entrar) entrar.hidden = false;
  if (sair) sair.hidden = true;
}

// Vê quem está a usar. Nunca deixa a página em baixo se a Base44 responder mal:
// sem sessão, a app continua a funcionar sem conta.
//
// IMPORTANTE: sem token guardado NÃO se pergunta nada ao servidor. Antes, cada
// visita anónima fazia GET /entities/User/me e levava um 401 (o vermelho na
// consola) para depois mostrar "sem conta" — que já se sabia.
async function verQuemEsta() {
  const entrar = $('btn-user-entrar');
  const sair = $('btn-user-sair');
  mostrarEstadoUser('a ver quem está…');

  if (!temTokenGuardado()) {
    estadoSemConta();
    return null;
  }

  try {
    const base44 = await clienteBase44();
    const u = await base44.auth.me();
    if (u && (u.email || u.full_name)) {
      utilizadorAtual = u;
      mostrarEstadoUser(`👤 ${nomeDoUtilizador(u)}`, true);
      const el = $('user-estado');
      if (el) el.title = [u.full_name, u.email, u.role ? `perfil: ${u.role}` : ''].filter(Boolean).join(' · ');
      if (entrar) entrar.hidden = true;
      if (sair) sair.hidden = false;
      return u;
    }
    throw new Error('sem sessão');
  } catch {
    // O token que lá estava já não vale (expirado, conta apagada…): tira-se, para
    // não voltar a falhar em cada carregamento.
    try {
      const base44 = await clienteBase44();
      base44.auth.logout();
    } catch {
      /* segue sem conta */
    }
    estadoSemConta();
    return null;
  }
}

function erroUser(msg) {
  const el = $('user-erro');
  if (!el) return;
  if (!msg) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.textContent = msg;
}

// Passa o formulário de "Entrar" para "Criar conta" e ao contrário.
function modoFormUser(modo) {
  const criar = modo === 'criar';
  $('user-titulo').textContent = criar ? 'Criar conta' : 'Entrar';
  $('campo-nome').hidden = !criar;
  $('campo-senha').hidden = false;
  $('campo-otp').hidden = true;
  // "Esqueci a palavra-passe" só faz sentido quando se está a entrar.
  const linhaEsqueci = $('linha-esqueci');
  if (linhaEsqueci) linhaEsqueci.hidden = modo !== 'entrar';
  $('link-user-trocar').textContent = criar ? 'Já tem conta? Entrar' : 'Ainda não tem conta? Criar uma';
  $('btn-user-confirmar').textContent = criar ? 'Criar conta' : 'Entrar';
  $('dlg-user').dataset.modo = criar ? 'criar' : 'entrar';
  erroUser('');
}

function abrirDlgUser(modo = 'entrar') {
  modoFormUser(modo);
  const d = $('dlg-user');
  if (d && typeof d.showModal === 'function') d.showModal();
}

// Pede o email de redefinição. O SDK tem este método desde sempre; o modal do
// app simplesmente nunca o ofereceu, e quem esquecia a senha ficava sem saída.
async function pedirRecuperacao(ev) {
  if (ev && ev.preventDefault) ev.preventDefault();
  const email = $('user-email').value.trim();
  if (!email) {
    erroUser('Escreva o seu email em cima e volte a clicar em "Esqueci a palavra-passe".');
    return;
  }
  const btn = $('btn-user-confirmar');
  btn.disabled = true;
  erroUser('');
  try {
    const base44 = await clienteBase44();
    await base44.auth.resetPasswordRequest(email);
    // A resposta é sempre a mesma, exista ou não a conta: não se revela quem tem
    // conta na app a quem escreve um email à sorte.
    toast('Se existir conta com esse email, enviámos um link para redefinir a palavra-passe. Confira também o spam.', 'ok');
  } catch (e) {
    const corpo = e && e.response ? e.response.data : null;
    const msg = String((corpo && (corpo.message || corpo.error)) || (e && e.message) || '');
    erroUser(
      msg
        ? `não consegui pedir a redefinição: ${msg}`
        : 'não consegui pedir a redefinição — tente outra vez',
    );
  } finally {
    btn.disabled = false;
  }
}

async function submeterUser(ev) {
  if (ev && ev.preventDefault) ev.preventDefault();
  const modo = $('dlg-user').dataset.modo || 'entrar';
  const email = $('user-email').value.trim();
  const senha = $('user-senha').value;
  const btn = $('btn-user-confirmar');

  if (!email) return erroUser('Escreva o seu email.');
  if (modo !== 'otp' && senha.length < 6) return erroUser('A palavra-passe precisa de pelo menos 6 caracteres.');

  btn.disabled = true;
  erroUser('');
  btn.textContent = modo === 'criar' ? 'a criar…' : modo === 'otp' ? 'a confirmar…' : 'a entrar…';
  try {
    const base44 = await clienteBase44();

    if (modo === 'criar') {
      const params = { email, password: senha };
      const nome = $('user-nome').value.trim();
      if (nome) params.full_name = nome;
      await base44.auth.register(params);
      // O registo manda um código para o email: é preciso confirmá-lo.
      $('campo-senha').hidden = true;
      $('campo-nome').hidden = true;
      $('campo-otp').hidden = false;
      const linhaEsqueci2 = $('linha-esqueci');
      if (linhaEsqueci2) linhaEsqueci2.hidden = true;
      $('user-titulo').textContent = 'Confirmar o email';
      $('dlg-user').dataset.modo = 'otp';
      erroUser('');
      toast('Enviámos um código para o seu email. Escreva-o para confirmar a conta.', 'ok');
      return;
    }

    if (modo === 'otp') {
      await base44.auth.verifyOtp({ email, otpCode: $('user-otp').value.trim() });
      const u = await verQuemEsta();
      if (u) {
        if (typeof $('dlg-user').close === 'function') $('dlg-user').close();
        toast(`Bem-vindo, ${nomeDoUtilizador(u)}!`, 'ok');
      } else {
        erroUser('A conta foi confirmada, mas não consegui abrir a sessão. Tente entrar.');
        modoFormUser('entrar');
      }
      return;
    }

    const r = await base44.auth.loginViaEmailPassword(email, senha);
    // O token pode vir no corpo ou já ter ficado no cliente; guarda-se se vier.
    const token = r?.access_token || r?.data?.access_token;
    if (token) base44.auth.setToken(token);
    const u = await verQuemEsta();
    if (u) {
      if (typeof $('dlg-user').close === 'function') $('dlg-user').close();
      toast(`Bem-vindo, ${nomeDoUtilizador(u)}!`, 'ok');
    } else {
      erroUser('Entrei, mas não consegui confirmar a sessão. Tente outra vez.');
    }
  } catch (e) {
    const corpo = e?.response?.data;
    const msg = String(corpo?.message || corpo?.error || e?.message || 'não consegui completar o pedido');
    const estado = e?.response?.status ? ` (HTTP ${e.response.status})` : '';
    if (/invalid|incorrect|credential|password/i.test(msg)) erroUser('Email ou palavra-passe não conferem.');
    else if (/not found|404/i.test(msg)) erroUser('A app não está a responder na Base44 (404). Publique a app primeiro — ver o README.');
    else if (/already|exists/i.test(msg)) erroUser('Já existe uma conta com este email. Use "Já tem conta? Entrar".');
    else erroUser(`${msg}${estado}`);
  } finally {
    btn.disabled = false;
    const m = $('dlg-user').dataset.modo || 'entrar';
    btn.textContent = m === 'criar' ? 'Criar conta' : m === 'otp' ? 'Confirmar' : 'Entrar';
  }
}

function sairUser() {
  if (utilizadorAtual && !window.confirm(`Sair da conta de ${nomeDoUtilizador(utilizadorAtual)}?`)) return;
  clienteBase44()
    .then((base44) => {
      try {
        base44.auth.logout();
      } catch {
        /* segue */
      }
      utilizadorAtual = null;
      verQuemEsta();
      toast('Saiu da conta.', '');
    })
    .catch(() => {
      utilizadorAtual = null;
      verQuemEsta();
    });
}

// ---------------------------------------------------------- redefinir senha
// O email de redefinição traz ?token=… (a página React do repositório também lê
// "token"). Sem isto, o link abria o app sem nada para fazer.
function tokenDeReset() {
  try {
    const p = new URLSearchParams(window.location.search);
    return p.get('token') || p.get('reset_token') || '';
  } catch {
    return '';
  }
}

let tokenReset = '';

function erroReset(msg) {
  const el = $('reset-erro');
  if (!el) return;
  el.hidden = !msg;
  if (msg) el.textContent = msg;
}

function abrirResetSePedido() {
  tokenReset = tokenDeReset();
  if (!tokenReset) return;
  const d = $('dlg-reset');
  if (d && typeof d.showModal === 'function') d.showModal();
}

async function submeterReset(ev) {
  if (ev && ev.preventDefault) ev.preventDefault();
  const senha = $('reset-senha').value;
  const senha2 = $('reset-senha2').value;
  const btn = $('btn-reset-confirmar');

  if (!senha || senha.length < 6) return erroReset('A palavra-passe precisa de pelo menos 6 caracteres.');
  if (senha !== senha2) return erroReset('As duas palavras-passe não são iguais.');
  if (!tokenReset) return erroReset('Este link já não tem o código de redefinição. Peça um novo.');

  btn.disabled = true;
  erroReset('');
  btn.textContent = 'a guardar…';
  try {
    const base44 = await clienteBase44();
    await base44.auth.resetPassword({ resetToken: tokenReset, newPassword: senha });
    const d = $('dlg-reset');
    if (d && typeof d.close === 'function') d.close();
    // Tira o token da barra de endereço: já não serve, e não fica no histórico.
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('token');
      url.searchParams.delete('reset_token');
      window.history.replaceState({}, '', url.toString());
    } catch {
      /* segue */
    }
    tokenReset = '';
    toast('Palavra-passe definida. Entre agora com a nova.', 'ok');
    abrirDlgUser('entrar');
  } catch (e) {
    const corpo = e && e.response ? e.response.data : null;
    const msg = String((corpo && (corpo.message || corpo.error)) || (e && e.message) || '');
    if (/expir|invalid|invalid_token/i.test(msg)) {
      erroReset('Este link expirou ou já foi usado. Peça outro na janela de entrada.');
    } else {
      erroReset(msg ? `não consegui guardar a palavra-passe: ${msg}` : 'não consegui guardar a palavra-passe — tente outra vez');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Definir palavra-passe';
  }
}

function arrancar() {
  $('btn-user-entrar').onclick = () => abrirDlgUser('entrar');
  $('btn-user-sair').onclick = sairUser;
  $('btn-user-fechar').onclick = () => {
    if (typeof $('dlg-user').close === 'function') $('dlg-user').close();
  };
  $('form-user').addEventListener('submit', submeterUser);
  const formReset = $('form-reset');
  if (formReset) formReset.addEventListener('submit', submeterReset);
  const btnResetFechar = $('btn-reset-fechar');
  if (btnResetFechar) {
    btnResetFechar.onclick = () => {
      const d = $('dlg-reset');
      if (d && typeof d.close === 'function') d.close();
    };
  }
  const linkEsqueci = $('link-user-esqueci');
  if (linkEsqueci) linkEsqueci.onclick = pedirRecuperacao;
  $('link-user-trocar').onclick = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    modoFormUser($('dlg-user').dataset.modo === 'criar' ? 'entrar' : 'criar');
  };
  // "sem conta" no arranque; a resposta da Base44 substitui isto.
  mostrarEstadoUser('sem conta');
  $('btn-user-entrar').hidden = false;
  // Pergunta quem está, mas sem segurar o arranque da app.
  verQuemEsta();
  // Se o endereço traz o token do email de redefinição, abre já o formulário.
  abrirResetSePedido();
}
