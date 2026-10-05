// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

/**
 * Mescla inscrições duplicadas:
 * - Mantém o registro mais antigo OU com status aprovado
 * - Registra a ação em M31AuditLog
 * - Marca registros órfãos como "duplicado"
 */
return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Acesso restrito a admins' }, { status: 403 });
    }

    const { inscricao_id_manter, inscricao_ids_deletar, motivo } = await req.json();

    if (!inscricao_id_manter || !inscricao_ids_deletar || inscricao_ids_deletar.length === 0) {
      return Response.json({ error: 'IDs de inscrição obrigatórios' }, { status: 400 });
    }

    const inscricaoManter = await base44.asServiceRole.entities.EventoM31Inscricao.get(inscricao_id_manter);
    if (!inscricaoManter) {
      return Response.json({ error: 'Inscrição a manter não encontrada' }, { status: 404 });
    }

    const auditLog = {
      tipo_erro: 'inscricao_duplicada_mescrada',
      gravidade: 'critico',
      origem: 'admin',
      descricao: `Mescla de ${inscricao_ids_deletar.length} inscrições duplicadas. Mantida: ${inscricaoManter.nome} (${inscricao_id_manter})`,
      pessoa_nome: inscricaoManter.nome,
      pessoa_email: inscricaoManter.email,
      pessoa_telefone: inscricaoManter.whatsapp,
      pessoa_id: inscricao_id_manter,
      chave_unica: `mescla_${inscricao_id_manter}_${Date.now()}`,
      status: 'resolvido',
      resolvido_por: user.email,
      resolvido_em: new Date().toISOString(),
      dados_extras: JSON.stringify({
        deletadas: inscricao_ids_deletar,
        motivo: motivo,
        admin_email: user.email,
      })
    };

    // Criar log de auditoria
    await base44.asServiceRole.entities.M31AuditLog.create(auditLog);

    // Atualizar registros duplicados com observação
    for (const id of inscricao_ids_deletar) {
      const inscricaoDuplicada = await base44.asServiceRole.entities.EventoM31Inscricao.get(id);
      
      await base44.asServiceRole.entities.EventoM31Inscricao.update(id, {
        opt_out: true,
        observacoes: `[DUPLICADO] Mescrado com ${inscricaoManter.codigo_inscricao}. Registrar mantida: ${inscricao_id_manter}. Motivo: ${motivo}`,
        status_pagamento: 'cancelado'
      });

      // Cancelar cobrança órfã no Asaas (se houver)
      if (inscricaoDuplicada.asaas_payment_id) {
        try {
          const ASAAS_KEY = config("ASAAS_API_KEY");
          await fetch(`__ASAAS_API__/payments/${inscricaoDuplicada.asaas_payment_id}`, {
            method: 'DELETE',
            headers: { 'access_token': ASAAS_KEY }
          });
        } catch (e) {
          logger.error(`Não foi possível cancelar cobrança ${inscricaoDuplicada.asaas_payment_id}:`, e.message);
        }
      }
    }

    return Response.json({
      sucesso: true,
      mensagem: `Mescla realizada. ${inscricao_ids_deletar.length} registros duplicados marcados como cancelados.`,
      registroMantido: {
        id: inscricaoManter.id,
        nome: inscricaoManter.nome,
        codigo: inscricaoManter.codigo_inscricao,
        status: inscricaoManter.status_pagamento
      }
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
