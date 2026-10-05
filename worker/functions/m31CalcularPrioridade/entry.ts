// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

// Calcula prioridade de cada lead pendente e define next_contact_at para novos leads
// Roda diariamente às 08:30

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const leads = await base44.asServiceRole.entities.EventoM31Inscricao.filter({
      status_pagamento: ['pendente', 'checkout_abandonado'],
      opt_out: false,
    }, '-created_date', 1000);

    const agora = Date.now();
    let atualizados = 0;

    for (const lead of leads) {
      const criadoHa = (agora - new Date(lead.created_date).getTime()) / (1000 * 60 * 60); // horas
      const valor = lead.valor_pago || 0;
      const tentativas = lead.recovery_attempts || 0;

      let priority = 'medium';

      // HIGH: valor alto OU abandono recente (< 6h)
      if (valor >= 150 || criadoHa < 6) priority = 'high';
      // LOW: já tentou 3+ vezes OU lead muito antigo (> 5 dias)
      else if (tentativas >= 3 || criadoHa > 120) priority = 'low';

      // Inicializar stage e next_contact_at para leads novos sem stage
      const updates = { priority };

      if (!lead.current_stage || lead.current_stage === 'encerrado' && lead.status_pagamento !== 'aprovado') {
        if (!lead.current_stage) {
          updates.current_stage = 'd0';
          // next_contact_at: imediato se < 1h, senão agora às 09:00
          const next = new Date();
          if (criadoHa < 1) {
            // dispara logo
            next.setMinutes(next.getMinutes() + 5);
          } else {
            next.setHours(9, 0, 0, 0);
            if (next.getTime() < agora) next.setDate(next.getDate() + 1);
          }
          updates.next_contact_at = next.toISOString();
        }
      }

      await base44.asServiceRole.entities.EventoM31Inscricao.update(lead.id, updates);
      atualizados++;
    }

    return Response.json({ success: true, atualizados, rodou_em: new Date().toISOString() });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
