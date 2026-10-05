// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31GerarLinkTransferencia — PAINEL INTERNO
 *
 * Gera um link de transferência de titular para uma inscrição.
 * NÃO altera nada do pagamento. Cria um registro M31TransferenciaInscricao
 * com status=pendente e um token aleatório criptograficamente seguro.
 *
 * Freio único: data_limite_transferencia (EventoM31Config). Se a data atual
 * já passou desse limite, a geração é bloqueada.
 *
 * token_expira_em = menor valor entre (agora + 7 dias) e data_limite_transferencia.
 *
 * Payload: { inscricao_id }
 * Response: { success, token, url, token_expira_em }
 */

function gerarToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const inscricaoId = body?.inscricao_id;
    if (!inscricaoId) {
      return Response.json({ error: 'inscricao_id é obrigatório' }, { status: 400 });
    }

    const inscricao = await base44.asServiceRole.entities.EventoM31Inscricao.get(inscricaoId);
    if (!inscricao) {
      return Response.json({ error: 'Inscrição não encontrada' }, { status: 404 });
    }

    // ── FREIO ÚNICO: data_limite_transferencia ──
    const configs = await base44.asServiceRole.entities.EventoM31Config.list('-created_date', 1);
    const dataLimite = configs?.[0]?.data_limite_transferencia || null;
    if (!dataLimite) {
      return Response.json({
        error: 'Transferências não estão habilitadas. Configure a data limite de transferência do evento.',
      }, { status: 422 });
    }
    const agora = new Date();
    const limite = new Date(dataLimite);
    if (agora >= limite) {
      return Response.json({
        error: 'O prazo para transferências deste evento já encerrou.',
      }, { status: 422 });
    }

    // ── token_expira_em = min(agora + 7 dias, data_limite_transferencia) ──
    const seteDias = new Date(agora.getTime() + 7 * 24 * 60 * 60 * 1000);
    const expiraEm = seteDias < limite ? seteDias : limite;

    const token = gerarToken();
    const nowIso = agora.toISOString();

    const transferencia = await base44.asServiceRole.entities.M31TransferenciaInscricao.create({
      inscricao_id: inscricaoId,
      token,
      token_expira_em: expiraEm.toISOString(),
      status: 'pendente',
      iniciada_por: user.email,
      criada_em: nowIso,
    });

    // Timeline (observabilidade) — desacoplado, best-effort
    await base44.asServiceRole.entities.M31InscricaoTimeline.create({
      inscricao_id: inscricaoId,
      cpf: inscricao.cpf,
      evento: 'reconciliacao_executada',
      etapa: 'transferencia',
      status: 'pendente',
      detalhe: `Link de transferência gerado por ${user.email}. Aguardando preenchimento do novo titular.`,
      origem: 'm31GerarLinkTransferencia',
    }).catch(() => {});

    return Response.json({
      success: true,
      transferencia_id: transferencia.id,
      token,
      path: `/transferir/${token}`,
      token_expira_em: expiraEm.toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
