// Login na Base44 pelo fluxo "device code", feito por nós para poder ver o
// código e o resultado em vez de ficar à espera num terminal sem saída.
//
// 1) pede um código ao servidor OAuth da Base44
// 2) imprime o código e o endereço para o utilizador confirmar
// 3) fica a perguntar pelo token até o utilizador aprovar (ou expirar)
// 4) grava ~/.base44/auth/auth.json (o ficheiro que o `base44` CLI lê)
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const API = 'https://app.base44.com';
const CLIENT_ID = 'base44_cli';
const SCOPE = 'apps:read apps:write sandbox:write';

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const r = await fetch(`${API}/oauth/device/code`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'User-Agent': 'Base44 CLI' },
  body: JSON.stringify({ client_id: CLIENT_ID, scope: SCOPE }),
});
if (!r.ok) {
  console.log(`ERRO ao pedir o código: ${r.status} ${r.statusText}`);
  process.exit(1);
}
const dc = await r.json();
const intervalo = Math.max(2, Number(dc.interval) || 5) * 1000;
const limite = Date.now() + (Number(dc.expires_in) || 600) * 1000;

console.log(`CODIGO=${dc.user_code}`);
console.log(`ENDERECO=${dc.verification_uri}`);
console.log(`vale ${Math.round((Number(dc.expires_in) || 600) / 60)} minutos · a perguntar de ${intervalo / 1000} em ${intervalo / 1000}s`);

let token = null;
let ultimaFalha = '';
while (Date.now() < limite) {
  await espera(intervalo);
  const params = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    device_code: dc.device_code,
    client_id: CLIENT_ID,
  });
  const t = await fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Base44 CLI' },
    body: params.toString(),
  });
  const j = await t.json().catch(() => ({}));
  if (t.ok && j.access_token) {
    token = j;
    break;
  }
  const erro = j.error || `http ${t.status}`;
  if (erro !== 'authorization_pending' && erro !== 'slow_down') {
    console.log(`ERRO no pedido do token: ${erro} ${j.error_description || ''}`.trim());
    process.exit(1);
  }
  if (erro !== ultimaFalha) {
    ultimaFalha = erro;
    console.log(`à espera da confirmação (${erro})…`);
  }
}

if (!token) {
  console.log('O código expirou sem confirmação.');
  process.exit(2);
}

// O email vem dentro do próprio token (campo "sub"), como o CLI faz.
let email = 'conta-base44';
try {
  const carga = token.access_token.split('.')[1];
  const json = JSON.parse(Buffer.from(carga.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  email = String(json.sub || json.email || email);
} catch {
  /* fica o nome genérico */
}

const pasta = join(homedir(), '.base44', 'auth');
mkdirSync(pasta, { recursive: true });
const ficheiro = join(pasta, 'auth.json');
writeFileSync(
  ficheiro,
  JSON.stringify(
    {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: Date.now() + (Number(token.expires_in) || 3600) * 1000,
      email,
      name: email,
    },
    null,
    2,
  ),
  'utf8',
);
console.log(`LOGIN OK ${email}`);
