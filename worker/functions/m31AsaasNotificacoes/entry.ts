// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

// Notification preferences only. Never creates charges or touches financial webhooks.
const ASAAS_URL = '__ASAAS_API__';
const CHANNELS = ['emailEnabledForProvider', 'smsEnabledForProvider',
  'emailEnabledForCustomer', 'smsEnabledForCustomer',
  'phoneCallEnabledForCustomer', 'whatsappEnabledForCustomer'];
const CUSTOMER_ID = /^cus_[A-Za-z0-9]+$/;
const NOTIFICATION_ID = /^not_[A-Za-z0-9]+$/;

function fail(code: string, status = 400): never {
  const error = new Error(code);
  Object.assign(error, { code, status });
  throw error;
}
function pageParams(body: Record<string, any>) {
  const offset = Number(body.offset ?? 0), limit = Number(body.limit ?? 100);
  if (!Number.isSafeInteger(offset) || offset < 0 ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 100) fail('invalid_pagination');
  return { offset, limit };
}
function isM31(payment: Record<string, any>) {
  return /(^|[^a-z0-9])m31(?=[^a-z0-9]|filhas|$)/i.test(
    String(payment.externalReference || '') + ' ' + String(payment.description || ''));
}
function notificationSnapshot(notification: Record<string, any>, customerId: string): Record<string, any> {
  if (!NOTIFICATION_ID.test(notification.id) ||
      (notification.customer && notification.customer !== customerId)) fail('notification_ownership_invalid', 409);
  return {
    id: notification.id, customer: customerId, event: notification.event,
    scheduleOffset: notification.scheduleOffset,
    enabled: notification.enabled, deleted: notification.deleted === true,
    ...Object.fromEntries(CHANNELS.map(key => [key, notification[key] ?? false])),
  };
}
function disabled(snapshot: {notificationDisabled?: boolean; notifications: Record<string, any>[]}) {
  return snapshot.notificationDisabled === true && snapshot.notifications.every(notification =>
    notification.deleted || (notification.enabled === false && CHANNELS.every(key => notification[key] === false)));
}
async function digest(value: unknown) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(JSON.stringify(value))))).map(b => b.toString(16).padStart(2, '0')).join('');
}

return (async (req) => {
  let user;
  const base44 = createClientFromRequest(req);
  try { user = await base44.auth.me(); }
  catch { return Response.json({ code: 'unauthenticated' }, { status: 401 }); }
  if (!user || user.role !== 'admin') return Response.json({ code: 'forbidden' }, { status: 403 });
  if (!['GET', 'POST'].includes(req.method)) return Response.json({ code: 'method_not_allowed' }, { status: 405 });

  try {
    const body = req.method === 'POST' ? await req.json() : {};
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail('invalid_body');
    const action = body.action || 'listar';
    const allowed = ['listar', 'consultar_taxas', 'consultar_conta', 'listar_cobrancas',
      'auditar_cliente', 'aplicar_cliente', 'auditar_clientes', 'aplicar_clientes', 'localizar_cobranca', 'listar_clientes', 'listar_assinaturas'];
    if (!allowed.includes(action)) fail('unsupported_action');
    const apiKey = config('ASAAS_API_KEY');
    if (!apiKey) fail('asaas_not_configured', 503);
    const headers = { access_token: apiKey, 'Content-Type': 'application/json' };

    async function api(path: string, method = 'GET', payload: unknown = undefined) {
      const response = await fetch(ASAAS_URL + path, {
        method, headers, redirect: 'error', signal: AbortSignal.timeout(12000),
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      });
      if (!response.ok) fail('asaas_http_' + response.status, 502);
      return await response.json();
    }
    async function all(path: string) {
      const rows = [];
      for (let offset = 0; offset < 10000; offset += 100) {
        const result = await api(path + (path.includes('?') ? '&' : '?') + 'limit=100&offset=' + offset);
        if (!Array.isArray(result.data)) fail('asaas_invalid_page', 502);
        rows.push(...result.data);
        if (result.hasMore === false) {
          if (Number.isFinite(result.totalCount) && rows.length !== result.totalCount) fail('asaas_incomplete_listing', 409);
          return rows;
        }
        if (result.data.length === 0 || result.hasMore !== true) fail('asaas_incomplete_listing', 409);
      }
      fail('asaas_listing_limit', 409);
    }

    async function classify(payments: Record<string, any>[]) {
      const ids = new Set(payments.filter(isM31).map(p => p.id));
      const unknown = payments.filter(p => !ids.has(p.id));
      for (let index = 0; index < unknown.length; index += 100) {
        const slice = unknown.slice(index, index + 100);
        const installmentIds = slice.map(p => p.installment).filter(Boolean);
        const criteria: Record<string, any>[] = [{ asaas_payment_id: { $in: slice.map(p => p.id) } }];
        if (installmentIds.length) criteria.push({ asaas_installment_id: { $in: installmentIds } });
        const rows = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
          { $or: criteria }, 'id', 500, 0, ['id', 'asaas_payment_id', 'asaas_installment_id']);
        if (rows.length >= 500) fail('anchor_listing_incomplete', 409);
        const paymentIds = new Set(rows.map(r => r.asaas_payment_id).filter(Boolean));
        const installments = new Set(rows.map(r => r.asaas_installment_id).filter(Boolean));
        for (const payment of slice) {
          if (paymentIds.has(payment.id) || (payment.installment && installments.has(payment.installment))) ids.add(payment.id);
        }
      }
      return ids;
    }
    async function audit(customerId: string) {
      if (!CUSTOMER_ID.test(customerId || '')) fail('invalid_customer_id');
      const [customer, notifications, payments] = await Promise.all([
        api('/customers/' + customerId),
        all('/customers/' + customerId + '/notifications'),
        all('/payments?customer=' + customerId),
      ]);
      if (customer.id !== customerId || customer.deleted) fail('customer_not_active', 409);
      if (payments.some(p => p.customer !== customerId)) fail('payment_ownership_invalid', 409);
      const m31Ids = await classify(payments);
      const m31 = m31Ids.size;
      const scope = m31 === 0 ? 'outside' : m31 === payments.length ? 'm31' : 'mixed';
      const snapshot = {
        customer_id: customerId, scope,
        payment_count: payments.length, m31_payment_count: m31,
        notificationDisabled: customer.notificationDisabled,
        notifications: notifications.map(n => notificationSnapshot(n, customerId)).sort((a, b) => a.id.localeCompare(b.id)),
      };
      const fingerprint = await digest({ ...snapshot,
        payments: payments.map(p => ({ id: p.id, m31: m31Ids.has(p.id) })).sort((a, b) => a.id.localeCompare(b.id)) });
      return { ...snapshot, fingerprint, all_disabled: disabled(snapshot) };
    }
    async function apply(item: Record<string, any>) {
      const before = await audit(item.customer_id);
      const accountScope = item.scope === 'account';
      if (item.scope && !['m31', 'account'].includes(item.scope)) fail('invalid_scope');
      if (item.dry_run !== false) return { ...before, dry_run: true, eligible: accountScope || before.scope === 'm31' };
      if (item.confirm !== (accountScope ? 'BASE44_ONLY_ACCOUNT' : 'BASE44_ONLY')) fail('confirmation_required');
      // Global scope is explicit; default remains M31-only.
      if (!accountScope && before.scope !== 'm31') fail('scope_blocked', 409);
      if (disabled(before)) return { customer_id: before.customer_id, verified: true, noop: true, after: before };
      if (typeof item.expected_fingerprint !== 'string' || item.expected_fingerprint !== before.fingerprint)
        fail('snapshot_changed', 409);
      const writes = [];
      let writeError;
      try {
        if (before.notificationDisabled !== true) {
          await api('/customers/' + before.customer_id, 'PUT', { notificationDisabled: true });
          writes.push('customer_notification_disabled');
        }
        const changes = before.notifications.filter(n => !n.deleted &&
          (n.enabled !== false || CHANNELS.some(key => n[key] !== false))).map(n => ({
            id: n.id, enabled: false, ...Object.fromEntries(CHANNELS.map(key => [key, false])),
          }));
        if (changes.length) {
          await api('/notifications/batch', 'PUT', { customer: before.customer_id, notifications: changes });
          writes.push('notification_channels_disabled');
        }
      } catch (error: any) { writeError = error.code || 'provider_write_failed'; }
      // A 200 from an update is not proof; verify independently via fresh GETs.
      const after = await audit(before.customer_id);
      const verified = !writeError && (accountScope || after.scope === 'm31') && disabled(after);
      return { customer_id: before.customer_id, verified, noop: writes.length === 0,
        writes, ...(writeError ? { code: writeError } : {}), after };
    }

    if (action === 'localizar_cobranca') {
      if (typeof body.invoice_id !== 'string' || !/^[a-zA-Z0-9]{10,32}$/.test(body.invoice_id)) fail('invalid_invoice_id');
      const payments = await all('/payments');
      const found = payments.filter(p => {
        try {
          const url = new URL(p.invoiceUrl);
          return ['asaas.com', 'www.asaas.com'].includes(url.hostname) &&
            url.pathname.split('/').filter(Boolean).pop() === body.invoice_id;
        } catch { return false; }
      });
      if (found.length !== 1) return Response.json({ code: found.length ? 'ambiguous_invoice' : 'invoice_not_found',
        scanned: payments.length }, { status: found.length ? 409 : 404 });
      const target = found[0];
      const customer = await api('/customers/' + target.customer);
      const fields = ['id', 'customer', 'status', 'deleted', 'value', 'netValue', 'dueDate', 'dateCreated',
        'billingType', 'description', 'externalReference', 'invoiceUrl', 'subscription', 'installment',
        'paymentDate', 'clientPaymentDate'];
      const safePayment = (p: Record<string, any>) => Object.fromEntries(fields.map(key => [key, p[key] ?? null]));
      return Response.json({ payment: safePayment(target),
        customer: { id: customer.id, name: customer.name, phone_last4: String(customer.mobilePhone || customer.phone || '').slice(-4),
          notificationDisabled: customer.notificationDisabled },
        related_payments: payments.filter(p => p.customer === target.customer).map(safePayment),
        fingerprint: await digest(safePayment(target)) });
    }

    if (['listar', 'listar_cobrancas', 'listar_clientes', 'listar_assinaturas'].includes(action)) {
      const { offset, limit } = pageParams(body);
      const path = { listar: '/notifications', listar_cobrancas: '/payments',
        listar_clientes: '/customers', listar_assinaturas: '/subscriptions' }[action];
      const data = await api(path + '?limit=' + limit + '&offset=' + offset);
      if (action === 'listar_cobrancas') {
        const ids = await classify(data.data || []);
        data.data = (data.data || []).map((p: Record<string, any>) => ({
          id: p.id, customer: p.customer, m31: ids.has(p.id), status: p.status,
          value: p.value, netValue: p.netValue, billingType: p.billingType, dueDate: p.dueDate,
          dateCreated: p.dateCreated, externalReference: p.externalReference,
          description: p.description, subscription: p.subscription, installment: p.installment,
          invoiceUrl: p.invoiceUrl, deleted: p.deleted, paymentDate: p.paymentDate, clientPaymentDate: p.clientPaymentDate,
        }));
      }
      if (action === 'listar_clientes') data.data = (data.data || []).map(c => ({
        id: c.id, notificationDisabled: c.notificationDisabled, deleted: c.deleted }));
      if (action === 'listar_assinaturas') data.data = (data.data || []).map(s => ({
        id: s.id, customer: s.customer, status: s.status, value: s.value, cycle: s.cycle,
        description: s.description, externalReference: s.externalReference, nextDueDate: s.nextDueDate }));
      return Response.json({ status: 200, data });
    }
    if (action === 'consultar_taxas' || action === 'consultar_conta') {
      const data = await api(action === 'consultar_taxas' ? '/myAccount/fees' : '/myAccount');
      return Response.json({ status: 200, data });
    }
    if (action === 'auditar_cliente') return Response.json(await audit(body.customer_id));
    if (action === 'aplicar_cliente') {
      const result = await apply(body);
      return Response.json(result, { status: result.verified === false ? 502 : 200 });
    }
    // Small bounded batches; each customer has its own snapshot, result and verification.
    const items = body.items;
    if (!Array.isArray(items) || !items.length || items.length > 5 ||
        new Set(items.map(i => i?.customer_id)).size !== items.length ||
        items.some(i => !CUSTOMER_ID.test(i?.customer_id || ''))) fail('invalid_batch');
    const results = [];
    for (let index = 0; index < items.length; index += 2) {
      results.push(...await Promise.all(items.slice(index, index + 2).map(async (item: Record<string, any>) => {
        try {
          const result: Record<string, any> = action === 'auditar_clientes' ? await audit(item.customer_id) :
            await apply({ ...item, scope: body.scope, dry_run: body.dry_run, confirm: body.confirm });
          return { status: result.verified === false ? 502 : 200, ...result };
        } catch (error: any) {
          return { customer_id: item.customer_id, status: error.status || 502, verified: false,
            code: error.code || 'operation_failed' };
        }
      })));
    }
    return Response.json({ results, complete: results.every(r => r.status === 200) });
  } catch (error: any) {
    return Response.json({ code: error.code || 'operation_failed', verified: false },
      { status: error.status || 502 });
  }
})(req);
}
