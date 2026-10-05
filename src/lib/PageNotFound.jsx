/**
 * PageNotFound — 404 canônico M31 (Light Executive).
 * Feedback claro para rota inválida, em Português, com CTA de retorno.
 */
import { useLocation, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { TOKENS } from '@/lib/m31DesignTokens';
import { Home, AlertTriangle } from 'lucide-react';

export default function PageNotFound({}) {
  const location = useLocation();
  const pageName = location.pathname.substring(1);

  const { data: authData, isFetched } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      try {
        const user = await base44.auth.me();
        return { user, isAuthenticated: true };
      } catch (error) {
        return { user: null, isAuthenticated: false };
      }
    }
  });

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: TOKENS.background }}>
      <div style={{ maxWidth: '420px', width: '100%', textAlign: 'center' }}>
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '72px', fontWeight: '200', color: TOKENS.textSubtle, margin: 0, lineHeight: 1, letterSpacing: '-0.04em' }}>404</h1>
          <div style={{ height: '2px', width: '48px', background: TOKENS.primary, margin: '12px auto 0', borderRadius: '2px' }} />
        </div>
        <div style={{ marginBottom: '20px' }}>
          <h2 style={{ fontSize: '22px', fontWeight: '700', color: TOKENS.text, fontFamily: TOKENS.font.heading, margin: '0 0 8px' }}>
            Página não encontrada
          </h2>
          <p style={{ color: TOKENS.textMuted, lineHeight: 1.5, fontSize: '14px', margin: 0 }}>
            A página <span style={{ fontWeight: '600', color: TOKENS.text }}>"{pageName}"</span> não existe neste sistema.
          </p>
        </div>

        {isFetched && authData.isAuthenticated && authData.user?.role === 'admin' && (
          <div style={{ marginTop: '20px', padding: '14px', background: TOKENS.warningSoft, borderRadius: TOKENS.radius.md, border: `1px solid ${TOKENS.warningSoft}`, display: 'flex', alignItems: 'flex-start', gap: '10px', textAlign: 'left' }}>
            <AlertTriangle size={16} color={TOKENS.warning} style={{ flexShrink: 0, marginTop: '1px' }} />
            <div>
              <div style={{ fontSize: '13px', fontWeight: '600', color: TOKENS.text }}>Nota do administrador</div>
              <div style={{ fontSize: '13px', color: TOKENS.textMuted, marginTop: '2px', lineHeight: 1.5 }}>
                Esta página pode não ter sido implementada ainda. Solicite sua criação no chat.
              </div>
            </div>
          </div>
        )}

        <div style={{ marginTop: '28px' }}>
          <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: '600', color: TOKENS.onPrimary, background: TOKENS.primary, borderRadius: TOKENS.radius.md, textDecoration: 'none', fontFamily: TOKENS.font.body, transition: `all ${TOKENS.transition.atomic}` }}>
            <Home size={16} /> Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}