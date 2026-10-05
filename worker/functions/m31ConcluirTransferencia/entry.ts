// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.
import { prepararCartinhaTransferencia } from './cartinhaTransferencia.js';
import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31ConcluirTransferencia — CONCLUSÃO PÚBLICA (sem login)
 *
 * Substitui o TITULAR de uma inscrição pelos dados de um novo participante.
 *
 * PRINCÍPIO INTOCÁVEL: altera SOMENTE nome/cpf/whatsapp/email/cidade do
 * participante. NUNCA toca em pagamento, Asaas, cobrança, installment_id,
 * payment_id, valor, descontos, histórico financeiro. O pagamento continua
 * vinculado à mesma compra (mesma inscricao_id, mesmos IDs financeiros).
 *
 * Payload: { token, nome, cpf, whatsapp, email?, cidade? }
 * Response: { success, ... } | { error, code }
 *
 * Uso único: ao concluir, o token é invalidado (status=concluida).
 * Idempotência de mensagem futura: garantida por saudacao/estado desacoplado —
 * este endpoint NÃO dispara cadeia síncrona de outras funções.
 */

function soDigitos(v) { return (v || '').replace(/\D/g, ''); }

// Validação de CPF (dígitos verificadores)
function cpfValido(cpfRaw) {
  const cpf = soDigitos(cpfRaw);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(cpf[i]) * (10 - i);
  let d1 = 11 - (soma % 11);
  if (d1 >= 10) d1 = 0;
  if (d1 !== parseInt(cpf[9])) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(cpf[i]) * (11 - i);
  let d2 = 11 - (soma % 11);
  if (d2 >= 10) d2 = 0;
  return d2 === parseInt(cpf[10]);
}

// Normaliza WhatsApp BR para 13 dígitos (55 + DDD + 9 dígitos)
function normalizarWhatsApp(v) {
  let d = soDigitos(v);
  if (d.length === 11) d = '55' + d;            // DDD + 9 dígitos
  else if (d.length === 10) {                    // DDD + 8 dígitos (sem o 9)
    d = '55' + d.slice(0, 2) + '9' + d.slice(2);
  } else if (d.length === 12 && d.startsWith('55')) {
    d = '55' + d.slice(2, 4) + '9' + d.slice(4);
  }
  return d;
}
function whatsappFormatoValido(v) {
  const d = normalizarWhatsApp(v);
  return d.length === 13 && d.startsWith('55');
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { token, nome, cpf, whatsapp, email, cidade } = body || {};

    if (!token) return Response.json({ error: 'token é obrigatório', code: 'token_ausente' }, { status: 400 });

    // ── Localizar transferência pelo token ──
    const encontrados = await base44.asServiceRole.entities.M31TransferenciaInscricao.filter({ token }, null, 1);
    const transferencia = encontrados?.[0];
    if (!transferencia) {
      return Response.json({ error: 'Link inválido.', code: 'nao_encontrado' }, { status: 404 });
    }

    // ── Validar estado do token ──
    if (transferencia.status === 'concluida') {
      return Response.json({ error: 'Esta transferência já foi concluída.', code: 'concluida' }, { status: 409 });
    }
    const agora = new Date();
    const nowIso = agora.toISOString();
    if (transferencia.status === 'expirada' ||
        (transferencia.token_expira_em && agora >= new Date(transferencia.token_expira_em))) {
      // marca como expirada (best-effort) e bloqueia
      if (transferencia.status !== 'expirada') {
        await base44.asServiceRole.entities.M31TransferenciaInscricao.update(transferencia.id, { status: 'expirada' }).catch(() => {});
      }
      return Response.json({ error: 'Este link de transferência expirou.', code: 'expirada' }, { status: 410 });
    }

    // ── Freio único: data_limite_transferencia ──
    const configs = await base44.asServiceRole.entities.EventoM31Config.list('-created_date', 1);
    const dataLimite = configs?.[0]?.data_limite_transferencia || null;
    if (dataLimite && agora >= new Date(dataLimite)) {
      return Response.json({ error: 'O prazo para transferências deste evento já encerrou.', code: 'prazo_evento' }, { status: 410 });
    }

    // ── Validar dados do novo titular ──
    if (!nome || !nome.trim()) return Response.json({ error: 'Nome é obrigatório.', code: 'nome_invalido' }, { status: 400 });
    if (!cpfValido(cpf)) return Response.json({ error: 'CPF inválido.', code: 'cpf_invalido' }, { status: 400 });
    if (!whatsappFormatoValido(whatsapp)) return Response.json({ error: 'WhatsApp em formato inválido.', code: 'whatsapp_invalido' }, { status: 400 });

    const cpfNovo = soDigitos(cpf);
    const whatsappNovo = normalizarWhatsApp(whatsapp);

    // ── Inscrição alvo ──
    const inscricao = await base44.asServiceRole.entities.EventoM31Inscricao.get(transferencia.inscricao_id);
    if (!inscricao) return Response.json({ error: 'Inscrição não encontrada.', code: 'inscricao_ausente' }, { status: 404 });
    // Mesmo se o fechamento do token falhar após o CAS, nunca reaplicar a troca.
    if (inscricao.cartinha_historico?.some(h => h.transferencia_id === transferencia.id)) {
      return Response.json({ error: 'Esta transferência já foi aplicada. A organização pode conferir a conclusão.', code: 'concluida' }, { status: 409 });
    }

    // ── CPF do novo titular não pode ter outra inscrição ATIVA neste evento ──
    // (ativa = não cancelada). Ignora a própria inscrição sendo transferida.
    const mesmoCpf = await base44.asServiceRole.entities.EventoM31Inscricao.filter({ cpf: cpfNovo }, null, 50);
    const conflito = (mesmoCpf || []).some(
      (i) => i.id !== inscricao.id && i.status_pagamento !== 'cancelado'
    );
    if (conflito) {
      return Response.json({
        error: 'Já existe uma inscrição ativa para este CPF. Entre em contato com a organização.',
        code: 'cpf_duplicado',
      }, { status: 409 });
    }

    // ── Snapshot do titular anterior (append-only) ──
    const snapshotAnterior = {
      nome: inscricao.nome || null,
      cpf: inscricao.cpf || null,
      whatsapp: inscricao.whatsapp || null,
      email: inscricao.email || null,
    };

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip') || null;

    // ── SUBSTITUIR SOMENTE O TITULAR (nenhum campo financeiro tocado) ──
    // dedup_key acompanha o CPF para manter a unicidade por inscrição ativa.
    const updatePayload = {
      nome: nome.trim(),
      cpf: cpfNovo,
      whatsapp: whatsappNovo,
      dedup_key: `CPF:${cpfNovo}`,
      // Reaponta módulos ao novo titular: força regeneração/reenvio do QR de
      // credenciamento (check-in), sem tocar em nada financeiro.
      qrcode_url: null,
      qrcode_token: null,
      qrcode_gerado_em: null,
      qr_envio_status: 'gerado_nao_enviado',
      qr_tentativas_envio: 0,
      qr_ultimo_envio_em: null,
      // check-in do participante zera (novo titular ainda não fez check-in)
      checkin_realizado: false,
      checkin_at: null,
      // grupo: novo titular ainda não entrou
      entrou_no_grupo: false,
      data_entrada_grupo: null,
      entrou_no_grupo_em: null,
      saudacao_grupo_enviada: false,
      saudacao_grupo_enviada_em: null,
      status_envio_grupo: 'pendente',

    };
    if (email && email.trim()) updatePayload.email = email.trim().toLowerCase();
    if (cidade && cidade.trim()) updatePayload.cidade = cidade.trim();

    const cartinha = prepararCartinhaTransferencia(inscricao, transferencia.id, nowIso);
    const saved = await base44.asServiceRole.entities.EventoM31Inscricao.updateMany(cartinha.query, {
      $set: { ...updatePayload, ...cartinha.patch },
    });
    if (saved?.updated !== 1) {
      return Response.json({ error: 'A inscrição ou a cartinha mudou durante a transferência. Confira e tente novamente.', code: 'alteracao_concorrente' }, { status: 409 });
    }

    // ── Fechar a transferência (uso único) ──
    await base44.asServiceRole.entities.M31TransferenciaInscricao.update(transferencia.id, {
      status: 'concluida',
      concluida_em: nowIso,
      ip_preenchimento: ip,
      titular_anterior_snapshot: snapshotAnterior,
      titular_novo: {
        nome: nome.trim(),
        cpf: cpfNovo,
        whatsapp: whatsappNovo,
        email: (email && email.trim()) ? email.trim().toLowerCase() : null,
        cidade: (cidade && cidade.trim()) ? cidade.trim() : null,
      },
    });

    // ── Auditoria (M31AuditLog) ──
    await base44.asServiceRole.entities.M31AuditLog.create({
      chave_unica: `transferencia_titular_${inscricao.id}_${Date.now()}`,
      tipo_erro: 'transferencia_titular_inscricao',
      gravidade: 'medio',
      origem: 'sistema',
      descricao: `Titular da inscrição substituído via link de transferência. Anterior: ${snapshotAnterior.nome} (CPF ${snapshotAnterior.cpf}). Novo: ${nome.trim()} (CPF ${cpfNovo}). Pagamento INTOCADO (payment_id e installment_id preservados).`,
      pessoa_nome: nome.trim(),
      pessoa_telefone: whatsappNovo,
      pessoa_id: inscricao.id,
      status: 'resolvido',
      resolvido_em: nowIso,
      resolvido_por: 'transferencia_via_link',
      dados_extras: JSON.stringify({
        transferencia_id: transferencia.id,
        titular_anterior: snapshotAnterior,
        asaas_payment_id: inscricao.asaas_payment_id || null,
        asaas_installment_id: inscricao.asaas_installment_id || null,
        financeiro_intocado: true,
      }),
    }).catch(() => {});

    // ── Timeline (observabilidade) ──
    await base44.asServiceRole.entities.M31InscricaoTimeline.create({
      inscricao_id: inscricao.id,
      cpf: cpfNovo,
      evento: 'reconciliacao_executada',
      etapa: 'transferencia',
      status: 'sucesso',
      detalhe: `Titular transferido: ${snapshotAnterior.nome} → ${nome.trim()}. Pagamento preservado.`,
      origem: 'm31ConcluirTransferencia',
    }).catch(() => {});

    return Response.json({
      success: true,
      inscricao_id: inscricao.id,
      novo_titular: nome.trim(),
      // prova de integridade financeira devolvida ao cliente
      financeiro: {
        asaas_payment_id: inscricao.asaas_payment_id || null,
        asaas_installment_id: inscricao.asaas_installment_id || null,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
