// @ts-nocheck -- Ported Base44 domain flow with Worker runtime bindings.
import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
  const { client, config, fetch, logger } = context;
  const createClientFromRequest = (_req: Request) => client;
/**
 * m31EnviarLinkCadastroConvidada
 *
 * COMUNICAÇÃO INICIAL DA VAGA PRESENTEADA.
 *
 * Envia à beneficiária (inscrição gift já paga) a confirmação da sua vaga, o
 * nome de quem a abençoou e o link oficial do grupo — SEM depender do QR Code.
 * Inclui, como etapa separada, o link para completar os dados cadastrais.
 *
 * O QR Code continua sendo responsabilidade EXCLUSIVA de m31DespacharConfirmacoes,
 * disparado somente depois que a beneficiária conclui o cadastro.
 *
 * Governança: enfileira na M31FilaMensagem (aprovado_para_envio=true,
 * forcar_envio=true) — o envio real é exclusivo do m31DrenarFila. Idempotente
 * por dedup_key estável: reprocessar NÃO duplica a mensagem.
 *
 * Vínculo: aceita o vínculo reverso (presenteado_por_id) OU o direto (alguma
 * inscrição aponta presenteado_id para esta). Nunca associa por nome/telefone.
 *
 * Payload: { inscricao_id: string, pagador_nome?: string }
 */
// Current Base44 flow adapted to the Supabase + Worker runtime.
const BASE_URL = config('APP_ORIGIN') || '';

function normalizePhone(phone: string): string {
  let d = (phone || '').replace(/\D/g, '');
  while (d.startsWith('5555')) d = d.slice(2);
  if (d.startsWith('55') && d.length >= 12) return d;
  if (d.length >= 10) return `55${d}`;
  return d;
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

async function resolverLinkGrupo(base44: any): Promise<string> {
  try {
    const grupos = await base44.asServiceRole.entities.M31GrupoConfig.filter({ finalidade: 'INSCRITAS_OFICIAL', ativo: true });
    return grupos?.[0]?.invite_link || '';
  } catch (_) {
    return '';
  }
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

    // Vínculo: reverso (presenteado_por_id) ou direto (compradora aponta para cá).
    let compradorId: string | null = inscricao.presenteado_por_id || null;
    if (!compradorId) {
      const compradoras = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
        { presenteado_id: inscricao.id }, '-created_date', 1);
      if (compradoras.length > 0) {
        compradorId = compradoras[0].id;
        await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
          presenteado_por_id: compradorId,
        }).catch(() => {});
      }
    }
    if (!compradorId) {
      return Response.json({ error: 'nao_e_presenteada', inscricao_id }, { status: 400 });
    }
    if (!['aprovado', 'gratuito'].includes(inscricao.status_pagamento)) {
      return Response.json({ error: 'pagamento_nao_aprovado', status_pagamento: inscricao.status_pagamento }, { status: 400 });
    }

    const telefone = normalizePhone(inscricao.whatsapp);
    if (telefone.length < 10) {
      return Response.json({ error: 'telefone_invalido', telefone }, { status: 400 });
    }

    // Idempotência: dedup_key ESTÁVEL — reprocessar nunca duplica a mensagem.
    const dedupKey = `${inscricao.id}:CONFIRMACAO_PRESENTEADA:V1`;
    const existentes = await base44.asServiceRole.entities.M31FilaMensagem.filter(
      { dedup_key: dedupKey }, '-created_date', 5);
    const bloqueante = existentes.find((f: any) =>
      ['pendente', 'processando', 'enviado', 'incerto', 'falha_terminal'].includes(f.status));
    if (bloqueante) {
      return Response.json({ sucesso: true, ja_enviado: true, status: bloqueante.status, token: inscricao.presenteado_token });
    }

    const token = inscricao.presenteado_token || gerarToken();
    const link = `${BASE_URL}/completar-cadastro/${token}`;

    // Quem abençoou: sempre que possível identificado (a mensagem usa o nome).
    let pagador = pagador_nome || null;
    if (!pagador) {
      const compradoras = await base44.asServiceRole.entities.EventoM31Inscricao.filter({ id: compradorId });
      pagador = compradoras[0]?.nome || null;
      if (!pagador && compradoras[0]?.asaas_payment_id) {
        pagador = await buscarPagadorAsaas(compradoras[0].asaas_payment_id);
      }
    }

    const linkGrupo = await resolverLinkGrupo(base44);
    const primeiroNome = (inscricao.nome || '').split(' ')[0] || 'Querida';

    const fallback = `Olá, ${primeiroNome}! 🌸\n\n` +
      (pagador ? `Você foi abençoada por *${pagador}* com uma inscrição no *M31 Filhas*! ` : `Você foi abençoada com uma inscrição no *M31 Filhas*! `) +
      `\n\n✅ *Sua vaga já está garantida e paga.* Não há nada a pagar.\n\n` +
      (linkGrupo ? `👇 *Entre no grupo oficial da Imersão M31 Filhas:*\n${linkGrupo}\n\n` : '') +
      `📝 Falta só um passo: complete seus dados para receber seu ingresso (QR Code).\n👉 ${link}\n\n` +
      `Assim que você concluir, enviamos seu QR Code de entrada por aqui. Nos vemos no M31! 💛`;

    const mensagem = await renderTemplate(base44, 'convidada_vaga_confirmada', {
      nome: primeiroNome,
      pagador: pagador || '',
      link,
      link_grupo: linkGrupo,
    }, fallback);

    // ENFILEIRA APENAS — o envio real é exclusivo do m31DrenarFila.
    // Nova compra confirmada: envio AUTOMÁTICO (aprovado_para_envio=true).
    const execId = crypto.randomUUID();
    await base44.asServiceRole.entities.M31FilaMensagem.create({
      dedup_key: dedupKey,
      participante_id: telefone,
      telefone,
      automacao: 'CONFIRMACAO_PRESENTEADA',
      template: 'convidada_vaga_confirmada',
      versao: 'V1',
      origem: 'm31EnviarLinkCadastroConvidada',
      inscricao_id: inscricao.id,
      inscricao_nome: inscricao.nome || null,
      mensagens: [{ message: mensagem, image_url: null }],
      status: 'pendente',
      aprovado_para_envio: true,
      aprovado_por: 'auto_gov_presenteada',
      aprovado_em: new Date().toISOString(),
      prioridade: 1,
      forcar_envio: true,
      execution_id: execId,
    });

    await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
      presenteado_token: token,
      presenteado_whatsapp_original: inscricao.presenteado_whatsapp_original || inscricao.whatsapp,
      cadastro_pendente: true,
      presenteado_link_enviado_em: new Date().toISOString(),
      last_contact_at: new Date().toISOString(),
    });

    // Registro separado de estado: ENFILEIRADA. Os desfechos reais (enviada /
    // falhou / pendente) são gravados pelo m31DrenarFila, único sender.
    // "Entregue" não é registrado: o provedor não fornece confirmação de entrega.
    await base44.asServiceRole.entities.M31InscricaoTimeline.create({
      inscricao_id: inscricao.id,
      evento: 'presenteada_comunicacao_enfileirada',
      etapa: 'comunicacao_presenteada',
      status: 'pendente',
      detalhe: `fila=${dedupKey} | grupo=${linkGrupo ? 'com_link' : 'sem_link'} | qr=pendente`,
      origem: 'm31EnviarLinkCadastroConvidada',
    }).catch(() => {});

    try {
      await base44.asServiceRole.entities.M31MessageLog.create({
        inscricao_id: inscricao.id, inscricao_nome: inscricao.nome, telefone,
        tipo: 'manual', stage: 'convidada_vaga_confirmada',
        mensagem, sucesso: true,
        zapi_response: JSON.stringify({ enfileirado: true, dedup_key: dedupKey }),
        erro: null,
        enviado_em: new Date().toISOString(),
      });
    } catch (_) {}

    return Response.json({
      sucesso: true,
      enfileirado: true,
      inscricao: inscricao.nome,
      telefone,
      token,
      link,
      link_grupo: linkGrupo || null,
      pagador: pagador || 'não identificado',
      dedup_key: dedupKey,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
