// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

/**
 * Check-in via código inscrição ou QR code token.
 * Autenticação: usuário logado (admin/pode_checkin) OU dispositivo auxiliar
 * autorizado via QR + PIN (device_token de M31CheckinDispositivo, status ativo).
 */
return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    let { codigo_inscricao, qrcode_token, device_token } = body;

    // ── Autenticação: dispositivo auxiliar OU usuário logado ──
    let operadorLabel = null;
    let dispositivo = null;
    if (device_token) {
      const devs = await base44.asServiceRole.entities.M31CheckinDispositivo.filter({ token: device_token });
      const dev = devs?.[0];
      if (!dev || dev.status !== 'ativo') {
        return Response.json({ error: 'Dispositivo não autorizado' }, { status: 403 });
      }
      if (dev.expira_em && new Date(dev.expira_em) < new Date()) {
        return Response.json({ error: 'Autorização do dispositivo expirada' }, { status: 403 });
      }
      operadorLabel = `Dispositivo: ${dev.nome}`;
      dispositivo = dev;
    } else {
      let user = null;
      try { user = await base44.auth.me(); } catch (_) {}
      if (!user) return Response.json({ error: 'Não autenticado' }, { status: 401 });
      if (user.role !== 'admin') {
        const membroEquipe = await base44.asServiceRole.entities.EventoM31Membro.filter({
          user_email: user.email,
          pode_checkin: true,
          ativo: true,
        });
        if (!membroEquipe || membroEquipe.length === 0) {
          return Response.json({ error: 'Sem permissão para fazer check-in' }, { status: 403 });
        }
      }
      operadorLabel = user.email;
    }

    if (!codigo_inscricao && !qrcode_token) {
      return Response.json({ error: 'Código ou QR obrigatório' }, { status: 400 });
    }

    // Se receber token de QR, decodificar e extrair codigo
    if (qrcode_token && !codigo_inscricao) {
      try {
        const qrData = atob(qrcode_token);
        const [prefixo, codigo] = qrData.split('|');
        if (prefixo !== 'M31') {
          return Response.json({ error: 'QR code inválido' }, { status: 400 });
        }
        codigo_inscricao = codigo;
      } catch (_) {
        return Response.json({ error: 'QR code corrompido' }, { status: 400 });
      }
    }

    // O QR pode conter o payload "M31|CODIGO|..." em claro — extrai o código
    if (codigo_inscricao && codigo_inscricao.includes('|')) {
      const partes = codigo_inscricao.split('|');
      if (partes[0] === 'M31' && partes[1]) codigo_inscricao = partes[1];
    }

    const inscricoes = await base44.asServiceRole.entities.EventoM31Inscricao.filter({
      codigo_inscricao: codigo_inscricao.toUpperCase().trim(),
    });

    if (!inscricoes || inscricoes.length === 0) {
      return Response.json({ error: 'Inscrição não encontrada' }, { status: 404 });
    }

    const inscricao = inscricoes[0];

    if (inscricao.status_pagamento === 'cancelado') {
      return Response.json({ error: 'Inscrição cancelada, pagamento não confirmado' }, { status: 400 });
    }
    if (inscricao.duplicada_de_id || inscricao.classificacao_registro === 'teste' || inscricao.estado_canonico === 'fora_do_universo') {
      return Response.json({ error: 'Inscrição fora do universo do evento' }, { status: 400 });
    }
    if (!['aprovado', 'gratuito'].includes(inscricao.status_pagamento) && !['confirmada', 'isenta'].includes(inscricao.estado_canonico)) {
      return Response.json({ error: 'Pagamento ainda não confirmado' }, { status: 400 });
    }
    if (inscricao.checkin_realizado) {
      return Response.json({
        error: 'Check-in já realizado!',
        aviso: true,
        inscricao: {
          id: inscricao.id,
          nome: inscricao.nome,
          codigo_inscricao: inscricao.codigo_inscricao,
          tipo: inscricao.tipo,
          ordem_operacional: inscricao.ordem_operacional,
          caravana_nome: inscricao.caravana_nome,
          checkin_anterior: inscricao.checkin_at,
          mensagem: `${inscricao.nome} já fez check-in em ${new Date(inscricao.checkin_at).toLocaleTimeString('pt-BR')}`,
        },
      }, { status: 200 });
    }

    // Registrar check-in
    await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
      checkin_realizado: true,
      checkin_at: new Date().toISOString(),
    });
    if (dispositivo) {
      try { await base44.asServiceRole.entities.M31CheckinDispositivo.update(dispositivo.id, { total_checkins: (dispositivo.total_checkins || 0) + 1 }); } catch (_) {}
    }

    // Registrar ação na auditoria
    try {
      await base44.asServiceRole.entities.EventoM31ActionLog.create({
        user_email: operadorLabel,
        user_nome: operadorLabel,
        acao: `Check-in realizado: ${inscricao.nome}`,
        modulo: 'checkin',
        entidade_id: inscricao.id,
        entidade_nome: inscricao.nome,
      });
    } catch (_) {}

    return Response.json({
      success: true,
      inscricao: {
        id: inscricao.id,
        nome: inscricao.nome,
        codigo_inscricao: inscricao.codigo_inscricao,
        tipo: inscricao.tipo,
        ordem_operacional: inscricao.ordem_operacional,
        caravana_nome: inscricao.caravana_nome,
        checkin_realizado: true,
        checkin_at: new Date().toISOString(),
        mensagem: `✅ Bem-vinda, ${inscricao.nome}!`,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);

}
