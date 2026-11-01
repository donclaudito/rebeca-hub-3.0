// ============================================================
//  Rebeca Hub 3.0 (nuvem) — projetos guardados (histórico)
//
//  Extraído do app.js para o ficheiro principal continuar leve.
//  Cada projeto é guardado no IndexedDB com as imagens, o texto
//  e o áudio. Fica no computador do utilizador; não vai para
//  servidor nenhum. As ligações com o resto da página chegam via
//  iniciar(ctx), porque o app.js é que detém o estado.
// ============================================================

const $ = (id) => document.getElementById(id);

let state = null;
let toast = () => {};
let guardar = () => {};
let atualizarLetra = () => {};
let resumoVideo = () => {};
let marcarMotor = () => {};
let marcarTom = () => {};
let atualizarContador = () => {};
let renderThumbs = () => {};
let aplicarPreferenciasNaInterface = () => {};
let renderScenes = () => {};
let updateLayout = () => {};
let preparar = null;
let paraBase64 = null;
let pararPreviaTrilha = () => {};
let pararPreviaLetra = () => {};
let lerConfig = () => ({});
let projetos = null;

export { estadoProjeto };

export function iniciar(ctx) {
  state = ctx.state;
  toast = ctx.toast;
  guardar = ctx.guardar;
  atualizarLetra = ctx.atualizarLetra;
  resumoVideo = ctx.resumoVideo;
  marcarMotor = ctx.marcarMotor;
  marcarTom = ctx.marcarTom;
  atualizarContador = ctx.atualizarContador;
  renderThumbs = ctx.renderThumbs;
  aplicarPreferenciasNaInterface = ctx.aplicarPreferenciasNaInterface || aplicarPreferenciasNaInterface;
  renderScenes = ctx.renderScenes;
  updateLayout = ctx.updateLayout;
  preparar = ctx.preparar;
  paraBase64 = ctx.paraBase64;
  pararPreviaTrilha = ctx.pararPreviaTrilha;
  pararPreviaLetra = ctx.pararPreviaLetra;
  lerConfig = ctx.lerConfig;
  projetos = ctx.projetos;
  iniciarProjetos();
}

function estadoProjeto(msg, tipo = '') {
  const el = $('projeto-estado');
  if (!el) return;
  el.className = tipo === 'err' ? 'hint err' : 'hint';
  el.textContent = msg;
}

// O projeto que está aberto vai ser ATUALIZADO ou é um trabalho NOVO?
//
// Era este o defeito que fazia o "✏️ Reeditar projeto" abrir sempre o último
// projeto usado: escrevia-se um nome novo no campo, mas o "Guardar" continuava a
// escrever por cima do projeto aberto (mesmo id e mesma cópia na nuvem). No fim
// havia um só projeto — com o nome novo e o conteúdo novo — e todos os vídeos
// apontavam para ele.
//
// Regra: se o nome no campo é diferente do nome com que o projeto aberto foi
// guardado, é um projeto NOVO. Ganha id próprio (e nenhuma cópia na nuvem, até
// se pedir), e o anterior fica exatamente como estava.
function nomeDoCampo() {
  return String($('projeto-nome')?.value || '').trim();
}

function vaiSerProjetoNovo() {
  const nome = nomeDoCampo();
  const anterior = String(projetos.nomeAtual || '').trim();
  if (!nome || !anterior) return false; // sem projeto aberto: já é novo de si
  return nome.toLowerCase() !== anterior.toLowerCase();
}

// Para o app.js: o vídeo que se vai guardar pertence a um projeto que ainda não
// existe na nuvem? (nome mudou → tem de subir como projeto novo, senão o vídeo
// fica ligado ao projeto anterior e o "✏️ Reeditar projeto" abre o errado.)
export function precisaGuardarComoNovo() {
  return vaiSerProjetoNovo();
}

// Diz na interface o que o botão vai fazer — sem surpresas ao carregar.
export function atualizarRotuloGuardar() {
  const btn = $('btn-projeto-guardar');
  if (!btn) return;
  btn.textContent = vaiSerProjetoNovo() ? '💾 Guardar como novo' : '💾 Guardar projeto';
  btn.title = vaiSerProjetoNovo()
    ? `cria um projeto novo ("${nomeDoCampo()}"); o projeto "${projetos.nomeAtual}" fica como está`
    : 'guarda por cima do projeto aberto';
}

// Junta tudo o que é preciso para voltar a abrir o trabalho mais tarde.
//
// `novo` = guardar como projeto NOVO (id próprio), mesmo que haja um aberto.
async function recolherProjeto(nome, { novo = false } = {}) {
  const cenas = [];
  for (const [i, img] of state.images.entries()) {
    const cena = state.scenes[i] || {};
    let imagem = null;
    try {
      // Guarda a versão REDUZIDA quando ela existe: é a que a app usa, e a
      // original pode ter 20 MB por imagem.
      const p = await preparar(img);
      imagem = p.file;
    } catch {
      imagem = img.file || null;
    }
    let audio = null;
    if (cena.audioB64) {
      try {
        audio = new Blob([binarioDeBase64(cena.audioB64)], { type: cena.audioExt || 'audio/webm' });
      } catch {
        audio = null;
      }
    }
    cenas.push({
      nome: img.name,
      imagem,
      texto: cena.texto || '',
      audio,
      audioExt: cena.audioExt || '',
      previaVoz: cena.previaVoz || '',
      video: Boolean(img.video),
      duracaoVideo: Number(img.duracao) || 0,
      videoCorte: img.video
        ? { inicio: Number(cena.videoCorte?.inicio) || 0, fim: Number(cena.videoCorte?.fim) || 0 }
        : null,
      videoVolume: img.video ? Math.max(0, Math.min(1, Number(cena.videoVolume ?? 1))) : 1,
      videoMudo: img.video ? Boolean(cena.videoMudo) : false,
    });
  }
  return {
    id: novo || !projetos.idAtual ? crypto.randomUUID() : projetos.idAtual,
    nome: String(nome || '').trim() || 'Projeto sem nome',
    criadoEm: novo || !projetos.criadoEm ? Date.now() : projetos.criadoEm,
    cenas,
    config: {
      servico: state.servico,
      modelo: state.modelo,
      voz: state.voz,
      velocidade: state.velocidade,
      motor: state.motor,
      tom: state.tom,
      vozEleven: state.vozEleven,
      videoFormato: state.videoFormato,
      videoTransicao: state.videoTransicao,
      videoTransicaoRotulo: state.videoTransicaoRotulo || '',
      videoDuracao: state.videoDuracao,
      // A imagem inteira (sem corte) é o que o projeto guarda por omissão: ao
      // reabrir, o vídeo sai como o utilizador o deixou.
      modoImagem: state.modoImagem || 'inteira',
      videoModo: state.videoModo,
      videoDuracaoCena: state.videoDuracaoCena,
      legendas: state.legendas,
      modoDuracao: state.modoDuracao,
      codec: state.codec,
      letra: state.letra,
      letraLigada: state.letraLigada,
      legendasLetra: state.legendasLetra,
      durIntro: state.durIntro || 0,
      durEpilogo: state.durEpilogo || 0,
      orientacao: state.orientacao || '',
      cenasFinais: [...(state.cenasFinais || [])],
      cenasIniciais: [...(state.cenasIniciais || [])],
      texto: { tone: $('tone').value, extra: $('extra').value, minWords: $('minWords').value, maxWords: $('maxWords').value },
    },
  };
}

function binarioDeBase64(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// `renomear: true` (botão 🔁 Atualizar) = escrever por cima do projeto aberto,
// MESMO que o nome tenha mudado — é assim que se muda o nome de um projeto sem
// criar outro.
export async function guardarProjetoAgora(opcoes = {}) {
  const renomear = Boolean(opcoes && opcoes.renomear === true);
  if (!state.images.length) return toast('Importe as imagens primeiro.', 'err');
  const btn = $('btn-projeto-guardar');
  const nome = nomeDoCampo();
  const nomeAnterior = String(projetos.nomeAtual || '').trim();
  const comoNovo = renomear ? false : vaiSerProjetoNovo();
  if (!nome) {
    // Guardar sem nome é o que dava cartões "Projeto sem nome" no Painel.
    toast('Dê um nome ao projeto antes de guardar.', 'err');
    const campo = $('projeto-nome');
    if (campo && typeof campo.focus === 'function') campo.focus();
    return;
  }
  btn.disabled = true;
  estadoProjeto(state.images.length > 20 ? 'a guardar… (são muitas imagens, isto demora um pouco)' : 'a guardar…');
  try {
    const mod = await modProjetos();
    const dados = await recolherProjeto(nome, { novo: comoNovo });
    // Só se escreve por cima da cópia da nuvem quando é o MESMO projeto.
    if (!comoNovo && projetos.nuvemId) dados.nuvemId = projetos.nuvemId;
    await mod.guardarProjeto(dados);
    projetos.idAtual = dados.id;
    projetos.criadoEm = dados.criadoEm;
    projetos.nomeAtual = dados.nome;
    $('projeto-nome').value = dados.nome;
    // Projeto veio da nuvem (e não mudou de nome)? As alterações voltam para a
    // nuvem: é o que mantém a cópia da app em dia quando se reedita e salva
    // outra vez. Um projeto NOVO só vai para a nuvem quando o utilizador pedir
    // (ou ao guardar o vídeo dele).
    // A cópia na nuvem é um EXTRA: se falhar (créditos, rede), o projeto já
    // está guardado neste computador e o save NÃO se reporta como falhado.
    let avisoNuvem = '';
    if (!comoNovo && projetos.nuvemId) {
      estadoProjeto('a guardar também na nuvem…');
      try {
        const nuvem = await import('./projeto-nuvem.mjs');
        projetos.nuvemId = await nuvem.guardarProjetoNuvem(dados, projetos.nuvemId);
        await mod.guardarProjeto({ ...dados, nuvemId: projetos.nuvemId });
      } catch (e) {
        avisoNuvem = e.message;
        toast(`Guardado neste computador. A nuvem falhou: ${e.message}`, 'err');
      }
    }
    estadoProjeto(
      (comoNovo
        ? `Projeto NOVO "${dados.nome}" guardado${nomeAnterior ? ` — o "${nomeAnterior}" ficou como estava` : ''} · `
        : renomear && nomeAnterior && nomeAnterior !== dados.nome
          ? `Projeto renomeado para "${dados.nome}" · `
          : `Projeto "${dados.nome}" guardado${avisoNuvem ? ' (só aqui — a nuvem falhou)' : projetos.nuvemId ? ' (aqui e na nuvem)' : ''} · `) +
        `${dados.cenas.length} imagem(ns) · ${mod.tamanhoLegivel(mod.tamanhoDe(dados))}` +
        `${avisoNuvem ? ` ⚠️ ${avisoNuvem}` : ''}`,
      avisoNuvem ? 'err' : 'ok',
    );
    toast(
      comoNovo
        ? `Projeto novo "${dados.nome}" guardado. O anterior ficou intacto.`
        : renomear && nomeAnterior && nomeAnterior !== dados.nome
          ? `Projeto agora chama-se "${dados.nome}".`
          : `Projeto "${dados.nome}" guardado${projetos.nuvemId ? ', inclusive na nuvem' : ''}.`,
      'ok',
    );
    atualizarRotuloGuardar();
    await desenharProjetos();
  } catch (e) {
    estadoProjeto(`❌ ${e.message}`, 'err');
    toast(e.message, 'err');
  } finally {
    btn.disabled = false;
  }
}

// Diz ao Painel que há um projeto novo na nuvem. Sem isto a lista do Painel só
// se renovava de 30 em 30 s e o projeto que se acabou de guardar não aparecia.
export function avisarPainel() {
  try {
    window.dispatchEvent(new Event('rh-guardado-na-nuvem'));
  } catch {
    /* sem janela (testes) */
  }
}

// ☁️ Guardar o projeto NA NUVEM (na app): sobe as imagens e o áudio para o
// armazenamento privado e cria/atualiza o registo. Um projeto na nuvem abre
// em qualquer computador — é o que o botão "✏️ Reeditar projeto" do Painel
// usa quando o projeto não está neste PC.
// Guarda o projeto aberto NA NUVEM e devolve o id da cópia. Serve ao botão
// "☁️ Guardar na nuvem" e também ao guardar do VÍDEO (app.js): um vídeo cujo
// projeto só está neste computador não se reedita em lado nenhum.
export async function guardarProjetoNaNuvem() {
  if (!state.images.length) throw new Error('Importe as imagens primeiro.');
  // Se o nome mudou, é um projeto NOVO: não se escreve por cima da cópia da
  // nuvem do projeto anterior (era isto que fazia o "Reeditar" abrir sempre o
  // último projeto usado).
  const comoNovo = vaiSerProjetoNovo();
  const dados = await recolherProjeto(nomeDoCampo(), { novo: comoNovo });
  const nuvem = await import('./projeto-nuvem.mjs');
  projetos.nuvemId = await nuvem.guardarProjetoNuvem(dados, comoNovo ? null : projetos.nuvemId);
  // Também fica no histórico local (com a ligação à cópia da nuvem).
  const mod = await modProjetos();
  await mod.guardarProjeto({ ...dados, nuvemId: projetos.nuvemId });
  projetos.idAtual = dados.id;
  projetos.criadoEm = dados.criadoEm;
  projetos.nomeAtual = dados.nome;
  // O Painel tem de saber AGORA que há um projeto novo na nuvem.
  avisarPainel();
  return projetos.nuvemId;
}

export async function guardarNuvemAgora() {
  if (!state.images.length) return toast('Importe as imagens primeiro.', 'err');
  const btn = $('btn-projeto-nuvem');
  btn.disabled = true;
  estadoProjeto('a guardar na nuvem… (sobe as imagens e o áudio, pode demorar)');
  try {
    const id = await guardarProjetoNaNuvem();
    estadoProjeto(
      `Projeto "${$('projeto-nome').value}" guardado na nuvem ✓ — abre em qualquer computador. ` +
        'Aparece no 📺 Painel, em "📁 Projetos guardados na nuvem".',
      'ok',
    );
    toast('Projeto guardado na nuvem. Está no 📺 Painel, em "Projetos guardados na nuvem".', 'ok');
    await desenharProjetos();
  } catch (e) {
    const { semCreditos, MENSAGEM_SEM_CREDITOS } = await import('./creditos.mjs');
    if (semCreditos(e)) {
      estadoProjeto(`❌ ${MENSAGEM_SEM_CREDITOS}`, 'err');
      toast('Sem créditos na Base44 para guardar na nuvem. O projeto está guardado neste computador.', 'err');
      return;
    }
    estadoProjeto(`❌ ${e.message}`, 'err');
    toast(e.message, 'err');
  } finally {
    btn.disabled = false;
  }
}

async function modProjetos() {
  if (!projetos.mod) projetos.mod = await import('./projetos.mjs');
  return projetos.mod;
}

export async function desenharProjetos() {
  const lista = $('projetos-ul');
  if (!lista) return;
  try {
    const mod = await modProjetos();
    projetos.lista = await mod.listarProjetos();
  } catch (e) {
    estadoProjeto(`❌ ${e.message}`, 'err');
    return;
  }
  lista.innerHTML = '';
  const vazio = $('projetos-vazio');
  if (vazio) vazio.hidden = projetos.lista.length > 0;

  // O botão "Atualizar" só faz sentido depois de haver um projeto aberto.
  const btnAtualizar = $('btn-projeto-atualizar');
  if (btnAtualizar) btnAtualizar.hidden = !projetos.idAtual;

  const total = projetos.lista.reduce((s, p) => s + (p.bytes || 0), 0);
  const resumo = $('projetos-resumo');
  if (resumo) {
    resumo.textContent = projetos.lista.length
      ? `${projetos.lista.length} projeto(s) · ${(await modProjetos()).tamanhoLegivel(total)} no seu computador`
      : 'Ainda não guardou nenhum projeto.';
  }

  for (const p of projetos.lista) {
    const li = document.createElement('li');
    li.className = `projeto${p.id === projetos.idAtual ? ' atual' : ''}`;

    const miniaturaVideo = p.miniatura && /^video\//i.test(p.miniatura.type || '');
    if (miniaturaVideo) {
      const sem = document.createElement('span');
      sem.className = 'sem-miniatura';
      sem.textContent = '🎬';
      li.append(sem);
    } else if (p.miniatura instanceof Blob || p.miniatura) {
      const img = document.createElement('img');
      img.alt = '';
      img.src = URL.createObjectURL(p.miniatura);
      img.onload = () => URL.revokeObjectURL(img.src);
      li.append(img);
    } else {
      const sem = document.createElement('span');
      sem.className = 'sem-miniatura';
      sem.textContent = '🖼️';
      li.append(sem);
    }

    const info = document.createElement('div');
    info.className = 'info';
    const titulo = document.createElement('div');
    titulo.className = 'titulo';
    titulo.textContent = p.nome;
    const meta = document.createElement('div');
    meta.className = 'meta';
    const mod = await modProjetos();
    meta.textContent =
      `${p.imagens} imagem(ns) · ${p.comTexto} com texto · ${p.comAudio} com áudio · ` +
      `${mod.tamanhoLegivel(p.bytes)} · ${mod.quandoFoi(p.guardadoEm)}`;
    info.append(titulo, meta);
    li.append(info);

    const acoes = document.createElement('div');
    acoes.className = 'acoes';
    const abrir = document.createElement('button');
    abrir.type = 'button';
    abrir.className = 'primary small';
    abrir.textContent = '📂 Abrir';
    abrir.onclick = () => abrirProjeto(p.id);
    const apagar = document.createElement('button');
    apagar.type = 'button';
    apagar.className = 'ghost small danger';
    apagar.textContent = '🗑';
    apagar.title = 'apagar este projeto';
    apagar.onclick = () => apagarProjeto(p.id, p.nome);
    acoes.append(abrir, apagar);
    li.append(acoes);

    lista.append(li);
  }
}

export async function abrirProjeto(id) {
  try {
    const mod = await modProjetos();
    let p = await mod.lerProjeto(id);
    if (p) {
      projetos.nuvemId = p.nuvemId || null;
    } else {
      // Não está neste computador: tenta NA NUVEM (projeto guardado na app).
      const nuvem = await import('./projeto-nuvem.mjs');
      p = await nuvem.lerProjetoNuvem(id);
      if (!p) return toast('Esse projeto já não existe (nem aqui, nem na nuvem).', 'err');
      projetos.nuvemId = p.id;
    }

    // Fecha o que estava aberto antes de trocar de trabalho.
    pararPreviaTrilha();
    pararPreviaLetra();
    for (const img of state.images) if (img.url) URL.revokeObjectURL(img.url);
    for (const s of state.scenes) {
      if (s.audioUrl) URL.revokeObjectURL(s.audioUrl);
      if (s.previaUrl) URL.revokeObjectURL(s.previaUrl);
    }

    state.images = (p.cenas || [])
      .filter((c) => c.imagem)
      .map((c) => ({
        id: crypto.randomUUID(),
        file: c.imagem,
        name: c.nome || 'imagem',
        url: URL.createObjectURL(c.imagem),
        video: Boolean(c.video) || /^video\//i.test(c.imagem?.type || ''),
        duracao: Number(c.duracaoVideo) || 0,
      }));
    state.scenes = (p.cenas || [])
      .filter((c) => c.imagem)
      .map((c) => ({
        filename: c.nome || 'imagem',
        texto: c.texto || '',
        audioUrl: c.audio ? URL.createObjectURL(c.audio) : null,
        audioB64: null, // volta a ser calculado quando for preciso (ZIP)
        audioExt: c.audioExt || '',
        previaUrl: null,
        previaVoz: c.previaVoz || '',
        videoCorte: c.videoCorte
          ? { inicio: Number(c.videoCorte.inicio) || 0, fim: Number(c.videoCorte.fim) || 0 }
          : null,
        videoVolume: Number.isFinite(Number(c.videoVolume)) ? Number(c.videoVolume) : 1,
        videoMudo: Boolean(c.videoMudo),
      }));
    // O base64 do áudio é derivado do Blob, para o ZIP continuar a funcionar.
    for (const s of state.scenes) {
      if (s.audioUrl) {
        try {
          s.audioB64 = await paraBase64(await (await fetch(s.audioUrl)).blob());
        } catch {
          s.audioB64 = null;
        }
      }
    }

    // Preferências do projeto.
    const c = p.config || {};
    state.legendasLetra = c.legendasLetra || null;
    for (const [k, v] of Object.entries(c)) {
      if (k === 'texto') continue;
      if (v !== undefined && v !== null) state[k] = v;
    }
    if (c.texto) {
      if (c.texto.tone !== undefined) $('tone').value = c.texto.tone;
      if (c.texto.extra !== undefined) $('extra').value = c.texto.extra;
      if (c.texto.minWords) $('minWords').value = c.texto.minWords;
      if (c.texto.maxWords) $('maxWords').value = c.texto.maxWords;
    }

    projetos.idAtual = p.id;
    projetos.criadoEm = p.criadoEm;
    // O nome com que este projeto está guardado. É a referência para saber se o
    // próximo "Guardar" ATUALIZA este projeto ou cria um NOVO (nome diferente).
    projetos.nomeAtual = p.nome;
    $('projeto-nome').value = p.nome;
    atualizarRotuloGuardar();

    // Volta a desenhar tudo com o projeto carregado.
    renderThumbs();
    renderScenes();
    updateLayout();
    atualizarContador();
    const lt = $('letra-texto');
    if (lt) lt.value = state.letra || '';
    atualizarLetra();
    marcarMotor();
    marcarTom();
    aplicarPreferenciasNaInterface();
    resumoVideo();

    await desenharProjetos();
    estadoProjeto(
      `Projeto "${p.nome}" aberto · ${state.images.length} imagem(ns)${projetos.nuvemId ? ' · da nuvem' : ''}`,
      'ok',
    );
    toast(`Projeto "${p.nome}" aberto.`, 'ok');
  } catch (e) {
    toast(`Não consegui abrir esse projeto: ${e.message}`, 'err');
  }
}

export async function apagarProjeto(id, nome) {
  if (!window.confirm(`Apagar o projeto "${nome}"? Isto não se pode desfazer.`)) return;
  try {
    const mod = await modProjetos();
    await mod.apagarProjeto(id);
    if (projetos.idAtual === id) {
      projetos.idAtual = null;
      projetos.criadoEm = null;
      projetos.nomeAtual = null;
      atualizarRotuloGuardar();
    }
    await desenharProjetos();
    toast('Projeto apagado.', '');
  } catch (e) {
    toast(`Não consegui apagar: ${e.message}`, 'err');
  }
}

export function iniciarProjetos() {
  const ver = $('projetos-lista');
  $('btn-projeto-guardar').onclick = () => guardarProjetoAgora();
  // 🔁 Atualizar = escrever por cima do projeto aberto, mesmo com nome novo
  // (é a forma de RENOMEAR sem criar um projeto a mais).
  $('btn-projeto-atualizar').onclick = () => guardarProjetoAgora({ renomear: true });
  const btnAtualizarTopo = $('btn-projeto-atualizar');
  if (btnAtualizarTopo) btnAtualizarTopo.title = 'guarda por cima do projeto aberto (e muda-lhe o nome, se escreveu outro)';
  const btnNuvem = $('btn-projeto-nuvem');
  if (btnNuvem) btnNuvem.onclick = guardarNuvemAgora;
  $('btn-projetos-ver').onclick = async () => {
    const aberto = ver.hidden;
    ver.hidden = !aberto;
    $('btn-projetos-ver').textContent = aberto ? '📂 Fechar os projetos' : '📂 Os meus projetos';
    if (aberto) await desenharProjetos();
  };
  $('btn-projetos-fechar').onclick = () => {
    ver.hidden = true;
    $('btn-projetos-ver').textContent = '📂 Os meus projetos';
  };
  // O nome escrito à mão fica guardado nas preferências, para não se perder — e
  // o botão passa a dizer o que vai fazer: "Guardar projeto" (escrita por cima
  // do projeto aberto) ou "Guardar como novo" (nome diferente = projeto novo).
  $('projeto-nome').addEventListener('input', () => {
    guardar();
    atualizarRotuloGuardar();
  });
  const cfg = lerConfig();
  if (cfg.projetoNome) $('projeto-nome').value = cfg.projetoNome;
  atualizarRotuloGuardar();
}
