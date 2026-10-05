// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Fluxo A: checkout_pendente + SEM asaas_charge_url + COM whatsapp
    const fluxoA = await base44.asServiceRole.entities.EventoM31Inscricao.filter({
      status_pagamento: 'checkout_pendente',
      asaas_charge_url: { $exists: false },
      whatsapp: { $exists: true, $ne: '' }
    });

    // Fluxo B Pendente: checkout_pendente + COM asaas_charge_url + COM whatsapp
    const fluxoBPendente = await base44.asServiceRole.entities.EventoM31Inscricao.filter({
      status_pagamento: 'checkout_pendente',
      asaas_charge_url: { $exists: true, $ne: '' },
      whatsapp: { $exists: true, $ne: '' }
    });

    // Fluxo B Abandonado: checkout_abandonado + COM asaas_charge_url + COM whatsapp
    const fluxoBAbandonado = await base44.asServiceRole.entities.EventoM31Inscricao.filter({
      status_pagamento: 'checkout_abandonado',
      asaas_charge_url: { $exists: true, $ne: '' },
      whatsapp: { $exists: true, $ne: '' }
    });

    // Zombies: checkout_pendente + SEM asaas_payment_id + SEM asaas_charge_url
    const zombies = await base44.asServiceRole.entities.EventoM31Inscricao.filter({
      status_pagamento: 'checkout_pendente',
      asaas_payment_id: { $exists: false },
      asaas_charge_url: { $exists: false }
    });

    return Response.json({
      fluxo_a: fluxoA.length,
      fluxo_b_pendente: fluxoBPendente.length,
      fluxo_b_abandonado: fluxoBAbandonado.length,
      zombies: zombies.length,
      total_recovery: fluxoA.length + fluxoBPendente.length + fluxoBAbandonado.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
