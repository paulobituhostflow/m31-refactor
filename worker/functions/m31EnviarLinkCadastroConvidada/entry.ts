// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31EnviarLinkCadastroConvidada
 *
 * Envia à presenteada (inscrição gift já paga, mas com cadastro pendente) UM link
 * seguro para completar seus próprios dados. NÃO envia QR Code nem boas-vindas final.
 * NÃO preenche data_envio_boas_vindas — o link não é a boas-vindas.
 *
 * Fluxo:
 *  - valida que a inscrição é uma presenteada aprovada com cadastro pendente;
 *  - gera token aleatório seguro (uma única vez, idempotente);
 *  - monta a URL pública /completar-cadastro/{token};
 *  - dispara a mensagem do template 'convidada_completar_cadastro' via UAZAPI;
 *  - grava presenteado_token, presenteado_whatsapp_original e presenteado_link_enviado_em.
 *
 * O envio final (boas-vindas + QR) continua sendo responsabilidade EXCLUSIVA de
 * m31DespacharConfirmacoes, disparado após a presenteada concluir o cadastro.
 *
 * Payload: { inscricao_id: string, pagador_nome?: string }
 */

const BASE_URL = '__APP_ORIGIN__';

function normalizePhone(phone: string): string {
  let d = (phone || '').replace(/\D/g, '');
  while (d.startsWith('5555')) d = d.slice(2);
  if (d.startsWith('55') && d.length >= 12) return d;
  if (d.length >= 10) return `55${d}`;
  return d;
}

// ENFILEIRA APENAS — não chama UAZAPI diretamente.
// O envio real é exclusivo do m31DrenarFila.
async function sendTextUAZAPI(base44: any, phone: string, message: string) {
  const phoneSanitized = normalizePhone(phone);
  const dedupKey = `CONVIDADA_LINK:${phoneSanitized}:${Date.now()}:${crypto.randomUUID().slice(0, 8)}`;
  try {
    await base44.asServiceRole.entities.M31FilaMensagem.create({
      dedup_key: dedupKey,
      participante_id: phoneSanitized,
      telefone: phoneSanitized,
      automacao: 'OPERACIONAL',
      template: 'convidada_completar_cadastro',
      versao: 'V1',
      origem: 'm31EnviarLinkCadastroConvidada',
      mensagens: [{ message, image_url: null }],
      status: 'pendente',
      aprovado_para_envio: false,
      prioridade: 6,
    });
    return { sucesso: true, status: 200, body: 'enfileirado' };
  } catch (e: any) {
    return { sucesso: false, status: 500, body: e.message };
  }
}

function gerarToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function renderTemplate(base44: any, chave: string, vars: Record<string, string>, fallback: string): Promise<string> {
  try {
    const tpls = await base44.asServiceRole.entities.M31MessageTemplate.filter({ chave_unica: chave, is_active: true });
    let content = tpls && tpls.length > 0 ? (tpls[0].content || fallback) : fallback;
    for (const [k, v] of Object.entries(vars)) {
      content = content.replaceAll(`{{${k}}}`, v).replaceAll(`{${k}}`, v);
    }
    return content;
  } catch (_) {
    let content = fallback;
    for (const [k, v] of Object.entries(vars)) {
      content = content.replaceAll(`{{${k}}}`, v).replaceAll(`{${k}}`, v);
    }
    return content;
  }
}

async function buscarPagadorAsaas(asaasPaymentId: string): Promise<string | null> {
  if (!asaasPaymentId) return null;
  try {
    const ASAAS_KEY = config('ASAAS_API_KEY');
    const payResp = await fetch(`__ASAAS_API__/payments/${asaasPaymentId}`, {
      headers: { 'access_token': ASAAS_KEY }
    });
    const payment = await payResp.json();
    if (payment.customer) {
      const custResp = await fetch(`__ASAAS_API__/customers/${payment.customer}`, {
        headers: { 'access_token': ASAAS_KEY }
      });
      const customer = await custResp.json();
      return customer.name || null;
    }
  } catch (_) {}
  return null;
}

return (async (req: Request): Promise<Response> => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { inscricao_id, pagador_nome } = body;

    if (!inscricao_id) {
      return Response.json({ error: 'inscricao_id é obrigatório' }, { status: 400 });
    }

    const inscricoes = await base44.asServiceRole.entities.EventoM31Inscricao.filter({ id: inscricao_id });
    if (!inscricoes || inscricoes.length === 0) {
      return Response.json({ error: 'Inscrição não encontrada', inscricao_id }, { status: 404 });
    }
    const inscricao = inscricoes[0];

    // Só presenteadas aprovadas
    if (!inscricao.presenteado_por_id) {
      return Response.json({ error: 'nao_e_presenteada', inscricao_id }, { status: 400 });
    }
    if (!['aprovado', 'gratuito'].includes(inscricao.status_pagamento)) {
      return Response.json({ error: 'pagamento_nao_aprovado', status_pagamento: inscricao.status_pagamento }, { status: 400 });
    }

    const telefone = normalizePhone(inscricao.whatsapp);
    if (telefone.length < 10) {
      return Response.json({ error: 'telefone_invalido', telefone }, { status: 400 });
    }

    // Idempotência: se o link já foi enviado, não reenvia
    if (inscricao.presenteado_link_enviado_em && inscricao.presenteado_token) {
      return Response.json({ sucesso: true, ja_enviado: true, token: inscricao.presenteado_token });
    }

    // Gerar/reaproveitar token
    const token = inscricao.presenteado_token || gerarToken();
    const link = `${BASE_URL}/completar-cadastro/${token}`;

    // Determinar quem presenteou (opcional, apenas para a mensagem)
    let pagador = pagador_nome || null;
    if (!pagador) {
      const compradoras = await base44.asServiceRole.entities.EventoM31Inscricao.filter({ id: inscricao.presenteado_por_id });
      pagador = compradoras[0]?.nome || null;
      if (!pagador && compradoras[0]?.asaas_payment_id) {
        pagador = await buscarPagadorAsaas(compradoras[0].asaas_payment_id);
      }
    }

    const primeiroNome = (inscricao.nome || '').split(' ')[0] || 'Querida';
    const fallback = `Olá, ${primeiroNome}! 🌸\n\n` +
      (pagador ? `Você foi abençoada por *${pagador}* com uma inscrição no *M31 Filhas*! ` : `Você foi abençoada com uma inscrição no *M31 Filhas*! `) +
      `\n\n✅ *Sua inscrição já está paga.* Não há nada a pagar.\n\n` +
      `Falta só um passo: complete seus dados para garantir sua vaga e receber seu ingresso (QR Code).\n\n` +
      `👉 ${link}\n\n` +
      `Assim que você concluir, enviamos seu QR Code de entrada por aqui. Nos vemos no M31! 💛`;

    const mensagem = await renderTemplate(base44, 'convidada_completar_cadastro', {
      nome: primeiroNome,
      pagador: pagador || '',
      link,
    }, fallback);

    const res = await sendTextUAZAPI(base44, telefone, mensagem);

    // Persistir token + originais + timestamp do LINK (nunca data_envio_boas_vindas)
    // Nota: presenteado_link_enviado_em só é setado quando a mensagem é aceita pela fila,
    // NÃO quando é efetivamente enviada (isso exige aprovação + drenador).
    await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
      presenteado_token: token,
      presenteado_whatsapp_original: inscricao.presenteado_whatsapp_original || inscricao.whatsapp,
      cadastro_pendente: true,
      ...(res.sucesso ? { presenteado_link_enviado_em: new Date().toISOString(), last_contact_at: new Date().toISOString() } : {}),
    });

    // Log de mensagem (não é boas-vindas)
    try {
      await base44.asServiceRole.entities.M31MessageLog.create({
        inscricao_id: inscricao.id, inscricao_nome: inscricao.nome, telefone,
        tipo: 'manual', stage: 'convidada_completar_cadastro',
        mensagem, sucesso: res.sucesso,
        zapi_response: JSON.stringify(res), erro: res.sucesso ? null : (res.body || '').substring(0, 200),
        enviado_em: new Date().toISOString(),
      });
    } catch (_) {}

    return Response.json({
      sucesso: res.sucesso,
      inscricao: inscricao.nome,
      telefone,
      token,
      link,
      pagador: pagador || 'não identificado',
      uazapi: res,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
