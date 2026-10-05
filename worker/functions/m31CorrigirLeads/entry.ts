// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

function valorPorEtiqueta(observacoes) {
  if (!observacoes) return null;
  const obs = observacoes.toLowerCase();
  if (obs.includes('pré venda') || obs.includes('pre venda')) return 97;
  if (obs.includes('1º lote') || obs.includes('1o lote') || obs.includes('lote 1')) return 110;
  if (obs.includes('2º lote') || obs.includes('lote 2')) return 129;
  if (obs.includes('3º lote') || obs.includes('lote 3')) return 139;
  if (obs.includes('4º lote') || obs.includes('lote 4')) return 149;
  return null;
}

function normalizarStatus(statusAtual) {
  if (statusAtual === 'aprovado' || statusAtual === 'gratuito') return statusAtual;
  return 'pendente';
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function updateComRetry(entities, id, updates, maxTentativas = 5) {
  for (let t = 0; t < maxTentativas; t++) {
    try {
      await entities.update(id, updates);
      return true;
    } catch (e) {
      if (e.status === 429 || (e.message && e.message.includes('Rate limit'))) {
        const delay = 1000 * Math.pow(2, t); // 1s, 2s, 4s, 8s, 16s
        logger.log(`Rate limit, aguardando ${delay}ms...`);
        await sleep(delay);
      } else {
        throw e;
      }
    }
  }
  return false;
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dry_run = body.dry_run !== false;

    const todos = await base44.asServiceRole.entities.EventoM31Inscricao.list('-created_date', 2000);
    logger.log(`Total: ${todos.length}`);

    const correcoes = [];
    for (const ins of todos) {
      const updates = {};
      let mudou = false;

      const valorCorreto = valorPorEtiqueta(ins.observacoes);
      if (valorCorreto !== null && ins.status_pagamento === 'aprovado' && ins.valor_pago !== valorCorreto) {
        updates.valor_pago = valorCorreto;
        mudou = true;
      }

      const statusCorreto = normalizarStatus(ins.status_pagamento);
      if (statusCorreto !== ins.status_pagamento) {
        updates.status_pagamento = statusCorreto;
        mudou = true;
      }

      if (mudou) correcoes.push({ id: ins.id, nome: ins.nome, updates,
        status_antes: ins.status_pagamento, status_depois: updates.status_pagamento ?? ins.status_pagamento });
    }

    if (dry_run) {
      return Response.json({ dry_run: true, total: todos.length, a_corrigir: correcoes.length, preview: correcoes.slice(0, 5) });
    }

    // Atualiza 1 por vez com backoff — lento mas confiável
    let atualizados = 0;
    for (const c of correcoes) {
      const ok = await updateComRetry(base44.asServiceRole.entities.EventoM31Inscricao, c.id, c.updates);
      if (ok) atualizados++;
      await sleep(300); // 300ms entre cada update
      if (atualizados % 10 === 0) logger.log(`Progresso: ${atualizados}/${correcoes.length}`);
    }

    return Response.json({ success: true, total: todos.length, atualizados, message: `${atualizados} registros corrigidos.` });

  } catch (error) {
    logger.error('Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
