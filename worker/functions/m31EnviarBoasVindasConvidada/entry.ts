// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31EnviarBoasVindasConvidada — v1 GOVERNADA INLINE
 *
 * Envia boas-vindas para uma inscrição específica com atribuição do pagador.
 * Usado quando uma pessoa paga inscrições para terceiros (convidadas).
 *
 * Payload: { inscricao_id: string, pagador_nome?: string }
 * Se pagador_nome não for informado, busca no Asaas o nome do cliente que pagou.
 *
 * A mensagem contém obrigatoriamente:
 * - Nome da participante
 * - Quem realizou o pagamento (se identificado)
 * - Código da inscrição
 * - Link oficial do grupo
 * - QR Code (enviado como imagem separada)
 * - Orientação para guardar o QR Code para o check-in
 */

// ===== GOVERNANCA v1.0 BEGIN =====
const COOLDOWNS_H = { BOAS_VINDAS: 72 };
const LOCK_TTL_MS = 5 * 60 * 1000;

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
  const cooldownH = COOLDOWNS_H[automacao] || 72;
  const idempotencyKey = cpfNorm ? `${cpfNorm}:${automacao}:${versaoFinal}` : `${telNorm}:${automacao}:${versaoFinal}`;

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

  // 2. LOCK
  const lockKey = `${automacao}:${cpfNorm || telNorm}`;
  const locksAtivos = await base44.asServiceRole.entities.M31AutomacaoLock.filter({ chave: lockKey, ativo: true });
  const lockValido = locksAtivos.find((l) => new Date(l.expira_em) > new Date());
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

  return { permitido: true, execution_id, participante_id, idempotency_key: idempotencyKey,
    cooldown_ate: new Date(Date.now() + cooldownH * 3600000).toISOString() };
}
// ===== GOVERNANCA v1.0 END =====

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
  } catch (e) { logger.log('[Convidada] Erro ao buscar pagador Asaas:', e.message); }
  return null;
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { inscricao_id, pagador_nome } = body;

    if (!inscricao_id) {
      return Response.json({ error: 'inscricao_id é obrigatório' }, { status: 400 });
    }

    // 1. Buscar inscrição
    const inscricoes = await base44.asServiceRole.entities.EventoM31Inscricao.filter({ id: inscricao_id });
    if (!inscricoes || inscricoes.length === 0) {
      return Response.json({ error: 'Inscrição não encontrada', inscricao_id }, { status: 404 });
    }
    const inscricao = inscricoes[0];

    // 2. Validar pagamento
    if (!['aprovado', 'gratuito'].includes(inscricao.status_pagamento)) {
      return Response.json({ error: 'Pagamento não aprovado', status_pagamento: inscricao.status_pagamento }, { status: 400 });
    }

    // 3. Validar telefone
    const telefone = (inscricao.whatsapp || '').replace(/\D/g, '');
    if (telefone.length < 10) {
      return Response.json({ error: 'telefone_invalido', telefone }, { status: 400 });
    }

    // 4. Resolver grupo oficial
    const grupos = await base44.asServiceRole.entities.M31GrupoConfig.filter({ finalidade: 'INSCRITAS_OFICIAL', ativo: true });
    if (!grupos || grupos.length === 0 || !grupos[0].invite_link) {
      return Response.json({ error: 'grupo_nao_configurado' }, { status: 500 });
    }
    const LINK_GRUPO = grupos[0].invite_link;

    // 5. Determinar pagador
    let pagador = pagador_nome || null;
    if (!pagador && inscricao.asaas_payment_id) {
      pagador = await buscarPagadorAsaas(inscricao.asaas_payment_id);
    }

    // 6. Construir mensagem
    const nome = inscricao.nome?.split(' ')[0] || 'Querida';
    const codigo = inscricao.codigo_inscricao || '';
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(codigo)}&bgcolor=FFFFFF&color=000000&format=png`;

    const linhaCaravana = inscricao.caravana_nome ? `\n🚌 Caravana: *${inscricao.caravana_nome}*\n` : '';
    const blocoConferencia = `\n\n📋 *Confira seus dados:*\nNome: ${inscricao.nome}${inscricao.cidade ? `\nCidade: ${inscricao.cidade}` : ''}\nSe algum dado estiver incorreto, responda esta mensagem informando a correção.`;

    let mensagem;
    if (pagador) {
      mensagem = `Olá, ${nome}!\nSua inscrição para o M31 Filhas foi confirmada. 🌸\n${linhaCaravana}\nSua inscrição foi abençoada por *${pagador}*.\n\n🎟 Código da inscrição:\n\`${codigo}\`\n\n📲 Seu QR Code segue abaixo.\nApresente este QR Code no credenciamento do evento.\n\n👥 Grupo oficial:\n${LINK_GRUPO}${blocoConferencia}\n\nNos vemos no M31!`;
    } else {
      mensagem = `Olá, ${nome}!\nSua inscrição para o M31 Filhas foi confirmada. 🌸\n${linhaCaravana}\n🎟 Código da inscrição:\n\`${codigo}\`\n\n📲 Seu QR Code segue abaixo.\nApresente este QR Code no credenciamento do evento.\n\n👥 Grupo oficial:\n${LINK_GRUPO}${blocoConferencia}\n\nNos vemos no M31!`;
    }

    // 7. Governança
    const cpfNorm = (inscricao.cpf || '').replace(/\D/g, '');
    const telNorm = normalizePhone(inscricao.whatsapp);
    const emailNorm = (inscricao.email || '').toLowerCase().trim();
    const automacao = 'BOAS_VINDAS';
    const versaoFinal = 'V1';

    const gov = await gatekeeperInline(base44, cpfNorm, telNorm, emailNorm, automacao, versaoFinal);

    if (!gov.permitido) {
      await registrarLogGovernanca(base44, {
        participante_id: gov.participante_id, inscricao_principal: inscricao.id,
        cpf: cpfNorm || null, telefone: telNorm, email: emailNorm || null,
        automacao, template: 'confirmacao_convidada_v1', versao: versaoFinal, status: 'bloqueado',
        execution_id: gov.execution_id, origem: 'm31EnviarBoasVindasConvidada',
        motivo_bloqueio: gov.motivo, idempotency_key: gov.idempotency_key,
      });
      const motivosQueMarcamEnviado = ['idempotency_violation', 'idempotency_violation_telefone', 'cooldown_ativo'];
      if (motivosQueMarcamEnviado.includes(gov.motivo)) {
        await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
          data_envio_boas_vindas: new Date().toISOString(), status_envio_grupo: 'enviado', fila_boas_vindas: false,
        }).catch(() => {});
      }
      return Response.json({ sucesso: false, motivo: gov.motivo, detalhe: gov.detalhe, inscricao: inscricao.nome });
    }

    // 8. Adquirir lock
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
        automacao, template: 'confirmacao_convidada_v1', versao: versaoFinal, status: 'bloqueado',
        execution_id: gov.execution_id, origem: 'm31EnviarBoasVindasConvidada',
        motivo_bloqueio: 'lock_aquisicao_falhou', idempotency_key: gov.idempotency_key,
      });
      return Response.json({ sucesso: false, motivo: 'lock_aquisicao_falhou' });
    }

    // 9. Enviar mensagem de texto
    let sucessoGeral = true;
    let erroMsg = null;
    const uazapiResponses = [];

    try {
      const res1 = await sendViaUAZAPI(telNorm, mensagem, null);
      uazapiResponses.push({ etapa: 'texto', ...res1 });
      if (!res1.sucesso) { sucessoGeral = false; erroMsg = `texto: ${(res1.body || '').substring(0, 150)}`; }
    } catch (e) {
      sucessoGeral = false; erroMsg = `texto: ${e.message}`;
      uazapiResponses.push({ etapa: 'texto', sucesso: false, status: 0, body: e.message });
    }

    // 10. Enviar QR Code como imagem
    if (sucessoGeral) {
      await new Promise(r => setTimeout(r, 1500));
      try {
        const res2 = await sendViaUAZAPI(telNorm, '🎫 Seu QR Code de entrada M31 Filhas', qrCodeUrl);
        uazapiResponses.push({ etapa: 'qr_code', ...res2 });
        if (!res2.sucesso) { sucessoGeral = false; erroMsg = `qr: ${(res2.body || '').substring(0, 150)}`; }
      } catch (e) {
        sucessoGeral = false; erroMsg = `qr: ${e.message}`;
        uazapiResponses.push({ etapa: 'qr_code', sucesso: false, status: 0, body: e.message });
      }
    }

    // 11. Registrar logs
    await registrarLogGovernanca(base44, {
      participante_id: gov.participante_id, inscricao_principal: inscricao.id,
      cpf: cpfNorm || null, telefone: telNorm, email: emailNorm || null,
      automacao, template: 'confirmacao_convidada_v1', versao: versaoFinal,
      status: sucessoGeral ? 'enviado' : 'bloqueado',
      cooldown_ate: sucessoGeral ? gov.cooldown_ate : null,
      execution_id: gov.execution_id, origem: 'm31EnviarBoasVindasConvidada',
      motivo_bloqueio: sucessoGeral ? null : `falha_uazapi: ${erroMsg}`,
      idempotency_key: gov.idempotency_key,
    });

    await registrarMessageLog(base44, {
      inscricao_id: inscricao.id, inscricao_nome: inscricao.nome, telefone: telNorm,
      tipo: 'boas_vindas', stage: 'boas_vindas',
      mensagem: `${mensagem} | 🎫 Seu QR Code de entrada M31 Filhas`,
      sucesso: sucessoGeral, zapi_response: JSON.stringify(uazapiResponses), erro: erroMsg,
    });

    // 12. Liberar lock
    await base44.asServiceRole.entities.M31AutomacaoLock.updateMany(
      { chave: lockKey, execution_id: gov.execution_id }, { $set: { ativo: false } }).catch(() => {});

    // 13. Atualizar inscrição
    if (sucessoGeral) {
      await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
        ...(pagador ? { pagador_nome: pagador } : {}),
        data_envio_boas_vindas: new Date().toISOString(),
        status_envio_grupo: 'enviado',
        fila_boas_vindas: false,
        boas_vindas_iniciada_em: new Date().toISOString(),
        last_contact_at: new Date().toISOString(),
        qrcode_token: qrCodeUrl,
        qrcode_url: qrCodeUrl,
        qrcode_gerado_em: new Date().toISOString(),
        qr_envio_status: 'enviado_com_sucesso',
        qr_tentativas_envio: 1,
        qr_ultimo_envio_em: new Date().toISOString(),
      });
    }

    return Response.json({
      sucesso: sucessoGeral,
      motivo: sucessoGeral ? null : `falha_uazapi: ${erroMsg}`,
      inscricao: inscricao.nome,
      codigo,
      telefone: telNorm,
      pagador: pagador || 'não identificado',
      link_grupo: LINK_GRUPO,
      qr_code_url: qrCodeUrl,
      uazapiResponses,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
