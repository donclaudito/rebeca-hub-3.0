// ============================================================
//  Rebeca Hub 3.0 — a montagem do vídeo (o botão "🎬 Gerar o vídeo")
//
//  Extraído do app.js, que passou do tamanho. A função prepara as cenas
//  (imagens, áudio, cortes das cenas de vídeo) e chama o motor (video.mjs).
//  A orientação do encerramento (epílogo) e a introdução — a imagem inicial
//  que sai da sequência e abre o vídeo, parada — passam aqui para o motor.
// ============================================================

let ctx = null;

export function iniciarVideoFinal(c) {
  ctx = c;
}

export async function gerarVideoFinal() {
  if (!ctx) return;
  const {
    state, $, toast, progress, estadoVideo, mostrarResultado,
    guardarComo, podeEscolherOnde, imagemDaCena, querVoz, querMusica,
    cuesDaLetra, guardar, atualizarTrilha, validarTempos, pararPreviaLetra,
  } = ctx;
  const modCenasEdit = ctx.modCenasEdit ? ctx.modCenasEdit() : null;

  if (state.busy) return;
  if (validarTempos && !validarTempos()) return;
  pararPreviaLetra?.();

  // Cenas de vídeo entram mesmo sem texto: quem manda nelas é o próprio ficheiro.
  const comTexto = state.scenes.filter((s) => (s.texto || '').trim() || s.video);
  const semFala = comTexto.filter((s) => !s.audioUrl && !s.previaUrl);
  const musica = state.musicaFicheiro && querMusica() && state.musicaLigada ? state.musicaFicheiro : null;

  // Um .srt importado e a letra sincronizada aqui são duas fontes com tempos
  // finais. Quem manda é a última que o utilizador mexeu (`fonteLegendas`),
  // não uma precedência fixa: antes o .srt ganhava sempre e uma sincronia
  // feita depois nunca aparecia no vídeo.
  const srtGuardado =
    Array.isArray(state.srtImportado?.cues) && state.srtImportado.cues.length ? state.srtImportado : null;
  const letraDaPagina = state.letraLigada ? cuesDaLetra() : [];
  let fonte = state.fonteLegendas;
  if (!fonte) {
    // Sem escolha registada (projetos antigos): a letra confirmada ganha ao .srt.
    fonte = letraDaPagina.length && state.legendasLetra?.confirmado !== false ? 'letra' : srtGuardado ? 'srt' : 'letra';
  }
  const srtImportado = fonte === 'srt' ? srtGuardado : null;
  // A letra, se estiver em uso, é calculada uma vez e reutilizada.
  const cuesLetra = srtImportado ? srtImportado.cues : letraDaPagina;

  // Com a letra em uso e SEM narração gerada, o vídeo é de letra: vale o mesmo
  // que o modo "só música" — uma imagem por vez, ao ritmo escolhido.
  const comVoz = querVoz() && !(cuesLetra.length && semFala.length === comTexto.length);

  // --- O que é preciso para cada modo ---
  // Só música (ou vídeo de letra): uma trilha e imagens. Narração nenhuma.
  if (!comVoz) {
    if (!musica && !cuesLetra.length) {
      return estadoVideo(
        '❌ O modo "só música" precisa de uma trilha. Escolha a música aqui em cima, ' +
          'ou mude "O que entra" para 🎙️🎵 Narração + música.',
        'err',
      );
    }
    if (cuesLetra.length && !musica) {
      return estadoVideo('❌ A letra precisa da música para saber o tempo de cada verso.', 'err');
    }
    if (!state.images.length) {
      return estadoVideo('❌ Importe as imagens primeiro (aba 🖼️ Imagens).', 'err');
    }
  } else {
    if (!comTexto.length) {
      return estadoVideo(
        '❌ Gere a narração primeiro (aba ⚡ Ações). ' +
          'Se quer um vídeo só com música, mude "O que entra" para 🎵 Só música.',
        'err',
      );
    }
    if (semFala.length === comTexto.length) {
      return estadoVideo(
        '❌ Ainda não há áudio. Vá à aba ⚡ Ações e clique em "🎧 Gerar o áudio de todas as cenas" — ' +
          'o vídeo usa esse áudio. (A pré-escuta de cada cena também serve.) ' +
          'Ou mude "O que entra" para 🎵 Só música, que não precisa de voz.',
        'err',
      );
    }
  }

  const mod = await import('./video.mjs');
  state.busy = true;
  document.getElementById('legendas-campos').disabled = true;
  state.pararVideo = false;
  $('btn-video').disabled = true;
  $('btn-video-parar').hidden = false;

  // Uma cena por imagem que tenha ficheiro conhecido. No modo com voz, são as
  // cenas narradas; no modo só música, são TODAS as imagens importadas.
  const lista = comVoz ? comTexto : state.images;

  // Encerramento e introdução (por nome do ficheiro; sem escolha, o epílogo é
  // a última cena e não há introdução).
  const nomesNaLista = lista.map((s) => (comVoz ? s.filename : s.name));
  // Epílogo: VÁRIAS cenas, pela ordem do projeto (projetos antigos tinham uma).
  const nomesFinais = (Array.isArray(state.cenasFinais) && state.cenasFinais.length
    ? state.cenasFinais
    : [String(state.cenaFinal || '')]
  ).filter(Boolean);
  const idxsFinais = [...new Set(nomesFinais.map((n) => nomesNaLista.indexOf(n)).filter((i) => i >= 0))]
    .sort((a, b) => a - b);
  const idxFinal = idxsFinais.length ? idxsFinais.at(-1) : lista.length - 1;
  // Introdução: VÁRIAS cenas, pela ordem do projeto (projetos antigos tinham
  // uma só, em `cenaInicial`).
  const nomesIniciais = (Array.isArray(state.cenasIniciais) && state.cenasIniciais.length
    ? state.cenasIniciais
    : [String(state.cenaInicial || '')]
  ).filter(Boolean);
  const idxsIniciais = [...new Set(nomesIniciais.map((n) => nomesNaLista.indexOf(n)).filter((i) => i >= 0))]
    .sort((a, b) => a - b);
  const cenas = [];
  for (const s of lista) {
    const imagem = comVoz ? imagemDaCena(s) : s.url;
    if (!imagem) continue;
    let audio = null;
    const url = comVoz ? s.audioUrl || s.previaUrl : null;
    if (url) {
      try {
        audio = await (await fetch(url)).blob();
      } catch {
        audio = null; // fica sem voz nesta cena, mas entra no vídeo
      }
    }
    // O texto vai com a legenda: é dele que saem os blocos do vídeo e do .srt.
    // Cenas de vídeo: a duração e o som vêm do próprio ficheiro, com o CORTE
    // (início/fim) e o VOLUME escolhidos na edição da cena.
    const doCorte = s.video && modCenasEdit ? modCenasEdit.camposParaMotor(s) : {};
    cenas.push({
      imagem,
      audio,
      texto: s.texto || '',
      video: Boolean(s.video),
      duracaoVideo: Number(s.duracaoVideo ?? s.duracao) || 0,
      ...doCorte,
    });
  }

  if (!cenas.length) {
    state.busy = false;
    $('btn-video').disabled = false;
    $('btn-video-parar').hidden = true;
    return estadoVideo('❌ Não consegui preparar nenhuma imagem para o vídeo.', 'err');
  }

  const semVoz = cenas.filter((c) => !c.audio && !c.video).length;
  if (comVoz && semVoz) {
    estadoVideo(`⚠️ ${semVoz} cena(s) sem áudio — o vídeo fica sem voz nessas.`, 'wait');
  }

  const preview = $('vid-preview');
  preview.hidden = false;
  // A miniatura para o painel é captada durante a gravação (fotograma ~1,5s).
  state._miniatura = null;
  state._miniaturaPedida = false;

  // A letra é calculada uma vez: a lista é reutilizada na chamada e no resumo.
  const comLegendas = Boolean(state.legendas) || cuesLetra.length > 0;

  try {
    const r = await mod.gerarVideo({
      cenas,
      formato: state.videoFormato,
      transicao: state.videoTransicao,
      // A imagem aparece INTEIRA por omissão (sem corte nem zoom); 'preencher'
      // amplia e corta para cobrir o quadro. É a diferença entre a imagem "como
      // foi escolhida" e a imagem recortada.
      modoImagem: state.modoImagem || 'inteira',
      // Ondulação na zona da água: 'desligado' mantém tudo como era.
      agua: state.videoAgua || 'desligado',
      duracaoTransicao: state.videoDuracao,
      musica,
      duracaoCena: state.videoDuracaoCena,
      // Com a letra em uso, as legendas ficam ligadas (ela substitui a narração).
      legendas: comLegendas,
      legendasExternas: cuesLetra.length ? cuesLetra : null,
      // Um .srt importado tem tempos finais. O ajuste é ESCOLHIDO na página
      // (desvio em segundos e factor de escala); sem ajuste, os tempos ficam
      // como vieram no ficheiro.
      legendasAjustar: Boolean(srtImportado) && Boolean(state.srtAjuste),
      legendasFator: Number(state.srtAjuste?.fator) || 1,
      legendasDesvio: Number(state.srtAjuste?.desvio) || 0,
    // Atraso à mão: entra sempre, venha a legenda da letra, de um .srt ou da narração.
    legendasAtraso: Number(state.legendasAtraso) || 0,
      // Rascunho (sem tempos confirmados nem alinhados)? O motor re-temporiza
      // os versos ao canto real da faixa, no momento exato da voz.
      legendasRascunho: !srtImportado && cuesLetra.length > 0 && !state.legendasLetra,
      codec: state.codec,
      modoDuracao: state.modoDuracao,
      musicaSegundos: state.musicaSegundos,
      // Orientação do encerramento + a cena que fecha o vídeo (epílogo).
      orientacao: state.orientacao,
      cenaFinal: idxFinal,
      cenasFinais: idxsFinais,
      // As cenas que abrem o vídeo (introdução), pelo mesmo raciocínio do
      // epílogo — várias, pela ordem do projeto.
      cenaInicial: idxsIniciais.length ? idxsIniciais[0] : -1,
      cenasIniciais: idxsIniciais,
      // Tempos escolhidos na página para a introdução e o epílogo (0 = automático).
      duracaoIntro: Number(state.durIntro) || 0,
      duracaoEpilogo: Number(state.durEpilogo) || 0,
      // Desenha no canvas visível: vê-se a montagem enquanto grava.
      canvas: preview,
      aoProgredir: (p) => {
        if (p.fase === 'a gravar') {
          // Miniatura: o primeiro fotograma a partir de 1,5s, para não apanhar
          // a passagem de entrada escura entre duas imagens.
          if (!state._miniaturaPedida && p.segundos >= 1.5) {
            state._miniaturaPedida = true;
            try {
              preview.toBlob((b) => { if (b) state._miniatura = b; }, 'image/jpeg', 0.8);
            } catch {
              /* sem miniatura, o painel mostra o ícone */
            }
          }
          const pct = p.totalSegundos ? Math.round((p.segundos / p.totalSegundos) * 100) : 0;
          const ciclo = p.passagens > 1 ? ` · passagem ${p.passagem} de ${p.passagens}` : '';
          progress(true, pct, `a gravar imagem ${p.atual} de ${p.total}${ciclo} — ${Math.round(p.segundos)}s de ${Math.round(p.totalSegundos)}s`);
          estadoVideo(
            `a gravar… imagem ${p.atual} de ${p.total}${ciclo}. Não mude de janela. ` +
              `${Math.round(p.segundos)}s de ${Math.round(p.totalSegundos)}s.`,
            'wait',
          );
        } else {
          progress(true, 2, `${p.fase}…`);
          estadoVideo(`${p.fase}…`, 'wait');
        }
      },
      deveParar: () => state.pararVideo,
    });

    if (!r.ok) throw new Error(r.erro);

    // O motor mediu a música pelo áudio descodificado, que é a verdade. Se a
    // página tinha medido outra coisa, fica a certa para a próxima vez (e o
    // desvio vai para a consola, porque um desvio grande é um defeito a olhar).
    if (r.musicaSegundos > 0 && Math.abs(r.musicaSegundos - (state.musicaSegundos || 0)) > 1) {
      if (state.musicaSegundos > 0) {
        console.warn(
          `[trilha] a página mediu ${state.musicaSegundos.toFixed(2)}s e o áudio descodificado tem ` +
            `${r.musicaSegundos.toFixed(2)}s; passei a usar o valor do áudio.`,
        );
      }
      state.musicaSegundos = r.musicaSegundos;
      state.musicaDuracao = r.musicaSegundos;
      state.musicaMedida = true;
      atualizarTrilha();
      guardar();
    }

    const nome = `rebeca-video.${r.extensao}`;

    // Guarda o resultado e mostra-o para se poder VER aqui dentro.
    mostrarResultado(r, nome);

    // Com a janela "Guardar como" (Chrome/Edge), o utilizador escolhe a pasta e
    // o nome. É o passo que faltava: antes o ficheiro caía sempre na pasta das
    // transferências sem se poder escolher. Nos browsers sem esta janela, cai
    // numa descarga normal — o mesmo de antes.
    const escolheu = await guardarComo(r.blob, nome, 'Vídeo WebM');

    // O .srt sai dos MESMOS blocos que foram desenhados no vídeo, e também
    // pergunta onde guardar (só depois de o vídeo estar tratado, para não abrir
    // duas janelas de uma vez).
    if (r.srt) {
      const srtBlob = new Blob([r.srt], { type: 'text/plain;charset=utf-8' });
      if (!podeEscolherOnde() || escolheu) {
        setTimeout(() => guardarComo(srtBlob, 'rebeca-video.srt', 'Legendas (SubRip)'), 400);
      }
    }

    estadoVideo(
      `✅ Vídeo pronto: ${Math.round(r.duracao)}s, ${(r.blob.size / 1048576).toFixed(1)} MB, ` +
        `formato ${r.formato}, transição "${r.transicao}", ${r.comVoz ? 'com narração' : 'sem voz'}` +
        `${r.comMusica ? ' e com trilha' : musica ? ' e SEM trilha' : ''}. ` +
        `${r.repetido
          ? `🔁 As imagens passaram ${r.passagens}× (${Math.round(r.duracaoNatural)}s cada passagem).`
          : state.modoDuracao === 'trilha'
            ? `ℹ️ Não repeti as imagens${r.semCiclo ? `: ${r.semCiclo}` : ''}.`
            : ''} ` +
        `${r.intro ? `🎬 Introdução de ${Math.round(r.intro)}s no começo. ` : ''}` +
        `${r.tempoExtra > 0.2
          ? `🎵 A música acabou junto com o vídeo: a última imagem ficou mais ${Math.round(r.tempoExtra)}s para a trilha não ser cortada. `
          : ''}` +
        `${r.trilhaCorte > 0.05
          ? `🎵 A trilha entra logo no 0:00 (tirei ${(Math.round(r.trilhaCorte * 10) / 10).toString().replace('.', ',')}s de silêncio do início do ficheiro). `
          : ''}` +
        `${r.legendas ? `${r.legendas} bloco(s) de legenda${r.legendasDaLetra ? ' (da letra)' : ''}. ` : ''}` +
        `Descarregado como ${nome}${r.srt ? ' e rebeca-video.srt' : ''}.` +
        `${r.musicaAviso ? ` ⚠️ ${r.musicaAviso}` : ''} (motor v${r.versao})` +
        (r.codec === 'vp9'
          ? ' · ⚠️ Gravado em VP9: o Windows pode recusar abri-lo — use o VLC, ou mude "Ficheiro" para Compatível (VP8).'
          : ''),
      r.musicaAviso ? 'wait' : 'ok',
    );
    toast(
      `${r.comVoz ? 'Vídeo pronto' : 'Vídeo só com música'} (${Math.round(r.duracao)}s)` +
        `${r.comMusica ? ', com trilha' : ''}${r.repetido ? `, ${r.passagens}× em ciclo` : ''}` +
        `${r.srt ? ' + legendas .srt' : ''}.`,
      'ok',
    );
  } catch (e) {
    estadoVideo(`❌ ${e.message}`, 'err');
    toast(e.message, 'err');
  } finally {
    state.busy = false;
    document.getElementById('legendas-campos').disabled = !document.querySelector('#legendas-lista li');
    state.pararVideo = false;
    $('btn-video').disabled = false;
    $('btn-video-parar').hidden = true;
    setTimeout(() => progress(false), 1500);
  }
}
