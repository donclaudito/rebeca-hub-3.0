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
  $('workspace').hidden = !tem;
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
function renderScenes() {
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
    });

    btnOuvir.onclick = async () => {
      const t = ta.value.trim();
      if (!t) return toast('Escreva ou gere a narração primeiro.', 'err');
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
  if (gravadorAtual) {
    try {
      gravadorAtual.stop();
    } catch {
      /* já parou */
    }
  }
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

// ---------------------------------------------------------------- ações
async function gerarTodoAudio() {
  const alvo = state.scenes.filter((s) => (s.texto || '').trim());
  if (!alvo.length) return toast('Gere a narração primeiro.', 'err');
  if (state.busy) return;
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

async function ouvirTudo() {
  state.parar = false;
  for (const cena of state.scenes) {
    if (state.parar) break;
    if (!(cena.texto || '').trim()) continue;
    try {
      await falar(cena.texto);
    } catch {
      /* segue para a próxima */
    }
  }
  state.parar = false;
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

  const zip = criarZip(ficheiros);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }));
  a.download = 'narracao-rebeca.zip';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast('Pacote descarregado.', 'ok');
}

// ZIP mínimo (método "store": sem compressão), com CRC32.
function criarZip(ficheiros) {
  const tabela = (() => {
    const t = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c;
    }
    return t;
  })();
  const crc32 = (b) => {
    let c = -1;
    for (let i = 0; i < b.length; i++) c = tabela[(c ^ b[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };

  const locais = [];
  const centrais = [];
  let offset = 0;
  const enc = new TextEncoder();

  for (const f of ficheiros) {
    const nome = enc.encode(f.nome);
    const dados = f.dados;
    const crc = crc32(dados);
    const l = new Uint8Array(30 + nome.length);
    const dv = new DataView(l.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 0x0800, true);
    dv.setUint16(8, 0, true); // store
    dv.setUint32(14, crc, true);
    dv.setUint32(18, dados.length, true);
    dv.setUint32(22, dados.length, true);
    dv.setUint16(26, nome.length, true);
    l.set(nome, 30);
    locais.push(l, dados);

    const c = new Uint8Array(46 + nome.length);
    const cv = new DataView(c.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, dados.length, true);
    cv.setUint32(24, dados.length, true);
    cv.setUint16(28, nome.length, true);
    cv.setUint32(42, offset, true);
    c.set(nome, 46);
    centrais.push(c);

    offset += l.length + dados.length;
  }

  const central = centrais.reduce((s, c) => s + c.length, 0);
  const fim = new Uint8Array(22);
  const fv = new DataView(fim.buffer);
  fv.setUint32(0, 0x06054b50, true);
  fv.setUint16(8, ficheiros.length, true);
  fv.setUint16(10, ficheiros.length, true);
  fv.setUint32(12, central, true);
  fv.setUint32(16, offset, true);

  return new Blob([...locais, ...centrais, fim]);
}

// ---------------------------------------------------------------- configuração
function guardar() {
  try {
    localStorage.setItem(
      'rh3nuvem',
      JSON.stringify({ servico: state.servico, modelo: state.modelo, voz: state.voz, velocidade: state.velocidade, modo: state.modo }),
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

async function testarLigacao() {
  const caixa = $('cfg-resultado');
  caixa.hidden = false;
  caixa.className = 'cfg-result wait';
  caixa.textContent = 'a testar…';
  const servico = $('cfg-servico').value;
  try {
    if (servico === 'local') {
      const r = await fetch('http://127.0.0.1:3100/api/health').catch(() => null);
      if (!r || !r.ok) throw new Error('não há servidor local a responder em 127.0.0.1:3100');
      const d = await r.json();
      caixa.className = 'cfg-result ok';
      caixa.textContent = `✅ Servidor local respondeu (versão ${d.versao || '?'}).`;
      return;
    }
    const { base44 } = await import('@/base44Client.js');
    // Teste propositado: sem imagens, a função responde 400 com a explicação.
    // Se essa explicação chegar, então a função está viva e a falar com o SDK.
    let d;
    try {
      const r = await base44.functions.invoke('generateNarration', { servico, imagens: [] });
      d = r?.data && !r.ok ? r.data : r;
    } catch (e) {
      d = e?.response?.data || { ok: false, error: e?.message };
      if (e?.response?.status) d.http = e.response.status;
    }
    if (d?.ok) {
      caixa.className = 'cfg-result ok';
      caixa.textContent = '✅ A função de nuvem respondeu.';
    } else if (/Nenhuma imagem recebida/i.test(d?.error || '')) {
      // É a resposta CERTA para um teste sem imagens: a função está a funcionar.
      caixa.className = 'cfg-result ok';
      caixa.textContent =
        '✅ A função de nuvem está a responder' +
        (d.http ? ` (HTTP ${d.http})` : '') +
        '. O teste não envia imagens, por isso ela pede imagens — é o esperado.';
    } else if (/Falta o segredo/i.test(d?.error || '')) {
      caixa.className = 'cfg-result err';
      caixa.textContent =
        `⚠️ A função responde, mas falta o segredo. Corra:  base44 secrets set DEEPSEEK_API_KEY=sk_...\n\n${d.error}`;
    } else {
      caixa.className = 'cfg-result err';
      caixa.textContent = `❌ ${d?.error || 'a função respondeu de forma inesperada'}`;
    }
  } catch (e) {
    caixa.className = 'cfg-result err';
    caixa.textContent = `❌ ${e.message}`;
  }
}

// ---------------------------------------------------------------- arranque
function init() {
  $('btn-folder').onclick = pickFolder;
  $('btn-files').onclick = pickFiles;
  $('btn-add').onclick = pickFiles;
  $('btn-generate').onclick = gerar;
  $('btn-clear').onclick = () => {
    stopSpeak();
    state.images.forEach((i) => URL.revokeObjectURL(i.url));
    state.scenes.forEach((s) => s.audioUrl && URL.revokeObjectURL(s.audioUrl));
    state.images = [];
    state.scenes = [];
    renderThumbs();
    renderScenes();
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
  $('cfg-testar').onclick = testarLigacao;
  $('cfg-guardar').onclick = (e) => {
    e.preventDefault();
    state.servico = $('cfg-servico').value;
    state.modelo = $('cfg-modelo').value.trim();
    guardar();
    $('dlg').close();
    toast('Configurações guardadas.', 'ok');
  };

  // preferências guardadas
  const c = lerConfig();
  state.servico = c.servico || 'deepseek';
  state.modelo = c.modelo || '';
  state.velocidade = c.velocidade || 1;
  state.modo = c.modo || 'mic';
  state.voz = c.voz || '';
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
