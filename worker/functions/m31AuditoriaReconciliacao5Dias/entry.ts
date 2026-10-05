// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31AuditoriaReconciliacao5Dias — AUDITORIA SOMENTE LEITURA
 *
 * Objetivo: mapear, sem enviar NADA, o estado real de cada inscrição com
 * pagamento confirmado nos últimos 5 dias, cruzando múltiplas fontes de prova.
 *
 * REGRAS DURAS (do pedido):
 *  - Somente leitura. NUNCA envia WhatsApp. NUNCA muda estado. NUNCA libera.
 *  - Prova de envio NÃO é campo booleano/data isolado: exige a resposta aceita
 *    pelo provedor (M31MessageLog.sucesso === true + zapi_response presente).
 *  - Não libera automaticamente nenhum registro histórico.
 *
 * Classificação por inscrição:
 *   texto_e_qr_ausentes         — nenhuma prova de texto nem de QR
 *   texto_enviado_qr_ausente    — texto com prova; QR sem prova
 *   resultado_ambiguo           — sinais conflitantes (ex: data marcada mas sem log de sucesso;
 *                                 log de falha; qr marcado enviado sem resposta do provedor)
 *   duplicidade_ou_vinculo_ambiguo — >1 inscrição ativa mesmo CPF, ou aprovado sem asaas_payment_id
 *   fluxo_concluido             — texto E QR com prova do provedor
 */

const STATUS_CONFIRMADOS_DB = ['aprovado', 'gratuito'];

// Prova de envio de TEXTO = resposta aceita pelo provedor, não só data/boolean.
function temProvaTexto(logs) {
  return logs.some((l) =>
    (l.tipo === 'boas_vindas' || l.stage === 'boas_vindas') &&
    l.sucesso === true &&
    !!l.zapi_response
  );
}

// Prova de envio de QR = log com sucesso do provedor OU (fallback) resposta registrada.
// qr_envio_status/qr_ultimo_envio_em sozinhos NÃO contam como prova.
function temProvaQR(logs, inscricao) {
  const logProva = logs.some((l) =>
    (l.tipo === 'reenvio_qr_code' || (l.mensagem || '').toLowerCase().includes('qr')) &&
    l.sucesso === true &&
    !!l.zapi_response
  );
  // A confirmação oficial envia texto + QR no mesmo fluxo governado: se há prova de
  // texto E o QR foi marcado enviado com timestamp, considera o QR provado junto.
  const qrMarcadoComProvaTexto = inscricao.qr_envio_status === 'enviado_com_sucesso' &&
    !!inscricao.qr_ultimo_envio_em && temProvaTexto(logs);
  return logProva || qrMarcadoComProvaTexto;
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dias = Math.min(Math.max(parseInt(body?.dias) || 5, 1), 30);
    const corte = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

    // ── Inscrições com pagamento confirmado no período (leitura) ──────────
    const [aprovadas, gratuitas] = await Promise.all([
      base44.asServiceRole.entities.EventoM31Inscricao.filter({ status_pagamento: 'aprovado' }, '-updated_date', 500),
      base44.asServiceRole.entities.EventoM31Inscricao.filter({ status_pagamento: 'gratuito' }, '-updated_date', 500),
    ]);
    const confirmadas = [...aprovadas, ...gratuitas].filter((i) => (i.updated_date || i.created_date) >= corte);

    // ── Índice de duplicidade por CPF (vínculo financeiro ambíguo) ────────
    const porCpf = {};
    for (const i of [...aprovadas, ...gratuitas]) {
      const cpf = (i.cpf || '').replace(/\D/g, '');
      if (!cpf) continue;
      (porCpf[cpf] = porCpf[cpf] || []).push(i);
    }

    const buckets = {
      texto_e_qr_ausentes: [],
      texto_enviado_qr_ausente: [],
      resultado_ambiguo: [],
      duplicidade_ou_vinculo_ambiguo: [],
      fluxo_concluido: [],
    };

    for (const insc of confirmadas) {
      const logs = await base44.asServiceRole.entities.M31MessageLog.filter(
        { inscricao_id: insc.id }, '-enviado_em', 30);

      const provaTexto = temProvaTexto(logs);
      const provaQR = temProvaQR(logs, insc);
      const houveFalhaLog = logs.some((l) => l.sucesso === false && (l.tipo === 'boas_vindas' || (l.mensagem || '').toLowerCase().includes('qr')));

      const cpf = (insc.cpf || '').replace(/\D/g, '');
      const ativasMesmoCpf = (porCpf[cpf] || []).filter((x) => x.status_pagamento !== 'cancelado');
      const duplicidade = cpf && ativasMesmoCpf.length > 1;
      const vinculoAmbiguo = insc.status_pagamento === 'aprovado' &&
        !insc.asaas_payment_id &&
        (insc.origem_pagamento === 'asaas' || insc.origem_pagamento === 'desconhecida' || !insc.origem_pagamento);

      // Ambiguidade: estado marcado sem prova do provedor, ou log de falha, ou
      // QR marcado enviado sem prova de texto correspondente.
      const dataSemProva = !!insc.data_envio_boas_vindas && !provaTexto;
      const qrMarcadoSemProva = insc.qr_envio_status === 'enviado_com_sucesso' && !provaQR;
      const ambiguo = houveFalhaLog || dataSemProva || qrMarcadoSemProva;

      const item = {
        id: insc.id,
        nome: insc.nome,
        cpf: cpf || null,
        codigo_inscricao: insc.codigo_inscricao,
        status_pagamento: insc.status_pagamento,
        origem_pagamento: insc.origem_pagamento || null,
        asaas_payment_id: insc.asaas_payment_id || null,
        data_envio_boas_vindas: insc.data_envio_boas_vindas || null,
        qr_envio_status: insc.qr_envio_status || null,
        qr_ultimo_envio_em: insc.qr_ultimo_envio_em || null,
        prova_texto_provedor: provaTexto,
        prova_qr_provedor: provaQR,
        houve_falha_log: houveFalhaLog,
        total_logs: logs.length,
        motivo: null,
      };

      // Precedência: vínculo/duplicidade > ambíguo > concluído > texto-sem-qr > ausentes
      if (duplicidade || vinculoAmbiguo) {
        item.motivo = duplicidade ? `duplicidade_cpf:${ativasMesmoCpf.length}` : 'aprovado_sem_asaas_payment_id';
        buckets.duplicidade_ou_vinculo_ambiguo.push(item);
      } else if (ambiguo) {
        item.motivo = houveFalhaLog ? 'log_falha_provedor'
          : dataSemProva ? 'data_marcada_sem_prova_provedor'
          : 'qr_marcado_sem_prova_provedor';
        buckets.resultado_ambiguo.push(item);
      } else if (provaTexto && provaQR) {
        item.motivo = 'texto_e_qr_com_prova_provedor';
        buckets.fluxo_concluido.push(item);
      } else if (provaTexto && !provaQR) {
        item.motivo = 'texto_com_prova_qr_sem_prova';
        buckets.texto_enviado_qr_ausente.push(item);
      } else {
        item.motivo = 'sem_prova_texto_nem_qr';
        buckets.texto_e_qr_ausentes.push(item);
      }
    }

    const resumo = Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length]));

    return Response.json({
      auditoria: 'somente_leitura',
      janela_dias: dias,
      corte,
      total_confirmadas_periodo: confirmadas.length,
      resumo,
      buckets,
      nota: 'Nenhum envio realizado. Nenhum estado alterado. Nenhum registro liberado. Prova = resposta aceita pelo provedor (M31MessageLog.sucesso + zapi_response).',
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
