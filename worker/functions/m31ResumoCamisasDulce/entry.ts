// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31ResumoCamisasDulce — Parcial de camisas para a Dulce.
 *
 * NÃO é um motor de confirmação financeira. Regras permanentes:
 *   - ÚNICA fonte de verdade para pedido = pago: o processamento canônico do
 *     worker (processarPedidoCamisaConfirmacao), que valida payment_id +
 *     externalReference + valor + tipo + status CONFIRMED/RECEIVED no Asaas.
 *     Este resumo apenas DETECTA pagamento confirmado no Asaas e delega via
 *     action 'conciliar_camisa' — nunca escreve estado financeiro, nunca
 *     baixa estoque, nunca dispara aviso por conta própria.
 *   - Idempotência: se o webhook já confirmou, o resumo só lê; se o resumo
 *     reconciliar primeiro, o webhook posterior não duplica efeitos (transição
 *     condicional + dedup por pedido no aviso e no agradecimento); executar o
 *     resumo duas vezes não duplica pagamento, estoque nem mensagens.
 *   - ENVIO IDEMPOTENTE DO PARCIAL: se o quantitativo é IDÊNTICO ao do último
 *     parcial aceito (impressão de conteúdo registrada em EventoM31ActionLog),
 *     NÃO reenvia a mensagem à Dulce. Alteração real → envia a atualização.
 *
 * Formato para a Dulce — apenas três categorias:
 *   Pagos | Pendentes reais | Substituídos
 *   Pendente real = não pago + não substituído + cobrança PENDING no Asaas.
 *   Substituído nunca entra em pendentes nem em recuperação.
 *
 *   action 'simular' → concilia + monta a mensagem, NÃO envia.
 *   action 'enviar'  → concilia + envia (se mudou) + registra.
 */

const TIMEOUT_CHAMADA_MS = 20000;
const STATUS_CONFIRMADOS_ASAAS = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'DUNNING_RECEIVED'];
const TAMANHOS = ['PP', 'P', 'M', 'G', 'GG', 'XGG'];

function mc(res: any): number {
  return res?.updated ?? res?.modified_count ?? res?.modifiedCount ?? 0;
}

function pad3(numero: number): string {
  return String(numero).padStart(3, '0');
}

async function fetchAsaas(url: string, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: { access_token: config('ASAAS_API_KEY') || '' },
      signal: controller.signal,
    });
  } finally { clearTimeout(timer); }
}

// ── Mesmo padrão de interpretação do m31AvisoCompraConfirmada ──
const PADROES_TERMINAIS = /(not?\s?.{0,16}whatsapp|whatsapp.{0,16}not|invalid.{0,12}(number|phone|jid)|(number|phone).{0,12}(invalid|not\s?found)|no\s?.{0,6}account|not\s?.{0,10}registered|recipient.{0,16}not\s?.{0,8}found|item-not-found|does\s?not\s?exist)/i;

function interpretarResposta(httpStatus: number, body: string) {
  let json: any = null;
  try { json = JSON.parse(body || ''); } catch { /* corpo não-JSON */ }
  const corpoComErro = !!(json && (json.error || json.status === 'error'));
  const messageId = json ? (json.id || json.messageId || json.key?.id || json.message?.id || null) : null;
  const resumo = (body || '').substring(0, 300);
  if ((httpStatus !== 200 || corpoComErro) && PADROES_TERMINAIS.test(body || '')) {
    return { resultado: 'falha_terminal', message_id: null, erro: `erro_terminal HTTP ${httpStatus}: ${resumo.substring(0, 150)}`, resposta_resumo: resumo };
  }
  if (httpStatus === 200 && !corpoComErro && messageId && String(messageId).trim() !== '') {
    return { resultado: 'aceito', message_id: String(messageId), erro: null, resposta_resumo: resumo };
  }
  if (httpStatus === 200 && !corpoComErro) {
    return { resultado: 'incerto', message_id: null, erro: 'HTTP 200 sem messageid — resposta ambígua, sem prova de aceite', resposta_resumo: resumo };
  }
  return { resultado: 'falha', message_id: null, erro: `HTTP ${httpStatus}: ${resumo.substring(0, 150)}`, resposta_resumo: resumo };
}

async function chamarUAZAPI(destino: string, message: string) {
  const token = config('UAZAPI_TOKEN');
  if (!token) return { resultado: 'falha', message_id: null, http_status: 0, erro: 'UAZAPI_TOKEN não configurado', resposta_resumo: '' };
  const baseUrl = (config('UAZAPI_BASE') || '__UAZAPI_API__').replace(/\/+$/, '');
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_CHAMADA_MS);
    let resp: Response;
    try {
      resp = await fetch(`${baseUrl}/send/text`, {
        method: 'POST',
        headers: { token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: destino, phone: destino, message, text: message }),
        signal: controller.signal,
      });
    } finally { clearTimeout(timer); }
    const body = await resp.text();
    return { ...interpretarResposta(resp.status, body), http_status: resp.status };
  } catch (e: any) {
    return { resultado: 'incerto', message_id: null, http_status: 0, erro: `excecao_ou_timeout_apos_chamada: ${e?.message}`, resposta_resumo: '' };
  }
}

function linhaModelo(tamanhos: Record<string, number>): string {
  const linhas = TAMANHOS.filter(t => (tamanhos[t] || 0) > 0)
    .map(t => `${t}: ${tamanhos[t]}`);
  return linhas.length ? linhas.join('\n') : '—';
}

// Última impressão de conteúdo efetivamente ENVIADA (aceita) à Dulce.
async function ultimoParcialEnviado(S: any): Promise<any | null> {
  const logs = await S.EventoM31ActionLog.filter({ entidade_id: 'resumo_camisas_dulce' }, '-created_date', 25).catch(() => []);
  for (const l of logs || []) {
    try {
      const d = JSON.parse(l.dados_anteriores || '{}');
      if (d?.envio?.resultado === 'aceito' && d?.impressao) return d;
    } catch { /* log antigo sem impressão */ }
  }
  return null;
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Apenas admin pode executar o resumo de camisas' }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const acao = body?.action === 'enviar' ? 'enviar' : 'simular';
    const S = base44.asServiceRole.entities;

    // ── 1. CONCILIAÇÃO: consultar CADA payment_id pendente no Asaas ──
    // Detecção SOMENTE; confirmação delegada ao processamento canônico.
    const pendentes = await S.EventoM31CamisaPedido.filter(
      { status_pagamento: 'checkout_pendente', asaas_payment_id: { $ne: null } }, 'numero_pedido', 200);
    const conciliacao = { consultados: 0, confirmados_agora: [] as any[], ainda_pendentes: [] as any[], erros: [] as any[] };

    for (const pedido of pendentes || []) {
      conciliacao.consultados++;
      let pagamento: any = null;
      try {
        const resp = await fetchAsaas(`__ASAAS_API__/payments/${pedido.asaas_payment_id}`);
        if (resp.status !== 200) {
          conciliacao.erros.push({ pedido: `#M31${pad3(pedido.numero_pedido)}`, erro: `Asaas HTTP ${resp.status}` });
          continue;
        }
        pagamento = await resp.json();
      } catch (e: any) {
        conciliacao.erros.push({ pedido: `#M31${pad3(pedido.numero_pedido)}`, erro: e?.message || 'falha consulta Asaas' });
        continue;
      }
      if (STATUS_CONFIRMADOS_ASAAS.includes(pagamento?.status)) {
        // NUNCA escrever estado financeiro aqui. Delega ao processamento
        // canônico, que revalida tudo no Asaas antes de qualquer transição.
        try {
          const worker: any = await base44.asServiceRole.functions.invoke('m31ProcessarWebhookAsaas', {
            action: 'conciliar_camisa', pedido_id: pedido.id,
          });
          const wr = worker?.data || worker;
          if (!wr?.sucesso) throw new Error(wr?.erro || 'worker_nao_confirmou_pagamento');
          conciliacao.confirmados_agora.push({
            pedido: `#M31${pad3(pedido.numero_pedido)}`, nome: pedido.nome,
            payment_id: pedido.asaas_payment_id, status_asaas: pagamento.status,
            processamento: 'm31ProcessarWebhookAsaas',
          });
        } catch (e: any) {
          conciliacao.erros.push({ pedido: `#M31${pad3(pedido.numero_pedido)}`, erro: `conciliacao_canônica: ${e?.message}` });
        }
      } else {
        conciliacao.ainda_pendentes.push({
          pedido: `#M31${pad3(pedido.numero_pedido)}`, nome: pedido.nome,
          status_asaas: pagamento?.status || 'DESCONHECIDO', vencimento: pagamento?.dueDate || null,
          quantidade: Number(pedido.quantidade || 0),
        });
      }
    }

    // ── 2. PARCIAL: Pagos | Pendentes reais | Substituídos ──
    const pagos = await S.EventoM31CamisaPedido.filter({ status_pagamento: 'pago' }, 'numero_pedido', 500);
    const grupos: Record<string, Record<string, number>> = {
      'FILHAS': {}, 'MILAGRES': {}, 'JESUS CEREJA': {}, 'JESUS PRETA': {},
    };
    let totalPago = 0;
    for (const pedido of pagos || []) {
      const itens = pedido.itens_cobrados || pedido.itens || [];
      for (const it of itens) {
        const qtd = Number(it.quantidade || 1);
        let grupo = 'FILHAS';
        if (it.modelo === 'milagres') grupo = 'MILAGRES';
        else if (it.modelo === 'jesus') grupo = it.cor === 'preta' ? 'JESUS PRETA' : 'JESUS CEREJA';
        const tam = TAMANHOS.includes(it.tamanho) ? it.tamanho : 'M';
        grupos[grupo][tam] = (grupos[grupo][tam] || 0) + qtd;
        totalPago += qtd;
      }
    }

    // PENDENTE REAL: não pago + não substituído + cobrança PENDING no Asaas.
    const pendentesReais = (conciliacao.ainda_pendentes || []).filter(p => p.status_asaas === 'PENDING');
    const pendentesReaisPedidos = pendentesReais.length;
    const pendentesReaisCamisas = pendentesReais.reduce((s, p) => s + Number(p.quantidade || 0), 0);
    // Outros estados (vencido etc. — o worker os marca via webhook): só no relatório admin.
    const outrosStatus = (conciliacao.ainda_pendentes || []).filter(p => p.status_asaas !== 'PENDING');

    const substituidos = await S.EventoM31CamisaPedido.filter({ status_pagamento: 'substituido' }, 'numero_pedido', 500);
    const substituidosPedidos = (substituidos || []).length;
    const substituidosCamisas = (substituidos || []).reduce((s, p) => s + Number(p.quantidade || 0), 0);

    const mensagem =
`Dulce, segue o parcial atualizado das camisas PAGAS

FILHAS
${linhaModelo(grupos['FILHAS'])}

MILAGRES
${linhaModelo(grupos['MILAGRES'])}

JESUS CEREJA
${linhaModelo(grupos['JESUS CEREJA'])}

JESUS PRETA
${linhaModelo(grupos['JESUS PRETA'])}

TOTAL CONFIRMADO: ${totalPago} camisas

Pendentes reais (Pix aguardando pagamento): ${pendentesReaisPedidos} pedidos / ${pendentesReaisCamisas} camisas
Substituídos (compradora fez novo pedido no lugar): ${substituidosPedidos} pedidos / ${substituidosCamisas} camisas

Considerou somente pagamentos efetivamente confirmados no Asaas.`;

    // ── 3. IDEMPOTÊNCIA DO ENVIO: conteúdo idêntico ao último aceito = não reenvia ──
    const impressao = JSON.stringify({
      pedidos_pagos: pagos.length, camisas_pagas: totalPago, grupos,
      pendentes_reais: { pedidos: pendentesReaisPedidos, camisas: pendentesReaisCamisas },
      substituidos: { pedidos: substituidosPedidos, camisas: substituidosCamisas },
    });
    const ultimoEnviado = await ultimoParcialEnviado(S);
    const inalterado = !!ultimoEnviado && ultimoEnviado.impressao === impressao;

    const resposta = {
      success: true, acao, resumo: {
        pedidos_pagos: pagos.length, camisas_pagas: totalPago,
        pendentes_reais: { pedidos: pendentesReaisPedidos, camisas: pendentesReaisCamisas },
        substituidos: { pedidos: substituidosPedidos, camisas: substituidosCamisas },
        grupos,
      },
      conciliacao: { ...conciliacao, outros_status: outrosStatus },
      impressao, parcial_inalterado: inalterado,
      mensagem,
    };

    if (acao === 'simular') {
      return Response.json(resposta, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (inalterado) {
      return Response.json({
        ...resposta,
        envio: { resultado: 'nao_reenviado', motivo: 'parcial_igual_ao_ultimo_enviado', ultimo_envio_em: ultimoEnviado?.envio?.em || null },
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    // ── 4. ENVIO DIRETO à Dulce (fonte única na configuração, fail-closed) ──
    const cfg = (await S.EventoM31Config.list('-created_date', 1))[0];
    const destino = String(cfg?.whatsapp_dulce || '').replace(/\D/g, '');
    if (!/^55\d{10,11}$/.test(destino)) {
      return Response.json({ ...resposta, envio: { resultado: 'falha', erro: 'whatsapp_dulce não configurado em EventoM31Config (fail-closed)' } }, { status: 503 });
    }

    const envio = await chamarUAZAPI(destino, mensagem);

    // Auditoria do envio — inclui a IMPRESSÃO de conteúdo para o dedup seguinte.
    await S.EventoM31ActionLog.create({
      user_email: user.email,
      user_nome: user.full_name || user.email,
      acao: envio.resultado === 'aceito'
        ? `Parcial de camisas PAGAS enviado à Dulce (${totalPago} camisas / ${pagos.length} pedidos; ${pendentesReaisPedidos} pendentes reais; ${substituidosPedidos} substituídos)`
        : `Falha no envio do parcial de camisas à Dulce (${envio.resultado}): ${envio.erro}`,
      modulo: 'sistema',
      entidade_id: 'resumo_camisas_dulce',
      entidade_nome: `#M31 — Parcial camisas ${new Date().toISOString().slice(0, 10)}`,
      dados_anteriores: JSON.stringify({
        envio: { resultado: envio.resultado, message_id: envio.message_id, http_status: envio.http_status, em: new Date().toISOString() },
        impressao,
        pedidos_pagos: pagos.length, camisas_pagas: totalPago,
        pendentes_reais: { pedidos: pendentesReaisPedidos, camisas: pendentesReaisCamisas },
        substituidos: { pedidos: substituidosPedidos, camisas: substituidosCamisas },
        conciliados_agora: conciliacao.confirmados_agora.length,
      }).substring(0, 2000),
    }).catch(() => {});

    const status = envio.resultado === 'aceito' ? 200 : (envio.resultado === 'incerto' ? 202 : 500);
    return Response.json({ ...resposta, envio: { ...envio, destino } }, { status, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error?.message || 'falha_resumo_camisas_dulce' }, { status: 500 });
  }
})(req);
}
