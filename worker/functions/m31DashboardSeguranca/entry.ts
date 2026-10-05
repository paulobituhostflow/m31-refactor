// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31DashboardSeguranca
 * Retorna dados para o monitor de segurança de disparos WhatsApp.
 */

/**
 * Retorna a data/hora atual corretamente ajustada para America/Recife (UTC-3).
 */
function horaRecife() {
  const utcNow = new Date();
  return new Date(utcNow.getTime() - 3 * 60 * 60 * 1000);
}

/**
 * Retorna a string "YYYY-MM-DD" no fuso America/Recife.
 */
function hojeRecife() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Recife' }).format(new Date());
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const agora = horaRecife();
    const hoje  = hojeRecife();
    const ontemDate = new Date(new Date().getTime() - 3 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000);
    const ontemStr = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Recife' }).format(ontemDate);

    // Controle do dia
    const [controlHoje, controlOntem] = await Promise.all([
      base44.asServiceRole.entities.M31WhatsAppControl.filter({ data: hoje }),
      base44.asServiceRole.entities.M31WhatsAppControl.filter({ data: ontemStr }),
    ]);
    const ctrl = controlHoje[0] || null;
    const ctrlOntem = controlOntem[0] || null;

    // Logs do dia (últimas 24h)
    const todasInscricoes = await base44.asServiceRole.entities.EventoM31Inscricao.list('-created_date', 2000);

    // Contagens
    const confirmadas = todasInscricoes.filter(i => ['aprovado','gratuito'].includes(i.status_pagamento));
    const pendentes   = todasInscricoes.filter(i => ['pendente','checkout_pendente','checkout_abandonado'].includes(i.status_pagamento) && !i.opt_out);
    const semBoasVindas = confirmadas.filter(i => !i.data_envio_boas_vindas && !i.status_envio_grupo);
    const optOuts     = todasInscricoes.filter(i => i.opt_out);
    const encerrados  = todasInscricoes.filter(i => i.current_stage === 'encerrado');

    // Logs das últimas 24h (via M31MessageLog)
    const logs24h = await base44.asServiceRole.entities.M31MessageLog.list('-created_date', 200);
    const inicio24h = new Date(agora.getTime() - 24 * 60 * 60 * 1000);
    const logsHoje = logs24h.filter(l => l.enviado_em && new Date(l.enviado_em) >= inicio24h);
    const totalEnviados24h = logsHoje.length;
    const totalSucesso24h  = logsHoje.filter(l => l.sucesso).length;
    const totalFalhas24h   = logsHoje.filter(l => !l.sucesso).length;
    const boasVindasHoje   = logsHoje.filter(l => l.tipo === 'boas_vindas').length;
    const cobrancasHoje    = logsHoje.filter(l => l.tipo === 'cobranca').length;

    // Taxa de entrega
    const taxaEntrega = totalEnviados24h > 0 ? Math.round((totalSucesso24h / totalEnviados24h) * 100) : 100;

    // Status geral
    const bloqueado  = ctrl?.bloqueado === true;
    const altasFalhas = totalFalhas24h >= 5 || taxaEntrega < 80;
    const altosOptOuts = (ctrl?.total_optouts_hoje || 0) >= 3;

    let status = 'seguro'; // verde
    if (bloqueado) {
      status = 'risco';    // vermelho
    } else if (altasFalhas || altosOptOuts) {
      status = 'atencao';  // amarelo
    }

    return Response.json({
      success: true,
      status,
      bloqueado,
      hoje: {
        data: hoje,
        mensagens_enviadas: ctrl?.mensagens_enviadas_hoje || 0,
        limite_diario: ctrl?.limite_diario || 25,
        boas_vindas: ctrl?.boas_vindas_enviadas || 0,
        cobrancas: ctrl?.cobrancas_enviadas || 0,
        falhas: ctrl?.total_falhas_hoje || 0,
        optouts: ctrl?.total_optouts_hoje || 0,
        ultimo_envio: ctrl?.ultimo_envio_em || null,
        dias_sem_bloqueio: ctrl?.dias_sem_bloqueio || 0,
      },
      ontem: {
        data: ontemStr,
        mensagens_enviadas: ctrlOntem?.mensagens_enviadas_hoje || 0,
        limite_diario: ctrlOntem?.limite_diario || 25,
        falhas: ctrlOntem?.total_falhas_hoje || 0,
      },
      ultimas_24h: {
        total_enviados: totalEnviados24h,
        total_sucesso: totalSucesso24h,
        total_falhas: totalFalhas24h,
        boas_vindas: boasVindasHoje,
        cobrancas: cobrancasHoje,
        taxa_entrega: taxaEntrega,
      },
      fila: {
        confirmadas_sem_boas_vindas: semBoasVindas.length,
        pendentes_para_cobranca: pendentes.length,
        opt_outs: optOuts.length,
        encerrados: encerrados.length,
      },
      logs_recentes: logsHoje.slice(0, 20).map(l => ({
        nome: l.inscricao_nome,
        tipo: l.tipo,
        sucesso: l.sucesso,
        erro: l.erro,
        enviado_em: l.enviado_em,
      })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
