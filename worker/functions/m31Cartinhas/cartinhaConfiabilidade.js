import { snapshotTitular, precisaRevisar } from './cartinhaIdentidade.js';
import { ASSINATURA_CARTINHA, ehInscritaDaMeta, tipoDestinatariaCartinha, primeiroNomeCartinha, formatarCartinhaConcluida } from './cartinhaPadrao.js';

import { diaCartinha, REGRA_CICLO_CARTINHAS } from './cartinhaCiclo.js';
export { diaCartinha } from './cartinhaCiclo.js';

const STATUS = new Set(['pendente', 'em_elaboracao', 'pronta', 'entregue', 'revisar_cartinha']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
}

/** Texto simples. Não interpreta HTML nem modifica silenciosamente a voz da autora. */
export function validarSalvamento(body) {
  if (!body || typeof body.texto !== 'string' || body.texto.length > 50000 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body.texto) ||
      !STATUS.has(body.status) || !Number.isSafeInteger(body.versao) || body.versao < 0 ||
      typeof body.titular_ref !== 'string' || !/^[a-f0-9]{64}$/.test(body.titular_ref) ||
      (body.id_transacao !== undefined && !UUID.test(body.id_transacao)) ||
      (body.suporte !== undefined && !['digital', 'fisica'].includes(body.suporte)) ||
      (body.confirmar_fisica !== undefined && typeof body.confirmar_fisica !== 'boolean') ||
      (body.lote_id !== undefined && !UUID.test(body.lote_id))) {
    throw Object.assign(new Error('Dados da cartinha inválidos.'), { status: 422 });
  }
  if (['pronta', 'entregue'].includes(body.status)) {
    if (body.suporte === 'fisica' ? body.confirmar_fisica !== true : !body.texto.trim()) {
      throw Object.assign(new Error('Cole o texto ou confirme explicitamente a carta física.'), { status: 422 });
    }
  }
  return { ...body, texto: body.texto.replace(/\r\n?/g, '\n') };
}

export async function identidadeOperacao(body) {
  const identity = [body.inscricao_id, body.versao, body.titular_ref, body.status, body.texto];
  // Preserva os hashes das operações anteriores a esta extensão.
  if (body.suporte !== undefined || body.confirmar_fisica !== undefined || body.lote_id !== undefined)
    identity.push(body.suporte || 'digital', body.confirmar_fisica === true, body.lote_id || null);
  const hash = await sha256(JSON.stringify(identity));
  // Compatibilidade com abas já abertas na versão anterior. Novas versões sempre enviam UUID.
  return { id: body.id_transacao || `compat-${hash}`, hash };
}

export function textoFinalSolicitado(current, body) {
  return ['pronta', 'entregue'].includes(body.status) && (body.suporte || 'digital') !== 'fisica'
    ? formatarCartinhaConcluida({ nomeCompleto: current.nome, texto: body.texto }) : body.texto;
}
export function statusAposEdicao(current, body) {
  const textoComparavel = textoFinalSolicitado(current, body);
  return ['pronta', 'entregue'].includes(current.cartinha_status) && (textoComparavel !== (current.cartinha_texto || '') || (body.suporte || 'digital') !== (current.cartinha_suporte || 'digital'))
    ? 'revisar_cartinha' : body.status;
}

/** Reutiliza o histórico privado como log/outbox; evento e texto são gravados no MESMO CAS. */
export function prepararVersao(current, body, operation, user, timestamp) {
  const versao = (current.cartinha_versao ?? 0) + 1;
  const status = statusAposEdicao(current, body);
  const textoFinal = textoFinalSolicitado(current, { ...body, status });
  const tipoDestinataria = tipoDestinatariaCartinha(current);
  const historico = Array.isArray(current.cartinha_historico) ? [...current.cartinha_historico] : [];
  const oldText = current.cartinha_texto || '';
  const oldVersion = current.cartinha_versao ?? 0;
  // Preserva também versões anteriores à adoção do log. Nunca inventa vínculo legado.
  if ((oldText || current.cartinha_fisica_confirmada_em) && !historico.some(h => h.versao === oldVersion && h.texto === oldText)) {
    historico.push({
      motivo: precisaRevisar(current) ? 'vinculo_anterior_requer_revisao' : 'versao_anterior',
      titular_anterior: current.cartinha_titular || { nome: 'Vínculo anterior não validado' },
      texto: oldText, status: current.cartinha_status || 'pendente', versao: oldVersion, suporte: current.cartinha_suporte || 'digital', fisica_confirmada_em: current.cartinha_fisica_confirmada_em || null,
      responsavel: current.cartinha_responsavel || null, atualizada_em: current.cartinha_atualizada_em || null,
      entregue_em: current.cartinha_entregue_em || null, arquivada_em: timestamp,
    });
  }
  const dias = Array.isArray(current.cartinha_dias_concluidos) ? [...current.cartinha_dias_concluidos] : [];
  const conclusaoExplicita = ehInscritaDaMeta(current) && status === 'pronta' && current.cartinha_status !== 'pronta' && current.cartinha_status !== 'entregue';
  if (conclusaoExplicita) {
    const dia = diaCartinha(timestamp);
    if (!dias.includes(dia)) dias.push(dia);
  }
  const evento = {
    id_transacao: operation.id, request_hash: operation.hash, inscricao_id: current.id,
    titular_ref: body.titular_ref, titular_anterior: snapshotTitular(current),
    motivo: body.suporte === 'fisica' && status === 'pronta' ? 'conclusao_fisica' : 'salvamento',
    texto: textoFinal, status, versao, suporte: body.suporte || 'digital',
    ...(textoFinal !== body.texto ? { texto_original: body.texto } : {}),
    tipo_destinataria: tipoDestinataria, primeiro_nome: primeiroNomeCartinha(current.nome),
    assinatura: ASSINATURA_CARTINHA, nome_destinataria: current.nome,
    tipo_mensagem: body.suporte === 'fisica' ? 'fisica' : 'texto',
    ...(body.lote_id ? { lote_id: body.lote_id } : {}),
    autora_id: user.id, autora_email: user.email, responsavel: user.full_name || user.email,
    // Trilha forense durável: como a versão nasceu. Não depende de inferir depois
    // pelo status, texto ou horário. O backend é a autoridade dessa classificação.
    forma_operacao: body.audit_forma || (body.lote_id ? 'lote' : body.suporte === 'fisica' ? 'fisica' : 'editor_nominal'),
    canal_operacao: 'm31Cartinhas_backend',
    conclusao_explicita: conclusaoExplicita, regra_ciclo: REGRA_CICLO_CARTINHAS,
    ...(conclusaoExplicita ? { ciclo_conclusao: diaCartinha(timestamp) } : {}),
    atualizada_em: timestamp, arquivada_em: timestamp,
    entregue_em: status === 'entregue' ? (current.cartinha_entregue_em || timestamp) : null,
  };
  historico.push(evento);
  return {
    cartinha_texto: textoFinal, cartinha_status: status, cartinha_versao: versao,
    cartinha_tipo_destinataria: tipoDestinataria, cartinha_assinatura: ASSINATURA_CARTINHA,
    cartinha_primeiro_nome: primeiroNomeCartinha(current.nome), cartinha_formato_versao: 1,
    cartinha_suporte: body.suporte || 'digital',
    cartinha_fisica_confirmada_em: body.suporte === 'fisica' && body.confirmar_fisica === true && ['pronta', 'entregue'].includes(status)
      ? (current.cartinha_fisica_confirmada_em || timestamp) : null,
    cartinha_responsavel: evento.responsavel, cartinha_atualizada_em: timestamp,
    cartinha_entregue_em: evento.entregue_em, cartinha_titular: snapshotTitular(current),
    cartinha_historico: historico, cartinha_dias_concluidos: dias,
    cartinha_espelho_pendente: true,
  };
}
