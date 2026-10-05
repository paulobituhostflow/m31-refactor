// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31ConsultarCustomerAsaas — Read-only: busca dados de um customer no Asaas.
 * Usado na correção do incidente pay_by539pgbhhru8hdr para identificar o dono real
 * do pagamento (R$60) e preservar SÓ a inscrição legítima.
 *
 * Payload: { customer_id: string }
 */

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    try {
      const user = await base44.auth.me();
      if (!user || user.role !== 'admin') {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    } catch { return Response.json({ error: 'Unauthorized' }, { status: 401 }); }

    let body: any = null;
    try { body = await req.json(); } catch {}
    const customerId = body?.customer_id || 'cus_000190433352';
    if (!customerId) return Response.json({ error: 'customer_id obrigatorio' }, { status: 400 });

    const key = config('ASAAS_API_KEY');
    if (!key) return Response.json({ error: 'ASAAS_API_KEY ausente' }, { status: 500 });

    const r = await fetch(`__ASAAS_API__/customers/${customerId}`, {
      headers: { access_token: key }
    });
    const c = await r.json();
    if (!c || c.errors) return Response.json({ error: 'customer_nao_encontrado', detalhe: c }, { status: 404 });

    // Cross-match contra as 118 inscrições com o payment_id compartilhado
    const normCpf = (v: string) => (v || '').replace(/\D/g, '');
    const normTel = (v: string) => {
      let d = normCpf(v);
      while (d.startsWith('5555')) d = d.slice(2);
      return d;
    };
    const inscricoes = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
      { asaas_payment_id: 'pay_by539pgbhhru8hdr' }, '-created_date', 200
    );
    const customerCpf = normCpf(c.cpfCnpj);
    const customerTel = normTel(c.mobilePhone || c.phone || '');

    const matchCpf = inscricoes.find(i => normCpf(i.cpf) === customerCpf && customerCpf.length >= 11);
    const matchTel = !matchCpf && customerTel
      ? inscricoes.find(i => {
          const t = normTel(i.whatsapp);
          return t === customerTel || t.endsWith(customerTel) || customerTel.endsWith(t);
        })
      : null;
    const legit = matchCpf || matchTel || null;

    return Response.json({
      customer: { id: c.id, name: c.name, cpfCnpj: c.cpfCnpj, email: c.email, mobilePhone: c.mobilePhone, phone: c.phone },
      total_inscricoes_com_pid: inscricoes.length,
      dono_legitimo: legit ? {
        id: legit.id, nome: legit.nome, cpf: legit.cpf, whatsapp: legit.whatsapp,
        tipo: legit.tipo, lote: legit.lote, valor_pago: legit.valor_pago,
        asaas_checkout_id: legit.asaas_checkout_id, codigo_inscricao: legit.codigo_inscricao
      } : null,
      metodo_match: matchCpf ? 'cpf' : (matchTel ? 'telefone' : 'nenhum')
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
