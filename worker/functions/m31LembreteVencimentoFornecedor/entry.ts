// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31LembreteVencimentoFornecedor
 *
 * Roda periodicamente (automação agendada). Verifica parcelas de fornecedores
 * (SupplierPayment) com status 'pendente' cujo vencimento está próximo (dentro de
 * `dias_antecedencia`, padrão 3 dias) e ainda não tiveram lembrete enviado.
 * Notifica a gestora Thalita (+55 81 98677-7702) via WhatsApp (UAZAPI) e marca
 * a parcela com lembrete_vencimento_enviado = true (idempotência).
 *
 * Payload opcional: { dias_antecedencia?: number }
 */

const THALITA_PHONE = '5581986777702';

function formatBRL(v: number): string {
  return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

async function enviarTexto(baseUrl: string, token: string, phone: string, text: string) {

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const resp = await fetch(`${baseUrl}/send/text`, {
      method: 'POST',
      headers: { 'token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: phone, phone, text }),
      signal: controller.signal,
    });
    const body = await resp.text();
    let sucesso = resp.status === 200;
    try {
      const json = JSON.parse(body);
      if (json?.error || json?.status === 'error') sucesso = false;
    } catch { /* ignore */ }
    return { sucesso, status: resp.status, body };
  } finally {
    clearTimeout(timer);
  }
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let dias = 3;
    try {
      const payload = await req.json();
      if (payload?.dias_antecedencia) dias = Number(payload.dias_antecedencia);
    } catch { /* sem payload */ }

    const token = config('UAZAPI_TOKEN');
    if (!token) return Response.json({ error: 'UAZAPI_TOKEN não configurado' }, { status: 500 });
    const baseUrl = (config('UAZAPI_BASE') || '__UAZAPI_API__').replace(/\/+$/, '');

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const limite = new Date(hoje);
    limite.setDate(limite.getDate() + dias);

    const pendentes = await base44.asServiceRole.entities.SupplierPayment.filter({ status: 'pendente' }, 'vencimento', 500);

    const aVencer = pendentes.filter((p: any) => {
      if (p.lembrete_vencimento_enviado) return false;
      if (!p.vencimento) return false;
      const venc = new Date(p.vencimento + 'T00:00:00');
      return venc >= hoje && venc <= limite;
    });

    let enviados = 0;
    const resultados: any[] = [];

    for (const p of aVencer) {
      const parcelaLabel = p.numero_parcela && p.total_parcelas ? ` (parcela ${p.numero_parcela}/${p.total_parcelas})` : '';
      const vencStr = new Date(p.vencimento + 'T00:00:00').toLocaleDateString('pt-BR');
      const text = `🔔 *Lembrete de vencimento — Fornecedor*\n\n` +
        `Fornecedor: *${p.supplier_nome || '—'}*\n` +
        `${p.descricao || 'Pagamento'}${parcelaLabel}\n` +
        `Valor: *${formatBRL(p.valor)}*\n` +
        `Vencimento: *${vencStr}*\n\n` +
        `Essa parcela vence em breve e ainda está pendente.`;

      const r = await enviarTexto(baseUrl, token, THALITA_PHONE, text);
      resultados.push({ payment_id: p.id, sucesso: r.sucesso, status: r.status });
      if (r.sucesso) {
        await base44.asServiceRole.entities.SupplierPayment.update(p.id, { lembrete_vencimento_enviado: true });
        enviados++;
      }
    }

    return Response.json({ ok: true, verificadas: aVencer.length, enviados, resultados });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
})(req);
}
