// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31PreparacaoFilas — Monta as 4 filas sem disparar nada
 * Apenas levantamento de dados, pré-visualização e análise de risco
 */

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // ── 1. FILA: BOAS-VINDAS PENDENTES ────────────────────────────
    const confirmadas = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
      { status_pagamento: 'aprovado' }, '-updated_date', 500
    );

    const msgLogs = await base44.asServiceRole.entities.M31MessageLog.filter(
      { tipo: 'boas_vindas', sucesso: true }, null, 500
    );
    const idsComBoasVindas = new Set(msgLogs.map(l => l.inscricao_id));

    const filaBoasVindas = confirmadas
      .filter(i =>
        !i.data_envio_boas_vindas &&
        !idsComBoasVindas.has(i.id) &&
        i.whatsapp &&
        i.whatsapp.length >= 12
      )
      .map(i => ({
        id: i.id,
        nome: i.nome,
        phone: i.whatsapp,
        email: i.email,
        lote: i.lote,
        status_pagamento: i.status_pagamento,
        data_pagamento: i.updated_date,
        dias_desde_pagamento: Math.floor((new Date().getTime() - new Date(i.updated_date).getTime()) / (24 * 60 * 60 * 1000))
      }))
      .slice(0, 30);

    // ── 2. FILA: DUPLICADAS ────────────────────────────────────────
    const mapDuplicados = new Map();
    confirmadas.forEach(i => {
      const chave = i.email || i.whatsapp;
      if (!mapDuplicados.has(chave)) mapDuplicados.set(chave, []);
      mapDuplicados.get(chave).push(i);
    });

    const filaDuplicadas = Array.from(mapDuplicados.values())
      .filter(grupo => {
        const comBV = grupo.filter(i => i.data_envio_boas_vindas);
        return comBV.length > 1; // Mais de um recebeu BV
      })
      .flatMap(g => {
        const comBV = g.filter(i => i.data_envio_boas_vindas).sort((a, b) =>
          new Date(b.data_envio_boas_vindas).getTime() - new Date(a.data_envio_boas_vindas).getTime()
        );
        return comBV.map((i, idx) => ({
          id: i.id,
          nome: i.nome,
          phone: i.whatsapp,
          email: i.email,
          vezes_recebida: comBV.length,
          primeira_em: comBV[comBV.length - 1].data_envio_boas_vindas,
          ultima_em: i.data_envio_boas_vindas,
          posicao_duplicada: idx + 1
        }));
      })
      .slice(0, 30);

    // ── 3. FILA: FORA DO GRUPO ─────────────────────────────────────
    const grupoMembros = await base44.asServiceRole.entities.M31GrupoMembro.filter(
      { status: 'ativa' }, null, 500
    );
    const phonesNoGrupo = new Set(grupoMembros.map(m => m.phone));

    const filaForaDoGrupo = confirmadas
      .filter(i =>
        i.data_envio_boas_vindas &&
        !i.entrou_no_grupo &&
        i.whatsapp &&
        !phonesNoGrupo.has(i.whatsapp)
      )
      .map(i => ({
        id: i.id,
        nome: i.nome,
        phone: i.whatsapp,
        email: i.email,
        data_boas_vindas_enviada: i.data_envio_boas_vindas,
        dias_desde_bv: Math.floor((new Date().getTime() - new Date(i.data_envio_boas_vindas).getTime()) / (24 * 60 * 60 * 1000)),
        lote: i.lote
      }))
      .sort((a, b) => new Date(b.data_boas_vindas_enviada).getTime() - new Date(a.data_boas_vindas_enviada).getTime())
      .slice(0, 30);

    // ── 4. FILA: RECUPERAÇÃO (pendentes/abandonadas 30d) ───────────
    const agora = new Date();
    const trinta_dias_atras = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000);

    const incompletas = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
      { status_pagamento: 'checkout_pendente' }, '-created_date', 500
    );
    const abandonadas = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
      { status_pagamento: 'checkout_abandonado' }, '-checkout_abandoned_at', 500
    );

    const precisamRecuperacao = [
      ...incompletas.filter(i => i.created_date >= trinta_dias_atras.toISOString()),
      ...abandonadas.filter(i => i.checkout_abandoned_at && i.checkout_abandoned_at >= trinta_dias_atras.toISOString())
    ];

    const logsRecuperacao = await base44.asServiceRole.entities.M31MessageLog.filter(
      { tipo: 'recuperacao' }, null, 500
    );
    const phonesComRecuperacao = new Set(logsRecuperacao.map(l => l.telefone));

    const filaRecuperacao = precisamRecuperacao
      .filter(i =>
        i.whatsapp &&
        i.whatsapp.length >= 12 &&
        !phonesComRecuperacao.has(i.whatsapp) &&
        i.status_pagamento !== 'aprovado' // Excluir quem já pagou
      )
      .map(i => ({
        id: i.id,
        nome: i.nome,
        phone: i.whatsapp,
        email: i.email,
        status_pagamento: i.status_pagamento,
        data_criacao: i.created_date,
        dias_pendente: Math.floor((agora.getTime() - new Date(i.created_date).getTime()) / (24 * 60 * 60 * 1000)),
        lote: i.lote,
        valor: i.valor_pago,
        tentativas_recuperacao: i.recovery_attempts || 0
      }))
      .sort((a, b) => b.dias_pendente - a.dias_pendente)
      .slice(0, 30);

    // ── ANÁLISE DE RISCO ───────────────────────────────────────────
    const riscoDuplicidade = {
      inscricoes_duplicadas: mapDuplicados.size - Array.from(mapDuplicados.values()).filter(g => g.length === 1).length,
      pessoas_afetadas: Array.from(mapDuplicados.values())
        .filter(g => g.filter(i => i.data_envio_boas_vindas).length > 1)
        .reduce((sum, g) => sum + g.filter(i => i.data_envio_boas_vindas).length, 0),
      recomendacao: 'Revisar duplicadas antes de reprocessar boas-vindas'
    };

    // ── RECOMENDAÇÃO DE ORDEM ──────────────────────────────────────
    const ordemRecomendada = [
      {
        fila: 'boas_vindas_pendentes',
        prioridade: 1,
        justificativa: 'Base de todas as outras filas — sem BV, não há grupo/recuperação',
        impacto: filaBoasVindas.length,
        duracao_estimada_minutos: Math.ceil(filaBoasVindas.length / 40) // Hard cap de 40/dia
      },
      {
        fila: 'fora_do_grupo',
        prioridade: 2,
        justificativa: 'Reenviar link após confirmar BV foi recebida',
        impacto: filaForaDoGrupo.length,
        duracao_estimada_minutos: Math.ceil(filaForaDoGrupo.length / 40)
      },
      {
        fila: 'recuperacao_pendentes_abandonadas',
        prioridade: 3,
        justificativa: 'Recuperar checkouts abandonados (impacto financeiro)',
        impacto: filaRecuperacao.length,
        duracao_estimada_minutos: Math.ceil(filaRecuperacao.length / 40)
      },
      {
        fila: 'duplicadas_auditoria',
        prioridade: 4,
        justificativa: 'Apenas auditoria — sem novo envio',
        impacto: filaDuplicadas.length,
        duracao_estimada_minutos: 0
      }
    ];

    return Response.json({
      timestamp: new Date().toISOString(),
      resumo: {
        total_confirmadas: confirmadas.length,
        boas_vindas_pendentes: filaBoasVindas.length,
        duplicadas: filaDuplicadas.length,
        fora_do_grupo: filaForaDoGrupo.length,
        recuperacao_pendentes: filaRecuperacao.length,
        pessoas_impactadas_total: new Set([
          ...filaBoasVindas.map(p => p.id),
          ...filaDuplicadas.map(p => p.id),
          ...filaForaDoGrupo.map(p => p.id),
          ...filaRecuperacao.map(p => p.id)
        ]).size
      },
      filas: {
        boas_vindas_pendentes: {
          total: filaBoasVindas.length,
          criterio: 'status_pagamento=aprovado AND sem data_envio_boas_vindas AND sem log sucesso E telefone válido',
          primeiros_30: filaBoasVindas,
          hard_cap_dias: HARD_CAP_40_MENSAGENS
        },
        duplicadas: {
          total: filaDuplicadas.length,
          criterio: 'mesmo email/phone recebeu BV mais de uma vez',
          primeiros_30: filaDuplicadas,
          acoes: 'AUDITORIA APENAS — não disparar'
        },
        fora_do_grupo: {
          total: filaForaDoGrupo.length,
          criterio: 'confirmada AND BV enviada AND NOT em M31GrupoMembro',
          primeiros_30: filaForaDoGrupo,
          hard_cap_dias: HARD_CAP_40_MENSAGENS
        },
        recuperacao_pendentes_abandonadas: {
          total: filaRecuperacao.length,
          criterio: 'status_pagamento IN (checkout_pendente, checkout_abandonado) AND últimos 30d AND sem recuperação recente AND status != aprovado',
          primeiros_30: filaRecuperacao,
          hard_cap_dias: HARD_CAP_40_MENSAGENS
        }
      },
      risco_duplicidade: riscoDuplicidade,
      ordem_recomendada: ordemRecomendada,
      proximas_acoes: [
        '1️⃣  Revisar duplicadas (auditoria)',
        '2️⃣  Aprovar disparo de boas-vindas (impacto: ' + filaBoasVindas.length + ')',
        '3️⃣  Reenviar link grupo para ' + filaForaDoGrupo.length + ' pendentes',
        '4️⃣  Disparar recuperação para ' + filaRecuperacao.length + ' checkouts',
        '⚠️  Usar hard cap de 40 msgs/dia para não bloquear número'
      ]
    });

  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
})(req);

const HARD_CAP_40_MENSAGENS = `
⚠️  REGRA CRÍTICA: máximo 40 mensagens/dia via UAZAPI
Excedentes marcados com 'fila_de_espera_wa' para próximo dia.
Use m31WhatsAppControl para rastrear enviadas_hoje.
`;
}
