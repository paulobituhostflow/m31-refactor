/**
 * m31Metrics — projeção central das métricas do M31.
 *
 * `estado_canonico` continua sendo a autoridade da verdade financeira/canônica.
 * O headcount operacional `inscritas` é deliberadamente mais amplo: reconhece
 * participação coerente sem exigir cadastro completo, sem alterar o estado financeiro.
 *
 * REGRA OFICIAL: 1 vaga válida = 1 inscrição canônica.
 *   VAGAS OFICIAIS = confirmada + isenta
 *   confirmada + isenta + pendente + revisar = 100% das inscrições canônicas
 *
 * PROIBIDO reintroduzir aqui qualquer critério próprio (whatsapp válido, valor,
 * status_pagamento, tipo). Foi exatamente isso que produziu números divergentes
 * entre telas. Se a regra precisar mudar, muda em m31ConciliacaoCanonica.
 *
 * DISPLAY-ONLY: apenas conta e retorna números. Nunca escreve, nunca dispara.
 */

// Módulo puro compartilhado com o backend de Cartinhas; nenhuma dependência de servidor.
import { ehInscritaReconhecida } from '../../worker/functions/m31Cartinhas/participacaoReconhecida.js';
export { ehInscritaReconhecida };

const TIPOS_COMUNS = ['publico_geral', 'caravana'];

/** Registro sem veredito ainda (criado após a última conciliação) nunca é
 *  contado como vaga confirmada — entra em revisão até a conciliação passar. */
export function estadoCanonicoDe(inscricao) {
  return estadoDe(inscricao);
}

function estadoDe(inscricao) {
  const estado = inscricao.estado_canonico;
  if (estado) return estado;
  if (['aprovado', 'gratuito'].includes(inscricao.status_pagamento)) return 'revisar';
  if (inscricao.status_pagamento === 'cancelado') return 'fora_do_universo';
  return 'pendente';
}

export function computeM31Metrics(inscricoes = []) {
  const porEstado = (estado) => inscricoes.filter((i) => estadoDe(i) === estado);

  const confirmadas = porEstado('confirmada');
  const isentas = porEstado('isenta');
  const pendentes = porEstado('pendente');
  const emRevisao = porEstado('revisar');
  const foraDoUniverso = porEstado('fora_do_universo');

  const vagasOficiais = [...confirmadas, ...isentas];
  const comunsFinanceiramenteConfirmadas = vagasOficiais.filter((i) => TIPOS_COMUNS.includes(i.tipo));
  const voluntarias = vagasOficiais.filter((i) => i.tipo === 'voluntario');
  // Cobrança realmente pendente: exige intenção financeira materializada.
  // Não inclui automaticamente todo estado canônico pendente/revisar.
  const cobrancasPendentes = inscricoes.filter(i => {
    if (!TIPOS_COMUNS.includes(i.tipo) || estadoDe(i) === 'fora_do_universo' || i.status_pagamento === 'cancelado') return false;
    if (['aprovado','gratuito'].includes(i.status_pagamento) || i.pagamento_confirmado_em || i.origem_pagamento === 'gratuidade') return false;
    const statusPendente = ['checkout_pendente','pendente'].includes(i.status_pagamento) || ['ACTIVE','PENDING','OVERDUE'].includes(String(i.asaas_checkout_status || '').toUpperCase());
    const ancoraCobranca = !!(i.asaas_checkout_id || i.asaas_payment_id || i.asaas_installment_id || i.asaas_charge_url);
    return statusPendente && ancoraCobranca;
  });

  // Headcount operacional de inscritas reconhecidas é independente da qualidade
  // cadastral. Não exige CPF, telefone, e-mail, cidade ou código completos.
  // O estado canônico financeiro continua intacto e disponível em vagasOficiais.
  const inscritasReconhecidas = inscricoes.filter(ehInscritaReconhecida);
  const canonicas = confirmadas.length + isentas.length + pendentes.length + emRevisao.length;

  return {
    // ── RESPOSTA OFICIAL: "quantas inscritas temos?" ──
    vagasOficiais: vagasOficiais.length,
    confirmadasFinanceiramente: confirmadas.length,
    isentas: isentas.length,
    pendentes: pendentes.length,
    emRevisao: emRevisao.length,
    emConciliacao: emRevisao.length,
    cobrancasPendentes: cobrancasPendentes.length,
    inscricoesCanonicas: canonicas,
    foraDoUniverso: foraDoUniverso.length,

    // ── Recortes operacionais e financeiros separados ──
    // Principal do painel: participação reconhecida, mesmo com cadastro incompleto.
    inscritas: inscritasReconhecidas.length,
    inscritasReconhecidas: inscritasReconhecidas.length,
    // Recorte financeiro estrito preservado para conciliação/financeiro.
    comuns: comunsFinanceiramenteConfirmadas.length,
    voluntarias: voluntarias.length,
    abandonaram: pendentes.filter((i) => i.status_pagamento === 'checkout_abandonado').length,
    canceladas: foraDoUniverso.filter((i) => i.status_pagamento === 'cancelado').length,
    duplicadas: foraDoUniverso.filter((i) => i.duplicada_de_id).length,

    // ── Financeiro: só sobre evidência financeira confirmada ──
    receitaConfirmada: confirmadas.reduce((soma, i) => soma + (i.valor_pago || 0), 0),
    receitaPendente: pendentes.reduce((soma, i) => soma + (i.valor_pago || 0), 0),

    // ── Compat com telas antigas: apontam para a mesma verdade ──
    totalPagas: confirmadas.length,
    inscritasPagas: comunsFinanceiramenteConfirmadas.length,
    // Compat visual: agora significa cobrança efetivamente pendente, não todo estado canônico pendente.
    pagPendente: cobrancasPendentes.length,
    total: canonicas || 1,
    totalBanco: inscricoes.length,
  };
}