// Testes da auditoria de enquadramento que a "🎥 Análise do Diretor" passou a
// fazer: mede, cena a cena, se o personagem está centrado e inteiro, e diz se a
// falta é do recorte do vídeo ou da própria imagem (que só se resolve a gerar
// de novo).
import { readFileSync } from 'node:fs';

const BASE = 'file:///E:/youtube%20rebeca2/rebeca-hub-3.0-base44/public/';
const mod = await import(BASE + 'auditoria-enquadramento.mjs');

const falhas = [];
const ok = (m) => console.log('  ok:', m);
const fail = (m) => { console.error('  FALHOU:', m); falhas.push(m); };
const check = (c, bom, mau) => (c ? ok(bom) : fail(mau));

// Fundo liso + "personagem" (xadrez de alto contraste) no bloco indicado.
function imagemComPersonagem(largura, altura, bloco) {
  const dados = new Uint8ClampedArray(largura * altura * 4);
  for (let i = 0; i < largura * altura; i++) {
    dados[i * 4] = 200; dados[i * 4 + 1] = 220; dados[i * 4 + 2] = 240; dados[i * 4 + 3] = 255;
  }
  if (!bloco) return dados;
  const [bx, by, bw, bh] = bloco;
  for (let y = by; y < Math.min(altura, by + bh); y++) {
    for (let x = bx; x < Math.min(largura, bx + bw); x++) {
      const q = (Math.floor(x / 2) + Math.floor(y / 2)) % 2;
      const i = y * largura + x;
      const v = q ? 10 : 250;
      dados[i * 4] = v; dados[i * 4 + 1] = v; dados[i * 4 + 2] = v;
    }
  }
  return dados;
}

const alvo = { alvoW: 1920, alvoH: 1080 };

console.log('\n[1] Modo "preencher o quadro": a cabeça fica, os pés saem');
{
  // 300×400 com o corpo todo (cabeça em y=40, pés em y=390). O vídeo é 16:9, a
  // janela só mostra ~169 px de altura: o corpo NÃO cabe — é normal cortar os
  // pés, nunca a cabeça. Só acontece no modo "preencher" (com recorte).
  const l = 300, a = 400;
  const d = mod.avaliarEnquadramento({
    dados: imagemComPersonagem(l, a, [120, 40, 60, 350]), largura: l, altura: a, ...alvo, modoImagem: 'preencher',
  });
  check(d.temAssunto === true, 'identificou o personagem', 'não identificou');
  check(d.perdaTopo === 0, `nada da cabeça ficou fora (${d.perdaTopo}%)`, `${d.perdaTopo}% da cabeça fora`);
  check(d.perdaBaixo > 5, `a parte de baixo fica fora (${d.perdaBaixo}%) — medido, não adivinhado`, `perda de baixo: ${d.perdaBaixo}%`);
  check(d.avisos.some((x) => /parte de baixo/i.test(x)), `avisa da parte de baixo ("${d.avisos.join(' | ')}")`, d.avisos.join(' | '));
  check(d.dentroDoQuadro === false, 'a cena não está "toda dentro do quadro"', 'disse que estava tudo dentro');
  check(d.gravidade === 'media', `gravidade "media" (não é a cabeça) — ${d.gravidade}`, d.gravidade);
}

console.log('\n[1b] Modo "imagem inteira" (por omissão): NÃO se acusa um corte que o vídeo não faz');
{
  // A MESMA imagem, mas com o vídeo a mostrar tudo: como a imagem aparece
  // completa, não há perda nenhuma para medir — e é falso dizer que o vídeo
  // corta os pés. Foi este o erro que o utilizador viu ("re-enquadra com zoom").
  const l = 300, a = 400;
  const d = mod.avaliarEnquadramento({ dados: imagemComPersonagem(l, a, [120, 40, 60, 350]), largura: l, altura: a, ...alvo });
  check(d.perdaTopo === 0 && d.perdaBaixo === 0, `nada fica fora (${d.perdaTopo}%/${d.perdaBaixo}%) — a imagem aparece toda`, `${d.perdaTopo}%/${d.perdaBaixo}%`);
  check(d.dentroDoQuadro === true, 'a cena está toda dentro do quadro', 'disse que faltava alguma coisa');
  check(d.gravidade === 'ok', `sem faltas (${d.gravidade}) — a imagem está bem`, `${d.gravidade}`);
  check(!d.avisos.some((x) => /recorte|parte de baixo/i.test(x)), `não inventa cortes do vídeo ("${d.avisos.join(' | ') || 'sem avisos'}")`, d.avisos.join(' | '));
}

console.log('\n[1c] Modo "imagem inteira" continua a assinalar a imagem que JÁ vem cortada');
{
  // Aqui a culpa é da imagem de origem (a cabeça sai pela borda) e isso tem de
  // ser dito na mesma — só se resolve a gerar de novo, não a mexer no vídeo.
  const l = 200, a = 300;
  const d = mod.avaliarEnquadramento({ dados: imagemComPersonagem(l, a, [80, 0, 40, 300]), largura: l, altura: a, ...alvo });
  check(d.gravidade === 'grave', `continua grave (${d.gravidade})`, d.gravidade);
  check(d.avisos.some((x) => /já vem cortada na cabeça/i.test(x)), `culpa a imagem, não o recorte ("${d.avisos.join(' | ')}")`, d.avisos.join(' | '));
}

console.log('\n[2] Imagem que já vem cortada na cabeça é assinalada como GRAVE');
{
  // O personagem começa na linha 0: a cabeça sai pela borda da própria imagem.
  const l = 200, a = 300;
  const d = mod.avaliarEnquadramento({ dados: imagemComPersonagem(l, a, [80, 0, 40, 300]), largura: l, altura: a, ...alvo });
  check(d.tocaTopo === true, 'detetou que a caixa encosta à borda de cima', 'não detetou');
  check(d.gravidade === 'grave', `gravidade "grave" — ${d.gravidade}`, d.gravidade);
  check(d.avisos.some((x) => /borda de cima|corta a cabeça/i.test(x)), `explica a cabeça ("${d.avisos.join(' | ')}")`, d.avisos.join(' | '));
}

console.log('\n[3] Personagem descentrado (encostado ao lado) é medido');
{
  // Imagem larga com o personagem no canto direito: a janela não consegue
  // centrá-lo sem sair da imagem, por isso fica descentrado.
  const l = 400, a = 200;
  const d = mod.avaliarEnquadramento({ dados: imagemComPersonagem(l, a, [370, 40, 30, 120]), largura: l, altura: a, alvoW: 1080, alvoH: 1920 });
  check(d.temAssunto === true, 'identificou o personagem', 'não identificou');
  check(d.desvioCentro > 15, `mede o desvio ao centro (${d.desvioCentro}%)`, `desvio ${d.desvioCentro}%`);
  check(d.avisos.some((x) => /descentrad/i.test(x)), `avisa que está descentrado ("${d.avisos.join(' | ')}")`, d.avisos.join(' | '));
}

console.log('\n[4] Imagem sem personagem identificável não inventa medidas');
{
  const l = 200, a = 200;
  const d = mod.avaliarEnquadramento({ dados: imagemComPersonagem(l, a, null), largura: l, altura: a, ...alvo });
  check(d.temAssunto === false, 'diz que não identificou o personagem', 'inventou um personagem');
  check(d.avisos.some((x) => /não consegui identificar/i.test(x)), 'explica que não identificou', d.avisos.join(' | '));
}

console.log('\n[5] O resumo diz o que há a corrigir e o que exigir à IA');
{
  const l = 300, a = 400;
  const boas = {
    nome: 'boa.jpg',
    temAssunto: true,
    gravidade: 'ok',
    desvioCentro: 3,
    avisos: [],
  };
  const maCabeca = {
    nome: 'cortada.jpg',
    temAssunto: true,
    gravidade: 'grave',
    desvioCentro: 5,
    avisos: ['a cabeça está encostada à borda de cima da imagem'],
  };
  const maPes = {
    nome: 'sem-pes.jpg',
    temAssunto: true,
    gravidade: 'media',
    desvioCentro: 4,
    avisos: ['a parte de baixo fica fora do quadro (30%)'],
  };
  const r = mod.resumir([boas, maCabeca, maPes]);
  check(r.total === 3, `conta as cenas (${r.total})`, String(r.total));
  check(r.graves === 1 && r.medias === 1, `separa graves (${r.graves}) e médias (${r.medias})`, `${r.graves}/${r.medias}`);
  check(r.cabecaCortada.includes('cortada.jpg'), 'lista a cena com a cabeça cortada', JSON.stringify(r.cabecaCortada));
  check(r.pesFora.includes('sem-pes.jpg'), 'lista a cena sem os pés', JSON.stringify(r.pesFora));
  check(r.faltas.length >= 2, `resume as faltas ("${r.faltas.join(' | ')}")`, JSON.stringify(r.faltas));
  check(/1 de 3|2 de 3/.test(r.veredicto), `dá um veredicto ("${r.veredicto}")`, r.veredicto);
  check(r.exigencias.length === 3, `traz 3 exigências para o prompt (${r.exigencias.length})`, String(r.exigencias.length));

  // Sem faltas: nenhuma exigência (não se inventam correções).
  const limpo = mod.resumir([boas]);
  check(limpo.faltas.length === 0 && limpo.exigencias.length === 0, 'sem faltas, não há exigências', JSON.stringify(limpo.exigencias));
}

console.log('\n[6] A cláusula em inglês aparece só quando há faltas');
{
  const semFaltas = mod.clausulaDeEnquadramento([]);
  check(semFaltas === '', 'sem faltas, não acrescenta nada', semFaltas);
  const cl = mod.clausulaDeEnquadramento(['corpo inteiro no quadro']);
  check(/Framing requirements/i.test(cl), 'com faltas, exige o enquadramento em inglês', cl);
  check(/head, hands and feet fully visible/i.test(cl), 'pede cabeça, mãos e pés visíveis', cl);
  check(/centred/i.test(cl), 'pede o personagem centrado', cl);
}

console.log('\n[7] O prompt final do Diretor cobre as faltas medidas');
{
  // Simula o que a app faz: prompt do modelo + cláusula quando ele se esquece.
  const r = mod.resumir([
    { nome: 'a.jpg', temAssunto: true, gravidade: 'grave', desvioCentro: 2, avisos: ['a cabeça está encostada à borda de cima da imagem'] },
  ]);
  const clausula = mod.clausulaDeEnquadramento(r.exigencias);
  const promptDoModelo = 'A cheerful little girl playing in a sunny garden, soft pastel colours, children book illustration.';
  const jaFala = /framing|full body|whole character|head.{0,20}feet|centred|centered/i.test(promptDoModelo);
  check(jaFala === false, 'o prompt do modelo (sem falar de enquadramento) é detetado como incompleto', 'já falava de enquadramento');
  const final = jaFala ? promptDoModelo : `${promptDoModelo} ${clausula}`;
  check(/Framing requirements/i.test(final), 'o prompt final fica com a exigência de enquadramento', final);
  check(final.startsWith(promptDoModelo), 'sem estragar o prompt original', final.slice(0, 60));
}

console.log('\n[8] As páginas que usam a auditoria continuam a carregar');
{
  const analise = readFileSync('E:/youtube rebeca2/rebeca-hub-3.0-base44/public/estudio-analise.mjs', 'utf8');
  check(/auditarCenas/.test(analise), 'a análise do Diretor usa a auditoria', 'não usa');
  check(/clausulaDeEnquadramento/.test(analise), 'e garante a cláusula no prompt refinado', 'não garante');
  const html = readFileSync('E:/youtube rebeca2/rebeca-hub-3.0-base44/public/index.html', 'utf8');
  check(/id="analise-enquadramento"/.test(html), 'o diálogo tem a secção de enquadramento', 'sem secção no HTML');
  const fn = readFileSync('E:/youtube rebeca2/rebeca-hub-3.0-base44/base44/functions/analisarProducao/entry.ts', 'utf8');
  check(/enquadramento/.test(fn), 'a função da nuvem recebe/devolve o enquadramento', 'a função não fala de enquadramento');
  check(/Framing requirements/.test(fn), 'e tem a exigência em inglês na rede de segurança', 'sem rede de segurança');
  // O modo de imagem do vídeo tem de chegar à auditoria e ao Diretor, senão a
  // análise acusa um recorte que já não existe.
  check(/modoImagem/.test(analise), 'a análise audita no MESMO modo de imagem do vídeo', 'a análise ignora o modo de imagem');
  check(/imagemInteira|modoImagem/.test(fn), 'e o Diretor sabe se o vídeo recorta ou mostra a imagem toda', 'o Diretor não sabe o modo');
}

console.log(falhas.length ? `\n=== ${falhas.length} FALHA(S) ===` : '\n=== AUDITORIA DE ENQUADRAMENTO OK ===');
process.exit(falhas.length ? 1 : 0);
