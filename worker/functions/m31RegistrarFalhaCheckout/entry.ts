// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31RegistrarFalhaCheckout — REGRA PERMANENTE: erro técnico ≠ abandono comercial.
 *
 * Chamado pelo formulário público quando a tentativa de avançar para o pagamento
 * retorna erro técnico (4xx/5xx/rede). Guarda os dados já informados para que a
 * pessoa possa RETOMAR a inscrição depois, sem começar de novo.
 *
 * Público (sem auth): é o próprio formulário público que chama. Não envia nada.
 */

function normalizePhone(phone) {
  let d = (phone || '').replace(/\D/g, '');
  while (d.startsWith('5555')) d = d.slice(2);
  if (d.startsWith('55') && d.length >= 12) return d;
  if (d.length >= 10) return `55${d}`;
  return d;
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const telefone = normalizePhone(body.whatsapp || '');
    if (!telefone || telefone.length < 12) {
      return Response.json({ registrado: false, motivo: 'telefone_invalido' });
    }

    const dados = {
      nome: (body.nome || '').trim() || null,
      email: (body.email || '').trim().toLowerCase() || null,
      whatsapp: telefone,
      cpf: (body.cpf || '').replace(/\D/g, '') || null,
      cidade: (body.cidade || '').trim() || null,
      estado: body.estado || null,
      ja_participou_m31: typeof body.ja_participou_m31 === 'boolean' ? body.ja_participou_m31 : null,
      como_conheceu: body.como_conheceu || null,
      faz_parte_igreja: typeof body.faz_parte_igreja === 'boolean' ? body.faz_parte_igreja : null,
      nome_igreja: body.nome_igreja || null,
      is_gift: !!body.is_gift,
      http_status: typeof body.http_status === 'number' ? body.http_status : 0,
      erro: (body.erro || '').slice(0, 500) || null,
      etapa: ['checkout', 'voluntario', 'caravana'].includes(body.etapa) ? body.etapa : 'checkout',
      ocorrido_em: new Date().toISOString(),
    };

    // Dedup: falha aberta do mesmo telefone é atualizada, nunca duplicada.
    const abertas = await base44.asServiceRole.entities.M31FalhaCheckout.filter(
      { whatsapp: telefone, status: 'aberta' }, '-ocorrido_em', 1
    );

    if (abertas.length > 0) {
      await base44.asServiceRole.entities.M31FalhaCheckout.update(abertas[0].id, dados);
      return Response.json({ registrado: true, token: abertas[0].token, atualizado: true });
    }

    const token = crypto.randomUUID().replace(/-/g, '');
    const criada = await base44.asServiceRole.entities.M31FalhaCheckout.create({
      ...dados,
      token,
      status: 'aberta',
    });

    return Response.json({ registrado: true, token, id: criada.id });
  } catch (error) {
    return Response.json({ registrado: false, error: error.message }, { status: 500 });
  }
})(req);
}
