/**
 * M31Portal — Página de entrada inteligente pós-login
 * Redireciona o usuário para a área correta com base no perfil EventoM31Membro
 * Rota: /portal
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { getM31HomeRoute } from '@/lib/m31PanelAccess';

export default function M31Portal() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('Verificando acesso...');

  useEffect(() => {
    async function redirecionar() {
      try {
        // 1. Verificar se está autenticado
        const isAuth = await base44.auth.isAuthenticated();
        if (!isAuth) {
          base44.auth.redirectToLogin('/portal');
          return;
        }

        // 2. Buscar dados do usuário
        const user = await base44.auth.me();
        setStatus(`Olá, ${user.full_name?.split(' ')[0] || 'usuário'}! Carregando seu perfil...`);

        navigate(getM31HomeRoute(user), { replace: true });

      } catch (err) {
        if (err?.status === 403) { navigate('/m31-sem-acesso', { replace: true }); return; }
        setStatus('Erro ao verificar acesso. Tente novamente.');
        console.error(err);
      }
    }

    redirecionar();
  }, [navigate]);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0A0A0C',
      color: '#F5F5F0',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '16px',
      padding: '20px',
    }}>
      {/* Logo M31 */}
      <div style={{
        width: '64px',
        height: '64px',
        borderRadius: '16px',
        background: 'linear-gradient(135deg, #8B1A2B, #B8364A)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '24px',
        fontWeight: 'bold',
        color: 'white',
        marginBottom: '8px',
      }}>
        M31
      </div>

      {/* Spinner */}
      <div style={{
        width: '32px',
        height: '32px',
        border: '3px solid #26262C',
        borderTop: '3px solid #8B1A2B',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />

      <p style={{ color: '#A1A1AA', fontSize: '14px', textAlign: 'center', maxWidth: '280px' }}>
        {status}
      </p>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
