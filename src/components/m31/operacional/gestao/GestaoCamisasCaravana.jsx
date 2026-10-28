import { useEffect, useRef, useState } from 'react';
import { Copy, Link2, RefreshCw, Share2 } from 'lucide-react';
import { gestaoRequest } from '@/lib/m31GestaoApi';

const brl = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const labels = {
  checkout_pendente: 'Aguardando pagamento',
  pago: 'Pago',
  cancelado: 'Cancelado',
  estornado: 'Estornado',
  substituido: 'Substituído',
  vencido: 'Vencido',
  revisar: 'Pagamento em conferência'
};

export default function GestaoCamisasCaravana({ sessionId, caravana, data, canSetPrice, onRefresh }) {
  const [price, setPrice] = useState('');
  const [notify, setNotify] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const request = useRef(null);
  const inFlight = useRef(false);
  const promo = data?.promocao;

  useEffect(() => {
    setPrice(promo?.preco != null ? String(promo.preco).replace('.', ',') : '');
    setNotify(promo?.notificar_lider === true);
  }, [promo?.preco, promo?.notificar_lider]);

  async function generate() {
    if (inFlight.current) return;
    const value = Number(price.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) {
      setFailure('Informe o valor por camisa.');
      return;
    }
    if (!request.current) request.current = crypto.randomUUID();
    inFlight.current = true;
    setBusy(true);
    setNotice('');
    setFailure('');
    try {
      const result = await gestaoRequest('m31GestaoCaravanas', {
        action: 'gerar_link_camisas',
        session_id: sessionId,
        id: caravana.id,
        preco: value,
        notificar_lider: notify,
        request_id: request.current
      });
      if (!result.promocao?.link) throw Error('O link não foi confirmado. Atualize a ficha antes de repetir.');
      request.current = null;
      setNotice('Link promocional gerado. As cobranças existentes mantêm a condição aceita.');
      await onRefresh();
    } catch (error) {
      setFailure(error?.response?.data?.error || error.message || 'A gravação não foi confirmada. Atualize a ficha antes de repetir.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(promo.link);
      setNotice('Link promocional copiado.');
    } catch {
      setFailure('Selecione e copie o link abaixo.');
    }
  }

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Camisas — ${caravana.nome}`,
          text: `Camisas M31 por ${brl(promo.preco)} a unidade.`,
          url: promo.link
        });
      } else {
        await copy();
      }
    } catch (error) {
      if (error.name !== 'AbortError') setFailure('Não foi possível compartilhar. Copie o link.');
    }
  }

  return (
    <section className="m31-gestao-price" aria-label="Camisas da caravana">
      <div className="m31-gestao-price-head">
        <h3>Camisas da caravana</h3>
        <button className="m31-gestao-btn" type="button" onClick={onRefresh}>
          <RefreshCw size={16} />Atualizar pedidos
        </button>
      </div>
      {canSetPrice && (
        <div className="m31-gestao-fields-grid">
          <label className="m31-gestao-field">
            Preço promocional por camisa (R$)
            <input inputMode="decimal" value={price} disabled={busy} onChange={e => { setPrice(e.target.value); request.current = null; }} />
          </label>
          <label className="m31-gestao-field">
            <span>
              <input type="checkbox" checked={notify} disabled={busy} onChange={e => { setNotify(e.target.checked); request.current = null; }} /> Avisar a líder quando o Asaas confirmar uma compra
            </span>
            <small>Envio pela fila existente, respeitando seus limites.</small>
          </label>
          <button type="button" className="m31-gestao-btn m31-gestao-btn-primary" disabled={busy} onClick={generate}>
            <Link2 size={16} />{busy ? 'Gerando…' : 'Gerar link promocional de camisas'}
          </button>
        </div>
      )}
      {promo?.preco != null && <p><strong>{brl(promo.preco)} por camisa</strong> · Cartão segue as opções e taxas da lojinha.</p>}
      {promo?.link && (
        <div className="m31-gestao-price-actions">
          <label className="m31-gestao-field">
            Link promocional
            <input value={promo.link} readOnly onFocus={e => e.target.select()} aria-label="Link promocional de camisas" />
          </label>
          <button type="button" className="m31-gestao-btn" onClick={copy}><Copy size={16} />Copiar</button>
          <button type="button" className="m31-gestao-btn" onClick={share}><Share2 size={16} />Compartilhar</button>
        </div>
      )}
      {promo?.error && <p role="alert" className="m31-gestao-error">{promo.error}</p>}
      {notice && <p role="status" className="m31-gestao-success">{notice}</p>}
      {failure && <p role="alert" className="m31-gestao-error">{failure}</p>}
      {!data ? (
        <p>Carregando pedidos…</p>
      ) : (
        <>
          <p>
            <strong>{data.resumo.camisas_pagas} camisas pagas</strong> em {data.resumo.pedidos_pagos} pedidos · {data.resumo.camisas_pendentes} camisas aguardando pagamento · {brl(data.resumo.valor_pago)} confirmado.
          </p>
          {data.grade.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', textAlign: 'left' }}>
                <thead>
                  <tr>
                    <th>Modelo / cor</th>
                    <th>Tamanho</th>
                    <th>Pagas</th>
                    <th>Pendentes</th>
                  </tr>
                </thead>
                <tbody>
                  {data.grade.map(g => (
                    <tr key={[g.modelo, g.cor, g.tamanho].join('|')}>
                      <td>{g.modelo} {g.cor}</td>
                      <td>{g.tamanho}</td>
                      <td>{g.pagas}</td>
                      <td>{g.pendentes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data.pedidos.length ? (
            <ul className="m31-gestao-caravana-member-list">
              {data.pedidos.map(p => (
                <li key={p.id} className="m31-gestao-caravana-member">
                  <div>
                    <strong>{p.numero_pedido != null ? `#M31${String(p.numero_pedido).padStart(3, '0')} · ` : ''}{p.nome}</strong>
                    <p>{p.itens.map(i => `${i.modelo}${i.cor ? ' ' + i.cor : ''} · ${i.tamanho} × ${i.quantidade}`).join(' / ')}</p>
                    <span>{p.quantidade} camisa(s) · {brl(p.valor_cobrado)}</span>
                  </div>
                  <strong>{labels[p.status_pagamento] || 'Situação não informada'}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m31-gestao-muted">Nenhum pedido de camisa vinculado a esta caravana.</p>
          )}
        </>
      )}
    </section>
  );
}
