// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31DespacharConfirmacoes — v3 GOVERNADA INLINE
 *
 * CORREÇÃO DE EMERGÊNCIA: functions.invoke('m31EnviarMensagemGovernada') retornava
 * 403 silencioso em produção. A governança agora é INLINE nesta função.
 *
 * Responsabilidade: identificar inscrições aprovadas sem boas-vindas,
 * validar pagamento, e despachar via camada de governança inline.
 */

// ===== GOVERNANCA v1.0 BEGIN =====
const COOLDOWNS_H = {
  BOAS_VINDAS: 72, RECUPERACAO_CHECKOUT: 24, QR_CODE: 12, GRUPO: 24,
  COBRANCA: 24, LEMBRETE: 12, CHECKIN: 24, PENDENCIA_CRITICA: 12, OPERACIONAL: 6,
  CONFIRMACAO: 72, CONFIRMACAO_COM_QR: 72, CONFIRMACAO_TEXTO: 72, CONFIRMACAO_VOLUNTARIA: 72,
};
const PRIORIDADES = {
  PENDENCIA_CRITICA: 1, RECUPERACAO_CHECKOUT: 2, GRUPO: 3, QR_CODE: 4,
  BOAS_VINDAS: 5, COBRANCA: 5, LEMBRETE: 6, CHECKIN: 6, OPERACIONAL: 7, CONFIRMACAO: 5,
  CONFIRMACAO_COM_QR: 4, CONFIRMACAO_TEXTO: 4, CONFIRMACAO_VOLUNTARIA: 4,
};
const LIMITE_DIARIO_PESSOA = 2;
const AUTOMACOES_ISENTAS_LIMITE = ['BOAS_VINDAS', 'QR_CODE', 'GRUPO', 'CONFIRMACAO', 'CONFIRMACAO_COM_QR', 'CONFIRMACAO_TEXTO', 'CONFIRMACAO_VOLUNTARIA'];
const LOCK_TTL_MS = 5 * 60 * 1000;
const REGUA_ENCERRAMENTO = {
  BOAS_VINDAS: [], RECUPERACAO_CHECKOUT: [], GRUPO: ['GRUPO'], QR_CODE: ['QR_CODE'],
  COBRANCA: ['COBRANCA'], CHECKIN: ['LEMBRETE', 'CHECKIN'], PENDENCIA_CRITICA: ['PENDENCIA_CRITICA'],
  CONFIRMACAO_COM_QR: [], CONFIRMACAO_TEXTO: [],
};

function normalizePhone(phone) {
  let d = (phone || '').replace(/\D/g, '');
  while (d.startsWith('5555')) d = d.slice(2);
  if (d.startsWith('55') && d.length >= 12) return d;
  if (d.length >= 10) return `55${d}`;
  return d;
}

async function sendViaUAZAPI(phone, message, imageUrl) {
  const token = config('UAZAPI_TOKEN');
  if (!token) throw new Error('UAZAPI_TOKEN não configurado');
  const baseUrl = (config('UAZAPI_BASE') || '__UAZAPI_API__').replace(/\/+$/, '');
  const phoneSanitized = normalizePhone(phone);
  if (imageUrl) {

    const resp = await fetch(`${baseUrl}/send/media`, {
      method: 'POST',
      headers: { 'token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: phoneSanitized, phone: phoneSanitized, type: 'image',
        file: imageUrl, caption: message || '', text: message || '' }),
    });
    const body = await resp.text();
    return { sucesso: resp.status === 200, status: resp.status, body };
  }
  const resp = await fetch(`${baseUrl}/send/text`, {
    method: 'POST',
    headers: { 'token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ number: phoneSanitized, phone: phoneSanitized, message, text: message }),
  });
  const body = await resp.text();
  return { sucesso: resp.status === 200, status: resp.status, body };
}

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

async function gatekeeperInline(base44, cpfNorm, telNorm, emailNorm, automacao, versaoFinal) {
  const participante_id = cpfNorm || telNorm || emailNorm;
  const execution_id = crypto.randomUUID();
  if (!participante_id) {
    return { permitido: false, motivo: 'sem_identificador_pessoa', detalhe: 'CPF/telefone/email obrigatórios',
      execution_id, participante_id: 'unknown', idempotency_key: '' };
  }
  const cooldownH = COOLDOWNS_H[automacao] || 24;
  const idempotencyKey = cpfNorm ? `${cpfNorm}:${automacao}:${versaoFinal}` : `${telNorm}:${automacao}:${versaoFinal}`;
  const agora = new Date();

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
  const AUTOMACOES_CONFIRMACAO = ['BOAS_VINDAS', 'CONFIRMACAO_TEXTO', 'CONFIRMACAO_COM_QR', 'QR_CODE', 'CONFIRMACAO', 'CONFIRMACAO_VOLUNTARIA'];
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

  const lockKey = `${automacao}:${cpfNorm || telNorm}`;
  const locksAtivos = await base44.asServiceRole.entities.M31AutomacaoLock.filter({ chave: lockKey, ativo: true });
  const lockValido = locksAtivos.find((l) => new Date(l.expira_em) > agora);
  if (lockValido) {
    return { permitido: false, motivo: 'lock_ativo', detalhe: `Lock expira ${lockValido.expira_em}`,
      execution_id, participante_id, idempotency_key: idempotencyKey };
  }

  const cooldownCorte = new Date(Date.now() - cooldownH * 3600000).toISOString();
  const recentes = await base44.asServiceRole.entities.M31AutomacaoLog.filter(
    { participante_id, automacao, status: 'enviado' }, '-enviado_em', 1);
  if (recentes.length > 0 && recentes[0].enviado_em && recentes[0].enviado_em >= cooldownCorte) {
    const cooldownAte = new Date(new Date(recentes[0].enviado_em).getTime() + cooldownH * 3600000).toISOString();
    return { permitido: false, motivo: 'cooldown_ativo', detalhe: `Último envio < ${cooldownH}h`,
      execution_id, participante_id, idempotency_key: idempotencyKey, cooldown_ate: cooldownAte };
  }

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

async function enviarBoasVindasGovernado(base44, inscricao, telefoneEnvio, mensagens, origem, automacaoTipo = 'CONFIRMACAO_TEXTO') {
  const cpfNorm = (inscricao.cpf || '').replace(/\D/g, '');
  const telNorm = normalizePhone(telefoneEnvio);
  const emailNorm = (inscricao.email || '').toLowerCase().trim();
  const versaoFinal = 'V1';
  // REGRA: Contato sem interação prévia → saudação em texto (QR só após resposta via webhook).
  //        Contato com interação prévia → QR + grupo diretamente (sem repetir saudação).
  const automacao = automacaoTipo;
  const templateNome = automacaoTipo === 'CONFIRMACAO_COM_QR' ? 'confirmacao_com_qr_v1' : 'confirmacao_texto_v1';

  const gov = await gatekeeperInline(base44, cpfNorm, telNorm, emailNorm, automacao, versaoFinal);

  if (!gov.permitido) {
    await registrarLogGovernanca(base44, {
      participante_id: gov.participante_id, inscricao_principal: inscricao.id,
      cpf: cpfNorm || null, telefone: telNorm, email: emailNorm || null,
      automacao, template: templateNome, versao: versaoFinal, status: 'bloqueado',
      execution_id: gov.execution_id, origem, motivo_bloqueio: gov.motivo, idempotency_key: gov.idempotency_key,
    });
    const motivosQueMarcamEnviado = ['idempotency_violation', 'idempotency_violation_telefone', 'cooldown_ativo'];
    if (motivosQueMarcamEnviado.includes(gov.motivo)) {
      await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
        data_envio_boas_vindas: new Date().toISOString(), status_envio_grupo: 'enviado', fila_boas_vindas: false,
      }).catch(() => {});
    }
    return { sucesso: false, motivo: gov.motivo, detalhe: gov.detalhe };
  }

  const lockKey = `${automacao}:${cpfNorm || telNorm}`;
  await base44.asServiceRole.entities.M31AutomacaoLock.updateMany(
    { chave: lockKey, ativo: true }, { $set: { ativo: false } }).catch(() => {});

  let lockAdquirido = false;
  try {
    await base44.asServiceRole.entities.M31AutomacaoLock.create({
      chave: lockKey, ativo: true, execution_id: gov.execution_id,
      criado_em: new Date().toISOString(), expira_em: new Date(Date.now() + LOCK_TTL_MS).toISOString(),
    });
    lockAdquirido = true;
  } catch (_) {}

  if (!lockAdquirido) {
    await registrarLogGovernanca(base44, {
      participante_id: gov.participante_id, inscricao_principal: inscricao.id,
      cpf: cpfNorm || null, telefone: telNorm, email: emailNorm || null,
      automacao, template: templateNome, versao: versaoFinal, status: 'bloqueado',
      execution_id: gov.execution_id, origem, motivo_bloqueio: 'lock_aquisicao_falhou', idempotency_key: gov.idempotency_key,
    });
    return { sucesso: false, motivo: 'lock_aquisicao_falhou' };
  }

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
        automacao, template: templateNome, versao: versaoFinal, origem,
        inscricao_id: inscricao.id, inscricao_nome: inscricao.nome,
        mensagens, status: 'pendente', prioridade: 5, execution_id: gov.execution_id,
        aprovado_para_envio: true, aprovado_por: 'auto_gov_despachar', aprovado_em: new Date().toISOString(),
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
    automacao, template: templateNome, versao: versaoFinal,
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

  await base44.asServiceRole.entities.M31AutomacaoLock.updateMany(
    { chave: lockKey, execution_id: gov.execution_id }, { $set: { ativo: false } }).catch(() => {});

  if (sucessoGeral) {
    const encerrar = REGUA_ENCERRAMENTO[automacao] || [];
    if (encerrar.length > 0) {
      await encerrarReguaInline(base44, cpfNorm, telNorm, encerrar, `auto:${automacao}`);
    }
  }

  return { sucesso: sucessoGeral, motivo: sucessoGeral ? null : `falha_enfileiramento: ${erroMsg}`, uazapiResponses };
}

// ═══ NOVO FLUXO: ENVIO DIRETO (sem fila, sem drenador) ═══
// Para novas inscrições (go-live): a saudação é enviada IMEDIATAMENTE via UAZAPI.
// O QR Code só é enviado quando a participante responde (via m31ReceberWebhookUazapi).
// Não passa pela M31FilaMensagem — tempo real, sem aguardar o drenador.
async function enviarSaudacaoDiretaGovernada(base44, inscricao, telefoneEnvio, mensagem, origem, imageUrl, templateOverride) {
  const cpfNorm = (inscricao.cpf || '').replace(/\D/g, '');
  const telNorm = normalizePhone(telefoneEnvio);
  const emailNorm = (inscricao.email || '').toLowerCase().trim();
  const versaoFinal = 'V1';
  const isVoluntaria = inscricao.tipo === 'voluntario';
  const automacao = imageUrl ? 'CONFIRMACAO_COM_QR' : (isVoluntaria ? 'CONFIRMACAO_VOLUNTARIA' : 'BOAS_VINDAS');
  const templateNome = templateOverride || (imageUrl ? 'confirmacao_com_qr' : (isVoluntaria ? 'confirmacao_voluntaria' : 'saudacao_direta_v1'));

  // 1. GATEKEEPER (idempotência / cooldown / cross-automacao)
  const gov = await gatekeeperInline(base44, cpfNorm, telNorm, emailNorm, automacao, versaoFinal);
  if (!gov.permitido) {
    await registrarLogGovernanca(base44, {
      participante_id: gov.participante_id, inscricao_principal: inscricao.id,
      cpf: cpfNorm || null, telefone: telNorm, email: emailNorm || null,
      automacao, template: templateNome, versao: versaoFinal, status: 'bloqueado',
      execution_id: gov.execution_id, origem, motivo_bloqueio: gov.motivo, idempotency_key: gov.idempotency_key,
    });
    const motivosQueMarcamEnviado = ['idempotency_violation', 'idempotency_violation_telefone', 'cooldown_ativo', 'confirmacao_ja_enviada_outra_automacao'];
    if (motivosQueMarcamEnviado.includes(gov.motivo)) {
      // Outro processo (webhook) já enviou — sincronizar estado para jornada_concluida
      await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
        data_envio_boas_vindas: new Date().toISOString(), status_envio_grupo: 'enviado',
        estado_jornada: 'jornada_concluida', fila_boas_vindas: false,
        liberada_para_envio: false,
      }).catch(() => {});
    }
    return { sucesso: false, motivo: gov.motivo, detalhe: gov.detalhe };
  }

  // 2. LOCK
  const lockKey = `${automacao}:${cpfNorm || telNorm}`;
  await base44.asServiceRole.entities.M31AutomacaoLock.updateMany(
    { chave: lockKey, ativo: true }, { $set: { ativo: false } }).catch(() => {});
  let lockAdquirido = false;
  try {
    await base44.asServiceRole.entities.M31AutomacaoLock.create({
      chave: lockKey, ativo: true, execution_id: gov.execution_id,
      criado_em: new Date().toISOString(), expira_em: new Date(Date.now() + LOCK_TTL_MS).toISOString(),
    });
    lockAdquirido = true;
  } catch (_) {}
  if (!lockAdquirido) {
    await registrarLogGovernanca(base44, {
      participante_id: gov.participante_id, inscricao_principal: inscricao.id,
      cpf: cpfNorm || null, telefone: telNorm, email: emailNorm || null,
      automacao, template: templateNome, versao: versaoFinal, status: 'bloqueado',
      execution_id: gov.execution_id, origem, motivo_bloqueio: 'lock_aquisicao_falhou', idempotency_key: gov.idempotency_key,
    });
    return { sucesso: false, motivo: 'lock_aquisicao_falhou' };
  }

  // 3. ENFILEIRAR na M31FilaMensagem — NUNCA chamar UAZAPI diretamente.
  // O envio real é exclusivo do m31DrenarFila (com throttle, kill-switch, rate limit).
  let sucesso = false;
  let erroMsg = null;
  let uazapiBody = '';
  try {
    const dedupKey = `${inscricao.id}:${automacao}:V1`;
    // Verificar se já existe na fila
    const existentes = await base44.asServiceRole.entities.M31FilaMensagem.filter(
      { dedup_key: dedupKey }, '-created_date', 5);
    const bloqueante = existentes.find(f =>
      ['pendente', 'processando', 'enviado', 'incerto', 'falha_terminal'].includes(f.status));
    if (bloqueante) {
      sucesso = true; // já enfileirado/enviado — idempotente
      uazapiBody = `ja_na_fila:${bloqueante.status}`;
    } else {
      await base44.asServiceRole.entities.M31FilaMensagem.create({
        dedup_key: dedupKey,
        participante_id: gov.participante_id,
        cpf: cpfNorm || null, telefone: telNorm, email: emailNorm || null,
        automacao, template: templateNome, versao: versaoFinal, origem,
        inscricao_id: inscricao.id, inscricao_nome: inscricao.nome,
        mensagens: [{ message: mensagem, image_url: imageUrl }],
        status: 'pendente', aprovado_para_envio: true,
        aprovado_por: 'auto_gov_despachar_go_live', aprovado_em: new Date().toISOString(),
        prioridade: 4, execution_id: gov.execution_id,
        // Confirmação de compra: envio IMEDIATO mesmo fora da janela comercial
        forcar_envio: true,
      });
      sucesso = true;
      uazapiBody = 'enfileirado_aprovado_go_live';
    }
  } catch (e) {
    erroMsg = `falha_enfileirar: ${e.message}`;
  }

  // 4. LOGS (governança + mensagem)
  await registrarLogGovernanca(base44, {
    participante_id: gov.participante_id, inscricao_principal: inscricao.id,
    cpf: cpfNorm || null, telefone: telNorm, email: emailNorm || null,
    automacao, template: templateNome, versao: versaoFinal,
    status: sucesso ? 'enviado' : 'bloqueado',
    cooldown_ate: sucesso ? gov.cooldown_ate : null,
    execution_id: gov.execution_id, origem,
    motivo_bloqueio: sucesso ? null : `falha_envio_direto: ${erroMsg}`,
    idempotency_key: gov.idempotency_key,
  });
  await registrarMessageLog(base44, {
    inscricao_id: inscricao.id, inscricao_nome: inscricao.nome, telefone: telNorm,
    tipo: 'boas_vindas', stage: 'boas_vindas',
    mensagem, sucesso,
    zapi_response: uazapiBody, erro: sucesso ? null : `falha_envio_direto: ${erroMsg}`,
  });

  // 5. RELEASE LOCK
  await base44.asServiceRole.entities.M31AutomacaoLock.updateMany(
    { chave: lockKey, execution_id: gov.execution_id }, { $set: { ativo: false } }).catch(() => {});

  if (sucesso) {
    const encerrar = REGUA_ENCERRAMENTO[automacao] || [];
    if (encerrar.length > 0) {
      await encerrarReguaInline(base44, cpfNorm, telNorm, encerrar, `auto:${automacao}`);
    }
  }

  return { sucesso, motivo: sucesso ? null : `falha_envio_direto: ${erroMsg}` };
}
// ===== GOVERNANCA v1.0 END =====

const HARD_CAP = 40;

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

const CORTE_15_DIAS = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
const STATUS_CONFIRMADOS_DB = ['aprovado', 'gratuito'];
const STATUS_CONFIRMADOS_ASAAS = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'DUNNING_RECEIVED'];

async function validarPagamentoConfirmado(base44, inscricao) {
  if (!STATUS_CONFIRMADOS_DB.includes(inscricao.status_pagamento)) {
    return { liberado: false, motivo: 'bloqueado_por_pagamento_nao_confirmado', detalhe: `status_db=${inscricao.status_pagamento}` };
  }
  if (inscricao.asaas_payment_id) {
    try {
      const resp = await fetch(`__ASAAS_API__/payments/${inscricao.asaas_payment_id}`, {
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
      descricao: `Envio de confirmação bloqueado: ${detalhe}`,
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
    const payResp = await fetch(`__ASAAS_API__/payments/${asaasPaymentId}`, {
      headers: { 'access_token': ASAAS_KEY }
    });
    const payment = await payResp.json();
    if (payment.customer) {
      const custResp = await fetch(`__ASAAS_API__/customers/${payment.customer}`, {
        headers: { 'access_token': ASAAS_KEY }
      });
      const customer = await custResp.json();
      return customer.name || null;
    }
  } catch (e) { logger.log('[Despachar] Erro ao buscar pagador:', e.message); }
  return null;
}

function calcularMaxAdaptativo(backlogSize) {
  if (backlogSize <= 20) return 1;
  if (backlogSize <= 50) return 5;
  if (backlogSize <= 100) return 10;
  return 20;
}

// Gotejamento humanizado: intervalo ALEATÓRIO entre cada destinatária (45s a 120s).
// Substitui o antigo delay fixo de 3s, que gerava rajada de intervalo previsível (gatilho de bloqueio).
const GOTEJAMENTO_MIN_MS = 45000;
const GOTEJAMENTO_MAX_MS = 120000;
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
      inscricao_id, evento, status, detalhe, origem: 'm31DespacharConfirmacoes',
    });
  } catch (_) {}
}

function hojeRecife() {
  const d = new Date();
  const local = new Date(d.getTime() + (-3) * 60 * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

async function getEnviadosHoje(base44, hoje) {
  const existing = await base44.asServiceRole.entities.M31WhatsAppControl.filter({ data: hoje });
  if (existing.length > 0) return existing[0];
  return base44.asServiceRole.entities.M31WhatsAppControl.create({
    data: hoje, mensagens_enviadas_hoje: 0, limite_diario: HARD_CAP,
    bloqueado: false, total_falhas_hoje: 0, boas_vindas_enviadas: 0, cobrancas_enviadas: 0,
  });
}

async function incrementarControl(base44, control, delta) {
  const novoTotal = (control.mensagens_enviadas_hoje || 0) + delta;
  await base44.asServiceRole.entities.M31WhatsAppControl.update(control.id, {
    mensagens_enviadas_hoje: novoTotal,
    boas_vindas_enviadas: (control.boas_vindas_enviadas || 0) + delta,
    ultimo_envio_em: new Date().toISOString(),
  });
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
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const inscricao_id = body?.data?.id || body?.entity_id || body?.inscricao_id || null;

    // ═══════════════════════════════════════════════════════════════════════
    //  TRAVA GLOBAL DE MODO — nenhum envio automático ocorre enquanto o modo
    //  de envio estiver "pausado". Validação no backend, ANTES de qualquer
    //  seleção de candidatas ou chamada à UAZAPI. Aplica-se a TODOS os caminhos
    //  (webhook de aprovação, reconciliação, entidade update).
    // ═══════════════════════════════════════════════════════════════════════
    const cfgs = await base44.asServiceRole.entities.EventoM31Config.list('-created_date', 1);
    // NOVO FLUXO (go-live): novas inscrições disparam em tempo real, sem depender
    // do modo_envio_boas_vindas. A pausa afeta apenas disparos antigos pendentes
    // processados pela esteira histórica (m31EnviarBoasVindas).

    // ═══════════════════════════════════════════════════════════════════════
    //  GO-LIVE — FLUXO PARA A FRENTE (esteira nova, 1 inscrição por execução)
    //  Regras do go-live:
    //   1. inscricao_id é OBRIGATÓRIO. Sem ele, rejeita (nada de busca/lote).
    //   2. Processa exatamente UMA inscrição por execução.
    //   3. NÃO faz busca, fallback por CPF, nem processamento em lote.
    //   4. Só pagamentos confirmados APÓS go_live_corte_em entram por aqui.
    //      Pagamentos anteriores pertencem à esteira histórica de reconciliação
    //      controlada — nunca disparam por este caminho.
    //   5. Fail-closed: sem corte configurado, o fluxo novo fica travado.
    // ═══════════════════════════════════════════════════════════════════════
    const goLiveCorte = cfgs[0]?.go_live_corte_em || null;
    if (!goLiveCorte) {
      logger.log('[Despachar] TRAVA GO-LIVE: go_live_corte_em não configurado — fail-closed.');
      return Response.json({ skipped: true, reason: 'go_live_nao_configurado' });
    }

    if (!inscricao_id) {
      logger.log('[Despachar] TRAVA GO-LIVE: inscricao_id obrigatório no fluxo novo.');
      return Response.json({ skipped: true, reason: 'inscricao_id_obrigatorio' });
    }

    const hoje = hojeRecife();
    const control = await getEnviadosHoje(base44, hoje);
    let enviadosHoje = control.mensagens_enviadas_hoje || 0;

    // NOVO FLUXO: o hard cap do drenador NÃO se aplica à saudação de novas inscrições.
    // A saudação é 1 mensagem por inscrição, enviada em tempo real (sem fila).
    // O cap do drenador protege apenas o processamento em lote das inscrições antigas.

    // SELEÇÃO GO-LIVE: exatamente UMA inscrição (a de inscricao_id). Sem lote.
    // O pagamento precisa ter sido confirmado APÓS o corte do go-live — usa
    // last_contact_at (marcado pelo webhook na aprovação) como carimbo da
    // confirmação; fallback para updated_date. Anteriores ao corte pertencem
    // à esteira histórica e nunca passam por aqui.
    const insc = await base44.asServiceRole.entities.EventoM31Inscricao.filter({ id: inscricao_id });
    const candidatas = insc.filter((i) => {
      if (i.status_pagamento !== 'aprovado') return false;
      if (i.liberada_para_envio !== true) return false;
      if (i.data_envio_boas_vindas) return false;
      if (i.webhook_processando) return false;
      if (!i.whatsapp) return false;
      // IDEMPOTÊNCIA CRUZADA: se a jornada já foi concluída (webhook enviou) ou
      // está em processamento (webhook enviando agora), NÃO despachar — evita duplicidade.
      if (i.estado_jornada === 'jornada_concluida') return false;
      if (i.estado_jornada === 'processando_boas_vindas') return false;
      // Presenteada que ainda não completou o cadastro: NÃO envia QR/boas-vindas.
      // Ela primeiro recebe o link de conclusão; só depois de completar (cadastro_pendente=false) fica elegível.
      if (i.cadastro_pendente === true) return false;
      // CRÍTICO: comparar EXCLUSIVAMENTE com o timestamp financeiro real do provedor.
      // last_contact_at/updated_date são proibidos aqui — mudam por motivos não-financeiros
      // e liberariam inscrições antigas. Sem pagamento_confirmado_em = fica bloqueado (fail-closed).
      const confirmadoEm = i.pagamento_confirmado_em;
      if (!confirmadoEm || confirmadoEm < goLiveCorte) return false; // pré-corte / sem carimbo financeiro = esteira histórica
      return true;
    });

    if (candidatas.length === 0) {
      return Response.json({ success: true, despachadas: 0, reason: 'inscricao_nao_elegivel_go_live',
        mensagem: 'Inscrição não elegível: não aprovada, não liberada, já enviada, ou pagamento anterior ao corte do go-live.' });
    }

    const grupoRes = await resolverGrupo(base44, 'INSCRITAS_OFICIAL');
    if (!grupoRes?.success || !grupoRes?.invite_link) {
      await logEnvioGrupo(base44, { finalidade: 'INSCRITAS_OFICIAL', funcao_responsavel: 'm31DespacharConfirmacoes',
        tipo_envio: 'link_convite', destinatario: 'lote', sucesso: false, cancelado: true,
        erro: grupoRes?.error || 'grupo_nao_configurado' });
      return Response.json({ skipped: true, reason: 'grupo_nao_configurado' });
    }
    const LINK_GRUPO = grupoRes.invite_link;

    const resultados = [];
    const filaDeEspera = [];
    const MAX_POR_EXECUCAO = calcularMaxAdaptativo(candidatas.length);

    for (const inscricao of candidatas) {

      const validacao = await validarPagamentoConfirmado(base44, inscricao);
      if (!validacao.liberado) {
        resultados.push({ id: inscricao.id, nome: inscricao.nome, status: validacao.motivo, detalhe: validacao.detalhe });
        await registrarBloqueio(base44, inscricao, validacao.motivo, validacao.detalhe);
        continue;
      }

      // CLAIM ATÔMICO: marcar processando_boas_vindas ANTES de enviar.
      // Se o webhook já marcou jornada_concluida ou processando_boas_vindas
      // entre o filtro de candidatas e este re-fetch, NÃO despachar.
      await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
        webhook_processando: true,
        estado_jornada: 'processando_boas_vindas',
      });
      const fresh = await base44.asServiceRole.entities.EventoM31Inscricao.filter({ id: inscricao.id });
      // TRAVA 2 (imediatamente antes do UAZAPI): reconfirma autorização + não-enviado + estado da jornada na leitura FRESCA.
      const estadoFresh = fresh[0]?.estado_jornada;
      if (fresh.length === 0 || fresh[0]?.data_envio_boas_vindas || fresh[0]?.liberada_para_envio !== true ||
          estadoFresh === 'jornada_concluida') {
        // Se o webhook já concluiu, marcar como concluída para sincronizar estado
        const updateData = { webhook_processando: false };
        if (estadoFresh === 'jornada_concluida' || fresh[0]?.data_envio_boas_vindas) {
          updateData.estado_jornada = 'jornada_concluida';
          updateData.fila_boas_vindas = false;
          updateData.liberada_para_envio = false;
        } else {
          // Reverter para pagamento_confirmado se foi o despachador que setou processando
          updateData.estado_jornada = 'pagamento_confirmado';
        }
        await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, updateData);
        resultados.push({ id: inscricao.id, nome: inscricao.nome,
          status: fresh.length === 0 ? 'nao_encontrada_refetch'
            : (fresh[0]?.data_envio_boas_vindas || estadoFresh === 'jornada_concluida') ? 'ja_enviado_concorrencia' : 'nao_liberada' });
        continue;
      }

      const nome = inscricao.nome?.split(' ')[0] || 'Querida';

      // ── VOLUNTÁRIAS (/m31-servir): confirmação SEM QR Code ──
      // O fluxo de voluntárias não usa credenciamento por QR. Recebe apenas
      // confirmação + agradecimento (template confirmacao_voluntaria).
      if (inscricao.tipo === 'voluntario') {
        const tplVol = await base44.asServiceRole.entities.M31MessageTemplate.filter(
          { chave_unica: 'confirmacao_voluntaria', is_active: true }, '-updated_date', 1);
        if (!tplVol || tplVol.length === 0 || !tplVol[0].content) {
          await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
            webhook_processando: false, estado_jornada: 'pagamento_confirmado',
          });
          resultados.push({ id: inscricao.id, nome: inscricao.nome, status: 'template_voluntaria_ausente' });
          continue;
        }
        const msgVol = tplVol[0].content.replace(/\{\{primeiro_nome\}\}/g, nome);
        const resVol = await enviarSaudacaoDiretaGovernada(
          base44, inscricao, inscricao.whatsapp, msgVol, 'm31DespacharConfirmacoes:voluntaria', null);

        if (resVol.sucesso) {
          enviadosHoje++;
          await incrementarControl(base44, control, 1);
          await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
            data_envio_boas_vindas: new Date().toISOString(),
            estado_jornada: 'jornada_concluida',
            webhook_processando: false, fila_boas_vindas: false, liberada_para_envio: false,
          });
          await registrarTimeline(base44, inscricao.id, 'confirmacao_voluntaria_enviada', 'sucesso',
            'Confirmação de voluntária (sem QR Code) enviada');
        } else {
          await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
            webhook_processando: false, estado_jornada: 'pagamento_confirmado',
          });
          await registrarTimeline(base44, inscricao.id, 'confirmacao_voluntaria_falhou', 'falha', resVol.motivo || 'falha');
        }
        resultados.push({ id: inscricao.id, nome: inscricao.nome, whatsapp: resVol.sucesso,
          status: resVol.sucesso ? 'ok_voluntaria_sem_qr' : 'bloqueado_governanca', motivo: resVol.motivo });
        continue;
      }

      let codigo = inscricao.codigo_inscricao || '';
      if (!codigo) {
        codigo = gerarCodigoInscricao();
        await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, { codigo_inscricao: codigo });
      }
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(codigo)}&bgcolor=FFFFFF&color=000000&format=png`;
      // ═══ NOVO FLUXO: confirmação COMPLETA enviada DIRETAMENTE via UAZAPI (QR + código) ═══
      // Não depende da resposta da participante. O fluxo de resposta (m31ReceberWebhookUazapi)
      // fica desativado por config (webhook_resposta_uazapi_ativo=false) até validação em produção.
      // Participante JÁ no grupo: QR + "O M31 está chegando", SEM link do grupo.
      // NÃO confiar apenas em entrou_no_grupo: esse campo pode estar atrasado em
      // relação ao snapshot real do WhatsApp. Revalida por telefone normalizado.
      let telGrupo = String(inscricao.whatsapp || '').replace(/\D/g, '');
      while (telGrupo.startsWith('5555')) telGrupo = telGrupo.slice(2);
      if (!telGrupo.startsWith('55') && (telGrupo.length === 10 || telGrupo.length === 11)) telGrupo = `55${telGrupo}`;
      const variantesGrupo = Array.from(new Set([telGrupo, telGrupo.replace(/^55/, ''), String(inscricao.whatsapp || '').replace(/\D/g, '')].filter(Boolean)));
      const gruposOficiais = await base44.asServiceRole.entities.M31GrupoConfig.filter({ finalidade: 'INSCRITAS_OFICIAL', ativo: true }).catch(() => []);
      const groupJid = gruposOficiais?.[0]?.chat_id || null;
      let membroSnapshot = null;
      if (groupJid && variantesGrupo.length) {
        const membros = await base44.asServiceRole.entities.M31GrupoMembro.filter({ group_jid: groupJid, phone: { $in: variantesGrupo }, status: 'ativa' }, '-ultima_deteccao', 5).catch(() => []);
        membroSnapshot = membros?.[0] || null;
      }
      const jaNoGrupo = inscricao.entrou_no_grupo === true || !!membroSnapshot;
      let mensagem, templateChave;
      if (jaNoGrupo) {
        const tplJa = await base44.asServiceRole.entities.M31MessageTemplate.filter(
          { chave_unica: 'lembrete_qr_ja_no_grupo', is_active: true }, '-updated_date', 1);
        if (!tplJa || tplJa.length === 0 || !tplJa[0].content) {
          await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
            webhook_processando: false, estado_jornada: 'pagamento_confirmado',
          });
          resultados.push({ id: inscricao.id, nome: inscricao.nome, status: 'template_ja_no_grupo_ausente_fail_closed' });
          continue;
        }
        templateChave = 'lembrete_qr_ja_no_grupo';
        mensagem = tplJa[0].content
          .replace(/\{\{primeiro_nome\}\}/g, nome)
          .replace(/\{\{codigo_inscricao\}\}/g, codigo);
      } else {
        const tplRecs = await base44.asServiceRole.entities.M31MessageTemplate.filter(
          { chave_unica: 'confirmacao_com_qr', is_active: true }, '-updated_date', 1);
        const tplContent = tplRecs[0]?.content ||
          `Aqui está, {{primeiro_nome}}! 🌸\n🎟️ Código da sua inscrição:\n{{codigo_inscricao}}\n\n📲 Seu QR Code está na imagem.\nApresente-o no credenciamento do evento.\n\n👇 *Entre no grupo oficial da Imersão M31 Filhas:*\n{{link_grupo_whatsapp}}\n\nPor lá, você receberá todas as orientações e informações importantes do evento.\n\n☺️ Nos vemos no M31!`;
        templateChave = 'confirmacao_com_qr';
        mensagem = tplContent
          .replace(/\{\{primeiro_nome\}\}/g, nome)
          .replace(/\{\{codigo_inscricao\}\}/g, codigo)
          .replace(/\{\{link_grupo_whatsapp\}\}/g, LINK_GRUPO);
      }

      const result = await enviarSaudacaoDiretaGovernada(base44, inscricao, inscricao.whatsapp, mensagem, 'm31DespacharConfirmacoes', qrCodeUrl, templateChave);
      const whatsappOk = result.sucesso;

      await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
        qrcode_token: qrCodeUrl, qrcode_url: qrCodeUrl,
        qrcode_gerado_em: new Date().toISOString(),
        qr_envio_status: whatsappOk ? 'enviado_com_sucesso' : 'gerado_nao_enviado',
      }).catch(() => {});

      if (whatsappOk) {
        enviadosHoje++;
        await incrementarControl(base44, control, 1);
        await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
          data_envio_boas_vindas: new Date().toISOString(),
          estado_jornada: 'jornada_concluida',
          // O link do grupo só foi enviado quando NÃO estava no grupo ainda
          ...(!jaNoGrupo ? { status_envio_grupo: 'enviado' } : {}),
          qr_ultimo_envio_em: new Date().toISOString(),
          webhook_processando: false, fila_boas_vindas: false,
          liberada_para_envio: false,
        });
        await registrarTimeline(base44, inscricao.id, 'confirmacao_completa_enviada', 'sucesso', 'Confirmação completa (QR + código + grupo) enviada diretamente em tempo real');
        enviarEmail(inscricao, codigo, qrCodeUrl).catch((e) => logger.error('[Despachar] Email erro:', e.message));
      } else {
        const motivosQueMarcamEnviado = ['idempotency_violation', 'idempotency_violation_telefone', 'cooldown_ativo', 'confirmacao_ja_enviada_outra_automacao'];
        if (motivosQueMarcamEnviado.includes(result.motivo)) {
          // Idempotência/cooldown = outro processo já enviou — sincronizar estado
          await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
            data_envio_boas_vindas: new Date().toISOString(), status_envio_grupo: 'enviado',
            estado_jornada: 'jornada_concluida',
            webhook_processando: false, fila_boas_vindas: false,
          });
        } else {
          // FALHA REAL: NÃO marcar jornada_concluida — reverter para pagamento_confirmado
          // para permitir retentativa. QR NÃO foi entregue.
          await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
            webhook_processando: false,
            estado_jornada: 'pagamento_confirmado',
          });
          await registrarDLQ(base44, inscricao, 'boas_vindas', result.motivo || 'falha_despacho', 'm31DespacharConfirmacoes');
          await registrarTimeline(base44, inscricao.id, 'boas_vindas_falhou', 'falha', result.motivo || 'falha');
        }
      }

      resultados.push({ id: inscricao.id, nome: inscricao.nome, whatsapp: whatsappOk,
        status: whatsappOk ? 'ok' : 'bloqueado_governanca', motivo: result.motivo });

      if (resultados.filter(r => r.whatsapp).length >= MAX_POR_EXECUCAO) break;
      if (whatsappOk && candidatas.length > 1) await delayGotejamentoAleatorio();
    }

    return Response.json({ success: true,
      despachadas: resultados.filter(r => r.whatsapp).length,
      bloqueadas: resultados.filter(r => !r.whatsapp).length,
      fila_de_espera_wa: filaDeEspera.length, enviados_hoje: enviadosHoje, hard_cap: HARD_CAP,
      resultados, fila_para_amanha: filaDeEspera });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function enviarEmail(inscricao, codigo, qrCodeUrl) {
  const htmlContent = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, cambria; background: #0f0f0f; color: #f5f5f5; padding: 30px; max-width: 600px; margin: 0 auto;">
  <div style="text-align: center; margin-bottom: 24px;">
    <h1 style="color: #f43f5e; font-size: 24px; margin: 0;">M31 Filhas</h1>
    <p style="color: #aaa; margin: 4px 0 0;">Imersão Mulheres de Fé</p>
  </div>
  <div style="background: #1a0a0a; border: 1px solid #f43f5e33; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
    <h2 style="color: #f43f5e; margin-top: 0;">✅ Inscrição Confirmada!</h2>
    <p style="font-size: 16px;">Olá, <strong>${inscricao.nome}</strong>! Seu pagamento foi confirmado com sucesso. 🎉</p>
    <div style="background: #2a0f0f; border-radius: 8px; padding: 16px; margin: 20px 0; text-align: center;">
      <p style="color: #aaa; margin: 0 0 8px; font-size: 13px;">SEU CÓDIGO DE CHECK-IN</p>
      <p style="font-size: 28px; font-weight: bold; color: #f43f5e; letter-spacing: 3px; margin: 0; font-family: monospace;">${codigo}</p>
    </div>
    <div style="text-align: center; margin: 24px 0;">
      <p style="color: #aaa; font-size: 13px; margin-bottom: 12px;">QR CODE PARA CHECK-IN</p>
      <img src="${qrCodeUrl}" alt="QR Code" style="width: 200px; height: 200px; border-radius: 8px; background: #fff;" />
    </div>
    <hr style="border: 1px solid #333; margin: 20px 0;" />
    <p style="margin: 6px 0;"><strong>📅 Data:</strong> 21 de novembro</p>
    <p style="margin: 6px 0;"><strong>🕗 Horário:</strong> 9h às 19h</p>
    <p style="margin: 6px 0;"><strong>📍 Local:</strong> Igreja RIO Prado, Recife-PE</p>
  </div>
  <p style="color: #888; font-size: 13px; text-align: center;">
    Guarde este e-mail e apresente o QR Code ou código no dia do evento para fazer o check-in.<br/>
    <em>M31 Filhas — Imersão Mulheres de Fé 🌸</em>
  </p>
</body>
</html>`;

  await fetch("__BREVO_API__/smtp/email", {
    method: "POST",
    headers: { "api-key": config("BREVO_API_KEY"), "Content-Type": "application/json" },
    body: JSON.stringify({
      sender: { name: "M31 Filhas", email: "m31filhas@gmail.com" },
      to: [{ email: inscricao.email, name: inscricao.nome }],
      subject: `✅ Inscrição Confirmada — M31 Filhas | ${codigo}`,
      htmlContent
    })
  })(req);
}
}
