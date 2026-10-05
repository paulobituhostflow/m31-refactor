import { Sparkles, X } from 'lucide-react';
import { TOKENS as T } from '@/lib/m31DesignTokens';
import { getAreaColor } from './SectorBadge';
import GhostSugestaoList from './GhostSugestaoList';

/**
 * SugestoesIAModal — modal central de sugestões da IA para uma Área.
 * Substitui as múltiplas linhas "Sugestões da IA" que apareciam em cada Frente.
 * Mostra sugestões para a área como um todo (frente=null).
 */
export default function SugestoesIAModal({ area, frentes, tarefasExistentes, onAceitar, canEdit, onClose }) {
  if (!area) return null;
  const areaColor = getAreaColor(area.slug || area.key);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: T.surface,
          borderRadius: T.radius.lg,
          width: '100%', maxWidth: '560px', maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '16px 20px',
          borderBottom: `1px solid ${T.border}`,
          flexShrink: 0,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '32px', height: '32px', borderRadius: '6px',
            background: `${areaColor}14`,
            border: `1px solid ${areaColor}30`,
            flexShrink: 0,
          }}>
            <Sparkles size={16} style={{ color: areaColor }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '15px', fontWeight: '600', color: T.text }}>
              Sugestões da IA
            </div>
            <div style={{ fontSize: '12px', color: T.textMuted, marginTop: '1px' }}>
              {area.nome} · {frentes?.length || 0} frente(s)
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '32px', height: '32px', borderRadius: '6px',
              border: `1px solid ${T.border}`, background: 'transparent',
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            <X size={16} color={T.textMuted} />
          </button>
        </div>

        {/* Body */}
        <div style={{ overflow: 'auto', padding: '12px 16px 16px' }}>
          <GhostSugestaoList
            area={area}
            frente={null}
            tarefasExistentes={tarefasExistentes}
            onAceitar={onAceitar}
            canEdit={canEdit}
            autoExpand
          />
        </div>
      </div>
    </div>
  );
}