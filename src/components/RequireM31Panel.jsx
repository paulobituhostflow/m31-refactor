import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { canOpenM31Panel } from '@/lib/m31PanelAccess';

export default function RequireM31Panel({ children, panel }) {
  const [state, setState] = useState('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setState('loading');
    base44.auth.me().then(user => {
      if (active) setState(canOpenM31Panel(user, panel) ? 'allowed' : 'denied');
    }).catch(error => {
      if (!active) return;
      if (error.status === 401) base44.auth.redirectToLogin(location.pathname + location.search);
      else setState(error.status === 403 ? 'denied' : 'error');
    });
    return () => { active = false; };
  }, [panel, attempt]);
  if (state === 'allowed') return children;
  return <main className="p-8">
    {state === 'loading' ? <p>Verificando acesso…</p> : state === 'denied'
      ? <p>Seu perfil não tem acesso a este painel.</p>
      : <><p>Não foi possível verificar seu acesso.</p><button onClick={() => setAttempt(value => value + 1)}>Tentar novamente</button></>}
  </main>;
}
