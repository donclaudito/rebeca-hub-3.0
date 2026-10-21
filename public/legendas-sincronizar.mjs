import { versosDaLetra } from './legendas-core.mjs';
import { chaveDaLetra, erroNosTempos } from './legendas-tempos.mjs';

export default function iniciarSincronia({ state, clienteBase44, guardar, atualizarLetra, resumoVideo, validar }) {
  // O botão de sincronizar tem agora DUAS portas: a aba Legendas (onde se
  // confere a prévia) e o bloco da letra, na aba Voz (onde a letra se escreve).
  // A queixa era justa: a dica mandava "ir à aba Legendas" e essa aba só fazia
  // sentido depois de a letra estar escrita — um sítio para onde o utilizador
  // não sabia ir. Agora está onde ele já está.
  const botoes = ['btn-legendas-sincronizar', 'btn-letra-sincronizar']
    .map((id) => document.getElementById(id))
    .filter(Boolean);

  const status = document.getElementById('legendas-sincronia-estado');
  const avisar = (texto, erro = false) => {
    if (!status) return;
    status.textContent = texto;
    status.className = `cfg-result ${erro ? 'err' : 'ok'}`;
  };

  const ROTULO = '🎤 Sincronizar com o canto';
  const escrever = (texto) => {
    for (const b of botoes) b.textContent = texto;
  };
  const ativar = (desativado) => {
    for (const b of botoes) b.disabled = desativado;
  };

  const atualizar = () => {
    ativar(
      Boolean(
        state.busy ||
          state.sincronizandoLetra ||
          !state.musicaFicheiro ||
          !versosDaLetra(state.letra).length ||
          !state.musicaSegundos,
      ),
    );
  };

  const correr = async () => {
    if (state.busy || state.sincronizandoLetra || !validar()) return;
    const ficheiro = state.musicaFicheiro;
    const chave = chaveDaLetra(state);
    const anterior = state.legendasLetra;
    if (!ficheiro || !versosDaLetra(state.letra).length) return;

    state.sincronizandoLetra = true;
    escrever('Alinhando as palavras ao áudio…');
    ativar(true);
    avisar('Aguarde. Os versos serão localizados no áudio, sem usar o volume dos instrumentos.');
    atualizarLetra();
    try {
      const b = await clienteBase44();
      const resposta = await b.functions.invoke('sincronizarLetra', {
        file: ficheiro,
        text: versosDaLetra(state.letra).join('\n'),
        duracao: state.musicaSegundos,
      });
      const dados = resposta.data;
      if (!dados?.ok) throw new Error(dados?.error || 'Não foi possível alinhar a letra.');
      if (
        state.musicaFicheiro !== ficheiro ||
        chaveDaLetra(state) !== chave ||
        state.legendasLetra !== anterior
      ) {
        return avisar('O áudio, a letra ou os ajustes mudaram. O resultado antigo não foi aplicado.', true);
      }
      const erro = erroNosTempos(dados.cues, state.musicaSegundos);
      if (erro) throw new Error(erro);
      state.legendasLetra = { chave, cues: dados.cues, origem: 'alinhamento', confirmado: false };
      // O alinhamento acabado de fazer é o que o utilizador quer no vídeo.
      state.fonteLegendas = 'letra';
      guardar();
      atualizarLetra();
      resumoVideo();
      avisar(
        'Palavras alinhadas ao áudio. Ouça a prévia e clique em Aplicar tempos para confirmar; ' +
          'o reconhecimento pode errar em música cantada.',
      );
    } catch (erro) {
      avisar(
        erro?.response?.data?.error ||
          erro.message ||
          'Falha no alinhamento. Ajuste e aplique os tempos manualmente.',
        true,
      );
    } finally {
      state.sincronizandoLetra = false;
      escrever(ROTULO);
      atualizarLetra();
      atualizar();
    }
  };

  for (const b of botoes) {
    b.onclick = correr;
    // O estado depende de ter letra, música e duração — coisas que mudam noutro
    // sítio da página. Atualizar ao aproximar o rato garante que o botão nunca
    // fica desativado por informação velha.
    b.addEventListener('pointerenter', atualizar);
    b.addEventListener('focus', atualizar);
  }
  escrever(ROTULO);
  atualizar();
  return { atualizar };
}
