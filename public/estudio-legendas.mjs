import criarLinhaLegenda from './legendas-editor-linha.mjs';
import { chaveDaLetra, cuesDaLetra, temposManuais, erroNosTempos, lerTempo } from './legendas-tempos.mjs';

export default function iniciarEditorLegendas(ctx) {
  const { state, guardar, atualizarLetra, resumoVideo } = ctx;
  const $ = (id) => document.getElementById(id);
  const lista = $('legendas-lista');
  const status = $('legendas-editor-estado');
  let chave = '', assinatura = '', sujo = false, exibidas = [];
  const avisar = (texto, erro = false) => { status.textContent = texto; status.className = `cfg-result ${erro ? 'err' : 'ok'}`; };
  const atualizar = () => {
    const novaChave = chaveDaLetra(state), cues = cuesDaLetra(state), nova = JSON.stringify(cues);
    if (novaChave !== chave) { sujo = false; assinatura = ''; chave = novaChave; }
    if (!sujo && nova !== assinatura) {
      exibidas = cues; assinatura = nova;
      lista.replaceChildren(...cues.map(criarLinhaLegenda));
      avisar(temposManuais(state) ? 'Tempos manuais aplicados. Serão usados sem recalcular no vídeo e no .srt.' : 'Tempos automáticos estimados. Confira com a música e ajuste antes de aplicar.');
    }
    $('legendas-vazio').hidden = cues.length > 0;
    status.hidden = !cues.length;
    $('legendas-campos').disabled = state.busy || !cues.length;
    $('legendas-resumo').textContent = `${cues.length} legenda(s) da música`;
  };
  lista.oninput = () => { sujo = true; avisar('Alterações pendentes. Clique em Aplicar tempos antes de gerar o vídeo.', true); };
  const validar = () => {
    // Conferir os valores atuais também cobre preenchimento automático do navegador.
    const alterado = [...lista.children].some((li, i) => ['inicio', 'fim'].some((campo) =>
      lerTempo(li.querySelector(`[data-campo="${campo}"]`).value) !== Math.round(exibidas[i][campo] * 1000) / 1000));
    if (!sujo && !alterado) return true;
    avisar('Aplique os tempos editados antes de gerar ou visualizar.', true);
    document.querySelector('[data-tab="tab-legendas"]').click();
    status.scrollIntoView({ block: 'center' });
    return false;
  };
  $('btn-legendas-aplicar').onclick = () => {
    if (state.busy) return;
    const cues = [...lista.children].map((li, i) => ({ texto: exibidas[i].texto, inicio: lerTempo(li.querySelector('[data-campo="inicio"]').value), fim: lerTempo(li.querySelector('[data-campo="fim"]').value) }));
    const erro = erroNosTempos(cues, state.musicaSegundos);
    if (erro) return avisar(erro, true);
    state.legendasLetra = { chave: chaveDaLetra(state), cues };
    state.letraLigada = true; sujo = false; guardar(); atualizarLetra(); resumoVideo();
    avisar('Tempos manuais aplicados. Serão usados sem recalcular no vídeo e no .srt.');
  };
  $('btn-legendas-restaurar').onclick = () => {
    if (state.busy) return;
    state.legendasLetra = null; sujo = false; assinatura = ''; guardar(); atualizarLetra(); resumoVideo();
  };
  atualizar();
  return { atualizar, validar };
}
