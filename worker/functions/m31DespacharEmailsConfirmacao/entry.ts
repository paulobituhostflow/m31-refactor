// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31DespacharEmailsConfirmacao — Envio de confirmação via EMAIL (sem WhatsApp)
 *
 * Enquanto a conta WhatsApp está bloqueada em análise, esta função envia
 * o email de confirmação com QR Code para todas as inscritas aprovadas
 * que ainda não receberam. Não toca na UAZAPI — zero risco de bloqueio.
 *
 * Controle de quem já recebeu: campo email_envio_status na inscrição.
 *   - 'enviado' = email aceito pela Brevo (HTTP 201)
 *   - 'pendente' = ainda não enviado
 *   - 'falha' = erro no envio (será reprocessado na próxima execução)
 *
 * Pipeline:
 *   1. Busca aprovadas com email + QR mas email_envio_status != 'enviado'
 *   2. (Garante QR Code gerado para as que não têm)
 *   3. Envia email via Brevo
 *   4. Marca email_envio_status = 'enviado' + email_boas_vindas_enviado_em
 *
 * Uso:
 *   - Execução manual pelo painel (admin)
 *   - Automação agendada (a cada 30 min)
 *   - inscricao_id: processa apenas uma inscrição específica
 */

const BREVO_URL = '__BREVO_API__/smtp/email';
const MAX_POR_EXECUCAO = 50;

function gerarCodigoInscricao(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return `M31-${code}`;
}

function gerarQrUrl(codigo: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(codigo)}&bgcolor=FFFFFF&color=000000&format=png`;
}

async function enviarEmailBrevo(inscricao: any, codigo: string, qrCodeUrl: string): Promise<boolean> {
  const BREVO_KEY = config('BREVO_API_KEY');
  if (!BREVO_KEY || !inscricao.email) return false;

  const htmlContent = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
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
  <p style="color: #888; font-size: 13px; text-align: center;">Guarde este e-mail e apresente o QR Code ou código no dia do evento para fazer o check-in.<br/><em>M31 Filhas — Imersão Mulheres de Fé 🌸</em></p>
</body></html>`;

  try {
    const resp = await fetch(BREVO_URL, {
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
  } catch {
    return false;
  }
}

return (async (req: Request): Promise<Response> => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const inscricaoIdEspecifica = body?.inscricao_id || null;

    // Auth check para execução manual
    try {
      const user = await base44.auth.me();
      if (user && user.role !== 'admin') {
        return Response.json({ error: 'Apenas administradores' }, { status: 403 });
      }
    } catch {
      // Execução via automação agendada — sem usuário, prosseguir
    }

    const S = base44.asServiceRole.entities;

    // ── Selecionar inscritas aprovadas que ainda não receberam email ──
    let candidatas: any[] = [];

    if (inscricaoIdEspecifica) {
      candidatas = await S.EventoM31Inscricao.filter({ id: inscricaoIdEspecifica });
    } else {
      // Busca todos os aprovados com paginação (email_envio_status pode ser null/pendente/falha)
      const seen = new Set<string>();
      let offset = 0;
      while (candidatas.length < MAX_POR_EXECUCAO) {
        const batch = await S.EventoM31Inscricao.filter({ status_pagamento: 'aprovado' }, '-created_date', 100, offset);
        if (!batch || batch.length === 0) break;
        for (const i of batch) {
          if (i.email && i.email_envio_status !== 'enviado' && !seen.has(i.id)) {
            seen.add(i.id);
            candidatas.push(i);
            if (candidatas.length >= MAX_POR_EXECUCAO) break;
          }
        }
        if (batch.length < 100) break;
        offset += 100;
        if (offset > 1000) break; // safety limit
      }
    }

    const resultados: any[] = [];
    let enviadas = 0;
    let falharam = 0;
    let semEmail = 0;

    for (const insc of candidatas) {
      // Pular presentes sem email (gift fantasma)
      if (!insc.email) { semEmail++; continue; }

      // Garantir QR Code + código gerados
      let codigo = insc.codigo_inscricao || '';
      let qrUrl = insc.qrcode_url || '';
      const updates: any = {};

      if (!codigo) {
        codigo = gerarCodigoInscricao();
        updates.codigo_inscricao = codigo;
      }
      if (!qrUrl) {
        qrUrl = gerarQrUrl(codigo);
        updates.qrcode_token = qrUrl;
        updates.qrcode_url = qrUrl;
        updates.qrcode_gerado_em = new Date().toISOString();
      }

      if (Object.keys(updates).length > 0) {
        await S.EventoM31Inscricao.update(insc.id, updates);
      }

      // Enviar email
      const ok = await enviarEmailBrevo(insc, codigo, qrUrl);

      await S.EventoM31Inscricao.update(insc.id, {
        email_envio_status: ok ? 'enviado' : 'falha',
        email_boas_vindas_enviado_em: ok ? new Date().toISOString() : null,
      });

      if (ok) {
        enviadas++;
        resultados.push({ id: insc.id, nome: insc.nome, email: insc.email, status: 'enviado' });
      } else {
        falharam++;
        resultados.push({ id: insc.id, nome: insc.nome, email: insc.email, status: 'falha' });
      }

      // Delay de 500ms entre emails para não sobrecarregar a Brevo
      await new Promise(r => setTimeout(r, 500));
    }

    return Response.json({
      success: true,
      total_processadas: candidatas.length,
      enviadas,
      falharam,
      sem_email: semEmail,
      resultados,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
})(req);
}
