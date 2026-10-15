// Sonda: o módulo de medição devolve a duração com um <audio> que se comporta
// como um browser a sério (só sabe a duração depois de ter o src, e de forma
// assíncrona). Cada caso imita um browser diferente.
const BASE = new URL('../public/', import.meta.url).href;
const mod = await import(BASE + 'audio-info.mjs');

const falhas = [];
const ok = (m) => console.log('  ok:', m);
const fail = (m) => { console.error('  FALHOU:', m); falhas.push(m); };
const check = (c, bom, mau) => (c ? ok(bom) : fail(mau));

// (a) browser que dispara `loadedmetadata`
function AudioA() {
  this.duration = NaN;
  const self = this;
  Object.defineProperty(this, 'src', {
    set() { setTimeout(() => { self.duration = 42; self.onloadedmetadata?.(); }, 5); },
  });
  this.load = () => {};
  this.removeAttribute = () => {};
}
// (b) browser que ignora `preload="metadata"` e só dá a duração em `canplay`
function AudioB() {
  this.duration = NaN;
  const self = this;
  Object.defineProperty(this, 'src', {
    set() { setTimeout(() => { self.duration = 120; self.oncanplay?.(); }, 5); },
  });
  this.load = () => {};
  this.removeAttribute = () => {};
}
// (c) browser que NÃO dispara evento nenhum e só responde se lhe perguntarem
function AudioC() {
  this.duration = NaN;
  const self = this;
  Object.defineProperty(this, 'src', {
    set() { setTimeout(() => { self.duration = 200; }, 5); },
  });
  this.load = () => {};
  this.removeAttribute = () => {};
}
// (d) browser que nunca sabe a duração
function AudioD() {
  this.duration = NaN;
  Object.defineProperty(this, 'src', { set() {} });
  this.load = () => {};
  this.removeAttribute = () => {};
}
// (e) ficheiro com erro
function AudioE() {
  this.duration = NaN;
  const self = this;
  Object.defineProperty(this, 'src', {
    set() { setTimeout(() => self.onerror?.(new Error('nope')), 5); },
  });
  this.load = () => {};
  this.removeAttribute = () => {};
}
// (f) browser em que `duration` é Infinity (stream)
function AudioF() {
  this.duration = Infinity;
  const self = this;
  Object.defineProperty(this, 'src', {
    set() { setTimeout(() => self.oncanplay?.(), 5); },
  });
  this.load = () => {};
  this.removeAttribute = () => {};
}

console.log('\n[1] Medir a duração em browsers de comportamentos diferentes');
{
  const casos = [
    ['dispara loadedmetadata', AudioA, 42],
    ['só dá a duração em canplay', AudioB, 120],
    ['não dispara evento nenhum', AudioC, 200],
    ['nunca sabe a duração', AudioD, 0],
    ['ficheiro com erro', AudioE, 0],
    ['duração Infinity (stream)', AudioF, 0],
  ];
  for (const [nome, Cls, esperado] of casos) {
    const t0 = Date.now();
    const d = await mod.medirDuracaoAudio('blob:x', { Audio: Cls, prazoMs: 2000 });
    const ms = Date.now() - t0;
    check(d === esperado, `${nome}: devolveu ${d} (esperado ${esperado}) em ${ms}ms`, `${nome}: ${d} ≠ ${esperado}`);
  }
}

console.log('\n[2] Casos degenerados');
{
  check((await mod.medirDuracaoAudio('', { Audio: AudioA })) === 0, 'sem url devolve 0', 'não devolveu 0');
  check((await mod.medirDuracaoAudio('blob:x', { Audio: null })) === 0, 'sem Audio devolve 0', 'não devolveu 0');
  const explode = function () { throw new Error('sem audio'); };
  check((await mod.medirDuracaoAudio('blob:x', { Audio: explode, prazoMs: 500 })) === 0, 'Audio que rebenta devolve 0', 'não devolveu 0');
  // O prazo tem de ser respeitado: nunca ficar preso.
  const t0 = Date.now();
  const lento = function () { this.duration = NaN; Object.defineProperty(this, 'src', { set() {} }); this.load = () => {}; this.removeAttribute = () => {}; };
  const d = await mod.medirDuracaoAudio('blob:x', { Audio: lento, prazoMs: 400 });
  check(d === 0 && Date.now() - t0 < 1500, `desiste em ${Date.now() - t0}ms em vez de ficar preso`, `${Date.now() - t0}ms`);
}

console.log(falhas.length ? `\n=== ${falhas.length} FALHA(S) ===` : '\n=== MEDIÇÃO DA MÚSICA OK ===');
process.exit(falhas.length ? 1 : 0);