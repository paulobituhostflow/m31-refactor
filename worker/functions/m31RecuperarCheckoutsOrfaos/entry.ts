// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31RecuperarCheckoutsOrfaos — Recuperação Global de Checkouts
 *
 * Varre TODAS as inscrições com status checkout_pendente/pendente/checkout_abandonado.
 * Para cada uma, aplica as regras de idempotência:
 *   1. Pagamento já confirmado no Asaas? → sincronizar, NÃO criar checkout
 *   2. Checkout válido e ativo (URL existe, < 24h)? → NÃO criar outro
 *   3. Checkout expirado ou inexistente? → criar novo checkout (PIX + Cartão 5x)
 *
 * Nunca cria dois checkouts para a mesma inscrição.
 * Nunca reenvia para quem já pagou.
 * Nunca gera novo checkout se existir um ativo.
 */

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    try {
      const user = await base44.auth.me();
      if (user && user.role !== 'admin') {
        return Response.json({ error: 'Apenas administradores' }, { status: 403 });
      }
    } catch {
      // Execução via automação — prosseguir
    }

    const body = await req.json().catch(() => ({}));
    const BATCH_LIMIT = body.limit || 40; // processa N por execução

    const ASAAS_KEY = config("ASAAS_API_KEY");
    const ASAAS_BASE = "__ASAAS_API__";

    // ── Helpers ────────────────────────────────────────────────────────
    function isCheckoutExpirado(updatedDate, maxMinutos = 1440) {
      if (!updatedDate) return true;
      const idadeMs = Date.now() - new Date(updatedDate).getTime();
      return idadeMs > maxMinutos * 60 * 1000;
    }

    async function criarCheckout(codigoInscricao, nome, valor) {
      const resp = await fetch(`${ASAAS_BASE}/checkouts`, {
        method: 'POST',
        headers: { 'access_token': ASAAS_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billingTypes: ['PIX', 'CREDIT_CARD'],
          chargeTypes: ['DETACHED', 'INSTALLMENT'],
          installment: { maxInstallmentCount: 5 },
          minutesToExpire: 1440,
          externalReference: codigoInscricao,
          callback: {
            successUrl: '__APP_ORIGIN__/obrigado',
            cancelUrl: '__APP_ORIGIN__/m31-inscricao',
            expiredUrl: '__APP_ORIGIN__/m31-inscricao'
          },
          items: [{
            name: 'M31 Filhas - Inscricao',
            description: `M31 Filhas - ${nome}`,
            value: valor,
            quantity: 1
          }]
        })
      });
      return await resp.json();
    }

    // ── 1. Pré-carregar todos os pagamentos CONFIRMED do Asaas (30 dias) ──
    // Builda um map por externalReference para lookup O(1)
    const pagamentosConfirmados = {};
    let offset = 0;
    let hasMore = true;
    const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    while (hasMore) {
      const resp = await fetch(
        `${ASAAS_BASE}/payments?status=CONFIRMED&dateCreated.ge=${desde}&limit=100&offset=${offset}`,
        { headers: { 'access_token': ASAAS_KEY } }
      );
      const data = await resp.json();
      for (const p of (data.data || [])) {
        if (p.externalReference) {
          pagamentosConfirmados[p.externalReference] = p;
        }
      }
      hasMore = data.hasMore || false;
      offset += 100;
      if (offset > 1000) break;
    }

    // ── 2. Buscar todas as inscrições órfãs ────────────────────────────
    const statusOrfaos = ['checkout_pendente', 'pendente', 'checkout_abandonado'];
    const todasInscricoes = [];

    for (const status of statusOrfaos) {
      const batch = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
        { status_pagamento: status }, '-created_date', 500
      );
      todasInscricoes.push(...batch);
    }

    // Dedup por id (uma inscrição pode aparecer em múltiplos status queries)
    const todasUnicas = [...new Map(todasInscricoes.map(i => [i.id, i])).values()];

    // Filtrar apenas as que precisam de recuperação (sem URL ou expirada)
    const jaPagasCount = todasUnicas.filter(i => pagamentosConfirmados[i.codigo_inscricao]).length;
    const checkoutValidoCount = todasUnicas.filter(i => {
      if (i.tipo === 'voluntario' || i.status_pagamento === 'gratuito') return false;
      if (pagamentosConfirmados[i.codigo_inscricao]) return false;
      return i.asaas_charge_url && !isCheckoutExpirado(i.updated_date);
    }).length;

    const precisamRecuperacao = todasUnicas.filter(i => {
      if (i.tipo === 'voluntario' || i.status_pagamento === 'gratuito') return false;
      if (pagamentosConfirmados[i.codigo_inscricao]) return false;
      if (i.asaas_charge_url && !isCheckoutExpirado(i.updated_date)) return false;
      return true;
    });

    // Processar apenas o lote atual
    const unicas = precisamRecuperacao.slice(0, BATCH_LIMIT);

    // Pré-carregar lotes para lookup de valor
    const lotes = await base44.asServiceRole.entities.EventoM31Lote.list('-ordem', 10);
    const lotesPorCodigo = {};
    for (const l of lotes) {
      lotesPorCodigo[l.codigo] = l;
    }

    const resumo = {
      total_na_base: todasUnicas.length,
      ja_pagas: jaPagasCount,
      checkout_valido: checkoutValidoCount,
      precisam_recuperacao: precisamRecuperacao.length,
      processadas_neste_lote: unicas.length,
      restantes: Math.max(0, precisamRecuperacao.length - BATCH_LIMIT),
      recuperadas: 0,
      erros: 0,
      erros_detalhe: []
    };

    // ── 3. Processar cada inscrição ────────────────────────────────────
    for (const insc of unicas) {
      try {
        // Skip gratuitos/voluntários
        if (insc.tipo === 'voluntario' || insc.status_pagamento === 'gratuito') continue;

        // Regra 1: Pagamento já confirmado no Asaas?
        const pagamento = pagamentosConfirmados[insc.codigo_inscricao];
        if (pagamento) {
          const valorTotal = pagamento.installmentCount
            ? pagamento.installmentCount * (pagamento.installmentValue || 0)
            : pagamento.value;

          await base44.asServiceRole.entities.EventoM31Inscricao.update(insc.id, {
            status_pagamento: 'aprovado',
            asaas_payment_id: pagamento.id,
            asaas_billing_type: pagamento.billingType || null,
            asaas_installment_count: pagamento.installmentCount || null,
            asaas_installment_value: pagamento.installmentValue || null,
            asaas_total_value: valorTotal,
            valor_pago: valorTotal || insc.valor_pago,
            webhook_processando: false,
          });
          resumo.ja_pagas++;
          continue;
        }

        // Regra 2: Checkout válido e ativo (URL existe + não expirado)?
        if (insc.asaas_charge_url && !isCheckoutExpirado(insc.updated_date)) {
          resumo.checkout_valido++;
          continue;
        }

        // Regra 3: Criar novo checkout (expirado ou inexistente)
        let valor = insc.valor_pago;
        if (!valor || valor === 0) {
          const lote = lotesPorCodigo[insc.lote];
          valor = lote?.valor || 129;
        }

        const checkout = await criarCheckout(insc.codigo_inscricao, insc.nome, valor);

        if (!checkout.link) {
          resumo.erros++;
          resumo.erros_detalhe.push({
            inscricao_id: insc.id,
            nome: insc.nome,
            codigo: insc.codigo_inscricao,
            erro: JSON.stringify(checkout).slice(0, 300)
          });
          continue;
        }

        // Atualizar inscrição com novo link
        await base44.asServiceRole.entities.EventoM31Inscricao.update(insc.id, {
          asaas_charge_url: checkout.link,
          status_pagamento: 'checkout_pendente',
          valor_pago: valor,
        });

        // Log de recuperação
        await base44.asServiceRole.entities.M31MessageLog.create({
          inscricao_id: insc.id,
          inscricao_nome: insc.nome,
          telefone: insc.whatsapp || 'N/A',
          tipo: 'manual',
          stage: 'recuperacao_checkout_global',
          mensagem: `Checkout recuperado automaticamente via m31RecuperarCheckoutsOrfaos. Valor: R$ ${valor}. Link: ${checkout.link}`,
          sucesso: true,
          enviado_em: new Date().toISOString()
        });

        resumo.recuperadas++;

        // Rate limit: 250ms entre criações para não estourar Asaas
        await new Promise(r => setTimeout(r, 250));

      } catch (e) {
        resumo.erros++;
        resumo.erros_detalhe.push({
          inscricao_id: insc.id,
          nome: insc.nome,
          erro: e.message
        });
      }
    }

    return Response.json(resumo);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
