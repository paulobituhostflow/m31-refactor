import { useEffect, useState } from 'react';
import CartinhaAcesso from './m31/cartinhas/CartinhaAcesso';
import { CartinhasSessao } from './m31/cartinhas/CartinhasSessao';
import { cartinhasApi, cartinhasErrorStatus } from '@/lib/m31CartinhasApi';

export default function RequireCartinhas({ children }) {
  const [access, setAccess] = useState('loading');
  const [attempt, setAttempt] = useState(0);
  const [autora, setAutora] = useState(null);
  useEffect(() => {
    let active = true;
    setAccess('loading');
    cartinhasApi.acesso().then(result => {
      if (active) { setAutora(result?.user || null); setAccess(result?.user ? 'allowed' : 'denied'); }
    }).catch(error => {
      if (active) setAccess(cartinhasErrorStatus(error) === 401 ? 'login' : cartinhasErrorStatus(error) === 403 ? 'denied' : 'error');
    });
    return () => { active = false; };
  }, [attempt]);

  if (access === 'allowed') return <CartinhasSessao.Provider value={autora}>{children}</CartinhasSessao.Provider>;
  if (access === 'login' || access === 'denied') return <CartinhaAcesso />;
  return (
    <div style={{ padding: '40px', textAlign: 'center', color: '#8B1A2B' }}>
      {access === 'loading' ? <p>Verificando acesso às Cartinhas…</p> : <>
        <p>Não foi possível verificar seu acesso.</p>
        <button onClick={() => setAttempt(value => value + 1)}>Tentar novamente</button>
      </>}
    </div>
  );
}
