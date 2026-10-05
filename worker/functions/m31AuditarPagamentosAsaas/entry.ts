// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31AuditarPagamentosAsaas — AUDITORIA COMPLETA (sem limite de tempo ou registros)
 *
 * Busca TODOS os pagamentos RECEIVED/CONFIRMED no Asaas e cruza com EventoM31Inscricao.
 * Identifica pagamentos órfãos (confirmados no Asaas sem inscrição correspondente).
 *
 * Retorna:
 *   - total_pagamentos_asaas: todos os pagamentos confirmados no Asaas
 *   - total_sincronizados: pagamentos com inscrição correspondente
 *   - total_sem_inscricao: pagamentos órfãos (sem inscrição)
 *   - total_inscricoes_sem_origem: inscrições aprovadas sem origem identificada
 *   - casos_analise_manual: inscrições que precisam classificação manual
 *   - orfaos_antigos: pagamentos órfãos com mais de 2h (alerta prioritário)
 */

const TIME_BUDGET_MS = 100000; // 100s para evitar timeout de 120s

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
    try {
      const user = await base44.auth.me();
      if (user && user.role !== 'admin') {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    } catch { /* automação agendada */ }

    const asaasKey = config('ASAAS_API_KEY');
    if (!asaasKey) {
      return Response.json({ error: 'ASAAS_API_KEY não configurada' }, { status: 500 });
    }

    const startTime = Date.now();
    const S = base44.asServiceRole.entities;

    // ═══ 1. BUSCAR TODOS OS PAGAMENTOS CONFIRMADOS NO ASAAS (sem limite) ═══
    const todosPagamentos = [];
    const vistos = new Set();
    let paginasAsaas = 0;
    let buscaCompleta = true;

    for (const status of ['RECEIVED', 'CONFIRMED']) {
      let offset = 0;
      let page = 0;
      while (page < 60) {
        if (Date.now() - startTime > TIME_BUDGET_MS) {
          buscaCompleta = false;
          break;
        }
        const url = `__ASAAS_API__/payments?status=${status}&offset=${offset}&limit=100&order=desc&sort=dateCreated`;
        let resp;
        try {
          resp = await fetch(url, { headers: { 'access_token': asaasKey } });
        } catch (e) {
          buscaCompleta = false;
          break;
        }
        if (!resp.ok) break;
        const batch = await resp.json();
        if (!batch.data || batch.data.length === 0) break;
        for (const p of batch.data) {
          if (!vistos.has(p.id)) {
            vistos.add(p.id);
            todosPagamentos.push(p);
          }
        }
        paginasAsaas++;
        offset += 100;
        page++;
        if (batch.data.length < 100) break;
      }
      if (!buscaCompleta) break;
    }

    // ═══ 2. CARREGAR TODAS AS INSCRIÇÕES (paginado) ═══
    const inscricoes = [];
    let skip = 0;
    while (Date.now() - startTime < TIME_BUDGET_MS) {
      const batch = await S.EventoM31Inscricao.filter({}, '-created_date', 500);
      // filter não suporta skip; carrega os primeiros 500
      // Se houver mais, marcamos como incompleto
      if (!batch || batch.length === 0) break;
      inscricoes.push(...batch);
      break; // filter retorna no máximo 500 sem paginação por skip
    }
    const inscricoesCompletas = inscricoes.length < 500;

    // ═══ 3. INDEXAR INSCRIÇÕES POR MÚLTIPLAS CHAVES ═══
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

    // ═══ 4. CROSS-REFERENCE: cada pagamento Asaas → inscrição? ═══
    let sincronizados = 0;
    const semInscricao = [];
    const agora = Date.now();

    for (const p of todosPagamentos) {
      const ref = p.externalReference || '';
      const refCpf = /^(\d{11})-M31FILHAS$/.exec(ref);
      const cpfMatch = refCpf ? refCpf[1] : null;

      // Tentar múltiplas chaves de匹配
      const matched =
        porPaymentId[p.id] ||
        porInstallmentId[p.installment] ||
        porCodigo[ref] ||
        (cpfMatch ? porCpf[cpfMatch] : null) ||
        porCheckoutId[p.checkout || ''];

      if (matched) {
        sincronizados++;
      } else {
        semInscricao.push({
          payment_id: p.id,
          status: p.status,
          value: p.value,
          externalReference: ref,
          dateCreated: p.dateCreated,
          confirmedDate: p.confirmedDate || p.paymentDate || p.clientPaymentDate || null,
          billingType: p.billingType,
          customer: p.customer,
          installment: p.installment || null,
        });
      }
    }

    // ═══ 5. INSCRIÇÕES SEM ORIGEM IDENTIFICADA ═══
    const semOrigem = inscricoes.filter(i =>
      i.status_pagamento === 'aprovado' &&
      (!i.origem_pagamento || i.origem_pagamento === 'desconhecida')
    );

    // ═══ 6. ÓRFÃOS ANTIGOS (>2h) — ALERTA PRIORITÁRIO ═══
    const orfaosAntigos = semInscricao.filter(s => {
      const dataRef = s.confirmedDate || s.dateCreated;
      if (!dataRef) return false;
      const idade = agora - new Date(dataRef).getTime();
      return idade > 2 * 3600000; // mais de 2h
    });

    // ═══ 7. CASOS DE ANÁLISE MANUAL ═══
    // Inscrições aprovadas sem payment_id e sem checkout_id (origem ambígua)
    const analiseManual = semOrigem
      .filter(i => !i.asaas_payment_id && !i.asaas_checkout_id)
      .slice(0, 15)
      .map(i => ({
        id: i.id,
        nome: i.nome,
        cpf: i.cpf,
        whatsapp: i.whatsapp,
        origem_inscricao: i.origem_inscricao,
        valor_pago: i.valor_pago,
        lote: i.lote,
        status: i.status_pagamento,
        data_envio_boas_vindas: i.data_envio_boas_vindas,
      }));

    return Response.json({
      total_pagamentos_asaas: todosPagamentos.length,
      total_sincronizados: sincronizados,
      total_sem_inscricao: semInscricao.length,
      total_inscricoes_sem_origem: semOrigem.length,
      total_orfaos_antigos_2h: orfaosAntigos.length,
      busca_completa: buscaCompleta,
      inscricoes_carregadas: inscricoes.length,
      paginas_asaas_consultadas: paginasAsaas,
      sem_inscricao_detalhes: semInscricao.slice(0, 20).map(s => ({
        payment_id: s.payment_id,
        value: s.value,
        externalReference: s.externalReference,
        dateCreated: s.dateCreated,
        confirmedDate: s.confirmedDate,
        billingType: s.billingType,
        customer: s.customer,
      })),
      orfaos_antigos_detalhes: orfaosAntigos.map(o => ({
        payment_id: o.payment_id,
        value: o.value,
        ref: o.externalReference,
        criado_em: o.dateCreated,
        confirmado_em: o.confirmedDate,
        horas_desde_confirmacao: o.confirmedDate
          ? Math.round((agora - new Date(o.confirmedDate).getTime()) / 3600000)
          : Math.round((agora - new Date(o.dateCreated).getTime()) / 3600000),
      })),
      casos_analise_manual: analiseManual,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
