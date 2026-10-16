// ============================================================
//  Rebeca Hub 3.0 (nuvem) — ElevenLabs: vozes e áudio
//
//  Extraído do app.js para o ficheiro principal continuar leve.
//  A chave vive como segredo na Base44; esta página só pede a
//  lista de vozes e o áudio. No plano gratuito a ElevenLabs
//  recusa as vozes da biblioteca (402) — por isso a lista mostra
//  primeiro as vozes da CONTA, que são as que servem.
//  As ligações com o resto da página chegam via iniciar(ctx).
// ============================================================

const $ = (id) => document.getElementById(id);

let state = null;
let toast = () => {};
let guardar = () => {};

export function iniciar(ctx) {
  state = ctx.state;
  toast = ctx.toast;
  guardar = ctx.guardar;
}

// A pré-escuta guardada pertence à voz que a gerou. Ao mudar de voz, tem de ser
// deitada fora — senão o botão "Ouvir" continuava a tocar a voz antiga e
// parecia que a escolha não tinha efeito.
function limparPrevias() {
  state.scenes.forEach((s) => {
    if (s.previaUrl) {
      URL.revokeObjectURL(s.previaUrl);
      s.previaUrl = null;
      s.previaVoz = '';
    }
  });
}

// Marca a voz escolhida em AMBAS as listas (app e conta) e atualiza o estado.
// Antes isto só limpava os botões da mesma secção: escolher uma voz da conta
// deixava uma do app marcada ao mesmo tempo, e parecia que a escolha não pegava.
function marcarVozEleven(id) {
  if (state.vozEleven !== id) limparPrevias();
  state.vozEleven = id || '';
  const v = state.vozesEleven.find((x) => x.id === id);
  ['vozes-app', 'vozes-conta'].forEach((qual) => {
    [...$(qual).children].forEach((b) => b.classList.toggle('on', b.dataset.id === id));
  });
  $('voz-estado').textContent = v
    ? `ElevenLabs · ${v.rotuloDoApp || v.nome}`
    : id
      ? `ElevenLabs · ${id.slice(0, 8)}…`
      : 'ElevenLabs · escolha uma voz';
  guardar();
}

export function desenharVozesEleven(dados) {
  const app = $('vozes-app');
  const conta = $('vozes-conta');
  app.innerHTML = '';
  conta.innerHTML = '';
  state.vozesEleven = dados.vozes || [];

  const doApp = state.vozesEleven.filter((v) => v.doApp);
  const daConta = state.vozesEleven.filter((v) => !v.doApp);
  $('linha-vozes-app').hidden = doApp.length === 0;
  $('linha-vozes-conta').hidden = daConta.length === 0;

  const criar = (v, caixa) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.id = v.id;
    b.textContent = v.rotuloDoApp || v.nome;
    b.title =
      `${v.nome}${v.categoria ? ` [${v.categoria}]` : ''}${v.descricao ? ` — ${v.descricao}` : ''}` +
      `\nid: ${v.id}\nClique para usar esta voz na narração.`;
    b.onclick = () => marcarVozEleven(v.id);
    caixa.append(b);
  };

  doApp.forEach((v) => criar(v, app));
  daConta.forEach((v) => criar(v, conta));

  // Escolhe uma por omissão: a que já estava escolhida; senão a primeira da
  // CONTA (o plano gratuito aceita essas); senão a primeira do app.
  const preferida = state.vozesEleven.find((v) => v.id === state.vozEleven) || daConta[0] || doApp[0];
  marcarVozEleven(preferida ? preferida.id : '');
}

export function estadoEleven(msg, tipo = '') {
  const el = $('eleven-estado');
  if (!msg) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.className = `cfg-result ${tipo}`;
  el.textContent = msg;
}

export async function carregarVozesEleven() {
  const btn = $('btn-carregar-vozes');
  btn.disabled = true;
  estadoEleven('a pedir as vozes à ElevenLabs…', 'wait');
  try {
    const { base44 } = await import('@/base44Client.js');
    let d;
    try {
      const r = await base44.functions.invoke('listElevenVoices', {});
      d = r?.data && !r.ok ? r.data : r;
    } catch (e) {
      d = e?.response?.data || { ok: false, error: e?.message };
    }
    if (!d?.ok) {
      estadoEleven(`❌ ${d?.error || 'não consegui obter as vozes'}`, 'err');
      return;
    }
    if (!d.vozes?.length) {
      estadoEleven('⚠️ A sua conta não tem vozes. Crie uma em elevenlabs.io e tente de novo.', 'err');
      return;
    }
    desenharVozesEleven(d);
    const quantasConta = d.vozes.filter((v) => !v.doApp).length;
    const marcada = d.vozes.find((v) => v.id === state.vozEleven);
    estadoEleven(
      `✅ ${d.total} voz(es) na sua conta (${quantasConta} suas, ${d.total - quantasConta} do app).` +
        (marcada ? ` Voz escolhida: "${marcada.nome}".` : '') +
        (d.biblioteca ? ' As do app podem ser recusadas se o plano for gratuito.' : ''),
      'ok',
    );
  } catch (e) {
    estadoEleven(`❌ ${e.message}`, 'err');
  } finally {
    btn.disabled = false;
  }
}

// Gera o áudio de UMA cena pela ElevenLabs e devolve o blob.
export async function audioDaEleven(texto) {
  if (!state.vozEleven) throw new Error('escolha uma voz da ElevenLabs (clique em "Carregar as minhas vozes")');
  const { base44 } = await import('@/base44Client.js');
  let d;
  try {
    const r = await base44.functions.invoke('narrateEleven', {
      texto,
      voz: state.vozEleven,
      tom: state.tom,
    });
    d = r?.data && !r.ok ? r.data : r;
  } catch (e) {
    d = e?.response?.data || { ok: false, error: e?.message };
  }
  if (!d?.ok) {
    // Leva as tentativas para a mensagem: quando a ElevenLabs recusa, é a lista
    // de tentativas que diz se o problema é a chave ou o modelo/plano.
    const det = (d.tentativas || []).map((t) => `${t.modelo}: HTTP ${t.http} — ${t.erro}`).join(' | ');
    const err = new Error(d?.error || 'a ElevenLabs não gerou o áudio');
    err.tentativas = det;
    if (det) console.warn('Tentativas da ElevenLabs:', det);
    throw err;
  }
  // Se o plano recusou o modelo preferido, o servidor usou outro: dizemo-lo.
  if (d.nota) toast(d.nota, '');
  const bin = atob(d.audioB64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return {
    blob: new Blob([bytes], { type: d.tipo || 'audio/mpeg' }),
    ext: 'mp3',
    caracteres: d.caracteres,
    // O servidor confirma qual voz usou — é o que prova que a escolha pegou.
    nomeVoz: d.nomeVoz || '',
    voz: d.voz || state.vozEleven,
    modelo: d.modelo || '',
  };
}
