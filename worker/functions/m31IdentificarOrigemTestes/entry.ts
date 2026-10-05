// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Buscar inscrições com emails de teste
    const emailsTeste = ['teste2@m31.com', 'midia2@m31.com', 'voluntaria@m31.com'];
    const infoTestes = [];

    for (const email of emailsTeste) {
      const inscricoes = await base44.asServiceRole.entities.EventoM31Inscricao.filter({ email });
      
      if (inscricoes && inscricoes.length > 0) {
        inscricoes.forEach(insc => {
          infoTestes.push({
            email: insc.email,
            nome: insc.nome,
            tipo: insc.tipo,
            lote: insc.lote,
            valor: insc.valor_pago,
            status: insc.status_pagamento,
            criado_por: insc.created_by || 'desconhecido',
            data_criacao: insc.created_date,
            telefone: insc.whatsapp
          });
        });
      }
    }

    return Response.json({
      total_testes: infoTestes.length,
      testes: infoTestes
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
