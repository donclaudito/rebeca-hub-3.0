// ============================================================
//  Rebeca Hub 3.0 (nuvem) — trilha sonora + letra da música
//
//  Extraído do app.js para o ficheiro principal continuar leve.
//  As ligações com o resto da página (estado, resumo do vídeo,
//  guarda de preferências) chegam via iniciar(ctx).
// ============================================================

import { cuesDaLetra as obterCues, temposManuais, formatarTempo } from './legendas-tempos.mjs';
import iniciarEditorLegendas from './estudio-legendas.mjs';
import iniciarPreviaLegendas from './legendas-previa.mjs';
import iniciarSincronia from './legendas-sincronizar.mjs';

const $ = (id) => document.getElementById(id);
let editorLegendas = null;
let previaLegendas = null;
let sincronia = null;
export const validarTempos = (paraGerar = false) => editorLegendas?.validar(paraGerar) !== false;

let state = null;
let toast = () => {};
let guardar = () => {};
let resumoVideo = () => {};
let marcarModoDuracao = () => {};
let leg = { versosDaLetra: null, legendasDaLetra: null };

export function iniciar(ctx) {
  state = ctx.state;
  toast = ctx.toast;
  guardar = ctx.guardar;
  resumoVideo = ctx.resumoVideo;
  marcarModoDuracao = ctx.marcarModoDuracao;
  leg = ctx.leg;
  previaLegendas = iniciarPreviaLegendas({ state, cuesDaLetra });
  editorLegendas = iniciarEditorLegendas({ state, guardar, atualizarLetra, resumoVideo });
  sincronia = iniciarSincronia({ ...ctx, atualizarLetra, validar: () => editorLegendas.validar() });
}

// ---------------------------------------------------------------- trilha sonora
// A música vem do computador do utilizador (não há faixas dentro da app, para
// ela continuar leve e sem licenças). Fica só nesta sessão — um ficheiro de
// música não cabe no armazenamento do browser sem o encher.
let trilhaAudio = null; // o <audio> da pré-escuta

function pararPreviaTrilha() {
  if (!trilhaAudio) return;
  try {
    trilhaAudio.pause();
  } catch {
    /* já parado */
  }
  trilhaAudio = null;
  const b = $('btn-trilha-ouvir');
  if (b) b.textContent = '▶️ Ouvir';
}

// Sem música escolhida, "até acabar a música" não faz sentido: fica desativado.
// A letra também depende da duração da música, por isso se atualiza aqui.
function aoMudarTrilha() {
  marcarModoDuracao();
  atualizarLetra();
  resumoVideo();
}

// Desenha o estado da trilha: nome, duração, e que botões fazem sentido.
function atualizarTrilha() {
  const tem = Boolean(state.musicaFicheiro);
  const est = $('trilha-estado');
  if (est) {
    if (!tem) {
      est.className = 'hint';
      est.textContent = 'Nenhuma música escolhida — o vídeo sai só com a narração.';
    } else {
      est.className = 'trilha-estado-nome';
      const dur = state.musicaDuracao ? ` · ${formatarMinutos(state.musicaDuracao)}` : '';
      const nome = state.musicaFicheiro.name || 'música';
      est.textContent = `🎵 ${nome}${dur}`;
    }
  }
  const ouvir = $('btn-trilha-ouvir');
  const tirar = $('btn-trilha-tirar');
  const ligada = $('trilha-ligada');
  if (ouvir) ouvir.hidden = !tem;
  if (tirar) tirar.hidden = !tem;
  if (ligada) {
    ligada.disabled = !tem;
    ligada.checked = tem && state.musicaLigada;
  }
}

// "1:23" — usado para a duração da música e para o tempo previsto do vídeo.
// (o app.js tem a sua própria versão, com o mesmo formato)
const formatarMinutos = (s) => {
  const t = Math.max(0, Math.round(Number(s) || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

// Lê a duração real do ficheiro com um <audio> temporário. A leitura é feita
// pelo módulo audio-info.mjs, que ouve VÁRIOS eventos e ainda pergunta em
// intervalos: um `loadedmetadata` que não chega deixava a duração a 0, o ciclo
// ficava sem alvo e a música era cortada a meio.
async function medirTrilha(ficheiro) {
  const url = URL.createObjectURL(ficheiro);
  try {
    const mod = await import('./audio-info.mjs');
    return await mod.medirDuracaoAudio(url);
  } catch {
    // Sem conseguir medir, o ciclo "até acabar a música" não tem alvo: a página
    // avisa e o vídeo fica com a duração das imagens, em vez de falhar.
    return 0;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
}

async function escolherTrilha() {
  const input = $('input-trilha');
  const f = input?.files?.[0];
  if (!f) return;

  pararPreviaTrilha();
  pararPreviaLetra();
  state.musicaFicheiro = f;
  state.musicaVoz = null;
  state.musicaSegundos = 0;
  state.musicaLigada = true;
  state.musicaDuracao = 0;
  state.musicaMedida = false;
  // O modo "até acabar a música" fica disponível assim que há música.
  state.modoDuracao = 'trilha';
  if (state.videoModo === 'narracao') state.videoModo = 'ambos';
  atualizarTrilha();
  aoMudarTrilha();

  const dur = await medirTrilha(f);
  // Se entretanto o utilizador escolheu outra, não estragamos o estado novo.
  if (state.musicaFicheiro !== f) return;
  state.musicaDuracao = dur;
  state.musicaMedida = dur > 0;
  atualizarTrilha();

  // O tempo da música é lido aqui (o motor não descodifica só para medir).
  state.musicaSegundos = dur;
  guardar();
  aoMudarTrilha();

  // Apenas medir a duração. Volume alto não distingue voz de instrumentos;
  // os tempos vêm do alinhamento das palavras ou da edição confirmada.
  aoMudarTrilha();

  if (!dur) {
    toast(
      `Não consegui ler a duração de ${f.name}. O vídeo vai ficar com a duração das imagens ` +
        '(o ciclo até acabar a música não pode ser calculado). Experimente um MP3 ou um WAV.',
      'err',
    );
  }

  const mb = (f.size / 1048576).toFixed(1);
  toast(
    dur
      ? `Trilha: ${f.name} (${formatarMinutos(dur)}, ${mb} MB). Ouça antes de gerar.`
      : `Trilha: ${f.name} (${mb} MB).`,
    'ok',
  );
  if (input) input.value = ''; // permite escolher o mesmo ficheiro outra vez
}

function tirarTrilha() {
  pararPreviaTrilha();
  state.musicaFicheiro = null;
  state.musicaDuracao = 0;
  state.musicaUrl = '';
  state.musicaSegundos = 0;
  state.musicaMedida = false;
  state.musicaVoz = null;
  atualizarTrilha();
  aoMudarTrilha();
  toast('Trilha tirada.', '');
}

async function ouvirTrilha() {
  if (trilhaAudio) {
    pararPreviaTrilha();
    return;
  }
  const f = state.musicaFicheiro;
  if (!f) return;
  if (state.musicaUrl) URL.revokeObjectURL(state.musicaUrl);
  state.musicaUrl = URL.createObjectURL(f);
  trilhaAudio = new Audio(state.musicaUrl);
  trilhaAudio.volume = 0.6;
  trilhaAudio.onended = pararPreviaTrilha;
  $('btn-trilha-ouvir').textContent = '⏹ Parar';
  try {
    await trilhaAudio.play();
  } catch {
    pararPreviaTrilha();
    toast('Não consegui tocar essa música neste browser.', 'err');
  }
}

function ligarTrilha() {
  const c = $('trilha-ligada');
  if (!c) return;
  state.musicaLigada = c.checked;
  guardar();
  resumoVideo();
}

// ---------------------------------------------------------------- letra da música
// A letra exata vem do utilizador, incluindo versos repetidos. O alinhamento
// localiza as palavras no áudio; o rascunho proporcional serve só para edição.

// A mesma lista alimenta o editor, a prévia, o vídeo e o .srt.
function cuesDaLetra() {
  return obterCues(state);
}

function estadoLetra(msg, tipo = '') {
  const el = $('letra-estado');
  if (!el) return;
  el.className = tipo === 'err' ? 'hint err' : tipo === 'ok' ? 'letra-passo' : 'hint';
  el.textContent = msg;
}

function atualizarLetra() {
  editorLegendas?.atualizar();
  previaLegendas?.atualizar();
  sincronia?.atualizar();
  const versos = leg.versosDaLetra ? leg.versosDaLetra(state.letra) : [];
  const duracao = state.musicaSegundos || 0;
  const btn = $('btn-letra-usar');
  const previa = $('btn-letra-previa');
  const limpar = $('btn-letra-limpar');
  const tem = versos.length > 0;

  if (limpar) limpar.hidden = !tem && !state.letra;
  if (previa) previa.hidden = !tem || !state.musicaFicheiro;
  if (btn) {
    btn.disabled = !tem || !duracao;
    btn.textContent = state.letraLigada ? '💬 Letra em uso (clique para tirar)' : '💬 Usar a letra como legenda';
    btn.title = !duracao
      ? 'escolha primeiro a música (é preciso saber quanto dura)'
      : !tem
        ? 'cole a letra, uma linha por verso'
        : `legendar ${versos.length} verso(s) da música`;
  }

  if (!tem) {
    estadoLetra('Cole a letra (uma linha por verso) para legendar a música.');
    return;
  }
  if (!duracao) {
    estadoLetra(`${versos.length} verso(s), mas ainda não sei quanto dura a música — escolha a trilha.`, 'err');
    return;
  }
  const cues = cuesDaLetra();
  const inicio = cues.length ? formatarTempo(cues[0].inicio) : '00:00.000';
  const fim = cues.length ? formatarTempo(cues[cues.length - 1].fim) : '00:00.000';
  const origem = temposManuais(state)
    ? state.legendasLetra.confirmado === false ? 'alinhamento aguardando conferência e aplicação' : 'tempos conferidos e aplicados'
    : 'rascunho não sincronizado: alinhe com o canto ou ajuste manualmente';
  estadoLetra(
    `${versos.length} verso(s) · de ${inicio} a ${fim} · ${origem}. Revise na aba Legendas.` +
      `${state.letraLigada ? ' · em uso como legenda' : ''}`,
    'ok',
  );
}

// Liga ou desliga a letra como legenda do vídeo.
function alternarLetra() {
  if (!state.letraLigada && !cuesDaLetra().length) {
    return toast('Cole a letra e escolha a música primeiro.', 'err');
  }
  state.letraLigada = !state.letraLigada;
  guardar();
  atualizarLetra();
  resumoVideo();
  if (state.letraLigada) {
    const cues = cuesDaLetra();
    toast(`A letra passa a ser a legenda do vídeo (${cues.length} versos).`, 'ok');
  }
}

// Pré-escuta: toca a música e mostra, verso a verso, o que vai aparecer no
// vídeo. É a forma de confirmar o sincronismo antes de gravar dois minutos.
function pararPreviaLetra() {
  previaLegendas?.parar();
}

async function preverLetra() {
  if (!cuesDaLetra().length || !state.musicaFicheiro) return toast('Cole a letra e escolha a música primeiro.', 'err');
  if (!validarTempos()) return;
  pararPreviaTrilha();
  try {
    await previaLegendas.tocar();
  } catch {
    toast('Não consegui tocar essa música neste browser.', 'err');
  }
}

function limparLetra() {
  pararPreviaLetra();
  state.letra = '';
  state.letraLigada = false;
  state.legendasLetra = null;
  const ta = $('letra-texto');
  if (ta) ta.value = '';
  guardar();
  atualizarLetra();
  resumoVideo();
}

export { pararPreviaTrilha, atualizarTrilha, escolherTrilha, tirarTrilha, ouvirTrilha, ligarTrilha };
export { cuesDaLetra, atualizarLetra, alternarLetra, pararPreviaLetra, preverLetra, limparLetra };
