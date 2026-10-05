// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Buscar as 13 inscrições pendentes no Asaas
    const apiKey = config('ASAAS_API_KEY');
    const res = await fetch('__ASAAS_API__/payments?status=PENDING&dateCreated[ge]=2026-05-28&limit=100', {
      headers: { 'access_token': apiKey, 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    const pendentes = (data.data || []).map(p => p.externalReference);

    // Buscar inscrições pelo código
    const inscricoes = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
      { codigo_inscricao: { $in: pendentes } }, '', 100
    );

    // Buscar logs de cobrança
    const logs = await base44.asServiceRole.entities.M31MessageLog.filter(
      { tipo: 'cobranca' }, '-enviado_em', 100
    );

    // Verificar quem recebeu cobrança
    const semCobranca = [];
    const comCobranca = [];

    for (const insc of inscricoes) {
      const temLog = logs.some(l => l.inscricao_id === insc.id && l.sucesso === true);
      if (temLog) {
        comCobranca.push({
          nome: insc.nome,
          whatsapp: insc.whatsapp,
          codigo: insc.codigo_inscricao,
          status: insc.status_pagamento
        });
      } else {
        semCobranca.push({
          nome: insc.nome,
          whatsapp: insc.whatsapp,
          codigo: insc.codigo_inscricao,
          status: insc.status_pagamento
        });
      }
    }

    return Response.json({
      total_pendentes: inscricoes.length,
      com_cobranca_enviada: comCobranca.length,
      sem_cobranca: semCobranca.length,
      detalhes_com_cobranca: comCobranca,
      detalhes_sem_cobranca: semCobranca
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
