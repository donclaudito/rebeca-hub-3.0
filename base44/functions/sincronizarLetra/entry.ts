import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';
import { lerDetalhe } from '../../shared/elevenErrors.ts';
import { versosAlinhados } from '../../shared/alinhamentoLetra.ts';

export default async function(req) {
  try {
    if (req.method !== 'POST') return Response.json({ ok: false, error: 'Use POST.' }, { status: 405 });
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: 'Entre na sua conta para alinhar a letra.' }, { status: 401 });
    if (!(req.headers.get('content-type') || '').includes('multipart/form-data')) {
      return Response.json({ ok: false, error: 'Envie o arquivo de áudio e a letra pelo botão Sincronizar com o canto.' }, { status: 400 });
    }
    const maxBytes = 32 * 1024 * 1024;
    if (Number(req.headers.get('content-length')) > maxBytes + 100000) return Response.json({ ok: false, error: 'Use um áudio de até 32 MB.' }, { status: 413 });
    const form = await req.formData();
    const file = form.get('file'), texto = String(form.get('text') || '').trim(), duracao = Number(form.get('duracao'));
    if (!(file instanceof File) || !file.size || file.size > maxBytes || !/^audio\//i.test(file.type)) {
      return Response.json({ ok: false, error: 'Escolha um arquivo de áudio válido de até 32 MB.' }, { status: 400 });
    }
    if (!texto || texto.length > 20000 || texto.split('\n').length > 400 || !Number.isFinite(duracao) || duracao <= 0 || duracao > 900) {
      return Response.json({ ok: false, error: 'Use a letra completa, até 20.000 caracteres e 400 versos, e áudio de até 15 minutos.' }, { status: 400 });
    }
    const chave = secrets.get('ELEVENLABS_API_KEY');
    if (!chave) return Response.json({ ok: false, error: 'Configure a chave da ElevenLabs para usar o alinhamento, ou ajuste os tempos manualmente.' }, { status: 400 });
    const body = new FormData();
    body.append('file', file, file.name); body.append('text', texto);
    const resposta = await fetch('https://api.elevenlabs.io/v1/forced-alignment', {
      method: 'POST', headers: { 'xi-api-key': chave }, body, signal: AbortSignal.timeout(150000),
    });
    if (!resposta.ok) {
      const detalhe = lerDetalhe(await resposta.text()).slice(0, 300);
      return Response.json({ ok: false, error: `A ElevenLabs não concluiu o alinhamento (${resposta.status}). ${detalhe} Os tempos anteriores foram preservados; você pode ajustá-los manualmente.` });
    }
    const dados = await resposta.json();
    const cues = versosAlinhados(texto, dados.words, duracao);
    return Response.json({ ok: true, cues });
  } catch (erro) {
    return Response.json({ ok: false, error: erro?.message || 'Não foi possível alinhar o canto. Os tempos anteriores foram preservados.' }, { status: 500 });
  }
}