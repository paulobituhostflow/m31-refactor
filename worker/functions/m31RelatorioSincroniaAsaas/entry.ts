// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31RelatorioSincroniaAsaas
 *
 * Cruza pagamentos confirmados no Asaas com inscrições no banco.
 * Identifica: quem pagou no Asaas mas não recebeu WhatsApp de boas-vindas.
 *
 * Retorna:
 *   - Pagos no Asaas (últimos N dias)
 *   - Esperados no banco (status_pagamento = aprovado)
 *   - Discrepâncias: pago mas sem WhatsApp
 *   - Sugestões de correção
 */

interface AsaasPayment {
  id: string;
  status: string;
  value: number;
  externalReference: string;
  billingType: string;
  dueDate: string;
  confirmationDate: string;
  customer: { name: string; email: string };
}

async function fetchAsaasPayments(dias = 7): Promise<AsaasPayment[]> {
  const ASAAS_API_KEY = config('ASAAS_API_KEY');
  if (!ASAAS_API_KEY) throw new Error('ASAAS_API_KEY não configurado');

  const dataInicio = new Date();
  dataInicio.setDate(dataInicio.getDate() - dias);
  const dataInicioStr = dataInicio.toISOString().split('T')[0];

  const url = `__ASAAS_API__/payments?status=RECEIVED,CONFIRMED&dateCreatedFrom=${dataInicioStr}&limit=300`;

  const res = await fetch(url, {
    headers: { 'access-token': ASAAS_API_KEY }
  });

  if (!res.ok) {
    logger.error(`[Asaas] Erro ${res.status}:`, await res.text());
    throw new Error(`Asaas API erro ${res.status}`);
  }

  const data = await res.json();
  return data.data || [];
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const diasHistorico = body.dias || 7;

    logger.log(`[Relatório] Buscando pagamentos dos últimos ${diasHistorico} dias...`);

    // ── 1. Buscar pagamentos no Asaas ──────────────────────────────────────
    let pagamentosAsaas: AsaasPayment[] = [];
    try {
      pagamentosAsaas = await fetchAsaasPayments(diasHistorico);
    } catch (e) {
      logger.error('[Relatório] Erro ao buscar Asaas:', e.message);
      return Response.json({
        error: 'falha_asaas',
        detalhes: e.message,
        sugestao: 'Verificar ASAAS_API_KEY e conectividade'
      }, { status: 500 });
    }

    logger.log(`[Relatório] Total de pagamentos no Asaas: ${pagamentosAsaas.length}`);

    // ── 2. Buscar inscrições aprovadas no banco ────────────────────────────
    const inscricoesAprovadas = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
      { status_pagamento: 'aprovado' },
      '-updated_date',
      500
    );

    logger.log(`[Relatório] Total de inscrições aprovadas no banco: ${inscricoesAprovadas.length}`);

    // ── 3. Cruzamento ─────────────────────────────────────────────────────
    const codigosAsaasMap = new Map<string, AsaasPayment>();
    pagamentosAsaas.forEach(pag => {
      if (pag.externalReference) {
        codigosAsaasMap.set(pag.externalReference, pag);
      }
    });

    const discrepancias = [];
    const sincronizados = [];
    const semReferenciaAsaas = [];

    for (const inscricao of inscricoesAprovadas) {
      const codigo = inscricao.codigo_inscricao;
      const temWhatsApp = !!inscricao.data_envio_boas_vindas;
      const pagamentoAsaas = codigo ? codigosAsaasMap.get(codigo) : null;

      // Existe no Asaas?
      if (!pagamentoAsaas) {
        // Inscrição aprovada no banco mas não achamos no Asaas (últimos N dias)
        // Pode ser que o pagamento foi há mais tempo
        continue;
      }

      // Existe no Asaas e tem WhatsApp no banco → OK
      if (temWhatsApp) {
        sincronizados.push({
          codigo,
          nome: inscricao.nome,
          status: 'OK',
          asaas_value: pagamentoAsaas.value,
          asaas_type: pagamentoAsaas.billingType,
          data_whatsapp: inscricao.data_envio_boas_vindas
        });
        continue;
      }

      // Existe no Asaas MAS NÃO TEM WhatsApp no banco → DISCREPÂNCIA
      discrepancias.push({
        codigo,
        nome: inscricao.nome,
        email: inscricao.email,
        whatsapp: inscricao.whatsapp,
        asaas_payment_id: pagamentoAsaas.id,
        asaas_value: pagamentoAsaas.value,
        asaas_type: pagamentoAsaas.billingType,
        asaas_date: pagamentoAsaas.confirmationDate,
        status_banco: 'aprovado_mas_sem_whatsapp',
        inscricao_id: inscricao.id,
        fila_boas_vindas: inscricao.fila_boas_vindas,
        status_envio_grupo: inscricao.status_envio_grupo,
        qr_envio_status: inscricao.qr_envio_status,
        acao_recomendada: inscricao.fila_boas_vindas
          ? 'Aguardando aprovação manual (está na fila)'
          : 'Enviar boas-vindas manualmente ou reprocessar'
      });
    }

    // ── 4. Págamentos no Asaas sem correspondência no banco ────────────────
    const pagamentosSemInscricao = pagamentosAsaas.filter(pag => 
      !pag.externalReference || !codigosAsaasMap.has(pag.externalReference) ||
      !inscricoesAprovadas.find(i => i.codigo_inscricao === pag.externalReference)
    );

    const respostaPagtosSemInscricao = pagamentosSemInscricao.map(pag => ({
      asaas_payment_id: pag.id,
      valor: pag.value,
      tipo: pag.billingType,
      data: pag.confirmationDate,
      referencia: pag.externalReference || 'SEM_REFERENCIA',
      cliente: pag.customer?.name || 'N/A',
      status: 'ORFÃO_NO_ASAAS',
      acao_recomendada: 'Procurar inscrição manual ou marcar como ignorado'
    }));

    return Response.json({
      periodo_dias: diasHistorico,
      timestamp: new Date().toISOString(),
      resumo: {
        pagamentos_asaas_total: pagamentosAsaas.length,
        inscricoes_banco_aprovadas: inscricoesAprovadas.length,
        sincronizadas_ok: sincronizados.length,
        discrepancias: discrepancias.length,
        orfaos_no_asaas: respostaPagtosSemInscricao.length
      },
      dados: {
        sincronizadas: sincronizados,
        discrepancias,
        orfaos_no_asaas: respostaPagtosSemInscricao
      },
      sugestoes: [
        `${discrepancias.length} inscrições receberam pagamento no Asaas mas NÃO receberam WhatsApp.`,
        discrepancias.length > 0 ? `Usar m31DespacharConfirmacoes com inscricao_id para enviar WhatsApp de boas-vindas.` : '',
        respostaPagtosSemInscricao.length > 0 ? `${respostaPagtosSemInscricao.length} pagamentos no Asaas não têm inscrição correspondente — auditoria necessária.` : ''
      ].filter(Boolean)
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
