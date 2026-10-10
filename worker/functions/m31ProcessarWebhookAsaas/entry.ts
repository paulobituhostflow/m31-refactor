// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31ProcessarWebhookAsaas — WORKER de processamento de eventos Asaas
 *
 * Processa eventos persistidos em M31AsaasWebhookEvento (status=recebido).
 * Separado do receiver (m31AsaasWebhook) para desacoplar recebimento de processamento.
 *
 * Fluxo:
 *   1. Claim atômico: recebido → processando com claim_token (updateMany condicional)
 *   2. Re-fetch confirmando posse do claim
 *   3. Processar conforme event_type:
 *      - PAYMENT_CONFIRMED / PAYMENT_RECEIVED: atualizar inscricao + enfileirar boas-vindas
 *      - PAYMENT_OVERDUE / PAYMENT_DELETED / PAYMENT_REFUNDED: marcar cancelado
 *   4. Marcar evento como processado (ou falha)
 *
 * CAMADAS M31 PRESERVADAS:
 *   1. Verificar asaas_payment_id + status aprovado + data_envio_boas_vindas
 *   2. Lock otimista webhook_processando=true com claim_token condicional
 *   3. Re-fetch após o lock e confirmação de que o claim pertence à execução atual
 *
 * NÃO chama UAZAPI diretamente: mensagens de participantes passam pela fila
 * governada; o aviso operacional de camisas é acionado via m31AvisoCompraConfirmada (envio direto).
 */

const CLAIM_TTL_MS = 4 * 60 * 1000;
const MAX_TENTATIVAS = 3;
// Janela de regularização: eventos recebidos há mais de 15 dias NÃO são processados
// automaticamente (fluxo histórico = reconciliação manual controlada).
const JANELA_REGULARIZACAO_MS = 15 * 24 * 3600000;

const EVENTOS_CONFIRMACAO = ['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'];
const EVENTOS_CANCELAMENTO = ['PAYMENT_OVERDUE', 'PAYMENT_DELETED', 'PAYMENT_REFUNDED'];
const STATUS_CONFIRMADOS_ASAAS = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'DUNNING_RECEIVED'];

function normalizarDataFinanceira(valor: any): string | null {
  if (!valor || typeof valor !== 'string') return null;
  const somenteData = /^\d{4}-\d{2}-\d{2}$/.test(valor.trim());
  const iso = somenteData ? `${valor.trim()}T00:00:00.000Z` : valor;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

function resolverPagamentoConfirmadoEm(event: string, fullPayment: any): string | null {
  if (!fullPayment) return null;
  if (event === 'PAYMENT_CONFIRMED') {
    return normalizarDataFinanceira(fullPayment.confirmedDate)
      || normalizarDataFinanceira(fullPayment.paymentDate)
      || normalizarDataFinanceira(fullPayment.clientPaymentDate);
  }
  if (event === 'PAYMENT_RECEIVED') {
    return normalizarDataFinanceira(fullPayment.paymentDate)
      || normalizarDataFinanceira(fullPayment.confirmedDate)
      || normalizarDataFinanceira(fullPayment.clientPaymentDate);
  }
  return normalizarDataFinanceira(fullPayment.confirmedDate)
    || normalizarDataFinanceira(fullPayment.paymentDate)
    || normalizarDataFinanceira(fullPayment.clientPaymentDate);
}

function normalizePhone(phone: string): string {
  let d = (phone || '').replace(/\D/g, '');
  while (d.startsWith('5555')) d = d.slice(2);
  if (d.startsWith('55') && d.length >= 12) return d;
  if (d.length >= 10) return `55${d}`;
  return d;
}

function gerarCodigoInscricao(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return `M31-${code}`;
}

function mc(res: any): number {
  return res?.updated ?? res?.modified_count ?? res?.modifiedCount ?? 0;
}

function hojeRecife(): string {
  return new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
}

async function fetchAsaas(url: string, options: any = {}, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err: any) {
    if (err?.name === 'AbortError') throw new Error(`Timeout: Asaas não respondeu em ${timeoutMs / 1000}s`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ── CAMISAS: para camisas existe APENAS COMPRA CONFIRMADA ────────────────
// Aviso operacional DIRETO ao WhatsApp autorizado da Dulce (EventoM31Config
// .whatsapp_dulce) por m31AvisoCompraConfirmada — nunca ao grupo de suporte,
// nunca pela fila comercial. Idempotente por inscrição.
const MODEL_LABELS: Record<string, string> = { equipe: 'Equipe', jesus: 'Jesus', milagres: 'Milagres', filhas: 'Filhas' };
const ITEM_EMOJIS: Record<string, string> = { 'jesus|preta': '⚫', 'jesus|cereja': '🔴', 'milagres|': '🩷', 'filhas|': '⚪' };
function ITEM_EMOJI(modelo: any, cor: any): string {
  return ITEM_EMOJIS[`${String(modelo || '')}|${String(cor || '')}`] || '•';
}
function ITEM_LABEL(modelo: any, cor: any): string {
  if (modelo === 'jesus' && cor === 'preta') return 'Jesus Preta';
  if (modelo === 'jesus' && cor === 'cereja') return 'Jesus Cereja';
  if (modelo === 'milagres') return 'Milagres Rosa';
  if (modelo === 'filhas') return 'Filhas Off-white';
  return MODEL_LABELS[modelo] || modelo || 'Camisa';
}

async function avisarDulceCamisaInscricao(base44: any, inscricao: any, observacao = ''): Promise<string> {
  try {
    const res: any = await base44.asServiceRole.functions.invoke('m31AvisoCompraConfirmada', {
      action: 'camisa_inscricao',
      inscricao_id: inscricao.id,
      nome: inscricao.nome,
      itens: [{ modelo: inscricao.modelo_camisa, tamanho: inscricao.tamanho_camisa }],
      quantidade: 1,
      valor: Number(inscricao.camisa_valor || 0),
      ...(observacao ? { observacao } : {}),
      internal_secret: config('UAZAPI_TOKEN'),
    });
    return res?.aviso || res?.data?.aviso || 'enviado';
  } catch (_) {
    // Aviso fica registrado para revisão; a camisa confirmada e o estoque
    // baixado NUNCA são afetados pela falha do aviso.
    return 'aviso_pendente_camisa_preservada';
  }
}

/**
 * CAMADA 1+2+3: Atualização atômica da inscrição com guard de re-fetch.
 * Preserva valor integral (nunca parcela). Usa data financeira real do Asaas.
 */
async function confirmarCamisaEbaixarEstoque(base44: any, inscricao: any, paymentId: string, installmentId: string | null): Promise<{ status: string }> {
  if (inscricao.comprou_camisa !== true || !inscricao.modelo_camisa || !inscricao.tamanho_camisa) return { status: 'sem_camisa' };
  if (inscricao.camisa_estoque_baixado_em) return { status: 'ja_baixado' };

  const S = base44.asServiceRole.entities;
  const claimToken = crypto.randomUUID();
  const claim = await S.EventoM31Inscricao.updateMany(
    { id: inscricao.id, camisa_estoque_baixado_em: null, camisa_estoque_claim_token: null },
    { $set: { camisa_estoque_claim_token: claimToken } }
  );
  if (mc(claim) !== 1) return { status: 'claim_existente' };

  const stock = await S.EventoM31CamisaEstoque.updateMany(
    { modelo: inscricao.modelo_camisa, tamanho: inscricao.tamanho_camisa, quantidade: { $gt: 0 } },
    { $inc: { quantidade: -1 }, $set: { atualizado_em: new Date().toISOString(), atualizado_por: 'webhook_asaas' } }
  );

  if (mc(stock) !== 1) {
    await S.EventoM31Inscricao.update(inscricao.id, {
      camisa_status: 'revisar_estoque',
      camisa_pendencia: 'Estoque esgotado no momento da confirmação do pagamento.',
      camisa_pagamento_id: installmentId || paymentId,
    });
    const alertaEstoque = await avisarDulceCamisaInscricao(base44, inscricao, '⚠️ Estoque esgotado na confirmação — revisar no painel.');
    return { status: 'sem_estoque_na_confirmacao', alerta_dulce: alertaEstoque };
  }

  const now = new Date().toISOString();
  const camisas = [{
    modelo: inscricao.modelo_camisa,
    tamanho: inscricao.tamanho_camisa,
    valor: Number(inscricao.camisa_valor || 0),
    entregue: false,
  }];
  await S.EventoM31Inscricao.update(inscricao.id, {
    camisa_status: 'confirmada',
    camisa_pagamento_id: installmentId || paymentId,
    camisa_estoque_baixado_em: now,
    camisa_pendencia: null,
    camisas,
  });
  const alertaBump = await avisarDulceCamisaInscricao(base44, inscricao);
  return { status: 'confirmada_estoque_baixado', alerta_dulce: alertaBump };
}

async function validarCobrancaCamisa(S, payment, ref) {
  const pedidoId = ref.slice('M31CAMISA:'.length);
  const pedido = (await S.EventoM31CamisaPedido.filter({ id: pedidoId }, '-created_date', 1))[0];
  if (!pedido || !payment?.id) throw new Error('pedido_camisa_ou_cobranca_ausente');
  const expectedRef = pedido.external_reference || `M31CAMISA:${pedido.id}`;
  if (ref !== expectedRef || (pedido.asaas_payment_id && pedido.asaas_payment_id !== payment.id)) return { pedido, antigo: true };
  // Missing legacy anchors require human review. New attempts carry durable pre-POST evidence.
  if (!pedido.asaas_payment_id && (!pedido.cobranca_enviada_em || !pedido.cobranca_fingerprint)) throw new Error('pedido_camisa_sem_ancora_conferir_tentativa');
  const key = config('ASAAS_API_KEY');
  if (!key) throw new Error('asaas_secret_missing');
  const response = await fetchAsaas(`__ASAAS_API__/payments/${encodeURIComponent(payment.id)}`, { headers: { access_token: key } });
  if (!response.ok) throw new Error('consulta_financeira_camisa_indisponivel');
  const full = await response.json();
  if (!pedido.asaas_payment_id) {
    const lookup = await fetchAsaas(`__ASAAS_API__/payments?externalReference=${encodeURIComponent(expectedRef)}&limit=100`, { headers: { access_token: key } });
    if (!lookup.ok) throw new Error('consulta_ancora_camisa_indisponivel');
    const found = await lookup.json();
    if (found.hasMore || !Array.isArray(found.data) || found.data.length !== 1 || found.data[0].id !== full.id) throw new Error('ancora_camisa_ambigua');
  }
  const expectedTotal = Number(pedido.valor_cobrado ?? pedido.valor_total);
  if (!pedido.payment_method || !Number.isSafeInteger(Number(pedido.installment_count)) || Number(pedido.installment_count) < 1) {
    throw new Error('pedido_camisa_legado_modalidade_desconhecida');
  }
  const expectedBillingType = String(pedido.payment_method).toUpperCase();
  const expectedInstallments = Number(pedido.installment_count);
  const billingType = String(full.billingType || '').toUpperCase();
  const fullInstallments = Number(full.installmentCount || full.installment?.installmentCount || 1);
  // No cartão parcelado, o Asaas pode expor value/installmentValue como valor
  // de cada parcela; a conferência financeira deve comparar o total contratado.
  const fullTotal = billingType === 'CREDIT_CARD' && fullInstallments > 1 && Number.isFinite(Number(full.installmentValue))
    ? Number(full.installmentValue) * fullInstallments
    : Number(full.value);
  const paymentInstallments = Number(payment.installmentCount || payment.installment?.installmentCount || 1);
  const paymentTotal = String(payment.billingType || '').toUpperCase() === 'CREDIT_CARD' && paymentInstallments > 1 && Number.isFinite(Number(payment.installmentValue))
    ? Number(payment.installmentValue) * paymentInstallments
    : Number(payment.value);
  if (full.id !== payment.id || (pedido.asaas_payment_id && full.id !== pedido.asaas_payment_id) || full.externalReference !== expectedRef
      || !Number.isFinite(fullTotal) || expectedTotal <= 0
      || Math.round(fullTotal * 100) !== Math.round(expectedTotal * 100)
      || (Number.isFinite(paymentTotal) && Math.round(paymentTotal * 100) !== Math.round(fullTotal * 100))
      || (payment.externalReference && payment.externalReference !== expectedRef)
      || billingType !== expectedBillingType || fullInstallments !== expectedInstallments) throw new Error('divergencia_financeira_camisa');
  if (!pedido.asaas_payment_id) {
    const bound = await S.EventoM31CamisaPedido.updateMany({ id: pedido.id, asaas_payment_id: null, cobranca_tentativa_id: pedido.cobranca_tentativa_id, cobranca_fingerprint: pedido.cobranca_fingerprint }, { $set: { asaas_payment_id: full.id, asaas_charge_url: full.invoiceUrl || null, cobranca_estado: 'criada' } });
    if (mc(bound) !== 1) throw new Error('ancora_camisa_concorrente');
    pedido.asaas_payment_id = full.id;
  }
  return { pedido, full, antigo: false };
}

/**
 * EFEITO SEPARADO: agradecimento no WhatsApp da compradora quando o pedido de
 * camisa é pago. Idempotente (dedup por pedido + log), fail-closed (template
 * ausente = não enfileira) e JAMAIS afeta o estado financeiro — falha do
 * agradecimento deixa o pedido pago intacto. Respeita a janela comercial 08-20h.
 */
async function agradecerCompraCamisa(S: any, pedido: any): Promise<string> {
  try {
    const dedupKey = `${pedido.id}:OBRIGADO_CAMISA:V1`;
    const jaNaFila = await S.M31FilaMensagem.filter({ dedup_key: dedupKey }, '-created_date', 5);
    if (jaNaFila.find(f => ['pendente', 'processando', 'enviado', 'incerto', 'falha_terminal'].includes(f.status))) {
      return 'ja_na_fila';
    }
    const logs = await S.M31AutomacaoLog.filter(
      { idempotency_key: dedupKey, status: { $in: ['enviado', 'pendente'] } }, '-enviado_em', 1);
    if (logs.length > 0) return 'ja_enviado_log';

    // FAIL-CLOSED: template ausente/inativo = não enfileira
    const tpl = (await S.M31MessageTemplate.filter(
      { chave_unica: 'obrigado_compra_camisa', is_active: true }, '-updated_date', 1))[0];
    if (!tpl?.content) return 'template_agradecimento_ausente_fail_closed';

    const telefone = normalizePhone(pedido.whatsapp);
    if (!telefone || telefone.replace(/\D/g, '').length < 12) return 'whatsapp_compradora_invalido';

    if (pedido.numero_pedido == null) return 'codigo_pedido_ausente_nao_enfileirado';
    const codigoPedido = `#M31${String(pedido.numero_pedido).padStart(3, '0')}`;
    const itens = pedido.itens_cobrados || pedido.itens || [];
    const itensTexto = itens.map((i: any) => {
      const linha = `${ITEM_EMOJI(i.modelo, i.cor)} ${ITEM_LABEL(i.modelo, i.cor)}`;
      return i.tamanho ? `${linha} — ${i.tamanho}` : linha;
    }).join('\n');
    const quantidade = Number(pedido.quantidade ?? itens.length);
    const quantidadeTexto = `${quantidade} ${quantidade === 1 ? 'peça' : 'peças'}`;
    const mensagem = tpl.content
      .replace(/\{\{primeiro_nome\}\}/g, pedido.nome?.split(' ')[0] || 'Querida')
      .replace(/\{\{codigo_pedido\}\}/g, codigoPedido)
      .replace(/\{\{itens\}\}/g, itensTexto)
      .replace(/\{\{quantidade_texto\}\}/g, quantidadeTexto)
      .replace(/\{\{quantidade\}\}/g, String(quantidade))
      .replace(/\{\{valor\}\}/g, Number(pedido.valor_total || 0).toFixed(2).replace('.', ','));
    if (/\{\{[^}]+\}\}/.test(mensagem)) return 'template_agradecimento_com_variavel_nao_renderizada';

    // Confirmação de compra: envio IMEDIATO mesmo fora da janela comercial
    // (forcar_envio=true faz o drenador ignorar a janela; kill-switch, limite
    // diário e idempotência continuam valendo).
    const execId = crypto.randomUUID();
    await S.M31FilaMensagem.create({
      dedup_key: dedupKey,
      participante_id: telefone,
      telefone,
      automacao: 'OBRIGADO_COMPRA_CAMISA',
      template: 'obrigado_compra_camisa',
      versao: 'V1',
      origem: 'm31ProcessarWebhookAsaas:pedido_camisa',
      inscricao_nome: pedido.nome,
      mensagens: [{ message: mensagem }],
      status: 'pendente',
      aprovado_para_envio: true,
      prioridade: 1,
      execution_id: execId,
      forcar_envio: true,
    });

    await S.M31AutomacaoLog.create({
      participante_id: telefone,
      automacao: 'OBRIGADO_COMPRA_CAMISA', template: 'obrigado_compra_camisa', versao: 'V1',
      status: 'pendente', enviado_em: new Date().toISOString(),
      execution_id: execId, origem: 'm31ProcessarWebhookAsaas:pedido_camisa',
      idempotency_key: dedupKey,
    }).catch(() => {});
    return 'agradecimento_enfileirado';
  } catch {
    // Pedido permanece pago; agradecimento fica para revisão via evento/retry.
    return 'agradecimento_pendente_pedido_valido';
  }
}

async function processarPedidoCamisaConfirmacao(base44, evento, payment, ref) {
  const S = base44.asServiceRole.entities;
  try {
    const { pedido, full, antigo } = await validarCobrancaCamisa(S, payment, ref);
    if (antigo) return { sucesso: true, erro: 'evento_camisa_ancora_antiga_ignorado' };
    if (full.deleted || !['CONFIRMED', 'RECEIVED'].includes(full.status)) return { sucesso: false, erro: 'estado_provedor_nao_confirma_camisa' };
    if (['estornado', 'cancelado', 'revisar'].includes(pedido.status_pagamento)) return { sucesso: false, erro: 'pedido_camisa_exige_revisao_sem_regressao' };
    // SUBSTITUÍDO pago depois: o pagamento REAL prevalece (dinheiro recebido =
    // camisa devida). Transita para pago pelo mesmo caminho canônico e sinaliza
    // à Dulce que podem existir duas compras válidas da mesma compradora.
    const eraSubstituido = pedido.status_pagamento === 'substituido';
    const dataFinanceira = resolverPagamentoConfirmadoEm(evento.event_type, full);
    if (pedido.status_pagamento !== 'pago') {
      const result = await S.EventoM31CamisaPedido.updateMany({ id: pedido.id, asaas_payment_id: full.id, status_pagamento: pedido.status_pagamento }, { $set: {
        status_pagamento: 'pago', financeiro_status_provedor: full.status, financeiro_verificado_em: new Date().toISOString(),
        ...(!pedido.pagamento_confirmado_em && dataFinanceira ? { pagamento_confirmado_em: dataFinanceira } : {}),
        aviso_dulce_status: 'pendente' } });
      if (mc(result) !== 1) return { sucesso: false, erro: 'pedido_camisa_concorrencia_repetir_evento' };
    }
    // AVISO OPERACIONAL IMEDIATO à Dulce (COMPRA CONFIRMADA #M31NNN): envio
    // DIRETO, idempotente por pedido — também garante o código do pedido.
    let avisoDesfecho = 'aviso_indisponivel';
    try {
      const avisoRes: any = await base44.asServiceRole.functions.invoke('m31AvisoCompraConfirmada', { pedido_id: pedido.id, internal_secret: config('UAZAPI_TOKEN'), nota_substituido: eraSubstituido });
      avisoDesfecho = avisoRes?.aviso || avisoRes?.data?.aviso || 'enviado';
    } catch (_) { /* aviso fica pendente no próprio pedido; pagamento preservado */ }
    // Efeito separado: confirmação à compradora com o código do pedido — fila
    // governada, idempotente; falha nunca afeta o pedido pago.
    const pedidoAtualizado = (await S.EventoM31CamisaPedido.filter({ id: pedido.id }, '-created_date', 1))[0] || { ...pedido, status_pagamento: 'pago' };
    await agradecerCompraCamisa(S, pedidoAtualizado);
    return { sucesso: true, erro: `pedido_camisa_pago_aviso_${avisoDesfecho}`, ...(eraSubstituido ? { era_substituido: true } : {}) };
  } catch (error) { return { sucesso: false, erro: error?.message || 'falha_confirmacao_camisa' }; }
}

async function processarConfirmacao(base44: any, evento: any, payment: any): Promise<{ sucesso: boolean; erro?: string; inscricao_id?: string }> {
  const S = base44.asServiceRole.entities;

  // ── Buscar inscrição por externalReference ou CPF ──
  let inscricoes: any[] = [];
  const ref = payment.externalReference || evento.external_reference;
  if (typeof ref === 'string' && ref.startsWith('M31CAMISA:')) {
    return processarPedidoCamisaConfirmacao(base44, evento, payment, ref);
  }

  if (ref) {
    // Âncoras vigentes: legado {cpf}-M31FILHAS e atual
    // {cpf}-M31FILHAS-{PIX|CREDIT_CARD}-{parcelas}. A versão anterior só
    // reconhecia a primeira e deixava cartão parcelado sem inscrição associada.
    const refAncora = /^(\d{11})-M31FILHAS(?:-(PIX|CREDIT_CARD)-(\d+))?$/.exec(ref);
    if (refAncora) {
      const [, cpfRef, metodoRef, parcelasRef] = refAncora;
      const porCpf = await S.EventoM31Inscricao.filter({ cpf: cpfRef }, '-created_date', 10);
      const metodo = metodoRef || null;
      const parcelas = parcelasRef ? Number(parcelasRef) : null;
      const compativel = (i:any) => (!metodo || String(i.payment_method || '').toUpperCase() === metodo)
        && (!parcelas || Number(i.installment_count || 0) === parcelas);
      const alvo = porCpf.find(i => i.status_pagamento !== 'cancelado' && i.status_pagamento !== 'aprovado' && compativel(i))
        || porCpf.find(i => i.status_pagamento === 'aprovado' && compativel(i))
        || (!metodo ? porCpf.find(i => i.status_pagamento !== 'cancelado' && i.status_pagamento !== 'aprovado') : null)
        || (!metodo ? porCpf.find(i => i.status_pagamento === 'aprovado') : null)
        || (!metodo ? porCpf[0] : null);
      inscricoes = alvo ? [alvo] : [];
    } else {
      inscricoes = await S.EventoM31Inscricao.filter({ codigo_inscricao: ref });
    }
  }

  // Fallback por asaas_payment_id (payment.id do Asaas)
  if (inscricoes.length === 0 && payment.id) {
    const porPid = await S.EventoM31Inscricao.filter({ asaas_payment_id: payment.id }, '-created_date', 1);
    if (porPid.length > 0) inscricoes = [porPid[0]];
  }

  // Fallback por asaas_checkout_id — payment.checkoutSession do payload (âncora
  // determinística: cada checkout pertence a UMA inscrição). O campo correto do
  // Asaas é 'checkoutSession' — o fallback antigo procurava 'checkout' (campo
  // inexistente no objeto payment) e nunca casava: causa raiz dos eventos presos.
  if (inscricoes.length === 0 && payment.checkoutSession) {
    const porCheckout = await S.EventoM31Inscricao.filter({ asaas_checkout_id: payment.checkoutSession }, '-created_date', 1);
    if (porCheckout.length > 0) inscricoes = [porCheckout[0]];
  }

  // Fallback por asaas_installment_id — payment.installment (identidade
  // financeira da compra parcelada, 'pai' de todas as parcelas)
  if (inscricoes.length === 0 && payment.installment) {
    const porInstallment = await S.EventoM31Inscricao.filter({ asaas_installment_id: payment.installment }, '-created_date', 1);
    if (porInstallment.length > 0) inscricoes = [porInstallment[0]];
  }

  // ── ANCORAGEM ESTRITA: sem fallback por CPF broad (customer.cpfCnpj → porCpf[0]).
  // A correspondência ampla por CPF causou atribuição indevida de 118 inscrições
  // (dead-end documentado). Aprovar SOMENTE por externalReference, asaas_payment_id
  // ou asaas_checkout_id — âncoras determinísticas e únicas por inscrição.
  if (inscricoes.length === 0) {
    return { sucesso: false, erro: 'inscricao_nao_encontrada_sem_ancora_estrita' };
  }

  const inscricaoId = inscricoes[0].id;

  // ── CAMADA 1: Re-fetch (verifica se outro processo já processou) ──
  const fresh = await S.EventoM31Inscricao.filter({ id: inscricaoId });
  if (!fresh || fresh.length === 0) return { sucesso: false, erro: 'inscricao_desapareceu' };
  const inscricao = fresh[0];

  // Idempotência forte: já aprovado com boas-vindas OU jornada concluída
  if (inscricao.status_pagamento === 'aprovado' &&
      (inscricao.data_envio_boas_vindas || inscricao.estado_jornada === 'jornada_concluida')) {
    return { sucesso: true, erro: 'ja_processado', inscricao_id: inscricaoId };
  }

  // ── Buscar pagamento completo no Asaas ──
  let fullPayment: any = null;
  try {
    const ASAAS_KEY = config("ASAAS_API_KEY");
    const payResp = await fetchAsaas(`__ASAAS_API__/payments/${payment.id}`, {
      headers: { 'access_token': ASAAS_KEY }
    });
    fullPayment = await payResp.json();
  } catch (e) {
    logger.error('[Worker] Erro ao buscar pagamento Asaas:', e.message);
  }

  // Ignora evento de confirmação atrasado se o Asaas já cancelou ou estornou
  // a cobrança. O estado atual do provider tem precedência sobre o evento antigo.
  if (fullPayment?.id && (fullPayment.deleted === true
      || !STATUS_CONFIRMADOS_ASAAS.includes(String(fullPayment.status || '').toUpperCase()))) {
    return {
      sucesso: true,
      erro: `evento_desatualizado_provedor_${fullPayment.status || 'deletado'}`,
      inscricao_id: inscricaoId,
    };
  }

  // ── Determinar valor total (nunca parcela) ──
  const billingType = (fullPayment?.billingType || payment.billingType || '').toUpperCase();
  const installmentCount = fullPayment?.installmentCount || payment.installmentCount || null;
  const installmentValue = fullPayment?.installmentValue || payment.installmentValue || null;
  const paymentValue = fullPayment?.value ?? payment.value;

  let valorTotal: number | null = null;
  if (billingType === 'CREDIT_CARD' && installmentCount && installmentCount > 1 && installmentValue) {
    valorTotal = Math.round(installmentCount * installmentValue * 100) / 100;
  }
  if (valorTotal === null && inscricao.valor_pago && paymentValue >= inscricao.valor_pago) {
    valorTotal = paymentValue;
  }
  if (valorTotal === null && inscricao.valor_pago && inscricao.valor_pago > 0) {
    valorTotal = inscricao.valor_pago;
  }
  if (valorTotal === null) {
    valorTotal = paymentValue;
  }
  if (!valorTotal || valorTotal <= 0) {
    return { sucesso: false, erro: 'valor_total_indeterminado' };
  }
  // Guard: preservar valor existente se maior (parcela nunca sobrescreve total)
  if (inscricao.valor_pago && inscricao.valor_pago > 0 && valorTotal < inscricao.valor_pago) {
    valorTotal = inscricao.valor_pago;
  }

  // ── Timestamp financeiro real ──
  const pagamentoConfirmadoEm = resolverPagamentoConfirmadoEm(evento.event_type, fullPayment);

  // ── CAMADA 2: Lock otimista webhook_processando=true ──
  const claimToken = crypto.randomUUID();
  const lockRes = await S.EventoM31Inscricao.updateMany(
    { id: inscricaoId, webhook_processando: { $ne: true } },
    { $set: { webhook_processando: true, estado_jornada: 'processando_boas_vindas' } }
  );
  if (mc(lockRes) !== 1) {
    return { sucesso: false, erro: 'lock_falhou_concorrencia', inscricao_id: inscricaoId };
  }

  // ── CAMADA 3: Re-fetch confirmando posse do lock ──
  const locked = await S.EventoM31Inscricao.filter({ id: inscricaoId });
  if (!locked || locked.length === 0 || !locked[0].webhook_processando) {
    return { sucesso: false, erro: 'lock_perdido_apos_aquisicao', inscricao_id: inscricaoId };
  }

  // ── Atualizar inscrição com dados financeiros ──
  // Âncora financeira da compra. Para parceladas, a identidade real é o
  // installment (pai de todas as parcelas) — sem gravá-lo, várias inscrições
  // ficavam ancoradas no mesmo payment_id de parcela e travavam a conciliação.
  const installmentId = fullPayment?.installment || payment.installment || null;

  const updateData: Record<string, any> = {
    status_pagamento: 'aprovado',
    estado_jornada: 'pagamento_confirmado',
    origem_pagamento: 'asaas',
    asaas_payment_id: payment.id,
    // VEREDITO CANÔNICO gravado no mesmo instante da evidência: nenhuma
    // inscrição confirmada pode existir sem evidência financeira concreta.
    estado_canonico: 'confirmada',
    evidencia_canonica: installmentId
      ? `asaas_ancora:installment:${installmentId}`
      : `asaas_ancora:payment:${payment.id}`,
    canonica_calculada_em: new Date().toISOString(),
    ...(installmentId ? { asaas_installment_id: installmentId } : {}),
    asaas_billing_type: billingType || null,
    asaas_installment_count: installmentCount,
    asaas_installment_value: installmentValue,
    asaas_total_value: valorTotal,
    valor_pago: valorTotal,
    last_contact_at: new Date().toISOString(),
    webhook_processando: false, // liberar lock
  };

  // pagamento_confirmado_em: append-only, só data financeira real
  if (!inscricao.pagamento_confirmado_em) {
    if (pagamentoConfirmadoEm) {
      updateData.pagamento_confirmado_em = pagamentoConfirmadoEm;
    }
    // Se sem data financeira: campo fica vazio → fail-closed no enfileiramento
  }

  await S.EventoM31Inscricao.update(inscricaoId, updateData);

  // ── Camisa opcional: confirmar e baixar estoque somente após pagamento ──
  // A baixa é protegida por claim na inscrição + update condicional quantidade>0.
  // Se o último item tiver sido vendido entre checkout e pagamento, a vaga continua
  // confirmada e a camisa vai para revisão operacional sem cobrança/efeito duplicado.
  const camisaResult = await confirmarCamisaEbaixarEstoque(base44, { ...inscricao, ...updateData }, payment.id, installmentId);

  // ── Timeline da inscrição: aprovação rastreável ponta-a-ponta ──
  await S.M31InscricaoTimeline.create({
    inscricao_id: inscricaoId,
    cpf: inscricao.cpf || null,
    evento: 'pagamento_aprovado_webhook', etapa: 'webhook_worker', status: 'sucesso',
    detalhe: `evento=${evento.event_id} | payment=${payment.id} | valor=${valorTotal} | data_financeira=${pagamentoConfirmadoEm || 'ausente'} | camisa=${camisaResult.status}`,
    origem: 'm31ProcessarWebhookAsaas',
  }).catch(() => {});

  // Ao confirmar a compra da inscrição, liberar também a vaga presenteada.
  // O valor fica na compradora; a convidada recebe cadastro próprio com valor 0.
  let convidadaId: string | null = inscricao.presenteado_id || null;
  if (!convidadaId) {
    const reversas = await S.EventoM31Inscricao.filter({ presenteado_por_id: inscricaoId }, '-created_date', 1);
    convidadaId = reversas[0]?.id || null;
  }
  if (convidadaId) {
    try {
      const convidada = (await S.EventoM31Inscricao.filter({ id: convidadaId }))[0];
      if (convidada && !['aprovado', 'gratuito'].includes(convidada.status_pagamento)) {
        await S.EventoM31Inscricao.update(convidada.id, {
          status_pagamento: 'aprovado',
          origem_pagamento: 'asaas',
          valor_pago: 0,
          lote: inscricao.lote || convidada.lote || null,
          estado_jornada: 'pagamento_confirmado',
          presenteado_por_id: convidada.presenteado_por_id || inscricaoId,
          cadastro_pendente: true,
          ...(pagamentoConfirmadoEm && !convidada.pagamento_confirmado_em
            ? { pagamento_confirmado_em: pagamentoConfirmadoEm } : {}),
        });
        await S.M31InscricaoTimeline.create({
          inscricao_id: convidada.id,
          evento: 'presenteada_vaga_aprovada', etapa: 'webhook_worker', status: 'sucesso',
          detalhe: `Vaga presenteada liberada pela compra ${inscricaoId} (payment=${payment.id}). Aguarda conclusão do cadastro para QR Code.`,
          origem: 'm31ProcessarWebhookAsaas',
        }).catch(() => {});
      }
      if (convidada) {
        if (!inscricao.presenteado_id) {
          await S.EventoM31Inscricao.update(inscricaoId, { presenteado_id: convidada.id }).catch(() => {});
        }
        base44.asServiceRole.functions
          .invoke('m31EnviarLinkCadastroConvidada', {
            inscricao_id: convidada.id,
            pagador_nome: inscricao.nome || null,
          })
          .catch(() => {});
      }
    } catch (e: any) {
      logger.error('[Worker] Falha ao liberar presenteada:', e?.message || e);
    }
  }

  // ── AVISO OPERACIONAL: nova voluntária confirmada → Edilândia (direto, imediato) ──
  // Espelho do padrão da Dulce: sem fila, sem janela; kill-switch e idempotência
  // dentro da função. Efeito separado: falha do aviso NUNCA afeta a inscrição.
  if (inscricao.tipo === 'voluntario') {
    base44.asServiceRole.functions.invoke('m31AvisoVoluntariaConfirmada', { inscricao_id: inscricaoId, internal_secret: config('UAZAPI_TOKEN') }).catch(() => {});
  }

  // ── Verificar go_live_corte_em ──
  const cfgs = await S.EventoM31Config.list('-created_date', 1);
  const goLiveCorte = cfgs[0]?.go_live_corte_em || null;
  const dataFinanceira = pagamentoConfirmadoEm || inscricao.pagamento_confirmado_em || updateData.pagamento_confirmado_em;

  if (!goLiveCorte || !dataFinanceira || dataFinanceira < goLiveCorte) {
    // Pré-corte ou sem data: atualizou financeiro, mas NÃO enfileira WhatsApp
    logger.log(`[Worker] ${inscricaoId}: pré-corte ou sem data financeira — financeiro atualizado, sem WhatsApp`);
    return { sucesso: true, erro: 'pre_corte_ou_sem_data_financeira', inscricao_id: inscricaoId };
  }

  // ── Enfileirar boas-vindas + QR (apenas pós-corte) ──
  // Presenteada com cadastro pendente: NÃO enfileira boas-vindas (recebe link de cadastro)
  const inscricaoFinal = (await S.EventoM31Inscricao.filter({ id: inscricaoId }))[0];
  if (inscricaoFinal.cadastro_pendente === true) {
    return { sucesso: true, erro: 'presenteada_cadastro_pendente', inscricao_id: inscricaoId };
  }
  if (inscricaoFinal.opt_out === true) {
    return { sucesso: true, erro: 'opt_out', inscricao_id: inscricaoId };
  }

  // ── VOLUNTÁRIAS (/m31-servir): confirmação SEM QR Code ──
  // O fluxo de voluntárias não usa credenciamento por QR. Recebe apenas
  // confirmação + agradecimento (template confirmacao_voluntaria).
  if (inscricaoFinal.tipo === 'voluntario') {
    const dedupVol = `${inscricaoId}:CONFIRMACAO_VOLUNTARIA:V1`;
    const filaVol = await S.M31FilaMensagem.filter({ dedup_key: dedupVol }, '-created_date', 5);
    if (filaVol.find(f => ['pendente', 'processando', 'enviado', 'incerto', 'falha_terminal'].includes(f.status))) {
      return { sucesso: true, erro: 'ja_na_fila', inscricao_id: inscricaoId };
    }
    const logVol = await S.M31AutomacaoLog.filter(
      { idempotency_key: dedupVol, status: { $in: ['enviado', 'pendente'] } }, '-enviado_em', 1);
    if (logVol.length > 0) {
      return { sucesso: true, erro: 'ja_enviado_log', inscricao_id: inscricaoId };
    }

    const tplVol = await S.M31MessageTemplate.filter(
      { chave_unica: 'confirmacao_voluntaria', is_active: true }, '-updated_date', 1);
    if (!tplVol || tplVol.length === 0 || !tplVol[0].content) {
      return { sucesso: false, erro: 'template_voluntaria_ausente_fail_closed', inscricao_id: inscricaoId };
    }
    const msgVol = tplVol[0].content
      .replace(/\{\{primeiro_nome\}\}/g, inscricaoFinal.nome?.split(' ')[0] || 'Querida');

    const cpfVol = (inscricaoFinal.cpf || '').replace(/\D/g, '');
    const telVol = normalizePhone(inscricaoFinal.whatsapp);
    const execVol = crypto.randomUUID();

    await S.M31FilaMensagem.create({
      dedup_key: dedupVol,
      participante_id: cpfVol || telVol,
      cpf: cpfVol || null,
      telefone: telVol,
      email: (inscricaoFinal.email || '').toLowerCase() || null,
      automacao: 'CONFIRMACAO_VOLUNTARIA',
      template: 'confirmacao_voluntaria',
      versao: 'V1',
      origem: 'm31AsaasWebhook',
      inscricao_id: inscricaoId,
      inscricao_nome: inscricaoFinal.nome,
      mensagens: [{ message: msgVol }],
      status: 'pendente',
      aprovado_para_envio: true,
      prioridade: 1,
      execution_id: execVol,
      forcar_envio: true,
    });

    await S.M31AutomacaoLog.create({
      participante_id: cpfVol || telVol, inscricao_principal: inscricaoId,
      cpf: cpfVol || null, telefone: telVol, email: (inscricaoFinal.email || '').toLowerCase() || null,
      automacao: 'CONFIRMACAO_VOLUNTARIA', template: 'confirmacao_voluntaria', versao: 'V1',
      status: 'pendente', enviado_em: new Date().toISOString(),
      execution_id: execVol, origem: 'm31ProcessarWebhookAsaas:voluntaria_sem_qr',
      idempotency_key: dedupVol,
    }).catch(() => {});

    await S.EventoM31Inscricao.update(inscricaoId, { fila_boas_vindas: true }).catch(() => {});

    return { sucesso: true, erro: 'enfileirado', inscricao_id: inscricaoId };
  }

  // Idempotência de negócio: inscricao.id + CONFIRMACAO_COM_QR + V1
  const dedupKey = `${inscricaoId}:CONFIRMACAO_COM_QR:V1`;
  const jaNaFila = await S.M31FilaMensagem.filter({ dedup_key: dedupKey }, '-created_date', 5);
  const ativo = jaNaFila.find(f => ['pendente', 'processando', 'enviado', 'incerto', 'falha_terminal'].includes(f.status));
  if (ativo) {
    return { sucesso: true, erro: 'ja_na_fila', inscricao_id: inscricaoId };
  }

  // Idempotência por log
  const logsExistentes = await S.M31AutomacaoLog.filter(
    { idempotency_key: dedupKey, status: { $in: ['enviado', 'pendente'] } }, '-enviado_em', 1);
  if (logsExistentes.length > 0) {
    return { sucesso: true, erro: 'ja_enviado_log', inscricao_id: inscricaoId };
  }

  // ── Gerar código + QR ──
  let codigo = inscricaoFinal.codigo_inscricao || '';
  if (!codigo) {
    codigo = gerarCodigoInscricao();
    await S.EventoM31Inscricao.update(inscricaoId, { codigo_inscricao: codigo });
  }
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(codigo)}&bgcolor=FFFFFF&color=000000&format=png`;

  // ── Participante JÁ no grupo: usar a mensagem aprovada SEM convite do grupo. ──
  // Não confiar apenas no flag da inscrição: o snapshot oficial do WhatsApp é o
  // double check operacional mais atual. Presença no grupo nunca altera financeiro.
  const phoneGrupo = normalizePhone(inscricaoFinal.whatsapp);
  const membrosGrupo = phoneGrupo
    ? await S.M31GrupoMembro.filter({ phone: phoneGrupo, status: 'ativa' }, '-ultima_deteccao', 1).catch(() => [])
    : [];
  const jaNoGrupo = inscricaoFinal.entrou_no_grupo === true || membrosGrupo.length > 0;
  if (membrosGrupo.length > 0 && inscricaoFinal.entrou_no_grupo !== true) {
    await S.EventoM31Inscricao.update(inscricaoId, { entrou_no_grupo: true, entrou_no_grupo_em: membrosGrupo[0].primeira_deteccao || new Date().toISOString() }).catch(() => {});
  }
  let templateChave: string;
  let mensagem: string;
  if (jaNoGrupo) {
    const tplJa = await S.M31MessageTemplate.filter(
      { chave_unica: 'lembrete_qr_ja_no_grupo', is_active: true }, '-updated_date', 1);
    if (!tplJa || tplJa.length === 0 || !tplJa[0].content) {
      // FAIL-CLOSED: template ausente = sem fila, sem envio
      return { sucesso: false, erro: 'template_ja_no_grupo_ausente_fail_closed', inscricao_id: inscricaoId };
    }
    templateChave = 'lembrete_qr_ja_no_grupo';
    mensagem = tplJa[0].content
      .replace(/\{\{primeiro_nome\}\}/g, inscricaoFinal.nome?.split(' ')[0] || 'Querida')
      .replace(/\{\{codigo_inscricao\}\}/g, codigo);
  } else {
    // ── Buscar grupo oficial (só para quem ainda NÃO está no grupo) ──
    const grupos = await S.M31GrupoConfig.filter({ finalidade: 'INSCRITAS_OFICIAL', ativo: true });
    const linkGrupo = grupos[0]?.invite_link || '';
    if (!linkGrupo) {
      return { sucesso: false, erro: 'grupo_nao_configurado', inscricao_id: inscricaoId };
    }

    // ── Buscar template (PROIBIDO fallback inline) ──
    const tplRecs = await S.M31MessageTemplate.filter(
      { chave_unica: 'confirmacao_com_qr', is_active: true }, '-updated_date', 1);
    if (!tplRecs || tplRecs.length === 0 || !tplRecs[0].content) {
      // FAIL-CLOSED: template ausente = sem fila, sem envio
      return { sucesso: false, erro: 'template_ausente_fail_closed', inscricao_id: inscricaoId };
    }
    templateChave = 'confirmacao_com_qr';
    mensagem = tplRecs[0].content
      .replace(/\{\{primeiro_nome\}\}/g, inscricaoFinal.nome?.split(' ')[0] || 'Querida')
      .replace(/\{\{codigo_inscricao\}\}/g, codigo)
      .replace(/\{\{link_grupo_whatsapp\}\}/g, linkGrupo);
  }

  // ── Enfileirar (aprovado_para_envio=true — retomada controlada, sem aprovação manual) ──
  // Prioridade 1: confirmações drenam ANTES da recuperação (prio 2). forcar_envio=true
  // garante envio IMEDIATO mesmo fora da janela comercial (o drenador mantém
  // kill-switch, limite diário e idempotência).
  const cpfNorm = (inscricaoFinal.cpf || '').replace(/\D/g, '');
  const phoneSanitized = normalizePhone(inscricaoFinal.whatsapp);
  const pessoa = cpfNorm || phoneSanitized;
  const execId = crypto.randomUUID();

  await S.M31FilaMensagem.create({
    dedup_key: dedupKey,
    participante_id: pessoa,
    cpf: cpfNorm || null,
    telefone: phoneSanitized,
    email: (inscricaoFinal.email || '').toLowerCase() || null,
    automacao: 'CONFIRMACAO_COM_QR',
    template: templateChave,
    versao: 'V1',
    origem: 'm31AsaasWebhook',
    inscricao_id: inscricaoId,
    inscricao_nome: inscricaoFinal.nome,
    mensagens: [{ message: mensagem, image_url: qrCodeUrl }],
    status: 'pendente',
    aprovado_para_envio: true,
    prioridade: 1,
    execution_id: execId,
    forcar_envio: true,
  });

  await S.M31AutomacaoLog.create({
    participante_id: pessoa, inscricao_principal: inscricaoId,
    cpf: cpfNorm || null, telefone: phoneSanitized, email: (inscricaoFinal.email || '').toLowerCase() || null,
    automacao: 'CONFIRMACAO_COM_QR', template: templateChave, versao: 'V1',
    status: 'pendente', enviado_em: new Date().toISOString(),
    execution_id: execId, origem: 'm31ProcessarWebhookAsaas:enfileirado',
    idempotency_key: dedupKey,
  }).catch(() => {});

  await S.EventoM31Inscricao.update(inscricaoId, {
    qrcode_token: qrCodeUrl, qrcode_url: qrCodeUrl,
    qrcode_gerado_em: new Date().toISOString(),
    qr_envio_status: 'gerado_nao_enviado',
    fila_boas_vindas: true,
  }).catch(() => {});

  return { sucesso: true, erro: 'enfileirado', inscricao_id: inscricaoId };
}

async function processarCancelamento(base44: any, evento: any, payment: any): Promise<{ sucesso: boolean; erro?: string; inscricao_id?: string }> {
  const S = base44.asServiceRole.entities;
  const ref = payment.externalReference || evento.external_reference;

  if (typeof ref === 'string' && ref.startsWith('M31CAMISA:')) {
    try {
      const { pedido, full, antigo } = await validarCobrancaCamisa(S, payment, ref);
      if (antigo) return { sucesso: true, erro: 'evento_camisa_ancora_antiga_ignorado' };
      const transitions = {
        PAYMENT_OVERDUE: { matches: full.status === 'OVERDUE' && !full.deleted, next: 'vencido' },
        PAYMENT_DELETED: { matches: full.deleted === true, next: 'cancelado' },
        PAYMENT_REFUNDED: { matches: full.status === 'REFUNDED', next: 'estornado' },
      };
      const transition = transitions[evento.event_type];
      if (!transition?.matches) return { sucesso: true, erro: 'evento_camisa_desatualizado_ignorado' };
      if ((pedido.status_pagamento === 'pago' && evento.event_type !== 'PAYMENT_REFUNDED') || pedido.status_pagamento === 'estornado') return { sucesso: true, erro: 'estado_financeiro_camisa_preservado' };
      const result = await S.EventoM31CamisaPedido.updateMany({ id: pedido.id, asaas_payment_id: full.id, status_pagamento: pedido.status_pagamento }, { $set: { status_pagamento: transition.next, financeiro_status_provedor: full.status, financeiro_verificado_em: new Date().toISOString() } });
      return { sucesso: mc(result) === 1, erro: mc(result) === 1 ? `pedido_camisa_${transition.next}` : 'conflito_financeiro_camisa' };
    } catch (error) { return { sucesso: false, erro: error?.message || 'falha_evento_camisa' }; }
  }

  let inscricoes: any[] = [];
  if (ref) {
    const refAncora = /^(\d{11})-M31FILHAS$/.exec(ref);
    if (refAncora) {
      inscricoes = await S.EventoM31Inscricao.filter({ cpf: refAncora[1] }, '-created_date', 5);
    } else {
      inscricoes = await S.EventoM31Inscricao.filter({ codigo_inscricao: ref });
    }
  }

  if (inscricoes.length === 0) {
    return { sucesso: false, erro: 'inscricao_nao_encontrada' };
  }

  const inscricao = inscricoes[0];
  if (inscricao.status_pagamento !== 'aprovado') {
    await S.EventoM31Inscricao.update(inscricao.id, { status_pagamento: 'cancelado' });
  }
  return { sucesso: true, inscricao_id: inscricao.id };
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Autenticação: admin manual OU automação sem usuário autenticado.
    // O worker é chamado por (1) receptor m31AsaasWebhook logo após persistir o
    // evento, (2) workflow agendado de segurança horário e (3) painel admin.
    // Chamadas AUTOMÁTICAS vêm sem usuário — bloqueá-las deixava TODO evento
    // preso em 'recebido' (403 silencioso em 100% das execuções agendadas).
    // Usuário autenticado que NÃO é admin continua bloqueado (fail closed).
    // O processamento em si é protegido por claim atômico + idempotência por
    // event_id — invocações concorrentes são seguras.
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    let maxEventos: number | null = null;
    const body = await req.json();
    {
      if (body?.action === 'retomar_aviso_camisa' || body?.action === 'conciliar_camisa') {
        if (typeof body.pedido_id !== 'string' || !/^[a-zA-Z0-9_-]{10,64}$/.test(body.pedido_id)) return Response.json({ error: 'pedido_id inválido' }, { status: 400 });
        const S = base44.asServiceRole.entities;
        const pedido = (await S.EventoM31CamisaPedido.filter({ id: body.pedido_id }, '-created_date', 1))[0];
        if (!pedido || !pedido.asaas_payment_id) return Response.json({ error: 'Pedido sem âncora financeira.' }, { status: 409 });
        if (body.action === 'retomar_aviso_camisa' && pedido.status_pagamento !== 'pago') return Response.json({ error: 'Pedido sem pagamento confirmado.' }, { status: 409 });
        // conciliar_camisa e webhook percorrem EXATAMENTE a mesma função canônica.
        // Ela reconsulta o Asaas e valida payment_id, externalReference, valor,
        // billingType e status antes de qualquer transição financeira.
        const result = await processarPedidoCamisaConfirmacao(base44, { event_type: 'PAYMENT_RECEIVED' }, { id: pedido.asaas_payment_id }, pedido.external_reference || `M31CAMISA:${pedido.id}`);
        return Response.json(result, { status: result.sucesso ? 200 : 409 });
      }
      if (body && Object.prototype.hasOwnProperty.call(body, 'max_eventos')) {
        if (!Number.isInteger(body.max_eventos) || body.max_eventos < 1 || body.max_eventos > 50) return Response.json({ error: 'max_eventos deve estar entre 1 e 50' }, { status: 400 });
        maxEventos = body.max_eventos;
      }
      if (body?.action && !['retomar_aviso_camisa','conciliar_camisa'].includes(body.action)) return Response.json({ error: 'Ação inválida.' }, { status: 400 });
    }

    const agoraIso = new Date().toISOString();
    const corteJanela15d = new Date(Date.now() - JANELA_REGULARIZACAO_MS).toISOString();
    const resultado = { processados: 0, falhas: 0, ignorados: 0, detalhes: [] as any[] };

    // ── Recuperação de claims expirados ──
    const presos = await base44.asServiceRole.entities.M31AsaasWebhookEvento.filter(
      { status: 'processando' }, 'recebido_em', 20);
    for (const p of presos) {
      if (!p.claim_expira_em || p.claim_expira_em >= agoraIso) continue;
      await base44.asServiceRole.entities.M31AsaasWebhookEvento.update(p.id, {
        status: 'recebido', claim_token: null, claim_em: null, claim_expira_em: null,
      });
    }

    // ── Selecionar eventos recebidos ──
    const pendentes = await base44.asServiceRole.entities.M31AsaasWebhookEvento.filter(
      { status: 'recebido' }, 'recebido_em', 50);

    for (const evento of pendentes) {
      if (maxEventos !== null && resultado.processados + resultado.falhas >= maxEventos) break;
      if (evento.tentativas >= MAX_TENTATIVAS) {
        await base44.asServiceRole.entities.M31AsaasWebhookEvento.update(evento.id, {
          status: 'falha', erro: 'tentativas_esgotadas', processado_em: agoraIso,
        });
        resultado.falhas++;
        continue;
      }

      // ── Janela de 15 dias: fora da janela → ignorado (reconciliação manual) ──
      if (evento.recebido_em && evento.recebido_em < corteJanela15d) {
        await base44.asServiceRole.entities.M31AsaasWebhookEvento.update(evento.id, {
          status: 'ignorado', erro: 'fora_janela_15_dias_regularizacao', processado_em: agoraIso,
        });
        resultado.ignorados++;
        continue;
      }

      // ── Claim atômico: recebido → processando ──
      const claimToken = crypto.randomUUID();
      const claimExpira = new Date(Date.now() + CLAIM_TTL_MS).toISOString();
      const claimRes = await base44.asServiceRole.entities.M31AsaasWebhookEvento.updateMany(
        { id: evento.id, status: 'recebido' },
        { $set: { status: 'processando', claim_token: claimToken, claim_em: agoraIso, claim_expira_em: claimExpira,
          tentativas: (evento.tentativas || 0) + 1 } }
      );
      if (mc(claimRes) !== 1) continue;

      // ── Re-fetch confirmando posse do claim ──
      const claimed = await base44.asServiceRole.entities.M31AsaasWebhookEvento.filter({ id: evento.id });
      if (!claimed || claimed.length === 0 || claimed[0].claim_token !== claimToken) {
        continue;
      }

      // ── Processar ──
      let payload: any;
      try {
        payload = JSON.parse(evento.payload_json);
      } catch {
        await base44.asServiceRole.entities.M31AsaasWebhookEvento.update(evento.id, {
          status: 'falha', erro: 'payload_json_invalido', processado_em: new Date().toISOString(),
        });
        resultado.falhas++;
        continue;
      }

      const payment = payload?.payment;
      if (!payment) {
        await base44.asServiceRole.entities.M31AsaasWebhookEvento.update(evento.id, {
          status: 'ignorado', erro: 'sem payment', processado_em: new Date().toISOString(),
        });
        resultado.ignorados++;
        continue;
      }

      let procResult: { sucesso: boolean; erro?: string; inscricao_id?: string };
      if (EVENTOS_CONFIRMACAO.includes(evento.event_type)) {
        procResult = await processarConfirmacao(base44, evento, payment);
      } else if (EVENTOS_CANCELAMENTO.includes(evento.event_type)) {
        procResult = await processarCancelamento(base44, evento, payment);
      } else {
        await base44.asServiceRole.entities.M31AsaasWebhookEvento.update(evento.id, {
          status: 'ignorado', erro: `evento não mapeado: ${evento.event_type}`, processado_em: new Date().toISOString(),
        });
        resultado.ignorados++;
        continue;
      }

      const fimIso = new Date().toISOString();
      if (procResult.sucesso) {
        await base44.asServiceRole.entities.M31AsaasWebhookEvento.update(evento.id, {
          status: 'processado', processado_em: fimIso,
          resultado: JSON.stringify(procResult).substring(0, 500),
          erro: procResult.erro || null,
        });
        resultado.processados++;
        resultado.detalhes.push({ event_id: evento.event_id, inscricao_id: procResult.inscricao_id, resultado: procResult.erro });
        // Acorda o drenador (fire-and-forget): confirmação enfileirada deve sair
        // minutos após o pagamento, sem depender das tarefas agendadas (inertes).
        // O drenador é fail-closed + single-flight — acionamentos concorrentes são seguros.
        if (procResult.erro === 'enfileirado' || String(procResult.erro || '').startsWith('pedido_camisa_pago_aviso')) {
          base44.asServiceRole.functions.invoke('m31DrenarFila', {}).catch(() => {});
        }
      } else {
        await base44.asServiceRole.entities.M31AsaasWebhookEvento.update(evento.id, {
          status: 'recebido', // volta para retry (se tentativas < MAX)
          erro: procResult.erro,
          claim_token: null, claim_em: null, claim_expira_em: null,
        });
        resultado.falhas++;
        resultado.detalhes.push({ event_id: evento.event_id, erro: procResult.erro });
      }
    }

    return Response.json({
      ...resultado,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
