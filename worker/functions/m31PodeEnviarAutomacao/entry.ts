// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31PodeEnviarAutomacao — GATEKEEPER CENTRAL DE GOVERNANÇA
 *
 * Esta é a ÚNICA função que autoriza ou bloqueia disparos de automação.
 * Nenhuma automação pode enviar mensagens sem passar por aqui.
 *
 * Validações (REGRAS 2-10):
 *   1. Idempotência global (CPF + AUTOMACAO + VERSAO) — REGRA 3
 *   2. Lock de concorrência — REGRA 4
 *   3. Cooldown por automação — REGRA 5
 *   4. Limite diário por pessoa — REGRA 10
 *   5. Prioridade entre automações — REGRA 9
 *
 * Read-only: não envia, não cria lock, não modifica estado.
 * Retorna a DECISÃO para o caller (m31EnviarMensagemGovernada).
 */

// ── COOLDOWN POR AUTOMAÇÃO (horas) — REGRA 5 ──
const COOLDOWNS_H: Record<string, number> = {
  BOAS_VINDAS: 72,
  RECUPERACAO_CHECKOUT: 24,
  QR_CODE: 12,
  GRUPO: 24,
  COBRANCA: 24,
  LEMBRETE: 12,
  CHECKIN: 24,
  PENDENCIA_CRITICA: 12,
  OPERACIONAL: 6,
};

// ── PRIORIDADES (menor = mais prioritário) — REGRA 9 ──
const PRIORIDADES: Record<string, number> = {
  PENDENCIA_CRITICA: 1,
  RECUPERACAO_CHECKOUT: 2,
  GRUPO: 3,
  QR_CODE: 4,
  BOAS_VINDAS: 5,
  COBRANCA: 5,
  LEMBRETE: 6,
  CHECKIN: 6,
  OPERACIONAL: 7,
};

// ── LIMITE DIÁRIO POR PESSOA — REGRA 10 ──
const LIMITE_DIARIO_PESSOA = 2;

function normCpf(cpf: string): string {
  return (cpf || '').replace(/\D/g, '');
}

function normalizePhone(phone: string): string {
  let d = (phone || '').replace(/\D/g, '');
  while (d.startsWith('5555')) d = d.slice(2);
  if (d.startsWith('55') && d.length >= 12) return d;
  if (d.length >= 10) return `55${d}`;
  return d;
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { cpf, telefone, email, automacao, versao, origem } = body;

    if (!automacao) {
      return Response.json({ error: 'automacao é obrigatório' }, { status: 400 });
    }

    const cpfNorm = normCpf(cpf || '');
    const telNorm = normalizePhone(telefone || '');
    const emailNorm = (email || '').toLowerCase().trim();
    const participante_id = cpfNorm || telNorm || emailNorm;

    if (!participante_id) {
      return Response.json({
        permitido: false,
        motivo: 'sem_identificador_pessoa',
        detalhe: 'CPF, telefone ou email são obrigatórios',
        execution_id: crypto.randomUUID(),
        participante_id: 'unknown',
      });
    }

    const versaoFinal = versao || 'V1';
    const cooldownH = COOLDOWNS_H[automacao] || 24;
    const execution_id = crypto.randomUUID();
    const agora = new Date();

    // ── 1. IDEMPOTÊNCIA GLOBAL (REGRA 3) ──
    // Chave: CPF + AUTOMACAO + VERSAO
    const idempotencyKey = cpfNorm
      ? `${cpfNorm}:${automacao}:${versaoFinal}`
      : `${telNorm}:${automacao}:${versaoFinal}`;

    const existentes = await base44.asServiceRole.entities.M31AutomacaoLog.filter(
      { idempotency_key: idempotencyKey, status: 'enviado' },
      '-enviado_em', 1
    );
    if (existentes.length > 0) {
      return Response.json({
        permitido: false,
        motivo: 'idempotency_violation',
        detalhe: `Já existe envio bem-sucedido para ${automacao} ${versaoFinal}`,
        execution_id,
        participante_id,
        log_existente: existentes[0].id,
      });
    }

    // Fallback por telefone (se não houver CPF)
    if (!cpfNorm && telNorm) {
      const porTel = await base44.asServiceRole.entities.M31AutomacaoLog.filter(
        { telefone: telNorm, automacao, status: 'enviado' },
        '-enviado_em', 1
      );
      if (porTel.length > 0 && porTel[0].enviado_em) {
        return Response.json({
          permitido: false,
          motivo: 'idempotency_violation_telefone',
          detalhe: `Telefone ${telNorm} já recebeu ${automacao}`,
          execution_id,
          participante_id,
        });
      }
    }

    // ── 2. LOCK DE CONCORRÊNCIA (REGRA 4) ──
    const lockKey = `${automacao}:${cpfNorm || telNorm}`;
    const locksAtivos = await base44.asServiceRole.entities.M31AutomacaoLock.filter(
      { chave: lockKey, ativo: true }
    );
    const lockValido = locksAtivos.find(l => new Date(l.expira_em) > agora);
    if (lockValido) {
      return Response.json({
        permitido: false,
        motivo: 'lock_ativo',
        detalhe: `Execução concorrente em andamento (expira ${lockValido.expira_em})`,
        execution_id,
        participante_id,
      });
    }

    // ── 3. COOLDOWN (REGRA 5) ──
    const cooldownCorte = new Date(Date.now() - cooldownH * 3600000).toISOString();
    const recentes = await base44.asServiceRole.entities.M31AutomacaoLog.filter(
      { participante_id, automacao, status: 'enviado' },
      '-enviado_em', 1
    );
    if (recentes.length > 0 && recentes[0].enviado_em && recentes[0].enviado_em >= cooldownCorte) {
      return Response.json({
        permitido: false,
        motivo: 'cooldown_ativo',
        detalhe: `Último envio há menos de ${cooldownH}h (${recentes[0].enviado_em})`,
        execution_id,
        participante_id,
        cooldown_ate: new Date(new Date(recentes[0].enviado_em).getTime() + cooldownH * 3600000).toISOString(),
      });
    }

    // ── 4. LIMITE DIÁRIO POR PESSOA (REGRA 10) ──
    const corte24h = new Date(Date.now() - 24 * 3600000).toISOString();
    const logs24h = await base44.asServiceRole.entities.M31AutomacaoLog.filter(
      { participante_id, status: 'enviado' },
      '-enviado_em', 10
    );
    const enviadosHoje = logs24h.filter(l => l.enviado_em && l.enviado_em >= corte24h).length;
    if (enviadosHoje >= LIMITE_DIARIO_PESSOA) {
      return Response.json({
        permitido: false,
        motivo: 'limite_diario_excedido',
        detalhe: `${enviadosHoje} automações enviadas nas últimas 24h (limite: ${LIMITE_DIARIO_PESSOA})`,
        execution_id,
        participante_id,
      });
    }

    // ── 5. PRIORIDADE ENTRE AUTOMAÇÕES (REGRA 9) ──
    // Se há automação de maior prioridade com lock ativo para a mesma pessoa, bloquear
    const minhaPrioridade = PRIORIDADES[automacao] || 99;
    if (locksAtivos.length > 0) {
      const conflito = locksAtivos.find(l => {
        const parts = l.chave.split(':');
        const outraAutomacao = parts[0];
        const outraPessoa = parts.slice(1).join(':');
        return outraPessoa === (cpfNorm || telNorm) &&
               outraAutomacao !== automacao &&
               (PRIORIDADES[outraAutomacao] || 99) < minhaPrioridade &&
               new Date(l.expira_em) > agora;
      });
      if (conflito) {
        return Response.json({
          permitido: false,
          motivo: 'automacao_maior_prioridade_em_andamento',
          detalhe: `Lock ativo: ${conflito.chave}`,
          execution_id,
          participante_id,
        });
      }
    }

    // ── TODAS AS VERIFICAÇÕES PASSARAM ──
    return Response.json({
      permitido: true,
      execution_id,
      participante_id,
      cpf: cpfNorm || null,
      telefone: telNorm || null,
      email: emailNorm || null,
      versao: versaoFinal,
      idempotency_key: idempotencyKey,
      cooldown_ate: new Date(Date.now() + cooldownH * 3600000).toISOString(),
      cooldown_h: cooldownH,
      prioridade: minhaPrioridade,
    });

  } catch (error) {
    return Response.json({
      error: error.message,
      permitido: false,
      motivo: 'erro_interno',
    }, { status: 500 });
  }
})(req);
}
