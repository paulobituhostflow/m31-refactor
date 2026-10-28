import { base44 } from '@/api/base44Client';

export const GESTAO_FIELDS = ['nome', 'whatsapp', 'email', 'cpf', 'cidade', 'estado'];
export const EMPTY_GESTAO_FIELDS = Object.fromEntries(GESTAO_FIELDS.map((field) => [field, '']));

export function onlyGestaoFields(input = {}) {
  return Object.fromEntries(GESTAO_FIELDS.map((field) => [field, typeof input[field] === 'string' ? input[field] : '']));
}

// A resposta da IA nunca sobrescreve um valor existente ou uma edição concorrente.
export function mergeGestaoSuggestions(current, start, revisions, startRevisions, suggestions) {
  const next = { ...current };
  for (const field of GESTAO_FIELDS) {
    if (!String(start[field] || '').trim() && current[field] === start[field]
      && revisions[field] === startRevisions[field] && typeof suggestions?.[field] === 'string') {
      next[field] = suggestions[field];
    }
  }
  return next;
}

export function gestaoError(error) {
  if (error?.status === 429 || /rate limit/i.test(String(error?.message || ''))) return 'O limite de consultas foi atingido. Aguarde um pouco e use Atualizar. Os dados salvos permanecem registrados.';
  if (error?.code === 'CONFLICT') return 'Outra pessoa alterou esta inscrição. Atualize a ficha antes de salvar novamente.';
  if ([401, 403].includes(error?.status)) return 'Seu acesso mudou ou a sessão expirou. Entre novamente para continuar.';
  return error?.message || 'Não foi possível concluir. Seus dados permanecem no formulário.';
}

export function gestaoStatus(value) {
  const labels = {
    aprovado: 'Aprovado',
    gratuito: 'Gratuito',
    pendente: 'Pendente',
    checkout_pendente: 'Checkout pendente',
    checkout_abandonado: 'Checkout abandonado',
    cancelado: 'Cancelado',
    confirmada: 'Confirmada',
    regularizada: 'Regularizada',
    incompleta: 'Cadastro incompleto',
    revisar: 'Em revisão',
    nao_confirmada: 'Não confirmada',
    em_conciliacao: 'Em conciliação',
    oficial: 'Regularizada',
    enviado: 'Enviado',
    enviado_com_sucesso: 'Enviado com sucesso',
    falha: 'Falha no envio',
    falha_envio: 'Falha no envio',
    nao_enviado: 'Não enviado',
    enviando: 'Enviando',
    aguardando: 'Aguardando',
    reenvio_pendente: 'Reenvio pendente'
  };
  return typeof value === 'string' && value.trim() ? labels[value] || value.replaceAll('_', ' ') : 'Não informado';
}

export function gestaoConferencia(row) {
  const registered = row?.conferencia?.conferida ?? row?.conferida_manualmente;
  return registered === true ? 'Conferida' : registered === false ? 'Não conferida' : 'Não informada';
}

export function gestaoQrModel(row = {}) {
  function imageUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
    } catch {
      return null;
    }
  }
  const image = imageUrl(row.qrcode_url) || imageUrl(row.qrcode_token);
  let payload = null;
  if (typeof row.qrcode_token === 'string' && row.qrcode_token) {
    if (row.qrcode_token.startsWith('M31|')) payload = row.qrcode_token;
    else {
      try {
        if (atob(row.qrcode_token).startsWith('M31|')) payload = row.qrcode_token;
      } catch {
        /* URL ou token desconhecido. */
      }
    }
  }
  // O emissor e o leitor existentes também usam codigo_inscricao diretamente.
  if (!payload && row.qr_disponivel === true && ['aprovado', 'gratuito'].includes(row.status_pagamento)
    && typeof row.codigo_inscricao === 'string' && row.codigo_inscricao.trim()) {
    payload = row.codigo_inscricao;
  }
  return { image, payload, available: row.qr_disponivel !== false && Boolean(image || payload) };
}

function responseError(data, status) {
  const body = data && typeof data === 'object' ? data : {};
  const message = typeof body.message === 'string' ? body.message : typeof body.error === 'string' ? body.error : 'Não foi possível concluir a solicitação.';
  const error = new Error(message);
  error.status = Number.isFinite(Number(status)) ? Number(status) : undefined;
  error.code = typeof body.code === 'string' ? body.code : typeof body.error === 'string' ? body.error : undefined;
  error.duplicidades = Array.isArray(body.duplicidades) ? body.duplicidades : [];
  return error;
}

export async function gestaoRequest(functionName, payload = {}) {
  let response;
  try {
    response = await base44.functions.invoke(functionName, payload);
  } catch (failure) {
    throw responseError(failure?.response?.data, failure?.response?.status);
  }
  const data = response?.data ?? response ?? {};
  if (data?.ok === false || data?.error) throw responseError(data, response?.status);
  return data;
}

export function gestaoReembolso(sessionId, action, payload = {}) {
  return gestaoRequest('m31ReembolsoInscricao', { ...payload, action, session_id: sessionId });
}

export function gestaoOperation(sessionId, action, payload = {}) {
  return gestaoRequest('m31OperarParticipante', { ...payload, action, session_id: sessionId });
}

export function gestaoFinancialLabel(inscricao) {
  const f = inscricao?.financeiro, a = f?.ajuste, s = f?.status_provedor;
  if (a?.disputed > 0 || ['CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE', 'AWAITING_CHARGEBACK_REVERSAL'].includes(s)) return 'Pagamento contestado';
  if (s === 'REFUNDED' || (a?.total > 0 && a.refunded >= a.total)) return 'Estornado';
  if (a?.refunded > 0) return 'Estorno parcial';
  if (a?.refund_pending > 0 || ['REFUND_REQUESTED', 'REFUND_IN_PROGRESS'].includes(s)) return 'Estorno em andamento';
  if (a && s === 'PENDING') return 'Baixa financeira desfeita';
  return gestaoStatus(inscricao?.status_pagamento);
}

export function participacaoStatus(row) {
  const state = row?.status_inscricao ?? row?.estado_canonico;
  const excluded = !row || ['fora_do_universo', 'cancelada', 'cancelado'].includes(state)
    || row.status_pagamento === 'cancelado' || Boolean(row.duplicada_de_id)
    || row.classificacao_registro === 'teste' || row.is_sample === true;
  if (excluded) return { confirmed: false, manual: false, tone: 'inactive', label: row?.status_pagamento === 'cancelado' ? 'Inscrição cancelada' : 'Participação indisponível' };
  const manual = (row.conferencia?.conferida ?? row.conferida_manualmente) === true;
  const confirmed = manual || ['confirmada', 'isenta'].includes(state);
  return { confirmed, manual, tone: confirmed ? 'confirmed' : 'pending', label: confirmed ? 'Participação confirmada' : 'Aguardando confirmação' };
}

export const TIPOS_INGRESSO = Object.freeze({
  individual: 'Individual',
  presenteada: 'Presenteada',
  caravana: 'Caravana',
  cortesia: 'Cortesia',
  voluntaria: 'Voluntária',
  doacao: 'Doação'
});

export function tipoIngresso(row, giftIds = new Set()) {
  if (row.presente || row.presenteado_por_id || row.cadastro_pendente || String(row.codigo_inscricao || '').startsWith('M31-PRESENTE-') || giftIds.has(row.id)) return 'presenteada';
  if (String(row.origem_inscricao || '').toUpperCase() === 'CORTESIA') return 'cortesia';
  if (row.tipo === 'voluntario') return 'voluntaria';
  if (row.caravana_id || row.tipo === 'caravana') return 'caravana';
  return row.tipo === 'doacao' ? 'doacao' : 'individual';
}
