// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

/**
 * m31AprovarRecuperacao — v2 FASE 1 SEGURANÇA (Governada + Verificação Asaas)
 *
 * Fluxo:
 * 1. Gestor visualiza fila_recuperacao = true
 * 2. Rejeita (action: 'reject') → status_fila_recuperacao = 'rejeitado'
 * 3. Aprova (action: 'approve') →
 *    a. Verifica opt_out
 *    b. RE-VERIFICA pagamento no Asaas — se pago, NÃO cobra, converte para aprovada
 *    c. Governança RECUPERACAO_CHECKOUT: idempotência por tentativa + cooldown 24h + lock
 *    d. Envia via UAZAPI inline (nunca invoke entre funções — 403)
 *    e. Registra M31AutomacaoLog + M31MessageLog
 */

// ===== GOVERNANCA RECUPERACAO_CHECKOUT =====
const COOLDOWN_H = 24;
const LOCK_TTL_MS = 5 * 60 * 1000;

function normalizePhone(phone) {
  let d = (phone || '').replace(/\D/g, '');
  while (d.startsWith('5555')) d = d.slice(2);
  if (d.startsWith('55') && d.length >= 12) return d;
  if (d.length >= 10) return `55${d}`;
  return d;
}

async function sendViaUAZAPI(phone, message) {
  const token = config('UAZAPI_TOKEN');
  if (!token) throw new Error('UAZAPI_TOKEN não configurado');
  const baseUrl = (config('UAZAPI_BASE') || '__UAZAPI_API__').replace(/\/+$/, '');
  const phoneSanitized = normalizePhone(phone);
  const resp = await fetch(`${baseUrl}/send/text`, {
    method: 'POST',
    headers: { 'token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ number: phoneSanitized, phone: phoneSanitized, message, text: message }),
  });
  const body = await resp.text();
  return { sucesso: resp.status === 200, status: resp.status, body };
}

// ── FASE 1 SEGURANÇA: verificação Asaas imediatamente antes do envio ────────
const ASAAS_PAGO = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'];
async function verificarPagamentoAsaas(cpf) {
  const cpfLimpo = (cpf || '').replace(/\D/g, '');
  if (cpfLimpo.length !== 11) return null;
  const KEY = config('ASAAS_API_KEY');
  if (!KEY) return null;
  try {
    const custRes = await fetch(`__ASAAS_API__/customers?cpfCnpj=${cpfLimpo}`, {
      headers: { 'access_token': KEY },
    });
    const custData = await custRes.json();
    if (!custData?.data?.length) return null;
    for (const cust of custData.data.slice(0, 3)) {
      const payRes = await fetch(`__ASAAS_API__/payments?customer=${cust.id}&limit=20`, {
        headers: { 'access_token': KEY },
      });
      const payData = await payRes.json();
      const pago = (payData?.data || []).find((p) => ASAAS_PAGO.includes(p.status));
      if (pago) return pago;
    }
    return null;
  } catch (e) {
    logger.error('[AprovarRecuperacao] Erro ao verificar Asaas:', e.message);
    return null; // erro de consulta não bloqueia — governança e status local seguem protegendo
  }
}

async function registrarLogGovernanca(base44, p) {
  try {
    await base44.asServiceRole.entities.M31AutomacaoLog.create({
      participante_id: p.participante_id,
      inscricao_principal: p.inscricao_principal || null,
      cpf: p.cpf || null,
      telefone: p.telefone || null,
      email: p.email || null,
      automacao: 'RECUPERACAO_CHECKOUT',
      template: p.template || null,
      versao: p.versao || 'V1',
      status: p.status,
      enviado_em: new Date().toISOString(),
      cooldown_ate: p.cooldown_ate || null,
      execution_id: p.execution_id,
      origem: 'm31AprovarRecuperacao',
      motivo_bloqueio: p.motivo_bloqueio || null,
      motivo_cancelamento: p.motivo_cancelamento || null,
      idempotency_key: p.idempotency_key,
    });
  } catch (e) { logger.error('[Governanca] Erro log:', e.message); }
}

// ── Mensagem única de recuperação (uma tentativa por pessoa) ──
// Template padrão solicitado para campanha de 7 dias.
function montarMensagem1(inscricao) {
  const nome = (inscricao.nome || 'Visitante').split(' ')[0];
  const rotaCaravana = inscricao.caravana_id
    ? `__APP_ORIGIN__/m31-caravana?caravana_id=${encodeURIComponent(inscricao.caravana_id)}`
    : '__APP_ORIGIN__/m31-caravana';
  const link = inscricao.asaas_charge_url || (inscricao.tipo === 'caravana'
    ? rotaCaravana
    : '__APP_ORIGIN__/m31-inscricao');
  if (inscricao.tipo === 'caravana') {
    const caravana = inscricao.caravana_nome ? ` da *${inscricao.caravana_nome}*` : '';
    return (
      `Oi, ${nome}! 😊\n\n` +
      `Vimos que você iniciou sua inscrição${caravana}, mas o processo não foi concluído. O formulário já foi corrigido e seus dados foram preservados. 💛\n\n` +
      `Retome por aqui:\n` +
      `👉 ${link}\n\n` +
      `Se precisar de ajuda, pode responder esta mensagem.`
    );
  }
  return (
    `Oi, ${nome}! 😊\n\n` +
    `Vi que você começou sua inscrição para o M31 Filhas, mas ela ainda não foi concluída. Precisa de ajuda?\n\n` +
    `Finalize sua inscrição por aqui:\n` +
    `👉 ${link}`
  );
}

// Mantido para compatibilidade — mesma mensagem (campanha de tentativa única)
function montarMensagem2(inscricao) {
  return montarMensagem1(inscricao);
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user?.email) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { inscricao_id, action, mensagem_personalizada, origem_manual, template_key } = await req.json();
    const manualAuditoria = origem_manual === 'auditoria';
    const templateUsado = manualAuditoria && template_key === 'recuperacao_manual_v1'
      ? 'recuperacao_manual_v1' : 'recuperacao_ester';

    if (!inscricao_id || !action || !['approve', 'reject'].includes(action)) {
      return Response.json({
        error: 'inscricao_id, action (approve|reject) obrigatórios'
      }, { status: 400 });
    }

    // Buscar inscrição
    let inscricao;
    try {
      inscricao = await base44.asServiceRole.entities.EventoM31Inscricao.get(inscricao_id);
    } catch (_) {
      return Response.json({ error: 'Inscrição não encontrada' }, { status: 404 });
    }

    // Validar estado. A recuperação manual da auditoria reutiliza esta mesma
    // governança sem exigir entrada prévia na fila de aprovação em massa.
    if (!manualAuditoria && (!inscricao.fila_recuperacao || inscricao.status_fila_recuperacao !== 'aguardando_aprovacao')) {
      return Response.json({
        error: 'Inscrição não está aguardando aprovação',
        estado_atual: inscricao.status_fila_recuperacao || 'nenhum'
      }, { status: 400 });
    }

    if (action === 'reject') {
      await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
        status_fila_recuperacao: 'rejeitado',
        fila_recuperacao: false
      });
      return Response.json({
        success: true,
        action: 'rejected',
        inscricao_nome: inscricao.nome,
        mensagem: 'Inscrição rejeitada da fila de recuperação'
      });
    }

    // ═══ APPROVE ═══
    const cpfNorm = (inscricao.cpf || '').replace(/\D/g, '');
    const telNorm = normalizePhone(inscricao.whatsapp);
    const emailNorm = (inscricao.email || '').toLowerCase().trim();
    const participante_id = cpfNorm || telNorm || emailNorm;
    const execution_id = crypto.randomUUID();
    const tentativas = inscricao.recovery_attempts || 0;
    const versao = `V1_T${tentativas + 1}`;
    const idempotencyKey = `${cpfNorm || telNorm}:RECUPERACAO_CHECKOUT:${versao}`;

    // 0. Bloqueio por status local (nunca cobrar aprovada/gratuita)
    if (['aprovado', 'gratuito'].includes(inscricao.status_pagamento)) {
      await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
        fila_recuperacao: false, status_fila_recuperacao: 'rejeitado',
      });
      return Response.json({
        success: false, ja_pagou: true, inscricao_nome: inscricao.nome,
        mensagem: 'Inscrição já está confirmada — cobrança não enviada e removida da fila.'
      });
    }

    // 1. OPT-OUT (governança)
    if (inscricao.opt_out) {
      await registrarLogGovernanca(base44, {
        participante_id, inscricao_principal: inscricao.id,
        cpf: cpfNorm || null, telefone: telNorm, email: emailNorm || null,
        template: templateUsado, versao, status: 'bloqueado',
        execution_id, motivo_bloqueio: 'opt_out', idempotency_key: idempotencyKey,
      });
      await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
        fila_recuperacao: false, status_fila_recuperacao: 'rejeitado',
      });
      return Response.json({
        success: false, motivo: 'opt_out', inscricao_nome: inscricao.nome,
        mensagem: 'Pessoa pediu para sair da régua (opt-out) — cobrança bloqueada.'
      });
    }

    // 2. RE-VERIFICAR ASAAS imediatamente antes de cobrar
    const pagamento = await verificarPagamentoAsaas(inscricao.cpf);
    if (pagamento) {
      // Já pagou → NÃO cobrar. Converter para aprovada (dispara fluxo de confirmada
      // via automação "Despachar Confirmações" + safety net de boas-vindas).
      await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
        status_pagamento: 'aprovado',
        asaas_payment_id: pagamento.id,
        valor_pago: pagamento.value || undefined,
        fila_recuperacao: false,
        status_fila_recuperacao: 'rejeitado',
      });
      await registrarLogGovernanca(base44, {
        participante_id, inscricao_principal: inscricao.id,
        cpf: cpfNorm || null, telefone: telNorm, email: emailNorm || null,
        template: templateUsado, versao, status: 'cancelado',
        execution_id, motivo_cancelamento: 'regua_encerrada_por_pagamento',
        idempotency_key: idempotencyKey,
      });
      await base44.asServiceRole.entities.M31InscricaoTimeline.create({
        inscricao_id: inscricao.id, cpf: cpfNorm || null,
        evento: 'reconciliacao_executada', etapa: 'recuperacao', status: 'sucesso',
        detalhe: `Pagamento ${pagamento.id} (${pagamento.status}) confirmado no Asaas na aprovação da recuperação — convertida para aprovada, cobrança evitada`,
        origem: 'm31AprovarRecuperacao',
      }).catch(() => {});
      return Response.json({
        success: true, ja_pagou: true, action: 'converted_to_approved',
        inscricao_nome: inscricao.nome, asaas_payment_id: pagamento.id,
        mensagem: '✅ Pagamento já confirmado no Asaas — inscrição aprovada, nenhuma cobrança enviada.'
      });
    }

    // 3. GOVERNANÇA: idempotência por tentativa
    const jaEnviado = await base44.asServiceRole.entities.M31AutomacaoLog.filter(
      { idempotency_key: idempotencyKey, status: 'enviado' }, '-enviado_em', 1);
    if (jaEnviado.length > 0) {
      await registrarLogGovernanca(base44, {
        participante_id, inscricao_principal: inscricao.id,
        cpf: cpfNorm || null, telefone: telNorm, email: emailNorm || null,
        template: templateUsado, versao, status: 'bloqueado',
        execution_id, motivo_bloqueio: 'idempotency_violation', idempotency_key: idempotencyKey,
      });
      return Response.json({
        success: false, motivo: 'idempotency_violation', inscricao_nome: inscricao.nome,
        mensagem: `Esta pessoa já recebeu a tentativa ${tentativas + 1} de recuperação.`
      });
    }

    // 4. GOVERNANÇA: cooldown 24h entre recuperações
    const cooldownCorte = new Date(Date.now() - COOLDOWN_H * 3600000).toISOString();
    const recentes = await base44.asServiceRole.entities.M31AutomacaoLog.filter(
      { participante_id, automacao: 'RECUPERACAO_CHECKOUT', status: 'enviado' }, '-enviado_em', 1);
    if (recentes.length > 0 && recentes[0].enviado_em && recentes[0].enviado_em >= cooldownCorte) {
      await registrarLogGovernanca(base44, {
        participante_id, inscricao_principal: inscricao.id,
        cpf: cpfNorm || null, telefone: telNorm, email: emailNorm || null,
        template: templateUsado, versao, status: 'bloqueado',
        execution_id, motivo_bloqueio: 'cooldown_ativo', idempotency_key: idempotencyKey,
      });
      return Response.json({
        success: false, motivo: 'cooldown_ativo', inscricao_nome: inscricao.nome,
        mensagem: `Cooldown ativo: última recuperação há menos de ${COOLDOWN_H}h.`
      });
    }

    // 5. GOVERNANÇA: lock de concorrência
    const lockKey = `RECUPERACAO_CHECKOUT:${cpfNorm || telNorm}`;
    const locksAtivos = await base44.asServiceRole.entities.M31AutomacaoLock.filter({ chave: lockKey, ativo: true });
    const lockValido = locksAtivos.find((l) => new Date(l.expira_em) > new Date());
    if (lockValido) {
      return Response.json({
        success: false, motivo: 'lock_ativo', inscricao_nome: inscricao.nome,
        mensagem: 'Outro envio para esta pessoa está em andamento. Aguarde alguns minutos.'
      });
    }
    await base44.asServiceRole.entities.M31AutomacaoLock.updateMany(
      { chave: lockKey, ativo: true }, { $set: { ativo: false } }).catch(() => {});
    let lockAdquirido = false;
    try {
      await base44.asServiceRole.entities.M31AutomacaoLock.create({
        chave: lockKey, ativo: true, execution_id,
        criado_em: new Date().toISOString(),
        expira_em: new Date(Date.now() + LOCK_TTL_MS).toISOString(),
      });
      lockAdquirido = true;
    } catch (_) {}
    if (!lockAdquirido) {
      return Response.json({
        success: false, motivo: 'lock_aquisicao_falhou', inscricao_nome: inscricao.nome,
        mensagem: 'Não foi possível adquirir o lock de envio. Tente novamente.'
      });
    }

    // 6. ENFILEIRAR na fila global (M31FilaMensagem) — envio real só pelo m31DrenarFila
    const mensagem = mensagem_personalizada || (tentativas === 0 ? montarMensagem1(inscricao) : montarMensagem2(inscricao));
    let sucesso = false;
    let erroMsg = null;
    let uazapiRes = null;
    try {
      try {
        const filaExistentes = await base44.asServiceRole.entities.M31FilaMensagem.filter(
          { dedup_key: idempotencyKey }, '-created_date', 5);
        const bloqueante = filaExistentes.find((f) =>
          ['pendente', 'processando', 'enviado', 'incerto', 'falha_terminal'].includes(f.status));
        const terminais = await base44.asServiceRole.entities.M31FilaMensagem.filter(
          { telefone: telNorm, status: 'falha_terminal' }, '-created_date', 1);
        if (bloqueante) {
          erroMsg = `fila_dedup_ativo:${bloqueante.status}`;
        } else if (terminais.length > 0) {
          erroMsg = 'telefone_bloqueado_falha_terminal';
        } else {
          await base44.asServiceRole.entities.M31FilaMensagem.create({
            dedup_key: idempotencyKey, participante_id,
            cpf: cpfNorm || null, telefone: telNorm, email: emailNorm || null,
            automacao: 'RECUPERACAO_CHECKOUT', template: templateUsado, versao,
            origem: manualAuditoria ? 'm31AprovarRecuperacao:auditoria_manual' : 'm31AprovarRecuperacao',
            aprovado_para_envio: manualAuditoria ? true : false,
            aprovado_por: manualAuditoria ? user.email : null,
            aprovado_em: manualAuditoria ? new Date().toISOString() : null,
            inscricao_id: inscricao.id, inscricao_nome: inscricao.nome,
            mensagens: [{ message: mensagem }], status: 'pendente', prioridade: 2, execution_id,
          });
          sucesso = true;
          uazapiRes = { enfileirado: true, fila: 'M31FilaMensagem' };
        }
      } catch (e) {
        erroMsg = e.message;
      }

      // 7. Logs de governança + mensagem
      await registrarLogGovernanca(base44, {
        participante_id, inscricao_principal: inscricao.id,
        cpf: cpfNorm || null, telefone: telNorm, email: emailNorm || null,
        template: templateUsado, versao,
        status: sucesso ? 'pendente' : 'bloqueado',
        cooldown_ate: sucesso ? new Date(Date.now() + COOLDOWN_H * 3600000).toISOString() : null,
        execution_id,
        motivo_bloqueio: sucesso ? null : `falha_enfileiramento: ${erroMsg}`,
        idempotency_key: idempotencyKey,
      });

      await base44.asServiceRole.entities.M31MessageLog.create({
        inscricao_id: inscricao.id,
        inscricao_nome: inscricao.nome,
        telefone: telNorm,
        tipo: 'recuperacao',
        stage: tentativas === 0 ? 'd0' : 'd1',
        mensagem,
        sucesso,
        zapi_response: uazapiRes ? JSON.stringify(uazapiRes) : null,
        erro: sucesso ? null : erroMsg,
        enviado_em: new Date().toISOString()
      }).catch(() => {});
    } finally {
      // 8. Liberar lock IMEDIATAMENTE em qualquer cenário (sucesso, falha ou timeout)
      await base44.asServiceRole.entities.M31AutomacaoLock.updateMany(
        { chave: lockKey, execution_id }, { $set: { ativo: false } }).catch(() => {});
    }

    // 9. Atualizar inscrição
    if (sucesso) {
      await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
        status_fila_recuperacao: 'enviado',
        fila_recuperacao: false,
        recovery_attempts: tentativas + 1,
        last_recovery_at: new Date().toISOString(),
        last_contact_at: new Date().toISOString(),
        current_stage: tentativas === 0 ? 'd0' : 'd1'
      });
    }

    return Response.json({
      success: sucesso,
      action: 'approved_and_sent',
      template: templateUsado,
      status_envio: sucesso ? 'na_fila' : 'bloqueado',
      inscricao_nome: inscricao.nome,
      tentativa: tentativas + 1,
      enviado: sucesso,
      mensagem: sucesso
        ? '✅ Mensagem de recuperação enfileirada na fila global (envio pelo drenador).'
        : `❌ Mensagem não foi enfileirada: ${erroMsg || 'falha desconhecida'}`
    }, { status: sucesso ? 200 : 500 });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
