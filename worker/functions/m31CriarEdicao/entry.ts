// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

const AREA_ENUM = [
  "coordenacao_geral", "financeiro_admin", "credenciamento_checkin",
  "recepcao_acolhimento", "alimentacao_cantina", "voluntariado_escalas",
  "caravanas_transporte", "lojinha_servicos", "infraestrutura_logistica",
  "sinalizacao_seguranca", "palco_producao", "estrutura_montagem_ti",
  "marketing", "midias_cobertura", "intercessao", "louvor",
  "sala_pastoral_lavapes", "preletoras_espaco_filhas"
];

/**
 * Calcula uma data concreta a partir do prazo_relativo_dias e da data do evento.
 * Retorna YYYY-MM-DD ou null se prazo_relativo_dias for null.
 */
function calcPrazoConcreto(prazoRelativoDias, dataEvento) {
  if (prazoRelativoDias === null || prazoRelativoDias === undefined) return null;
  const base = new Date(dataEvento + 'T12:00:00');
  base.setDate(base.getDate() + prazoRelativoDias);
  return base.toISOString().slice(0, 10);
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden — admin only' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const nomeEdicao = (body.nome_edicao || '').trim();
    const dataEvento = (body.data_evento || '').trim();

    if (!nomeEdicao) return Response.json({ error: 'nome_edicao é obrigatório' }, { status: 400 });
    if (!dataEvento) return Response.json({ error: 'data_evento é obrigatória (YYYY-MM-DD)' }, { status: 400 });

    const sv = base44.asServiceRole;

    // ── 1. Obter Plano-Mestre ativo ──
    const planosAtivos = await sv.entities.M31PlanoMestre.filter({ ativo: true });
    if (planosAtivos.length === 0) {
      return Response.json({ error: 'Nenhum Plano-Mestre ativo encontrado. Execute a migração primeiro.' }, { status: 404 });
    }
    const planoMestre = planosAtivos[0];

    // ── 2. Idempotência: não criar edição com mesmo nome ──
    const edicoesExistentes = await sv.entities.M31EdicaoEvento.filter({ nome: nomeEdicao });
    if (edicoesExistentes.length > 0) {
      return Response.json({ error: `Já existe uma edição chamada "${nomeEdicao}".` }, { status: 409 });
    }

    // ── 3. Carregar todos os modelos ativos do Plano-Mestre ──
    const pacotesModelo = await sv.entities.M31PacoteModelo.filter({
      plano_mestre_id: planoMestre.id,
      ativo: true
    });

    const tarefasModelo = await sv.entities.M31TarefaModelo.filter({
      plano_mestre_id: planoMestre.id,
      ativo: true
    });

    if (pacotesModelo.length === 0 && tarefasModelo.length === 0) {
      return Response.json({ error: 'Plano-Mestre ativo não possui pacotes nem tarefas-modelo.' }, { status: 400 });
    }

    // ── 4. Criar nova Edição (snapshot da versão do Plano-Mestre) ──
    const edicao = await sv.entities.M31EdicaoEvento.create({
      nome: nomeEdicao,
      data_evento: dataEvento,
      plano_mestre_id: planoMestre.id,
      plano_mestre_versao: planoMestre.versao,
      status: 'planejada',
      responsaveis_por_area: [],
      criada_em: new Date().toISOString(),
      encerrada_em: null,
      total_tarefas: 0,
      total_pacotes: 0
    });

    // ── 5. Clonar Pacotes-Modelo → Instâncias de Pacote ──
    // Mapa: pacote_modelo_id → pacote_instancia.id (para linkar tarefas)
    const mapaPacotes = {}; // modelo_id -> instancia_id
    let totalPacotesInstancia = 0;

    for (const pm of pacotesModelo) {
      const prazoConcreto = calcPrazoConcreto(pm.prazo_relativo_dias, dataEvento);
      const pacoteInst = await sv.entities.M31Pacote.create({
        edicao_id: edicao.id,
        pacote_modelo_id: pm.id,
        area: AREA_ENUM.includes(pm.area) ? pm.area : 'coordenacao_geral',
        titulo: pm.titulo,
        descricao: pm.descricao || '',
        objetivo: pm.objetivo || '',
        prazo: prazoConcreto,
        prazo_relativo_dias: pm.prazo_relativo_dias ?? null,
        responsavel_email: null, // ajustado por edição
        responsavel_nome: null,
        ordem: pm.ordem ?? 0,
        ativo: true,
        dependencias_ids: [], // preenchido depois do mapeamento
        favorito: false
      });
      mapaPacotes[pm.id] = pacoteInst.id;
      totalPacotesInstancia++;
    }

    // ── 6. Remapear dependências entre pacotes (modelo_id → instancia_id) ──
    for (const pm of pacotesModelo) {
      const depIdsModelo = pm.dependencias_ids || [];
      if (depIdsModelo.length === 0) continue;
      const depIdsInstancia = depIdsModelo
        .map(id => mapaPacotes[id])
        .filter(Boolean);
      if (depIdsInstancia.length > 0) {
        await sv.entities.M31Pacote.update(mapaPacotes[pm.id], {
          dependencias_ids: depIdsInstancia
        });
      }
    }

    // ── 7. Agrupar tarefas-modelo por pacote_modelo_id ──
    const tarefasPorPacote = {};
    const tarefasSemPacote = [];
    for (const tm of tarefasModelo) {
      if (tm.pacote_modelo_id && mapaPacotes[tm.pacote_modelo_id]) {
        if (!tarefasPorPacote[tm.pacote_modelo_id]) tarefasPorPacote[tm.pacote_modelo_id] = [];
        tarefasPorPacote[tm.pacote_modelo_id].push(tm);
      } else {
        tarefasSemPacote.push(tm);
      }
    }

    // ── 8. Clonar Tarefas-Modelo → Instâncias de Tarefa ──
    // Mapa: tarefa_modelo_id → tarefa_instancia.id (para dependencias)
    const mapaTarefas = {}; // modelo_id -> instancia_id
    let totalTarefasInstancia = 0;

    // Helper para instanciar checklist a partir do checklist_modelo
    const instanciarChecklist = (checklistModelo) => {
      return (checklistModelo || []).map(item => ({
        id: item.id || crypto.randomUUID(),
        texto: item.texto || '',
        concluido: false
      }));
    };

    // Helper para criar uma tarefa instância a partir do modelo
    const criarTarefaInstancia = async (tm, pacoteInstId) => {
      const prazoConcreto = calcPrazoConcreto(tm.prazo_relativo_dias, dataEvento);
      const area = AREA_ENUM.includes(tm.area) ? tm.area : 'coordenacao_geral';

      const tarefaInst = await sv.entities.EventoM31Tarefa.create({
        titulo: tm.titulo,
        descricao: tm.descricao || '',
        tipo: tm.tipo || 'operacional',
        impacto: tm.impacto || 'medio',
        area,
        prioridade: tm.prioridade || 'media',
        status: 'a_fazer',
        responsavel_email: null, // ajustado por edição
        responsavel_nome: null,
        membros_emails: [],
        prazo: prazoConcreto,
        prazo_relativo_dias: tm.prazo_relativo_dias ?? null,
        checklist: instanciarChecklist(tm.checklist_modelo),
        anexos: [],
        observacoes: '',
        observacao_conclusao: null,
        concluido_por_email: null,
        concluido_por_nome: null,
        criado_por_email: user.email,
        concluido_em: null,
        tags: [],
        edicao_id: edicao.id,
        pacote_id: pacoteInstId,
        tarefa_modelo_id: tm.id,
        dependencias_ids: [], // preenchido depois
        criterio_conclusao: tm.criterio_conclusao || null,
        favorito: false,
        migrada_plano_mestre: true
      });
      mapaTarefas[tm.id] = tarefaInst.id;
      totalTarefasInstancia++;
      return tarefaInst;
    };

    // Tarefas com pacote
    for (const [pacoteModeloId, tarefasPacote] of Object.entries(tarefasPorPacote)) {
      // Ordenar por campo ordem
      tarefasPacote.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
      const pacoteInstId = mapaPacotes[pacoteModeloId];
      for (const tm of tarefasPacote) {
        await criarTarefaInstancia(tm, pacoteInstId);
      }
    }

    // Tarefas sem pacote (avulsas) — pacote_id fica null
    for (const tm of tarefasSemPacote) {
      await criarTarefaInstancia(tm, null);
    }

    // ── 9. Remapear dependências entre tarefas (modelo_id → instancia_id) ──
    for (const tm of tarefasModelo) {
      const depIdsModelo = tm.dependencias_ids || [];
      if (depIdsModelo.length === 0) continue;
      const tarefaInstId = mapaTarefas[tm.id];
      if (!tarefaInstId) continue;
      const depIdsInstancia = depIdsModelo
        .map(id => mapaTarefas[id])
        .filter(Boolean);
      if (depIdsInstancia.length > 0) {
        await sv.entities.EventoM31Tarefa.update(tarefaInstId, {
          dependencias_ids: depIdsInstancia
        });
      }
    }

    // ── 10. Atualizar contadores da Edição ──
    await sv.entities.M31EdicaoEvento.update(edicao.id, {
      total_tarefas: totalTarefasInstancia,
      total_pacotes: totalPacotesInstancia
    });

    return Response.json({
      status: 'sucesso',
      mensagem: `Edição "${nomeEdicao}" criada com ${totalPacotesInstancia} pacote(s) e ${totalTarefasInstancia} tarefa(s) clonada(s) do Plano-Mestre v${planoMestre.versao}.`,
      edicao_id: edicao.id,
      edicao_nome: nomeEdicao,
      data_evento: dataEvento,
      plano_mestre_id: planoMestre.id,
      plano_mestre_versao: planoMestre.versao,
      resumo: {
        pacotes_clonados: totalPacotesInstancia,
        tarefas_clonadas: totalTarefasInstancia,
        areas: [...new Set(pacotesModelo.map(p => p.area))].length
      }
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
})(req);
}
