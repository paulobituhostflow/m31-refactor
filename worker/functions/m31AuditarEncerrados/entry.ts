// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31AuditarEncerrados
 * 
 * Cruza todos os leads com current_stage = 'encerrado' contra M31MessageLog.
 * Retorna quem NUNCA recebeu nenhuma mensagem real (cobranca ou recuperacao)
 * e os reseta para d0 se reset=true for passado no body.
 */

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const resetar = body.reset === true;

    // 1. Buscar todos encerrados
    const encerrados = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
      { current_stage: 'encerrado' }, '-created_date', 300
    );

    // 2. Buscar todos os logs de cobrança e recuperação (tipos que indicam contato real)
    const [logsCobranca, logsRecuperacao, logsCheckout] = await Promise.all([
      base44.asServiceRole.entities.M31MessageLog.filter({ tipo: 'cobranca' }, '-enviado_em', 500),
      base44.asServiceRole.entities.M31MessageLog.filter({ tipo: 'recuperacao' }, '-enviado_em', 500),
      base44.asServiceRole.entities.M31MessageLog.filter({ tipo: 'recuperacao_checkout' }, '-enviado_em', 500),
    ]);

    // Indexar: set de inscricao_ids que têm log real
    const idsComLog = new Set([
      ...logsCobranca.map(l => l.inscricao_id),
      ...logsRecuperacao.map(l => l.inscricao_id),
      ...logsCheckout.map(l => l.inscricao_id),
    ]);

    // 3. Separar: nunca contatados vs contatados
    const nuncaContatados = [];
    const contatados = [];

    for (const lead of encerrados) {
      const temLog = idsComLog.has(lead.id);
      const semLink = !lead.asaas_charge_url;
      const importado = (lead.observacoes || '').includes('Importado do sistema anterior');

      if (temLog) {
        contatados.push({
          id: lead.id,
          nome: lead.nome,
          whatsapp: lead.whatsapp,
          status_pagamento: lead.status_pagamento,
          recovery_attempts: lead.recovery_attempts,
          last_contact_at: lead.last_contact_at,
          motivo: 'tem_log_real',
        });
      } else {
        nuncaContatados.push({
          id: lead.id,
          nome: lead.nome,
          whatsapp: lead.whatsapp,
          email: lead.email,
          status_pagamento: lead.status_pagamento,
          asaas_charge_url: lead.asaas_charge_url,
          recovery_attempts: lead.recovery_attempts,
          last_contact_at: lead.last_contact_at,
          importado,
          sem_link: semLink,
          criado_em: lead.created_date,
        });
      }
    }

    // Sub-grupos dos nunca contatados
    const recuperaveis = nuncaContatados.filter(l => !l.sem_link || l.status_pagamento === 'pendente');
    const semLink = nuncaContatados.filter(l => l.sem_link && l.status_pagamento !== 'pendente');

    // 4. Se reset=true, resetar os recuperáveis para d0
    let resetados = 0;
    if (resetar && recuperaveis.length > 0) {
      for (const lead of recuperaveis) {
        await base44.asServiceRole.entities.EventoM31Inscricao.update(lead.id, {
          current_stage: 'd0',
          next_contact_at: null,
          recovery_attempts: 0,
          last_contact_at: null,
          last_recovery_at: null,
        });
        resetados++;
      }
    }

    return Response.json({
      success: true,
      total_encerrados: encerrados.length,
      total_com_log_real: contatados.length,
      total_nunca_contatados: nuncaContatados.length,
      recuperaveis: recuperaveis.length,
      sem_link_checkout: semLink.length,
      resetados,
      modo: resetar ? 'RESET EXECUTADO' : 'APENAS AUDITORIA (passe reset:true para resetar)',
      nunca_contatados_detalhes: nuncaContatados,
      contatados_resumo: contatados.map(l => ({ id: l.id, nome: l.nome, recovery_attempts: l.recovery_attempts, last_contact_at: l.last_contact_at })),
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
