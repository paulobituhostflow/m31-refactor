// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31ReconciliarConfirmacoes30min — Safety net de reconciliação automática
 *
 * Roda a cada 30 minutos. Garante que nenhum pagamento confirmado no Asaas
 * permaneça sem aprovação ou sem mensagem de confirmação por mais de 30 min.
 *
 * Estratégia (DRY): consulta pagamentos confirmados recentes no Asaas, localiza
 * a inscrição correspondente e, se houver GAP (ainda não aprovado OU aprovado
 * sem boas-vindas há >30min) e sem item ativo na fila, cria um EVENTO SINTÉTICO
 * em M31AsaasWebhookEvento (status=recebido). O worker m31ProcessarWebhookAsaas
 * (a cada 5 min) processa o evento e executa o fluxo completo: aprovar, salvar
 * pagamento_confirmado_em, gerar QR, enfileirar CONFIRMACAO_COM_QR (prioridade 1).
 *
 * Idempotência: event_id único (recon30_<payment_id>_<ts>); worker tem dedup por
 * dedup_key e por log. Eventos para inscrições já processadas são inofensivos
 * (worker retorna ja_processado).
 */

const STATUS_CONFIRMADOS_AS = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'DUNNING_RECEIVED'];
const JANELA_MS = 30 * 60 * 1000;

async function fetchAsaas(url: string, options: any = {}, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err: any) {
    if (err?.name === 'AbortError') throw new Error(`Timeout Asaas: ${timeoutMs / 1000}s`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    try {
      const user = await base44.auth.me();
      if (user && user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    } catch { /* automação agendada */ }

    const S = base44.asServiceRole.entities;
    const ASAAS_KEY = config('ASAAS_API_KEY');
    if (!ASAAS_KEY) return Response.json({ error: 'ASAAS_API_KEY ausente' }, { status: 500 });

    // ── 1. Buscar pagamentos confirmados recentes no Asaas ──
    const candidatos: any[] = [];
    for (const st of STATUS_CONFIRMADOS_AS) {
      try {
        const resp = await fetchAsaas(
          `__ASAAS_API__/payments?status=${st}&limit=50&sortOrder=desc`,
          { headers: { access_token: ASAAS_KEY } }
        );
        const data = await resp.json();
        if (data?.data) candidatos.push(...data.data);
      } catch (e) {
        logger.error(`[Reconc30] Erro ao buscar status ${st}:`, e.message);
      }
    }
    // Dedup por payment.id
    const seen = new Set<string>();
    const unicos = candidatos.filter((p) => p.id && !seen.has(p.id) && seen.add(p.id));

    const agora = Date.now();
    const corte30 = new Date(agora - JANELA_MS);
    let sinteticos = 0, jaOk = 0, semInsc = 0;

    // ── 2. Para cada pagamento, verificar gap e criar evento sintético ──
    for (const pay of unicos.slice(0, 40)) {
      const ref = pay.externalReference || null;

      // Localizar inscrição (externalReference → payment_id → checkout_id)
      let insc: any = null;
      if (ref) {
        const ancor = /^(\d{11})-M31FILHAS$/.exec(ref);
        if (ancor) {
          const porCpf = await S.EventoM31Inscricao.filter({ cpf: ancor[1] }, '-created_date', 3);
          insc = porCpf[0] || null;
        } else {
          const porCod = await S.EventoM31Inscricao.filter({ codigo_inscricao: ref }, '-created_date', 1);
          insc = porCod[0] || null;
        }
      }
      if (!insc && pay.id) {
        const porPid = await S.EventoM31Inscricao.filter({ asaas_payment_id: pay.id }, '-created_date', 1);
        insc = porPid[0] || null;
      }
      if (!insc && pay.checkout) {
        const porChk = await S.EventoM31Inscricao.filter({ asaas_checkout_id: pay.checkout }, '-created_date', 1);
        insc = porChk[0] || null;
      }
      if (!insc) { semInsc++; continue; }

      // ── Avaliar GAP ──
      const aprovado = insc.status_pagamento === 'aprovado';
      const semBv = !insc.data_envio_boas_vindas && insc.estado_jornada !== 'jornada_concluida';
      const criadoHa = insc.created_date ? new Date(insc.created_date) : null;
      const confirmadoEm = insc.pagamento_confirmado_em ? new Date(insc.pagamento_confirmado_em) : null;
      const ha30min = (d: Date | null) => d && d < corte30;

      const gapAprovacao = !aprovado && ha30min(criadoEm);
      const gapMensagem = aprovado && semBv && (ha30min(confirmadoEm) || ha30min(criadoEm));

      if (!gapAprovacao && !gapMensagem) { jaOk++; continue; }

      // ── Verificar se já existe fila CONFIRMACAO_COM_QR ativa ──
      const dedupKey = `${insc.id}:CONFIRMACAO_COM_QR:V1`;
      const filaExiste = await S.M31FilaMensagem.filter({ dedup_key: dedupKey }, '-created_date', 5);
      const ativo = filaExiste.find((f: any) =>
        ['pendente', 'processando', 'enviado', 'incerto', 'falha_terminal'].includes(f.status));
      if (ativo) { jaOk++; continue; }

      // ── Criar evento sintético para o worker processar ──
      const eventId = `recon30_${pay.id}_${Date.now()}`;
      const payload = {
        id: eventId,
        event: 'PAYMENT_CONFIRMED',
        payment: {
          id: pay.id,
          externalReference: ref,
          customer: pay.customer || null,
          value: pay.value,
          billingType: pay.billingType,
          installmentCount: pay.installmentCount,
          installmentValue: pay.installmentValue,
          checkout: pay.checkout || null,
        },
      };
      try {
        await S.M31AsaasWebhookEvento.create({
          event_id: eventId,
          event_type: 'PAYMENT_CONFIRMED',
          payment_id: pay.id,
          external_reference: ref,
          payload_json: JSON.stringify(payload).substring(0, 50000),
          status: 'recebido',
          recebido_em: new Date().toISOString(),
          tentativas: 0,
          erro: `reconciliacao_30min_gap:${gapAprovacao ? 'sem_aprovacao' : 'sem_mensagem'}`,
        });
        sinteticos++;
      } catch (e: any) {
        // duplicate event_id — ignora (idempotente)
      }
    }

    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),
      janela_min: 30,
      pagamentos_verificados: unicos.length,
      sinteticos_criados: sinteticos,
      ja_ok: jaOk,
      sem_inscricao: semInsc,
      nota: 'Eventos sintéticos serão processados pelo worker m31ProcessarWebhookAsaas (5 min).',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
