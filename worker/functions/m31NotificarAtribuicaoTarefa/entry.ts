// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31NotificarAtribuicaoTarefa — notificação de atribuição de tarefa.
 * E-mail via Brevo (mantido) + WhatsApp ENFILEIRADO via m31EnviarMensagemGovernada.
 * Nenhum envio WhatsApp direto — o envio real só acontece via m31DrenarFila.
 */

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { tarefa_id, responsavel_email, responsavel_nome, titulo_tarefa, prazo } = await req.json();

    if (!tarefa_id || !responsavel_email || !titulo_tarefa) {
      return Response.json({ error: 'Faltam dados obrigatórios' }, { status: 400 });
    }

    // ── E-mail via Brevo (comportamento original mantido) ──
    const subject = `Nova tarefa atribuída: ${titulo_tarefa}`;
    const body = `
Olá ${responsavel_nome || responsavel_email},

Uma nova tarefa foi atribuída a você:

**${titulo_tarefa}**
Prazo: ${prazo || 'Sem prazo definido'}

Acesse o painel de tarefas para mais detalhes.

Atenciosamente,
M31 Filhas
    `.trim();

    const brevoRes = await fetch('__BREVO_API__/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': config('BREVO_API_KEY'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'M31 Filhas', email: 'noreply@m31filhas.com.br' },
        to: [{ email: responsavel_email, name: responsavel_nome }],
        subject,
        htmlContent: `<p>${body.replace(/\n/g, '<br>')}</p>`,
      }),
    });

    const emailOk = brevoRes.ok;
    if (!emailOk) {
      logger.error('Erro ao enviar e-mail Brevo:', await brevoRes.text());
    }

    // ── WhatsApp: ENFILEIRA na fila global governada (nunca envia direto) ──
    let whatsapp_enfileirado = false;
    let whatsapp_motivo = 'sem_whatsapp_cadastrado';
    const membrosRes = await base44.entities.EventoM31Membro.filter({ user_email: responsavel_email });
    const whatsapp = membrosRes[0]?.whatsapp;

    if (whatsapp) {
      const msgWpp = `📋 *Nova tarefa atribuída a você*\n\n*${titulo_tarefa}*\nPrazo: ${prazo || 'Sem prazo definido'}\n\nAcesse o painel de tarefas para mais detalhes.`;
      const res = await base44.functions.invoke('m31EnviarMensagemGovernada', {
        telefone: whatsapp,
        email: responsavel_email,
        automacao: 'OPERACIONAL',
        template: 'tarefa_atribuicao',
        versao: `TAREFA_ATRIB_${tarefa_id}`,
        origem: 'm31NotificarAtribuicaoTarefa',
        mensagens: [{ message: msgWpp }],
      });
      whatsapp_enfileirado = res?.enfileirado === true;
      whatsapp_motivo = whatsapp_enfileirado ? 'enfileirado' : (res?.motivo || res?.error || 'bloqueado');
    }

    return Response.json({
      success: emailOk,
      message: emailOk ? 'E-mail de atribuição enviado' : 'Falha no e-mail',
      whatsapp_enfileirado,
      whatsapp_motivo,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
