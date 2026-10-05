/** Private letter transition committed atomically with the new registration holder. */
export function prepararCartinhaTransferencia(inscricao, transferenciaId, agora) {
  const versao = inscricao.cartinha_versao ?? 0;
  const historico = inscricao.cartinha_historico ?? [];
  const query = {
    id: inscricao.id,
    cpf: inscricao.cpf ?? null,
    nome: inscricao.nome,
    status_pagamento: inscricao.status_pagamento ?? null,
    ...(versao === 0 ? {
      $or: [
        { cartinha_versao: 0 },
        { cartinha_versao: null },
        { cartinha_versao: { $exists: false } },
      ],
    } : { cartinha_versao: versao }),
  };
  return {
    query,
    patch: {
      cartinha_historico: [...historico, {
        transferencia_id: transferenciaId,
        arquivada_em: agora,
        titular_anterior: {
          nome: inscricao.nome || null,
          cpf: inscricao.cpf || null,
          whatsapp: inscricao.whatsapp || null,
          email: inscricao.email || null,
        },
        texto: inscricao.cartinha_texto || '',
        suporte: inscricao.cartinha_suporte || 'digital',
        tipo_destinataria: inscricao.cartinha_tipo_destinataria || null,
        primeiro_nome: inscricao.cartinha_primeiro_nome || null,
        assinatura: inscricao.cartinha_assinatura || null,
        entrada_id: inscricao.cartinha_entrada_id || null,
        item_id: inscricao.cartinha_item_id || null,
        fisica_confirmada_em: inscricao.cartinha_fisica_confirmada_em || null,
        status: inscricao.cartinha_status || 'pendente',
        responsavel: inscricao.cartinha_responsavel || null,
        atualizada_em: inscricao.cartinha_atualizada_em || null,
        entregue_em: inscricao.cartinha_entregue_em || null,
        versao,
      }],
      cartinha_texto: '',
      cartinha_titular: null,
      cartinha_suporte: 'digital',
      cartinha_fisica_confirmada_em: null,
      cartinha_status: String(inscricao.cartinha_texto || '').trim() || ['pronta', 'entregue'].includes(inscricao.cartinha_status) ? 'revisar_cartinha' : 'pendente',
      cartinha_dias_concluidos: [],
      cartinha_primeiro_nome: null, cartinha_assinatura: null, cartinha_formato_versao: null,
      cartinha_tipo_destinataria: null,
      cartinha_conhecida_da_ju: null, cartinha_conhecida_titular_ref: null,
      cartinha_personalizada: false,
      cartinha_entrada_id: null, cartinha_item_id: null, cartinha_audio_uri: null,
      cartinha_modo: 'nominal',
      cartinha_espelho_pendente: true,
      cartinha_responsavel: null,
      cartinha_atualizada_em: agora,
      cartinha_entregue_em: null,
      cartinha_versao: versao + 1,
    },
  };
}
