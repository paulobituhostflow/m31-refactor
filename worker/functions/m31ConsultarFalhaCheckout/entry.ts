// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31ConsultarFalhaCheckout — devolve os dados já informados por quem sofreu falha
 * técnica no checkout, para pré-preencher o formulário no link de retomada.
 * Acesso apenas por token aleatório (o próprio dono do link).
 */

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { token } = await req.json();
    if (!token) return Response.json({ error: 'token obrigatório' }, { status: 400 });

    // Fonte 1: rastro na própria inscrição (retomada_token) — retoma de onde parou
    const insc = await base44.asServiceRole.entities.EventoM31Inscricao.filter({ retomada_token: token }, '-created_date', 1);
    if (insc.length > 0) {
      const i = insc[0];
      return Response.json({
        encontrado: true,
        etapa_funil: i.etapa_funil || null,
        dados: {
          nome: i.nome || '', email: i.email || '', whatsapp: i.whatsapp || '',
          cpf: i.cpf || '', cidade: i.cidade || '', estado: i.estado || '',
          ja_participou_m31: i.ja_participou_m31,
          como_conheceu: i.como_conheceu || '',
          faz_parte_igreja: i.faz_parte_igreja,
          nome_igreja: i.nome_igreja || '',
        },
      });
    }

    // Fonte 2: registro do incidente de falha técnica
    const encontradas = await base44.asServiceRole.entities.M31FalhaCheckout.filter({ token }, '-ocorrido_em', 1);
    if (encontradas.length === 0) return Response.json({ encontrado: false });

    const f = encontradas[0];
    return Response.json({
      encontrado: true,
      dados: {
        nome: f.nome || '',
        email: f.email || '',
        whatsapp: f.whatsapp || '',
        cpf: f.cpf || '',
        cidade: f.cidade || '',
        estado: f.estado || '',
        ja_participou_m31: f.ja_participou_m31,
        como_conheceu: f.como_conheceu || '',
        faz_parte_igreja: f.faz_parte_igreja,
        nome_igreja: f.nome_igreja || '',
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
