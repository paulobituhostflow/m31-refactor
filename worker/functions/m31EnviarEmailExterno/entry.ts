// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31EnviarEmailExterno — Envia e-mail via Brevo para destinatários fora do app
 *
 * Payload: { to, nome, subject, htmlContent }
 */
return (async (req) => {
  try {
    const apiKey = config('BREVO_API_KEY');
    if (!apiKey) return Response.json({ error: 'BREVO_API_KEY não configurado' }, { status: 500 });

    const body = await req.json().catch(() => ({}));
    const { to, nome, subject, htmlContent } = body;

    if (!to || !subject || !htmlContent) {
      return Response.json({ error: 'to, subject e htmlContent são obrigatórios' }, { status: 400 });
    }

    const resp = await fetch('__BREVO_API__/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json', 'accept': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Sistema M31 Filhas', email: 'no-reply@m31.com.br' },
        to: [{ email: to, name: nome || to }],
        subject,
        htmlContent,
      }),
    });

    const respText = await resp.text();

    return Response.json({
      success: resp.ok,
      status: resp.status,
      to,
      body: respText.slice(0, 500),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
