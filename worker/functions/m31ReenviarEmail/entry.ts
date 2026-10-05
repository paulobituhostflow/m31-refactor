// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

const BREVO_API_KEY = config("BREVO_API_KEY");

async function sendBrevoEmail({ to, toName, subject, htmlContent }) {
  const res = await fetch("__BREVO_API__/smtp/email", {
    method: "POST",
    headers: {
      "api-key": BREVO_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: "M31 Filhas", email: "m31filhas@gmail.com" },
      to: [{ email: to, name: toName }],
      subject,
      htmlContent,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Brevo error: ${err}`);
  }
  return await res.json();
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { inscricao_id } = await req.json();

    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const inscricao = await base44.asServiceRole.entities.EventoM31Inscricao.get(inscricao_id);
    if (!inscricao) {
      return Response.json({ error: 'Inscrição não encontrada' }, { status: 404 });
    }

    const codigo = inscricao.codigo_inscricao;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(codigo)}&bgcolor=1a0a0a&color=f43f5e&format=png`;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; background: #0f0f0f; color: #f5f5f5; padding: 30px; max-width: 600px; margin: 0 auto;">
  <div style="text-align: center; margin-bottom: 24px;">
    <h1 style="color: #f43f5e; font-size: 24px; margin: 0;">M31 Filhas</h1>
    <p style="color: #aaa; margin: 4px 0 0;">Imersão Mulheres de Fé</p>
  </div>

  <div style="background: #1a0a0a; border: 1px solid #f43f5e33; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
    <h2 style="color: #f43f5e; margin-top: 0;">✅ Inscrição Confirmada!</h2>
    <p style="font-size: 16px;">Olá, <strong>${inscricao.nome}</strong>! Seu pagamento foi confirmado com sucesso. 🎉</p>

    <div style="background: #2a0f0f; border-radius: 8px; padding: 16px; margin: 20px 0; text-align: center;">
      <p style="color: #aaa; margin: 0 0 8px; font-size: 13px;">SEU CÓDIGO DE CHECK-IN</p>
      <p style="font-size: 28px; font-weight: bold; color: #f43f5e; letter-spacing: 3px; margin: 0; font-family: monospace;">${codigo}</p>
    </div>

    <div style="text-align: center; margin: 24px 0;">
      <p style="color: #aaa; font-size: 13px; margin-bottom: 12px;">QR CODE PARA CHECK-IN</p>
      <img src="${qrCodeUrl}" alt="QR Code" style="width: 200px; height: 200px; border-radius: 8px;" />
    </div>

    <hr style="border: 1px solid #333; margin: 20px 0;" />

    <p style="margin: 6px 0;"><strong>📅 Data:</strong> 21 de novembro</p>
    <p style="margin: 6px 0;"><strong>🕗 Horário:</strong> 9h às 19h</p>
    <p style="margin: 6px 0;"><strong>📍 Local:</strong> Igreja RIO Prado, Recife-PE</p>
  </div>

  <p style="color: #888; font-size: 13px; text-align: center;">
    Guarde este e-mail e apresente o QR Code ou código no dia do evento para fazer o check-in.<br/>
    <em>M31 Filhas — Imersão Mulheres de Fé 🌸</em>
  </p>
</body>
</html>`;

    await sendBrevoEmail({
      to: inscricao.email,
      toName: inscricao.nome,
      subject: `✅ Inscrição Confirmada — M31 Filhas | ${codigo}`,
      htmlContent,
    });

    return Response.json({ success: true, email: inscricao.email });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
