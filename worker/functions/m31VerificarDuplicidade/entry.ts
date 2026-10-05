// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

/**
 * Verifica duplicidade de inscrição por CPF, WhatsApp ou E-mail
 * Retorna dados da inscrição existente se encontrar duplicata
 */
return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { cpf, whatsapp, email } = await req.json();

    if (!cpf && !whatsapp && !email) {
      return Response.json({ error: 'CPF, WhatsApp ou E-mail obrigatório' }, { status: 400 });
    }

    const duplicatas = [];

    // Buscar por CPF
    if (cpf) {
      const porCPF = await base44.asServiceRole.entities.EventoM31Inscricao.filter({
        cpf: cpf.replace(/\D/g, '')
      }, '-created_date', 100);
      if (porCPF.length > 0) {
        duplicatas.push({
          campo: 'CPF',
          valor: cpf,
          registros: porCPF.map(r => ({
            id: r.id,
            nome: r.nome,
            whatsapp: r.whatsapp,
            email: r.email,
            status_pagamento: r.status_pagamento,
            codigo_inscricao: r.codigo_inscricao,
            created_date: r.created_date,
          }))
        });
      }
    }

    // Buscar por WhatsApp
    if (whatsapp) {
      const wppLimpo = whatsapp.replace(/\D/g, '');
      const porWpp = await base44.asServiceRole.entities.EventoM31Inscricao.filter({
        whatsapp: wppLimpo.length === 11 ? wppLimpo : `55${wppLimpo}`
      }, '-created_date', 100);
      if (porWpp.length > 0) {
        duplicatas.push({
          campo: 'WhatsApp',
          valor: whatsapp,
          registros: porWpp.map(r => ({
            id: r.id,
            nome: r.nome,
            cpf: r.cpf,
            email: r.email,
            status_pagamento: r.status_pagamento,
            codigo_inscricao: r.codigo_inscricao,
            created_date: r.created_date,
          }))
        });
      }
    }

    // Buscar por E-mail
    if (email) {
      const porEmail = await base44.asServiceRole.entities.EventoM31Inscricao.filter({
        email: email.toLowerCase()
      }, '-created_date', 100);
      if (porEmail.length > 0) {
        duplicatas.push({
          campo: 'E-mail',
          valor: email,
          registros: porEmail.map(r => ({
            id: r.id,
            nome: r.nome,
            cpf: r.cpf,
            whatsapp: r.whatsapp,
            status_pagamento: r.status_pagamento,
            codigo_inscricao: r.codigo_inscricao,
            created_date: r.created_date,
          }))
        });
      }
    }

    return Response.json({
      tem_duplicata: duplicatas.length > 0,
      duplicatas: duplicatas,
      recomendacao: duplicatas.length > 0 
        ? 'Reutilize o registro mais antigo ou com status aprovado' 
        : 'Seguro para criar nova inscrição'
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
