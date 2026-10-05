// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31AdicionarGrupo74 — Envio gotejado do convite ao grupo (fila M31FilaGrupo74)
 *
 * Modelo: 1 (ou poucos) envio por EXECUÇÃO, puxando da fila persistente.
 * O gotejamento vem do INTERVALO entre execuções da automação agendada
 * (a cada 5 min), nunca de sleeps longos dentro da função (que estouram timeout).
 *
 * Governança preservada:
 *   - LOCK GLOBAL DE EXECUÇÃO (single-flight): duas execuções nunca rodam juntas
 *   - Idempotência por telefone (GRUPO) via M31AutomacaoLog
 *   - Lock por pessoa, cooldown, limite diário
 *   - Log global (M31AutomacaoLog) + auditoria (M31MessageLog)
 *
 * Payload (opcional):
 *   { batch: number }  // quantos processar nesta execução (default 1)
 *
 * Admin-only (execução manual) ou automação agendada (service role).
 */

const GROUP_INVITE = '__WHATSAPP_GROUP_INVITE__';
const AUTOMACAO = 'GRUPO';
const VERSAO = 'ADD_GRUPO_74_V1';
const TEMPLATE = 'convite_grupo_pagante_fora';
const ORIGEM = 'm31AdicionarGrupo74';
const EXEC_LOCK_KEY = 'ADD_GRUPO_74_EXEC';
const EXEC_LOCK_TTL_MS = 5 * 60 * 1000;
const LOCK_TTL_MS = 5 * 60 * 1000;
const COOLDOWN_H = 24;
const LIMITE_DIARIO_PESSOA = 2;

function normalizePhone(phone: string): string {
  let d = (phone || '').replace(/\D/g, '');
  while (d.startsWith('5555')) d = d.slice(2);
  if (d.startsWith('55') && d.length >= 12) return d;
  if (d.length >= 10) return `55${d}`;
  return d;
}

function mensagemConvite(nome: string): string {
  const primeiro = (nome || 'querida').trim().split(/\s+/)[0];
  return `Oi ${primeiro}! 💜\n\nVocê já garantiu sua vaga no M31 Filhas, mas ainda não está no nosso grupo oficial — é por lá que você vai acompanhar tudo sobre o evento.\n\nEntra aqui: ${GROUP_INVITE}`;
}

async function sendViaUAZAPI(phone: string, message: string) {
  const token = config('UAZAPI_TOKEN');
  if (!token) throw new Error('UAZAPI_TOKEN não configurado');
  const baseUrl = (config('UAZAPI_BASE') || '__UAZAPI_API__').replace(/\/+$/, '');
  const resp = await fetch(`${baseUrl}/send/text`, {
    method: 'POST',
    headers: { 'token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ number: phone, phone, message, text: message }),
  });
  const body = await resp.text();
  return { sucesso: resp.status === 200, status: resp.status, body };
}

// Gatekeeper reduzido para GRUPO (idempotência + lock + cooldown + limite diário)
async function podeEnviar(base44: any, telNorm: string) {
  const participante_id = telNorm;
  const idempotencyKey = `${telNorm}:${AUTOMACAO}:${VERSAO}`;

  const jaEssaVersao = await base44.asServiceRole.entities.M31AutomacaoLog.filter(
    { idempotency_key: idempotencyKey, status: 'enviado' }, '-enviado_em', 1
  );
  if (jaEssaVersao.length > 0) return { ok: false, motivo: 'ja_enviado_esta_versao', participante_id, idempotencyKey };

  const jaGrupo = await base44.asServiceRole.entities.M31AutomacaoLog.filter(
    { telefone: telNorm, automacao: AUTOMACAO, status: 'enviado' }, '-enviado_em', 1
  );
  if (jaGrupo.length > 0) return { ok: false, motivo: 'ja_recebeu_grupo', participante_id, idempotencyKey };

  const lockKey = `${AUTOMACAO}:${telNorm}`;
  const locks = await base44.asServiceRole.entities.M31AutomacaoLock.filter({ chave: lockKey, ativo: true });
  if (locks.find((l: any) => new Date(l.expira_em) > new Date())) {
    return { ok: false, motivo: 'lock_ativo', participante_id, idempotencyKey };
  }

  const cooldownCorte = new Date(Date.now() - COOLDOWN_H * 3600000).toISOString();
  const recentes = await base44.asServiceRole.entities.M31AutomacaoLog.filter(
    { participante_id, automacao: AUTOMACAO, status: 'enviado' }, '-enviado_em', 1
  );
  if (recentes.length > 0 && recentes[0].enviado_em && recentes[0].enviado_em >= cooldownCorte) {
    return { ok: false, motivo: 'cooldown_ativo', participante_id, idempotencyKey };
  }

  const corte24h = new Date(Date.now() - 24 * 3600000).toISOString();
  const logs24h = await base44.asServiceRole.entities.M31AutomacaoLog.filter(
    { participante_id, status: 'enviado' }, '-enviado_em', 10
  );
  const hoje = logs24h.filter((l: any) => l.enviado_em && l.enviado_em >= corte24h).length;
  if (hoje >= LIMITE_DIARIO_PESSOA) return { ok: false, motivo: 'limite_diario_excedido', participante_id, idempotencyKey };

  return { ok: true, participante_id, idempotencyKey };
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Admin (execução manual) ou automação agendada (sem usuário)
    try {
      const user = await base44.auth.me();
      if (user && user.role !== 'admin') {
        return Response.json({ error: 'Apenas administradores' }, { status: 403 });
      }
    } catch {
      // automação agendada — prosseguir
    }

    const body = await req.json().catch(() => ({}));
    const batch = Number.isFinite(body?.batch) && body.batch > 0 ? Math.min(body.batch, 3) : 1;

    // ── LOCK GLOBAL DE EXECUÇÃO (single-flight) ──
    const agora = new Date();
    const execLocks = await base44.asServiceRole.entities.M31AutomacaoLock.filter({ chave: EXEC_LOCK_KEY, ativo: true });
    if (execLocks.find((l: any) => new Date(l.expira_em) > agora)) {
      return Response.json({ pulado: true, motivo: 'execucao_em_andamento' });
    }
    await base44.asServiceRole.entities.M31AutomacaoLock.updateMany(
      { chave: EXEC_LOCK_KEY, ativo: true }, { $set: { ativo: false } }
    ).catch(() => {});
    const execId = crypto.randomUUID();
    await base44.asServiceRole.entities.M31AutomacaoLock.create({
      chave: EXEC_LOCK_KEY, ativo: true, execution_id: execId,
      criado_em: agora.toISOString(),
      expira_em: new Date(Date.now() + EXEC_LOCK_TTL_MS).toISOString(),
    });

    const resultado = { processados: 0, enviados: 0, bloqueados: 0, falhas: 0, restantes: 0, detalhes: [] as any[] };

    try {
      // Puxar os próximos pendentes
      const pendentes = await base44.asServiceRole.entities.M31FilaGrupo74.filter(
        { status: 'pendente' }, 'created_date', batch
      );

      for (const item of pendentes) {
        const telNorm = normalizePhone(item.telefone);
        resultado.processados++;

        const gov = await podeEnviar(base44, telNorm);
        if (!gov.ok) {
          await base44.asServiceRole.entities.M31FilaGrupo74.update(item.id, {
            status: 'bloqueado', motivo: gov.motivo, processado_em: new Date().toISOString(),
          });
          resultado.bloqueados++;
          resultado.detalhes.push({ nome: item.nome, telefone: telNorm, status: 'bloqueado', motivo: gov.motivo });
          continue;
        }

        // ── PRÉ-REQUISITO: só mandar o convite ao grupo se a pessoa JÁ recebeu boas-vindas.
        // Se ainda não recebeu, enviar boas-vindas + QR (que já contém o link do grupo) e NÃO
        // mandar o convite avulso — evita a inconsistência de convidar antes de confirmar.
        const inscricoesTel = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
          { whatsapp: telNorm }, '-created_date', 5
        );
        const inscricao = inscricoesTel.find((i: any) =>
          ['aprovado', 'gratuito'].includes(i.status_pagamento)
        ) || inscricoesTel[0];

        if (inscricao && !inscricao.data_envio_boas_vindas) {
          let bvSucesso = false; let bvMotivo = null;
          try {
            const bvRes = await base44.asServiceRole.functions.invoke('m31EnviarBoasVindasConvidada', {
              inscricao_id: inscricao.id,
            });
            bvSucesso = bvRes.data?.sucesso === true;
            bvMotivo = bvRes.data?.motivo || null;
          } catch (e) {
            bvMotivo = e.message;
          }
          await base44.asServiceRole.entities.M31FilaGrupo74.update(item.id, {
            status: bvSucesso ? 'enviado' : 'falha',
            motivo: bvSucesso ? 'boas_vindas_enviadas_em_vez_do_convite' : `falha_boas_vindas: ${bvMotivo}`,
            processado_em: new Date().toISOString(),
          });
          if (bvSucesso) resultado.enviados++; else resultado.falhas++;
          resultado.detalhes.push({
            nome: item.nome, telefone: telNorm,
            status: bvSucesso ? 'boas_vindas_enviadas' : 'falha_boas_vindas', motivo: bvMotivo,
          });
          if (batch > 1) await new Promise((r) => setTimeout(r, 2000));
          continue;
        }

        // Lock por pessoa
        const lockKey = `${AUTOMACAO}:${telNorm}`;
        await base44.asServiceRole.entities.M31AutomacaoLock.create({
          chave: lockKey, ativo: true, execution_id: execId,
          criado_em: new Date().toISOString(),
          expira_em: new Date(Date.now() + LOCK_TTL_MS).toISOString(),
        }).catch(() => {});

        // ENFILEIRAMENTO NA FILA GLOBAL (M31FilaMensagem) — envio real só pelo m31DrenarFila
        let sucesso = false; let erro = null; let respBody = '';
        try {
          const filaExistentes = await base44.asServiceRole.entities.M31FilaMensagem.filter(
            { dedup_key: gov.idempotencyKey }, '-created_date', 5);
          const bloqueante = filaExistentes.find((f: any) =>
            ['pendente', 'processando', 'enviado', 'incerto', 'falha_terminal'].includes(f.status));
          const terminais = await base44.asServiceRole.entities.M31FilaMensagem.filter(
            { telefone: telNorm, status: 'falha_terminal' }, '-created_date', 1);
          if (bloqueante) {
            erro = `fila_dedup_ativo:${bloqueante.status}`;
          } else if (terminais.length > 0) {
            erro = 'telefone_bloqueado_falha_terminal';
          } else {
            await base44.asServiceRole.entities.M31FilaMensagem.create({
              dedup_key: gov.idempotencyKey, participante_id: gov.participante_id,
              telefone: telNorm, automacao: AUTOMACAO, template: TEMPLATE, versao: VERSAO,
              origem: ORIGEM, inscricao_id: inscricao?.id || null, inscricao_nome: item.nome,
              mensagens: [{ message: mensagemConvite(item.nome) }],
              status: 'pendente', prioridade: 3, execution_id: execId,
            });
            sucesso = true;
            respBody = 'enfileirado_M31FilaMensagem';
          }
        } catch (e) {
          erro = e.message;
        }

        const nowIso = new Date().toISOString();

        await base44.asServiceRole.entities.M31AutomacaoLog.create({
          participante_id: gov.participante_id,
          telefone: telNorm,
          automacao: AUTOMACAO,
          template: TEMPLATE,
          versao: VERSAO,
          status: sucesso ? 'pendente' : 'bloqueado',
          enviado_em: nowIso,
          cooldown_ate: sucesso ? new Date(Date.now() + COOLDOWN_H * 3600000).toISOString() : null,
          execution_id: execId,
          origem: ORIGEM,
          motivo_bloqueio: sucesso ? null : `falha_enfileiramento: ${erro}`,
          idempotency_key: gov.idempotencyKey,
        }).catch(() => {});

        await base44.asServiceRole.entities.M31MessageLog.create({
          inscricao_id: 'grupo74',
          inscricao_nome: item.nome,
          telefone: telNorm,
          tipo: 'manual',
          stage: 'convite_grupo',
          mensagem: mensagemConvite(item.nome),
          sucesso,
          zapi_response: respBody,
          erro: sucesso ? null : erro,
          enviado_em: nowIso,
        }).catch(() => {});

        await base44.asServiceRole.entities.M31AutomacaoLock.updateMany(
          { chave: lockKey, execution_id: execId }, { $set: { ativo: false } }
        ).catch(() => {});

        await base44.asServiceRole.entities.M31FilaGrupo74.update(item.id, {
          status: sucesso ? 'enviado' : 'falha',
          motivo: sucesso ? 'enfileirado_fila_global' : erro,
          uazapi_response: respBody,
          processado_em: nowIso,
        });

        if (sucesso) {
          resultado.enviados++;
          resultado.detalhes.push({ nome: item.nome, telefone: telNorm, status: 'enviado' });
        } else {
          resultado.falhas++;
          resultado.detalhes.push({ nome: item.nome, telefone: telNorm, status: 'falha', erro });
        }

        // Micro-espaçamento entre múltiplos no mesmo batch (não é o gotejamento principal)
        if (batch > 1) await new Promise((r) => setTimeout(r, 2000));
      }

      const restam = await base44.asServiceRole.entities.M31FilaGrupo74.filter({ status: 'pendente' }, null, 200);
      resultado.restantes = restam.length;
    } finally {
      await base44.asServiceRole.entities.M31AutomacaoLock.updateMany(
        { chave: EXEC_LOCK_KEY, execution_id: execId }, { $set: { ativo: false } }
      ).catch(() => {});
    }

    return Response.json(resultado);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
