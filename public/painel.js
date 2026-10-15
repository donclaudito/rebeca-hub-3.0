// ============================================================
//  Rebeca Hub 3.0 (nuvem) — Painel de vídeos prontos
//
//  Vista inicial do app: reúne os vídeos já gerados e guardados
//  na nuvem, com os detalhes de cada um, prontos para subir ao
//  YouTube. O estúdio fica em "#estudio" (botão 🎙️ Estúdio).
//
//  Este módulo é independente do app.js: troca de vista guarda o
//  estado em localStorage("rh3vista") e avisa com o evento
//  "rh-vista", que o estúdio usa para voltar a mostrar o ecrã.
// ============================================================

const $ = (id) => document.getElementById(id);

let lista = [];

// ---------------------------------------------------------------- formato
const formatarMinutos = (s) => {
  const t = Math.max(0, Math.round(Number(s) || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
const formatarTamanho = (b) => {
  const mb = (Number(b) || 0) / 1048576;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round((Number(b) || 0) / 1024)} kB`;
};
const formatarData = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

let toastTimer;
function toast(msg, kind = '') {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `toast ${kind}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), kind === 'err' ? 9000 : 4200);
}

// ---------------------------------------------------------------- nuvem
async function cliente() {
  const { base44 } = await import('@/base44Client.js');
  return base44;
}

// Ficheiros de vídeo ficam no armazenamento privado: abrem por URL assinado.
async function assinar(uri, expira = 600) {
  const b = await cliente();
  const r = await b.integrations.Core.CreateFileSignedUrl({ file_uri: uri, expires_in: expira });
  return r.signed_url;
}

// ---------------------------------------------------------------- vistas
function hashAtual() {
  try {
    return String(window.location.hash || '');
  } catch {
    return '';
  }
}

function avisarVista() {
  try {
    window.dispatchEvent(new Event('rh-vista'));
  } catch {
    /* sem janela (testes) */
  }
}

// O PAINEL É A PÁGINA INICIAL: ao abrir o app sem destino, chega-se aqui.
// "#estudio" abre o estúdio diretamente (link, favorito, "Abrir o estúdio").
function mostrarVista(vista) {
  const noPainel = vista !== 'estudio';
  try {
    localStorage.setItem('rh3vista', noPainel ? 'painel' : 'estudio');
  } catch {
    /* modo privado */
  }
  const drop = $('drop');
  const ws = $('workspace');
  const secao = $('painel-section');
  const pesq = $('pesquisa-section');
  const btnPainel = $('btn-ir-painel');
  const btnEstudio = $('btn-ir-estudio');
  if (pesq) pesq.hidden = true;
  if (drop) drop.hidden = noPainel;
  if (secao) secao.hidden = !noPainel;
  if (ws) ws.hidden = noPainel || !ws.hidden; // ao voltar, o estúdio decide (updateLayout)
  if (btnPainel) btnPainel.hidden = noPainel;
  if (btnEstudio) btnEstudio.hidden = !noPainel;
  if (noPainel) carregar();
  avisarVista();
}

// ---------------------------------------------------------------- resumo
function desenharResumo() {
  const total = $('resumo-total');
  const tempo = $('resumo-tempo');
  const tamanho = $('resumo-tamanho');
  if (!total) return;
  total.textContent = String(lista.length);
  if (tempo) tempo.textContent = formatarMinutos(lista.reduce((s, p) => s + (Number(p.duracao) || 0), 0));
  if (tamanho) tamanho.textContent = formatarTamanho(lista.reduce((s, p) => s + (Number(p.video_tamanho) || 0), 0));
}

// ---------------------------------------------------------------- lista
function miniatura(p) {
  const m = document.createElement('div');
  m.className = 'miniatura';
  if (p.thumbUrl) {
    const img = document.createElement('img');
    img.src = p.thumbUrl;
    img.alt = '';
    img.loading = 'lazy';
    m.append(img);
  } else {
    const ic = document.createElement('span');
    ic.className = 'icone';
    ic.textContent = '🎬';
    m.append(ic);
  }
  const t = document.createElement('span');
  t.className = 'tempo';
  t.textContent = formatarMinutos(p.duracao);
  m.append(t);
  return m;
}

function nomeFicheiroDe(p) {
  const limpo = String(p.nome || 'video').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
  return `${limpo || 'video'}.webm`;
}

function cartao(p) {
  const c = document.createElement('article');
  c.className = 'video-cartao';

  const corpo = document.createElement('div');
  corpo.className = 'cartao-corpo';

  const nome = document.createElement('div');
  nome.className = 'cartao-nome';
  nome.textContent = p.nome || 'Sem nome';
  nome.title = p.nome || '';

  const meta = document.createElement('div');
  meta.className = 'cartao-meta';
  meta.textContent = `${p.formato || '—'} · ${formatarTamanho(p.video_tamanho)} · ${formatarData(p.created_date)}`;

  const et = document.createElement('div');
  et.className = 'etiquetas';
  if (p.comVoz) {
    const e = document.createElement('span');
    e.className = 'etiqueta sim';
    e.textContent = `🎙️ ${p.motorVoz || 'com voz'}${p.vozUsada ? ` · ${p.vozUsada}` : ''}`;
    et.append(e);
  }
  if (p.comMusica) {
    const e = document.createElement('span');
    e.className = 'etiqueta';
    e.textContent = `🎵 ${p.musicaNome || 'com música'}`;
    et.append(e);
  }
  if ((p.legendas || 0) > 0) {
    const e = document.createElement('span');
    e.className = 'etiqueta';
    e.textContent = `💬 ${p.legendas} legenda(s)`;
    et.append(e);
  }

  const acoes = document.createElement('div');
  acoes.className = 'cartao-acoes';
  const ver = document.createElement('button');
  ver.type = 'button';
  ver.className = 'primary small';
  ver.textContent = '▶️ Ver detalhes';
  ver.onclick = () => abrirDetalhes(p);
  const descarregar = document.createElement('button');
  descarregar.type = 'button';
  descarregar.className = 'ghost small';
  descarregar.textContent = '⬇️';
  descarregar.title = 'descarregar o ficheiro do vídeo';
  descarregar.onclick = () => descarregarVideo(p);
  const apagar = document.createElement('button');
  apagar.type = 'button';
  apagar.className = 'ghost small danger';
  apagar.textContent = '🗑';
  apagar.title = 'apagar do painel';
  apagar.onclick = () => apagarVideo(p);
  acoes.append(ver, descarregar, apagar);

  corpo.append(nome, meta, et, acoes);
  c.append(miniatura(p), corpo);
  return c;
}

function desenharLista() {
  const grade = $('grade');
  if (!grade) return;
  grade.innerHTML = '';
  const vazio = $('painel-vazio');
  if (vazio) vazio.hidden = lista.length > 0;
  for (const p of lista) grade.append(cartao(p));
  desenharResumo();
}

// ---------------------------------------------------------------- detalhes
function detalhe(rotulo, valor) {
  const d = document.createElement('div');
  d.className = 'detalhe';
  const s = document.createElement('span');
  s.textContent = rotulo;
  const b = document.createElement('b');
  b.textContent = valor;
  d.append(s, b);
  return d;
}

async function abrirDetalhes(p) {
  const dlg = $('dlg-detalhes');
  if (!dlg) return;
  const titulo = $('det-titulo');
  if (titulo) titulo.textContent = p.nome || 'Sem nome';

  const caixa = $('det-video-caixa');
  if (caixa) {
    caixa.innerHTML = '';
    if (p.video_uri) {
      const aviso = document.createElement('div');
      aviso.className = 'sem-video';
      aviso.textContent = 'a abrir o vídeo…';
      caixa.append(aviso);
      try {
        const url = await assinar(p.video_uri, 3600);
        caixa.innerHTML = '';
        const v = document.createElement('video');
        v.src = url;
        v.controls = true;
        v.playsInline = true;
        caixa.append(v);
      } catch (e) {
        caixa.innerHTML = '';
        const sv = document.createElement('div');
        sv.className = 'sem-video';
        sv.textContent = `Não consegui abrir o vídeo: ${e.message}`;
        caixa.append(sv);
      }
    } else {
      const sv = document.createElement('div');
      sv.className = 'sem-video';
      sv.textContent = 'O ficheiro deste vídeo não está disponível.';
      caixa.append(sv);
    }
  }

  const grade = $('det-detalhes');
  if (grade) {
    grade.innerHTML = '';
    grade.append(
      detalhe('Duração', formatarMinutos(p.duracao)),
      detalhe('Tamanho', formatarTamanho(p.video_tamanho)),
      detalhe('Formato', p.formato || '—'),
      detalhe('Codec', String(p.codec || '—').toUpperCase()),
      detalhe('Transição', p.transicao || '—'),
      detalhe('Voz', p.comVoz ? `${p.motorVoz || 'sim'}${p.vozUsada ? ` · ${p.vozUsada}` : ''}` : 'sem voz'),
      detalhe('Música', p.comMusica ? p.musicaNome || 'sim' : 'sem música'),
      detalhe('Legendas', (p.legendas || 0) > 0 ? `${p.legendas} bloco(s)` : 'sem legendas'),
      detalhe('Gerado em', formatarData(p.created_date)),
    );
  }

  const btn = $('btn-det-descarregar');
  if (btn) btn.onclick = () => descarregarVideo(p);
  const yt = $('btn-det-ir-youtube');
  if (yt) yt.onclick = () => window.open('https://studio.youtube.com', '_blank', 'noopener');

  if (typeof dlg.showModal === 'function') dlg.showModal();
}

// ---------------------------------------------------------------- descarregar / apagar
function descarregarBlob(blob, nome) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

async function descarregarVideo(p) {
  if (!p.video_uri) return toast('Este vídeo não tem ficheiro disponível.', 'err');
  try {
    toast(`A preparar ${nomeFicheiroDe(p)}…`);
    const url = await assinar(p.video_uri, 600);
    const r = await fetch(url);
    if (!r.ok) throw new Error(`o ficheiro não respondeu (HTTP ${r.status})`);
    descarregarBlob(await r.blob(), nomeFicheiroDe(p));
  } catch (e) {
    toast(`Não consegui descarregar: ${e.message}`, 'err');
  }
}

async function apagarVideo(p) {
  if (!window.confirm(`Apagar "${p.nome}" do painel? O vídeo deixa de estar disponível aqui.`)) return;
  try {
    const b = await cliente();
    await b.entities.VideoProducao.delete(p.id);
    toast('Vídeo apagado do painel.', '');
    carregar();
  } catch (e) {
    toast(`Não consegui apagar: ${e.message}`, 'err');
  }
}

// ---------------------------------------------------------------- carregar
async function carregar() {
  const btn = $('btn-recarregar');
  if (btn) btn.disabled = true;
  try {
    const b = await cliente();
    const page = await b.entities.VideoProducao.filter({}, { sort: '-created_date', limit: 50 });
    const itens = page.items || [];
    // As miniaturas vêm de ficheiros privados: um URL assinado por cartão.
    for (const p of itens) {
      if (p.thumb_uri) {
        try {
          p.thumbUrl = await assinar(p.thumb_uri, 600);
        } catch {
          p.thumbUrl = '';
        }
      }
    }
    lista = itens;
    const av = $('aviso-painel');
    if (av) av.hidden = true;
  } catch (e) {
    lista = [];
    const av = $('aviso-painel');
    if (av) {
      av.hidden = false;
      av.textContent = `Não consegui carregar os vídeos: ${e.message}`;
    }
  } finally {
    if (btn) btn.disabled = false;
  }
  desenharLista();
}

// ---------------------------------------------------------------- arranque
// Botoeiros e estado inicial — corre já com o DOM analisado (script de módulo).
if (typeof window !== 'undefined') {
  const irPainel = $('btn-ir-painel');
  if (irPainel) irPainel.onclick = () => mostrarVista('painel');
  const irEstudio = $('btn-ir-estudio');
  if (irEstudio) irEstudio.onclick = () => mostrarVista('estudio');
  const recarregar = $('btn-recarregar');
  if (recarregar) recarregar.onclick = () => carregar();
  const fechar = $('btn-det-fechar');
  if (fechar) {
    fechar.onclick = () => {
      const dlg = $('dlg-detalhes');
      const v = dlg && dlg.querySelector('video');
      if (v) v.pause();
      if (dlg && typeof dlg.close === 'function') dlg.close();
    };
  }
  // O estúdio pede para abrir o painel (botão "📺 Ver no painel").
  window.addEventListener('rh-abrir-painel', () => mostrarVista('painel'));
  const irPainelDoVideo = $('btn-video-painel');
  if (irPainelDoVideo) irPainelDoVideo.onclick = () => mostrarVista('painel');
  const irEstudioVazio = $('btn-ir-estudio-vazio');
  if (irEstudioVazio) irEstudioVazio.onclick = () => mostrarVista('estudio');
  // Novo projeto a partir do painel: abre o estúdio JÁ LIMPO, sem puxar
  // nenhum projeto anterior. O estúdio (app.js) ouve "rh-novo-projeto".
  const painelNovo = $('btn-painel-novo');
  if (painelNovo) {
    painelNovo.onclick = () => {
      mostrarVista('estudio');
      try {
        window.dispatchEvent(new Event('rh-novo-projeto'));
      } catch {
        /* sem janela (testes) */
      }
    };
  }
  // Vista inicial: "#estudio" abre o estúdio; em todos os outros casos, o painel.
  mostrarVista(/estudio/.test(hashAtual()) ? 'estudio' : 'painel');
}
