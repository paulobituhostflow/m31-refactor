// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31LiberarBoasVindasControlada — LIBERAÇÃO EXPLÍCITA E CONFIRMADA
 *
 * Autoriza o envio de boas-vindas para inscrições represadas SOMENTE quando
 * o admin confirma explicitamente a quantidade total de destinatárias.
 *
 * Regras de segurança:
 *   - Só admin pode chamar.
 *   - NUNCA libera "todos" implicitamente. O payload DEVE conter:
 *       { quantidade_confirmada: N }  ou  { inscricao_ids: [...] }
 *     e N precisa BATER com a contagem real de candidatas. Se divergir, aborta.
 *   - Marca liberada_para_envio: true APENAS nas candidatas ainda não enviadas.
 *   - Mudança de modo NÃO chama esta função — liberação é ato separado.
 *
 * Ações:
 *   - modo "contar" (default sem confirmação): retorna a contagem de candidatas
 *     elegíveis, para a UI exibir e o admin confirmar. NÃO altera nada.
 *   - modo "liberar": exige quantidade_confirmada === contagem real, então libera.
 */

// Candidata elegível: confirmada, sem boas-vindas enviadas, telefone válido,
// ainda não liberada, e não já no grupo.
function ehElegivel(i) {
  if (!i.whatsapp) return false;
  const tel = (i.whatsapp || '').replace(/\D/g, '');
  if (tel.length < 10) return false;
  if (!['aprovado', 'gratuito'].includes(i.status_pagamento)) return false;
  if (i.data_envio_boas_vindas) return false;
  if (i.status_envio_grupo === 'enviado') return false;
  if (i.entrou_no_grupo === true) return false;
  return true;
}

async function carregarCandidatas(base44) {
  const [aprovadas, gratuitas] = await Promise.all([
    base44.asServiceRole.entities.EventoM31Inscricao.filter({ status_pagamento: 'aprovado' }, '+created_date', 800),
    base44.asServiceRole.entities.EventoM31Inscricao.filter({ status_pagamento: 'gratuito' }, '+created_date', 800),
  ]);
  return [...aprovadas, ...gratuitas].filter(ehElegivel);
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Apenas administradores' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const acao = body.acao || 'contar';

    const candidatas = await carregarCandidatas(base44);
    const contagem = candidatas.length;

    // ── MODO CONTAR — só devolve a quantidade para confirmação. Não altera nada.
    if (acao === 'contar') {
      return Response.json({
        acao: 'contar',
        candidatas_elegiveis: contagem,
        amostra: candidatas.slice(0, 10).map(c => ({ nome: c.nome, cidade: c.cidade || null })),
        instrucao: `Para liberar, reenvie com { acao: "liberar", quantidade_confirmada: ${contagem} }`,
      });
    }

    // ── MODO LIBERAR — exige confirmação de quantidade batendo com a realidade.
    if (acao === 'liberar') {
      const qtdConfirmada = body.quantidade_confirmada;
      const idsExplicitos = Array.isArray(body.inscricao_ids) ? body.inscricao_ids : null;

      if (idsExplicitos) {
        // Libera apenas os IDs informados que ainda são elegíveis.
        const setElegiveis = new Set(candidatas.map(c => c.id));
        const alvo = idsExplicitos.filter(id => setElegiveis.has(id));
        if (alvo.length === 0) {
          return Response.json({ acao: 'liberar', liberadas: 0, motivo: 'nenhum_id_elegivel' });
        }
        const agora = new Date().toISOString();
        let liberadas = 0;
        for (const id of alvo) {
          await base44.asServiceRole.entities.EventoM31Inscricao.update(id, {
            liberada_para_envio: true, liberada_para_envio_em: agora,
          });
          liberadas++;
        }
        return Response.json({ acao: 'liberar', modo: 'por_ids', liberadas, total_elegiveis: contagem });
      }

      // Liberação por quantidade confirmada: deve bater exatamente com a contagem real.
      if (typeof qtdConfirmada !== 'number') {
        return Response.json({ error: 'quantidade_confirmada obrigatória e numérica', contagem_atual: contagem }, { status: 400 });
      }
      if (qtdConfirmada !== contagem) {
        return Response.json({
          error: 'confirmacao_divergente',
          detalhe: `Você confirmou ${qtdConfirmada}, mas há ${contagem} candidatas elegíveis agora. Reconfirme com o número correto.`,
          contagem_atual: contagem,
        }, { status: 409 });
      }

      const agora = new Date().toISOString();
      let liberadas = 0;
      for (const c of candidatas) {
        await base44.asServiceRole.entities.EventoM31Inscricao.update(c.id, {
          liberada_para_envio: true, liberada_para_envio_em: agora,
        });
        liberadas++;
      }

      // Log de auditoria da liberação
      await base44.asServiceRole.entities.M31AuditLog.create({
        chave_unica: `liberacao_boas_vindas_${Date.now()}`,
        tipo_erro: 'liberacao_boas_vindas_controlada', gravidade: 'medio', origem: 'admin',
        descricao: `${liberadas} inscrições liberadas para envio de boas-vindas por ${user.email}`,
        possivel_causa: 'Liberação controlada manual pós-reconexão',
        acao_recomendada: 'Nenhuma — ação intencional do admin',
        pessoa_nome: user.full_name || user.email, pessoa_email: user.email,
      }).catch(() => {});

      return Response.json({ acao: 'liberar', modo: 'por_quantidade', liberadas, total_elegiveis: contagem });
    }

    return Response.json({ error: 'acao_desconhecida', acao }, { status: 400 });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
