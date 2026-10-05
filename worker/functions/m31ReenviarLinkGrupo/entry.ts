// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31ReenviarLinkGrupo — Reenvia link do grupo oficial para inscritas aprovadas
 * que ainda não entraram no grupo.
 *
 * REGRAS DE ARQUITETURA:
 *   1. Link resolvido SEMPRE por finalidade (INSCRITAS_OFICIAL), nunca hardcoded.
 *   2. Se 0 ou 2+ grupos ativos → cancelar + logar erro.
 *   3. Envio registrado em M31GrupoEnvioLog.
 */

const FINALIDADE_GRUPO = 'INSCRITAS_OFICIAL';

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
      tipo_envio: params.tipo_envio || 'link_convite',
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
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Resolver grupo por FINALIDADE (Regra 3: nunca por nome) ────
    const grupo = await resolverGrupo(base44, FINALIDADE_GRUPO);

    if (!grupo?.success || !grupo?.invite_link) {
      await logEnvioGrupo(base44, {
        finalidade: FINALIDADE_GRUPO,
        funcao_responsavel: 'm31ReenviarLinkGrupo',
        sucesso: false,
        cancelado: true,
        erro: grupo?.error || grupo?.mensagem || 'grupo_nao_resolvido',
      });
      return Response.json({
        success: false,
        cancelado: true,
        motivo: 'grupo_nao_configurado',
        finalidade: FINALIDADE_GRUPO,
        erro: grupo?.error || grupo?.mensagem || 'Grupo não resolvido. Envio cancelado.',
      }, { status: 503 });
    }

    const linkGrupo = grupo.invite_link;
    const nomeGrupo = grupo.nome_grupo;

    // ── VERIFICAÇÃO POR NÚMERO: cruzamento por TELEFONE com os membros
    // ativos do grupo oficial (nunca por nome; a flag pode estar defasada)
    function phoneKeys(raw) {
      let d = (raw || '').replace(/\D/g, '');
      while (d.startsWith('5555')) d = d.slice(2);
      if (!d.startsWith('55') && d.length >= 10) d = `55${d}`;
      if (d.length === 12 && d.startsWith('55')) d = d.slice(0, 4) + '9' + d.slice(4);
      const keys = new Set([d]);
      if (d.length === 13 && d.startsWith('55')) keys.add(d.slice(0, 4) + d.slice(5));
      return keys;
    }
    const telefonesNoGrupo = new Set();
    if (grupo.chat_id) {
      const membros = await base44.asServiceRole.entities.M31GrupoMembro.filter(
        { group_jid: grupo.chat_id, status: 'ativa' }, null, 500);
      for (const m of membros) for (const k of phoneKeys(m.phone)) telefonesNoGrupo.add(k);
    }

    // Buscar inscritas que pagaram mas não entraram no grupo
    const inscricoes = await base44.entities.EventoM31Inscricao.filter({
      status_pagamento: 'aprovado',
      entrou_no_grupo: false,
    }, null, 1000);

    if (!inscricoes || inscricoes.length === 0) {
      return Response.json({ success: true, total_sent: 0 });
    }

    let sent_count = 0;
    let pulados_ja_no_grupo = 0;
    for (const insc of inscricoes) {
      try {
        // Cruzamento por NÚMERO: já está no grupo → status corrigido, sem convite
        if (telefonesNoGrupo.size > 0 && [...phoneKeys(insc.whatsapp)].some(k => telefonesNoGrupo.has(k))) {
          const agoraIso = new Date().toISOString();
          await base44.asServiceRole.entities.EventoM31Inscricao.update(insc.id, {
            entrou_no_grupo: true, data_entrada_grupo: agoraIso, entrou_no_grupo_em: agoraIso,
            origem_confirmacao_grupo: 'automacao',
          }).catch(() => {});
          pulados_ja_no_grupo++;
          continue;
        }

        const corte24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const jaReenviadoHoje = await base44.entities.M31MessageLog.filter({
          inscricao_id: insc.id,
          tipo: 'reenvio_link_grupo',
        }, '-enviado_em', 1);

        if (jaReenviadoHoje.length > 0 && jaReenviadoHoje[0].enviado_em >= corte24h) {
          continue;
        }

        await base44.entities.M31MessageLog.create({
          inscricao_id: insc.id,
          inscricao_nome: insc.nome,
          telefone: insc.whatsapp,
          tipo: 'reenvio_link_grupo',
          stage: 'reenvio_link',
          mensagem: `Link do grupo reenviado: ${linkGrupo}`,
          sucesso: true,
          enviado_em: new Date().toISOString(),
        });
        sent_count++;
      } catch (e) {
        logger.error('Erro ao enviar para', insc.nome, e);
      }
    }

    // ── Log resumo do envio (Regra 4) ──────────────────────────────
    await logEnvioGrupo(base44, {
      finalidade: FINALIDADE_GRUPO,
      nome_grupo: nomeGrupo,
      chat_id: grupo.chat_id || null,
      qtd_mensagens: sent_count,
      funcao_responsavel: 'm31ReenviarLinkGrupo',
      tipo_envio: 'link_convite',
      destinatario: 'lote',
      sucesso: true,
    });

    return Response.json({ success: true, total_sent: sent_count, pulados_ja_no_grupo, link_grupo: linkGrupo });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
