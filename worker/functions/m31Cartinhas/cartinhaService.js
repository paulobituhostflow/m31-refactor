import { carregarParticipantes, participanteDasCartinhas, destinatariaRequerConferencia } from './participantes.js';
import { ehInscritaReconhecida } from './participacaoReconhecida.js';
import { titularRef, precisaRevisar, historicoPrivado } from './cartinhaIdentidade.js';
import { validarSalvamento, identidadeOperacao, prepararVersao, textoFinalSolicitado } from './cartinhaConfiabilidade.js';
import { tipoDestinatariaCartinha, primeiroNomeCartinha } from './cartinhaPadrao.js';
import { sugerirCartinha, contextoPastoral } from './cartinhaCopiloto.js';
import { analisarLote } from './cartinhaLote.js';
import { ciclosConclusaoDaTitular, REGRA_CICLO_CARTINHAS, dataCivilValida, diaCartinha } from './cartinhaCiclo.js';
import { chatListar, chatEnviar, chatRedirecionar } from './cartinhaChat.js';
const STATUS = ['pendente', 'em_elaboracao', 'pronta', 'entregue', 'revisar_cartinha'];
const FIELDS = ['id', 'nome', 'whatsapp', 'cidade', 'estado', 'nome_igreja', 'caravana_nome', 'codigo_inscricao', 'ordem_operacional', 'tipo', 'ja_participou_m31', 'como_conheceu', 'area_voluntario', 'observacoes', 'presenteado_por_id', 'created_date', 'cartinha_status', 'cartinha_texto', 'cartinha_responsavel', 'cartinha_atualizada_em', 'cartinha_entregue_em', 'cartinha_versao', 'cartinha_dias_concluidos', 'cartinha_suporte', 'cartinha_fisica_confirmada_em', 'cartinha_tipo_destinataria', 'cartinha_assinatura', 'cartinha_primeiro_nome', 'cartinha_formato_versao'];
const result = (status, body) => ({ status, body });
const error = (status, message) => result(status, { error: message });
const select = (object, fields) => Object.fromEntries(fields.filter(k => object[k] !== undefined).map(k => [k, object[k]]));
async function view(row, byId = new Map(), loteLiberado = false) {
  const revisar = precisaRevisar(row);
  const referenciaAtual = await titularRef(row);
  const ciclos = ciclosConclusaoDaTitular(row, referenciaAtual);
  const payer = byId.get(row.presenteado_por_id);
  const giver = payer?.presenteado_id === row.id && ['aprovado', 'gratuito'].includes(payer.status_pagamento) ? payer.nome : undefined;
  return { ...select(row, FIELDS), cartinha_versao: row.cartinha_versao ?? 0,
    titular_ref: referenciaAtual,
    // Projeção de horários reais do histórico; não modifica eventos nem datas legadas no banco.
    cartinha_dias_concluidos: ciclos, cartinha_ciclo_regra: REGRA_CICLO_CARTINHAS,
    // Compatibilidade com telas de impressão antigas: não oferecer carta imprimível
    // antes da liberação administrativa. A listagem e os rascunhos permanecem.
    cartinha_elegivel: loteLiberado === true && !destinatariaRequerConferencia(row),
    cartinha_lote_liberado: loteLiberado === true,
    tipo_destinataria: tipoDestinatariaCartinha(row), primeiro_nome: primeiroNomeCartinha(row.nome),
    cartinha_revisao_necessaria: revisar || destinatariaRequerConferencia(row),
    cartinha_conferir_destinataria: destinatariaRequerConferencia(row),
    observacoes: contextoPastoral(row).observacoes || '',
    ...(giver ? {abencoada_por_nome: giver} : {}),
    ...(revisar ? {cartinha_status: 'revisar_cartinha', cartinha_texto: '', cartinha_revisao_necessaria: true} : {}),
  };
}
const configView = c => ({ ...select(c, ['id', 'cartinha_data_evento', 'cartinha_meta_diaria']), cartinha_lote_liberado: c.cartinha_lote_liberado === true });

/** Conteúdo pastoral privado; somente sugerir aciona IA. Salvar não envia nem alimenta corpus. */
export async function handleCartinhas({ user, body = {}, S, invokeLLM, now = () => new Date().toISOString(), internalMeta = null }) {
  if (!user?.id || !user?.email) return error(401, 'Entre com sua conta para acessar as cartinhas.');
  const configs = await S.EventoM31Config.list('created_date', 2);
  if (configs.length !== 1 || !configs[0].cartinha_autora_user_id || configs[0].cartinha_autora_user_id !== user.id) {
    return error(403, 'Esta conta não tem acesso às cartinhas.');
  }
  const config = configs[0];
  const membros = await S.EventoM31Membro.filter({ user_email: user.email, ativo: true }, 'created_date', 2);
  if (!membros.some(m => m.ativo === true && m.user_email === user.email)) return error(403, 'O acesso pastoral está inativo.');
  const userView = select(user, ['id', 'email', 'full_name']);
  if (body.action === 'acesso') return result(200, { user: userView });

  if (body.action === 'listar' || body.action === 'listar_voluntarias') {
    const data = await carregarParticipantes(S);
    const lista = body.action === 'listar_voluntarias' ? data.voluntarias : data.inscricoes;
    const inscricoes = await Promise.all(lista.map(row => view(row, data.byId, config.cartinha_lote_liberado === true)));
    // Pendências operacionais continuam na gestão. A autora recebe somente seu escopo.
    // O KPI institucional não pode derivar da lista de escrita, que pode excluir
    // temporariamente destinatárias em conferência. Usa o MESMO predicado canônico
    // de headcount do Admin; a lista continua com suas proteções próprias.
    const inscritasReconhecidas = body.action === 'listar'
      ? [...data.byId.values()].filter(row => ehInscritaReconhecida(row)).length
      : undefined;
    // Snapshot atômico dos KPIs: o frontend nunca reconstrói a verdade contando
    // arrays parciais. Zero só é válido quando este snapshot confirmado disser zero.
    const cartinhasConcluidas = body.action === 'listar'
      ? inscricoes.filter(i => Array.isArray(i.cartinha_dias_concluidos) && i.cartinha_dias_concluidos.length > 0).length
      : undefined;
    const cicloHoje = diaCartinha(now());
    const cartinhasConcluidasHoje = body.action === 'listar'
      ? inscricoes.filter(i => Array.isArray(i.cartinha_dias_concluidos) && i.cartinha_dias_concluidos.includes(cicloHoje)).length
      : undefined;
    const geradoEm = now();
    const snapshot = body.action === 'listar' ? {
      snapshot_id: crypto.randomUUID(), gerado_em: geradoEm,
      inscritas_reconhecidas: inscritasReconhecidas,
      cartinhas_concluidas: cartinhasConcluidas,
      cartinhas_concluidas_hoje: cartinhasConcluidasHoje,
      meta_total: 1000,
    } : undefined;
    return result(200, { inscricoes, ...(inscritasReconhecidas !== undefined ? { inscritasReconhecidas } : {}), ...(snapshot ? { snapshot } : {}), escopo: body.action === 'listar_voluntarias' ? 'voluntarias' : 'inscritas', config: configView(config), user: userView, carregado_em: geradoEm });
  }

  if (body.action === 'chat_listar') {
    try { return result(200, await chatListar({ S, user })); }
    catch (e) { return error(e?.status || 503, e?.message || 'Não foi possível carregar o histórico agora.'); }
  }
  if (body.action === 'chat_enviar' || body.action === 'chat_redirecionar') {
    const salvar = async (payload, meta) => handleCartinhas({ user, body: { action:'salvar', audit_forma: meta?.origem || 'chat_distribuicao', ...payload }, S, invokeLLM, now, internalMeta:meta });
    try {
      const resposta = body.action === 'chat_enviar'
        ? await chatEnviar({ S, user, body, salvar, now })
        : await chatRedirecionar({ S, user, body, salvar, now });
      return result(200, resposta);
    } catch (e) {
      return error(e?.status || 503, e?.message || 'Não foi possível concluir a distribuição. Sua palavra foi preservada.');
    }
  }

  if (body.action === 'analisar_lote') {
    try {
      const data = await carregarParticipantes(S);
      return result(200, { ...await analisarLote({ texto: body.texto, participantes: data.inscricoes, invokeLLM }), lote_liberado: config.cartinha_lote_liberado === true });
    } catch (e) {
      return error(e?.status === 422 ? 422 : 503, e?.status === 422 ? e.message : 'Não foi possível identificar as cartinhas agora. O texto continua preservado para tentar novamente.');
    }
  }

  if (body.action === 'configurar') {
    const patch = {};
    if (body.cartinha_meta_diaria !== undefined) {
      if (!Number.isInteger(body.cartinha_meta_diaria) || body.cartinha_meta_diaria < 1 || body.cartinha_meta_diaria > 1000) return error(422, 'Informe uma meta entre 1 e 1000.');
      patch.cartinha_meta_diaria = body.cartinha_meta_diaria;
    }
    if (body.cartinha_data_evento !== undefined) {
      if (!dataCivilValida(body.cartinha_data_evento)) return error(422, 'Informe uma data válida.');
      patch.cartinha_data_evento = body.cartinha_data_evento;
    }
    const updated = Object.keys(patch).length ? await S.EventoM31Config.update(config.id, patch) : config;
    return result(200, { config: configView({ ...config, ...updated, ...patch }) });
  }

  if (!['salvar','historico','sugerir'].includes(body.action)) return error(400, 'Ação inválida.');
  if (typeof body.inscricao_id !== 'string' || !body.inscricao_id) return error(422, 'Inscrição inválida.');
  if (body.action !== 'historico' && (typeof body.texto !== 'string' || body.texto.length > 50000 || !Number.isSafeInteger(body.versao) || body.versao < 0 || typeof body.titular_ref !== 'string')) return error(422, 'Dados da carta inválidos. Reabra a carta e tente novamente.');
  if (body.action === 'salvar' && !STATUS.includes(body.status)) return error(422, 'Status inválido.');
  if (body.action === 'salvar' && ['pronta', 'entregue'].includes(body.status) && !body.texto.trim() && !(body.suporte === 'fisica' && body.confirmar_fisica === true)) return error(422, 'Cole o texto ou selecione Carta física concluída.');
  const current = await S.EventoM31Inscricao.get(body.inscricao_id);
  if (!current) return error(404, 'Inscrição não encontrada.');
  if (body.action === 'historico') {
    const historico = historicoPrivado(current).map((e, index) => ({
      ...e,
      auditoria: {
        sequencia: index + 1,
        id_transacao: e.id_transacao || null,
        data_hora_utc: e.atualizada_em || e.arquivada_em || null,
        ciclo_recife: e.ciclo_conclusao || (e.atualizada_em ? diaCartinha(e.atualizada_em) : null),
        autora_id: e.autora_id || null,
        autora_email: e.autora_email || null,
        responsavel: e.responsavel || null,
        forma: e.forma_operacao || e.origem || (e.lote_id ? 'lote_legado' : 'editor_legado'),
        canal: e.canal_operacao || 'legado_sem_canal_registrado',
        status: e.status || null,
        versao: e.versao ?? null,
        conclusao_explicita: e.conclusao_explicita === true,
        request_hash: e.request_hash || null,
        titular_ref: e.titular_ref || null,
      }
    }));
    return result(200, {historico, auditoria:{imutavel:true, regra_ciclo:REGRA_CICLO_CARTINHAS, observacao:'Eventos legados preservam somente os campos que existiam quando foram gravados.'}});
  }
  if (!participanteDasCartinhas(current)) return error(409, 'Esta participante precisa de conferência. O rascunho foi preservado.');
  if (body.action === 'salvar' && ['pronta', 'entregue'].includes(body.status) && destinatariaRequerConferencia(current)) return error(422, 'Confirme a destinatária com a organização antes de concluir. O rascunho pode ser salvo.');
  let operation;
  if (body.action === 'salvar') {
    try { body = validarSalvamento(body); } catch { return error(422, 'Dados da carta inválidos. Confira o texto antes de salvar.'); }
    operation = await identidadeOperacao(body);
    const previous = (current.cartinha_historico || []).find(h => h.id_transacao === operation.id);
    if (previous) {
      if (previous.request_hash !== operation.hash) return error(409, 'Identificador reutilizado com conteúdo diferente.');
      if (previous.versao !== (current.cartinha_versao ?? 0) || await titularRef(current) !== body.titular_ref) return error(409, 'A operação já foi salva, mas a carta mudou depois. Confira a versão atual.');
      return result(200, { inscricao: await view(current, undefined, config.cartinha_lote_liberado === true), unchanged: true, id_transacao: operation.id });
    }
  }
  if (body.action === 'salvar' && body.lote_id && ['pronta', 'entregue'].includes(body.status) && config.cartinha_lote_liberado !== true) {
    return error(422, 'Conclusão em lote em conferência de destinatárias. Você pode guardar os textos como rascunhos.');
  }
  if (body.action === 'salvar' && body.lote_id && (
    ((current.cartinha_texto || '').trim() && current.cartinha_texto !== body.texto) ||
    (current.cartinha_suporte === 'fisica' && (body.suporte || 'digital') !== 'fisica')
  )) return error(409, 'Esta participante já tem uma cartinha. Abra o editor para revisar; o lote não substitui textos existentes.');
  const version = current.cartinha_versao ?? 0;
  if (version !== body.versao || body.titular_ref !== await titularRef(current)) return error(409, 'A carta ou a titular foi alterada. Seu texto foi mantido nesta tela; reabra a inscrição antes de salvar.');
  if (body.action === 'sugerir') {
    const data = await carregarParticipantes(S);
    if (body.trecho !== undefined && (typeof body.trecho !== 'string' || body.trecho.length > 6000)) return error(422, 'Selecione um trecho menor.');
    const recentes = data.inscricoes.filter(r => r.id !== current.id && ['pronta','entregue'].includes(r.cartinha_status) && !precisaRevisar(r))
      .sort((a,b)=>String(b.cartinha_atualizada_em||'').localeCompare(String(a.cartinha_atualizada_em||''))).slice(0,12).map(r=>r.cartinha_texto);
    try {
      const suggestion = await sugerirCartinha({participante: await view(current,data.byId), modo:body.modo, texto:body.texto, trecho:body.trecho, historicas:config.cartinha_estilo_exemplos||[], recentes, invokeLLM});
      const latest = await S.EventoM31Inscricao.get(current.id);
      if (!latest || (latest.cartinha_versao??0)!==version || await titularRef(latest)!==body.titular_ref) return error(409,'A titular ou a carta mudou durante a sugestão. Atualize antes de continuar.');
      return result(200,suggestion);
    } catch(e) { return error(422, ['Modo de sugestão inválido.','A sugestão repetiu uma carta existente. Gere uma nova sugestão.'].includes(e.message) ? e.message : 'Não foi possível gerar a sugestão. Seu rascunho foi preservado.'); }
  }
  if (body.status === 'entregue' && !['pronta', 'entregue'].includes(current.cartinha_status)) return error(422, 'Finalize a carta antes de registrar a entrega.');
  let textoEsperado, patch;
  const timestamp = now();
  try {
    textoEsperado = textoFinalSolicitado(current, body);
    if (!precisaRevisar(current) && (current.cartinha_texto || '') === textoEsperado && (current.cartinha_status || 'pendente') === body.status && (current.cartinha_suporte || 'digital') === (body.suporte || 'digital')) return result(200, { inscricao: await view(current, undefined, config.cartinha_lote_liberado === true), unchanged: true });
    patch = prepararVersao(current, body, operation, user, timestamp);
    if (internalMeta && patch.cartinha_historico?.length) {
      const last = patch.cartinha_historico[patch.cartinha_historico.length - 1];
      Object.assign(last, {
        ...(internalMeta.entrada_id ? { entrada_id: internalMeta.entrada_id } : {}),
        ...(internalMeta.item_id ? { item_id: internalMeta.item_id } : {}),
        ...(internalMeta.origem ? { origem: internalMeta.origem } : {}),
        ...(internalMeta.confirmado_em ? { confirmado_em: internalMeta.confirmado_em } : {}),
      });
      patch.cartinha_entrada_id = internalMeta.entrada_id || null;
      patch.cartinha_item_id = internalMeta.item_id || null;
      patch.cartinha_modo = internalMeta.origem?.startsWith('chat') ? 'livre' : (current.cartinha_modo || null);
    }
  } catch (e) {
    if (e?.status === 422) return error(422, e.message);
    throw e;
  }
  const versionQuery = version === 0 ? { $or: [{ cartinha_versao: 0 }, { cartinha_versao: null }, { cartinha_versao: { $exists: false } }] } : { cartinha_versao: version };
  const query = { id: current.id, tipo: current.tipo, cartinha_vinculo_bloqueado: current.cartinha_vinculo_bloqueado ?? null, cpf: current.cpf ?? null, nome: current.nome, status_pagamento: current.status_pagamento, estado_canonico: current.estado_canonico ?? null, evidencia_canonica: current.evidencia_canonica ?? null, duplicada_de_id: current.duplicada_de_id ?? null, cadastro_pendente: { $ne: true }, ...versionQuery };
  const saved = await S.EventoM31Inscricao.updateMany(query, { $set: patch });
  if (saved?.updated !== 1) {
    const latest = await S.EventoM31Inscricao.get(current.id);
    const duplicate = (latest?.cartinha_historico || []).find(h => h.id_transacao === operation.id);
    if (duplicate?.request_hash === operation.hash && duplicate.versao === latest.cartinha_versao && await titularRef(latest) === body.titular_ref) {
      return result(200, { inscricao: await view(latest, undefined, config.cartinha_lote_liberado === true), unchanged: true, id_transacao: operation.id });
    }
    return error(409, 'Outra alteração ocorreu durante o salvamento. Seu texto não foi sobrescrito; reabra a carta.');
  }
  // O histórico/outbox já foi confirmado no MESMO update da carta. Nenhuma
  // chamada de planilha, financeiro ou timeline condiciona a resposta de salvamento.
  console.info(JSON.stringify({ modulo: 'cartinhas', evento: 'versao_salva', id_transacao: operation.id, inscricao_id: current.id, versao: patch.cartinha_versao, status: patch.cartinha_status, timestamp }));
  return result(200, { inscricao: await view({ ...current, ...patch }, undefined, config.cartinha_lote_liberado === true), id_transacao: operation.id, espelho: 'pendente' });
}
