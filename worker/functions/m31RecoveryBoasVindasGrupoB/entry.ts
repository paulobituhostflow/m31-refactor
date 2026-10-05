// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31RecoveryBoasVindasGrupoB
 * 
 * Dispara boas-vindas para inscrições com:
 *   - status_pagamento = aprovado
 *   - data_envio_boas_vindas = null (nunca receberam, campo nulo = 100% seguro)
 * 
 * Protocolo anti-bloqueio:
 *   - Delay 45–90s entre envios
 *   - Pausa de 15min a cada 3 mensagens
 *   - Máximo 40/dia (fase normal, 19+ dias desde reconexão)
 *   - Janela de envio: 8h–20h BRT
 */

const LIMITE_DIARIO   = 40;
const MAX_POR_EXECUCAO = 3;
// ── Resolver canônico de grupo por FINALIDADE (Regra 3: nunca por nome) ──────
async function resolverGrupo(base44, finalidade) {
  try {
    const res = await base44.asServiceRole.functions.invoke('m31ResolverGrupo', { finalidade });
    return res.data || res;
  } catch (e) {
    return { error: e.message, cancelado: true };
  }
}

async function logEnvioGrupo(base44, params) {
  try {
    await base44.asServiceRole.entities.M31GrupoEnvioLog.create({
      finalidade: params.finalidade,
      nome_grupo: params.nome_grupo || null,
      chat_id: params.chat_id || null,
      qtd_mensagens: params.qtd_mensagens || 1,
      funcao_responsavel: params.funcao_responsavel,
      tipo_envio: params.tipo_envio || 'link_convite',
      destinatario: params.destinatario || null,
      inscricao_id: params.inscricao_id || null,
      sucesso: params.sucesso,
      erro: params.erro || null,
      cancelado: params.cancelado || false,
      enviado_em: new Date().toISOString(),
    });
  } catch (_) {}
}

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

function randomDelay(minS, maxS) {
  return (minS + Math.random() * (maxS - minS)) * 1000;
}



return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Verificar autenticação admin
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Checar janela de envio
    const hora = horaRecifeNum();
    if (hora < 8 || hora >= 20) {
      return Response.json({
        skipped: true,
        reason: 'fora_janela',
        hora_brt: hora,
        mensagem: 'Janela de envio: 8h–20h BRT'
      });
    }

    // Parâmetro dry_run
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const dryRun = body.dry_run === true;

    // Buscar inscrições aprovadas sem boas-vindas (campo nulo)
    const candidatas = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
      { status_pagamento: 'aprovado' }, '-created_date', 200
    );

    const semBoasVindas = candidatas.filter(i =>
      !i.data_envio_boas_vindas &&
      i.status_envio_grupo !== 'enviado' &&  // guard extra contra race condition com m31EnviarBoasVindas
      i.whatsapp &&
      i.whatsapp.replace(/\D/g, '').length >= 10 &&
      !i.opt_out
    );

    if (dryRun) {
      return Response.json({
        dry_run: true,
        total_candidatas: semBoasVindas.length,
        lista: semBoasVindas.map(i => ({
          id: i.id,
          nome: i.nome,
          whatsapp: i.whatsapp,
          codigo_inscricao: i.codigo_inscricao,
          created_date: i.created_date,
          tipo: i.tipo
        }))
      });
    }

    if (semBoasVindas.length === 0) {
      return Response.json({ success: true, message: 'Nenhuma candidata no Grupo B', enviados: 0 });
    }

    // ── Resolver grupo por finalidade (nunca hardcoded) ──────────────────
    const grupoRes = await resolverGrupo(base44, 'INSCRITAS_OFICIAL');
    if (!grupoRes?.success || !grupoRes?.invite_link) {
      await logEnvioGrupo(base44, {
        finalidade: 'INSCRITAS_OFICIAL', funcao_responsavel: 'm31RecoveryBoasVindasGrupoB',
        tipo_envio: 'link_convite', destinatario: 'lote',
        sucesso: false, cancelado: true,
        erro: grupoRes?.error || grupoRes?.mensagem || 'grupo_nao_configurado',
      });
      return Response.json({ skipped: true, reason: 'grupo_nao_configurado', erro: grupoRes?.error || grupoRes?.mensagem });
    }
    const LINK_GRUPO = grupoRes.invite_link;

    // Verificar limite diário
    const hoje = hojeRecife();
    const logsHoje = await base44.asServiceRole.entities.M31MessageLog.filter(
      { tipo: 'boas_vindas', sucesso: true }, '-enviado_em', 100
    );
    const corteHoje = new Date(hoje + 'T00:00:00-03:00').getTime(); // usar getTime() para comparação numérica segura
    const enviadosHoje = logsHoje.filter(l => {
      if (!l.enviado_em) return false;
      return new Date(l.enviado_em).getTime() >= corteHoje;
    }).length;

    if (enviadosHoje >= LIMITE_DIARIO) {
      return Response.json({
        skipped: true,
        reason: 'limite_diario_atingido',
        enviados_hoje: enviadosHoje,
        limite: LIMITE_DIARIO
      });
    }

    const disponivel = LIMITE_DIARIO - enviadosHoje;
    const aProcessar = semBoasVindas.slice(0, Math.min(MAX_POR_EXECUCAO, disponivel));

    const enviados = [];
    const falhas = [];
    let contadorBloco = 0;

    for (let i = 0; i < aProcessar.length; i++) {
      const inscricao = aProcessar[i];
      const telefone = inscricao.whatsapp.replace(/\D/g, '');
      const nome = inscricao.nome?.split(' ')[0] || 'Querida';
      const codigo = inscricao.codigo_inscricao || '';

      const mensagem =
        `✅ *Inscrição Confirmada — M31 Filhas!*\n\n` +
        `Parabéns, *${nome}*! Sua inscrição no M31 Filhas foi confirmada! 🌸\n` +
        `Estamos em oração desde já por você, e cremos que Deus fará algo lindo nesse encontro.\n\n` +
        `📌 *Agora é muito importante que você entre no grupo pelo link abaixo*, porque é por lá que enviaremos todas as informações oficiais do evento (orientações, horários e avisos).\n\n` +
        `👉 *Link do Grupo:* ${LINK_GRUPO}\n\n` +
        `⚠️ O acesso ao grupo é pessoal e intransferível. Não compartilhe o link e permaneça no grupo para não perder nenhum aviso.\n\n` +
        (codigo ? `*Seu código de inscrição:* \`${codigo}\`\nGuarde-o para o *check-in no dia do evento*.\n\n` : '') +
        `Vai ser um dia incrível! 🔥🙌`;

      let sucesso = false;
      let zapiRes = null;
      let erroMsg = null;

      // ── GUARD POR TELEFONE: checar M31MessageLog antes de enviar ──────────
      const logsExistentes = await base44.asServiceRole.entities.M31MessageLog.filter(
        { telefone, tipo: 'boas_vindas', sucesso: true }, '-enviado_em', 1
      );
      if (logsExistentes.length > 0) {
        logger.log(`[GrupoB] Telefone ${telefone} já recebeu boas-vindas em ${logsExistentes[0].enviado_em}. Marcando e pulando.`);
        await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
          data_envio_boas_vindas: logsExistentes[0].enviado_em,
          status_envio_grupo: 'enviado'
        });
        falhas.push({ nome: inscricao.nome, erro: 'JA_RECEBEU_POR_TELEFONE — marcado sem reenvio' });
        continue;
      }
      // ───────────────────────────────────────────────────────────────────────

      try {
        const wpRes = await base44.asServiceRole.functions.invoke('m31SendWhatsApp', { phone: telefone, message: mensagem });
        zapiRes = wpRes.uazapi_response || wpRes;
        sucesso = wpRes.sucesso === true;

        if (sucesso) {
          // Marcar como enviado
          await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
            data_envio_boas_vindas: new Date().toISOString(),
            status_envio_grupo: 'enviado',
            last_contact_at: new Date().toISOString()
          });

          enviados.push({ nome: inscricao.nome, telefone, codigo });
          contadorBloco++;

          // Aguardar 1s e enviar QR Code se tiver código
          if (codigo) {
            await sleep(1000);
            await base44.asServiceRole.functions.invoke('m31SendWhatsApp', {
              phone: telefone,
              image: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(codigo)}&bgcolor=FFFFFF&color=000000&format=png`,
              caption: `🔲 QR Code para check-in — *${codigo}*\n\nApresente este QR Code na entrada do evento.`
            });
          }
        } else {
          erroMsg = zapiRes?.error || 'Resposta Z-API sem confirmação';
          falhas.push({ nome: inscricao.nome, erro: erroMsg });
        }
      } catch (e) {
        erroMsg = e.message;
        falhas.push({ nome: inscricao.nome, erro: erroMsg });
      }

      // Registrar log
      await base44.asServiceRole.entities.M31MessageLog.create({
        inscricao_id: inscricao.id,
        inscricao_nome: inscricao.nome,
        telefone,
        tipo: 'boas_vindas',
        stage: 'boas_vindas',
        mensagem,
        sucesso,
        zapi_response: zapiRes ? JSON.stringify(zapiRes) : null,
        erro: erroMsg,
        enviado_em: new Date().toISOString()
      });

      // Delay entre envios: 45–90s (exceto após o último)
      if (i < aProcessar.length - 1) {
        const delayMs = randomDelay(45, 90);
        logger.log(`[GrupoB] Aguardando ${Math.round(delayMs/1000)}s antes do próximo envio...`);
        await sleep(delayMs);
      }

      // Pausa de 15min a cada 3 mensagens
      if (contadorBloco >= 3 && i < aProcessar.length - 1) {
        logger.log('[GrupoB] Pausa de 15min após 3 mensagens...');
        await sleep(15 * 60 * 1000);
        contadorBloco = 0;
      }
    }

    return Response.json({
      success: true,
      grupo: 'B',
      total_candidatas: semBoasVindas.length,
      processadas_nesta_execucao: aProcessar.length,
      enviados: enviados.length,
      falhas: falhas.length,
      enviados_lista: enviados,
      falhas_lista: falhas,
      restantes_para_proximas_execucoes: semBoasVindas.length - aProcessar.length,
      limite_diario: LIMITE_DIARIO,
      enviados_hoje: enviadosHoje + enviados.length
    });

  } catch (error) {
    logger.error('[GrupoB] Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
