// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31LiberadorFilaConfirmacoes — LIBERADOR DE FILA (NÃO ENVIA, NÃO INVOCA)
 *
 * Papel ÚNICO: promover UMA inscrição elegível de liberada_para_envio=false→true
 * por execução, via updateMany CONDICIONAL. Essa mudança de estado aciona a
 * automação de entidade existente ("M31 — Despachar Confirmações (aprovado sem
 * boas-vindas)"), que passa o inscricao_id para m31DespacharConfirmacoes — o
 * ÚNICO responsável por enviar confirmação + QR.
 *
 * REGRAS DURAS:
 * - Esta função NUNCA envia mensagem e NUNCA chama m31DespacharConfirmacoes.
 * - Seleciona no máximo UMA inscrição por execução e encerra imediatamente.
 * - Sem loop, sem sleep interno, sem processamento em lote.
 * - Gotejamento (45-120s) é definido na ENTRADA da fila via liberada_para_envio_em
 *   (instante futuro). O liberador só promove quando esse horário já venceu.
 *
 * ELEGIBILIDADE:
 * - status_pagamento === 'aprovado'
 * - pagamento_confirmado_em válido e POSTERIOR ao go_live_corte_em
 * - WhatsApp válido (>= 10 dígitos)
 * - fluxo não concluído / sem resultado incerto:
 *     data_envio_boas_vindas vazio, webhook_processando != true,
 *     cadastro_pendente != true, liberada_para_envio != true
 * - sem legado nesta fila (apenas pós-corte, garantido pelo item do corte)
 *
 * TETO/HORÁRIO:
 * - 1 por ciclo; ciclo a cada 2 min (agendamento externo)
 * - máx 20 liberações por hora (janela deslizante em liberada_para_envio_em)
 * - janela operacional 08h-20h America/Recife (UTC-3)
 * - pausa global: modo_envio_boas_vindas 'pausado'/'fila' bloqueia
 */

const MAX_POR_HORA = 20;
const GOTEJAMENTO_MIN_MS = 45000;
const GOTEJAMENTO_MAX_MS = 120000;
const JANELA_INICIO_H = 8;  // 08h Recife
const JANELA_FIM_H = 20;    // 20h Recife (exclusive)

function horaRecife() {
  const agoraUtc = new Date();
  const recife = new Date(agoraUtc.getTime() - 3 * 60 * 60 * 1000);
  return recife.getUTCHours();
}

function telefoneValido(whatsapp) {
  const d = (whatsapp || '').replace(/\D/g, '');
  return d.length >= 10;
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // ── Pausa global ────────────────────────────────────────────────────
    const cfgs = await base44.asServiceRole.entities.EventoM31Config.list('-created_date', 1);
    const cfg = cfgs[0] || {};
    const modo = cfg.modo_envio_boas_vindas || 'pausado';
    if (modo === 'pausado' || modo === 'fila') {
      return Response.json({ skipped: true, reason: 'modo_bloqueado', modo });
    }

    // ── Janela operacional 08h-20h Recife ───────────────────────────────
    const h = horaRecife();
    if (h < JANELA_INICIO_H || h >= JANELA_FIM_H) {
      return Response.json({ skipped: true, reason: 'fora_da_janela_operacional', hora_recife: h });
    }

    // ── Corte de go-live (fail-closed) ──────────────────────────────────
    const goLiveCorte = cfg.go_live_corte_em || null;
    if (!goLiveCorte) {
      return Response.json({ skipped: true, reason: 'go_live_nao_configurado' });
    }

    const agora = new Date();
    const agoraISO = agora.toISOString();

    // ── Teto de 20/hora (janela deslizante) ─────────────────────────────
    // Conta liberações cujo liberada_para_envio_em caiu na última hora.
    const umaHoraAtras = new Date(agora.getTime() - 60 * 60 * 1000).toISOString();
    const liberadasRecentes = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
      { liberada_para_envio_em: { $gte: umaHoraAtras } }, '-liberada_para_envio_em', 50
    );
    if (liberadasRecentes.length >= MAX_POR_HORA) {
      return Response.json({ skipped: true, reason: 'teto_hora_atingido', liberadas_ultima_hora: liberadasRecentes.length, limite: MAX_POR_HORA });
    }

    // ── Gotejamento: só libera quem já tem horário vencido ──────────────
    // Se existe alguma inscrição com liberada_para_envio_em FUTURO já marcada
    // (aguardando o gotejamento), não marca outra agora — respeita o intervalo.
    const aguardandoGotejamento = liberadasRecentes.some(i =>
      i.liberada_para_envio !== true && i.liberada_para_envio_em && i.liberada_para_envio_em > agoraISO
    );
    if (aguardandoGotejamento) {
      return Response.json({ skipped: true, reason: 'gotejamento_em_andamento' });
    }

    // ── Selecionar candidatas aprovadas (sem boas-vindas, não liberadas) ─
    const aprovadas = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
      { status_pagamento: 'aprovado' }, '-pagamento_confirmado_em', 200
    );

    const elegivel = aprovadas.find((i) => {
      if (i.liberada_para_envio === true) return false;
      if (i.data_envio_boas_vindas) return false;
      if (i.webhook_processando === true) return false;
      if (i.cadastro_pendente === true) return false;
      if (!telefoneValido(i.whatsapp)) return false;
      const confirmadoEm = i.pagamento_confirmado_em;
      if (!confirmadoEm || confirmadoEm <= goLiveCorte) return false; // pós-corte estrito, sem legado
      return true;
    });

    if (!elegivel) {
      return Response.json({ success: true, liberadas: 0, reason: 'nenhuma_elegivel' });
    }

    // ── Entrada na fila: define horário de gotejamento futuro ────────────
    // A liberação efetiva (false→true) fica agendada para agora + [45s, 120s].
    // NÃO promovemos true imediatamente; marcamos apenas o horário de vencimento.
    // Na próxima execução (>= horário vencido) o updateMany condicional promove.
    const jitterMs = GOTEJAMENTO_MIN_MS + Math.floor(Math.random() * (GOTEJAMENTO_MAX_MS - GOTEJAMENTO_MIN_MS));
    const venceEm = new Date(agora.getTime() + jitterMs).toISOString();

    // Se ainda não tem horário de gotejamento marcado → marca e encerra (sem liberar)
    if (!elegivel.liberada_para_envio_em || elegivel.liberada_para_envio_em > agoraISO) {
      if (!elegivel.liberada_para_envio_em) {
        await base44.asServiceRole.entities.EventoM31Inscricao.update(elegivel.id, {
          liberada_para_envio_em: venceEm,
        });
        return Response.json({ success: true, liberadas: 0, reason: 'gotejamento_agendado',
          inscricao_id: elegivel.id, vence_em: venceEm });
      }
      // tem horário futuro ainda não vencido → aguarda
      return Response.json({ success: true, liberadas: 0, reason: 'aguardando_gotejamento',
        inscricao_id: elegivel.id, vence_em: elegivel.liberada_para_envio_em });
    }

    // ── Horário vencido → PROMOÇÃO CONDICIONAL false→true ────────────────
    // updateMany condicional: só promove se ainda estiver false (autoridade única).
    // Esta mudança dispara a automação de entidade, que invoca o despachador.
    const res = await base44.asServiceRole.entities.EventoM31Inscricao.updateMany(
      { id: elegivel.id, liberada_para_envio: false },
      { $set: { liberada_para_envio: true, liberada_para_envio_em: agoraISO } }
    );

    return Response.json({ success: true, liberadas: 1, inscricao_id: elegivel.id,
      nome: elegivel.nome, promovido_em: agoraISO, update_result: res });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
