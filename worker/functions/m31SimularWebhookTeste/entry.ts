// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31SimularWebhookTeste — uso ÚNICO para validação controlada
 * 
 * Simula um PAYMENT_RECEIVED do Asaas para uma inscrição de TESTE.
 * Só aceita inscrições cujo nome começa com "[TESTE]".
 * 
 * USA m31SendWhatsApp como camada única de envio (sem fetch UAZAPI direto).
 */

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { codigo_inscricao, payment_id } = await req.json();

    if (!codigo_inscricao) {
      return Response.json({ error: 'codigo_inscricao obrigatório' }, { status: 400 });
    }

    // Buscar inscrição
    const inscricoes = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
      { codigo_inscricao }
    );

    if (!inscricoes || inscricoes.length === 0) {
      return Response.json({ error: 'Inscrição não encontrada', codigo_inscricao }, { status: 404 });
    }

    const inscricao = inscricoes[0];

    // Segurança: só aceita inscrições de teste
    if (!inscricao.nome?.startsWith('[TESTE]')) {
      return Response.json({ error: 'BLOQUEADO: esta função só aceita inscrições [TESTE]', nome: inscricao.nome }, { status: 403 });
    }

    const statusAntes = inscricao.status_pagamento;
    const boasVindasAntes = inscricao.data_envio_boas_vindas;

    logger.log('[TesteWebhook] Iniciando simulação para:', inscricao.id, '| status:', statusAntes);

    // Guard: já processado?
    if (inscricao.data_envio_boas_vindas) {
      return Response.json({
        aviso: 'boas_vindas_ja_enviadas',
        inscricao_id: inscricao.id,
        data_envio_boas_vindas: inscricao.data_envio_boas_vindas,
        status_pagamento: inscricao.status_pagamento
      });
    }

    if (inscricao.webhook_processando) {
      return Response.json({ aviso: 'ja_processando', inscricao_id: inscricao.id });
    }

    const paymentId = payment_id || inscricao.asaas_payment_id || 'pay_TESTE_SIM';

    // Lock + aprovação
    await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
      webhook_processando: true,
      status_pagamento: 'aprovado',
      valor_pago: inscricao.valor_pago || 1.0,
      asaas_payment_id: paymentId
    });
    logger.log('[TesteWebhook] Lock adquirido + status APROVADO');

    // Montar mensagem de boas-vindas
    const codigo = inscricao.codigo_inscricao;
    const nome = inscricao.nome?.replace('[TESTE] ', '').replace('[TESTE]', '').split(' ')[0] || 'Querida';
    const phone = (inscricao.whatsapp || '').replace(/\D/g, '');
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(codigo)}&bgcolor=FFFFFF&color=000000&format=png`;

    const mensagem =
      `✅ *[TESTE] Inscrição Confirmada — M31 Filhas!*\n\n` +
      `Parabéns, *${nome}*! Sua inscrição no M31 Filhas foi confirmada! 🌸\n` +
      `Estamos em oração por você!\n\n` +
      `📌 *ENTRE NO GRUPO OFICIAL:*\n` +
      `👉 __WHATSAPP_GROUP_INVITE__\n\n` +
      `*Seu código:* \`${codigo}\`\n` +
      `Guarde para o check-in! ✅\n\n` +
      `_(mensagem de teste — não é produção)_`;

    // Enviar via m31SendWhatsApp (camada única — sem fetch UAZAPI direto)
    const wpRes = await base44.asServiceRole.functions.invoke('m31SendWhatsApp', {
      phone,
      message: mensagem
    });
    const sucesso = wpRes.sucesso === true;

    logger.log('[TesteWebhook] m31SendWhatsApp resultado:', sucesso, '| messageId:', wpRes.messageId);

    // Salvar QR Code
    await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
      qrcode_token: qrCodeUrl,
      qrcode_url: qrCodeUrl,
      qrcode_gerado_em: new Date().toISOString(),
      qr_envio_status: 'gerado_nao_enviado'
    }).catch(e => logger.log('[TesteWebhook] Erro ao salvar QR:', e.message));

    // Enviar QR Code (não crítico)
    let qrSucesso = false;
    if (sucesso) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const qrRes = await base44.asServiceRole.functions.invoke('m31SendWhatsApp', {
          phone,
          image: qrCodeUrl,
          caption: `🔲 *QR Code para check-in*\n\nCódigo: \`${codigo}\`\n\nApresente na entrada do evento.`
        });
        qrSucesso = qrRes.sucesso === true;
        logger.log('[TesteWebhook] QR Code resultado:', qrSucesso);

        await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
          qr_envio_status: qrSucesso ? 'enviado_com_sucesso' : 'falha_envio',
          qr_tentativas_envio: 1,
          qr_ultimo_envio_em: new Date().toISOString()
        }).catch(() => {});
      } catch (qrErr) {
        logger.log('[TesteWebhook] QR Code erro (não crítico):', qrErr.message);
      }
    }

    // Criar log
    const logCriado = await base44.asServiceRole.entities.M31MessageLog.create({
      inscricao_id: inscricao.id,
      inscricao_nome: inscricao.nome,
      telefone: phone,
      tipo: 'boas_vindas',
      stage: 'webhook_confirmacao',
      mensagem,
      sucesso,
      zapi_response: JSON.stringify(wpRes.uazapi_response || wpRes),
      erro: sucesso ? null : (wpRes.error || 'sem confirmação UAZAPI'),
      enviado_em: new Date().toISOString()
    });

    // Atualizar inscrição com resultado final
    if (sucesso) {
      await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
        data_envio_boas_vindas: new Date().toISOString(),
        status_envio_grupo: 'enviado',
        webhook_processando: false
      });
    } else {
      await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
        webhook_processando: false
      });
    }

    // Buscar estado final
    const inscricaoFinal = (await base44.asServiceRole.entities.EventoM31Inscricao.filter({ codigo_inscricao }))[0];
    const logsBoasVindas = await base44.asServiceRole.entities.M31MessageLog.filter({
      inscricao_id: inscricao.id,
      tipo: 'boas_vindas'
    });

    return Response.json({
      inscricao_id: inscricao.id,
      payment_id: paymentId,
      codigo_inscricao: codigo,
      nome_teste: inscricao.nome,
      status_antes: statusAntes,
      status_depois: inscricaoFinal?.status_pagamento,
      data_envio_boas_vindas_antes: boasVindasAntes || null,
      data_envio_boas_vindas_depois: inscricaoFinal?.data_envio_boas_vindas || null,
      whatsapp_sucesso: sucesso,
      whatsapp_messageId: wpRes.messageId,
      uazapi_response: wpRes.uazapi_response,
      qr_code_enviado: qrSucesso,
      log_id: logCriado?.id || null,
      total_logs_boas_vindas: logsBoasVindas.length,
      duplicidade_detectada: logsBoasVindas.length > 1,
      fluxo_completo_ok: sucesso && !!inscricaoFinal?.data_envio_boas_vindas && logsBoasVindas.length === 1,
    });

  } catch (error) {
    logger.error('[TesteWebhook] ERRO:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
