// ============================================================
//  Rebeca Hub 3.0 — análise do Diretor de Fotografia
//
//  O botão "🎥 Análise do Diretor" (no resultado do vídeo) envia a miniatura
//  do vídeo pronto + as cenas à função de nuvem analisarProducao, que devolve
//  o feedback estruturado: composição/ritmo, sincronia com o áudio, melhorias
//  de edição e um prompt refinado para regerar as imagens.
//
//  Antes disso corre a AUDITORIA DE ENQUADRAMENTO (auditoria-enquadramento.mjs):
//  as mesmas contas do motor de vídeo dizem, cena a cena, se o personagem está
//  centrado, se lhe falta a cabeça ou os pés, e se o problema é do recorte do
//  vídeo ou da própria imagem. O resultado aparece no diálogo E segue como
//  contexto para o Diretor — é o que condiciona o prompt refinado a corrigir
//  tudo o que é possível corrigir.
// ============================================================

const $ = (id) => document.getElementById(id);

let ctx = null;
// A análise mais recente (com as melhorias convertidas em controlos): é dela
// que o botão "Aplicar melhorias e gerar de novo" parte.
let ultimaAnalise = null;
// A auditoria de enquadramento da última análise (números, não opiniões).
let ultimaAuditoria = null;

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
  ultimaAuditoria = null;
  const listaEnq = $('analise-enquadramento');
  if (listaEnq) listaEnq.replaceChildren();
  const txtEnq = $('analise-enquadramento-texto');
  if (txtEnq) txtEnq.textContent = '';
  const botao = $('btn-analise-aplicar');
  if (botao) botao.hidden = true;
  const dlg = $('dlg-analise');
  if (dlg && !dlg.open) dlg.showModal();
  estadoAnalise('O diretor está a ver o material — demora alguns segundos…', 'wait');
}

// O formato do vídeo em pixels ("1920x1080" → 1920, 1080).
function alvoDoFormato() {
  const { state } = ctx;
  const partes = String(state.videoFormato || '1920x1080').split('x').map(Number);
  const w = partes[0] > 0 ? partes[0] : 1920;
  const h = partes[1] > 0 ? partes[1] : 1080;
  return { w, h };
}

// Mede o enquadramento de cada cena (sem IA: são as contas do próprio motor).
async function auditar() {
  const { state } = ctx;
  if (!state.images.length) return null;
  try {
    const mod = await import('./auditoria-enquadramento.mjs');
    const { w, h } = alvoDoFormato();
    return await mod.auditarCenas(state.images, w, h, { modo: 'personagem' });
  } catch {
    return null; // a análise do Diretor segue sem os números
  }
}

// Mostra a auditoria no diálogo: uma linha por cena com problema + o resumo.
function mostrarAuditoria(aud) {
  const txt = $('analise-enquadramento-texto');
  const lista = $('analise-enquadramento');
  if (!txt || !lista) return;
  lista.replaceChildren();
  if (!aud || !aud.total) {
    txt.textContent = 'Sem imagens para medir o enquadramento.';
    return;
  }
  txt.textContent =
    `${aud.veredicto}. ` +
    (aud.faltas.length
      ? `A corrigir: ${aud.faltas.join(' · ')}. O prompt refinado abaixo já inclui estas exigências.`
      : 'Nada a corrigir no enquadramento: o personagem fica inteiro e centrado.');

  const comProblema = aud.cenas.filter((c) => c.gravidade !== 'ok');
  for (const c of comProblema) {
    const li = document.createElement('li');
    const icone = c.gravidade === 'grave' ? '⛔' : '⚠️';
    const b = document.createElement('b');
    b.textContent = `${icone} ${c.nome}`;
    li.append(b, document.createTextNode(` — ${c.avisos.join('; ')}`));
    lista.append(li);
  }
  if (!comProblema.length) {
    const li = document.createElement('li');
    li.textContent = `✅ As ${aud.total} cenas com o personagem inteiro e centrado.`;
    lista.append(li);
  }
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
    // 1) MEDIR o enquadramento (números do motor, não opinião do modelo).
    estadoAnalise('A medir o enquadramento das cenas…', 'wait');
    const aud = await auditar();
    ultimaAuditoria = aud;

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
      // Os números do enquadramento vão como contexto: o Diretor tem de os
      // respeitar nas melhorias e no prompt refinado.
      enquadramento: aud
        ? {
            veredicto: aud.veredicto,
            faltas: aud.faltas,
            exigencias: aud.exigencias,
            cenas: aud.cenas.map((c) => ({ nome: c.nome, avisos: c.avisos, gravidade: c.gravidade })),
          }
        : null,
    });

    // Desembrulha: o SDK pode devolver { data: {...} } ou o próprio objeto.
    let dados = resposta?.data && typeof resposta.data === 'object' && resposta.ok === undefined ? resposta.data : resposta;
    if (dados?.data && typeof dados.data === 'object') dados = dados.data;
    if (!dados || !dados.ok) throw new Error(dados?.error || 'a análise falhou sem explicação');

    // 2) As faltas MEDIDAS entram na lista de melhorias — mesmo que o modelo as
    //    tenha esquecido. "Incluir na atualização" é isto: o que foi medido não
    //    se perde.
    const melhorias = Array.isArray(dados.melhorias) ? [...dados.melhorias] : [];
    if (aud && aud.faltas.length) {
      melhorias.unshift({
        titulo: '⛔ Enquadramento (medido)',
        detalhe: `${aud.faltas.join('; ')}. Isto resolve-se a gerar de novo as imagens com o prompt refinado: ${aud.exigencias.join('; ')}.`,
      });
    }

    // 3) Garantir que o prompt refinado leva as exigências de enquadramento,
    //    mesmo quando o modelo se esquece delas.
    let promptRefinado = String(dados.promptRefinado || '');
    if (aud && aud.faltas.length) {
      const mod = await import('./auditoria-enquadramento.mjs');
      const jaFala = /framing|full body|whole character|head.{0,20}feet|centred|centered/i.test(promptRefinado);
      if (!jaFala) {
        const clausula = mod.clausulaDeEnquadramento(aud.exigencias);
        promptRefinado = `${promptRefinado.trim()} ${clausula}`.trim();
      }
    }

    const corpo = $('analise-corpo');
    if (corpo) corpo.hidden = false;
    mostrarAuditoria(aud);
    // A leitura do Diretor sobre o enquadramento (o que ele viu nas imagens)
    // fica por baixo das medidas — uma complementa a outra.
    const enqIa = $('analise-enquadramento-ia');
    if (enqIa) enqIa.textContent = dados.enquadramento || '';
    const comp = $('analise-composicao');
    if (comp) comp.textContent = dados.composicao || '';
    const sinc = $('analise-sincronia');
    if (sinc) sinc.textContent = dados.sincronia || '';
    const lista = $('analise-melhorias');
    if (lista) {
      lista.innerHTML = '';
      melhorias.forEach((m) => {
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
    if (prompt) prompt.value = promptRefinado;
    ultimaAnalise = { ...dados, melhorias, promptRefinado };
    const botao = $('btn-analise-aplicar');
    if (botao) botao.hidden = !dados.aplicar || !Object.keys(dados.aplicar).length;
    estadoAnalise(
      aud && aud.faltas.length
        ? `✅ Análise pronta. Enquadramento: ${aud.veredicto} — copie o prompt refinado para gerar as imagens já com as correções.`
        : '✅ Análise pronta — veja abaixo. O prompt refinado pode ser colado no gerador de imagens.',
      'ok',
    );
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
  const { state, toast, guardar, resumoVideo, aplicarPreferenciasNaInterface, gerarVideoFinal, videoAtual } = ctx;
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
    // Tempo por imagem só manda numa montagem SEM narração: com voz, quem dita
    // o ritmo é a fala. Aplicar à toa enganaria quem espera a melhoria na tela.
    if (videoAtual && videoAtual()?.r?.comVoz) {
      ignorados.push('tempo por imagem (a montagem tem narração — quem dita o ritmo é a fala)');
    } else {
      aceitar(
        Number(a.duracaoCena),
        mod.DURACOES_CENA,
        (v) => `${v}s por imagem`,
        (d) => (state.videoDuracaoCena = d.id),
      );
    }
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
  if (!aplicados.length) {
    // Nada a mudar nos controlos. Se o problema medido for de enquadramento, a
    // app não o resolve sozinha: só imagens novas (ou o recorte) o resolvem — e
    // dizê-lo evita regenerar à espera de uma melhoria que não vem.
    const faltas = ultimaAuditoria?.faltas || [];
    if (faltas.length) {
      toast(
        `O enquadramento não se corrige a regerar o vídeo: ${faltas.join('; ')}. Copie o prompt refinado e gere as imagens de novo com ele.`,
        '',
      );
      $('analise-prompt')?.select?.();
    }
    return;
  }

  $('dlg-analise')?.close();
  toast(`✨ Melhorias aplicadas: ${aplicados.join(' · ')}. A gerar de novo…`, 'ok');
  await gerarVideoFinal();
}
