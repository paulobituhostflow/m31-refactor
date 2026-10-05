// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31ReverterExcecao2Lote — Reversão automática da exceção de 2º lote.
 *
 * Agenda: a cada 30 minutos (via automação).
 *
 * Para cada inscrição com excecao_2lote_expira_em < agora E ainda NÃO paga
 * (status_pagamento em checkout_pendente/checkout_abandonado/pendente):
 *   - reverte valor_pago para excecao_2lote_valor_reverter (lote ativo)
 *   - limpa os campos de exceção
 *   - registra timeline 'excecao_2lote_expirada_revertida'
 *
 * Se a inscrição FOI paga (status_pagamento=aprovado) durante a janela de
 * exceção, a exceção é apenas limpa (valor_pago permanece 129 — valor pago real).
 *
 * Payload: { } (automação agendada)
 */

const STATUS_NAO_PAGO = ['checkout_pendente', 'checkout_abandonado', 'pendente'];

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    try {
      const user = await base44.auth.me();
      if (user && user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    } catch { /* automação agendada */ }

    const S = base44.asServiceRole.entities;
    const agoraIso = new Date().toISOString();

    // Buscar inscrições com exceção ativa expirada
    const expiradas = await S.EventoM31Inscricao.filter(
      { excecao_2lote_expira_em: { $lt: agoraIso } }, '-excecao_2lote_expira_em', 200
    ).catch(() => []);

    const revertidas: any[] = [];
    const pagasLimpas: any[] = [];

    for (const insc of expiradas) {
      // Já paga durante a janela → apenas limpa a exceção (valor real permanece)
      if (!STATUS_NAO_PAGO.includes(insc.status_pagamento)) {
        await S.EventoM31Inscricao.update(insc.id, {
          excecao_2lote_expira_em: null,
          excecao_2lote_valor_reverter: null,
          excecao_2lote_motivo: null,
        }).catch(() => {});
        pagasLimpas.push({ inscricao_id: insc.id, nome: insc.nome, status: insc.status_pagamento, valor_pago: insc.valor_pago });
        continue;
      }

      // Não pagou → reverte valor para o lote ativo
      const valorReverter = insc.excecao_2lote_valor_reverter || insc.valor_pago;
      await S.EventoM31Inscricao.update(insc.id, {
        valor_pago: valorReverter,
        excecao_2lote_expira_em: null,
        excecao_2lote_valor_reverter: null,
        excecao_2lote_motivo: null,
      }).catch(() => {});

      await S.M31InscricaoTimeline.create({
        inscricao_id: insc.id,
        cpf: insc.cpf || null,
        evento: 'excecao_2lote_expirada_revertida',
        etapa: 'excecao_2lote',
        status: 'sucesso',
        detalhe: `Exceção de 2º lote expirou sem pagamento. valor_pago revertido de R$${insc.valor_pago} para R$${valorReverter} (lote ativo). Link de checkout expirado permanece no campo asaas_charge_url para histórico.`,
        origem: 'm31ReverterExcecao2Lote',
      }).catch(() => {});

      revertidas.push({ inscricao_id: insc.id, nome: insc.nome, valor_anterior: insc.valor_pago, valor_revertido: valorReverter });
    }

    return Response.json({
      success: true,
      timestamp: agoraIso,
      expiradas_total: expiradas.length,
      revertidas: revertidas.length,
      pagas_limpas: pagasLimpas.length,
      revertidas_detalhe: revertidas,
      pagas_limpas_detalhe: pagasLimpas,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
