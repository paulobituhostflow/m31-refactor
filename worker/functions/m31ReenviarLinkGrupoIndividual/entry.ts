// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31ReenviarLinkGrupoIndividual — Reenvia o link do grupo oficial para UMA inscrita.
 *
 * Usado pela ação rápida da tela de Participantes.
 * Governança inline: cooldown 24h por pessoa (GRUPO) + lock de concorrência.
 * (Sem idempotência estrita — é uma ação MANUAL de reenvio; o cooldown protege contra spam.)
 *
 * Payload: { inscricao_id: string }
 */

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

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { inscricao_id, mensagem_custom } = body;
    if (!inscricao_id) return Response.json({ error: 'inscricao_id é obrigatório' }, { status: 400 });

    // 1. Buscar inscrição
    const inscricoes = await base44.asServiceRole.entities.EventoM31Inscricao.filter({ id: inscricao_id });
    if (!inscricoes || inscricoes.length === 0) {
      return Response.json({ error: 'Inscrição não encontrada' }, { status: 404 });
    }
    const inscricao = inscricoes[0];

    if (!['aprovado', 'gratuito'].includes(inscricao.status_pagamento)) {
      return Response.json({ sucesso: false, motivo: 'pagamento_nao_aprovado' });
    }

    const telNorm = normalizePhone(inscricao.whatsapp);
    if (telNorm.length < 12) {
      return Response.json({ sucesso: false, motivo: 'telefone_invalido', telefone: telNorm });
    }

    // 2. Resolver grupo oficial por finalidade
    const grupos = await base44.asServiceRole.entities.M31GrupoConfig.filter({ finalidade: 'INSCRITAS_OFICIAL', ativo: true });
    if (!grupos || grupos.length !== 1 || !grupos[0].invite_link) {
      return Response.json({ sucesso: false, motivo: 'grupo_nao_configurado' });
    }
    const LINK_GRUPO = grupos[0].invite_link;

    // 2.5 Cruzamento por NÚMERO (nunca por nome): se o telefone já está entre
    // os membros ativos do grupo oficial, o status é corrigido e o convite
    // NÃO é disparado — a flag entrou_no_grupo pode estar defasada.
    function phoneKeys(raw) {
      let d = (raw || '').replace(/\D/g, '');
      while (d.startsWith('5555')) d = d.slice(2);
      if (!d.startsWith('55') && d.length >= 10) d = `55${d}`;
      if (d.length === 12 && d.startsWith('55')) d = d.slice(0, 4) + '9' + d.slice(4);
      const keys = new Set([d]);
      if (d.length === 13 && d.startsWith('55')) keys.add(d.slice(0, 4) + d.slice(5));
      return keys;
    }
    if (grupos[0].chat_id) {
      const membros = await base44.asServiceRole.entities.M31GrupoMembro.filter(
        { group_jid: grupos[0].chat_id, status: 'ativa' }, null, 500);
      const telefonesNoGrupo = new Set();
      for (const m of membros) for (const k of phoneKeys(m.phone)) telefonesNoGrupo.add(k);
      if ([...phoneKeys(telNorm)].some(k => telefonesNoGrupo.has(k))) {
        const agoraIso = new Date().toISOString();
        await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
          entrou_no_grupo: true, data_entrada_grupo: agoraIso, entrou_no_grupo_em: agoraIso,
          origem_confirmacao_grupo: 'automacao',
        }).catch(() => {});
        return Response.json({
          sucesso: false, motivo: 'ja_no_grupo', telefone: telNorm,
          detalhe: 'O número desta inscrita já está no grupo oficial — convite não enviado e status corrigido.',
        });
      }
    }

    // 3. Governança: cooldown 24h (GRUPO) por pessoa
    const cpfNorm = (inscricao.cpf || '').replace(/\D/g, '');
    const participante_id = cpfNorm || telNorm;
    const execution_id = crypto.randomUUID();
    const cooldownCorte = new Date(Date.now() - COOLDOWN_H * 3600000).toISOString();
    const recentes = await base44.asServiceRole.entities.M31AutomacaoLog.filter(
      { participante_id, automacao: 'GRUPO', status: 'enviado' }, '-enviado_em', 1);
    if (recentes.length > 0 && recentes[0].enviado_em && recentes[0].enviado_em >= cooldownCorte) {
      return Response.json({ sucesso: false, motivo: 'cooldown_ativo', detalhe: `Link já enviado nas últimas ${COOLDOWN_H}h` });
    }

    // 4. Lock de concorrência
    const lockKey = `GRUPO:${participante_id}`;
    const locksAtivos = await base44.asServiceRole.entities.M31AutomacaoLock.filter({ chave: lockKey, ativo: true });
    if (locksAtivos.find((l) => new Date(l.expira_em) > new Date())) {
      return Response.json({ sucesso: false, motivo: 'lock_ativo' });
    }
    await base44.asServiceRole.entities.M31AutomacaoLock.updateMany(
      { chave: lockKey, ativo: true }, { $set: { ativo: false } }).catch(() => {});
    try {
      await base44.asServiceRole.entities.M31AutomacaoLock.create({
        chave: lockKey, ativo: true, execution_id,
        criado_em: new Date().toISOString(), expira_em: new Date(Date.now() + LOCK_TTL_MS).toISOString(),
      });
    } catch (_) {
      return Response.json({ sucesso: false, motivo: 'lock_aquisicao_falhou' });
    }

    // 5. Enviar
    const nome = inscricao.nome?.split(' ')[0] || 'Querida';
    // Mensagem personalizada (opcional) para casos de atendimento manual:
    // o link do grupo é SEMPRE anexado pela função — nunca vem do chamador.
    const mensagem = (typeof mensagem_custom === 'string' && mensagem_custom.trim().length >= 5 && mensagem_custom.length <= 600)
      ? `${mensagem_custom.trim()}\n\n${LINK_GRUPO}`
      : `Olá, ${nome}! 🌸\n\nAqui está o link do grupo oficial do M31 Filhas:\n${LINK_GRUPO}\n\nEntre para receber todas as informações do evento. Nos vemos lá!`;

    let sucesso = false;
    let erro = null;
    let uazapiBody = null;
    try {
      const res = await sendViaUAZAPI(telNorm, mensagem);
      sucesso = res.sucesso;
      uazapiBody = res.body;
      if (!res.sucesso) erro = (res.body || '').substring(0, 150);
    } catch (e) {
      erro = e.message;
    }

    // 6. Logs (governança + mensagem + grupo)
    await base44.asServiceRole.entities.M31AutomacaoLog.create({
      participante_id, inscricao_principal: inscricao.id,
      cpf: cpfNorm || null, telefone: telNorm, email: (inscricao.email || '').toLowerCase() || null,
      automacao: 'GRUPO', template: 'reenvio_link_grupo_manual', versao: 'V1',
      status: sucesso ? 'enviado' : 'bloqueado',
      enviado_em: new Date().toISOString(),
      cooldown_ate: sucesso ? new Date(Date.now() + COOLDOWN_H * 3600000).toISOString() : null,
      execution_id, origem: 'm31ReenviarLinkGrupoIndividual',
      motivo_bloqueio: sucesso ? null : `falha_uazapi: ${erro}`,
      idempotency_key: `${participante_id}:GRUPO:MANUAL`,
    }).catch(() => {});

    await base44.asServiceRole.entities.M31MessageLog.create({
      inscricao_id: inscricao.id, inscricao_nome: inscricao.nome, telefone: telNorm,
      tipo: 'manual', stage: 'reenvio_link_grupo',
      mensagem, sucesso, zapi_response: uazapiBody, erro,
      enviado_em: new Date().toISOString(),
    }).catch(() => {});

    await base44.asServiceRole.entities.M31GrupoEnvioLog.create({
      finalidade: 'INSCRITAS_OFICIAL', nome_grupo: grupos[0].nome_grupo, chat_id: grupos[0].chat_id || null,
      qtd_mensagens: 1, funcao_responsavel: 'm31ReenviarLinkGrupoIndividual',
      tipo_envio: 'link_convite', destinatario: telNorm, inscricao_id: inscricao.id,
      sucesso, erro, enviado_em: new Date().toISOString(),
    }).catch(() => {});

    // 7. Liberar lock + atualizar inscrição
    await base44.asServiceRole.entities.M31AutomacaoLock.updateMany(
      { chave: lockKey, execution_id }, { $set: { ativo: false } }).catch(() => {});

    if (sucesso) {
      await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
        status_envio_grupo: 'enviado',
        last_contact_at: new Date().toISOString(),
      }).catch(() => {});
    }

    return Response.json({ sucesso, motivo: sucesso ? null : `falha_uazapi: ${erro}`, inscricao: inscricao.nome, telefone: telNorm });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
