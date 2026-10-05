// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31EnviarMensagemGovernada — PORTA ÚNICA DE ENTRADA DA FILA GLOBAL
 *
 * ⚠️ ESTA FUNÇÃO NÃO ENVIA MAIS NADA PARA A UAZAPI.
 * Ela valida (gatekeeper) e ENFILEIRA em M31FilaMensagem.
 * O ÚNICO ponto de contato com a UAZAPI passa a ser m31DrenarFila
 * (drenador com single-flight global + teto de envios por minuto).
 *
 * Fluxo:
 *   1. Validação gatekeeper inline (idempotência, lock, cooldown, limite diário, prioridade)
 *   2. Se bloqueado → registra log de bloqueio e retorna
 *   3. Dedup de fila (mesma dedup_key em pendente/processando/enviado → não re-enfileira)
 *   4. Cria item em M31FilaMensagem (status: pendente)
 *   5. Registra M31AutomacaoLog com status 'pendente' (o drenador promove para 'enviado')
 *
 * Resposta: { enviado: false, enfileirado: true, fila_id, execution_id }
 * Callers antigos que checavam `enviado === true` devem passar a checar `enfileirado`.
 */

// ── CONFIGURAÇÃO DE COOLDOWN POR AUTOMAÇÃO (horas) — REGRA 5 ──
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

const LIMITE_DIARIO_PESSOA = 2; // REGRA 10

function normalizePhone(phone: string): string {
  let d = (phone || '').replace(/\D/g, '');
  while (d.startsWith('5555')) d = d.slice(2);
  if (d.startsWith('55') && d.length >= 12) return d;
  if (d.length >= 10) return `55${d}`;
  return d;
}

async function registrarLog(base44: any, params: Record<string, any>) {
  try {
    await base44.asServiceRole.entities.M31AutomacaoLog.create({
      participante_id: params.participante_id,
      inscricao_principal: params.inscricao_principal || null,
      cpf: params.cpf || null,
      telefone: params.telefone || null,
      email: params.email || null,
      automacao: params.automacao,
      template: params.template || null,
      versao: params.versao || 'V1',
      status: params.status,
      enviado_em: new Date().toISOString(),
      cooldown_ate: params.cooldown_ate || null,
      execution_id: params.execution_id,
      origem: params.origem || 'unknown',
      motivo_bloqueio: params.motivo_bloqueio || null,
      motivo_cancelamento: params.motivo_cancelamento || null,
      idempotency_key: params.idempotency_key,
    });
  } catch (e) {
    logger.error('[Governanca] Erro ao registrar log:', e.message);
  }
}

// ── GATEKEEPER INLINE (idêntico à versão anterior — nada foi afrouxado) ──
async function gatekeeper(
  base44: any,
  cpfNorm: string,
  telNorm: string,
  emailNorm: string,
  automacao: string,
  versaoFinal: string
): Promise<{ permitido: boolean; motivo?: string; detalhe?: string; execution_id: string; participante_id: string; idempotency_key: string; cooldown_ate?: string }> {
  const participante_id = cpfNorm || telNorm || emailNorm;
  const execution_id = crypto.randomUUID();

  if (!participante_id) {
    return { permitido: false, motivo: 'sem_identificador_pessoa', detalhe: 'CPF, telefone ou email são obrigatórios', execution_id, participante_id: 'unknown', idempotency_key: '' };
  }

  const cooldownH = COOLDOWNS_H[automacao] || 24;
  const idempotencyKey = cpfNorm
    ? `${cpfNorm}:${automacao}:${versaoFinal}`
    : `${telNorm}:${automacao}:${versaoFinal}`;
  const agora = new Date();

  // ── 1. IDEMPOTÊNCIA GLOBAL (REGRA 3) ──
  const existentes = await base44.asServiceRole.entities.M31AutomacaoLog.filter(
    { idempotency_key: idempotencyKey, status: 'enviado' },
    '-enviado_em', 1
  );
  if (existentes.length > 0) {
    return { permitido: false, motivo: 'idempotency_violation', detalhe: `Já existe envio bem-sucedido para ${automacao} ${versaoFinal}`, execution_id, participante_id, idempotency_key: idempotencyKey };
  }

  if (!cpfNorm && telNorm) {
    const porTel = await base44.asServiceRole.entities.M31AutomacaoLog.filter(
      { telefone: telNorm, automacao, status: 'enviado' },
      '-enviado_em', 1
    );
    if (porTel.length > 0 && porTel[0].enviado_em) {
      return { permitido: false, motivo: 'idempotency_violation_telefone', detalhe: `Telefone ${telNorm} já recebeu ${automacao}`, execution_id, participante_id, idempotency_key: idempotencyKey };
    }
  }

  // ── 2. LOCK DE CONCORRÊNCIA (REGRA 4) ──
  const lockKey = `${automacao}:${cpfNorm || telNorm}`;
  const locksAtivos = await base44.asServiceRole.entities.M31AutomacaoLock.filter(
    { chave: lockKey, ativo: true }
  );
  const lockValido = locksAtivos.find((l: any) => new Date(l.expira_em) > agora);
  if (lockValido) {
    return { permitido: false, motivo: 'lock_ativo', detalhe: `Execução concorrente em andamento (expira ${lockValido.expira_em})`, execution_id, participante_id, idempotency_key: idempotencyKey };
  }

  // ── 3. COOLDOWN (REGRA 5) ──
  const cooldownCorte = new Date(Date.now() - cooldownH * 3600000).toISOString();
  const recentes = await base44.asServiceRole.entities.M31AutomacaoLog.filter(
    { participante_id, automacao, status: 'enviado' },
    '-enviado_em', 1
  );
  if (recentes.length > 0 && recentes[0].enviado_em && recentes[0].enviado_em >= cooldownCorte) {
    const cooldownAte = new Date(new Date(recentes[0].enviado_em).getTime() + cooldownH * 3600000).toISOString();
    return { permitido: false, motivo: 'cooldown_ativo', detalhe: `Último envio há menos de ${cooldownH}h`, execution_id, participante_id, idempotency_key: idempotencyKey, cooldown_ate: cooldownAte };
  }

  // ── 4. LIMITE DIÁRIO (REGRA 10) ──
  const corte24h = new Date(Date.now() - 24 * 3600000).toISOString();
  const logs24h = await base44.asServiceRole.entities.M31AutomacaoLog.filter(
    { participante_id, status: 'enviado' },
    '-enviado_em', 10
  );
  const enviadosHoje = logs24h.filter((l: any) => l.enviado_em && l.enviado_em >= corte24h).length;
  if (enviadosHoje >= LIMITE_DIARIO_PESSOA) {
    return { permitido: false, motivo: 'limite_diario_excedido', detalhe: `${enviadosHoje} automações nas últimas 24h (limite: ${LIMITE_DIARIO_PESSOA})`, execution_id, participante_id, idempotency_key: idempotencyKey };
  }

  // ── 5. PRIORIDADE (REGRA 9) ──
  const minhaPrioridade = PRIORIDADES[automacao] || 99;
  if (locksAtivos.length > 0) {
    const conflito = locksAtivos.find((l: any) => {
      const parts = l.chave.split(':');
      const outraAutomacao = parts[0];
      const outraPessoa = parts.slice(1).join(':');
      return outraPessoa === (cpfNorm || telNorm) &&
             outraAutomacao !== automacao &&
             (PRIORIDADES[outraAutomacao] || 99) < minhaPrioridade &&
             new Date(l.expira_em) > agora;
    });
    if (conflito) {
      return { permitido: false, motivo: 'automacao_maior_prioridade_em_andamento', detalhe: `Lock ativo: ${conflito.chave}`, execution_id, participante_id, idempotency_key: idempotencyKey };
    }
  }

  return {
    permitido: true,
    execution_id,
    participante_id,
    idempotency_key: idempotencyKey,
    cooldown_ate: new Date(Date.now() + cooldownH * 3600000).toISOString(),
  };
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // ── RESTRIÇÃO DE ACESSO: apenas administradores (cadeias internas herdam o
    //    contexto do caller admin). O campo `origem` do body NÃO é prova de
    //    autorização — usuários comuns autenticados NÃO podem enfileirar.
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden: apenas administradores podem enfileirar mensagens' }, { status: 403 });

    const body = await req.json();
    const {
      cpf, telefone, email, automacao, template, versao, origem,
      inscricao_id, inscricao_nome,
      mensagens,
    } = body;

    if (!automacao || !telefone || !mensagens || !Array.isArray(mensagens) || mensagens.length === 0) {
      return Response.json({ error: 'automacao, telefone e mensagens (array) são obrigatórios' }, { status: 400 });
    }

    const cpfNorm = (cpf || '').replace(/\D/g, '');
    const telNorm = normalizePhone(telefone);
    const emailNorm = (email || '').toLowerCase().trim();
    const versaoFinal = versao || 'V1';

    // ── 1. GATEKEEPER INLINE ──
    const gov = await gatekeeper(base44, cpfNorm, telNorm, emailNorm, automacao, versaoFinal);

    // ── 2. SE BLOQUEADO → REGISTRAR LOG E RETORNAR ──
    if (!gov.permitido) {
      await registrarLog(base44, {
        participante_id: gov.participante_id,
        inscricao_principal: inscricao_id,
        cpf: cpfNorm || null, telefone: telNorm, email: emailNorm || null,
        automacao, template, versao: versaoFinal,
        status: 'bloqueado',
        execution_id: gov.execution_id,
        origem: origem || 'unknown',
        motivo_bloqueio: gov.motivo,
        idempotency_key: gov.idempotency_key,
      });

      return Response.json({
        enviado: false,
        enfileirado: false,
        motivo: gov.motivo,
        detalhe: gov.detalhe,
        execution_id: gov.execution_id,
        inscricao_nome,
      });
    }

    // ── 3a. TELEFONE BLOQUEADO POR FALHA TERMINAL: número inválido/fora do WhatsApp
    //        bloqueia QUALQUER novo enfileiramento até correção manual do contato
    //        (corrigir o telefone e mudar o item terminal para 'cancelado'). ──
    const terminais = await base44.asServiceRole.entities.M31FilaMensagem.filter(
      { telefone: telNorm, status: 'falha_terminal' }, '-created_date', 1
    );
    if (terminais.length > 0) {
      await registrarLog(base44, {
        participante_id: gov.participante_id,
        inscricao_principal: inscricao_id,
        cpf: cpfNorm || null, telefone: telNorm, email: emailNorm || null,
        automacao, template, versao: versaoFinal,
        status: 'bloqueado',
        execution_id: gov.execution_id,
        origem: origem || 'unknown',
        motivo_bloqueio: 'telefone_bloqueado_falha_terminal',
        idempotency_key: gov.idempotency_key,
      });
      return Response.json({
        enviado: false,
        enfileirado: false,
        motivo: 'telefone_bloqueado_falha_terminal',
        detalhe: `Telefone ${telNorm} tem falha terminal registrada (item ${terminais[0].id}). Corrija o contato e cancele o item terminal para liberar.`,
        execution_id: gov.execution_id,
        inscricao_nome,
      });
    }

    // ── 3b. DEDUP DE FILA: mesma dedup_key ativa/terminal/incerta → não re-enfileira
    //        (apenas 'falha' retryable esgotada e 'cancelado' liberam nova tentativa) ──
    const jaNaFila = await base44.asServiceRole.entities.M31FilaMensagem.filter(
      { dedup_key: gov.idempotency_key },
      '-created_date', 5
    );
    const ativoNaFila = jaNaFila.find((i: any) => ['pendente', 'processando', 'enviado', 'incerto', 'falha_terminal'].includes(i.status));
    if (ativoNaFila) {
      await registrarLog(base44, {
        participante_id: gov.participante_id,
        inscricao_principal: inscricao_id,
        cpf: cpfNorm || null, telefone: telNorm, email: emailNorm || null,
        automacao, template, versao: versaoFinal,
        status: 'bloqueado',
        execution_id: gov.execution_id,
        origem: origem || 'unknown',
        motivo_bloqueio: `ja_na_fila:${ativoNaFila.status}`,
        idempotency_key: gov.idempotency_key,
      });

      return Response.json({
        enviado: false,
        enfileirado: false,
        motivo: 'ja_na_fila',
        detalhe: `Item ${ativoNaFila.id} já está na fila com status ${ativoNaFila.status}`,
        execution_id: gov.execution_id,
        inscricao_nome,
      });
    }

    // ── 4. ENFILEIRAR (NENHUM ENVIO ACONTECE AQUI) ──
    const filaItem = await base44.asServiceRole.entities.M31FilaMensagem.create({
      dedup_key: gov.idempotency_key,
      participante_id: gov.participante_id,
      cpf: cpfNorm || null,
      telefone: telNorm,
      email: emailNorm || null,
      automacao,
      template: template || null,
      versao: versaoFinal,
      origem: origem || 'unknown',
      inscricao_id: inscricao_id || null,
      inscricao_nome: inscricao_nome || null,
      mensagens: mensagens.map((m: any) => ({ message: m.message || '', image_url: m.image_url || null })),
      status: 'pendente',
      prioridade: PRIORIDADES[automacao] || 5,
      tentativas: 0,
      proxima_mensagem_idx: 0,
      resultados_mensagens: [],
      execution_id: gov.execution_id,
    });

    // ── 5. LOG 'pendente' (o drenador promove para 'enviado' após UAZAPI 200) ──
    await registrarLog(base44, {
      participante_id: gov.participante_id,
      inscricao_principal: inscricao_id,
      cpf: cpfNorm || null, telefone: telNorm, email: emailNorm || null,
      automacao, template, versao: versaoFinal,
      status: 'pendente',
      cooldown_ate: gov.cooldown_ate,
      execution_id: gov.execution_id,
      origem: origem || 'unknown',
      idempotency_key: gov.idempotency_key,
    });

    return Response.json({
      enviado: false,
      enfileirado: true,
      fila_id: filaItem.id,
      execution_id: gov.execution_id,
      inscricao_nome,
    });

  } catch (error) {
    return Response.json({ error: error.message, enviado: false, enfileirado: false }, { status: 500 });
  }
})(req);
}
