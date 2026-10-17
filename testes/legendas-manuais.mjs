import assert from 'node:assert/strict';
import { chaveDaLetra, cuesDaLetra, temposManuais, erroNosTempos, lerTempo, formatarTempo } from '../public/legendas-tempos.mjs';
import { blocoAtivo, legendasParaSrt } from '../public/legendas-core.mjs';

const state = { letra: 'Primeiro verso\nSegundo verso', musicaSegundos: 111,
  musicaFicheiro: { name: 'musica.wav', size: 100, lastModified: 123 },
  musicaVoz: { secoes: [{ inicio: 32, fim: 100 }] } };
assert.equal(cuesDaLetra(state)[0].inicio, 32);
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
state.letra = 'Outra letra';
assert.equal(temposManuais(state), null, 'trocar a letra invalida tempos antigos');
state.letra = 'Primeiro verso\nSegundo verso';
state.musicaFicheiro = { name: 'outra.wav', size: 100, lastModified: 123 };
assert.equal(temposManuais(state), null, 'trocar a música invalida tempos antigos');
console.log('Tempos manuais, intro, pausas, validação, SRT exato e invalidação: OK');