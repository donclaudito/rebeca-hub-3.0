// ============================================================
//  Teste local da lógica da função generateNarration
//
//  Corre a MESMA construção de prompt e leitura de resposta que a função de
//  nuvem usa, contra a API real — para se saber se funciona antes de publicar.
//
//  Usa:
//      node TESTAR-FUNCAO.mjs <chave> [servico]
//
//  servico: deepseek (predefinido) | openai | groq | gemini
// ============================================================
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = dirname(fileURLToPath(import.meta.url));

const SERVICOS = {
  deepseek: { url: 'https://api.deepseek.com', modelo: 'deepseek-flash' },
  openai: { url: 'https://api.openai.com/v1', modelo: 'gpt-4o-mini' },
  groq: { url: 'https://api.groq.com/openai/v1', modelo: 'meta-llama/llama-4-scout-17b-16e-instruct' },
  gemini: { url: 'https://generativelanguage.googleapis.com/v1beta/openai/', modelo: 'gemini-2.5-flash' },
};

const chave = (process.argv[2] || '').trim();
const nomeServico = (process.argv[3] || 'deepseek').toLowerCase();
const servico = SERVICOS[nomeServico];

console.log('\n==============================================');
console.log('  TESTE DA FUNÇÃO DE NARRAÇÃO (local)');
console.log('==============================================\n');

if (!chave) {
  console.log('  [FALHA] Falta a chave.');
  console.log('          Use:  node TESTAR-FUNCAO.mjs <chave> [servico]\n');
  process.exit(1);
}
if (!servico) {
  console.log(`  [FALHA] Serviço desconhecido: ${nomeServico}`);
  console.log(`          Disponíveis: ${Object.keys(SERVICOS).join(', ')}\n`);
  process.exit(1);
}
console.log(`  serviço: ${nomeServico}  |  modelo: ${servico.modelo}\n`);

// ---- obter imagens de teste ----
// Procura a pasta de imagens do projeto local, se existir; senão gera imagens
// simples em memória para o teste não depender de nada.
function imagensDeTeste() {
  const candidatas = [
    join(RAIZ, '..', 'rebeca-hub-3.0', '_tmpC_img'),
    join(RAIZ, 'teste-imagens'),
  ];
  for (const pasta of candidatas) {
    try {
      const ficheiros = readdirSync(pasta).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort().slice(0, 3);
      if (ficheiros.length) {
        console.log(`  imagens de teste: ${pasta}`);
        return ficheiros.map((f) => ({ nome: f, caminho: join(pasta, f) }));
      }
    } catch {
      /* pasta ausente */
    }
  }
  return [];
}

// Imagem mínima (JPEG 1x1 cinzento) para o caso de não haver imagens no disco.
const JPEG_1x1 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

let imagens = imagensDeTeste();
if (imagens.length) {
  const { readFileSync: ler } = await import('node:fs');
  imagens = imagens.map((i) => ({
    nome: i.nome,
    dataUrl: `data:image/jpeg;base64,${ler(i.caminho).toString('base64')}`,
    bytes: statSync(i.caminho).size,
  }));
} else {
  console.log('  (não encontrei imagens no disco — uso 2 imagens mínimas de teste)');
  imagens = [
    { nome: 'teste-1.jpg', dataUrl: `data:image/jpeg;base64,${JPEG_1x1}`, bytes: 105 },
    { nome: 'teste-2.jpg', dataUrl: `data:image/jpeg;base64,${JPEG_1x1}`, bytes: 105 },
  ];
}
console.log(`  ${imagens.length} imagem(ns), ${(imagens.reduce((s, i) => s + i.bytes, 0) / 1024).toFixed(0)} KB\n`);

// ---- o mesmo prompt que a função usa ----
function construirPrompt({ quantas, tom, extra, minimo, maximo, idioma }) {
  return [
    `Você é narrador de histórias infantis. Receberá ${quantas} imagem(ns) NA ORDEM em que aparecem no vídeo.`,
    `Sua tarefa: OLHAR as imagens e escrever a narração de cada uma, em ${idioma}.`,
    '',
    'REGRAS:',
    `1. Escreva exatamente ${quantas} narração(ões), uma por imagem, na mesma ordem.`,
    `2. Cada narração deve ter entre ${minimo} e ${maximo} palavras — curta, para ser lida em voz alta.`,
    '3. Descreva o que REALMENTE aparece na imagem.',
    '4. A narração deve formar UMA história contínua.',
    '5. Linguagem simples, frases curtas, presente do indicativo. Sem emojis.',
    '6. Não invente elementos que não aparecem nas imagens.',
    tom ? `7. Tom: ${tom}.` : '',
    extra ? `8. Orientação extra do autor: ${extra}` : '',
    '',
    'Devolva SOMENTE um objeto JSON válido, sem texto em volta, neste formato exato:',
    '{"titulo":"título curto do vídeo","narracoes":[{"indice":1,"texto":"narração da imagem 1"}]}',
  ]
    .filter(Boolean)
    .join('\n');
}

const conteudo = [
  {
    type: 'text',
    text: construirPrompt({
      quantas: imagens.length,
      tom: 'acolhedor',
      extra: '',
      minimo: 12,
      maximo: 30,
      idioma: 'português do Brasil',
    }),
  },
];
imagens.forEach((img, i) => {
  conteudo.push({ type: 'text', text: `Imagem ${i + 1}:` });
  conteudo.push({ type: 'image_url', image_url: { url: img.dataUrl, detail: 'low' } });
});

// ---- chamar ----
console.log('  a chamar o serviço…');
const t0 = Date.now();
let resposta;
try {
  resposta = await fetch(`${servico.url.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chave}` },
    body: JSON.stringify({
      model: servico.modelo,
      messages: [{ role: 'user', content: conteudo }],
      temperature: 0.8,
      response_format: { type: 'json_object' },
    }),
  });
} catch (e) {
  console.log(`  [FALHA] Não consegui ligar: ${e.message}\n`);
  process.exit(1);
}

const texto = await resposta.text();
console.log(`  HTTP ${resposta.status} em ${Date.now() - t0} ms\n`);

if (!resposta.ok) {
  let detalhe = texto.slice(0, 400);
  try {
    detalhe = JSON.parse(texto)?.error?.message || detalhe;
  } catch {
    /* cru */
  }
  console.log(`  [FALHA] ${detalhe}\n`);
  process.exit(1);
}

// ---- ler a resposta como a função faz ----
const pacote = JSON.parse(texto);
const bruto = pacote?.choices?.[0]?.message?.content ?? '';
let obj = null;
try {
  obj = typeof bruto === 'string' ? JSON.parse(bruto) : bruto;
} catch {
  const limpo = String(bruto).replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    obj = JSON.parse(limpo);
  } catch {
    console.log('  [FALHA] O modelo não devolveu JSON válido:');
    console.log('  ' + String(bruto).slice(0, 300) + '\n');
    process.exit(1);
  }
}

const lista = Array.isArray(obj?.narracoes) ? obj.narracoes : [];
console.log(`  [ OK ] título: "${obj?.titulo || '(sem título)'}"`);
console.log(`  [ ${lista.length === imagens.length ? 'OK' : 'FALHA'} ] ${lista.length} narração(ões) para ${imagens.length} imagem(ns)\n`);

const cenas = imagens.map((img, i) => {
  const achado = lista[i] || lista.find((x) => Number(x?.indice ?? x?.index) === i + 1);
  return { filename: img.nome, index: i + 1, texto: String(achado?.texto ?? achado?.text ?? '').trim() };
});

cenas.forEach((c) => {
  const palavras = c.texto ? c.texto.split(/\s+/).length : 0;
  console.log(`  ${c.index}. (${palavras} palavras) ${c.texto.slice(0, 90)}${c.texto.length > 90 ? '…' : ''}`);
});

const vazias = cenas.filter((c) => !c.texto).length;
console.log('\n==============================================');
console.log('  RESUMO');
console.log('==============================================');
console.log(vazias ? `  ${vazias} cena(s) sem texto — o modelo devolveu menos do que pedido.` : '  Todas as cenas receberam texto. A função está pronta a publicar.');
console.log('');
