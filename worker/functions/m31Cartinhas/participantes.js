// Reutiliza a regra do Resumo Operacional. O bundle Base44 exige cópia local do módulo.
import { classifyOperationalData, bucketFor } from './operationalRules.js';
import { ehInscritaReconhecida } from './participacaoReconhecida.js';
import { ehInscritaDaMeta } from './cartinhaPadrao.js';

// Elegibilidade de escrita; as listas de inscritas e voluntárias são segregadas abaixo.
// Qualidade cadastral não exclui uma pessoa identificada; cadastro_pendente
// continua protegendo vagas presenteadas cuja destinatária não foi confirmada.
export function participanteDasCartinhas(row) {
  if (!row || row.status_pagamento === 'cancelado' || row.duplicada_de_id || row.classificacao_registro === 'teste') return false;
  if (row.cadastro_pendente === true || !String(row.nome || '').trim()) return false;
  return ehInscritaReconhecida(row) || bucketFor(row) === 'official';
}

export function destinatariaRequerConferencia(row) {
  return row?.cartinha_vinculo_bloqueado === true || row?.evidencia_canonica === 'identidade_diverge_da_evidencia_documental';
}
const motivoConflito = {
  financial_anchor_conflict: 'Mais de uma inscrição ligada à mesma compra. A gestão precisa conciliar.',
  cpf_conflict: 'Possível duplicidade de participante. A gestão precisa confirmar a inscrição correta.',
  whatsapp_conflict: 'Identidade da participante precisa de conferência.',
  gift_conflict: 'Vínculo da presenteada precisa de conferência.',
};
function normalizarTelefone(valor) {
  const digits = String(valor || '').replace(/\D/g, '');
  const nacional = digits.startsWith('55') && digits.length === 13 ? digits.slice(2) : digits;
  if (!/^\d{2}9\d{8}$/.test(nacional) || /^(\d)\1+$/.test(nacional)) return null;
  return `55${nacional}`;
}
async function fetchAll(entity) {
  const rows = new Map();
  for (let skip = 0; ; skip += 500) {
    const page = await entity.filter({}, '-id', 500, skip);
    if (!Array.isArray(page)) throw new Error('cartinhas_lista_resposta_invalida');
    const before = rows.size;
    for (const row of page) {
      if (!row || typeof row.id !== 'string') throw new Error('cartinhas_registro_invalido');
      if (rows.has(row.id)) throw new Error('cartinhas_paginacao_inconsistente');
      rows.set(row.id, row);
    }
    if (page.length < 500) return [...rows.values()];
    if (rows.size === before || skip >= 50000) throw new Error('cartinhas_paginacao_inconsistente');
  }
}
export async function carregarParticipantes(S) {
  // A validade já foi persistida pela autoridade canônica. Não consultar
  // financeiro/conciliação novamente para listar ou escrever cartas.
  const all = await fetchAll(S.EventoM31Inscricao);
  const classified = classifyOperationalData({ inscricoes: all });
  const byId = new Map(all.map(row => [row.id,row]));
  const inscricoes = [], voluntarias = [], pendencias = [], oficialIds = new Set();
  for (const row of all) {
    const bucket = classified.bucketById[row.id];
    if (bucket === 'official') oficialIds.add(row.id);
    if (participanteDasCartinhas(row)) {
      if (ehInscritaDaMeta(row)) inscricoes.push(row);
      else if (row.tipo === 'voluntario') voluntarias.push(row);
    } else if (bucket === 'official' || ehInscritaReconhecida(row)) {
      pendencias.push({inscricao:row,motivo:'Participação reconhecida; confirmar identidade ou cadastro da destinatária sem alterar a situação financeira.'});
    } else if (bucket === 'reconciliation') {
      const conflict = classified.conflicts.find(c=>c.ids.includes(row.id));
      pendencias.push({inscricao:row,motivo:motivoConflito[conflict?.reason] || 'Inscrição precisa de conciliação pela gestão antes de liberar a cartinha.'});
    } else if (row.tipo === 'doacao' && ['aprovado','gratuito'].includes(row.status_pagamento) && row.classificacao_registro !== 'teste') {
      pendencias.push({inscricao:row,motivo:'Confirmar a participante vinculada à doação. A compradora só recebe carta se também tiver uma vaga própria.'});
    }
  }
  return {inscricoes,voluntarias,pendencias,oficialIds,byId};
}
