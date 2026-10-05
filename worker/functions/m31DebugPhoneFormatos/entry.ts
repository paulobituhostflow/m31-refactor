// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { church_id = '69d53069f426a0a0cffca9c7' } = body || {};

    // Pega 5 inscrições aprovadas
    const inscricoes = await base44.asServiceRole.entities.EventoM31Inscricao.filter({
      status_pagamento: 'aprovado'
    }, '-created_date', 5);

    // Pega 5 membros do grupo
    const membros = await base44.asServiceRole.entities.M31GrupoMembro.filter({
      church_id
    }, '-ultima_deteccao', 5);

    return Response.json({
      ok: true,
      inscricao_phones: inscricoes.map(i => ({
        id: i.id,
        whatsapp: i.whatsapp,
        length: (i.whatsapp || '').length
      })),
      grupo_phones: membros.map(m => ({
        id: m.id,
        phone: m.phone,
        length: (m.phone || '').length
      }))
    });
  } catch (error) {
    return Response.json({
      ok: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
})(req);
}
