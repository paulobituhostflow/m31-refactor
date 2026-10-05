// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31RetomarPagamento — Link ESTÁVEL de "Retomar pagamento" (público).
 *
 * O link enviado pelo WhatsApp NÃO expira — aponta para a página
 * /retomar-pagamento/:codigo (este backend). Ao ser acessado, identifica a
 * inscrição pelo codigo_inscricao e, se o pagamento ainda estiver pendente,
 * CRIA ou REUTILIZA um checkout Asaas válido naquele momento, então retorna
 * a URL para redirecionamento. Somente o checkout Asaas gerado ao clicar
 * possui validade (24h).
 *
 * Payload (individual): { codigo?: string, inscricao_id?: string, forcar_novo?: boolean }
 * Payload (lote):       { inscricoes_ids: string[], forcar_novo?: boolean }
 *   - inscricoes_ids: renova cada inscrição da lista em sequência (espaçamento
 *     de 1.2s entre criações no Asaas para evitar rate-limit). Retorna sumário.
 *   - forcar_novo: no lote, default true (forçar renovação de links expirados).
 *
 * Regras de renovação:
 *   - Caravana → R$97 fixo (não copia valor antigo incorreto).
 *   - Demais tipos → valor do lote da inscrição (fonte de verdade).
 *   - Exceção de 2º lote ativa → valor da exceção (R$129).
 *   - NUNCA toca em pagamentos já confirmados (aprovado/gratuito).
 *   - NUNCA renova inscrições canceladas.
 *   - Mantém inscrição ativa e pendente (checkout_pendente).
 *   - Registra substituição na Timeline; NÃO envia o novo link (sem WhatsApp).
 *
 * Público: NÃO exige auth (acessado por participante via link do WhatsApp).
 * Segurança: o codigo_inscricao é aleatório (7 chars base36 ≈ 78B combinações);
 * o endpoint só retorna uma URL de checkout — não expõe PII. Lock anti-abuso
 * de 30s por inscrição impede enumeração/geração em massa.
 */

const ASAAS_BASE = '__ASAAS_API__';
const LOTE_EXCECAO_CODIGO = 'lote_2';
const LOCK_TTL_MS = 30 * 1000;
const CHECKOUT_EXPIRA_MIN = 1440; // 24h — só o checkout Asaas expira, nunca o link M31

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

/**
 * Renova (ou reutiliza) o checkout de UMA inscrição. Núcleo compartilhado
 * entre o modo individual e o modo lote. NÃO envia WhatsApp.
 */
async function renovarInscricao(S: any, base44: any, opts: { codigo?: string; inscricaoId?: string; forcarNovo?: boolean }) {
  const codigo = (opts.codigo || '').trim();
  const inscricaoId = (opts.inscricaoId || '').trim();
  const forcarNovo = opts.forcarNovo === true;

  if (!codigo && !inscricaoId) return { error: 'código ou inscricao_id é obrigatório' };

  // ── Lock anti-abuso: 1 geração por inscrição a cada 30s ──
  const lockChave = `RETOMAR:${codigo || inscricaoId}`;
  const agora = new Date();
  const locks = await S.M31AutomacaoLock.filter({ chave: lockChave, ativo: true }).catch(() => []);
  const lockVivo = locks.find((l: any) => l.expira_em && new Date(l.expira_em) > agora);
  if (lockVivo && !forcarNovo) {
    return { error: 'aguarde_alguns_segundos', detalhe: 'Aguarde 30s antes de gerar um novo link.' };
  }
  await S.M31AutomacaoLock.updateMany({ chave: lockChave, ativo: true }, { $set: { ativo: false } }).catch(() => {});
  await S.M31AutomacaoLock.create({
    chave: lockChave, ativo: true, execution_id: crypto.randomUUID(),
    criado_em: agora.toISOString(), expira_em: new Date(agora.getTime() + LOCK_TTL_MS).toISOString(),
  }).catch(() => {});

  // ── 1. Localizar inscrição (por codigo_inscricao OU inscricao_id) ──
  let insc: any = null;
  if (inscricaoId) {
    insc = await S.EventoM31Inscricao.get(inscricaoId).catch(() => null);
  } else {
    const inscs = await S.EventoM31Inscricao.filter({ codigo_inscricao: codigo });
    insc = inscs?.[0] || null;
  }
  if (!insc) return { error: 'nao_encontrado', detalhe: 'Inscrição não encontrada.' };

  if (insc.opt_out === true) return { error: 'opt_out', detalhe: 'Inscrição optou por não receber comunicações.' };
  if (['aprovado', 'gratuito'].includes(insc.status_pagamento)) return { ja_pago: true, link: null, nome: insc.nome, inscricao_id: insc.id };
  // Não tocar em inscrições canceladas — somente pendentes/expiradas são renováveis.
  if (insc.status_pagamento === 'cancelado') return { error: 'inscricao_cancelada', detalhe: 'Inscrição cancelada — não renovável.', inscricao_id: insc.id };

  // ── 2. Determinar valor ──
  const lotes = await S.EventoM31Lote.list('-ordem', 10);
  const loteExcecao = lotes.find((l: any) => l.codigo === LOTE_EXCECAO_CODIGO);
  const loteAtivo = lotes.find((l: any) => l.ativo === true) || lotes[0];
  const loteInsc = insc.lote ? lotes.find((l: any) => l.codigo === insc.lote) : null;

  const excecaoAtiva = !!(insc.excecao_2lote_expira_em && new Date(insc.excecao_2lote_expira_em) > agora);
  let valor: number;
  if (excecaoAtiva && loteExcecao) {
    valor = loteExcecao.valor; // preserva exceção de goodwill (R$129)
  } else if (insc.tipo === 'caravana') {
    valor = 97; // Caravana: preço fixo de renovação (R$97). Não copia valor antigo incorreto.
  } else if (loteInsc) {
    valor = loteInsc.valor; // preserva valor do LOTE da inscrição (fonte de verdade, não valor_pago)
  } else {
    valor = loteAtivo?.valor || 0;
  }

  const ASAAS_KEY = config('ASAAS_API_KEY');
  if (!ASAAS_KEY) return { error: 'ASAAS_API_KEY ausente' };

  // ── 3. Consultar checkout antigo (sempre — auditoria de expiração) ──
  let antigoStatus: string | null = null;
  const antigoCheckoutId: string | null = insc.asaas_checkout_id || null;
  if (antigoCheckoutId) {
    try {
      const respOld = await fetchAsaas(`${ASAAS_BASE}/checkouts/${antigoCheckoutId}`, { headers: { access_token: ASAAS_KEY } });
      if (respOld.status === 200) {
        const chOld = await respOld.json();
        antigoStatus = chOld.status; // ACTIVE | EXPIRED | CANCELED | PAID
        // Reutiliza apenas se !forcarNovo E ACTIVE E valor compatível
        if (!forcarNovo && chOld.status === 'ACTIVE' && chOld.link) {
          const valorCompativel = insc.valor_pago == null || insc.valor_pago === valor;
          if (valorCompativel) {
            await S.EventoM31Inscricao.update(insc.id, {
              asaas_charge_url: chOld.link, asaas_checkout_status: 'ACTIVE',
              status_pagamento: 'checkout_pendente', checkout_abandoned_at: null,
            }).catch(() => {});
            await S.M31InscricaoTimeline.create({
              inscricao_id: insc.id, cpf: insc.cpf || null,
              evento: 'retomar_pagamento_checkout_reutilizado', etapa: 'retomar_pagamento',
              status: 'sucesso',
              detalhe: `Link estável acessado — checkout ACTIVE reutilizado. valor=R$${valor} | excecao_ativa=${excecaoAtiva} | checkout_id=${antigoCheckoutId}`,
              origem: 'm31RetomarPagamento',
            }).catch(() => {});
            return { link: chOld.link, valor, ja_pago: false, reutilizado: true, checkout_id: antigoCheckoutId, antigo_checkout_id: antigoCheckoutId, antigo_checkout_status: antigoStatus, nome: insc.nome, inscricao_id: insc.id, tipo: insc.tipo, lote: insc.lote };
          }
        }
      } else if (respOld.status === 404) {
        antigoStatus = 'NAO_ENCONTRADO';
      }
    } catch { antigoStatus = 'ERRO_CONSULTA'; }
  }

  // ── 4. Criar novo checkout Asaas ──
  const payload: any = {
    billingTypes: ['PIX', 'CREDIT_CARD'],
    chargeTypes: ['DETACHED', 'INSTALLMENT'],
    installment: { maxInstallmentCount: 2 },
    minutesToExpire: CHECKOUT_EXPIRA_MIN,
    externalReference: insc.codigo_inscricao || codigo || `M31-RET-${insc.id.slice(-10).toUpperCase()}`,
    callback: {
      successUrl: '__APP_ORIGIN__/obrigado',
      cancelUrl: '__APP_ORIGIN__/m31-inscricao',
      expiredUrl: '__APP_ORIGIN__/m31-inscricao',
    },
    // NÃO enviamos customer — Asaas coleta na página nativa (enviar causa rejeição).
    items: [{
      name: 'M31 Filhas - Inscricao', // <=30 chars (requisito Asaas)
      description: `M31 Filhas - ${insc.nome || 'Participante'}${excecaoAtiva ? ' - excecao 2 lote' : ''}`,
      value: valor,
      quantity: 1,
    }],
  };

  const resp = await fetchAsaas(`${ASAAS_BASE}/checkouts`, {
    method: 'POST',
    headers: { access_token: ASAAS_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const checkout = await resp.json();
  if (!checkout.link) {
    return { error: 'Erro ao criar checkout no Asaas', details: checkout, inscricao_id: insc.id, nome: insc.nome };
  }

  // ── 5. Atualizar inscrição (link antigo invalidado por sobrescrita) ──
  await S.EventoM31Inscricao.update(insc.id, {
    asaas_charge_url: checkout.link,
    asaas_checkout_id: checkout.id,
    asaas_checkout_status: checkout.status || 'ACTIVE',
    status_pagamento: 'checkout_pendente',
    valor_pago: valor,
    checkout_abandoned_at: null,
  }).catch(() => {});

  await S.M31InscricaoTimeline.create({
    inscricao_id: insc.id, cpf: insc.cpf || null,
    evento: 'retomar_pagamento_checkout_gerado', etapa: 'retomar_pagamento',
    status: 'sucesso',
    detalhe: `Link estável acessado — novo checkout gerado (substituindo antigo ${antigoCheckoutId} status=${antigoStatus}). valor=R$${valor} | excecao_ativa=${excecaoAtiva} | forcar_novo=${forcarNovo} | novo_checkout_id=${checkout.id} | expira_em=${CHECKOUT_EXPIRA_MIN}min`,
    origem: 'm31RetomarPagamento',
  }).catch(() => {});

  return {
    link: checkout.link, valor, ja_pago: false, reutilizado: false,
    checkout_id: checkout.id, antigo_checkout_id: antigoCheckoutId, antigo_checkout_status: antigoStatus,
    nome: insc.nome, inscricao_id: insc.id, tipo: insc.tipo, lote: insc.lote, codigo,
  };
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const S = base44.asServiceRole.entities;
    const body = await req.json().catch(() => ({}));

    // ── MODO LOTE: renovar várias inscrições em sequência ──
    if (Array.isArray(body?.inscricoes_ids) && body.inscricoes_ids.length > 0) {
      const forcarNovo = body.forcar_novo !== false; // default true no lote (renovar expirados)
      const resultados: any[] = [];
      for (const id of body.inscricoes_ids) {
        try {
          const r = await renovarInscricao(S, base44, { inscricaoId: id, forcarNovo });
          resultados.push(r);
        } catch (e: any) {
          resultados.push({ inscricao_id: id, erro: e.message });
        }
        // Espaçamento entre criações no Asaas (evita rate-limit)
        await new Promise((r) => setTimeout(r, 600));
      }
      const renovados = resultados.filter((r) => r.link).length;
      const reutilizados = resultados.filter((r) => r.reutilizado === true).length;
      const jaPagos = resultados.filter((r) => r.ja_pago === true).length;
      const erros = resultados.filter((r) => r.erro || r.error).length;
      return Response.json({
        success: true, batch: true, total: body.inscricoes_ids.length,
        renovados, reutilizados, ja_pagos: jaPagos, erros,
        resultados,
      });
    }

    // ── MODO INDIVIDUAL ──
    const codigo = (body?.codigo || new URL(req.url).searchParams.get('codigo') || '').trim();
    const inscricaoId = (body?.inscricao_id || '').trim();
    const forcarNovo = body?.forcar_novo === true;
    if (!codigo && !inscricaoId) return Response.json({ error: 'código ou inscricao_id é obrigatório' }, { status: 400 });
    const resultado = await renovarInscricao(S, base44, { codigo, inscricaoId, forcarNovo });
    return Response.json(resultado, resultado?.error ? { status: 400 } : { status: 200 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
