// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31AmostragemAuditoria
 * 
 * Retorna 3 amostragens aleatórias dos 65 leads nunca contatados
 * para verificação manual no WhatsApp.
 */

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 1. Buscar os 65 resetados (current_stage = 'd0' E recovery_attempts = 0)
    const resetados = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
      { current_stage: 'd0', recovery_attempts: 0 }, '-created_date', 300
    );

    // Filtrar apenas os que eram nunca contatados (sem last_contact_at após reset)
    const nuncaContatados = resetados.filter(lead => !lead.last_contact_at || lead.last_contact_at === null);

    // 4. Selecionar 3 aleatórios
    const amostra = [];
    const indices = new Set();
    while (amostra.length < 3 && amostra.length < nuncaContatados.length) {
      const idx = Math.floor(Math.random() * nuncaContatados.length);
      if (!indices.has(idx)) {
        indices.add(idx);
        const lead = nuncaContatados[idx];
        amostra.push({
          nome: lead.nome,
          whatsapp: lead.whatsapp,
          email: lead.email,
          status_pagamento: lead.status_pagamento,
          recovery_attempts: lead.recovery_attempts || 0,
          created_date: lead.created_date,
          observacoes: lead.observacoes || '',
        });
      }
    }

    return Response.json({
      amostragem: amostra,
      total_nunca_contatados: nuncaContatados.length,
      instrucoes: 'Procure no WhatsApp por estes números. Se houver conversa registrada no banco, avise para revisão do M31MessageLog.'
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
