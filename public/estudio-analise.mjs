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
// A análise mais recente (com as melhorias convertidas em controlos): é dela
// que o botão "Aplicar melhorias e gerar de novo" parte.
let ultimaAnalise = null;

export function iniciarAnalise(c) {
  ctx = c;
  // Os botões do diálogo são deste módulo: ligados uma vez no arranque.
  const fechar = $('btn-analise-fechar');
  if (fechar) fechar.onclick = () => $('dlg-analise')?.close();
  const aplicar = $('btn-analise-aplicar');
  if (aplicar) aplicar.onclick = () => aplicarEGerar();
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
  ultimaAnalise = null;
  const botao = $('btn-analise-aplicar');
  if (botao) botao.hidden = true;
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
    ultimaAnalise = dados;
    const botao = $('btn-analise-aplicar');
    if (botao) botao.hidden = !dados.aplicar || !Object.keys(dados.aplicar).length;
    estadoAnalise('✅ Análise pronta — veja abaixo. O prompt refinado pode ser colado no gerador de imagens.', 'ok');
    toast('Análise do diretor pronta.', 'ok');
  } catch (e) {
    estadoAnalise(`❌ ${e.message}`, 'err');
    toast(`Análise falhou: ${e.message}`, 'err');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ============================================================
//  Aplicar as melhorias e gerar de novo
//
//  O diretor devolve as melhorias convertidas em controlos da app ("aplicar").
//  Cada valor é VALIDADO contra as listas do motor (video.mjs): o que não
//  existir nas listas é ignorado e contado como fora da app. Depois aplica
//  tudo, marca os chips e chama o MESMO fluxo de gravação da página.
// ============================================================
async function aplicarEGerar() {
  if (!ctx) return;
  const { state, toast, guardar, resumoVideo, aplicarPreferenciasNaInterface, gerarVideoFinal } = ctx;
  const a = ultimaAnalise?.aplicar;
  if (!a) return toast('A análise ainda não trouxe melhorias aplicáveis.', 'err');

  const mod = await import('./video.mjs');
  const aplicados = [];
  const ignorados = [];

  const aceitar = (dado, lista, descrever, aplicarValor) => {
    const achou = lista.find((o) => o.id === dado);
    if (achou === undefined) {
      if (dado !== undefined && dado !== null && dado !== '') ignorados.push(descrever(dado));
      return;
    }
    aplicarValor(achou);
    aplicados.push(descrever(achou.id));
  };

  if (mod.TRANSICOES.some((t) => t.id === a.transicao) && a.transicao !== state.videoTransicao) {
    const t = mod.TRANSICOES.find((x) => x.id === a.transicao);
    state.videoTransicao = t.id;
    state.videoTransicaoRotulo = t.rotulo;
    aplicados.push(`transição "${t.rotulo}"`);
  }
  if (Number.isFinite(Number(a.duracaoTransicao)) && Number(a.duracaoTransicao) !== state.videoDuracao) {
    aceitar(
      Number(a.duracaoTransicao),
      mod.DURACOES,
      (v) => `transição de ${v}s`,
      (d) => (state.videoDuracao = d.id),
    );
  }
  if (Number.isFinite(Number(a.duracaoCena)) && Number(a.duracaoCena) !== state.videoDuracaoCena) {
    aceitar(
      Number(a.duracaoCena),
      mod.DURACOES_CENA,
      (v) => `${v}s por imagem`,
      (d) => (state.videoDuracaoCena = d.id),
    );
  }
  if (typeof a.legendas === 'boolean' && a.legendas !== state.legendas) {
    state.legendas = a.legendas;
    aplicados.push(`legendas ${a.legendas ? 'ligadas' : 'desligadas'}`);
  }
  if (mod.CODECS.some((c) => c.id === a.codec) && a.codec !== state.codec) {
    state.codec = a.codec;
    aplicados.push(`codec ${a.codec === 'vp9' ? 'VP9 (mais pequeno)' : 'VP8 (compatível)'}`);
  }
  // "Até acabar a música" só existe COM música escolhida; sem ela, fica como está.
  if (mod.MODOS_DURACAO.some((m) => m.id === a.modoDuracao) && a.modoDuracao !== state.modoDuracao) {
    if (a.modoDuracao === 'trilha' && !state.musicaFicheiro) {
      ignorados.push('repetir até acabar a música (não há trilha escolhida)');
    } else {
      state.modoDuracao = a.modoDuracao;
      aplicados.push(a.modoDuracao === 'trilha' ? 'repetir até acabar a música' : 'duração das imagens');
    }
  }
  if (mod.ORIENTACOES.some((o) => o.id === a.orientacao) && a.orientacao && a.orientacao !== state.orientacao) {
    const o = mod.ORIENTACOES.find((x) => x.id === a.orientacao);
    state.orientacao = o.id;
    state.orientacaoRotulo = o.rotulo;
    aplicados.push(`encerramento "${o.rotulo}"`);
  }

  const fora = (Array.isArray(a.foraDaApp) ? a.foraDaApp : []).filter((f) => f && String(f).trim()).slice(0, 4);

  if (!aplicados.length && !fora.length && !ignorados.length) {
    return toast('A análise não trouxe mudanças para os controlos da app.', '');
  }

  guardar();
  aplicarPreferenciasNaInterface();
  resumoVideo();

  // O aviso do que ficou de fora vai ANTES da gravação: assim ninguém regenera
  // esperando uma melhoria que a app não sabe fazer.
  if (fora.length || ignorados.length) {
    toast(
      `Melhorias que exigem edição externa (não apliquei): ${[...fora, ...ignorados].join('; ')}.`,
      '',
    );
  }
  if (!aplicados.length) return; // nada a mudar nos controlos — não regenera à toa

  $('dlg-analise')?.close();
  toast(`✨ Melhorias aplicadas: ${aplicados.join(' · ')}. A gerar de novo…`, 'ok');
  await gerarVideoFinal();
}
