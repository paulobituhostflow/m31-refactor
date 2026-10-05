export const CARTINHAS_QUERY_KEY = ['m31cartinhas-privadas'];
export const CARTINHAS_VOLUNTARIAS_QUERY_KEY = ['m31cartinhas-voluntarias-privadas'];
export const cartinhaImprimivel = i => i.cartinha_suporte !== 'fisica' && i.cartinha_elegivel === true && !i.cartinha_revisao_necessaria && i.status_pagamento !== 'cancelado' && ['pronta', 'entregue'].includes(i.cartinha_status) && !!i.cartinha_texto?.trim();
export const cartinhaPorEscrever = i => ['pendente', 'em_elaboracao', 'revisar_cartinha'].includes(i.cartinha_status || 'pendente');
export function mesmoLoteCartinhas(a,b) {
  const signature = rows => JSON.stringify(rows.filter(cartinhaImprimivel).map(i=>[i.id,i.titular_ref,i.cartinha_versao,i.cartinha_status,i.cartinha_texto]).sort((x,y)=>String(x[0]).localeCompare(String(y[0]))));
  return signature(a) === signature(b);
}

export function cartinhasErrorStatus(error) { return error?.status || error?.response?.status; }
export function cartinhasErrorMessage(error) {
  const status = cartinhasErrorStatus(error);
  if (status === 409) return 'Esta cartinha mudou em outra sessão. Seu texto está preservado aqui. Copie-o antes de fechar e reabrir a cartinha para revisar a versão atual.';
  if (status === 401) return 'Sua sessão expirou. Copie o texto antes de entrar novamente.';
  if (status === 403) return 'Seu acesso às Cartinhas não foi autorizado.';
  if (status === 422) {
    const aviso = error?.response?.data?.error || error?.message || '';
    if (/^(Confirme a destinatária|Conclusão em lote em conferência|Distribuição em conferência)/.test(aviso)) return aviso;
    return 'Confira o texto e os dados antes de salvar. Cole o texto ou confirme que a carta física está concluída.';
  }
  return 'Não foi possível salvar. Seu texto continua nesta tela; tente novamente antes de sair.';
}

export function createCartinhasApi(invoke) {
  async function call(action, payload = {}) {
    const result = await invoke('m31Cartinhas', { action, ...payload });
    const data = result?.data;
    if (!data || typeof data !== 'object' || data.error) throw Object.assign(new Error(data?.error || 'Resposta inválida das Cartinhas.'), { status: 502 });
    if (['listar', 'listar_voluntarias'].includes(action) && (!Array.isArray(data.inscricoes) || !data.config || !data.user?.id)) throw Object.assign(new Error('Lista incompleta. Nenhuma contagem foi atualizada.'), { status: 502 });
    return data;
  }
  return {
    acesso: () => call('acesso'),
    listar: () => call('listar'),
    listarVoluntarias: () => call('listar_voluntarias'),
    chatListar: () => call('chat_listar'),
    chatEnviar: ({ texto, id_transacao, filtros }) => call('chat_enviar', { texto, id_transacao, filtros }),
    chatRedirecionar: ({ entrada_id, id_transacao }) => call('chat_redirecionar', { entrada_id, id_transacao }),
    analisarLote: texto => call('analisar_lote', { texto }),
    async salvar({ inscricao_id, texto, status, versao, titular_ref, id_transacao, suporte, confirmar_fisica, lote_id }) {
      if (['pronta', 'entregue'].includes(status) && !texto?.trim() && !(suporte === 'fisica' && confirmar_fisica === true)) {
        throw Object.assign(new Error('Escreva o texto antes de concluir a cartinha.'), { status: 422 });
      }
      return (await call('salvar', { inscricao_id, texto, status, versao, titular_ref, ...(id_transacao ? { id_transacao } : {}), ...(suporte !== undefined ? { suporte } : {}), ...(confirmar_fisica !== undefined ? { confirmar_fisica } : {}), ...(lote_id ? { lote_id } : {}) })).inscricao;
    },
    configurar: ({ cartinha_data_evento, cartinha_meta_diaria }) => call('configurar', { cartinha_data_evento, cartinha_meta_diaria }),
    sugerir: ({ inscricao_id, modo, texto, trecho, versao, titular_ref }) => call('sugerir', { inscricao_id, modo, texto, ...(trecho ? { trecho } : {}), versao, titular_ref }),
    historico: inscricao_id => call('historico', { inscricao_id }),
  };
}

// Lazy client keeps the transport injectable for synthetic-data local tests.
export const cartinhasApi = createCartinhasApi(async (name, payload) => {
  const { base44 } = await import('@/api/base44Client');
  return base44.functions.invoke(name, payload);
});
