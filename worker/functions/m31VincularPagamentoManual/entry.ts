// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

// ═══ VÍNCULO MANUAL DE PAGAMENTO (gestão mobile) ═══
// Força o vínculo de uma inscrição com seu pagamento correspondente,
// permitindo selecionar o gateway original e o status. Só vale com sessão
// operacional ativa com escopo 'inscritas'. Todo vínculo é auditado.

const ALLOWED_PROFILES = new Set(['gestao_operacional', 'super_admin', 'coordenacao_participantes']);
const GATEWAYS = new Set(['asaas', 'mercado_pago', 'stone', 'pix_manual', 'importacao', 'gratuidade']);
const STATUS_PAGAMENTO = new Set(['aprovado', 'pendente', 'cancelado', 'gratuito']);
const ESTADO_POR_STATUS: Record<string, string> = {
  aprovado: 'confirmada',
  pendente: 'pendente',
  cancelado: 'fora_do_universo',
  gratuito: 'isenta',
};

return (async (req: Request): Promise<Response> => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.email) return Response.json({ error: 'unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const session_id = String(body.session_id || '').trim();
    const inscricao_id = String(body.inscricao_id || '').trim();
    const gateway = String(body.gateway || '').trim();
    const status_pagamento = String(body.status_pagamento || '').trim();
    if (!inscricao_id || !GATEWAYS.has(gateway) || !STATUS_PAGAMENTO.has(status_pagamento)) {
      return Response.json({ error: 'parametros_invalidos' }, { status: 400 });
    }

    const S = base44.asServiceRole.entities;
    let session: any = null;
    let member: any = null;
    let actorName = user.full_name || user.email;
    let actorProfile = user.role || 'admin';

    // No painel operacional continua obrigatório usar sessão + escopo.
    // No painel administrativo de Auditoria, um usuário Base44 role=admin pode
    // reutilizar esta mesma função sem fabricar uma sessão operacional paralela.
    if (user.role !== 'admin') {
      if (!session_id) return Response.json({ error: 'session_expired' }, { status: 401 });
      session = (await S.M31OperacaoSessao.filter({ session_id, ativa: true }, '-created_date', 1))[0];
      if (!session || session.auth_email !== user.email || new Date(session.expires_at).getTime() <= Date.now()) {
        return Response.json({ error: 'session_expired' }, { status: 401 });
      }
      const allowed = new Set(Array.isArray(session.operacoes_permitidas) ? session.operacoes_permitidas : []);
      if (!allowed.has('inscritas')) return Response.json({ error: 'operational_scope_forbidden' }, { status: 403 });
      member = (await S.EventoM31Membro.filter({ user_email: user.email, ativo: true }, '-created_date', 1))[0];
      if (!member || !ALLOWED_PROFILES.has(member.perfil)) return Response.json({ error: 'forbidden' }, { status: 403 });
      actorName = session.operador_nome || actorName;
      actorProfile = member.perfil;
    } else {
      member = (await S.EventoM31Membro.filter({ user_email: user.email, ativo: true }, '-created_date', 1))[0] || null;
      actorName = member?.nome || actorName;
      actorProfile = member?.perfil || 'admin';
    }

    const inscricao = (await S.EventoM31Inscricao.filter({ id: inscricao_id }, '-created_date', 1))[0];
    if (!inscricao) return Response.json({ error: 'inscricao_nao_encontrada' }, { status: 404 });
    const evidenciaAtual = String(inscricao.evidencia_canonica || '');
    // Nunca sobrescrever confirmação já provada por outra fonte — vínculo manual
    // não pode reverter um veredito com evidência concreta.
    if (inscricao.estado_canonico === 'confirmada' && evidenciaAtual && !evidenciaAtual.startsWith('vinculo_manual:')) {
      return Response.json({ error: 'inscricao_ja_confirmada_com_evidencia', evidencia: evidenciaAtual }, { status: 409 });
    }

    const estado = ESTADO_POR_STATUS[status_pagamento];
    const evidencia = status_pagamento === 'aprovado'
      ? `vinculo_manual:${gateway}:${user.email}`
      : status_pagamento === 'gratuito'
        ? 'gratuidade:vinculo_manual'
        : status_pagamento === 'cancelado'
          ? 'cancelada:vinculo_manual'
          : 'sem_evidencia_financeira';

    await S.EventoM31Inscricao.update(inscricao_id, {
      origem_pagamento: gateway,
      status_pagamento,
      estado_canonico: estado,
      evidencia_canonica: evidencia,
      qualidade_evidencia: status_pagamento === 'aprovado' || status_pagamento === 'gratuito' ? 'historica_conciliada' : 'sem_evidencia',
      canonica_calculada_em: new Date().toISOString(),
      conferida_manualmente: true,
    });

    await S.EventoM31ActionLog.create({
      user_email: user.email,
      user_nome: actorName,
      user_perfil: actorProfile,
      acao: 'Vínculo manual de pagamento',
      modulo: 'inscricoes',
      entidade_id: inscricao_id,
      entidade_nome: inscricao.nome || '',
      dados_novos: JSON.stringify({
        anterior: { estado_canonico: inscricao.estado_canonico, status_pagamento: inscricao.status_pagamento, origem_pagamento: inscricao.origem_pagamento || null },
        novo: { estado_canonico: estado, status_pagamento, origem_pagamento: gateway, evidencia },
      }),
      session_id: session_id || 'AUDITORIA_ADMIN',
      resultado: 'sucesso',
    });

    return Response.json({ ok: true, inscricao_id, estado_canonico: estado, origem_pagamento: gateway, status_pagamento });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'vinculo_failed' }, { status: 500 });
  }
})(req);
}
