// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31AuditorAutomatico — REGRA 5, 7, 10
 *
 * Rotina horária que audita todas as etapas críticas do fluxo de inscrições.
 * Procura gaps, violações de SLA e backlog crítico.
 * Gera incidentes automaticamente em M31OperacaoIncidente.
 * Envia alerta WhatsApp para o gestor quando há incidentes críticos.
 *
 * SLA: cada etapa crítica tem 30 minutos (boas-vindas, QR, grupo).
 * Se ultrapassar, cria incidente de SLA violado.
 */

const SLA_MIN = 30;
const SLA_MS = SLA_MIN * 60 * 1000;
const BACKLOG_CRITICO = 10;

function normalizePhone(phone) {
  let d = (phone || '').replace(/\D/g, '');
  while (d.startsWith('5555')) d = d.slice(2);
  if (d.startsWith('55') && d.length >= 12) return d;
  if (d.length >= 10) return `55${d}`;
  return d;
}

async function sendAlertUAZAPI(phone, message) {
  try {
    const token = config('UAZAPI_TOKEN');
    if (!token) return;
    const baseUrl = (config('UAZAPI_BASE') || '__UAZAPI_API__').replace(/\/+$/, '');
    await fetch(`${baseUrl}/send/text`, {
      method: 'POST',
      headers: { 'token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: phone, phone, message, text: message }),
    });
  } catch (e) { logger.error('[Auditor] Erro ao enviar alerta:', e.message); }
}

async function criarOuAtualizarIncidente(base44, tipo, severidade, descricao, metrica) {
  const existentes = await base44.asServiceRole.entities.M31OperacaoIncidente.filter(
    { tipo, status: 'novo' }, '-created_date', 1
  );
  if (existentes.length > 0) {
    return base44.asServiceRole.entities.M31OperacaoIncidente.update(existentes[0].id, {
      descricao, severidade, metrica_valor: metrica,
    });
  }
  return base44.asServiceRole.entities.M31OperacaoIncidente.create({
    tipo, severidade, descricao, metrica_valor: metrica,
    auto_gerado: true, origem: 'm31AuditorAutomatico', status: 'novo',
  });
}

async function registrarTimeline(base44, inscricao_id, evento, status, detalhe) {
  try {
    await base44.asServiceRole.entities.M31InscricaoTimeline.create({
      inscricao_id, evento, status, detalhe, origem: 'm31AuditorAutomatico',
    });
  } catch (_) {}
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const AGORA = Date.now();
    const SLA_CORTE = new Date(AGORA - SLA_MS);
    const incidentesCriados = [];
    const metricas = {};
    const alertas = [];

    // ── 1. GAP: Aprovadas sem boas-vindas ──
    const aprovSemBoasVindas = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
      { status_pagamento: 'aprovado', data_envio_boas_vindas: null },
      '+created_date', 500
    );
    metricas.aprovadas_sem_boas_vindas = aprovSemBoasVindas.length;

    const slaViolationsBV = aprovSemBoasVindas.filter(i =>
      i.created_date && new Date(i.created_date) < SLA_CORTE
    );

    if (slaViolationsBV.length > 0) {
      const inc = await criarOuAtualizarIncidente(base44,
        'gap_boas_vindas',
        slaViolationsBV.length > BACKLOG_CRITICO ? 'critico' : 'alto',
        `${slaViolationsBV.length} inscrição(ões) aprovadas sem boas-vindas há mais de ${SLA_MIN} min (SLA violado)`,
        slaViolationsBV.length
      );
      incidentesCriados.push(inc);
      for (const i of slaViolationsBV.slice(0, 10)) {
        await registrarTimeline(base44, i.id, 'sla_violado', 'falha', `Boas-vindas não enviadas em ${SLA_MIN}min`);
      }
    }

    // ── 2. BACKLOG CRÍTICO: boas-vindas pendentes > 10 ──
    if (aprovSemBoasVindas.length > BACKLOG_CRITICO) {
      const inc = await criarOuAtualizarIncidente(base44,
        'backlog_critico',
        'critico',
        `Backlog crítico: ${aprovSemBoasVindas.length} inscrições aguardando boas-vindas`,
        aprovSemBoasVindas.length
      );
      incidentesCriados.push(inc);
      alertas.push(`🚨 BACKLOG CRÍTICO: ${aprovSemBoasVindas.length} inscrições aguardando boas-vindas. Safety Net deve estar processando.`);
    }

    // ── 3. GAP: QR pendente após boas-vindas enviadas ──
    const qrPendentes = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
      { status_pagamento: 'aprovado', qr_envio_status: 'gerado_nao_enviado' },
      '+created_date', 500
    );
    metricas.qr_pendentes = qrPendentes.length;

    const slaViolationsQR = qrPendentes.filter(i =>
      i.data_envio_boas_vindas && new Date(i.data_envio_boas_vindas) < SLA_CORTE
    );

    if (slaViolationsQR.length > 0) {
      const inc = await criarOuAtualizarIncidente(base44,
        'gap_qr',
        slaViolationsQR.length > BACKLOG_CRITICO ? 'critico' : 'alto',
        `${slaViolationsQR.length} inscrição(ões) com QR Code não enviado há mais de ${SLA_MIN} min após boas-vindas`,
        slaViolationsQR.length
      );
      incidentesCriados.push(inc);
    }

    // ── 4. GAP: Grupo pendente após boas-vindas ──
    const grupoPendentes = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
      { status_pagamento: 'aprovado', status_envio_grupo: 'pendente' },
      '+created_date', 500
    );
    metricas.grupo_pendentes = grupoPendentes.length;

    const slaViolationsGrupo = grupoPendentes.filter(i =>
      i.data_envio_boas_vindas && new Date(i.data_envio_boas_vindas) < SLA_CORTE
    );

    if (slaViolationsGrupo.length > 0) {
      const inc = await criarOuAtualizarIncidente(base44,
        'gap_grupo',
        slaViolationsGrupo.length > BACKLOG_CRITICO ? 'critico' : 'alto',
        `${slaViolationsGrupo.length} inscrição(ões) sem link do grupo enviado há mais de ${SLA_MIN} min após boas-vindas`,
        slaViolationsGrupo.length
      );
      incidentesCriados.push(inc);
    }

    // ── 5. DLQ: itens acumulando ──
    const dlqItems = await base44.asServiceRole.entities.M31DeadLetterQueue.filter(
      { resolvido: false }, '-created_date', 500
    );
    metricas.dlq_pendentes = dlqItems.length;

    if (dlqItems.length > 0) {
      const inc = await criarOuAtualizarIncidente(base44,
        'dlq_acumulo',
        dlqItems.length > 5 ? 'critico' : 'alto',
        `${dlqItems.length} item(s) na Dead Letter Queue aguardando resolução`,
        dlqItems.length
      );
      incidentesCriados.push(inc);
      alertas.push(`📬 DLQ: ${dlqItems.length} item(s) aguardando resolução manual.`);
    }

    // ── 6. Recuperações paradas ──
    const recParadas = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
      { fila_recuperacao: true, status_fila_recuperacao: 'aguardando_aprovacao' },
      '+created_date', 500
    );
    metricas.recuperacoes_paradas = recParadas.length;

    if (recParadas.length > BACKLOG_CRITICO) {
      const inc = await criarOuAtualizarIncidente(base44,
        'gap_recuperacao',
        'alto',
        `${recParadas.length} recuperações aguardando aprovação`,
        recParadas.length
      );
      incidentesCriados.push(inc);
    }

    // ── 7. Cobranças pendentes ──
    const cobrancasPendentes = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
      { status_pagamento: 'pendente' },
      '+created_date', 500
    );
    metricas.cobrancas_pendentes = cobrancasPendentes.length;

    // ── ENVIAR ALERTAS WHATSAPP para incidentes críticos ──
    const criticos = incidentesCriados.filter(i => i && i.severidade === 'critico');
    if (criticos.length > 0 || alertas.length > 0) {
      const config = await base44.asServiceRole.entities.EventoM31Config.filter({});
      const gestorPhone = config[0]?.telefones_autorizados?.[0]?.numero;
      if (gestorPhone) {
        let msg = alertas.length > 0
          ? alertas.join('\n\n')
          : `🚨 ${criticos.length} incidente(s) crítico(s) detectado(s) pelo auditor automático.`;
        await sendAlertUAZAPI(normalizePhone(gestorPhone), msg);
        for (const inc of criticos) {
          if (inc && inc.id) {
            await base44.asServiceRole.entities.M31OperacaoIncidente.update(inc.id, { alerta_enviado: true }).catch(() => {});
          }
        }
      }
    }

    return Response.json({
      auditado_em: new Date(AGORA).toISOString(),
      metricas,
      incidentes_criados: incidentesCriados.filter(i => i).length,
      alertas_enviados: alertas.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
