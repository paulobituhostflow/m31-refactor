import { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { TOKENS as T } from '@/lib/m31DesignTokens';
import M31IAPanel from './M31IAPanel';

const SEEN_KEY = 'm31_ia_import_seen';

function useIsMobile() {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const h = () => setM(mq.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  return m;
}

/**
 * M31IAImportButton — botão flutuante fixo para importar tarefas com IA.
 * - Expande no primeiro acesso ou hover (desktop); compacto depois.
 * - Posicionado para não cobrir o FAB "Nova tarefa" no mobile.
 * - Respeita safe area.
 */
export default function M31IAImportButton({ userEmail, userName, lockedAreaSlug }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(() => !localStorage.getItem(SEEN_KEY));
  const isMobile = useIsMobile();

  const handleClick = () => {
    setOpen(true);
    localStorage.setItem(SEEN_KEY, '1');
    setExpanded(false);
  };

  const bottom = isMobile
    ? 'max(82px, calc(env(safe-area-inset-bottom) + 62px))'
    : 'max(24px, env(safe-area-inset-bottom))';

  return (
    <>
      <button
        onClick={handleClick}
        onMouseEnter={() => !isMobile && setExpanded(true)}
        onMouseLeave={() => !isMobile && localStorage.getItem(SEEN_KEY) && setExpanded(false)}
        aria-label="Importar tarefas com IA"
        style={{
          position: 'fixed',
          bottom,
          right: isMobile ? '20px' : '24px',
          zIndex: 90,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: expanded ? '12px 18px' : '12px',
          background: T.primary,
          color: '#FFFFFF',
          border: 'none',
          borderRadius: T.radius.pill,
          fontSize: '14px',
          fontWeight: '600',
          fontFamily: T.font.body,
          cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(139,26,43,0.3)',
          transition: 'padding 0.2s ease, max-width 0.2s ease',
          maxWidth: expanded ? '300px' : '48px',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
        }}
      >
        <Sparkles size={20} style={{ flexShrink: 0 }} />
        {expanded && <span>Importar tarefas com IA</span>}
      </button>
      {open && (
        <M31IAPanel
          onClose={() => setOpen(false)}
          userEmail={userEmail}
          userName={userName}
          lockedAreaSlug={lockedAreaSlug}
        />
      )}
    </>
  );
}