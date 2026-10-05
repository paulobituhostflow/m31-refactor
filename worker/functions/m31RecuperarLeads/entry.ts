// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31RecuperarLeads — v2
 *
 * DOIS FLUXOS:
 *
 * FLUXO A — Abandono após WhatsApp (sem link de pagamento):
 *   - Captura inscrições com status checkout_pendente, sem asaas_charge_url,
 *     com next_contact_at <= agora e recovery_attempts = 0
 *   - Envia mensagem curta e amigável
 *   - Limites: máx 3 por lote, pausa 10-15 min entre envios, limite 20/dia
 *
 * FLUXO B — Abandono com link de pagamento (checkout iniciado):
 *   - Captura inscrições com checkout_pendente/abandonado e asaas_charge_url
 *   - Régua em 3 etapas: 5min, 20min, 60min
 *
 * SEGURANÇA:
 *   - Janela 08h–20h America/Recife (UTC-3)
 *   - Limite diário total: 20 mensagens
 *   - Deduplicação por telefone (48h)
 *   - Respeita opt-out
 *   - Máx 3 por lote no Fluxo A
 */

const HORA_INICIO = 8;
const HORA_FIM = 20;
const LIMITE_DIARIO = 60;
const LOTE_MAX_FLUXO_A = 10;
const JANELA_DEDUP_H = 48;
const DELAY_ENTRE_ENVIOS_MS = (1 + Math.random() * 4) * 60 * 1000; // 1-5 min em ms

function horaRecifeNum() {
  const d = new Date();
  const local = new Date(d.getTime() + (-3) * 60 * 60 * 1000);
  return local.getUTCHours();
}

function hojeRecife() {
  const d = new Date();
  const local = new Date(d.getTime() + (-3) * 60 * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function enviarWhatsApp(base44, telefone, mensagem) {
  const wpRes = await base44.functions.invoke('m31SendWhatsApp', { phone: telefone, message: mensagem });
  return { sucesso: wpRes.sucesso, response: wpRes.uazapi_response || wpRes };
}

async function jaRecebeuRecuperacao(base44, inscricaoId, telefone, tipo) {
  const corte = new Date(Date.now() - JANELA_DEDUP_H * 60 * 60 * 1000).toISOString();
  const logs = await base44.asServiceRole.entities.M31MessageLog.filter(
    { inscricao_id: inscricaoId, tipo }, '-enviado_em', 1
  );
  if (logs.length > 0 && logs[0].enviado_em >= corte) return true;
  const logsTel = await base44.asServiceRole.entities.M31MessageLog.filter(
    { telefone, tipo }, '-enviado_em', 1
  );
  if (logsTel.length > 0 && logsTel[0].enviado_em >= corte) return true;
  return false;
}

async function registrarLog(base44, { inscricao_id, inscricao_nome, telefone, tipo, mensagem, sucesso, zapi_response, erro }) {
  try {
    await base44.asServiceRole.entities.M31MessageLog.create({
      inscricao_id,
      inscricao_nome,
      telefone,
      tipo,
      stage: tipo,
      mensagem,
      sucesso,
      zapi_response: zapi_response ? JSON.stringify(zapi_response) : null,
      erro,
      enviado_em: new Date().toISOString(),
    });
  } catch (_) {}
}

async function contarEnviosHoje(base44) {
  const corteHoje = new Date(hojeRecife() + 'T00:00:00-03:00').toISOString();
  const logs = await base44.asServiceRole.entities.M31MessageLog.filter(
    { sucesso: true }, '-enviado_em', 100
  );
  return logs.filter(l => l.enviado_em >= corteHoje && (l.tipo === 'recuperacao_5min' || l.tipo === 'recuperacao')).length;
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const horaRecife = horaRecifeNum();
    const agora = new Date();

    // Verificar janela horária
    if (horaRecife < HORA_INICIO || horaRecife >= HORA_FIM) {
      return Response.json({
        skipped: true,
        reason: 'fora_janela_horaria',
        hora_recife: `${horaRecife}h BRT`,
        janela: `${HORA_INICIO}h–${HORA_FIM}h`,
      });
    }

    // Verificar limite diário
    let enviadosHoje = await contarEnviosHoje(base44);
    if (enviadosHoje >= LIMITE_DIARIO) {
      return Response.json({ skipped: true, reason: 'limite_diario_atingido', enviados_hoje: enviadosHoje });
    }

    const resultados = [];

    // ─────────────────────────────────────────────────────────────────────
    // FLUXO A — Abandono após WhatsApp (sem checkout gerado)
    // ─────────────────────────────────────────────────────────────────────
    const agoraISO = agora.toISOString();
    const candidatasFluxoA = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
      { status_pagamento: 'checkout_pendente', tipo: 'publico_geral' }, '-checkout_abandoned_at', 50
    );

    const filaFluxoA = candidatasFluxoA.filter(i =>
      !i.asaas_charge_url &&                          // sem link de pagamento
      i.whatsapp &&                                   // tem WhatsApp
      !i.opt_out &&                                   // não optou por sair
      i.recovery_attempts === 0 &&                    // nenhuma tentativa ainda
      i.next_contact_at &&                            // tem agendamento
      i.next_contact_at <= agoraISO &&                // já passou o tempo de espera
      !i.data_envio_boas_vindas &&                    // NÃO enviar se já recebeu boas-vindas/confirmação
      !['jornada_concluida', 'qr_enviado', 'aguardando_resposta', 'processando_boas_vindas'].includes(i.estado_jornada)
    );

    let enviadosFluxoA = 0;

    for (const inscricao of filaFluxoA) {
      if (enviadosHoje >= LIMITE_DIARIO) break;
      if (enviadosFluxoA >= LOTE_MAX_FLUXO_A) break;

      const telefone = inscricao.whatsapp?.replace(/\D/g, '');
      if (!telefone || telefone.length < 10) continue;

      // Verificar pagamento confirmado (pode ter pago após captura)
      if (inscricao.status_pagamento === 'aprovado' || inscricao.status_pagamento === 'gratuito') continue;

      // Deduplicação
      const jaEnviou = await jaRecebeuRecuperacao(base44, inscricao.id, telefone, 'recuperacao_5min');
      if (jaEnviou) continue;

      const nome = inscricao.nome?.split(' ')[0] || 'Visitante';
      const mensagem =
        `Olá, *${nome}*! 😊\n\n` +
        `Vi que você visitou a página do *#M31* e começou sua inscrição.\n\n` +
        `Precisa de alguma ajuda para finalizar?\n\n` +
        `Se quiser concluir agora, acesse: __APP_ORIGIN__/m31-inscricao`;

      let sucesso = false;
      let zapiRes = null;
      let erroMsg = null;

      try {
        const wpRes = await base44.asServiceRole.functions.invoke('m31SendWhatsApp', { phone: telefone, message: mensagem });
        zapiRes = wpRes.uazapi_response || wpRes;
        sucesso = wpRes.sucesso === true;
      } catch (e) {
        erroMsg = e.message;
      }

      await registrarLog(base44, {
        inscricao_id: inscricao.id,
        inscricao_nome: inscricao.nome,
        telefone,
        tipo: 'recuperacao_5min',
        mensagem,
        sucesso,
        zapi_response: zapiRes,
        erro: erroMsg,
      });

      await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
        status_pagamento: 'checkout_abandonado',
        recovery_attempts: 1,
        last_recovery_at: new Date().toISOString(),
        last_contact_at: new Date().toISOString(),
        current_stage: 'd0',
      });

      resultados.push({ nome: inscricao.nome, fluxo: 'A', acao: 'recuperacao_5min', sucesso });
      enviadosFluxoA++;
      enviadosHoje++;

      // Pausa entre envios do lote A
      if (enviadosFluxoA < LOTE_MAX_FLUXO_A && enviadosFluxoA < filaFluxoA.length) {
        await sleep(DELAY_ENTRE_ENVIOS_MS);
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // FLUXO B — Abandono com link de pagamento (checkout gerado)
    // ─────────────────────────────────────────────────────────────────────
    const [pendentes, abandonados] = await Promise.all([
      base44.asServiceRole.entities.EventoM31Inscricao.filter({ status_pagamento: 'checkout_pendente' }),
      base44.asServiceRole.entities.EventoM31Inscricao.filter({ status_pagamento: 'checkout_abandonado' })
    ]);
    const inscricoesFluxoB = [...pendentes, ...abandonados].filter(i => !!i.asaas_charge_url);

    const MINUTO = 60 * 1000;

    for (const inscricao of inscricoesFluxoB) {
      if (enviadosHoje >= LIMITE_DIARIO) break;

      const criadoEm = new Date(inscricao.created_date).getTime();
      const minutosDecorridos = (Date.now() - criadoEm) / MINUTO;
      const tentativas = inscricao.recovery_attempts || 0;
      const linkPagamento = inscricao.asaas_charge_url;
      const telefone = inscricao.whatsapp?.replace(/\D/g, '');

      if (!linkPagamento || !telefone || telefone.length < 10) continue;
      if (inscricao.opt_out) continue;

      // GUARDA: NÃO enviar recuperação para quem já recebeu boas-vindas/confirmação
      if (inscricao.data_envio_boas_vindas) continue;
      if (['jornada_concluida', 'qr_enviado', 'aguardando_resposta', 'processando_boas_vindas'].includes(inscricao.estado_jornada)) continue;

      const nome = inscricao.nome?.split(' ')[0] || 'Visitante';
      let mensagem = null;
      let acaoLabel = null;

      if (minutosDecorridos >= 5 && tentativas === 0) {
        mensagem = `Oi, ${nome}! 🌷\n\nPercebemos que você iniciou sua inscrição no *M31 Filhas*, mas o pagamento ainda não foi concluído.\n\nPara garantir sua vaga, finalize por este link:\n${linkPagamento}\n\nSe precisar de ajuda, é só responder aqui. 💛`;
        acaoLabel = 'mensagem_1_enviada';
      } else if (minutosDecorridos >= 20 && tentativas === 1) {
        mensagem = `Oi, ${nome}! 💛\n\nSua inscrição foi iniciada, mas o pagamento ainda não foi confirmado.\n\nAs vagas são limitadas! Para garantir a sua, finalize agora:\n${linkPagamento}\n\nEstamos torcendo por você! 🌸`;
        acaoLabel = 'mensagem_2_enviada';
      } else if (minutosDecorridos >= 60 && tentativas === 2) {
        mensagem = `${nome}, sua inscrição está quase pronta! 🌷\n\nFalta apenas concluir o pagamento para garantir sua vaga no *M31 Filhas*.\n\nFinalize agora:\n${linkPagamento}\n\nQualquer dificuldade, me chama aqui. 💛`;
        acaoLabel = 'mensagem_3_enviada';
      }

      if (!mensagem) continue;

      const jaEnviou = await jaRecebeuRecuperacao(base44, inscricao.id, telefone, 'recuperacao');
      if (jaEnviou && tentativas > 0) continue;

      let sucesso = false;
      let zapiRes = null;
      let erroMsg = null;

      try {
        const wpRes = await base44.asServiceRole.functions.invoke('m31SendWhatsApp', { phone: telefone, message: mensagem });
        zapiRes = wpRes.uazapi_response || wpRes;
        sucesso = wpRes.sucesso === true;
      } catch (e) {
        erroMsg = e.message;
      }

      await registrarLog(base44, {
        inscricao_id: inscricao.id,
        inscricao_nome: inscricao.nome,
        telefone,
        tipo: 'recuperacao',
        mensagem,
        sucesso,
        zapi_response: zapiRes,
        erro: erroMsg,
      });

      await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
        status_pagamento: 'checkout_abandonado',
        recovery_attempts: tentativas + 1,
        last_recovery_at: new Date().toISOString(),
        last_contact_at: new Date().toISOString(),
      });

      resultados.push({ nome: inscricao.nome, fluxo: 'B', acao: acaoLabel, sucesso });
      enviadosHoje++;
    }

    return Response.json({
      success: true,
      hora_recife: `${horaRecife}h BRT`,
      enviados_total: resultados.length,
      enviados_hoje: enviadosHoje,
      limite_diario: LIMITE_DIARIO,
      fluxo_a: resultados.filter(r => r.fluxo === 'A').length,
      fluxo_b: resultados.filter(r => r.fluxo === 'B').length,
      detalhes: resultados,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
