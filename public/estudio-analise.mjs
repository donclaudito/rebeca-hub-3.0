// ============================================================
//  Rebeca Hub 3.0 — análise do Diretor de Fotografia
//
//  O botão "🎥 Análise do Diretor" (no resultado do vídeo) envia a miniatura
//  do vídeo pronto + as cenas à função de nuvem analisarProducao, que devolve
//  o feedback estruturado: composição/ritmo, sincronia com o áudio, melhorias
//  de edição e um prompt refinado para regerar as imagens.
//
//  Antes disso corre a AUDITORIA DE ENQUADRAMENTO (auditoria-enquadramento.mjs):
//  as mesmas contas do motor de vídeo dizem, cena a cena, se o personagem está
//  centrado, se lhe falta a cabeça ou os pés, e se o problema é do recorte do
//  vídeo ou da própria imagem. O resultado aparece no diálogo E segue como
//  contexto para o Diretor — é o que condiciona o prompt refinado a corrigir
//  tudo o que é possível corrigir.
// ============================================================

const $ = (id) => document.getElementById(id);

let ctx = null;
// A análise mais recente (com as melhorias convertidas em controlos): é dela
// que o botão "Aplicar melhorias e gerar de novo" parte.
let ultimaAnalise = null;
// A auditoria de enquadramento da última análise (números, não opiniões).
let ultimaAuditoria = null;
// A sincronia medida na última análise (voz de cada cena vs duração da imagem).
let ultimaSincronia = null;

export function iniciarAnalise(c) {
  ctx = c;
  // Os botões do diálogo são deste módulo: ligados uma vez no arranque.
  const fechar = $('btn-analise-fechar');
  if (fechar) fechar.onclick = () => $('dlg-analise')?.close();
  const aplicar = $('btn-analise-aplicar');
  if (aplicar) aplicar.onclick = () => aplicarEGerar();
  const copiar = $('btn-analise-copiar');
  if (copiar) {
    copiar.onclick = async () => {
      const texto = $('analise-prompt')?.value || '';
      if (!texto) return;
      try {
        await navigator.clipboard.writeText(texto);
        copiar.textContent = '📋 Copiado ✓';
        setTimeout(() => (copiar.textContent = '📋 Copiar o prompt refinado'), 2200);
      } catch {
        $('analise-prompt')?.select?.();
      }
    };
  }
}

// ============================================================
//  PROMPTS POR CENA
//
//  Consistência de série não vem de repetir adjectivos: vem de a MESMA base
//  (personagem + estilo + enquadramento) ir em todas as cenas, mudando só a
//  acção. A base fica guardada; cada cena recebe o prompt pronto a colar.
//
//  A ordem do texto é de propósito: personagem primeiro, cenário e composição
//  a seguir, estilo no fim — se o gerador truncar, trunca as proibições e não
//  o enquadramento.
// ============================================================
const CHAVE_BASE = 'rh3promptbase';
const CHAVE_IDIOMA = 'rh3promptidioma';

// PLANO de cada cena: a exigência de enquadramento muda com ele. Antes havia
// uma regra só ("corpo inteiro") e por isso TODA a cena virava plano aberto —
// inclusive as que pediam emoção. Um plano próximo com a cabeça a rasar a
// borda não é um erro: é uma escolha.
const PLANOS = {
  geral: {
    rotulo: 'Geral',
    exigencia:
      'Enquadramento: plano geral — personagem inteiro, com o cenário à volta e margem folgada por todos os lados.',
  },
  medio: {
    rotulo: 'Médio',
    exigencia:
      'Enquadramento: plano médio — da cintura para cima, rosto bem visível, com espaço à volta.',
  },
  proximo: {
    rotulo: 'Próximo',
    exigencia:
      'Enquadramento: plano próximo — o rosto ocupa a maior parte do quadro, expressão em foco; pode cortar o corpo abaixo do peito.',
  },
};

// A base é a mesma para todas as cenas: personagem, cenário, estilo.
// Corrigida depois do teste em que o Director afastou demais o personagem:
// dois terços em vez de metade, margens modestas em vez de generosas, e os
// cartazes voltam a ter ilustração (o "sem texto" tinha esvaziado a parede e o
// inglês continuou a aparecer).
const BASE_PADRAO = `Personagem de livro infantil em 3D suave: um filhote de panda dentista, fofo e redondo, de bata branca e estetoscópio, olhos grandes e simpáticos, paleta de bege quente, verde-menta e rosa claro, luz de manhã suave vinda da direita.

Clínica dentária infantil acolhedora: paredes em menta e creme, prateleiras de madeira com brinquedos, cartazes com ilustrações simples e coloridas (sem letras), uma janela suave à direita.

O personagem ocupa cerca de dois terços da altura do quadro e fica centrado, com margens modestas — sem cortar a cabeça, as mãos nem os pés.

Estilo: render 3D limpo e suave, pelagem macia, sombras suaves, pouca profundidade de campo.

Manter o personagem idêntico à imagem de referência: mesmas cores, mesma cara, mesmas proporções.

Evitar: qualquer texto escrito nas paredes ou nos objectos, logótipos, marcas de água, membros a mais ou repetidos.`;

const BASE_INGLES = `Soft 3D-rendered children's-book character: a chubby fluffy panda cub dentist in a white medical coat and stethoscope, big friendly eyes, warm beige, mint and blush palette, gentle diffused morning light from the right.

Cosy children's dental clinic: mint and cream walls, wooden shelves with toys, colourful posters with simple illustrations and no lettering, a soft window on the right.

The character occupies about two thirds of the frame height, centred, with modest margins — head, hands and feet fully visible.

Style: clean soft 3D render, smooth fur, soft shadows, shallow depth of field.

Keep the character identical to the reference image: same fur colours, same face design, same proportions.

Avoid: any lettering on walls or objects, logos, watermarks, extra or duplicated limbs.`;

function baseGuardada() {
  try {
    const idioma = localStorage.getItem(CHAVE_IDIOMA) === 'en' ? 'en' : 'pt';
    const guardada = localStorage.getItem(CHAVE_BASE);
    if (guardada) return guardada;
    return idioma === 'en' ? BASE_INGLES : BASE_PADRAO;
  } catch {
    return BASE_PADRAO;
  }
}

function comporPrompt(base, acao, planoId) {
  const b = String(base || '').trim();
  const a = String(acao || '').trim();
  const p = PLANOS[planoId] || PLANOS.medio;
  const partes = [b];
  if (a) partes.push(`Nesta cena: ${a}`);
  partes.push(p.exigencia);
  return partes.filter(Boolean).join('\n\n');
}

// Avisos que se vêem antes de gerar: texto repetido e cenas sem texto.
// O mesmo texto em cenas seguidas foi o defeito mais visível do último vídeo.
function avisosDasCenas(cenas) {
  const avisos = [];
  const contagem = new Map();
  cenas.forEach((c) => {
    const t = String(c.texto || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (!t) return;
    contagem.set(t, (contagem.get(t) || 0) + 1);
  });
  const repetidos = [...contagem.entries()].filter(([, n]) => n > 1);
  if (repetidos.length) {
    const exemplo = repetidos[0][0].slice(0, 48);
    avisos.push(
      `⛔ ${repetidos.length} texto(s) repetido(s) em cenas diferentes` +
        ` (ex.: "${exemplo}…", ${repetidos[0][1]}×). Cada cena devia ter a sua frase —` +
        ' uma legenda igual durante segundos faz o vídeo parecer parado.',
    );
  }
  const semTexto = cenas.filter((c) => !String(c.texto || '').trim() && !c.video).length;
  if (semTexto) avisos.push(`⚠️ ${semTexto} cena(s) sem texto: a legenda fica vazia.`);
  return avisos;
}

let acoesPrompts = [];
let planosPrompts = [];
const editadosPrompts = new Map();

// O TEXTO e o ÁUDIO da narração vivem em `state.scenes` (um por imagem).
// `state.images` é a lista de ficheiros e não tem texto nenhum — foi esse
// engano que deu o aviso falso de "13 cenas sem texto" e prompts com a acção
// vazia. Aqui fica a única porta para as cenas.
function cenasNarradas() {
  const s = ctx?.state;
  const cenas = Array.isArray(s?.scenes) ? s.scenes : [];
  if (cenas.length) return cenas;
  return Array.isArray(s?.images) ? s.images : [];
}

// A acção de uma cena, para o prompt: o texto da narração e, se não houver,
// o nome do ficheiro.
function acaoDaCena(c) {
  return String(c?.texto || c?.filename || c?.name || '').replace(/\s+/g, ' ').trim();
}

function construirPrompts() {
  const lista = $('prompts-lista');
  if (!lista || !ctx) return;
  const base = $('prompts-base')?.value || baseGuardada();
  const cenas = cenasNarradas();
  lista.replaceChildren();
  acoesPrompts = cenas.map((c) => acaoDaCena(c));
  planosPrompts = cenas.map((c, i) => planosPrompts[i] || 'medio');

  cenas.forEach((c, i) => {
    const label = document.createElement('label');
    label.className = 'field';

    const topo = document.createElement('span');
    topo.textContent = `Cena ${i + 1}${c.video ? ' · vídeo' : ''}`;

    const escolha = document.createElement('select');
    escolha.className = 'select-simples';
    escolha.style.margin = '4px 0';
    Object.entries(PLANOS).forEach(([id, p]) => {
      const o = document.createElement('option');
      o.value = id;
      o.textContent = `Plano ${p.rotulo.toLowerCase()}`;
      if (planosPrompts[i] === id) o.selected = true;
      escolha.append(o);
    });

    const ta = document.createElement('textarea');
    ta.rows = 3;
    ta.value = editadosPrompts.get(i) || comporPrompt(base, acoesPrompts[i], planosPrompts[i]);
    ta.addEventListener('input', () => editadosPrompts.set(i, ta.value));

    escolha.addEventListener('change', () => {
      planosPrompts[i] = escolha.value;
      editadosPrompts.delete(i); // muda o plano, recompõe-se
      ta.value = comporPrompt(base, acoesPrompts[i], planosPrompts[i]);
    });

    label.append(topo, escolha, ta);
    lista.append(label);
  });

  const estado = $('prompts-estado');
  if (estado) {
    if (!cenas.length) {
      estado.textContent = 'Ainda não há cenas: importe imagens no Estúdio.';
      estado.className = 'hint';
    } else {
      const avisos = avisosDasCenas(cenas);
      estado.textContent = avisos.length
        ? avisos.join(' ')
        : `${cenas.length} prompt(s). A acção vem do texto de cada cena — ajuste onde precisar.`;
      estado.className = avisos.length ? 'cfg-result err' : 'hint';
    }
  }
}

function abrirPrompts() {
  const ta = $('prompts-base');
  if (ta) ta.value = baseGuardada();
  planosPrompts = [];
  editadosPrompts.clear();
  construirPrompts();
  const dlg = $('dlg-prompts');
  if (dlg && !dlg.open) dlg.showModal();
}

// A ligação é feita uma vez, quando o módulo carrega: o <script type="module">
// só corre depois de a página estar toda lida, por isso o botão já existe.
try {
  $('btn-video-prompts')?.addEventListener('click', abrirPrompts);
  $('btn-prompts-fechar')?.addEventListener('click', () => $('dlg-prompts')?.close());
  $('prompts-base')?.addEventListener('input', () => {
    try {
      localStorage.setItem(CHAVE_BASE, $('prompts-base').value);
    } catch {
      /* sem armazenamento: fica só nesta sessão */
    }
    editadosPrompts.clear();
    construirPrompts();
  });
  $('btn-prompts-idioma')?.addEventListener('click', () => {
    let idioma = 'pt';
    try {
      idioma = localStorage.getItem(CHAVE_IDIOMA) === 'en' ? 'pt' : 'en';
      localStorage.setItem(CHAVE_IDIOMA, idioma);
      localStorage.removeItem(CHAVE_BASE);
    } catch {
      /* sem armazenamento */
    }
    const ta = $('prompts-base');
    if (ta) ta.value = idioma === 'en' ? BASE_INGLES : BASE_PADRAO;
    editadosPrompts.clear();
    construirPrompts();
    const btn = $('btn-prompts-idioma');
    if (btn) btn.textContent = idioma === 'en' ? '🇧🇷 Português' : '🇬🇧 English';
  });
  $('btn-prompts-copiar')?.addEventListener('click', async () => {
    const caixas = [...document.querySelectorAll('#prompts-lista textarea')];
    if (!caixas.length) return;
    const texto = caixas.map((t, i) => `--- cena ${i + 1} ---\n${t.value}`).join('\n\n');
    const btn = $('btn-prompts-copiar');
    try {
      await navigator.clipboard.writeText(texto);
      if (btn) {
        btn.textContent = `📋 Copiados ${caixas.length} ✓`;
        setTimeout(() => (btn.textContent = '📋 Copiar todas'), 2200);
      }
    } catch {
      caixas[0]?.select?.();
      if (btn) btn.textContent = '📋 Selecione e copie (Ctrl+C)';
    }
  });
} catch {
  /* sem interface (testes) */
}

function estadoAnalise(msg, tipo = '') {
  const el = $('analise-estado');
  if (!el) return;
  el.hidden = !msg;
  el.className = `cfg-result ${tipo}`;
  el.textContent = msg;
}

// Abre o diálogo já no estado "a analisar": o utilizador vê que está a correr.
function abrirDialogo() {
  const corpo = $('analise-corpo');
  if (corpo) corpo.hidden = true;
  ultimaAnalise = null;
  ultimaAuditoria = null;
  const listaEnq = $('analise-enquadramento');
  if (listaEnq) listaEnq.replaceChildren();
  const txtEnq = $('analise-enquadramento-texto');
  if (txtEnq) txtEnq.textContent = '';
  const botao = $('btn-analise-aplicar');
  if (botao) botao.hidden = true;
  const dlg = $('dlg-analise');
  if (dlg && !dlg.open) dlg.showModal();
  estadoAnalise('O diretor está a ver o material — demora alguns segundos…', 'wait');
}

// O formato do vídeo em pixels ("1920x1080" → 1920, 1080).
function alvoDoFormato() {
  const { state } = ctx;
  const partes = String(state.videoFormato || '1920x1080').split('x').map(Number);
  const w = partes[0] > 0 ? partes[0] : 1920;
  const h = partes[1] > 0 ? partes[1] : 1080;
  return { w, h };
}

// Mede o enquadramento de cada cena (sem IA: são as contas do próprio motor).
// O modo de imagem tem de ser o mesmo do vídeo — em "inteira" a imagem aparece
// toda e seria falso acusar um corte que não existe.
async function auditar() {  const { state } = ctx;
  if (!state.images.length) return null;
  try {
    const mod = await import('./auditoria-enquadramento.mjs');
    const { w, h } = alvoDoFormato();
    return await mod.auditarCenas(state.images, w, h, {
      modo: 'personagem',
      modoImagem: state.modoImagem || 'inteira',
    });
  } catch {
    return null; // a análise do Diretor segue sem os números
  }
}

// Duração da narração de uma cena, lida do próprio ficheiro de áudio.
function duracaoDoAudio(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(0);
    const a = new Audio();
    let feito = false;
    const fim = (v) => {
      if (feito) return;
      feito = true;
      resolve(Number.isFinite(v) && v > 0 ? v : 0);
    };
    a.addEventListener('loadedmetadata', () => fim(a.duration), { once: true });
    a.addEventListener('error', () => fim(0), { once: true });
    setTimeout(() => fim(0), 6000);
    a.preload = 'metadata';
    a.src = url;
  });
}

// SINCRONIA MEDIDA — sem perguntar a ninguém.
//
// A conta é a MESMA do motor (`duracoesDasCenas`, em video.mjs): cada cena dura
// o que dura a sua narração, com um piso de 2*transição + 0,2 s. Uma cena de
// VÍDEO dura o clipe (depois do corte) — e é aí que a narração pode ficar maior
// do que a imagem: nesse caso o áudio é cortado quando o clipe acaba. Era isto
// que o Diretor tinha de adivinhar a partir de uma lista de números; agora vem
// medido.
async function medirSincronia() {
  const { state } = ctx;
  const cenas = cenasNarradas();
  if (!cenas.length) return null;

  const T = Number(state.videoDuracao) || 0.6;
  const piso = 2 * T + 0.2;
  const semVoz = Math.max(piso, Number(state.videoDuracaoCena) || 3.5);

  const duracoes = await Promise.all(
    cenas.map((c) => duracaoDoAudio(c.audioUrl || c.previaUrl || '')),
  );

  const itens = cenas.map((c, i) => {
    const audio = duracoes[i];
    const total = Number(c.duracaoVideo ?? c.duracao) || 0;
    const video = Boolean(c.video);
    const durCena = video ? Math.max(piso, total) : audio > 0 ? Math.max(piso, audio) : semVoz;
    return {
      n: i + 1,
      nome: String(c.filename || c.name || '').slice(0, 60),
      texto: String(c.texto || '').trim(),
      video,
      audio,
      durCena,
      falta: video && audio > durCena + 0.15 ? audio - durCena : 0,
    };
  });

  return {
    total: itens.reduce((s, c) => s + c.durCena, 0),
    piso: Number(piso.toFixed(2)),
    cortadas: itens.filter((c) => c.falta > 0),
    silenciosas: itens.filter((c) => !c.video && c.audio === 0),
    semTexto: itens.filter((c) => !c.texto && !c.video),
    itens,
  };
}

// O resumo em português, para o diálogo. Números primeiro, opinião depois.
function resumoSincronia(s) {
  if (!s) return '';
  const partes = [`Duração montada: ${s.total.toFixed(1)}s em ${s.itens.length} cenas.`];
  if (s.cortadas.length) {
    const pior = s.cortadas
      .slice(0, 4)
      .map((c) => `cena ${c.n} (${c.audio.toFixed(1)}s de voz para ${c.durCena.toFixed(1)}s de imagem)`);
    partes.push(
      `⛔ ${s.cortadas.length} cena(s) com a narração mais longa do que o clipe — o áudio fica cortado: ${pior.join('; ')}.`,
    );
  }
  if (s.silenciosas.length) {
    partes.push(`⚠️ ${s.silenciosas.length} cena(s) sem narração nem vídeo (ficam ${s.piso}s paradas).`);
  }
  if (s.semTexto.length) {
    partes.push(`⚠️ ${s.semTexto.length} cena(s) sem texto de narração — a legenda fica vazia.`);
  }
  if (!s.cortadas.length && !s.silenciosas.length && !s.semTexto.length) {
    partes.push('Sincronia certa: nenhuma narração excede a imagem.');
  }
  return partes.join(' ');
}

// Mostra a auditoria no diálogo: uma linha por cena com problema + o resumo.
function mostrarAuditoria(aud) {
  const txt = $('analise-enquadramento-texto');
  const lista = $('analise-enquadramento');
  if (!txt || !lista) return;
  lista.replaceChildren();
  if (!aud || !aud.total) {
    txt.textContent = 'Sem imagens para medir o enquadramento.';
    return;
  }
  const inteira = aud.modoImagem !== 'preencher';
  txt.textContent =
    (inteira
      ? 'Modo de imagem: mostrar a imagem inteira (sem recorte nem zoom). '
      : 'Modo de imagem: preencher o quadro (com recorte). ') +
    `${aud.veredicto}. ` +
    (aud.faltas.length
      ? `A corrigir: ${aud.faltas.join(' · ')}. O prompt refinado abaixo já inclui estas exigências.`
      : 'Nada a corrigir no enquadramento: o personagem fica inteiro e centrado.');

  const comProblema = aud.cenas.filter((c) => c.gravidade !== 'ok');
  for (const c of comProblema) {
    const li = document.createElement('li');
    const icone = c.gravidade === 'grave' ? '⛔' : '⚠️';
    const b = document.createElement('b');
    b.textContent = `${icone} ${c.nome}`;
    li.append(b, document.createTextNode(` — ${c.avisos.join('; ')}`));
    lista.append(li);
  }
  if (!comProblema.length) {
    const li = document.createElement('li');
    li.textContent = `✅ As ${aud.total} cenas com o personagem inteiro e centrado.`;
    lista.append(li);
  }
}

// Os dados da montagem que a análise usa como contexto.
function metaDaMontagem(r, sinc = null) {
  const { state } = ctx;
  const resultado = r?.r || {};
  // O texto de cada cena vai junto: sem ele o Director não pode dizer se a
  // imagem ilustra a frase — a pergunta que interessa numa história.
  const cenasTexto = cenasNarradas().slice(0, 24).map((c, i) => ({
    n: i + 1,
    texto: acaoDaCena(c).slice(0, 240) || '(sem texto)',
  }));
  return {
    duracao: Math.round(resultado.duracao || 0),
    cenasTexto,
    // A sincronia vai MEDIDA: voz de cada cena contra a duração da imagem.
    sincroniaMedida: sinc
      ? {
          duracaoMontada: Number(sinc.total.toFixed(1)),
          cortadas: sinc.cortadas.map((c) => ({
            cena: c.n,
            voz: Number(c.audio.toFixed(1)),
            imagem: Number(c.durCena.toFixed(1)),
          })),
          semTexto: sinc.semTexto.length,
          silenciosas: sinc.silenciosas.length,
        }
      : null,
    formato: resultado.formato || state.videoFormato,
    transicao: state.videoTransicaoRotulo || state.videoTransicao,
    duracaoTransicao: state.videoDuracao,
    comVoz: Boolean(resultado.comVoz),
    comMusica: Boolean(resultado.comMusica),
    musicaSegundos: Math.round(state.musicaSegundos || 0),
    modoDuracao: state.modoDuracao,
    passagens: resultado.passagens || 1,
    orientacao: state.orientacao,
    epilogo: resultado.epilogo ? Math.round(resultado.epilogo) : '',
    intro: resultado.intro ? Math.round(resultado.intro) : '',
    legendas: resultado.legendas || 0,
    letraDaMusica: Boolean(resultado.legendasDaLetra),
    codec: resultado.codec || state.codec,
    cenas: cenasNarradas().length,
  };
}

export async function analisarDiretor() {
  if (!ctx) return;
  const { state, $, toast, clienteBase44, videoAtual } = ctx;
  const resultado = videoAtual();
  if (!resultado?.blob) {
    return toast('Gere o vídeo primeiro — a análise olha para o resultado.', 'err');
  }
  const btn = $('btn-video-analise');
  if (btn) btn.disabled = true;
  abrirDialogo();

  try {
    // 1) MEDIR o enquadramento (números do motor, não opinião do modelo).
    estadoAnalise('A medir o enquadramento das cenas…', 'wait');
    const aud = await auditar();
    ultimaAuditoria = aud;

    // 2) MEDIR a sincronia (voz vs imagem). O Director recebia uma lista de
    //    números e tinha de adivinhar; agora recebe a conta feita.
    estadoAnalise('A medir a sincronia da narração com as imagens…', 'wait');
    const sincMedida = await medirSincronia();
    ultimaSincronia = sincMedida;

    const b = await clienteBase44();

    // As imagens vão ao armazenamento privado (só esta app as abre) e o
    // backend assina cada uma para a IA as ler. A PRIMEIRA é a miniatura do
    // vídeo pronto; as seguintes são as cenas, por ordem.
    const arquivos = [];
    if (state._miniatura) {
      try {
        const r = await b.integrations.Core.UploadPrivateFile({
          file: new File([state._miniatura], 'miniatura.jpg', { type: 'image/jpeg' }),
        });
        arquivos.push({ nome: 'miniatura (fotograma do vídeo pronto)', uri: r.file_uri });
      } catch {
        /* a miniatura é opcional */
      }
    }
    for (const img of state.images.slice(0, 8)) {
      try {
        const r = await b.integrations.Core.UploadPrivateFile({ file: img.file });
        arquivos.push({ nome: `cena: ${img.name}`.slice(0, 80), uri: r.file_uri });
      } catch {
        /* cena ilegível segue de fora */
      }
    }
    if (!arquivos.length) throw new Error('não consegui enviar as imagens da montagem');

    const resposta = await b.functions.invoke('analisarProducao', {
      arquivos,
      meta: metaDaMontagem(resultado, sincMedida),
      // Os números do enquadramento vão como contexto: o Diretor tem de os
      // respeitar nas melhorias e no prompt refinado.
      enquadramento: aud
        ? {
            modoImagem: aud.modoImagem,
            veredicto: aud.veredicto,
            faltas: aud.faltas,
            exigencias: aud.exigencias,
            cenas: aud.cenas.map((c) => ({ nome: c.nome, avisos: c.avisos, gravidade: c.gravidade })),
          }
        : null,
    });

    // Desembrulha: o SDK pode devolver { data: {...} } ou o próprio objeto.
    let dados = resposta?.data && typeof resposta.data === 'object' && resposta.ok === undefined ? resposta.data : resposta;
    if (dados?.data && typeof dados.data === 'object') dados = dados.data;
    if (!dados || !dados.ok) throw new Error(dados?.error || 'a análise falhou sem explicação');

    // 2) As faltas MEDIDAS entram na lista de melhorias — mesmo que o modelo as
    //    tenha esquecido. "Incluir na atualização" é isto: o que foi medido não
    //    se perde.
    const melhorias = Array.isArray(dados.melhorias) ? [...dados.melhorias] : [];
    if (aud && aud.faltas.length) {
      const remedeio =
        aud.modoImagem === 'preencher'
          ? 'Isto resolve-se a gerar de novo as imagens com o prompt refinado, ou a escolher «Imagem inteira» (sem recorte).'
          : 'Isto resolve-se a gerar de novo as imagens com o prompt refinado — com a imagem inteira não há recorte que corrija uma imagem mal enquadrada na origem.';
      melhorias.unshift({
        titulo: '⛔ Enquadramento (medido)',
        detalhe: `${aud.faltas.join('; ')}. ${remedeio} Exigências: ${aud.exigencias.join('; ')}.`,
      });
    }

    // 3) A narração cortada também entra como melhoria: é um facto medido, não
    //    uma sugestão. Vai depois do enquadramento, que é a prioridade.
    if (sincMedida && sincMedida.cortadas.length) {
      const exemplos = sincMedida.cortadas
        .slice(0, 4)
        .map((c) => `cena ${c.n}: ${c.audio.toFixed(1)}s de voz para ${c.durCena.toFixed(1)}s de imagem`);
      melhorias.push({
        titulo: '⛔ Narração cortada (medido)',
        detalhe:
          `${sincMedida.cortadas.length} cena(s) têm voz mais longa do que a imagem e o áudio fica ` +
          `cortado no fim (${exemplos.join('; ')}). Encurte o texto dessas cenas ou aumente o corte ` +
          'do clipe; se forem clipes do Gemini, cada um tem um limite de segundos que não se estica.',
      });
    }

    // 3) Garantir que o prompt refinado leva as exigências de enquadramento,
    //    mesmo quando o modelo se esquece delas.
    let promptRefinado = String(dados.promptRefinado || '');
    if (aud && aud.faltas.length) {
      const mod = await import('./auditoria-enquadramento.mjs');
      const jaFala = /framing|full body|whole character|head.{0,20}feet|centred|centered/i.test(promptRefinado);
      if (!jaFala) {
        const clausula = mod.clausulaDeEnquadramento(aud.exigencias);
        promptRefinado = `${promptRefinado.trim()} ${clausula}`.trim();
      }
    }

    const corpo = $('analise-corpo');
    if (corpo) corpo.hidden = false;
    mostrarAuditoria(aud);
    // A leitura do Diretor sobre o enquadramento (o que ele viu nas imagens)
    // fica por baixo das medidas — uma complementa a outra.
    const enqIa = $('analise-enquadramento-ia');
    if (enqIa) enqIa.textContent = dados.enquadramento || '';
    const comp = $('analise-composicao');
    if (comp) comp.textContent = dados.composicao || '';
    const sincEl = $('analise-sincronia');
    // Os números medidos vêm PRIMEIRO; a leitura do modelo fica por baixo.
    if (sincEl) sincEl.textContent = [resumoSincronia(sincMedida), dados.sincronia || ''].filter(Boolean).join('\n\n');
    const lista = $('analise-melhorias');
    if (lista) {
      lista.innerHTML = '';
      melhorias.forEach((m) => {
        const li = document.createElement('li');
        const b1 = document.createElement('b');
        b1.textContent = m.titulo;
        li.append(b1, document.createTextNode(` — ${m.detalhe}`));
        lista.append(li);
      });
      if (!lista.children.length) {
        const li = document.createElement('li');
        li.textContent = 'Sem sugestões — o material está bem.';
        lista.append(li);
      }
    }
    const prompt = $('analise-prompt');
    if (prompt) prompt.value = promptRefinado;
    ultimaAnalise = { ...dados, melhorias, promptRefinado };
    const botao = $('btn-analise-aplicar');
    if (botao) botao.hidden = !dados.aplicar || !Object.keys(dados.aplicar).length;
    estadoAnalise(
      aud && aud.faltas.length
        ? `✅ Análise pronta. Enquadramento: ${aud.veredicto} — copie o prompt refinado para gerar as imagens já com as correções.`
        : '✅ Análise pronta — veja abaixo. O prompt refinado pode ser colado no gerador de imagens.',
      'ok',
    );
    toast('Análise do diretor pronta.', 'ok');
  } catch (e) {
    estadoAnalise(`❌ ${e.message}`, 'err');
    toast(`Análise falhou: ${e.message}`, 'err');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ============================================================
//  Aplicar as melhorias e gerar de novo
//
//  O diretor devolve as melhorias convertidas em controlos da app ("aplicar").
//  Cada valor é VALIDADO contra as listas do motor (video.mjs): o que não
//  existir nas listas é ignorado e contado como fora da app. Depois aplica
//  tudo, marca os chips e chama o MESMO fluxo de gravação da página.
// ============================================================
async function aplicarEGerar() {
  if (!ctx) return;
  const { state, toast, guardar, resumoVideo, aplicarPreferenciasNaInterface, gerarVideoFinal, videoAtual } = ctx;
  const a = ultimaAnalise?.aplicar;
  if (!a) return toast('A análise ainda não trouxe melhorias aplicáveis.', 'err');

  const mod = await import('./video.mjs');
  const aplicados = [];
  const ignorados = [];

  const aceitar = (dado, lista, descrever, aplicarValor) => {
    const achou = lista.find((o) => o.id === dado);
    if (achou === undefined) {
      if (dado !== undefined && dado !== null && dado !== '') ignorados.push(descrever(dado));
      return;
    }
    aplicarValor(achou);
    aplicados.push(descrever(achou.id));
  };

  if (mod.TRANSICOES.some((t) => t.id === a.transicao) && a.transicao !== state.videoTransicao) {
    const t = mod.TRANSICOES.find((x) => x.id === a.transicao);
    state.videoTransicao = t.id;
    state.videoTransicaoRotulo = t.rotulo;
    aplicados.push(`transição "${t.rotulo}"`);
  }
  if (Number.isFinite(Number(a.duracaoTransicao)) && Number(a.duracaoTransicao) !== state.videoDuracao) {
    aceitar(
      Number(a.duracaoTransicao),
      mod.DURACOES,
      (v) => `transição de ${v}s`,
      (d) => (state.videoDuracao = d.id),
    );
  }
  if (Number.isFinite(Number(a.duracaoCena)) && Number(a.duracaoCena) !== state.videoDuracaoCena) {
    // Tempo por imagem só manda numa montagem SEM narração: com voz, quem dita
    // o ritmo é a fala. Aplicar à toa enganaria quem espera a melhoria na tela.
    if (videoAtual && videoAtual()?.r?.comVoz) {
      ignorados.push('tempo por imagem (a montagem tem narração — quem dita o ritmo é a fala)');
    } else {
      aceitar(
        Number(a.duracaoCena),
        mod.DURACOES_CENA,
        (v) => `${v}s por imagem`,
        (d) => (state.videoDuracaoCena = d.id),
      );
    }
  }
  if (typeof a.legendas === 'boolean' && a.legendas !== state.legendas) {
    state.legendas = a.legendas;
    aplicados.push(`legendas ${a.legendas ? 'ligadas' : 'desligadas'}`);
  }
  if (mod.CODECS.some((c) => c.id === a.codec) && a.codec !== state.codec) {
    state.codec = a.codec;
    aplicados.push(`codec ${a.codec === 'vp9' ? 'VP9 (mais pequeno)' : 'VP8 (compatível)'}`);
  }
  // "Até acabar a música" só existe COM música escolhida; sem ela, fica como está.
  if (mod.MODOS_DURACAO.some((m) => m.id === a.modoDuracao) && a.modoDuracao !== state.modoDuracao) {
    if (a.modoDuracao === 'trilha' && !state.musicaFicheiro) {
      ignorados.push('repetir até acabar a música (não há trilha escolhida)');
    } else {
      state.modoDuracao = a.modoDuracao;
      aplicados.push(a.modoDuracao === 'trilha' ? 'repetir até acabar a música' : 'duração das imagens');
    }
  }
  if (mod.ORIENTACOES.some((o) => o.id === a.orientacao) && a.orientacao && a.orientacao !== state.orientacao) {
    const o = mod.ORIENTACOES.find((x) => x.id === a.orientacao);
    state.orientacao = o.id;
    state.orientacaoRotulo = o.rotulo;
    aplicados.push(`encerramento "${o.rotulo}"`);
  }

  const fora = (Array.isArray(a.foraDaApp) ? a.foraDaApp : []).filter((f) => f && String(f).trim()).slice(0, 4);

  if (!aplicados.length && !fora.length && !ignorados.length) {
    return toast('A análise não trouxe mudanças para os controlos da app.', '');
  }

  guardar();
  aplicarPreferenciasNaInterface();
  resumoVideo();

  // O aviso do que ficou de fora vai ANTES da gravação: assim ninguém regenera
  // esperando uma melhoria que a app não sabe fazer.
  if (fora.length || ignorados.length) {
    toast(
      `Melhorias que exigem edição externa (não apliquei): ${[...fora, ...ignorados].join('; ')}.`,
      '',
    );
  }
  if (!aplicados.length) {
    // Nada a mudar nos controlos. Se o problema medido for de enquadramento, a
    // app não o resolve sozinha: só imagens novas (ou o recorte) o resolvem — e
    // dizê-lo evita regenerar à espera de uma melhoria que não vem.
    const faltas = ultimaAuditoria?.faltas || [];
    if (faltas.length) {
      toast(
        `O enquadramento não se corrige a regerar o vídeo: ${faltas.join('; ')}. Copie o prompt refinado e gere as imagens de novo com ele.`,
        '',
      );
      $('analise-prompt')?.select?.();
    }
    return;
  }

  $('dlg-analise')?.close();
  toast(`✨ Melhorias aplicadas: ${aplicados.join(' · ')}. A gerar de novo…`, 'ok');
  await gerarVideoFinal();
}
