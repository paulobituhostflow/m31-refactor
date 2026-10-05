// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31ConsultarInscrita — Consulta os dados e status de uma inscrição
 * 
 * Uso: base44.functions.invoke('m31ConsultarInscrita', { phone: '5581998282933' })
 */

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Apenas admin pode consultar' }, { status: 403 });
    }

    const { phone } = await req.json();
    if (!phone) {
      return Response.json({ error: 'Phone é obrigatório' }, { status: 400 });
    }

    // Normaliza o telefone (remove caracteres especiais)
    const telefone = (phone || '').replace(/\D/g, '');
    
    // Busca a inscrição
    const inscricoes = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
      { whatsapp: telefone },
      '-created_date', 10
    );

    if (inscricoes.length === 0) {
      return Response.json({
        encontrada: false,
        telefone,
        mensagem: 'Nenhuma inscrição encontrada com este telefone',
      });
    }

    // Retorna a mais recente
    const insc = inscricoes[0];

    return Response.json({
      encontrada: true,
      id: insc.id,
      nome: insc.nome,
      email: insc.email,
      whatsapp: insc.whatsapp,
      cpf: insc.cpf,
      status_pagamento: insc.status_pagamento,
      tipo: insc.tipo,
      lote: insc.lote,
      valor_pago: insc.valor_pago,
      checkin_realizado: insc.checkin_realizado,
      checkin_at: insc.checkin_at,
      asaas_charge_url: insc.asaas_charge_url,
      data_envio_boas_vindas: insc.data_envio_boas_vindas,
      entrou_no_grupo: insc.entrou_no_grupo,
      recovery_attempts: insc.recovery_attempts,
      last_recovery_at: insc.last_recovery_at,
      current_stage: insc.current_stage,
      observacoes: insc.observacoes,
      created_date: insc.created_date,
      updated_date: insc.updated_date,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
