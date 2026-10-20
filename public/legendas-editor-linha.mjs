import { formatarTempo } from './legendas-tempos.mjs';

export default function criarLinhaLegenda(cue, i) {
  const li = document.createElement('li');
  li.className = 'legenda-linha';
  const texto = document.createElement('p');
  texto.className = 'legenda-texto';
  texto.textContent = `${i + 1}. ${cue.texto}`;
  li.append(texto);
  for (const [campo, titulo] of [['inicio', 'Início'], ['fim', 'Fim']]) {
    const label = document.createElement('label');
    label.className = 'field';
    const span = document.createElement('span');
    span.textContent = titulo;
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.value = formatarTempo(cue[campo]);
    input.dataset.campo = campo;
    input.setAttribute('aria-label', `${titulo} da legenda ${i + 1}`);
    input.autocomplete = 'off';
    input.spellcheck = false;
    label.append(span, input);
    li.append(label);
  }
  return li;
}
