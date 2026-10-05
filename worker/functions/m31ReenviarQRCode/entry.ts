// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

// ── TRAVA DE PAGAMENTO CONFIRMADO ──────────────────────────────────────────
const STATUS_CONFIRMADOS_DB = ['aprovado', 'gratuito'];
const STATUS_CONFIRMADOS_ASAAS = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'DUNNING_RECEIVED'];

async function validarPagamentoConfirmado(base44, inscricao) {
  if (!STATUS_CONFIRMADOS_DB.includes(inscricao.status_pagamento)) {
    return { liberado: false, motivo: 'bloqueado_por_pagamento_nao_confirmado', detalhe: `status_db=${inscricao.status_pagamento}` };
  }
  if (inscricao.asaas_payment_id) {
    try {
      const resp = await fetch(`__ASAAS_API__/payments/${inscricao.asaas_payment_id}`, {
        headers: { 'access_token': config('ASAAS_API_KEY') }
      });
      const payment = await resp.json();
      if (!STATUS_CONFIRMADOS_ASAAS.includes(payment.status)) {
        return { liberado: false, motivo: 'bloqueado_por_pagamento_nao_confirmado', detalhe: `Asaas=${payment.status} vs DB=${inscricao.status_pagamento}` };
      }
    } catch (e) {
      return { liberado: false, motivo: 'bloqueado_por_pagamento_nao_confirmado', detalhe: `Asaas indisponível: ${e.message}` };
    }
  }
  return { liberado: true };
}

async function registrarBloqueio(base44, inscricao, motivo, detalhe) {
  try {
    await base44.asServiceRole.entities.M31AuditLog.create({
      chave_unica: `bloqueio_pagamento_${inscricao.id}_${Date.now()}`,
      tipo_erro: 'bloqueado_por_pagamento_nao_confirmado',
      gravidade: 'alto',
      origem: 'automacao',
      descricao: `Envio de QR Code bloqueado: ${detalhe}`,
      possivel_causa: 'Pagamento não confirmado no Asaas ou divergência DB/Asaas',
      acao_recomendada: 'Verificar status no Asaas e corrigir se necessário',
      pessoa_nome: inscricao.nome,
      pessoa_email: inscricao.email,
      pessoa_telefone: inscricao.whatsapp,
      pessoa_id: inscricao.id,
    });
  } catch (_) {}
}

// ── ENVIO POR EMAIL via Brevo (inline — evita 403 do functions.invoke) ──
async function enviarEmailBrevo(inscricao, codigo, qrCodeUrl, caption, linkGrupo) {
  const apiKey = config('BREVO_API_KEY');
  if (!apiKey) throw new Error('BREVO_API_KEY não configurado');

  const primeiroNome = inscricao.nome?.split(' ')[0] || 'Querida';
  const htmlContent = `<!DOCTYPE html>
<html><body style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#ffffff;">
  <div style="text-align:center;margin-bottom:24px;">
    <h1 style="color:#8B1A2B;font-size:22px;margin:0;">M31 Filhas — Confirmação de Inscrição</h1>
  </div>
  <p style="font-size:15px;color:#2A1F1F;">Olá, <strong>${primeiroNome}</strong>! 🌸</p>
  <p style="font-size:15px;color:#2A1F1F;">Sua inscrição no M31 Filhas está <strong>confirmada</strong>!</p>
  <div style="background:#F6E9EC;border:1px solid #E5DDD5;border-radius:8px;padding:16px;margin:20px 0;text-align:center;">
    <p style="font-size:13px;color:#6B5E5E;margin:0 0 8px;">🎟️ Código da sua inscrição:</p>
    <p style="font-size:20px;font-weight:700;color:#8B1A2B;margin:0;letter-spacing:2px;">${codigo}</p>
  </div>
  <div style="text-align:center;margin:24px 0;">
    <img src="${qrCodeUrl}" alt="QR Code de Check-in" style="width:200px;height:200px;border:1px solid #E5DDD5;border-radius:8px;"/>
    <p style="font-size:13px;color:#6B5E5E;margin-top:8px;">📱 Apresente este QR Code no credenciamento do evento.</p>
  </div>
  <div style="background:#F9FAFB;border:1px solid #E5DDD5;border-radius:8px;padding:14px;margin:20px 0;">
    <p style="font-size:14px;color:#2A1F1F;margin:0 0 8px;font-weight:600;">👇 Entre no grupo oficial da Imersão M31 Filhas:</p>
    <p style="margin:0;"><a href="${linkGrupo}" style="color:#8B1A2B;font-size:14px;word-break:break-all;">${linkGrupo}</a></p>
    <p style="font-size:12px;color:#6B5E5E;margin:8px 0 0;">Por lá, você receberá todas as orientações e informações importantes do evento.</p>
  </div>
  <p style="font-size:14px;color:#2A1F1F;">☺️ Nos vemos no M31!</p>
  <hr style="border:none;border-top:1px solid #E5DDD5;margin:24px 0;"/>
  <p style="font-size:12px;color:#6B5E5E;text-align:center;">M31 Filhas · Edição 2026 · Ju Beltrão</p>
</body></html>`;

  const resp = await fetch('__BREVO_API__/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', 'accept': 'application/json' },
    body: JSON.stringify({
      sender: { name: 'M31 Filhas', email: 'no-reply@m31.com.br' },
      to: [{ email: inscricao.email, name: inscricao.nome }],
      subject: `🌸 M31 Filhas — Sua inscrição está confirmada! Código: ${codigo}`,
      htmlContent,
    }),
  });
  const respText = await resp.text();
  return { sucesso: resp.ok, status: resp.status, body: respText.slice(0, 500) };
}

/**
 * Reenviar QR Code de check-in
 *
 * Payload: { inscricao_id, canal? }
 * canal = 'whatsapp' (default) | 'email'
 *
 * Uso:
 * - WhatsApp: envia imagem do QR + mensagem via UAZAPI com retry
 * - Email: envia HTML com QR Code embutido via Brevo (alternativa quando WhatsApp falha)
 * - Em ambos os casos, valida pagamento confirmado e rastreia o envio
 */
return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user?.email) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { inscricao_id, canal } = await req.json();

    if (!inscricao_id) {
      return Response.json({ error: 'inscricao_id obrigatório' }, { status: 400 });
    }

    const usarEmail = canal === 'email';

    // Buscar inscrição
    let inscricao;
    try {
      inscricao = await base44.asServiceRole.entities.EventoM31Inscricao.get(inscricao_id);
    } catch (_) {
      return Response.json({ error: 'Inscrição não encontrada' }, { status: 404 });
    }

    // ── TRAVA: validar pagamento confirmado (DB + Asaas) ──────────────
    const validacao = await validarPagamentoConfirmado(base44, inscricao);
    if (!validacao.liberado) {
      await registrarBloqueio(base44, inscricao, validacao.motivo, validacao.detalhe);
      return Response.json({
        error: validacao.motivo,
        detalhe: validacao.detalhe,
        status_atual: inscricao.status_pagamento
      }, { status: 400 });
    }

    // ── Se canal=email, validar que tem email ──
    if (usarEmail && !inscricao.email) {
      return Response.json({ error: 'Esta inscrição não possui email cadastrado. Não é possível enviar por email.' }, { status: 400 });
    }

    // Gerar QR Code URL
    const codigo = inscricao.codigo_inscricao;
    if (!codigo) {
      return Response.json({ error: 'Esta inscrição não possui código de inscrição gerado.' }, { status: 400 });
    }
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(codigo)}&bgcolor=FFFFFF&color=000000&format=png`;

    // ── Buscar grupo oficial + template editável ──
    const grupos = await base44.asServiceRole.entities.M31GrupoConfig.filter({ finalidade: 'INSCRITAS_OFICIAL', ativo: true });
    const linkGrupo = grupos[0]?.invite_link || '';
    if (!linkGrupo) {
      return Response.json({ error: 'Link do grupo oficial não configurado. Não é possível enviar QR Code incompleto.' }, { status: 400 });
    }
    const tplRecords = await base44.asServiceRole.entities.M31MessageTemplate.filter({ chave_unica: 'confirmacao_com_qr', is_active: true }, '-updated_date', 1);
    const tplContent = tplRecords[0]?.content || `Aqui está, {{primeiro_nome}}! 🌸\n🎟️ Código da sua inscrição:\n{{codigo_inscricao}}\n\n📲 Seu QR Code está na imagem.\nApresente-o no credenciamento do evento.\n\n👇 *Entre no grupo oficial da Imersão M31 Filhas:*\n{{link_grupo_whatsapp}}\n\nPor lá, você receberá todas as orientações e informações importantes do evento.\n\n☺️ Nos vemos no M31!`;
    const primeiro_nome = inscricao.nome?.split(' ')[0] || 'Querida';
    const caption = tplContent
      .replace(/\{\{primeiro_nome\}\}/g, primeiro_nome)
      .replace(/\{\{codigo_inscricao\}\}/g, codigo)
      .replace(/\{\{link_grupo_whatsapp\}\}/g, linkGrupo);

    // ═══════════════════════════════════════════════════════════════════
    // FLUXO EMAIL (Brevo)
    // ═══════════════════════════════════════════════════════════════════
    if (usarEmail) {
      let sucesso = false;
      let erroFinal = null;
      let brevoResponse = null;

      try {
        const emailResult = await enviarEmailBrevo(inscricao, codigo, qrCodeUrl, caption, linkGrupo);
        sucesso = emailResult.sucesso;
        brevoResponse = emailResult.body;
        if (!sucesso) erroFinal = `Brevo HTTP ${emailResult.status}: ${emailResult.body}`;
      } catch (e) {
        erroFinal = e.message;
      }

      // Log em M31MessageLog
      await base44.asServiceRole.entities.M31MessageLog.create({
        inscricao_id: inscricao.id,
        inscricao_nome: inscricao.nome,
        telefone: inscricao.whatsapp,
        tipo: 'reenvio_qr_code_email',
        stage: 'reenvio_manual_email',
        mensagem: `QR Code enviado por email (Brevo) — ${inscricao.email}`,
        sucesso,
        zapi_response: brevoResponse ? JSON.stringify(brevoResponse) : null,
        erro: erroFinal || (sucesso ? null : 'Falha na entrega do email'),
        enviado_em: new Date().toISOString()
      }).catch(() => {});

      // Atualizar inscrição — campos de tracking de email
      await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
        qrcode_token: qrCodeUrl,
        qrcode_url: qrCodeUrl,
        qrcode_gerado_em: new Date().toISOString(),
        email_envio_status: sucesso ? 'enviado' : 'falha',
        email_boas_vindas_enviado_em: sucesso ? new Date().toISOString() : (inscricao.email_boas_vindas_enviado_em || undefined),
        // Se WhatsApp também já tinha sido enviado com sucesso, não sobrescrever
        qr_envio_status: sucesso && inscricao.qr_envio_status !== 'enviado_com_sucesso' ? 'enviado_com_sucesso' : (inscricao.qr_envio_status || 'reenvio_pendente'),
        qr_ultimo_envio_em: new Date().toISOString(),
        data_envio_boas_vindas: inscricao.data_envio_boas_vindas || (sucesso ? new Date().toISOString() : undefined),
        status_envio_grupo: sucesso ? 'enviado' : (inscricao.status_envio_grupo || undefined),
      }).catch(() => {});

      return Response.json({
        success: sucesso,
        canal: 'email',
        inscricao_nome: inscricao.nome,
        email_destino: inscricao.email,
        codigo,
        mensagem: sucesso
          ? `✅ Email enviado com sucesso para ${inscricao.email}!`
          : `❌ Erro ao enviar email: ${erroFinal}`,
        erro: sucesso ? null : erroFinal
      }, { status: sucesso ? 200 : 500 });
    }

    // ═══════════════════════════════════════════════════════════════════
    // FLUXO WHATSAPP — ENFILEIRA APENAS (sem UAZAPI direta)
    // O envio real é exclusivo do m31DrenarFila.
    // ═══════════════════════════════════════════════════════════════════
    const telefone = (inscricao.whatsapp || '').replace(/\D/g, '');
    if (telefone.length < 10) {
      return Response.json({ error: 'telefone_invalido', detalhe: `telefone=${telefone}` }, { status: 400 });
    }

    let d = telefone;
    while (d.startsWith('5555')) d = d.slice(2);
    const phoneSanitized = d.startsWith('55') && d.length >= 12 ? d : (d.length >= 10 ? `55${d}` : d);

    // ── KILL-SWITCH GLOBAL ──
    const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
    const controls = await base44.asServiceRole.entities.M31WhatsAppControl.filter({ data: hoje });
    if (controls[0]?.bloqueado === true) {
      return Response.json({ success: false, error: 'kill_switch_global_ativo', canal: 'whatsapp' }, { status: 403 });
    }

    // ── ENFILEIRAR em M31FilaMensagem ──
    const cpfNorm = (inscricao.cpf || '').replace(/\D/g, '');
    const dedupKey = `${inscricao.id}:REENVIO_QR:${Date.now()}`;
    let sucesso = false;
    let erroFinal = null;
    let zapiResponse = 'enfileirado_aguarda_aprovacao';

    try {
      await base44.asServiceRole.entities.M31FilaMensagem.create({
        dedup_key: dedupKey,
        participante_id: cpfNorm || phoneSanitized,
        cpf: cpfNorm || null,
        telefone: phoneSanitized,
        email: (inscricao.email || '').toLowerCase() || null,
        automacao: 'QR_CODE',
        template: 'confirmacao_com_qr',
        versao: 'V1',
        origem: 'm31ReenviarQRCode',
        inscricao_id: inscricao.id,
        inscricao_nome: inscricao.nome,
        mensagens: [{ message: caption, image_url: qrCodeUrl }],
        status: 'pendente',
        aprovado_para_envio: false,
        prioridade: 4,
      });
      sucesso = true;
    } catch (e) {
      erroFinal = `falha_enfileirar: ${e.message}`;
    }

    // Log em M31MessageLog
    await base44.asServiceRole.entities.M31MessageLog.create({
      inscricao_id: inscricao.id,
      inscricao_nome: inscricao.nome,
      telefone,
      tipo: 'reenvio_qr_code',
      stage: 'reenvio_manual',
      mensagem: `QR Code reenvio - Enfileirado em M31FilaMensagem`,
      sucesso,
      zapi_response: zapiResponse,
      erro: erroFinal || (sucesso ? null : 'Falha na entrega'),
      enviado_em: new Date().toISOString()
    }).catch(() => {});

    // Atualizar inscrição
    await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
      qrcode_token: qrCodeUrl,
      qrcode_url: qrCodeUrl,
      qrcode_gerado_em: new Date().toISOString(),
      qr_envio_status: sucesso ? 'enviado_com_sucesso' : 'falha_envio',
      qr_tentativas_envio: (inscricao.qr_tentativas_envio || 0) + 1,
      qr_ultimo_envio_em: new Date().toISOString(),
      data_envio_boas_vindas: inscricao.data_envio_boas_vindas || (sucesso ? new Date().toISOString() : undefined),
      status_envio_grupo: sucesso ? 'enviado' : (inscricao.status_envio_grupo || undefined),
    }).catch(() => {});

    // ── Fechar atendimentos pendentes (QR entregue = suporte resolvido) ──
    if (sucesso) {
      await base44.asServiceRole.entities.M31Atendimento.updateMany(
        { telefone: `55${telefone.replace(/^55/, '')}`, tipo: 'cliente', status_aprovacao: { $nin: ['encerrado_sem_resposta', 'aprovado', 'editado_aprovado', 'rejeitado'] } },
        { $set: { status_processamento: 'processado', status_aprovacao: 'encerrado_sem_resposta', intencao: 'qr_code', observacao: 'QR enviado via m31ReenviarQRCode — atendimento resolvido' } }
      ).catch(() => {});
    }

    return Response.json({
      success: sucesso,
      canal: 'whatsapp',
      inscricao_nome: inscricao.nome,
      codigo,
      tentativas: 1,
      mensagem: sucesso
        ? '✅ QR Code enfileirado para envio via WhatsApp (aguarda aprovação no painel de filas).'
        : '❌ Erro ao enfileirar. Tente novamente ou envie por email.',
      erro: erroFinal
    }, { status: sucesso ? 200 : 500 });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
