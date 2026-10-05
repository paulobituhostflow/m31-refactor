// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31RecuperarLinksPagamento v2
 *
 * Recupera links de checkout abandonados consultando o status do CHECKOUT
 * (não do payment) diretamente no Asaas via GET /checkouts/{id}.
 *
 * Correções v2:
 *   1. Usa asaas_checkout_id (ou extrai da URL) em vez de asaas_payment_id
 *   2. Consulta GET /checkouts/{checkout_id} — status ACTIVE = enviar,
 *      PAID/EXPIRED/CANCELED = não enviar
 *   3. Agrupa por CPF e telefone — envia somente UM link por pessoa
 *   4. Voluntários NÃO são excluídos — também recebem o link de pagamento
 *   5. Para registros antigos sem asaas_checkout_id, extrai o ID da URL
 *   6. Dry-run por padrão — auditoria sem enfileirar
 *
 * Payload: { dry_run?: boolean, max_inscricoes?: number }
 */

const DIAS_LIMITE = 7;
const LIMITE_LINKS_DIARIO = 15;
const GRUPO_JID_DEFAULT = '120363423189586769@g.us';
const SNAPSHOT_MAX_IDADE_HORAS = 3;

// Status do checkout no Asaas: ACTIVE = enviar; demais = não enviar
const STATUS_ENVIAVEL = ['ACTIVE'];
const STATUS_NAO_ENVIAVEL = ['PAID', 'EXPIRED', 'CANCELED'];

function normalizarTelefoneBR(phone: string): string {
  const d = (phone || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('55')) {
    const ddd = d.slice(2, 4);
    const resto = d.slice(4);
    return `55${ddd}9${resto}`;
  }
  return d;
}

function normalizePhone(phone: string): string {
  let d = (phone || '').replace(/\D/g, '');
  while (d.startsWith('5555')) d = d.slice(2);
  if (d.startsWith('55') && d.length >= 12) return d;
  if (d.length >= 10) return `55${d}`;
  return d;
}

/**
 * Extrai o checkout_id da URL do Asaas.
 * URL: https://www.asaas.com/checkoutSession/show/{uuid}
 */
function extrairCheckoutIdDaUrl(url: string): string | null {
  if (!url) return null;
  const match = url.match(/checkoutSession\/show\/([a-f0-9-]+)/i);
  return match ? match[1] : null;
}

async function fetchAsaas(url: string, options: any = {}, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err: any) {
    if (err?.name === 'AbortError') throw new Error(`Timeout: Asaas não respondeu em ${timeoutMs / 1000}s`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Consulta o status do checkout no Asaas via GET /checkouts/{id}.
 * Retorna { status, checkout_id, link } ou null se não encontrado.
 */
async function consultarCheckoutAsaas(checkoutId: string, ASAAS_KEY: string): Promise<{ status: string; checkout_id: string; link: string | null } | null> {
  if (!checkoutId) return null;
  try {
    const resp = await fetchAsaas(`__ASAAS_API__/checkouts/${checkoutId}`, {
      headers: { 'access_token': ASAAS_KEY }
    });
    if (resp.status === 404) return null;
    const checkout = await resp.json();
    return {
      status: checkout.status || 'UNKNOWN',
      checkout_id: checkout.id || checkoutId,
      link: checkout.link || null,
    };
  } catch (e) {
    logger.log(`[Recuperar] Erro ao consultar checkout ${checkoutId}:`, e.message);
    return null;
  }
}

/**
 * Gera um novo checkout no Asaas para inscrições com checkout EXPIRED ou CANCELED.
 * Usa os dados da inscrição existente. Retorna { id, link, status } ou null.
 */
async function criarNovoCheckout(insc: any, ASAAS_KEY: string): Promise<{ id: string; link: string; status: string } | null> {
  const valor = insc.valor_pago || 129;
  const externalRef = insc.codigo_inscricao || `M31-REC-${Date.now().toString(36).toUpperCase()}`;
  try {
    const resp = await fetchAsaas('__ASAAS_API__/checkouts', {
      method: 'POST',
      headers: { 'access_token': ASAAS_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        billingTypes: ['PIX', 'CREDIT_CARD'],
        chargeTypes: ['DETACHED', 'INSTALLMENT'],
        installment: { maxInstallmentCount: 5 },
        minutesToExpire: 1440,
        externalReference: externalRef,
        customer: {
          name: insc.nome,
          email: insc.email,
          cpfCnpj: insc.cpf || undefined,
          mobilePhone: normalizePhone(insc.whatsapp),
        },
        callback: {
          successUrl: '__APP_ORIGIN__/obrigado',
          cancelUrl: '__APP_ORIGIN__/m31-inscricao',
          expiredUrl: '__APP_ORIGIN__/m31-inscricao'
        },
        items: [{
          name: 'M31 Filhas - Inscricao',
          description: `M31 Filhas - ${insc.nome}`,
          value: valor,
          quantity: 1
        }]
      })
    });
    const checkout = await resp.json();
    if (!checkout.link) return null;
    return { id: checkout.id, link: checkout.link, status: checkout.status || 'ACTIVE' };
  } catch (e) {
    logger.log(`[Recuperar] Erro ao gerar novo checkout para ${insc.id}:`, e.message);
    return null;
  }
}

/**
 * Fallback para registros antigos sem asaas_checkout_id:
 * consulta pagamentos por externalReference (codigo_inscricao).
 * Se achar pagamento PENDING → checkout ativo.
 * Se achar RECEIVED/CONFIRMED → já pago.
 * Se não achar → cliente nunca abriu o checkout, link ainda válido.
 */
async function consultarPagamentoPorExternalRef(externalRef: string, ASAAS_KEY: string): Promise<{ status: string; payment_id: string | null } | null> {
  if (!externalRef) return null;
  try {
    const resp = await fetchAsaas(`__ASAAS_API__/payments?externalReference=${encodeURIComponent(externalRef)}&limit=5`, {
      headers: { 'access_token': ASAAS_KEY }
    });
    const data = await resp.json();
    if (!data?.data || data.data.length === 0) return null;
    const confirmadas = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'DUNNING_RECEIVED'];
    const paga = data.data.find((p: any) => confirmadas.includes(p.status));
    const pendente = data.data.find((p: any) => p.status === 'PENDING');
    const escolhida = paga || pendente || data.data[0];
    return { status: escolhida.status, payment_id: escolhida.id };
  } catch (e) {
    logger.log(`[Recuperar] Erro ao buscar por externalRef ${externalRef}:`, e.message);
    return null;
  }
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    try {
      const user = await base44.auth.me();
      if (user && user.role !== 'admin') {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    } catch { /* automação agendada */ }

    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dry_run !== false;
    const maxInscricoes = body?.max_inscricoes || 50;

    const S = base44.asServiceRole.entities;
    const corte7dias = new Date(Date.now() - DIAS_LIMITE * 24 * 3600000).toISOString();

    // ═══ 1. VERIFICAR SNAPSHOT DO GRUPO ═══
    const gruposConfig = await S.M31GrupoConfig.filter({ finalidade: 'INSCRITAS_OFICIAL', ativo: true });
    const grupoJid = gruposConfig[0]?.chat_id || GRUPO_JID_DEFAULT;

    const membrosRecentes = await S.M31GrupoMembro.filter({ group_jid: grupoJid, status: 'ativa' }, '-ultima_deteccao', 1);
    if (!membrosRecentes || membrosRecentes.length === 0) {
      return Response.json({ success: false, motivo: 'snapshot_ausente' });
    }

    const ultimaDeteccao = new Date(membrosRecentes[0].ultima_deteccao);
    const idadeSnapshotHoras = (Date.now() - ultimaDeteccao.getTime()) / (1000 * 3600);
    if (idadeSnapshotHoras > SNAPSHOT_MAX_IDADE_HORAS) {
      return Response.json({ success: false, motivo: 'snapshot_desatualizado', idade_horas: Math.round(idadeSnapshotHoras) });
    }

    const todosMembros = await S.M31GrupoMembro.filter({ group_jid: grupoJid, status: 'ativa' });
    const phonesNoGrupo = new Set<string>();
    for (const m of todosMembros) {
      phonesNoGrupo.add(m.phone);
      phonesNoGrupo.add(normalizarTelefoneBR(m.phone));
    }

    // ═══ 2. AUDITORIA DE ITENS PENDENTES NA FILA ═══
    const pendentesFila = await S.M31FilaMensagem.filter({ status: 'pendente', automacao: 'LINK_DE_PAGAMENTO' });
    const auditoria: any[] = [];

    for (const item of pendentesFila) {
      const motivos: string[] = [];
      if (item.inscricao_id) {
        const inscs = await S.EventoM31Inscricao.filter({ id: item.inscricao_id });
        if (inscs.length > 0) {
          const insc = inscs[0];
          if (insc.created_date && new Date(insc.created_date) < new Date(corte7dias)) motivos.push('fora_janela_7_dias');
          if (['aprovado', 'gratuito'].includes(insc.status_pagamento)) motivos.push('pagamento_ja_confirmado_db');
          const telNorm = normalizePhone(insc.whatsapp);
          const telBR = normalizarTelefoneBR(insc.whatsapp);
          if (phonesNoGrupo.has(telNorm) || phonesNoGrupo.has(telBR)) motivos.push('telefone_no_grupo');
        }
      }
      if (motivos.length > 0) {
        if (!dryRun) {
          await S.M31FilaMensagem.update(item.id, { status: 'cancelado', erro: motivos.join(', '), processado_em: new Date().toISOString() });
        }
        auditoria.push({ fila_id: item.id, inscricao_id: item.inscricao_id, nome: item.inscricao_nome, motivos });
      }
    }

    // ═══ 3. BUSCAR INSCRIÇÕES ELEGÍVEIS (últimos 7 dias) ═══
    const [checkoutPendente, checkoutAbandonado] = await Promise.all([
      S.EventoM31Inscricao.filter({ status_pagamento: 'checkout_pendente' }, '-created_date', 500),
      S.EventoM31Inscricao.filter({ status_pagamento: 'checkout_abandonado' }, '-created_date', 500),
    ]);

    const candidatas = [...checkoutPendente, ...checkoutAbandonado]
      .filter(i => i.asaas_charge_url && i.whatsapp)
      .filter(i => i.created_date && new Date(i.created_date) >= new Date(corte7dias))
      .filter(i => {
        const telNorm = normalizePhone(i.whatsapp);
        const telBR = normalizarTelefoneBR(i.whatsapp);
        return !phonesNoGrupo.has(telNorm) && !phonesNoGrupo.has(telBR);
      })
      .filter(i => !i.opt_out);

    // ═══ 4. AGRUPAR POR CPF E TELEFONE (UM link por pessoa) ═══
    const porPessoa: Record<string, any[]> = {};
    for (const insc of candidatas) {
      const cpf = insc.cpf || '';
      const tel = normalizePhone(insc.whatsapp);
      // Chave de grupo: CPF优先, senão telefone
      const chave = cpf.length === 11 ? `CPF:${cpf}` : `TEL:${tel}`;
      if (!porPessoa[chave]) porPessoa[chave] = [];
      porPessoa[chave].push(insc);
    }

    // Para cada grupo, escolher a inscrição mais recente (último checkout criado)
    const gruposPessoa = Object.entries(porPessoa).map(([chave, items]) => {
      const ordenados = items.sort((a, b) => (a.created_date < b.created_date ? 1 : -1));
      return { chave, inscricao: ordenados[0], duplicadas: ordenados.length, todas: ordenados };
    });

    // ═══ 5. VERIFICAR CADA CANDIDATA NO ASAAS (via checkout_id) ═══
    const ASAAS_KEY = config('ASAAS_API_KEY');
    const elegiveis: any[] = [];
    const rejeitadas: any[] = [];
    const semCheckoutId: any[] = [];

    for (const grupo of gruposPessoa.slice(0, maxInscricoes)) {
      if (elegiveis.length >= LIMITE_LINKS_DIARIO) break;

      const insc = grupo.inscricao;
      const telNorm = normalizePhone(insc.whatsapp);
      const dedupKey = `${insc.id}:LINK_DE_PAGAMENTO:V1`;

      // Já na fila?
      const jaNaFila = await S.M31FilaMensagem.filter({ dedup_key: dedupKey }, '-created_date', 1);
      if (jaNaFila.length > 0 && ['pendente', 'processando', 'enviado', 'incerto', 'falha_terminal'].includes(jaNaFila[0].status)) {
        rejeitadas.push({ inscricao_id: insc.id, nome: insc.nome, motivo: 'ja_na_fila', duplicadas: grupo.duplicadas });
        continue;
      }

      // Obter checkout_id: do campo, ou extrair da URL
      let checkoutId = insc.asaas_checkout_id || null;
      if (!checkoutId) {
        checkoutId = extrairCheckoutIdDaUrl(insc.asaas_charge_url);
        if (checkoutId && !dryRun) {
          // Backfill: salvar o checkout_id extraído para futuras execuções
          await S.EventoM31Inscricao.update(insc.id, { asaas_checkout_id: checkoutId }).catch(() => {});
        }
      }

      let asaasStatus: string | null = null;
      let checkoutUrlFinal: string = insc.asaas_charge_url;

      if (checkoutId) {
        // Tentar GET /checkouts/{id} (funciona para registros novos com checkout_id real)
        const checkoutInfo = await consultarCheckoutAsaas(checkoutId, ASAAS_KEY);
        if (checkoutInfo) {
          asaasStatus = checkoutInfo.status;
          if (checkoutInfo.link) checkoutUrlFinal = checkoutInfo.link;
        }
        // Se retornou 404 (session ID ≠ resource ID), cai no fallback abaixo
      }

      // Fallback para registros antigos: consultar pagamento por externalReference
      if (!asaasStatus && insc.codigo_inscricao) {
        const payInfo = await consultarPagamentoPorExternalRef(insc.codigo_inscricao, ASAAS_KEY);
        if (payInfo) {
          // Pagamento encontrado — mapear status do payment para status do checkout
          const confirmadas = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'DUNNING_RECEIVED'];
          if (confirmadas.includes(payInfo.status)) {
            asaasStatus = 'PAID'; // já pago
          } else if (payInfo.status === 'PENDING') {
            asaasStatus = 'ACTIVE'; // pagamento pendente = checkout ativo
          } else if (['OVERDUE', 'DELETED', 'REFUNDED'].includes(payInfo.status)) {
            asaasStatus = payInfo.status === 'DELETED' ? 'CANCELED' : 'EXPIRED';
          }
          // Backfill: salvar payment_id se encontrado
          if (payInfo.payment_id && !dryRun) {
            await S.EventoM31Inscricao.update(insc.id, { asaas_payment_id: payInfo.payment_id }).catch(() => {});
          }
        } else {
          // Nenhum pagamento encontrado = cliente nunca abriu o checkout.
          // O link de checkout ainda é válido (sessão de 24h). Assumir ACTIVE.
          asaasStatus = 'ACTIVE';
        }
      }

      if (!asaasStatus) {
        semCheckoutId.push({ inscricao_id: insc.id, nome: insc.nome, url: insc.asaas_charge_url, motivo: 'sem_checkout_id_e_sem_external_ref' });
        continue;
      }

      if (asaasStatus === 'PAID') {
        // Já pago — não enviar cobrança. Marcar como aprovado no DB se o webhook falhou.
        rejeitadas.push({ inscricao_id: insc.id, nome: insc.nome, motivo: 'checkout_PAID', checkout_id: checkoutId });
        if (!dryRun) {
          await S.EventoM31Inscricao.update(insc.id, { status_pagamento: 'aprovado', asaas_checkout_status: 'PAID' }).catch(() => {});
        }
        continue;
      }

      if (asaasStatus === 'EXPIRED' || asaasStatus === 'CANCELED') {
        // Checkout expirado/cancelado — gerar NOVO checkout por CPF/telefone
        const novoCheckout = await criarNovoCheckout(insc, ASAAS_KEY);
        if (!novoCheckout) {
          rejeitadas.push({ inscricao_id: insc.id, nome: insc.nome, motivo: `falha_novo_checkout_${asaasStatus}`, checkout_id: checkoutId });
          continue;
        }
        if (!dryRun) {
          await S.EventoM31Inscricao.update(insc.id, {
            asaas_charge_url: novoCheckout.link,
            asaas_checkout_id: novoCheckout.id,
            asaas_checkout_status: novoCheckout.status,
            status_pagamento: 'checkout_pendente',
          }).catch(() => {});
        }
        // Usar o novo link para envio
        elegiveis.push({
          inscricao_id: insc.id,
          nome: insc.nome,
          telefone: telNorm,
          cpf: insc.cpf || null,
          checkout_url: novoCheckout.link,
          checkout_id: novoCheckout.id,
          asaas_status: 'ACTIVE',
          dedup_key: dedupKey,
          created_date: insc.created_date,
          tipo: insc.tipo,
          origem_inscricao: insc.origem_inscricao || null,
          duplicadas_grupo: grupo.duplicadas,
          novo_checkout_gerado: true,
          caravana_nome: insc.caravana_nome || null,
        });
        continue;
      }

      if (!STATUS_ENVIAVEL.includes(asaasStatus)) {
        rejeitadas.push({ inscricao_id: insc.id, nome: insc.nome, motivo: `checkout_status_inesperado:${asaasStatus}` });
        continue;
      }

      // ACTIVE — elegível para envio
      elegiveis.push({
        inscricao_id: insc.id,
        nome: insc.nome,
        telefone: telNorm,
        cpf: insc.cpf || null,
        checkout_url: checkoutUrlFinal,
        checkout_id: checkoutId,
        asaas_status: asaasStatus,
        dedup_key: dedupKey,
        created_date: insc.created_date,
        tipo: insc.tipo,
        origem_inscricao: insc.origem_inscricao || null,
        duplicadas_grupo: grupo.duplicadas,
        caravana_nome: insc.caravana_nome || null,
      });
    }

    // ═══ 6. ENFILEIRAR (se não for dry-run) ═══
    const enfileirados: any[] = [];
    if (!dryRun) {
      for (const eleg of elegiveis) {
        const primeiroNome = eleg.nome?.split(' ')[0] || 'querida';
        // AUDITORIA: se a inscrição é de caravana, especificar o nome da caravana (formulário específico).
        // Sem caravana_nome identificado → mensagem genérica (não afirma caravana sem saber qual).
        const caravanaNome = (eleg as any).caravana_nome || null;
        const mensagem = caravanaNome
          ? `Oi ${primeiroNome}! 🌸\n\nO link de pagamento da sua inscrição na caravana *${caravanaNome}* no M31 Filhas está pronto:\n\n👉 ${eleg.checkout_url}\n\nQualquer dúvida, é só responder esta mensagem! 🙏`
          : `Oi ${primeiroNome}! 🌸\n\nO link de pagamento da sua inscrição no M31 Filhas está pronto:\n\n👉 ${eleg.checkout_url}\n\nQualquer dúvida, é só responder esta mensagem! 🙏`;
        try {
          const item = await S.M31FilaMensagem.create({
            dedup_key: eleg.dedup_key,
            participante_id: eleg.cpf || eleg.telefone,
            cpf: eleg.cpf || null,
            telefone: eleg.telefone,
            email: null,
            automacao: 'LINK_DE_PAGAMENTO',
            template: 'link_pagamento',
            versao: 'V1',
            origem: 'm31RecuperarLinksPagamento',
            inscricao_id: eleg.inscricao_id,
            inscricao_nome: eleg.nome,
            mensagens: [{ message: mensagem, image_url: null }],
            status: 'pendente',
            aprovado_para_envio: true,
            prioridade: 5,
          });
          enfileirados.push({ fila_id: item.id, inscricao_id: eleg.inscricao_id, nome: eleg.nome });
        } catch (e) { /* dedup silencioso */ }
      }
    }

    return Response.json({
      success: true,
      dry_run: dryRun,
      snapshot_grupo: {
        jid: grupoJid,
        membros_ativos: todosMembros.length,
        ultima_deteccao: membrosRecentes[0].ultima_deteccao,
        idade_horas: Math.round(idadeSnapshotHoras),
      },
      candidatas_total: candidatas.length,
      grupos_pessoa: gruposPessoa.length,
      elegiveis: elegiveis.length,
      rejeitadas: rejeitadas.length,
      sem_checkout_id: semCheckoutId.length,
      auditoria_fila: auditoria.length,
      enfileirados: enfileirados.length,
      detalhe_elegiveis: elegiveis,
      detalhe_rejeitadas: rejeitadas,
      detalhe_sem_checkout_id: semCheckoutId,
      detalhe_auditoria: auditoria,
      detalhe_enfileirados: enfileirados,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
