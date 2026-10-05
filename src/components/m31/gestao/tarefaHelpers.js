/**
 * Shared helpers para Tarefa Mãe / Subtarefa / Checklist.
 * Labels e cores para status e prioridade, mais calculadora de progresso.
 */
import { TOKENS as T } from '@/lib/m31DesignTokens';

export const STATUS_LABELS = {
  a_fazer: 'A Fazer',
  em_andamento: 'Em andamento',
  em_execucao: 'Em execução',
  atencao: 'Atenção',
  atrasado: 'Atrasado',
  critico: 'Crítico',
  bloqueado: 'Bloqueado',
  concluido: 'Concluído',
};

export const STATUS_COLORS = {
  concluido: T.success,
  atrasado: T.danger,
  critico: T.danger,
  em_andamento: '#2563EB',
  em_execucao: '#2563EB',
  atencao: T.warning,
  a_fazer: T.textMuted,
  bloqueado: T.textSubtle,
};

export const PRIORIDADE_LABELS = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  urgente: 'Urgente',
};

export const PRIORIDADE_COLORS = {
  baixa: T.textMuted,
  media: T.textMuted,
  alta: T.warning,
  urgente: T.danger,
};

/** Formata data ISO/date para DD/MM */
export function formatPrazo(prazo) {
  if (!prazo) return '';
  try {
    const d = new Date(prazo + 'T12:00:00');
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  } catch {
    return '';
  }
}

/** True se a tarefa está atrasada (prazo passado e não concluída) */
export function isAtrasada(t) {
  if (!t.prazo || t.status === 'concluido') return false;
  return new Date(t.prazo + 'T12:00:00') < new Date();
}

/**
 * Calcula progresso consolidado de um conjunto de tarefas (e suas subtarefas).
 * Retorna { pct, done, total }.
 * Fórmula: média do progresso individual de cada tarefa (que já inclui
 * avanço do checklist interno — não duplica status).
 * A Frente passa suas Tarefas Mãe + todas as Subtarefas; a Área passa tudo.
 */
export function calcProgresso(tarefas) {
  if (!tarefas || tarefas.length === 0) return { pct: 0, done: 0, total: 0 };
  const done = tarefas.filter(t => t.status === 'concluido').length;
  const total = tarefas.length;
  const somaProgresso = tarefas.reduce((acc, t) => {
    if (t.status === 'concluido') return acc + 100;
    const checklist = t.checklist;
    if (checklist && checklist.length > 0) {
      const checkDone = checklist.filter(c => c.concluido).length;
      return acc + Math.round((checkDone / checklist.length) * 100);
    }
    if (['em_andamento', 'em_execucao'].includes(t.status)) return acc + 50;
    return acc;
  }, 0);
  const pct = total > 0 ? Math.round(somaProgresso / total) : 0;
  return { pct, done, total };
}