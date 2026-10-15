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

  li.append(titulo, tema, just, linha);
  return li;
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

  const lista = document.createElement('ul');
  lista.className = 'pesq-lista';
  const ordenadas = (dados.sugestoes || [])
    .slice()
    .sort((x, y) => (Number(y.potencial) || 0) - (Number(x.potencial) || 0));
  for (const s of ordenadas) lista.append(cartaoSugestao(s));
  caixa.append(lista);

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

  // "#pesquisa" abre a vista de temas direto (link, favorito).
  if (/pesquisa/.test(hashAtual())) mostrarPesquisa();
}
