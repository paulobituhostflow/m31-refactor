// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31DrenarFila v2 — ÚNICO SENDER UAZAPI DO SISTEMA (fila global)
 *
 * Cron 5 min — DESLIGADO até validação final.
 *
 * Correções v2 (bloqueadores de produção):
 *   1. Lock single-flight ATÔMICO: singleton pré-criado DRENAR_FILA:GLOBAL,
 *      aquisição por transição condicional inativo→ativo (updateMany, exige updated=1).
 *      Sem filter+create (comprovadamente não-atômico).
 *   2. Claim atômico por item: updateMany condicional pendente→processando,
 *      prossegue APENAS com updated=1. Registra claim_id/claim_em/claim_expira_em.
 *   3. Sucesso = HTTP 200 + error:null + messageid válido e não vazio.
 *      Guarda messageid, resumo da resposta, status HTTP, horário, resultado por mensagem.
 *   4. Progresso de sequência (proxima_mensagem_idx): retry NUNCA repete mensagem aceita.
 *   5. Timeout/resposta ambígua → 'incerto' (sem retry automático — revisão humana).
 *   6. Número inválido/fora do WhatsApp → 'falha_terminal' (bloqueia re-enfileiramento
 *      do telefone na governança até correção manual).
 *   7. Teto de 6/min contado POR CHAMADA à UAZAPI (texto e imagem contam separado);
 *      espaçamento de 10s antes de CADA chamada, inclusive entre msgs do mesmo item.
 *   8. Revalidação COMPLETA da governança imediatamente antes do envio
 *      (idempotência, envio posterior, cooldown, limite diário, telefone bloqueado,
 *      inscrição cancelada/opt-out, prioridade).
 *   9. Recuperação de claims expirados: volta a pendente SÓ se nenhuma chamada foi
 *      iniciada sob o claim; com chamada iniciada e sem desfecho → 'incerto'.
 */

// DELAY HUMANIZADO: intervalo ALEATÓRIO antes de CADA chamada — quebra o padrão
// preditivo que os filtros da Meta detectam como automação.
// QR Codes (CONFIRMACAO_COM_QR) usam delay reduzido — já houve interação humana prévia.
const DELAY_HUMANIZADO_MIN_MS = 60000;
const DELAY_HUMANIZADO_MAX_MS = 120000;
function delayHumanizadoMs(automacao?: string): number {
  // Intervalo humanizado UNIFICADO para TODAS as automações (60-120s).
  // QR Codes NÃO usam mais delay reduzido: disparar várias confirmações no
  // mesmo minuto era o padrão preditivo que a Meta detecta como automação abusiva.
  return DELAY_HUMANIZADO_MIN_MS + Math.floor(Math.random() * (DELAY_HUMANIZADO_MAX_MS - DELAY_HUMANIZADO_MIN_MS));
}
const TETO_CHAMADAS_POR_MINUTO = 1; // HARD GATE 60s: no máximo 1 chamada por minuto cruzando execuções — intervalo humanizado mínimo obrigatório
const MAX_CHAMADAS_POR_EXECUCAO = 1; // 1 mensagem real por execução — intervalo rigoroso de 60s entre envios
const MAX_TENTATIVAS = 3;
const RETRY_BACKOFF_MS = 10 * 60 * 1000;
const LOCK_CHAVE = 'DRENAR_FILA:GLOBAL';
const LOCK_TTL_MS = 8 * 60 * 1000;
const CLAIM_TTL_MS = 4 * 60 * 1000;
const LIMITE_DIARIO_PESSOA = 2;
const TIMEOUT_CHAMADA_MS = 20000;
// ═══ PROTOCOLO 72H (recuperação de Trust Score Meta) ═══
const HARD_CAP_DIARIO = 40;                    // Regra 3: teto absoluto de envios/dia
const BREAKER_CHAVE = 'CAPPING:CIRCUIT_BREAKER';
const BREAKER_TTL_MS = 12 * 3600000;           // Regra 4: capping → pausa total de 12h

function hojeRecife(): string {
  return new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
}

const COOLDOWNS_H: Record<string, number> = {
  BOAS_VINDAS: 72, RECUPERACAO_CHECKOUT: 24, QR_CODE: 12, GRUPO: 24,
  COBRANCA: 24, LEMBRETE: 12, CHECKIN: 24, PENDENCIA_CRITICA: 12, OPERACIONAL: 6,
  CONFIRMACAO_COM_QR: 72, CONFIRMACAO_TEXTO: 72, CONFIRMACAO_PRESENTEADA: 72,
  GRUPO_FOLLOWUP_1: 48, GRUPO_FOLLOWUP_2: 48, CAMPANHA_CAMISAS: 168,
};
const PRIORIDADES: Record<string, number> = {
  SUPORTE: 1, PENDENCIA_CRITICA: 1, RECUPERACAO_CHECKOUT: 2, GRUPO: 3, QR_CODE: 4,
  BOAS_VINDAS: 5, COBRANCA: 5, LEMBRETE: 6, CHECKIN: 6, CARTINHA_COPIA: 6, OPERACIONAL: 7,
  CONFIRMACAO_COM_QR: 4, CONFIRMACAO_TEXTO: 4, CONFIRMACAO_PRESENTEADA: 4,
  GRUPO_FOLLOWUP_1: 6, GRUPO_FOLLOWUP_2: 6, CAMPANHA_CAMISAS: 9,
};
const REGUA_ENCERRAMENTO: Record<string, string[]> = {
  BOAS_VINDAS: [], RECUPERACAO_CHECKOUT: [], GRUPO: ['GRUPO'], QR_CODE: ['QR_CODE'],
  COBRANCA: ['COBRANCA'], CHECKIN: ['LEMBRETE', 'CHECKIN'], PENDENCIA_CRITICA: ['PENDENCIA_CRITICA'],
  // Confirmação unificada encerra qualquer régua legada de BOAS_VINDAS/QR_CODE da mesma pessoa
  CONFIRMACAO_COM_QR: ['BOAS_VINDAS', 'QR_CODE'],
};

// Padrões de erro DEFINITIVO (número inválido / fora do WhatsApp / destino inexistente)
const PADROES_TERMINAIS = /(not?\s?.{0,16}whatsapp|whatsapp.{0,16}not|invalid.{0,12}(number|phone|jid)|(number|phone).{0,12}(invalid|not\s?found)|no\s?.{0,6}account|not\s?.{0,10}registered|recipient.{0,16}not\s?.{0,8}found|item-not-found|does\s?not\s?exist)/i;

function normalizePhone(phone: string): string {
  let d = (phone || '').replace(/\D/g, '');
  while (d.startsWith('5555')) d = d.slice(2);
  if (d.startsWith('55') && d.length >= 12) return d;
  if (d.length >= 10) return `55${d}`;
  return d;
}

// updateMany do SDK retorna { success, updated, has_more } (verificado em produção)
function mc(res: any): number {
  return res?.updated ?? res?.modified_count ?? res?.modifiedCount ?? 0;
}

/**
 * Classifica a resposta da UAZAPI:
 *   aceito         = HTTP 200 + sem error no corpo + messageid válido e não vazio
 *   falha          = rejeição clara (HTTP != 200 ou error no corpo) — retryable
 *   falha_terminal = número inválido / fora do WhatsApp — sem retry, bloqueia telefone
 *   incerto        = HTTP 200 sem messageid (ambíguo) — sem retry automático
 */
function interpretarResposta(httpStatus: number, body: string) {
  let json: any = null;
  try { json = JSON.parse(body || ''); } catch { /* corpo não-JSON */ }
  const corpoComErro = !!(json && (json.error || json.status === 'error'));
  const messageId = json ? (json.id || json.messageId || json.key?.id || json.message?.id || null) : null;
  const resumo = (body || '').substring(0, 300);

  // CAPPING DE QUOTA — soft-block: NÃO conta tentativa, espera a quota liberar.
  // Padrões: HTTP 429 (rate limit) ou HTTP 500 com new_chat_message_capping no corpo.
  // EXCEÇÃO: quando available=true (quota disponível mas cycle_end corrompido — bug UAZAPI),
  // trata como falha retryable, NÃO capping — evita armar disjuntor em falso positivo.
  if (httpStatus === 429 || (httpStatus === 500 && /new_chat_message_capping/i.test(body || ''))) {
    const cappingAvailable = /"available"\s*:\s*true/.test(body || '');
    if (cappingAvailable && httpStatus === 500) {
      // Bug UAZAPI: quota disponível mas cycle_end epoch zero — não é capping real
      return { resultado: 'falha', message_id: null, erro: `bug_uazapi_cycle_end_corrompido HTTP ${httpStatus}: ${resumo.substring(0, 150)}`, resposta_resumo: resumo };
    }
    return { resultado: 'capping', message_id: null, erro: `quota_capping HTTP ${httpStatus}: ${resumo.substring(0, 150)}`, resposta_resumo: resumo };
  }

  // Detecção de erro TERMINAL só quando a resposta é de fato uma rejeição.
  // Nunca sobre corpo de sucesso: a UAZAPI ecoa o texto da mensagem enviada e
  // frases legítimas (ex: "nome completo e o WhatsApp") casavam com os padrões.
  if ((httpStatus !== 200 || corpoComErro) && PADROES_TERMINAIS.test(body || '')) {
    return { resultado: 'falha_terminal', message_id: null, erro: `erro_terminal HTTP ${httpStatus}: ${resumo.substring(0, 150)}`, resposta_resumo: resumo };
  }
  if (httpStatus === 200 && !corpoComErro && messageId && String(messageId).trim() !== '') {
    return { resultado: 'aceito', message_id: String(messageId), erro: null, resposta_resumo: resumo };
  }
  if (httpStatus === 200 && !corpoComErro) {
    return { resultado: 'incerto', message_id: null, erro: 'HTTP 200 sem messageid — resposta ambígua, sem prova de aceite', resposta_resumo: resumo };
  }
  return { resultado: 'falha', message_id: null, erro: `HTTP ${httpStatus}: ${resumo.substring(0, 150)}`, resposta_resumo: resumo };
}

// Chamada única à UAZAPI. Exceção/timeout APÓS iniciar = 'incerto' (nunca retry cego).
async function chamarUAZAPI(phone: string, message: string, imageUrl?: string) {
  const token = config('UAZAPI_TOKEN');
  if (!token) throw new Error('UAZAPI_TOKEN não configurado');
  const baseUrl = (config('UAZAPI_BASE') || '__UAZAPI_API__').replace(/\/+$/, '');
  // Destino de GRUPO (@g.us): o JID canônico vai íntegro — nunca normalizado como telefone.
  const phoneSanitized = String(phone || '').includes('@g.us') ? String(phone).trim() : normalizePhone(phone);

  try {
    if (imageUrl) {

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_CHAMADA_MS);
      let resp: any;
      try {
        resp = await fetch(`${baseUrl}/send/media`, {
          method: 'POST',
          headers: { 'token': token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ number: phoneSanitized, phone: phoneSanitized, type: 'image',
            file: imageUrl, caption: message || '', text: message || '' }),
          signal: controller.signal,
        });
      } finally { clearTimeout(timer); }
      const body = await resp.text();
      return { ...interpretarResposta(resp.status, body), http_status: resp.status };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_CHAMADA_MS);
    let resp: Response;
    try {
      resp = await fetch(`${baseUrl}/send/text`, {
        method: 'POST',
        headers: { 'token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: phoneSanitized, phone: phoneSanitized, message, text: message }),
        signal: controller.signal,
      });
    } finally { clearTimeout(timer); }
    const body = await resp.text();
    return { ...interpretarResposta(resp.status, body), http_status: resp.status };
  } catch (e) {
    // A chamada foi INICIADA — não há como saber se a UAZAPI processou. Ambíguo.
    return { resultado: 'incerto', message_id: null, http_status: 0,
      erro: `excecao_ou_timeout_apos_chamada: ${e.message}`, resposta_resumo: '' };
  }
}

async function encerrarReguaInline(base44: any, cpfNorm: string, telNorm: string, automacoes: string[], origem: string) {
  const participante_id = cpfNorm || telNorm;
  for (const aut of automacoes) {
    for (const st of ['pendente', 'bloqueado']) {
      const itens = await base44.asServiceRole.entities.M31AutomacaoLog.filter(
        { participante_id, automacao: aut, status: st });
      for (const p of itens) {
        await base44.asServiceRole.entities.M31AutomacaoLog.update(p.id, {
          status: 'cancelado', motivo_cancelamento: `regua_encerrada_por:${origem}` });
      }
    }
    const lockKey = `${aut}:${cpfNorm || telNorm}`;
    await base44.asServiceRole.entities.M31AutomacaoLock.updateMany(
      { chave: lockKey, ativo: true }, { $set: { ativo: false } }).catch(() => {});
  }
}

async function atualizarLogGovernanca(base44: any, item: any, novoStatus: string, motivo: string | null, drenoId: string) {
  const fimIso = new Date().toISOString();
  const logPend = await base44.asServiceRole.entities.M31AutomacaoLog.filter(
    { execution_id: item.execution_id, status: 'pendente' }, '-enviado_em', 1);
  if (logPend.length > 0) {
    await base44.asServiceRole.entities.M31AutomacaoLog.update(logPend[0].id, {
      status: novoStatus, enviado_em: fimIso, motivo_bloqueio: motivo,
    });
  } else if (novoStatus === 'enviado') {
    await base44.asServiceRole.entities.M31AutomacaoLog.create({
      participante_id: item.participante_id || item.telefone,
      inscricao_principal: item.inscricao_id || null,
      cpf: item.cpf || null, telefone: item.telefone, email: item.email || null,
      automacao: item.automacao, template: item.template || null, versao: item.versao || 'V1',
      status: 'enviado', enviado_em: fimIso,
      execution_id: item.execution_id || drenoId,
      origem: `m31DrenarFila<${item.origem || 'unknown'}`,
      idempotency_key: item.dedup_key,
    });
  }
}

async function registrarDLQ(base44: any, item: any, erro: string) {
  if (!item.inscricao_id) return; // DLQ exige inscricao_id
  await base44.asServiceRole.entities.M31DeadLetterQueue.create({
    inscricao_id: item.inscricao_id, inscricao_nome: item.inscricao_nome || null,
    cpf: item.cpf || null, telefone: item.telefone,
    etapa: 'automacao', erro, tentativas: (item.tentativas || 0) + 1,
    origem: `m31DrenarFila<${item.origem || 'unknown'}`,
    dados_extras: JSON.stringify({ fila_id: item.id, dedup_key: item.dedup_key, automacao: item.automacao }),
  }).catch(() => {});
}

/**
 * Registra o desfecho do envio na timeline da inscrição (message_id, horário, status, erro).
 * Linha de observabilidade ponta-a-ponta: do webhook Asaas → fila → envio UAZAPI.
 */
async function registrarTimelineFila(base44: any, item: any, evento: string, status: string, detalhe: string) {
  if (!item.inscricao_id) return;
  try {
    await base44.asServiceRole.entities.M31InscricaoTimeline.create({
      inscricao_id: item.inscricao_id,
      cpf: item.cpf || null,
      evento, etapa: 'drenar_fila', status,
      detalhe: (detalhe || '').substring(0, 500),
      origem: `m31DrenarFila<${item.automacao || 'unknown'}`,
    });
  } catch {}
}

/**
 * REVALIDAÇÃO COMPLETA DA GOVERNANÇA imediatamente antes do envio.
 * O item pode ter ficado horas parado — as condições do enfileiramento podem ter mudado.
 * Retorna: { ok } | { ok:false, acao:'cancelar'|'reagendar', motivo, agendado_para? }
 */
async function revalidarGovernanca(base44: any, item: any) {
  const agora = new Date();

  // 0. REGRA 3 (protocolo 72h): JANELA COMERCIAL 08-22h Recife para TODAS as automações.
  //    Fora dela, nenhum envio — reagenda para a próxima abertura da janela.
  //    EXCEÇÃO: itens com forcar_envio=true (exceção explícita do gestor) ignoram a janela.
  {
  const recife = new Date(Date.now() - 3 * 3600000);
  const h = recife.getUTCHours();
  if (!item.forcar_envio && (h < 8 || h >= 22)) {
    const prox = new Date(recife);
    if (h >= 22) prox.setUTCDate(prox.getUTCDate() + 1);
    prox.setUTCHours(8, 0, 0, 0);
    const agendadoUtc = new Date(prox.getTime() + 3 * 3600000).toISOString();
    return { ok: false, acao: 'reagendar', motivo: 'fora_janela_08_22', agendado_para: agendadoUtc };
  }
  }

  // 1. Idempotência / envio posterior: alguém já enviou esta automação para esta pessoa
  const jaEnviado = await base44.asServiceRole.entities.M31AutomacaoLog.filter(
    { idempotency_key: item.dedup_key, status: 'enviado' }, '-enviado_em', 1);
  if (jaEnviado.length > 0) return { ok: false, acao: 'cancelar', motivo: 'idempotency_violation_no_dreno' };

  // 2. Telefone bloqueado por falha terminal (outro item)
  const terminais = await base44.asServiceRole.entities.M31FilaMensagem.filter(
    { telefone: item.telefone, status: 'falha_terminal' }, '-created_date', 1);
  if (terminais.length > 0 && terminais[0].id !== item.id) {
    return { ok: false, acao: 'cancelar', motivo: 'telefone_bloqueado_falha_terminal' };
  }

  // 3. Inscrição cancelada / opt-out (elegibilidade atual)
  if (item.inscricao_id) {
    const inscs = await base44.asServiceRole.entities.EventoM31Inscricao.filter({ id: item.inscricao_id });
    if (inscs.length > 0) {
      if (inscs[0].status_pagamento === 'cancelado') return { ok: false, acao: 'cancelar', motivo: 'inscricao_cancelada' };
      if (inscs[0].opt_out === true) return { ok: false, acao: 'cancelar', motivo: 'opt_out' };
    }
  }

  const participante_id = item.participante_id || item.telefone;

  // 4. Cooldown por automação (SUPORTE: isento — conversa de atendimento com validação humana)
  const cooldownH = (item.automacao === 'SUPORTE' || item.automacao === 'CARTINHA_COPIA') ? 0 : (COOLDOWNS_H[item.automacao] || 24);
  const cooldownCorte = new Date(Date.now() - cooldownH * 3600000).toISOString();
  const recentes = await base44.asServiceRole.entities.M31AutomacaoLog.filter(
    { participante_id, automacao: item.automacao, status: 'enviado' }, '-enviado_em', 1);
  if (recentes.length > 0 && recentes[0].enviado_em && recentes[0].enviado_em >= cooldownCorte) {
    const ate = new Date(new Date(recentes[0].enviado_em).getTime() + cooldownH * 3600000).toISOString();
    return { ok: false, acao: 'reagendar', motivo: 'cooldown_ativo', agendado_para: ate };
  }

  // 5. Limite diário por pessoa (SUPORTE isento — atendimento humano-no-loop)
  if (item.automacao !== 'SUPORTE' && item.automacao !== 'CARTINHA_COPIA') {
    const corte24h = new Date(Date.now() - 24 * 3600000).toISOString();
    const logs24h = await base44.asServiceRole.entities.M31AutomacaoLog.filter(
      { participante_id, status: 'enviado' }, '-enviado_em', 10);
    const enviadosHoje = logs24h.filter((l: any) => l.enviado_em && l.enviado_em >= corte24h).length;
    if (enviadosHoje >= LIMITE_DIARIO_PESSOA) {
      return { ok: false, acao: 'reagendar', motivo: 'limite_diario_excedido',
        agendado_para: new Date(Date.now() + 6 * 3600000).toISOString() };
    }
  }

  // 6. Prioridade: automação mais prioritária com lock ativo para a mesma pessoa
  const minhaPrio = PRIORIDADES[item.automacao] || 99;
  const pessoa = item.cpf || item.telefone;
  for (const [aut, prio] of Object.entries(PRIORIDADES)) {
    if (prio >= minhaPrio || aut === item.automacao) continue;
    const locks = await base44.asServiceRole.entities.M31AutomacaoLock.filter(
      { chave: `${aut}:${pessoa}`, ativo: true });
    if (locks.some((l: any) => l.expira_em && new Date(l.expira_em) > agora)) {
      return { ok: false, acao: 'reagendar', motivo: `automacao_maior_prioridade_em_andamento:${aut}`,
        agendado_para: new Date(Date.now() + 10 * 60 * 1000).toISOString() };
    }
  }

  return { ok: true };
}

// ═══ AUTO-RECOVERY: reinicia instância UAZAPI quando cycle_end está corrompido ═══
// O bug: UAZAPI retorna HTTP 500 com new_chat_message_capping.available=true mas
// cycle_end=epoch_zero. O restart (logout+restart) limpa o estado temporariamente.
// Cooldown de 5 min evita restart spam em múltiplas execuções do drenador.
const AUTO_RESTART_LOCK = 'UAZAPI:AUTO_RESTART';
const AUTO_RESTART_COOLDOWN_MS = 3 * 60 * 1000;

async function reiniciarUazapiAuto(base44: any): Promise<boolean> {
  try {
    // 1. Verificar cooldown — não reiniciar se já reiniciou há menos de 5 min
    const locks = await base44.asServiceRole.entities.M31AutomacaoLock.filter({
      chave: AUTO_RESTART_LOCK, ativo: true
    });
    const now = new Date();
    const activeLock = locks.find((l: any) => l.expira_em && new Date(l.expira_em) > now);
    if (activeLock) {
      logger.log('[DrenarFila] Auto-restart em cooldown, pulando');
      return false;
    }

    // 2. Adquirir lock de cooldown
    await base44.asServiceRole.entities.M31AutomacaoLock.updateMany(
      { chave: AUTO_RESTART_LOCK, ativo: true },
      { $set: { ativo: false } }
    ).catch(() => {});
    await base44.asServiceRole.entities.M31AutomacaoLock.create({
      chave: AUTO_RESTART_LOCK, ativo: true,
      execution_id: crypto.randomUUID(),
      criado_em: now.toISOString(),
      expira_em: new Date(now.getTime() + AUTO_RESTART_COOLDOWN_MS).toISOString(),
    }).catch(() => {});

    logger.log('[DrenarFila] Auto-restart UAZAPI iniciado — cycle_end corrompido detectado');
    const token = config('UAZAPI_TOKEN');
    const baseUrl = (config('UAZAPI_BASE') || '__UAZAPI_API__').replace(/\/+$/, '');
    const headers = { 'token': token, 'Content-Type': 'application/json' };

    // 3. LOGOUT — desconecta sessão WhatsApp (limpa estado interno do Baileys)
    try {
      await fetch(`${baseUrl}/instance/logout`, {
        method: 'POST', headers,
        body: JSON.stringify({ instance: '[Alter] M31' }),
      });
    } catch {}
    await new Promise(r => setTimeout(r, 3000));

    // 4. RESTART — reinicia processo da instância no servidor UAZAPI
    try {
      await fetch(`${baseUrl}/instance/restart`, {
        method: 'POST', headers,
        body: JSON.stringify({ instance: '[Alter] M31' }),
      });
    } catch {}
    await new Promise(r => setTimeout(r, 5000));

    logger.log('[DrenarFila] Auto-restart UAZAPI concluído — retentando envio');
    return true;
  } catch (e) {
    logger.error('[DrenarFila] Erro no auto-restart UAZAPI:', e.message);
    return false;
  }
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Admin (execução manual) ou automação agendada (sem usuário autenticado)
    try {
      const user = await base44.auth.me();
      if (user && user.role !== 'admin') {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    } catch { /* automação agendada — prosseguir */ }

    // Limite opcional de itens por execução (sonda manual controlada)
    let maxItens: number | null = null;
    let liberarRecuperacao = false;
    let liberarCampanhaCamisas = false;
    try {
      const body = await req.json();
      if (body && Number.isInteger(body.max_itens) && body.max_itens > 0) maxItens = body.max_itens;
      // FREIO ANTI-MASSA: recuperação em lote só drena com liberação EXPLÍCITA do gestor.
      if (body && body.liberar_recuperacao === true) liberarRecuperacao = true;
      // Campanha comercial autorizada pelo gestor: pode ultrapassar o hard cap diário,
      // mas NÃO altera teto/minuto, delay humanizado, single-flight, kill-switch ou rechecks.
      if (body && body.liberar_campanha_camisas === true) liberarCampanhaCamisas = true;
    } catch { /* sem body — sem limite */ }

    const agora = new Date();
    const agoraIso = agora.toISOString();
    const drenoId = crypto.randomUUID();

    // ═══ 1. SINGLE-FLIGHT ATÔMICO: singleton pré-criado, transição inativo→ativo ═══
    const singleton = await base44.asServiceRole.entities.M31AutomacaoLock.filter({ chave: LOCK_CHAVE });
    if (singleton.length === 0) {
      return Response.json({ error: 'singleton_ausente', detalhe: `Registro de controle ${LOCK_CHAVE} não existe. Execute o bootstrap.` }, { status: 500 });
    }
    if (singleton.length > 1) {
      return Response.json({ error: 'singleton_duplicado', detalhe: `${singleton.length} registros para ${LOCK_CHAVE} — corrigir antes de drenar (deve existir exatamente 1).` }, { status: 500 });
    }

    const novoExpira = new Date(Date.now() + LOCK_TTL_MS).toISOString();
    // Tentativa A: lock livre (ativo:false) → ativo:true
    let aquisicao = await base44.asServiceRole.entities.M31AutomacaoLock.updateMany(
      { chave: LOCK_CHAVE, ativo: false },
      { $set: { ativo: true, execution_id: drenoId, criado_em: agoraIso, expira_em: novoExpira } }
    );
    let adquirido = mc(aquisicao) === 1;
    // Tentativa B: takeover de lock EXPIRADO (condição atômica no expira_em)
    if (!adquirido) {
      aquisicao = await base44.asServiceRole.entities.M31AutomacaoLock.updateMany(
        { chave: LOCK_CHAVE, ativo: true, expira_em: { $lt: agoraIso } },
        { $set: { execution_id: drenoId, criado_em: agoraIso, expira_em: novoExpira } }
      );
      adquirido = mc(aquisicao) === 1;
    }
    if (!adquirido) {
      return Response.json({ processados: 0, motivo: 'drenagem_ja_em_andamento' });
    }

    const resultado = { enviados: 0, falhas: 0, terminais: 0, incertos: 0, cancelados: 0, reagendados: 0, recuperados: 0, chamadas_realizadas: 0, detalhes: [] as any[] };

    try {
      // ═══ 2. RECUPERAÇÃO DE CLAIMS EXPIRADOS (Regra 0.3) ═══
      const presos = await base44.asServiceRole.entities.M31FilaMensagem.filter(
        { status: 'processando' }, 'created_date', 50);
      for (const p of presos) {
        if (!p.claim_expira_em || p.claim_expira_em >= agoraIso) continue; // claim ainda vivo
        const chamadaIniciadaNoClaim = p.ultima_chamada_iniciada_em && p.claim_em &&
          p.ultima_chamada_iniciada_em >= p.claim_em;
        if (chamadaIniciadaNoClaim) {
          // Chamada iniciada sem desfecho registrado → ambíguo. NÃO volta para a fila.
          await base44.asServiceRole.entities.M31FilaMensagem.update(p.id, {
            status: 'incerto', processado_em: agoraIso,
            erro: 'claim_expirado_com_chamada_iniciada — sem prova de envio nem de falha. Revisão manual.',
          });
          await registrarDLQ(base44, p, 'claim expirado com chamada UAZAPI iniciada e sem desfecho — resultado incerto');
          resultado.incertos++;
        } else {
          // Nenhuma chamada iniciada sob o claim → seguro voltar para pendente (progresso preservado)
          await base44.asServiceRole.entities.M31FilaMensagem.update(p.id, {
            status: 'pendente', claim_id: null, claim_em: null, claim_expira_em: null,
          });
          resultado.recuperados++;
        }
      }

      // ═══ REGRA 4 (protocolo 72h): CIRCUIT BREAKER — capping recente → pausa total ═══
      const breakers = await base44.asServiceRole.entities.M31AutomacaoLock.filter({ chave: BREAKER_CHAVE, ativo: true });
      const breakerVivo = breakers.find((b: any) => b.expira_em && b.expira_em > agoraIso);
      if (breakerVivo) {
        return Response.json({ processados: 0, motivo: 'circuit_breaker_capping_ativo', retomada_apos: breakerVivo.expira_em });
      }

      // ═══ REGRA 3 (protocolo 72h): HARD CAP + KILL-SWITCH + MODO RETOMADA ═══
      const hoje = hojeRecife();
      const controls = await base44.asServiceRole.entities.M31WhatsAppControl.filter({ data: hoje });
      // AUSÊNCIA do controle = BLOQUEADO (fail-closed). Não criar automaticamente.
      if (!controls || controls.length === 0) {
        return Response.json({ processados: 0, motivo: 'controle_ausente_fail_closed',
          detalhe: 'M31WhatsAppControl não encontrado para hoje. Crie o registro do dia antes de drenar.' });
      }
      const control = controls[0];

      // KILL-SWITCH GLOBAL MANUAL — freio de emergência humano.
      if (control.bloqueado === true) {
        return Response.json({
          processados: 0,
          motivo: 'kill_switch_global_ativo',
          bloqueado_em: control.bloqueado_em || null,
          detalhe: 'Kill-switch manual ATIVO. Nenhum disparo será feito até bloqueado=false.',
        });
      }

      // MODO RETOMADA: durante reconexão pós-bloqueio, usa limites reduzidos.
      const modoRetomada = control.modo_retomada === true;
      const hardCapEfetivo = modoRetomada ? (control.limite_diario_retomada || 5) : (liberarCampanhaCamisas ? Number.MAX_SAFE_INTEGER : HARD_CAP_DIARIO);
      // Campanha de camisas autorizada: pequena sequência por execução, mantendo
      // rigorosamente o delay humanizado de 60–120s entre CADA chamada UAZAPI.
      // Demais automações continuam em 1 chamada por execução.
      const maxPorExecucao = modoRetomada
        ? (control.limite_por_execucao || 1)
        : (liberarCampanhaCamisas ? 3 : MAX_CHAMADAS_POR_EXECUCAO);

      let enviadosHoje = control.mensagens_enviadas_hoje || 0;
      if (enviadosHoje >= hardCapEfetivo) {
        return Response.json({ processados: 0, motivo: 'hard_cap_diario_atingido',
          enviados_hoje: enviadosHoje, limite: hardCapEfetivo, modo_retomada: modoRetomada });
      }

      // ═══ 3. TETO GLOBAL POR CHAMADA — contagem cross-run do último minuto ═══
      const corte60s = new Date(Date.now() - 60000).toISOString();
      let chamadasUltimoMin = 0;
      try {
        const recentes = await base44.asServiceRole.entities.M31FilaMensagem.filter(
          { ultima_chamada_iniciada_em: { $gte: corte60s } }, '-ultima_chamada_iniciada_em', 30);
        for (const r of recentes) {
          chamadasUltimoMin += (r.resultados_mensagens || []).filter((m: any) => m.em && m.em >= corte60s).length;
        }
      } catch (e) {
        logger.warn('[DrenarFila] Contagem cross-run indisponível, assumindo 0 (single-flight cobre):', e.message);
      }
      if (chamadasUltimoMin >= TETO_CHAMADAS_POR_MINUTO) {
        return Response.json({ processados: 0, motivo: 'teto_por_minuto_atingido', chamadas_ultimo_minuto: chamadasUltimoMin });
      }

      let budget = maxPorExecucao;
      let lastCallAt = chamadasUltimoMin > 0 ? Date.now() : 0; // houve chamada recente → espaçar antes da primeira

      // ═══ 4. SELECIONAR ELEGÍVEIS ═══
      const pendentes = await base44.asServiceRole.entities.M31FilaMensagem.filter(
        { status: 'pendente' }, 'prioridade', 200);
      let elegiveis = pendentes
        // TRAVA DE APROVAÇÃO MANUAL: NENHUM item é enviado sem aprovado_para_envio=true
        // (aprovação explícita do gestor no painel de filas). Vale para TODAS as automações.
        .filter((i: any) => i.aprovado_para_envio === true)
        // MODO RETOMADA: confirmações transacionais e suporte, além de links liberados.
        .filter((i: any) => !modoRetomada || i.automacao === 'SUPORTE' || i.automacao === 'CONFIRMACAO_COM_QR' || i.automacao === 'CONFIRMACAO_PRESENTEADA' || i.automacao === 'LINK_DE_PAGAMENTO')
        // FREIO ANTI-MASSA (diretriz do gestor): a fileira de recuperação em lote
        // (LINK_DE_PAGAMENTO / RECUPERACAO_CHECKOUT) NÃO drena por padrão — disparar
        // dezenas dessas em sequência é o padrão que bloqueia o WhatsApp.
        // Fica estacionada até liberação explícita (liberar_recuperacao: true).
        // Pedidos do gestor (prioridade 1) e confirmações de pagamento seguem normais
        // e passam NA FRENTE — nunca empurram a massa.
        .filter((i: any) => liberarRecuperacao || (i.automacao !== 'LINK_DE_PAGAMENTO' && i.automacao !== 'RECUPERACAO_CHECKOUT'))
        .filter((i: any) => !i.agendado_para || i.agendado_para <= agoraIso)
        .sort((a: any, b: any) => ((a.prioridade ?? 5) - (b.prioridade ?? 5)) || (a.created_date < b.created_date ? -1 : 1));

      // ═══ 4a. CLASSES PARALELAS: transacional > follow-up > comercial, sem starvation ═══
      // Prioridade define frequência/slot, NÃO exclusividade. Padrão:
      // T → F → T → C → T → F ... Se uma classe estiver vazia, as demais avançam.
      if (!modoRetomada) {
        const TRANSACIONAIS = new Set([
          'CONFIRMACAO_COM_QR','CONFIRMACAO_TEXTO','CONFIRMACAO_VOLUNTARIA',
          'CONFIRMACAO_CARAVANA','CONFIRMACAO_CAMISA','OBRIGADO_COMPRA_CAMISA','CONFIRMACAO_PRESENTEADA',
          'QR_CODE','BOAS_VINDAS'
        ]);
        const COMERCIAIS = new Set(['CAMPANHA_CAMISAS']);
        const classe = (i: any) => COMERCIAIS.has(i.automacao) ? 'C' : TRANSACIONAIS.has(i.automacao) ? 'T' : 'F';
        const filas: Record<string, any[]> = { T: [], F: [], C: [] };
        for (const i of elegiveis) filas[classe(i)].push(i);
        const padrao = ['T','F','T','C','T','F'];
        const intercalados: any[] = [];
        let cursor = 0;
        while (filas.T.length || filas.F.length || filas.C.length) {
          const desejada = padrao[cursor++ % padrao.length];
          let item = filas[desejada].shift();
          if (!item) item = filas.T.shift() || filas.F.shift() || filas.C.shift();
          if (item) intercalados.push(item);
        }
        elegiveis = intercalados;
      }

      // ═══ 4b. FILAS PARALELAS (modo retomada): alternância + limite por fila (15 cada) ═══
      if (modoRetomada) {
        const LIMITE_POR_FILA = 15;
        const linksEnviadosHoje = control.cobrancas_enviadas || 0;
        const confirmacoesEnviadasHoje = control.boas_vindas_enviadas || 0;
        const links = elegiveis.filter((i: any) => i.automacao === 'LINK_DE_PAGAMENTO' && linksEnviadosHoje < LIMITE_POR_FILA);
        const confirmacoes = elegiveis.filter((i: any) => (i.automacao === 'CONFIRMACAO_COM_QR' || i.automacao === 'CONFIRMACAO_PRESENTEADA') && confirmacoesEnviadasHoje < LIMITE_POR_FILA);
        // Alternância: consulta último tipo enviado para inverter a fila
        let ultimoTipo: string | null = null;
        try {
          const ultimos = await base44.asServiceRole.entities.M31FilaMensagem.filter(
            { status: 'enviado' }, '-processado_em', 1);
          ultimoTipo = ultimos[0]?.automacao || null;
        } catch {}
        if (ultimoTipo === 'LINK_DE_PAGAMENTO' && confirmacoes.length > 0) {
          elegiveis = confirmacoes;
        } else if (ultimoTipo === 'CONFIRMACAO_COM_QR' && links.length > 0) {
          elegiveis = links;
        } else if (links.length > 0) {
          elegiveis = links;
        } else {
          elegiveis = confirmacoes;
        }
      }

      // ═══ 5. DRENAR ═══
      let itensProcessados = 0;
      for (const candidato of elegiveis) {
      if (budget <= 0 || enviadosHoje >= hardCapEfetivo) break;
      if (maxItens !== null && itensProcessados >= maxItens) break;
        itensProcessados++;

        // CLAIM ATÔMICO: pendente → processando, só prossegue com updated=1
        const claimEm = new Date().toISOString();
        const claimRes = await base44.asServiceRole.entities.M31FilaMensagem.updateMany(
          { id: candidato.id, status: 'pendente' },
          { $set: { status: 'processando', claim_id: drenoId, claim_em: claimEm,
            claim_expira_em: new Date(Date.now() + CLAIM_TTL_MS).toISOString() } }
        );
        if (mc(claimRes) !== 1) {
          resultado.detalhes.push({ fila_id: candidato.id, resultado: 'claim_perdido' });
          continue;
        }
        const item = { ...candidato }; // dados do candidato + claim recém-obtido

        // ── CAMPANHA_CAMISAS: revalidação comercial imediatamente antes da UAZAPI ──
        if (item.automacao === 'CAMPANHA_CAMISAS') {
          const tel = normalizePhone(item.telefone);
          // O grupo oficial já ultrapassa 500 registros. Buscar em páginas para não
          // gerar falso negativo nos membros que estiverem após a primeira página.
          const grupo: any[] = [];
          for (let skip = 0; ; skip += 500) {
            const pagina = await base44.asServiceRole.entities.M31GrupoMembro.filter(
              { group_jid: '120363423189586769@g.us', status: 'ativa' }, '-ultima_deteccao', 500, skip
            );
            grupo.push(...pagina);
            if (pagina.length < 500) break;
          }
          const noGrupo = grupo.some((m: any) => normalizePhone(m.phone) === tel || (normalizePhone(m.phone).length === 12 && `${normalizePhone(m.phone).slice(0,4)}9${normalizePhone(m.phone).slice(4)}` === tel));
          const compras = await base44.asServiceRole.entities.EventoM31CamisaPedido.filter({ status_pagamento: 'pago' }, '-created_date', 500);
          const jaComprou = compras.some((p: any) => normalizePhone(p.whatsapp) === tel);
          const opts = await base44.asServiceRole.entities.EventoM31Inscricao.filter({ whatsapp: tel, opt_out: true }, '-created_date', 1);
          const admins = await base44.asServiceRole.entities.EventoM31Membro.filter({ ativo: true }, '-created_date', 100);
          const ehAdmin = admins.some((m: any) => normalizePhone(m.whatsapp) === tel);
          const vols = await base44.asServiceRole.entities.EventoM31Inscricao.filter({ tipo: 'voluntario' }, '-created_date', 500);
          const ehVol = vols.some((v: any) => normalizePhone(v.whatsapp) === tel);
          if (!noGrupo || jaComprou || opts.length > 0 || ehAdmin || ehVol) {
            const motivo = !noGrupo ? 'nao_esta_mais_no_grupo' : jaComprou ? 'comprou_camisa_antes_do_envio' : opts.length ? 'opt_out' : ehAdmin ? 'admin_equipe' : 'voluntaria';
            await base44.asServiceRole.entities.M31FilaMensagem.update(item.id, { status: 'cancelado', erro: motivo, processado_em: new Date().toISOString() });
            resultado.cancelados++;
            resultado.detalhes.push({ fila_id: item.id, resultado: 'cancelado', motivo });
            continue;
          }
        }

        // ── LINK_DE_PAGAMENTO: re-check Asaas antes de enviar (fail-closed) ──
        if (item.automacao === 'LINK_DE_PAGAMENTO' && item.inscricao_id) {
          try {
            const inscs = await base44.asServiceRole.entities.EventoM31Inscricao.filter({ id: item.inscricao_id });
            if (inscs.length > 0) {
              const ins = inscs[0];
              let jaPago = ['aprovado', 'gratuito'].includes(ins.status_pagamento);
              if (!jaPago && ins.asaas_payment_id) {
                const ASAAS_KEY = config('ASAAS_API_KEY');
                const payResp = await fetch(`__ASAAS_API__/payments/${ins.asaas_payment_id}`, {
                  headers: { 'access_token': ASAAS_KEY }
                });
                const payment = await payResp.json();
                if (['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'DUNNING_RECEIVED'].includes(payment.status)) {
                  jaPago = true;
                }
              }
              if (jaPago) {
                await base44.asServiceRole.entities.M31FilaMensagem.update(item.id, {
                  status: 'cancelado', erro: 'pagamento_ja_confirmado_asaas',
                  processado_em: new Date().toISOString(),
                });
                resultado.cancelados++;
                resultado.detalhes.push({ fila_id: item.id, resultado: 'cancelado', motivo: 'pagamento_ja_confirmado_asaas' });
                continue;
              }
            }
          } catch (e) {
            await base44.asServiceRole.entities.M31FilaMensagem.update(item.id, {
              status: 'pendente', claim_id: null, claim_em: null, claim_expira_em: null,
              erro: `erro_consulta_asaas_fail_closed: ${e.message}`,
            });
            resultado.reagendados++;
            continue;
          }
        }

        // ── LINK_DE_PAGAMENTO: re-check grupo de inscritas (fail-closed) ──
        if (item.automacao === 'LINK_DE_PAGAMENTO') {
          try {
            const telNorm = normalizePhone(item.telefone);
            let telAlt = telNorm;
            if (telNorm.length === 13 && telNorm.startsWith('55')) {
              telAlt = telNorm.slice(0, 4) + telNorm.slice(5);
            }
            const membros = await base44.asServiceRole.entities.M31GrupoMembro.filter({
              phone: { $in: [telNorm, telAlt] },
              status: 'ativa'
            });
            if (membros.length > 0) {
              await base44.asServiceRole.entities.M31FilaMensagem.update(item.id, {
                status: 'cancelado', erro: 'telefone_ja_no_grupo_inscritas',
                processado_em: new Date().toISOString(),
              });
              resultado.cancelados++;
              resultado.detalhes.push({ fila_id: item.id, resultado: 'cancelado', motivo: 'telefone_ja_no_grupo_inscritas' });
              continue;
            }
          } catch (e) {
            await base44.asServiceRole.entities.M31FilaMensagem.update(item.id, {
              status: 'pendente', claim_id: null, claim_em: null, claim_expira_em: null,
              erro: `erro_consulta_grupo_fail_closed: ${e.message}`,
            });
            resultado.reagendados++;
            continue;
          }
        }

        // ── CONFIRMACAO_COM_QR: re-check do grupo imediatamente antes do envio ──
        // Se a participante já está no grupo oficial, usa SOMENTE a mensagem já
        // aprovada para esse caso (lembrete_qr_ja_no_grupo), sem convite do grupo.
        // Isso também corrige itens antigos que entraram na fila antes do snapshot.
        if (item.automacao === 'CONFIRMACAO_COM_QR' && item.inscricao_id && item.template !== 'lembrete_qr_ja_no_grupo') {
          try {
            const telNorm = normalizePhone(item.telefone);
            let telAlt = telNorm;
            if (telNorm.length === 13 && telNorm.startsWith('55')) telAlt = telNorm.slice(0, 4) + telNorm.slice(5);
            const membros = await base44.asServiceRole.entities.M31GrupoMembro.filter({
              phone: { $in: [telNorm, telAlt] }, status: 'ativa'
            });
            if (membros.length > 0) {
              const inscs = await base44.asServiceRole.entities.EventoM31Inscricao.filter({ id: item.inscricao_id });
              const ins = inscs?.[0];
              const tpl = await base44.asServiceRole.entities.M31MessageTemplate.filter(
                { chave_unica: 'lembrete_qr_ja_no_grupo', is_active: true }, '-updated_date', 1);
              if (!ins || !tpl?.[0]?.content) throw new Error('template_ja_no_grupo_ausente');
              const codigo = ins.codigo_inscricao || '';
              const qrUrl = ins.qrcode_url || ins.qrcode_token || item.mensagens?.[0]?.image_url || null;
              const mensagemAprovada = tpl[0].content
                .replace(/\{\{primeiro_nome\}\}/g, ins.nome?.split(' ')[0] || 'Querida')
                .replace(/\{\{codigo_inscricao\}\}/g, codigo);
              item.template = 'lembrete_qr_ja_no_grupo';
              item.mensagens = [{ message: mensagemAprovada, image_url: qrUrl }];
              await base44.asServiceRole.entities.M31FilaMensagem.update(item.id, {
                template: item.template, mensagens: item.mensagens,
                erro: null,
              });
              if (ins.entrou_no_grupo !== true) {
                await base44.asServiceRole.entities.EventoM31Inscricao.update(ins.id, {
                  entrou_no_grupo: true,
                  entrou_no_grupo_em: membros[0]?.primeira_deteccao || new Date().toISOString(),
                }).catch(() => {});
              }
            }
          } catch (e) {
            // Fail-closed: nunca envia template com convite se a checagem/correção falhou.
            await base44.asServiceRole.entities.M31FilaMensagem.update(item.id, {
              status: 'pendente', claim_id: null, claim_em: null, claim_expira_em: null,
              erro: `erro_recheck_grupo_confirmacao_fail_closed: ${e.message}`,
            });
            resultado.reagendados++;
            continue;
          }
        }

        // REVALIDAÇÃO COMPLETA DA GOVERNANÇA (o item pode ter ficado dias parado)
        const reval = await revalidarGovernanca(base44, item);
        if (!reval.ok) {
          if (reval.acao === 'reagendar') {
            await base44.asServiceRole.entities.M31FilaMensagem.update(item.id, {
              status: 'pendente', agendado_para: reval.agendado_para, erro: reval.motivo,
              claim_id: null, claim_em: null, claim_expira_em: null,
            });
            resultado.reagendados++;
          } else {
            await base44.asServiceRole.entities.M31FilaMensagem.update(item.id, {
              status: 'cancelado', erro: reval.motivo, processado_em: new Date().toISOString(),
            });
            await atualizarLogGovernanca(base44, item, 'bloqueado', reval.motivo, drenoId);
            resultado.cancelados++;
          }
          resultado.detalhes.push({ fila_id: item.id, resultado: reval.acao, motivo: reval.motivo });
          continue;
        }

        // CONFIRMAÇÃO: revalida presença no grupo oficial NO MOMENTO DO ENVIO.
        // A fila pode ter sido criada antes de a participante entrar no grupo.
        // Se já está no grupo, usa somente o template aprovado para essa situação
        // e nunca reenvia convite/link do grupo.
        if (item.automacao === 'CONFIRMACAO_COM_QR' && item.inscricao_id && item.template !== 'lembrete_qr_ja_no_grupo') {
          const S = base44.asServiceRole.entities;
          const inscricoes = await S.EventoM31Inscricao.filter({ id: item.inscricao_id }, '-updated_date', 1).catch(() => []);
          const insc = inscricoes?.[0];
          const tel = normalizePhone(item.telefone || insc?.whatsapp || '');
          const variantes = Array.from(new Set([tel, tel.replace(/^55/, ''), item.telefone].filter(Boolean)));
          const grupos = await S.M31GrupoConfig.filter({ finalidade: 'INSCRITAS_OFICIAL', ativo: true }).catch(() => []);
          const groupJid = grupos?.[0]?.chat_id || null;
          let membroAtivo: any = null;
          if (groupJid && variantes.length) {
            const membros = await S.M31GrupoMembro.filter({ group_jid: groupJid, phone: { $in: variantes }, status: 'ativa' }, '-ultima_deteccao', 5).catch(() => []);
            membroAtivo = membros?.[0] || null;
          }
          const jaNoGrupo = insc?.entrou_no_grupo === true || !!membroAtivo;
          if (jaNoGrupo) {
            const tpls = await S.M31MessageTemplate.filter({ chave_unica: 'lembrete_qr_ja_no_grupo', is_active: true }, '-updated_date', 1).catch(() => []);
            const tpl = tpls?.[0]?.content;
            if (!tpl) {
              await S.M31FilaMensagem.update(item.id, { status: 'cancelado', erro: 'template_ja_no_grupo_ausente_fail_closed', processado_em: new Date().toISOString() });
              resultado.cancelados++;
              resultado.detalhes.push({ fila_id: item.id, resultado: 'cancelado', motivo: 'template_ja_no_grupo_ausente_fail_closed' });
              continue;
            }
            const codigo = insc?.codigo_inscricao || '';
            const mensagemAprovada = tpl
              .replace(/\{\{primeiro_nome\}\}/g, insc?.nome?.split(' ')[0] || item.inscricao_nome?.split(' ')[0] || 'Querida')
              .replace(/\{\{codigo_inscricao\}\}/g, codigo);
            const imagemAtual = Array.isArray(item.mensagens) ? item.mensagens.find((m:any) => m?.image_url)?.image_url || null : null;
            item.template = 'lembrete_qr_ja_no_grupo';
            item.mensagens = [{ message: mensagemAprovada, image_url: imagemAtual }];
            await S.M31FilaMensagem.update(item.id, { template: item.template, mensagens: item.mensagens, erro: null });
          }
        }

        // ── RÉGUA DE FOLLOW-UP DO GRUPO: presença re-confirmada NO MOMENTO DO ENVIO ──
        // Se a pessoa entrou no grupo oficial entre a seleção e o disparo, a etapa
        // é CANCELADA sem envio (ordem da decisão A: no grupo = nunca mais follow-up).
        if (item.automacao === 'GRUPO_FOLLOWUP_1' || item.automacao === 'GRUPO_FOLLOWUP_2') {
          try {
            const cfgsGrupo = await base44.asServiceRole.entities.M31GrupoConfig.filter(
              { finalidade: 'INSCRITAS_OFICIAL', ativo: true }, '-updated_date', 5);
            const groupJidFu = cfgsGrupo?.[0]?.chat_id || null;
            if (groupJidFu) {
              const telNormFu = normalizePhone(item.telefone || '');
              let telAltFu = telNormFu;
              if (telNormFu.length === 13 && telNormFu.startsWith('55')) telAltFu = telNormFu.slice(0, 4) + telNormFu.slice(5);
              const membrosFu = await base44.asServiceRole.entities.M31GrupoMembro.filter(
                { group_jid: groupJidFu, phone: { $in: [telNormFu, telAltFu] }, status: 'ativa' },
                '-ultima_deteccao', 5);
              if ((membrosFu || []).length > 0) {
                await base44.asServiceRole.entities.M31FilaMensagem.update(item.id, {
                  status: 'cancelado', erro: 'entrou_no_grupo_antes_do_disparo',
                  processado_em: new Date().toISOString(),
                });
                resultado.cancelados++;
                resultado.detalhes.push({ fila_id: item.id, resultado: 'cancelado', motivo: 'entrou_no_grupo_antes_do_disparo' });
                continue;
              }
            }
          } catch (e) {
            // Falha na consulta do grupo = fail-closed: nunca dispara follow-up às cegas.
            await base44.asServiceRole.entities.M31FilaMensagem.update(item.id, {
              status: 'pendente', claim_id: null, claim_em: null, claim_expira_em: null,
              erro: `erro_recheck_grupo_followup_fail_closed: ${e.message}`,
            });
            resultado.reagendados++;
            continue;
          }
        }

        // ENVIO DA SEQUÊNCIA — retomando de proxima_mensagem_idx (nunca repete aceitas)
        const msgs = Array.isArray(item.mensagens) ? item.mensagens : [];
        const resultados = Array.isArray(item.resultados_mensagens) ? [...item.resultados_mensagens] : [];
        let idx = item.proxima_mensagem_idx || 0;
        let desfecho: string | null = null; // null = todas aceitas
        let ultimoErro: string | null = null;
        let reiniciado = false;

        while (idx < msgs.length) {
          // ═══ RECONSULTA POR CHAMADA: kill-switch revalidado imediatamente antes de cada disparo ═══
          // Se o gestor ativou o kill-switch entre o início da execução e aqui,
          // o drenador PARA imediatamente — nenhum disparo adicional.
          try {
            const ctrlFresh = await base44.asServiceRole.entities.M31WhatsAppControl.filter({ data: hojeRecife() });
            if (!ctrlFresh || ctrlFresh.length === 0 || ctrlFresh[0].bloqueado === true) {
              // Devolve item com progresso preservado
              await base44.asServiceRole.entities.M31FilaMensagem.update(item.id, {
                status: 'pendente', proxima_mensagem_idx: idx, resultados_mensagens: resultados,
                claim_id: null, claim_em: null, claim_expira_em: null,
              });
              return Response.json({ ...resultado, processados: resultado.enviados + resultado.falhas + resultado.terminais + resultado.incertos + resultado.cancelados + resultado.reagendados,
                motivo: 'kill_switch_ativado_durante_execucao' });
            }
          } catch (e) {
            // Erro de consulta = BLOQUEADO (fail-closed)
            await base44.asServiceRole.entities.M31FilaMensagem.update(item.id, {
              status: 'pendente', proxima_mensagem_idx: idx, resultados_mensagens: resultados,
              claim_id: null, claim_em: null, claim_expira_em: null,
            });
            return Response.json({ ...resultado, motivo: 'erro_consulta_controle_fail_closed', erro: e.message });
          }

          if (budget <= 0 || enviadosHoje >= hardCapEfetivo) {
            // Orçamento esgotado no meio do item: devolve com progresso preservado
            await base44.asServiceRole.entities.M31FilaMensagem.update(item.id, {
              status: 'pendente', proxima_mensagem_idx: idx, resultados_mensagens: resultados,
              claim_id: null, claim_em: null, claim_expira_em: null,
            });
            desfecho = 'orcamento_esgotado';
            break;
          }

          // ESPAÇAMENTO HUMANIZADO: delay aleatório antes de CADA chamada (reduzido para QR Codes)
          if (lastCallAt > 0) {
            const alvo = delayHumanizadoMs(item.automacao);
            const decorrido = Date.now() - lastCallAt;
            if (decorrido < alvo) {
              await new Promise(r => setTimeout(r, alvo - decorrido));
            }
          }

          // Marca de início ANTES da chamada (fecha a janela cinzenta)
          const inicioIso = new Date().toISOString();
          await base44.asServiceRole.entities.M31FilaMensagem.update(item.id, {
            ultima_chamada_iniciada_em: inicioIso, ultima_chamada_idx: idx,
          });

          let res = await chamarUAZAPI(item.telefone, msgs[idx]?.message || '', msgs[idx]?.image_url || undefined);
          lastCallAt = Date.now();
          budget--;
          resultado.chamadas_realizadas++;

          // AUTO-RECOVERY: cycle_end corrompido (bug UAZAPI) → reiniciar instância e reagendar
          // Não retenta na mesma execução (evita timeout). Próximo cron pega após reinício.
          if (res.resultado === 'falha' && res.erro && res.erro.includes('bug_uazapi_cycle_end_corrompido')) {
            // NÃO disparar auto-restart: gestor está gerenciando reinícios manualmente.
            // Registra a resposta CRUA para prova/auditoria (antes era descartada).
            await base44.asServiceRole.entities.M31FilaMensagem.update(item.id, {
              status: 'pendente',
              agendado_para: new Date(Date.now() + 3 * 60 * 1000).toISOString(),
              proxima_mensagem_idx: idx, resultados_mensagens: resultados,
              erro: 'cycle_end_persiste_restart_manual',
              uazapi_response: (res.resposta_resumo || '').substring(0, 500),
              tentativas: (item.tentativas || 0),
              claim_id: null, claim_em: null, claim_expira_em: null,
            });
            resultado.reagendados++;
            resultado.detalhes.push({ fila_id: item.id, telefone: item.telefone, resultado: 'cycle_end_persiste', raw: (res.resposta_resumo || '').substring(0, 200) });
            desfecho = 'cycle_end_reagendado'; // impede o pós-loop de marcar como 'enviado'
            break;
          }

          resultados.push({
            idx, resultado: res.resultado, message_id: res.message_id,
            http_status: res.http_status, erro: res.erro,
            resposta_resumo: (res.resposta_resumo || '').substring(0, 200), em: inicioIso,
          });

          if (res.resultado === 'aceito') {
            idx++;
            enviadosHoje++; // conta no hard cap diário (Regra 3)
            await base44.asServiceRole.entities.M31FilaMensagem.update(item.id, {
              proxima_mensagem_idx: idx, resultados_mensagens: resultados,
            });
            const updateControl: any = {
              mensagens_enviadas_hoje: enviadosHoje, ultimo_envio_em: new Date().toISOString(),
            };
            if (item.automacao === 'LINK_DE_PAGAMENTO') {
              updateControl.cobrancas_enviadas = (control.cobrancas_enviadas || 0) + 1;
              control.cobrancas_enviadas = updateControl.cobrancas_enviadas;
            } else if (item.automacao === 'CONFIRMACAO_COM_QR') {
              updateControl.boas_vindas_enviadas = (control.boas_vindas_enviadas || 0) + 1;
              control.boas_vindas_enviadas = updateControl.boas_vindas_enviadas;
            }
            await base44.asServiceRole.entities.M31WhatsAppControl.update(control.id, updateControl).catch(() => {});
            continue;
          }

          // CAPPING = REGRA 4 (protocolo 72h): DISJUNTOR — pausa TOTAL de 12h.
          // Forçar envios contra o bloqueio ativo agrava a penalidade da Meta.
          if (res.resultado === 'capping') {
            const breakerExpira = new Date(Date.now() + BREAKER_TTL_MS).toISOString();
            await base44.asServiceRole.entities.M31AutomacaoLock.updateMany(
              { chave: BREAKER_CHAVE, ativo: true }, { $set: { ativo: false } }).catch(() => {});
            await base44.asServiceRole.entities.M31AutomacaoLock.create({
              chave: BREAKER_CHAVE, ativo: true, execution_id: drenoId,
              criado_em: new Date().toISOString(), expira_em: breakerExpira,
            }).catch(() => {});
            await base44.asServiceRole.entities.M31FilaMensagem.update(item.id, {
              status: 'pendente',
              agendado_para: breakerExpira, // só volta quando o disjuntor liberar (+12h)
              // NÃO incrementa tentativas — quota não é falha real
              resultados_mensagens: resultados,
              claim_id: null, claim_em: null, claim_expira_em: null,
            });
            resultado.reagendados++;
            resultado.detalhes.push({ fila_id: item.id, telefone: item.telefone, resultado: 'capping_circuit_breaker_12h', erro: res.erro });
            // Disjuntor armado: NENHUM disparo nas próximas 12h.
            return Response.json({
              ...resultado,
              processados: resultado.enviados + resultado.falhas + resultado.terminais + resultado.incertos + resultado.cancelados + resultado.reagendados,
              motivo: 'quota_capping_detectado_execucao_interrompida',
              teto_chamadas_por_minuto: TETO_CHAMADAS_POR_MINUTO,
              timestamp: new Date().toISOString(),
            });
          }

          ultimoErro = res.erro;
          desfecho = res.resultado; // 'falha' | 'falha_terminal' | 'incerto'
          break;
        }

        if (reiniciado) continue; // reinício disparado — item reagendado, próximo item
        if (desfecho === 'cycle_end_reagendado') continue; // cycle_end já reagendou — pula pós-loop
        if (desfecho === 'orcamento_esgotado') break; // encerra a execução

        const fimIso = new Date().toISOString();
        const resumoRespostas = JSON.stringify(resultados.map(r => ({ idx: r.idx, r: r.resultado, id: r.message_id }))).substring(0, 500);

        if (desfecho === null) {
          // TODAS as mensagens aceitas
          await base44.asServiceRole.entities.M31FilaMensagem.update(item.id, {
            status: 'enviado', processado_em: fimIso, proxima_mensagem_idx: idx,
            resultados_mensagens: resultados, tentativas: (item.tentativas || 0) + 1,
            uazapi_response: resumoRespostas,
          });
          await atualizarLogGovernanca(base44, item, 'enviado', null, drenoId);
          await registrarTimelineFila(base44, item, 'confirmacao_enviada_uazapi', 'sucesso',
            `message_id=${resultados.map(r=>r.message_id).filter(Boolean).join(',')} | msgs_aceitas=${idx} | status=http_ok | resp=${resumoRespostas}`);
          // CONFIRMACAO_COM_QR: marca confirmação e QR como enviados SOMENTE após aceite da UAZAPI
          if (item.automacao === 'CONFIRMACAO_COM_QR' && item.inscricao_id) {
            await base44.asServiceRole.entities.EventoM31Inscricao.update(item.inscricao_id, {
              data_envio_boas_vindas: fimIso,
              // O link do grupo só foi enviado no template com convite
              ...(item.template !== 'lembrete_qr_ja_no_grupo' ? { status_envio_grupo: 'enviado' } : {}),
              qr_envio_status: 'enviado_com_sucesso', qr_ultimo_envio_em: fimIso,
              qr_tentativas_envio: 1, fila_boas_vindas: false, webhook_processando: false,
            }).catch(() => {});
          }
          if (item.automacao === 'LINK_DE_PAGAMENTO' && item.inscricao_id) {
            await base44.asServiceRole.entities.EventoM31Inscricao.update(item.inscricao_id, {
              last_contact_at: fimIso, last_recovery_at: fimIso,
            }).catch(() => {});
          }
          const encerrar = REGUA_ENCERRAMENTO[item.automacao] || [];
          if (encerrar.length > 0) {
            await encerrarReguaInline(base44, item.cpf || '', item.telefone, encerrar, `auto:${item.automacao}`);
          }
          resultado.enviados++;
          resultado.detalhes.push({ fila_id: item.id, telefone: item.telefone, resultado: 'enviado', mensagens: idx });
        } else if (desfecho === 'falha_terminal') {
          // Número inválido/fora do WhatsApp: estado TERMINAL — bloqueia re-enfileiramento
          await base44.asServiceRole.entities.M31FilaMensagem.update(item.id, {
            status: 'falha_terminal', processado_em: fimIso, proxima_mensagem_idx: idx,
            resultados_mensagens: resultados, erro: ultimoErro, uazapi_response: resumoRespostas,
            tentativas: (item.tentativas || 0) + 1,
          });
          await atualizarLogGovernanca(base44, item, 'bloqueado', `telefone_invalido_terminal: ${ultimoErro}`, drenoId);
          await registrarTimelineFila(base44, item, 'confirmacao_falha_terminal', 'falha', `telefone inválido/fora do WhatsApp | message_id=null | erro=${ultimoErro}`);
          await registrarDLQ(base44, item, `falha terminal (número inválido/fora do WhatsApp): ${ultimoErro}`);
          resultado.terminais++;
          resultado.detalhes.push({ fila_id: item.id, telefone: item.telefone, resultado: 'falha_terminal', erro: ultimoErro });
        } else if (desfecho === 'incerto') {
          // Ambíguo: NUNCA re-tenta automaticamente
          await base44.asServiceRole.entities.M31FilaMensagem.update(item.id, {
            status: 'incerto', processado_em: fimIso, proxima_mensagem_idx: idx,
            resultados_mensagens: resultados, erro: ultimoErro, uazapi_response: resumoRespostas,
            tentativas: (item.tentativas || 0) + 1,
          });
          await registrarDLQ(base44, item, `resultado incerto na mensagem ${idx}: ${ultimoErro}`);
          await registrarTimelineFila(base44, item, 'confirmacao_incerta', 'incerto', `resposta ambígua (HTTP 200 sem message_id) | message_id=null | erro=${ultimoErro}`);
          resultado.incertos++;
          resultado.detalhes.push({ fila_id: item.id, telefone: item.telefone, resultado: 'incerto', erro: ultimoErro });
        } else {
          // 'falha' retryable
          const tentativas = (item.tentativas || 0) + 1;
          if (tentativas < MAX_TENTATIVAS) {
            await base44.asServiceRole.entities.M31FilaMensagem.update(item.id, {
              status: 'pendente', tentativas, erro: ultimoErro,
              proxima_mensagem_idx: idx, resultados_mensagens: resultados,
              agendado_para: new Date(Date.now() + RETRY_BACKOFF_MS).toISOString(),
              claim_id: null, claim_em: null, claim_expira_em: null,
            });
            resultado.reagendados++;
            resultado.detalhes.push({ fila_id: item.id, telefone: item.telefone, resultado: 'retry_agendado', erro: ultimoErro, tentativa: tentativas });
            await registrarTimelineFila(base44, item, 'confirmacao_retry', 'pendente', `tentativa=${tentativas} | message_id=null | erro=${ultimoErro} | reagendado_para_backoff`);
          } else {
            await base44.asServiceRole.entities.M31FilaMensagem.update(item.id, {
              status: 'falha', tentativas, erro: ultimoErro, processado_em: fimIso,
              proxima_mensagem_idx: idx, resultados_mensagens: resultados, uazapi_response: resumoRespostas,
            });
            await atualizarLogGovernanca(base44, item, 'bloqueado', `falha_uazapi_no_dreno: ${ultimoErro}`, drenoId);
            await registrarDLQ(base44, item, `falha terminal por esgotamento de tentativas: ${ultimoErro}`);
            await registrarTimelineFila(base44, item, 'confirmacao_falha', 'falha', `tentativas_esgotadas=${tentativas} | message_id=null | erro=${ultimoErro}`);
            resultado.falhas++;
            resultado.detalhes.push({ fila_id: item.id, telefone: item.telefone, resultado: 'falha', erro: ultimoErro });
          }
        }
      }
    } finally {
      // ═══ 6. LIBERAR O SINGLETON (só se ainda sou o dono) ═══
      await base44.asServiceRole.entities.M31AutomacaoLock.updateMany(
        { chave: LOCK_CHAVE, execution_id: drenoId, ativo: true },
        { $set: { ativo: false } }
      ).catch(() => {});
    }

    return Response.json({
      processados: resultado.enviados + resultado.falhas + resultado.terminais + resultado.incertos + resultado.cancelados + resultado.reagendados,
      ...resultado,
      teto_chamadas_por_minuto: TETO_CHAMADAS_POR_MINUTO,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
