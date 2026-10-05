// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

/**
 * Gestão de dispositivos auxiliares de check-in (QR + PIN).
 * Ações:
 *  - gerar   (gestor autenticado): cria token + PIN, status pendente, expira 48h
 *  - validar (público, token+pin): ativa o dispositivo
 *  - listar  (gestor autenticado): lista dispositivos
 *  - revogar (gestor autenticado): bloqueia dispositivo
 */
return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action } = body;

    // ── VALIDAR: público (voluntário sem login), exige token + pin ──
    if (action === 'validar') {
      const { token, pin } = body;
      if (!token || !pin) return Response.json({ error: 'Token e PIN obrigatórios' }, { status: 400 });

      const devs = await base44.asServiceRole.entities.M31CheckinDispositivo.filter({ token });
      if (!devs || devs.length === 0) return Response.json({ error: 'Autorização não encontrada' }, { status: 404 });

      const dev = devs[0];
      if (dev.status === 'revogado') return Response.json({ error: 'Autorização revogada pelo gestor' }, { status: 403 });
      if (dev.expira_em && new Date(dev.expira_em) < new Date()) {
        return Response.json({ error: 'Autorização expirada. Peça um novo QR ao gestor.' }, { status: 403 });
      }
      if (String(dev.pin) !== String(pin).trim()) {
        return Response.json({ error: 'PIN incorreto' }, { status: 403 });
      }

      if (dev.status === 'pendente') {
        await base44.asServiceRole.entities.M31CheckinDispositivo.update(dev.id, {
          status: 'ativo',
          validado_em: new Date().toISOString(),
        });
      }
      return Response.json({ success: true, nome: dev.nome, expira_em: dev.expira_em });
    }

    // ── Demais ações: exigem gestor autenticado com permissão ──
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autenticado' }, { status: 401 });
    if (user.role !== 'admin') {
      const membro = await base44.asServiceRole.entities.EventoM31Membro.filter({ user_email: user.email, pode_checkin: true });
      if (!membro || membro.length === 0) {
        return Response.json({ error: 'Sem permissão para gerenciar dispositivos de check-in' }, { status: 403 });
      }
    }

    if (action === 'gerar') {
      const { nome } = body;
      if (!nome) return Response.json({ error: 'Nome do dispositivo obrigatório' }, { status: 400 });

      const bytes = new Uint8Array(24);
      crypto.getRandomValues(bytes);
      const token = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
      const pin = String((100000 + crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
      const expira = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

      const dev = await base44.asServiceRole.entities.M31CheckinDispositivo.create({
        token, pin, nome,
        status: 'pendente',
        autorizado_por: user.email,
        expira_em: expira,
      });
      return Response.json({ success: true, id: dev.id, token, pin, nome, expira_em: expira });
    }

    if (action === 'listar') {
      const devs = await base44.asServiceRole.entities.M31CheckinDispositivo.list('-created_date', 100);
      // Nunca devolve o PIN de dispositivos já ativos; token só para pendentes (reexibir QR)
      return Response.json({
        dispositivos: devs.map(d => ({
          id: d.id, nome: d.nome, status: d.status,
          autorizado_por: d.autorizado_por, validado_em: d.validado_em,
          expira_em: d.expira_em, total_checkins: d.total_checkins || 0,
          created_date: d.created_date,
          token: d.status === 'pendente' ? d.token : null,
          pin: d.status === 'pendente' ? d.pin : null,
        })),
      });
    }

    if (action === 'revogar') {
      const { id } = body;
      if (!id) return Response.json({ error: 'ID obrigatório' }, { status: 400 });
      await base44.asServiceRole.entities.M31CheckinDispositivo.update(id, { status: 'revogado' });
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
