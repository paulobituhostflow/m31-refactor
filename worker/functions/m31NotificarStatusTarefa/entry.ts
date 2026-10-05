// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31NotificarStatusTarefa — notificação de mudança de status de tarefa.
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

    const { tarefa_id, titulo_tarefa, status_novo, status_antigo, responsavel_email, responsavel_nome } = await req.json();

    if (!tarefa_id || !titulo_tarefa || !status_novo) {
      return Response.json({ error: 'Faltam dados obrigatórios' }, { status: 400 });
    }

    // Só notificar para mudanças significativas
    const statusSignificativos = ['atrasado', 'concluido', 'bloqueado'];
    if (!statusSignificativos.includes(status_novo.toLowerCase())) {
      return Response.json({ success: true, message: 'Status não requer notificação' });
    }

    const statusLabels = {
      critico: '🔴 CRÍTICO',
      atrasado: '⚠️ ATRASADO',
      atencao: '🟡 ATENÇÃO',
      em_execucao: '🔵 EM EXECUÇÃO',
      concluido: '✅ CONCLUÍDO',
      a_fazer: '⚪ A FAZER',
      em_andamento: '🔵 EM ANDAMENTO',
      bloqueado: '🚫 BLOQUEADO',
    };

    // ── E-mail via Brevo (comportamento original mantido) ──
    const subject = `Mudança de Status: ${titulo_tarefa}`;
    const body = `
Olá ${responsavel_nome || responsavel_email},

O status da tarefa foi alterado:

**${titulo_tarefa}**
Status anterior: ${status_antigo || '—'}
Novo status: ${statusLabels[status_novo] || status_novo}

Verifique o painel de tarefas para mais informações.

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
      const msgWpp = `🔄 *Mudança de status na sua tarefa*\n\n*${titulo_tarefa}*\nStatus anterior: ${status_antigo || '—'}\nNovo status: ${statusLabels[status_novo] || status_novo}\n\nVerifique o painel de tarefas.`;
      const res = await base44.functions.invoke('m31EnviarMensagemGovernada', {
        telefone: whatsapp,
        email: responsavel_email,
        automacao: 'OPERACIONAL',
        template: 'tarefa_status',
        versao: `TAREFA_STATUS_${tarefa_id}_${status_novo}`,
        origem: 'm31NotificarStatusTarefa',
        mensagens: [{ message: msgWpp }],
      });
      whatsapp_enfileirado = res?.enfileirado === true;
      whatsapp_motivo = whatsapp_enfileirado ? 'enfileirado' : (res?.motivo || res?.error || 'bloqueado');
    }

    return Response.json({
      success: emailOk,
      message: emailOk ? 'E-mail de status enviado' : 'Falha no e-mail',
      whatsapp_enfileirado,
      whatsapp_motivo,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
