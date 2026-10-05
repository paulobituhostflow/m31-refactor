import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { LogOut, ChevronLeft } from 'lucide-react';
import M31AuditoriaGrupos from '@/components/m31/M31AuditoriaGrupos';

const T = {
  bg: '#F7F5F2', card: '#FFFFFF', border: '#EAE7E2',
  text: '#2D2D2D', sec: '#6B7280', brand: '#A8344A',
};

export default function M31AuditoriaGruposPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const isAuth = await base44.auth.isAuthenticated();
      if (!isAuth) {
        window.location.href = '/m31-login';
        return;
      }
      const me = await base44.auth.me();
      setUser(me);
    } catch {
      window.location.href = '/m31-login';
    } finally {
      setLoading(false);
    }
  }

  const handleLogout = async () => {
    await base44.auth.logout('/');
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', background: T.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: '32px', height: '32px',
          border: '3px solid #EAE7E2', borderTopColor: T.brand,
          borderRadius: '50%', animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div style={{ background: T.bg, minHeight: '100vh', fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div style={{
        background: 'rgba(255,255,255,0.72)',
        backdropFilter: 'blur(16px) saturate(180%)',
        borderBottom: `1px solid ${T.border}`,
        padding: '14px 24px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        position: 'sticky', top: 0, zIndex: 20,
      }}>
        <div>
          <h1 style={{
            margin: '0 0 2px 0', fontSize: '18px', fontWeight: '700',
            fontFamily: 'Inter, sans-serif',
            color: T.text, letterSpacing: '-0.02em',
          }}>
            M31 Filhas · Auditoria de Grupos
          </h1>
          <p style={{ margin: 0, fontSize: '12px', color: T.sec }}>
            {user?.full_name || 'Operador'} · {user?.role === 'admin' ? 'Admin' : 'Operacional'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <a href="/admin" style={{
            fontSize: '12px', color: T.text, textDecoration: 'none',
            fontWeight: '600', display: 'flex', alignItems: 'center', gap: '5px',
            background: '#F3F0EE', border: `1px solid ${T.border}`,
            borderRadius: '8px', padding: '7px 12px',
          }}>
            <ChevronLeft size={14} /> Voltar
          </a>
          <button
            onClick={handleLogout}
            style={{
              background: T.brand, color: '#fff',
              border: 'none', borderRadius: '8px',
              padding: '8px 16px', fontSize: '12px',
              fontWeight: '600', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}
          >
            <LogOut size={14} /> Sair
          </button>
        </div>
      </div>

      {/* Conteúdo */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
        <M31AuditoriaGrupos />
      </div>
    </div>
  );
}