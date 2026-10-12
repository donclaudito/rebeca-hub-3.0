# Testes da Rebeca Hub 3.0 (nuvem)

Estes testes correm **sem browser nenhum**: carregam o código real da pasta `public/`
e põem-lhe à volta um browser falso (canvas, MediaRecorder, AudioContext, DOM e um
relógio controlado). Servem para apanhar defeitos antes de publicar, porque a
alternativa é descobri-los a olhar para um vídeo de dois minutos.

```bash
cd rebeca-hub-3.0-base44
npm test
```

## O que cada um verifica

| Ficheiro | O que cobre |
|---|---|
| `legendas.mjs` | O corte da narração em blocos, a temporização, o `.srt` e o caber em 2 linhas sem perder palavras. |
| `video.mjs` | A montagem do vídeo: transições sem saltos, tempo de cada cena, entrada do áudio, botão Parar, a trilha em ciclo a 16 %, as legendas desenhadas e a repetição das imagens até a música acabar. |
| `audio-duracao.mjs` | A leitura da duração da música nos vários comportamentos de browser (só `loadedmetadata`, só `canplay`, nenhum evento, erro, `Infinity`) e o prazo de desistência. |
| `fluxo.mjs` | O caminho completo: carrega o `app.js` verdadeiro, importa imagens, escolhe música, marca o ciclo e confirma o que chega ao motor. |
| `interface.mjs` | A página: controlos que aparecem e desaparecem, guardar escolhas, avisos quando falta narração ou áudio, e os painéis da trilha, das legendas e da duração. |
| `ligacoes.mjs` | Todos os `id` que o `app.js` procura existem no `index.html`, e os `<div>` estão equilibrados. |

## Notas

- Os caminhos dos ficheiros são absolutos (`E:\youtube rebeca2\...`). Se mudar a
  pasta do projeto, atualize as constantes `BASE` e os `file:///` no topo de
  `video.mjs`, `interface.mjs` e `fluxo.mjs`.
- Cada teste termina com `=== ... OK ===` e devolve código 0. Uma falha imprime
  `FALHOU:` e devolve 1.
- O relógio é controlado: os testes não esperam tempo real, acabam em segundos
  mesmo testando vídeos de dez segundos.
- `interface.mjs` e `fluxo.mjs` importam os módulos por URL `file:///` porque o
  código corre dentro de uma `Function`, onde um `import('./x.mjs')` relativo não
  tem referência de origem.
- `instalarAmbiente(duracoes, { musicaSegundos })` separa a duração da narração da
  duração da trilha. Misturá-las fazia o ciclo parecer avariado quando estava bom.
