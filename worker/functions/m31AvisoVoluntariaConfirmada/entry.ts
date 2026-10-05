// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31AvisoVoluntariaConfirmada — Aviso OPERACIONAL IMEDIATO e DIRETO ao WhatsApp
 * autorizado da Pastora Edilândia (acompanhamento das inscrições de voluntárias)
 * quando a inscrição de uma voluntária é EFETIVAMENTE confirmada.
 *
 * Regras permanentes (espelho do padrão da Dulce / m31AvisoCompraConfirmada):
 *   - Envio DIRETO ao número cadastrado em EventoM31Config.whatsapp_edilandia
 *     (fonte única — nenhum número fixo no código). NUNCA passa por
 *     M31FilaMensagem: sem cooldown, limite diário, janela comercial, delay
 *     ou régua. Respeita apenas o kill-switch global (freio de emergência).
 *   - Disparo ÚNICO por inscrição: dedup {inscricao_id}:AVISO_VOLUNTARIA_EDILANDIA:V1.
 *     Webhook repetido NUNCA gera segundo aviso.
 *   - Falha/incerteza do aviso NUNCA altera o estado da inscrição.
 *   - FAIL-CLOSED: template 'aviso_voluntaria_edilandia' ausente/inativo = não envia.
 *
 * Ações:
 *   { inscricao_id }        → aviso direto da voluntária confirmada (idempotente).
 *   { action: 'resumo' }    → lista consolidada das voluntárias já confirmadas
 *                             (nome, setor, tamanho da camisa), em blocos de 30.
 *
 * Porta de entrada: chamadas internas do backend (internal_secret do canal) ou admin.
 */

const TIMEOUT_CHAMADA_MS = 20000;
const DEDUP_VERSAO = 'V1';

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

function hojeRecife(): string {
  return new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
}

// Destino ÚNICO do aviso: número autorizado da Pastora Edilândia na configuração
// operacional. Ausente = aviso fica pendente (fail-closed). Nenhum número fixo no código.
async function whatsappEdilandia(S: any): Promise<string | null> {
  const cfg = (await S.EventoM31Config.list('-created_date', 1))[0];
  const numero = String(cfg?.whatsapp_edilandia || '').replace(/\D/g, '');
  return /^55\d{10,11}$/.test(numero) ? numero : null;
}

// KILL-SWITCH GLOBAL (freio de emergência humano): aviso fica pendente, sem log
// de dedup — nova tentativa ocorre no próximo acionamento após liberar o freio.
async function killSwitchAtivo(S: any): Promise<boolean> {
  const control = (await S.M31WhatsAppControl.filter({ data: hojeRecife() }, '-created_date', 1))[0];
  return control?.bloqueado === true;
}

// Tamanho da camisa da voluntária: perfil em EventoM31Voluntario (fonte oficial
// do formulário Servir) com fallback para o campo da inscrição.
async function tamanhoCamisa(S: any, inscricao: any): Promise<string | null> {
  const vol = (await S.EventoM31Voluntario.filter({ inscricao_id: inscricao.id }, '-updated_date', 1))[0];
  return vol?.tamanho_camiseta || inscricao.tamanho_camisa || null;
}

// ── AVISO INDIVIDUAL (idempotente por inscrição) ─────────────────────────
async function avisarVoluntaria(S: any, inscricao: any): Promise<{ ok: boolean; aviso: string }> {
  const dedup = `${inscricao.id}:AVISO_VOLUNTARIA_EDILANDIA:${DEDUP_VERSAO}`;
  const logs = await S.M31AutomacaoLog.filter(
    { idempotency_key: dedup, status: { $in: ['enviado', 'bloqueado'] } }, '-enviado_em', 1);
  if (logs.length > 0) return { ok: true, aviso: 'ja_avisiado' };

  // FAIL-CLOSED: template ausente/inativo = não envia.
  const tpl = (await S.M31MessageTemplate.filter({ chave_unica: 'aviso_voluntaria_edilandia', is_active: true }, '-updated_date', 1))[0];
  if (!tpl?.content) return { ok: false, aviso: 'template_ausente_fail_closed' };

  const destino = await whatsappEdilandia(S);
  if (!destino) return { ok: false, aviso: 'whatsapp_edilandia_nao_configurado' };

  if (await killSwitchAtivo(S)) return { ok: false, aviso: 'pendente_kill_switch' };

  const tamanho = await tamanhoCamisa(S, inscricao);
  const mensagem = tpl.content
    .replace(/\{\{nome\}\}/g, inscricao.nome || 'Voluntária')
    .replace(/\{\{setor\}\}/g, inscricao.area_voluntario || '—')
    .replace(/\{\{tamanho_camisa\}\}/g, tamanho || 'não informado')
    .trim();

  const resultado = await chamarUAZAPI(destino, mensagem);
  await S.M31AutomacaoLog.create({
    participante_id: `EDILANDIA:${destino}`,
    inscricao_principal: inscricao.id,
    automacao: 'AVISO_VOLUNTARIA', template: 'aviso_voluntaria_edilandia', versao: DEDUP_VERSAO,
    // Aceito = enviado; desfecho não-aceito = bloqueado (fail-closed: NUNCA
    // reenvio automático às cegas — retomada apenas por decisão humana).
    status: resultado.resultado === 'aceito' ? 'enviado' : 'bloqueado',
    enviado_em: new Date().toISOString(), execution_id: crypto.randomUUID(),
    origem: 'm31AvisoVoluntariaConfirmada:voluntaria',
    idempotency_key: dedup,
    ...(resultado.erro ? { motivo_bloqueio: resultado.erro } : {}),
  }).catch(() => {});
  return { ok: resultado.resultado === 'aceito', aviso: resultado.resultado };
}

// ── RESUMO CONSOLIDADO: todas as voluntárias já confirmadas ──────────────
async function resumoVoluntarias(S: any): Promise<{ ok: boolean; aviso: string; total?: number; mensagens?: number }> {
  const destino = await whatsappEdilandia(S);
  if (!destino) return { ok: false, aviso: 'whatsapp_edilandia_nao_configurado' };
  if (await killSwitchAtivo(S)) return { ok: false, aviso: 'pendente_kill_switch' };

  const vols = await S.EventoM31Inscricao.filter(
    { tipo: 'voluntario', status_pagamento: { $in: ['aprovado', 'gratuito'] } }, 'nome', 500);
  if (!vols || vols.length === 0) return { ok: false, aviso: 'sem_voluntarias_confirmadas' };

  const perfis = await S.EventoM31Voluntario.filter({}, '-updated_date', 500);
  const tamanhoDe = new Map<string, string>();
  for (const p of perfis || []) {
    if (p.inscricao_id && p.tamanho_camiseta && !tamanhoDe.has(p.inscricao_id)) tamanhoDe.set(p.inscricao_id, p.tamanho_camiseta);
  }

  const linhas = vols.map((v: any) => {
    const tamanho = tamanhoDe.get(v.id) || v.tamanho_camisa || '?';
    const setor = v.area_voluntario ? ` — ${v.area_voluntario}` : '';
    return `• ${v.nome}${setor} — camisa ${tamanho}`;
  });

  // Blocos de 30 linhas — mensagem longa demais não entrega no WhatsApp.
  const POR_BLOCO = 30;
  const blocos: string[] = [];
  for (let i = 0; i < linhas.length; i += POR_BLOCO) {
    blocos.push(`📋 VOLUNTÁRIAS CONFIRMADAS — ${vols.length} no total\n\n${linhas.slice(i, i + POR_BLOCO).join('\n')}`);
  }

  let enviados = 0;
  for (const bloco of blocos) {
    const resultado = await chamarUAZAPI(destino, bloco);
    if (resultado.resultado === 'aceito') enviados++;
    else return { ok: false, aviso: `falha_no_bloco_${enviados + 1}:${resultado.resultado}` };
  }
  return { ok: true, aviso: 'resumo_enviado', total: vols.length, mensagens: enviados };
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

    // Resumo consolidado (lista atual de voluntárias confirmadas).
    if (body?.action === 'resumo') {
      const r = await resumoVoluntarias(S);
      return Response.json(r, { status: r.ok ? 200 : 409 });
    }

    // Padrão: aviso direto da voluntária informada (idempotente).
    const inscricaoId = String(body?.inscricao_id || '').trim();
    if (!inscricaoId) return Response.json({ error: 'inscricao_id obrigatório' }, { status: 400 });
    const inscricao = (await S.EventoM31Inscricao.filter({ id: inscricaoId }, '-created_date', 1))[0];
    if (!inscricao) return Response.json({ ok: false, erro: 'inscricao_nao_encontrada' }, { status: 404 });
    if (inscricao.tipo !== 'voluntario') return Response.json({ ok: false, aviso: 'inscricao_nao_voluntaria' }, { status: 409 });
    if (!['aprovado', 'gratuito'].includes(inscricao.status_pagamento)) {
      return Response.json({ ok: false, aviso: 'inscricao_nao_confirmada' }, { status: 409 });
    }
    const r = await avisarVoluntaria(S, inscricao);
    return Response.json(r, { status: r.ok ? 200 : 409 });
  } catch (error) {
    return Response.json({ error: (error as Error)?.message || 'falha_aviso_voluntaria' }, { status: 500 });
  }
})(req);
}
