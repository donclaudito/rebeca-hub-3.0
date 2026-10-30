// ============================================================
//  Rebeca Hub 3.0 — projetos guardados NA NUVEM (na app)
//
//  O histórico local (projetos.mjs) vive no IndexedDB do browser: um projeto
//  aberto noutro computador não estava lá. Este módulo guarda o projeto NA
//  APP: as imagens e o áudio de cada cena vão para o armazenamento privado
//  (UploadPrivateFile) e os dados ficam na entidade Projeto. É isto que o
//  botão "✏️ Reeditar projeto" do Painel usa quando o projeto não está
//  neste computador.
// ============================================================

const cliente = async () => {
  const { base44 } = await import('@/base44Client.js');
  return base44;
};

// Os ficheiros de cada cena (imagem + áudio) são privados: cada download precisa
// de um URL assinado. Um projeto de 15 cenas seriam 30 pedidos seguidos — e a
// Base44 responde 429 a isso. Passa tudo pela fila partilhada, que guarda os
// URLs em cache, faz um pedido de cada vez e recua no 429.
let modUrls = null;
const lerUrls = async () => {
  if (!modUrls) modUrls = await import('./urls-assinados.mjs');
  return modUrls;
};

const assinar = async (b, uri) =>
  (await lerUrls()).assinar(uri, 600, {
    pedir: async (endereco, expira) => {
      const r = await b.integrations.Core.CreateFileSignedUrl({ file_uri: endereco, expires_in: expira });
      return (r && r.signed_url) || '';
    },
  });

// Guarda (ou atualiza, quando há id) um projeto na nuvem. Devolve o id.
export async function guardarProjetoNuvem(dados, idNuvem) {
  const b = await cliente();
  const cenas = [];
  for (const cena of dados.cenas || []) {
    let imagem_uri = '';
    let audio_uri = '';
    if (cena.imagem) {
      const r = await b.integrations.Core.UploadPrivateFile({
        file: new File([cena.imagem], cena.nome || 'imagem', { type: cena.imagem.type || 'image/png' }),
      });
      imagem_uri = r.file_uri;
    }
    if (cena.audio) {
      const r = await b.integrations.Core.UploadPrivateFile({
        file: new File([cena.audio], `${cena.nome || 'audio'}.${cena.audioExt || 'webm'}`, {
          type: cena.audio.type || 'audio/webm',
        }),
      });
      audio_uri = r.file_uri;
    }
    cenas.push({
      nome: cena.nome || '',
      texto: cena.texto || '',
      imagem_uri,
      audio_uri,
      audioExt: cena.audioExt || '',
      previaVoz: cena.previaVoz || '',
      video: Boolean(cena.video),
      duracaoVideo: Number(cena.duracaoVideo) || 0,
      videoCorte: cena.videoCorte || null,
      videoVolume: Number.isFinite(Number(cena.videoVolume)) ? Number(cena.videoVolume) : 1,
      videoMudo: Boolean(cena.videoMudo),
    });
  }
  // A entidade guarda as cenas como TEXTO JSON (a base não aceita listas de
  // objetos neste campo).
  const payload = {
    nome: String(dados.nome || 'Projeto sem nome'),
    criadoEm: Number(dados.criadoEm) || Date.now(),
    config: dados.config || {},
    cenas: JSON.stringify(cenas),
  };
  if (idNuvem) {
    await b.entities.Projeto.update(idNuvem, payload);
    return idNuvem;
  }
  const criado = await b.entities.Projeto.create(payload);
  return criado.id;
}

// Lê um projeto da nuvem e TRAZ os ficheiros: cada imagem e cada áudio volta
// como Blob, na mesma forma que o histórico local usa; o estúdio não sabe
// a diferença.
export async function lerProjetoNuvem(id) {
  // IDs da nuvem têm 24 caracteres hexadecimais. UUIDs (projetos só-deste-
  // computador) nunca existem aqui: perguntar por eles só gera 404.
  if (!id || !/^[0-9a-f]{24}$/i.test(String(id))) return null;
  const b = await cliente();
  let reg = null;
  try {
    reg = await b.entities.Projeto.get(id);
  } catch {
    return null;
  }
  if (!reg) return null;
  return await converterNuvem(reg, b);
}

const baixar = async (b, uri) => {
  if (!uri) return null;
  try {
    const r = await fetch(await assinar(b, uri));
    if (!r.ok) return null;
    return await r.blob();
  } catch {
    return null;
  }
};

function cenasDe(reg) {
  try {
    const valor = typeof reg.cenas === 'string' ? JSON.parse(reg.cenas || '[]') : reg.cenas;
    return Array.isArray(valor) ? valor : [];
  } catch {
    return [];
  }
}

async function converterNuvem(reg, b) {
  const cenas = [];
  for (const c of cenasDe(reg)) {
    cenas.push({
      nome: c.nome || '',
      imagem: await baixar(b, c.imagem_uri),
      audio: await baixar(b, c.audio_uri),
      texto: c.texto || '',
      audioExt: c.audioExt || '',
      previaVoz: c.previaVoz || '',
      video: Boolean(c.video),
      duracaoVideo: Number(c.duracaoVideo) || 0,
      videoCorte: c.videoCorte || null,
      videoVolume: Number.isFinite(Number(c.videoVolume)) ? Number(c.videoVolume) : 1,
      videoMudo: Boolean(c.videoMudo),
    });
  }
  return {
    id: reg.id,
    nome: reg.nome || 'Projeto sem nome',
    criadoEm: Number(reg.criadoEm) || Date.now(),
    cenas,
    config: reg.config || {},
    guardadoEm: reg.created_date ? new Date(reg.created_date).getTime() : Date.now(),
  };
}

// Procura um projeto da nuvem pelo NOME do vídeo (para vídeos antigos que não
// sabem qual é o projeto deles). Devolve o projeto já com os ficheiros.
const escapar = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export async function procurarProjetoNuvemPorNome(nome) {
  const alvo = String(nome || '').trim();
  if (!alvo) return null;
  const b = await cliente();
  let page = await b.entities.Projeto.filter({ nome: alvo }, { sort: '-created_date', limit: 1 });
  if (!(page.items || []).length) {
    page = await b.entities.Projeto.filter(
      { nome: { $regex: `^${escapar(alvo)}$`, $options: 'i' } },
      { sort: '-created_date', limit: 1 },
    );
  }
  const reg = (page.items || [])[0];
  if (!reg) return null;
  return await converterNuvem(reg, b);
}
