// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31MensagemRecuperacaoManual
 *
 * Envia mensagem gentil de recuperação para uma pessoa específica.
 * Lida com dois cenários:
 *   1. checkout_pendente → envia link de pagamento
 *   2. CPF/email com inscrição aprovada → informa que já está confirmada e manda link do grupo
 *
 * Params: { inscricao_id, tipo_caso, mensagem_customizada? }
 * tipo_caso: 'checkout_pendente' | 'ja_aprovada'
 */

const LINK_GRUPO = '__WHATSAPP_GROUP_INVITE__';

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { inscricao_id, tipo_caso, mensagem_customizada } = await req.json();

    if (!inscricao_id || !tipo_caso) {
      return Response.json({ error: 'Parâmetros obrigatórios: inscricao_id e tipo_caso' }, { status: 400 });
    }

    const inscricoes = await base44.asServiceRole.entities.EventoM31Inscricao.filter({ id: inscricao_id });
    const inscricao = inscricoes[0];
    if (!inscricao) return Response.json({ error: 'Inscrição não encontrada' }, { status: 404 });

    const nome = inscricao.nome?.split(' ')[0] || 'Querida';
    const phone = inscricao.whatsapp?.replace(/\D/g, '');

    if (!phone || phone.length < 10) {
      return Response.json({ error: 'Telefone inválido' }, { status: 400 });
    }

    let msg;

    if (mensagem_customizada) {
      msg = mensagem_customizada;
    } else if (tipo_caso === 'checkout_pendente') {
      const link = inscricao.asaas_charge_url || '';
      msg =
        `Oi, ${nome}! 🌷\n\n` +
        `Vi que você iniciou sua inscrição no *M31 Filhas* mas ainda não finalizou o pagamento.\n\n` +
        `Posso te ajudar com alguma coisa? Se tiver dúvida sobre como pagar, é só me falar! 💛\n\n` +
        (link ? `Seu link de pagamento:\n${link}\n\n` : '') +
        `Qualquer dúvida, estou aqui! 🙏`;
    } else if (tipo_caso === 'ja_aprovada') {
      msg =
        `Oi, ${nome}! 🌷\n\n` +
        `Tudo bem? Sua inscrição no *M31 Filhas* já está *confirmada e paga*! ✅\n\n` +
        `Para receber todas as informações do evento, entre no nosso grupo oficial:\n` +
        `${LINK_GRUPO}\n\n` +
        `Qualquer dúvida, estou à disposição! Mal posso esperar para te ver lá 🙌`;
    } else {
      return Response.json({ error: 'tipo_caso inválido: use checkout_pendente ou ja_aprovada' }, { status: 400 });
    }

    const wpRes = await base44.asServiceRole.functions.invoke('m31SendWhatsApp', { phone, message: msg });
    const sucesso = wpRes.sucesso === true;

    await base44.asServiceRole.entities.M31MessageLog.create({
      inscricao_id,
      inscricao_nome: inscricao.nome,
      telefone: phone,
      tipo: 'manual',
      stage: `recuperacao_${tipo_caso}`,
      mensagem: msg,
      sucesso,
      zapi_response: JSON.stringify(wpRes.uazapi_response || wpRes),
      erro: sucesso ? null : (wpRes.error || 'sem confirmação'),
      enviado_em: new Date().toISOString()
    });

    await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao_id, {
      recovery_attempts: (inscricao.recovery_attempts || 0) + 1,
      last_recovery_at: new Date().toISOString(),
      last_contact_at: new Date().toISOString(),
    });

    return Response.json({
      success: true,
      sucesso,
      tipo_caso,
      nome: inscricao.nome,
      phone,
      zapi: wpRes.uazapi_response,
      mensagem_enviada: msg,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
