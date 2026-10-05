// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31GerarPixDireto — Gera uma cobrança PIX pura no Asaas e retorna o código
 * "copia e cola" (payload) para envio manual via WhatsApp. Usado quando a
 * participante tem dificuldade com o formulário do checkout (ex: busca de
 * cidade no cartão) e precisa de um PIX direto sem preencher nada.
 *
 * Fluxo:
 *   1. Localiza/cria customer Asaas pelo CPF.
 *   2. Cria payment billingType=PIX, value=valor_pago da inscrição,
 *      externalReference=codigo_inscricao (garante match do webhook na aprovação).
 *   3. Consulta GET /payments/{id}/pixQrCode para obter payload + qrCode.
 *   4. Registra timeline (auditoria). NÃO sobrescreve asaas_charge_url nem
 *      asaas_checkout_id (o link de checkout permanece válido para cartão).
 *
 * Payload: { inscricao_id: string }
 * Retorna: { success, payload, qrCode, value, dueDate, payment_id, nome, cpf }
 */

const ASAAS_BASE = '__ASAAS_API__';

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { inscricao_id } = await req.json();
    if (!inscricao_id) return Response.json({ error: 'inscricao_id obrigatório' }, { status: 400 });

    const insc = await base44.asServiceRole.entities.EventoM31Inscricao.get(inscricao_id);
    if (!insc) return Response.json({ error: 'Inscrição não encontrada' }, { status: 404 });

    if (['aprovado', 'gratuito'].includes(insc.status_pagamento)) {
      return Response.json({ error: 'inscricao_ja_aprovada', detalhe: 'Pagamento já confirmado.' }, { status: 400 });
    }

    const ASAAS_KEY = config('ASAAS_API_KEY');
    const cpfLimpo = (insc.cpf || '').replace(/\D/g, '');
    const valor = insc.valor_pago > 0 ? insc.valor_pago : 0;
    if (!valor) return Response.json({ error: 'valor_pago ausente — defina o valor antes de gerar PIX.' }, { status: 400 });

    // 1. Find or create Asaas customer by CPF
    let customerId;
    if (cpfLimpo.length === 11) {
      const custRes = await fetch(`${ASAAS_BASE}/customers?cpfCnpj=${cpfLimpo}`, {
        headers: { access_token: ASAAS_KEY },
      });
      const custData = await custRes.json();
      if (custData.data?.length > 0) customerId = custData.data[0].id;
    }
    if (!customerId) {
      const createRes = await fetch(`${ASAAS_BASE}/customers`, {
        method: 'POST',
        headers: { access_token: ASAAS_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: insc.nome,
          cpfCnpj: cpfLimpo || undefined,
          email: insc.email || undefined,
          mobilePhone: insc.whatsapp || undefined,
          notificationDisabled: true,
        }),
      });
      const created = await createRes.json();
      if (!created.id) return Response.json({ error: 'Erro ao criar customer no Asaas', details: created }, { status: 500 });
      customerId = created.id;
    }

    // BEGIN BASE44_ONLY_NOTIFICATIONS: also enforce for reused Asaas customers.
    const noticeResponse = await fetch('__ASAAS_API__/customers/' + customerId, {
      method: 'PUT', headers: { access_token: ASAAS_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationDisabled: true }),
      redirect: 'error', signal: AbortSignal.timeout(12000),
    });
    const noticeCustomer = await noticeResponse.json();
    if (!noticeResponse.ok || noticeCustomer.id !== customerId || noticeCustomer.notificationDisabled !== true)
      throw new Error('Não foi possível garantir a comunicação exclusiva pelo Base44. Nenhuma nova cobrança foi criada.');
    // END BASE44_ONLY_NOTIFICATIONS

    // 2. dueDate: data do evento se futura, senão +30 dias
    let dueDate;
    const configs = await base44.asServiceRole.entities.EventoM31Configuracao.list('-created_date', 1);
    const eventData = configs[0]?.data_inicio;
    if (eventData) {
      const eventDate = new Date(eventData);
      if (eventDate > new Date()) dueDate = eventData.slice(0, 10);
    }
    if (!dueDate) dueDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

    // 3. Cria payment PIX puro
    const payRes = await fetch(`${ASAAS_BASE}/payments`, {
      method: 'POST',
      headers: { access_token: ASAAS_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: customerId,
        billingType: 'PIX',
        value: valor,
        dueDate,
        description: `M31 Filhas - Inscricao ${insc.codigo_inscricao || ''}`,
        externalReference: insc.codigo_inscricao || insc.id,
      }),
    });
    const payment = await payRes.json();
    if (!payment.id) return Response.json({ error: 'Erro ao criar cobranca PIX no Asaas', details: payment }, { status: 500 });

    // 4. Consulta QR Code / payload PIX
    let pixPayload = payment.pixTransaction?.payload || null;
    let pixQr = payment.pixTransaction?.qrCode || null;
    if (!pixPayload) {
      const qrRes = await fetch(`${ASAAS_BASE}/payments/${payment.id}/pixQrCode`, {
        headers: { access_token: ASAAS_KEY },
      });
      if (qrRes.status === 200) {
        const qrData = await qrRes.json();
        pixPayload = qrData.payload || null;
        pixQr = qrData.qrCode || null;
      }
    }
    if (!pixPayload) return Response.json({ error: 'PIX criado mas payload indisponivel', payment_id: payment.id }, { status: 500 });

    // 5. Timeline (auditoria) — NAO sobrescreve checkout link
    await base44.asServiceRole.entities.M31InscricaoTimeline.create({
      inscricao_id: insc.id,
      cpf: cpfLimpo || null,
      evento: 'pix_direto_gerado',
      etapa: 'pix_direto',
      status: 'sucesso',
      detalhe: `PIX copia/cola gerado. valor=R$${valor} | payment_id=${payment.id} | dueDate=${dueDate} | customer=${customerId} | externalRef=${insc.codigo_inscricao}`,
      origem: 'm31GerarPixDireto',
    }).catch(() => {});

    return Response.json({
      success: true,
      payload: pixPayload,
      qrCode: pixQr,
      value: valor,
      dueDate,
      payment_id: payment.id,
      invoiceUrl: payment.invoiceUrl || null,
      nome: insc.nome,
      cpf: cpfLimpo,
      inscricao_id: insc.id,
      codigo_inscricao: insc.codigo_inscricao,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
