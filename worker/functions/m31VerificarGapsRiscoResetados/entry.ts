// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31VerificarGapsRiscoResetados
 * 
 * Cruza os 11 leads COM recovery_attempts mas SEM log
 * com os 65 que foram resetados para d0 hoje.
 * 
 * ALERTA: Se há sobreposição, estão em risco de duplicata AMANHÃ 10h
 */

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 1. Obter os 11 gaps (recovery_attempts > 0 mas sem log)
    const todasInscricoes = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
      {}, '-updated_date', 500
    );
    const comRecovery = todasInscricoes.filter(i => i.recovery_attempts && i.recovery_attempts > 0);
    
    const todosLogs = await base44.asServiceRole.entities.M31MessageLog.filter(
      {}, '-enviado_em', 1000
    );
    const idsComLog = new Set(todosLogs.map(l => l.inscricao_id));

    const gaps = comRecovery.filter(i => !idsComLog.has(i.id));

    // 2. Obter leads resetados para d0 (identificar por current_stage === 'd0' com recovery_attempts ainda > 0)
    // Estes seriam os que foram "reenergizados" hoje
    const resetados = todasInscricoes.filter(i => 
      i.current_stage === 'd0' && i.recovery_attempts && i.recovery_attempts > 0
    );

    // 3. Encontrar intersecção
    const gapsIds = new Set(gaps.map(g => g.id));
    const sobrepostos = resetados.filter(r => gapsIds.has(r.id));

    // 4. Detalhar risco
    const risco = sobrepostos.map(lead => {
      const logsDoNumero = todosLogs.filter(l => 
        (l.telefone || '').replace(/\D/g, '') === (lead.whatsapp || '').replace(/\D/g, '')
      );
      return {
        id: lead.id,
        nome: lead.nome,
        whatsapp: lead.whatsapp,
        recovery_attempts: lead.recovery_attempts,
        current_stage: lead.current_stage,
        status_pagamento: lead.status_pagamento,
        logs_do_numero: logsDoNumero.length,
        alerta: 'TEM RECOVERY_ATTEMPTS MAS SEM LOG = PODE RECEBER DUPLICATA AMANHÃ 10h'
      };
    });

    return Response.json({
      total_gaps_identificados: gaps.length,
      total_resetados_hoje: resetados.length,
      sobrepostos_em_risco: risco.length,
      detalhes_risco: risco,
      acao_recomendada: risco.length > 0 
        ? 'CRITICAL: Resetar recovery_attempts desses leads para 0 ANTES das 10h' 
        : 'OK: Nenhuma sobreposição'
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
