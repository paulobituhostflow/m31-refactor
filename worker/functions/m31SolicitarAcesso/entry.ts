// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31SolicitarAcesso — Cria solicitação de acesso automática
 *
 * Quando um usuário autenticado não tem registro em EventoM31Membro,
 * esta função:
 * 1. Registra a solicitação em M31SolicitacaoAcesso (com dedup)
 * 2. Envia notificação WhatsApp para o gestor Paulo
 *
 * Dedup: se já existe solicitação pendente para o mesmo e-mail,
 * não cria nova nem reenvia WhatsApp.
 */

const PAULO_PHONE = '5581992008889';

function toRecifeISO(date = new Date()) {
  const offset = -3 * 60;
  const local = new Date(date.getTime() + offset * 60 * 1000);
  return local.toISOString().replace('Z', '-03:00');
}

function formatHorario(isoUtc) {
  const d = new Date(isoUtc);
  return toRecifeISO(d).replace('T', ' ').slice(0, 19);
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const provedor_login = body?.provedor_login || 'desconhecido';
    const app_url = body?.app_url || '';

    // IP do solicitante (melhor esforço)
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      req.headers.get('cf-connecting-ip') ||
      null;

    const nome = user.full_name || user.email?.split('@')[0] || 'Sem nome';
    const email = user.email;
    const user_id = user.id;

    // Dedup: busca solicitação pendente existente
    const existentes = await base44.asServiceRole.entities.M31SolicitacaoAcesso.filter({
      email,
      status: 'pendente',
    });

    if (existentes.length > 0) {
      return Response.json({
        success: true,
        dedup: true,
        message: 'Já existe solicitação pendente para este e-mail.',
        solicitacao_id: existentes[0].id,
      });
    }

    // Cria a solicitação
    const agora = new Date().toISOString();
    const solicitacao = await base44.asServiceRole.entities.M31SolicitacaoAcesso.create({
      nome,
      email,
      user_id,
      provedor_login,
      ip,
      status: 'pendente',
      data_solicitacao: agora,
    });

    // Monta mensagem para o gestor
    const provedorLabel = provedor_login === 'google' ? 'Google' : provedor_login === 'email' ? 'E-mail e senha' : 'Não identificado';
    const horario = formatHorario(agora);
    const linkPainel = app_url ? `${app_url}/m31-admin?tab=solicitacoes` : 'Painel M31 → Gestão → Solicitações de Acesso';

    const mensagem =
      `🔔 *NOVA SOLICITAÇÃO DE ACESSO - M31*\n\n` +
      `👤 *Nome:* ${nome}\n` +
      `📧 *E-mail:* ${email}\n` +
      `🔑 *Provedor:* ${provedorLabel}\n` +
      (ip ? `🌐 *IP:* ${ip}\n` : '') +
      `🕐 *Data/Hora:* ${horario} (Recife)\n\n` +
      `Acesse o painel para aprovar:\n${linkPainel}`;

    // Envia WhatsApp para Paulo
    let whatsappEnviado = false;
    try {
      const token = config('UAZAPI_TOKEN');
      const baseUrl = (config('UAZAPI_BASE') || '__UAZAPI_API__').replace(/\/+$/, '');
      const phoneF = PAULO_PHONE.replace(/\D/g, '');

      const resp = await fetch(`${baseUrl}/send/text`, {
        method: 'POST',
        headers: { 'token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number: phoneF,
          phone: phoneF,
          message: mensagem,
          text: mensagem,
        }),
      });
      whatsappEnviado = resp.status === 200;
    } catch (wpErr) {
      logger.error('[SolicitarAcesso] Erro ao enviar WhatsApp:', wpErr.message);
    }

    return Response.json({
      success: true,
      dedup: false,
      solicitacao_id: solicitacao.id,
      whatsapp_enviado: whatsappEnviado,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
