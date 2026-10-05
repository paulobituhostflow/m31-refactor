import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { trackShirtEvent } from '@/components/m31/camisas/shirtTracking';

export default function ShirtOrderTracking() {
  const [pedido, setPedido] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let stopped = false;
    let timer;
    const load = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('m31_camisa_pedido_token');
        if (!token) throw new Error('Identificador do pedido indisponível neste navegador. Fale com a Dulce para localizar sua compra.');
        const { data } = await base44.functions.invoke('m31CamisaVendaPayment', { action: 'consultar', pedido_token: token });
        if (stopped) return;
        setPedido(data); setError('');
        if (data.status_pagamento === 'pago') {
          try { const marker = `m31_shirt_paid_tracked:${token}`; if (!localStorage.getItem(marker)) { localStorage.setItem(marker, '1'); trackShirtEvent('shirt_order_submitted'); } } catch { /* Tracking never affects confirmation. */ }
        }
        if (!['pago', 'estornado', 'cancelado', 'substituido'].includes(data.status_pagamento)) timer = setTimeout(load, 15000);
      } catch (e) {
        if (!stopped) { setPedido(null); setError(e?.response?.data?.error || e.message || 'Não foi possível consultar o pedido.'); }
      } finally { if (!stopped) setLoading(false); }
    };
    load();
    return () => { stopped = true; clearTimeout(timer); };
  }, [attempt]);
  const paid = pedido?.status_pagamento === 'pago';
  const labels = { cancelado: 'Cobrança removida', estornado: 'Pagamento estornado', vencido: 'Cobrança vencida', revisar: 'Pagamento em conferência', substituido: 'Pedido substituído — sua nova compra é o pedido atual' };
  return <section className="rounded-xl border border-border bg-card p-6 text-card-foreground" aria-live="polite">
    <h2 className="text-xl font-semibold">{paid ? 'Pagamento confirmado' : labels[pedido?.status_pagamento] || 'Aguardando confirmação do pagamento'}</h2>
    {pedido?.codigo_pedido && <p className="mt-1 font-bold text-primary">Pedido {pedido.codigo_pedido}</p>}
    <p className="mt-2 text-sm text-muted-foreground">{paid ? 'Confira os itens do seu pedido. A confirmação não significa que a entrega já ocorreu.' : 'Esta tela só confirma o pagamento após a consulta ao servidor.'}</p>
    {loading && <p className="mt-3 text-sm">Consultando pedido...</p>}
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {pedido?.itens?.map((item, index) => <p key={index} className="mt-3 rounded-lg border border-border p-3 capitalize">{item.modelo}{item.cor ? ` · ${item.cor}` : ''} · {item.tamanho}</p>)}
    {pedido && <p className="mt-3 font-semibold">{pedido.quantidade} camisa(s) · R$ {Number(pedido.valor_total).toFixed(2).replace('.', ',')}</p>}
    <button type="button" disabled={loading} onClick={() => setAttempt(v => v + 1)} className="mt-4 min-h-12 rounded-lg bg-primary px-4 text-primary-foreground disabled:opacity-50">Atualizar acompanhamento</button>
  </section>;
}