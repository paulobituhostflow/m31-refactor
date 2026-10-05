/**
 * M31Drawer — Componente oficial reutilizável do sistema M31.
 *
 * Estrutura fixa:
 *   • Cabeçalho  (avatar? + título + subtítulo + status + fechar)
 *   • Abas       (opcionais, via prop `tabs`)
 *   • Corpo      (children | skeleton | empty state)
 *   • Rodapé     (opcional, via prop `footer`)
 *
 * Recursos:
 *   - fecha no ESC
 *   - fecha clicando fora (configurável: closeOnOverlayClick)
 *   - animação única (slide 250ms + fade content)
 *   - suporta loading + skeleton
 *   - suporta empty state
 *   - mobile 100% / desktop largura configurável
 *   - 100% m31DesignTokens
 */
import { useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { TOKENS } from '@/lib/m31DesignTokens';

const T = TOKENS;

export default function M31Drawer({
  open,
  onClose,
  // ── Cabeçalho ──
  title,
  subtitle,
  status,
  avatar,
  // ── Abas ──
  tabs,
  activeTab,
  onTabChange,
  // ── Corpo ──
  children,
  loading = false,
  skeleton,
  empty = false,
  emptyMessage = 'Nenhum dado encontrado.',
  emptyIcon,
  // ── Rodapé ──
  footer,
  // ── Comportamento ──
  width = '480px',
  closeOnOverlayClick = true,
}) {
  // Lock scroll + ESC
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const handleEsc = useCallback((e) => {
    if (e.key === 'Escape' && open) onClose?.();
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, handleEsc]);

  const hasHeader = title || subtitle || status || avatar;

  return (
    <>
      {/* ── Overlay ── */}
      <div
        onClick={closeOnOverlayClick ? onClose : undefined}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.35)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: `opacity 200ms ${T.transition.ease}`,
          zIndex: 999,
        }}
      />

      {/* ── Panel ── */}
      <div
        className="m31-drawer-panel"
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width, maxWidth: '100vw',
          background: T.surface,
          boxShadow: T.shadowLg,
          zIndex: 1000,
          display: 'flex', flexDirection: 'column',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: `transform ${T.transition.structure}`,
          borderLeft: `1px solid ${T.borderSubtle}`,
        }}
      >
        {/* ── Cabeçalho ── */}
        {hasHeader && (
          <div style={{
            padding: `${T.spacing.lg} ${T.spacing.xl}`,
            borderBottom: `1px solid ${T.borderSubtle}`,
            display: 'flex', alignItems: 'center', gap: T.spacing.md,
            flexShrink: 0,
          }}>
            {avatar && <div style={{ flexShrink: 0 }}>{avatar}</div>}
            <div style={{ flex: 1, minWidth: 0 }}>
              {title && (
                <h2 style={{
                  fontSize: '16px', fontWeight: '700',
                  color: T.text, margin: 0,
                  fontFamily: T.font.heading,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {title}
                </h2>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: T.spacing.sm, marginTop: title ? '3px' : 0, flexWrap: 'wrap' }}>
                {subtitle && (
                  <span style={{ fontSize: '11px', color: T.textMuted }}>
                    {subtitle}
                  </span>
                )}
                {status}
              </div>
            </div>
            <DrawerCloseButton onClick={onClose} />
          </div>
        )}

        {/* Close button flutuante (quando não há header) */}
        {!hasHeader && (
          <div style={{ position: 'absolute', top: T.spacing.md, right: T.spacing.md, zIndex: 2 }}>
            <DrawerCloseButton onClick={onClose} />
          </div>
        )}

        {/* ── Abas ── */}
        {tabs && tabs.length > 0 && (
          <div style={{
            display: 'flex', gap: '2px',
            padding: `0 ${T.spacing.xl}`,
            borderBottom: `1px solid ${T.borderSubtle}`,
            overflowX: 'auto', overflowY: 'hidden',
            flexShrink: 0,
            scrollbarWidth: 'none', msOverflowStyle: 'none',
          }}>
            <style>{`.m31-drawer-tabs::-webkit-scrollbar{display:none}`}</style>
            <div className="m31-drawer-tabs" style={{ display: 'flex', gap: '2px', whiteSpace: 'nowrap' }}>
              {tabs.map(t => {
                const Icon = t.icon;
                const isActive = activeTab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => onTabChange?.(t.key)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '5px',
                      padding: `${T.spacing.sm} ${T.spacing.md}`,
                      background: 'none', border: 'none',
                      borderBottom: isActive ? `2px solid ${T.primary}` : '2px solid transparent',
                      color: isActive ? T.primary : T.textMuted,
                      fontSize: '11px', fontWeight: isActive ? '600' : '500',
                      cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                      fontFamily: T.font.body,
                      transition: `color ${T.transition.atomic}`,
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    {Icon && <Icon size={13} />}
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Corpo ── */}
        <div style={{
          flex: 1, overflowY: 'auto',
          padding: `${T.spacing.lg} ${T.spacing.xl}`,
          opacity: open ? 1 : 0,
          transition: `opacity ${T.transition.structure} 50ms`,
          fontFamily: T.font.body,
          color: T.text,
        }}>
          {loading
            ? (skeleton || <DrawerSkeleton />)
            : empty
              ? <DrawerEmpty message={emptyMessage} icon={emptyIcon} />
              : children}
        </div>

        {/* ── Rodapé ── */}
        {footer && (
          <div style={{
            padding: `${T.spacing.md} ${T.spacing.xl}`,
            borderTop: `1px solid ${T.borderSubtle}`,
            background: T.surfaceSubtle,
            flexShrink: 0,
            display: 'flex', gap: T.spacing.sm, alignItems: 'center', justifyContent: 'flex-end',
          }}>
            {footer}
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 640px) {
          .m31-drawer-panel { width: 100vw !important; }
        }
      `}</style>
    </>
  );
}

// ── Sub-componentes ───────────────────────────────────────────

function DrawerCloseButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label="Fechar"
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        padding: T.spacing.xs, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        color: T.textMuted, flexShrink: 0,
        transition: `color ${T.transition.atomic}`,
        WebkitTapHighlightColor: 'transparent',
      }}
      onMouseEnter={e => e.currentTarget.style.color = T.text}
      onMouseLeave={e => e.currentTarget.style.color = T.textMuted}
    >
      <X size={20} />
    </button>
  );
}

function DrawerSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: T.spacing.md }}>
      {[80, 60, 90, 50, 70].map((w, i) => (
        <div key={i} style={{
          height: '14px', width: `${w}%`,
          background: T.surfaceSubtle, borderRadius: T.radius.sm,
          animation: 'm31-skel 1.4s ease-in-out infinite',
        }} />
      ))}
      <style>{`
        @keyframes m31-skel {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function DrawerEmpty({ message, icon }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: T.spacing['3xl'], textAlign: 'center',
    }}>
      <div style={{ fontSize: '32px', marginBottom: T.spacing.md, opacity: 0.6 }}>
        {icon || '📭'}
      </div>
      <div style={{ fontSize: '13px', color: T.textMuted, fontFamily: T.font.body }}>
        {message}
      </div>
    </div>
  );
}