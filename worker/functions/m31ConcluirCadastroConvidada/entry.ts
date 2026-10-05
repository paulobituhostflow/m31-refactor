// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31ConcluirCadastroConvidada
 *
 * Recebe o formulário público da presenteada, valida o token, atualiza o cadastro
 * e LIBERA a inscrição para o único orquestrador de envio (m31DespacharConfirmacoes).
 *
 * Esta função NÃO envia QR Code nem boas-vindas — não há segundo escritor de QR.
 * Apenas:
 *   1. valida o link (token);
 *   2. valida duplicidade do whatsapp, mesmo pré-preenchido (excluindo a própria inscrição);
 *   3. grava os dados completos + marca cadastro_pendente=false;
 *   4. seta liberada_para_envio=true e dispara m31DespacharConfirmacoes(inscricao_id).
 *
 * Correção controlada de WhatsApp: preserva presenteado_whatsapp_original.
 *
 * Payload: { token, nome, whatsapp, email?, cidade?, estado?, faz_parte_igreja?, nome_igreja?, como_conheceu? }
 */

// ═══ NÚCLEO DE NORMALIZAÇÃO M31 — ONDA 2 (regra ÚNICA; espelho de src/lib/m31Normalizar.js) ═══
function m31Telefone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return { valor: '', desfecho: 'irrecuperavel', motivo: 'telefone_vazio' };
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return { valor: d, desfecho: 'certo', motivo: null };
  if (d.length === 10 || d.length === 11) return { valor: `55${d}`, desfecho: 'certo', motivo: null };
  if (d.length === 8 || d.length === 9) return { valor: d, desfecho: 'duvidoso', motivo: 'sem_ddd' };
  if (d.length > 13) return { valor: d, desfecho: 'duvidoso', motivo: 'digitos_excedentes' };
  return { valor: d, desfecho: 'irrecuperavel', motivo: 'telefone_curto' };
}
function m31Email(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return { valor: '', desfecho: 'certo', motivo: null };
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { valor: v, desfecho: 'certo', motivo: null };
  return { valor: v, desfecho: 'duvidoso', motivo: 'email_suspeito' };
}
function m31Revisao(originais, resultados) {
  const motivos = resultados.filter((r) => r && r.desfecho === 'duvidoso').map((r) => r.motivo);
  if (motivos.length === 0) return { revisao_dados: false, revisao_motivos: [] };
  return {
    revisao_dados: true,
    revisao_motivos: motivos,
    revisao_valores_originais: JSON.stringify(originais).slice(0, 500),
    revisao_em: new Date().toISOString(),
  };
}
return (async (req: Request): Promise<Response> => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { token, nome, whatsapp, email, cidade, estado, faz_parte_igreja, nome_igreja, como_conheceu } = body;

    if (!token || typeof token !== 'string' || token.length < 20) {
      return Response.json({ success: false, error: 'Link inválido.' }, { status: 400 });
    }

    const inscricoes = await base44.asServiceRole.entities.EventoM31Inscricao.filter({ presenteado_token: token });
    if (!inscricoes || inscricoes.length === 0) {
      return Response.json({ success: false, error: 'Este link não é válido.' }, { status: 404 });
    }
    const inscricao = inscricoes[0];

    if (!['aprovado', 'gratuito'].includes(inscricao.status_pagamento)) {
      return Response.json({ success: false, error: 'Inscrição não está paga.' }, { status: 400 });
    }

    // Já concluído: idempotente
    if (inscricao.cadastro_pendente === false) {
      return Response.json({ success: true, ja_concluido: true });
    }

    // Nome e WhatsApp são obrigatórios; demais dados são opcionais.
    if (typeof nome !== 'string' || !nome.trim() || nome.trim() === 'Abençoada por Tekinha — cadastro pendente') {
      return Response.json({ success: false, error: 'Informe seu nome completo.' }, { status: 400 });
    }
    const telRes = m31Telefone(whatsapp);
    if (typeof whatsapp !== 'string' || !/^55[1-9]\d9\d{8}$/.test(telRes.valor)) {
      return Response.json({ success: false, error: 'Informe um WhatsApp válido com DDD e nove dígitos.' }, { status: 400 });
    }
    const emailRes = m31Email(email);
    if (emailRes.valor && emailRes.desfecho !== 'certo') {
      return Response.json({ success: false, error: 'Informe um e-mail válido.' }, { status: 400 });
    }

    // WhatsApp: pré-preenchido, mas correção controlada
    const whatsappOriginal = inscricao.presenteado_whatsapp_original || inscricao.whatsapp;
    const whatsappFinal = telRes.valor;
    const revisao = m31Revisao({ whatsapp: whatsapp || inscricao.whatsapp || '', email: email || '' }, [telRes, emailRes]);
    // Conferir mesmo quando o número veio pré-preenchido: pode estar compartilhado.
    const comMesmoNumero = await base44.asServiceRole.entities.EventoM31Inscricao.filter({ whatsapp: whatsappFinal });
    const conflito = comMesmoNumero.find((i: any) =>
      i.id !== inscricao.id && i.status_pagamento !== 'cancelado'
    );
    if (conflito) {
      return Response.json({
        success: false,
        error: 'Este WhatsApp já está vinculado a outra inscrição. Verifique o número ou entre em contato com a organização.',
      }, { status: 409 });
    }

    // Atualizar cadastro — grava dados, marca cadastro completo e LIBERA para o despachador
    const updateData: Record<string, any> = {
      ...revisao,
      ...(emailRes.valor ? { email: emailRes.valor } : {}),
      ...(typeof cidade === 'string' && cidade.trim() ? { cidade: cidade.trim() } : {}),
      whatsapp: whatsappFinal,
      presenteado_whatsapp_original: whatsappOriginal,
      cadastro_pendente: false,
      liberada_para_envio: true,
      liberada_para_envio_em: new Date().toISOString(),
    };
    updateData.nome = nome.trim();
    if (estado) updateData.estado = estado;
    if (typeof faz_parte_igreja === 'boolean') updateData.faz_parte_igreja = faz_parte_igreja;
    if (nome_igreja !== undefined) updateData.nome_igreja = nome_igreja || '';
    if (como_conheceu) updateData.como_conheceu = como_conheceu;

    await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, updateData);

    // ÚNICO orquestrador de mensagem/QR: m31DespacharConfirmacoes.
    // Esta função não envia nada — apenas dispara o despachador para a inscrição liberada.
    let despacho = null;
    try {
      const res = await base44.asServiceRole.functions.invoke('m31DespacharConfirmacoes', { inscricao_id: inscricao.id });
      despacho = res?.data || null;
    } catch (e) {
      logger.error('[ConcluirCadastro] Falha ao disparar despachador:', e?.message);
    }

    return Response.json({ success: true, inscricao_id: inscricao.id, despacho });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
})(req);
}
