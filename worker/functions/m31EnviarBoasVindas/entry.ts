// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31EnviarBoasVindas — v7 GOVERNADA INLINE
 *
 * CORREÇÃO DE EMERGÊNCIA: functions.invoke('m31EnviarMensagemGovernada') retornava
 * 403 silencioso em produção. A governança agora é INLINE nesta função.
 *
 * MODOS (campo modo_envio_boas_vindas em EventoM31Config):
 *   "pausado"           → não faz nada.
 *   "fila"              → identifica candidatas e enfileira (SEM enviar).
 *   "teste"             → envia APENAS 1 mensagem para telefone_teste_autorizado.
 *   "ativo_controlado"  → envia com limite/throttle do protocolo de aquecimento.
 */

// ===== GOVERNANCA v1.0 BEGIN =====
const COOLDOWNS_H = {
  BOAS_VINDAS: 72, RECUPERACAO_CHECKOUT: 24, QR_CODE: 12, GRUPO: 24,
  COBRANCA: 24, LEMBRETE: 12, CHECKIN: 24, PENDENCIA_CRITICA: 12, OPERACIONAL: 6,
  CONFIRMACAO: 72,
};
const PRIORIDADES = {
  PENDENCIA_CRITICA: 1, RECUPERACAO_CHECKOUT: 2, GRUPO: 3, QR_CODE: 4,
  BOAS_VINDAS: 5, COBRANCA: 5, LEMBRETE: 6, CHECKIN: 6, OPERACIONAL: 7, CONFIRMACAO: 5,
};
const LIMITE_DIARIO_PESSOA = 2;
const AUTOMACOES_ISENTAS_LIMITE = ['BOAS_VINDAS', 'QR_CODE', 'GRUPO', 'CONFIRMACAO'];
const LOCK_TTL_MS = 5 * 60 * 1000;
const REGUA_ENCERRAMENTO = {
  BOAS_VINDAS: [], RECUPERACAO_CHECKOUT: [], GRUPO: ['GRUPO'], QR_CODE: ['QR_CODE'],
  COBRANCA: ['COBRANCA'], CHECKIN: ['LEMBRETE', 'CHECKIN'], PENDENCIA_CRITICA: ['PENDENCIA_CRITICA'],
};

function normalizePhone(phone) {
  let d = (phone || '').replace(/\D/g, '');
  while (d.startsWith('5555')) d = d.slice(2);
  if (d.startsWith('55') && d.length >= 12) return d;
  if (d.length >= 10) return `55${d}`;
  return d;
}

// fetch com timeout via AbortController — evita travar em API lenta
async function fetchComTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error(`Timeout: API não respondeu em ${timeoutMs / 1000}s`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Interpreta resposta UAZAPI (JSON quando possível, detecta 429)
function interpretarRespostaUazapi(status, body) {
  const rateLimited = status === 429;
  let sucessoPorBody = false;
  try {
    const json = JSON.parse(body);
    sucessoPorBody = !(json?.error || json?.status === 'error');
  } catch {
    sucessoPorBody = /"?id"?\s*[:=]/.test(body);
  }
  return { sucesso: status === 200 && sucessoPorBody, rateLimited };
}

// ═══════════════════════════════════════════════════════════════════════
//  CIRCUIT BREAKER — verifica se a UAZAPI está conectada ANTES de disparar.
//  Se "session is not reconnectable" ou status != connected, aborta tudo.
//  Impede o loop de tentativas duplicadas quando o WhatsApp está caído.
// ═══════════════════════════════════════════════════════════════════════
// NEUTRALIZADO: verificarUazapiConectado não chama mais a UAZAPI.
// Retorna sempre desconectado (fail-closed) — o envio real só acontece via m31DrenarFila.
async function verificarUazapiConectado() {
  return { conectado: false, motivo: 'UAZAPI neutralizada — envio exclusivo do drenador', status: 'neutralized' };
}

// REMOVIDO: sendViaUAZAPI — esta função não existe mais.
// O envio real é exclusivo do m31DrenarFila. Esta função apenas enfileira.

async function registrarLogGovernanca(base44, p) {
  try {
    await base44.asServiceRole.entities.M31AutomacaoLog.create({
      participante_id: p.participante_id, inscricao_principal: p.inscricao_principal || null,
      cpf: p.cpf || null, telefone: p.telefone || null, email: p.email || null,
      automacao: p.automacao, template: p.template || null, versao: p.versao || 'V1',
      status: p.status, enviado_em: new Date().toISOString(),
      cooldown_ate: p.cooldown_ate || null, execution_id: p.execution_id,
      origem: p.origem || 'unknown', motivo_bloqueio: p.motivo_bloqueio || null,
      motivo_cancelamento: p.motivo_cancelamento || null, idempotency_key: p.idempotency_key,
    });
  } catch (e) { logger.error('[Governanca] Erro log:', e.message); }
}

async function registrarMessageLog(base44, p) {
  try {
    await base44.asServiceRole.entities.M31MessageLog.create({
      inscricao_id: p.inscricao_id, inscricao_nome: p.inscricao_nome, telefone: p.telefone,
      tipo: p.tipo || 'boas_vindas', stage: p.stage || 'boas_vindas',
      mensagem: p.mensagem, sucesso: p.sucesso,
      zapi_response: p.zapi_response || null, erro: p.erro || null,
      enviado_em: new Date().toISOString(),
    });
  } catch (e) { logger.error('[Governanca] Erro MessageLog:', e.message); }
}

async function gatekeeperInline(base44, cpfNorm, telNorm, emailNorm, automacao, versaoFinal, ownLockExecutionId) {
  const participante_id = cpfNorm || telNorm || emailNorm;
  const execution_id = ownLockExecutionId || crypto.randomUUID();
  if (!participante_id) {
    return { permitido: false, motivo: 'sem_identificador_pessoa', detalhe: 'CPF/telefone/email obrigatórios',
      execution_id, participante_id: 'unknown', idempotency_key: '' };
  }
  const cooldownH = COOLDOWNS_H[automacao] || 24;
  const idempotencyKey = cpfNorm ? `${cpfNorm}:${automacao}:${versaoFinal}` : `${telNorm}:${automacao}:${versaoFinal}`;
  const agora = new Date();

  // 1. IDEMPOTÊNCIA
  const existentes = await base44.asServiceRole.entities.M31AutomacaoLog.filter(
    { idempotency_key: idempotencyKey, status: 'enviado' }, '-enviado_em', 1);
  if (existentes.length > 0) {
    return { permitido: false, motivo: 'idempotency_violation',
      detalhe: `Já enviado ${automacao} ${versaoFinal}`, execution_id, participante_id, idempotency_key: idempotencyKey };
  }
  if (!cpfNorm && telNorm) {
    const porTel = await base44.asServiceRole.entities.M31AutomacaoLog.filter(
      { telefone: telNorm, automacao, status: 'enviado' }, '-enviado_em', 1);
    if (porTel.length > 0 && porTel[0].enviado_em) {
      return { permitido: false, motivo: 'idempotency_violation_telefone',
        detalhe: `Telefone ${telNorm} já recebeu ${automacao}`, execution_id, participante_id, idempotency_key: idempotencyKey };
    }
  }

  // GUARDA CROSS-AUTOMACAO: confirmação é UMA SÓ. Se a pessoa já recebeu qualquer
  // confirmação (BOAS_VINDAS, CONFIRMACAO_TEXTO, CONFIRMACAO_COM_QR, QR_CODE),
  // bloqueia nova confirmação — evita QR + boas-vindas duplicadas.
  const AUTOMACOES_CONFIRMACAO = ['BOAS_VINDAS', 'CONFIRMACAO_TEXTO', 'CONFIRMACAO_COM_QR', 'QR_CODE', 'CONFIRMACAO'];
  if (AUTOMACOES_CONFIRMACAO.includes(automacao) && telNorm) {
    const confirmacoesTel = await base44.asServiceRole.entities.M31AutomacaoLog.filter(
      { telefone: telNorm, status: 'enviado', automacao: { $in: AUTOMACOES_CONFIRMACAO } },
      '-enviado_em', 1);
    if (confirmacoesTel.length > 0) {
      return { permitido: false, motivo: 'confirmacao_ja_enviada_outra_automacao',
        detalhe: `Telefone já recebeu ${confirmacoesTel[0].automacao} em ${confirmacoesTel[0].enviado_em}`,
        execution_id, participante_id, idempotency_key: idempotencyKey };
    }
  }

  // 2. LOCK — ignora o PRÓPRIO lock desta execução (já adquirido no passo 1).
  //    Só bloqueia se houver lock vivo de OUTRA execução.
  const lockKey = `${automacao}:${cpfNorm || telNorm}`;
  const locksAtivos = await base44.asServiceRole.entities.M31AutomacaoLock.filter({ chave: lockKey, ativo: true });
  const lockValido = locksAtivos.find((l) => new Date(l.expira_em) > agora && l.execution_id !== ownLockExecutionId);
  if (lockValido) {
    return { permitido: false, motivo: 'lock_ativo', detalhe: `Lock expira ${lockValido.expira_em}`,
      execution_id, participante_id, idempotency_key: idempotencyKey };
  }

  // 3. COOLDOWN
  const cooldownCorte = new Date(Date.now() - cooldownH * 3600000).toISOString();
  const recentes = await base44.asServiceRole.entities.M31AutomacaoLog.filter(
    { participante_id, automacao, status: 'enviado' }, '-enviado_em', 1);
  if (recentes.length > 0 && recentes[0].enviado_em && recentes[0].enviado_em >= cooldownCorte) {
    const cooldownAte = new Date(new Date(recentes[0].enviado_em).getTime() + cooldownH * 3600000).toISOString();
    return { permitido: false, motivo: 'cooldown_ativo', detalhe: `Último envio < ${cooldownH}h`,
      execution_id, participante_id, idempotency_key: idempotencyKey, cooldown_ate: cooldownAte };
  }

  // 4. LIMITE DIÁRIO — SÓ para COBRANCA, RECUPERACAO_*, LEMBRETE
  if (!AUTOMACOES_ISENTAS_LIMITE.includes(automacao)) {
    const corte24h = new Date(Date.now() - 24 * 3600000).toISOString();
    const logs24h = await base44.asServiceRole.entities.M31AutomacaoLog.filter(
      { participante_id, status: 'enviado' }, '-enviado_em', 10);
    const enviadosHoje = logs24h.filter((l) => l.enviado_em && l.enviado_em >= corte24h).length;
    if (enviadosHoje >= LIMITE_DIARIO_PESSOA) {
      return { permitido: false, motivo: 'limite_diario_excedido',
        detalhe: `${enviadosHoje} automações/24h (limite: ${LIMITE_DIARIO_PESSOA})`,
        execution_id, participante_id, idempotency_key: idempotencyKey };
    }
  }

  // 5. PRIORIDADE
  const minhaPrioridade = PRIORIDADES[automacao] || 99;
  if (locksAtivos.length > 0) {
    const conflito = locksAtivos.find((l) => {
      const parts = l.chave.split(':');
      const outraAutomacao = parts[0];
      const outraPessoa = parts.slice(1).join(':');
      return outraPessoa === (cpfNorm || telNorm) && outraAutomacao !== automacao &&
        (PRIORIDADES[outraAutomacao] || 99) < minhaPrioridade && new Date(l.expira_em) > agora;
    });
    if (conflito) {
      return { permitido: false, motivo: 'automacao_maior_prioridade_em_andamento',
        detalhe: `Lock: ${conflito.chave}`, execution_id, participante_id, idempotency_key: idempotencyKey };
    }
  }

  return { permitido: true, execution_id, participante_id, idempotency_key: idempotencyKey,
    cooldown_ate: new Date(Date.now() + cooldownH * 3600000).toISOString() };
}

async function encerrarReguaInline(base44, cpfNorm, telNorm, automacoes, origem) {
  const participante_id = cpfNorm || telNorm;
  let cancelados = 0;
  for (const aut of automacoes) {
    const pendentes = await base44.asServiceRole.entities.M31AutomacaoLog.filter(
      { participante_id, automacao: aut, status: 'pendente' });
    for (const p of pendentes) {
      await base44.asServiceRole.entities.M31AutomacaoLog.update(p.id, {
        status: 'cancelado', motivo_cancelamento: `regua_encerrada_por:${origem}` });
      cancelados++;
    }
    const bloqueados = await base44.asServiceRole.entities.M31AutomacaoLog.filter(
      { participante_id, automacao: aut, status: 'bloqueado' });
    for (const b of bloqueados) {
      await base44.asServiceRole.entities.M31AutomacaoLog.update(b.id, {
        status: 'cancelado', motivo_cancelamento: `regua_encerrada_por:${origem}` });
      cancelados++;
    }
    const lockKey = `${aut}:${cpfNorm || telNorm}`;
    await base44.asServiceRole.entities.M31AutomacaoLock.updateMany(
      { chave: lockKey, ativo: true }, { $set: { ativo: false } }).catch(() => {});
  }
  return cancelados;
}

// ═══════════════════════════════════════════════════════════════════════
//  LOCK COM DONO + TTL + DESEMPATE (Regra: lock PRIMEIRO, leitura depois)
//  Não confia no unique index (provado falso na plataforma). O desempate é
//  feito relendo todos os locks ativos da chave e elegendo o de MENOR
//  created_date. Se o vencedor não sou eu, removo SÓ o meu e desisto.
//  Cadáveres (lock com expira_em vencido) são limpos antes de assumir.
// ═══════════════════════════════════════════════════════════════════════
async function adquirirLockComDono(base44, lockKey, executionId) {
  const agora = new Date();

  // 1. Existe lock VIVO (não expirado)? Perdi a corrida.
  const ativos = await base44.asServiceRole.entities.M31AutomacaoLock.filter({ chave: lockKey, ativo: true });
  const vivo = ativos.find((l) => l.expira_em && new Date(l.expira_em) > agora);
  if (vivo) return { adquirido: false, motivo: 'lock_ativo' };

  // 2. Limpa cadáveres (TTL estourado por crash) — libera a inscrição.
  const mortos = ativos.filter((l) => !l.expira_em || new Date(l.expira_em) <= agora);
  for (const m of mortos) {
    await base44.asServiceRole.entities.M31AutomacaoLock.update(m.id, { ativo: false }).catch(() => {});
  }

  // 3. Crio MEU lock com TTL.
  await base44.asServiceRole.entities.M31AutomacaoLock.create({
    chave: lockKey, ativo: true, execution_id: executionId,
    criado_em: agora.toISOString(), expira_em: new Date(agora.getTime() + LOCK_TTL_MS).toISOString(),
  });

  // 4. Desempate TOCTOU: releio ativos e elejo o de menor created_date.
  //    Se surgiu outro na janela e ele venceu, removo o meu e desisto.
  const todos = await base44.asServiceRole.entities.M31AutomacaoLock.filter({ chave: lockKey, ativo: true });
  const vencedor = todos
    .filter((l) => l.expira_em && new Date(l.expira_em) > agora)
    .sort((a, b) => new Date(a.created_date) - new Date(b.created_date))[0];
  if (!vencedor || vencedor.execution_id !== executionId) {
    await base44.asServiceRole.entities.M31AutomacaoLock.updateMany(
      { chave: lockKey, execution_id: executionId }, { $set: { ativo: false } }).catch(() => {});
    return { adquirido: false, motivo: 'perdeu_desempate' };
  }
  return { adquirido: true };
}

// ═══════════════════════════════════════════════════════════════════════
//  RECONCILIAÇÃO — Regra Nº 0.3: incerteza nunca vira decisão automática.
//  JÁ COM O LOCK NA MÃO, decide se pode enviar:
//    • estado já enviado (data_envio_boas_vindas) → já foi, encerra.
//    • M31MessageLog sucesso:true → já foi, encerra.
//    • M31MessageLog sucesso:false → falhou de verdade, pode reenviar.
//    • lock morreu antes SEM log e SEM estado (janela de incerteza) →
//      NÃO reenvia. Vai para DLQ (revisão humana).
//  A UAZAPI não expõe status-de-entrega por message_id, então não há prova
//  externa a consultar: onde não há prova, decide humano.
// ═══════════════════════════════════════════════════════════════════════
async function reconciliarAntesDeEnviar(base44, inscricao) {
  const fresca = await base44.asServiceRole.entities.EventoM31Inscricao.get(inscricao.id);
  if (fresca && fresca.data_envio_boas_vindas) {
    return { pode_enviar: false, motivo: 'ja_enviado' };
  }

  const logs = await base44.asServiceRole.entities.M31MessageLog.filter(
    { inscricao_id: inscricao.id, tipo: 'boas_vindas' }, '-enviado_em', 5);

  if (logs.some((l) => l.sucesso === true)) {
    return { pode_enviar: false, motivo: 'ja_enviado' };
  }

  const houveTentativa = logs.length > 0;
  const houveFalhaConfirmada = logs.some((l) => l.sucesso === false);

  // Janela de incerteza: houve início (lock/tentativa) mas nenhum desfecho
  // gravado (nem sucesso nem falha). Sem prova de entrega → revisão manual.
  const inicioSemDesfecho = fresca && fresca.boas_vindas_iniciada_em && !houveTentativa;
  if (inicioSemDesfecho) {
    return { pode_enviar: false, motivo: 'zona_cinzenta_revisao_manual' };
  }

  // Sem tentativa nenhuma OU falha confirmada → caminho limpo para enviar.
  return { pode_enviar: true, houveFalhaConfirmada };
}

async function enviarBoasVindasGovernado(base44, inscricao, telefoneEnvio, mensagens, origem) {
  const cpfNorm = (inscricao.cpf || '').replace(/\D/g, '');
  const telNorm = normalizePhone(telefoneEnvio);
  const emailNorm = (inscricao.email || '').toLowerCase().trim();
  const versaoFinal = 'V1';
  const automacao = 'BOAS_VINDAS';

  const execution_id = crypto.randomUUID();
  const lockKey = `${automacao}:${cpfNorm || telNorm}`;

  // ═══════════════════════════════════════════════════════════════════════
  //  PASSO 1 — LOCK PRIMEIRO (ordem corrigida: elimina o TOCTOU que gerou as
  //  3 duplicatas Andresa/Wiliane/Raíssa). Quem não pega o lock nunca chega a
  //  ler estado nem a decidir enviar.
  // ═══════════════════════════════════════════════════════════════════════
  const lock = await adquirirLockComDono(base44, lockKey, execution_id);
  if (!lock.adquirido) {
    return { sucesso: false, motivo: lock.motivo, detalhe: 'Outra execução detém o lock' };
  }

  // A partir daqui SOU o dono do lock. Qualquer saída DEVE liberar o meu lock.
  const liberarMeuLock = () => base44.asServiceRole.entities.M31AutomacaoLock.updateMany(
    { chave: lockKey, execution_id }, { $set: { ativo: false } }).catch(() => {});

  // ═══════════════════════════════════════════════════════════════════════
  //  PASSO 2 — RECONCILIAÇÃO (Regra Nº 0.3). Só depois do lock, leio o estado.
  //  Janela de incerteza → DLQ, nunca reenvio automático.
  // ═══════════════════════════════════════════════════════════════════════
  const recon = await reconciliarAntesDeEnviar(base44, inscricao);
  if (!recon.pode_enviar) {
    await liberarMeuLock();
    if (recon.motivo === 'zona_cinzenta_revisao_manual') {
      await registrarDLQ(base44, inscricao, 'boas_vindas',
        'Zona cinzenta (Regra 0.3): início registrado sem prova de envio nem falha. Requer revisão humana.',
        'm31EnviarBoasVindas:reconciliacao');
    }
    return { sucesso: false, motivo: recon.motivo, detalhe: 'Reconciliação impediu reenvio' };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  PASSO 3 — TRAVAS DE NEGÓCIO (autorização explícita / gatilho de grupo).
  // ═══════════════════════════════════════════════════════════════════════
  try {
    const fresca = await base44.asServiceRole.entities.EventoM31Inscricao.get(inscricao.id);
    const gatilhoEntradaGrupo = fresca && fresca.fila_boas_vindas === true &&
      fresca.entrou_no_grupo === true &&
      fresca.origem_confirmacao_grupo === 'automacao' &&
      fresca.status_envio_grupo === 'pendente' &&
      ['aprovado', 'gratuito'].includes(fresca.status_pagamento) &&
      fresca.qr_envio_status !== 'enviado_com_sucesso' &&
      !fresca.qr_ultimo_envio_em;
    if (fresca && fresca.liberada_para_envio !== true && !gatilhoEntradaGrupo) {
      logger.log(`[BoasVindas] TRAVA: ${inscricao.nome} NÃO está liberada para envio. Envio impedido.`);
      await liberarMeuLock();
      return { sucesso: false, motivo: 'nao_liberada', detalhe: 'Inscrição não autorizada explicitamente para envio' };
    }
  } catch (_) { /* se a releitura falhar, o gatekeeper abaixo ainda protege */ }

  // ═══════════════════════════════════════════════════════════════════════
  //  PASSO 4 — GATEKEEPER (idempotência / cooldown / limite / prioridade).
  //  Já não cria lock — o lock é dono desta execução. Uso o execution_id real.
  // ═══════════════════════════════════════════════════════════════════════
  const gov = await gatekeeperInline(base44, cpfNorm, telNorm, emailNorm, automacao, versaoFinal, execution_id);
  gov.execution_id = execution_id;

  if (!gov.permitido) {
    await liberarMeuLock();
    await registrarLogGovernanca(base44, {
      participante_id: gov.participante_id, inscricao_principal: inscricao.id,
      cpf: cpfNorm || null, telefone: telNorm, email: emailNorm || null,
      automacao, template: 'confirmacao_v1', versao: versaoFinal, status: 'bloqueado',
      execution_id, origem, motivo_bloqueio: gov.motivo, idempotency_key: gov.idempotency_key,
    });
    const motivosQueMarcamEnviado = ['idempotency_violation', 'idempotency_violation_telefone', 'cooldown_ativo'];
    if (motivosQueMarcamEnviado.includes(gov.motivo)) {
      await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
        data_envio_boas_vindas: new Date().toISOString(), status_envio_grupo: 'enviado', fila_boas_vindas: false,
      }).catch(() => {});
    }
    return { sucesso: false, motivo: gov.motivo, detalhe: gov.detalhe };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  MARCA DE INÍCIO ANTES DO UAZAPI (Regra Nº 0.3 — fecha a janela cinzenta).
  //  Grava boas_vindas_iniciada_em ANTES de tocar no provedor. Se o processo
  //  morrer entre o send e o log de sucesso, o campo estará preenchido e SEM
  //  log → a reconciliação da próxima execução detecta a zona cinzenta e manda
  //  para a DLQ, em vez de reenviar às cegas. Se morrer ANTES desta linha,
  //  nada foi enviado — não há o que reconciliar.
  // ═══════════════════════════════════════════════════════════════════════
  await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
    boas_vindas_iniciada_em: new Date().toISOString(),
  }).catch(() => {});

  // ═══ ENFILEIRAMENTO NA FILA GLOBAL (M31FilaMensagem) — envio real só pelo m31DrenarFila ═══
  let sucessoGeral = true;
  let erroMsg = null;
  const uazapiResponses = [];

  try {
    const filaExistentes = await base44.asServiceRole.entities.M31FilaMensagem.filter(
      { dedup_key: gov.idempotency_key }, '-created_date', 5);
    const bloqueante = filaExistentes.find(f =>
      ['pendente', 'processando', 'enviado', 'incerto', 'falha_terminal'].includes(f.status));
    const terminais = await base44.asServiceRole.entities.M31FilaMensagem.filter(
      { telefone: telNorm, status: 'falha_terminal' }, '-created_date', 1);
    if (bloqueante) {
      sucessoGeral = false;
      erroMsg = `fila_dedup_ativo:${bloqueante.status}`;
    } else if (terminais.length > 0) {
      sucessoGeral = false;
      erroMsg = 'telefone_bloqueado_falha_terminal';
    } else {
      await base44.asServiceRole.entities.M31FilaMensagem.create({
        dedup_key: gov.idempotency_key, participante_id: gov.participante_id,
        cpf: cpfNorm || null, telefone: telNorm, email: emailNorm || null,
        automacao, template: 'confirmacao_v1', versao: versaoFinal, origem,
        inscricao_id: inscricao.id, inscricao_nome: inscricao.nome,
        mensagens, status: 'pendente', prioridade: 5, execution_id: gov.execution_id,
        aprovado_para_envio: false, aprovado_por: null, aprovado_em: null,
      });
      uazapiResponses.push({ enfileirado: true, fila: 'M31FilaMensagem' });
    }
  } catch (e) {
    sucessoGeral = false;
    erroMsg = `falha_enfileirar: ${e.message}`;
  }

  await registrarLogGovernanca(base44, {
    participante_id: gov.participante_id, inscricao_principal: inscricao.id,
    cpf: cpfNorm || null, telefone: telNorm, email: emailNorm || null,
    automacao, template: 'confirmacao_v1', versao: versaoFinal,
    status: sucessoGeral ? 'pendente' : 'bloqueado',
    cooldown_ate: sucessoGeral ? gov.cooldown_ate : null,
    execution_id: gov.execution_id, origem,
    motivo_bloqueio: sucessoGeral ? null : `falha_enfileiramento: ${erroMsg}`,
    idempotency_key: gov.idempotency_key,
  });

  await registrarMessageLog(base44, {
    inscricao_id: inscricao.id, inscricao_nome: inscricao.nome, telefone: telNorm,
    tipo: 'boas_vindas', stage: 'boas_vindas',
    mensagem: mensagens.map(m => m.message).join(' | '),
    sucesso: sucessoGeral, zapi_response: JSON.stringify(uazapiResponses), erro: erroMsg,
  });

  await liberarMeuLock();

  if (sucessoGeral) {
    const encerrar = REGUA_ENCERRAMENTO[automacao] || [];
    if (encerrar.length > 0) {
      await encerrarReguaInline(base44, cpfNorm, telNorm, encerrar, `auto:${automacao}`);
    }
  }

  return { sucesso: sucessoGeral, motivo: sucessoGeral ? null : `falha_enfileiramento: ${erroMsg}`, uazapiResponses };
}
// ===== GOVERNANCA v1.0 END =====

async function resolverGrupo(base44, finalidade) {
  try {
    const grupos = await base44.asServiceRole.entities.M31GrupoConfig.filter({ finalidade, ativo: true });
    if (grupos.length === 0) return { success: false, error: 'grupo_nao_configurado', cancelado: true };
    const grupo = grupos[0];
    return { success: true, finalidade, chat_id: grupo.chat_id, invite_link: grupo.invite_link, nome_grupo: grupo.nome_grupo, grupo_id: grupo.id };
  } catch (e) { return { error: e.message, cancelado: true }; }
}

async function logEnvioGrupo(base44, params) {
  try {
    await base44.asServiceRole.entities.M31GrupoEnvioLog.create({
      finalidade: params.finalidade, nome_grupo: params.nome_grupo || null, chat_id: params.chat_id || null,
      qtd_mensagens: params.qtd_mensagens || 1, funcao_responsavel: params.funcao_responsavel,
      tipo_envio: params.tipo_envio || 'link_convite', destinatario: params.destinatario || null,
      inscricao_id: params.inscricao_id || null, sucesso: params.sucesso,
      erro: params.erro || null, cancelado: params.cancelado || false, enviado_em: new Date().toISOString(),
    });
  } catch (_) {}
}

const HARD_CAP = 40;
const CORTE_7_DIAS = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

function toRecifeISO(date = new Date()) {
  const offset = -3 * 60;
  const local = new Date(date.getTime() + offset * 60 * 1000);
  return local.toISOString().replace('Z', '-03:00');
}
function hojeRecife() { return toRecifeISO().slice(0, 10); }

function getConfigAquecimento() {
  const DATA_RECONEXAO = new Date('2026-05-11T00:00:00-03:00');
  const dias = Math.floor((Date.now() - DATA_RECONEXAO.getTime()) / (1000 * 60 * 60 * 24));
  if (dias < 7) return { limite: 10, fase: 'semana_1' };
  if (dias < 14) return { limite: 20, fase: 'semana_2' };
  return { limite: 40, fase: 'normal' };
}

async function getConfig(base44) {
  const configs = await base44.asServiceRole.entities.EventoM31Config.list('-created_date', 1);
  return configs[0] || {};
}

async function getOrCreateControl(base44, hoje, limiteAquecimento) {
  const existing = await base44.asServiceRole.entities.M31WhatsAppControl.filter({ data: hoje });
  if (existing.length > 0) return existing[0];
  return base44.asServiceRole.entities.M31WhatsAppControl.create({
    data: hoje, mensagens_enviadas_hoje: 0, limite_diario: limiteAquecimento,
    bloqueado: false, total_falhas_hoje: 0, total_optouts_hoje: 0,
    boas_vindas_enviadas: 0, cobrancas_enviadas: 0,
  });
}

const STATUS_CONFIRMADOS_DB = ['aprovado', 'gratuito'];
const STATUS_CONFIRMADOS_ASAAS = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'DUNNING_RECEIVED'];

async function validarPagamentoConfirmado(base44, inscricao) {
  if (!STATUS_CONFIRMADOS_DB.includes(inscricao.status_pagamento)) {
    return { liberado: false, motivo: 'bloqueado_por_pagamento_nao_confirmado', detalhe: `status_db=${inscricao.status_pagamento}` };
  }
  if (inscricao.asaas_payment_id) {
    try {
      const resp = await fetchComTimeout(`__ASAAS_API__/payments/${inscricao.asaas_payment_id}`, {
        headers: { 'access_token': config('ASAAS_API_KEY') }
      });
      const payment = await resp.json();
      if (!STATUS_CONFIRMADOS_ASAAS.includes(payment.status)) {
        return { liberado: false, motivo: 'bloqueado_por_pagamento_nao_confirmado', detalhe: `Asaas=${payment.status} vs DB=${inscricao.status_pagamento}` };
      }
    } catch (e) {
      return { liberado: false, motivo: 'bloqueado_por_pagamento_nao_confirmado', detalhe: `Asaas indisponível: ${e.message}` };
    }
  }
  const telefone = (inscricao.whatsapp || '').replace(/\D/g, '');
  if (telefone.length < 10) {
    return { liberado: false, motivo: 'telefone_invalido', detalhe: `telefone=${telefone}` };
  }
  return { liberado: true, telefone };
}

async function registrarBloqueio(base44, inscricao, motivo, detalhe) {
  try {
    await base44.asServiceRole.entities.M31AuditLog.create({
      chave_unica: `bloqueio_pagamento_${inscricao.id}_${Date.now()}`,
      tipo_erro: 'bloqueado_por_pagamento_nao_confirmado', gravidade: 'alto', origem: 'automacao',
      descricao: `Envio de boas-vindas bloqueado: ${detalhe}`,
      possivel_causa: 'Pagamento não confirmado no Asaas ou divergência DB/Asaas',
      acao_recomendada: 'Verificar status no Asaas e corrigir se necessário',
      pessoa_nome: inscricao.nome, pessoa_email: inscricao.email,
      pessoa_telefone: inscricao.whatsapp, pessoa_id: inscricao.id,
    });
  } catch (_) {}
}

async function buscarPagadorAsaas(asaasPaymentId) {
  if (!asaasPaymentId) return null;
  try {
    const ASAAS_KEY = config('ASAAS_API_KEY');
    const payResp = await fetchComTimeout(`__ASAAS_API__/payments/${asaasPaymentId}`, {
      headers: { 'access_token': ASAAS_KEY }
    });
    const payment = await payResp.json();
    if (payment.customer) {
      const custResp = await fetchComTimeout(`__ASAAS_API__/customers/${payment.customer}`, {
        headers: { 'access_token': ASAAS_KEY }
      });
      const customer = await custResp.json();
      return customer.name || null;
    }
  } catch (e) { logger.log('[BoasVindas] Erro ao buscar pagador:', e.message); }
  return null;
}

function calcularMaxAdaptativo(backlogSize) {
  if (backlogSize <= 20) return 1;
  if (backlogSize <= 50) return 5;
  if (backlogSize <= 100) return 10;
  return 20;
}

// Gotejamento humanizado: intervalo ALEATÓRIO entre cada destinatária (25s a 75s).
// Evita padrão robótico de rajada com intervalo fixo (gatilho de bloqueio no WhatsApp).
const GOTEJAMENTO_MIN_MS = 30000;
const GOTEJAMENTO_MAX_MS = 60000;
function delayGotejamentoAleatorio() {
  const ms = GOTEJAMENTO_MIN_MS + Math.floor(Math.random() * (GOTEJAMENTO_MAX_MS - GOTEJAMENTO_MIN_MS));
  return new Promise((r) => setTimeout(r, ms));
}

async function registrarDLQ(base44, inscricao, etapa, erro, origem) {
  try {
    await base44.asServiceRole.entities.M31DeadLetterQueue.create({
      inscricao_id: inscricao.id, inscricao_nome: inscricao.nome,
      cpf: (inscricao.cpf || '').replace(/\D/g, '') || null,
      telefone: normalizePhone(inscricao.whatsapp), etapa, erro, origem,
      tentativas: 1,
    });
  } catch (_) {}
}

async function registrarTimeline(base44, inscricao_id, evento, status, detalhe) {
  try {
    await base44.asServiceRole.entities.M31InscricaoTimeline.create({
      inscricao_id, evento, status, detalhe, origem: 'm31EnviarBoasVindas',
    });
  } catch (_) {}
}

function gerarCodigoInscricao(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `M31-${code}`;
}

return (async (req) => {
  try {
    const agora = new Date();
    const horaRecife = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Recife' }));
    const hora = horaRecife.getHours();
    if (hora < 8 || hora >= 20) {
      logger.log(`[M31 Boas-Vindas] Fora da janela (${hora}h BRT). Janela: 08h–20h.`);
      return Response.json({ status: 'fora_janela', hora_atual: hora });
    }

    const base44 = createClientFromRequest(req);
    const config = await getConfig(base44);
    const modo = config.modo_envio_boas_vindas || 'pausado';
    const telefoneTeste = (config.telefone_teste_autorizado || '5581982800508').replace(/\D/g, '');
    logger.log(`[BoasVindas] Modo: ${modo} | Hora Recife: ${hora}h`);

    if (modo === 'pausado') return Response.json({ skipped: true, reason: 'modo_pausado', modo });

    // ═══════════════════════════════════════════════════════════════════
    //  CIRCUIT BREAKER — só verifica em modos que REALMENTE disparam.
    //  "fila" apenas enfileira (não usa a UAZAPI), então não é bloqueado.
    // ═══════════════════════════════════════════════════════════════════
    if (modo === 'teste' || modo === 'ativo_controlado') {
      const uazapi = await verificarUazapiConectado();
      if (!uazapi.conectado) {
        logger.error(`[BoasVindas] CIRCUIT BREAKER ABERTO — UAZAPI desconectada: ${uazapi.motivo}`);
        return Response.json({
          skipped: true,
          reason: 'uazapi_desconectada',
          circuit_breaker: 'aberto',
          uazapi_status: uazapi.status || 'desconhecido',
          detalhe: uazapi.motivo,
        }, { status: 200 });
      }
      logger.log(`[BoasVindas] Circuit breaker OK — UAZAPI conectada.`);
    }

    if (modo === 'fila') {
      const [aprovadas, gratuitas] = await Promise.all([
        base44.asServiceRole.entities.EventoM31Inscricao.filter({ status_pagamento: 'aprovado' }, '+created_date', 500),
        base44.asServiceRole.entities.EventoM31Inscricao.filter({ status_pagamento: 'gratuito' }, '+created_date', 500),
      ]);
      const candidatas = [...aprovadas, ...gratuitas].filter((i) =>
        i.whatsapp && !i.data_envio_boas_vindas && i.status_envio_grupo !== 'enviado' &&
        !i.fila_boas_vindas && !i.webhook_processando
      );
      let enfileiradas = 0;
      for (const inscricao of candidatas) {
        const telefone = inscricao.whatsapp?.replace(/\D/g, '');
        if (!telefone || telefone.length < 10) continue;
        await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
          fila_boas_vindas: true, fila_boas_vindas_em: new Date().toISOString(),
        });
        enfileiradas++;
      }
      return Response.json({ success: true, modo: 'fila', enfileiradas, candidatas_totais: candidatas.length });
    }

    const aquecimento = getConfigAquecimento();
    const limite = Math.min(aquecimento.limite, HARD_CAP);
    const hoje = hojeRecife();
    const control = await getOrCreateControl(base44, hoje, limite);
    if (control.bloqueado) return Response.json({ skipped: true, reason: 'numero_bloqueado' });

    const corteHoje = new Date(hoje + 'T00:00:00-03:00').toISOString();
    const logsHoje = await base44.asServiceRole.entities.M31MessageLog.filter(
      { tipo: 'boas_vindas', sucesso: true }, '-enviado_em', 200);
    const enviados_hoje_real = logsHoje.filter((l) => l.enviado_em >= corteHoje).length;
    let enviados_hoje = Math.max(control.mensagens_enviadas_hoje || 0, enviados_hoje_real);

    if (modo === 'teste') {
      logger.log(`[BoasVindas] MODO TESTE — único envio para: ${telefoneTeste}`);
      const candidatasTeste = await base44.asServiceRole.entities.EventoM31Inscricao.filter({ whatsapp: telefoneTeste });
      let inscricaoTeste = candidatasTeste.find((i) => i.status_pagamento === 'aprovado' || i.status_pagamento === 'gratuito');
      if (!inscricaoTeste) {
        const todas = await base44.asServiceRole.entities.EventoM31Inscricao.filter({ status_pagamento: 'aprovado' });
        inscricaoTeste = todas.find((i) => i.whatsapp?.replace(/\D/g, '') === telefoneTeste);
      }
      if (!inscricaoTeste) return Response.json({ skipped: true, reason: 'numero_teste_sem_inscricao_confirmada', modo });

      const grupoRes = await resolverGrupo(base44, 'INSCRITAS_OFICIAL');
      if (!grupoRes?.success || !grupoRes?.invite_link) {
        await logEnvioGrupo(base44, { finalidade: 'INSCRITAS_OFICIAL', funcao_responsavel: 'm31EnviarBoasVindas',
          tipo_envio: 'link_convite', destinatario: telefoneTeste, inscricao_id: inscricaoTeste.id,
          sucesso: false, cancelado: true, erro: grupoRes?.error || 'grupo_nao_configurado' });
        return Response.json({ skipped: true, reason: 'grupo_nao_configurado' });
      }
      const LINK_GRUPO = grupoRes.invite_link;
      const nome = inscricaoTeste.nome?.split(' ')[0] || 'Querida';
      let codigo = inscricaoTeste.codigo_inscricao || '';
      if (!codigo) {
        codigo = gerarCodigoInscricao();
        await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricaoTeste.id, { codigo_inscricao: codigo });
      }
      const linhaCaravana = inscricaoTeste.caravana_nome ? `\n🚌 *Caravana:* ${inscricaoTeste.caravana_nome}` : '';
      const mensagem = `✅ *[TESTE] Inscrição Confirmada — M31 Filhas!*\n\nParabéns, *${nome}*! Sua inscrição foi confirmada! 🌸\nEstamos em oração por você!${linhaCaravana}\n\n📌 *ENTRE NO GRUPO OFICIAL:*\n👉 ${LINK_GRUPO}\n\n*Seu código:* \`${codigo}\`\nGuarde para o check-in! ✅\n\n📋 *Confira seus dados:*\nNome: ${inscricaoTeste.nome}${inscricaoTeste.cidade ? `\nCidade: ${inscricaoTeste.cidade}` : ''}\nSe algum dado estiver incorreto, responda esta mensagem informando a correção.`;
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(codigo)}&bgcolor=FFFFFF&color=000000&format=png`;

      // ===== GOVERNANCA v1.0 BEGIN =====
      const result = await enviarBoasVindasGovernado(base44, inscricaoTeste, telefoneTeste,
        [{ message: mensagem, image_url: null }, { message: '🎫 Seu QR Code de entrada M31 Filhas', image_url: qrCodeUrl }],
        'm31EnviarBoasVindas:teste');
      // ===== GOVERNANCA v1.0 END =====

      if (result.sucesso) {
        await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricaoTeste.id, {
          data_envio_boas_vindas: new Date().toISOString(), status_envio_grupo: 'enviado',
          last_contact_at: new Date().toISOString(),
        });
      }
      await base44.asServiceRole.entities.EventoM31Config.update(config.id, { modo_envio_boas_vindas: 'pausado' });
      return Response.json({ success: result.sucesso, modo_antes: 'teste', modo_depois: 'pausado',
        inscricao: inscricaoTeste.nome, telefone: telefoneTeste, enviado: result.sucesso, motivo: result.motivo });
    }

    if (modo !== 'ativo_controlado') return Response.json({ skipped: true, reason: 'modo_desconhecido', modo });
    if (enviados_hoje >= limite) return Response.json({ skipped: true, reason: 'limite_diario_atingido', enviados_hoje, limite, fase: aquecimento.fase });

    const [aprovadas, gratuitas] = await Promise.all([
      base44.asServiceRole.entities.EventoM31Inscricao.filter({ status_pagamento: 'aprovado' }, '+created_date', 500),
      base44.asServiceRole.entities.EventoM31Inscricao.filter({ status_pagamento: 'gratuito' }, '+created_date', 500),
    ]);
    const candidatas = [...aprovadas, ...gratuitas].filter((i) => {
      if (!i.whatsapp) return false;
      // Entrada no grupo é apenas gatilho de verificação. Quando a inscrição aprovada
      // foi enfileirada pelo verificador, o QR continua sendo gerado e enviado somente
      // por este motor oficial — nunca pela sincronização do grupo.
      const gatilhoEntradaGrupo = i.fila_boas_vindas === true &&
        i.entrou_no_grupo === true &&
        i.origem_confirmacao_grupo === 'automacao' &&
        i.status_envio_grupo === 'pendente';
      if (i.liberada_para_envio !== true && !gatilhoEntradaGrupo) return false;
      if (i.data_envio_boas_vindas) return false;
      if (i.qr_envio_status === 'enviado_com_sucesso' || i.qr_ultimo_envio_em) return false;
      if (i.status_envio_grupo === 'enviado') return false;
      // Quem JÁ está no grupo não é mais pulado: recebe o QR com a mensagem
      // "O M31 está chegando" (lembrete_qr_ja_no_grupo), SEM o link do grupo.
      if (i.webhook_processando) return false;
      if (i.boas_vindas_iniciada_em) {
        const minutos = (Date.now() - new Date(i.boas_vindas_iniciada_em).getTime()) / (1000 * 60);
        if (minutos < 30) return false;
      }
      return true;
    }).sort((a, b) => {
      if (a.fila_boas_vindas && !b.fila_boas_vindas) return -1;
      if (!a.fila_boas_vindas && b.fila_boas_vindas) return 1;
      return 0;
    });

    if (candidatas.length === 0) return Response.json({ success: true, message: 'Nenhuma candidata', candidatas: 0 });

    const grupoRes = await resolverGrupo(base44, 'INSCRITAS_OFICIAL');
    if (!grupoRes?.success || !grupoRes?.invite_link) {
      await logEnvioGrupo(base44, { finalidade: 'INSCRITAS_OFICIAL', funcao_responsavel: 'm31EnviarBoasVindas',
        tipo_envio: 'link_convite', destinatario: 'lote', sucesso: false, cancelado: true,
        erro: grupoRes?.error || 'grupo_nao_configurado' });
      return Response.json({ skipped: true, reason: 'grupo_nao_configurado' });
    }
    const LINK_GRUPO = grupoRes.invite_link;

    const enviados = [], pulados = [], falhas = [];
    let falhasConsecutivas = 0;
    const MAX_POR_EXECUCAO = calcularMaxAdaptativo(candidatas.length);

    for (let i = 0; i < candidatas.length; i++) {
      if (enviados_hoje >= limite) break;
      const inscricao = candidatas[i];
      const telefone = inscricao.whatsapp?.replace(/\D/g, '');
      if (!telefone || telefone.length < 10) { pulados.push({ nome: inscricao.nome, motivo: 'telefone inválido' }); continue; }

      // HISTÓRICO: só processa inscrições SEM qualquer mensagem anterior ou conversa antiga.
      // Busca por TELEFONE (não inscricao_id) para pegar mensagens de outras inscrições da mesma pessoa.
      const telNormHist = normalizePhone(inscricao.whatsapp);
      const histMsgs = await base44.asServiceRole.entities.M31MessageLog.filter({ telefone: telNormHist }, '-enviado_em', 1);
      const histMsgsRaw = await base44.asServiceRole.entities.M31MessageLog.filter({ telefone: inscricao.whatsapp }, '-enviado_em', 1);
      const histAtend = await base44.asServiceRole.entities.M31Atendimento.filter({ telefone: telNormHist }, '-created_date', 1);
      if (histMsgs.length > 0 || histMsgsRaw.length > 0 || histAtend.length > 0) {
        pulados.push({ nome: inscricao.nome, motivo: 'pulado_historico_mensagens' });
        continue;
      }

      const validacao = await validarPagamentoConfirmado(base44, inscricao);
      if (!validacao.liberado) {
        pulados.push({ nome: inscricao.nome, motivo: validacao.motivo, detalhe: validacao.detalhe });
        await registrarBloqueio(base44, inscricao, validacao.motivo, validacao.detalhe);
        continue;
      }

      const nome = inscricao.nome?.split(' ')[0] || 'Querida';
      let codigo = inscricao.codigo_inscricao || '';
      if (!codigo) {
        codigo = gerarCodigoInscricao();
        await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, { codigo_inscricao: codigo });
      }
      // SUSPENSO: variante "abençoada" (pagador) — sempre mensagem padrão.
      // Participante JÁ no grupo: QR + "O M31 está chegando", SEM o link do grupo.
      const jaNoGrupo = inscricao.entrou_no_grupo === true;
      let mensagem;
      if (jaNoGrupo) {
        const tplJa = await base44.asServiceRole.entities.M31MessageTemplate.filter(
          { chave_unica: 'lembrete_qr_ja_no_grupo', is_active: true }, '-updated_date', 1);
        if (!tplJa || tplJa.length === 0 || !tplJa[0].content) {
          pulados.push({ nome: inscricao.nome, motivo: 'template_ja_no_grupo_ausente_fail_closed' });
          continue;
        }
        mensagem = tplJa[0].content
          .replace(/\{\{primeiro_nome\}\}/g, nome)
          .replace(/\{\{codigo_inscricao\}\}/g, codigo);
      } else {
        const linhaCaravana = inscricao.caravana_nome ? `\n🚌 Caravana: *${inscricao.caravana_nome}*\n` : '';
        const blocoConferencia = `\n\n📋 *Confira seus dados:*\nNome: ${inscricao.nome}${inscricao.cidade ? `\nCidade: ${inscricao.cidade}` : ''}\nSe algum dado estiver incorreto, responda esta mensagem informando a correção.`;
        mensagem = `Sua inscrição para o M31 Filhas foi confirmada. 🌸\n${linhaCaravana}\n🎟 Código da inscrição:\n\`${codigo}\`\n\n📲 Seu QR Code segue abaixo.\nApresente este QR Code no credenciamento do evento.\n\n👥 Grupo oficial:\n${LINK_GRUPO}${blocoConferencia}\n\nNos vemos no M31!`;
      }
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(codigo)}&bgcolor=FFFFFF&color=000000&format=png`;

      // ===== GOVERNANCA v1.0 BEGIN =====
      const result = await enviarBoasVindasGovernado(base44, inscricao, inscricao.whatsapp,
        [{ message: mensagem, image_url: null }, { message: '🎫 Seu QR Code de entrada M31 Filhas', image_url: qrCodeUrl }],
        'm31EnviarBoasVindas:ativo_controlado');
      // ===== GOVERNANCA v1.0 END =====

      if (result.sucesso) {
        await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
          data_envio_boas_vindas: new Date().toISOString(),
          // O link do grupo só foi enviado quando NÃO estava no grupo ainda
          ...(!jaNoGrupo ? { status_envio_grupo: 'enviado' } : {}),
          last_contact_at: new Date().toISOString(), fila_boas_vindas: false,
          boas_vindas_iniciada_em: new Date().toISOString(),
          liberada_para_envio: false, // consome a autorização — não reenvia
        });
        enviados.push(inscricao.nome);
        enviados_hoje++;
        falhasConsecutivas = 0;
        await registrarTimeline(base44, inscricao.id, 'boas_vindas_enviada', 'sucesso', 'Boas-vindas + QR enviados');
        // Gotejamento aleatório antes da PRÓXIMA destinatária (só se houver próxima e ainda dentro do limite)
        if (i < candidatas.length - 1 && enviados_hoje < limite && enviados_hoje < MAX_POR_EXECUCAO) {
          await delayGotejamentoAleatorio();
        }
      } else {
        const motivosQueMarcamEnviado = ['idempotency_violation', 'idempotency_violation_telefone', 'cooldown_ativo', 'ja_enviado'];
        if (motivosQueMarcamEnviado.includes(result.motivo)) {
          await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
            data_envio_boas_vindas: new Date().toISOString(), status_envio_grupo: 'enviado', fila_boas_vindas: false,
          });
          pulados.push({ nome: inscricao.nome, motivo: result.motivo });
        } else {
          falhas.push({ nome: inscricao.nome, erro: result.motivo });
          falhasConsecutivas++;
          await registrarDLQ(base44, inscricao, 'boas_vindas', result.motivo, 'm31EnviarBoasVindas');
          await registrarTimeline(base44, inscricao.id, 'boas_vindas_falhou', 'falha', result.motivo);
          // Falha de conexão/UAZAPI → aborta o lote inteiro imediatamente (evita tentar as próximas)
          const motivoFalha = (result.motivo || '').toLowerCase();
          const falhaConexao = motivoFalha.includes('falha_uazapi') || motivoFalha.includes('timeout') ||
            motivoFalha.includes('disconnect') || motivoFalha.includes('reconnectable');
          if (falhaConexao) {
            logger.error(`[BoasVindas] Falha de conexão UAZAPI durante o lote — abortando. ${result.motivo}`);
            break;
          }
          if (falhasConsecutivas >= 3) { logger.log(`[BoasVindas] 3 falhas consecutivas`); break; }
        }
      }

      await base44.asServiceRole.entities.M31WhatsAppControl.update(control.id, {
        mensagens_enviadas_hoje: enviados_hoje,
        boas_vindas_enviadas: (control.boas_vindas_enviadas || 0) + enviados.length,
        total_falhas_hoje: (control.total_falhas_hoje || 0) + falhas.length,
        ultimo_envio_em: new Date().toISOString(),
      });
      if (enviados_hoje >= MAX_POR_EXECUCAO) break;
    }

    return Response.json({ success: true, modo, fase_aquecimento: aquecimento.fase,
      candidatas: candidatas.length, enviados: enviados.length, pulados: pulados.length,
      falhas: falhas.length, enviados_hoje, limite_diario: limite,
      detalhe_envios: enviados, detalhe_falhas: falhas, detalhe_pulados: pulados });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
