// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31NotificarInscricaoGrupo — Notifica grupo operacional quando inscrição é criada
 * Automação: dispara no create de EventoM31Inscricao
 *
 * REGRAS DE ARQUITETURA (despacho de grupos):
 *   1. Grupo resolvido SEMPRE por finalidade (enum), nunca por nome.
 *   2. Se 0 ou 2+ grupos ativos para a finalidade → cancelar envio + logar erro.
 *   3. Pré e pós-envio registrados em M31GrupoEnvioLog.
 */

const FINALIDADE_GRUPO = 'INSCRICOES_EQUIPE';

async function resolverGrupo(base44, finalidade) {
  try {
    const res = await base44.asServiceRole.functions.invoke('m31ResolverGrupo', { finalidade });
    return res.data || res;
  } catch (e) {
    return { error: e.message, cancelado: true };
  }
}

async function logEnvioGrupo(base44, params) {
  try {
    await base44.asServiceRole.entities.M31GrupoEnvioLog.create({
      finalidade: params.finalidade,
      nome_grupo: params.nome_grupo || null,
      chat_id: params.chat_id || null,
      qtd_mensagens: params.qtd_mensagens || 1,
      funcao_responsavel: params.funcao_responsavel,
      tipo_envio: params.tipo_envio || 'mensagem_grupo',
      destinatario: params.destinatario || null,
      inscricao_id: params.inscricao_id || null,
      sucesso: params.sucesso,
      erro: params.erro || null,
      cancelado: params.cancelado || false,
      enviado_em: new Date().toISOString(),
    });
  } catch (_) {}
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const event = body?.event || {};
    const data = body?.data || {};
    const inscricao_id = event?.entity_id || data?.id || body?.inscricao_id;

    if (!inscricao_id) {
      return Response.json({ error: 'inscricao_id não fornecido' }, { status: 400 });
    }

    // ── Guard: verificar se já foi notificado ──────────────────────
    const logs = await base44.asServiceRole.entities.M31MessageLog.filter({
      inscricao_id: inscricao_id,
      tipo: 'notificacao_grupo_inscricoes'
    });
    if (logs.length > 0) {
      return Response.json({
        skipped: true,
        reason: 'já_notificado',
        inscricao_id,
        mensagem: 'Esta inscrição já foi notificada ao grupo'
      });
    }

    // ── Buscar dados da inscrição ──────────────────────────────────
    const inscricoes = await base44.asServiceRole.entities.EventoM31Inscricao.filter({
      id: inscricao_id
    });

    if (inscricoes.length === 0) {
      return Response.json({ error: 'inscrição não encontrada' }, { status: 404 });
    }

    const inscricao = inscricoes[0];

    // ── Resolver grupo por FINALIDADE (Regra 3: nunca por nome) ────
    const grupo = await resolverGrupo(base44, FINALIDADE_GRUPO);

    if (!grupo?.success || !grupo?.chat_id) {
      // Regra 5: configuração inválida ou ambígua → cancelar
      await logEnvioGrupo(base44, {
        finalidade: FINALIDADE_GRUPO,
        funcao_responsavel: 'm31NotificarInscricaoGrupo',
        sucesso: false,
        cancelado: true,
        erro: grupo?.error || grupo?.mensagem || 'grupo_nao_resolvido',
        inscricao_id,
        destinatario: 'grupo',
      });
      return Response.json({
        success: false,
        cancelado: true,
        motivo: 'grupo_nao_configurado',
        finalidade: FINALIDADE_GRUPO,
        erro: grupo?.error || grupo?.mensagem || 'Grupo não resolvido. Envio cancelado.',
        inscricao_id,
      }, { status: 503 });
    }

    const chatId = grupo.chat_id;
    const nomeGrupo = grupo.nome_grupo;

    // ── Formatar mensagem ──────────────────────────────────────────
    const nome = inscricao.nome || 'N/A';
    const lote = inscricao.lote || 'Não informado';
    const wa = inscricao.whatsapp || 'Sem WhatsApp';
    const waLink = `https://wa.me/${wa.replace(/\D/g, '')}`;
    const jaParticipou = inscricao.ja_participou_m31 ? '✅ Sim' : '❌ Não';

    const mensagem =
      `🎉 *Nova inscrição M31FILHAS*\n` +
      `👤 ${nome}\n` +
      `🏷️ ${lote}\n` +
      `📲 ${waLink}\n` +
      `Já participou de algum M31?\n` +
      `${jaParticipou}`;

    // ── Enviar via m31WhatsAppService ──────────────────────────────
    let enviado = false;
    let erro = null;

    try {
      const wpRes = await base44.asServiceRole.functions.invoke('m31WhatsAppService', {
        phone: chatId,
        message: mensagem
      });

      enviado = wpRes.data?.sucesso === true;
      if (!enviado) {
        erro = wpRes.data?.error || 'falha m31WhatsAppService';
      }
    } catch (e) {
      erro = (e as Error).message;
      logger.error('[NotificarInscricaoGrupo] Erro ao enviar:', inscricao_id, erro);
    }

    // ── Log pós-envio (Regra 4) ────────────────────────────────────
    await logEnvioGrupo(base44, {
      finalidade: FINALIDADE_GRUPO,
      nome_grupo: nomeGrupo,
      chat_id: chatId,
      qtd_mensagens: enviado ? 1 : 0,
      funcao_responsavel: 'm31NotificarInscricaoGrupo',
      tipo_envio: 'mensagem_grupo',
      destinatario: chatId,
      inscricao_id,
      sucesso: enviado,
      erro: erro || null,
    });

    // ── Registrar em M31MessageLog ─────────────────────────────────
    await base44.asServiceRole.entities.M31MessageLog.create({
      inscricao_id: inscricao_id,
      inscricao_nome: inscricao.nome,
      telefone: chatId,
      tipo: 'notificacao_grupo_inscricoes',
      stage: 'novo_registro',
      mensagem: mensagem,
      sucesso: enviado,
      zapi_response: enviado ? 'enviado_grupo' : null,
      erro: erro,
      enviado_em: new Date().toISOString()
    }).catch(e => {
      logger.error('[NotificarInscricaoGrupo] Erro ao registrar log:', e.message);
    });

    return Response.json({
      success: true,
      inscricao_id,
      nome,
      finalidade: FINALIDADE_GRUPO,
      chat_id: chatId,
      enviado,
      erro: erro || null,
      mensagem: enviado ? 'Notificação enviada ao grupo' : 'Falha ao enviar notificação'
    });

  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
})(req);
}
