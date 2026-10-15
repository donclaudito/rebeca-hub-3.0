// ============================================================
//  Rebeca Hub 3.0 (nuvem) — lógica da página
//
//  O que muda em relação à versão local:
//   - a narração é pedida à função de nuvem `generateNarration`;
//   - a voz é gerada NO BROWSER (Web Speech API + MediaRecorder), sem ffmpeg;
//   - não há servidor nenhum no seu computador.
// ============================================================

const $ = (id) => document.getElementById(id);

const state = {
  images: [],
  scenes: [],
  vozes: [],
  voz: '',
  velocidade: 1,
  modo: 'mic',
  motor: 'browser', // 'browser' | 'eleven'
  tom: 'acolhedora',
  vozEleven: '',
  vozesEleven: [],
  videoFormato: '1920x1080',
  videoTransicao: 'fade',
  videoDuracao: 0.6,
  // O que entra no vídeo: 'narracao' | 'ambos' | 'musica'.
  videoModo: 'ambos',
  videoDuracaoCena: 3.5,
  // Legendas incrustadas no vídeo + ficheiro .srt (mesmos blocos).
  legendas: true,
  // 'natural' (duração das cenas) ou 'trilha' (repete as imagens até a música acabar).
  modoDuracao: 'natural',
  // Codec do ficheiro: 'vp8' (compatível) ou 'vp9' (mais pequeno).
  codec: 'vp8',
  // A duração da música foi lida? Se não, o ciclo não pode ser calculado.
  musicaMedida: false,
  // Letra da música: o texto colado e se está a ser usada como legenda.
  letra: '',
  letraLigada: false,
  pararVideo: false,
  // Trilha sonora: o ficheiro escolhido (fica só nesta sessão) e a duração lida.
  musicaFicheiro: null,
  musicaDuracao: 0,
  musicaSegundos: 0,
  musicaLigada: true,
  musicaUrl: '',
  servico: 'deepseek',
  modelo: '',
  busy: false,
  parar: false,
  buscarVozes: null,
};

// ---------------------------------------------------------------- avisos
let toastTimer;
function toast(msg, kind = '') {
  const el = $('toast');
  el.textContent = msg;
  el.className = `toast ${kind}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), kind === 'err' ? 9000 : 4200);
}
function aviso(html, kind = 'warn') {
  const el = $('aviso');
  if (!html) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.className = `aviso ${kind}`;
  el.innerHTML = html;
}
function setStatus(t, k = '') {
  const el = $('status');
  el.textContent = t;
  el.className = `pill ${k}`;
}
function progress(show, pct = 0, texto = '') {
  $('progress').hidden = !show;
  $('bar-fill').style.width = `${pct}%`;
  $('progress-text').textContent = texto;
}
const palavras = (t) => (String(t || '').trim() ? String(t).trim().split(/\s+/).length : 0);

// ---------------------------------------------------------------- separadores
function iniciarAbas() {
  ['abas-esq', 'abas-dir'].forEach((id) => {
    const grupo = $(id);
    if (!grupo) return;
    const abas = [...grupo.children];
    abas.forEach((aba) => {
      aba.onclick = () => {
        abas.forEach((a) => {
          a.classList.toggle('on', a === aba);
          const painel = $(a.dataset.tab);
          if (painel) painel.hidden = a.dataset.tab !== aba.dataset.tab;
        });
      };
    });
  });
}

// ---------------------------------------------------------------- imagens
function updateLayout() {
  const tem = state.images.length > 0;
  // O PAINEL é a vista inicial: com ele aberto, o estúdio fica escondido
  // (mesmo com imagens importadas) — é o painel.js que manda na vista.
  let noPainel = false;
  try {
    noPainel = (localStorage.getItem('rh3vista') || 'painel') === 'painel';
  } catch {
    /* modo privado */
  }
  $('workspace').hidden = !tem || noPainel;
  $('drop').classList.toggle('compact', tem);
  $('drop-title').textContent = tem ? 'Arraste mais imagens para aqui' : 'Arraste uma pasta de imagens para aqui';
  $('count').textContent = state.images.length;
}

function addImages(ficheiros) {
  const ok = [...ficheiros].filter(
    (f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|tiff?|heic|heif|avif)$/i.test(f.name),
  );
  if (!ok.length) return toast('Nenhuma imagem reconhecida.', 'err');
  ok.sort((a, b) => a.name.localeCompare(b.name, 'pt', { numeric: true, sensitivity: 'base' }));
  for (const f of ok) {
    state.images.push({ id: crypto.randomUUID(), file: f, name: f.name, url: URL.createObjectURL(f) });
  }
  renderThumbs();
  renderScenes();
  toast(`${ok.length} imagem(ns) adicionada(s).`, 'ok');
}

function pickFolder() {
  const input = $('input-files');
  input.webkitdirectory = true;
  input.click();
}
function pickFiles() {
  const input = $('input-files');
  input.webkitdirectory = false;
  input.click();
}

function renderThumbs() {
  const ul = $('thumbs');
  ul.innerHTML = '';
  state.images.forEach((img, i) => {
    const li = document.createElement('li');
    li.className = 'thumb';
    li.draggable = true;

    const n = document.createElement('span');
    n.className = 'n';
    n.textContent = i + 1;

    const im = document.createElement('img');
    im.src = img.url;
    im.alt = img.name;
    im.loading = 'lazy';

    const nm = document.createElement('span');
    nm.className = 'nm';
    nm.textContent = img.name;
    nm.title = img.name;

    const mover = (simbolo, delta, titulo) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'icon ghost mv';
      b.textContent = simbolo;
      b.title = titulo;
      b.disabled = i + delta < 0 || i + delta >= state.images.length;
      b.onclick = (e) => {
        e.stopPropagation();
        const [m] = state.images.splice(i, 1);
        state.images.splice(i + delta, 0, m);
        renderThumbs();
        renderScenes();
      };
      return b;
    };

    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'icon ghost rm';
    rm.textContent = '✕';
    rm.title = 'Remover';
    rm.onclick = (e) => {
      e.stopPropagation();
      URL.revokeObjectURL(img.url);
      state.images = state.images.filter((x) => x.id !== img.id);
      renderThumbs();
      renderScenes();
    };

    li.addEventListener('dragstart', (e) => {
      li.classList.add('dragging');
      e.dataTransfer.setData('text/plain', img.id);
    });
    li.addEventListener('dragend', () => li.classList.remove('dragging'));
    li.addEventListener('dragover', (e) => {
      e.preventDefault();
      li.classList.add('over');
    });
    li.addEventListener('dragleave', () => li.classList.remove('over'));
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      li.classList.remove('over');
      const id = e.dataTransfer.getData('text/plain');
      const de = state.images.findIndex((x) => x.id === id);
      const para = state.images.findIndex((x) => x.id === img.id);
      if (de < 0 || para < 0 || de === para) return;
      const [m] = state.images.splice(de, 1);
      state.images.splice(para, 0, m);
      renderThumbs();
      renderScenes();
    });

    li.append(n, im, nm, mover('▲', -1, 'Mover para cima'), mover('▼', 1, 'Mover para baixo'), rm);
    ul.append(li);
  });
  updateLayout();
  $('btn-generate').disabled = !state.images.length || state.busy;
}

// ---------------------------------------------------------------- cenas
// Sincroniza a lista de cenas com as imagens. Faltava isto: sem ele, a lista
// de cenas só aparecia DEPOIS de gerar a narração — e antes disso não havia
// onde escrever texto nem onde ouvir, o que tornava a app inutilizável.
// Preserva o texto e o áudio já feitos quando as imagens mudam de ordem.
function sincronizarCenas() {
  const porNome = new Map(state.scenes.map((s) => [s.filename, s]));
  state.scenes = state.images.map((img) => {
    const antes = porNome.get(img.name);
    return (
      antes || {
        filename: img.name,
        texto: '',
        audioUrl: null,
        audioB64: null,
        audioExt: '',
        previaUrl: null,
        previaVoz: '',
      }
    );
  });
}

function renderScenes() {
  sincronizarCenas();
  const ol = $('scenes');
  ol.innerHTML = '';
  $('empty-scenes').hidden = state.scenes.length > 0;

  state.scenes.forEach((cena, i) => {
    const img = state.images[i];
    const li = document.createElement('li');
    li.className = 'scene';

    const im = document.createElement('img');
    im.src = img ? img.url : '';
    im.alt = cena.filename;
    im.loading = 'lazy';

    const corpo = document.createElement('div');
    corpo.className = 'scene-body';

    const topo = document.createElement('div');
    topo.className = 'scene-top';
    const idx = document.createElement('span');
    idx.className = 'idx';
    idx.textContent = `Imagem ${i + 1}`;
    const nome = document.createElement('span');
    nome.className = 'file';
    nome.textContent = cena.filename;
    nome.title = cena.filename;
    topo.append(idx, nome);

    const ta = document.createElement('textarea');
    ta.value = cena.texto || '';
    ta.placeholder = 'A narração desta imagem…';
    ta.spellcheck = false;

    const rodape = document.createElement('div');
    rodape.className = 'scene-foot';
    const wc = document.createElement('span');
    wc.className = 'wc';
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.hidden = true;
    const btnOuvir = document.createElement('button');
    btnOuvir.type = 'button';
    btnOuvir.className = 'ghost small';
    btnOuvir.textContent = '▶️ Ouvir';
    const btnGravar = document.createElement('button');
    btnGravar.type = 'button';
    btnGravar.className = 'ghost small';
    btnGravar.textContent = '🎧 Gerar áudio';
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.style.height = '30px';
    audio.hidden = !cena.audioUrl;
    if (cena.audioUrl) audio.src = cena.audioUrl;

    const contar = () => {
      const w = palavras(ta.value);
      wc.textContent = `${w} palavra${w === 1 ? '' : 's'} · ~${Math.max(1, Math.round((w / 150) * 60))}s`;
    };
    contar();

    const marcar = (texto, tipo = '') => {
      if (!texto) {
        badge.hidden = true;
        return;
      }
      badge.hidden = false;
      badge.textContent = texto;
      badge.className = `badge ${tipo}`;
    };

    ta.addEventListener('input', () => {
      cena.texto = ta.value;
      contar();
      atualizarContador();
      // O resumo do vídeo conta os blocos de legenda: ao escrever, atualiza-se.
      resumoVideo();
    });

    btnOuvir.onclick = async () => {
      const t = ta.value.trim();
      if (!t) return toast('Escreva ou gere a narração primeiro.', 'err');
      // O botão tem de respeitar o MOTOR escolhido. Antes chamava sempre a voz
      // do browser, por isso ouvia-se a mesma voz mesmo com a ElevenLabs
      // selecionada — o defeito de que o utilizador se queixou.
      if (state.motor === 'eleven') {
        if (btnOuvir.dataset.on === '1') {
          stopSpeak();
          return;
        }
        btnOuvir.dataset.on = '1';
        btnOuvir.textContent = '⏹ Parar';
        const voz = state.vozesEleven.find((v) => v.id === state.vozEleven);
        marcar(`ElevenLabs${voz ? ` (${voz.nome})` : ''}…`, 'busy');
        try {
          // Reaproveita a pré-escuta já gerada (não gasta caracteres duas vezes).
          if (!cena.previaUrl) {
            const r = await audioDaEleven(t);
            cena.previaUrl = URL.createObjectURL(r.blob);
            cena.previaVoz = r.nomeVoz || voz?.nome || '';
          }
          await tocarUrl(cena.previaUrl);
          marcar(cena.previaVoz ? `pré-escuta · ${cena.previaVoz}` : 'pré-escuta pronta', 'ok');
        } catch (e) {
          marcar(e.message, 'err');
        } finally {
          btnOuvir.dataset.on = '0';
          btnOuvir.textContent = '▶️ Ouvir';
        }
        return;
      }

      // Motor do browser: síntese local, sem ficheiro e sem custo.
      stopSpeak();
      btnOuvir.textContent = '⏹ Parar';
      marcar('a falar…', 'busy');
      try {
        await falar(t);
        marcar('');
      } catch (e) {
        marcar(e.message, 'err');
      } finally {
        btnOuvir.textContent = '▶️ Ouvir';
      }
    };

    btnGravar.onclick = async () => {
      const t = ta.value.trim();
      if (!t) return toast('Escreva ou gere a narração primeiro.', 'err');
      // O botão respeita o MOTOR: com a ElevenLabs escolhida, o áudio vem dela
      // (a gravação pelo microfone seria sempre a voz do browser, nunca a voz
      // da ElevenLabs — era aqui que a escolha "não pegava").
      if (state.motor === 'eleven') {
        btnGravar.disabled = true;
        marcar('a gerar com a ElevenLabs…', 'busy');
        try {
          // Reaproveita a pré-escuta da MESMA voz, para não gastar caracteres
          // outra vez numa cena que já foi ouvida.
          let blob;
          let nomeVoz;
          if (cena.previaUrl) {
            blob = await (await fetch(cena.previaUrl)).blob();
            nomeVoz = cena.previaVoz || state.vozesEleven.find((v) => v.id === state.vozEleven)?.nome || '';
          } else {
            const r = await audioDaEleven(t);
            blob = r.blob;
            nomeVoz = r.nomeVoz || '';
            cena.previaUrl = URL.createObjectURL(blob);
            cena.previaVoz = nomeVoz;
          }
          if (cena.audioUrl) URL.revokeObjectURL(cena.audioUrl);
          cena.audioUrl = URL.createObjectURL(blob);
          cena.audioB64 = await paraBase64(blob);
          cena.audioExt = 'mp3';
          cena.vozUsada = nomeVoz;
          audio.src = cena.audioUrl;
          audio.hidden = false;
          marcar(nomeVoz ? `MP3 · ${nomeVoz}` : 'MP3 pronto', 'ok');
          atualizarContador();
        } catch (e) {
          marcar(e.message, 'err');
        } finally {
          btnGravar.disabled = false;
        }
        return;
      }
      btnGravar.disabled = true;
      marcar('a preparar…', 'busy');
      try {
        const blob = await gravarCena(t, (m) => marcar(m, 'busy'));
        if (cena.audioUrl) URL.revokeObjectURL(cena.audioUrl);
        cena.audioUrl = URL.createObjectURL(blob);
        cena.audioB64 = await paraBase64(blob);
        cena.audioExt = (blob.type || '').includes('wav') ? 'wav' : 'webm';
        audio.src = cena.audioUrl;
        audio.hidden = false;
        marcar('áudio pronto', 'ok');
        atualizarContador();
      } catch (e) {
        marcar(e.message, 'err');
      } finally {
        btnGravar.disabled = false;
      }
    };

    rodape.append(btnOuvir, btnGravar, wc, badge, audio);
    corpo.append(topo, ta, rodape);
    li.append(im, corpo);
    ol.append(li);
  });
  atualizarContador();
}

function atualizarContador() {
  const el = $('narradas');
  const comTexto = state.scenes.filter((s) => (s.texto || '').trim()).length;
  const comAudio = state.scenes.filter((s) => s.audioB64).length;
  if (!comTexto) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.textContent = `${comAudio} de ${state.scenes.length} cenas com áudio`;
  el.className = `badge ${comAudio === state.scenes.length ? 'ok' : ''}`;
}

const paraBase64 = (blob) =>
  new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(',')[1] || '');
    fr.onerror = () => rej(new Error('não consegui ler o áudio'));
    fr.readAsDataURL(blob);
  });

// ---------------------------------------------------------------- voz (browser)
function vozesDoBrowser() {
  const todas = window.speechSynthesis ? speechSynthesis.getVoices() : [];
  if (!todas.length) return [];
  const pt = todas.filter((v) => /^pt/i.test(v.lang));
  return pt.length ? pt : todas;
}

function desenharVozes() {
  state.vozes = vozesDoBrowser();
  const caixa = $('vozes');
  caixa.innerHTML = '';
  if (!state.vozes.length) {
    caixa.innerHTML = '<span class="hint" style="margin:0">o browser ainda não tem vozes — veja as Definições do sistema</span>';
    return;
  }
  state.vozes.forEach((v, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.id = String(i);
    b.textContent = v.name.replace(/^Microsoft\s+/, '').replace(/\s*Desktop$/, '');
    b.title = `${v.name} (${v.lang})`;
    b.onclick = () => {
      state.voz = v.name;
      [...caixa.children].forEach((x) => x.classList.toggle('on', x === b));
      guardar();
    };
    caixa.append(b);
  });
  const preferida = state.vozes.find((v) => v.name === state.voz) || state.vozes.find((v) => /^pt-BR/i.test(v.lang)) || state.vozes[0];
  state.voz = preferida.name;
  [...caixa.children].forEach((x) => x.classList.toggle('on', state.vozes[Number(x.dataset.id)]?.name === state.voz));
  const local = state.vozes.filter((v) => v.localService).length;
  $('voz-estado').textContent = `${state.vozes.length} voz(es) · ${local} local(is)`;
}

function falar(texto) {
  return new Promise((res, rej) => {
    if (!window.speechSynthesis) return rej(new Error('este browser não sintetiza voz'));
    const u = new SpeechSynthesisUtterance(texto);
    const v = state.vozes.find((x) => x.name === state.voz);
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    }
    u.rate = state.velocidade;
    let feito = false;
    const fim = (e) => {
      if (feito) return;
      feito = true;
      clearInterval(vigia);
      e && e.error !== 'interrupted' && e.error !== 'canceled' ? rej(new Error(`voz falhou: ${e.error}`)) : res();
    };
    u.onend = () => fim();
    u.onerror = fim;
    const vigia = setInterval(() => {
      if (!speechSynthesis.speaking) fim();
    }, 400);
    speechSynthesis.speak(u);
  });
}
function stopSpeak() {
  if (window.speechSynthesis) speechSynthesis.cancel();
  if (audioAtual) {
    const a = audioAtual;
    audioAtual = null;
    try {
      a.pause();
    } catch {
      /* já parou */
    }
    if (typeof a.onended === 'function') a.onended(); // solta a promessa
  }
  if (gravadorAtual) {
    try {
      gravadorAtual.stop();
    } catch {
      /* já parou */
    }
  }
}

// Toca um ficheiro de áudio (MP3 da ElevenLabs ou a gravação do browser) e só
// resolve quando acaba — ou quando o dono manda parar. Sem o fim garantido, o
// botão ficava preso em "Parar" e o clique seguinte não fazia nada.
let audioAtual = null;
function tocarUrl(url) {
  return new Promise((resolve) => {
    const a = new Audio(url);
    audioAtual = a;
    const fim = () => {
      if (audioAtual === a) audioAtual = null;
      resolve();
    };
    a.onended = fim;
    a.onerror = fim;
    a.play().catch(fim);
  });
}

let gravadorAtual = null;
async function obterFluxo() {
  if (state.modo === 'ecra') {
    const s = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const faixa = s.getAudioTracks()[0];
    if (!faixa) {
      s.getTracks().forEach((t) => t.stop());
      throw new Error('não deu áudio do sistema — use o modo Microfone');
    }
    return { fluxo: new MediaStream([faixa]), parar: () => s.getTracks().forEach((t) => t.stop()) };
  }
  const m = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  return { fluxo: m, parar: () => m.getTracks().forEach((t) => t.stop()) };
}

// Sem ffmpeg na nuvem, o áudio fica em WebM/Opus — que o Chrome, o Edge, o
// Firefox, o VLC e o DaVinci leem. Quem quiser MP3 usa a versão local.
function gravarComFluxo(texto, fluxo, estado) {
  return new Promise((res, rej) => {
    const tipo = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find(
      (t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t),
    );
    if (!tipo) return rej(new Error('este browser não grava áudio neste formato'));
    const g = new MediaRecorder(fluxo, { mimeType: tipo, audioBitsPerSecond: 128000 });
    gravadorAtual = g;
    const pedacos = [];
    g.ondataavailable = (e) => e.data.size && pedacos.push(e.data);
    const fim = new Promise((r) => (g.onstop = r));

    const ctx = new AudioContext();
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    ctx.createMediaStreamSource(fluxo).connect(an);
    const amp = new Uint8Array(an.fftSize);
    const nivel = () => {
      an.getByteTimeDomainData(amp);
      let s = 0;
      for (const v of amp) s += (v - 128) ** 2;
      return Math.sqrt(s / amp.length);
    };

    g.start(200);
    setTimeout(async () => {
      estado('a falar…');
      try {
        await falar(texto);
      } catch (e) {
        if (g.state !== 'inactive') g.stop();
        try {
          await ctx.close();
        } catch {}
        gravadorAtual = null;
        return rej(e);
      }
      estado('a fechar…');
      const t0 = Date.now();
      while (Date.now() - t0 < 4000) {
        await new Promise((r) => setTimeout(r, 150));
        if (nivel() < 0.012 && Date.now() - t0 > 600) break;
      }
      if (g.state !== 'inactive') g.stop();
      await fim;
      try {
        await ctx.close();
      } catch {}
      gravadorAtual = null;
      const blob = new Blob(pedacos, { type: tipo });
      if (blob.size < 800) return rej(new Error('a gravação ficou vazia — verifique o som'));
      res(blob);
    }, 300);
  });
}

async function gravarCena(texto, estado) {
  const { fluxo, parar } = await obterFluxo();
  try {
    return await gravarComFluxo(texto, fluxo, estado);
  } finally {
    parar();
  }
}

// ---------------------------------------------------------------- gerar narração
// Reduz a imagem antes de enviar: o modelo encolhe tudo para ~1300px de qualquer
// forma, por isso enviar 2,6 MB por imagem não acrescenta nada e quebra limites.
const MAX_LADO = 1280;
const QUALIDADE = 0.82;

function carregarImagem(url) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('não consegui ler a imagem'));
    i.src = url;
  });
}

async function preparar(img) {
  if (img.file.size <= 400 * 1024) return { file: img.file, reduzida: false };
  try {
    const el = await carregarImagem(img.url);
    const maior = Math.max(el.naturalWidth, el.naturalHeight);
    const escala = maior > MAX_LADO ? MAX_LADO / maior : 1;
    const comAlfa = img.file.type === 'image/png' || img.file.type === 'image/gif';
    const t = comAlfa ? 'image/png' : 'image/jpeg';
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(el.naturalWidth * escala));
    c.height = Math.max(1, Math.round(el.naturalHeight * escala));
    c.getContext('2d').drawImage(el, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, t, comAlfa ? undefined : QUALIDADE));
    if (!blob || blob.size >= img.file.size) return { file: img.file, reduzida: false };
    const nome = img.file.name.replace(/\.[^.]+$/, '') + (comAlfa ? '.png' : '.jpg');
    return { file: new File([blob], nome, { type: t }), reduzida: true };
  } catch {
    return { file: img.file, reduzida: false };
  }
}

async function gerar() {
  if (!state.images.length || state.busy) return;
  state.busy = true;
  $('btn-generate').disabled = true;
  progress(true, 5, 'a preparar as imagens…');
  try {
    const prontas = [];
    for (const [i, img] of state.images.entries()) {
      if (i % 4 === 0) progress(true, 5 + Math.round((i / state.images.length) * 25), `a preparar imagem ${i + 1} de ${state.images.length}…`);
      prontas.push(await preparar(img));
    }
    const totalMb = prontas.reduce((s, p) => s + p.file.size, 0) / 1048576;
    progress(true, 35, `a pedir a narração (${totalMb.toFixed(1)} MB)…`);

    let dados;
    if (state.servico === 'local') {
      // Alternativa: o servidor local, se ainda o tiver a correr.
      const fd = new FormData();
      prontas.forEach((p, i) => fd.append('images', p.file, state.images[i].name));
      fd.append('order', state.images.map((i) => i.name).join('\u0001'));
      fd.append('tone', $('tone').value.trim());
      fd.append('extra', $('extra').value.trim());
      fd.append('minWords', $('minWords').value);
      fd.append('maxWords', $('maxWords').value);
      const r = await fetch('http://127.0.0.1:3100/api/narrate', { method: 'POST', body: fd });
      dados = await r.json();
    } else {
      const { base44 } = await import('@/base44Client.js');

      // As imagens vão em JSON com data URL (base64). O SDK da Base44 envia
      // JSON quando não há ficheiros — e o JSON é mais simples de diagnosticar
      // do que um multipart, porque o erro diz logo o que chegou.
      const imagens = await Promise.all(
        prontas.map(async (p, i) => {
          const b64 = await paraBase64(p.file);
          return { nome: state.images[i].name, dataUrl: `data:${p.file.type || 'image/jpeg'};base64,${b64}` };
        }),
      );

      const pedido = {
        servico: state.servico,
        modelo: state.modelo,
        imagens,
        tom: $('tone').value.trim(),
        extra: $('extra').value.trim(),
        minWords: $('minWords').value,
        maxWords: $('maxWords').value,
        idioma: 'português do Brasil',
      };

      let resposta;
      try {
        resposta = await base44.functions.invoke('generateNarration', pedido);
      } catch (e) {
        // O SDK lança em erro HTTP; o corpo com a explicação vem em response.data.
        const corpo = e?.response?.data;
        const detalhe = corpo?.error || e?.message || 'a chamada falhou';
        const status = e?.response?.status ? ` (HTTP ${e.response.status})` : '';
        throw new Error(`${detalhe}${status}`);
      }

      // Desembrulha: o SDK pode devolver { data: {...} } ou o próprio objeto.
      dados = resposta?.data && typeof resposta.data === 'object' && !resposta.ok ? resposta.data : resposta;
      if (dados?.data && typeof dados.data === 'object' && dados.data.scenes) dados = dados.data;
      if (dados?.body && typeof dados.body === 'object' && dados.body.scenes) dados = dados.body;
    }

    progress(true, 85, 'a receber o texto…');
    if (!dados || !dados.ok) throw new Error(dados?.error || 'a geração falhou sem explicação');

    state.scenes = dados.scenes.map((s) => {
      const antes = state.scenes.find((p) => p.filename === s.filename);
      return { filename: s.filename, texto: s.texto || '', audioUrl: antes?.audioUrl || null, audioB64: antes?.audioB64 || null, audioExt: antes?.audioExt || '' };
    });
    renderScenes();
    progress(true, 100, 'narração pronta');
    const vazias = state.scenes.filter((s) => !s.texto.trim()).length;
    toast(vazias ? `Narração gerada, mas ${vazias} imagem(ns) sem texto.` : `Narração gerada para ${state.scenes.length} imagem(ns).`, vazias ? '' : 'ok');
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    state.busy = false;
    $('btn-generate').disabled = !state.images.length;
    setTimeout(() => progress(false), 1200);
    renderThumbs();
  }
}

// ---------------------------------------------------------------- ElevenLabs
// A chave vive como segredo na Base44; esta página só pede a lista de vozes e o
// áudio. No plano gratuito a ElevenLabs recusa as vozes da biblioteca (402) —
// por isso a lista mostra primeiro as vozes da CONTA, que são as que servem.

function marcarMotor() {
  [...$('motores').children].forEach((b) => b.classList.toggle('on', b.dataset.motor === state.motor));
  $('grupo-browser').hidden = state.motor !== 'browser';
  $('grupo-eleven').hidden = state.motor !== 'eleven';
  guardar();
}

function marcarTom() {
  [...$('tons-eleven').children].forEach((b) => b.classList.toggle('on', b.dataset.tom === state.tom));
  guardar();
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

function desenharVozesEleven(dados) {
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

function estadoEleven(msg, tipo = '') {
  const el = $('eleven-estado');
  if (!msg) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.className = `cfg-result ${tipo}`;
  el.textContent = msg;
}

async function carregarVozesEleven() {
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
async function audioDaEleven(texto) {
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

// ---------------------------------------------------------------- ações
async function gerarTodoAudio() {
  const alvo = state.scenes.filter((s) => (s.texto || '').trim());
  if (!alvo.length) return toast('Gere a narração primeiro.', 'err');
  if (state.busy) return;
  if (state.motor === 'eleven') return gerarTodoAudioEleven(alvo);

  state.busy = true;
  state.parar = false;
  $('btn-gerar-audio').disabled = true;
  progress(true, 2, 'a pedir acesso ao áudio…');

  let parar = () => {};
  try {
    const { fluxo, parar: p } = await obterFluxo();
    parar = p;
  } catch (e) {
    state.busy = false;
    $('btn-gerar-audio').disabled = false;
    progress(false);
    return toast(`Não consegui aceder ao áudio: ${e.message}`, 'err');
  }

  let feitos = 0;
  const falhas = [];
  try {
    for (const [i, cena] of alvo.entries()) {
      if (state.parar) break;
      const li = $('scenes').children[state.scenes.indexOf(cena)];
      const badge = li?.querySelector('.badge');
      const audio = li?.querySelector('audio');
      progress(true, Math.round((i / alvo.length) * 100), `a gravar imagem ${i + 1} de ${alvo.length}…`);
      try {
        const blob = await gravarComFluxo(cena.texto, fluxo, (m) => {
          if (badge) {
            badge.hidden = false;
            badge.textContent = m;
            badge.className = 'badge busy';
          }
        });
        if (cena.audioUrl) URL.revokeObjectURL(cena.audioUrl);
        cena.audioUrl = URL.createObjectURL(blob);
        cena.audioB64 = await paraBase64(blob);
        cena.audioExt = 'webm';
        if (audio) {
          audio.src = cena.audioUrl;
          audio.hidden = false;
        }
        if (badge) {
          badge.textContent = 'áudio pronto';
          badge.className = 'badge ok';
        }
        feitos++;
      } catch (e) {
        falhas.push(state.scenes.indexOf(cena) + 1);
        if (badge) {
          badge.textContent = e.message;
          badge.className = 'badge err';
        }
        if (falhas.length >= 2) break;
      }
    }
  } finally {
    parar();
    state.busy = false;
    state.parar = false;
    $('btn-gerar-audio').disabled = false;
    progress(false);
    atualizarContador();
  }
  toast(falhas.length ? `${feitos} pronto(s); falharam: imagem ${falhas.join(', ')}.` : `${feitos} áudio(s) pronto(s).`, falhas.length ? '' : 'ok');
}

// Gera o áudio de todas as cenas pela ElevenLabs. Vai cena a cena para o
// progresso ser visível e para uma falha não estragar o trabalho já feito.
async function gerarTodoAudioEleven(alvo) {
  state.busy = true;
  state.parar = false;
  $('btn-gerar-audio').disabled = true;

  let feitos = 0;
  const falhas = [];
  let primeiroErro = '';
  try {
    for (const [i, cena] of alvo.entries()) {
      if (state.parar) break;
      const idx = state.scenes.indexOf(cena);
      const li = $('scenes').children[idx];
      const badge = li?.querySelector('.badge');
      const audio = li?.querySelector('audio');
      const marcar = (t, tipo = '') => {
        if (!badge) return;
        badge.hidden = !t;
        badge.textContent = t;
        badge.className = `badge ${tipo}`;
      };

      marcar('a gerar…', 'busy');
      const nomeVoz = state.vozesEleven.find((v) => v.id === state.vozEleven);
      progress(
        true,
        Math.round((i / alvo.length) * 100),
        `ElevenLabs${nomeVoz ? ` (${nomeVoz.nome})` : ''} — imagem ${i + 1} de ${alvo.length}…`,
      );
      try {
        const r = await audioDaEleven(cena.texto);
        if (cena.audioUrl) URL.revokeObjectURL(cena.audioUrl);
        cena.audioUrl = URL.createObjectURL(r.blob);
        cena.audioB64 = await paraBase64(r.blob);
        cena.audioExt = r.ext;
        cena.vozUsada = r.nomeVoz || nomeVoz?.nome || '';
        if (audio) {
          audio.src = cena.audioUrl;
          audio.hidden = false;
        }
        // Mostra a VOZ usada, não só "pronto": é a prova de que a escolha pegou.
        marcar(r.nomeVoz ? `MP3 · ${r.nomeVoz}` : 'MP3 pronto', 'ok');
        feitos++;
      } catch (e) {
        falhas.push(idx + 1);
        marcar(e.message, 'err');
        if (!primeiroErro) primeiroErro = e.message;
        // Um problema de plano/chave não melhora na cena seguinte: parar evita
        // gastar caracteres e encher o ecrã com o mesmo erro.
        if (/plano gratuito|402|recusada|Falta o segredo|não existe na sua conta/i.test(e.message)) break;
      }
    }
  } finally {
    state.busy = false;
    state.parar = false;
    $('btn-gerar-audio').disabled = false;
    progress(false);
    atualizarContador();
  }

  if (!feitos && primeiroErro) {
    toast(`Nenhum áudio gerado. ${primeiroErro}`, 'err');
    estadoEleven(`❌ ${primeiroErro}`, 'err');
  } else {
    toast(
      falhas.length ? `${feitos} áudio(s) pronto(s); falharam: imagem ${falhas.join(', ')}.` : `${feitos} áudio(s) gerado(s) pela ElevenLabs.`,
      falhas.length ? '' : 'ok',
    );
  }
}

// Ouve todas as cenas em sequência, com o MOTOR escolhido: a voz do browser
// (síntese local) ou a voz da ElevenLabs (pré-escuta gerada e guardada).
async function ouvirTudo() {
  state.parar = false;
  const comTexto = state.scenes.filter((s) => (s.texto || '').trim());
  if (!comTexto.length) return toast('Gere a narração primeiro.', 'err');

  for (const [i, cena] of comTexto.entries()) {
    if (state.parar) break;
    progress(true, Math.round((i / comTexto.length) * 100), `a ouvir ${i + 1} de ${comTexto.length}…`);
    try {
      if (state.motor === 'eleven') {
        if (!cena.previaUrl) {
          const r = await audioDaEleven(cena.texto);
          cena.previaUrl = URL.createObjectURL(r.blob);
          cena.previaVoz = r.nomeVoz || '';
        }
        await tocarUrl(cena.previaUrl);
      } else {
        await falar(cena.texto);
      }
    } catch (e) {
      toast(`Imagem ${state.scenes.indexOf(cena) + 1}: ${e.message}`, 'err');
      break; // erro de plano/chave não melhora na cena seguinte
    }
  }
  state.parar = false;
  progress(false);
}

// ZIP montado no browser, sem bibliotecas: formato "store" (sem compressão),
// que é válido e suficiente para texto e áudio.
async function descarregarZip() {
  const comTexto = state.scenes.filter((s) => (s.texto || '').trim());
  if (!comTexto.length) return toast('Gere a narração antes de descarregar.', 'err');

  const ficheiros = [];
  const linhas = ['# ' + ($('tone').dataset.titulo || 'Narração'), ''];
  state.scenes.forEach((s, i) => {
    linhas.push(`--- Imagem ${i + 1}: ${s.filename} ---`);
    linhas.push(s.texto || '');
    linhas.push('');
  });
  ficheiros.push({ nome: 'narracao.txt', dados: new TextEncoder().encode(linhas.join('\n')) });

  for (const [i, s] of state.scenes.entries()) {
    if (!s.audioB64) continue;
    const bin = atob(s.audioB64);
    const bytes = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
    ficheiros.push({ nome: `audio/${String(i + 1).padStart(2, '0')}-${s.filename.replace(/\.[^.]+$/, '')}.${s.audioExt || 'webm'}`, dados: bytes });
  }

  const { criarZip } = await import('./zip.mjs');
  const zip = criarZip(ficheiros);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }));
  a.download = 'narracao-rebeca.zip';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast('Pacote descarregado.', 'ok');
}

// ---------------------------------------------------------------- vídeo
// As contas das legendas vivem em legendas-core.mjs. São carregadas no início
// (init) e guardadas aqui, para o resumo poder contar os blocos sem esperar.
const leg = { blocosDaNarracao: () => [] };

// ---------------------------------------------------------------- modos do vídeo
// Três formas de montar o vídeo. A terceira existe para quem quer só a trilha:
// as imagens passam com a música por baixo, sem voz nenhuma e sem ter de gerar
// narração primeiro.
const MODOS_VIDEO = [
  { id: 'narracao', rotulo: '🎙️ Só narração', nota: 'as imagens com a voz, sem música' },
  { id: 'ambos', rotulo: '🎙️🎵 Narração + música', nota: 'a voz com a trilha por baixo' },
  { id: 'musica', rotulo: '🎵 Só música', nota: 'as imagens com a trilha, sem voz' },
];

const modoVideo = () => MODOS_VIDEO.find((m) => m.id === state.videoModo) || MODOS_VIDEO[1];
const querVoz = () => state.videoModo !== 'musica';
const querMusica = () => state.videoModo !== 'narracao';

function marcarModoVideo() {
  const mv = $('vid-modos');
  if (mv) [...mv.children].forEach((x) => x.classList.toggle('on', x.dataset.id === state.videoModo));
  // A duração de cada imagem só faz sentido quando não há voz a mandar no ritmo.
  const grupo = $('grupo-cena');
  if (grupo) grupo.hidden = querVoz();
}

// Nota da letra, para o resumo: diz quantos versos e quanto tempo cada um leva.
function notaLetra() {
  if (!state.letraLigada) return '';
  const cues = cuesDaLetra();
  if (!cues.length) return ' ⚠️ A letra está ligada, mas falta o texto ou a música — vão sair as legendas da narração.';
  const cada = (cues[0].fim - cues[0].inicio).toFixed(1).replace('.', ',');
  return ` 💬 Legenda: a LETRA da música, ${cues.length} verso(s) de ${cada}s cada (substitui a legenda da narração).`;
}

// O texto que fica por baixo dos controlos: diz exatamente o que vai sair.
function resumoVideo() {
  const m = modoVideo();
  const n = state.scenes.filter((s) => (s.texto || '').trim()).length || state.images.length;
  const musica = state.musicaFicheiro && querMusica();
  const nota = state.letraLigada ? notaLetra() : legendasNota();

  if (state.videoModo === 'musica') {
    const seg = n * (Number(state.videoDuracaoCena) || 3.5);
    if (!n) return estadoVideo('❌ Importe as imagens primeiro (aba 🖼️ Imagens).', 'err');
    if (!musica) {
      return estadoVideo('❌ O modo "só música" precisa de uma trilha. Escolha a música aqui em cima.', 'err');
    }
    return estadoVideo(
      `Vai sair um vídeo de ${n} imagem(ns), cerca de ${formatarMinutos(seg)}, com a trilha ` +
        `"${state.musicaFicheiro.name}" em ciclo e sem voz. Transição "${transicaoRotulo()}".` +
        `${nota}${notaCiclo()} Demora cerca de ${formatarMinutos(vezesQueRepete().total || seg)} a gravar.`,
      '',
    );
  }

  // Com a LETRA em uso, a legenda já está resolvida — e a letra não precisa de
  // narração nenhuma. É este caminho que faz o vídeo de letra funcionar sem
  // gerar voz, por isso vem antes das exigências da narração.
  const cuesLetra = state.letraLigada ? cuesDaLetra() : [];
  if (cuesLetra.length) {
    if (!state.images.length) return estadoVideo('❌ Importe as imagens primeiro (aba 🖼️ Imagens).', 'err');
    if (!musica) {
      return estadoVideo(
        '❌ A letra precisa da música para saber o tempo de cada verso. Escolha a trilha aqui em cima.',
        'err',
      );
    }
    return estadoVideo(
      `Pronto para o vídeo de letra: ${state.images.length} imagem(ns), transição "${transicaoRotulo()}", ` +
        `trilha "${state.musicaFicheiro.name}".` +
        `${nota}${notaCiclo()} A gravação demora o tempo do vídeo.`,
      '',
    );
  }

  const semAudio = state.scenes.filter((s) => (s.texto || '').trim() && !s.audioUrl && !s.previaUrl).length;
  if (!n) {
    return estadoVideo(
      '❌ Gere a narração primeiro (aba ⚡ Ações) — ou cole a letra da música aqui em baixo, ' +
        'que não precisa de voz nenhuma.',
      'err',
    );
  }
  if (semAudio === n) {
    return estadoVideo(
      '❌ Ainda não há áudio. Vá à aba ⚡ Ações e clique em "🎧 Gerar o áudio de todas as cenas". ' +
        'Ou mude "O que entra" para 🎵 Só música, que não precisa de voz nenhuma.' +
        nota, // mesmo sem áudio, ver como a fala vai ser cortada ajuda
      'err',
    );
  }
  return estadoVideo(
    `Pronto: ${n} imagem(ns), transição "${transicaoRotulo()}", ${m.rotulo.toLowerCase()}` +
      `${semAudio ? ` — ${semAudio} cena(s) sem áudio` : ''}` +
      `${musica ? `, trilha "${state.musicaFicheiro.name}"` : state.videoModo === 'ambos' ? ' (sem trilha escolhida)' : ''}.` +
      `${nota}${notaCiclo()} A gravação demora o tempo do vídeo.`,
    semAudio ? 'wait' : '',
  );
}

// Quantos blocos de legenda vão sair e um exemplo do primeiro — assim o
// utilizador vê como a fala foi cortada antes de gravar dois minutos de vídeo.
function legendasNota() {
  if (!state.legendas) return '';
  const textos = state.scenes.filter((s) => querVoz() && (s.texto || '').trim()).map((s) => s.texto);
  const lista = querVoz() ? textos : state.scenes.map((s) => s.texto || '');
  const blocos = lista.flatMap((t) => (t ? leg.blocosDaNarracao(t) : []));
  if (!blocos.length) return ' Legendas ligadas, mas não há texto para legendar.';
  const exemplo = blocos[0].length > 34 ? `${blocos[0].slice(0, 34)}…` : blocos[0];
  return ` Legendas: ${blocos.length} bloco(s) — o primeiro é “${exemplo}”. Sai também o .srt.`;
}

const transicaoRotulo = () => state.videoTransicaoRotulo || state.videoTransicao;

// O modo de duração "até acabar a música" precisa mesmo de uma música escolhida,
// senão não faz nada — quem escolhe fica a saber porquê.
function marcarModoDuracao() {
  const cdm = $('vid-duracao-modo');
  const semMusica = !state.musicaFicheiro;
  if (state.modoDuracao === 'trilha' && semMusica) state.modoDuracao = 'natural';
  if (cdm) {
    [...cdm.children].forEach((x) => {
      const querido = x.dataset.id === state.modoDuracao;
      x.classList.toggle('on', querido);
      x.disabled = x.dataset.id === 'trilha' && semMusica;
      x.title = x.disabled ? 'escolha primeiro uma música na trilha' : x.title;
    });
  }
}

// Quantas vezes as imagens vão repetir, para o resumo poder prometê-lo.
function vezesQueRepete() {
  const natural = duracaoNaturalPrevista();
  const alvo = Number(state.musicaSegundos) || 0;
  if (state.modoDuracao !== 'trilha' || !natural || !(alvo > natural)) return { passagens: 1, total: natural, alvo };
  const n = Math.min(100, Math.max(2, Math.ceil(alvo / natural)));
  return { passagens: n, total: natural * n, alvo };
}

// Nota do ciclo. Diz SEMPRE o que vai acontecer: quantas passagens, ou porque
// razão não repete. Foi a falta disto que deixou um "não funcionou" sem pista.
function notaCiclo() {
  const r = vezesQueRepete();
  if (state.modoDuracao !== 'trilha') return '';
  if (!state.musicaFicheiro) return ' Para repetir até acabar a música, escolha primeiro a trilha.';
  if (!state.musicaMedida || !(r.alvo > 0)) {
    return ' ⚠️ Não consegui ler a duração desta música, por isso não sei até quando repetir — ' +
      'o vídeo fica com a duração das imagens. Experimente outro ficheiro (MP3 ou WAV).';
  }
  if (r.passagens === 1) {
    return ` ℹ️ A música (${formatarMinutos(r.alvo)}) não é mais longa do que o vídeo (${formatarMinutos(r.total)}): não há nada a repetir.`;
  }
  return ` 🔁 REPETE: as imagens passam ${r.passagens}×, até acabar a música de ${formatarMinutos(r.alvo)}. O vídeo fica com ${formatarMinutos(r.total)}.`;
}

// Quanto tempo o vídeo levaria sem repetir nada.
function duracaoNaturalPrevista() {
  const comTexto = state.scenes.filter((s) => (s.texto || '').trim());
  const lista = querVoz() ? comTexto : state.images;
  if (!lista.length) return 0;
  if (!querVoz()) return lista.length * (Number(state.videoDuracaoCena) || 3.5);
  // Com voz manda a duração do áudio de cada cena; enquanto não estiver gerado,
  // estima-se pela contagem de palavras (~2,4 palavras por segundo, o mesmo
  // ritmo das vozes usadas) para o resumo não prometer um número inventado.
  return lista.reduce((soma, s) => {
    const w = palavras(s.texto);
    return soma + Math.max(1.2, w / 2.4);
  }, 0);
}

// ---------------------------------------------------------------- letra da música
// A letra da música vive agora em estudio-letra-trilha.mjs (o app.js estava
// demasiado grande para continuar a crescer); aqui ficam só os atalhos.
let modLetraTrilha = null;
const cuesDaLetra = () => (modLetraTrilha ? modLetraTrilha.cuesDaLetra() : []);
const atualizarLetra = () => modLetraTrilha?.atualizarLetra();
const limparLetra = () => modLetraTrilha?.limparLetra();
const alternarLetra = () => modLetraTrilha?.alternarLetra();
const preverLetra = () => modLetraTrilha?.preverLetra();
const pararPreviaLetra = () => modLetraTrilha?.pararPreviaLetra();

// ---------------------------------------------------------------- resultado do vídeo
// O ficheiro fica guardado aqui depois de gerado, para o poder VER dentro da
// página, descarregar outra vez e guardar o .srt. Ver aqui dentro é o que
// distingue "o ficheiro está mau" de "o leitor do Windows não o abre".
let resultadoVideo = { blob: null, nome: '', srt: '' };

function descarregarBlob(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// O browser sabe abrir a janela "Guardar como"? O Chrome e o Edge sabem (File
// System Access API); o Firefox e o Safari não. Sem isto, o ficheiro cai sempre
// na pasta das descargas, sem o utilizador poder escolher o sítio.
const podeEscolherOnde = () => typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function';

// Põe nos botões o texto certo para este browser: "Guardar…" quando abre a
// janela para escolher, "Descarregar" quando não há essa janela.
function rotularBotoesGuardar() {
  const escolhe = podeEscolherOnde();
  const b1 = $('btn-video-guardar');
  const b2 = $('btn-video-guardar-srt');
  if (b1) {
    b1.textContent = escolhe ? '💾 Guardar o vídeo…' : '⬇️ Descarregar o vídeo';
    b1.title = escolhe ? 'abre a janela para escolher a pasta e o nome' : 'vai para a pasta das transferências';
  }
  if (b2) {
    b2.textContent = escolhe ? '💾 Guardar as legendas (.srt)…' : '⬇️ Descarregar o .srt';
  }
}

// Guarda pedindo ao utilizador ONDE. Se ele cancelar a janela, devolve false e
// NÃO se descarrega nada: cancelar é uma decisão, não uma falha.
async function guardarComo(blob, nome, descricao = 'Ficheiro') {
  if (!podeEscolherOnde()) {
    descarregarBlob(blob, nome);
    return false;
  }
  const tipo = blob.type || 'application/octet-stream';
  const extensao = `.${(nome.split('.').pop() || '').toLowerCase()}`;
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: nome,
      types: [{ description: descricao, accept: { [tipo]: [extensao] } }],
    });
    const w = await handle.createWritable();
    await w.write(blob);
    await w.close();
    return true;
  } catch (e) {
    if (e && (e.name === 'AbortError' || e.name === 'NotAllowedError')) return false;
    // Outro erro qualquer: não deixa o utilizador sem o ficheiro.
    descarregarBlob(blob, nome);
    return false;
  }
}

function mostrarResultado(r, nome) {
  // Guarda o resultado INTEIRO: os detalhes (duração, formato, voz…) vão
  // para o registo na nuvem quando o utilizador clica em "Guardar na nuvem".
  resultadoVideo = { blob: r.blob, nome, srt: r.srt || '', r };
  const btnNuvem = $('btn-video-nuvem');
  if (btnNuvem) {
    btnNuvem.hidden = false;
    btnNuvem.disabled = false;
    btnNuvem.textContent = '☁️ Guardar na nuvem';
  }
  const caixa = $('vid-resultado');
  if (!caixa) return;
  caixa.hidden = false;
  const mb = (r.blob.size / 1048576).toFixed(1);
  const codec = r.codec === 'vp9' ? 'VP9 (mais pequeno)' : r.codec === 'vp8' ? 'VP8 (compatível)' : 'WebM';
  $('vid-resultado-nome').textContent = `${nome} · ${mb} MB · ${codec} · ${Math.round(r.duracao)}s`;
  $('btn-video-guardar-srt').hidden = !resultadoVideo.srt;
  rotularBotoesGuardar();
  const v = $('vid-teste');
  v.hidden = true;
  if (v.src) URL.revokeObjectURL(v.src);
  v.removeAttribute('src');
}

function verResultado() {
  const v = $('vid-teste');
  if (!resultadoVideo.blob) return;
  if (!v.hidden) {
    v.pause();
    v.hidden = true;
    return;
  }
  const codec = $('vid-resultado-nome').textContent;
  if (v.src) URL.revokeObjectURL(v.src);
  v.src = URL.createObjectURL(resultadoVideo.blob);
  v.hidden = false;
  $('vid-estado').textContent =
    `A tocar dentro da página. Se ouvir e ver tudo, o ficheiro está bom — use o VLC para o abrir no Windows ` +
    `(o leitor da Microsoft recusa WebM). ${codec}`;
  $('vid-estado').className = 'cfg-result ok';
  v.play().catch(() => {
    $('vid-estado').textContent = '⚠️ O browser não conseguiu abrir o vídeo que gravou — nesse caso o ficheiro pode estar incompleto. Grave outra vez.';
    $('vid-estado').className = 'cfg-result err';
  });
}

// ---------------------------------------------------------------- projetos
// A gestão dos projetos guardados vive agora em estudio-projetos.mjs; o objeto
// `projetos` fica aqui (o estúdio consulta-o ao limpar e ao guardar).
const projetos = { mod: null, idAtual: null, lista: [], criadoEm: null };
let modProjetosUI = null;
const estadoProjeto = (msg, tipo = '') => modProjetosUI?.estadoProjeto(msg, tipo);
const desenharProjetos = () => modProjetosUI?.desenharProjetos();
const guardarProjetoAgora = () => modProjetosUI?.guardarProjetoAgora();
const abrirProjeto = (id) => modProjetosUI?.abrirProjeto(id);
const apagarProjeto = (id, nome) => modProjetosUI?.apagarProjeto(id, nome);
const iniciarProjetos = () => modProjetosUI?.iniciarProjetos();

// ---------------------------------------------------------------- utilizador
// A lógica de "quem está a usar a app" vive agora em estudio-utilizador.mjs.
let modUtilizadorUI = null;
const iniciarUtilizador = () => modUtilizadorUI?.iniciarUtilizador({ toast });

// ---------------------------------------------------------------- trilha sonora
// A trilha sonora vive também em estudio-letra-trilha.mjs; aqui ficam os atalhos.
const pararPreviaTrilha = () => modLetraTrilha?.pararPreviaTrilha();
const escolherTrilha = () => modLetraTrilha?.escolherTrilha();
const tirarTrilha = () => modLetraTrilha?.tirarTrilha();
const ouvirTrilha = () => modLetraTrilha?.ouvirTrilha();
const ligarTrilha = () => modLetraTrilha?.ligarTrilha();
const atualizarTrilha = () => modLetraTrilha?.atualizarTrilha();

// "1:23" — usado para a duração da música e para o tempo previsto do vídeo.
// O módulo da trilha tem a sua própria versão, com o mesmo formato.
const formatarMinutos = (s) => {
  const t = Math.max(0, Math.round(Number(s) || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};



// ---------------------------------------------------------------- vídeo
// O vídeo é montado no browser (não há ffmpeg na nuvem). Ver public/video.mjs.
function estadoVideo(msg, tipo = '') {
  const el = $('vid-estado');
  if (!msg) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.className = `cfg-result ${tipo}`;
  el.textContent = msg;
}

async function iniciarVideo() {
  const mod = await import('./video.mjs');
  // A versão fica à vista: se um dia algo "não funcionar", dá para confirmar
  // num segundo se o browser está a correr o build novo ou um antigo em cache.
  const v = $('versao');
  if (v) v.textContent = `vídeo v${mod.VERSAO_VIDEO || '?'}`;
  // O corte da narração em blocos de legenda vem do mesmo módulo do 2.0.
  try {
    Object.assign(leg, await import('./legendas-core.mjs'));
  } catch {
    /* sem legendas é melhor do que sem página */
  }

  // Formato
  const sel = $('vid-formato');
  sel.innerHTML = '';
  mod.FORMATOS.forEach((f) => {
    const o = document.createElement('option');
    o.value = f.id;
    o.textContent = f.rotulo;
    sel.append(o);
  });
  sel.value = state.videoFormato || '1920x1080';
  sel.onchange = () => {
    state.videoFormato = sel.value;
    guardar();
  };

  // Transições
  const ct = $('vid-transicoes');
  ct.innerHTML = '';
  mod.TRANSICOES.forEach((t) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.id = t.id;
    b.textContent = t.rotulo;
    b.title = t.nota;
    b.onclick = () => {
      state.videoTransicao = t.id;
      state.videoTransicaoRotulo = t.rotulo;
      [...ct.children].forEach((x) => x.classList.toggle('on', x === b));
      guardar();
      resumoVideo();
    };
    ct.append(b);
  });
  const escolhida = mod.TRANSICOES.find((t) => t.id === state.videoTransicao) || mod.TRANSICOES[0];
  state.videoTransicao = escolhida.id;
  state.videoTransicaoRotulo = escolhida.rotulo;
  [...ct.children].forEach((x) => x.classList.toggle('on', x.dataset.id === escolhida.id));

  // Durações
  const cd = $('vid-duracoes');
  cd.innerHTML = '';
  mod.DURACOES.forEach((d) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.id = String(d.id);
    b.textContent = d.rotulo;
    b.onclick = () => {
      state.videoDuracao = d.id;
      [...cd.children].forEach((x) => x.classList.toggle('on', x === b));
      guardar();
    };
    cd.append(b);
  });
  const dur = mod.DURACOES.find((d) => d.id === state.videoDuracao) || mod.DURACOES[1];
  state.videoDuracao = dur.id;
  [...cd.children].forEach((x) => x.classList.toggle('on', Number(x.dataset.id) === dur.id));

  // Trilha sonora
  $('btn-trilha-add').onclick = () => $('input-trilha').click();
  $('input-trilha').onchange = escolherTrilha;
  $('btn-trilha-ouvir').onclick = ouvirTrilha;
  $('btn-trilha-tirar').onclick = tirarTrilha;
  $('trilha-ligada').onchange = ligarTrilha;

  // O que entra no vídeo
  const mv = $('vid-modos');
  mv.innerHTML = '';
  MODOS_VIDEO.forEach((m) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.id = m.id;
    b.textContent = m.rotulo;
    b.title = m.nota;
    b.onclick = () => {
      state.videoModo = m.id;
      guardar();
      marcarModoVideo();
      resumoVideo();
    };
    mv.append(b);
  });
  marcarModoVideo();

  // Duração de cada imagem, no modo sem voz
  const cdc = $('vid-cena');
  cdc.innerHTML = '';
  mod.DURACOES_CENA.forEach((d) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.id = String(d.id);
    b.textContent = d.rotulo;
    b.onclick = () => {
      state.videoDuracaoCena = d.id;
      [...cdc.children].forEach((x) => x.classList.toggle('on', Number(x.dataset.id) === d.id));
      guardar();
      resumoVideo();
    };
    cdc.append(b);
  });
  const dc = mod.DURACOES_CENA.find((d) => d.id === Number(state.videoDuracaoCena)) || mod.DURACOES_CENA[1];
  state.videoDuracaoCena = dc.id;
  [...cdc.children].forEach((x) => x.classList.toggle('on', Number(x.dataset.id) === dc.id));

  // Legendas: só ligar ou desligar — o estilo é fixo, igual ao Hub 2.0.
  const cl = $('vid-legendas');
  cl.innerHTML = '';
  [
    { id: true, rotulo: '💬 Legendas', nota: 'narração em blocos curtos no fundo do vídeo, e um ficheiro .srt' },
    { id: false, rotulo: 'Sem legendas', nota: 'só a imagem' },
  ].forEach((o) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.id = String(o.id);
    b.textContent = o.rotulo;
    b.title = o.nota;
    b.onclick = () => {
      state.legendas = o.id;
      [...cl.children].forEach((x) => x.classList.toggle('on', x === b));
      guardar();
      resumoVideo();
    };
    cl.append(b);
  });
  [...cl.children].forEach((x) => x.classList.toggle('on', x.dataset.id === String(Boolean(state.legendas))));

  // Letra da música
  const ta = $('letra-texto');
  if (ta) {
    ta.value = state.letra || '';
    ta.oninput = () => {
      state.letra = ta.value;
      guardar();
      atualizarLetra();
      resumoVideo();
    };
  }
  $('btn-letra-usar').onclick = alternarLetra;
  $('btn-letra-previa').onclick = preverLetra;
  $('btn-letra-limpar').onclick = limparLetra;
  atualizarLetra();

  // Duração: as cenas, ou imagens em ciclo até a música acabar.
  const cdm = $('vid-duracao-modo');
  cdm.innerHTML = '';
  mod.MODOS_DURACAO.forEach((m) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.id = m.id;
    b.textContent = m.id === 'trilha' ? '🔁 Até acabar a música' : '🖼️ As imagens';
    b.title = m.id === 'trilha'
      ? 'as imagens repetem em ciclo enquanto a trilha toca'
      : 'o vídeo dura o que durar a narração das cenas';
    b.onclick = () => {
      state.modoDuracao = m.id;
      marcarModoDuracao();
      guardar();
      resumoVideo();
    };
    cdm.append(b);
  });
  marcarModoDuracao();

  // Codec: compatibilidade primeiro. O VP9 no WebM é o que o Windows recusa
  // abrir (erro 0xC00D36C4); o VP8 é lido em todo o lado.
  const cc = $('vid-codec');
  cc.innerHTML = '';
  mod.CODECS.forEach((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.id = c.id;
    b.textContent = c.rotulo;
    b.title = c.nota;
    b.onclick = () => {
      state.codec = c.id;
      [...cc.children].forEach((x) => x.classList.toggle('on', x === b));
      guardar();
      resumoVideo();
    };
    cc.append(b);
  });
  const codecEscolhido = mod.CODECS.find((c) => c.id === state.codec) || mod.CODECS[0];
  state.codec = codecEscolhido.id;
  [...cc.children].forEach((x) => x.classList.toggle('on', x.dataset.id === state.codec));

  atualizarTrilha();

  // Suporte do browser
  if (!mod.suporta()) {
    $('btn-video').disabled = true;
    estadoVideo('⚠️ Este browser não consegue gravar vídeo. Use o Chrome ou o Edge.', 'err');
  } else {
    resumoVideo();
  }

  $('btn-video').onclick = gerarVideoFinal;
  $('btn-video-parar').onclick = () => {
    state.pararVideo = true;
  };
  $('btn-video-ver').onclick = verResultado;
  $('btn-video-guardar').onclick = async () => {
    if (!resultadoVideo.blob) return;
    const ok = await guardarComo(resultadoVideo.blob, resultadoVideo.nome, 'Vídeo WebM');
    if (ok) toast(`Vídeo guardado onde escolheu: ${resultadoVideo.nome}`, 'ok');
  };
  $('btn-video-guardar-srt').onclick = async () => {
    if (!resultadoVideo.srt) return;
    const blob = new Blob([resultadoVideo.srt], { type: 'text/plain;charset=utf-8' });
    const ok = await guardarComo(blob, 'rebeca-video.srt', 'Legendas (SubRip)');
    if (ok) toast('Legendas guardadas onde escolheu.', 'ok');
  };
  $('btn-video-nuvem').onclick = guardarNaNuvem;
  rotularBotoesGuardar();
}

async function gerarVideoFinal() {
  if (state.busy) return;

  const comTexto = state.scenes.filter((s) => (s.texto || '').trim());
  const semFala = comTexto.filter((s) => !s.audioUrl && !s.previaUrl);
  const musica = state.musicaFicheiro && querMusica() && state.musicaLigada ? state.musicaFicheiro : null;

  // A letra, se estiver em uso, é calculada uma vez e reutilizada.
  const cuesLetra = state.letraLigada ? cuesDaLetra() : [];

  // Com a letra em uso e SEM narração gerada, o vídeo é de letra: vale o mesmo
  // que o modo "só música" — uma imagem por vez, ao ritmo escolhido.
  const comVoz = querVoz() && !(cuesLetra.length && semFala.length === comTexto.length);

  // --- O que é preciso para cada modo ---
  // Só música (ou vídeo de letra): uma trilha e imagens. Narração nenhuma.
  if (!comVoz) {
    if (!musica && !cuesLetra.length) {
      return estadoVideo(
        '❌ O modo "só música" precisa de uma trilha. Escolha a música aqui em cima, ' +
          'ou mude "O que entra" para 🎙️🎵 Narração + música.',
        'err',
      );
    }
    if (cuesLetra.length && !musica) {
      return estadoVideo('❌ A letra precisa da música para saber o tempo de cada verso.', 'err');
    }
    if (!state.images.length) {
      return estadoVideo('❌ Importe as imagens primeiro (aba 🖼️ Imagens).', 'err');
    }
  } else {
    if (!comTexto.length) {
      return estadoVideo(
        '❌ Gere a narração primeiro (aba ⚡ Ações). ' +
          'Se quer um vídeo só com música, mude "O que entra" para 🎵 Só música.',
        'err',
      );
    }
    if (semFala.length === comTexto.length) {
      return estadoVideo(
        '❌ Ainda não há áudio. Vá à aba ⚡ Ações e clique em "🎧 Gerar o áudio de todas as cenas" — ' +
          'o vídeo usa esse áudio. (A pré-escuta de cada cena também serve.) ' +
          'Ou mude "O que entra" para 🎵 Só música, que não precisa de voz.',
        'err',
      );
    }
  }

  const mod = await import('./video.mjs');
  state.busy = true;
  state.pararVideo = false;
  $('btn-video').disabled = true;
  $('btn-video-parar').hidden = false;

  // Uma cena por imagem que tenha ficheiro conhecido. No modo com voz, são as
  // cenas narradas; no modo só música, são TODAS as imagens importadas.
  const lista = comVoz ? comTexto : state.images;
  const cenas = [];
  for (const s of lista) {
    const imagem = comVoz ? imagemDaCena(s) : s.url;
    if (!imagem) continue;
    let audio = null;
    const url = comVoz ? s.audioUrl || s.previaUrl : null;
    if (url) {
      try {
        audio = await (await fetch(url)).blob();
      } catch {
        audio = null; // fica sem voz nesta cena, mas entra no vídeo
      }
    }
    // O texto vai com a legenda: é dele que saem os blocos do vídeo e do .srt.
    cenas.push({ imagem, audio, texto: s.texto || '' });
  }

  if (!cenas.length) {
    state.busy = false;
    $('btn-video').disabled = false;
    $('btn-video-parar').hidden = true;
    return estadoVideo('❌ Não consegui preparar nenhuma imagem para o vídeo.', 'err');
  }

  const semVoz = cenas.filter((c) => !c.audio).length;
  if (comVoz && semVoz) {
    estadoVideo(`⚠️ ${semVoz} cena(s) sem áudio — o vídeo fica sem voz nessas.`, 'wait');
  }

  const preview = $('vid-preview');
  preview.hidden = false;
  // A miniatura para o painel é captada durante a gravação (fotograma ~1,5s).
  state._miniatura = null;
  state._miniaturaPedida = false;

  // A letra é calculada uma vez: a lista é reutilizada na chamada e no resumo.
  const comLegendas = Boolean(state.legendas) || cuesLetra.length > 0;

  try {
    const r = await mod.gerarVideo({
      cenas,
      formato: state.videoFormato,
      transicao: state.videoTransicao,
      duracaoTransicao: state.videoDuracao,
      musica,
      duracaoCena: state.videoDuracaoCena,
      // Com a letra em uso, as legendas ficam ligadas (ela substitui a narração).
      legendas: comLegendas,
      legendasExternas: cuesLetra.length ? cuesLetra : null,
      codec: state.codec,
      modoDuracao: state.modoDuracao,
      musicaSegundos: state.musicaSegundos,
      // Desenha no canvas visível: vê-se a montagem enquanto grava.
      canvas: preview,
      aoProgredir: (p) => {
        if (p.fase === 'a gravar') {
          // Miniatura: o primeiro fotograma a partir de 1,5s, para não apanhar
          // a passagem de entrada escura entre duas imagens.
          if (!state._miniaturaPedida && p.segundos >= 1.5) {
            state._miniaturaPedida = true;
            try {
              preview.toBlob((b) => { if (b) state._miniatura = b; }, 'image/jpeg', 0.8);
            } catch {
              /* sem miniatura, o painel mostra o ícone */
            }
          }
          const pct = p.totalSegundos ? Math.round((p.segundos / p.totalSegundos) * 100) : 0;
          const ciclo = p.passagens > 1 ? ` · passagem ${p.passagem} de ${p.passagens}` : '';
          progress(true, pct, `a gravar imagem ${p.atual} de ${p.total}${ciclo} — ${Math.round(p.segundos)}s de ${Math.round(p.totalSegundos)}s`);
          estadoVideo(
            `a gravar… imagem ${p.atual} de ${p.total}${ciclo}. Não mude de janela. ` +
              `${Math.round(p.segundos)}s de ${Math.round(p.totalSegundos)}s.`,
            'wait',
          );
        } else {
          progress(true, 2, `${p.fase}…`);
          estadoVideo(`${p.fase}…`, 'wait');
        }
      },
      deveParar: () => state.pararVideo,
    });

    if (!r.ok) throw new Error(r.erro);

    // O motor mediu a música pelo áudio descodificado, que é a verdade. Se a
    // página tinha medido outra coisa, fica a certa para a próxima vez (e o
    // desvio vai para a consola, porque um desvio grande é um defeito a olhar).
    if (r.musicaSegundos > 0 && Math.abs(r.musicaSegundos - (state.musicaSegundos || 0)) > 1) {
      if (state.musicaSegundos > 0) {
        console.warn(
          `[trilha] a página mediu ${state.musicaSegundos.toFixed(2)}s e o áudio descodificado tem ` +
            `${r.musicaSegundos.toFixed(2)}s; passei a usar o valor do áudio.`,
        );
      }
      state.musicaSegundos = r.musicaSegundos;
      state.musicaDuracao = r.musicaSegundos;
      state.musicaMedida = true;
      atualizarTrilha();
      guardar();
    }

    const nome = `rebeca-video.${r.extensao}`;

    // Guarda o resultado e mostra-o para se poder VER aqui dentro.
    mostrarResultado(r, nome);

    // Com a janela "Guardar como" (Chrome/Edge), o utilizador escolhe a pasta e
    // o nome. É o passo que faltava: antes o ficheiro caía sempre na pasta das
    // transferências sem se poder escolher. Nos browsers sem esta janela, cai
    // numa descarga normal — o mesmo de antes.
    const escolheu = await guardarComo(r.blob, nome, 'Vídeo WebM');

    // O .srt sai dos MESMOS blocos que foram desenhados no vídeo, e também
    // pergunta onde guardar (só depois de o vídeo estar tratado, para não abrir
    // duas janelas de uma vez).
    if (r.srt) {
      const srtBlob = new Blob([r.srt], { type: 'text/plain;charset=utf-8' });
      if (!podeEscolherOnde() || escolheu) {
        setTimeout(() => guardarComo(srtBlob, 'rebeca-video.srt', 'Legendas (SubRip)'), 400);
      }
    }

    estadoVideo(
      `✅ Vídeo pronto: ${Math.round(r.duracao)}s, ${(r.blob.size / 1048576).toFixed(1)} MB, ` +
        `formato ${r.formato}, transição "${r.transicao}", ${r.comVoz ? 'com narração' : 'sem voz'}` +
        `${r.comMusica ? ' e com trilha' : musica ? ' e SEM trilha' : ''}. ` +
        `${r.repetido
          ? `🔁 As imagens passaram ${r.passagens}× (${Math.round(r.duracaoNatural)}s cada passagem).`
          : state.modoDuracao === 'trilha'
            ? `ℹ️ Não repeti as imagens${r.semCiclo ? `: ${r.semCiclo}` : ''}.`
            : ''} ` +
        `${r.legendas ? `${r.legendas} bloco(s) de legenda${r.legendasDaLetra ? ' (da letra)' : ''}. ` : ''}` +
        `Descarregado como ${nome}${r.srt ? ' e rebeca-video.srt' : ''}.` +
        `${r.musicaAviso ? ` ⚠️ ${r.musicaAviso}` : ''} (motor v${r.versao})` +
        (r.codec === 'vp9'
          ? ' · ⚠️ Gravado em VP9: o Windows pode recusar abri-lo — use o VLC, ou mude "Ficheiro" para Compatível (VP8).'
          : ''),
      r.musicaAviso ? 'wait' : 'ok',
    );
    toast(
      `${r.comVoz ? 'Vídeo pronto' : 'Vídeo só com música'} (${Math.round(r.duracao)}s)` +
        `${r.comMusica ? ', com trilha' : ''}${r.repetido ? `, ${r.passagens}× em ciclo` : ''}` +
        `${r.srt ? ' + legendas .srt' : ''}.`,
      'ok',
    );
  } catch (e) {
    estadoVideo(`❌ ${e.message}`, 'err');
    toast(e.message, 'err');
  } finally {
    state.busy = false;
    state.pararVideo = false;
    $('btn-video').disabled = false;
    $('btn-video-parar').hidden = true;
    setTimeout(() => progress(false), 1500);
  }
}

// Guarda o vídeo pronto na nuvem: ficheiro + miniatura + detalhes, para o
// 📺 Painel (vídeos prontos para subir ao YouTube).
async function guardarNaNuvem() {
  if (!resultadoVideo.blob) return;
  const btn = $('btn-video-nuvem');
  btn.disabled = true;
  btn.textContent = 'a guardar…';
  try {
    const { base44 } = await import('@/base44Client.js');
    estadoVideo('a guardar o vídeo na nuvem…', 'wait');
    const nome = resultadoVideo.nome;
    const { file_uri } = await base44.integrations.Core.UploadPrivateFile({
      file: new File([resultadoVideo.blob], nome, { type: 'video/webm' }),
    });
    let thumb_uri = '';
    if (state._miniatura) {
      try {
        const t = await base44.integrations.Core.UploadPrivateFile({
          file: new File([state._miniatura], 'miniatura.jpg', { type: 'image/jpeg' }),
        });
        thumb_uri = t.file_uri;
      } catch {
        /* a miniatura é opcional — o cartão mostra o ícone */
      }
    }
    const r = resultadoVideo.r || {};
    const voz = state.vozesEleven.find((v) => v.id === state.vozEleven);
    await base44.entities.VideoProducao.create({
      nome: ($('projeto-nome').value || '').trim() || 'Projeto sem nome',
      video_uri: file_uri,
      video_tamanho: resultadoVideo.blob.size,
      thumb_uri,
      duracao: Math.round(r.duracao || 0),
      formato: r.formato || state.videoFormato,
      transicao: state.videoTransicaoRotulo || state.videoTransicao,
      comVoz: Boolean(r.comVoz),
      comMusica: Boolean(r.comMusica),
      musicaNome: state.musicaFicheiro ? state.musicaFicheiro.name : '',
      codec: r.codec || state.codec,
      legendas: r.legendas || 0,
      motorVoz: state.motor === 'eleven' ? 'ElevenLabs' : 'Voz do browser',
      vozUsada: state.motor === 'eleven' ? (r.nomeVoz || (voz ? voz.nome : '')) : state.voz,
    });
    const btnPainel = $('btn-video-painel');
    if (btnPainel) btnPainel.hidden = false;
    btn.textContent = '☁️ Guardado ✓';
    estadoVideo('✅ Guardado na nuvem — está no 📺 Painel de vídeos prontos.', 'ok');
    toast('Vídeo guardado na nuvem. Está no 📺 Painel.', 'ok');
  } catch (e) {
    estadoVideo(`❌ Não consegui guardar na nuvem: ${e.message}`, 'err');
    toast(`Não consegui guardar na nuvem: ${e.message}`, 'err');
  } finally {
    btn.disabled = false;
    if (btn.textContent === 'a guardar…') btn.textContent = '☁️ Guardar na nuvem';
  }
}

// A imagem de uma cena, pelo nome do ficheiro.
function imagemDaCena(cena) {
  const i = state.images.find((x) => x.name === cena.filename);
  return i ? i.url : '';
}

// ---------------------------------------------------------------- configuração
function guardar() {
  try {
    localStorage.setItem(
      'rh3nuvem',
      JSON.stringify({
        servico: state.servico,
        modelo: state.modelo,
        voz: state.voz,
        velocidade: state.velocidade,
        modo: state.modo,
        motor: state.motor,
        tom: state.tom,
        vozEleven: state.vozEleven,
        videoFormato: state.videoFormato,
        videoTransicao: state.videoTransicao,
        videoDuracao: state.videoDuracao,
        videoModo: state.videoModo,
        videoDuracaoCena: state.videoDuracaoCena,
        legendas: state.legendas,
        letra: state.letra,
        letraLigada: state.letraLigada,
        modoDuracao: state.modoDuracao,
        codec: state.codec,
        musicaLigada: state.musicaLigada,
        projetoNome: $('projeto-nome') ? $('projeto-nome').value : '',
      }),
    );
  } catch {
    /* modo privado */
  }
}

function lerConfig() {
  try {
    return JSON.parse(localStorage.getItem('rh3nuvem') || '{}');
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------- novo projeto
// "✨ Novo projeto": começa uma produção limpa. Reaproveita a limpeza do botão
// "🗑 Limpar" (imagens, narração e áudio) e acrescenta o que ele não faz:
// letra da música, trilha e o nome do projeto. Os projetos guardados ficam.
async function novoProjeto() {
  $('btn-clear').onclick();
  limparLetra();
  tirarTrilha();
  $('projeto-nome').value = '';
  guardar();
  estadoProjeto('Projeto novo: importe as imagens desta produção.');
  toast('Projeto novo — tudo limpo para a próxima produção.', 'ok');
  await desenharProjetos();
}
// O script corre no fim do body (módulo, depois da análise): os elementos já
// existem quando esta linha corre, por isso a ligação pode ser direta.
$('btn-projeto-novo').onclick = novoProjeto;

// ---------------------------------------------------------------- arranque
// Cliente Base44 (o mesmo padrão de sempre: import dinâmico, reescrevível nos testes).
async function clienteBase44() {
  const { base44 } = await import('@/base44Client.js');
  return base44;
}

// Módulos extraídos do app.js: trilha, letra, projetos e utilizador.
async function carregarModulosExtras() {
  const ctx = {
    state, toast, guardar, resumoVideo, marcarModoDuracao, marcarMotor, marcarTom,
    atualizarContador, renderThumbs, renderScenes, updateLayout, preparar, paraBase64,
    pararPreviaTrilha, lerConfig, projetos, leg, clienteBase44,
  };
  try {
    modLetraTrilha = await import('./estudio-letra-trilha.mjs');
    modLetraTrilha.iniciar(ctx);
  } catch (e) {
    console.warn('módulo da letra/trilha não chegou:', e && e.message);
  }
  try {
    modProjetosUI = await import('./estudio-projetos.mjs');
    modProjetosUI.iniciar(ctx);
  } catch (e) {
    console.warn('módulo dos projetos não chegou:', e && e.message);
  }
  try {
    modUtilizadorUI = await import('./estudio-utilizador.mjs');
    modUtilizadorUI.iniciarUtilizador({ toast });
  } catch (e) {
    console.warn('módulo do utilizador não chegou:', e && e.message);
  }
}

async function init() {
  $('btn-folder').onclick = pickFolder;
  $('btn-files').onclick = pickFiles;
  $('btn-add').onclick = pickFiles;
  $('btn-generate').onclick = gerar;
  $('btn-clear').onclick = () => {
    stopSpeak();
    pararPreviaTrilha();
    pararPreviaLetra();
    state.images.forEach((i) => URL.revokeObjectURL(i.url));
    state.scenes.forEach((s) => {
      if (s.audioUrl) URL.revokeObjectURL(s.audioUrl);
      if (s.previaUrl) URL.revokeObjectURL(s.previaUrl);
    });
    state.images = [];
    state.scenes = [];
    // Limpar é começar de novo: o próximo "Guardar" cria um projeto novo em vez
    // de escrever por cima do que estava aberto.
    projetos.idAtual = null;
    projetos.criadoEm = null;
    const btnAtualizar = $('btn-projeto-atualizar');
    if (btnAtualizar) btnAtualizar.hidden = true;
    estadoProjeto('Guarde o trabalho para o voltar a abrir noutro dia.');
    renderThumbs();
    renderScenes();
    updateLayout();
    progress(false);
    toast('Tudo limpo.', '');
  };
  $('input-files').onchange = (e) => {
    if (e.target.files?.length) addImages(e.target.files);
    e.target.value = '';
  };

  $('btn-gerar-audio').onclick = gerarTodoAudio;
  $('btn-ouvir-tudo').onclick = ouvirTudo;
  $('btn-parar').onclick = () => {
    state.parar = true;
    stopSpeak();
  };
  $('btn-zip').onclick = descarregarZip;

  // velocidades
  const VEL = [
    { r: 0.85, t: 'Lenta 0.85x' },
    { r: 1, t: 'Normal 1x' },
    { r: 1.15, t: 'Rápida 1.15x' },
  ];
  const cv = $('velocidades');
  VEL.forEach((v) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.r = String(v.r);
    b.textContent = v.t;
    b.onclick = () => {
      state.velocidade = v.r;
      [...cv.children].forEach((x) => x.classList.toggle('on', x === b));
      guardar();
    };
    cv.append(b);
  });

  // motores de voz (browser / ElevenLabs)
  [...$('motores').children].forEach((b) => {
    b.onclick = () => {
      state.motor = b.dataset.motor;
      marcarMotor();
      if (state.motor === 'eleven' && !state.vozesEleven.length) carregarVozesEleven();
    };
  });
  [...$('tons-eleven').children].forEach((b) => {
    b.onclick = () => {
      state.tom = b.dataset.tom;
      marcarTom();
    };
  });
  $('btn-carregar-vozes').onclick = carregarVozesEleven;

  // modos de gravação
  [...$('modos').children].forEach((b) => {
    b.onclick = () => {
      state.modo = b.dataset.modo;
      [...$('modos').children].forEach((x) => x.classList.toggle('on', x === b));
      guardar();
    };
  });

  // separadores
  iniciarAbas();

  // O painel manda quando a vista muda (o estúdio tem de se redesenhar).
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('rh-vista', updateLayout);
  }
  // projetos guardados (histórico) + utilizador: módulos à parte
  carregarModulosExtras();

  // arrastar para a página (ficheiros ou pastas)
  const drop = $('drop');
  ['dragenter', 'dragover'].forEach((ev) =>
    document.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.add('hover');
    }),
  );
  document.addEventListener('dragleave', (e) => {
    if (!e.relatedTarget) drop.classList.remove('hover');
  });
  document.addEventListener('drop', async (e) => {
    e.preventDefault();
    drop.classList.remove('hover');
    const ficheiros = [];
    const andar = async (entrada) => {
      if (entrada.isFile) {
        ficheiros.push(await new Promise((r, j) => entrada.file(r, j)));
      } else if (entrada.isDirectory) {
        const leitor = entrada.createReader();
        const filhos = await new Promise((r) => leitor.readEntries(r, () => r([])));
        for (const f of filhos) await andar(f);
      }
    };
    const itens = [...(e.dataTransfer?.items || [])];
    const entradas = itens.map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
    if (entradas.length) {
      for (const en of entradas) await andar(en);
    } else {
      ficheiros.push(...(e.dataTransfer?.files || []));
    }
    if (ficheiros.length) addImages(ficheiros);
  });

  // configurações
  $('btn-config').onclick = () => $('dlg').showModal();
  $('cfg-testar').onclick = () => import('./teste-ligacao.mjs').then((m) => m.testarLigacao());
  $('cfg-guardar').onclick = (e) => {
    e.preventDefault();
    state.servico = $('cfg-servico').value;
    const escrito = $('cfg-modelo').value.trim();
    // DEFESA: uma chave colada aqui chegaria ao serviço como NOME DE MODELO
    // ("you passed sk-...") e pareceria um erro de chave. Foi o que aconteceu.
    if (/^(sk-|sk_|gsk_|AIza|Bearer)/i.test(escrito) || escrito.length > 60) {
      $('cfg-modelo').value = '';
      state.modelo = '';
      toast('Isso parece uma chave de API, não um modelo. Ficou o modelo predefinido.', 'err');
    } else {
      state.modelo = escrito;
    }
    guardar();
    $('dlg').close();
    toast('Configurações guardadas.', 'ok');
  };

  // preferências guardadas
  const c = lerConfig();
  state.servico = c.servico || 'deepseek';
  // Limpa um valor inválido guardado antes desta defesa existir: quem colou a
  // chave no campo do modelo ficaria preso com o erro "you passed sk-...".
  const guardado = String(c.modelo || '').trim();
  state.modelo = /^(sk-|sk_|gsk_|AIza|Bearer)/i.test(guardado) || guardado.length > 60 ? '' : guardado;
  if (guardado && !state.modelo) {
    toast('O campo "modelo" tinha um valor que parecia uma chave — limpei-o.', 'err');
  }
  state.velocidade = c.velocidade || 1;
  state.modo = c.modo || 'mic';
  state.voz = c.voz || '';
  state.motor = c.motor === 'eleven' ? 'eleven' : 'browser';
  state.tom = ['acolhedora', 'animada', 'misteriosa', 'dramatica'].includes(c.tom) ? c.tom : 'acolhedora';
  state.vozEleven = c.vozEleven || '';
  state.videoFormato = c.videoFormato || '1920x1080';
  state.videoTransicao = c.videoTransicao || 'fade';
  state.videoDuracao = Number(c.videoDuracao) || 0.6;
  state.videoModo = MODOS_VIDEO.some((m) => m.id === c.videoModo) ? c.videoModo : 'ambos';
  state.videoDuracaoCena = Number(c.videoDuracaoCena) || 3.5;
  state.legendas = c.legendas !== false;
  state.letra = typeof c.letra === 'string' ? c.letra : '';
  state.letraLigada = c.letraLigada === true && state.letra.trim().length > 0;
  state.modoDuracao = c.modoDuracao === 'trilha' ? 'trilha' : 'natural';
  state.codec = c.codec === 'vp9' ? 'vp9' : 'vp8';
  state.musicaLigada = c.musicaLigada !== false;
  marcarMotor();
  marcarTom();
  iniciarVideo();
  // A voz escolhida só se pode marcar depois de a lista chegar do servidor;
  // o botão "Carregar as minhas vozes" trata disso e repõe a escolha guardada.
  if (state.vozEleven) $('voz-estado').textContent = `ElevenLabs · ${state.vozEleven.slice(0, 8)}… (por confirmar)`;
  $('cfg-servico').value = state.servico;
  $('cfg-modelo').value = state.modelo;
  [...cv.children].forEach((x) => x.classList.toggle('on', Number(x.dataset.r) === state.velocidade));
  [...$('modos').children].forEach((x) => x.classList.toggle('on', x.dataset.modo === state.modo));

  // vozes
  if (window.speechSynthesis) {
    desenharVozes();
    speechSynthesis.onvoiceschanged = desenharVozes;
  } else {
    $('vozes').innerHTML = '<span class="hint" style="margin:0">este browser não sintetiza voz</span>';
  }

  setStatus('pronto', 'ok');
  if (!window.MediaRecorder || !navigator.mediaDevices) {
    aviso(
      '<strong>⚠️ Este browser não consegue gravar áudio.</strong>' +
        '<p>Use o Chrome ou o Edge — precisam de MediaRecorder e acesso ao microfone para gravar a narração.</p>',
      'warn',
    );
  }
  updateLayout();
}

document.addEventListener('DOMContentLoaded', init);
