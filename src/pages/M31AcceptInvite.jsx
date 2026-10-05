import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';

/**
 * M31AcceptInvite — página pós-convite
 * 
 * Base44 envia convite com link de retorno. Esta página capta o convite
 * e redireciona o novo membro direto para /m31-admin
 */
export default function M31AcceptInvite() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    (async () => {
      try {
        // Verifica se o usuário está autenticado
        const me = await base44.auth.me();
        if (me) {
          // Usuário autenticado — redirecionar para admin
          navigate('/m31-admin', { replace: true });
        } else {
          // Não autenticado — redirecionar para login
          base44.auth.redirectToLogin('/m31-admin');
        }
      } catch (_) {
        // Qualquer erro — vai para login
        base44.auth.redirectToLogin('/m31-admin');
      }
    })();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0c] to-[#1a1a20] flex items-center justify-center p-4">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-[#8B1A2B] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-white/60 text-sm">Processando seu acesso...</p>
      </div>
    </div>
  );
}