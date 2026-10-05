// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31AuditoriaCompleta — Auditoria segura das 4 frentes críticas
 * Sem disparos, apenas levantamento de dados e recomendações
 */

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // ── 1. BOAS-VINDAS ────────────────────────────────────────────
    const confirmadas = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
      { status_pagamento: 'aprovado' }, '-updated_date', 500
    );

    // Confirmadas sem boas-vindas
    const semBoasVindas = confirmadas.filter(i => !i.data_envio_boas_vindas);

    // Duplicados (mesmo email ou phone com múltiplos data_envio_boas_vindas)
    const mapDuplicados = new Map();
    confirmadas.forEach(i => {
      const chave = i.email || i.whatsapp;
      if (!mapDuplicados.has(chave)) mapDuplicados.set(chave, []);
      mapDuplicados.get(chave).push(i);
    });
    const duplicados = Array.from(mapDuplicados.values())
      .filter(grupo => grupo.filter(i => i.data_envio_boas_vindas).length > 1)
      .flatMap(g => g.filter(i => i.data_envio_boas_vindas))
      .map(i => ({ id: i.id, nome: i.nome, email: i.email, phone: i.whatsapp, enviada_em: i.data_envio_boas_vindas }));

    // Confirmadas fora do grupo
    const grupoMembrosList = await base44.asServiceRole.entities.M31GrupoMembro.filter(
      { status: 'ativa' }, null, 500
    );
    const phonesNoGrupo = new Set(grupoMembrosList.map(m => m.phone));
    const foraDoGrupo = confirmadas
      .filter(i => i.data_envio_boas_vindas && i.whatsapp && !phonesNoGrupo.has(i.whatsapp))
      .map(i => ({ id: i.id, nome: i.nome, phone: i.whatsapp, enviada_em: i.data_envio_boas_vindas }));

    // ── 2. RECUPERAÇÃO ────────────────────────────────────────────
    const agora = new Date();
    const trinta_dias_atras = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Inscrições incompletas (não pagaram nos últimos 30 dias)
    const incompletas = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
      { status_pagamento: 'checkout_pendente' }, '-created_date', 500
    );
    const incompletasRecentes = incompletas.filter(i => i.created_date >= trinta_dias_atras);

    // Checkouts abandonados
    const abandonados = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
      { status_pagamento: 'checkout_abandonado' }, '-checkout_abandoned_at', 500
    );
    const abandonadosRecentes = abandonados.filter(i => i.checkout_abandoned_at && i.checkout_abandoned_at >= trinta_dias_atras);

    // Deveriam receber recuperação (com checkout_pendente ou abandonado + sem logs de recuperação)
    const precisamRecuperacao = [...incompletasRecentes, ...abandonadosRecentes];
    const msgLogs = await base44.asServiceRole.entities.M31MessageLog.filter(
      { tipo: 'recuperacao' }, '-enviado_em', 500
    );
    const phoneComRecuperacao = new Set(msgLogs.map(m => m.telefone));
    const semRecuperacao = precisamRecuperacao
      .filter(i => i.whatsapp && !phoneComRecuperacao.has(i.whatsapp))
      .map(i => ({ 
        id: i.id, 
        nome: i.nome, 
        phone: i.whatsapp,
        status: i.status_pagamento,
        data_inscricao: i.created_date,
        dias_sem_contato: Math.floor((agora.getTime() - new Date(i.last_contact_at || i.created_date).getTime()) / (24 * 60 * 60 * 1000))
      }));

    // ── 3. LOGS E DUPLICIDADE ─────────────────────────────────────
    const allLogs = await base44.asServiceRole.entities.M31MessageLog.filter(
      {}, '-enviado_em', 1000
    );

    // Logs com erro
    const comErro = allLogs.filter(l => !l.sucesso || l.erro).map(l => ({
      id: l.id,
      phone: l.telefone,
      nome: l.inscricao_nome,
      tipo: l.tipo,
      erro: l.erro,
      enviado_em: l.enviado_em
    }));

    // Inscrições confirmadas sem nenhum log
    const idsComLog = new Set(allLogs.map(l => l.inscricao_id));
    const semLog = confirmadas
      .filter(i => !idsComLog.has(i.id))
      .map(i => ({ id: i.id, nome: i.nome, phone: i.whatsapp, status_pagamento: i.status_pagamento }));

    // Logs duplicados (mesma inscricao_id + tipo)
    const mapLogs = new Map();
    allLogs.forEach(l => {
      const chave = `${l.inscricao_id}:${l.tipo}`;
      if (!mapLogs.has(chave)) mapLogs.set(chave, []);
      mapLogs.get(chave).push(l);
    });
    const logsDuplicados = Array.from(mapLogs.values())
      .filter(grupo => grupo.length > 1)
      .flatMap(g => g.map(l => ({ id: l.id, inscricao_id: l.inscricao_id, tipo: l.tipo, enviado_em: l.enviado_em })));

    // ── RESUMO EXECUTIVO ──────────────────────────────────────────
    const resumo = {
      boas_vindas: {
        confirmadas_total: confirmadas.length,
        sem_boas_vindas: semBoasVindas.length,
        sem_boas_vindas_percentual: ((semBoasVindas.length / confirmadas.length) * 100).toFixed(1),
        duplicados: duplicados.length,
        fora_do_grupo: foraDoGrupo.length,
      },
      recuperacao: {
        incompletas_30d: incompletasRecentes.length,
        abandonadas_30d: abandonadosRecentes.length,
        sem_recuperacao: semRecuperacao.length,
      },
      logs: {
        total_logs: allLogs.length,
        com_erro: comErro.length,
        confirmadas_sem_log: semLog.length,
        duplicados: logsDuplicados.length,
      },
      pessoas_impactadas_total: new Set([
        ...semBoasVindas.map(i => i.id),
        ...duplicados.map(i => i.id),
        ...foraDoGrupo.map(i => i.id),
        ...semRecuperacao.map(i => i.id),
        ...semLog.map(i => i.id),
      ]).size,
    };

    return Response.json({
      timestamp: new Date().toISOString(),
      resumo,
      detalhes: {
        boas_vindas: {
          sem_boas_vindas: semBoasVindas.map(i => ({ id: i.id, nome: i.nome, phone: i.whatsapp, data_pagamento: i.updated_date })),
          duplicados: duplicados,
          fora_do_grupo: foraDoGrupo,
        },
        recuperacao: {
          sem_recuperacao: semRecuperacao,
        },
        logs: {
          com_erro: comErro.slice(0, 50),
          confirmadas_sem_log: semLog.slice(0, 50),
          duplicados: logsDuplicados.slice(0, 50),
        },
      },
      acoes_recomendadas: [
        `⚠️  ${semBoasVindas.length} confirmadas ainda sem boas-vindas — trigger: status_pagamento='aprovado' sem data_envio_boas_vindas`,
        `⚠️  ${foraDoGrupo.length} receberam boas-vindas mas não entraram no grupo — fila: re-enviar link + 3 tentativas`,
        `⚠️  ${semRecuperacao.length} pendentes ou abandonados há 30+ dias sem recuperação — fila: disparar recuperação manual com aprovação`,
        `⚠️  ${comErro.length} logs com erro registrados — revisar UAZAPI token/instância`,
        `⚠️  ${semLog.length} confirmadas sem nenhum log — investigar se boas-vindas foram disparadas via outro canal`,
      ],
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
