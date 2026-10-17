// ============================================================
//  Legendas — lógica pura (sem canvas, sem browser)
//
//  Trazida do Rebeca Hub 2.0 (src/lib/subtitles.js). A regra que justifica este
//  ficheiro existir é a legibilidade: a narração vira legenda, e uma frase longa
//  — ou poucas cenas com muito texto — virava uma parede de texto impossível de
//  ler no ritmo do vídeo. Então:
//    1. cada bloco de legenda tem no máximo CAPT_MOSTRAS palavras, quebrando
//       antes numa vírgula/travessão quando dá, para não cortar a ideia;
//    2. cada bloco é desenhado em no máximo CAPT_LINHAS linhas — se não couber,
//       a fonte encolhe um pouco, mas NENHUMA palavra é descartada;
//    3. o .srt sai da MESMA lista de blocos que o vídeo desenha, por isso os dois
//       mostram exatamente o mesmo texto (no 2.0 o desenho cortava e o .srt
//       entregava a frase inteira: o vídeo perdia palavras que o YouTube tinha).
//
//  Este ficheiro não desenha nada: as contas ficam aqui para poderem ser
//  testadas sem browser. O desenho está em legendas.mjs.
// ============================================================

export const CAPT_MOSTRAS = 9; // palavras por bloco
export const CAPT_CHARS = 42; // caracteres por bloco (frase longa em palavras curtas também corta)
export const CAPT_LINHAS = 2; // linhas por bloco no ecrã
export const CAPT_ESCALA_MIN = 0.55; // limite do encolhimento da fonte
export const CAPT_PISO = 0.8; // segundos mínimos que um bloco fica no ecrã

// Fonte fixa, a mesma que o 2.0 usava por omissão. A família tem alternativas
// para o caso de a fonte do Google não chegar (ver legendas.mjs).
export const CAPT_FONTE = {
  id: 'luckiest_guy',
  label: 'Luckiest Guy',
  family: '"Luckiest Guy", "Komika Axis", "Comic Sans MS", cursive',
  google: 'Luckiest+Guy',
  weight: '400',
};

export const CAPT_COR = '#FBBF24'; // amarelo
export const CAPT_CONTORNO = 4;

// Corta a narração em frases (pela pontuação final).
export function dividirFrases(texto) {
  return String(texto || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Quebra um trecho em blocos curtos. Três limites, e o que chegar primeiro:
//   • no máximo `maxPalavras` palavras;
//   • no máximo `maxChars` caracteres (pega o caso de palavras curtas, em que a
//     contagem de palavras sozinha deixaria a linha comprida demais);
//   • preferência por quebrar logo depois de uma vírgula/dois-pontos/travessão
//     quando ela aparece na metade final do bloco — corta na pausa da fala.
// Nunca perde nem altera palavra: juntar os blocos devolve o texto original.
export function dividirBlocos(texto, maxPalavras = CAPT_MOSTRAS, maxChars = CAPT_CHARS) {
  const pBruto = Math.floor(Number(maxPalavras));
  const limite = Number.isFinite(pBruto) && pBruto >= 2 ? pBruto : CAPT_MOSTRAS;
  const cBruto = Math.floor(Number(maxChars));
  const limiteChars = Number.isFinite(cBruto) && cBruto >= 12 ? cBruto : CAPT_CHARS;
  const minimo = Math.max(4, Math.ceil(limite / 2));
  const fecha = (palavra) => /[,;:—–-]$/.test(palavra) || /[.!?…]$/.test(palavra);
  const palavras = String(texto || '').trim().split(/\s+/).filter(Boolean);
  const blocos = [];
  let atual = [];
  for (const palavra of palavras) {
    // O teto de caracteres é conferido ANTES de entrar a palavra: se ela fizesse
    // o bloco passar do limite, o bloco fecha primeiro (senão estouraria sempre
    // pelo tamanho da última palavra).
    const candidato = atual.length ? `${atual.join(' ')} ${palavra}` : palavra;
    if (atual.length >= 2 && candidato.length > limiteChars) {
      blocos.push(atual.join(' '));
      atual = [];
    }
    atual.push(palavra);
    const cheio = atual.length >= limite;
    const natural = atual.length >= minimo && fecha(palavra);
    if (cheio || natural) {
      blocos.push(atual.join(' '));
      atual = [];
    }
  }
  if (atual.length) blocos.push(atual.join(' '));
  return blocos;
}

// Todos os blocos de uma narração, sem temporização: é exatamente o texto que
// aparece no ecrã, bloco por bloco.
export function blocosDaNarracao(narracao) {
  return dividirFrases(narracao).flatMap((frase) => dividirBlocos(frase));
}

// Blocos temporizados dentro de uma janela de fala.
//
// A duração de cada bloco é proporcional ao número de palavras dele: quem fala
// mais tempo recebe mais tempo no ecrã. O piso de 0,8 s é COMPENSADO nos blocos
// longos — o que os curtos ganham sai da folga dos longos, por isso a soma
// continua a ser exatamente a janela. No 2.0 o piso era somado por cima, o
// excedente acumulava-se e a legenda invadia a cena seguinte.
export function blocosTemporizados(narracao, janelaSegundos, avanco = 0) {
  const blocos = blocosDaNarracao(narracao);
  const janela = Math.max(0, Number(janelaSegundos) || 0);
  if (!janela || !blocos.length) return [];
  const pesos = blocos.map((b) => b.split(/\s+/).filter(Boolean).length || 1);
  const total = pesos.reduce((a, b) => a + b, 0);
  const proporcionais = blocos.map((_, j) => (janela * pesos[j]) / total);
  let duracoes = proporcionais;
  for (let passo = 0; passo < 8; passo++) {
    const falta = duracoes.reduce((a, d) => a + Math.max(0, CAPT_PISO - d), 0);
    if (falta < 0.001) break;
    const folga = duracoes.reduce((a, d) => a + Math.max(0, d - CAPT_PISO), 0);
    if (folga < falta) {
      duracoes = proporcionais; // não cabe: proporcional puro (a janela manda)
      break;
    }
    const fator = (folga - falta) / folga;
    duracoes = duracoes.map((d) => (d > CAPT_PISO ? CAPT_PISO + (d - CAPT_PISO) * fator : CAPT_PISO));
  }
  let t = Math.max(0, Number(avanco) || 0);
  return blocos.map((text, j) => {
    const bloco = { texto: text, inicio: t, fim: t + duracoes[j] };
    t += duracoes[j];
    return bloco;
  });
}

// Legendas de todas as cenas, na linha do tempo do vídeo.
// `textos[i]` é a narração da cena i e `janelas[i]` o tempo que ela ocupa.
export function legendasDasCenas(textos, janelas, inicios) {
  const todas = [];
  (textos || []).forEach((texto, i) => {
    const base = Number(inicios?.[i]) || 0;
    blocosTemporizados(texto, janelas?.[i], 0).forEach((b) => {
      todas.push({ texto: b.texto, inicio: b.inicio + base, fim: b.fim + base });
    });
  });
  return todas;
}

// Bloco visível num dado instante (null entre a fala e o bloco seguinte).
export function blocoAtivo(legendas, t) {
  for (let i = legendas.length - 1; i >= 0; i--) {
    if (t >= legendas[i].inicio) return t < legendas[i].fim ? legendas[i] : null;
  }
  return null;
}

// ---- letra de música ----
// Uma linha por verso. Linhas vazias são ignoradas (é o que sai de copiar e
// colar com espaçamento), e espaços a mais são limpos.
//
// DEFESA contra marcações de estrutura (o que motivou esta função a crescer):
// letra vinda do Suno ou da IA chega com "**[Verso 2]**", "(Refrão)" e afins —
// e uma marcação colada vira legenda no vídeo. Aqui: 1) linha que é SÓ marcação
// sai da letra; 2) negrito/itálico/código são removidos em qualquer linha.
export function versosDaLetra(texto) {
  // Palavras de seção: é o que distingue "(Refrão)" (marcação) de "(ah, ah)"
  // (versos de verdade, que ficam).
  const SECAO = /pre[- ]?chorus|pré[- ]?refrão|pré[- ]?refrao|interlúdio|interlude|instrumental|refrão|refrao|chorus|verse|verso|bridge|ponte|outro|intro|solo|drop/i;
  return String(texto || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim()) // negrito e espaços
    // Linha que é SÓ marcação de seção sai da letra: [Verso 2], (Refrão),
    // [Chorus]… com ou sem negrito/código em volta.
    .filter((l) => !(/^\[[^\]]*\]$/.test(l) || (/^\([^\)]*\)$/.test(l) && SECAO.test(l))))
    .filter(Boolean);
}

// Distribui os versos pelo tempo da música.
//
// COM OS TRECHOS DE VOZ (de `analisarVoz`, em musica.mjs): os versos seguem
// ONDE SE CANTA — o primeiro entra quando a voz entra (depois da intro
// instrumental), a duração de cada verso é proporcional ao seu tamanho, um
// verso nunca atravessa um trecho só de instrumentos (é cortado onde a voz
// para) e os seguintes se repartem pelo canto que resta. Assim o texto aparece
// no momento certo da letra, e não em fatias iguais.
//
// Sem trechos úteis (voz contínua, análise falhada, música sem gaps): divisão
// IGUAL entre os versos, como sempre — previsível, e o utilizador vê o tempo
// de cada verso antes de gravar.
export function legendasDaLetra(versos, duracaoSegundos, { avanco = 0, piso = CAPT_PISO, secoes = null } = {}) {
  const lista = Array.isArray(versos) ? versos.filter(Boolean) : versosDaLetra(versos);
  const total = Math.max(0, Number(duracaoSegundos) || 0);
  if (!lista.length || !total) return [];
  const base = Math.max(0, Number(avanco) || 0);
  const janela = Math.max(0, total - base);
  if (!janela) return [];

  const vocais = secoesUteis(secoes, base, janela);
  if (vocais.length) {
    const pesos = lista.map((t) => String(t).trim().split(/\s+/).filter(Boolean).length || 1);
    const cues = [];
    let k = 0;
    let cursor = vocais[0].inicio;
    for (let i = 0; i < lista.length; i++) {
      // O tempo deste verso é a sua fatia DO CANTO QUE RESTA: a cada corte
      // (voz acabou, a letra espera pelo próximo trecho), os versos seguintes
      // se redistribuem pelo que sobrou — ninguém fica sem tempo e a letra
      // acaba junto com a última voz.
      const restaVocal = vocais
        .slice(k)
        .reduce((a, s) => a + (s.fim - Math.max(s.inicio, cursor)), 0);
      const restaPesos = pesos.slice(i).reduce((a, p) => a + p, 0);
      const dur = restaPesos > 0 ? (restaVocal * pesos[i]) / restaPesos : 0;
      const inicio = Math.min(cursor, base + janela);
      const fim = Math.min(base + total, inicio + dur, vocais[k].fim);
      cues.push({ texto: lista[i], inicio, fim });
      cursor = fim;
      // Chegámos ao fim da voz desta seção: a letra salta o instrumental e
      // espera pelo próximo trecho de canto.
      if (cursor >= vocais[k].fim - 0.05 && k < vocais.length - 1) {
        k++;
        cursor = Math.max(cursor, vocais[k].inicio);
      }
    }
    return cues;
  }

  const cada = janela / lista.length;
  const minimo = Math.min(Math.max(0, Number(piso) || 0), cada);
  return lista.map((texto, i) => ({
    texto,
    inicio: base + i * cada,
    // O piso serve para o `.srt` não mostrar uma legenda a piscar: uma linha
    // muito curta é esticada até ao mínimo, sem passar do fim do vídeo.
    fim: Math.min(base + total, base + (i + 1) * cada + (minimo - cada > 0 ? minimo - cada : 0)),
  }));
}

// Trechos de voz que valem a pena usar. Voz CONTÍNUA (ou quase nada de voz):
// os trechos não dizem nada de útil — a divisão igual de sempre já está alinhada.
function secoesUteis(secoes, base, janela) {
  const fimTudo = base + janela;
  const boas = (Array.isArray(secoes) ? secoes : [])
    .map((s) => ({ inicio: Number(s?.inicio), fim: Number(s?.fim) }))
    .filter((s) => Number.isFinite(s.inicio) && Number.isFinite(s.fim) && s.fim > s.inicio)
    .map((s) => ({
      inicio: Math.max(base, Math.min(s.inicio, fimTudo)),
      fim: Math.max(base, Math.min(s.fim, fimTudo)),
    }))
    .filter((s) => s.fim > s.inicio + 0.2);
  if (!boas.length) return [];
  const cobertura = boas.reduce((a, s) => a + (s.fim - s.inicio), 0) / janela;
  if (cobertura > 0.97 || cobertura < 0.05) return [];
  return boas;
}

// ---- ficheiro .srt ----
const tempoSrt = (seg) => {
  const ms = Math.max(0, Math.round(seg * 1000));
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
  return `${h}:${m}:${s},${String(ms % 1000).padStart(3, '0')}`;
};

// Um bloco por legenda — o mesmo bloco que aparece desenhado no vídeo.
export function legendasParaSrt(legendas) {
  if (!legendas || !legendas.length) return '';
  return (
    legendas
      .map((b, i) => `${i + 1}\n${tempoSrt(b.inicio)} --> ${tempoSrt(Math.max(b.fim, b.inicio + CAPT_PISO))}\n${b.texto}`)
      .join('\n\n') + '\n'
  );
}

// ---- caber no ecrã ----
// Quebra o texto em linhas medindo a largura real; a função de medida entra por
// parâmetro para as contas poderem ser testadas fora do canvas.
export function quebrarLinhas(medir, texto, larguraMax) {
  const palavras = String(texto || '').split(/\s+/).filter(Boolean);
  const linhas = [];
  let linha = '';
  for (const palavra of palavras) {
    const proxima = linha ? `${linha} ${palavra}` : palavra;
    if (linha && medir(proxima) > larguraMax) {
      linhas.push(linha);
      linha = palavra;
    } else {
      linha = proxima;
    }
  }
  if (linha) linhas.push(linha);
  return linhas;
}

// Tamanho de fonte que faz o bloco caber em `maxLinhas`, encolhendo no máximo até
// `escalaMin`. Devolve as linhas prontas e `cabe` a dizer se o alvo foi atingido:
// quando não couber nem no menor tamanho, o desenho mostra TODAS as linhas (nunca
// descarta palavra) — vê-se o bloco inteiro, e não um texto cortado.
export function ajustarTamanho(medirEm, texto, larguraMax, tamanhoBase, maxLinhas = CAPT_LINHAS, escalaMin = CAPT_ESCALA_MIN) {
  const base = Math.max(1, Math.round(Number(tamanhoBase) || 1));
  let escala = 1;
  let tamanho = base;
  let linhas = quebrarLinhas(medirEm(tamanho), texto, larguraMax);
  while (linhas.length > maxLinhas && escala > escalaMin) {
    escala = Math.max(escalaMin, Number((escala - 0.05).toFixed(2)));
    tamanho = Math.max(1, Math.round(base * escala));
    linhas = quebrarLinhas(medirEm(tamanho), texto, larguraMax);
  }
  return { tamanho, linhas, escala: Number((tamanho / base).toFixed(3)), cabe: linhas.length <= maxLinhas };
}
