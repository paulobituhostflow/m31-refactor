// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31CancelarCadastroDuplicado — cancelamento INDIVIDUAL de cadastro.
 *
 * Cancela UMA inscrição por vez (nunca em lote). Só executa se o registro
 * for organização de cadastro pura — checkout abandonado SEM pagamento.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  REGRA PERMANENTE Nº 0 (constituição M31) — TRAVA DE DINHEIRO REAL:
 *  Se o registro envolver dinheiro real (status aprovado, asaas_payment_id
 *  presente, ou pagamento confirmado no Asaas), esta função PARA e recusa.
 *  Não estorna, não cancela cobrança, não toca em dinheiro. Só cadastro.
 * ═══════════════════════════════════════════════════════════════════
 */

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Apenas administradores' }, { status: 403 });
    }

    const { inscricao_id } = await req.json();
    if (!inscricao_id) {
      return Response.json({ error: 'inscricao_id obrigatório' }, { status: 400 });
    }

    const insc = await base44.asServiceRole.entities.EventoM31Inscricao.get(inscricao_id).catch(() => null);
    if (!insc) {
      return Response.json({ error: 'Inscrição não encontrada' }, { status: 404 });
    }

    // ── TRAVA DE DINHEIRO REAL (Regra Nº 0) ──
    const envolveDinheiro =
      insc.status_pagamento === 'aprovado' ||
      (insc.valor_pago > 0 && insc.asaas_payment_id) ||
      !!insc.asaas_payment_id;

    if (envolveDinheiro) {
      return Response.json({
        error: 'BLOQUEADO pela trava de dinheiro real. Este registro envolve pagamento e só pode ser tratado com decisão manual explícita (estorno/manter), caso a caso.',
        bloqueado_regra_0: true,
        status_local: insc.status_pagamento,
        asaas_payment_id: insc.asaas_payment_id || null,
      }, { status: 409 });
    }

    if (insc.status_pagamento !== 'checkout_pendente') {
      return Response.json({
        error: `Só cancela cadastros em 'checkout_pendente'. Status atual: ${insc.status_pagamento}.`,
      }, { status: 409 });
    }

    // Organização de cadastro — sem mover dinheiro. Libera o CPF para reinscrição.
    const novoDedup = insc.dedup_key
      ? `${insc.dedup_key}:CANCELLED:${insc.id}`
      : `CANCELLED:${insc.id}`;

    await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao_id, {
      status_pagamento: 'cancelado',
      dedup_key: novoDedup,
      observacoes: `${insc.observacoes ? insc.observacoes + ' | ' : ''}duplicata — checkout abandonado, sem pagamento (cancelado por ${user.email} em ${new Date().toISOString()})`,
    });

    return Response.json({ success: true, inscricao_id, nome: insc.nome, cancelado_por: user.email });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
