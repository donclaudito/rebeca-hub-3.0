import criarLinhaLegenda from './legendas-editor-linha.mjs';
import { chaveDaLetra, cuesDaLetra, temposManuais, erroNosTempos, lerTempo } from './legendas-tempos.mjs';
const mesmaOrdem = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export default function iniciarEditorLegendas(ctx) {
  const { state, guardar, atualizarLetra, resumoVideo } = ctx;
  const $ = (id) => document.getElementById(id);
  const lista = $('legendas-lista');
  const status = $('legendas-editor-estado');
  let chave = '', assinatura = '', sujo = false, exibidas = [];
  const avisar = (texto, erro = false) => { status.textContent = texto; status.className = `cfg-result ${erro ? 'err' : 'ok'}`; };
  const atualizar = () => {
    const manual = temposManuais(state);
    const novaChave = chaveDaLetra(state), cues = cuesDaLetra(state), nova = JSON.stringify(cues);
    if (novaChave !== chave) { sujo = false; assinatura = ''; chave = novaChave; }
    if (!sujo && nova !== assinatura) {
      exibidas = cues; assinatura = nova;
      lista.replaceChildren(...cues.map(criarLinhaLegenda));
      const msgBase = manual ? state.legendasLetra.confirmado === false ? 'Palavras alinhadas ao áudio. Confira a prévia e clique em Aplicar tempos.' : 'Tempos aplicados. Vídeo e .srt usarão os mesmos instantes.' : 'Rascunho não sincronizado. Sincronize com o canto ou ajuste os tempos ouvindo a música; depois aplique.';
      avisar(manual && !mesmaOrdem(manual, cues)
        ? 'A lista foi reordenada pela ordem do tempo, e os tempos assentados para nenhuma legenda começar antes de a anterior acabar. Confira e clique em Aplicar tempos para confirmar. ' + msgBase
        : msgBase);
    }
    $('legendas-vazio').hidden = cues.length > 0;
    status.hidden = !cues.length;
    $('legendas-campos').disabled = state.busy || state.sincronizandoLetra || !cues.length;
    $('legendas-resumo').textContent = `${cues.length} legenda(s) da música`;
  };
  lista.oninput = () => { sujo = true; avisar('Alterações pendentes. Clique em Aplicar tempos antes de gerar o vídeo.', true); };
  const validar = (paraGerar = false) => {
    if (state.sincronizandoLetra) { avisar('Aguarde o alinhamento terminar antes de continuar.', true); return false; }
    if (paraGerar && state.letraLigada && (!temposManuais(state) || state.legendasLetra.confirmado === false)) {
      avisar('Confira o canto e aplique os tempos. Rascunhos ou alinhamentos não conferidos não serão usados no vídeo.', true);
      document.querySelector('[data-tab="tab-legendas"]').click(); status.scrollIntoView({ block: 'center' }); return false;
    }
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
    if (state.busy || state.sincronizandoLetra) return;
    const cues = [...lista.children].map((li, i) => ({ texto: exibidas[i].texto, inicio: lerTempo(li.querySelector('[data-campo="inicio"]').value), fim: lerTempo(li.querySelector('[data-campo="fim"]').value) }));
    const erro = erroNosTempos(cues, state.musicaSegundos);
    if (erro) return avisar(erro, true);
    state.legendasLetra = { chave: chaveDaLetra(state), cues, origem: sujo ? 'manual' : state.legendasLetra?.origem || 'manual', confirmado: true };
    state.letraLigada = true; sujo = false; guardar(); atualizarLetra(); resumoVideo();
    avisar('Tempos manuais aplicados. Serão usados sem recalcular no vídeo e no .srt.');
  };
  $('btn-legendas-restaurar').onclick = () => {
    if (state.busy || state.sincronizandoLetra) return;
    state.legendasLetra = null; sujo = false; assinatura = ''; guardar(); atualizarLetra(); resumoVideo();
  };
  atualizar();
  return { atualizar, validar };
}
