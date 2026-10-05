// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31AuditarGapQR — Auditoria de Gap de QR Code
 *
 * Identifica inscrições APROVADAS que receberam boas-vindas (mensagem enviada)
 * mas NUNCA receberam o QR Code de check-in (qr_envio_status != enviado_com_sucesso).
 *
 * Para cada caso, verifica:
 * - Se a inscrita respondeu via webhook (M31Atendimento existe) → prova de entrega do webhook
 * - Se tem qrcode_token gerado
 * - Se o link do grupo foi enviado
 *
 * Retorna lista acionável para reenvio manual via m31ReenviarQRCode.
 */

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user?.email || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const S = base44.asServiceRole.entities;

    // Buscar todas as inscrições aprovadas/gratuitas com boas-vindas enviadas
    const inscricoes = await S.EventoM31Inscricao.filter(
      { status_pagamento: { $in: ['aprovado', 'gratuito'] } },
      '-created_date', 500
    );

    // Filtrar: tem boas-vindas + QR não enviado + não pendente + não opt-out
    const casos = inscricoes.filter(i =>
      i.data_envio_boas_vindas &&
      i.qr_envio_status !== 'enviado_com_sucesso' &&
      i.cadastro_pendente !== true &&
      i.opt_out !== true
    );

    // Para cada caso, buscar atendimentos (prova de resposta via webhook)
    const detalhes = await Promise.all(
      casos.map(async (insc) => {
        const tel = (insc.whatsapp || '').replace(/\D/g, '');
        const telNorm = tel.startsWith('55') ? tel : `55${tel}`;

        const atendimentos = await S.M31Atendimento.filter(
          { telefone: telNorm, tipo: 'cliente' }, '-created_date', 3
        );

        const logsQR = await S.M31MessageLog.filter(
          { inscricao_id: insc.id, stage: 'qr_code' }, '-enviado_em', 3
        );

        return {
          inscricao_id: insc.id,
          nome: insc.nome,
          whatsapp: insc.whatsapp,
          codigo_inscricao: insc.codigo_inscricao,
          data_envio_boas_vindas: insc.data_envio_boas_vindas,
          qr_envio_status: insc.qr_envio_status,
          status_envio_grupo: insc.status_envio_grupo,
          tem_qr_token: !!insc.qrcode_token,
          respondeu_webhook: atendimentos.length > 0,
          total_atendimentos: atendimentos.length,
          ultimo_atendimento: atendimentos[0]?.recebido_em || null,
          tentativas_log_qr: logsQR.length,
          ultimo_log_qr_sucesso: logsQR[0]?.sucesso ?? null,
        };
      })
    );

    // Agrupar por criticidade
    const responderamSemQR = detalhes.filter(d => d.respondeu_webhook);
    const naoResponderamSemQR = detalhes.filter(d => !d.respondeu_webhook);
    const semQrToken = detalhes.filter(d => !d.tem_qr_token);

    return Response.json({
      timestamp: new Date().toISOString(),
      resumo: {
        total_casos: detalhes.length,
        responderam_mas_sem_qr: responderamSemQR.length,
        nao_responderam_sem_qr: naoResponderamSemQR.length,
        sem_qr_token_gerado: semQrToken.length,
      },
      // CRÍTICO: respondeu mas não recebeu QR → webhook falhou na entrega
      casos_responderam_sem_qr: responderamSemQR,
      // Responderam ao convite mas não houve registro de resposta
      casos_nao_responderam_sem_qr: naoResponderamSemQR,
      acao_recomendada: {
        responderam_sem_qr: 'Reenviar QR imediatamente via m31ReenviarQRCode — a inscrita respondeu e o webhook não entregou a resposta ao sistema.',
        nao_responderam_sem_qr: 'Aguardar resposta da inscrita OU reenviar QR proativamente. A mensagem de boas-vindas pedia que ela respondesse.',
      },
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
