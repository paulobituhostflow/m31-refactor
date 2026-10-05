// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31ResolverGrupo — Resolver canônico de grupos WhatsApp por FINALIDADE
 *
 * Regra de ouro: NUNCA buscar grupo por nome. Sempre por finalidade (enum).
 *
 * Input:  { finalidade: 'INSCRICOES_EQUIPE' | 'INSCRITAS_OFICIAL' | 'VOLUNTARIOS' | 'COORDENADORES' | 'INTERCESSAO', church_id? }
 * Output: { success, finalidade, chat_id, invite_link, nome_grupo, grupo_id }
 *
 * Segurança (Regra 5):
 *   - 0 grupos ativos  → 404 (cancelar envio)
 *   - 2+ grupos ativos → 409 (cancelar envio por ambiguidade)
 *   - Exatamente 1     → 200 (retorna dados)
 *
 * Esta função é SOMENTE-LEITURA (pura consulta à M31GrupoConfig).
 * O envio UAZAPI deve ser feito INLINE pela função chamadora (NUNCA via functions.invoke,
 * que gera 403 ao chamar UAZAPI internamente).
 */

const FINALIDADES_VALIDAS = [
  'INSCRICOES_EQUIPE',
  'INSCRITAS_OFICIAL',
  'VOLUNTARIOS',
  'COORDENADORES',
  'INTERCESSAO',
];

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { finalidade, church_id } = body;

    if (!finalidade || !FINALIDADES_VALIDAS.includes(finalidade)) {
      return Response.json({
        error: 'finalidade_invalida',
        finalidades_validas: FINALIDADES_VALIDAS,
        mensagem: `Finalidade '${finalidade}' inválida. Use uma de: ${FINALIDADES_VALIDAS.join(', ')}`,
      }, { status: 400 });
    }

    const query = church_id
      ? { finalidade, church_id, ativo: true }
      : { finalidade, ativo: true };

    const grupos = await base44.asServiceRole.entities.M31GrupoConfig.filter(query);

    // Regra 5: Nenhuma configuração válida → cancelar
    if (grupos.length === 0) {
      return Response.json({
        error: 'grupo_nao_configurado',
        finalidade,
        cancelado: true,
        mensagem: `Nenhum grupo ativo configurado para a finalidade ${finalidade}. Envio cancelado automaticamente.`,
      }, { status: 404 });
    }

    // Regra 5: Mais de um grupo compatível → cancelar (nunca escolher "parecido")
    if (grupos.length > 1) {
      return Response.json({
        error: 'ambiguidade_grupo',
        finalidade,
        cancelado: true,
        grupos_encontrados: grupos.length,
        grupos: grupos.map(g => ({ id: g.id, nome: g.nome_grupo, chat_id: g.chat_id })),
        mensagem: `Detectados ${grupos.length} grupos ativos para a finalidade ${finalidade}. Envio cancelado por segurança — corrija a configuração.`,
      }, { status: 409 });
    }

    const grupo = grupos[0];

    return Response.json({
      success: true,
      finalidade: grupo.finalidade,
      chat_id: grupo.chat_id,
      invite_link: grupo.invite_link || null,
      nome_grupo: grupo.nome_grupo,
      grupo_id: grupo.id,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
