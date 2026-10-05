// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31AuditoriaPagamentos72h — Auditoria forense de pagamentos confirmados (72h)
 *
 * Para CADA pagamento confirmado no Asaas nas últimas 72h, cruza:
 *   - Webhook (M31AsaasWebhookEvento): chegou? processou? erro?
 *   - Inscrição (EventoM31Inscricao): vinculada? status? QR? WhatsApp? email?
 *
 * Identifica a ETAPA EXATA onde o fluxo quebrou:
 *   Asaas confirmou → webhook chegou → pagamento vinculado → inscrição aprovada → QR gerado → confirmação enviada
 *
 * Categorias:
 *   1. correta: confirmado + inscrição aprovada + QR + WhatsApp
 *   2. sem_inscricao: confirmado sem inscrição vinculada
 *   3. inscricao_pendente: confirmado mas inscrição ainda não aprovada
 *   4. sem_qr: inscrição aprovada sem QR ou WhatsApp
 *   5. webhook_erro: webhook ausente ou com erro
 */

const JANELA_HORAS = 72;
const TIME_BUDGET_MS = 110000;

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    try {
      const user = await base44.auth.me();
      if (user && user.role !== 'admin') {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    } catch { /* automação */ }

    const asaasKey = config('ASAAS_API_KEY');
    if (!asaasKey) return Response.json({ error: 'ASAAS_API_KEY não configurada' }, { status: 500 });

    const startTime = Date.now();
    const S = base44.asServiceRole.entities;
    const agora = Date.now();
    const corte72h = new Date(agora - JANELA_HORAS * 3600000).toISOString();
    const corte72hDate = new Date(corte72h);

    // ═══ 1. BUSCAR PAGAMENTOS CONFIRMADOS NAS ÚLTIMAS 72H ═══
    const pagamentos = [];
    const vistos = new Set();

    for (const status of ['RECEIVED', 'CONFIRMED']) {
      let offset = 0;
      while (Date.now() - startTime < TIME_BUDGET_MS) {
        const url = `__ASAAS_API__/payments?status=${status}&offset=${offset}&limit=100&order=desc&sort=dateCreated`;
        let resp;
        try { resp = await fetch(url, { headers: { 'access_token': asaasKey } }); }
        catch { break; }
        if (!resp.ok) break;
        const batch = await resp.json();
        if (!batch.data || batch.data.length === 0) break;
        let achouAntigo = false;
        for (const p of batch.data) {
          const dataConf = p.confirmedDate || p.paymentDate || p.clientPaymentDate || p.dateCreated;
          if (dataConf && new Date(dataConf) < corte72hDate) { achouAntigo = true; continue; }
          if (!vistos.has(p.id)) { vistos.add(p.id); pagamentos.push(p); }
        }
        if (achouAntigo) break;
        offset += 100;
        if (batch.data.length < 100) break;
      }
    }

    // ═══ 2. CACHE DE CLIENTES (evita refetch do mesmo customer em parcelas) ═══
    const customerCache = {};
    async function fetchCustomer(customerId) {
      if (!customerId) return null;
      if (customerId in customerCache) return customerCache[customerId];
      try {
        const resp = await fetch(`__ASAAS_API__/customers/${customerId}`, {
          headers: { 'access_token': asaasKey }
        });
        if (!resp.ok) { customerCache[customerId] = null; return null; }
        const c = await resp.json();
        customerCache[customerId] = c;
        return c;
      } catch { customerCache[customerId] = null; return null; }
    }

    // ═══ 3. CARREGAR WEBHOOKS E INDEXAR POR payment_id ═══
    const webhooks = await S.M31AsaasWebhookEvento.filter({}, '-recebido_em', 500);
    const webhookPorPaymentId = {};
    for (const w of webhooks) {
      if (w.recebido_em && new Date(w.recebido_em) < corte72hDate) continue;
      if (w.payment_id) {
        if (!webhookPorPaymentId[w.payment_id]) webhookPorPaymentId[w.payment_id] = [];
        webhookPorPaymentId[w.payment_id].push(w);
      }
    }

    // ═══ 4. CARREGAR INSCRIÇÕES E INDEXAR POR MÚLTIPLAS CHAVES ═══
    const inscricoes = await S.EventoM31Inscricao.filter({}, '-created_date', 500);
    const porPaymentId = {}, porInstallmentId = {}, porCodigo = {}, porCpf = {}, porCheckoutId = {};
    for (const i of inscricoes) {
      if (i.asaas_payment_id) porPaymentId[i.asaas_payment_id] = i;
      if (i.asaas_installment_id) porInstallmentId[i.asaas_installment_id] = i;
      if (i.codigo_inscricao) porCodigo[i.codigo_inscricao] = i;
      if (i.cpf) { const cpf=i.cpf.replace(/\D/g,''); if(!porCpf[cpf]) porCpf[cpf]=[]; porCpf[cpf].push(i); }
      if (i.asaas_checkout_id) porCheckoutId[i.asaas_checkout_id] = i;
    }

    // ═══ 5. CARREGAR PEDIDOS DE CAMISA — ENTIDADE FINANCEIRA INDEPENDENTE ═══
    // M31CAMISA:<id> nunca é conciliado contra EventoM31Inscricao.
    const pedidosCamisa = await S.EventoM31CamisaPedido.filter({}, '-created_date', 500);
    const pedidoCamisaPorId = {};
    for (const pedido of pedidosCamisa) pedidoCamisaPorId[pedido.id] = pedido;

    // Associação opcional apenas informativa: compradora também possui inscrição.
    function inscricaoComplementarCamisa(pedido) {
      const cpf = String(pedido?.cpf || '').replace(/\D/g, '');
      const tel = String(pedido?.whatsapp || '').replace(/\D/g, '');
      if (cpf && porCpf[cpf]?.length === 1) return porCpf[cpf][0];
      if (!tel) return null;
      const telSem55 = tel.replace(/^55/, '');
      return inscricoes.find(i => {
        const it = String(i.whatsapp || '').replace(/\D/g, '');
        return it === tel || it === telSem55 || it.replace(/^55/, '') === telSem55;
      }) || null;
    }

    // ═══ 6. CROSS-REFERENCE CADA PAGAMENTO ═══
    const categorias = { correta: [], sem_inscricao: [], inscricao_pendente: [], sem_qr: [], webhook_erro: [], divergencia_critica: [] };
    const comprasCamisa = [];
    let totalWebhooksRecebidos = 0;
    let totalReconciliadosSafetyNet = 0;

    for (const p of pagamentos) {
      const ref = p.externalReference || '';

      // ── CAMISA: fluxo financeiro próprio ────────────────────────────────
      // Asaas → webhook → EventoM31CamisaPedido → pago → estoque/aviso.
      // Não exige inscrição, QR Code nem boas-vindas do evento.
      if (typeof ref === 'string' && ref.startsWith('M31CAMISA:')) {
        const pedidoId = ref.slice('M31CAMISA:'.length);
        const pedido = pedidoCamisaPorId[pedidoId] || null;
        const webhookEvents = webhookPorPaymentId[p.id] || [];
        const webhookRecebido = webhookEvents.length > 0;
        const webhookPrincipal = webhookEvents[0];
        if (webhookRecebido) totalWebhooksRecebidos++;

        const valorAsaas = Number(p.value || 0);
        const valorPedido = Number(pedido?.valor_total || 0);
        const valorConfere = !!pedido && Math.round(valorAsaas * 100) === Math.round(valorPedido * 100);
        const paymentConfere = !!pedido && (!pedido.asaas_payment_id || pedido.asaas_payment_id === p.id);
        const pedidoPago = pedido?.status_pagamento === 'pago';
        const inscricaoInfo = pedido ? inscricaoComplementarCamisa(pedido) : null;

        let resultado = 'correto';
        let etapaQuebra = null;
        if (!pedido) {
          resultado = 'pedido_nao_existe';
          etapaQuebra = 'pedido_nao_existe — externalReference aponta para pedido de camisa inexistente';
        } else if (!valorConfere) {
          resultado = 'valor_divergente';
          etapaQuebra = `valor_divergente — Asaas R$ ${valorAsaas.toFixed(2)} / pedido R$ ${valorPedido.toFixed(2)}`;
        } else if (!paymentConfere) {
          resultado = 'payment_id_divergente';
          etapaQuebra = 'payment_id_divergente — cobrança confirmada não corresponde ao payment_id do pedido';
        } else if (!pedidoPago) {
          resultado = 'pedido_nao_pago';
          etapaQuebra = `pedido_nao_pago — Asaas confirmou, mas pedido permanece status="${pedido.status_pagamento || 'ausente'}"`;
        }

        comprasCamisa.push({
          tipo_transacao: 'camisa', payment_id: p.id, external_reference: ref,
          pedido_id: pedido?.id || pedidoId, numero_pedido: pedido?.numero_pedido ?? null,
          pedido_nome: pedido?.nome || null, valor: valorAsaas, valor_pedido: pedido ? valorPedido : null,
          status_asaas: p.status, status_pedido: pedido?.status_pagamento || null,
          webhook_recebido: webhookRecebido, webhook_status: webhookPrincipal?.status || null,
          resultado, etapa_quebra: etapaQuebra,
          inscrita_tambem: !!inscricaoInfo, inscricao_complementar_id: inscricaoInfo?.id || null,
          inscricao_complementar_nome: inscricaoInfo?.nome || null,
          estoque_status: pedido?.estoque_status || pedido?.camisa_estoque_status || null,
          aviso_status: pedido?.aviso_dulce_status || null,
          data_confirmacao: p.confirmedDate || p.paymentDate || p.clientPaymentDate || null,
        });
        continue;
      }

      // ── INSCRIÇÃO: somente daqui em diante aplica QR/WhatsApp/inscrição ──
      // ExternalReference é a âncora de negócio; payment.id é uma âncora financeira
      // diferente. Aceitamos somente os dois contratos oficiais, nunca CPF/valor soltos.
      const refMatch = /^(\d{11})-M31FILHAS(?:-(PIX|CREDIT_CARD)-(\d+))?$/.exec(ref);
      const cpfRef = refMatch?.[1] || null;
      const metodoRef = refMatch?.[2] || null;
      const parcelasRef = refMatch?.[3] ? Number(refMatch[3]) : null;
      const candidatosRef = cpfRef ? (porCpf[cpfRef] || []) : [];
      const candidatosCompativeis = candidatosRef.filter(i =>
        (!metodoRef || String(i.payment_method || '').toUpperCase() === metodoRef) &&
        (!parcelasRef || Number(i.installment_count || 0) === parcelasRef)
      );
      const porRefEstrita = refMatch && candidatosCompativeis.length === 1 ? candidatosCompativeis[0] : null;
      const matched = porPaymentId[p.id] || porInstallmentId[p.installment] || porCodigo[ref] || porRefEstrita || porCheckoutId[p.id] || null;

      const valorAsaasTotal = Number(p.totalValue || ((p.installmentCount && p.installmentValue) ? Number(p.installmentCount) * Number(p.installmentValue) : p.value));
      const valorBase44 = Number(matched?.valor_pago || 0);
      const valorConfere = !!matched && valorBase44 > 0 && Math.abs(valorAsaasTotal - valorBase44) < 0.011;
      const parcelasAsaas = Number(p.installmentCount || (p.billingType === 'CREDIT_CARD' ? 1 : 1));
      const parcelasConfere = !!matched && (!parcelasRef || (parcelasAsaas === parcelasRef && Number(matched.installment_count || 0) === parcelasRef));
      const metodoConfere = !!matched && (!metodoRef || (String(p.billingType || '').toUpperCase() === metodoRef && String(matched.payment_method || '').toUpperCase() === metodoRef));
      const divergenciaCritica = !!matched && (!valorConfere || !parcelasConfere || !metodoConfere);

      const customer = await fetchCustomer(p.customer);
      const pagadorNome = customer?.name || null;
      const pagadorCpf = customer?.cpfCnpj ? customer.cpfCnpj.replace(/\D/g, '') : null;

      const webhookEvents = webhookPorPaymentId[p.id] || [];
      const webhookRecebido = webhookEvents.length > 0;
      const webhookPrincipal = webhookEvents[0];
      const webhookStatus = webhookPrincipal?.status || null;
      const webhookErro = webhookPrincipal?.erro || null;
      if (webhookRecebido) totalWebhooksRecebidos++;

      const dataConfirmacao = p.confirmedDate || p.paymentDate || p.clientPaymentDate || null;

      const inscStatus = matched?.status_pagamento || null;
      const qrGerado = !!(matched?.qrcode_url);
      const whatsappEnviado = !!(matched?.data_envio_boas_vindas) || matched?.qr_envio_status === 'enviado_com_sucesso';
      const emailEnviado = matched?.email_envio_status === 'enviado';

      const linha = {
        payment_id: p.id,
        checkout_id: p.checkout || p.checkoutId || null,
        pagador_nome: pagadorNome,
        pagador_cpf: pagadorCpf,
        valor: p.value,
        data_confirmacao: dataConfirmacao,
        date_created: p.dateCreated,
        status_asaas: p.status,
        billing_type: p.billingType,
        external_reference: ref,
        installment: p.installment || null,
        inscricao_id: matched?.id || null,
        inscricao_nome: matched?.nome || null,
        inscricao_status: inscStatus,
        inscricao_tipo: matched?.tipo || null,
        cadastro_pendente: matched?.cadastro_pendente || false,
        webhook_recebido: webhookRecebido,
        webhook_status: webhookStatus,
        webhook_erro: webhookErro,
        qr_gerado: qrGerado,
        whatsapp_enviado: whatsappEnviado,
        email_enviado: emailEnviado,
        categoria: 0,
        valor_asaas_total: valorAsaasTotal,
        valor_base44: valorBase44 || null,
        valor_confere: valorConfere,
        parcelas_ref: parcelasRef,
        parcelas_asaas: parcelasAsaas,
        parcelas_confere: parcelasConfere,
        metodo_ref: metodoRef,
        metodo_confere: metodoConfere,
        divergencia_critica: divergenciaCritica,
        etapa_quebra: null,
      };

      // ═══ CATEGORIZAR + IDENTIFICAR ETAPA DA QUEBRA ═══
      if (divergenciaCritica) {
        linha.categoria = 6;
        linha.etapa_quebra = `ALERTA_CRITICO_FAIL_CLOSED — divergência financeira: valor=${valorConfere}, parcelas=${parcelasConfere}, método=${metodoConfere}. Nenhuma alteração automática foi feita.`;
        logger.error('[M31 AUDITORIA 72H]', linha.etapa_quebra, { payment_id:p.id, external_reference:ref, inscricao_id:matched.id });
        categorias.divergencia_critica.push(linha);
      } else if (!matched) {
        if (!webhookRecebido) {
          linha.categoria = 5;
          linha.etapa_quebra = 'webhook_nao_chegou — Asaas confirmou mas o webhook PAYMENT_CONFIRMED não chegou ao sistema';
          categorias.webhook_erro.push(linha);
        } else if (webhookStatus === 'falha') {
          linha.categoria = 5;
          linha.etapa_quebra = `webhook_falhou — ${webhookErro || 'erro de processamento'}`;
          categorias.webhook_erro.push(linha);
        } else if (webhookStatus === 'processando') {
          linha.categoria = 5;
          linha.etapa_quebra = 'webhook_travado — em processamento há mais tempo que o esperado';
          categorias.webhook_erro.push(linha);
        } else {
          // webhook processou mas não vinculou inscrição
          linha.categoria = 2;
          linha.etapa_quebra = `vinculo_falhou — webhook processou (${webhookStatus}) mas não vinculou a inscrição. ref="${ref}"`;
          categorias.sem_inscricao.push(linha);
        }
      } else if (inscStatus !== 'aprovado' && inscStatus !== 'gratuito') {
        linha.categoria = 3;
        linha.etapa_quebra = `inscricao_pendente — status="${inscStatus}" (pagamento confirmado no Asaas mas inscrição não foi atualizada para aprovado)`;
        categorias.inscricao_pendente.push(linha);
      } else if (matched.tipo === 'voluntario') {
        // Voluntário: fluxo correto = email enviado (sem WhatsApp/QR obrigatório)
        if (!emailEnviado) {
          linha.categoria = 4;
          linha.etapa_quebra = 'email_nao_enviado — voluntário aprovado mas email de confirmação não foi enviado';
          categorias.sem_qr.push(linha);
        } else {
          linha.categoria = 1;
          categorias.correta.push(linha);
        }
      } else if (matched.cadastro_pendente === true) {
        // Presenteada com cadastro pendente: correto = aguardando conclusão do cadastro
        linha.categoria = 1;
        linha.etapa_quebra = null;
        categorias.correta.push(linha);
      } else if (!qrGerado || !whatsappEnviado) {
        linha.categoria = 4;
        if (!qrGerado) linha.etapa_quebra = 'qr_nao_gerado — inscrição aprovada mas QR Code não foi gerado';
        else if (!whatsappEnviado) linha.etapa_quebra = 'whatsapp_nao_enviado — QR gerado mas confirmação WhatsApp não foi enviada';
        categorias.sem_qr.push(linha);
      } else {
        linha.categoria = 1;
        categorias.correta.push(linha);
      }

      // Safety net: pagamento vinculado sem webhook (reconciliação manual/automática detectou)
      if (matched && !webhookRecebido) {
        totalReconciliadosSafetyNet++;
      }
    }

    // ═══ 7. INSCRIÇÕES APROVADAS SEM QR (não vinculadas a pagamentos 72h, mas dentro da janela) ═══
    const paymentIdsNaJanela = new Set(pagamentos.map(p => p.id));
    const inscricoesAprovadasSemQR = inscricoes
      .filter(i =>
        i.status_pagamento === 'aprovado' &&
        (!i.qrcode_url || !i.data_envio_boas_vindas) &&
        i.asaas_payment_id &&
        !paymentIdsNaJanela.has(i.asaas_payment_id) &&
        i.pagamento_confirmado_em && new Date(i.pagamento_confirmado_em) >= corte72hDate
      )
      .map(i => ({
        payment_id: i.asaas_payment_id || null,
        inscricao_id: i.id,
        inscricao_nome: i.nome,
        inscricao_status: i.status_pagamento,
        webhook_recebido: !!(webhookPorPaymentId[i.asaas_payment_id] || []).length,
        qr_gerado: !!i.qrcode_url,
        whatsapp_enviado: !!i.data_envio_boas_vindas,
        email_enviado: i.email_envio_status === 'enviado',
        etapa_quebra: !i.qrcode_url ? 'qr_nao_gerado' : 'whatsapp_nao_enviado',
      }));

    const totalCamisasComErro = comprasCamisa.filter(c => c.resultado !== 'correto').length;
    const totalPendentesCorrecao =
      categorias.sem_inscricao.length +
      categorias.inscricao_pendente.length +
      categorias.sem_qr.length +
      categorias.webhook_erro.length +
      categorias.divergencia_critica.length +
      inscricoesAprovadasSemQR.length +
      totalCamisasComErro;

    return Response.json({
      janela_horas: JANELA_HORAS,
      corte: corte72h,
      timestamp_busca: new Date().toISOString(),
      // Resumo final
      total_pagamentos_asaas: pagamentos.length,
      total_pagamentos_inscricao: pagamentos.length - comprasCamisa.length,
      total_compras_camisa: comprasCamisa.length,
      total_camisas_corretas: comprasCamisa.filter(c => c.resultado === 'correto').length,
      total_camisas_com_erro: totalCamisasComErro,
      total_webhooks_recebidos: totalWebhooksRecebidos,
      total_reconciliados_safety_net: totalReconciliadosSafetyNet,
      total_pendentes_correcao: totalPendentesCorrecao,
      // Por categoria
      total_correto: categorias.correta.length,
      total_sem_inscricao: categorias.sem_inscricao.length,
      total_inscricao_pendente: categorias.inscricao_pendente.length,
      total_sem_qr: categorias.sem_qr.length,
      total_webhook_erro: categorias.webhook_erro.length,
      total_divergencia_critica: categorias.divergencia_critica.length,
      total_inscricoes_aprovadas_sem_qr_extras: inscricoesAprovadasSemQR.length,
      // Detalhes
      pagamentos_corretos: categorias.correta,
      pagamentos_sem_inscricao: categorias.sem_inscricao,
      pagamentos_inscricao_pendente: categorias.inscricao_pendente,
      pagamentos_sem_qr: categorias.sem_qr,
      pagamentos_webhook_erro: categorias.webhook_erro,
      pagamentos_divergencia_critica: categorias.divergencia_critica,
      inscricoes_aprovadas_sem_qr_extras: inscricoesAprovadasSemQR,
      compras_camisa: comprasCamisa,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
