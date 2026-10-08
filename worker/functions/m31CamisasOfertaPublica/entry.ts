// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

const MODELO_ORDEM = ['jesus', 'milagres', 'filhas', 'equipe'];
const MODELO_NOMES: Record<string, string> = { equipe: 'Equipe', jesus: 'Jesus', milagres: 'Milagres', filhas: 'Filhas' };
const TAMANHOS = ['PP', 'P', 'M', 'G', 'GG', 'XGG'];
const PRECO_UNITARIO = 65;
const PRECO_PROMOCIONAL = 60;
const MINIMO_PROMOCAO = 2;

function nomeCor(cor: string) {
  const valor = String(cor || '').trim();
  if (!valor) return '';
  return valor.charAt(0).toUpperCase() + valor.slice(1);
}

return (async (req: Request) => {
  try {
    const base44 = createClientFromRequest(req);
    const S = base44.asServiceRole.entities;

    const produtos = await S.M31ProdutoCamisa.filter({ ativo: true });
    const porModelo = new Map<string, any[]>();
    for (const produto of produtos || []) {
      if (!produto?.modelo) continue;
      if (!porModelo.has(produto.modelo)) porModelo.set(produto.modelo, []);
      porModelo.get(produto.modelo)!.push(produto);
    }

    const tipos: any[] = [];
    for (const modelo of MODELO_ORDEM) {
      const lista = porModelo.get(modelo);
      if (!lista?.length) continue;

      const tamanhos = TAMANHOS.filter((tamanho) =>
        lista.some((produto) => Array.isArray(produto.tamanhos) &&
          produto.tamanhos.map((item: string) => String(item).toUpperCase()).includes(tamanho)),
      );
      if (tamanhos.length === 0) continue;

      const cores = lista
        .filter((produto) => produto.cor)
        .map((produto) => ({ cor: String(produto.cor).trim().toLowerCase(), nome: nomeCor(produto.cor) }));
      const corFixa = cores.length <= 1;

      tipos.push({
        modelo,
        nome: MODELO_NOMES[modelo] || modelo,
        cores: corFixa ? [] : cores,
        cor_fixa: corFixa ? cores[0]?.cor || null : null,
        tamanhos,
      });
    }

    return Response.json({
      ativo: tipos.length > 0,
      preco_unitario: PRECO_UNITARIO,
      preco_promocional: PRECO_PROMOCIONAL,
      minimo_promocao: MINIMO_PROMOCAO,
      tipos,
    });
  } catch (error) {
    return Response.json({ ativo: false, tipos: [], error: error instanceof Error ? error.message : 'shirt_offer_failed' }, { status: 500 });
  }
})(req);
}
