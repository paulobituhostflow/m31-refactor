// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

// Envia WhatsApp para leads lote_1 pendentes com link do formulário
// Urgência: garantir valor do 1º lote até amanhã

const LINK_FORMULARIO = '__APP_ORIGIN__/m31-inscricao';
const LOTE_CODIGO = 'lote_1';

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const dry_run = body.dry_run === true;
    const limite = body.limite || 20; // máx 20 por chamada para evitar bloqueio

    // Buscar todos os leads elegíveis: publico_geral, lote_1, pendente, sem cobrança gerada, sem opt_out
    const todos = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
      { status_pagamento: 'pendente', lote: LOTE_CODIGO, tipo: 'publico_geral' },
      '-created_date', 500
    );

    const elegiveis = todos.filter(l => {
      // Nunca reenviar para quem já recebeu
      if (l.last_recovery_at) return false;
      return l.whatsapp && !l.asaas_payment_id && !l.caravana_id && !l.opt_out;
    });

    if (dry_run) {
      return Response.json({
        dry_run: true,
        total_elegiveis: elegiveis.length,
        exemplos: elegiveis.slice(0, 5).map(l => ({ nome: l.nome, whatsapp: l.whatsapp, email: l.email }))
      });
    }

    const lote = elegiveis.slice(0, limite);
    const resultados = {
      processados: 0,
      whatsapp_enviados: 0,
      erros: [],
      restantes: elegiveis.length - lote.length
    };

    for (const lead of lote) {
      resultados.processados++;
      const nome = lead.nome?.split(' ')[0] || lead.nome;

      try {
        const mensagem =
          `Olá, *${nome}*! 🌸\n\n` +
          `Vimos que você preencheu o formulário do M31 Filhas mas ainda não finalizou o pagamento da sua inscrição.\n\n` +
          `⚠️ *Amanhã* encerra o prazo para garantir o valor promocional do 1º Lote! Finalize agora sua inscrição nesse link:\n` +
          `👉 ${LINK_FORMULARIO}\n\n` +
          `_Caso já tenha pago, envie o comprovante e desconsidere esta mensagem._`;

        const wpRes = await base44.asServiceRole.functions.invoke('m31SendWhatsApp', { phone: lead.whatsapp, message: mensagem });
        const sucesso = wpRes.sucesso === true;

        if (sucesso) {
          resultados.whatsapp_enviados++;
          await base44.asServiceRole.entities.EventoM31Inscricao.update(lead.id, {
            last_contact_at: new Date().toISOString(),
            last_recovery_at: new Date().toISOString(),
            recovery_attempts: (lead.recovery_attempts || 0) + 1,
          });
        } else {
          resultados.erros.push({ nome: lead.nome, whatsapp: lead.whatsapp, erro: 'UAZAPI não confirmou envio', detail: wpRes.uazapi_response || wpRes });
        }

        // Pausa entre mensagens para evitar bloqueio
        await new Promise(r => setTimeout(r, 3000));

      } catch (e) {
        resultados.erros.push({ nome: lead.nome, erro: e.message });
      }
    }

    return Response.json({
      success: true,
      total_elegiveis: elegiveis.length,
      limite_por_chamada: limite,
      ...resultados
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
