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
| `video.mjs` | A montagem do vídeo: transições sem saltos, tempo de cada cena, entrada do áudio, botão Parar, e a trilha em ciclo a 16%. |
| `interface.mjs` | A página: controlos que aparecem e desaparecem, guardar escolhas, avisos quando falta narração ou áudio, e o painel da trilha. |
| `ligacoes.mjs` | Todos os `id` que o `app.js` procura existem no `index.html`, e os `<div>` estão equilibrados. |

## Notas

- Os caminhos dos ficheiros são absolutos (`E:\youtube rebeca2\...`). Se mudar a
  pasta do projeto, atualize a constante `BASE` no topo de `video.mjs` e
  `interface.mjs`.
- Cada teste termina com `=== ... OK ===` e devolve código 0. Uma falha imprime
  `FALHOU:` e devolve 1.
- O relógio é controlado: os testes não esperam tempo real, acabam em segundos
  mesmo testando vídeos de dez segundos.
- `interface.mjs` importa o `video.mjs` por URL `file:///` porque o código corre
  dentro de uma `Function`, onde um `import('./video.mjs')` relativo não tem
  referência de origem.
