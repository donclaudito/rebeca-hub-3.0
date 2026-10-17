// ============================================================
//  Rebeca Hub 3.0 — análise do Diretor de Fotografia
//
//  O botão "🎥 Análise do Diretor" (no resultado do vídeo) envia a miniatura
//  do vídeo pronto + as cenas à função de nuvem analisarProducao, que devolve
//  o feedback estruturado: composição/ritmo, sincronia com o áudio, melhorias
//  de edição e um prompt refinado para regerar as imagens.
// ============================================================

const $ = (id) => document.getElementById(id);

let ctx = null;

export function iniciarAnalise(c) {
  ctx = c;
  // Os botões do diálogo são deste módulo: ligados uma vez no arranque.
  const fechar = $('btn-analise-fechar');
  if (fechar) fechar.onclick = () => $('dlg-analise')?.close();
  const copiar = $('btn-analise-copiar');
  if (copiar) {
    copiar.onclick = async () => {
      const texto = $('analise-prompt')?.value || '';
      if (!texto) return;
      try {
        await navigator.clipboard.writeText(texto);
        copiar.textContent = '📋 Copiado ✓';
        setTimeout(() => (copiar.textContent = '📋 Copiar o prompt refinado'), 2200);
      } catch {
        $('analise-prompt')?.select?.();
      }
    };
  }
}

function estadoAnalise(msg, tipo = '') {
  const el = $('analise-estado');
  if (!el) return;
  el.hidden = !msg;
  el.className = `cfg-result ${tipo}`;
  el.textContent = msg;
}

// Abre o diálogo já no estado "a analisar": o utilizador vê que está a correr.
function abrirDialogo() {
  const corpo = $('analise-corpo');
  if (corpo) corpo.hidden = true;
  const dlg = $('dlg-analise');
  if (dlg && !dlg.open) dlg.showModal();
  estadoAnalise('O diretor está a ver o material — demora alguns segundos…', 'wait');
}

// Os dados da montagem que a análise usa como contexto.
function metaDaMontagem(r) {
  const { state } = ctx;
  const resultado = r?.r || {};
  return {
    duracao: Math.round(resultado.duracao || 0),
    formato: resultado.formato || state.videoFormato,
    transicao: state.videoTransicaoRotulo || state.videoTransicao,
    duracaoTransicao: state.videoDuracao,
    comVoz: Boolean(resultado.comVoz),
    comMusica: Boolean(resultado.comMusica),
    musicaSegundos: Math.round(state.musicaSegundos || 0),
    modoDuracao: state.modoDuracao,
    passagens: resultado.passagens || 1,
    orientacao: state.orientacao,
    epilogo: resultado.epilogo ? Math.round(resultado.epilogo) : '',
    intro: resultado.intro ? Math.round(resultado.intro) : '',
    legendas: resultado.legendas || 0,
    letraDaMusica: Boolean(resultado.legendasDaLetra),
    codec: resultado.codec || state.codec,
    cenas: state.images.length,
  };
}

export async function analisarDiretor() {
  if (!ctx) return;
  const { state, $, toast, clienteBase44, videoAtual } = ctx;
  const resultado = videoAtual();
  if (!resultado?.blob) {
    return toast('Gere o vídeo primeiro — a análise olha para o resultado.', 'err');
  }
  const btn = $('btn-video-analise');
  if (btn) btn.disabled = true;
  abrirDialogo();

  try {
    const b = await clienteBase44();

    // As imagens vão ao armazenamento privado (só esta app as abre) e o
    // backend assina cada uma para a IA as ler. A PRIMEIRA é a miniatura do
    // vídeo pronto; as seguintes são as cenas, por ordem.
    const arquivos = [];
    if (state._miniatura) {
      try {
        const r = await b.integrations.Core.UploadPrivateFile({
          file: new File([state._miniatura], 'miniatura.jpg', { type: 'image/jpeg' }),
        });
        arquivos.push({ nome: 'miniatura (fotograma do vídeo pronto)', uri: r.file_uri });
      } catch {
        /* a miniatura é opcional */
      }
    }
    for (const img of state.images.slice(0, 8)) {
      try {
        const r = await b.integrations.Core.UploadPrivateFile({ file: img.file });
        arquivos.push({ nome: `cena: ${img.name}`.slice(0, 80), uri: r.file_uri });
      } catch {
        /* cena ilegível segue de fora */
      }
    }
    if (!arquivos.length) throw new Error('não consegui enviar as imagens da montagem');

    const resposta = await b.functions.invoke('analisarProducao', {
      arquivos,
      meta: metaDaMontagem(resultado),
    });

    // Desembrulha: o SDK pode devolver { data: {...} } ou o próprio objeto.
    let dados = resposta?.data && typeof resposta.data === 'object' && resposta.ok === undefined ? resposta.data : resposta;
    if (dados?.data && typeof dados.data === 'object') dados = dados.data;
    if (!dados || !dados.ok) throw new Error(dados?.error || 'a análise falhou sem explicação');

    const corpo = $('analise-corpo');
    if (corpo) corpo.hidden = false;
    const comp = $('analise-composicao');
    if (comp) comp.textContent = dados.composicao || '';
    const sinc = $('analise-sincronia');
    if (sinc) sinc.textContent = dados.sincronia || '';
    const lista = $('analise-melhorias');
    if (lista) {
      lista.innerHTML = '';
      (dados.melhorias || []).forEach((m) => {
        const li = document.createElement('li');
        const b1 = document.createElement('b');
        b1.textContent = m.titulo;
        li.append(b1, document.createTextNode(` — ${m.detalhe}`));
        lista.append(li);
      });
      if (!lista.children.length) {
        const li = document.createElement('li');
        li.textContent = 'Sem sugestões — o material está bem.';
        lista.append(li);
      }
    }
    const prompt = $('analise-prompt');
    if (prompt) prompt.value = dados.promptRefinado || '';
    estadoAnalise('✅ Análise pronta — veja abaixo. O prompt refinado pode ser colado no gerador de imagens.', 'ok');
    toast('Análise do diretor pronta.', 'ok');
  } catch (e) {
    estadoAnalise(`❌ ${e.message}`, 'err');
    toast(`Análise falhou: ${e.message}`, 'err');
  } finally {
    if (btn) btn.disabled = false;
  }
}
