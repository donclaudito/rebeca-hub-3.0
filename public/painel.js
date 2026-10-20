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

// Quanto tempo vale um URL assinado de MINIATURA.
//
// Era 10 minutos (600 s) — e o Painel pode ficar aberto horas. As miniaturas
// usam `loading="lazy"`: o browser só pede o ficheiro quando o cartão entra no
// ecrã, por isso bastava rolar a página meia hora depois de a abrir para o
// pedido chegar com o token expirado e a imagem dar 401. Um dia inteiro cobre o
// uso normal; e mesmo depois disso há a renovação automática (ver `miniatura`).
const VALIDADE_MINIATURA = 24 * 60 * 60; // 24 horas

// ---------------------------------------------------------------- URLs assinados
//
// O trabalho pesado (cache, fila de um pedido de cada vez, recuo no 429) está em
// `urls-assinados.mjs`, que é o MESMO para o Painel e para os projetos da nuvem: a
// Base44 respondia **429 Too Many Requests** quando o Painel pedia um URL por cada
// miniatura de uma vez (12 vídeos = 12 pedidos seguidos).
let modUrls = null;

const pedirUrlAoCliente = async (uri, expira) => {
  const b = await cliente();
  const r = await b.integrations.Core.CreateFileSignedUrl({ file_uri: uri, expires_in: expira });
  return (r && r.signed_url) || '';
};

// Ficheiros de vídeo ficam no armazenamento privado: abrem por URL assinado.
// `expira` em segundos. `renovar` ignora o URL em cache (pedido de um novo).
async function assinar(uri, expira = VALIDADE_MINIATURA, { renovar = false } = {}) {
  if (!uri) return '';
  if (!modUrls) modUrls = await import('./urls-assinados.mjs');
  return modUrls.assinar(uri, expira, { pedir: pedirUrlAoCliente, renovar });
}

// O módulo avisa quando desiste por causa do 429; aqui explica-se em português.
function avisarLimite() {
  const av = $('aviso-painel');
  if (av) {
    av.hidden = false;
    av.textContent =
      'A Base44 está a limitar pedidos (429). As miniaturas aparecem à medida que forem possíveis — recarregue dentro de um minuto. Os vídeos estão guardados.';
  }
}

try {
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('rh-limite-pedidos', avisarLimite);
  }
} catch {
  /* sem janela (testes) */
}

// Chama `fn` quando o elemento entrar no ecrã. Sem IntersectionObserver
// (browsers antigos, testes), chama já — o comportamento antigo.
function quandoVisivel(el, fn) {
  try {
    if (typeof IntersectionObserver !== 'function') {
      fn();
      return;
    }
    const obs = new IntersectionObserver((entradas) => {
      if (entradas.some((e) => e.isIntersecting)) {
        obs.disconnect();
        fn();
      }
    });
    obs.observe(el);
  } catch {
    fn();
  }
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
//
// REGRA ÚNICA, para a navegação não piscar: cada vista manda em TUDO o que é da
// vista. Antes, o estúdio ficava com `ws.hidden = noPainel || !ws.hidden` — uma
// expressão que dependia do estado anterior — e o ecrã inicial (a zona de
// arrastar imagens) só era escondido pelo painel. Se o estúdio corresse depois
// (o app.js arranca no DOMContentLoaded, que vem DEPOIS destes módulos), voltava
// a mostrar o ecrã inicial por cima do painel: era isso que fazia o botão
// "📺 Painel" parecer que ia para a página inicial, e só à segunda tentativa
// funcionar.
function mostrarVista(vista) {
  const noPainel = vista !== 'estudio';
  try {
    localStorage.setItem('rh3vista', noPainel ? 'painel' : 'estudio');
    // O hash acompanha a vista, para o botão "voltar" do browser e um favorito
    // darem no mesmo sítio. Sem `hashchange` a disparar recargas.
    const alvo = noPainel ? '' : '#estudio';
    if (typeof history !== 'undefined' && history.replaceState) {
      history.replaceState(null, '', `${location.pathname}${location.search}${alvo}`);
    }
  } catch {
    /* modo privado ou sem histórico */
  }

  const vistas = {
    drop: $('drop'),
    workspace: $('workspace'),
    painel: $('painel-section'),
    pesquisa: $('pesquisa-section'),
  };

  // A pesquisa é uma vista à parte: qualquer outra vista a esconde.
  if (vistas.pesquisa) vistas.pesquisa.hidden = true;

  if (noPainel) {
    // Painel: a zona de arrastar e o estúdio SAEM DE CENA, sempre.
    if (vistas.drop) vistas.drop.hidden = true;
    if (vistas.workspace) vistas.workspace.hidden = true;
    if (vistas.painel) vistas.painel.hidden = false;
  } else {
    // Estúdio: a zona de arrastar só aparece sem imagens; quem decide é o
    // updateLayout do app.js (avisado por "rh-vista" mais abaixo).
    if (vistas.painel) vistas.painel.hidden = true;
    if (vistas.drop) vistas.drop.hidden = false;
    if (vistas.workspace) vistas.workspace.hidden = false;
  }

  const btnPainel = $('btn-ir-painel');
  const btnEstudio = $('btn-ir-estudio');
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

  // O ícone fica SEMPRE lá; a imagem tapa-o quando chega. Assim nunca há
  // quadrado vazio à espera do URL assinado.
  const ic = document.createElement('span');
  ic.className = 'icone';
  ic.textContent = '🎬';
  m.append(ic);

  if (p.thumb_uri) {
    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    // `display` em linha e não o atributo `hidden`: o CSS da miniatura tem
    // `.miniatura img { display: block }`, que ganha ao `hidden` do browser — a
    // imagem apareceria partida enquanto o URL não chega.
    img.style.display = 'none';
    const mostrar = () => {
      img.style.display = '';
      ic.hidden = true;
    };
    const esconder = () => {
      img.style.display = 'none';
      ic.hidden = false;
    };
    img.onload = mostrar;
    img.onerror = () => {
      // O URL pode ter expirado (fica guardado 24 h). Pede um NOVO uma vez —
      // pelo caminho da fila, para não voltar a fazer rajada.
      if (img.dataset.renovado === '1') {
        esconder();
        return;
      }
      img.dataset.renovado = '1';
      p.thumbUrl = '';
      assinar(p.thumb_uri, VALIDADE_MINIATURA, { renovar: true })
        .then((url) => {
          if (!url) return;
          p.thumbUrl = url;
          img.src = url;
        })
        .catch(() => {
          /* sem miniatura renovada, fica o ícone */
        });
    };
    m.append(img);

    if (p.thumbUrl) {
      img.src = p.thumbUrl;
    } else {
      // Só se pede o URL quando o cartão APARECE no ecrã: é isto que evita
      // 12 pedidos de uma vez ao abrir o Painel (o 429 da Base44).
      quandoVisivel(m, () => {
        if (p.thumbUrl) {
          img.src = p.thumbUrl;
          return;
        }
        assinar(p.thumb_uri)
          .then((url) => {
            if (!url) return;
            p.thumbUrl = url;
            img.src = url;
          })
          .catch(() => {
            /* o ícone continua */
          });
      });
    }
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
  const reedit = document.createElement('button');
  reedit.type = 'button';
  reedit.className = 'ghost small';
  reedit.textContent = '✏️';
  reedit.title = 'Reeditar projeto';
  reedit.onclick = () => reeditar(p);
  const yt = document.createElement('button');
  yt.type = 'button';
  yt.className = 'ghost small';
  yt.textContent = '📤';
  yt.title = 'Preparar envio ao YouTube';
  yt.onclick = () => prepararYouTube(p);
  acoes.append(ver, yt, reedit, descarregar, apagar);

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
  const re = $('btn-det-reeditar');
  if (re) re.onclick = () => reeditar(p);
  const yt = $('btn-det-ir-youtube');
  if (yt) yt.onclick = () => prepararYouTube(p);

  if (typeof dlg.showModal === 'function') dlg.showModal();
}

// ---------------------------------------------------------------- preparar envio ao YouTube
// Envio MANUAL: a app não conecta conta nenhuma. Ao confirmar, baixa o
// vídeo e abre o YouTube Studio, onde o upload é feito à mão.
let videoYouTube = null;

function prepararYouTube(p) {
  const dlg = $('dlg-youtube');
  if (!dlg) return;
  videoYouTube = p;
  const titulo = $('yt-titulo');
  if (titulo) titulo.textContent = p.nome || 'Sem nome';
  const info = $('yt-info');
  if (info) {
    info.innerHTML = '';
    info.append(
      detalhe('Vídeo', p.nome || '—'),
      detalhe('Duração', formatarMinutos(p.duracao)),
      detalhe('Tamanho', formatarTamanho(p.video_tamanho)),
      detalhe('Formato', p.formato || '—'),
    );
  }
  dlg.showModal();
}

function confirmarYouTube() {
  const p = videoYouTube;
  const dlg = $('dlg-youtube');
  if (!p || !dlg) return;
  dlg.close();
  descarregarVideo(p);
  window.open('https://studio.youtube.com', '_blank', 'noopener');
}

// ---------------------------------------------------------------- reeditar
// Volta ao estúdio com o PROJETO ORIGINAL do vídeo (cenas, narração e
// preferências), que vive no IndexedDB deste computador. Confirma que o
// projeto existe ANTES de trocar de vista — assim nunca se limpa o trabalho
// aberto no estúdio sem haver projeto para abrir.
async function reeditar(p) {
  // PRIMEIRO, fechar a janela de detalhes. O botão "✏️ Reeditar projeto" vive
  // dentro dela: sem isto, a vista mudava por baixo mas a janela continuava
  // ABERTA por cima do estúdio (e a bloquear os cliques, por ser modal) — dava
  // a impressão de que o botão não fazia nada.
  fecharJanelas();
  toast(`A abrir o projeto de "${p.nome || 'este vídeo'}"…`, '');
  let projeto = null;
  const mod = await import('./projetos.mjs');
  // Caminho normal: o vídeo sabe qual é o projeto dele.
  if (p.projetoId) {
    try {
      projeto = await mod.lerProjeto(p.projetoId);
    } catch {
      projeto = null;
    }
  }
  // Vídeos antigos, guardados antes de a app ligar vídeos a projetos: procura
  // um projeto guardado NESTE computador com o mesmo nome do vídeo.
  if (!projeto) {
    try {
      const todos = await mod.listarProjetos();
      const nome = String(p.nome || '').trim().toLowerCase();
      projeto = (todos || []).find((x) => String(x.nome || '').trim().toLowerCase() === nome) || null;
    } catch {
      projeto = null;
    }
  }
  // Última tentativa: a NUVEM. O projeto pode estar guardado na app — por
  // id (vídeos guardados com projeto na nuvem) ou pelo nome do vídeo.
  // Só IDs da nuvem (24 caracteres hexadecimais) valem uma procura por id:
  // os projetos só-deste-computador têm ids de UUID, e perguntar à nuvem por
  // eles só devolvia um 404 no registo da app.
  if (!projeto) {
    try {
      const nuvem = await import('./projeto-nuvem.mjs');
      const idDaNuvem = /^[0-9a-f]{24}$/i.test(String(p.projetoId || ''));
      if (idDaNuvem) projeto = await nuvem.lerProjetoNuvem(p.projetoId);
      if (!projeto && p.nome) projeto = await nuvem.procurarProjetoNuvemPorNome(p.nome);
    } catch {
      projeto = null;
    }
  }
  if (!projeto) {
    toast(`O projeto original de "${p.nome || 'este vídeo'}" não está neste computador nem na nuvem. Abra o vídeo no estúdio e clique em ☁️ Guardar na nuvem para o poder reeditar em qualquer lugar.`, 'err');
    return;
  }
  // Troca de vista ANTES de pedir ao estúdio para carregar: o estúdio fica à
  // vista mesmo que o carregamento do projeto se atrase.
  mostrarVista('estudio');
  try {
    window.dispatchEvent(new CustomEvent('rh-reeditar-projeto', { detail: { id: projeto.id } }));
  } catch {
    /* sem janela (testes) */
  }
  // No telemóvel/portátil a vista pode ficar a meio da página: volta ao topo
  // para se ver o projeto a aparecer.
  try {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch {
    /* sem janela */
  }
}

// Fecha as janelas que ficam POR CIMA da página (modais). Sem isto, mudar de
// vista com uma janela aberta não se nota e os cliques deixam de responder.
function fecharJanelas() {
  for (const id of ['dlg-detalhes', 'dlg-youtube', 'dlg']) {
    const d = $(id);
    if (d && typeof d.close === 'function' && d.open !== false) {
      try {
        d.close();
      } catch {
        /* já fechada */
      }
    }
  }
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
    const url = await assinar(p.video_uri, 3600);
    const r = await fetch(url);
    if (!r.ok) throw new Error(`o ficheiro não respondeu (HTTP ${r.status})`);
    descarregarBlob(await r.blob(), nomeFicheiroDe(p));
  } catch (e) {
    toast(`Não consegui descarregar: ${e.message}`, 'err');
  }
}

// Vídeos que o SERVIDOR já não tem (ou não deixa apagar): ficam guardados aqui
// para não voltarem a aparecer no Painel. Sem isto, o cartão voltava na lista a
// cada atualização e o utilizador clicava em 🗑 outra vez — um 404 atrás do
// outro, sem fim.
const CACHE_OCULTOS = 'rh3ocultos';

function lerOcultos() {
  try {
    const cru = localStorage.getItem(CACHE_OCULTOS);
    const arr = cru ? JSON.parse(cru) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function ocultarDoPainel(id) {
  if (!id) return;
  const ocultos = lerOcultos();
  ocultos.add(String(id));
  try {
    localStorage.setItem(CACHE_OCULTOS, JSON.stringify([...ocultos]));
  } catch {
    /* modo privado: fica só nesta sessão */
  }
  lista = lista.filter((x) => x.id !== id);
  desenharLista();
}

// O servidor respondeu "não existe"? (404, ou uma mensagem que o diga.)
function naoExisteNoServidor(e) {
  const texto = `${(e && e.status) || ''} ${(e && e.message) || e}`;
  return /404|not found|não existe|nao existe/i.test(texto);
}

async function apagarVideo(p) {
  if (!window.confirm(`Apagar "${p.nome}" do painel? O vídeo deixa de estar disponível aqui.`)) return;
  try {
    const b = await cliente();
    await b.entities.VideoProducao.delete(p.id);
    ocultarDoPainel(p.id);
    toast('Vídeo apagado do painel.', '');
    carregar();
  } catch (e) {
    // 404 = o vídeo já tinha sido apagado (noutra janela, noutro computador, ou
    // o registo pertence a outra conta). Antes mostrava-se "não consegui apagar"
    // e o cartão continuava lá: cada tentativa era outro 404.
    if (naoExisteNoServidor(e)) {
      ocultarDoPainel(p.id);
      toast('Este vídeo já não existe no servidor. Retirei-o do Painel.', '');
      return;
    }
    toast(`Não consegui apagar: ${(e && e.message) || e}`, 'err');
  }
}

// ---------------------------------------------------------------- carregar
// `jaAssinadas` = reaproveita os URLs que a lista já tinha. Já não se assina
// TUDO ao carregar: cada miniatura pede o seu URL quando aparece no ecrã
// (ver `miniatura`) — e, se estiver em cache, é instantâneo, sem pedido nenhum.
// Era esta assinatura em rajada que dava o 429.
async function carregar({ jaAssinadas = true } = {}) {
  const btn = $('btn-recarregar');
  if (btn) btn.disabled = true;
  try {
    const b = await cliente();
    const page = await b.entities.VideoProducao.filter({}, { sort: '-created_date', limit: 50 });
    const ocultos = lerOcultos();
    // Vídeos que o servidor já não tem (ou não deixa apagar) não voltam a
    // aparecer: sem isto, o cartão reaparecia a cada atualização.
    const itens = (page.items || []).filter((p) => !ocultos.has(String(p.id)));
    const anteriores = new Map(lista.map((p) => [p.id, p.thumbUrl]));
    for (const p of itens) {
      // Reaproveita o URL que já se tinha; senão fica vazio e a miniatura pede-o
      // quando aparecer no ecrã (o `assinar` devolve-o da cache quando existe).
      p.thumbUrl = jaAssinadas ? anteriores.get(p.id) || '' : '';
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

// ---------------------------------------------------------------- links
// Links cadastrados pelo utilizador: assunto + endereço. Clicar abre a página.
async function carregarLinks() {
  const b = await cliente();
  const page = await b.entities.Link.filter({}, { sort: '-created_date', limit: 100 });
  return page.items || [];
}

function desenharLinks(itens) {
  const ul = $('links-ul');
  if (!ul) return;
  ul.innerHTML = '';
  const vazio = $('links-vazio');
  if (vazio) vazio.hidden = itens.length > 0;
  for (const p of itens) {
    const li = document.createElement('li');
    li.className = 'links-li';
    const abrir = document.createElement('button');
    abrir.type = 'button';
    abrir.className = 'links-abrir';
    abrir.title = p.url;
    abrir.textContent = p.assunto || p.url;
    // O clique abre a página do link numa janela nova.
    abrir.onclick = () => window.open(p.url, '_blank', 'noopener');
    const meta = document.createElement('span');
    meta.className = 'links-url';
    meta.textContent = p.url;
    const apagar = document.createElement('button');
    apagar.type = 'button';
    apagar.className = 'ghost small danger';
    apagar.textContent = '🗑';
    apagar.title = 'excluir este link';
    apagar.onclick = () => excluirLink(p);
    li.append(abrir, meta, apagar);
    ul.append(li);
  }
}

async function excluirLink(p) {
  if (!window.confirm(`Excluir o link "${p.assunto || p.url}"?`)) return;
  try {
    const b = await cliente();
    await b.entities.Link.delete(p.id);
    await mostrarLinks();
    toast('Link excluído.', '');
  } catch (e) {
    toast(`Não consegui excluir: ${e.message}`, 'err');
  }
}

async function mostrarLinks() {
  try {
    desenharLinks(await carregarLinks());
    const av = $('links-erro');
    if (av) av.hidden = true;
  } catch (e) {
    const av = $('links-erro');
    if (av) {
      av.hidden = false;
      av.textContent = `Não consegui carregar os links: ${e.message}`;
    }
  }
}

function iniciarLinks() {
  const dlg = $('dlg-links');
  const btn = $('btn-links');
  if (!dlg || !btn) return;
  // Abrir o pop-up: a lista vem da nuvem a cada abertura.
  btn.onclick = () => {
    dlg.showModal();
    mostrarLinks();
  };
  $('btn-links-fechar').onclick = () => dlg.close();
  // Cadastrar novo link.
  $('form-links').onsubmit = async (e) => {
    e.preventDefault();
    const assunto = $('link-assunto').value.trim();
    let url = $('link-url').value.trim();
    const av = $('links-erro');
    if (av) av.hidden = true;
    if (!assunto || !url) return;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try {
      const b = await cliente();
      await b.entities.Link.create({ assunto, url });
      $('link-assunto').value = '';
      $('link-url').value = '';
      await mostrarLinks();
      toast('Link cadastrado.', 'ok');
    } catch (err) {
      if (av) {
        av.hidden = false;
        av.textContent = `Não consegui cadastrar: ${err.message}`;
      }
    }
  };
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
  // Preparar envio ao YouTube (confirmação antes de abrir o Studio).
  const ytFechar = $('btn-yt-fechar');
  if (ytFechar) ytFechar.onclick = () => $('dlg-youtube').close();
  const ytConfirmar = $('btn-yt-confirmar');
  if (ytConfirmar) ytConfirmar.onclick = confirmarYouTube;
  const ytBaixar = $('btn-yt-baixar');
  if (ytBaixar) ytBaixar.onclick = () => videoYouTube && descarregarVideo(videoYouTube);
  // Links: botão do painel + pop-up de cadastro.
  iniciarLinks();

  // VISTA INICIAL — a última palavra tem de ser desta função.
  //
  // O `app.js` arranca no DOMContentLoaded, que só corre DEPOIS de todos os
  // scripts de módulo (este incluído). Se a vista for aplicada agora, o arranque
  // do estúdio pode voltar a mostrar o ecrã inicial por cima do Painel. Por isso
  // aplica-se agora (para não haver piscar) E outra vez depois do arranque
  // completo, para ficar a certeza.
  const vistaInicial = () => mostrarVista(/estudio/.test(hashAtual()) ? 'estudio' : 'painel');
  vistaInicial();
  const reaplicar = () => vistaInicial();
  if (document.readyState === 'complete') {
    setTimeout(reaplicar, 0);
  } else {
    window.addEventListener('load', reaplicar, { once: true });
  }
  // O evento "rh-vista" devolve a vista a quem a mudou (é idempotente).

  // AO VOLTAR AO PAINEL, a lista é atualizada — mas SEM assinar miniaturas em
  // rajada.
  //
  // Antes, cada regresso ao Painel (e cada vez que a janela voltava à frente)
  // mandava assinar TODAS as miniaturas outra vez: era isto que a Base44
  // respondia com 429. Agora os URLs estão em cache (24 h) e cada miniatura só
  // pede o seu quando aparece no ecrã. A lista também não se recarrega mais do
  // que uma vez a cada 30 s (mudar de vista e voltar não é um pedido novo).
  let ultimaAtualizacao = 0;
  const renovarSePreciso = () => {
    let vista = 'painel';
    try {
      vista = localStorage.getItem('rh3vista') || 'painel';
    } catch {
      /* modo privado */
    }
    if (vista !== 'painel') return;
    if (Date.now() - ultimaAtualizacao < 30 * 1000) return;
    ultimaAtualizacao = Date.now();
    carregar({ jaAssinadas: true });
  };
  window.addEventListener('rh-vista', renovarSePreciso);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') renovarSePreciso();
  });
}
