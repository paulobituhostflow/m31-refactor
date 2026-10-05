// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31PanoramaOperacional
 *
 * Retorna panorama completo das situações operacionais do fluxo M31,
 * dividido em grupos temáticos com queries independentes.
 *
 * Cada grupo retorna: { contagem, primeiros_5, alertas }
 */

function hojeRecife() {
  const d = new Date();
  const local = new Date(d.getTime() + (-3) * 60 * 60 * 1000);
  return local.toISOString();
}

async function getSample(base44, entity, filter, limit = 5, sortBy = '-created_date') {
  const items = await base44.asServiceRole.entities[entity].filter(filter, sortBy, limit);
  return items;
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const agora = hojeRecife();
    const tres_horas_atras = new Date(new Date(agora).getTime() - 3 * 60 * 60 * 1000).toISOString();
    const um_dia_atras = new Date(new Date(agora).getTime() - 24 * 60 * 60 * 1000).toISOString();
    const sete_dias_atras = new Date(new Date(agora).getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const panorama = {};

    // ════════════════════════════════════════════════════════════════════════
    // GRUPO 1: Sem boas-vindas WhatsApp (vão receber via automação 30min)
    // ════════════════════════════════════════════════════════════════════════
    const g1_filter = {
      status_pagamento: 'aprovado',
      data_envio_boas_vindas: null,
      whatsapp: { $exists: true, $ne: '' }
    };
    const g1_all = await base44.asServiceRole.entities.EventoM31Inscricao.filter(g1_filter);
    const g1_sample = await getSample(base44, 'EventoM31Inscricao', g1_filter);
    panorama['GRUPO_1_sem_boas_vindas'] = {
      titulo: 'Sem boas-vindas WhatsApp (vão receber via automação 30min)',
      filtro: g1_filter,
      contagem: g1_all.length,
      primeiros_5: g1_sample.map(i => ({
        id: i.id,
        nome: i.nome,
        whatsapp: i.whatsapp,
        created_date: i.created_date,
        status_pagamento: i.status_pagamento
      }))
    };

    // ════════════════════════════════════════════════════════════════════════
    // GRUPO 2: Recebeu boas-vindas MAS falha no QR Code
    // ════════════════════════════════════════════════════════════════════════
    const g2_filter = {
      status_pagamento: 'aprovado',
      data_envio_boas_vindas: { $exists: true, $ne: null },
      $or: [
        { qr_envio_status: 'falha_envio' },
        { qr_envio_status: 'gerado_nao_enviado' }
      ]
    };
    const g2_all = await base44.asServiceRole.entities.EventoM31Inscricao.filter(g2_filter);
    const g2_sample = await getSample(base44, 'EventoM31Inscricao', g2_filter);
    panorama['GRUPO_2_qr_falha'] = {
      titulo: 'Recebeu boas-vindas MAS sem QR Code (falha de envio)',
      filtro: g2_filter,
      contagem: g2_all.length,
      primeiros_5: g2_sample.map(i => ({
        id: i.id,
        nome: i.nome,
        whatsapp: i.whatsapp,
        qr_envio_status: i.qr_envio_status,
        qr_tentativas_envio: i.qr_tentativas_envio,
        data_envio_boas_vindas: i.data_envio_boas_vindas
      }))
    };

    // ════════════════════════════════════════════════════════════════════════
    // GRUPO 3: Abandono de checkout (fila de recuperação)
    // ════════════════════════════════════════════════════════════════════════
    const g3_filter = {
      $or: [
        { status_pagamento: 'checkout_pendente' },
        { status_pagamento: 'checkout_abandonado' }
      ],
      whatsapp: { $exists: true, $ne: '' },
      recovery_attempts: { $lt: 2 },
      created_date: { $gte: tres_horas_atras }
    };
    const g3_all = await base44.asServiceRole.entities.EventoM31Inscricao.filter(g3_filter);
    const g3_sample = await getSample(base44, 'EventoM31Inscricao', g3_filter);
    panorama['GRUPO_3_abandono_checkout'] = {
      titulo: 'Abandono de checkout (< 2 tentativas, últimas 3h)',
      filtro: g3_filter,
      contagem: g3_all.length,
      primeiros_5: g3_sample.map(i => ({
        id: i.id,
        nome: i.nome,
        whatsapp: i.whatsapp,
        recovery_attempts: i.recovery_attempts || 0,
        created_date: i.created_date,
        checkout_abandoned_at: i.checkout_abandoned_at
      }))
    };

    // ════════════════════════════════════════════════════════════════════════
    // GRUPO 4: Fila de boas-vindas (processamento em backlog)
    // ════════════════════════════════════════════════════════════════════════
    const g4_filter = {
      fila_boas_vindas: true,
      whatsapp: { $exists: true, $ne: '' }
    };
    const g4_all = await base44.asServiceRole.entities.EventoM31Inscricao.filter(g4_filter);
    const g4_sample = await getSample(base44, 'EventoM31Inscricao', g4_filter);
    panorama['GRUPO_4_fila_boas_vindas'] = {
      titulo: 'Em fila de boas-vindas (processamento em backlog)',
      filtro: g4_filter,
      contagem: g4_all.length,
      primeiros_5: g4_sample.map(i => ({
        id: i.id,
        nome: i.nome,
        whatsapp: i.whatsapp,
        fila_boas_vindas_em: i.fila_boas_vindas_em,
        status_pagamento: i.status_pagamento
      }))
    };

    // ════════════════════════════════════════════════════════════════════════
    // GRUPO 5: Fila de recuperação aguardando aprovação do gestor
    // ════════════════════════════════════════════════════════════════════════
    const g5_filter = {
      fila_recuperacao: true,
      status_fila_recuperacao: 'aguardando_aprovacao'
    };
    const g5_all = await base44.asServiceRole.entities.EventoM31Inscricao.filter(g5_filter);
    const g5_sample = await getSample(base44, 'EventoM31Inscricao', g5_filter);
    panorama['GRUPO_5_recuperacao_pendente_aprovacao'] = {
      titulo: 'Fila de recuperação aguardando aprovação do gestor',
      filtro: g5_filter,
      contagem: g5_all.length,
      primeiros_5: g5_sample.map(i => ({
        id: i.id,
        nome: i.nome,
        whatsapp: i.whatsapp,
        recovery_attempts: i.recovery_attempts,
        fila_recuperacao_em: i.fila_recuperacao_em,
        status_fila_recuperacao: i.status_fila_recuperacao
      }))
    };

    // ════════════════════════════════════════════════════════════════════════
    // GRUPO 6: Recuperação aprovada mas não enviada
    // ════════════════════════════════════════════════════════════════════════
    const g6_filter = {
      fila_recuperacao: true,
      status_fila_recuperacao: 'aprovado_para_envio'
    };
    const g6_all = await base44.asServiceRole.entities.EventoM31Inscricao.filter(g6_filter);
    const g6_sample = await getSample(base44, 'EventoM31Inscricao', g6_filter);
    panorama['GRUPO_6_recuperacao_pronta_envio'] = {
      titulo: 'Recuperação aprovada, pronto para envio',
      filtro: g6_filter,
      contagem: g6_all.length,
      primeiros_5: g6_sample.map(i => ({
        id: i.id,
        nome: i.nome,
        whatsapp: i.whatsapp,
        recovery_attempts: i.recovery_attempts,
        fila_recuperacao_em: i.fila_recuperacao_em
      }))
    };

    // ════════════════════════════════════════════════════════════════════════
    // GRUPO 7: Webhook processando há muito tempo (lock stale)
    // ════════════════════════════════════════════════════════════════════════
    const g7_filter = {
      webhook_processando: true,
      updated_date: { $lt: new Date(new Date(agora).getTime() - 10 * 60 * 1000).toISOString() }
    };
    const g7_all = await base44.asServiceRole.entities.EventoM31Inscricao.filter(g7_filter);
    const g7_sample = await getSample(base44, 'EventoM31Inscricao', g7_filter);
    panorama['GRUPO_7_webhook_travado'] = {
      titulo: 'Webhook travado (processando há > 10 min)',
      filtro: g7_filter,
      contagem: g7_all.length,
      primeiros_5: g7_sample.map(i => ({
        id: i.id,
        nome: i.nome,
        whatsapp: i.whatsapp,
        webhook_processando: i.webhook_processando,
        updated_date: i.updated_date,
        status_pagamento: i.status_pagamento
      }))
    };

    // ════════════════════════════════════════════════════════════════════════
    // GRUPO 8: Fila de espera WhatsApp (hard cap diário atingido)
    // ════════════════════════════════════════════════════════════════════════
    const g8_filter = {
      status_envio_grupo: 'fila_de_espera_wa'
    };
    const g8_all = await base44.asServiceRole.entities.EventoM31Inscricao.filter(g8_filter);
    const g8_sample = await getSample(base44, 'EventoM31Inscricao', g8_filter);
    panorama['GRUPO_8_fila_espera_wa'] = {
      titulo: 'Fila de espera WhatsApp (hard cap 40 msgs/dia atingido)',
      filtro: g8_filter,
      contagem: g8_all.length,
      primeiros_5: g8_sample.map(i => ({
        id: i.id,
        nome: i.nome,
        whatsapp: i.whatsapp,
        status_envio_grupo: i.status_envio_grupo,
        created_date: i.created_date
      }))
    };

    // ════════════════════════════════════════════════════════════════════════
    // GRUPO 9: Código de inscrição não gerado
    // ════════════════════════════════════════════════════════════════════════
    const g9_filter = {
      status_pagamento: { $in: ['aprovado', 'checkout_pendente'] },
      codigo_inscricao: { $in: [null, ''] }
    };
    const g9_all = await base44.asServiceRole.entities.EventoM31Inscricao.filter(g9_filter);
    const g9_sample = await getSample(base44, 'EventoM31Inscricao', g9_filter);
    panorama['GRUPO_9_codigo_ausente'] = {
      titulo: 'Código de inscrição não gerado (falta identificador)',
      filtro: g9_filter,
      contagem: g9_all.length,
      primeiros_5: g9_sample.map(i => ({
        id: i.id,
        nome: i.nome,
        status_pagamento: i.status_pagamento,
        created_date: i.created_date
      }))
    };

    // ════════════════════════════════════════════════════════════════════════
    // GRUPO 10: Boas-vindas iniciadas mas não finalizadas (timeout/erro)
    // ════════════════════════════════════════════════════════════════════════
    const g10_filter = {
      boas_vindas_iniciada_em: { $exists: true, $ne: null },
      data_envio_boas_vindas: { $in: [null, ''] },
      updated_date: { $lt: new Date(new Date(agora).getTime() - 5 * 60 * 1000).toISOString() }
    };
    const g10_all = await base44.asServiceRole.entities.EventoM31Inscricao.filter(g10_filter);
    const g10_sample = await getSample(base44, 'EventoM31Inscricao', g10_filter);
    panorama['GRUPO_10_boas_vindas_timeout'] = {
      titulo: 'Boas-vindas iniciadas mas não finalizadas (timeout > 5 min)',
      filtro: g10_filter,
      contagem: g10_all.length,
      primeiros_5: g10_sample.map(i => ({
        id: i.id,
        nome: i.nome,
        whatsapp: i.whatsapp,
        boas_vindas_iniciada_em: i.boas_vindas_iniciada_em,
        data_envio_boas_vindas: i.data_envio_boas_vindas
      }))
    };

    // ════════════════════════════════════════════════════════════════════════
    // GRUPO 11: Recuperação fatigada (>= 2 tentativas)
    // ════════════════════════════════════════════════════════════════════════
    const g11_filter = {
      recovery_attempts: { $gte: 2 },
      status_pagamento: { $ne: 'aprovado' },
      opt_out: false
    };
    const g11_all = await base44.asServiceRole.entities.EventoM31Inscricao.filter(g11_filter);
    const g11_sample = await getSample(base44, 'EventoM31Inscricao', g11_filter);
    panorama['GRUPO_11_recuperacao_fatigada'] = {
      titulo: 'Recuperação fatigada (>= 2 tentativas, parar contato)',
      filtro: g11_filter,
      contagem: g11_all.length,
      primeiros_5: g11_sample.map(i => ({
        id: i.id,
        nome: i.nome,
        whatsapp: i.whatsapp,
        recovery_attempts: i.recovery_attempts,
        last_recovery_at: i.last_recovery_at,
        status_pagamento: i.status_pagamento
      }))
    };

    // ════════════════════════════════════════════════════════════════════════
    // GRUPO 12: Checkout pendente há > 7 dias (leads frios)
    // ════════════════════════════════════════════════════════════════════════
    const g12_filter = {
      status_pagamento: 'checkout_pendente',
      created_date: { $lt: sete_dias_atras },
      whatsapp: { $exists: true, $ne: '' }
    };
    const g12_all = await base44.asServiceRole.entities.EventoM31Inscricao.filter(g12_filter);
    const g12_sample = await getSample(base44, 'EventoM31Inscricao', g12_filter);
    panorama['GRUPO_12_leads_frios'] = {
      titulo: 'Checkout pendente há > 7 dias (leads frios)',
      filtro: g12_filter,
      contagem: g12_all.length,
      primeiros_5: g12_sample.map(i => ({
        id: i.id,
        nome: i.nome,
        whatsapp: i.whatsapp,
        created_date: i.created_date,
        dias_sem_pagamento: Math.floor((new Date(agora).getTime() - new Date(i.created_date).getTime()) / (24 * 60 * 60 * 1000))
      }))
    };

    // ════════════════════════════════════════════════════════════════════════
    // GRUPO 13: Entrada no grupo confirmada (sucesso rastreado)
    // ════════════════════════════════════════════════════════════════════════
    const g13_filter = {
      entrou_no_grupo: true,
      status_pagamento: 'aprovado'
    };
    const g13_all = await base44.asServiceRole.entities.EventoM31Inscricao.filter(g13_filter);
    const g13_sample = await getSample(base44, 'EventoM31Inscricao', g13_filter);
    panorama['GRUPO_13_entrada_grupo_confirmada'] = {
      titulo: 'Entrada no grupo confirmada (sucesso rastreado)',
      filtro: g13_filter,
      contagem: g13_all.length,
      primeiros_5: g13_sample.map(i => ({
        id: i.id,
        nome: i.nome,
        whatsapp: i.whatsapp,
        data_entrada_grupo: i.data_entrada_grupo,
        origem_confirmacao_grupo: i.origem_confirmacao_grupo
      }))
    };

    // ════════════════════════════════════════════════════════════════════════
    // GRUPO 14: Opt-out / Rejeitados (não contatar)
    // ════════════════════════════════════════════════════════════════════════
    const g14_filter = {
      opt_out: true
    };
    const g14_all = await base44.asServiceRole.entities.EventoM31Inscricao.filter(g14_filter);
    const g14_sample = await getSample(base44, 'EventoM31Inscricao', g14_filter);
    panorama['GRUPO_14_opt_out'] = {
      titulo: 'Opt-out / Rejeitados (não contatar mais)',
      filtro: g14_filter,
      contagem: g14_all.length,
      primeiros_5: g14_sample.map(i => ({
        id: i.id,
        nome: i.nome,
        whatsapp: i.whatsapp,
        status_pagamento: i.status_pagamento,
        created_date: i.created_date
      }))
    };

    // ════════════════════════════════════════════════════════════════════════
    // GRUPO 15: Caravana inconsistente (dados truncados)
    // ════════════════════════════════════════════════════════════════════════
    const g15_filter = {
      tipo: 'caravana',
      $or: [
        { caravana_id: { $exists: true, $ne: null }, caravana_nome: { $in: [null, ''] } },
        { caravana_id: { $in: [null, ''] }, caravana_nome: { $exists: true, $ne: null } }
      ]
    };
    const g15_all = await base44.asServiceRole.entities.EventoM31Inscricao.filter(g15_filter);
    const g15_sample = await getSample(base44, 'EventoM31Inscricao', g15_filter);
    panorama['GRUPO_15_caravana_inconsistente'] = {
      titulo: 'Caravana inconsistente (dados truncados/mismatch)',
      filtro: g15_filter,
      contagem: g15_all.length,
      primeiros_5: g15_sample.map(i => ({
        id: i.id,
        nome: i.nome,
        caravana_id: i.caravana_id,
        caravana_nome: i.caravana_nome,
        tipo: i.tipo
      }))
    };

    return Response.json({
      gerado_em: agora,
      total_grupos: Object.keys(panorama).length,
      total_registros_mapeados: Object.values(panorama as any).reduce((sum, g) => sum + (g as any).contagem, 0),
      grupos: panorama
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
