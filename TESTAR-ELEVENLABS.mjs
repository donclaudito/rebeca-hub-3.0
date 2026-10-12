// ============================================================
//  Diagnóstico da ElevenLabs — Rebeca Hub 3.0 (nuvem)
//
//  Diz, contra a API real:
//    1. se a chave é aceite e qual é o plano;
//    2. QUAIS vozes a sua conta tem (com os ids, prontos a usar);
//    3. quais dessas vozes a síntese ACEITA mesmo (testa uma a uma);
//    4. se as 5 vozes do app são recusadas pelo plano (erro 402).
//
//  Usa:
//      node TESTAR-ELEVENLABS.mjs sk_a_sua_chave
// ============================================================
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = dirname(fileURLToPath(import.meta.url));
const API = 'https://api.elevenlabs.io/v1';

const VOZES_DO_APP = {
  EXAVITQu4vr4xnSDxMaL: 'Suave (Bella)',
  '21m00Tcm4TlvDq8ikWAM': 'Calma (Rachel)',
  MF3mGyEYCl7XYWbV9V6O: 'Alegre (Elli)',
  pNInz6obpgDQGcFmaJgB: 'Grave (Adam)',
  AZnzlk1XvdvUeBnXmlld: 'Energética (Domi)',
};

let chave = (process.argv[2] || '').trim();
if (!chave) {
  // Tenta o .env.local do projeto e o config do projeto local.
  for (const f of [join(RAIZ, '.env.local'), 'E:\\youtube rebeca2\\rebeca-hub-3.0\\.data\\config.json']) {
    try {
      const t = readFileSync(f, 'utf8');
      const m = /ELEVENLABS_API_KEY\s*=\s*([^\s"']+)/.exec(t) || /"elevenKey"\s*:\s*"([^"]+)"/.exec(t);
      if (m) {
        chave = m[1];
        console.log(`  (usei a chave de ${f})`);
        break;
      }
    } catch {
      /* ficheiro ausente */
    }
  }
}

console.log('\n==============================================');
console.log('  DIAGNÓSTICO DA ELEVENLABS');
console.log('==============================================\n');

if (!chave) {
  console.log('  [FALHA] Não recebi chave.');
  console.log('          node TESTAR-ELEVENLABS.mjs sk_a_sua_chave');
  console.log('          Crie em https://elevenlabs.io/app/developers/api-keys\n');
  process.exit(1);
}

console.log(`  chave: ${chave.slice(0, 6)}… (${chave.length} caracteres)`);
if (!/^sk_/.test(chave)) {
  console.log('  [AVISO] As chaves da ElevenLabs começam por "sk_" (underscore).');
}

// ---------- 1. plano ----------
console.log('\n1) A chave é aceite?');
const cab = { 'xi-api-key': chave };
let plano = null;
try {
  const r = await fetch(`${API}/user/subscription`, { headers: cab });
  const t = await r.text();
  let d = null;
  try {
    d = JSON.parse(t);
  } catch {
    /* cru */
  }
  const recusada = r.status === 401 || r.status === 403 || /invalid api key|unauthorized/i.test(t);
  if (recusada) {
    console.log(`  [FALHA] recusada (HTTP ${r.status}): ${(d?.detail?.message || d?.detail || t).slice?.(0, 160) || t.slice(0, 160)}`);
    process.exit(1);
  }
  plano = d?.tier || '?';
  const usados = Number(d?.character_count || 0);
  const limite = Number(d?.character_limit || 0);
  console.log(`  [ OK ] plano "${plano}" — ${usados} de ${limite} caracteres usados` + (limite ? ` (restam ${Math.max(0, limite - usados)})` : ''));
  if (plano === 'free') {
    console.log('  [NOTA] Plano gratuito: as vozes da BIBLIOTECA são recusadas (402). Só as da sua conta servem.');
  }
} catch (e) {
  console.log(`  [FALHA] ${e.message}`);
  process.exit(1);
}

// ---------- 2. vozes da conta ----------
console.log('\n2) Vozes disponíveis na sua conta');
let vozes = [];
try {
  const r = await fetch(`${API}/voices`, { headers: cab });
  const d = await r.json();
  vozes = d?.voices || [];
  if (!vozes.length) {
    console.log('  [AVISO] A conta não devolveu vozes.');
  } else {
    vozes.forEach((v) => {
      const doApp = VOZES_DO_APP[v.voice_id] ? `  <- também é voz do app: ${VOZES_DO_APP[v.voice_id]}` : '';
      console.log(`  • ${v.name}  [${v.category || '?'}]${doApp}`);
      console.log(`      id: ${v.voice_id}`);
    });
  }
} catch (e) {
  console.log(`  [FALHA] ${e.message}`);
}

// ---------- 3. que vozes a síntese aceita ----------
console.log('\n3) A síntese aceita estas vozes? (teste real, uma a uma)');
const TEXTO = 'Prova de narração do Rebeca Hub três ponto zero.';

async function sintetizar(rotulo, id) {
  try {
    const r = await fetch(`${API}/text-to-speech/${id}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { ...cab, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: TEXTO,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.65, similarity_boost: 0.85, style: 0.2, use_speaker_boost: true },
      }),
    });
    if (r.ok) {
      const b = Buffer.from(await r.arrayBuffer());
      console.log(`  [ OK ] ${rotulo}: ${(b.length / 1024).toFixed(0)} KB`);
      return true;
    }
    const t = await r.text();
    let msg = t.slice(0, 160);
    try {
      msg = JSON.parse(t)?.detail?.message || JSON.parse(t)?.detail || msg;
    } catch {
      /* cru */
    }
    const dica = /paid_plan|402/.test(`${r.status} ${msg}`) ? '  -> 402: a biblioteca é recusada neste plano' : '';
    console.log(`  [FALHA] ${rotulo}: HTTP ${r.status} — ${String(msg).slice(0, 110)}${dica}`);
    return false;
  } catch (e) {
    console.log(`  [FALHA] ${rotulo}: ${e.message}`);
    return false;
  }
}

console.log('  — vozes do APP (biblioteca):');
const resultadosApp = [];
for (const [id, nome] of Object.entries(VOZES_DO_APP)) {
  resultadosApp.push(await sintetizar(nome.padEnd(20), id));
}

console.log('\n  — vozes da SUA conta:');
const daConta = vozes.slice(0, 6);
const resultadosConta = [];
for (const v of daConta) {
  resultadosConta.push(await sintetizar(`${v.name} (${v.voice_id.slice(0, 8)}…)`.padEnd(34), v.voice_id));
}

// ---------- resumo ----------
console.log('\n==============================================');
console.log('  RESUMO');
console.log('==============================================');
const okApp = resultadosApp.filter(Boolean).length;
const okConta = resultadosConta.filter(Boolean).length;
console.log(`  vozes do app aceites:      ${okApp} de ${resultadosApp.length}`);
console.log(`  vozes da sua conta aceites: ${okConta} de ${resultadosConta.length}`);
console.log('');
if (okApp === 0 && okConta > 0) {
  console.log('  CONCLUSÃO: use as vozes da SUA CONTA. As do app são recusadas por este plano.');
} else if (okApp > 0) {
  console.log('  CONCLUSÃO: este plano aceita as vozes do app — pode usá-las à vontade.');
} else if (okConta === 0) {
  console.log('  CONCLUSÃO: nenhuma voz foi aceite. Confirme a chave e o plano em https://elevenlabs.io/app/developers/api-keys');
}
console.log('');
