import { blocoAtivo } from './legendas-core.mjs';
import { formatarTempo } from './legendas-tempos.mjs';

export default function iniciarPreviaLegendas({ state, cuesDaLetra }) {
  const audio = document.getElementById('legendas-audio');
  const texto = document.getElementById('legendas-previa');
  const botao = document.getElementById('btn-letra-previa');
  let ficheiro = null;
  let url = '';
  const mostrar = () => {
    const cue = blocoAtivo(cuesDaLetra(), audio.currentTime);
    texto.textContent = `${formatarTempo(audio.currentTime)} · ${cue?.texto || 'Sem legenda neste trecho'}`;
  };
  let quadro = 0;
  const acompanhar = () => { mostrar(); if (!audio.paused && !audio.ended) quadro = requestAnimationFrame(acompanhar); };
  audio.ontimeupdate = audio.onseeked = mostrar;
  audio.onplay = () => { botao.textContent = '⏹ Parar'; cancelAnimationFrame(quadro); acompanhar(); };
  audio.onpause = audio.onended = () => { cancelAnimationFrame(quadro); mostrar(); botao.textContent = '▶️ Ver a letra a passar'; };
  const parar = () => audio.pause();
  const atualizar = () => {
    if (ficheiro !== state.musicaFicheiro) {
      parar();
      if (url) URL.revokeObjectURL(url);
      ficheiro = state.musicaFicheiro;
      url = ficheiro ? URL.createObjectURL(ficheiro) : '';
      if (url) audio.src = url;
      else { audio.removeAttribute('src'); audio.load(); }
    }
    audio.hidden = !ficheiro;
    mostrar();
  };
  const tocar = async () => {
    if (!audio.paused) return parar();
    atualizar();
    document.querySelector('[data-tab="tab-legendas"]').click();
    audio.currentTime = 0;
    await audio.play();
  };
  return { atualizar, parar, tocar };
}
