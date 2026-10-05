import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Menu, X, LogOut, ChevronDown, Home, Link2, Check } from 'lucide-react';
import { TOKENS } from '@/lib/m31DesignTokens';

// ── Tokens locais (espelham TOKENS para compat de import externo) ──
const T = {
  bg:            TOKENS.background,
  sidebar:       TOKENS.surface,
  sidebarBorder: TOKENS.border,
  primary:       TOKENS.primary,
  activeItem:    TOKENS.primarySoft,
  activeBorder:  TOKENS.primary,
  hoverItem:     TOKENS.surfaceHover,
  textPrimary:   TOKENS.text,
  textSecondary: TOKENS.textMuted,
  textMuted:     TOKENS.textSubtle,
  groupLabel:    TOKENS.textSubtle,
  topbar:        'rgba(255, 255, 255, 0.85)',
  topbarBorder:  TOKENS.border,
};

export { T };

// ── NavItem ───────────────────────────────────────────────────────────────────
function NavItem({ item, active, onClick, badge }) {
  const Icon = item.icon;
  return (
    <button
      onClick={() => onClick(item.id)}
      className="m31-nav-item"
      data-active={active}
      style={{
        display: 'flex', alignItems: 'center', gap: '11px',
        width: '100%', height: '40px', padding: '0 12px 0 16px',
        borderRadius: '8px', border: 'none',
        cursor: 'pointer', fontSize: '13px', fontFamily: TOKENS.font.body,
        fontWeight: active ? '600' : '500',
        textAlign: 'left',
        background: active ? TOKENS.primarySoft : 'transparent',
        color: active ? TOKENS.primary : TOKENS.text,
        borderLeft: active ? `3px solid ${TOKENS.primary}` : '3px solid transparent',
        WebkitTapHighlightColor: 'transparent',
        transition: 'background 150ms cubic-bezier(0.4,0,0.2,1), color 150ms ease',
        marginLeft: '-3px',
      }}
    >
      <Icon
        size={17}
        strokeWidth={active ? 2.25 : 2}
        color={active ? TOKENS.primary : TOKENS.textMuted}
        style={{ flexShrink: 0, transition: 'color 150ms ease' }}
      />
      <span style={{ flex: 1, letterSpacing: '-0.01em' }}>{item.label}</span>
      {badge != null && badge > 0 && (
        <span style={{
          fontSize: '11px', fontWeight: '700', minWidth: '18px', height: '18px',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: TOKENS.warningSoft,
          color: TOKENS.warning,
          borderRadius: '9999px', padding: '0 6px',
        }}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}

// ── CategorySection ───────────────────────────────────────────────────────────
function CategorySection({ category, tabAtual, onTabChange, badgeCounts, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = category.icon;
  const hasActive = category.items.some(i => i.id === tabAtual);
  const categoryBadge = category.items.reduce((sum, item) => sum + (badgeCounts?.[item.id] || 0), 0);
  const isSingleItem = category.id === 'participantes_group' || category.id === 'voluntarios_group';

  useEffect(() => {
    if (hasActive) setOpen(true);
  }, [hasActive]);

  if (isSingleItem) {
    const item = category.items[0];
    if (!item) return null;
    const isActive = tabAtual === item.id;
    return (
      <div style={{ marginBottom: '2px' }}>
        <div style={{
          padding: '0 16px 6px', fontSize: '11px', fontWeight: '700',
          letterSpacing: '0.12em', textTransform: 'uppercase',
          color: TOKENS.textSubtle,
        }}>
          {category.label}
        </div>
        <button
          onClick={() => onTabChange(item.id)}
          className="m31-nav-item"
          data-active={isActive}
          style={{
            display: 'flex', alignItems: 'center', gap: '11px',
            width: '100%', height: '42px', padding: '0 12px 0 16px',
            borderRadius: '8px', border: 'none',
            background: isActive ? TOKENS.primarySoft : 'transparent',
            borderLeft: isActive ? `3px solid ${TOKENS.primary}` : '3px solid transparent',
            cursor: 'pointer', fontSize: '13px', fontFamily: TOKENS.font.body,
            fontWeight: isActive ? '600' : '500',
            textAlign: 'left',
            color: isActive ? TOKENS.primary : TOKENS.text,
            WebkitTapHighlightColor: 'transparent',
            transition: 'background 150ms cubic-bezier(0.4,0,0.2,1), color 150ms ease',
            marginLeft: '-3px',
          }}
        >
          <Icon
            size={17}
            strokeWidth={isActive ? 2.25 : 2}
            color={isActive ? TOKENS.primary : TOKENS.textMuted}
            style={{ flexShrink: 0, transition: 'color 150ms ease' }}
          />
          <span style={{ flex: 1, letterSpacing: '-0.01em' }}>{item.label}</span>
          {categoryBadge > 0 && (
            <span style={{
              fontSize: '11px', fontWeight: '700', minWidth: '18px', height: '18px',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: TOKENS.warningSoft,
              color: TOKENS.warning,
              borderRadius: '9999px', padding: '0 6px',
            }}>
              {categoryBadge > 99 ? '99+' : categoryBadge}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: '2px' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="m31-cat-header"
        style={{
          display: 'flex', alignItems: 'center', gap: '9px',
          width: '100%', height: '34px', padding: '0 12px 0 16px',
          borderRadius: '8px', border: 'none', cursor: 'pointer',
          fontSize: '11px', fontFamily: TOKENS.font.body,
          fontWeight: '700', letterSpacing: '0.12em',
          textTransform: 'uppercase', textAlign: 'left',
          backgroundColor: 'transparent',
          color: hasActive ? TOKENS.primary : TOKENS.textSubtle,
          WebkitTapHighlightColor: 'transparent',
          transition: 'color 150ms ease, background 150ms ease',
        }}
      >
        <Icon size={13} strokeWidth={2.5} color={hasActive ? TOKENS.primary : TOKENS.textSubtle} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1 }}>{category.label}</span>
        {categoryBadge > 0 && !open && (
          <span style={{
            fontSize: '11px', fontWeight: '700', minWidth: '17px', height: '17px',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: TOKENS.warningSoft, color: TOKENS.warning,
            borderRadius: '9999px', padding: '0 5px',
          }}>
            {categoryBadge > 99 ? '99+' : categoryBadge}
          </span>
        )}
        <ChevronDown
          size={13}
          strokeWidth={2.5}
          color={TOKENS.textSubtle}
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 250ms cubic-bezier(0.16,1,0.3,1)', flexShrink: 0 }}
        />
      </button>

      <div style={{
        overflow: 'hidden',
        maxHeight: open ? `${category.items.length * 44}px` : '0px',
        transition: 'max-height 250ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}>
        <div style={{ paddingBottom: '2px', paddingTop: '2px' }}>
          {category.items.map(item => (
            <NavItem
              key={item.id}
              item={item}
              active={tabAtual === item.id}
              onClick={onTabChange}
              badge={badgeCounts?.[item.id]}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── ShareLinkButton ───────────────────────────────────────────────────────────
function ShareLinkButton() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const link = `${window.location.origin}/gestao-rapida`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = link;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div style={{ padding: '0 12px', flexShrink: 0 }}>
      <button
        onClick={handleCopy}
        className="m31-share-link-btn"
        style={{
          width: '100%', height: '38px', padding: '0 12px',
          borderRadius: '8px', border: `1px solid ${TOKENS.border}`,
          background: copied ? TOKENS.successSoft : TOKENS.surfaceSubtle,
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
          fontFamily: TOKENS.font.body, fontSize: '12px', fontWeight: '600',
          color: copied ? TOKENS.success : TOKENS.textSecondary,
          transition: 'background 150ms ease, color 150ms ease, border-color 150ms ease',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {copied
          ? <Check size={14} strokeWidth={2.5} style={{ flexShrink: 0 }} />
          : <Link2 size={14} strokeWidth={2.25} style={{ flexShrink: 0 }} />}
        <span style={{ flex: 1, textAlign: 'left', letterSpacing: '-0.01em' }}>
          {copied ? 'Link copiado!' : 'Copiar link da equipe'}
        </span>
      </button>
      <style>{`
        .m31-share-link-btn:hover {
          background: ${copied ? TOKENS.successSoft : TOKENS.surfaceHover} !important;
          border-color: ${TOKENS.borderStrong} !important;
        }
      `}</style>
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ tabAtual, categorias, onTabChange, user, perfilLabel, open, onClose, badgeCounts }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 40,
          background: 'rgba(42, 31, 31, 0.20)',
          backdropFilter: 'blur(4px)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 200ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />

      {/* Sidebar */}
      <aside
        style={{
          position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 50,
          width: '280px', maxWidth: '85vw',
          background: TOKENS.surface,
          borderRight: `1px solid ${TOKENS.border}`,
          display: 'flex', flexDirection: 'column',
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 250ms cubic-bezier(0.16, 1, 0.3, 1)',
          overflow: 'hidden',
          boxShadow: open ? '4px 0 24px rgba(0,0,0,0.06)' : 'none',
        }}
      >
        {/* Logo / Header */}
        <div style={{
          height: '64px', display: 'flex', alignItems: 'center',
          padding: '0 18px', borderBottom: `1px solid ${TOKENS.border}`,
          gap: '12px', flexShrink: 0,
        }}>
          <div style={{
            width: '36px', height: '36px',
            background: 'var(--grad-brand)',
            border: 'none',
            borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <span style={{ color: TOKENS.onPrimary, fontSize: '15px', fontWeight: '700', fontFamily: TOKENS.font.body }}>M</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: TOKENS.font.body, fontWeight: '700', fontSize: '15px', color: TOKENS.text, lineHeight: '1.2', letterSpacing: '-0.02em' }}>M31 Filhas</div>
            <div style={{ fontFamily: TOKENS.font.body, fontSize: '11px', color: TOKENS.textMuted, letterSpacing: '0.02em' }}>Painel Admin</div>
          </div>
          <button
            onClick={onClose}
            className="m31-icon-btn"
            style={{
              color: TOKENS.textMuted, background: TOKENS.borderSubtle,
              border: 'none', cursor: 'pointer', width: '32px', height: '32px',
              borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              transition: 'background 150ms ease, color 150ms ease',
            }}
          >
            <X size={17} strokeWidth={2.5} />
          </button>
        </div>

        {/* Nav */}
        <nav style={{
          flex: 1, overflowY: 'auto', padding: '10px 10px',
          scrollbarWidth: 'thin', scrollbarColor: `${TOKENS.borderStrong} transparent`,
        }}>
          {categorias.map((cat, idx) => (
            <React.Fragment key={cat.id}>
              {idx > 0 && <div style={{ height: '6px' }} />}
              <CategorySection
                category={cat}
                tabAtual={tabAtual}
                onTabChange={(id) => { onTabChange(id); onClose(); }}
                badgeCounts={badgeCounts}
                defaultOpen={idx === 0 || cat.items.some(i => i.id === tabAtual)}
              />
            </React.Fragment>
          ))}
        </nav>

        {/* Link compartilhável Gestão Rápida */}
        <ShareLinkButton />

        {/* User footer — card flutuante */}
        <div style={{ padding: '10px 12px 14px', flexShrink: 0 }}>
          <div style={{
            background: TOKENS.surface,
            borderRadius: '12px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)',
            border: 'none',
            padding: '10px 12px',
            display: 'flex', alignItems: 'center', gap: '11px',
          }}>
            <div style={{
              width: '38px', height: '38px', borderRadius: '9999px', flexShrink: 0,
              background: 'var(--grad-brand)',
              border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '15px', fontWeight: '700', color: TOKENS.onPrimary,
            }}>
              {(user?.full_name || user?.email || 'U')[0].toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: TOKENS.font.body, fontSize: '13px', fontWeight: '600', color: TOKENS.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.01em' }}>
                {user?.full_name || user?.email}
              </div>
              <div style={{ fontFamily: TOKENS.font.body, fontSize: '11px', color: TOKENS.textMuted, marginTop: '1px' }}>{perfilLabel}</div>
            </div>
            <button
              onClick={() => base44.auth.logout()}
              title="Sair"
              style={{
                color: TOKENS.primary,
                background: TOKENS.surface,
                border: `1px solid ${TOKENS.primary}`,
                cursor: 'pointer',
                height: '32px',
                borderRadius: '9999px',
                padding: '0 14px',
                flexShrink: 0,
                display: 'flex', alignItems: 'center', gap: '6px',
                fontFamily: TOKENS.font.body, fontSize: '12px', fontWeight: '600',
                transition: 'background 150ms ease',
              }}
            >
              <LogOut size={14} strokeWidth={2.25} />
              <span>Sair</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Hover + scrollbar styles */}
      <style>{`
        .m31-nav-item:hover:not([data-active="true"]) {
          background: ${TOKENS.surfaceHover} !important;
          color: ${TOKENS.text} !important;
        }
        .m31-nav-item:hover:not([data-active="true"]) svg {
          color: ${TOKENS.text} !important;
        }
        .m31-cat-header:hover {
          background: ${TOKENS.surfaceHover} !important;
          color: ${TOKENS.text} !important;
        }
        .m31-icon-btn:hover {
          background: ${TOKENS.borderStrong} !important;
          color: ${TOKENS.text} !important;
        }
        aside ::-webkit-scrollbar { width: 5px; }
        aside ::-webkit-scrollbar-track { background: transparent; }
        aside ::-webkit-scrollbar-thumb { background: ${TOKENS.borderStrong}; border-radius: 9999px; }
        aside ::-webkit-scrollbar-thumb:hover { background: ${TOKENS.textSubtle}; }
      `}</style>
    </>
  );
}

// ── Topbar ────────────────────────────────────────────────────────────────────
function Topbar({ tabAtual, categorias, onMenuOpen }) {
  const currentTab = categorias.flatMap(c => c.items).find(t => t.id === tabAtual);

  return (
    <header style={{
      height: '56px',
      background: T.topbar,
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderBottom: `1px solid ${T.topbarBorder}`,
      display: 'flex', alignItems: 'center', padding: '0 16px', gap: '12px',
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 30,
    }}>
      <button
        onClick={onMenuOpen}
        style={{
          color: T.textSecondary, background: TOKENS.surfaceSubtle,
          border: 'none', cursor: 'pointer', padding: '8px',
          borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, WebkitTapHighlightColor: 'transparent',
        }}
      >
        <Menu size={20} />
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: TOKENS.font.body, fontWeight: '700',
          fontSize: '15px', color: T.textPrimary,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {currentTab?.label || 'M31 Admin'}
        </div>
        <div style={{ fontFamily: TOKENS.font.body, fontSize: '11px', color: T.textMuted }}>
          M31 Filhas · Imersão 2026
        </div>
      </div>

      {/* Botão permanente de retorno à Home */}
      <a
        href="/admin"
        title="Voltar para a Home"
        style={{
          color: T.primary, background: TOKENS.primarySoft,
          border: `1px solid ${TOKENS.borderStrong}`, textDecoration: 'none',
          cursor: 'pointer', padding: '8px 12px', borderRadius: '8px',
          display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0,
          fontFamily: TOKENS.font.body, fontSize: '13px', fontWeight: '600',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <Home size={16} strokeWidth={2.5} />
        <span className="m31-home-label">Home</span>
      </a>
      <style>{`@media (max-width: 480px){ .m31-home-label{ display:none; } }`}</style>
    </header>
  );
}

// ── Layout principal ───────────────────────────────────────────────────────────
export default function M31AdminLayout({ tabAtual, categorias, onTabChange, user, perfilLabel, children, badgeCounts }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div style={{ backgroundColor: T.bg, minHeight: '100vh', fontFamily: TOKENS.font.body }}>
      <Topbar
        tabAtual={tabAtual}
        categorias={categorias}
        onMenuOpen={() => setDrawerOpen(true)}
      />

      <Sidebar
        tabAtual={tabAtual}
        categorias={categorias}
        onTabChange={onTabChange}
        user={user}
        perfilLabel={perfilLabel}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        badgeCounts={badgeCounts}
      />

      <main style={{
        paddingTop: '56px',
        minHeight: '100vh',
        width: '100%',
        overflowX: 'hidden',
      }}>
        <div style={{
          padding: '20px 20px 40px',
          maxWidth: '1400px',
          margin: '0 auto',
          width: '100%',
          boxSizing: 'border-box',
        }}>
          {children}
        </div>
      </main>
    </div>
  );
}