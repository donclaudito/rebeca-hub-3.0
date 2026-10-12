// ============================================================
//  Leitura de duração de um ficheiro de áudio
//
//  PORQUE ISTO EXISTE: o ciclo "até acabar a música" precisa de saber quanto
//  dura a trilha. Se a duração vier 0, o vídeo fica com o tempo das imagens e a
//  música é cortada a meio — que foi exatamente o defeito relatado. A causa é
//  que o `<audio>` NÃO dispara sempre o mesmo evento para dar a duração:
//
//    • uns browsers disparam `loadedmetadata`;
//    • outros só dão a duração em `durationchange` ou `canplay`;
//    • noutros o `preload="metadata"` é ignorado e é preciso chamar `load()`.
//
//  O Rebeca Hub 2.0 já tinha apanhado isto: o `loadAudio` dele esperava por
//  `canplay`. Aqui ouvem-se VÁRIOS eventos e ainda se pergunta em intervalos,
//  porque uma duração de 0 silenciosa é o pior desfecho possível.
//
//  Devolve sempre um número: 0 significa "não consegui saber".
// ============================================================

const EVENTOS = ['loadedmetadata', 'durationchange', 'canplay', 'canplaythrough', 'loadeddata'];

// Prazo total para conseguir a duração. Ficheiros grandes em disco lento podem
// demorar; passado isto, é melhor seguir sem a duração do que ficar parado.
const PRAZO_MS = 12000;
const INTERVALO_MS = 250;

export function medirDuracaoAudio(url, { Audio: AudioCls = globalThis.Audio, prazoMs = PRAZO_MS } = {}) {
  return new Promise((resolve) => {
    if (!AudioCls || !url) {
      resolve(0);
      return;
    }

    let pronto = false;
    let a = null;
    let relogio = null;
    let alarme = null;

    const terminar = (valor) => {
      if (pronto) return;
      pronto = true;
      if (relogio) clearInterval(relogio);
      if (alarme) clearTimeout(alarme);
      try {
        if (a) {
          a.onloadedmetadata = null;
          a.ondurationchange = null;
          a.oncanplay = null;
          a.oncanplaythrough = null;
          a.onloadeddata = null;
          a.onerror = null;
          a.removeAttribute('src');
        }
      } catch {
        /* segue */
      }
      resolve(Number.isFinite(valor) && valor > 0 ? valor : 0);
    };

    // Só aceita durações que sirvam para alguma coisa: `Infinity` aparece em
    // streams, e 0 é "ainda não sei".
    const tentar = () => {
      const d = a && a.duration;
      if (Number.isFinite(d) && d > 0) terminar(d);
    };

    try {
      a = new AudioCls();
      a.preload = 'auto'; // "metadata" é ignorado por alguns browsers
      EVENTOS.forEach((ev) => {
        a.addEventListener ? a.addEventListener(ev, tentar) : null;
      });
      a.onloadedmetadata = tentar;
      a.ondurationchange = tentar;
      a.oncanplay = tentar;
      a.oncanplaythrough = tentar;
      a.onloadeddata = tentar;
      a.onerror = () => terminar(0);
      a.src = url;

      // Alguns browsers só carregam quando se pede explicitamente.
      try {
        a.load();
      } catch {
        /* segue */
      }

      // Pergunta em intervalos: apanha o caso em que nenhum evento chega.
      relogio = setInterval(tentar, INTERVALO_MS);
      alarme = setTimeout(() => terminar(0), prazoMs);
    } catch {
      terminar(0);
    }
  });
}
