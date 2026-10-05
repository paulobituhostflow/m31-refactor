/**
 * useM31Conciliacao — Hook que cruza M31TransacaoFinanceira (gateways) com
 * EventoM31Inscricao (sistema) para produzir métricas de conciliação.
 *
 * ═══ REGRA DE FONTE DE DADOS (TRAVADA 10/07) ═══
 * HEADCOUNT OPERACIONAL → computeM31Metrics(inscricoes).inscritasReconhecidas.
 * Cadastro incompleto não exclui participante reconhecida. Voluntárias ficam à parte.
 * A verdade financeira permanece separada em confirmadasFinanceiramente/vagasOficiais.
 * NUNCA derivar headcount de M31TransacaoFinanceira.
 *
 * GATEWAY COMPROVADO → M31TransacaoFinanceira (status=pago)
 *                      195 pagas nos gateways (116 MP + 79 Asaas).
 *                      É DINHEIRO, não gente. Uma inscrição pode ter
 *                      múltiplas parcelas; 195 ≠ 301.
 *
 * VÍNCULOS           → M31TransacaoFinanceira (status_conciliacao=vinculada)
 *                      Conta TRANSAÇÕES com inscrição encontrada, não pessoas.
 *
 * SEM GATEWAY        → EventoM31Inscricao (origem_pagamento ≠ asaas/mercado_pago)
 *                      Aprovadas que pagaram via PIX/líder/import, fora de MP/Asaas.
 * ═════════════════════════════════════════
 */
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { computeM31Metrics } from '@/lib/m31Metrics';

export function useM31Conciliacao() {
  const { data: transacoes = [], isLoading: isLoadingTrans } = useQuery({
    queryKey: ['m31_transacoes_financeiras'],
    queryFn: () => base44.entities.M31TransacaoFinanceira.list('-created_date', 500),
  });

  const { data: inscricoes = [], isLoading: isLoadingInsc } = useQuery({
    queryKey: ['m31_inscricoes_conciliacao'],
    queryFn: () => base44.entities.EventoM31Inscricao.filter({}, '-created_date', 1000),
  });

  const isLoading = isLoadingTrans || isLoadingInsc;
  if (isLoading || !transacoes.length) return { isLoading, metrics: null, transacoes, inscricoes };

  // ── Filtros base ──
  const isTeste = (i) => {
    const n = (i.nome || '').toLowerCase();
    const c = (i.codigo_inscricao || '').toLowerCase();
    return n.includes('teste') || c.includes('teste');
  };

  const temWhatsapp = (i) => (i.whatsapp || '').replace(/\D/g, '').length >= 10;

  const aprovadas = inscricoes.filter(i => i.status_pagamento === 'aprovado' && !isTeste(i));
  const cortesias = inscricoes.filter(i => i.status_pagamento === 'gratuito' && !isTeste(i));

  // ── Financeiro (das transações importadas) ──
  const mpAll = transacoes.filter(t => t.gateway === 'mercado_pago');
  const asAll = transacoes.filter(t => t.gateway === 'asaas');
  const mpPagos = mpAll.filter(t => t.status === 'pago');
  const asPagos = asAll.filter(t => t.status === 'pago');

  const mpBruto = mpPagos.reduce((s, t) => s + (t.valor_bruto || 0), 0);
  const mpLiq = mpPagos.reduce((s, t) => s + (t.valor_liquido || 0), 0);
  const asBruto = asPagos.reduce((s, t) => s + (t.valor_bruto || 0), 0);
  const asLiq = asPagos.reduce((s, t) => s + (t.valor_liquido || 0), 0);

  // ── Conciliação ──
  const vinculadas = transacoes.filter(t => t.status_conciliacao === 'vinculada');
  const pendentes = transacoes.filter(t => t.status_conciliacao === 'pendente_conciliacao' && t.status === 'pago');
  const asPendentes = asAll.filter(t => t.status === 'pendente');

  // ── Recorte financeiro por tipo. WhatsApp ausente é qualidade cadastral, não exclusão. ──
  const filhas = aprovadas.filter(i => i.tipo === 'publico_geral');
  const caravanas = aprovadas.filter(i => i.tipo === 'caravana');
  const voluntarios = aprovadas.filter(i => i.tipo === 'voluntario');

  // Dados a completar (não retiram ninguém do headcount)
  const filhasRevisar = aprovadas.filter(i => i.tipo === 'publico_geral' && !temWhatsapp(i));
  const caravanasRevisar = aprovadas.filter(i => i.tipo === 'caravana' && !temWhatsapp(i));
  const voluntariosRevisar = aprovadas.filter(i => i.tipo === 'voluntario' && !temWhatsapp(i));

  // Filhas por valor_pago (lotes) — sobre confiável
  const byValorMap = {};
  for (const f of filhas) {
    const v = Number(f.valor_pago) || 0;
    const key = v === 0 ? 'sem_valor' : String(v);
    if (!byValorMap[key]) byValorMap[key] = { valor: v, count: 0, total: 0, sem_valor: v === 0 };
    byValorMap[key].count++;
    byValorMap[key].total += v;
  }
  const filhasByValor = Object.values(byValorMap).sort((a, b) => a.valor - b.valor);

  // Caravana com/sem whatsapp (confiável vs revisar)
  const carComWpp = caravanas;           // já é confiável
  const carSemWpp = caravanasRevisar;    // sem whatsapp = revisar

  // Sem gateway (aprovadas sem MP/Asaas)
  const semGateway = aprovadas.filter(i =>
    i.origem_pagamento !== 'asaas' && i.origem_pagamento !== 'mercado_pago'
  );

  const valorTotal = aprovadas.reduce((s, i) => s + (Number(i.valor_pago) || 0), 0);

  // ── Oficial (computeM31Metrics — regra travada 10/07) ──
  const oficialMetrics = computeM31Metrics(inscricoes);

  // ── Gateway comprovado (das transações pagas) ──
  const transPagas = transacoes.filter(t => t.status === 'pago');
  const gatewayBruto = transPagas.reduce((s, t) => s + (t.valor_bruto || 0), 0);
  const gatewayLiquido = transPagas.reduce((s, t) => s + (t.valor_liquido || 0), 0);

  const metrics = {
    oficial: {
      inscritas: oficialMetrics.inscritasReconhecidas,
      inscritasReconhecidas: oficialMetrics.inscritasReconhecidas,
      confirmadasFinanceiramente: oficialMetrics.confirmadasFinanceiramente,
      voluntarias: oficialMetrics.voluntarias,
      totalPagas: oficialMetrics.totalPagas,
      cobrancasPendentes: oficialMetrics.cobrancasPendentes,
      emConciliacao: oficialMetrics.emConciliacao
    },
    gateway_comprovado: {
      pagas: transPagas.length,                         // 195
      valor_bruto: Math.round(gatewayBruto * 100) / 100,
      valor_liquido: Math.round(gatewayLiquido * 100) / 100,
      vs_total: oficialMetrics.totalPagas,             // 291 (comparativo: 195 gateway vs 291 sistema)
    },
    financeiro: {
      mp: { total: mpAll.length, pagas: mpPagos.length, canceladas: mpAll.filter(t => t.status === 'cancelado').length, bruto: mpBruto, liquido: mpLiq, taxa: Math.round((mpBruto - mpLiq) * 100) / 100 },
      asaas: { total: asAll.length, pagas: asPagos.length, pendentes: asPendentes.length, bruto: asBruto, liquido: asLiq, taxa: Math.round((asBruto - asLiq) * 100) / 100 },
      consolidado: { bruto: Math.round((mpBruto + asBruto) * 100) / 100, liquido: Math.round((mpLiq + asLiq) * 100) / 100, taxa: Math.round(((mpBruto - mpLiq) + (asBruto - asLiq)) * 100) / 100 },
    },
    conciliacao: {
      vinculadas: vinculadas.length,
      pendentes: pendentes.length,
      sem_gateway: semGateway.length,
      asaas_pendentes: asPendentes.length,
    },
    participantes: {
      total_aprovadas: aprovadas.length,
      total_cortesias: cortesias.length,
      total_participantes: aprovadas.length + cortesias.length,
      valor_total: valorTotal,
      filhas: {
        count: filhas.length,
        revisar: filhasRevisar.length,
        valor: filhas.reduce((s, f) => s + (Number(f.valor_pago) || 0), 0),
        byValor: filhasByValor,
        sem_valor: filhas.filter(f => !Number(f.valor_pago)).length,
      },
      caravana: {
        count: caravanas.length,
        revisar: caravanasRevisar.length,
        valor: caravanas.reduce((s, c) => s + (Number(c.valor_pago) || 0), 0),
        comWpp: carComWpp.length,
        semWpp: carSemWpp.length,
        sem_valor: caravanas.filter(c => !Number(c.valor_pago)).length,
      },
      voluntarios: {
        count: voluntarios.length,
        revisar: voluntariosRevisar.length,
        valor: voluntarios.reduce((s, v) => s + (Number(v.valor_pago) || 0), 0),
        sem_valor: voluntarios.filter(v => !Number(v.valor_pago)).length,
      },
    },
    pendencias: {
      orfaos_mp: pendentes,
      sem_gateway: semGateway.slice(0, 50),
      asaas_pendentes_count: asPendentes.length,
    },
  };

  return { metrics, isLoading, transacoes, inscricoes };
}