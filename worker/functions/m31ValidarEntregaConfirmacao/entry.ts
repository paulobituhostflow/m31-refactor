// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31ValidarEntregaConfirmacao
 *
 * Valida se inscritas com pagamento confirmado receberam o e-mail de confirmação
 * e o QR Code. Caso não tenham sido entregues, realiza o reenvio automático e
 * registra no timeline o motivo, a data e o status da entrega.
 *
 * Pode processar uma inscrição específica (inscricao_id) ou varrer o backlog
 * de aprovadas sem entrega completa.
 */

const STATUS_CONFIRMADOS = ['aprovado', 'gratuito'];

function normalizePhone(phone: string): string {
  let d = (phone || '').replace(/\D/g, '');
  while (d.startsWith('5555')) d = d.slice(2);
  if (d.startsWith('55') && d.length >= 12) return d;
  if (d.length >= 10) return `55${d}`;
  return d;
}

async function registrarTimeline(base44: any, inscricao_id: string, evento: string, status: string, detalhe: string) {
  try {
    await base44.asServiceRole.entities.M31InscricaoTimeline.create({
      inscricao_id, evento, status, detalhe,
      origem: 'm31ValidarEntregaConfirmacao',
    });
  } catch (_) {}
}

async function enviarEmailConfirmacao(inscricao: any, codigo: string, qrCodeUrl: string): Promise<boolean> {
  const BREVO_KEY = config('BREVO_API_KEY');
  if (!BREVO_KEY || !inscricao.email) return false;

  const htmlContent = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, cambria; background: #0f0f0f; color: #f5f5f5; padding: 30px; max-width: 600px; margin: 0 auto;">
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
      <img src="${qrCodeUrl}" alt="QR Code" style="width: 200px; height: 200px; border-radius: 8px; background: #fff;" />
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

  try {
    const resp = await fetch('__BREVO_API__/smtp/email', {
      method: 'POST',
      headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'M31 Filhas', email: 'm31filhas@gmail.com' },
        to: [{ email: inscricao.email, name: inscricao.nome }],
        subject: `✅ Inscrição Confirmada — M31 Filhas | ${codigo}`,
        htmlContent,
      }),
    });
    return resp.status === 201;
  } catch (e) {
    logger.error('[ValidarEntrega] Erro email:', (e as Error).message);
    return false;
  }
}

return (async (req: Request): Promise<Response> => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const inscricaoIdEspecifica = body?.inscricao_id || null;

    // Buscar inscritas aprovadas
    let candidatas: any[] = [];
    if (inscricaoIdEspecifica) {
      const found = await base44.asServiceRole.entities.EventoM31Inscricao.filter({ id: inscricaoIdEspecifica });
      candidatas = found.filter((i: any) => STATUS_CONFIRMADOS.includes(i.status_pagamento));
    } else {
      candidatas = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
        { status_pagamento: 'aprovado' }, '-created_date', 100
      );
    }

    // Filtrar apenas as que têm gap de entrega (email OU QR não entregues)
    const comGap = candidatas.filter((i: any) => {
      const emailPendente = i.email_envio_status !== 'enviado';
      const qrPendente = i.qr_envio_status !== 'enviado_com_sucesso';
      return emailPendente || qrPendente;
    });

    const resultados = [];
    for (const insc of comGap) {
      const motivoPartes: string[] = [];
      let emailEnviado = false;
      let qrEnviado = false;

      // Gerar QR Code se não existir
      let codigo = insc.codigo_inscricao || '';
      if (!codigo) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        codigo = 'M31-';
        for (let c = 0; c < 8; c++) codigo += chars[Math.floor(Math.random() * chars.length)];
      }
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(codigo)}&bgcolor=FFFFFF&color=000000&format=png`;

      // Reenviar e-mail se pendente
      if (insc.email_envio_status !== 'enviado' && insc.email) {
        emailEnviado = await enviarEmailConfirmacao(insc, codigo, qrCodeUrl);
        if (emailEnviado) {
          motivoPartes.push('email_reenviado');
        } else {
          motivoPartes.push('email_falhou');
        }
      }

      // Reenviar QR via WhatsApp se pendente — atualiza QR e marca como reenvio_pendente
      // O reenvio real via WhatsApp é disparado pelo botão "Reenviar QR" no painel
      // (handleReenviarQR → m31ReenviarQRCode) ou pelo despachador na próxima execução.
      if (insc.qr_envio_status !== 'enviado_com_sucesso') {
        try {
          await base44.asServiceRole.entities.EventoM31Inscricao.update(insc.id, {
            qrcode_token: qrCodeUrl,
            qrcode_url: qrCodeUrl,
            qrcode_gerado_em: new Date().toISOString(),
            codigo_inscricao: codigo,
            qr_envio_status: 'reenvio_pendente',
          });
          qrEnviado = true;
          motivoPartes.push('qr_reenvio_marcado_pendente');
        } catch (e) {
          motivoPartes.push('qr_falhou');
        }
      }

      const statusEntrega = (emailEnviado || qrEnviado) ? 'sucesso' : 'falha';
      const detalhe = `Validação de entrega executada. Motivo: ${motivoPartes.join(', ')}. Email: ${insc.email_envio_status || 'pendente'} → ${emailEnviado ? 'enviado' : 'não enviado'}. QR: ${insc.qr_envio_status || 'gerado_nao_enviado'} → ${qrEnviado ? 'reenvio disparado' : 'não enviado'}.`;

      // Atualizar status do email se foi enviado
      if (emailEnviado) {
        await base44.asServiceRole.entities.EventoM31Inscricao.update(insc.id, {
          email_envio_status: 'enviado',
          email_boas_vindas_enviado_em: new Date().toISOString(),
        }).catch(() => {});
      }

      await registrarTimeline(base44, insc.id, 'validacao_entrega', statusEntrega, detalhe);

      resultados.push({
        id: insc.id,
        nome: insc.nome,
        email_status: emailEnviado ? 'reenviado' : 'nao_enviado',
        qr_status: qrEnviado ? 'reenvio_disparado' : 'nao_enviado',
        motivo: motivoPartes.join(', '),
      });
    }

    return Response.json({
      success: true,
      validadas: candidatas.length,
      com_gap_entrega: comGap.length,
      reenvios_realizados: resultados.filter(r => r.email_status === 'reenviado' || r.qr_status === 'reenvio_disparado').length,
      resultados,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
})(req);
}
