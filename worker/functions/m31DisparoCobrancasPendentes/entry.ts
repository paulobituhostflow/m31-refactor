// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

const LINK_GRUPO = '__WHATSAPP_GROUP_INVITE__';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const dryRun = body.dry_run === true;

    // Buscar pendentes no Asaas
    const apiKey = config('ASAAS_API_KEY');
    const res = await fetch('__ASAAS_API__/payments?status=PENDING&dateCreated[ge]=2026-05-28&limit=100', {
      headers: { 'access_token': apiKey, 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    const codigosAsaas = (data.data || []).map(p => ({
      codigo: p.externalReference,
      invoiceUrl: p.invoiceUrl,
      dueDate: p.dueDate
    }));

    // Buscar inscrições
    const codigos = codigosAsaas.map(p => p.codigo);
    const inscricoes = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
      {}, '', 500
    );
    const pendentes = inscricoes.filter(i => codigos.includes(i.codigo_inscricao));

    // Verificar quais JÁ receberam cobrança por telefone
    const logs = await base44.asServiceRole.entities.M31MessageLog.filter(
      { tipo: 'cobranca' }, '-enviado_em', 200
    );
    const telefonesEnviados = new Set(logs.filter(l => l.sucesso).map(l => l.telefone));
    const idsEnviados = new Set(logs.filter(l => l.sucesso).map(l => l.inscricao_id));
    const aEnviar = pendentes.filter(i => {
      const tel = i.whatsapp?.replace(/\D/g, '');
      return !idsEnviados.has(i.id) && !telefonesEnviados.has(tel);
    });

    if (dryRun) {
      return Response.json({ dry_run: true, total_a_enviar: aEnviar.length, lista: aEnviar.map(i => ({ nome: i.nome, whatsapp: i.whatsapp, codigo: i.codigo_inscricao })) });
    }

    const enviados = [];
    const falhas = [];

    for (let i = 0; i < aEnviar.length; i++) {
      const insc = aEnviar[i];
      const telefone = insc.whatsapp?.replace(/\D/g, '');
      const nome = insc.nome?.split(' ')[0] || 'Querida';

      // Pegar URL do pagamento do Asaas
      const asaasInfo = codigosAsaas.find(p => p.codigo === insc.codigo_inscricao);
      const linkPagamento = asaasInfo?.invoiceUrl || insc.asaas_charge_url || '';
      const vencimento = asaasInfo?.dueDate || '';

      const mensagem =
        `⚠️ *Olá, ${nome}!*\n\n` +
        `Notamos que sua inscrição no *M31 Filhas* está aguardando o pagamento.\n\n` +
        `Não queremos que você perca sua vaga! 🌸\n\n` +
        `👉 *Seu link de pagamento:*\n${linkPagamento}\n\n` +
        (vencimento ? `📅 *Vencimento:* ${vencimento.split('-').reverse().join('/')}\n\n` : '') +
        `Após o pagamento confirmado, você receberá automaticamente:\n` +
        `✅ Confirmação de inscrição\n` +
        `🔗 Link do grupo WhatsApp\n` +
        `🔲 QR Code para check-in\n\n` +
        `Qualquer dúvida, estamos aqui! 💜`;

      let sucesso = false;
      let zapiRes = null;
      let erroMsg = null;

      try {
        const wpRes = await base44.asServiceRole.functions.invoke('m31SendWhatsApp', { phone: telefone, message: mensagem });
        zapiRes = wpRes.uazapi_response || wpRes;
        sucesso = wpRes.sucesso === true;

        if (sucesso) {
          enviados.push({ nome: insc.nome, telefone, codigo: insc.codigo_inscricao });
        } else {
          erroMsg = zapiRes?.error || 'Sem confirmação UAZAPI';
          falhas.push({ nome: insc.nome, erro: erroMsg });
        }
      } catch (e) {
        erroMsg = e.message;
        falhas.push({ nome: insc.nome, erro: erroMsg });
      }

      // Registrar log
      await base44.asServiceRole.entities.M31MessageLog.create({
        inscricao_id: insc.id,
        inscricao_nome: insc.nome,
        telefone,
        tipo: 'cobranca',
        stage: 'd0',
        mensagem,
        sucesso,
        zapi_response: zapiRes ? JSON.stringify(zapiRes) : null,
        erro: erroMsg,
        enviado_em: new Date().toISOString()
      });

      // Delay curto entre envios: 8–15s
      if (i < aEnviar.length - 1) {
        await sleep(8000 + Math.random() * 7000);
      }
    }

    return Response.json({
      success: true,
      total_processadas: aEnviar.length,
      enviados: enviados.length,
      falhas: falhas.length,
      enviados_lista: enviados,
      falhas_lista: falhas
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
