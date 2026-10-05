// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

const MODELOS = ['equipe', 'jesus', 'milagres', 'filhas'];
const TAMANHOS = ['PP', 'P', 'M', 'G', 'GG', 'XGG'];

return (async (req: Request) => {
  try {
    const base44 = createClientFromRequest(req);
    const S = base44.asServiceRole.entities;

    const cfgs = await S.EventoM31Config.list('-created_date', 1);
    const cfg = cfgs?.[0] || {};
    const ativo = cfg.camisas_order_bump_ativo === true;
    const preco = Number(cfg.camisas_preco_promocional || 0);
    const modelosAtivos = Array.isArray(cfg.camisas_modelos_ativos)
      ? cfg.camisas_modelos_ativos.filter((m: string) => MODELOS.includes(m))
      : [];

    if (!ativo || preco <= 0 || modelosAtivos.length === 0) {
      return Response.json({ ativo: false, preco: 0, modelos: [] });
    }

    const estoque = await S.EventoM31CamisaEstoque.list();
    const byKey = new Map<string, number>();
    for (const row of estoque || []) {
      byKey.set(`${row.modelo}:${row.tamanho}`, Math.max(0, Number(row.quantidade || 0)));
    }

    const modelos = modelosAtivos.map((modelo: string) => ({
      id: modelo,
      tamanhos: TAMANHOS
        .map((tamanho) => ({ tamanho, disponivel: byKey.get(`${modelo}:${tamanho}`) || 0 }))
        .filter((item) => item.disponivel > 0),
    })).filter((modelo: any) => modelo.tamanhos.length > 0);

    return Response.json({ ativo: modelos.length > 0, preco, modelos });
  } catch (error) {
    return Response.json({ ativo: false, preco: 0, modelos: [], error: error instanceof Error ? error.message : 'shirt_offer_failed' }, { status: 500 });
  }
})(req);
}
