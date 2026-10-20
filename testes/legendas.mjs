// Testes das legendas: corte em blocos, temporização, .srt e caber no ecrã.
// A lógica é pura (não precisa de canvas), por isso corre-se diretamente.
const BASE = new URL('../public/', import.meta.url).href;
const core = await import(BASE + 'legendas-core.mjs');
await import(new URL('./legendas-manuais.mjs', import.meta.url).href);

const falhas = [];
const ok = (m) => console.log('  ok:', m);
const fail = (m) => { console.error('  FALHOU:', m); falhas.push(m); };
const perto = (a, b, tol = 0.001) => Math.abs(a - b) <= tol;
const check = (c, bom, mau) => (c ? ok(bom) : fail(mau));

const NARRACAO =
  'Era uma vez uma menina chamada Rebeca, que adorava folhas douradas. ' +
  'Um dia encontrou um mapa misterioso debaixo da árvore grande, com três sinais estranhos. ' +
  'Ela seguiu o caminho sem medo, porque tinha um coração corajoso e um amigo ao lado. ' +
  'No fim da aventura descobriu que o tesouro era a própria viagem.';

console.log('\n[1] Cortar a narração em frases');
{
  const frases = core.dividirFrases(NARRACAO);
  check(frases.length === 4, `4 frases na narração de exemplo (${frases.length})`, String(frases.length));
  check(frases[0].startsWith('Era uma vez') && frases[0].endsWith('douradas.'), `1.ª frase: "${frases[0]}"`, frases[0]);
  check(frases[3].endsWith('viagem.'), 'a última frase acaba com o ponto final', frases[3]);
  check(core.dividirFrases('').length === 0 && core.dividirFrases(null).length === 0, 'texto vazio devolve lista vazia', 'não devolveu vazio');
  check(core.dividirFrases('Uma frase sem ponto final').length === 1, 'frase sem pontuação conta como uma', 'contou mal');
}

console.log('\n[2] Blocos curtos, sem perder uma única palavra');
{
  const blocos = core.blocosDaNarracao(NARRACAO);
  check(blocos.length > 4, `a narração dá ${blocos.length} blocos (não é uma parede de texto)`, String(blocos.length));
  const grandes = blocos.filter((b) => b.split(/\s+/).length > core.CAPT_MOSTRAS);
  check(grandes.length === 0, `nenhum bloco passa de ${core.CAPT_MOSTRAS} palavras`, `${grandes.length} passam`);
  const compridos = blocos.filter((b) => b.length > core.CAPT_CHARS + 12);
  check(compridos.length === 0, `nenhum bloco é muito comprido (limite ${core.CAPT_CHARS} caracteres)`, `${compridos.length} compridos: ${compridos.join(' | ')}`);

  // NENHUMA palavra pode desaparecer: juntar os blocos devolve o texto original.
  const junto = (t) => core.blocosDaNarracao(t).join(' ').replace(/\s+/g, ' ').trim();
  const original = (t) => String(t).replace(/\s+/g, ' ').trim();
  check(junto(NARRACAO) === original(NARRACAO), 'juntar os blocos devolve exatamente a narração', `"${junto(NARRACAO).slice(0, 60)}…" ≠ "${original(NARRACAO).slice(0, 60)}…"`);
  const casos = [
    'Olá!',
    'Sim.',
    'Uma palavra',
    'Palavras curtas: é, já, só, má, fé, pó, ré, cá, dó, lá, né, vá, fé, só.',
    'Frase com vírgulas, muitas vírgulas, mesmo muitas, sempre a cortar, sem parar, até ao fim.',
    'Uma frase gigantesca sem qualquer pontuação pelo meio que obriga a cortar apenas pelo número de palavras permitido em cada bloco de legenda',
    'Travessão — e continua — com dois travessões no meio da frase para testar o corte.',
    'Pergunta? Exclamação! Reticências… e continua.',
  ];
  const perdidos = casos.filter((t) => junto(t) !== original(t));
  check(perdidos.length === 0, `nos ${casos.length} casos difíceis, nenhuma palavra se perde`, `falhou em: ${perdidos.join(' | ')}`);
}

console.log('\n[3] Corte na pausa da fala, não no meio da ideia');
{
  const blocos = core.dividirBlocos('Ele correu muito, saltou o muro, gritou bem alto e caiu no chão molhado.');
  const comVirgula = blocos.filter((b) => /,$/.test(b));
  check(comVirgula.length >= 1, `quebra depois de vírgula quando dá (${comVirgula.length} bloco(s))`, `nenhum bloco acaba em vírgula: ${blocos.join(' | ')}`);
  const primeiro = blocos[0];
  check(primeiro.split(/\s+/).length >= 4, `o 1.º bloco não é um fragmento solto ("${primeiro}")`, primeiro);
}

console.log('\n[4] Temporização proporcional, dentro da janela da cena');
{
  const janela = 6;
  const blocos = core.blocosTemporizados(NARRACAO, janela);
  check(blocos.length === core.blocosDaNarracao(NARRACAO).length, 'um bloco temporizado por bloco de texto', `${blocos.length}`);
  check(perto(blocos[0].inicio, 0), `o primeiro começa em 0 (${blocos[0].inicio})`, String(blocos[0].inicio));
  const fim = blocos[blocos.length - 1].fim;
  check(perto(fim, janela, 0.01), `a soma fecha exatamente a janela de ${janela}s (${fim.toFixed(3)})`, String(fim));
  const encadeados = blocos.every((b, i) => i === 0 || perto(b.inicio, blocos[i - 1].fim, 0.001));
  check(encadeados, 'os blocos encaixam sem buracos nem sobreposição', 'há buracos ou sobreposições');
  // Mais palavras = mais tempo no ecrã.
  const tempos = blocos.map((b) => b.fim - b.inicio);
  const pesos = blocos.map((b) => b.texto.split(/\s+/).length);
  const proporcional = tempos.every((t, i) => i === 0 || (pesos[i] > pesos[i - 1]) === (t > tempos[i - 1]));
  check(proporcional, 'quem tem mais palavras fica mais tempo no ecrã', `tempos ${tempos.map((t) => t.toFixed(2)).join(', ')} com pesos ${pesos.join(', ')}`);
  // O piso de 0,8s não pode roubar tempo à janela.
  const curto = core.blocosTemporizados('Uma. Duas palavras. Três palavras curtas aqui. Uma frase bem mais longa para dar folga suficiente aos blocos pequenos.', 5);
  check(perto(curto[curto.length - 1].fim, 5, 0.01), `o piso de ${core.CAPT_PISO}s não estoura a janela (${curto[curto.length - 1].fim.toFixed(3)}s de 5s)`, String(curto[curto.length - 1].fim));
  check(curto.every((b) => b.fim - b.inicio > 0), 'nenhum bloco fica com duração zero ou negativa', 'há durações inválidas');
}

console.log('\n[5] Legendas ao longo da linha do tempo do vídeo');
{
  const textos = ['Primeira cena com uma frase curta.', 'Segunda cena, também curta e simples.'];
  const janelas = [4, 6];
  const inicios = [0, 4];
  const cues = core.legendasDasCenas(textos, janelas, inicios);
  check(cues.length >= 2, `${cues.length} blocos no total`, String(cues.length));
  const primeira = cues.filter((c) => c.inicio < 4);
  check(primeira.every((c) => c.fim <= 4.01), 'nenhum bloco da 1.ª cena invade a 2.ª', `algum passa: ${primeira.map((c) => c.fim.toFixed(2)).join(', ')}`);
  const segunda = cues.filter((c) => c.inicio >= 4);
  check(segunda.length >= 1, 'a 2.ª cena também tem legendas', String(segunda.length));
  check(perto(segunda[segunda.length - 1].fim, 10, 0.01), `o último bloco fecha no fim do vídeo (${segunda[segunda.length - 1].fim.toFixed(2)}s de 10s)`, String(segunda[segunda.length - 1].fim));

  // O bloco ativo em vários instantes.
  const t0 = core.blocoAtivo(cues, 0.1);
  check(t0 && t0.inicio <= 0.1 && t0.fim > 0.1, `há legenda no instante 0,1s ("${t0 && t0.texto}")`, JSON.stringify(t0));
  const antes = core.blocoAtivo(cues, -1);
  check(antes === null, 'antes de o vídeo começar não há legenda', JSON.stringify(antes));
  const depois = core.blocoAtivo(cues, 999);
  check(depois === null, 'depois de acabar não há legenda', JSON.stringify(depois));
  const meio = core.blocoAtivo(cues, 5);
  check(meio !== null, `no meio há legenda ("${meio && meio.texto}")`, JSON.stringify(meio));

  // Nenhum bloco é mais curto do que o piso (a não ser que a janela não dê).
  const curtos = cues.filter((c) => c.fim - c.inicio < core.CAPT_PISO - 0.01);
  check(curtos.length === 0, `nenhum bloco abaixo de ${core.CAPT_PISO}s`, `${curtos.length} abaixo`);
}

console.log('\n[6] Ficheiro .srt com os mesmos blocos do vídeo');
{
  const cues = core.legendasDasCenas(['Uma frase curta para legendar.', 'Outra frase, também curta.'], [3, 3], [0, 3]);
  const srt = core.legendasParaSrt(cues);
  const linhas = srt.trim().split('\n');
  check(linhas[0] === '1', `começa pela legenda 1 ("${linhas[0]}")`, linhas[0]);
  check(/^\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}$/.test(linhas[1]), `formato de tempo correto ("${linhas[1]}")`, linhas[1]);
  check(linhas[2] === cues[0].texto, `o texto é o mesmo bloco do vídeo ("${linhas[2]}")`, linhas[2]);
  // O número de blocos do .srt tem de ser o número de blocos desenhados.
  const numeros = srt.split('\n\n').map((b) => b.split('\n')[0]).filter((x) => /^\d+$/.test(x));
  check(numeros.length === cues.length, `o .srt tem ${cues.length} legendas, as mesmas do vídeo`, `${numeros.length} ≠ ${cues.length}`);
  // O SRT aguenta acentos (é escrito em UTF-8).
  check(srt.includes('também'), 'os acentos ficam intactos no .srt', 'acentos perdidos');
  check(core.legendasParaSrt([]) === '', 'sem blocos, o .srt é vazio', 'devolveu lixo');
  // O .srt preserva o fim exato, inclusive em ajustes manuais curtos.
  const rapido = core.legendasParaSrt([{ texto: 'Oi', inicio: 0, fim: 0.2 }]);
  check(/00:00:00,000 --> 00:00:00,200/.test(rapido), 'uma legenda de 0,2s preserva o fim exato no .srt', rapido.replace(/\n/g, ' | '));
}

console.log('\n[7] Cabe em 2 linhas sem perder palavras');
{
  // Medidor falso: cada letra tem 10 px, independentemente do tamanho.
  const medirEm = (tamanho) => (t) => String(t).length * tamanho * 0.6;
  const curto = core.ajustarTamanho(medirEm, 'Duas palavras', 900, 40);
  check(curto.linhas.length === 1 && curto.cabe, `frase curta fica numa linha ("${curto.linhas[0]}")`, JSON.stringify(curto.linhas));
  check(curto.tamanho === 40, 'frase curta não encolhe a fonte', String(curto.tamanho));

  const medio = core.ajustarTamanho(medirEm, 'Uma frase de tamanho médio para testar a quebra', 900, 40);
  check(medio.linhas.length <= core.CAPT_LINHAS, `frase média cabe em ${medio.linhas.length} linha(s)`, String(medio.linhas.length));
  check(medio.cabe, 'e o alvo foi atingido', 'não caberia');

  // Longo demais para 2 linhas: encolhe, mas NUNCA descarta palavras.
  const texto = 'Uma frase bastante longa que não cabe de maneira nenhuma em duas linhas no tamanho base';
  const longo = core.ajustarTamanho(medirEm, texto, 900, 40);
  check(longo.tamanho < 40, `a fonte encolheu (${longo.tamanho}px de 40px)`, `ficou em ${longo.tamanho}px`);
  check(longo.escala >= core.CAPT_ESCALA_MIN, `não encolhe abaixo de ${core.CAPT_ESCALA_MIN} (${longo.escala})`, String(longo.escala));
  const junto = longo.linhas.join(' ').replace(/\s+/g, ' ').trim();
  check(junto === texto, 'juntar as linhas devolve o texto todo (nenhuma palavra cortada)', `"${junto}" ≠ "${texto}"`);
  check(longo.cabe, `esta frase ainda cabe em ${longo.linhas.length} linha(s)`, `não caberia: ${longo.linhas.length} linhas`);

  // Texto impossível de caber nem no tamanho mínimo: tem de mostrar TUDO na
  // mesma, em vez de cortar palavras (é o comportamento do 2.0, de propósito).
  const impossivel = 'Um texto tão comprido que não cabe de maneira absolutamente nenhuma em duas linhas mesmo com a fonte no tamanho mínimo permitido pelas regras';
  const grande = core.ajustarTamanho(medirEm, impossivel, 300, 40);
  check(grande.escala === core.CAPT_ESCALA_MIN, `a fonte chegou ao mínimo (${grande.escala})`, String(grande.escala));
  check(grande.linhas.length > core.CAPT_LINHAS, `não cabe: mostra ${grande.linhas.length} linhas em vez de cortar`, `${grande.linhas.length} linhas`);
  const tudo = grande.linhas.join(' ').replace(/\s+/g, ' ').trim();
  check(tudo === impossivel, 'e mesmo assim nenhuma palavra é descartada', `faltam palavras: "${tudo.slice(0, 50)}…"`);
  check(grande.cabe === false, 'assinala que o alvo das 2 linhas não foi atingido', `cabe=${grande.cabe}`);
  // Quebra por palavras, nunca a meio de uma palavra.
  const partidas = grande.linhas.filter((l) => l.startsWith(' ') || l.endsWith(' '));
  check(partidas.length === 0, 'nenhuma linha começa ou acaba com espaço', `${partidas.length} com espaço`);
  const palavrasOk = grande.linhas.join(' ').split(' ').every((p) => impossivel.includes(p));
  check(palavrasOk, 'todas as linhas são feitas de palavras inteiras', 'há palavras partidas');
}

console.log('\n[8] Casos estranhos não rebentam');
{
  const maus = [
    ['null', () => core.blocosDaNarracao(null)],
    ['undefined', () => core.blocosDaNarracao(undefined)],
    ['número', () => core.blocosDaNarracao(12345)],
    ['só espaços', () => core.blocosDaNarracao('     \n\n  ')],
    ['emoji', () => core.blocosDaNarracao('Olá 👋 menina 🌟 com um balão 🎈 enorme 🎉')],
    ['pontuação solta', () => core.blocosDaNarracao('... !!! ??? ,,,')],
    ['temporização sem janela', () => core.blocosTemporizados('Uma frase.', 0)],
    ['temporização com lixo', () => core.blocosTemporizados('Uma frase.', 'abc')],
    ['legendas sem cenas', () => core.legendasDasCenas([], [], [])],
    ['srt vazio', () => core.legendasParaSrt(null)],
    ['ajustar sem texto', () => core.ajustarTamanho(() => () => 0, '', 100, 40)],
  ];
  const rebentaram = [];
  for (const [nome, fn] of maus) {
    try {
      const r = fn();
      if (r === undefined) rebentaram.push(`${nome} (devolveu undefined)`);
    } catch (e) {
      rebentaram.push(`${nome}: ${e.message}`);
    }
  }
  check(rebentaram.length === 0, `os ${maus.length} casos estranhos passam sem rebentar`, rebentaram.join(' | '));
  check(core.blocosDaNarracao('     ').length === 0, 'texto só com espaços não gera blocos', 'gerou blocos');
  check(core.blocosTemporizados('Uma frase.', 0).length === 0, 'janela zero não gera legendas', 'gerou legendas');
}

console.log('\n[9] Estilo fixo, igual ao Hub 2.0');
{
  check(core.CAPT_MOSTRAS === 9, `9 palavras por bloco (${core.CAPT_MOSTRAS})`, String(core.CAPT_MOSTRAS));
  check(core.CAPT_CHARS === 42, `42 caracteres por bloco (${core.CAPT_CHARS})`, String(core.CAPT_CHARS));
  check(core.CAPT_LINHAS === 2, `2 linhas no ecrã (${core.CAPT_LINHAS})`, String(core.CAPT_LINHAS));
  check(core.CAPT_PISO === 0.8, `piso de 0,8s (${core.CAPT_PISO})`, String(core.CAPT_PISO));
  check(core.CAPT_COR === '#FBBF24', `amarelo do 2.0 (${core.CAPT_COR})`, core.CAPT_COR);
  check(core.CAPT_CONTORNO === 4, `contorno 4 do 2.0 (${core.CAPT_CONTORNO})`, String(core.CAPT_CONTORNO));
  check(core.CAPT_FONTE.id === 'luckiest_guy', `fonte Luckiest Guy (${core.CAPT_FONTE.id})`, core.CAPT_FONTE.id);
  check(/Luckiest Guy/.test(core.CAPT_FONTE.family), 'a família traz a fonte e alternativas', core.CAPT_FONTE.family);
  check(/cursive|sans-serif/.test(core.CAPT_FONTE.family), 'tem alternativa local se a fonte não carregar', core.CAPT_FONTE.family);
}

console.log('\n[10] Letra da música: versos e distribuição do tempo');
{
  // Versos saem de copiar e colar: espaços a mais e linhas vazias não contam.
  const colado = '  Primeira linha  \n\n   Segunda   linha com   espaços \nTerceira\n\n';
  const versos = core.versosDaLetra(colado);
  check(versos.length === 3, `3 versos de um texto colado com linhas vazias (${versos.length})`, JSON.stringify(versos));
  check(versos[1] === 'Segunda linha com espaços', `os espaços a mais são limpos ("${versos[1]}")`, versos[1]);
  check(core.versosDaLetra('').length === 0 && core.versosDaLetra(null).length === 0, 'letra vazia não dá versos', 'deu versos');

  // Marcações de estrutura vindo do Suno/IA: "**[Verso 2]**" NÃO é verso —
  // nem aparece como legenda, nem desalinha a distribuição do tempo.
  const comMarcas = 'Os passarinhos cantam\n**[Verso 2]**\n[Refrão]\nO sol vai se pôr\n__(Refrão)__\nA noite vem chegando\n**(Chorus)**';
  const limpos = core.versosDaLetra(comMarcas);
  check(limpos.length === 3, `só os 3 versos de verdade ficam (${limpos.length})`, JSON.stringify(limpos));
  check(!limpos.some((v) => /verso|refrão|chorus/i.test(v)), 'nenhuma marcação sobra nos versos', JSON.stringify(limpos));
  check(limpos[0] === 'Os passarinhos cantam', 'o verso normal passa intacto', limpos[0]);
  check(!core.versosDaLetra('**[Verso 2]**\n[Chorus]\n`[Ponte]`').length, 'letra só de marcações não dá versos', 'deu versos');

  // 4 versos numa música de 120s: 30s cada, encaixados sem buracos.
  const cues = core.legendasDaLetra(versos.concat('Quarta'), 120);
  check(cues.length === 4, `4 versos temporizados (${cues.length})`, String(cues.length));
  check(perto(cues[0].inicio, 0), 'o primeiro verso entra no segundo 0', String(cues[0].inicio));
  check(perto(cues[0].fim, 30), `cada verso leva 120/4 = 30s (${cues[0].fim})`, String(cues[0].fim));
  check(perto(cues[3].fim, 120), `o último verso acaba no fim da música (${cues[3].fim})`, String(cues[3].fim));
  const encadeados = cues.every((c, i) => i === 0 || perto(c.inicio, cues[i - 1].fim, 0.001));
  check(encadeados, 'os versos encaixam sem buracos', 'há buracos');
  // O texto de cada verso é o que foi colado, sem alterações.
  check(cues[1].texto === 'Segunda linha com espaços', `o texto do verso passa intacto ("${cues[1].texto}")`, cues[1].texto);

  // A letra sai no .srt e o número de legendas bate com o número de versos.
  const srt = core.legendasParaSrt(cues);
  const numeros = srt.split('\n\n').map((b) => b.split('\n')[0]).filter((x) => /^\d+$/.test(x));
  check(numeros.length === 4, `o .srt tem os 4 versos (${numeros.length})`, String(numeros.length));
  check(srt.includes('Primeira linha'), 'e o texto da letra aparece no .srt', srt.slice(0, 80));

  // Um só verso cobre a música toda.
  const um = core.legendasDaLetra(['Único verso'], 45);
  check(um.length === 1 && perto(um[0].fim, 45), `um verso só cobre os 45s (${um[0].fim})`, String(um[0].fim));

  // Versos muito curtos: o piso não deixa a legenda piscar, nem passa do fim.
  const muitos = core.legendasDaLetra(Array.from({ length: 60 }, (_, i) => `verso ${i}`), 20);
  check(muitos.length === 60, '60 versos em 20s são aceites', String(muitos.length));
  check(perto(muitos[muitos.length - 1].fim, 20, 0.01), `o último continua a acabar nos 20s (${muitos[muitos.length - 1].fim})`, String(muitos[muitos.length - 1].fim));
  const encavalitados = muitos.filter((c, i) => i > 0 && c.inicio < muitos[i - 1].inicio);
  check(encavalitados.length === 0, 'nunca anda para trás', `${encavalitados.length}`);

  // Casos degenerados.
  check(core.legendasDaLetra([], 100).length === 0, 'sem versos não há legendas', 'gerou legendas');
  check(core.legendasDaLetra(['Um'], 0).length === 0, 'sem duração de música não há legendas', 'gerou legendas');
  check(core.legendasDaLetra(null, 100).length === 0, 'letra nula não rebenta', 'rebentou');
  check(core.legendasDaLetra(['Um'], 'abc').length === 0, 'duração inválida não rebenta', 'rebentou');
}

console.log('\n[11] Letra sincronizada com o canto (trechos de voz)');
{
  // Música de 60s com canto em duas seções: 10–25s e 35–55s. A intro (0–10) e
  // o interlúdio (25–35) são só instrumento: nenhum verso deve aparecer ali.
  const secoes = [
    { inicio: 10, fim: 25 },
    { inicio: 35, fim: 55 },
  ];
  const cues = core.legendasDaLetra(
    ['primeiro verso longo aqui', 'segundo verso longo aqui', 'terceiro', 'quarto'],
    60,
    { secoes },
  );
  check(cues.length === 4, `4 versos temporizados (${cues.length})`, String(cues.length));
  check(perto(cues[0].inicio, 10, 0.01), `o 1.º verso entra QUANDO A VOZ ENTRA (${cues[0].inicio}s)`, String(cues[0].inicio));
  check(perto(cues[3].fim, 55, 0.01), `o último acaba junto com o último canto (${cues[3].fim}s)`, String(cues[3].fim));
  // Verso maior, mais tempo (proporcional às palavras do canto que resta).
  check(cues[0].fim - cues[0].inicio > cues[2].fim - cues[2].inicio, 'o verso maior fica mais tempo no ecrã', `${cues[0].fim - cues[0].inicio} ≤ ${cues[2].fim - cues[2].inicio}`);
  // Nenhum verso COMEÇA dentro de um trecho instrumental.
  const dentro = cues.every((c) => secoes.some((s) => c.inicio >= s.inicio - 0.01 && c.inicio < s.fim));
  check(dentro, 'cada verso começa dentro de um trecho de canto', JSON.stringify(cues.map((c) => [c.inicio.toFixed(1), c.fim.toFixed(1)])));
  // Nenhum verso anda para trás.
  const paraTras = cues.filter((c, i) => i > 0 && c.inicio < cues[i - 1].inicio);
  check(paraTras.length === 0, 'a ordem dos versos nunca recua', String(paraTras.length));
  // Verso cortado onde a voz para: um verso que atravesse o interlúdio é
  // cortado no fim da seção de canto.
  const atravessador = core.legendasDaLetra(['a', 'b', 'c'], 60, { secoes });
  check(perto(atravessador[1].fim, 25, 0.01), `o verso é cortado onde a voz para (${atravessador[1].fim}s)`, String(atravessador[1].fim));

  // Voz contínua (cobertura ~total): os trechos não dizem nada — divisão igual.
  const continua = core.legendasDaLetra(['a', 'b'], 60, { secoes: [{ inicio: 0, fim: 59 }] });
  check(perto(continua[0].inicio, 0) && perto(continua[0].fim, 30), 'canto contínuo: divisão igual de sempre', `${continua[0].inicio}–${continua[0].fim}`);
  // Sem trechos (análise falhou ou não correu): comportamento de sempre.
  const antigo = core.legendasDaLetra(['a', 'b'], 60);
  check(perto(antigo[0].inicio, 0) && perto(antigo[0].fim, 30), 'sem trechos: comportamento de sempre', `${antigo[0].inicio}–${antigo[0].fim}`);
  // Trechos malformados não rebentam.
  check(core.legendasDaLetra(['a'], 60, { secoes: [null, {}, { inicio: 5 }] }).length === 1, 'trechos inválidos são ignorados', 'rebentou');
}

console.log('\n[12] Detetor de voz: onde a música tem canto');
{
  const modMusica = await import(BASE + 'musica.mjs');
  // Música falsa de 10s: 0–2s silêncio, 2–5s "canto", 5–8s silêncio, 8–10s "canto".
  const taxa = 44100;
  const data = new Float32Array(taxa * 10);
  const voz = (de, ate) => {
    for (let i = taxa * de; i < taxa * ate; i++) data[i] = 0.5 * Math.sin(i / 20);
  };
  voz(2, 5);
  voz(8, 10);
  const musicaFalsa = {
    numberOfChannels: 1,
    sampleRate: taxa,
    length: data.length,
    duration: 10,
    getChannelData: () => data,
  };
  globalThis.AudioContext = class {
    decodeAudioData() { return Promise.resolve(musicaFalsa); }
    close() { return Promise.resolve(); }
  };
  const ficheiro = { arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) };
  const analise = await modMusica.analisarVoz(ficheiro);
  check(Boolean(analise), 'a análise devolve um resultado', 'devolveu nada');
  check(perto(analise?.duracao, 10, 0.01), `a duração analisada é a da faixa (${analise?.duracao})`, String(analise?.duracao));
  check(perto(analise?.vozInicio, 2, 0.2), `a voz entra aos ${analise?.vozInicio}s (intro instrumental saltada)`, String(analise?.vozInicio));
  check(analise?.secoes?.length === 2, `2 trechos de canto (${analise?.secoes?.length})`, JSON.stringify(analise?.secoes));
  const [a, b] = analise.secoes;
  check(perto(a.inicio, 2, 0.2) && perto(a.fim, 5, 0.2), `1.º trecho ≈ 2–5s (${a.inicio.toFixed(1)}–${a.fim.toFixed(1)})`, `${a.inicio}–${a.fim}`);
  check(perto(b.inicio, 8, 0.2) && perto(b.fim, 10, 0.2), `2.º trecho ≈ 8–10s (${b.inicio.toFixed(1)}–${b.fim.toFixed(1)})`, `${b.inicio}–${b.fim}`);
  // Canto contínuo do princípio ao fim: trechos vazios (nada a corrigir).
  const cheia = new Float32Array(taxa * 10);
  for (let i = 0; i < cheia.length; i++) cheia[i] = 0.4 * Math.sin(i / 20);
  globalThis.AudioContext = class {
    decodeAudioData() { return Promise.resolve({ ...musicaFalsa, getChannelData: () => cheia }); }
    close() { return Promise.resolve(); }
  };
  const seguido = await modMusica.analisarVoz(ficheiro);
  check(seguido?.secoes?.length === 0, `canto contínuo devolve trechos vazios (${seguido?.secoes?.length})`, JSON.stringify(seguido?.secoes));
  // Falha sem rebentar: ficheiro ilegível.
  const falha = await modMusica.analisarVoz({ arrayBuffer: () => Promise.reject(new Error('x')) });
  check(falha === null, 'ficheiro ilegível devolve null', 'rebentou');
  delete globalThis.AudioContext;
}

console.log('\n[13] Re-temporização do rascunho ao canto real');
{
  // Rascunho dividido igual (a análise da página não correu): 2 versos em 60s.
  const secoes = [{ inicio: 10, fim: 30 }, { inicio: 40, fim: 55 }];
  const rascunho = [{ texto: 'a', inicio: 0, fim: 30 }, { texto: 'b', inicio: 30, fim: 60 }];
  const novas = core.ressincronizarPelaVoz(rascunho, secoes);
  check(Boolean(novas), 'devolve os tempos corrigidos', 'devolveu nada');
  check(perto(novas[0].inicio, 10, 0.01), `o 1.º verso entra quando a voz entra (${novas[0].inicio}s)`, String(novas[0].inicio));
  check(perto(novas[0].fim, 30, 0.01), `o 1.º acaba onde a voz para (${novas[0].fim}s)`, String(novas[0].fim));
  check(perto(novas[1].inicio, 40, 0.01), `o 2.º salta o instrumental e segue o canto (${novas[1].inicio}s)`, String(novas[1].inicio));
  check(perto(novas.at(-1).fim, 55, 0.01), `o último acaba junto com o canto (${novas.at(-1).fim}s)`, String(novas.at(-1).fim));
  const dentro = novas.every((c) => secoes.some((s) => c.inicio >= s.inicio - 0.01 && c.inicio < s.fim));
  check(dentro, 'nenhum verso começa no instrumental', JSON.stringify(novas.map((c) => [c.inicio, c.fim])));
  check(novas.every((c, i) => i === 0 || c.inicio >= novas[i - 1].inicio - 0.01), 'a ordem dos versos nunca recua', JSON.stringify(novas));
  check(core.ressincronizarPelaVoz(rascunho, []) === null, 'sem trechos devolve null (fica como estava)', 'devolveu lista');
  check(core.ressincronizarPelaVoz([], secoes) === null, 'sem cues devolve null', 'devolveu lista');
}

console.log(falhas.length ? `\n=== ${falhas.length} FALHA(S) ===` : '\n=== LEGENDAS OK ===');
process.exit(falhas.length ? 1 : 0);