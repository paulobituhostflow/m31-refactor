// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31NotificarComentarioTarefa — notificação de novo comentário em tarefa.
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

    const { tarefa_id, titulo_tarefa, autor_nome, conteudo, emails_para_notificar, comentario_id } = await req.json();

    if (!tarefa_id || !titulo_tarefa || !conteudo || !Array.isArray(emails_para_notificar) || emails_para_notificar.length === 0) {
      return Response.json({ error: 'Faltam dados obrigatórios' }, { status: 400 });
    }

    const subject = `Novo comentário em: ${titulo_tarefa}`;
    const body = `
Olá,

Novo comentário adicionado à tarefa:

**${titulo_tarefa}**

**${autor_nome || 'Alguém'}** comentou:
"${conteudo}"

Responda no painel de tarefas.

Atenciosamente,
M31 Filhas
    `.trim();

    const htmlContent = `<p>${body.replace(/\n/g, '<br>')}</p>`;

    // Identificador do evento (idempotência): comentario_id quando disponível
    const eventoId = comentario_id || Date.now().toString(36);

    // Membros (para whatsapp)
    const membros = await base44.entities.EventoM31Membro.list();
    const membroMap = Object.fromEntries(membros.map(m => [m.user_email, m]));

    let emails_enviados = 0;
    let whatsapp_enfileirados = 0;
    const detalhes: any[] = [];

    for (const email of emails_para_notificar) {
      // ── E-mail via Brevo (comportamento original mantido) ──
      const brevoRes = await fetch('__BREVO_API__/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': config('BREVO_API_KEY'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: 'M31 Filhas', email: 'noreply@m31filhas.com.br' },
          to: [{ email }],
          subject,
          htmlContent,
        }),
      });
      if (brevoRes.ok) {
        emails_enviados++;
      } else {
        logger.error(`Erro ao enviar e-mail para ${email}:`, await brevoRes.text());
      }

      // ── WhatsApp: ENFILEIRA na fila global governada (nunca envia direto) ──
      const whatsapp = membroMap[email]?.whatsapp;
      if (whatsapp) {
        const msgWpp = `💬 *Novo comentário na tarefa*\n\n*${titulo_tarefa}*\n\n*${autor_nome || 'Alguém'}* comentou:\n"${conteudo}"\n\nResponda no painel de tarefas.`;
        const res = await base44.functions.invoke('m31EnviarMensagemGovernada', {
          telefone: whatsapp,
          email,
          automacao: 'OPERACIONAL',
          template: 'tarefa_comentario',
          versao: `TAREFA_COMENT_${tarefa_id}_${eventoId}`,
          origem: 'm31NotificarComentarioTarefa',
          mensagens: [{ message: msgWpp }],
        });
        if (res?.enfileirado === true) {
          whatsapp_enfileirados++;
        }
        detalhes.push({ email, whatsapp: true, resultado: res?.enfileirado ? 'enfileirado' : (res?.motivo || 'bloqueado') });
      } else {
        detalhes.push({ email, whatsapp: false, resultado: 'sem_whatsapp_cadastrado' });
      }
    }

    return Response.json({
      success: true,
      message: `${emails_enviados} e-mails enviados, ${whatsapp_enfileirados} WhatsApp enfileirados na fila global`,
      emails_enviados,
      whatsapp_enfileirados,
      detalhes,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
