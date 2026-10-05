// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31AvisoCompraConfirmada — Aviso OPERACIONAL IMEDIATO e DIRETO ao WhatsApp
 * autorizado da Dulce quando o pagamento de um pedido de camisas está
 * EFETIVAMENTE confirmado.
 *
 * Regras permanentes:
 *   - Envio DIRETO ao número cadastrado em EventoM31Config.whatsapp_dulce
 *     (fonte única — nenhum número fixo no código). NUNCA passa por
 *     M31FilaMensagem: sem cooldown, limite diário, janela comercial, delay
 *     ou régua. Respeita apenas o kill-switch global (freio de emergência).
 *   - Para camisas existe APENAS este aviso: nada ao gerar Pix, nada ao criar
 *     pedido, nada de pedido pendente, nada ao grupo de suporte.
 *   - Disparo ÚNICO por pedido: dedup {pedido.id}:COMPRA_CONFIRMADA:V2.
 *     Webhook repetido NUNCA gera segundo aviso.
 *   - Código do pedido #M31NNN: sequencial imutável (numero_pedido) atribuído
 *     uma única vez (lock global + MAX+1 + verificação pós-escrita).
 *   - Falha/incerteza do aviso NUNCA altera pagamento, pedido, estoque ou
 *     cobrança. Resultado incerto → conferencia; jamais reenvio às cegas
 *     (retomada apenas por decisão humana: action 'retomar_aviso').
 *
 * Ações:
 *   { pedido_id }                             → garante código + aviso direto (idempotente).
 *   { action: 'retomar_aviso', pedido_id }    → decisão humana: libera aviso em
 *                                               conferência e reenvia uma única vez.
 *   { action: 'atribuir_numero', pedido_id } → apenas numera (usado na criação).
 *   { action: 'camisa_inscricao', ... }       → aviso direto da camisa vendida junto
 *                                               à inscrição (order bump), idempotente.
 *   { action: 'retroativo' }                  → numera antigos, reenvia os pagos no
 *                                               padrão atual e cancela avisos antigos
 *                                               pendentes do grupo.
 *
 * Porta de entrada: chamadas internas do backend (internal_secret do canal) ou admin.
 */

const LOCK_KEY = 'NUMERO_PEDIDO_CAMISA:GLOBAL';
const LOCK_TTL_MS = 30 * 1000;
const TIMEOUT_CHAMADA_MS = 20000;
const DEDUP_VERSAO = 'V2';
const MODEL_LABELS: Record<string, string> = { equipe: 'Equipe', jesus: 'Jesus', milagres: 'Milagres', filhas: 'Filhas' };
const ITEM_EMOJIS: Record<string, string> = { 'jesus|preta': '⚫', 'jesus|cereja': '🔴', 'milagres|': '🩷', 'filhas|': '⚪' };

function mc(res: any): number {
  return res?.updated ?? res?.modified_count ?? res?.modifiedCount ?? 0;
}

function hojeRecife(): string {
  return new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
}

function pad3(numero: number): string {
  return String(numero).padStart(3, '0');
}

// Código operacional exibido em toda parte: #M31NNN.
function codigoPedido(numero: number): string {
  return `#M31${pad3(numero)}`;
}

// Padrão visual dos itens: ⚫ Jesus · 🔴 Jesus · 🩷 Milagres · ⚪ Filhas.
function itemEmoji(modelo: any, cor: any): string {
  return ITEM_EMOJIS[`${String(modelo || '')}|${String(cor || '')}`] || '•';
}

function itemLabel(modelo: any, cor: any): string {
  if (modelo === 'jesus' && cor === 'preta') return 'Jesus Preta';
  if (modelo === 'jesus' && cor === 'cereja') return 'Jesus Cereja';
  if (modelo === 'milagres') return 'Milagres Rosa';
  if (modelo === 'filhas') return 'Filhas Off-white';
  return MODEL_LABELS[modelo] || modelo || 'Camisa';
}

function itensDulce(pedido: any): string {
  const itens = pedido.itens_cobrados || pedido.itens || [];
  return itens.map((i: any) => {
    const linha = `${itemEmoji(i.modelo, i.cor)} ${itemLabel(i.modelo, i.cor)}`;
    return i.tamanho ? `${linha} — ${i.tamanho}` : linha;
  }).join('\n');
}

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

// Chamada direta à UAZAPI — envio IMEDIATO (comunicação interna de operação).
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
        headers: { 'token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: destino, phone: destino, message, text: message }),
        signal: controller.signal,
      });
    } finally { clearTimeout(timer); }
    const body = await resp.text();
    return { ...interpretarResposta(resp.status, body), http_status: resp.status };
  } catch (e: any) {
    // Chamada INICIADA sem desfecho conhecido: ambíguo — nunca reenviar às cegas.
    return { resultado: 'incerto', message_id: null, http_status: 0, erro: `excecao_ou_timeout_apos_chamada: ${e?.message}`, resposta_resumo: '' };
  }
}

// Destino ÚNICO do aviso: número autorizado da Dulce na configuração operacional.
// Ausente = aviso fica pendente (fail-closed). Nenhum número fixo no código.
async function whatsappDulce(S: any): Promise<string | null> {
  const cfg = (await S.EventoM31Config.list('-created_date', 1))[0];
  const numero = String(cfg?.whatsapp_dulce || '').replace(/\D/g, '');
  return /^55\d{10,11}$/.test(numero) ? numero : null;
}

// ── CÓDIGO OPERACIONAL SEQUENCIAL IMUTÁVEL ──────────────────────────────
// Lock global (unique index em M31AutomacaoLock) + MAX+1 + verificação
// pós-escrita. Nunca sobrescreve número existente; duas compras simultâneas
// nunca recebem o mesmo número; nunca recalcula pela posição da lista.
async function atribuirNumero(S: any, pedido: any): Promise<number | null> {
  if (pedido.numero_pedido != null) return Number(pedido.numero_pedido);
  const executionId = crypto.randomUUID();
  let lockAdquirido = false;
  for (let tentativa = 0; tentativa < 6 && !lockAdquirido; tentativa++) {
    const ativos = await S.M31AutomacaoLock.filter({ chave: LOCK_KEY, ativo: true });
    const vivo = ativos.find((l: any) => new Date(l.expira_em) > new Date());
    if (!vivo && ativos.length > 0) {
      await S.M31AutomacaoLock.updateMany({ chave: LOCK_KEY, ativo: true }, { $set: { ativo: false } }).catch(() => {});
    }
    if (!vivo) {
      try {
        await S.M31AutomacaoLock.create({
          chave: LOCK_KEY, ativo: true, execution_id: executionId,
          criado_em: new Date().toISOString(),
          expira_em: new Date(Date.now() + LOCK_TTL_MS).toISOString(),
        });
        lockAdquirido = true;
        break;
      } catch (_) { /* outra execução ganhou o lock */ }
    }
    await new Promise((r) => setTimeout(r, 400 + Math.random() * 400));
  }
  if (!lockAdquirido) throw new Error('lock_numero_indisponivel');

  try {
    const atual = (await S.EventoM31CamisaPedido.filter({ id: pedido.id }, '-created_date', 1))[0];
    if (atual?.numero_pedido != null) return Number(atual.numero_pedido);
    const top = await S.EventoM31CamisaPedido.filter({ numero_pedido: { $gte: 1 } }, '-numero_pedido', 1);
    let numero = (top?.[0]?.numero_pedido || 0) + 1;
    const res = await S.EventoM31CamisaPedido.updateMany(
      { id: pedido.id, numero_pedido: null }, { $set: { numero_pedido: numero } });
    if (mc(res) !== 1) {
      const novo = (await S.EventoM31CamisaPedido.filter({ id: pedido.id }, '-created_date', 1))[0];
      return novo?.numero_pedido != null ? Number(novo.numero_pedido) : null;
    }
    // Verificação pós-escrita: duplicado por qualquer corrida → corrige para MAX+1.
    const duplicados = await S.EventoM31CamisaPedido.filter({ numero_pedido: numero }, '-created_date', 5);
    if (duplicados.filter((d: any) => d.id !== pedido.id).length > 0) {
      const top2 = await S.EventoM31CamisaPedido.filter({ numero_pedido: { $gte: 1 } }, '-numero_pedido', 1);
      numero = (top2?.[0]?.numero_pedido || numero) + 1;
      await S.EventoM31CamisaPedido.updateMany({ id: pedido.id }, { $set: { numero_pedido: numero } });
    }
    return numero;
  } finally {
    await S.M31AutomacaoLock.updateMany(
      { chave: LOCK_KEY, execution_id: executionId }, { $set: { ativo: false } }).catch(() => {});
  }
}

// ── AVISO DIRETO (idempotente) ───────────────────────────────────────────
async function avisarCompraConfirmada(S: any, pedido: any, retomadaHumana = false, notaSubstituido = false): Promise<string> {
  // Prova de envio direto (V2): status enviado SEM fila legada.
  if (pedido.aviso_dulce_status === 'enviado' && !pedido.aviso_dulce_fila_id) return 'ja_avisiado';
  const dedup = `${pedido.id}:COMPRA_CONFIRMADA:${DEDUP_VERSAO}`;
  const logs = await S.M31AutomacaoLog.filter({ idempotency_key: dedup, status: 'enviado' }, '-enviado_em', 1);
  if (logs.length > 0) {
    await S.EventoM31CamisaPedido.updateMany({ id: pedido.id }, { $set: { aviso_dulce_status: 'enviado', aviso_dulce_erro: null } }).catch(() => {});
    return 'ja_avisiado';
  }

  // Código operacional obrigatório no aviso.
  const numero = pedido.numero_pedido != null ? Number(pedido.numero_pedido) : await atribuirNumero(S, pedido);
  if (numero == null) return 'codigo_indisponivel';

  // KILL-SWITCH GLOBAL (freio de emergência humano): aviso fica pendente.
  const control = (await S.M31WhatsAppControl.filter({ data: hojeRecife() }, '-created_date', 1))[0];
  if (control?.bloqueado === true) {
    await S.EventoM31CamisaPedido.updateMany({ id: pedido.id }, { $set: { aviso_dulce_status: 'pendente', aviso_dulce_erro: 'kill_switch_global_ativo' } }).catch(() => {});
    return 'pendente_kill_switch';
  }

  // CLAIMS LEGADOS: o estado 'enfileirado' só existia no fluxo antigo (aviso via
  // grupo, desativado) — o claim no pedido era apenas trava de enfileiramento,
  // nunca prova de envio. Estados 'processando'/'conferencia' NUNCA são tocados
  // sem decisão humana.
  if (pedido.aviso_dulce_claim && pedido.aviso_dulce_status === 'enfileirado') {
    await S.EventoM31CamisaPedido.updateMany(
      { id: pedido.id, aviso_dulce_status: 'enfileirado' }, { $set: { aviso_dulce_claim: null } }).catch(() => {});
    pedido.aviso_dulce_claim = null;
  }

  // Retomada humana explícita de aviso em conferência: único caminho de
  // reenvio após resultado incerto/terminal — decisão da operadora, não automática.
  if (retomadaHumana && pedido.aviso_dulce_claim && pedido.aviso_dulce_status === 'conferencia') {
    await S.EventoM31CamisaPedido.updateMany(
      { id: pedido.id, aviso_dulce_status: 'conferencia' },
      { $set: { aviso_dulce_claim: null, aviso_dulce_status: 'pendente', aviso_dulce_erro: null } }).catch(() => {});
    pedido.aviso_dulce_claim = null;
  }

  // Claim no pedido: nunca dois envios concorrentes do mesmo aviso.
  const claim = crypto.randomUUID();
  const claimed = await S.EventoM31CamisaPedido.updateMany(
    { id: pedido.id, status_pagamento: 'pago', aviso_dulce_claim: null },
    { $set: { aviso_dulce_status: 'processando', aviso_dulce_claim: claim, aviso_dulce_claim_em: new Date().toISOString(), aviso_dulce_erro: null } });
  if (mc(claimed) !== 1) return 'aviso_em_conferencia';

  // FAIL-CLOSED: template ausente/inativo = não envia.
  const tpl = (await S.M31MessageTemplate.filter({ chave_unica: 'compra_confirmada_dulce', is_active: true }, '-updated_date', 1))[0];
  if (!tpl?.content) {
    await S.EventoM31CamisaPedido.updateMany({ id: pedido.id, aviso_dulce_claim: claim }, { $set: { aviso_dulce_status: 'pendente', aviso_dulce_claim: null, aviso_dulce_erro: 'template_ausente' } });
    return 'pendente_template_ausente';
  }

  // Destino DIRETO: WhatsApp autorizado da Dulce na configuração.
  const destino = await whatsappDulce(S);
  if (!destino) {
    await S.EventoM31CamisaPedido.updateMany({ id: pedido.id, aviso_dulce_claim: claim }, { $set: { aviso_dulce_status: 'pendente', aviso_dulce_claim: null, aviso_dulce_erro: 'whatsapp_dulce_nao_configurado' } });
    return 'pendente_dulce_ausente';
  }

  const itens = pedido.itens_cobrados || pedido.itens || [];
  const mensagemBase = tpl.content
    .replace(/\{\{codigo_pedido\}\}/g, codigoPedido(numero))
    .replace(/\{\{nome\}\}/g, pedido.nome || 'Compradora')
    .replace(/\{\{itens\}\}/g, itensDulce(pedido))
    .replace(/\{\{quantidade\}\}/g, String(pedido.quantidade ?? itens.length))
    .replace(/\{\{valor\}\}/g, Number(pedido.valor_total || 0).toFixed(2).replace('.', ','))
    .trim();
  if (/\{\{[^}]+\}\}/.test(mensagemBase)) {
    await S.EventoM31CamisaPedido.updateMany({ id: pedido.id, aviso_dulce_claim: claim }, { $set: { aviso_dulce_status: 'pendente', aviso_dulce_claim: null, aviso_dulce_erro: 'template_com_variavel_nao_renderizada' } });
    return 'pendente_template_invalido';
  }

  // SUBSTITUÍDO pago depois: sinaliza à Dulce a possível dupla compra válida.
  const mensagem = notaSubstituido
    ? `${mensagemBase}\n\n⚠️ ATENÇÃO: este pedido havia sido SUBSTITUÍDO por um pedido posterior — podem existir DUAS compras válidas da mesma compradora. Conferir com ela antes de produzir/entregar.`
    : mensagemBase;

  // ENVIO IMEDIATO — uma única chamada, resultado sempre registrado no pedido.
  const resultado = await chamarUAZAPI(destino, mensagem);
  const agora = new Date().toISOString();

  // Auditoria do disparo direto (a prova de aceite vive no pedido).
  await S.M31AutomacaoLog.create({
    participante_id: `DULCE:${destino}`,
    automacao: 'COMPRA_CONFIRMADA', template: 'compra_confirmada_dulce', versao: DEDUP_VERSAO,
    status: resultado.resultado === 'aceito' ? 'enviado' : 'bloqueado',
    enviado_em: agora, execution_id: claim, origem: 'm31AvisoCompraConfirmada:envio_direto',
    idempotency_key: dedup,
    ...(resultado.erro ? { motivo_bloqueio: resultado.erro } : {}),
  }).catch(() => {});

  // Desfecho no pedido — efeito separado: NUNCA toca pagamento/estoque/cobrança.
  if (resultado.resultado === 'aceito') {
    await S.EventoM31CamisaPedido.updateMany({ id: pedido.id, aviso_dulce_claim: claim },
      { $set: {
        aviso_dulce_status: 'enviado',
        aviso_dulce_enviado_em: agora,
        aviso_dulce_message_id: resultado.message_id || null,
        aviso_dulce_fila_id: null,
        aviso_dulce_erro: null,
        aviso_dulce_claim: null,
      } });
    return 'enviado';
  }
  if (resultado.resultado === 'incerto') {
    await S.EventoM31CamisaPedido.updateMany({ id: pedido.id, aviso_dulce_claim: claim },
      { $set: { aviso_dulce_status: 'conferencia', aviso_dulce_erro: 'Resultado incerto — conferir antes de reenviar.' } });
    return 'incerto';
  }
  if (resultado.resultado === 'falha_terminal') {
    await S.EventoM31CamisaPedido.updateMany({ id: pedido.id, aviso_dulce_claim: claim },
      { $set: { aviso_dulce_status: 'conferencia', aviso_dulce_erro: `Erro terminal: ${resultado.erro || ''}`.substring(0, 200) } });
    return 'falha_terminal';
  }
  // Rejeição clara: libera claim e fica pendente para nova tentativa controlada.
  await S.EventoM31CamisaPedido.updateMany({ id: pedido.id, aviso_dulce_claim: claim },
    { $set: { aviso_dulce_status: 'pendente', aviso_dulce_claim: null, aviso_dulce_erro: `Falha de envio: ${resultado.erro || ''}`.substring(0, 200) } });
  return 'falha';
}

// ── AVISO DIRETO DE CAMISA DE INSCRIÇÃO (order bump) ─────────────────────
// Sem pedido/código: a camisa pertence à inscrição. Idempotente por inscrição.
async function avisarCamisaInscricao(S: any, body: any): Promise<Response> {
  const inscricaoId = String(body?.inscricao_id || '').trim();
  const nome = String(body?.nome || '').trim();
  const itens = Array.isArray(body?.itens) ? body.itens : [];
  if (!inscricaoId || !nome || itens.length === 0) {
    return Response.json({ ok: false, erro: 'camisa_inscricao_dados_invalidos' }, { status: 400 });
  }
  const dedup = `${inscricaoId}:COMPRA_CONFIRMADA_INSCRICAO:V1`;
  const logs = await S.M31AutomacaoLog.filter(
    { idempotency_key: dedup, status: { $in: ['enviado', 'pendente', 'bloqueado'] } }, '-enviado_em', 1);
  if (logs.length > 0) return Response.json({ ok: true, aviso: 'ja_avisiado' });

  const tpl = (await S.M31MessageTemplate.filter({ chave_unica: 'compra_confirmada_dulce_inscricao', is_active: true }, '-updated_date', 1))[0];
  if (!tpl?.content) return Response.json({ ok: false, aviso: 'template_ausente_fail_closed' });

  const destino = await whatsappDulce(S);
  if (!destino) return Response.json({ ok: false, aviso: 'whatsapp_dulce_nao_configurado' });

  const itensTexto = itens.map((i: any) => {
    const linha = `${itemEmoji(i?.modelo, i?.cor)} ${itemLabel(i?.modelo, i?.cor)}`;
    return i?.tamanho ? `${linha} — ${i.tamanho}` : linha;
  }).join('\n');
  const observacao = String(body?.observacao || '').trim();
  const mensagem = tpl.content
    .replace(/\{\{nome\}\}/g, nome)
    .replace(/\{\{itens\}\}/g, itensTexto)
    .replace(/\{\{quantidade\}\}/g, String(body?.quantidade ?? itens.length))
    .replace(/\{\{valor\}\}/g, Number(body?.valor || 0).toFixed(2).replace('.', ','))
    .replace(/\{\{observacao\}\}/g, observacao)
    .trim();

  const resultado = await chamarUAZAPI(destino, mensagem);
  const agora = new Date().toISOString();
  await S.M31AutomacaoLog.create({
    participante_id: `INSCRICAO:${inscricaoId}`,
    automacao: 'COMPRA_CONFIRMADA', template: 'compra_confirmada_dulce_inscricao', versao: 'V1',
    // Aceito = enviado; qualquer outro desfecho = bloqueado (fail-closed: um
    // desfecho não-aceito NUNCA autoriza novo disparo automático da inscrição).
    status: resultado.resultado === 'aceito' ? 'enviado' : 'bloqueado',
    enviado_em: agora, execution_id: crypto.randomUUID(), origem: 'm31AvisoCompraConfirmada:camisa_inscricao',
    idempotency_key: dedup,
    ...(resultado.erro ? { motivo_bloqueio: resultado.erro } : {}),
  }).catch(() => {});
  return Response.json({ ok: resultado.resultado === 'aceito', aviso: resultado.resultado });
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    // Porta de entrada: chamadas internas do backend (segredo do canal) ou admin.
    const internalSecret = config('UAZAPI_TOKEN');
    if (!internalSecret || body?.internal_secret !== internalSecret) {
      const user = await base44.auth.me().catch(() => null);
      if (user?.role !== 'admin') return Response.json({ error: 'forbidden' }, { status: 403 });
    }
    const S = base44.asServiceRole.entities;

    // Camisa de inscrição (order bump): aviso direto idempotente, sem pedido.
    if (body?.action === 'camisa_inscricao') {
      return await avisarCamisaInscricao(S, body);
    }

    // Apenas numerar (usado na criação do pedido) — sem aviso.
    if (body?.action === 'atribuir_numero') {
      const pedido = (await S.EventoM31CamisaPedido.filter({ id: body.pedido_id }, '-created_date', 1))[0];
      if (!pedido) return Response.json({ ok: false, erro: 'pedido_nao_encontrado' }, { status: 404 });
      const numero = await atribuirNumero(S, pedido);
      return Response.json({ ok: numero != null, numero_pedido: numero });
    }

    // RETROATIVO: numera pedidos antigos pela ordem original de criação,
    // reenvia TODOS os pagos no padrão atual (direto à Dulce) e cancela os
    // avisos antigos pendentes destinados ao grupo.
    if (body?.action === 'retroativo') {
      const relatorio: any = { numerados: 0, avisos_enviados: 0, ja_avisiados: 0, pendentes: 0, incertos: 0, falhas: 0, avisos_antigos_cancelados: 0, detalhes: [] };

      const semNumero = await S.EventoM31CamisaPedido.filter({ numero_pedido: null }, 'created_date', 500);
      for (const pedido of semNumero || []) {
        try {
          const n = await atribuirNumero(S, pedido);
          if (n != null) relatorio.numerados++;
        } catch (e: any) { relatorio.detalhes.push({ pedido_id: pedido.id, erro: `numero: ${e?.message}` }); }
      }

      // Fila antiga encerrada: cancelar apenas PENDENTES de camisa destinados
      // ao grupo. Histórico (enviados/cancelados) permanece intacto.
      const antigos = await S.M31FilaMensagem.filter(
        { automacao: { $in: ['ALERTA_NOVO_PEDIDO_CAMISA', 'ALERTA_CAMISA_PAGA'] }, status: { $in: ['pendente', 'processando'] } },
        '-created_date', 500);
      const idsGrupo = (antigos || []).filter((f: any) => String(f.telefone || '').includes('@g.us')).map((f: any) => f.id);
      if (idsGrupo.length > 0) {
        const cancelados = await S.M31FilaMensagem.updateMany(
          { id: { $in: idsGrupo }, status: { $in: ['pendente', 'processando'] } },
          { $set: { status: 'cancelado', erro: 'Fluxo antigo encerrado: para camisas existe apenas COMPRA CONFIRMADA direto à Dulce.', processado_em: new Date().toISOString() } }
        ).catch(() => null);
        if (cancelados) relatorio.avisos_antigos_cancelados = mc(cancelados);
      }

      const pagos = await S.EventoM31CamisaPedido.filter({ status_pagamento: 'pago' }, 'created_date', 500);
      for (const pedido of pagos || []) {
        try {
          const desfecho = await avisarCompraConfirmada(S, pedido);
          if (desfecho === 'enviado') relatorio.avisos_enviados++;
          else if (desfecho === 'ja_avisiado') relatorio.ja_avisiados++;
          else if (['incerto', 'falha_terminal', 'aviso_em_conferencia'].includes(desfecho)) relatorio.incertos++;
          else if (desfecho === 'falha') relatorio.falhas++;
          else relatorio.pendentes++;
        } catch (e: any) {
          relatorio.falhas++;
          relatorio.detalhes.push({ pedido_id: pedido.id, erro: e?.message });
        }
      }
      return Response.json({ ok: true, ...relatorio });
    }

    // Padrão: garantir código + aviso direto do pedido informado.
    // 'retomar_aviso' = decisão humana para aviso em conferência.
    const retomadaHumana = body?.action === 'retomar_aviso';
    const pedido = (await S.EventoM31CamisaPedido.filter({ id: body?.pedido_id }, '-created_date', 1))[0];
    if (!pedido) return Response.json({ ok: false, erro: 'pedido_nao_encontrado' }, { status: 404 });
    if (pedido.status_pagamento !== 'pago') return Response.json({ ok: false, aviso: 'pedido_nao_pago' }, { status: 409 });
    const aviso = await avisarCompraConfirmada(S, pedido, retomadaHumana, body?.nota_substituido === true);
    return Response.json({ ok: ['enviado', 'ja_avisiado'].includes(aviso), aviso });
  } catch (error) {
    return Response.json({ error: (error as Error)?.message || 'falha_aviso_compra_confirmada' }, { status: 500 });
  }
})(req);
}
