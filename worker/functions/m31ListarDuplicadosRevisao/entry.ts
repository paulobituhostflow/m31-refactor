// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31ListarDuplicadosRevisao — READ-ONLY
 *
 * Monta a lista de possíveis inscrições duplicadas para REVISÃO MANUAL.
 * Não altera nada. Para cada registro, tenta localizar o cliente no Asaas
 * (por CPF quando houver; senão devolve link de busca por telefone/nome)
 * para que o gestor confira manualmente se há pagamento real associado.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  REGRA PERMANENTE Nº 0 (constituição M31) — TRAVA DE DINHEIRO REAL:
 *  Esta função NUNCA escreve. Só apresenta. A decisão sobre cancelar
 *  qualquer registro é manual, individual, do gestor.
 * ═══════════════════════════════════════════════════════════════════
 */

const ASAAS_BASE = '__ASAAS_API__';

async function asaasPorCpf(cpf, ASAAS_KEY) {
  if (!cpf || cpf.length < 11) return null;
  try {
    const c = await fetch(`${ASAAS_BASE}/customers?cpfCnpj=${cpf}`, { headers: { access_token: ASAAS_KEY } }).then(r => r.json());
    if (!c?.data?.length) return { customerId: null, pagamentos: [] };
    const customerId = c.data[0].id;
    const p = await fetch(`${ASAAS_BASE}/payments?customer=${customerId}&limit=20`, { headers: { access_token: ASAAS_KEY } }).then(r => r.json());
    return {
      customerId,
      pagamentos: (p?.data || []).map(x => ({ id: x.id, status: x.status, value: x.value, billingType: x.billingType })),
    };
  } catch (_) {
    return null;
  }
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Apenas administradores' }, { status: 403 });
    }
    const ASAAS_KEY = config('ASAAS_API_KEY');

    // Grupos de possíveis duplicados sob revisão (nomes de interesse do incidente).
    const termos = ['andresa', 'raissa', 'wiliane'];
    const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const todas = await base44.asServiceRole.entities.EventoM31Inscricao.list('-created_date', 3000);

    const grupos = [];
    for (const termo of termos) {
      const registros = todas.filter(i => norm(i.nome).includes(norm(termo)) && i.status_pagamento !== 'cancelado');
      if (!registros.length) continue;

      const linhas = [];
      for (const i of registros) {
        const cpfLimpo = (i.cpf || '').replace(/\D/g, '');
        const temCpf = cpfLimpo.length === 11;
        const asaas = temCpf ? await asaasPorCpf(cpfLimpo, ASAAS_KEY) : null;

        // Sinal de dinheiro real (Regra Nº 0)
        const envolveDinheiro =
          i.status_pagamento === 'aprovado' ||
          !!i.asaas_payment_id ||
          (asaas?.pagamentos || []).some(p => ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'DUNNING_RECEIVED'].includes(p.status));

        // Link para conferência manual no Asaas
        const asaasLink = temCpf && asaas?.customerId
          ? `https://www.asaas.com/customerAccount/showCustomer/${asaas.customerId}`
          : `https://www.asaas.com/customerAccount/index?q=${encodeURIComponent(i.whatsapp || i.nome || '')}`;

        linhas.push({
          id: i.id,
          nome: i.nome || '(sem nome)',
          whatsapp: i.whatsapp || null,
          cpf: i.cpf || null,
          sem_cpf: !temCpf,
          valor_pago: i.valor_pago || 0,
          status_local: i.status_pagamento,
          asaas_payment_id: i.asaas_payment_id || null,
          criado_em: i.created_date,
          entrou_no_grupo: !!i.entrou_no_grupo,
          checkin_realizado: !!i.checkin_realizado,
          envolve_dinheiro_real: envolveDinheiro,
          // Só é organização de cadastro (cancelável) se não envolver dinheiro
          seguro_cancelar_cadastro: !envolveDinheiro && i.status_pagamento === 'checkout_pendente' && !i.asaas_payment_id,
          asaas_pagamentos: asaas?.pagamentos || [],
          asaas_link: asaasLink,
          asaas_busca_por: temCpf && asaas?.customerId ? 'cpf' : 'telefone/nome',
        });
      }

      linhas.sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em));
      grupos.push({ termo, total: linhas.length, registros: linhas });
    }

    return Response.json({ grupos, gerado_em: new Date().toISOString() });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
