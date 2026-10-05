// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
// Lista igrejas/comunidades já conhecidas no banco (distinct nome_igreja).
// Usado pelo seletor de igreja no formulário Servir no M31.

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Busca inscrições recentes para extrair nomes de igreja distintos
    const inscricoes = await base44.asServiceRole.entities.EventoM31Inscricao.list('-updated_date', 500);

    const igrejas = new Set();
    for (const insc of inscricoes) {
      const nome = (insc.nome_igreja || '').trim();
      if (nome && nome.length >= 2) {
        igrejas.add(nome);
      }
    }

    const lista = Array.from(igrejas).sort((a, b) =>
      a.localeCompare(b, 'pt-BR')
    );

    return Response.json({ igrejas: lista });
  } catch (error) {
    return Response.json({ igrejas: [], error: error.message }, { status: 500 });
  }
})(req);
}
