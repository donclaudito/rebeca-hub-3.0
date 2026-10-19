import assert from 'node:assert/strict';
import { chaveDaLetra, cuesDaLetra, temposManuais, erroNosTempos, lerTempo, formatarTempo } from '../public/legendas-tempos.mjs';
import { blocoAtivo, legendasDaLetra, legendasParaSrt, ressincronizarPelaVoz, versosDaLetra } from '../public/legendas-core.mjs';
import { versosAlinhados } from '../base44/shared/alinhamentoLetra.ts';

const state = { letra: 'Primeiro verso\nSegundo verso', musicaSegundos: 111,
  musicaFicheiro: { name: 'musica.wav', size: 100, lastModified: 123 },
  musicaVoz: { secoes: [{ inicio: 32, fim: 100 }] } };
const rascunho = cuesDaLetra(state);
assert.equal(rascunho[0].inicio, 32, 'o rascunho entra junto com a voz (32s), nunca durante a pausa instrumental');
assert.ok(rascunho.every((c) => c.inicio >= 32 - 0.01 && c.fim <= 100 + 0.01), 'nenhum verso aparece fora dos trechos de canto');
const cues = [{ texto: 'Primeiro verso', inicio: 32.5, fim: 32.7 }, { texto: 'Segundo verso', inicio: 35, fim: 38 }];
state.legendasLetra = { chave: chaveDaLetra(state), cues };
assert.deepEqual(cuesDaLetra(state), cues);
state.musicaVoz = { secoes: [{ inicio: 40, fim: 110 }] };
assert.deepEqual(cuesDaLetra(state), cues, 'uma análise tardia não altera tempos manuais');
assert.equal(blocoAtivo(cuesDaLetra(state), 32), null);
assert.equal(blocoAtivo(cuesDaLetra(state), 32.6).texto, 'Primeiro verso');
assert.equal(blocoAtivo(cuesDaLetra(state), 33), null);
assert.equal(blocoAtivo(cuesDaLetra(state), 36).texto, 'Segundo verso');
assert.match(legendasParaSrt(cues), /00:00:32,500 --> 00:00:32,700/);
assert.equal(erroNosTempos(cues, 111), '');
assert.match(erroNosTempos([{inicio: 1, fim: 1}]), /maior/);
assert.match(erroNosTempos([{inicio: -1, fim: 1}]), /negativo/);
assert.match(erroNosTempos([{inicio: NaN, fim: 1}]), /válidos/);
assert.match(erroNosTempos([{inicio: 0, fim: 112}], 111), /ultrapassa/);
assert.match(erroNosTempos([{inicio: 0, fim: 2}, {inicio: 1, fim: 3}]), /sobrepõe/);
assert.equal(lerTempo('00:32.500'), 32.5);
assert.equal(lerTempo('32,5'), 32.5);
assert.equal(formatarTempo(32.5), '00:32.500');
assert.ok(Number.isNaN(lerTempo('')));
assert.ok(Number.isNaN(lerTempo('00:72.500')));
assert.ok(Number.isNaN(lerTempo('-1')));
// REGRESSÃO: o corte entre dois versos pode cair dentro da MESMA palavra
// (o reconhecimento devolve "quatr" + "o" para a letra "quat" / "ro").
// Antes, o verso de trás herdava o fim da palavra inteira e o seguinte
// começava antes disso — "Legenda 5: o início sobrepõe a legenda anterior".
const palavras = [
  ['linha', 0, 1], ['um', 1, 2], ['linha', 2, 3], ['dois', 3, 4], ['linha', 4, 5],
  ['tres', 5, 6], ['linha', 6, 7], ['quatr', 7, 8.5], ['o', 8.5, 9],
  ['linha', 9, 10], ['cinco', 10, 11],
].map(([text, start, end]) => ({ text, start, end }));
const alinhados = versosAlinhados('linha um\nlinha dois\nlinha tres\nlinha quat\nro\nlinha cinco', palavras, 11);
assert.equal(alinhados.length, 6, 'os 6 versos saem do alinhamento');
assert.ok(alinhados[4].inicio >= alinhados[3].fim - 0.001, `o verso 5 começa depois do 4 (${alinhados[3].fim} → ${alinhados[4].inicio})`);
assert.equal(erroNosTempos(alinhados, 11), '', 'tempos alinhados passam na validação');

// REGRESSÃO: 5 versos com trechos de canto descontínuos — rascunho e
// re-temporização nunca deixam um verso começar antes do fim do anterior.
const cinco = ['um', 'dois', 'tres', 'quatro', 'cinco'].map((w) => `verso ${w}`);
const trechos = [{ inicio: 10, fim: 30 }, { inicio: 40, fim: 55 }];
for (const [rotulo, cues2] of [
  ['rascunho', legendasDaLetra(cinco, 90, { secoes: trechos })],
  ['re-temporização', ressincronizarPelaVoz(legendasDaLetra(cinco, 90, { secoes: null }), trechos)],
]) {
  assert.equal(erroNosTempos(cues2, 90), '', `${rotulo}: tempos válidos`);
  for (let i = 1; i < cues2.length; i++) {
    assert.ok(cues2[i].inicio >= cues2[i - 1].fim - 0.001, `${rotulo}: verso ${i + 1} não sobrepõe o anterior`);
  }
}
assert.equal(versosDaLetra('[Verso 2]\num\ndois').length, 2, 'marcações de seção continuam fora da letra');

state.letra = 'Outra letra';
assert.equal(temposManuais(state), null, 'trocar a letra invalida tempos antigos');
state.letra = 'Primeiro verso\nSegundo verso';
state.musicaFicheiro = { name: 'outra.wav', size: 100, lastModified: 123 };
assert.equal(temposManuais(state), null, 'trocar a música invalida tempos antigos');
console.log('Tempos manuais, intro, pausas, validação, SRT exato e invalidação: OK');