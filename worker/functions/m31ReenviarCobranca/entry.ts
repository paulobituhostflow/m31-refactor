// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

// ── UAZAPI direto (inline para evitar 403 em functions.invoke) ──────────────
function sanitizePhone(phone) {
  const digits = (phone || '').replace(/\D/g, '');
  // Remove DDI 55 duplicado (ex: 5555819997651 → 55819997651)
  let d = digits;
  while (d.startsWith('5555')) {
    d = d.slice(2);
  }
  if (d.startsWith('55') && d.length >= 12) return d;
  return `55${d}`;
}

async function sendViaUAZAPI(phone, message) {
  const token = config('UAZAPI_TOKEN');
  if (!token) throw new Error('UAZAPI_TOKEN não configurado');
  const baseUrl = (config('UAZAPI_BASE') || '__UAZAPI_API__').replace(/\/+$/, '');
  const phoneSanitized = sanitizePhone(phone);

  const resp = await fetch(`${baseUrl}/send/text`, {
    method: 'POST',
    headers: { 'token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ number: phoneSanitized, phone: phoneSanitized, message, text: message }),
  });
  const body = await resp.text();
  return { sucesso: resp.status === 200, status: resp.status, body };
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { inscricao_id, mensagem_customizada } = await req.json();

    const inscricoes = await base44.asServiceRole.entities.EventoM31Inscricao.filter({ id: inscricao_id });
    const inscricao = inscricoes[0];
    if (!inscricao) return Response.json({ error: 'Inscrição não encontrada' }, { status: 404 });

    const linkPagamento = inscricao.asaas_charge_url;
    const nome = inscricao.nome.split(' ')[0];

    const msg = mensagem_customizada ||
      `Oi, ${nome}! 🌷\n\nSua inscrição no *M31 Filhas* ainda está aguardando o pagamento.\n\nFinalize agora e garanta sua vaga:\n${linkPagamento}\n\nQualquer dúvida, é só responder aqui. 💛`;

    const phone = inscricao.whatsapp?.replace(/\D/g, '');

    // ENVIO DIRETO (inline) — não usa functions.invoke para evitar 403
    const uazapiRes = await sendViaUAZAPI(phone, msg);
    const sucesso = uazapiRes.sucesso === true;

    await base44.asServiceRole.entities.M31MessageLog.create({
      inscricao_id,
      inscricao_nome: inscricao.nome,
      telefone: phone,
      tipo: 'cobranca',
      stage: 'manual',
      mensagem: msg,
      sucesso,
      zapi_response: uazapiRes.body,
      erro: sucesso ? null : `HTTP ${uazapiRes.status}: ${uazapiRes.body?.substring(0, 200)}`,
      enviado_em: new Date().toISOString()
    });

    await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao_id, {
      recovery_attempts: (inscricao.recovery_attempts || 0) + 1,
      last_recovery_at: new Date().toISOString(),
      last_contact_at: new Date().toISOString()
    });

    return Response.json({ success: true, sucesso, telefone: phone, zapi_status: uazapiRes.status, zapi_body: uazapiRes.body?.substring(0, 300) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
