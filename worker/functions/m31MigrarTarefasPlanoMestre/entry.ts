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

const AREA_LABELS = {
  coordenacao_geral: "Coordenação Geral",
  financeiro_admin: "Financeiro & Admin",
  credenciamento_checkin: "Credenciamento & Check-in",
  recepcao_acolhimento: "Recepção & Acolhimento",
  alimentacao_cantina: "Alimentação & Cantina",
  voluntariado_escalas: "Voluntariado & Escalas",
  caravanas_transporte: "Caravanas & Transporte",
  lojinha_servicos: "Lojinha & Serviços Gerais",
  infraestrutura_logistica: "Infraestrutura & Logística",
  sinalizacao_seguranca: "Sinalização & Segurança",
  palco_producao: "Palco & Produção",
  estrutura_montagem_ti: "Estrutura, Montagem & TI",
  marketing: "Marketing",
  midias_cobertura: "Mídias & Cobertura",
  intercessao: "Intercessão",
  louvor: "Louvor",
  sala_pastoral_lavapes: "Sala Pastoral & Lava-pés",
  preletoras_espaco_filhas: "Preletoras & Espaço Filhas"
};

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden — admin only' }, { status: 403 });

    const sv = base44.asServiceRole;
    const EVENTO_DATA = '2026-11-21';
    const EDICAO_NOME = 'M31 Filhas 2026';

    // ── IDEMPOTÊNCIA: reutilizar Plano-Mestre e Edição se já existirem ──
    let planoMestre;
    let edicao;
    let jaExistia = false;

    const planosExistentes = await sv.entities.M31PlanoMestre.filter({ ativo: true });
    if (planosExistentes.length > 0) {
      planoMestre = planosExistentes[0];
      const edicoes = await sv.entities.M31EdicaoEvento.filter({ nome: EDICAO_NOME });
      if (edicoes.length > 0) {
        edicao = edicoes[0];
        jaExistia = true;
      }
    }

    // ── PASSO 1: Criar Plano-Mestre v1 se não existir ──
    if (!planoMestre) {
      planoMestre = await sv.entities.M31PlanoMestre.create({
        versao: 1,
        versao_anterior_id: null,
        ativo: true,
        evento_data_referencia: EVENTO_DATA,
        resumo_alteracao: 'Plano-Mestre inicial criado pela migração automática das tarefas existentes.',
        alterado_por: user.email,
        alterado_em: new Date().toISOString(),
        total_tarefas_modelo: 0,
        total_pacotes_modelo: 0
      });
    }

    // ── PASSO 2: Criar Edição se não existir ──
    if (!edicao) {
      edicao = await sv.entities.M31EdicaoEvento.create({
        nome: EDICAO_NOME,
        data_evento: EVENTO_DATA,
        plano_mestre_id: planoMestre.id,
        plano_mestre_versao: planoMestre.versao,
        status: 'ativa',
        responsaveis_por_area: [],
        criada_em: new Date().toISOString(),
        encerrada_em: null,
        total_tarefas: 0,
        total_pacotes: 0
      });
    }

    // ── PASSO 3: Carregar todas as tarefas existentes ──
    // Carrega todas e filtra em código — o filtro {migrada_plano_mestre: false} não casa
    // documentos onde o campo não existe (tarefas legadas pré-migração).
    const todasTarefas = await sv.entities.EventoM31Tarefa.list('-created_date', 500);
    const tarefas = todasTarefas
      .filter(t => !t.migrada_plano_mestre)
      .map(t => ({
        ...t,
        area: AREA_ENUM.includes(t.area) ? t.area : 'coordenacao_geral'
      }));

    // ── PASSO 4: Agrupar por área ──
    const porArea = {};
    for (const t of tarefas) {
      if (!porArea[t.area]) porArea[t.area] = [];
      porArea[t.area].push(t);
    }

    let totalPacotesModelo = 0;
    let totalTarefasModelo = 0;
    let totalPacotesInstancia = 0;
    let totalTarefasMigradas = 0;

    // ── PASSO 5: Para cada área, criar Pacote + PacoteModelo, e TarefaModelo para cada tarefa ──
    for (const [areaKey, tarefasArea] of Object.entries(porArea)) {
      const areaLabel = AREA_LABELS[areaKey] || areaKey;

      // Pacote-Modelo
      const pacoteModelo = await sv.entities.M31PacoteModelo.create({
        plano_mestre_id: planoMestre.id,
        plano_mestre_versao: 1,
        area: areaKey,
        titulo: `Tarefas de ${areaLabel}`,
        descricao: `Agrupamento de tarefas operacionais de ${areaLabel}, migrado das tarefas existentes.`,
        objetivo: `Garantir que todas as operações de ${areaLabel} estejam mapeadas e prontas para execução.`,
        prazo_relativo_dias: null,
        lider_perfil: null,
        ordem: 0,
        ativo: true,
        dependencias_ids: []
      });
      totalPacotesModelo++;

      // Pacote (instância na edição)
      const pacote = await sv.entities.M31Pacote.create({
        edicao_id: edicao.id,
        pacote_modelo_id: pacoteModelo.id,
        area: areaKey,
        titulo: pacoteModelo.titulo,
        descricao: pacoteModelo.descricao,
        objetivo: pacoteModelo.objetivo,
        prazo: null,
        prazo_relativo_dias: null,
        responsavel_email: null,
        responsavel_nome: null,
        ordem: 0,
        ativo: true,
        dependencias_ids: [],
        favorito: false
      });
      totalPacotesInstancia++;

      // Tarefa-Modelo + atualizar tarefa instância
      const tarefasModeloParaBulk = [];
      const tarefasParaAtualizar = [];

      for (let i = 0; i < tarefasArea.length; i++) {
        const t = tarefasArea[i];

        // Calcular prazo_relativo_dias se houver prazo
        let prazoRelativoDias = null;
        if (t.prazo) {
          const dataTarefa = new Date(t.prazo + 'T12:00:00');
          const dataEvento = new Date(EVENTO_DATA + 'T12:00:00');
          const diffMs = dataTarefa.getTime() - dataEvento.getTime();
          prazoRelativoDias = Math.round(diffMs / (1000 * 60 * 60 * 24));
        }

        // Checklist modelo (sem o campo concluido — vem da instância)
        const checklistModelo = (t.checklist || []).map(item => ({
          id: item.id || crypto.randomUUID(),
          texto: item.texto || ''
        }));

        tarefasModeloParaBulk.push({
          plano_mestre_id: planoMestre.id,
          plano_mestre_versao: 1,
          pacote_modelo_id: pacoteModelo.id,
          area: areaKey,
          titulo: t.titulo || 'Tarefa sem título',
          descricao: t.descricao || '',
          tipo: t.tipo || 'operacional',
          impacto: t.impacto || 'medio',
          prioridade: t.prioridade || 'media',
          prazo_relativo_dias: prazoRelativoDias,
          checklist_modelo: checklistModelo,
          dependencias_ids: [],
          responsavel_perfil: null,
          criterio_conclusao: null,
          ordem: i,
          ativo: true
        });
      }

      // Bulk create tarefas-modelo
      const modelosCriados = await sv.entities.M31TarefaModelo.bulkCreate(tarefasModeloParaBulk);
      totalTarefasModelo += modelosCriados.length;

      // Atualizar cada tarefa instância com edicao_id, pacote_id, tarefa_modelo_id
      for (let i = 0; i < modelosCriados.length; i++) {
        const tarefaOriginal = tarefasArea[i];
        const modelo = modelosCriados[i];
        await sv.entities.EventoM31Tarefa.update(tarefaOriginal.id, {
          edicao_id: edicao.id,
          pacote_id: pacote.id,
          tarefa_modelo_id: modelo.id,
          prazo_relativo_dias: modelo.prazo_relativo_dias,
          dependencias_ids: [],
          criterio_conclusao: null,
          migrada_plano_mestre: true
        });
        totalTarefasMigradas++;
      }
    }

    // ── PASSO 6: Atualizar contadores do Plano-Mestre e Edição ──
    await sv.entities.M31PlanoMestre.update(planoMestre.id, {
      total_tarefas_modelo: totalTarefasModelo,
      total_pacotes_modelo: totalPacotesModelo
    });
    await sv.entities.M31EdicaoEvento.update(edicao.id, {
      total_tarefas: totalTarefasMigradas,
      total_pacotes: totalPacotesInstancia
    });

    return Response.json({
      status: 'sucesso',
      mensagem: 'Migração concluída com sucesso.',
      plano_mestre_id: planoMestre.id,
      plano_mestre_versao: 1,
      edicao_id: edicao.id,
      edicao_nome: EDICAO_NOME,
      data_evento: EVENTO_DATA,
      resumo: {
        areas_migradas: Object.keys(porArea).length,
        pacotes_modelo_criados: totalPacotesModelo,
        pacotes_instancia_criados: totalPacotesInstancia,
        tarefas_modelo_criadas: totalTarefasModelo,
        tarefas_migradas: totalTarefasMigradas
      }
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
})(req);
}
