import { useState } from 'react';
import { TOKENS as T } from '@/lib/m31DesignTokens';
import { AlertTriangle, Trash2, ArrowRightCircle, FolderInput } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';

/**
 * Dialog de confirmação de exclusão.
 * - Área: bloqueia se houver Frentes ou Tarefas vinculadas.
 * - Frente: se houver tarefas, exige escolher: mover para outra frente / deixar sem frente / cancelar.
 * - Tarefa/Subtarefa: confirmação simples.
 */
export default function DeleteConfirmDialog({ type, item, taskCount = 0, frenteCount = 0, onConfirm, onClose }) {
  const [frenteAction, setFrenteAction] = useState(null); // 'move' | 'orphan'
  const [targetFrenteId, setTargetFrenteId] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: frentes = [] } = useQuery({
    queryKey: ['m31frentes-delete'],
    queryFn: () => base44.entities.M31Frente.filter({ ativo: true }, 'ordem', 100),
    enabled: type === 'frente' && taskCount > 0,
  });

  const label = item.nome || item.titulo || 'item';
  const isBlocked = type === 'area' && (frenteCount > 0 || taskCount > 0);
  const showFrenteOptions = type === 'frente' && taskCount > 0;

  const handleConfirm = async () => {
    setSaving(true);
    try {
      await onConfirm({
        frenteAction: type === 'frente' ? (frenteAction || 'cancel') : undefined,
        targetFrenteId: frenteAction === 'move' ? targetFrenteId : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const canConfirm = !showFrenteOptions || (frenteAction === 'orphan') || (frenteAction === 'move' && targetFrenteId);

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.40)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
      onClick={onClose}
    >
      <div
        style={{ background: T.surface, borderRadius: T.radius.lg, maxWidth: '420px', width: '100%', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.16)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '20px 20px 0', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(220,38,38,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <AlertTriangle size={20} color={T.danger} />
          </div>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: T.text, margin: 0, fontFamily: T.font.body }}>
              Excluir {type === 'area' ? 'Área' : type === 'frente' ? 'Frente' : type === 'subtarefa' ? 'Subtarefa' : 'Tarefa'}
            </h3>
            <p style={{ fontSize: '13px', color: T.textMuted, margin: '2px 0 0', fontFamily: T.font.body }}>
              "{label}"
            </p>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px' }}>
          {isBlocked && (
            <div style={{ padding: '12px', background: 'rgba(220,38,38,0.06)', borderRadius: T.radius.md, border: `1px solid ${T.danger}30`, fontSize: '13px', color: T.danger, fontFamily: T.font.body, lineHeight: '18px' }}>
              Não é possível excluir esta Área enquanto houver Frentes ou Tarefas vinculadas.
              <br />
              {frenteCount > 0 && <strong>{frenteCount} frente{frenteCount !== 1 ? 's' : ''} </strong>}
              {taskCount > 0 && <strong>{taskCount} tarefa{taskCount !== 1 ? 's' : ''}</strong>}
              {' '}vinculada{taskCount + frenteCount !== 1 ? 's' : ''}.
              <br />
              Mova ou exclua os itens abaixo primeiro.
            </div>
          )}

          {!isBlocked && !showFrenteOptions && (
            <p style={{ fontSize: '14px', color: T.textMuted, margin: 0, fontFamily: T.font.body, lineHeight: '20px' }}>
              Tem certeza que deseja excluir <strong style={{ color: T.text }}>"{label}"</strong>?
              {type === 'tarefa' && ' Esta ação não pode ser desfeita (mas você pode desfazer nos próximos 5 segundos).'}
              {type === 'subtarefa' && ' As subtarefas desta tarefa também serão órfãs.'}
            </p>
          )}

          {showFrenteOptions && (
            <div>
              <p style={{ fontSize: '14px', color: T.textMuted, margin: '0 0 12px', fontFamily: T.font.body, lineHeight: '20px' }}>
                Esta Frente contém <strong style={{ color: T.text }}>{taskCount} tarefa{taskCount !== 1 ? 's' : ''}</strong>.
                O que deseja fazer com as tarefas antes de excluir a Frente?
              </p>

              {/* Option: Move to another frente */}
              <button
                onClick={() => setFrenteAction('move')}
                style={{
                  width: '100%', textAlign: 'left', padding: '12px', marginBottom: '8px',
                  border: `1.5px solid ${frenteAction === 'move' ? T.primary : T.border}`,
                  borderRadius: T.radius.md, background: frenteAction === 'move' ? 'rgba(139,26,43,0.04)' : T.surface,
                  cursor: 'pointer', fontFamily: T.font.body,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <ArrowRightCircle size={15} color={T.primary} />
                  <span style={{ fontSize: '13px', fontWeight: '600', color: T.text }}>Mover para outra Frente</span>
                </div>
                {frenteAction === 'move' && (
                  <select
                    value={targetFrenteId}
                    onChange={e => setTargetFrenteId(e.target.value)}
                    onClick={e => e.stopPropagation()}
                    style={{ width: '100%', padding: '8px', fontSize: '13px', border: `1px solid ${T.border}`, borderRadius: T.radius.sm, background: T.surface, color: T.text, fontFamily: T.font.body, marginTop: '4px' }}
                  >
                    <option value="">Selecione a Frente destino…</option>
                    {frentes.filter(f => f.id !== item.id).map(f => (
                      <option key={f.id} value={f.id}>{f.nome}</option>
                    ))}
                  </select>
                )}
              </button>

              {/* Option: Leave without frente */}
              <button
                onClick={() => setFrenteAction('orphan')}
                style={{
                  width: '100%', textAlign: 'left', padding: '12px', marginBottom: '8px',
                  border: `1.5px solid ${frenteAction === 'orphan' ? T.primary : T.border}`,
                  borderRadius: T.radius.md, background: frenteAction === 'orphan' ? 'rgba(139,26,43,0.04)' : T.surface,
                  cursor: 'pointer', fontFamily: T.font.body,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FolderInput size={15} color={T.textMuted} />
                  <span style={{ fontSize: '13px', fontWeight: '600', color: T.text }}>Deixar sem Frente</span>
                </div>
                <p style={{ fontSize: '12px', color: T.textMuted, margin: '4px 0 0 23px' }}>As tarefas ficarão sem Frente atribuída</p>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: '8px', padding: '0 20px 20px' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', border: `1px solid ${T.border}`, background: 'none', borderRadius: T.radius.md, fontSize: '14px', fontWeight: '500', color: T.textMuted, cursor: 'pointer', fontFamily: T.font.body }}>
            Cancelar
          </button>
          {!isBlocked && (
            <button
              onClick={handleConfirm}
              disabled={!canConfirm || saving}
              style={{
                flex: 1, padding: '10px', border: 'none', background: T.danger, color: '#fff',
                borderRadius: T.radius.md, fontSize: '14px', fontWeight: '600', cursor: canConfirm ? 'pointer' : 'not-allowed',
                fontFamily: T.font.body, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                opacity: (!canConfirm || saving) ? 0.5 : 1,
              }}
            >
              <Trash2 size={15} /> Excluir
            </button>
          )}
        </div>
      </div>
    </div>
  );
}