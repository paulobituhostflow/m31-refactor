export const SHIRT_SIZES = ['PP', 'P', 'M', 'G', 'GG', 'XGG'];

const PRIORITY = {
  sem_tamanho: 0,
  revisar_pagamento: 1,
  pagamento_pendente: 2,
  a_entregar: 3,
  entregue: 4,
};

function volunteerPaymentStatus(bucket) {
  if (bucket === 'official') return 'pago';
  if (['pending', 'recovery'].includes(bucket)) return 'pendente';
  return 'revisar';
}

function salePaymentStatus(inscricao) {
  if (inscricao.camisa_status === 'confirmada' && inscricao.camisa_pagamento_id) return 'pago';
  if (['selecionada', 'pagamento_pendente'].includes(inscricao.camisa_status)) return 'pendente';
  return 'revisar';
}

function situationFor({ tamanho, pagamento_status, entregue }) {
  if (!tamanho) return 'sem_tamanho';
  if (pagamento_status === 'revisar') return 'revisar_pagamento';
  if (pagamento_status !== 'pago') return 'pagamento_pendente';
  return entregue ? 'entregue' : 'a_entregar';
}

function savedShirtItems(inscricao) {
  if (Array.isArray(inscricao.camisas) && inscricao.camisas.length > 0) return inscricao.camisas;
  if (inscricao.comprou_camisa || inscricao.tamanho_camisa) {
    return [{ modelo: 'filhas', tamanho: inscricao.tamanho_camisa || '' }];
  }
  return [];
}

export function buildOperationalShirtRows({ inscricoes = [], voluntarios = [], bucketById = {} }) {
  const registrationById = new Map(inscricoes.map((row) => [row.id, row]));
  const rows = [];

  for (const volunteer of voluntarios) {
    if (volunteer.status === 'inativo') continue;
    const registration = registrationById.get(volunteer.inscricao_id);
    const pagamento_status = volunteerPaymentStatus(registration ? bucketById[registration.id] : null);
    const entregue = volunteer.camisa_entregue === true;
    const tamanho = volunteer.tamanho_camiseta || '';
    rows.push({
      row_id: `voluntaria:${volunteer.id}`,
      registro_tipo: 'voluntaria',
      registro_id: volunteer.id,
      inscricao_id: registration?.id || null,
      item_index: null,
      nome: volunteer.nome || registration?.nome || 'Sem nome',
      whatsapp: volunteer.whatsapp || registration?.whatsapp || '',
      origem: volunteer.setor || 'Equipe',
      modelo: 'equipe',
      tamanho,
      pagamento_status,
      entregue,
      entregue_em: volunteer.camisa_entregue_em || null,
      entregue_por: volunteer.camisa_entregue_por || null,
      observacao: volunteer.camisa_observacao || volunteer.observacoes || '',
      situacao: situationFor({ tamanho, pagamento_status, entregue }),
    });
  }

  for (const inscricao of inscricoes) {
    const items = savedShirtItems(inscricao);
    if (items.length === 0) continue;
    const pagamento_status = salePaymentStatus(inscricao);
    items.forEach((item, item_index) => {
      const entregue = item.entregue === true;
      const tamanho = item.tamanho || '';
      rows.push({
        row_id: `inscricao:${inscricao.id}:${item_index}`,
        registro_tipo: 'inscricao',
        registro_id: inscricao.id,
        inscricao_id: inscricao.id,
        pedido_id: `inscricao:${inscricao.id}`,
        item_index,
        nome: inscricao.nome || 'Sem nome',
        whatsapp: inscricao.whatsapp || '',
        origem: inscricao.tipo === 'caravana' ? 'Caravana' : 'Venda',
        modelo: item.modelo || 'filhas',
        cor: item.cor || '',
        quantidade_item: Math.max(1, Math.floor(Number(item.quantidade) || 1)),
        tamanho,
        pagamento_status,
        entregue,
        entregue_em: item.entregue_em || null,
        entregue_por: item.entregue_por || null,
        observacao: item.observacao || inscricao.camisa_pendencia || '',
        situacao: situationFor({ tamanho, pagamento_status, entregue }),
      });
    });
  }

  return rows.sort((a, b) => {
    const priority = (PRIORITY[a.situacao] ?? 99) - (PRIORITY[b.situacao] ?? 99);
    return priority || a.nome.localeCompare(b.nome, 'pt-BR');
  });
}

export function summarizeOperationalShirts(rows = []) {
  return {
    total: rows.length,
    pagas: rows.filter((row) => row.pagamento_status === 'pago').length,
    a_entregar: rows.filter((row) => row.situacao === 'a_entregar').length,
    entregues: rows.filter((row) => row.situacao === 'entregue').length,
    sem_tamanho: rows.filter((row) => row.situacao === 'sem_tamanho').length,
    precisam_acao: rows.filter((row) => row.situacao !== 'entregue').length,
  };
}

export function buildShirtRecordPatch({ row, record, action, tamanho, modelo, cor, operatorName, now = new Date().toISOString() }) {
  if (!row || !record) throw new Error('shirt_row_not_found');

  if (action === 'ajustar_tamanho' || action === 'ajustar_item') {
    if (!SHIRT_SIZES.includes(tamanho)) throw new Error('invalid_shirt_size');
    if (action === 'ajustar_item') {
      if (row.pagamento_status !== 'pago') throw new Error('payment_not_confirmed');
      if (!['filhas', 'milagres', 'jesus'].includes(modelo)) throw new Error('invalid_shirt_model');
      if (cor && (modelo !== 'jesus' || !['preta', 'cereja'].includes(cor))) throw new Error('invalid_shirt_color');
    }
    if (row.registro_tipo === 'voluntaria') return { tamanho_camiseta: tamanho };
    const camisas = savedShirtItems(record).map((item, index) =>
      index === row.item_index ? { ...item, tamanho, ...(action === 'ajustar_item' ? { modelo, cor: cor || '' } : {}) } : item,
    );
    return { camisas };
  }

  if (action === 'confirmar_entrega') {
    if (row.pagamento_status !== 'pago') throw new Error('payment_not_confirmed');
    if (row.entregue) return { noop: true };
    if (!operatorName) throw new Error('operator_required');
    if (row.registro_tipo === 'voluntaria') {
      return { camisa_entregue: true, camisa_entregue_em: now, camisa_entregue_por: operatorName };
    }
    const camisas = savedShirtItems(record).map((item, index) =>
      index === row.item_index
        ? { ...item, entregue: true, entregue_em: now, entregue_por: operatorName }
        : item,
    );
    return { camisas };
  }

  throw new Error('unsupported_shirt_action');
}

