import { useState } from 'react';
import { Sparkles, Plus, Pencil, X } from 'lucide-react';
import { TOKENS as T } from '@/lib/m31DesignTokens';

/**
 * GhostSugestao — card de sugestão da IA em "estado fantasma".
 * Opacidade 0.45, borda tracejada. Não conta no progresso nem nas contagens.
 * Ao tocar: mostra Adicionar / Editar / Descartar.
 */
export default function GhostSugestao({ sugestao, onAdicionar, onEditar, onDescartar }) {
  const [showActions, setShowActions] = useState(false);

  return (
    <div
      style={{
        opacity: showActions ? 0.85 : 0.45,
        border: `1.5px dashed ${T.borderStrong || T.border}`,
        borderRadius: T.radius.md,
        padding: '8px 12px',
        margin: '4px 0',
        cursor: 'pointer',
        transition: 'opacity 0.2s ease',
        background: 'transparent',
      }}
      onClick={() => setShowActions(!showActions)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
        <Sparkles size={11} color={T.primary} />
        <span style={{ fontSize: '10px', fontWeight: '700', color: T.textSubtle || T.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Sugestão da IA
        </span>
      </div>
      <div style={{ fontSize: '13px', fontWeight: '500', color: T.text }}>{sugestao.titulo}</div>
      {sugestao.descricao && (
        <div style={{ fontSize: '12px', color: T.textMuted, marginTop: '2px' }}>{sugestao.descricao}</div>
      )}
      {sugestao.checklist && sugestao.checklist.length > 0 && (
        <div style={{ marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {sugestao.checklist.map((c, i) => (
            <span key={i} style={{ fontSize: '11px', color: T.textMuted, background: T.muted || '#F4F4F5', padding: '2px 6px', borderRadius: T.radius.sm }}>
              {c}
            </span>
          ))}
        </div>
      )}
      {showActions && (
        <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
          <button
            onClick={(e) => { e.stopPropagation(); onAdicionar(sugestao); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: T.primary, color: T.onPrimary, border: 'none', borderRadius: T.radius.sm, padding: '5px 10px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: T.font.body }}
          >
            <Plus size={12} /> Adicionar
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onEditar(sugestao); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'transparent', color: T.text, border: `1px solid ${T.border}`, borderRadius: T.radius.sm, padding: '5px 10px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: T.font.body }}
          >
            <Pencil size={12} /> Editar
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDescartar(sugestao); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'transparent', color: T.textMuted, border: 'none', borderRadius: T.radius.sm, padding: '5px 10px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: T.font.body }}
          >
            <X size={12} /> Descartar
          </button>
        </div>
      )}
    </div>
  );
}