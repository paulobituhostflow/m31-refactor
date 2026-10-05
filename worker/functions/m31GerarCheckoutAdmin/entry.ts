// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31GerarCheckoutAdmin — Admin-only.
 * Gera um checkout Asaas (PIX + Boleto + Cartão até 2x) para uma inscrição
 * específica via inscricao_id, SEM passar pela lógica de deduplicação do
 * m31CreatePayment. Usado quando o participante precisa de um novo link de
 * pagamento mas existe conflito de WhatsApp/CPF/email com outra inscrição.
 */

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden — admin only' }, { status: 403 });

    const body = await req.json();
    const { inscricao_id } = body;
    if (!inscricao_id) return Response.json({ error: 'inscricao_id é obrigatório' }, { status: 400 });

    const inscricao = await base44.asServiceRole.entities.EventoM31Inscricao.get(inscricao_id);
    if (!inscricao) return Response.json({ error: 'Inscrição não encontrada' }, { status: 404 });

    // Buscar lote para valor
    const lotes = await base44.asServiceRole.entities.EventoM31Lote.filter({ codigo: inscricao.lote });
    let lote = lotes[0];
    if (!lote) {
      const todos = await base44.asServiceRole.entities.EventoM31Lote.list('-ordem', 10);
      lote = todos[0];
    }
    if (!lote) return Response.json({ error: 'Nenhum lote encontrado' }, { status: 500 });

    const valor = inscricao.valor_pago || lote.valor;
    const codigo = inscricao.codigo_inscricao || `M31-${Date.now().toString(36).toUpperCase()}`;
    const nome = inscricao.nome || 'Participante';

    const ASAAS_KEY = config('ASAAS_API_KEY');
    const ASAAS_BASE = '__ASAAS_API__';

    const cpfLimpo = (inscricao.cpf || '').replace(/\D/g, '');
    const whatsappFull = inscricao.whatsapp || '';
    const checkoutRes = await fetch(`${ASAAS_BASE}/checkouts`, {
      method: 'POST',
      headers: { 'access_token': ASAAS_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        billingTypes: ['PIX', 'CREDIT_CARD'],
        chargeTypes: ['DETACHED', 'INSTALLMENT'],
        installment: { maxInstallmentCount: 2 },
        minutesToExpire: 1440,
        externalReference: codigo,
        callback: {
          successUrl: '__APP_ORIGIN__/obrigado',
          cancelUrl: '__APP_ORIGIN__/m31-inscricao',
          expiredUrl: '__APP_ORIGIN__/m31-inscricao'
        },
        items: [{
          name: 'M31 Filhas - Inscricao',
          description: `M31 Filhas - ${lote.nome} - ${nome}`,
          value: valor,
          quantity: 1
        }]
      })
    });
    const checkout = await checkoutRes.json();
    if (!checkout.link) {
      return Response.json({ error: 'Erro ao criar checkout no Asaas', details: checkout }, { status: 500 });
    }

    await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao_id, {
      asaas_charge_url: checkout.link,
      status_pagamento: 'checkout_pendente',
      valor_pago: valor,
    });

    // Log de auditoria
    await base44.asServiceRole.entities.EventoM31ActionLog.create({
      user_email: user.email,
      user_nome: user.full_name,
      user_perfil: user.role,
      acao: `Checkout admin gerado para ${nome} (inscricao ${inscricao_id})`,
      modulo: 'inscricoes',
      entidade_id: inscricao_id,
      entidade_nome: nome,
    }).catch(() => {});

    return Response.json({
      success: true,
      inscricao_id,
      nome,
      codigo_inscricao: codigo,
      payment_url: checkout.link,
      valor,
      lote: lote.nome,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
