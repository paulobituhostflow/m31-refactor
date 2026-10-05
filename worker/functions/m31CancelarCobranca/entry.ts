// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

// Only exact, audited cancellation. Never scan by CPF or reset a registration.
const FIELDS = ['id', 'customer', 'status', 'deleted', 'value', 'netValue', 'dueDate', 'dateCreated',
  'billingType', 'description', 'externalReference', 'invoiceUrl', 'subscription', 'installment',
  'paymentDate', 'clientPaymentDate'];
function fail(code: string, status = 409): never {
  throw Object.assign(new Error(code), { code, status });
}
function snapshot(payment: Record<string, any>) {
  return Object.fromEntries(FIELDS.map(key => [key, payment[key] ?? null]));
}
async function fingerprint(payment: Record<string, any>) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(JSON.stringify(snapshot(payment))))))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}
return (async req => {
  try {
    const base44 = createClientFromRequest(req);
    let user;
    try { user = await base44.auth.me(); } catch { fail('unauthenticated', 401); }
    if (!user || user.role !== 'admin') fail('forbidden', 403);
    if (req.method !== 'POST') fail('method_not_allowed', 405);
    const body = await req.json();
    if (body.action !== 'cancelar_identificada')
      fail('exact_payment_audit_required');
    if (!/^pay_[a-zA-Z0-9]+$/.test(body.payment_id || '') ||
        !/^cus_[a-zA-Z0-9]+$/.test(body.customer_id || '') ||
        !/^[a-zA-Z0-9]{10,32}$/.test(body.invoice_id || ''))
      fail('invalid_target', 400);
    const key = config('ASAAS_API_KEY');
    if (!key) fail('asaas_not_configured', 503);
    const path = '__ASAAS_API__/payments/' + body.payment_id;
    async function api(method = 'GET') {
      const response = await fetch(path, { method, headers: { access_token: key! },
        redirect: 'error', signal: AbortSignal.timeout(12000) });
      if (!response.ok) fail('asaas_http_' + response.status, 502);
      return response.json();
    }
    const before = await api();
    let invoice;
    try { invoice = new URL(before.invoiceUrl); } catch { fail('invalid_invoice'); }
    if (before.id !== body.payment_id || before.customer !== body.customer_id ||
        !['asaas.com', 'www.asaas.com'].includes(invoice.hostname) ||
        invoice.pathname.split('/').filter(Boolean).pop() !== body.invoice_id)
      fail('target_mismatch');
    if (before.deleted === true)
      return Response.json({ payment_id: before.id, verified: true, noop: true, deleted: true });
    if (!['PENDING', 'OVERDUE'].includes(before.status) || before.paymentDate || before.clientPaymentDate)
      fail('payment_not_unpaid');
    if (before.subscription || before.installment) fail('parent_obligation_requires_review');
    const hash = await fingerprint(before);
    if (body.dry_run !== false)
      return Response.json({ dry_run: true, payment: snapshot(before), fingerprint: hash });
    if (body.confirm !== 'CANCEL_EXACT_UNPAID' || typeof body.reason !== 'string' ||
        body.reason.trim().length < 15 || body.reason.length > 1000) fail('confirmation_and_reason_required', 400);
    if (body.expected_fingerprint !== hash) fail('snapshot_changed');
    // Persist evidence BEFORE a financial mutation; audit failure aborts the action.
    const audit = await base44.asServiceRole.entities.EventoM31ActionLog.create({
      user_email: user.email, user_nome: user.full_name, user_perfil: user.role,
      modulo: 'financeiro', entidade_id: before.id,
      acao: 'Cancelamento pontual solicitado: ' + body.reason.trim(),
      dados_anteriores: JSON.stringify({ payment: snapshot(before), fingerprint: hash }),
    });
    const result = await api('DELETE');
    const after = await api();
    const verified = result.id === before.id && result.deleted === true &&
      after.id === before.id && after.deleted === true;
    let auditUpdated = true;
    try {
      await base44.asServiceRole.entities.EventoM31ActionLog.update(audit.id, {
        acao: (verified ? 'Cancelamento pontual confirmado' : 'Cancelamento exige conferência') +
          ': ' + before.id + '. Motivo: ' + body.reason.trim(),
      });
    } catch { auditUpdated = false; }
    return Response.json({ payment_id: before.id, verified, deleted: after.deleted === true,
      audit_id: audit.id, audit_updated: auditUpdated, registration_unchanged: true },
      { status: verified ? 200 : 502 });
  } catch (error: any) {
    return Response.json({ verified: false, code: error.code || 'operation_failed' },
      { status: error.status || 502 });
  }
})(req);
}
