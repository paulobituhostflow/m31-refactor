// Avaliação financeira do reembolso. Lê o Asaas na hora; nunca confia só no que está salvo.
// O vínculo é provado pela cobrança gravada na própria inscrição no checkout (âncora direta).
// CPF coincidente sozinho NUNCA prova vínculo: ele só confirma que a pagadora é a participante.
import { gestaoError } from './gestaoAccess.js';

const ASAAS = 'https://api.asaas.com/v3';
export const digits = (v) => String(v ?? '').replace(/\D/g, '');
const cents = (v) => Math.round(Number(v || 0) * 100);
const norm = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');

export const SITUACOES = {
  sem_reembolso: 'Sem reembolso',
  em_conferencia: 'Solicitação em conferência (resposta do Asaas não confirmada)',
  aguardando_autorizacao: 'Aguardando autorização no Asaas',
  em_processamento: 'Reembolso solicitado: em processamento no Asaas',
  concluido: 'Reembolso concluído',
  parcial: 'Reembolso parcial registrado no Asaas',
  falhou: 'Última solicitação não foi aceita pelo Asaas',
  em_revisao: 'Encaminhado para revisão financeira',
};

export const REVISAO = {
  presenteada: 'Compra envolve presenteada',
  multiplas_vagas: 'A cobrança financia mais de uma vaga',
  pagamento_compartilhado: 'A mesma cobrança aparece em outra inscrição',
  pagamento_terceiro: 'Pagamento feito por outra pessoa',
  sem_cpf_para_conferir: 'Inscrição sem CPF para conferir a pagadora',
  duplicidade: 'Inscrição marcada como cópia de outra',
  vinculo_inconsistente: 'Vaga não está confirmada pela conciliação',
  sem_ancora: 'Inscrição do Asaas sem cobrança gravada',
  referencia_divergente: 'Referência da cobrança não corresponde à inscrição',
  valor_divergente: 'Valor no Asaas diferente do valor da inscrição',
  parcelado: 'Cartão parcelado exige conferência manual',
  camisa_na_mesma_compra: 'Camisa paga na mesma cobrança',
  caravana: 'Compra feita pela caravana',
  forma_nao_estornavel: 'Forma de pagamento sem estorno pelo sistema',
  status_nao_estornavel: 'Situação do pagamento no Asaas exige conferência',
};

let configuredApiKey = null;
export function setAsaasKey(key) {
  if (key) configuredApiKey = key;
}

export async function asaas(path, init = {}, customKey = null) {
  const key = customKey || configuredApiKey ||
    (typeof Deno !== 'undefined' ? Deno.env?.get('ASAAS_API_KEY') : undefined) ||
    (typeof process !== 'undefined' ? (process.env?.ASAAS_API_KEY || globalThis?.process?.env?.ASAAS_API_KEY) : undefined);

  if (!key) throw gestaoError(503, 'ASAAS_NOT_CONFIGURED', 'Asaas não configurado.');
  const res = await fetch(ASAAS + path, {
    ...init,
    headers: { access_token: key, 'Content-Type': 'application/json', ...(init.headers || {}) },
    redirect: 'error',
    signal: AbortSignal.timeout(15000)
  });
  return { status: res.status, ok: res.ok, json: await res.json().catch(() => null) };
}

async function asaasGet(path, customKey = null) {
  const r = await asaas(path, {}, customKey);
  if (!r.ok) throw gestaoError(502, 'ASAAS_HTTP_' + r.status, 'Não foi possível consultar o Asaas agora. Nada foi alterado.');
  return r.json;
}

const LOG_CODIGO = {
  pendente: 'em_conferencia',
  incerto: 'em_conferencia',
  solicitado: 'em_processamento',
  em_processamento: 'em_processamento',
  aguardando_autorizacao: 'aguardando_autorizacao',
  concluido: 'concluido',
  parcial: 'parcial',
  falhou: 'falhou',
  revisao: 'em_revisao'
};

export async function logsReembolso(S, id) {
  const rows = await S.EventoM31ActionLog.filter({ entidade_id: id, modulo: 'financeiro' }, '-created_date', 40);
  return rows.filter((l) => /^Reembolso/.test(l.acao || '') && LOG_CODIGO[l.resultado]);
}

export function situacaoPorLogs(logs) {
  if (logs.some((l) => ['pendente', 'incerto'].includes(l.resultado)) && !logs.some((l) => ['concluido', 'em_processamento', 'solicitado', 'parcial', 'aguardando_autorizacao'].includes(l.resultado))) {
    const l = logs.find((x) => ['pendente', 'incerto'].includes(x.resultado));
    return { codigo: 'em_conferencia', rotulo: SITUACOES.em_conferencia, data: l.created_date };
  }
  const l = logs[0];
  const codigo = l ? LOG_CODIGO[l.resultado] : 'sem_reembolso';
  return { codigo, rotulo: SITUACOES[codigo], data: l?.created_date || null };
}

// Ação crítica pendente no Asaas: a operação existe, mas NÃO foi concluída.
// Enquanto este estado existir, nenhum novo estorno pode ser solicitado.
const AUTORIZACAO_CRITICA = 'AWAITING_CRITICAL_ACTION_AUTHORIZATION';
export const aguardandoAutorizacaoCritica = (pay, refunds) =>
  pay?.status === AUTORIZACAO_CRITICA || refunds.some((r) => String(r.status || '').toUpperCase() === AUTORIZACAO_CRITICA);

function situacaoAsaas(pay, refunds, logs) {
  const done = refunds.filter((r) => r.status === 'DONE');
  const doneSum = done.reduce((s, r) => s + cents(r.value), 0);
  const ultimo = refunds[0] || null;
  const base = { data: ultimo?.data || null, comprovante: done.find((r) => r.comprovante)?.comprovante || null };
  if (pay.status === 'REFUNDED' || (done.length && doneSum >= cents(pay.value))) return { codigo: 'concluido', ...base };
  // Autorização exigida pelo Asaas vem antes da leitura genérica de "AWAITING":
  // o valor ainda não voltou e o comprovante não pode existir.
  if (aguardandoAutorizacaoCritica(pay, refunds)) return { codigo: 'aguardando_autorizacao', data: ultimo?.data || null, comprovante: null };
  if (['REFUND_REQUESTED', 'REFUND_IN_PROGRESS'].includes(pay.status) || refunds.some((r) => /^(PENDING|AWAITING)/.test(r.status || ''))) return { codigo: 'em_processamento', ...base };
  if (done.length) return { codigo: 'parcial', ...base };
  return { ...situacaoPorLogs(logs), comprovante: null };
}

export async function sha256(text) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function avaliarReembolso(S, insc, customApiKey = null) {
  const logs = await logsReembolso(S, insc.id);
  const revisao = new Set();
  if (insc.origem_pagamento !== 'asaas') {
    const s = situacaoPorLogs(logs);
    return { logs, situacao: { ...s, rotulo: SITUACOES[s.codigo] }, elegivel: false, bloqueio: 'Pagamento fora do Asaas: o reembolso não é feito pelo sistema.', revisao: [], checks: [], pagamento: null, fingerprint: null };
  }
  if (!/^pay_[A-Za-z0-9]+$/.test(insc.asaas_payment_id || '')) {
    const s = situacaoPorLogs(logs);
    return { logs, situacao: { ...s, rotulo: SITUACOES[s.codigo] }, elegivel: false, bloqueio: null, revisao: [{ codigo: 'sem_ancora', rotulo: REVISAO.sem_ancora }], checks: [], pagamento: null, fingerprint: null };
  }
  const pay = await asaasGet('/payments/' + insc.asaas_payment_id, customApiKey);
  const refunds = ((await asaasGet('/payments/' + pay.id + '/refunds', customApiKey))?.data || [])
    .map((r) => ({ status: r.status, value: r.value, data: r.refundDate || r.dateCreated || null, comprovante: r.transactionReceiptUrl || null }));
  const customer = pay.customer ? await asaasGet('/customers/' + pay.customer, customApiKey).catch(() => null) : null;
  const mesmaCobranca = await S.EventoM31Inscricao.filter({ asaas_payment_id: pay.id }, '-created_date', 3);

  const cpf = digits(insc.cpf);
  const pagadorCpf = digits(customer?.cpfCnpj);
  const ref = String(pay.externalReference || '');
  const refOk = ref === insc.codigo_inscricao || (cpf.length === 11 && ref.startsWith(cpf + '-M31FILHAS'));
  const esperado = insc.valor_cobrado ?? insc.asaas_total_value ?? insc.valor_pago;
  const valorOk = esperado != null && cents(pay.value) === cents(esperado);
  const recebido = ['RECEIVED', 'CONFIRMED'].includes(pay.status) && !pay.deleted;

  if (insc.presenteado_id || insc.presenteado_por_id || insc.cadastro_pendente || insc.presenteado_whatsapp) revisao.add('presenteada');
  if (Array.isArray(insc.financia_vagas_ids) && insc.financia_vagas_ids.length) revisao.add('multiplas_vagas');
  if (mesmaCobranca.length !== 1) revisao.add('pagamento_compartilhado');
  if (insc.duplicada_de_id) revisao.add('duplicidade');
  if (insc.estado_canonico !== 'confirmada') revisao.add('vinculo_inconsistente');
  if (insc.origem_inscricao === 'CARAVANA' || insc.tipo === 'caravana') revisao.add('caravana');
  if (pay.installment || insc.asaas_installment_id) revisao.add('parcelado');
  if (insc.comprou_camisa && insc.camisa_status !== 'cancelada') revisao.add('camisa_na_mesma_compra');
  if (!refOk) revisao.add('referencia_divergente');
  if (!valorOk) revisao.add('valor_divergente');
  if (cpf.length !== 11) revisao.add('sem_cpf_para_conferir');
  else if (pagadorCpf !== cpf || (insc.pagador_nome && norm(insc.pagador_nome) !== norm(insc.nome))) revisao.add('pagamento_terceiro');
  if (!['PIX', 'CREDIT_CARD'].includes(pay.billingType)) revisao.add('forma_nao_estornavel');
  const situacao = situacaoAsaas(pay, refunds, logs);
  if (!recebido && situacao.codigo === 'sem_reembolso') revisao.add('status_nao_estornavel');

  const checks = [
    { item: 'Pagamento original localizado no Asaas', ok: pay.id === insc.asaas_payment_id && !pay.deleted, detalhe: pay.id },
    { item: 'Pagamento recebido', ok: recebido, detalhe: pay.status },
    { item: 'Vínculo com a inscrição', ok: refOk && mesmaCobranca.length === 1, detalhe: 'Cobrança gravada nesta inscrição no checkout; referência ' + (ref || 'ausente') },
    { item: 'Valor confere', ok: valorOk, detalhe: `Asaas R$ ${Number(pay.value || 0).toFixed(2)} · inscrição R$ ${Number(esperado || 0).toFixed(2)}` },
    { item: 'Pagadora é a própria participante', ok: cpf.length === 11 && pagadorCpf === cpf && !revisao.has('pagamento_terceiro'), detalhe: customer?.name || 'Pagadora não identificada' },
    { item: 'Sem estornos anteriores', ok: refunds.every((r) => ['CANCELLED'].includes(r.status)), detalhe: refunds.length ? `${refunds.length} registro(s) no Asaas` : 'Nenhum' },
  ];
  const fingerprint = await sha256(JSON.stringify({
    pay: [pay.id, pay.status, pay.value, pay.customer, pay.billingType, pay.externalReference, pay.paymentDate, pay.installment, pay.deleted],
    refunds, insc: [insc.id, insc.asaas_payment_id, cpf, insc.nome, insc.presenteado_id, insc.presenteado_por_id, insc.financia_vagas_ids, insc.duplicada_de_id, insc.estado_canonico],
  }));
  const lista = [...revisao].map((codigo) => ({ codigo, rotulo: REVISAO[codigo] }));
  const elegivel = ['sem_reembolso', 'falhou', 'em_revisao'].includes(situacao.codigo) && lista.length === 0 && checks.every((c) => c.ok);
  return {
    logs, situacao: { ...situacao, rotulo: SITUACOES[situacao.codigo] }, elegivel, bloqueio: null, revisao: lista, checks, fingerprint,
    pagamento: { id: pay.id, forma: pay.billingType, valor: pay.value, liquido: pay.netValue, status: pay.status, pago_em: pay.paymentDate || pay.confirmedDate || null,
      pagador_nome: customer?.name || null, pagador_cpf: pagadorCpf ? `***.${pagadorCpf.slice(3, 6)}.***-${pagadorCpf.slice(-2)}` : null, referencia: ref || null },
    // Retrato do reembolso para a ficha: nunca declara concluído sem confirmação do provedor.
    reembolso: {
      estado: situacao.codigo,
      rotulo: SITUACOES[situacao.codigo],
      aguardando_autorizacao: situacao.codigo === 'aguardando_autorizacao',
      reembolsado: situacao.codigo === 'concluido',
      valor: pay.value,
      forma: pay.billingType,
      comprovante: situacao.codigo === 'concluido' || situacao.codigo === 'parcial' ? (situacao.comprovante || null) : null,
      mensagem: situacao.codigo === 'aguardando_autorizacao'
        ? 'Aguardando autorização de ação crítica no Asaas'
        : situacao.codigo === 'concluido' ? null : 'Ainda não reembolsado. Comprovante indisponível.',
    },
  };
}
