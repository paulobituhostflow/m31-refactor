// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

/**
 * Rotina automática diária:
 * - Verifica CPF, WhatsApp, E-mail duplicados
 * - Registra alertas em M31AuditLog
 * - Envia alerta ao gestor
 */
return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Buscar TODAS as inscrições
    const todasInscricoes = await base44.asServiceRole.entities.EventoM31Inscricao.list('-created_date', 5000);

    const duplicidadesMap = {};
    const alertas = [];

    // Verificar CPFs duplicados
    const porCPF = {};
    todasInscricoes.forEach(insc => {
      if (insc.cpf) {
        if (!porCPF[insc.cpf]) porCPF[insc.cpf] = [];
        porCPF[insc.cpf].push(insc);
      }
    });

    for (const [cpf, inscs] of Object.entries(porCPF)) {
      if (inscs.length > 1) {
        alertas.push({
          chave_unica: `cpf_duplicado_${cpf}`,
          tipo_erro: 'cpf_duplicado',
          gravidade: 'critico',
          origem: 'sistema',
          descricao: `CPF ${cpf} possui ${inscs.length} inscrições: ${inscs.map(i => `${i.nome} (${i.codigo_inscricao})`).join(', ')}`,
          pessoa_cpf: cpf,
          pessoas: inscs.map(i => ({ id: i.id, nome: i.nome, email: i.email, status: i.status_pagamento })),
          acao_recomendada: 'Mesclar registros duplicados via painel administrativo',
          dados_extras: JSON.stringify(inscs.map(i => ({ id: i.id, nome: i.nome, status_pagamento: i.status_pagamento, created_date: i.created_date })))
        });
      }
    }

    // Verificar WhatsApps duplicados
    const porWpp = {};
    todasInscricoes.forEach(insc => {
      if (insc.whatsapp) {
        if (!porWpp[insc.whatsapp]) porWpp[insc.whatsapp] = [];
        porWpp[insc.whatsapp].push(insc);
      }
    });

    for (const [wpp, inscs] of Object.entries(porWpp)) {
      if (inscs.length > 1) {
        alertas.push({
          chave_unica: `whatsapp_duplicado_${wpp}`,
          tipo_erro: 'whatsapp_duplicado',
          gravidade: 'critico',
          origem: 'sistema',
          descricao: `WhatsApp ${wpp} possui ${inscs.length} inscrições: ${inscs.map(i => `${i.nome} (${i.codigo_inscricao})`).join(', ')}`,
          pessoa_telefone: wpp,
          pessoas: inscs.map(i => ({ id: i.id, nome: i.nome, email: i.email, status: i.status_pagamento })),
          acao_recomendada: 'Mesclar registros duplicados via painel administrativo',
          dados_extras: JSON.stringify(inscs.map(i => ({ id: i.id, nome: i.nome, status_pagamento: i.status_pagamento, created_date: i.created_date })))
        });
      }
    }

    // Verificar E-mails duplicados
    const porEmail = {};
    todasInscricoes.forEach(insc => {
      if (insc.email) {
        if (!porEmail[insc.email]) porEmail[insc.email] = [];
        porEmail[insc.email].push(insc);
      }
    });

    for (const [email, inscs] of Object.entries(porEmail)) {
      if (inscs.length > 1) {
        alertas.push({
          chave_unica: `email_duplicado_${email}`,
          tipo_erro: 'email_duplicado',
          gravidade: 'critico',
          origem: 'sistema',
          descricao: `E-mail ${email} possui ${inscs.length} inscrições: ${inscs.map(i => `${i.nome} (${i.codigo_inscricao})`).join(', ')}`,
          pessoa_email: email,
          pessoas: inscs.map(i => ({ id: i.id, nome: i.nome, whatsapp: i.whatsapp, status: i.status_pagamento })),
          acao_recomendada: 'Mesclar registros duplicados via painel administrativo',
          dados_extras: JSON.stringify(inscs.map(i => ({ id: i.id, nome: i.nome, status_pagamento: i.status_pagamento, created_date: i.created_date })))
        });
      }
    }

    // Registrar alertas (evitar duplicatas com chave_unica)
    let criados = 0;
    for (const alerta of alertas) {
      try {
        const existente = await base44.asServiceRole.entities.M31AuditLog.filter({ chave_unica: alerta.chave_unica });
        if (existente.length === 0) {
          await base44.asServiceRole.entities.M31AuditLog.create(alerta);
          criados++;
        }
      } catch (e) {
        logger.error(`Erro ao criar alerta ${alerta.chave_unica}:`, e.message);
      }
    }

    return Response.json({
      sucesso: true,
      total_verificadas: todasInscricoes.length,
      duplicidades_encontradas: alertas.length,
      alertas_criados: criados,
      resumo: {
        cpf_duplicados: alertas.filter(a => a.tipo_erro === 'cpf_duplicado').length,
        whatsapp_duplicados: alertas.filter(a => a.tipo_erro === 'whatsapp_duplicado').length,
        email_duplicados: alertas.filter(a => a.tipo_erro === 'email_duplicado').length
      }
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
