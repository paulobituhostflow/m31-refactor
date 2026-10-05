/**
 * useM31PendenciasConciliacao — Computa pendências de auditoria de inscrições.
 * Cada pendência representa uma EventoM31Inscricao já existente com algum ponto a revisar.
 * Transações órfãs NÃO aparecem aqui — ficam no Financeiro.
 *
 * Categorias de pendência: cadastro, origem, financeiro, vínculos, fluxo.
 */
import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { computeM31Metrics } from '@/lib/m31Metrics';

const isTeste = (i) => {
  const n = (i.nome || '').toLowerCase();
  const c = (i.codigo_inscricao || '').toLowerCase();
  return n.includes('teste') || c.includes('teste');
};

const norm = (s) => (s || '').toLowerCase().trim().replace(/(.)\1+/g, '$1');
const waDigits = (i) => (i.whatsapp || '').replace(/\D/g, '');
const cpfDigits = (i) => (i.cpf || '').replace(/\D/g, '');

function mapGateway(origem) {
  if (origem === 'asaas') return 'asaas';
  if (origem === 'mercado_pago') return 'mercado_pago';
  if (origem === 'pix_manual' || origem === 'importacao') return 'manual';
  if (origem === 'gratuidade') return 'nao_identificado';
  return 'nao_identificado';
}

const MOTIVOS_QUALIDADE_CADASTRAL = new Set([
  'nome_incompleto','email_ausente','email_invalido','whatsapp_ausente','whatsapp_invalido',
  'cpf_ausente','cpf_invalido','cidade_uf_ausente','codigo_ausente'
]);
const MOTIVOS_SUGESTAO_CONCILIACAO = new Set(['origem_nao_identificada','gateway_nao_identificado','possivel_duplicidade']);
const MOTIVOS_AUDITORIA_REAL = new Set([
  'aprovado_sem_transacao','valor_divergente','pagamento_terceiro','pagamento_sem_confirmacao',
  'confirmacao_sem_qr','qr_sem_envio','caravana_sem_id','voluntario_sem_area',
  'presenteada_incompleta','compradora_sem_presenteada','presenteada_sem_compradora','cadastro_presenteada_pendente'
]);

function classificarCamadas(motivos) {
  return {
    dados_a_completar: motivos.filter(m => MOTIVOS_QUALIDADE_CADASTRAL.has(m)),
    sugestoes_conciliacao: motivos.filter(m => MOTIVOS_SUGESTAO_CONCILIACAO.has(m)),
    auditoria_real: motivos.filter(m => MOTIVOS_AUDITORIA_REAL.has(m)),
  };
}

function evidenciaParticipacao(insc) {
  const evidencias = [];
  if (['aprovado','gratuito'].includes(insc.status_pagamento) || insc.pagamento_confirmado_em) evidencias.push('pagamento_confirmado');
  if (['IMPORTACAO_MANUAL','IMPORTACAO','ASAAS','MERCADO_PAGO'].includes(String(insc.origem_inscricao || '').toUpperCase()) || insc.origem_pagamento === 'importacao') evidencias.push('origem_reconhecida');
  if (insc.entrou_no_grupo === true || insc.data_entrada_grupo || insc.entrou_no_grupo_em) evidencias.push('grupo_oficial');
  if (insc.codigo_inscricao || ['confirmada','isenta'].includes(insc.estado_canonico)) evidencias.push('inscricao_registrada');
  if (insc.status_pagamento === 'gratuito' || insc.origem_pagamento === 'gratuidade') evidencias.push('cortesia_validada');
  return evidencias;
}

function computePriority(motivos) {
  if (motivos.includes('aprovado_sem_transacao') || motivos.includes('possivel_duplicidade')) return 'alta';
  if (motivos.includes('pagamento_sem_confirmacao') || motivos.includes('qr_sem_envio')) return 'alta';
  if (motivos.includes('valor_divergente') || motivos.includes('pagamento_terceiro')) return 'media';
  if (motivos.includes('presenteada_incompleta') || motivos.includes('cadastro_presenteada_pendente')) return 'media';
  if (motivos.length > 3) return 'media';
  return 'baixa';
}

function checkPendencia(insc, inscricoes, transMap) {
  const motivos = [];
  const campos = [];
  const categorias = new Set();

  // ── CADASTRO ──
  if (!insc.nome || insc.nome.trim().split(' ').length < 2) { campos.push('nome'); motivos.push('nome_incompleto'); categorias.add('cadastro'); }
  if (!insc.email || !insc.email.trim()) { campos.push('email'); motivos.push('email_ausente'); categorias.add('cadastro'); }
  else if (!/^[^@]+@[^@]+\.[^@]+$/.test(insc.email)) { campos.push('email'); motivos.push('email_invalido'); categorias.add('cadastro'); }
  if (!insc.whatsapp) { campos.push('telefone'); motivos.push('whatsapp_ausente'); categorias.add('cadastro'); }
  else if (waDigits(insc).length < 10) { campos.push('telefone'); motivos.push('whatsapp_invalido'); categorias.add('cadastro'); }
  if (!insc.cpf) { campos.push('cpf'); motivos.push('cpf_ausente'); categorias.add('cadastro'); }
  else if (cpfDigits(insc).length < 11) { campos.push('cpf'); motivos.push('cpf_invalido'); categorias.add('cadastro'); }
  if (!insc.cidade || !insc.estado) { campos.push('cidade_uf'); motivos.push('cidade_uf_ausente'); categorias.add('cadastro'); }
  if (!insc.codigo_inscricao) { campos.push('codigo'); motivos.push('codigo_ausente'); categorias.add('cadastro'); }

  // ── ORIGEM ──
  // Antes do pagamento, origem_pagamento ausente é estado normal do funil — não é pendência.
  // Só auditamos origem quando a vaga já se apresenta como paga/isenta ou em revisão financeira.
  const exigeOrigemPagamento = ['aprovado', 'gratuito'].includes(insc.status_pagamento)
    || ['confirmada', 'isenta', 'revisar'].includes(insc.estado_canonico);
  if (exigeOrigemPagamento && (!insc.origem_pagamento || insc.origem_pagamento === 'desconhecida')) {
    campos.push('origem'); motivos.push('origem_nao_identificada'); categorias.add('origem');
  }
  if (insc.status_pagamento === 'aprovado' && mapGateway(insc.origem_pagamento) === 'nao_identificado') { campos.push('gateway'); motivos.push('gateway_nao_identificado'); categorias.add('origem'); }
  if (insc.tipo === 'caravana' && !insc.caravana_id) { motivos.push('caravana_sem_id'); categorias.add('origem'); }
  if (insc.tipo === 'voluntario' && !insc.area_voluntario) { motivos.push('voluntario_sem_area'); categorias.add('origem'); }

  // ── FINANCEIRO ──
  if (insc.status_pagamento === 'aprovado' && !insc.asaas_payment_id && insc.origem_pagamento === 'desconhecida') { motivos.push('aprovado_sem_transacao'); categorias.add('financeiro'); }
  if (insc.status_pagamento === 'aprovado' && !insc.valor_pago) { motivos.push('valor_ausente'); categorias.add('financeiro'); }
  // Check transaction for divergence
  const cpf = cpfDigits(insc);
  const email = (insc.email || '').toLowerCase().trim();
  const trans = transMap.byInsc.get(insc.id) || (cpf && transMap.byCpf.get(cpf)) || (email && transMap.byEmail.get(email));
  if (trans && insc.status_pagamento === 'aprovado') {
    if (Math.abs((trans.valor_bruto || 0) - (insc.valor_pago || 0)) > 1) { motivos.push('valor_divergente'); categorias.add('financeiro'); }
    if (trans.nome_pagador && insc.nome && norm(trans.nome_pagador) !== norm(insc.nome) && !norm(insc.nome).includes(norm(trans.nome_pagador)) && !norm(trans.nome_pagador).includes(norm(insc.nome))) { motivos.push('pagamento_terceiro'); categorias.add('financeiro'); }
  }

  // ── VÍNCULOS ──
  const byCpf = inscricoes.filter(i => !isTeste(i) && cpfDigits(i) === cpf && cpf.length >= 11 && i.id !== insc.id);
  const byEmail = inscricoes.filter(i => !isTeste(i) && (i.email || '').toLowerCase().trim() === email && email && i.id !== insc.id);
  const byWa = inscricoes.filter(i => !isTeste(i) && waDigits(i) === waDigits(insc) && waDigits(insc).length >= 10 && i.id !== insc.id);
  const duplicatas = Array.from(new Map([...byCpf, ...byEmail, ...byWa].map(i => [i.id, i])).values());
  if (duplicatas.length > 0) { campos.push('duplicidade'); motivos.push('possivel_duplicidade'); categorias.add('vinculos'); }
  if (insc.presenteado_id && insc.cadastro_pendente) { motivos.push('presenteada_incompleta'); categorias.add('vinculos'); }
  if (insc.presenteado_id && !insc.presenteado_whatsapp) { motivos.push('compradora_sem_presenteada'); categorias.add('vinculos'); }
  if (insc.presenteado_por_id && !insc.presenteado_token) { motivos.push('presenteada_sem_compradora'); categorias.add('vinculos'); }

  // ── FLUXO OPERACIONAL ──
  if (insc.pagamento_confirmado_em && !insc.data_envio_boas_vindas) { campos.push('confirmacao_pendente'); motivos.push('pagamento_sem_confirmacao'); categorias.add('fluxo'); }
  if (insc.data_envio_boas_vindas && !insc.qrcode_url) { campos.push('qr_pendente'); motivos.push('confirmacao_sem_qr'); categorias.add('fluxo'); }
  if (insc.qrcode_url && insc.qr_envio_status !== 'enviado_com_sucesso') { campos.push('qr_envio'); motivos.push('qr_sem_envio'); categorias.add('fluxo'); }
  if (insc.cadastro_pendente && insc.presenteado_por_id) { motivos.push('cadastro_presenteada_pendente'); categorias.add('fluxo'); }

  return { motivos, campos, categorias: Array.from(categorias), prioridade: computePriority(motivos), duplicatas };
}

export function useM31PendenciasConciliacao() {
  const qc = useQueryClient();

  const { data: inscricoes = [], isLoading: isLoadingInc } = useQuery({
    queryKey: ['m31_aud_inscricoes'],
    queryFn: () => base44.entities.EventoM31Inscricao.filter({}, '-created_date', 2000),
  });

  const { data: transacoes = [], isLoading: isLoadingTrans } = useQuery({
    queryKey: ['m31_aud_transacoes'],
    queryFn: () => base44.entities.M31TransacaoFinanceira.list('-created_date', 500),
  });

  const { data: analises = [], isLoading: isLoadingAnl } = useQuery({
    queryKey: ['m31_aud_analises'],
    queryFn: () => base44.entities.M31PendenciaConciliacao.list('-updated_date', 500),
  });

  const isLoading = isLoadingInc || isLoadingTrans || isLoadingAnl;

  const pendencias = useMemo(() => {
    if (!inscricoes.length) return [];

    const analiseMap = new Map();
    analises.forEach(a => analiseMap.set(`${a.tipo_registro}:${a.registro_id}`, a));

    const transMap = { byInsc: new Map(), byCpf: new Map(), byEmail: new Map() };
    transacoes.forEach(t => {
      if (t.inscricao_id) transMap.byInsc.set(t.inscricao_id, t);
      const cpf = (t.cpf || '').replace(/\D/g, '');
      if (cpf) transMap.byCpf.set(cpf, t);
      if (t.email) transMap.byEmail.set(t.email.toLowerCase().trim(), t);
    });

    const result = [];
    for (const insc of inscricoes) {
      if (isTeste(insc)) continue;
      // contato_capturado é intenção/lead por desenho do funil, não inscrição pronta para auditoria.
      // Fica na Recuperação e só entra aqui quando houver avanço real ou contradição financeira.
      if (insc.etapa_funil === 'contato_capturado' && !['aprovado', 'gratuito'].includes(insc.status_pagamento) && !insc.pagamento_confirmado_em) continue;

      const check = checkPendencia(insc, inscricoes, transMap);
      const key = `inscricao:${insc.id}`;
      const analise = analiseMap.get(key);

      let motivos = [...check.motivos];
      let camposAusentes = [...check.campos];
      const descartadas = new Set(analise?.duplicidade_descartada_ids || []);
      if (check.duplicatas?.length && check.duplicatas.every(d => descartadas.has(d.id))) {
        motivos = motivos.filter(m => m !== 'possivel_duplicidade');
        camposAusentes = camposAusentes.filter(c => c !== 'duplicidade');
      }
      if (motivos.length === 0) continue;

      const cpfAtual = cpfDigits(insc);
      const emailAtual = (insc.email || '').toLowerCase().trim();
      const transacoesRelacionadas = transacoes.filter(t =>
        t.inscricao_id === insc.id ||
        (cpfAtual && (t.cpf || '').replace(/\D/g, '') === cpfAtual) ||
        (emailAtual && (t.email || '').toLowerCase().trim() === emailAtual)
      );

      const camadas = classificarCamadas(motivos);
      const evidenciasParticipacao = evidenciaParticipacao(insc);
      // Cadastro incompleto nunca retira reconhecimento de participação. A auditoria
      // apenas classifica o que precisa completar, sugerir ou decidir.
      const inscritaReconhecida = evidenciasParticipacao.length > 0 || ['aprovado','gratuito'].includes(insc.status_pagamento);

      result.push({
        id: key,
        tipo_registro: 'inscricao',
        registro_id: insc.id,
        nome: insc.nome, email: insc.email, whatsapp: insc.whatsapp, cpf: insc.cpf,
        cidade: insc.cidade, estado: insc.estado, tipo_inscricao: insc.tipo,
        origem: insc.origem_pagamento, gateway: mapGateway(insc.origem_pagamento),
        status_pagamento: insc.status_pagamento, valor: insc.valor_pago || 0,
        codigo_inscricao: insc.codigo_inscricao || '', data_inscricao: insc.created_date,
        motivos, categorias: check.categorias, campos_ausentes: camposAusentes,
        dados_a_completar: camadas.dados_a_completar,
        sugestoes_conciliacao: camadas.sugestoes_conciliacao,
        auditoria_real: camadas.auditoria_real,
        inscrita_reconhecida: inscritaReconhecida,
        evidencias_participacao: evidenciasParticipacao,
        exige_decisao_humana: camadas.auditoria_real.length > 0,
        prioridade: analise?.prioridade || computePriority(camadas.auditoria_real.length ? camadas.auditoria_real : camadas.sugestoes_conciliacao),
        status_analise: analise?.status_analise || 'pendente_analise',
        motivos_resolvidos: analise?.motivos_resolvidos || [],
        responsavel_revisao: analise?.responsavel_revisao || '',
        observacao: analise?.observacao || '',
        proxima_acao: analise?.proxima_acao || '',
        data_ultima_atualizacao: analise?.updated_date || insc.updated_date,
        decisao: analise?.decisao || '',
        motivos_originais: analise?.motivos_originais || [],
        evidencias_consultadas: analise?.evidencias_consultadas || [],
        regra_aplicada: analise?.regra_aplicada || '',
        resultado_final: analise?.resultado_final || '',
        duplicidade_descartada_ids: analise?.duplicidade_descartada_ids || [],
        _inscricao: insc,
        _duplicatas: check.duplicatas || [],
        _transacoes_relacionadas: transacoesRelacionadas,
        _analise: analise, _analise_id: analise?.id || null,
      });
    }
    return result;
  }, [inscricoes, transacoes, analises]);

  const resumoCamadas = useMemo(() => {
    const metricas = computeM31Metrics(inscricoes.filter(i => !isTeste(i)));
    return {
      inscritas_reconhecidas: metricas.inscritasReconhecidas,
      auditoria_real: pendencias.filter(p => p.auditoria_real?.length > 0 && !['resolvido','corrigido','descartado'].includes(p.status_analise)).length,
      dados_a_completar: pendencias.filter(p => p.dados_a_completar?.length > 0).length,
      sugestoes_conciliacao: pendencias.filter(p => p.sugestoes_conciliacao?.length > 0 && !p.auditoria_real?.length).length,
    };
  }, [inscricoes, pendencias]);

  return { pendencias, resumoCamadas, isLoading, inscricoes, transacoes, analises, refetch: () => qc.invalidateQueries({ queryKey: ['m31_aud_analises'] }) };
}

// ── Filtros ──
export const FILTER_GROUPS = [
  {
    label: 'Camada',
    filters: [
      { id: 'auditoria_real', label: 'Auditoria real' },
      { id: 'dados_a_completar', label: 'Dados a completar' },
      { id: 'sugestao_conciliacao', label: 'Sugestões de conciliação' },
    ],
  },
  {
    label: 'Tipo de pendência',
    filters: [
      { id: 'cadastro', label: 'Cadastro' },
      { id: 'origem', label: 'Origem' },
      { id: 'financeiro', label: 'Financeiro' },
      { id: 'vinculos', label: 'Vínculos' },
      { id: 'fluxo', label: 'Fluxo operacional' },
    ],
  },
  {
    label: 'Campo ausente',
    filters: [
      { id: 'sem_telefone', label: 'Sem telefone' },
      { id: 'sem_email', label: 'Sem e-mail' },
      { id: 'sem_cpf', label: 'Sem CPF' },
      { id: 'sem_cidade', label: 'Sem cidade/UF' },
      { id: 'sem_codigo', label: 'Sem código' },
      { id: 'sem_origem', label: 'Sem origem' },
      { id: 'sem_gateway', label: 'Sem gateway' },
    ],
  },
  {
    label: 'Situação',
    filters: [
      { id: 'confirmacao_pendente', label: 'Confirmação pendente' },
      { id: 'qr_pendente', label: 'QR pendente' },
      { id: 'possivel_duplicidade', label: 'Possível duplicidade' },
      { id: 'presenteada_incompleta', label: 'Presenteada incompleta' },
    ],
  },
  {
    label: 'Gateway',
    filters: [
      { id: 'mercado_pago', label: 'Mercado Pago' },
      { id: 'asaas', label: 'Asaas' },
    ],
  },
  {
    label: 'Tipo',
    filters: [
      { id: 'caravana', label: 'Caravana' },
      { id: 'voluntario', label: 'Voluntário' },
      { id: 'publico_geral', label: 'Público geral' },
    ],
  },
  {
    label: 'Prioridade',
    filters: [
      { id: 'alta', label: 'Alta' },
      { id: 'media', label: 'Média' },
      { id: 'baixa', label: 'Baixa' },
    ],
  },
  {
    label: 'Status',
    filters: [
      { id: 'pendente', label: 'Pendente' },
      { id: 'em_analise', label: 'Em análise' },
      { id: 'resolvido', label: 'Resolvido' },
    ],
  },
];

export function matchesFilter(p, filterId) {
  switch (filterId) {
    // Camadas independentes
    case 'auditoria_real': return (p.auditoria_real || []).length > 0;
    case 'dados_a_completar': return (p.dados_a_completar || []).length > 0;
    case 'sugestao_conciliacao': return (p.sugestoes_conciliacao || []).length > 0;
    // Tipo
    case 'cadastro': return p.categorias.includes('cadastro');
    case 'origem': return p.categorias.includes('origem');
    case 'financeiro': return p.categorias.includes('financeiro');
    case 'vinculos': return p.categorias.includes('vinculos');
    case 'fluxo': return p.categorias.includes('fluxo');
    // Campos
    case 'sem_telefone': return p.campos_ausentes.includes('telefone');
    case 'sem_email': return p.campos_ausentes.includes('email');
    case 'sem_cpf': return p.campos_ausentes.includes('cpf');
    case 'sem_cidade': return p.campos_ausentes.includes('cidade_uf');
    case 'sem_codigo': return p.campos_ausentes.includes('codigo');
    case 'sem_origem': return p.campos_ausentes.includes('origem');
    case 'sem_gateway': return p.campos_ausentes.includes('gateway');
    // Situação
    case 'confirmacao_pendente': return p.campos_ausentes.includes('confirmacao_pendente');
    case 'qr_pendente': return p.campos_ausentes.includes('qr_pendente');
    case 'possivel_duplicidade': return p.motivos.includes('possivel_duplicidade');
    case 'presenteada_incompleta': return p.motivos.includes('presenteada_incompleta');
    // Gateway
    case 'mercado_pago': return p.gateway === 'mercado_pago';
    case 'asaas': return p.gateway === 'asaas';
    // Tipo
    case 'caravana': return p.tipo_inscricao === 'caravana';
    case 'voluntario': return p.tipo_inscricao === 'voluntario';
    case 'publico_geral': return p.tipo_inscricao === 'publico_geral';
    // Prioridade
    case 'alta': return p.prioridade === 'alta';
    case 'media': return p.prioridade === 'media';
    case 'baixa': return p.prioridade === 'baixa';
    // Status
    case 'pendente': return p.status_analise === 'pendente_analise';
    case 'em_analise': return p.status_analise === 'em_analise';
    case 'resolvido': return p.status_analise === 'resolvido' || p.status_analise === 'corrigido';
    default: return true;
  }
}

export const STATUS_LABELS = {
  pendente_analise: 'Pendente de análise',
  em_analise: 'Em análise',
  aguardando_contato: 'Aguardando contato',
  aguardando_informacao: 'Aguardando informação',
  aguardando_validacao_financeira: 'Aguardando validação financeira',
  possivel_correspondencia: 'Possível correspondência',
  corrigido: 'Corrigido',
  resolvido: 'Resolvido',
  descartado: 'Descartado',
};

export const STATUS_COLORS = {
  pendente_analise: { bg: '#F6E9EC', text: '#8B1A2B' },
  em_analise: { bg: '#DBEAFE', text: '#1D4ED8' },
  aguardando_contato: { bg: '#EDE9FE', text: '#6D28D9' },
  aguardando_informacao: { bg: '#FEF3C7', text: '#B45309' },
  aguardando_validacao_financeira: { bg: '#DBEAFE', text: '#1D4ED8' },
  possivel_correspondencia: { bg: '#DBEAFE', text: '#1D4ED8' },
  corrigido: { bg: '#DCFCE7', text: '#15803D' },
  resolvido: { bg: '#DCFCE7', text: '#15803D' },
  descartado: { bg: '#EDE7E0', text: '#4A3F3F' },
};

export const PRIORIDADE_COLORS = {
  alta: { bg: '#8B1A2B', text: '#FFFFFF' },
  media: { bg: '#FEF3C7', text: '#B45309' },
  baixa: { bg: '#EDE7E0', text: '#4A3F3F' },
};

// ── Resolução de motivos com OK + link WhatsApp ──
export const waMeUrl = (whatsapp) => {
  let d = (whatsapp || '').replace(/\D/g, '');
  while (d.startsWith('5555')) d = d.slice(2);
  if (!d.startsWith('55') && d.length >= 10) d = `55${d}`;
  return `https://wa.me/${d}`;
};

/**
 * Marca/desmarca um motivo da auditoria como resolvido (OK), persistindo
 * no registro de análise com trilha de auditoria. Sem automação — só dado.
 * Quando TODOS os motivos ficam OK, status_analise vira 'resolvido'.
 */
export async function resolverMotivoPendencia(pendencia, motivo, userEmail, resolvedNow = null) {
  const atual = resolvedNow ?? (pendencia.motivos_resolvidos || []);
  const estavaOk = atual.includes(motivo);
  const motivos_resolvidos = estavaOk ? atual.filter(m => m !== motivo) : [...atual, motivo];
  const todos = (pendencia.motivos || []).every(m => motivos_resolvidos.includes(m));
  const status_analise = todos
    ? 'resolvido'
    : (pendencia.status_analise === 'resolvido' ? 'em_analise' : pendencia.status_analise);
  const historico = [...(pendencia._analise?.historico_alteracoes || []), {
    usuario: userEmail || 'sistema', data: new Date().toISOString(), campo: 'motivos_resolvidos',
    valor_anterior: `motivo:${motivo}:${estavaOk ? 'ok' : 'pendente'}`,
    valor_novo: `motivo:${motivo}:${estavaOk ? 'pendente' : 'ok'}`,
    justificativa: estavaOk ? 'Motivo reaberto na auditoria (OK desfeito)' : 'Motivo resolvido com OK na auditoria',
  }];
  const payload = { motivos_resolvidos, status_analise, historico_alteracoes: historico };
  if (pendencia._analise_id) {
    await base44.entities.M31PendenciaConciliacao.update(pendencia._analise_id, payload);
  } else {
    await base44.entities.M31PendenciaConciliacao.create({
      tipo_registro: pendencia.tipo_registro, registro_id: pendencia.registro_id,
      status_analise, prioridade: pendencia.prioridade || 'media',
      responsavel_revisao: userEmail || '', motivos_resolvidos, historico_alteracoes: historico,
    });
  }
  return motivos_resolvidos;
}