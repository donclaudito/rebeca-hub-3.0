// Créditos de integrações da Base44 (erro 402) e o que a app faz com eles.
//
// A regra do projeto: a IA fala directamente com a DeepSeek (segredo da app).
// Só o ARMAZENAMENTO é integração paga, e é aí que aparece o 402. Estes testes
// garantem (1) que o erro é reconhecido e explicado, (2) que um projeto já na
// nuvem não volta a subir ficheiros iguais e (3) que a análise do Diretor não
// usa o armazenamento em lado nenhum.
import { readFileSync } from 'node:fs';

const raiz = 'E:/youtube rebeca2/rebeca-hub-3.0-base44/';
const BASE = 'file:///E:/youtube%20rebeca2/rebeca-hub-3.0-base44/public/';
const creditos = await import(BASE + 'creditos.mjs');
const nuvem = await import(BASE + 'projeto-nuvem.mjs');

const falhas = [];
const ok = (m) => console.log('  ok:', m);
const fail = (m) => { console.error('  FALHOU:', m); falhas.push(m); };
const check = (c, bom, mau) => (c ? ok(bom) : fail(mau));

console.log('\n[1] O erro 402 é reconhecido em todas as formas que chegam');
{
  check(creditos.semCreditos({ response: { status: 402 } }) === true, 'AxiosError (response.status)', 'não reconheceu');
  check(creditos.semCreditos({ status: 402 }) === true, 'erro do SDK (status)', 'não reconheceu');
  check(creditos.semCreditos(new Error('Request failed with status code 402')) === true, 'mensagem com 402', 'não reconheceu');
  check(creditos.semCreditos(new Error('Payment Required')) === true, 'mensagem "Payment Required"', 'não reconheceu');
  check(creditos.semCreditos({ status: 500 }) === false, 'um 500 não é falta de créditos', 'confundiu 500 com 402');
  check(creditos.semCreditos(new Error('rede caiu')) === false, 'um erro de rede não é falta de créditos', 'confundiu');
  check(/SEM CRÉDITOS/.test(creditos.MENSAGEM_SEM_CREDITOS), `a mensagem explica ("${creditos.MENSAGEM_SEM_CREDITOS.slice(0, 48)}…")`, 'mensagem fraca');
  check(/não se perdeu|descarreg/i.test(creditos.MENSAGEM_SEM_CREDITOS), 'e diz que o trabalho não se perdeu', 'não tranquiliza');
}

console.log('\n[2] Guardar outra vez não volta a subir ficheiros iguais');
{
  const img = { size: 1234, type: 'image/png' };
  const audio = { size: 5678, type: 'audio/webm' };
  const cenas = [{ nome: 'c1.jpg', imagem: img, audio }];
  // 1.º envio: nada existe ainda → sobe tudo.
  const p1 = nuvem.planearEnvio(cenas, []);
  check(p1.length === 1 && p1[0].subirImagem && p1[0].subirAudio, 'no primeiro envio sobe imagem e áudio', JSON.stringify(p1[0] && { i: p1[0].subirImagem, a: p1[0].subirAudio }));

  // O que ficou na nuvem depois do 1.º envio (é o que o 2.º envio vai ler).
  const guardado = [{ nome: 'c1.jpg', imagem_uri: 'private/i1.png', audio_uri: 'private/a1.webm', imagemFp: p1[0].imagemFp, audioFp: p1[0].audioFp }];
  const p2 = nuvem.planearEnvio(cenas, guardado);
  check(!p2[0].subirImagem && !p2[0].subirAudio, 'no segundo envio NÃO sobe nada (0 créditos gastos)', JSON.stringify({ i: p2[0].subirImagem, a: p2[0].subirAudio }));
  check(p2[0].imagem_uri === 'private/i1.png' && p2[0].audio_uri === 'private/a1.webm', 'reaproveita os ficheiros que já estão na nuvem', JSON.stringify({ i: p2[0].imagem_uri, a: p2[0].audio_uri }));

  // Imagem nova (outro tamanho) → só ela sobe.
  const novas = [{ nome: 'c1.jpg', imagem: { size: 999, type: 'image/png' }, audio }];
  const p3 = nuvem.planearEnvio(novas, guardado);
  check(p3[0].subirImagem && !p3[0].subirAudio, 'imagem diferente sobe, o áudio igual fica', JSON.stringify({ i: p3[0].subirImagem, a: p3[0].subirAudio }));

  // Cena nova além das que existiam → sobe.
  const p4 = nuvem.planearEnvio([...cenas, { nome: 'c2.jpg', imagem: img }], guardado);
  check(p4[1].subirImagem === true, 'cena nova sobe a sua imagem', JSON.stringify(p4[1] && p4[1].subirImagem));

  // As impressões digitais viajam no que é guardado (senão a 2.ª vez não sabia).
  const fonte = readFileSync(raiz + 'public/projeto-nuvem.mjs', 'utf8');
  check(/imagemFp: plano\.imagemFp/.test(fonte) && /audioFp: plano\.audioFp/.test(fonte), 'o projeto guardado leva as impressões digitais', 'não guarda as impressões');
  check(/guardarProjetoNuvem[\s\S]{0,600}SEM CRÉDITOS/.test(fonte), 'o 402 ao guardar é traduzido para uma frase clara', 'erro cru');
}

console.log('\n[3] A análise do Diretor não usa o armazenamento da Base44');
{
  const analise = readFileSync(raiz + 'public/estudio-analise.mjs', 'utf8');
  check(!/UploadPrivateFile/.test(analise), 'a página não envia ficheiros (nem como reserva)', 'ainda usa UploadPrivateFile');
  check(!/CreateFileSignedUrl/.test(analise), 'nem pede URLs assinados', 'ainda pede URLs assinados');
  check(/dataUrl/.test(analise), 'as imagens vão dentro do pedido (data URL)', 'não manda as imagens dentro do pedido');

  const fn = readFileSync(raiz + 'base44/functions/analisarProducao/entry.ts', 'utf8');
  check(!/CreateFileSignedUrl/.test(fn), 'a função da nuvem não assina ficheiros', 'ainda assina ficheiros');
  check(!/asServiceRole/.test(fn), 'e não usa o cliente de serviço para integrações', 'ainda usa asServiceRole');
  check(!/UploadPrivateFile/.test(fn), 'nem faz uploads', 'ainda faz uploads');
  check(/dataUrl/.test(fn) && /data:\$\{tipo\};base64/.test(fn), 'aceita e valida as imagens em base64', 'não aceita base64');

  // O 402 ficou explicado nos dois sítios que ainda precisam de armazenamento.
  const app = readFileSync(raiz + 'public/app.js', 'utf8');
  check(/semCreditos/.test(app), 'o vídeo guardado na nuvem explica a falta de créditos', 'não explica');
  const proj = readFileSync(raiz + 'public/estudio-projetos.mjs', 'utf8');
  check(/semCreditos/.test(proj), 'o projeto guardado na nuvem também', 'não explica');
}

console.log(falhas.length ? `\n=== ${falhas.length} FALHA(S) ===` : '\n=== CRÉDITOS DA BASE44 OK ===');
process.exit(falhas.length ? 1 : 0);
