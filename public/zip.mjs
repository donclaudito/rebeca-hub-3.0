// ============================================================
//  ZIP mínimo (método "store": sem compressão), com CRC32.
//  Saiu do app.js para o ficheiro continuar leve e editável.
// ============================================================

export function criarZip(ficheiros) {
  const tabela = (() => {
    const t = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c;
    }
    return t;
  })();
  const crc32 = (b) => {
    let c = -1;
    for (let i = 0; i < b.length; i++) c = tabela[(c ^ b[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };

  const locais = [];
  const centrais = [];
  let offset = 0;
  const enc = new TextEncoder();

  for (const f of ficheiros) {
    const nome = enc.encode(f.nome);
    const dados = f.dados;
    const crc = crc32(dados);
    const l = new Uint8Array(30 + nome.length);
    const dv = new DataView(l.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 0x0800, true);
    dv.setUint16(8, 0, true); // store
    dv.setUint32(14, crc, true);
    dv.setUint32(18, dados.length, true);
    dv.setUint32(22, dados.length, true);
    dv.setUint16(26, nome.length, true);
    l.set(nome, 30);
    locais.push(l, dados);

    const c = new Uint8Array(46 + nome.length);
    const cv = new DataView(c.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, dados.length, true);
    cv.setUint32(24, dados.length, true);
    cv.setUint16(28, nome.length, true);
    cv.setUint32(42, offset, true);
    c.set(nome, 46);
    centrais.push(c);

    offset += l.length + dados.length;
  }

  const central = centrais.reduce((s, c) => s + c.length, 0);
  const fim = new Uint8Array(22);
  const fv = new DataView(fim.buffer);
  fv.setUint32(0, 0x06054b50, true);
  fv.setUint16(8, ficheiros.length, true);
  fv.setUint16(10, ficheiros.length, true);
  fv.setUint32(12, central, true);
  fv.setUint32(16, offset, true);

  return new Blob([...locais, ...centrais, fim]);
}
