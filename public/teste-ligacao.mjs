// ============================================================
//  Teste da ligação à função de nuvem (Configurações → 🔌 Testar ligação).
//  Saiu do app.js para o ficheiro continuar leve e editável.
// ============================================================

const $ = (id) => document.getElementById(id);

export async function testarLigacao() {
  const caixa = $('cfg-resultado');
  caixa.hidden = false;
  caixa.className = 'cfg-result wait';
  caixa.textContent = 'a testar…';
  const servico = $('cfg-servico').value;
  try {
    if (servico === 'local') {
      const r = await fetch('http://127.0.0.1:3100/api/health').catch(() => null);
      if (!r || !r.ok) throw new Error('não há servidor local a responder em 127.0.0.1:3100');
      const d = await r.json();
      caixa.className = 'cfg-result ok';
      caixa.textContent = `✅ Servidor local respondeu (versão ${d.versao || '?'}).`;
      return;
    }
    const { base44 } = await import('@/base44Client.js');
    // Teste propositado: sem imagens, a função responde 400 com a explicação.
    // Se essa explicação chegar, então a função está viva e a falar com o SDK.
    let d;
    try {
      const r = await base44.functions.invoke('generateNarration', { servico, imagens: [] });
      d = r?.data && !r.ok ? r.data : r;
    } catch (e) {
      d = e?.response?.data || { ok: false, error: e?.message };
      if (e?.response?.status) d.http = e.response.status;
    }
    if (d?.ok) {
      caixa.className = 'cfg-result ok';
      caixa.textContent = '✅ A função de nuvem respondeu.';
    } else if (/Nenhuma imagem recebida/i.test(d?.error || '')) {
      // É a resposta CERTA para um teste sem imagens: a função está a funcionar.
      caixa.className = 'cfg-result ok';
      caixa.textContent =
        '✅ A função de nuvem está a responder' +
        (d.http ? ` (HTTP ${d.http})` : '') +
        '. O teste não envia imagens, por isso ela pede imagens — é o esperado.';
    } else if (/Falta o segredo/i.test(d?.error || '')) {
      caixa.className = 'cfg-result err';
      caixa.textContent =
        `⚠️ A função responde, mas falta o segredo. Corra:  base44 secrets set DEEPSEEK_API_KEY=sk_...\n\n${d.error}`;
    } else {
      caixa.className = 'cfg-result err';
      caixa.textContent = `❌ ${d?.error || 'a função respondeu de forma inesperada'}`;
    }
  } catch (e) {
    caixa.className = 'cfg-result err';
    caixa.textContent = `❌ ${e.message}`;
  }
}
