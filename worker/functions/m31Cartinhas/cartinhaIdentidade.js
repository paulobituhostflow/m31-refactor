const nome = value => String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
const cpf = value => String(value || '').replace(/\D/g, '');
export const snapshotTitular = row => ({ nome: row.nome || '', cpf: cpf(row.cpf) });
const identity = row => JSON.stringify([row.id, nome(row.nome), cpf(row.cpf)]);
export async function titularRef(row) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity(row)));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
export function cartaFisicaConcluida(row) {
  const titular = row.cartinha_titular;
  return row.cartinha_suporte === 'fisica' && ['pronta', 'entregue'].includes(row.cartinha_status)
    && !!row.cartinha_fisica_confirmada_em && !!titular
    && nome(titular.nome) === nome(row.nome) && cpf(titular.cpf) === cpf(row.cpf);
}
export function precisaRevisar(row) {
  if (cartaFisicaConcluida(row)) return false;
  if (!String(row.cartinha_texto || '').trim()) return ['pronta','entregue'].includes(row.cartinha_status);
  const titular = row.cartinha_titular;
  return !titular || nome(titular.nome) !== nome(row.nome) || cpf(titular.cpf) !== cpf(row.cpf);
}
export function historicoAoSalvar(row, timestamp) {
  const historico = Array.isArray(row.cartinha_historico) ? [...row.cartinha_historico] : [];
  if (!precisaRevisar(row)) return historico;
  historico.push({
    arquivada_em: timestamp, motivo: row.cartinha_titular ? 'titular_alterada' : 'vinculo_legado_nao_validado',
    titular_anterior: row.cartinha_titular || { nome: 'Vínculo anterior não validado' },
    texto: row.cartinha_texto, status: row.cartinha_status || 'pendente',
    responsavel: row.cartinha_responsavel, atualizada_em: row.cartinha_atualizada_em,
    entregue_em: row.cartinha_entregue_em, versao: row.cartinha_versao ?? 0,
  });
  return historico;
}
export function historicoPrivado(row) {
  return historicoAoSalvar(row, null).map(h => ({
    nome: h.titular_anterior?.nome || 'Vínculo anterior não validado', texto: h.texto || '',
    status: h.status, suporte: h.suporte || 'digital', lote_id: h.lote_id, responsavel: h.responsavel, atualizada_em: h.atualizada_em,
    arquivada_em: h.arquivada_em, entregue_em: h.entregue_em, motivo: h.motivo,
  }));
}
