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
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { caravanas_ids_origem, caravana_id_destino } = await req.json();

    if (!caravanas_ids_origem || !Array.isArray(caravanas_ids_origem) || caravanas_ids_origem.length === 0) {
      return Response.json({ error: 'caravanas_ids_origem deve ser um array não vazio' }, { status: 400 });
    }

    if (!caravana_id_destino) {
      return Response.json({ error: 'caravana_id_destino é obrigatório' }, { status: 400 });
    }

    // Obter a caravana de destino
    const caravanaDestino = await base44.entities.EventoM31Caravana.filter(
      { id: caravana_id_destino }
    );

    if (!caravanaDestino || caravanaDestino.length === 0) {
      return Response.json({ error: 'Caravana de destino não encontrada' }, { status: 404 });
    }

    const destino = caravanaDestino[0];

    // Para cada caravana de origem, buscar todas as inscrições e migrar
    let totalMigrado = 0;

    for (const caravanaIdOrigem of caravanas_ids_origem) {
      // Buscar todas as inscrições desta caravana
      const inscricoes = await base44.entities.EventoM31Inscricao.filter(
        { caravana_id: caravanaIdOrigem }
      );

      // Atualizar cada inscrição para a caravana de destino
      for (const inscricao of inscricoes) {
        await base44.entities.EventoM31Inscricao.update(inscricao.id, {
          caravana_id: destino.id,
          caravana_nome: destino.nome
        });
        totalMigrado++;
      }

      // Deletar a caravana de origem
      await base44.entities.EventoM31Caravana.delete(caravanaIdOrigem);
    }

    // Atualizar a contagem de membros da caravana destino
    const totalInscritos = await base44.entities.EventoM31Inscricao.filter(
      { caravana_id: destino.id }
    );

    await base44.entities.EventoM31Caravana.update(destino.id, {
      total_membros: totalInscritos.length
    });

    return Response.json({
      success: true,
      total_migrado: totalMigrado,
      caravanas_deletadas: caravanas_ids_origem.length,
      caravana_destino: destino.nome
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
