// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31BuscarJulianna
 * 
 * Busca Julianna no banco de inscrições e todos seus logs.
 */

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Buscar inscrições com nome contendo "Julianna" ou "Julianne"
    const inscricoes = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
      {}, '-created_date', 500
    );
    const julianas = inscricoes.filter(i => 
      (i.nome || '').toLowerCase().includes('julian')
    );

    // Buscar logs de cobrança
    const todosLogs = await base44.asServiceRole.entities.M31MessageLog.filter(
      { tipo: 'cobranca' }, '-enviado_em', 500
    );

    const resultado = julianas.map(insc => {
      const logsInsc = todosLogs.filter(l => l.inscricao_id === insc.id);
      return {
        id: insc.id,
        nome: insc.nome,
        whatsapp: insc.whatsapp,
        email: insc.email,
        recovery_attempts: insc.recovery_attempts,
        last_contact_at: insc.last_contact_at,
        last_recovery_at: insc.last_recovery_at,
        status_pagamento: insc.status_pagamento,
        current_stage: insc.current_stage,
        total_logs_cobranca: logsInsc.length,
        logs_cobranca_detalhes: logsInsc.map(l => ({
          id: l.id,
          telefone: l.telefone,
          sucesso: l.sucesso,
          enviado_em: l.enviado_em,
          tipo: l.tipo,
          stage: l.stage,
          erro: l.erro
        }))
      };
    });

    return Response.json({
      total_encontradas: resultado.length,
      julianas: resultado
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
