// ============================================================
//  Rebeca Hub 3.0 (nuvem) — vídeo carregado: estúdio ou painel
//
//  Extraído do app.js. Um vídeo JÁ PRONTO entra pela área de
//  importação e o utilizador escolhe o destino:
//   - ESTÚDIO: entra como CENA de vídeo — intercala com as imagens,
//     muda a ordem e entra na montagem final (imagem + som do ficheiro);
//   - PAINEL: sobe já pronto para o 📺 (vídeo completo, para o YouTube).
// ============================================================

const $ = (id) => document.getElementById(id);

let state = null;
let toast = () => {};
let renderThumbs = () => {};
let renderScenes = () => {};
let updateLayout = () => {};
let clienteBase44 = () => null;

export let videoPendente = null;

export const ehFicheiroVideo = (f) => /^video\//i.test(f.type) || /\.(mp4|webm|mov|mkv|avi)$/i.test(f.name);

// ---------------------------------------------------------------- medições
export function medidasDoVideo(file) {
  return new Promise((res, rej) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      // WebM gravado pelo próprio browser chega com duração "Infinity" nos
      // metadados; o truque do currentTime (pular para o fim) obriga o browser
      // a calcular a duração verdadeira no evento durationchange.
      const formato = `${v.videoWidth}x${v.videoHeight}`;
      if (Number.isFinite(v.duration) && v.duration > 0) {
        URL.revokeObjectURL(v.src);
        return res({ duracao: v.duration, formato });
      }
      let respondido = false;
      const fechar = (duracao) => {
        if (respondido) return;
        respondido = true;
        URL.revokeObjectURL(v.src);
        res({ duracao: Number.isFinite(duracao) && duracao > 0 ? duracao : 0, formato });
      };
      v.ondurationchange = () => {
        if (Number.isFinite(v.duration) && v.duration > 0) fechar(v.duration);
      };
      try {
        v.currentTime = 1e101;
      } catch {
        fechar(0);
      }
      setTimeout(() => fechar(v.duration), 4000);
    };
    v.onerror = () => rej(new Error('não consegui ler o vídeo'));
    v.src = URL.createObjectURL(file);
  });
}

// Fotograma do vídeo (~1,5s) como miniatura para o cartão do painel.
function miniaturaDoVideo(file, duracao) {
  return new Promise((res) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.onloadeddata = () => {
      const t = duracao > 3 ? 1.5 : duracao * 0.3;
      try {
        v.currentTime = Math.max(0, t);
      } catch {
        res(null);
      }
    };
    v.onseeked = () => {
      try {
        const c = document.createElement('canvas');
        const escala = Math.min(1, 640 / Math.max(1, v.videoWidth));
        c.width = Math.max(1, Math.round(v.videoWidth * escala));
        c.height = Math.max(1, Math.round(v.videoHeight * escala));
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        c.toBlob((b) => res(b), 'image/jpeg', 0.8);
      } catch {
        res(null);
      }
      URL.revokeObjectURL(v.src);
    };
    v.onerror = () => res(null);
    setTimeout(() => res(null), 8000);
    v.src = URL.createObjectURL(file);
  });
}

// ---------------------------------------------------------------- entrada
export async function carregarVideoFicheiro(file) {
  if (!file) return;
  if (!ehFicheiroVideo(file)) return toast('Esse ficheiro não parece ser um vídeo.', 'err');
  videoPendente = file;
  const dlg = $('dlg-destino');
  if (!dlg || typeof dlg.showModal !== 'function') return abrirVideoNoEstudio(file);
  $('destino-titulo').textContent = `Vídeo "${file.name}"`;
  dlg.showModal();
}

// Opção 1: o vídeo entra no ESTÚDIO como cena de vídeo (intercala com imagens).
async function abrirVideoNoEstudio(file) {
  toast('A ler o vídeo…');
  let duracao = 0;
  try {
    const lida = (await medidasDoVideo(file)).duracao;
    duracao = Number.isFinite(lida) && lida > 0 ? lida : 0;
  } catch {
    /* segue sem a duração lida */
  }
  state.images.push({ id: crypto.randomUUID(), file, name: file.name, url: URL.createObjectURL(file), video: true, duracao });
  renderThumbs();
  renderScenes();
  toast('Vídeo adicionado ao estúdio — arraste para mudar a ordem.', 'ok');
  trocarParaEstudio();
}

// Volta à vista do estúdio (o painel.js é quem manda nas vistas).
function trocarParaEstudio() {
  const b = $('btn-ir-estudio');
  if (b && !b.hidden) b.click();
  else if (updateLayout) updateLayout();
}

// Opção 2: o vídeo sobe JÁ PRONTO para o 📺 Painel.
async function guardarVideoNoPainel(file) {
  if (!file) return;
  toast('A ler o vídeo…');
  let duracao = 0;
  let formato = '';
  try {
    const info = await medidasDoVideo(file);
    duracao = info.duracao;
    formato = info.formato;
  } catch {
    /* segue sem os detalhes */
  }
  let thumb_uri = '';
  try {
    const blob = await miniaturaDoVideo(file, duracao);
    if (blob) {
      const b = await clienteBase44();
      const t = await b.integrations.Core.UploadPrivateFile({
        file: new File([blob], 'miniatura.jpg', { type: 'image/jpeg' }),
      });
      thumb_uri = t.file_uri;
    }
  } catch {
    /* a miniatura é opcional */
  }
  toast('A guardar o vídeo na nuvem…');
  try {
    const b = await clienteBase44();
    const { file_uri } = await b.integrations.Core.UploadPrivateFile({ file });
    await b.entities.VideoProducao.create({
      nome: (file.name.replace(/\.[^.]+$/, '') || 'Vídeo carregado').slice(0, 60),
      video_uri: file_uri,
      video_tamanho: file.size,
      thumb_uri,
      duracao: Math.round(duracao),
      formato,
    });
    toast('Vídeo carregado — está no 📺 Painel.', 'ok');
    const btnPainel = $('btn-ir-painel');
    if (btnPainel && !btnPainel.hidden) btnPainel.click();
  } catch (e) {
    toast(`Não consegui guardar o vídeo: ${e.message}`, 'err');
  }
}

// ---------------------------------------------------------------- arranque
export function iniciar(ctx) {
  state = ctx.state;
  toast = ctx.toast;
  renderThumbs = ctx.renderThumbs;
  renderScenes = ctx.renderScenes;
  updateLayout = ctx.updateLayout;
  clienteBase44 = ctx.clienteBase44;
  $('btn-video-load').onclick = () => $('input-video').click();
  $('input-video').onchange = (e) => {
    if (e.target.files?.length) carregarVideoFicheiro(e.target.files[0]);
    e.target.value = '';
  };
  $('btn-destino-estudio').onclick = () => {
    $('dlg-destino').close();
    abrirVideoNoEstudio(videoPendente);
  };
  $('btn-destino-painel').onclick = () => {
    $('dlg-destino').close();
    guardarVideoNoPainel(videoPendente);
  };
}
