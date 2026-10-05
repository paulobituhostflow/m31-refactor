/**
 * Biblioteca compartilhada de cálculos operacionais.
 * Fonte única de verdade para progresso, criticidade e próxima ação.
 * Consumida por:
 *   - M31GestaoTarefas (Tarefas)
 *   - M31Logistica / MapaOperacao (Centro de Operações)
 *   - tarefaHelpers.js (progresso consolidado)
 *
 * Regra de ouro: NUNCA duplicar status, checklist, responsável ou prazo.
 * Tudo lê diretamente de EventoM31Tarefa.
 */

import { LEGACY_AREA_TO_NEW_SLUG } from '@/lib/m31Areas';

const MS_48H = 48 * 60 * 60 * 1000;
const PRIORIDADE_ORDEM = { urgente: 0, alta: 1, media: 2, baixa: 3 };

/**
 * Resolve o slug da área de uma tarefa, independentemente de ela ter
 * area_id (novo) ou area (legado de 18 setores).
 * Retorna o slug oficial da M31Area correspondente.
 */
export function resolverAreaSlug(tarefa, areaIdToSlug = new Map()) {
  if (tarefa.area_id && areaIdToSlug.has(tarefa.area_id)) {
    return areaIdToSlug.get(tarefa.area_id);
  }
  if (tarefa.area && LEGACY_AREA_TO_NEW_SLUG[tarefa.area]) {
    return LEGACY_AREA_TO_NEW_SLUG[tarefa.area];
  }
  return null;
}

/**
 * Verifica se uma tarefa é crítica.
 * Critério: atrasada, bloqueada, marcada como crítica, ou com prazo ≤ 48h sem conclusão.
 */
export function isCritica(tarefa, now = new Date()) {
  if (!tarefa) return false;
  if (tarefa.status === 'concluido') return false;
  if (['critico', 'atrasado', 'bloqueado'].includes(tarefa.status)) return true;
  if (tarefa.prazo) {
    const prazo = new Date(tarefa.prazo + 'T12:00:00');
    const diff = prazo.getTime() - now.getTime();
    if (diff <= MS_48H && diff >= -MS_48H * 15) return true; // dentro de 48h (ou já passou recentemente)
  }
  return false;
}

/**
 * Calcula o progresso de uma única tarefa (0-100).
 * Se concluída → 100.
 * Se tem checklist → % de itens concluídos.
 * Caso contrário → 0 (a fazer) ou 50 (em andamento/execução).
 */
export function calcProgressoTarefa(tarefa) {
  if (!tarefa) return 0;
  if (tarefa.status === 'concluido') return 100;
  const checklist = tarefa.checklist;
  if (checklist && checklist.length > 0) {
    const done = checklist.filter(c => c.concluido).length;
    return Math.round((done / checklist.length) * 100);
  }
  if (['em_andamento', 'em_execucao'].includes(tarefa.status)) return 50;
  return 0;
}

/**
 * Calcula o progresso consolidado de um conjunto de tarefas.
 * Fórmula: média do progresso individual de cada tarefa (que já inclui checklist).
 * Retorna { pct, done, total }.
 */
export function calcProgressoFrente(tarefas) {
  if (!tarefas || tarefas.length === 0) return { pct: 0, done: 0, total: 0 };
  const total = tarefas.length;
  const done = tarefas.filter(t => t.status === 'concluido').length;
  const somaProgresso = tarefas.reduce((acc, t) => acc + calcProgressoTarefa(t), 0);
  const pct = Math.round(somaProgresso / total);
  return { pct, done, total };
}

/**
 * Determina a próxima ação de um conjunto de tarefas.
 * Critério: maior prioridade disponível, com dependências anteriores concluídas.
 * Retorna a tarefa ou null.
 */
export function calcProximaAcao(tarefas, now = new Date()) {
  if (!tarefas || tarefas.length === 0) return null;

  const concluidas = new Set(tarefas.filter(t => t.status === 'concluido').map(t => t.id));

  const elegiveis = tarefas.filter(t => {
    if (t.status === 'concluido') return false;
    // Verifica dependências
    const deps = t.dependencias_ids || [];
    if (deps.length > 0 && !deps.every(depId => concluidas.has(depId))) return false;
    return true;
  });

  if (elegiveis.length === 0) return null;

  // Ordena por: prioridade → criticidade → prazo mais próximo
  return elegiveis.sort((a, b) => {
    const pa = PRIORIDADE_ORDEM[a.prioridade] ?? 2;
    const pb = PRIORIDADE_ORDEM[b.prioridade] ?? 2;
    if (pa !== pb) return pa - pb;

    const ca = isCritica(a, now) ? 0 : 1;
    const cb = isCritica(b, now) ? 0 : 1;
    if (ca !== cb) return ca - cb;

    if (a.prazo && b.prazo) return new Date(a.prazo) - new Date(b.prazo);
    if (a.prazo) return -1;
    if (b.prazo) return 1;
    return 0;
  })[0];
}

/**
 * Agrega tarefas por Área → Frente, usando a hierarquia unificada.
 * @param {Array} tarefas — lista de EventoM31Tarefa
 * @param {Array} areas — lista de M31Area (ordenada por 'ordem')
 * @param {Array} frentes — lista de M31Frente (ordenada por 'ordem')
 * @param {Map} areaIdToSlug — mapa area_id → slug
 * @returns Estrutura: [{ area, frentes: [{ frente, tarefas, progresso, criticas, proximaAcao }] }]
 */
export function agregarPorAreaEFrente(tarefas, areas = [], frentes = [], areaIdToSlug = new Map()) {
  const now = new Date();

  // Agrupa frentes por area_id
  const frentesPorArea = new Map();
  frentes.forEach(f => {
    if (!frentesPorArea.has(f.area_id)) frentesPorArea.set(f.area_id, []);
    frentesPorArea.get(f.area_id).push(f);
  });

  // Agrupa tarefas por (area_id, frente_id)
  const tarefasPorFrente = new Map();
  const tarefasPorAreaSemFrente = new Map();
  const tarefasPorAreaSlug = new Map(); // fallback para legadas sem area_id

  tarefas.forEach(t => {
    if (t.frente_id) {
      if (!tarefasPorFrente.has(t.frente_id)) tarefasPorFrente.set(t.frente_id, []);
      tarefasPorFrente.get(t.frente_id).push(t);
    } else if (t.area_id) {
      if (!tarefasPorAreaSemFrente.has(t.area_id)) tarefasPorAreaSemFrente.set(t.area_id, []);
      tarefasPorAreaSemFrente.get(t.area_id).push(t);
    } else {
      // Legado: resolver por slug
      const slug = resolverAreaSlug(t, areaIdToSlug) || '_sem_area';
      if (!tarefasPorAreaSlug.has(slug)) tarefasPorAreaSlug.set(slug, []);
      tarefasPorAreaSlug.get(slug).push(t);
    }
  });

  // Monta estrutura por área
  const resultado = areas.filter(a => a.ativo !== false).map(area => {
    const frentesDaArea = frentesPorArea.get(area.id) || [];
    const tarefasAvulsas = tarefasPorAreaSemFrente.get(area.id) || [];
    const tarefasLegadas = tarefasPorAreaSlug.get(area.slug) || [];

    const frentesComTarefas = frentesDaArea.map(f => {
      const ts = tarefasPorFrente.get(f.id) || [];
      return {
        frente: f,
        tarefas: ts,
        progresso: calcProgressoFrente(ts),
        criticas: ts.filter(t => isCritica(t, now)),
        proximaAcao: calcProximaAcao(ts, now),
      };
    });

    // Tarefas sem frente (avulsas ou legadas)
    const avulsas = [...tarefasAvulsas, ...tarefasLegadas];
    if (avulsas.length > 0) {
      frentesComTarefas.push({
        frente: { id: null, nome: 'Avulsas', slug: '_avulsas', area_id: area.id },
        tarefas: avulsas,
        progresso: calcProgressoFrente(avulsas),
        criticas: avulsas.filter(t => isCritica(t, now)),
        proximaAcao: calcProximaAcao(avulsas, now),
      });
    }

    const todasTarefas = frentesComTarefas.flatMap(f => f.tarefas);

    return {
      area,
      frentes: frentesComTarefas.filter(f => f.tarefas.length > 0 || frentesDaArea.includes(f.frente)),
      totalTarefas: todasTarefas.length,
      progresso: calcProgressoFrente(todasTarefas),
      criticas: todasTarefas.filter(t => isCritica(t, now)),
      proximaAcao: calcProximaAcao(todasTarefas, now),
      temDados: todasTarefas.length > 0,
    };
  });

  return resultado;
}