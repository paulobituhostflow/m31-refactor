// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31EnviarComprovanteFornecedor
 *
 * Envia o comprovante de pagamento de uma parcela (SupplierPayment) ao fornecedor
 * via WhatsApp (UAZAPI). Suporta imagem (jpg/png) e documento (pdf).
 * Marca a parcela como comprovante_enviado_whatsapp = true.
 *
 * Payload: { payment_id: string }
 */

const THALITA_PHONE = '5581986777702';

function sanitizePhone(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  return `55${digits}`;
}

function formatBRL(v: number): string {
  return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { payment_id } = await req.json();
    if (!payment_id) return Response.json({ error: 'payment_id é obrigatório' }, { status: 400 });

    const payment = await base44.entities.SupplierPayment.get(payment_id);
    if (!payment) return Response.json({ error: 'Parcela não encontrada' }, { status: 404 });
    if (!payment.comprovante_url) return Response.json({ error: 'Esta parcela não tem comprovante anexado' }, { status: 400 });

    const supplier = await base44.entities.FinancialSupplier.get(payment.supplier_id);
    const telefone = supplier?.telefone;
    if (!telefone) return Response.json({ error: 'Fornecedor não possui telefone cadastrado' }, { status: 400 });

    const token = config('UAZAPI_TOKEN');
    if (!token) return Response.json({ error: 'UAZAPI_TOKEN não configurado' }, { status: 500 });
    const baseUrl = (config('UAZAPI_BASE') || '__UAZAPI_API__').replace(/\/+$/, '');
    const phone = sanitizePhone(telefone);

    const parcelaLabel = payment.numero_parcela && payment.total_parcelas
      ? ` (parcela ${payment.numero_parcela}/${payment.total_parcelas})`
      : '';
    const caption = `Olá! Segue o comprovante de pagamento${parcelaLabel} no valor de ${formatBRL(payment.valor)}.${payment.descricao ? `\n${payment.descricao}` : ''}`;

    const isPdf = /\.pdf(\?|$)/i.test(payment.comprovante_url);
    const mediaUrl = `${baseUrl}/send/media`;
    const filename = isPdf ? 'comprovante.pdf' : 'comprovante.jpg';

    // Forçar HTTP/1.1 via undici (evita 405)


    async function enviarMedia(destino: string, legenda: string) {
      const payload = JSON.stringify({
        number: destino,
        phone: destino,
        type: isPdf ? 'document' : 'image',
        file: payment.comprovante_url,
        docName: filename,
        filename: filename,
        caption: legenda,
        text: legenda,
      });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      try {
        const resp = await fetch(mediaUrl, {
          method: 'POST',
          headers: { 'token': token, 'Content-Type': 'application/json' },
          body: payload,
          signal: controller.signal,
        });
        const body = await resp.text();
        let ok = resp.status === 200;
        try {
          const json = JSON.parse(body);
          if (json?.error || json?.status === 'error') ok = false;
        } catch { /* ignore */ }
        return { ok, status: resp.status, body };
      } catch (err: any) {
        if (err?.name === 'AbortError') return { ok: false, status: 0, body: 'Timeout: UAZAPI não respondeu em 20s' };
        return { ok: false, status: 0, body: (err as Error).message };
      } finally {
        clearTimeout(timer);
      }
    }

    // 1) Envia ao fornecedor
    const rFornecedor = await enviarMedia(phone, caption);

    // 2) Envia cópia para a gestora Thalita
    const captionThalita = `📄 Comprovante enviado ao fornecedor *${supplier.nome}*${parcelaLabel} — ${formatBRL(payment.valor)}.`;
    const rThalita = await enviarMedia(THALITA_PHONE, captionThalita);

    if (rFornecedor.ok) {
      await base44.entities.SupplierPayment.update(payment_id, {
        comprovante_enviado_whatsapp: true,
        comprovante_enviado_em: new Date().toISOString(),
      });
    }

    return Response.json({
      sucesso: rFornecedor.ok,
      fornecedor: { status: rFornecedor.status, body: rFornecedor.body, phone },
      thalita: { enviado: rThalita.ok, status: rThalita.status },
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
})(req);
}
