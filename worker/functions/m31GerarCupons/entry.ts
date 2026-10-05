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
      return Response.json({ error: 'Acesso restrito a administradores' }, { status: 403 });
    }

    const body = await req.json();
    const { quantidade, batch } = body;

    if (!quantidade || quantidade < 1 || quantidade > 500) {
      return Response.json({ error: 'Quantidade inválida (1-500)' }, { status: 400 });
    }

    const cupons = [];
    for (let i = 0; i < quantidade; i++) {
      const codigo = `DOA-${Math.random().toString(36).substring(2, 5).toUpperCase()}${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
      cupons.push({
        codigo,
        descricao: batch || `Lote de doação gerado em ${new Date().toLocaleDateString('pt-BR')}`,
        usado: false,
        gerado_por: user.email,
        batch: batch || `Gerado em ${new Date().toLocaleDateString('pt-BR')}`
      });
    }

    const criados = await base44.asServiceRole.entities.EventoM31Cupom.bulkCreate(cupons);

    return Response.json({ success: true, cupons: criados, total: criados.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
