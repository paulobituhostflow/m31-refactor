// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31EncerrarRegua — ENCERRAMENTO DE RÉGUAS (REGRA 8)
 *
 * Quando a ação esperada acontece, toda a régua relacionada deve ser encerrada.
 *
 * Exemplos:
 *   Pagamento aprovado → cancelar RECUPERACAO_CHECKOUT, COBRANCA
 *   Grupo enviado → cancelar novas tentativas de GRUPO
 *   Check-in realizado → cancelar LEMBRETE, CHECKIN
 *
 * Marca todos os logs pendentes/bloqueados como 'cancelado' e libera locks ativos.
 */

function normCpf(cpf: string): string {
  return (cpf || '').replace(/\D/g, '');
}

function normalizePhone(phone: string): string {
  let d = (phone || '').replace(/\D/g, '');
  while (d.startsWith('5555')) d = d.slice(2);
  if (d.startsWith('55') && d.length >= 12) return d;
  if (d.length >= 10) return `55${d}`;
  return d;
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { cpf, telefone, email, automacoes, origem } = body;

    if (!automacoes || !Array.isArray(automacoes) || automacoes.length === 0) {
      return Response.json({
        error: 'automacoes (array) é obrigatório',
      }, { status: 400 });
    }

    const cpfNorm = normCpf(cpf || '');
    const telNorm = normalizePhone(telefone || '');
    const emailNorm = (email || '').toLowerCase().trim();
    const participante_id = cpfNorm || telNorm || emailNorm;

    if (!participante_id) {
      return Response.json({ error: 'cpf, telefone ou email é obrigatório' }, { status: 400 });
    }

    let cancelados = 0;
    const detalhes = [];

    for (const aut of automacoes) {
      // ── Cancelar logs pendentes e bloqueados para esta pessoa+automação ──
      const pendentes = await base44.asServiceRole.entities.M31AutomacaoLog.filter(
        { participante_id, automacao: aut, status: 'pendente' }
      );
      for (const p of pendentes) {
        await base44.asServiceRole.entities.M31AutomacaoLog.update(p.id, {
          status: 'cancelado',
          motivo_cancelamento: `regua_encerrada_por:${origem || 'sistema'}`,
        });
        cancelados++;
      }

      const bloqueados = await base44.asServiceRole.entities.M31AutomacaoLog.filter(
        { participante_id, automacao: aut, status: 'bloqueado' }
      );
      for (const b of bloqueados) {
        await base44.asServiceRole.entities.M31AutomacaoLog.update(b.id, {
          status: 'cancelado',
          motivo_cancelamento: `regua_encerrada_por:${origem || 'sistema'}`,
        });
        cancelados++;
      }

      // ── Liberar locks ativos para esta automação+pessoa ──
      const lockKey = `${aut}:${cpfNorm || telNorm}`;
      await base44.asServiceRole.entities.M31AutomacaoLock.updateMany(
        { chave: lockKey, ativo: true },
        { $set: { ativo: false } }
      ).catch(() => {});

      detalhes.push({ automacao: aut, cancelados: pendentes.length + bloqueados.length });
    }

    return Response.json({
      success: true,
      participante_id,
      automacoes,
      total_cancelados: cancelados,
      detalhes,
      origem: origem || 'sistema',
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
