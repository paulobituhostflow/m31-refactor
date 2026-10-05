import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

export default function RequireAdmin({ children }) {
  const [isAdmin, setIsAdmin] = useState(null);

  useEffect(() => {
    base44.auth.me()
      .then(user => {
        setIsAdmin(user?.role === 'admin');
      })
      .catch(() => setIsAdmin(false));
  }, []);

  if (isAdmin === null) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ width: '40px', height: '40px', border: '4px solid #ddd', borderTop: '4px solid #333', borderRadius: '50%', margin: '0 auto', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '8px', margin: '20px' }}>
        <h2>❌ Acesso Negado</h2>
        <p>Apenas administradores podem acessar esta página.</p>
      </div>
    );
  }

  return children;
}