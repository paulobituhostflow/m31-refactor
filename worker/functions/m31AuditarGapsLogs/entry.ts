// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31AuditarGapsLogs
 * 
 * Encontra inscrições que têm recovery_attempts > 0 ou last_contact_at preenchido
 * mas NÃO têm logs correspondentes em M31MessageLog.
 * 
 * Identifica qual função faltou ao registrar.
 */

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 1. Buscar todas as inscrições com contato registrado
    const todasInscricoes = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
      {}, '-updated_date', 500
    );

    const comContato = todasInscricoes.filter(i => 
      (i.recovery_attempts && i.recovery_attempts > 0) || i.last_contact_at
    );

    // 2. Buscar TODOS os logs
    const todosLogs = await base44.asServiceRole.entities.M31MessageLog.filter(
      {}, '-enviado_em', 1000
    );

    const idsComLog = new Set(todosLogs.map(l => l.inscricao_id));

    // 3. Filtrar: tem tentativa/contato registrado MAS sem log correspondente
    const gaps = comContato.filter(i => !idsComLog.has(i.id));

    // 4. Separar por tipo de gap
    const comRecoveryAttempts = gaps.filter(i => i.recovery_attempts && i.recovery_attempts > 0);
    const comLastContact = gaps.filter(i => i.last_contact_at && !i.recovery_attempts);

    // 5. Procurar Julianna especificamente
    const julianna = gaps.find(i => i.nome?.includes('Julianna'));

    return Response.json({
      total_inscricoes: todasInscricoes.length,
      total_com_contato_registrado: comContato.length,
      total_logs: todosLogs.length,
      gaps_encontrados: gaps.length,
      com_recovery_attempts_sem_log: comRecoveryAttempts.length,
      com_last_contact_sem_log: comLastContact.length,
      
      julianna_auditoria: julianna ? {
        id: julianna.id,
        nome: julianna.nome,
        recovery_attempts: julianna.recovery_attempts,
        last_contact_at: julianna.last_contact_at,
        last_recovery_at: julianna.last_recovery_at,
        observacao: 'NÃO TEM LOG EM M31MessageLog mas tem recovery_attempts > 0'
      } : 'Julianna não encontrada com gap',

      amostra_gaps_10: gaps.slice(0, 10).map(i => ({
        id: i.id,
        nome: i.nome,
        whatsapp: i.whatsapp,
        recovery_attempts: i.recovery_attempts,
        last_contact_at: i.last_contact_at,
        current_stage: i.current_stage,
        status_pagamento: i.status_pagamento
      }))
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
