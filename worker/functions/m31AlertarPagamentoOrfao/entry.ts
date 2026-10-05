// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31AlertarPagamentoOrfao — Alerta automático de pagamentos confirmados sem inscrição
 *
 * Automacao: a cada 30 minutos.
 *
 * Fluxo:
 *   1. Busca pagamentos RECEIVED/CONFIRMED no Asaas (últimas 24h)
 *   2. Cruza com EventoM31Inscricao (por payment_id, externalReference, CPF, checkout_id)
 *   3. Para cada órfão com MAIS DE 2H desde confirmação, invoca m31AlertarGestor
 *   4. Dedup: não alerta o mesmo payment_id mais de uma vez (chave_unica = payment_id)
 *
 * Objetivo: detectar quebra de sincronia Asaas→sistema ANTES da participante
 * precisar procurar suporte.
 */

const JANELA_HORAS = 24;
const LIMITE_ORFAO_HORAS = 2;
const TIME_BUDGET_MS = 100000;

function normalizePhone(phone) {
  let d = (phone || '').replace(/\D/g, '');
  while (d.startsWith('5555')) d = d.slice(2);
  if (d.startsWith('55') && d.length >= 12) return d;
  if (d.length >= 10) return `55${d}`;
  return d;
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Automacao agendada — sem auth obrigatória, mas admin pode chamar manualmente
    try {
      const user = await base44.auth.me();
      if (user && user.role !== 'admin') {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    } catch { /* automação */ }

    const asaasKey = config('ASAAS_API_KEY');
    if (!asaasKey) {
      return Response.json({ error: 'ASAAS_API_KEY não configurada' }, { status: 500 });
    }

    const startTime = Date.now();
    const S = base44.asServiceRole.entities;
    const agora = Date.now();
    const corte24h = new Date(agora - JANELA_HORAS * 3600000).toISOString();
    const corte2h = new Date(agora - LIMITE_ORFAO_HORAS * 3600000).toISOString();

    // ═══ 1. BUSCAR PAGAMENTOS CONFIRMADOS NAS ÚLTIMAS 24H ═══
    const pagamentosRecentes = [];
    const vistos = new Set();
    for (const status of ['RECEIVED', 'CONFIRMED']) {
      let offset = 0;
      let page = 0;
      while (page < 20 && Date.now() - startTime < TIME_BUDGET_MS) {
        const url = `__ASAAS_API__/payments?status=${status}&offset=${offset}&limit=100&order=desc&sort=dateCreated`;
        let resp;
        try {
          resp = await fetch(url, { headers: { 'access_token': asaasKey } });
        } catch { break; }
        if (!resp.ok) break;
        const batch = await resp.json();
        if (!batch.data || batch.data.length === 0) break;
        // Filtrar: só pagamentos dentro das últimas 24h
        let achouAntigo = false;
        for (const p of batch.data) {
          const dataConfirmacao = p.confirmedDate || p.paymentDate || p.clientPaymentDate || p.dateCreated;
          if (dataConfirmacao && new Date(dataConfirmacao) < new Date(corte24h)) {
            achouAntigo = true;
            continue;
          }
          if (!vistos.has(p.id)) {
            vistos.add(p.id);
            pagamentosRecentes.push(p);
          }
        }
        if (achouAntigo) break; // passou da janela de 24h
        offset += 100;
        page++;
        if (batch.data.length < 100) break;
      }
    }

    // ═══ 2. CARREGAR INSCRIÇÕES (últimas 500 — suficientes para janela de 24h) ═══
    const inscricoes = await S.EventoM31Inscricao.filter({}, '-created_date', 500);

    // Indexar
    const porPaymentId = {};
    const porInstallmentId = {};
    const porCodigo = {};
    const porCpf = {};
    const porCheckoutId = {};
    for (const i of inscricoes) {
      if (i.asaas_payment_id) porPaymentId[i.asaas_payment_id] = i;
      if (i.asaas_installment_id) porInstallmentId[i.asaas_installment_id] = i;
      if (i.codigo_inscricao) porCodigo[i.codigo_inscricao] = i;
      if (i.cpf) porCpf[i.cpf.replace(/\D/g, '')] = i;
      if (i.asaas_checkout_id) porCheckoutId[i.asaas_checkout_id] = i;
    }

    // ═══ 3. IDENTIFICAR ÓRFÃOS >2H ═══
    const orfaosAntigos = [];
    for (const p of pagamentosRecentes) {
      const ref = p.externalReference || '';
      const refCpf = /^(\d{11})-M31FILHAS$/.exec(ref);
      const cpfMatch = refCpf ? refCpf[1] : null;
      const matched =
        porPaymentId[p.id] ||
        porInstallmentId[p.installment] ||
        porCodigo[ref] ||
        (cpfMatch ? porCpf[cpfMatch] : null) ||
        porCheckoutId[p.checkout || ''];
      if (!matched) {
        const dataConfirmacao = p.confirmedDate || p.paymentDate || p.clientPaymentDate || p.dateCreated;
        if (dataConfirmacao && new Date(dataConfirmacao) < new Date(corte2h)) {
          orfaosAntigos.push({
            payment_id: p.id,
            value: p.value,
            externalReference: ref,
            dateCreated: p.dateCreated,
            confirmedDate: dataConfirmacao,
            billingType: p.billingType,
            customer: p.customer,
          });
        }
      }
    }

    // ═══ 4. VERIFICAR DEDUP: não alertar payment_ids já registrados em M31AuditLog ═══
    const novosOrfaos = [];
    for (const o of orfaosAntigos) {
      const chave = `pagamento_orfao_${o.payment_id}`;
      const existente = await S.M31AuditLog.filter({ chave_unica: chave }, '-created_date', 1);
      if (!existente || existente.length === 0) {
        novosOrfaos.push(o);
      }
    }

    // ═══ 5. ALERTAR CADA ÓRFÃO NOVO ═══
    const alertasGerados = [];
    for (const o of novosOrfaos) {
      const horas = Math.round((agora - new Date(o.confirmedDate).getTime()) / 3600000);
      try {
        const res = await base44.asServiceRole.functions.invoke('m31AlertarGestor', {
          tipo_erro: 'pagamento_orfao_sem_inscricao',
          gravidade: 'alto',
          origem: 'asaas',
          descricao:
            `Pagamento ${o.payment_id} confirmado no Asaas há ${horas}h mas NÃO consta inscrição vinculada no sistema. ` +
            `Valor: R$ ${o.value}. Ref: ${o.externalReference || 'nenhuma'}. ` +
            `Cliente Asaas: ${o.customer || 'desconhecido'}.`,
          possivel_causa:
            'Webhook do Asaas não disparou ou falhou na sincronização. O pagamento foi confirmado no provedor mas não criou/vinculou a inscrição.',
          acao_recomendada:
            '1. Verificar se o webhook PAYMENT_CONFIRMED foi recebido (M31AsaasWebhookEvento). ' +
            '2. Se não recebido, reprocessar manualmente. ' +
            '3. Verificar se o externalReference corresponde a um código de inscrição válido. ' +
            '4. Se necessário, criar a inscrição manualmente e vincular o payment_id.',
          pessoa_id: o.payment_id,
          dados_extras: {
            payment_id: o.payment_id,
            value: o.value,
            externalReference: o.externalReference,
            confirmedDate: o.confirmedDate,
            billingType: o.billingType,
            customer: o.customer,
          },
          chave_unica: `pagamento_orfao_${o.payment_id}`,
        });
        alertasGerados.push({
          payment_id: o.payment_id,
          alerta_gerado: true,
          log_id: res?.data?.log_id || null,
        });
      } catch (e) {
        alertasGerados.push({
          payment_id: o.payment_id,
          alerta_gerado: false,
          erro: e.message,
        });
      }
    }

    return Response.json({
      total_pagamentos_recentes_24h: pagamentosRecentes.length,
      total_orfaos_antigos_2h: orfaosAntigos.length,
      total_novos_orfaos: novosOrfaos.length,
      alertas_gerados: alertasGerados.length,
      detalhes: alertasGerados,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
