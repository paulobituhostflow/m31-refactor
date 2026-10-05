// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31GarantirControleDiario — cria o registro M31WhatsAppControl do dia (fuso Recife)
 * se ele ainda não existir. Sem esse registro o drenador para por fail-closed,
 * o que paralisava silenciosamente TODAS as filas de mensagens.
 *
 * NÃO altera kill-switch nem limites de registros já existentes.
 * Herda limites do último dia registrado (limite_diario, modo_retomada) para
 * não afrouxar nem endurecer a governança sem decisão humana.
 */

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    try {
      const user = await base44.auth.me();
      if (user && user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    } catch { /* automação agendada */ }

    const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
    const existentes = await base44.asServiceRole.entities.M31WhatsAppControl.filter({ data: hoje });
    if (existentes.length > 0) {
      return Response.json({ criado: false, data: hoje, bloqueado: existentes[0].bloqueado === true });
    }

    const anteriores = await base44.asServiceRole.entities.M31WhatsAppControl.list('-data', 1);
    const base = anteriores[0] || {};

    const novo = await base44.asServiceRole.entities.M31WhatsAppControl.create({
      data: hoje,
      bloqueado: false,
      modo_retomada: base.modo_retomada === true,
      limite_diario: base.limite_diario || 40,
      limite_diario_retomada: base.limite_diario_retomada || 5,
      limite_por_execucao: base.limite_por_execucao || 1,
      mensagens_enviadas_hoje: 0,
      boas_vindas_enviadas: 0,
      cobrancas_enviadas: 0,
      total_falhas_hoje: 0,
      total_optouts_hoje: 0,
    });

    return Response.json({ criado: true, data: hoje, id: novo.id, limite_diario: novo.limite_diario });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
