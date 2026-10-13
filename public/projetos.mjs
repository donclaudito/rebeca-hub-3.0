// ============================================================
//  Projetos guardados — histórico com imagens, texto e áudio
//
//  PORQUE INDEXEDDB E NÃO O `localStorage`: um projeto tem as imagens E o áudio
//  de cada cena. O `localStorage` guarda 5 a 10 MB em texto e bloquearia a
//  página — serve para as preferências (ver `rh3nuvem`) e não para isto. O
//  IndexedDB guarda Blobs a sério, com centenas de MB, e não bloqueia.
//
//  O QUE FICA GUARDADO: as imagens (as versões reduzidas, que são as que a app
//  usa para narrar), o texto de cada cena, o áudio já gerado (quando existe) e as
//  preferências escolhidas. Ficam no SEU computador — não vão para servidor
//  nenhum.
//
//  O que NÃO fica guardado: o ficheiro de música da trilha e o vídeo final. São
//  grandes e a música volta a escolher-se em dois cliques.
// ============================================================

const BASE_DADOS = 'rebeca-hub-3-projetos';
const VERSAO = 1;
const LOJA = 'projetos';

function abrir() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Este browser não deixa guardar projetos (sem IndexedDB).'));
      return;
    }
    const pedido = indexedDB.open(BASE_DADOS, VERSAO);
    pedido.onupgradeneeded = () => {
      const db = pedido.result;
      if (!db.objectStoreNames.contains(LOJA)) {
        const loja = db.createObjectStore(LOJA, { keyPath: 'id' });
        loja.createIndex('guardadoEm', 'guardadoEm');
      }
    };
    pedido.onsuccess = () => resolve(pedido.result);
    pedido.onerror = () => reject(new Error('Não consegui abrir o arquivo de projetos.'));
    pedido.onblocked = () => reject(new Error('O arquivo de projetos está bloqueado noutra janela.'));
  });
}

function transacao(db, modo, acao) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(LOJA, modo);
    const loja = t.objectStore(LOJA);
    let resultado;
    try {
      resultado = acao(loja);
    } catch (e) {
      reject(e);
      return;
    }
    t.oncomplete = () => {
      // Um `get` que não encontra nada tem `result === undefined`. Sem esta
      // distinção, "não existe" chegava ao app como um objeto vazio — e o app
      // pensava que tinha aberto um projeto que já não existe.
      const r = resultado && typeof resultado === 'object' && 'result' in resultado ? resultado.result : resultado;
      resolve(r === undefined ? null : r);
    };
    t.onerror = () => reject(t.error || new Error('a operação no arquivo falhou'));
    t.onabort = () => reject(t.error || new Error('a operação no arquivo foi cancelada'));
  });
}

// Guarda (ou substitui) um projeto. `dados` já vem pronto do app.js.
export async function guardarProjeto(dados) {
  const db = await abrir();
  try {
    const registo = { ...dados, guardadoEm: Date.now() };
    await transacao(db, 'readwrite', (loja) => loja.put(registo));
    return registo;
  } finally {
    db.close();
  }
}

// Lista os projetos, do mais recente para o mais antigo, SEM as imagens nem o
// áudio: só os dados leves, para a lista abrir depressa.
export async function listarProjetos() {
  const db = await abrir();
  try {
    const todos = await transacao(db, 'readonly', (loja) => loja.getAll());
    return (todos || [])
      .map((p) => ({
        id: p.id,
        nome: p.nome,
        guardadoEm: p.guardadoEm,
        criadoEm: p.criadoEm,
        imagens: (p.cenas || []).length,
        comTexto: (p.cenas || []).filter((c) => (c.texto || '').trim()).length,
        comAudio: (p.cenas || []).filter((c) => c.audio).length,
        miniatura: (p.cenas || []).find((c) => c.imagem)?.imagem || null,
        bytes: tamanhoDe(p),
      }))
      .sort((a, b) => (b.guardadoEm || 0) - (a.guardadoEm || 0));
  } finally {
    db.close();
  }
}

export async function lerProjeto(id) {
  const db = await abrir();
  try {
    return (await transacao(db, 'readonly', (loja) => loja.get(id))) || null;
  } finally {
    db.close();
  }
}

export async function apagarProjeto(id) {
  const db = await abrir();
  try {
    await transacao(db, 'readwrite', (loja) => loja.delete(id));
    return true;
  } finally {
    db.close();
  }
}

export async function apagarTudo() {
  const db = await abrir();
  try {
    await transacao(db, 'readwrite', (loja) => loja.clear());
    return true;
  } finally {
    db.close();
  }
}

// Tamanho aproximado de um projeto, para o utilizador saber o que está a ocupar.
export function tamanhoDe(projeto) {
  let bytes = 0;
  for (const c of projeto?.cenas || []) {
    if (c.imagem && typeof c.imagem.size === 'number') bytes += c.imagem.size;
    else if (typeof c.imagem === 'string') bytes += c.imagem.length * 0.75;
    if (c.audio && typeof c.audio.size === 'number') bytes += c.audio.size;
  }
  return bytes;
}

// "1,2 MB" — para mostrar na lista.
export function tamanhoLegivel(bytes) {
  const b = Math.max(0, Number(bytes) || 0);
  if (b < 1024) return `${Math.round(b)} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(0)} kB`;
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`;
  return `${(b / 1073741824).toFixed(2)} GB`;
}

// "há 3 minutos", "ontem", "12/10/2026" — quando foi guardado.
export function quandoFoi(ms, agora = Date.now()) {
  const t = Number(ms) || 0;
  if (!t) return '—';
  const seg = Math.max(0, Math.round((agora - t) / 1000));
  if (seg < 60) return 'agora mesmo';
  if (seg < 3600) return `há ${Math.floor(seg / 60)} min`;
  if (seg < 86400) return `há ${Math.floor(seg / 3600)} h`;
  if (seg < 172800) return 'ontem';
  if (seg < 604800) return `há ${Math.floor(seg / 86400)} dias`;
  const d = new Date(t);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
