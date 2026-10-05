// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31EnfileirarLoteGrupoPendentes — Enfileira em LOTE o reenvio do link do
 * grupo oficial para inscritas que COMPRARAM (aprovado), RECEBERAM o convite
 * (status_envio_grupo='enviado') e AINDA NÃO entraram no grupo.
 *
 * GOVERNANÇA (freio anti-massa):
 *   - NÃO envia nada: apenas enfileira em M31FilaMensagem com
 *     aprovado_para_envio=false — o disparo só ocorre após liberação manual
 *     do gestor no painel de filas (kill-switch, limite diário e janela
 *     comercial seguem valendo no drenador).
 *   - Cooldown 24h por pessoa (GRUPO) via M31AutomacaoLog.
 *   - Dedup lógico: nunca dois itens ativos com a mesma dedup_key.
 *   - Grupo resolvido SEMPRE por finalidade (INSCRITAS_OFICIAL) — nunca por nome.
 */

const COOLDOWN_H = 24;

function normalizePhone(phone) {
  let d = (phone || '').replace(/\D/g, '');
  while (d.startsWith('5555')) d = d.slice(2);
  if (d.startsWith('55') && d.length >= 12) return d;
  if (d.length >= 10) return `55${d}`;
  return d;
}

async function resolverGrupo(base44, finalidade) {
  try {
    const res = await base44.asServiceRole.functions.invoke('m31ResolverGrupo', { finalidade });
    return res.data || res;
  } catch (e) {
    return { error: e.message, cancelado: true };
  }
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Apenas admin pode enfileirar o lote' }, { status: 403 });
    }
    const S = base44.asServiceRole.entities;

    // 1. Resolver grupo por FINALIDADE — link nunca hardcoded
    const grupo = await resolverGrupo(base44, 'INSCRITAS_OFICIAL');
    if (!grupo?.success || !grupo?.invite_link) {
      return Response.json({ success: false, cancelado: true, motivo: 'grupo_nao_configurado', erro: grupo?.error || grupo?.mensagem || 'Grupo não resolvido. Lote cancelado.' }, { status: 503 });
    }
    const LINK_GRUPO = grupo.invite_link;

    // ── VERIFICAÇÃO POR NÚMERO: membros ativos do grupo oficial. O cruzamento
    // é SEMPRE por telefone (nunca por nome) — a flag entrou_no_grupo pode
    // estar defasada, então o número é conferido antes de qualquer convite.
    function phoneKeys(raw) {
      let d = (raw || '').replace(/\D/g, '');
      while (d.startsWith('5555')) d = d.slice(2);
      if (!d.startsWith('55') && d.length >= 10) d = `55${d}`;
      if (d.length === 12 && d.startsWith('55')) d = d.slice(0, 4) + '9' + d.slice(4);
      const keys = new Set([d]);
      if (d.length === 13 && d.startsWith('55')) keys.add(d.slice(0, 4) + d.slice(5));
      return keys;
    }
    const telefonesNoGrupo = new Set();
    if (grupo.chat_id) {
      const membros = await S.M31GrupoMembro.filter({ group_jid: grupo.chat_id, status: 'ativa' }, null, 500);
      for (const m of membros) for (const k of phoneKeys(m.phone)) telefonesNoGrupo.add(k);
    }

    // 2. Público-alvo: comprou + recebeu convite + ainda não está no grupo
    const inscricoes = await S.EventoM31Inscricao.filter({
      status_pagamento: 'aprovado',
      entrou_no_grupo: false,
      status_envio_grupo: 'enviado',
      opt_out: { $ne: true },
      cadastro_pendente: { $ne: true },
    }, '-created_date', 500);

    const resultado = { publico: inscricoes.length, enfileirados: 0, pulados_cooldown: 0, pulados_duplicados: 0, pulados_telefone_invalido: 0, pulados_ja_no_grupo: 0 };
    const cooldownCorte = new Date(Date.now() - COOLDOWN_H * 3600000).toISOString();

    // Elegíveis em memória (telefone válido + dados do item)
    const elegiveis = [];
    const confirmadasNoGrupo = [];
    for (const insc of inscricoes) {
      const tel = normalizePhone(insc.whatsapp);
      if (!/^55\d{10,11}$/.test(tel)) { resultado.pulados_telefone_invalido++; continue; }
      // Cruzamento por NÚMERO: já está no grupo → status corrigido, sem convite
      if (telefonesNoGrupo.size > 0 && [...phoneKeys(insc.whatsapp)].some(k => telefonesNoGrupo.has(k))) {
        const agoraIso = new Date().toISOString();
        confirmadasNoGrupo.push({ id: insc.id, entrou_no_grupo: true, data_entrada_grupo: agoraIso, entrou_no_grupo_em: agoraIso, origem_confirmacao_grupo: 'automacao' });
        resultado.pulados_ja_no_grupo++;
        continue;
      }
      const cpf = (insc.cpf || '').replace(/\D/g, '');
      const primeiroNome = (insc.nome || '').trim().split(' ')[0] || 'Querida';
      const mensagem = `Olá, ${primeiroNome}! 🌸\n\nPercebi que você ainda não está no grupo do WhatsApp do M31 — aqui segue o link para você entrar e receber todas as informações do evento:\n${LINK_GRUPO}\n\nQualquer dúvida, estou à disposição!`;
      elegiveis.push({
        insc, tel, cpf, participante: cpf || tel,
        dedupKey: `${insc.id}:GRUPO_REENVIO:V1`,
        mensagem,
      });
    }

    // 3. Dedup lógico na fila — UMA consulta para todo o lote
    const chaves = elegiveis.map(e => e.dedupKey);
    const jaNaFila = chaves.length ? await S.M31FilaMensagem.filter({ dedup_key: { $in: chaves } }, '-created_date', 500) : [];
    const chavesAtivas = new Set(jaNaFila
      .filter(f => ['pendente', 'processando', 'enviado', 'incerto', 'falha_terminal'].includes(f.status))
      .map(f => f.dedup_key));

    // 4. Cooldown 24h por pessoa (GRUPO) — UMA consulta para todo o lote
    const participantes = [...new Set(elegiveis.map(e => e.participante))];
    const emCooldown = new Set();
    for (let i = 0; i < participantes.length; i += 100) {
      const bloco = participantes.slice(i, i + 100);
      const logs = await S.M31AutomacaoLog.filter(
        { participante_id: { $in: bloco }, automacao: 'GRUPO', status: 'enviado', enviado_em: { $gte: cooldownCorte } }, '-enviado_em', 500);
      for (const l of logs) emCooldown.add(l.participante_id);
    }

    const aEnfileirar = elegiveis.filter(e => {
      if (chavesAtivas.has(e.dedupKey)) { resultado.pulados_duplicados++; return false; }
      if (emCooldown.has(e.participante)) { resultado.pulados_cooldown++; return false; }
      return true;
    });

    // Corrige o status de quem o cruzamento por número confirmou no grupo
    for (let i = 0; i < confirmadasNoGrupo.length; i += 100) {
      await S.EventoM31Inscricao.bulkUpdate(confirmadasNoGrupo.slice(i, i + 100));
    }

    // 5. Enfileirar BLOQUEADO em lote (bulkCreate) — liberação manual no painel
    const execId = crypto.randomUUID();
    const agora = new Date().toISOString();
    const itensFila = aEnfileirar.map(e => ({
      dedup_key: e.dedupKey,
      participante_id: e.participante,
      cpf: e.cpf || null,
      telefone: e.tel,
      email: (e.insc.email || '').toLowerCase() || null,
      automacao: 'GRUPO',
      template: 'reenvio_link_grupo_manual',
      versao: 'V1',
      origem: 'm31EnfileirarLoteGrupoPendentes',
      inscricao_id: e.insc.id,
      inscricao_nome: e.insc.nome,
      mensagens: [{ message: e.mensagem }],
      status: 'pendente',
      aprovado_para_envio: false,
      prioridade: 2,
      execution_id: execId,
    }));
    const itensLog = aEnfileirar.map(e => ({
      participante_id: e.participante, inscricao_principal: e.insc.id,
      cpf: e.cpf || null, telefone: e.tel, email: (e.insc.email || '').toLowerCase() || null,
      automacao: 'GRUPO', template: 'reenvio_link_grupo_manual', versao: 'V1',
      status: 'pendente', enviado_em: agora,
      execution_id: execId, origem: 'm31EnfileirarLoteGrupoPendentes:lote_bloqueado',
      idempotency_key: e.dedupKey,
    }));
    for (let i = 0; i < itensFila.length; i += 50) {
      await S.M31FilaMensagem.bulkCreate(itensFila.slice(i, i + 50));
    }
    for (let i = 0; i < itensLog.length; i += 50) {
      await S.M31AutomacaoLog.bulkCreate(itensLog.slice(i, i + 50)).catch(() => {});
    }
    resultado.enfileirados = itensFila.length;

    return Response.json({ success: true, ...resultado, liberacao: 'Painel de Filas Operacionais — itens GRUPO aguardando aprovação manual' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
