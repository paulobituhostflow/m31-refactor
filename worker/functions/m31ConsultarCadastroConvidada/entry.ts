// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31ConsultarCadastroConvidada
 *
 * Valida o token público de conclusão de cadastro da presenteada e devolve os
 * dados necessários para pré-preencher o formulário. NÃO expõe CPF, id, nem
 * dados sensíveis além do estritamente necessário (nome + whatsapp).
 *
 * Payload: { token: string }
 * Retorno: { valido, motivo_invalido?, nome, whatsapp, pagador_nome, ja_concluido, evento_nome }
 */

return (async (req: Request): Promise<Response> => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { token } = body;

    if (!token || typeof token !== 'string' || token.length < 20) {
      return Response.json({ valido: false, motivo_invalido: 'nao_encontrado' });
    }

    const inscricoes = await base44.asServiceRole.entities.EventoM31Inscricao.filter({ presenteado_token: token });
    if (!inscricoes || inscricoes.length === 0) {
      return Response.json({ valido: false, motivo_invalido: 'nao_encontrado' });
    }
    const inscricao = inscricoes[0];

    if (!['aprovado', 'gratuito'].includes(inscricao.status_pagamento)) {
      return Response.json({ valido: false, motivo_invalido: 'nao_pago' });
    }

    // Já concluído: cadastro completo
    if (inscricao.cadastro_pendente === false) {
      return Response.json({
        valido: true,
        ja_concluido: true,
        nome: inscricao.nome || '',
        whatsapp: inscricao.whatsapp || '',
        codigo_inscricao: inscricao.codigo_inscricao || '',
        qrcode_url: inscricao.qrcode_url || null,
        evento_nome: 'M31 Filhas',
      });
    }

    // Nome do pagador (opcional, para a UI mostrar "abençoada por…")
    let pagadorNome = inscricao.pagador_nome || null;
    if (!pagadorNome && inscricao.presenteado_por_id) {
      const compradoras = await base44.asServiceRole.entities.EventoM31Inscricao.filter({ id: inscricao.presenteado_por_id });
      pagadorNome = compradoras[0]?.nome || null;
    }

    return Response.json({
      valido: true,
      ja_concluido: false,
      nome: inscricao.nome || '',
      whatsapp: inscricao.whatsapp || '',
      pagador_nome: pagadorNome,
      evento_nome: 'M31 Filhas',
    });
  } catch (error) {
    return Response.json({ valido: false, motivo_invalido: 'nao_encontrado', error: error.message });
  }
})(req);
}
