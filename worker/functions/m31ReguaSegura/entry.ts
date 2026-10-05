// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31ReguaSegura
 * Régua de cobrança/recuperação com controle anti-bloqueio rígido.
 *
 * Regras:
 * - Horário: 08h-20h (Recife)
 * - Lotes: 5 mensagens, 1 min de intervalo entre elas
 * - Pausa de 10 min entre lotes
 * - Limite diário inicial: 25 (+20%/dia sem bloqueio)
 * - Randomização: 20-60s entre mensagens
 * - Nunca reenvia para quem já recebeu hoje
 * - Prioridade: pendentes recentes > pendentes antigos > recuperação fria
 */

const LOTE_SIZE       = 5;
const INTERVALO_MSG   = [20, 60];   // segundos entre mensagens no lote
const PAUSA_LOTE_MS   = 10 * 60 * 1000; // 10 min entre lotes
const HORA_INICIO     = 8;
const HORA_FIM        = 20;
const LIMITE_BASE     = 25;
const CRESCIMENTO_PCT = 0.20;       // +20%/dia sem bloqueio
const LIMITE_MAX      = 100;        // teto absoluto

/**
 * Retorna a data/hora atual corretamente ajustada para America/Recife (UTC-3).
 */
function horaRecife() {
  const utcNow = new Date();
  return new Date(utcNow.getTime() - 3 * 60 * 60 * 1000);
}

/**
 * Retorna a string "YYYY-MM-DD" no fuso America/Recife.
 */
function hojeRecife() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Recife' }).format(new Date());
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function randomMs(minS, maxS) {
  return (minS + Math.random() * (maxS - minS)) * 1000;
}

async function getOrCreateControl(base44, hoje) {
  const existing = await base44.asServiceRole.entities.M31WhatsAppControl.filter({ data: hoje });
  if (existing.length > 0) return existing[0];

  // Calcular limite baseado em dias sem bloqueio (buscar dia anterior, em Recife)
  const ontemDate = new Date(new Date().getTime() - 3 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000);
  const ontemStr = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Recife' }).format(ontemDate);
  const anterior = await base44.asServiceRole.entities.M31WhatsAppControl.filter({ data: ontemStr });
  const ctrl_ant = anterior[0];

  let dias_sem_bloqueio = 0;
  let limite_diario = LIMITE_BASE;

  if (ctrl_ant && !ctrl_ant.bloqueado) {
    dias_sem_bloqueio = (ctrl_ant.dias_sem_bloqueio || 0) + 1;
    limite_diario = Math.min(
      Math.floor(LIMITE_BASE * Math.pow(1 + CRESCIMENTO_PCT, dias_sem_bloqueio)),
      LIMITE_MAX
    );
  }

  return base44.asServiceRole.entities.M31WhatsAppControl.create({
    data: hoje,
    mensagens_enviadas_hoje: 0,
    limite_diario,
    dias_sem_bloqueio,
    bloqueado: false,
    total_falhas_hoje: 0,
    total_optouts_hoje: 0,
    boas_vindas_enviadas: 0,
    cobrancas_enviadas: 0,
  });
}



/**
 * Dedup por DIA (não por horas) → impede envio 2x no mesmo dia
 * Se já recebeu cobrança HOJE (em Recife), não reenvia.
 */
async function jaRecebeuCobranca(base44, inscricaoId, telefone) {
  const hojeRecife = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Recife' }).format(new Date());
  const inicioDojaRecife = new Date(hojeRecife + 'T00:00:00').toISOString();

  const logsPorId = await base44.asServiceRole.entities.M31MessageLog.filter(
    { inscricao_id: inscricaoId, tipo: 'cobranca' }, '-enviado_em', 1
  );
  if (logsPorId.length > 0 && new Date(logsPorId[0].enviado_em) >= new Date(inicioDojaRecife)) return true;

  const logsPorTel = await base44.asServiceRole.entities.M31MessageLog.filter(
    { telefone, tipo: 'cobranca' }, '-enviado_em', 1
  );
  if (logsPorTel.length > 0 && new Date(logsPorTel[0].enviado_em) >= new Date(inicioDojaRecife)) return true;

  return false;
}

async function registrarLog(base44, { inscricao_id, inscricao_nome, telefone, tipo, stage, mensagem, sucesso, zapi_response, erro }) {
  try {
    await base44.asServiceRole.entities.M31MessageLog.create({
      inscricao_id,
      inscricao_nome,
      telefone,
      tipo,
      stage,
      mensagem,
      sucesso,
      zapi_response: zapi_response ? JSON.stringify(zapi_response) : null,
      erro,
      enviado_em: new Date().toISOString(),
    });
  } catch (_) {}
}

const STAGE_ORDER = ['d0', 'd1', 'd3', 'd7'];
const STAGE_DAYS  = { d0: 0, d1: 1, d3: 3, d7: 7 };

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const agora = horaRecife();
    const hora  = agora.getHours();

    if (hora < HORA_INICIO || hora >= HORA_FIM) {
      return Response.json({ skipped: true, reason: 'fora_horario_seguro', hora });
    }

    const hoje = hojeRecife();
    let control = await getOrCreateControl(base44, hoje);

    if (control.bloqueado) {
      return Response.json({ skipped: true, reason: 'numero_bloqueado', bloqueado_em: control.bloqueado_em });
    }

    const limite = control.limite_diario || LIMITE_BASE;
    let enviados_hoje = control.mensagens_enviadas_hoje || 0;
    const vagas = limite - enviados_hoje;

    if (vagas <= 0) {
      return Response.json({ skipped: true, reason: 'limite_diario_atingido', limite, enviados_hoje });
    }

    // Buscar leads elegíveis: pendente/checkout_abandonado, sem opt_out
    // opt_out: false OU null (leads sem o campo preenchido também devem ser processados)
    const [pendentesAll, abandonadosAll] = await Promise.all([
      base44.asServiceRole.entities.EventoM31Inscricao.filter({ status_pagamento: 'pendente' }, '-created_date', 300),
      base44.asServiceRole.entities.EventoM31Inscricao.filter({ status_pagamento: 'checkout_abandonado' }, '-created_date', 300),
    ]);
    const pendentes  = pendentesAll.filter(l => l.opt_out !== true);
    const abandonados = abandonadosAll.filter(l => l.opt_out !== true);

    // Buscar templates
    const templates = await base44.asServiceRole.entities.M31MessageTemplate.filter({ is_active: true });

    const agoraTsMs = agora.getTime();

    // Filtrar e priorizar leads
    function filtrarElegiveis(lista) {
      return lista.filter(lead => {
        if (!lead.whatsapp) return false;
        if (lead.current_stage === 'encerrado') return false;
        // Não enviar para quem já recebeu hoje
        if (lead.last_contact_at) {
          const ontemDia = new Date(lead.last_contact_at).toDateString();
          if (ontemDia === agora.toDateString()) return false;
        }
        // Não enviar antes do next_contact_at
        if (lead.next_contact_at && new Date(lead.next_contact_at).getTime() > agoraTsMs) return false;
        // Não enviar se lead tem mais de 8 dias sem resposta (encerrar)
        if (lead.last_contact_at) {
          const dias = (agoraTsMs - new Date(lead.last_contact_at).getTime()) / (1000 * 60 * 60 * 24);
          if (dias > 8) return false;
        }
        return true;
      });
    }

    // Prioridade: pendentes recentes (< 3 dias) > pendentes antigos > abandonados
    const tresAtras = new Date(agoraTsMs - 3 * 24 * 60 * 60 * 1000);

    const pendenteRecentes  = filtrarElegiveis(pendentes.filter(l => new Date(l.created_date) >= tresAtras));
    const pendenteAntigos   = filtrarElegiveis(pendentes.filter(l => new Date(l.created_date) < tresAtras));
    const abandonadosFilt   = filtrarElegiveis(abandonados);

    // Encerrar leads com +8 dias (sem contar na cota)
    const paraEncerrar = [...pendentes, ...abandonados].filter(lead => {
      if (lead.current_stage === 'encerrado') return false;
      if (!lead.last_contact_at) return false;
      const dias = (agoraTsMs - new Date(lead.last_contact_at).getTime()) / (1000 * 60 * 60 * 24);
      return dias > 8;
    });
    for (const lead of paraEncerrar) {
      await base44.asServiceRole.entities.EventoM31Inscricao.update(lead.id, { current_stage: 'encerrado' });
    }

    // Lista final ordenada por prioridade
    const fila = [...pendenteRecentes, ...pendenteAntigos, ...abandonadosFilt].slice(0, vagas);

    const resultados = { disparados: 0, pulados: 0, erros: 0, encerrados: paraEncerrar.length };

    for (let i = 0; i < fila.length; i++) {
      const lead = fila[i];

      const telefone = (lead.whatsapp || '').replace(/\D/g, '');
      if (!telefone || telefone.length < 10) { resultados.pulados++; continue; }

      // Guard de deduplicação: checa M31MessageLog por inscricao_id e telefone (24h)
      const jaEnviou = await jaRecebeuCobranca(base44, lead.id, telefone);
      if (jaEnviou) { resultados.pulados++; continue; }

      const stage = lead.current_stage || 'd0';
      const template = templates.find(t => t.trigger_stage === stage);
      if (!template) { resultados.pulados++; continue; }

      let mensagem = template.content
        .replace(/{nome}/g, lead.nome?.split(' ')[0] || lead.nome || '');

      // Se não tem valor, remove a linha inteira que contém {valor}
      if (!lead.valor_pago) {
        mensagem = mensagem.replace(/^.*\{valor\}.*$\n?/gm, '');
      } else {
        mensagem = mensagem.replace(/{valor}/g, `R$ ${Number(lead.valor_pago).toFixed(2)}`);
      }

      // Se não tem link, remove a linha inteira que contém {link_checkout}
      if (!lead.asaas_charge_url) {
        mensagem = mensagem.replace(/^.*\{link_checkout\}.*$\n?/gm, '');
      } else {
        mensagem = mensagem.replace(/{link_checkout}/g, lead.asaas_charge_url);
      }

      mensagem = mensagem.trim();

      let sucesso = false;
      let zapiRes = null;
      let erroMsg = null;

      try {
        const wpRes = await base44.asServiceRole.functions.invoke('m31SendWhatsApp', { phone: telefone, message: mensagem });
        zapiRes = wpRes.uazapi_response || wpRes;
        sucesso = wpRes.sucesso === true;

        if (sucesso) {
          // Avançar stage
          const idxAtual = STAGE_ORDER.indexOf(stage);
          const proximoStage = idxAtual < STAGE_ORDER.length - 1 ? STAGE_ORDER[idxAtual + 1] : 'encerrado';
          const diasProximo = proximoStage !== 'encerrado' ? STAGE_DAYS[proximoStage] : null;

          let nextContactAt = null;
          if (diasProximo != null) {
            const next = new Date(agora);
            next.setDate(next.getDate() + (diasProximo - STAGE_DAYS[stage]));
            next.setHours(9, 0, 0, 0);
            if (next.getDay() === 0) next.setDate(next.getDate() + 1); // pular domingo
            nextContactAt = next.toISOString();
          }

          await base44.asServiceRole.entities.EventoM31Inscricao.update(lead.id, {
            last_contact_at: new Date().toISOString(),
            last_recovery_at: new Date().toISOString(),
            next_contact_at: nextContactAt,
            current_stage: proximoStage,
            recovery_attempts: (lead.recovery_attempts || 0) + 1,
          });

          await base44.asServiceRole.entities.M31MessageTemplate.update(template.id, {
            sends_total: (template.sends_total || 0) + 1,
          });

          enviados_hoje++;
          resultados.disparados++;
        } else {
          erroMsg = zapiRes?.error || 'Sem confirmação UAZAPI';
          resultados.erros++;
        }
      } catch (e) {
        erroMsg = e.message;
        resultados.erros++;
      }

      await registrarLog(base44, {
        inscricao_id: lead.id,
        inscricao_nome: lead.nome,
        telefone,
        tipo: 'cobranca',
        stage,
        mensagem,
        sucesso,
        zapi_response: zapiRes,
        erro: erroMsg,
      });

      // Controle de intervalo
      if (i < fila.length - 1) {
        const ehFimDeLote = (i + 1) % LOTE_SIZE === 0;
        if (ehFimDeLote) {
          // Atualizar controle antes da pausa entre lotes
          await base44.asServiceRole.entities.M31WhatsAppControl.update(control.id, {
            mensagens_enviadas_hoje: enviados_hoje,
            cobrancas_enviadas: (control.cobrancas_enviadas || 0) + resultados.disparados,
            total_falhas_hoje: (control.total_falhas_hoje || 0) + resultados.erros,
            ultimo_envio_em: new Date().toISOString(),
          });
          await sleep(PAUSA_LOTE_MS);
        } else {
          await sleep(randomMs(...INTERVALO_MSG));
        }
      }
    }

    // Atualizar controle final
    await base44.asServiceRole.entities.M31WhatsAppControl.update(control.id, {
      mensagens_enviadas_hoje: enviados_hoje,
      cobrancas_enviadas: (control.cobrancas_enviadas || 0) + resultados.disparados,
      total_falhas_hoje: (control.total_falhas_hoje || 0) + resultados.erros,
      ultimo_envio_em: new Date().toISOString(),
    });

    return Response.json({
      success: true,
      ...resultados,
      enviados_hoje,
      limite,
      vagas_restantes: limite - enviados_hoje,
      fila_processada: fila.length,
      rodou_em: new Date().toISOString(),
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
