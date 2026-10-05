// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31ReprocessarBoasVindasPendentes
 * 
 * Reprocessa boas-vindas para inscrições com pagamento aprovado
 * que NÃO receberam mensagem de boas-vindas.
 * 
 * Regras:
 * - Máximo 10 por execução
 * - Intervalo aleatório de 1 a 8 segundos entre envios
 * - Usa m31SendWhatsApp como camada única de envio
 * - Provider UAZAPI
 * - Registra em M31MessageLog
 * - Só marca data_envio_boas_vindas após sucesso
 * - Não envia para quem já tem log de sucesso de boas-vindas
 * - Não duplica mensagem
 */


const MAX_POR_EXECUCAO = 10;
const LINK_GRUPO = '__WHATSAPP_GROUP_INVITE__';

function randomDelayMs() {
  return 1000 + Math.floor(Math.random() * 2000); // 1 a 3 segundos (reduzido para não estourar timeout)
}

function tempoEsgotado(inicioMs, limiteSegundos = 60) {
  return (Date.now() - inicioMs) > (limiteSegundos * 1000);
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function jaTemLogSucesso(base44, inscricaoId, telefone) {
  const logs = await base44.asServiceRole.entities.M31MessageLog.filter(
    { inscricao_id: inscricaoId, tipo: 'boas_vindas', sucesso: true },
    '-enviado_em', 5
  );
  if (logs.length > 0) return { tem: true, motivo: 'log_sucesso_existente_por_id', log: logs[0] };

  const logsTel = await base44.asServiceRole.entities.M31MessageLog.filter(
    { telefone, tipo: 'boas_vindas', sucesso: true },
    '-enviado_em', 5
  );
  if (logsTel.length > 0) return { tem: true, motivo: 'log_sucesso_existente_por_telefone', log: logsTel[0] };

  return { tem: false };
}

async function registrarLog(base44, data) {
  try {
    await base44.asServiceRole.entities.M31MessageLog.create({
      inscricao_id: data.inscricao_id,
      inscricao_nome: data.inscricao_nome,
      telefone: data.telefone,
      tipo: 'boas_vindas',
      stage: 'boas_vindas',
      mensagem: data.mensagem,
      sucesso: data.sucesso,
      zapi_response: data.uazapi_response ? JSON.stringify(data.uazapi_response) : null,
      erro: data.erro || null,
      enviado_em: new Date().toISOString(),
    });
  } catch (_) {
    logger.error('[m31ReprocessarBoasVindas] Erro ao registrar log:', _.message);
  }
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Apenas admin pode executar reprocessamento' }, { status: 403 });
    }

    // 1. Buscar todas as inscrições aprovadas SEM boas-vindas
    const [aprovadas, gratuitas] = await Promise.all([
      base44.asServiceRole.entities.EventoM31Inscricao.filter(
        { status_pagamento: 'aprovado' }, '-updated_date', 500
      ),
      base44.asServiceRole.entities.EventoM31Inscricao.filter(
        { status_pagamento: 'gratuito' }, '-updated_date', 500
      ),
    ]);

    // Filtra: sem data_envio_boas_vindas, status_envio_grupo != enviado, tem whatsapp
    const candidatas = [...aprovadas, ...gratuitas].filter(i =>
      i.whatsapp &&
      !i.data_envio_boas_vindas &&
      i.status_envio_grupo !== 'enviado' &&
      i.entrou_no_grupo !== true &&
      !i.webhook_processando
    );

    logger.log(`[m31ReprocessarBoasVindas] ${candidatas.length} candidatas encontradas`);

    const resultado = {
      total_candidatas: candidatas.length,
      enviados: 0,
      pulados: [],
      falhas: [],
      processados: [],
    };

    const inicio = Date.now();
    let enviados = 0;

    for (const inscricao of candidatas) {
      if (enviados >= MAX_POR_EXECUCAO) break;
      if (tempoEsgotado(inicio, 90)) {
        logger.log('[m31ReprocessarBoasVindas] Timeout de segurança atingido');
        resultado.pulados.push({ nome: '---', motivo: 'timeout_seguranca_execucao' });
        break;
      }

      const telefone = (inscricao.whatsapp || '').replace(/\D/g, '');
      if (!telefone || telefone.length < 10) {
        resultado.pulados.push({ nome: inscricao.nome, motivo: 'telefone_invalido' });
        continue;
      }

      // Verificar se já tem log de sucesso
      const dedup = await jaTemLogSucesso(base44, inscricao.id, telefone);
      if (dedup.tem) {
        resultado.pulados.push({ nome: inscricao.nome, motivo: dedup.motivo });
        // Marcar como enviado já que tem log de sucesso
        await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
          data_envio_boas_vindas: dedup.log.enviado_em,
          status_envio_grupo: 'enviado',
        });
        continue;
      }

      const nome = (inscricao.nome || 'Querida').split(' ')[0];
      const codigo = inscricao.codigo_inscricao || '';

      const mensagem =
        `Oi, ${nome}! 💚\n\n` +
        `Sua inscrição no M31 Filhas está confirmada.\n\n` +
        `Agora falta só entrar no grupo oficial para receber os avisos importantes do evento:\n\n` +
        `${LINK_GRUPO}\n\n` +
        (codigo ? `*Seu código de inscrição:* \`${codigo}\`\nGuarde-o para o *check-in no dia do evento*.\n\n` : '') +
        `Te esperamos lá 😊`;

      let sucesso = false;
      let uazapiRes = null;
      let erroMsg = null;

      try {
        // Usa m31SendWhatsApp como camada única (asServiceRole para execução sem usuário autenticado)
        const res = await base44.asServiceRole.functions.invoke('m31SendWhatsApp', {
          phone: telefone,
          message: mensagem,
        });

        uazapiRes = res.uazapi_response;
        sucesso = res.sucesso === true;

        if (sucesso) {
          await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
            data_envio_boas_vindas: new Date().toISOString(),
            status_envio_grupo: 'enviado',
            last_contact_at: new Date().toISOString(),
            fila_boas_vindas: false,
          });
          resultado.enviados++;
          enviados++;
          resultado.processados.push({ nome: inscricao.nome, telefone, sucesso: true });
        } else {
          erroMsg = res.error || 'UAZAPI sem confirmação de sucesso';
          resultado.falhas.push({ nome: inscricao.nome, telefone, erro: erroMsg });
          resultado.processados.push({ nome: inscricao.nome, telefone, sucesso: false, erro: erroMsg });
        }
      } catch (e) {
        erroMsg = e.message;
        resultado.falhas.push({ nome: inscricao.nome, telefone, erro: erroMsg });
        resultado.processados.push({ nome: inscricao.nome, telefone, sucesso: false, erro: erroMsg });
      }

      await registrarLog(base44, {
        inscricao_id: inscricao.id,
        inscricao_nome: inscricao.nome,
        telefone,
        mensagem,
        sucesso,
        uazapi_response: uazapiRes,
        erro: erroMsg,
      });

      // Delay aleatório entre envios (1-8 segundos)
      if (enviados < MAX_POR_EXECUCAO) {
        await sleep(randomDelayMs());
      }
    }

    return Response.json({
      success: true,
      ...resultado,
      mensagem: `${resultado.enviados} boas-vindas enviadas, ${resultado.pulados.length} puladas, ${resultado.falhas.length} falhas de ${resultado.total_candidatas} candidatas`,
    });

  } catch (error) {
    logger.error('[m31ReprocessarBoasVindas] ERRO:', error.message);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
})(req);
}
