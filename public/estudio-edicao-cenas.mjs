// ============================================================
//  Rebeca Hub 3.0 (nuvem) — edição de cenas de vídeo
//
//  Cada cena de vídeo na lista "Narração por imagem" ganha os seus
//  controlos: VER o trecho escolhido, CORTAR (início/fim), AJUSTAR O
//  SOM (volume do ficheiro, ou mudo), SUBSTITUIR o vídeo e REMOVER a
//  cena. O corte e o som vão para o motor do vídeo (video.mjs) e
//  ficam guardados nos projetos (estudio-projetos.mjs).
// ============================================================

let state = null;
let toast = () => {};
let renderThumbs = () => {};
let renderScenes = () => {};
let resumoVideo = () => {};
let guardar = () => {};

export function iniciar(ctx) {
  state = ctx.state;
  toast = ctx.toast;
  renderThumbs = ctx.renderThumbs;
  renderScenes = ctx.renderScenes;
  resumoVideo = ctx.resumoVideo;
  guardar = ctx.guardar;
}

// ---------------------------------------------------------------- corte
// Normaliza o corte: dentro do ficheiro, com fim depois do início.
export function dadosDoCorte(cena) {
  const d = Number(cena?.duracaoVideo) || 0;
  const c = cena?.videoCorte || {};
  let inicio = Number(c.inicio);
  let fim = Number(c.fim);
  if (!Number.isFinite(inicio) || inicio < 0) inicio = 0;
  if (!Number.isFinite(fim) || fim <= 0) fim = d;
  if (d > 0) fim = Math.min(fim, d);
  if (d > 0 && fim <= inicio) {
    inicio = 0;
    fim = d;
  }
  return {
    inicio: Number(inicio.toFixed(2)),
    fim: Number(fim.toFixed(2)),
    // O som do clipe não é usado (nem se guarda escolha de volume): mantêm-se
    // os campos só para os projetos antigos não perderem o corte.
    volume: 0,
    mudo: true,
  };
}

// O que o motor do vídeo (video.mjs) precisa de cada cena de vídeo.
// O SOM vai sempre a zero: o áudio do clipe não entra no vídeo (o motor ainda
// força `muted` no elemento, isto é a segunda trava).
export function camposParaMotor(cena) {
  const { inicio, fim } = dadosDoCorte(cena);
  return { videoInicio: inicio, videoFim: fim, videoVolume: 0, videoMudo: true };
}

// Duração da cena de vídeo DEPOIS do corte — é ela que manda no ritmo.
export function duracaoDaCenaVideo(cena) {
  if (!cena?.video) return 0;
  const { inicio, fim } = dadosDoCorte(cena);
  return fim > inicio ? fim - inicio : Number(cena.duracaoVideo) || 0;
}

const sDois = (n) => Number(n).toFixed(1).replace('.', ',');

// ---------------------------------------------------------------- substituir
export async function substituirVideo(cena, img, file) {
  const { ehFicheiroVideo, medidasDoVideo } = await import('./estudio-video-carregado.mjs');
  if (!ehFicheiroVideo(file)) throw new Error('Esse ficheiro não parece ser um vídeo.');
  let duracao = 0;
  try {
    duracao = (await medidasDoVideo(file)).duracao || 0;
  } catch {
    /* segue sem a duração lida */
  }
  const urlAntiga = img.url;
  img.file = file;
  img.name = file.name;
  img.url = URL.createObjectURL(file);
  img.video = true;
  img.duracao = duracao;
  cena.filename = img.name;
  cena.duracaoVideo = duracao;
  cena.videoCorte = { inicio: 0, fim: duracao || 0 };
  if (urlAntiga) URL.revokeObjectURL(urlAntiga);
  renderThumbs();
  renderScenes();
  toast('Vídeo substituído.', 'ok');
}

// ---------------------------------------------------------------- remover
function removerCena(img, cena) {
  if (cena.audioUrl) URL.revokeObjectURL(cena.audioUrl);
  if (cena.previaUrl) URL.revokeObjectURL(cena.previaUrl);
  if (img.url) URL.revokeObjectURL(img.url);
  state.images = state.images.filter((x) => x.id !== img.id);
  renderThumbs();
  renderScenes();
  toast('Cena removida.', '');
}

// ---------------------------------------------------------------- pré-escuta
// Toca SÓ o trecho escolhido, SEM som: é assim que ele entra no vídeo (o áudio
// do clipe nunca é usado), por isso a prévia mostra exatamente o resultado.
function ligarVerTrecho(vid, cena, btn, estado) {
  let tocando = false;
  const limpar = () => {
    vid.ontimeupdate = null;
    vid.onpause = null;
    tocando = false;
    btn.textContent = '▶️ Ver o trecho';
  };
  return async () => {
    if (tocando) {
      vid.pause();
      limpar();
      return;
    }
    const c = dadosDoCorte(cena);
    if (!(c.fim > c.inicio)) return toast('Defina um trecho válido: o fim depois do início.', 'err');
    vid.muted = true;
    vid.volume = 0;
    try {
      vid.currentTime = c.inicio;
    } catch {
      /* segue do onde estiver */
    }
    tocando = true;
    btn.textContent = '⏹ Parar';
    if (estado) estado.textContent = `a tocar ${sDois(c.inicio)}s → ${sDois(c.fim)}s · sem som (o vídeo não usa o áudio do clipe)`;
    vid.ontimeupdate = () => {
      if (vid.currentTime >= c.fim) {
        vid.pause();
        limpar();
      }
    };
    vid.onpause = () => {
      if (tocando) limpar();
    };
    try {
      await vid.play();
    } catch {
      limpar();
      if (estado) estado.textContent = 'o browser não deixou tocar aqui — tente outra vez';
    }
  };
}

// ---------------------------------------------------------------- cartão da cena
export function preencherCenaVideo(li, cena, img, indice) {
  const cortes = dadosDoCorte(cena);
  const total = Number(cena.duracaoVideo) || 0;

  const vid = document.createElement('video');
  vid.src = img.url;
  vid.muted = true;
  vid.playsInline = true;
  vid.preload = 'metadata';
  // Mostra o primeiro fotograma DO TRECHO, não o do ficheiro inteiro.
  vid.addEventListener('loadedmetadata', () => {
    try {
      vid.currentTime = dadosDoCorte(cena).inicio;
    } catch {
      /* fica no primeiro fotograma */
    }
  });

  const corpo = document.createElement('div');
  corpo.className = 'scene-body';

  const topo = document.createElement('div');
  topo.className = 'scene-top';
  const idx = document.createElement('span');
  idx.className = 'idx';
  idx.textContent = `Vídeo ${indice + 1}`;
  const nome = document.createElement('span');
  nome.className = 'file';
  nome.textContent = cena.filename;
  nome.title = cena.filename;
  const rm = document.createElement('button');
  rm.type = 'button';
  rm.className = 'icon ghost rm';
  rm.textContent = '✕';
  rm.title = 'Remover esta cena';
  rm.onclick = (e) => {
    e.stopPropagation();
    removerCena(img, cena);
  };
  topo.append(idx, nome, rm);
  corpo.append(topo);

  // ---- edição ----
  const ed = document.createElement('div');
  ed.className = 'cena-video-edit';

  const linhaCorte = document.createElement('div');
  linhaCorte.className = 'cve-linha';

  const criarNumero = (rotulo, valor) => {
    const la = document.createElement('label');
    la.className = 'cve-campo';
    const sp = document.createElement('span');
    sp.textContent = rotulo;
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.min = '0';
    inp.step = '0.1';
    inp.value = String(valor);
    la.append(sp, inp);
    return { la, inp };
  };

  const inpInicio = criarNumero('Início', cortes.inicio);
  const inpFim = criarNumero('Fim', cortes.fim);
  const trecho = document.createElement('span');
  trecho.className = 'cve-trecho';
  const atualizarTrecho = () => {
    const i2 = Number(inpInicio.inp.value) || 0;
    const f2 = Number(inpFim.inp.value) || 0;
    trecho.textContent = f2 > i2 ? `trecho de ${sDois(f2 - i2)}s` : 'trecho inválido';
  };
  atualizarTrecho();

  const aplicarCorte = () => {
    let i2 = Number(inpInicio.inp.value);
    let f2 = Number(inpFim.inp.value);
    if (!Number.isFinite(i2) || i2 < 0) i2 = 0;
    if (!Number.isFinite(f2) || f2 <= 0) f2 = total || i2 + 1;
    if (total > 0) f2 = Math.min(f2, total);
    if (f2 <= i2) {
      toast('O fim tem de ficar DEPOIS do início — corrigi o trecho.', 'err');
      f2 = Math.min(total || i2 + 1, i2 + 0.5);
    }
    cena.videoCorte = { inicio: Number(i2.toFixed(2)), fim: Number(f2.toFixed(2)) };
    inpInicio.inp.value = String(cena.videoCorte.inicio);
    inpFim.inp.value = String(cena.videoCorte.fim);
    atualizarTrecho();
    guardar();
    resumoVideo();
  };
  inpInicio.inp.addEventListener('input', atualizarTrecho);
  inpInicio.inp.addEventListener('change', aplicarCorte);
  inpFim.inp.addEventListener('input', atualizarTrecho);
  inpFim.inp.addEventListener('change', aplicarCorte);
  linhaCorte.append(inpInicio.la, inpFim.la, trecho);

  // O som do clipe NÃO tem controlo porque NÃO ENTRA no vídeo: um clipe anexado
  // traz quase sempre fala ou ruído de origem, que se sobrepunha à narração e à
  // trilha. O vídeo usa a IMAGEM do clipe; o som é sempre narração + trilha.
  // Fica a nota, para não haver dúvida do que aconteceu ao som.
  const linhaSom = document.createElement('div');
  linhaSom.className = 'cve-linha';
  const notaSom = document.createElement('span');
  notaSom.className = 'cve-trecho';
  notaSom.textContent = '🔇 O som do clipe não entra no vídeo — só a narração e a trilha.';
  linhaSom.append(notaSom);

  const estado = document.createElement('span');
  estado.className = 'hint cve-estado';

  const acoes = document.createElement('div');
  acoes.className = 'cve-acoes';
  const btnVer = document.createElement('button');
  btnVer.type = 'button';
  btnVer.className = 'ghost small';
  btnVer.textContent = '▶️ Ver o trecho';
  btnVer.onclick = ligarVerTrecho(vid, cena, btnVer, estado);
  const btnSub = document.createElement('button');
  btnSub.type = 'button';
  btnSub.className = 'ghost small';
  btnSub.textContent = '🔄 Substituir o vídeo';
  const inpSub = document.createElement('input');
  inpSub.type = 'file';
  inpSub.accept = 'video/*,.mp4,.webm,.mov,.mkv,.avi';
  inpSub.hidden = true;
  btnSub.onclick = () => inpSub.click();
  inpSub.onchange = async () => {
    const f = inpSub.files?.[0];
    inpSub.value = '';
    if (!f) return;
    btnSub.disabled = true;
    try {
      await substituirVideo(cena, img, f);
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      btnSub.disabled = false;
    }
  };
  acoes.append(btnVer, btnSub, inpSub);

  ed.append(linhaCorte, linhaSom, acoes);
  corpo.append(ed, estado);

  const dica = document.createElement('p');
  dica.className = 'hint';
  dica.textContent =
    `🎬 Cena de vídeo${total ? ` (ficheiro de ${sDois(total)}s)` : ''} — arraste a cena para mudar a ` +
    'ordem; o corte e o som entram na montagem final.';
  corpo.append(dica);

  li.append(vid, corpo);
}
