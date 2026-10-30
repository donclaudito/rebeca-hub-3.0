// O cliente da Base44 tem de ter SEMPRE um id de app, mesmo num build feito sem
// .env.local. Já aconteceu o contrário: um build local sem o ficheiro publicou
// uma página que rebentava logo no arranque ("Falta o VITE_BASE44_APP_ID").
import { readFileSync, existsSync } from 'node:fs';

const raiz = 'E:/youtube rebeca2/rebeca-hub-3.0-base44/';
const falhas = [];
const ok = (m) => console.log('  ok:', m);
const fail = (m) => { console.error('  FALHOU:', m); falhas.push(m); };
const check = (c, bom, mau) => (c ? ok(bom) : fail(mau));

const cliente = readFileSync(raiz + 'src/base44Client.js', 'utf8');
const reserva = cliente.match(/APP_ID_DE_RESERVA\s*=\s*'([0-9a-f]{24})'/i);

console.log('\n[1] O id da app está no código (o build não depende do .env.local)');
{
  check(Boolean(reserva), `há um id de reserva (${reserva ? reserva[1] : 'nenhum'})`, 'sem id de reserva: um build sem .env.local parte a app');
  check(/VITE_BASE44_APP_ID\s*\|\|\s*APP_ID_DE_RESERVA/.test(cliente), 'a variável de ambiente continua a mandar, o id é o recurso', 'não usa o .env.local quando existe');
  const app = raiz + 'base44/.app.jsonc';
  if (existsSync(app)) {
    const id = (readFileSync(app, 'utf8').match(/"id"\s*:\s*"([0-9a-f]{24})"/i) || [])[1];
    check(Boolean(id) && reserva && id === reserva[1], `o id de reserva é o da app (${id})`, `o id de reserva (${reserva && reserva[1]}) não é o da app (${id})`);
  }
}

console.log(falhas.length ? `\n=== ${falhas.length} FALHA(S) ===` : '\n=== ID DA APP OK ===');
process.exit(falhas.length ? 1 : 0);
