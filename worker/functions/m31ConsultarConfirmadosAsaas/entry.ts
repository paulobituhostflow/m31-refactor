// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31ConsultarConfirmadosAsaas — SOMENTE LEITURA (nunca envia)
 *
 * Responde à pergunta: "Quem foi CONFIRMADO/PAGO nos últimos 7 dias (data REAL do Asaas)
 * e ainda não recebeu boas-vindas?".
 *
 * Existe porque o marcador de confirmação recente estava faltando:
 *   - updated_date é dead-end (poluído por updates em lote);
 *   - a timeline de pagamento_aprovado está vazia;
 *   - created_date é apenas a data da inscrição, não da confirmação.
 * A fonte de verdade é a DATA REAL de confirmação no Asaas
 * (confirmedDate || paymentDate || clientPaymentDate).
 *
 * Esta função NÃO envia nada e NÃO tem modo de envio. Ela apenas CONTA e LISTA.
 * O disparo real, quando aprovado, é feito pela função existente m31EnviarBoasVindas
 * (motor governado validado) — esta consulta só produz o número/lista para decisão.
 *
 * Filtros (todas obrigatórias):
 *   - status_pagamento ∈ { aprovado, gratuito }
 *   - data_envio_boas_vindas = null
 *   - status_envio_grupo != 'enviado'
 *   - confirmação (Asaas) dentro dos últimos 7 dias
 *   - SEM envio de boas-vindas em M31MessageLog (sucesso)
 *   - SEM envio de BOAS_VINDAS em M31AutomacaoLog (enviado)
 *
 * Uso:
 *   base44.functions.invoke('m31ConsultarConfirmadosAsaas', { dias: 7 })
 */

const STATUS_CONFIRMADOS_ASAAS = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'DUNNING_RECEIVED'];

function normalizePhone(phone) {
  let d = (phone || '').replace(/\D/g, '');
  while (d.startsWith('5555')) d = d.slice(2);
  if (d.startsWith('55') && d.length >= 12) return d;
  if (d.length >= 10) return `55${d}`;
  return d;
}

// Data ISO da confirmação real no Asaas, ou null se não confirmado/indisponível.
async function getDataConfirmacaoAsaas(asaasKey, paymentId) {
  try {
    const resp = await fetch(`__ASAAS_API__/payments/${paymentId}`, {
      headers: { 'access_token': asaasKey },
    });
    if (!resp.ok) return null;
    const p = await resp.json();
    if (!STATUS_CONFIRMADOS_ASAAS.includes(p.status)) return null;
    const dateStr = p.confirmedDate || p.paymentDate || p.clientPaymentDate;
    if (!dateStr) return null;
    return new Date(`${dateStr}T00:00:00Z`).toISOString();
  } catch (_) {
    return null;
  }
}

async function jaTemBoasVindas(base44, inscricaoId, telefone, cpfNorm) {
  // M31MessageLog (por id ou telefone)
  const porId = await base44.asServiceRole.entities.M31MessageLog.filter(
    { inscricao_id: inscricaoId, tipo: 'boas_vindas', sucesso: true }, '-enviado_em', 1);
  if (porId.length > 0) return { tem: true, fonte: 'M31MessageLog:id', quando: porId[0].enviado_em };
  const porTel = await base44.asServiceRole.entities.M31MessageLog.filter(
    { telefone, tipo: 'boas_vindas', sucesso: true }, '-enviado_em', 1);
  if (porTel.length > 0) return { tem: true, fonte: 'M31MessageLog:telefone', quando: porTel[0].enviado_em };

  // M31AutomacaoLog (por pessoa)
  const participanteId = cpfNorm || telefone;
  const porPessoa = await base44.asServiceRole.entities.M31AutomacaoLog.filter(
    { participante_id: participanteId, automacao: 'BOAS_VINDAS', status: 'enviado' }, '-enviado_em', 1);
  if (porPessoa.length > 0) return { tem: true, fonte: 'M31AutomacaoLog:pessoa', quando: porPessoa[0].enviado_em };

  return { tem: false };
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const dias = Number(body?.dias) > 0 ? Number(body.dias) : 7;

    const asaasKey = config('ASAAS_API_KEY');
    if (!asaasKey) {
      return Response.json({ error: 'ASAAS_API_KEY não configurada' }, { status: 500 });
    }

    const janelaCorte = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

    // Candidatas brutas: aprovadas/gratuitas, sem boas-vindas, com whatsapp
    const [aprovadas, gratuitas] = await Promise.all([
      base44.asServiceRole.entities.EventoM31Inscricao.filter({ status_pagamento: 'aprovado' }, '-created_date', 500),
      base44.asServiceRole.entities.EventoM31Inscricao.filter({ status_pagamento: 'gratuito' }, '-created_date', 200),
    ]);
    const brutas = [...aprovadas, ...gratuitas].filter((i) =>
      i.whatsapp &&
      !i.data_envio_boas_vindas &&
      i.status_envio_grupo !== 'enviado' &&
      i.entrou_no_grupo !== true &&
      !i.webhook_processando
    );

    const elegiveis = [];
    let foraJanela = 0;
    let jaComBoasVindas = 0;
    let semConfirmacaoAsaas = 0;

    for (const insc of brutas) {
      // 1. Data real de confirmação
      let dataConfirmacao = null;
      if (insc.asaas_payment_id) {
        dataConfirmacao = await getDataConfirmacaoAsaas(asaasKey, insc.asaas_payment_id);
      } else if (insc.status_pagamento === 'gratuito') {
        dataConfirmacao = insc.created_date; // gratuita sem Asaas: proxy pela criação
      }
      if (!dataConfirmacao) { semConfirmacaoAsaas++; continue; }
      if (dataConfirmacao < janelaCorte) { foraJanela++; continue; }

      // 2. Cruza M31MessageLog + M31AutomacaoLog
      const telNorm = normalizePhone(insc.whatsapp);
      const cpfNorm = (insc.cpf || '').replace(/\D/g, '');
      const jaTem = await jaTemBoasVindas(base44, insc.id, telNorm, cpfNorm);
      if (jaTem.tem) { jaComBoasVindas++; continue; }

      elegiveis.push({
        inscricao_id: insc.id,
        nome: insc.nome,
        whatsapp: telNorm,
        cpf: cpfNorm || null,
        status_pagamento: insc.status_pagamento,
        codigo_inscricao: insc.codigo_inscricao || null,
        confirmado_em: dataConfirmacao,
      });
    }

    // Ordena por data de confirmação (mais recente primeiro)
    elegiveis.sort((a, b) => (b.confirmado_em || '').localeCompare(a.confirmado_em || ''));

    return Response.json({
      somente_leitura: true,
      envio: false,
      janela_dias: dias,
      janela_corte: janelaCorte,
      candidatas_brutas: brutas.length,
      total_elegiveis: elegiveis.length,
      descartadas: {
        fora_da_janela: foraJanela,
        ja_com_boas_vindas: jaComBoasVindas,
        sem_confirmacao_asaas: semConfirmacaoAsaas,
      },
      elegiveis,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
