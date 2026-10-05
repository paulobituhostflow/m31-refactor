// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31GerarLinkExcecao2Lote — Exceção de goodwill para casos afetados pela
 * inconsistência do sistema (incidente pay_by539 — 118 inscrições).
 *
 * Para cada caso afetado nas últimas 72h (identificado pela timeline
 * 'correcao_pay_by539_aplicada'), gera um NOVO checkout no Asaas com:
 *   - valor do 2º lote (R$129)
 *   - expiração de 24h (minutesToExpire=1440)
 *   - externalReference = codigo_inscricao (âncora estrita)
 *
 * Processa em BLOCOS de 10 por execução (max_inscricoes=10). A automação
 * agendada (a cada 15 min) chama esta função, processando 10 casos por vez
 * com espaçamento temporal para evitar disparo em massa. O dedup
 * (excecao_2lote_expira_em setado) impede reprocessamento.
 *
 * Garantias:
 *   - NÃO cria inscrição duplicada (atualiza a existente; dedup_key unique)
 *   - NÃO gera cobrança para quem já pagou (consulta Asaas por externalReference
 *     e por checkout_id; se confirmado → skip + log)
 *   - UMA mensagem por participante (dedup_key na M31FilaMensagem)
 *   - Histórico/motivo registrados na M31InscricaoTimeline
 *   - valor_pago setado para 129 durante a exceção; reverte automaticamente
 *     para o lote ativo (139) após 24h via m31ReverterExcecao2Lote
 *
 * Payload: { dry_run?: boolean, inscricao_id?: string, max_inscricoes?: number }
 *   - dry_run (default true): classifica sem gerar/enviar
 *   - inscricao_id: processa apenas uma inscrição (caso Sandra)
 *   - max_inscricoes: teto do batch (default 10)
 */

const EXCECAO_JANELA_H = 24;
const LOTE_EXCECAO_CODIGO = 'lote_2';
const STATUS_ALVO = ['checkout_pendente', 'checkout_abandonado', 'pendente'];
const STATUS_CONFIRMADO_AS = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'DUNNING_RECEIVED'];

function normalizePhone(phone: string): string {
  let d = (phone || '').replace(/\D/g, '');
  while (d.startsWith('5555')) d = d.slice(2);
  if (d.startsWith('55') && d.length >= 12) return d;
  if (d.length >= 10) return `55${d}`;
  return d;
}

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

/** Verifica no Asaas se a inscrição JÁ FOI PAGA (âncora externalReference). */
async function jaPagouNoAsaas(codigoInscricao: string, checkoutId: string | null, ASAAS_KEY: string): Promise<{ pago: boolean; payment_id?: string; status?: string }> {
  if (codigoInscricao) {
    try {
      const resp = await fetchAsaas(`__ASAAS_API__/payments?externalReference=${encodeURIComponent(codigoInscricao)}&limit=5`, { headers: { 'access_token': ASAAS_KEY } });
      const data = await resp.json();
      const confirmada = (data?.data || []).find((p: any) => STATUS_CONFIRMADO_AS.includes(p.status));
      if (confirmada) return { pago: true, payment_id: confirmada.id, status: confirmada.status };
    } catch {}
  }
  if (checkoutId) {
    try {
      const resp = await fetchAsaas(`__ASAAS_API__/checkouts/${checkoutId}`, { headers: { 'access_token': ASAAS_KEY } });
      if (resp.status === 200) {
        const checkout = await resp.json();
        if (checkout.status === 'PAID') return { pago: true, status: 'PAID' };
      }
    } catch {}
  }
  return { pago: false };
}

/** Gera novo checkout no Asaas com valor do 2º lote e expiração de 24h. */
async function gerarCheckoutExcecao(insc: any, valor: number, ASAAS_KEY: string): Promise<{ id: string; link: string; status: string } | null> {
  const externalRef = insc.codigo_inscricao || `M31-EXC-${Date.now().toString(36).toUpperCase()}`;
  const payload: any = {
    billingTypes: ['PIX', 'CREDIT_CARD'],
    chargeTypes: ['DETACHED', 'INSTALLMENT'],
    installment: { maxInstallmentCount: 2 },
    minutesToExpire: 1440,
    externalReference: externalRef,
    callback: {
      successUrl: '__APP_ORIGIN__/obrigado',
      cancelUrl: '__APP_ORIGIN__/m31-inscricao',
      expiredUrl: '__APP_ORIGIN__/m31-inscricao',
    },
    items: [{
      name: 'M31 Filhas - Inscricao',
      description: `M31 Filhas - ${insc.nome} - excecao 2 lote`,
      value: valor,
      quantity: 1,
    }],
  };
  // NÃO enviamos customer no checkout de exceção — Asaas coleta os dados
  // na página de checkout nativa. Enviar customer inline causa rejeição
  // "O campo customer informado é inválido" (dead-end documentado).
  // externalReference (codigo_inscricao) ancora o pagamento à inscrição.
  try {
    const resp = await fetchAsaas('__ASAAS_API__/checkouts', {
      method: 'POST',
      headers: { 'access_token': ASAAS_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const checkout = await resp.json();
    if (!checkout.link) {
      logger.log(`[Excecao2Lote] Asaas rejeitou ${insc.id}: HTTP ${resp.status}`, JSON.stringify(checkout).substring(0, 500));
      return { id: null, link: null, status: null, erro: `HTTP ${resp.status}: ${JSON.stringify(checkout).substring(0, 300)}` } as any;
    }
    return { id: checkout.id, link: checkout.link, status: checkout.status || 'ACTIVE' };
  } catch (e) {
    logger.log(`[Excecao2Lote] Erro ao gerar checkout para ${insc.id}:`, e.message);
    return { id: null, link: null, status: null, erro: e.message } as any;
  }
}

function mensagemExcecao(primeiroNome: string, link: string): string {
  const nome = primeiroNome || 'querida';
  return `Oi, ${nome}! Tudo bem? 💛\nIdentificamos uma inconsistência no sistema durante sua tentativa de inscrição. Por isso, liberamos por 24 horas um novo link com o valor do 2º lote:\n\n${link}\n\nCaso já tenha realizado o pagamento, nos avise por aqui para conferirmos direitinho.`;
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    try {
      const user = await base44.auth.me();
      if (user && user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    } catch { /* automação agendada */ }

    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dry_run !== false;
    const alvoId = body?.inscricao_id || null;
    const maxInscricoes = body?.max_inscricoes || 10;

    const S = base44.asServiceRole.entities;
    const ASAAS_KEY = config('ASAAS_API_KEY');

    // 1. Valor do 2º lote (exceção) e do lote ativo (reversão)
    const lotes = await S.EventoM31Lote.list('-ordem', 10);
    const loteExcecao = lotes.find((l: any) => l.codigo === LOTE_EXCECAO_CODIGO);
    const loteAtivo = lotes.find((l: any) => l.ativo === true) || lotes[0];
    if (!loteExcecao) return Response.json({ error: '2º lote não encontrado' }, { status: 500 });
    const valorExcecao = loteExcecao.valor;
    const valorReverter = loteAtivo.valor;

    // 2. Identificar casos afetados
    const corte72h = new Date(Date.now() - 72 * 3600000).toISOString();
    let candidatas: any[] = [];

    if (alvoId) {
      const insc = await S.EventoM31Inscricao.get(alvoId).catch(() => null);
      if (insc) candidatas.push(insc);
    } else {
      const tlCorrecao = await S.M31InscricaoTimeline.filter(
        { evento: 'incidente_criado', etapa: 'correcao_pay_by539_aplicada' }, '-created_date', 200
      );
      const idsAfetadas = [...new Set(
        tlCorrecao.filter((t: any) => t.created_date && t.created_date >= corte72h)
          .map((t: any) => t.inscricao_id)
      )];
      for (const id of idsAfetadas) {
        const insc = await S.EventoM31Inscricao.get(id).catch(() => null);
        if (insc) candidatas.push(insc);
      }
    }

    // 3. Filtrar elegíveis — skip das já processadas (excecao ativa não expirada)
    const elegiveis = candidatas
      .filter(i => STATUS_ALVO.includes(i.status_pagamento))
      .filter(i => !i.opt_out)
      .filter(i => !i.cadastro_pendente)
      .filter(i => !i.excecao_2lote_expira_em || new Date(i.excecao_2lote_expira_em) < new Date())
      .slice(0, maxInscricoes);

    // 4. Processar cada uma
    const processados: any[] = [];
    const puladosPagos: any[] = [];
    const falhas: any[] = [];

    for (const insc of elegiveis) {
      // a. Verificar se JÁ PAGOU no Asaas (não gerar cobrança duplicada)
      const checkoutIdAtual = insc.asaas_checkout_id || null;
      const jaPagou = await jaPagouNoAsaas(insc.codigo_inscricao, checkoutIdAtual, ASAAS_KEY);
      if (jaPagou.pago) {
        puladosPagos.push({ inscricao_id: insc.id, nome: insc.nome, motivo: 'ja_pago_asaas', payment_id: jaPagou.payment_id, status: jaPagou.status });
        if (!dryRun && insc.status_pagamento !== 'aprovado') {
          await S.EventoM31Inscricao.update(insc.id, {
            status_pagamento: 'aprovado',
            asaas_checkout_status: 'PAID',
            asaas_payment_id: jaPagou.payment_id || insc.asaas_payment_id,
            origem_pagamento: insc.origem_pagamento || 'asaas',
          }).catch(() => {});
          await S.M31InscricaoTimeline.create({
            inscricao_id: insc.id, cpf: insc.cpf || null,
            evento: 'pagamento_aprovado', etapa: 'excecao_2lote_verificacao',
            status: 'sucesso',
            detalhe: `Pagamento confirmado no Asaas durante verificação de exceção (payment_id=${jaPagou.payment_id}, status=${jaPagou.status}). Inscrição aprovada; exceção NÃO gerada.`,
            origem: 'm31GerarLinkExcecao2Lote',
          }).catch(() => {});
        }
        continue;
      }

      // b. Gerar novo checkout (valor 2º lote, 24h)
      let novoCheckout: any = null;
      if (!dryRun) {
        novoCheckout = await gerarCheckoutExcecao(insc, valorExcecao, ASAAS_KEY);
        if (!novoCheckout || !novoCheckout.link) {
          falhas.push({ inscricao_id: insc.id, nome: insc.nome, motivo: 'erro_gerar_checkout', detalhe: (novoCheckout as any)?.erro || 'sem_link' });
          continue;
        }
      }

      const expiraEm = new Date(Date.now() + EXCECAO_JANELA_H * 3600000).toISOString();
      const motivo = 'excecao_goodwill_inconsistencia_pay_by539';

      // c. Atualizar inscrição
      if (!dryRun) {
        const historico = insc.observacoes
          ? `${insc.observacoes}\n[EXC 2LOTE ${new Date().toISOString()}] Novo link gerado (valor 2º lote R$${valorExcecao}, expira ${expiraEm}). Motivo: ${motivo}. Link antigo: ${insc.asaas_charge_url}`
          : `[EXC 2LOTE ${new Date().toISOString()}] Novo link gerado (valor 2º lote R$${valorExcecao}, expira ${expiraEm}). Motivo: ${motivo}. Link antigo: ${insc.asaas_charge_url}`;
        await S.EventoM31Inscricao.update(insc.id, {
          asaas_charge_url: novoCheckout.link,
          asaas_checkout_id: novoCheckout.id,
          asaas_checkout_status: novoCheckout.status,
          status_pagamento: 'checkout_pendente',
          valor_pago: valorExcecao,
          checkout_abandoned_at: null,
          excecao_2lote_expira_em: expiraEm,
          excecao_2lote_valor_reverter: valorReverter,
          excecao_2lote_motivo: motivo,
          observacoes: historico.substring(0, 2000),
          recovery_attempts: (insc.recovery_attempts || 0) + 1,
        }).catch(() => {});
      }

      // d. Enfileirar UMA mensagem (dedup)
      const dedupKey = `${insc.id}:EXCECAO_2LOTE:V1`;
      let enfileirado = false;
      if (!dryRun) {
        const jaNaFila = await S.M31FilaMensagem.filter({ dedup_key: dedupKey }, '-created_date', 1);
        const statusBloqueantes = ['pendente', 'processando', 'enviado', 'incerto', 'falha_terminal'];
        if (jaNaFila.length === 0 || !statusBloqueantes.includes(jaNaFila[0].status)) {
          const primeiroNome = insc.nome?.split(' ')[0] || 'querida';
          const telefone = normalizePhone(insc.whatsapp);
          const participante_id = insc.cpf || telefone;
          await S.M31FilaMensagem.create({
            dedup_key: dedupKey,
            participante_id,
            cpf: insc.cpf || null,
            telefone,
            email: insc.email || null,
            automacao: 'LINK_DE_PAGAMENTO',
            template: 'excecao_2lote_link_pagamento',
            versao: 'V1',
            origem: 'm31GerarLinkExcecao2Lote',
            inscricao_id: insc.id,
            inscricao_nome: insc.nome,
            mensagens: [{ message: mensagemExcecao(primeiroNome, novoCheckout.link), image_url: null }],
            status: 'pendente',
            aprovado_para_envio: true,
            prioridade: 2,
            forcar_envio: false,
          }).catch(() => {});
          await S.M31AutomacaoLog.create({
            participante_id,
            cpf: insc.cpf || null,
            telefone,
            email: insc.email || null,
            automacao: 'RECUPERACAO_CHECKOUT',
            template: 'excecao_2lote_link_pagamento',
            versao: 'V1',
            status: 'enviado',
            enviado_em: new Date().toISOString(),
            origem: 'm31GerarLinkExcecao2Lote',
            idempotency_key: `${participante_id}:RECUPERACAO_CHECKOUT:V1`,
          }).catch(() => {});
          enfileirado = true;
        }
      }

      // e. Timeline (histórico + motivo)
      if (!dryRun) {
        await S.M31InscricaoTimeline.create({
          inscricao_id: insc.id,
          cpf: insc.cpf || null,
          evento: 'excecao_2lote_link_gerado',
          etapa: 'excecao_2lote',
          status: 'sucesso',
          detalhe: `Exceção 2º lote gerada: valor=R$${valorExcecao} (lote ativo=R$${valorReverter}) | expira_em=${expiraEm} | checkout_id=${novoCheckout.id} | motivo=${motivo} | mensagem_enfileirada=${enfileirado}. Após expirar, valor reverte automaticamente para R$${valorReverter}.`,
          origem: 'm31GerarLinkExcecao2Lote',
        }).catch(() => {});
      }

      processados.push({
        inscricao_id: insc.id,
        nome: insc.nome,
        cpf: insc.cpf,
        whatsapp: insc.whatsapp,
        codigo_inscricao: insc.codigo_inscricao,
        valor_excecao: valorExcecao,
        valor_reverter: valorReverter,
        expira_em: expiraEm,
        checkout_id: novoCheckout?.id || null,
        link: novoCheckout?.link || null,
        mensagem_enfileirada: enfileirado,
        status_anterior: insc.status_pagamento,
      });
    }

    return Response.json({
      success: true,
      dry_run: dryRun,
      timestamp: new Date().toISOString(),
      lote_excecao: { codigo: LOTE_EXCECAO_CODIGO, valor: valorExcecao, nome: loteExcecao.nome },
      lote_ativo: { codigo: loteAtivo.codigo, valor: valorReverter, nome: loteAtivo.nome },
      alvo: alvoId || 'todos_afetados_72h',
      resumo: {
        candidatas: candidatas.length,
        elegiveis: elegiveis.length,
        processados: processados.length,
        pulados_pagos: puladosPagos.length,
        falhas: falhas.length,
      },
      processados,
      pulados_pagos: puladosPagos,
      falhas,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
