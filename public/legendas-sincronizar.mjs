import { versosDaLetra } from './legendas-core.mjs';
import { chaveDaLetra, erroNosTempos } from './legendas-tempos.mjs';

export default function iniciarSincronia({ state, clienteBase44, guardar, atualizarLetra, resumoVideo }) {
  const botao = document.getElementById('btn-legendas-sincronizar');
  const status = document.getElementById('legendas-sincronia-estado');
  const avisar = (texto, erro = false) => { status.textContent = texto; status.className = `cfg-result ${erro ? 'err' : 'ok'}`; };
  const atualizar = () => { botao.disabled = Boolean(state.busy || state.sincronizandoLetra || !state.musicaFicheiro || !versosDaLetra(state.letra).length || !state.musicaSegundos); };
  botao.onclick = async () => {
    if (state.busy || state.sincronizandoLetra) return;
    const ficheiro = state.musicaFicheiro, chave = chaveDaLetra(state), anterior = state.legendasLetra;
    if (!ficheiro || !versosDaLetra(state.letra).length) return;
    state.sincronizandoLetra = true;
    botao.textContent = 'Alinhando as palavras ao áudio…';
    avisar('Aguarde. Os versos serão localizados no áudio, sem usar o volume dos instrumentos.');
    atualizarLetra();
    try {
      const b = await clienteBase44();
      const resposta = await b.functions.invoke('sincronizarLetra', {
        file: ficheiro, text: versosDaLetra(state.letra).join('\n'), duracao: state.musicaSegundos,
      });
      const dados = resposta.data;
      if (!dados?.ok) throw new Error(dados?.error || 'Não foi possível alinhar a letra.');
      if (state.musicaFicheiro !== ficheiro || chaveDaLetra(state) !== chave || state.legendasLetra !== anterior) {
        return avisar('O áudio, a letra ou os ajustes mudaram. O resultado antigo não foi aplicado.', true);
      }
      const erro = erroNosTempos(dados.cues, state.musicaSegundos);
      if (erro) throw new Error(erro);
      state.legendasLetra = { chave, cues: dados.cues, origem: 'alinhamento', confirmado: false };
      guardar(); atualizarLetra(); resumoVideo();
      avisar('Palavras alinhadas ao áudio. Ouça a prévia e clique em Aplicar tempos para confirmar; o reconhecimento pode errar em música cantada.');
    } catch (erro) {
      avisar(erro?.response?.data?.error || erro.message || 'Falha no alinhamento. Ajuste e aplique os tempos manualmente.', true);
    } finally {
      state.sincronizandoLetra = false;
      botao.textContent = 'Sincronizar com o canto';
      atualizarLetra();
    }
  };
  atualizar();
  return { atualizar };
}
