import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

const TIPOS_PARTICIPANTE = ['publico_geral', 'caravana', 'doacao'];
const STATUS_CONFIRMADO = ['aprovado', 'gratuito'];
const STATUS_PENDENTE = ['pendente', 'checkout_pendente'];

// Taxa média de gateway estimada por método (Asaas). Usada só para "receita líquida" e "taxas".
// Não altera valor_pago — é uma projeção de custo, transparente ao usuário.
const TAXA_POR_METODO = {
  PIX: 0.0099,          // ~0,99%
  CREDIT_CARD: 0.0349,  // ~3,49%
  DEBIT_CARD: 0.0189,
  BOLETO: 0.0,          // taxa fixa, tratada à parte
  default: 0.02,
};
const TAXA_FIXA_BOLETO = 1.99;

function inferProvedor(i) {
  if (i.origem_pagamento === 'mercado_pago') return 'Mercado Pago';
  if (i.origem_pagamento === 'asaas' || i.asaas_payment_id || i.asaas_charge_url) return 'Asaas';
  if (i.origem_pagamento === 'importacao') return 'Importação';
  if (i.origem_pagamento === 'gratuidade' || i.status_pagamento === 'gratuito') return 'Gratuidade';
  return 'Não classificado';
}

function metodoLabel(bt) {
  const map = {
    PIX: 'PIX', CREDIT_CARD: 'Cartão de crédito', DEBIT_CARD: 'Cartão de débito',
    BOLETO: 'Boleto', TRANSFER: 'Transferência', gratuito: 'Gratuito',
  };
  return map[bt] || 'Não informado';
}

// Valor real da inscrição (total da compra, não valor de uma parcela).
// Asaas grava asaas_total_value = parcelas x valor_parcela. valor_pago pode
// conter apenas o valor de uma parcela quando o backfill não rodou.
function valorReal(i) {
  return i.asaas_total_value && i.asaas_total_value > 0
    ? i.asaas_total_value
    : (i.valor_pago || 0);
}

export function useM31FinanceiroDashboard() {
  const [filtros, setFiltros] = useState({
    periodoInicio: '',
    periodoFim: '',
    provedor: 'todos',
    tipo: 'todos',
    status: 'todos',
  });

  const inscQ = useQuery({
    queryKey: ['m31_fin_inscricoes'],
    queryFn: () => base44.entities.EventoM31Inscricao.list('-created_date', 3000),
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
  const caravanasQ = useQuery({
    queryKey: ['m31_fin_caravanas'],
    queryFn: () => base44.entities.EventoM31Caravana.list('-created_date', 500),
  });
  const voluntariosQ = useQuery({
    queryKey: ['m31_fin_voluntarios'],
    queryFn: () => base44.entities.EventoM31Voluntario.list('-created_date', 1000),
  });

  const isLoading = inscQ.isLoading || caravanasQ.isLoading || voluntariosQ.isLoading;
  const isError = inscQ.isError || caravanasQ.isError || voluntariosQ.isError;
  const inscricoes = inscQ.data || [];
  const caravanas = caravanasQ.data || [];
  const voluntarios = voluntariosQ.data || [];

  const dadosBrutos = useMemo(
    () => inscricoes.filter(i => TIPOS_PARTICIPANTE.includes(i.tipo)),
    [inscricoes]
  );

  // Aplica filtros de UI
  const dados = useMemo(() => {
    return dadosBrutos.filter(i => {
      // período (por data financeira, senão created_date)
      const dataRef = (i.pagamento_confirmado_em || i.created_date || '').slice(0, 10);
      if (filtros.periodoInicio && dataRef && dataRef < filtros.periodoInicio) return false;
      if (filtros.periodoFim && dataRef && dataRef > filtros.periodoFim) return false;
      if (filtros.provedor !== 'todos' && inferProvedor(i) !== filtros.provedor) return false;
      if (filtros.tipo !== 'todos' && i.tipo !== filtros.tipo) return false;
      if (filtros.status !== 'todos') {
        if (filtros.status === 'confirmado' && !STATUS_CONFIRMADO.includes(i.status_pagamento)) return false;
        if (filtros.status === 'pendente' && !STATUS_PENDENTE.includes(i.status_pagamento)) return false;
        if (filtros.status === 'cancelado' && i.status_pagamento !== 'cancelado') return false;
        if (filtros.status === 'abandonado' && i.status_pagamento !== 'checkout_abandonado') return false;
      }
      return true;
    });
  }, [dadosBrutos, filtros]);

  const stats = useMemo(() => {
    const confirmadas = dados.filter(i => STATUS_CONFIRMADO.includes(i.status_pagamento));
    const pendentes = dados.filter(i => STATUS_PENDENTE.includes(i.status_pagamento));
    const abandonadas = dados.filter(i => i.status_pagamento === 'checkout_abandonado');
    const cancelados = dados.filter(i => i.status_pagamento === 'cancelado');
    const checkoutsAberto = dados.filter(
      i => STATUS_PENDENTE.includes(i.status_pagamento) && i.asaas_charge_url
    );

    const receitaRecebida = confirmadas.reduce((s, i) => s + valorReal(i), 0);
    const valorAReceber = pendentes.reduce((s, i) => s + valorReal(i), 0);
    const potencialAbandonado = abandonadas.reduce((s, i) => s + valorReal(i), 0);

    // Taxas estimadas
    let taxas = 0;
    for (const i of confirmadas) {
      const v = valorReal(i);
      if (v <= 0) continue;
      const bt = i.asaas_billing_type;
      if (bt === 'BOLETO') taxas += TAXA_FIXA_BOLETO;
      else taxas += v * (TAXA_POR_METODO[bt] ?? TAXA_POR_METODO.default);
    }
    const receitaLiquida = receitaRecebida - taxas;

    // Divergências: aprovadas com problema de rastreio financeiro
    const divergencias = confirmadas.filter(
      i => !valorReal(i) || (inferProvedor(i) === 'Asaas' && !i.asaas_payment_id) || !i.pagamento_confirmado_em
    );

    return {
      receitaRecebida,
      receitaLiquida,
      taxas,
      valorAReceber,
      potencialAbandonado,
      inscricoesPagas: confirmadas.length,
      checkoutsAbertoCount: checkoutsAberto.length,
      estornosCancelamentos: cancelados.length,
      divergenciasCount: divergencias.length,
      confirmadas,
      pendentes,
      abandonadas,
      cancelados,
      checkoutsAberto,
      divergencias,
      pagamentosUnicos: new Set(confirmadas.map(i => i.asaas_payment_id || i.id)).size,
    };
  }, [dados]);

  // Gráficos
  const graficos = useMemo(() => {
    const { confirmadas } = stats;

    // Receita por dia
    const porDiaMap = {};
    for (const i of confirmadas) {
      const dia = (i.pagamento_confirmado_em || i.created_date || '').slice(0, 10);
      if (!dia) continue;
      porDiaMap[dia] = (porDiaMap[dia] || 0) + valorReal(i);
    }
    const receitaPorDia = Object.entries(porDiaMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dia, valor]) => ({ dia: dia.slice(5), valor: Math.round(valor) }));

    // Receita por provedor
    const porProvMap = {};
    for (const i of confirmadas) {
      const p = inferProvedor(i);
      porProvMap[p] = (porProvMap[p] || 0) + valorReal(i);
    }
    const receitaPorProvedor = Object.entries(porProvMap).map(([nome, valor]) => ({ nome, valor: Math.round(valor) }));

    // Formas de pagamento (contagem)
    const porMetodoMap = {};
    for (const i of confirmadas) {
      const m = metodoLabel(i.asaas_billing_type);
      porMetodoMap[m] = (porMetodoMap[m] || 0) + 1;
    }
    const formasPagamento = Object.entries(porMetodoMap).map(([nome, valor]) => ({ nome, valor }));

    // Pagos x não pagos
    const pagosVsNao = [
      { nome: 'Pagas', valor: stats.inscricoesPagas },
      { nome: 'Pendentes', valor: stats.pendentes.length },
      { nome: 'Abandonadas', valor: stats.abandonadas.length },
    ];

    // Conversão de checkout
    const totalCheckouts = stats.inscricoesPagas + stats.pendentes.length + stats.abandonadas.length;
    const conversao = totalCheckouts > 0 ? (stats.inscricoesPagas / totalCheckouts) * 100 : 0;

    return { receitaPorDia, receitaPorProvedor, formasPagamento, pagosVsNao, conversao };
  }, [stats]);

  // Tabelas
  const tabelas = useMemo(() => {
    const transacoesRecentes = [...stats.confirmadas]
      .sort((a, b) => (b.pagamento_confirmado_em || b.created_date || '').localeCompare(a.pagamento_confirmado_em || a.created_date || ''))
      .slice(0, 25)
      .map(i => ({
        id: i.id, nome: i.nome, valor: valorReal(i),
        metodo: metodoLabel(i.asaas_billing_type), provedor: inferProvedor(i),
        data: (i.pagamento_confirmado_em || i.created_date || '').slice(0, 10),
      }));

    const caravanasResumo = caravanas.map(c => {
      const membros = stats.confirmadas.filter(i => i.caravana_id === c.id);
      return {
        id: c.id, nome: c.nome, lider: c.lider_nome,
        inscritos: membros.length,
        receita: membros.reduce((s, i) => s + valorReal(i), 0),
      };
    }).sort((a, b) => b.receita - a.receita);

    const voluntariosResumo = {
      total: voluntarios.length,
      ativos: voluntarios.filter(v => v.status === 'ativo').length,
      pendentes: voluntarios.filter(v => v.status === 'pendente').length,
      porSetor: Object.entries(
        voluntarios.reduce((acc, v) => { acc[v.setor] = (acc[v.setor] || 0) + 1; return acc; }, {})
      ).map(([setor, qtd]) => ({ setor, qtd })),
    };

    return { transacoesRecentes, caravanasResumo, voluntariosResumo };
  }, [stats, caravanas, voluntarios]);

  // ── Visão "Planilha Financeira" (espelha o relatório contábil) ──────────
  // Agrupa TODAS as inscrições que contam como participante por descrição (tipo + faixa de valor),
  // separando Receita (valor > 0 e rastreável) de Revisar (valor ausente / precisa conferência).
  const planilha = useMemo(() => {
    // Universo: todas as inscrições não canceladas que contam como participante.
    const universo = dadosBrutos.filter(
      i => STATUS_CONFIRMADO.includes(i.status_pagamento) || STATUS_PENDENTE.includes(i.status_pagamento)
    );

    // Considera-se "participante contabilizado" quem está confirmado/gratuito.
    const participantes = universo.filter(i => STATUS_CONFIRMADO.includes(i.status_pagamento));

    // Chave de faixa: valor arredondado (o valor individual pago pela pessoa).
    const linhasMap = {};
    const push = (chave, ordem, descricao, tipo, valorIndividual, obs) => {
      if (!linhasMap[chave]) {
        linhasMap[chave] = { chave, ordem, descricao, tipo, valorIndividual, quantidade: 0, valorColetivo: 0, obs: obs || '' };
      }
      linhasMap[chave].quantidade += 1;
      linhasMap[chave].valorColetivo += valorIndividual || 0;
    };

    for (const i of participantes) {
      const v = Number(valorReal(i));
      const isVol = i.tipo === 'voluntario' || i.origem_inscricao === 'VOLUNTARIO' || i.area_voluntario;
      const isCaravana = i.tipo === 'caravana' || i.caravana_id;
      const isCortesia = i.status_pagamento === 'gratuito' || i.origem_pagamento === 'gratuidade' || i.origem_inscricao === 'CORTESIA';

      if (isCortesia && !isVol && !isCaravana) {
        push('cortesia', 90, 'Cortesias', 'Revisar', 0, 'preset mantido pelo preenchimento (não há dado no sistema)');
        continue;
      }
      if (isVol) {
        if (v > 0) push(`vol_${Math.round(v)}`, 80, `Voluntárias — R$${Math.round(v)}`, 'Receita', v, '');
        else push('vol_sem', 81, 'Voluntárias — sem valor', 'Revisar', 0, 'isento/valor não exportado; contam como participantes');
        continue;
      }
      if (isCaravana) {
        if (v > 0) push(`car_${Math.round(v)}`, 70, `Caravana — R$${Math.round(v)}`, 'Receita', v, '');
        else push('car_sem', 71, 'Caravana — incertas (revisar)', 'Revisar', 0, 'confirmação de líder pendente; fora do padrão');
        continue;
      }
      // Público geral (FILHAS)
      if (v > 0) push(`filhas_${Math.round(v)}`, 10 + Math.round(v) / 1000, `FILHAS — R$${Math.round(v)}`, 'Receita', v, '');
      else push('filhas_sem', 60, 'FILHAS — sem valor no export', 'Revisar', 0, 'pagou, valor não veio no export do sistema');
    }

    const linhas = Object.values(linhasMap).sort((a, b) => a.ordem - b.ordem);

    const totalParticipantes = participantes.length;
    const arrecadacaoBruta = participantes.reduce((s, i) => s + Number(valorReal(i)), 0);

    // Receita comprovada por gateway (bruto)
    let mpBruto = 0, asaasBruto = 0;
    for (const i of participantes) {
      const v = Number(valorReal(i));
      if (v <= 0) continue;
      const prov = inferProvedor(i);
      if (prov === 'Mercado Pago') mpBruto += v;
      else if (prov === 'Asaas') asaasBruto += v;
    }
    const totalBruto = mpBruto + asaasBruto;

    // Taxas estimadas sobre o comprovado
    let taxas = 0;
    for (const i of participantes) {
      const v = Number(valorReal(i));
      if (v <= 0) continue;
      const bt = i.asaas_billing_type;
      if (bt === 'BOLETO') taxas += TAXA_FIXA_BOLETO;
      else taxas += v * (TAXA_POR_METODO[bt] ?? TAXA_POR_METODO.default);
    }
    const totalLiquido = totalBruto - taxas;

    return {
      metaParticipantes: 1000,
      linhas,
      totalParticipantes,
      arrecadacaoBruta,
      gateway: { mpBruto, asaasBruto, totalBruto, totalLiquido, taxas },
    };
  }, [dadosBrutos]);

  const refetch = () => {
    inscQ.refetch(); caravanasQ.refetch(); voluntariosQ.refetch();
  };

  const provedoresDisponiveis = useMemo(() => {
    const set = new Set(dadosBrutos.map(inferProvedor));
    return Array.from(set);
  }, [dadosBrutos]);

  return {
    filtros, setFiltros, refetch,
    isLoading, isError,
    isEmpty: !isLoading && !isError && dadosBrutos.length === 0,
    stats, graficos, tabelas, planilha,
    provedoresDisponiveis,
    atualizadoEm: inscQ.dataUpdatedAt,
  };
}