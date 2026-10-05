import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Plus, Check, Calendar } from 'lucide-react';
import { TOKENS as T } from '@/lib/m31DesignTokens';
import { formatPrazo } from './gestao/tarefaHelpers';

/**
 * SubtarefasSection — barra lateral de subtarefas dentro do modal de tarefa.
 * Aparece apenas em Tarefas Mãe existentes (tarefa.id && !tarefaPai).
 * Permite adicionar subtarefas digitando o nome + Enter, sem abrir outro modal.
 */
export default function SubtarefasSection({ tarefaId, canEdit, userEmail, onEditSubtarefa }) {
  const qc = useQueryClient();
  const [novaSub, setNovaSub] = useState('');
  const [expandido, setExpandido] = useState(true);

  const { data: subtarefas = [] } = useQuery({
    queryKey: ['subtarefas', tarefaId],
    queryFn: () => base44.entities.EventoM31Tarefa.filter({ tarefa_pai_id: tarefaId }, '-created_date', 100),
    enabled: !!tarefaId,
    refetchInterval: 15000,
  });

  const concluidas = subtarefas.filter(s => s.status === 'concluido').length;

  async function criarSubtarefa(e) {
    e?.preventDefault();
    const titulo = novaSub.trim();
    if (!titulo) return;

    const pai = subtarefas.length > 0 ? null : null; // já temos o pai via tarefaId
    await base44.entities.EventoM31Tarefa.create({
      titulo,
      tarefa_pai_id: tarefaId,
      status: 'a_fazer',
      prioridade: 'media',
      tipo: 'operacional',
      impacto: 'medio',
      criado_por_email: userEmail,
    });
    setNovaSub('');
    qc.invalidateQueries(['subtarefas', tarefaId]);
    qc.invalidateQueries(['m31tarefas']);
  }

  async function toggleStatus(sub) {
    await base44.entities.EventoM31Tarefa.update(sub.id, {
      status: sub.status === 'concluido' ? 'a_fazer' : 'concluido',
      ...(sub.status !== 'concluido' ? { concluido_em: new Date().toISOString() } : {}),
    });
    qc.invalidateQueries(['subtarefas', tarefaId]);
    qc.invalidateQueries(['m31tarefas']);
  }

  const pct = subtarefas.length > 0 ? Math.round((concluidas / subtarefas.length) * 100) : 0;

  return (
    <div style={{
      border: `1px solid ${T.border}`,
      borderRadius: T.radius.md,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <button
        onClick={() => setExpandido(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          width: '100%', padding: '10px 12px',
          background: T.surfaceSubtle, border: 'none', cursor: 'pointer',
          fontFamily: T.font.body,
        }}
      >
        <ChevronDown size={14} color={T.textMuted} style={{
          transform: expandido ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s ease',
        }} />
        <span style={{ fontSize: '13px', fontWeight: '600', color: T.text, flex: 1, textAlign: 'left' }}>
          Subtarefas
        </span>
        {subtarefas.length > 0 && (
          <>
            <div style={{ width: '50px', height: '5px', background: T.border, borderRadius: T.radius.pill, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: T.success, transition: 'width 0.3s ease' }} />
            </div>
            <span style={{ fontSize: '11px', color: T.textMuted, fontWeight: '500' }}>
              {concluidas}/{subtarefas.length}
            </span>
          </>
        )}
      </button>

      {/* Body */}
      {expandido && (
        <div style={{ padding: '4px 12px 8px' }}>
          {subtarefas.length === 0 && !canEdit && (
            <div style={{ padding: '8px 0', fontSize: '13px', color: T.textMuted }}>
              Nenhuma subtarefa.
            </div>
          )}

          {subtarefas.map(sub => {
            const concluido = sub.status === 'concluido';
            return (
              <div key={sub.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: '8px',
                padding: '6px 0', borderBottom: `1px solid ${T.borderSubtle}`,
              }}>
                <button
                  onClick={() => canEdit && toggleStatus(sub)}
                  disabled={!canEdit}
                  style={{
                    width: '18px', height: '18px', borderRadius: '5px',
                    border: concluido ? 'none' : `1.5px solid ${T.borderStrong}`,
                    background: concluido ? T.success : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, cursor: canEdit ? 'pointer' : 'default',
                    marginTop: '1px', padding: 0,
                  }}
                >
                  {concluido && <Check size={11} color={T.onPrimary} strokeWidth={3} />}
                </button>
                <div
                  style={{ flex: 1, minWidth: 0, cursor: onEditSubtarefa ? 'pointer' : 'default' }}
                  onClick={() => onEditSubtarefa && onEditSubtarefa(sub)}
                >
                  <span style={{
                    fontSize: '13px', fontWeight: '500',
                    color: concluido ? T.textMuted : T.text,
                    textDecoration: concluido ? 'line-through' : 'none',
                  }}>
                    {sub.titulo}
                  </span>
                  {sub.prazo && (
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: '3px',
                      fontSize: '11px', color: T.textMuted, marginLeft: '8px',
                    }}>
                      <Calendar size={10} /> {formatPrazo(sub.prazo)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Adicionar subtarefa — input inline + Enter */}
          {canEdit && (
            <form onSubmit={criarSubtarefa} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '8px 0 4px',
            }}>
              <Plus size={15} color={T.primary} style={{ flexShrink: 0 }} />
              <input
                value={novaSub}
                onChange={e => setNovaSub(e.target.value)}
                placeholder="Adicionar subtarefa..."
                style={{
                  flex: 1, border: 'none', outline: 'none',
                  background: 'transparent', color: T.text,
                  fontSize: '13px', fontFamily: T.font.body,
                  padding: '4px 0',
                }}
              />
              {novaSub.trim() && (
                <button type="submit" style={{
                  background: T.primary, color: T.onPrimary, border: 'none',
                  borderRadius: T.radius.sm, padding: '4px 10px',
                  fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                  fontFamily: T.font.body,
                }}>
                  Enter
                </button>
              )}
            </form>
          )}
        </div>
      )}
    </div>
  );
}