// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31RegistrarIntencao — PONTO ÚNICO DE PERSISTÊNCIA DA INTENÇÃO DE INSCRIÇÃO
 *
 * REGRA PERMANENTE: assim que existir Nome + WhatsApp válido, a intenção é
 * persistida AQUI, ANTES de qualquer etapa que possa falhar (checkout, Asaas,
 * gateway, e-mail). Ninguém com Nome + WhatsApp pode desaparecer do funil.
 *
 * É idempotente e NUNCA cria uma inscrição nova por tentativa: localiza o
 * registro existente da pessoa (telefone → CPF) e avança o MESMO registro na
 * máquina de etapas:
 *   iniciou → contato_capturado → tentou_avancar → checkout_criado → pagamento_confirmado
 *
 * Também é o ponto onde a falha técnica é marcada NA PRÓPRIA INSCRIÇÃO
 * (falha_tecnica + etapa + http + erro), o que separa falha nossa de abandono.
 *
 * Público (chamado pelo formulário). Não dispara nenhuma mensagem.
 */

const ORDEM_ETAPAS = ['iniciou', 'contato_capturado', 'tentou_avancar', 'checkout_criado', 'pagamento_confirmado'];
const STATUS_FINAIS = ['aprovado', 'gratuito', 'cancelado'];

// ═══════════════════════════════════════════════════════════════════════════
// NÚCLEO DE NORMALIZAÇÃO M31 — ONDA 2 (regra ÚNICA de escrita)
// Espelho exato de src/lib/m31Normalizar.js (funções Deno não aceitam import local).
// Desfechos: 'certo' (normaliza e grava) | 'duvidoso' (PRESERVA o valor informado e
// sinaliza revisão — nunca bloqueia) | 'irrecuperavel' (contato impossível).
// ═══════════════════════════════════════════════════════════════════════════
function m31Telefone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  while (d.startsWith('5555')) d = d.slice(2);
  if (!d) return { valor: '', desfecho: 'irrecuperavel', motivo: 'telefone_vazio' };
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return { valor: d, desfecho: 'certo', motivo: null };
  if (d.length === 10 || d.length === 11) return { valor: `55${d}`, desfecho: 'certo', motivo: null };
  if (d.length === 8 || d.length === 9) return { valor: d, desfecho: 'duvidoso', motivo: 'sem_ddd' };
  if (d.length > 13) return { valor: d, desfecho: 'duvidoso', motivo: 'digitos_excedentes' };
  return { valor: d, desfecho: 'irrecuperavel', motivo: 'telefone_curto' };
}
function m31Cpf(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (!d) return { valor: '', desfecho: 'certo', motivo: null };
  if (d.length === 11) return { valor: d, desfecho: 'certo', motivo: null };
  return { valor: d, desfecho: 'duvidoso', motivo: 'cpf_incompleto' };
}
function m31Email(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return { valor: '', desfecho: 'certo', motivo: null };
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { valor: v, desfecho: 'certo', motivo: null };
  return { valor: v, desfecho: 'duvidoso', motivo: 'email_suspeito' };
}
// Sinalização de revisão: preserva os valores ORIGINAIS e lista os motivos.
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

function novoToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Nunca retrocede a etapa do funil
function maiorEtapa(atual, nova) {
  const a = ORDEM_ETAPAS.indexOf(atual || '');
  const n = ORDEM_ETAPAS.indexOf(nova || '');
  return n > a ? nova : (atual || nova);
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const sr = base44.asServiceRole.entities;

    const nome = (body.nome || '').trim();
    const telRes = m31Telefone(body.whatsapp || body.telefone || '');
    const cpfRes = m31Cpf(body.cpf);
    const emailRes = m31Email(body.email);
    const telefone = telRes.valor;
    const cpf = cpfRes.desfecho === 'certo' ? cpfRes.valor : '';
    const etapa = ORDEM_ETAPAS.includes(body.etapa) ? body.etapa : 'contato_capturado';
    const revisao = m31Revisao(
      { whatsapp: body.whatsapp || body.telefone || '', cpf: body.cpf || '', email: body.email || '' },
      [telRes, cpfRes, emailRes],
    );

    // Só bloqueia quando o contato é IMPOSSÍVEL — formato duvidoso segue no funil.
    if (!nome || telRes.desfecho === 'irrecuperavel') {
      return Response.json({ error: 'nome e whatsapp válidos são obrigatórios' }, { status: 400 });
    }

    // ── 1. Localizar o MESMO registro da pessoa (telefone → CPF) ──
    let encontradas = await sr.EventoM31Inscricao.filter({ whatsapp: telefone }, '-created_date', 5);
    if (encontradas.length === 0 && cpf) {
      encontradas = await sr.EventoM31Inscricao.filter({ cpf }, '-created_date', 5);
    }
    // Nunca reaproveitar registro já finalizado (pago/cancelado)
    const alvo = encontradas.find((i) => !STATUS_FINAIS.includes(i.status_pagamento));
    const jaPaga = encontradas.find((i) => ['aprovado', 'gratuito'].includes(i.status_pagamento));

    if (jaPaga && !alvo) {
      return Response.json({
        registrado: true, ja_inscrita: true,
        inscricao_id: jaPaga.id, etapa_funil: 'pagamento_confirmado',
      });
    }

    // ── 2. Dados opcionais (só sobrescrevem quando vierem preenchidos) ──
    const dados = { nome, whatsapp: telefone };
    if (cpf) dados.cpf = cpf;
    if (emailRes.valor) dados.email = emailRes.valor;
    if (body.cidade) dados.cidade = String(body.cidade).trim();
    if (body.estado) dados.estado = body.estado;
    if (body.como_conheceu) dados.como_conheceu = body.como_conheceu;
    if (body.nome_igreja) dados.nome_igreja = String(body.nome_igreja).trim();
    if (typeof body.faz_parte_igreja === 'boolean') dados.faz_parte_igreja = body.faz_parte_igreja;
    if (typeof body.ja_participou_m31 === 'boolean') dados.ja_participou_m31 = body.ja_participou_m31;

    // ── 3. Rastro do funil (sempre gravado) ──
    const agora = new Date().toISOString();
    const temFalha = body.falha_http !== undefined && body.falha_http !== null;
    const rastro = {
      ...revisao,
      etapa_funil_em: agora,
      ultima_acao: body.ultima_acao || (temFalha ? 'falha_tecnica' : `etapa_${etapa}`),
      falha_tecnica: !!temFalha,
    };
    if (temFalha) {
      rastro.falha_tecnica_em = agora;
      rastro.falha_tecnica_etapa = body.falha_etapa || 'checkout';
      rastro.falha_tecnica_http = Number(body.falha_http) || 0;
      rastro.falha_tecnica_erro = String(body.falha_erro || '').slice(0, 500);
    }

    // ── 4. Avançar o MESMO registro, ou criar a intenção uma única vez ──
    if (alvo) {
      // Promove a chave de dedup TEL:→CPF: quando o CPF chega, para o checkout
      // reconhecer o MESMO registro e nunca criar uma inscrição paralela.
      const promoverDedup = cpf && (alvo.dedup_key || '').startsWith('TEL:')
        ? { dedup_key: `CPF:${cpf}` } : {};
      await sr.EventoM31Inscricao.update(alvo.id, {
        ...dados,
        ...rastro,
        ...promoverDedup,
        etapa_funil: maiorEtapa(alvo.etapa_funil, etapa),
        retomada_token: alvo.retomada_token || novoToken(),
      });
      const atualizada = await sr.EventoM31Inscricao.get(alvo.id);
      return Response.json({
        registrado: true, criado: false,
        inscricao_id: atualizada.id,
        etapa_funil: atualizada.etapa_funil,
        retomada_token: atualizada.retomada_token,
      });
    }

    const criada = await sr.EventoM31Inscricao.create({
      ...dados,
      ...rastro,
      tipo: body.tipo || 'publico_geral',
      lote: body.lote || null,
      etapa_funil: etapa,
      status_pagamento: 'checkout_pendente',
      origem_inscricao: 'ASAAS',
      dedup_key: cpf ? `CPF:${cpf}` : `TEL:${telefone}`,
      retomada_token: novoToken(),
      priority: 'high',
      recovery_attempts: 0,
      observacoes: 'intencao_registrada: formulario_publico',
    });

    return Response.json({
      registrado: true, criado: true,
      inscricao_id: criada.id,
      etapa_funil: criada.etapa_funil,
      retomada_token: criada.retomada_token,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
