// ============================================================
//  Rebeca Hub 3.0 — Pesquisa de temas (IA)
//
//  Terceira vista do app, ao lado do Painel e do Estúdio:
//  o usuário informa palavras-chave e/ou o link de um vídeo do
//  YouTube e recebe sugestões de temas infantis (0–12 anos)
//  geradas pela função de nuvem `sugerirTemas`. As notas são
//  estimativas da IA — nunca métricas reais do YouTube.
// ============================================================

const $ = (id) => document.getElementById(id);

let ocupado = false;

// Filtros de idade: as sugestões chegam com "faixa" em texto (ex.: "4 a 8 anos");
// aqui separam-nos pelas faixas 0-3, 4-7 e 8-12.
let ultimasSugestoes = [];
let ultimasSimilares = [];
let ultimasVistos = [];
let filtroIdade = 'todos';

const FAIXAS_FILTRO = [
  { id: 'todos', rotulo: 'Todas as idades' },
  { id: '0-3', rotulo: '0–3 anos', min: 0, max: 3 },
  { id: '4-7', rotulo: '4–7 anos', min: 4, max: 7 },
  { id: '8-12', rotulo: '8–12 anos', min: 8, max: 12 },
];

// A sugestão entra na faixa quando a idade dela cruza com ela
// ("1 a 4 anos" serve para 0-3 E para 4-7, por exemplo).
function dentroDaFaixa(sugestao, idFiltro) {
  const f = FAIXAS_FILTRO.find((x) => x.id === idFiltro);
  if (!f || f.id === 'todos') return true;
  const nums = String(sugestao.faixa || '').match(/\d+/g)?.map(Number) || [];
  if (!nums.length) return false;
  const min = nums[0];
  const max = nums.length > 1 ? nums[1] : nums[0];
  return min <= f.max && max >= f.min;
}

function desenharSugestoes() {
  const lista = document.getElementById('pesq-lista-sugestoes');
  if (!lista) return;
  lista.innerHTML = '';
  const ordenadas = ultimasSugestoes
    .slice()
    .sort((x, y) => (Number(y.potencial) || 0) - (Number(x.potencial) || 0));
  const visiveis = ordenadas.filter((s) => dentroDaFaixa(s, filtroIdade));
  if (!visiveis.length) {
    const vazio = document.createElement('p');
    vazio.className = 'pesq-vazio-filtro';
    vazio.textContent = 'Nenhuma sugestão nessa faixa de idade.';
    lista.append(vazio);
    return;
  }
  for (const s of visiveis) lista.append(cartaoSugestao(s));
}

function desenharFiltros(caixa) {
  const bar = document.createElement('div');
  bar.className = 'pesq-filtros';
  for (const f of FAIXAS_FILTRO) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pesq-filtro' + (filtroIdade === f.id ? ' on' : '');
    const n = f.id === 'todos' ? ultimasSugestoes.length : ultimasSugestoes.filter((s) => dentroDaFaixa(s, f.id)).length;
    b.textContent = n ? `${f.rotulo} (${n})` : f.rotulo;
    b.onclick = () => {
      filtroIdade = f.id;
      [...bar.children].forEach((x) => x.classList.toggle('on', x === b));
      desenharSugestoes();
      desenharBlocosVideos(caixa.querySelector('.pesq-videos'));
    };
    bar.append(b);
  }
  caixa.append(bar);
}

// ---------------------------------------------------------------- helpers
async function cliente() {
  const { base44 } = await import('@/base44Client.js');
  return base44;
}

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

function extrairYoutube(link) {
  const m = String(link || '').match(
    /(?:youtube\.com\/(?:watch\?(?:[a-z=&_-]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{6,20})/i,
  );
  return m ? m[1] : '';
}

// Visualizações vêm da API do YouTube (número cru); aqui viram "1,2 mi".
function formatarViews(n) {
  const v = Number(n) || 0;
  if (v >= 1000000) return `${(v / 1000000).toFixed(1).replace('.', ',')} mi de visualizações`;
  if (v >= 1000) return `${Math.round(v / 1000)} mil visualizações`;
  return v ? `${v} visualizações` : '';
}

// ---------------------------------------------------------------- vistas
// Entra na vista de pesquisa: esconde painel e estúdio e mostra esta seção.
function mostrarPesquisa() {
  try {
    localStorage.setItem('rh3vista', 'pesquisa');
  } catch {
    /* modo privado */
  }
  const drop = $('drop');
  const ws = $('workspace');
  const painel = $('painel-section');
  const secao = $('pesquisa-section');
  if (drop) drop.hidden = true;
  if (ws) ws.hidden = true;
  if (painel) painel.hidden = true;
  if (secao) secao.hidden = false;
  // No painel o botão "Painel" fica escondido; aqui ele volta, para voltar fácil.
  const b1 = $('btn-ir-painel');
  if (b1) b1.hidden = false;
  const b2 = $('btn-ir-estudio');
  if (b2) b2.hidden = false;
  const b3 = $('btn-ir-pesquisa');
  if (b3) b3.hidden = true;
  avisarVista();
}

// Quando outro módulo troca a vista (painel.js), esta seção sai da frente.
window.addEventListener('rh-vista', () => {
  let vista = 'painel';
  try {
    vista = localStorage.getItem('rh3vista') || 'painel';
  } catch {
    /* modo privado */
  }
  const secao = $('pesquisa-section');
  if (vista !== 'pesquisa' && secao) secao.hidden = true;
  const b = $('btn-ir-pesquisa');
  if (b) b.hidden = vista === 'pesquisa';
});

// ---------------------------------------------------------------- resultados
function cartaoSugestao(s) {
  const li = document.createElement('li');
  li.className = 'pesq-item';

  const titulo = document.createElement('p');
  titulo.className = 'pesq-titulo';
  titulo.textContent = s.tituloIdeia || s.tema;

  const tema = document.createElement('p');
  tema.className = 'pesq-tema';
  tema.textContent = s.tema;

  const just = document.createElement('p');
  just.className = 'pesq-just';
  just.textContent = s.justificativa || '';

  const linha = document.createElement('div');
  linha.className = 'pesq-linha';

  if (s.faixa) {
    const faixa = document.createElement('span');
    faixa.className = 'pesq-etiqueta';
    faixa.textContent = s.faixa;
    linha.append(faixa);
  }

  const potencial = document.createElement('div');
  potencial.className = 'pesq-potencial';
  const trilho = document.createElement('span');
  trilho.className = 'pesq-trilho';
  const barra = document.createElement('span');
  barra.className = 'pesq-barra';
  barra.style.width = `${Math.max(5, Math.min(100, Math.round((Number(s.potencial) || 0) * 10)))}%`;
  trilho.append(barra);
  const nota = document.createElement('span');
  nota.className = 'pesq-nota';
  nota.textContent = `${s.potencial}/10 estimado`;
  potencial.append(trilho, nota);
  linha.append(potencial);

  const acoes = document.createElement('div');
  acoes.className = 'pesq-acoes-card';
  const bi = document.createElement('button');
  bi.type = 'button';
  bi.className = 'ghost small';
  bi.textContent = '🎨 Prompt de imagem';
  bi.onclick = () => abrirPrompts(s);
  const bm = document.createElement('button');
  bm.type = 'button';
  bm.className = 'ghost small';
  bm.textContent = '🎵 Prompt de música';
  bm.onclick = () => abrirPrompts(s);
  acoes.append(bi, bm);

  li.append(titulo, tema, just, linha, acoes);
  return li;
}

// ---------------------------------------------------------------- prompts do tema
// Abre o diálogo dos prompts para a sugestão escolhida. Gera UMA vez por
// sugestão (fica em s._promptImagem etc.); o texto é editável e as edições
// ficam enquanto a resposta estiver na tela.
function abrirPrompts(s) {
  const dlg = $('dlg-prompts');
  const estado = $('prompts-estado');
  if (!dlg || !estado) return;
  $('prompts-titulo').textContent = s.tituloIdeia || s.tema;
  $('prompts-imagem').value = s._promptImagem || '';
  $('prompts-estilo').value = s._musicaEstilo || '';
  $('prompts-letra').value = s._musicaLetra || '';
  $('prompts-imagem').oninput = () => (s._promptImagem = $('prompts-imagem').value);
  $('prompts-estilo').oninput = () => (s._musicaEstilo = $('prompts-estilo').value);
  $('prompts-letra').oninput = () => (s._musicaLetra = $('prompts-letra').value);

  if (s._promptImagem) {
    estado.hidden = true;
  } else {
    estado.hidden = false;
    estado.className = 'cfg-result';
    estado.textContent = 'a gerar os prompts…';
    (async () => {
      try {
        const b = await cliente();
        let resposta = await b.functions.invoke('gerarPrompts', {
          tema: s.tema || '',
          tituloIdeia: s.tituloIdeia || '',
          faixa: s.faixa || '',
        });
        let d = resposta?.data && typeof resposta.data === 'object' ? resposta.data : resposta;
        if (d?.data && typeof d.data === 'object') d = d.data;
        if (!d?.ok) throw new Error(d?.error || 'não consegui gerar os prompts');
        s._promptImagem = d.promptImagem || '';
        s._musicaEstilo = d.musicaEstilo || '';
        s._musicaLetra = d.musicaLetra || '';
        // Só preenche se o diálogo continua aberto e ainda é o mesmo tema.
        if (dlg.open && $('prompts-titulo').textContent === (s.tituloIdeia || s.tema)) {
          $('prompts-imagem').value = s._promptImagem;
          $('prompts-estilo').value = s._musicaEstilo;
          $('prompts-letra').value = s._musicaLetra;
          estado.hidden = true;
        }
      } catch (e) {
        estado.hidden = false;
        estado.className = 'cfg-result err';
        estado.textContent = `❌ ${e.message}`;
      }
    })();
  }
  dlg.showModal();
}

// Copia o texto para a área de transferência; sem permissão, seleciona o campo.
async function copiarTexto(texto, campo, btn) {
  if (!texto.trim()) return;
  try {
    await navigator.clipboard.writeText(texto);
  } catch {
    // Sem permissão de clipboard: plano B, seleção + comando de cópia.
    campo.select();
    if (!document.execCommand('copy')) return; // fica selecionado para copiar à mão
  }
  const antigo = btn.textContent;
  btn.textContent = 'copiado ✓';
  setTimeout(() => (btn.textContent = antigo), 2000);
}

// Vídeos entram no filtro quando a faixa deles cruza com a escolhida;
// sem faixa classificada, só aparecem em "Todas as idades".
function videoNaFaixa(v, idFiltro) {
  const f = FAIXAS_FILTRO.find((x) => x.id === idFiltro);
  if (!f || f.id === 'todos') return true;
  if (!v.faixa) return false;
  return dentroDaFaixa(v, idFiltro);
}

function itemVideo(v) {
  const li = document.createElement('li');
  if (v.faixa) {
    const e = document.createElement('span');
    e.className = 'pesq-etiqueta';
    e.textContent = v.faixa;
    li.append(e);
  }
  const a = document.createElement('a');
  a.href = v.url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  const vistas = formatarViews(v.visualizacoes);
  a.textContent = v.titulo + (v.canal ? ` — ${v.canal}` : '') + (vistas ? ` · ${vistas}` : '');
  li.append(a);
  return li;
}

// Redesenha os dois blocos de vídeo (similares e mais visualizados)
// respeitando o filtro de idade escolhido.
function desenharBlocosVideos(caixaVideos) {
  if (!caixaVideos) return;
  caixaVideos.innerHTML = '';
  const blocos = [
    ['🔗 Vídeos similares no YouTube', ultimasSimilares],
    ['🔥 Vídeos mais visualizados', ultimasVistos],
  ];
  for (const [titulo, itens] of blocos) {
    const visiveis = (itens || []).filter((v) => videoNaFaixa(v, filtroIdade));
    if (!visiveis.length) continue;
    const bloco = document.createElement('div');
    bloco.className = 'pesq-similares';
    const t = document.createElement('h4');
    t.textContent = titulo;
    bloco.append(t);
    const ul = document.createElement('ul');
    for (const v of visiveis) ul.append(itemVideo(v));
    bloco.append(ul);
    caixaVideos.append(bloco);
  }
}

function desenharResultados(dados, link) {
  const caixa = $('pesq-resultados');
  if (!caixa) return;
  caixa.innerHTML = '';

  const topo = document.createElement('div');
  topo.className = 'pesq-topo';
  const h = document.createElement('h3');
  h.textContent = dados.tema ? `Tema central: ${dados.tema}` : 'Sugestões de temas';
  topo.append(h);
  if (link) {
    const a = document.createElement('a');
    a.href = link;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.className = 'ghost small';
    a.textContent = '▶️ Abrir o vídeo de referência';
    topo.append(a);
  }
  caixa.append(topo);

  // O que a IA confirmou sobre o vídeo de referência (quando veio com link).
  const info = dados.videoInfo;
  if (info && (info.titulo || info.observacao)) {
    const ref = document.createElement('div');
    ref.className = 'pesq-referencia';
    const vistasRef = formatarViews(info.visualizacoes);
    const l1 = document.createElement('p');
    l1.textContent = info.titulo
      ? `🎬 Referência: ${info.titulo}${info.canal ? ` — ${info.canal}` : ''}${vistasRef ? ` · ${vistasRef}` : ''}`
      : `🎬 ${info.observacao}`;
    ref.append(l1);
    if (info.titulo && info.observacao) {
      const l2 = document.createElement('p');
      l2.className = 'pesq-ref-obs';
      l2.textContent = info.observacao;
      ref.append(l2);
    }
    caixa.append(ref);
  }

  // Vídeos reais (API do YouTube): guardados e desenhados no filtro de idade.
  ultimasSimilares = dados.videosSimilares || [];
  ultimasVistos = dados.maisVistos || [];

  const caixaVideos = document.createElement('div');
  caixaVideos.className = 'pesq-videos';
  caixa.append(caixaVideos);

  ultimasSugestoes = dados.sugestoes || [];
  filtroIdade = 'todos';
  desenharFiltros(caixa);
  const lista = document.createElement('ul');
  lista.id = 'pesq-lista-sugestoes';
  lista.className = 'pesq-lista';
  caixa.append(lista);
  desenharSugestoes();
  desenharBlocosVideos(caixaVideos);

  const nota = document.createElement('p');
  nota.className = 'pesq-nota-rodape';
  nota.textContent =
    dados.aviso ||
    'As notas são estimativas da IA sobre o interesse do público infantil — não são métricas reais de visualização do YouTube.';
  caixa.append(nota);
}

// ---------------------------------------------------------------- consulta
async function pesquisar() {
  if (ocupado) return;
  const palavras = ($('pesq-palavras').value || '').trim();
  const link = ($('pesq-link').value || '').trim();
  const erro = $('pesq-erro');
  erro.hidden = true;
  if (!palavras && !link) {
    erro.textContent = 'Digite palavras-chave ou cole o link de um vídeo do YouTube.';
    erro.hidden = false;
    return;
  }
  if (link && !extrairYoutube(link)) {
    erro.textContent = 'Esse link não parece ser de um vídeo do YouTube.';
    erro.hidden = false;
    return;
  }

  ocupado = true;
  const btn = $('btn-pesq');
  btn.disabled = true;
  const estado = $('pesq-estado');
  estado.hidden = false;
  estado.textContent = 'a pedir sugestões à IA…';
  $('pesq-resultados').innerHTML = '';

  try {
    const b = await cliente();
    let resposta;
    try {
      resposta = await b.functions.invoke('sugerirTemas', { palavrasChave: palavras, link });
    } catch (e) {
      resposta = e?.response?.data || { ok: false, error: e?.message };
    }
    // Desembrulha camadas do SDK, como o resto do app faz.
    let d = resposta?.data && typeof resposta.data === 'object' ? resposta.data : resposta;
    if (d?.data && typeof d.data === 'object' && d.data.sugestoes) d = d.data;
    if (!d?.ok) throw new Error(d?.error || 'não consegui obter sugestões');

    desenharResultados(d, link);
    estado.hidden = true;
  } catch (e) {
    estado.hidden = true;
    erro.textContent = e.message;
    erro.hidden = false;
  } finally {
    ocupado = false;
    btn.disabled = false;
  }
}

// ---------------------------------------------------------------- arranque
if (typeof window !== 'undefined') {
  const btnTemas = $('btn-ir-pesquisa');
  if (btnTemas) btnTemas.onclick = mostrarPesquisa;
  const form = $('form-pesquisa');
  if (form) form.onsubmit = (e) => e.preventDefault();
  const btn = $('btn-pesq');
  if (btn) btn.onclick = pesquisar;

  // Prompts: copiar imagem e copiar música (estilo + letra).
  const btnCopiarImagem = $('btn-copiar-imagem');
  if (btnCopiarImagem) {
    btnCopiarImagem.onclick = () => copiarTexto($('prompts-imagem').value, $('prompts-imagem'), btnCopiarImagem);
  }
  const btnCopiarMusica = $('btn-copiar-musica');
  if (btnCopiarMusica) {
    btnCopiarMusica.onclick = () => {
      const estilo = $('prompts-estilo').value.trim();
      const letra = $('prompts-letra').value.trim();
      copiarTexto([estilo, '', letra].filter((t, i) => i === 0 || t).join('\n'), $('prompts-letra'), btnCopiarMusica);
    };
  }
  const btnFecharPrompts = $('btn-prompts-fechar');
  if (btnFecharPrompts) btnFecharPrompts.onclick = () => $('dlg-prompts').close();

  // "#pesquisa" abre a vista de temas direto (link, favorito).
  if (/pesquisa/.test(hashAtual())) mostrarPesquisa();
}
