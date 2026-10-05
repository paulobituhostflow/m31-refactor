// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31BuscarPorTelefone
 * 
 * Busca inscrição e logs por número de telefone.
 */

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { telefone } = await req.json();
    if (!telefone) {
      return Response.json({ error: 'Telefone requerido' }, { status: 400 });
    }

    const tel = telefone.replace(/\D/g, '');

    // Buscar inscrição
    const inscricoes = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
      {}, '-created_date', 500
    );
    const insc = inscricoes.find(i => (i.whatsapp || '').replace(/\D/g, '') === tel);

    if (!insc) {
      return Response.json({ error: 'Inscrição não encontrada', telefone: tel });
    }

    // Buscar TODOS os logs deste número
    const todosLogs = await base44.asServiceRole.entities.M31MessageLog.filter(
      {}, '-enviado_em', 500
    );
    const logsDoNumero = todosLogs.filter(l => (l.telefone || '').replace(/\D/g, '') === tel);

    return Response.json({
      inscricao: {
        id: insc.id,
        nome: insc.nome,
        whatsapp: insc.whatsapp,
        email: insc.email,
        recovery_attempts: insc.recovery_attempts,
        last_contact_at: insc.last_contact_at,
        last_recovery_at: insc.last_recovery_at,
        status_pagamento: insc.status_pagamento,
        current_stage: insc.current_stage,
        created_date: insc.created_date
      },
      total_logs_encontrados: logsDoNumero.length,
      logs: logsDoNumero.map(l => ({
        id: l.id,
        tipo: l.tipo,
        stage: l.stage,
        sucesso: l.sucesso,
        enviado_em: l.enviado_em,
        erro: l.erro
      }))
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
