// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31CorrigirValoresAsaas — corrige valor_pago do bucket Asaas usando o valor
 * REAL da cobrança no Asaas (consultando a API). NÃO força valor do lote.
 *
 * - Cartão parcelado: total = installmentCount × installmentValue
 * - PIX/Boleto/à vista: total = payment.value
 * - Só corrige se o valor real for diferente do gravado.
 * - Não toca em MP, PIX manual, importação, teste, ou gift beneficiária.
 */

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const ASAAS_KEY = config('ASAAS_API_KEY');
    const ASAAS_BASE = '__ASAAS_API__';

    // Carregar inscrições aprovadas + lotes
    const [inscs, lotes] = await Promise.all([
      base44.asServiceRole.entities.EventoM31Inscricao.list('-created_date', 1000),
      base44.asServiceRole.entities.EventoM31Lote.list(),
    ]);
    const valorLote = {};
    for (const l of lotes) valorLote[l.codigo] = l.valor;

    const isTeste = (nome) => /teste|prova de vida|governanca/i.test(nome || '');

    // Bucket Asaas: aprovado, tem asaas_payment_id, valor_pago < lote, não é gift benef, não é teste
    const alvos = inscs.filter(i => {
      if (i.status_pagamento !== 'aprovado') return false;
      if (!i.asaas_payment_id || !i.asaas_payment_id.trim()) return false;
      if (i.presenteado_por_id) return false; // gift beneficiária — REGRA 2
      if (isTeste(i.nome)) return false;
      const vl = valorLote[i.lote];
      if (!vl) return false;
      const atual = i.valor_pago || 0;
      if (atual <= 0) return false;
      // gift compradora: alvo = lote × 2; normal: alvo = lote
      const alvo = i.presenteado_id ? vl * 2 : vl;
      return atual < alvo - 0.01;
    });

    const log = [];
    let somaAntes = 0;
    let somaDepois = 0;
    let somaRealAsaas = 0;
    let corrigidos = 0;
    let jaOk = 0;
    let erros = 0;

    for (const insc of alvos) {
      const antes = insc.valor_pago || 0;
      somaAntes += antes;

      let realTotal = null;
      let installmentCount = null;
      let installmentValue = null;
      let billingType = null;

      try {
        const resp = await fetch(`${ASAAS_BASE}/payments/${insc.asaas_payment_id}`, {
          headers: { 'access_token': ASAAS_KEY },
        });
        if (!resp.ok) {
          log.push({ id: insc.id, nome: insc.nome, antes, depois: null, status: 'erro_api', detalhe: `HTTP ${resp.status}` });
          erros++;
          continue;
        }
        const pay = await resp.json();
        billingType = (pay.billingType || '').toUpperCase();
        installmentCount = pay.installmentCount || null;
        installmentValue = pay.installmentValue || null;
        const payValue = pay.value;

        // Cartão parcelado: total = count × value da parcela
        if (billingType === 'CREDIT_CARD' && installmentCount && installmentCount > 1 && installmentValue) {
          realTotal = Math.round(installmentCount * installmentValue * 100) / 100;
        } else {
          // PIX, boleto, cartão à vista: value = total
          realTotal = payValue;
        }
      } catch (e) {
        log.push({ id: insc.id, nome: insc.nome, antes, depois: null, status: 'erro_fetch', detalhe: e.message });
        erros++;
        continue;
      }

      if (!realTotal || realTotal <= 0) {
        log.push({ id: insc.id, nome: insc.nome, antes, depois: null, status: 'valor_indeterminado', detalhe: `realTotal=${realTotal}` });
        erros++;
        continue;
      }

      somaRealAsaas += realTotal;

      if (Math.abs(antes - realTotal) < 0.01) {
        // Já está correto — só preenche campos de auditoria se faltavam
        log.push({ id: insc.id, nome: insc.nome, antes, depois: antes, status: 'ja_ok', fonte: 'asaas', billing: billingType });
        jaOk++;
        somaDepois += antes;
        continue;
      }

      // Corrigir
      await base44.asServiceRole.entities.EventoM31Inscricao.update(insc.id, {
        valor_pago: realTotal,
        asaas_total_value: realTotal,
        asaas_installment_count: installmentCount,
        asaas_installment_value: installmentValue,
        asaas_billing_type: billingType || insc.asaas_billing_type,
      });

      somaDepois += realTotal;
      corrigidos++;
      log.push({
        id: insc.id, nome: insc.nome, antes, depois: realTotal,
        status: 'corrigido', fonte: 'asaas', billing: billingType,
        parcelas: installmentCount, parcela: installmentValue, payment_id: insc.asaas_payment_id,
      });
    }

    return Response.json({
      bucket_asaas_total: alvos.length,
      corrigidos,
      ja_ok: jaOk,
      erros,
      reconciliacao: {
        soma_antes: Math.round(somaAntes * 100) / 100,
        soma_depois: Math.round(somaDepois * 100) / 100,
        soma_real_asaas: Math.round(somaRealAsaas * 100) / 100,
      },
      log,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
