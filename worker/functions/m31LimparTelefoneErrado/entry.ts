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

    // Buscar a configuração do M31
    const configs = await base44.asServiceRole.entities.EventoM31Config.list('-created_date', 1);
    if (!configs || configs.length === 0) {
      return Response.json({ error: 'Configuração não encontrada' }, { status: 404 });
    }

    const config = configs[0];
    const telefonesAtuais = config.telefones_autorizados || [];

    // Remover o número errado: 5581999990001
    const telefonesFiltrados = telefonesAtuais.filter(tel => {
      const numeroLimpo = (tel.numero || '').replace(/\D/g, '');
      return numeroLimpo !== '5581999990001';
    });

    // Se removeu algo, atualizar
    if (telefonesFiltrados.length < telefonesAtuais.length) {
      await base44.asServiceRole.entities.EventoM31Config.update(config.id, {
        telefones_autorizados: telefonesFiltrados
      });
      return Response.json({
        success: true,
        removidos: telefonesAtuais.length - telefonesFiltrados.length,
        telefonesRestantes: telefonesFiltrados
      });
    }

    return Response.json({
      success: true,
      message: 'Nenhum número errado encontrado',
      telefonesRestantes: telefonesFiltrados
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
