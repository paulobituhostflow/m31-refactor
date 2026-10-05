// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

// Régua automática de follow-up de leads
// Roda às 09:00 e 18:00 — dispara mensagens para leads com next_contact_at <= agora

const STAGE_ORDER = ['d0', 'd1', 'd3', 'd7'];
const STAGE_DAYS  = { d0: 0, d1: 1, d3: 3, d7: 7 };

function horaRecifeAgora() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Fortaleza' }));
}

function isDomingo(date) {
  return date.getDay() === 0;
}

function isFueraHorario(date) {
  const h = date.getHours();
  return h < 9 || h >= 20;
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const agora = horaRecifeAgora();

    // Proteções: domingo e fora do horário comercial
    if (isDomingo(agora)) {
      return Response.json({ skipped: true, reason: 'domingo' });
    }
    if (isFueraHorario(agora)) {
      return Response.json({ skipped: true, reason: 'fora_horario_comercial' });
    }

    // Buscar leads elegíveis (APENAS pendente/checkout_abandonado, NÃO aprovado/gratuito)
    const leads = await base44.asServiceRole.entities.EventoM31Inscricao.filter({
      status_pagamento: ['pendente', 'checkout_abandonado'],
      opt_out: false,
    }, '-created_date', 500);

    // Filtrar: remover leads que já têm asaas_payment_id válido (já tem cobrança ativa)
    const leadsElegiveis = leads.filter(lead => {
      // Se status é "pendente" e tem asaas_payment_id, só lembramos da cobrança existente
      // Se status é "checkout_abandonado", só criamos nova cobrança se NÃO tem asaas_payment_id
      if (lead.status_pagamento === 'pendente' && lead.asaas_payment_id) {
        return true; // Elegível para REENVIAR link existente
      }
      if (lead.status_pagamento === 'checkout_abandonado' && !lead.asaas_payment_id) {
        return true; // Elegível para CRIAR nova cobrança
      }
      // Qualquer outro caso: pular
      return false;
    });

    // Buscar templates ativos
    const templates = await base44.asServiceRole.entities.M31MessageTemplate.filter({ is_active: true });

    const agoraMs = agora.getTime();
    const resultados = { disparados: 0, pulados: 0, erros: 0 };

    // Guard de deduplicação: set de inscricao_ids que já receberam cobrança nas últimas 24h
    const corte24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const logsRecentes = await base44.asServiceRole.entities.M31MessageLog.filter(
      { tipo: 'cobranca' }, '-enviado_em', 500
    );
    const idsJaEnviados = new Set(
      logsRecentes.filter(l => l.enviado_em >= corte24h && l.sucesso === true).map(l => l.inscricao_id)
    );

    for (const lead of leadsElegiveis) {
      // Pular se não tem WhatsApp
      if (!lead.whatsapp) { resultados.pulados++; continue; }

      // Guard M31MessageLog: já recebeu cobrança nas últimas 24h?
      if (idsJaEnviados.has(lead.id)) { resultados.pulados++; continue; }

      // Pular se já recebeu mensagem hoje (campo local)
      if (lead.last_contact_at) {
        const ultimoContato = new Date(lead.last_contact_at);
        const mesmoDia = ultimoContato.toDateString() === agora.toDateString();
        if (mesmoDia) { resultados.pulados++; continue; }
      }

      // Verificar se next_contact_at <= agora
      if (lead.next_contact_at && new Date(lead.next_contact_at).getTime() > agoraMs) {
        resultados.pulados++; continue;
      }

      // Determinar stage atual
      const stage = lead.current_stage || 'd0';
      if (stage === 'encerrado') { resultados.pulados++; continue; }

      // Verificar se passou +7d da última mensagem sem resposta
      if (lead.last_contact_at) {
        const diasSemContato = (agoraMs - new Date(lead.last_contact_at).getTime()) / (1000 * 60 * 60 * 24);
        if (diasSemContato > 8) {
          await base44.asServiceRole.entities.EventoM31Inscricao.update(lead.id, { current_stage: 'encerrado' });
          resultados.pulados++; continue;
        }
      }

      // Buscar template correspondente ao stage
      const template = templates.find(t => t.trigger_stage === stage);
      if (!template) { resultados.pulados++; continue; }

      // Montar mensagem — remove linha inteira se variável estiver vazia
      let mensagem = template.content
        .replace(/{nome}/g, lead.nome?.split(' ')[0] || lead.nome || '');

      if (!lead.valor_pago) {
        mensagem = mensagem.replace(/^.*\{valor\}.*$\n?/gm, '');
      } else {
        mensagem = mensagem.replace(/{valor}/g, `R$ ${Number(lead.valor_pago).toFixed(2)}`);
      }

      if (!lead.asaas_charge_url) {
        mensagem = mensagem.replace(/^.*\{link_checkout\}.*$\n?/gm, '');
      } else {
        mensagem = mensagem.replace(/{link_checkout}/g, lead.asaas_charge_url);
      }

      mensagem = mensagem.trim();

      // Enviar via m31ReenviarCobranca (envia via UAZAPI, camada única de mensageria)
      try {
        await base44.asServiceRole.functions.invoke('m31ReenviarCobranca', {
          inscricao_id: lead.id,
          mensagem_customizada: mensagem,
        });
      } catch (e) {
        resultados.erros++;
        continue;
      }

      // Calcular próximo stage e next_contact_at
      const idxAtual = STAGE_ORDER.indexOf(stage);
      const proximoStage = idxAtual < STAGE_ORDER.length - 1 ? STAGE_ORDER[idxAtual + 1] : 'encerrado';
      const diasProximo = proximoStage !== 'encerrado' ? STAGE_DAYS[proximoStage] : null;

      let nextContactAt = null;
      if (diasProximo != null) {
        const next = new Date(agora);
        next.setDate(next.getDate() + (diasProximo - STAGE_DAYS[stage]));
        next.setHours(9, 0, 0, 0);
        // Pular domingo
        if (next.getDay() === 0) next.setDate(next.getDate() + 1);
        nextContactAt = next.toISOString();
      }

      await base44.asServiceRole.entities.EventoM31Inscricao.update(lead.id, {
        last_contact_at: new Date().toISOString(),
        last_recovery_at: new Date().toISOString(),
        next_contact_at: nextContactAt,
        current_stage: proximoStage,
        recovery_attempts: (lead.recovery_attempts || 0) + 1,
      });

      // Atualizar contador do template
      await base44.asServiceRole.entities.M31MessageTemplate.update(template.id, {
        sends_total: (template.sends_total || 0) + 1,
      });

      resultados.disparados++;
    }

    return Response.json({ success: true, ...resultados, rodou_em: new Date().toISOString() });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
