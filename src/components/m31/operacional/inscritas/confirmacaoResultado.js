export function textoConfirmacao(resultado) {
  const textos = {
    enfileirada: 'Confirmação persistida e na fila. Ainda não há aceite do provedor.',
    ja_na_fila: 'A confirmação já está persistida na fila. Nenhuma nova solicitação foi criada.',
    ja_enviada: 'Existe registro de envio. Consulte os comprovantes por canal antes de pedir outra mensagem.',
    revisao_necessaria: 'A confirmação precisa de revisão individual. Nenhuma mensagem será repetida automaticamente.',
    revisao_historica: 'Histórico separado para revisão individual. Nenhum reenvio foi solicitado.',
    nao_elegivel: 'Confirmação não liberada pela situação atual da inscrição.',
    falha: 'Não foi possível confirmar a persistência da mensagem. Consulte o histórico antes de solicitar novamente.',
    nao_solicitada: 'Situação salva. Não houve solicitação de confirmação.',
    consulta: 'Histórico da confirmação por canal.',
    persistida: 'Confirmação registrada. Confira a situação de cada canal.',
    ja_persistida: 'Já existe uma confirmação registrada. Nenhuma nova solicitação foi criada.',
  };
  return textos[resultado?.status] || 'Consulte o histórico de confirmação por canal.';
}

export function apresentacaoCanal(item = {}) {
  const canal = item.canal === 'email' ? 'E-mail' : item.canal === 'whatsapp' ? 'WhatsApp' : 'Canal não informado';
  const rawStatus = String(item.status || '');
  const providerStatus = String(item.provider_status || '').toLowerCase();
  if (providerStatus === 'delivered' && item.provider_message_id) {
    return { canal, titulo: 'Entrega registrada pelo provedor', detalhe: 'Há comprovante de entrega deste canal.', tom: 'success' };
  }
  if (rawStatus === 'incerto' || providerStatus === 'uncertain') {
    return { canal, titulo: 'Resultado incerto', detalhe: 'Confira as provas no provedor antes de solicitar outra mensagem.', tom: 'attention' };
  }
  if (rawStatus === 'enviado') {
    if (item.provider_message_id && ['accepted', 'request', 'sent'].includes(providerStatus)) return { canal, titulo: 'Aceita pelo provedor', detalhe: 'O aceite não comprova recebimento pela participante.', tom: 'success' };
    if (item.provider_message_id && providerStatus === 'deferred') return { canal, titulo: 'Entrega adiada pelo provedor', detalhe: 'O provedor registrou um adiamento. Ainda não há comprovante de entrega.', tom: 'attention' };
    if (item.provider_message_id) return { canal, titulo: 'Envio registrado', detalhe: 'Confira o resultado e o ID registrados pelo provedor.', tom: 'neutral' };
    return { canal, titulo: 'Envio registrado sem ID do provedor', detalhe: 'O registro antigo não comprova recebimento.', tom: 'neutral' };
  }
  const estados = {
    pendente: ['Na fila', 'Confirmação persistida, aguardando tentativa.', 'neutral'],
    persistida: ['Persistida', 'A solicitação foi registrada; ainda não há aceite do provedor.', 'neutral'],
    processando: ['Em andamento', 'A tentativa começou. O resultado ainda precisa ser confirmado.', 'neutral'],
    incerto: ['Resultado incerto', 'Confira as provas no provedor antes de solicitar outra mensagem.', 'attention'],
    aguardando_contato: ['Aguardando contato', 'Este canal não tem um contato válido registrado.', 'attention'],
    bloqueado: ['Envio bloqueado', 'A comunicação precisa de revisão individual.', 'attention'],
    revisao_historica: ['Revisão histórica', 'Registro separado para revisão individual, sem reenvio automático.', 'neutral'],
    revisao_necessaria: ['Revisão individual necessária', 'Nenhuma nova mensagem foi solicitada.', 'attention'],
    falha_terminal: ['Falha no envio', 'Há uma falha registrada. Nenhum reenvio automático será feito.', 'attention'],
    cancelado: ['Solicitação cancelada', 'Esta solicitação não será enviada.', 'neutral'],
  };
  const [titulo, detalhe, tom] = estados[rawStatus] || ['Situação não informada', 'Não há prova suficiente para apresentar este envio como concluído.', 'neutral'];
  return { canal, titulo, detalhe, tom };
}
