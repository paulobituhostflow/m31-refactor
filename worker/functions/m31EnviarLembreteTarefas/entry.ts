// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31EnviarLembreteTarefas — LEMBRETES DE TAREFAS VIA FILA GOVERNADA
 *
 * ⚠️ NÃO envia mais nada direto (m31SendWhatsApp removido).
 * Agrupa as tarefas por responsável (1 mensagem por PESSOA) e ENFILEIRA
 * via m31EnviarMensagemGovernada (automacao LEMBRETE, idempotente por dia).
 * O envio real só acontece quando m31DrenarFila drena a fila.
 */

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Buscar configuração de lembretes ativa
    const configs = await base44.entities.TarefaLembreteConfig.filter({ ativo: true });
    if (configs.length === 0) {
      return Response.json({ success: true, message: 'Nenhuma configuração ativa', enfileirados: 0 });
    }

    const config = configs[0];

    // Buscar todas as tarefas não concluídas
    const todasTarefas = await base44.entities.EventoM31Tarefa.list('-created_date', 500);
    const tarefasAbertas = todasTarefas.filter(t => !['concluido', 'cancelado'].includes(t.status));

    // Filtrar por áreas se necessário
    const tarefasFiltradas = config.areas_filtro && config.areas_filtro.length > 0
      ? tarefasAbertas.filter(t => config.areas_filtro.includes(t.area))
      : tarefasAbertas;

    // Buscar membros para ter o whatsapp
    const membros = await base44.entities.EventoM31Membro.list();
    const membroMap = Object.fromEntries(membros.map(m => [m.user_email, m]));

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const dataStr = hoje.toISOString().slice(0, 10);

    // ── AGRUPAR POR RESPONSÁVEL: a PESSOA é a unidade de controle (1 mensagem/pessoa/dia) ──
    const porResponsavel: Record<string, { membro: any; blocos: string[] }> = {};

    for (const tarefa of tarefasFiltradas) {
      if (!tarefa.responsavel_email || !tarefa.prazo) continue;

      const membro = membroMap[tarefa.responsavel_email];
      if (!membro || !membro.whatsapp) continue;

      const dataVencimento = new Date(tarefa.prazo);
      dataVencimento.setHours(0, 0, 0, 0);
      const diasRestantes = Math.ceil((dataVencimento.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));

      if (diasRestantes > config.dias_antes_vencimento) continue;
      if (diasRestantes < 0 && !config.incluir_atrasadas) continue;

      const bloco = config.template_whatsapp
        .replace('{NOME_RESPONSAVEL}', membro.nome || 'Colega')
        .replace('{TITULO_TAREFA}', tarefa.titulo || 'Sem título')
        .replace('{PRAZO_TAREFA}', new Date(tarefa.prazo).toLocaleDateString('pt-BR'))
        .replace('{DIAS_RESTANTES}', Math.max(0, diasRestantes).toString());

      if (!porResponsavel[tarefa.responsavel_email]) {
        porResponsavel[tarefa.responsavel_email] = { membro, blocos: [] };
      }
      porResponsavel[tarefa.responsavel_email].blocos.push(bloco);
    }

    // ── ENFILEIRAR via governança (nenhum envio direto) ──
    let enfileirados = 0;
    const bloqueados: any[] = [];

    for (const { membro, blocos } of Object.values(porResponsavel)) {
      const mensagem = blocos.join('\n\n');
      const res = await base44.functions.invoke('m31EnviarMensagemGovernada', {
        telefone: membro.whatsapp,
        email: membro.user_email,
        automacao: 'LEMBRETE',
        template: 'lembrete_tarefas_diario',
        versao: `DIARIO_${dataStr}`,
        origem: 'm31EnviarLembreteTarefas',
        mensagens: [{ message: mensagem }],
      });

      if (res?.enfileirado === true) {
        enfileirados++;
      } else {
        bloqueados.push({ email: membro.user_email, motivo: res?.motivo || res?.error || 'desconhecido' });
      }
    }

    // Atualizar último disparo e contador (agora conta ENFILEIRADOS, não enviados)
    await base44.entities.TarefaLembreteConfig.update(config.id, {
      ultimo_disparo: new Date().toISOString(),
      total_enviados: (config.total_enviados || 0) + enfileirados,
    });

    return Response.json({
      success: true,
      message: `${enfileirados} lembretes enfileirados na fila global (envio só via m31DrenarFila)`,
      enfileirados,
      bloqueados,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Erro em m31EnviarLembreteTarefas:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
