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
    $('legendas-resumo').textContent = cues.length
      ? `${cues.length} legenda(s) da música`
      // Zero blocos não diz nada a quem está a usar: dizer o que falta.
      : !String(state.letra || '').trim()
        ? '0 legendas — cole a letra da música na aba Voz (uma linha por verso).'
        : !state.musicaFicheiro
          ? '0 legendas — escolha a música na aba Voz (é ela que dá a duração).'
          : !(Number(state.musicaSegundos) > 0)
            ? '0 legendas — a duração da música ainda não foi lida; volte a escolher o ficheiro.'
            : '0 legendas — a letra ficou sem versos utilizáveis; apague as linhas que são só marcação, como (Refrão) ou [Verso 2].';
  };
  lista.oninput = () => { sujo = true; avisar('Alterações pendentes. Clique em Aplicar tempos antes de gerar o vídeo.', true); };
  const validar = (paraGerar = false) => {
    if (state.sincronizandoLetra) { avisar('Aguarde o alinhamento terminar antes de continuar.', true); return false; }
    // Um .srt importado (ou colado no campo da letra) TEM tempos finais: não há
    // nada para conferir na lista de versos, por isso não se bloqueia a geração.
    const temposFinais = state.fonteLegendas === 'srt'
      && Array.isArray(state.srtImportado?.cues) && state.srtImportado.cues.length > 0;
    if (paraGerar && !temposFinais && state.letraLigada && (!temposManuais(state) || state.legendasLetra.confirmado === false)) {
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
    // Passa a ser a letra a mandar na legenda do vídeo. Sem isto, um .srt
    // importado antes continuava a ganhar em silêncio e a sincronia feita aqui
    // nunca chegava ao vídeo.
    state.fonteLegendas = 'letra';
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
