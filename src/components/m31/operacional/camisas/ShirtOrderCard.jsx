import { Check, Pencil, Shirt } from 'lucide-react';
import { useEffect, useState } from 'react';

const SIZES = ['PP', 'P', 'M', 'G', 'GG', 'XGG'];
const MODEL_LABELS = { equipe: 'Equipe', jesus: 'Jesus', milagres: 'Milagres', filhas: 'Filhas' };

function StatusBadge({ row }) {
  const financeiro = { vencido: 'Vencido', cancelado: 'Cobrança removida', estornado: 'Estornado' };
  if (financeiro[row.pagamento_status]) return <span className="rounded-full bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">{financeiro[row.pagamento_status]}</span>;
  if (row.situacao === 'entregue') return <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">Entregue</span>;
  if (row.pagamento_status === 'pago') return <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">Pago</span>;
  if (row.pagamento_status === 'revisar') return <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800">Revisar pagamento</span>;
  return <span className="rounded-full bg-stone-100 px-2 py-1 text-xs font-bold text-stone-600">Pagamento pendente</span>;
}

export default function ShirtOrderCard({ row, pending, onConfirmPayment, onVerComprovante, onChangeItem, onConfirmDelivery, onResumeNotice }) {
  const [editando, setEditando] = useState(false);
  const [modelo, setModelo] = useState(row.modelo || '');
  const [cor, setCor] = useState(row.cor || '');
  const [tamanho, setTamanho] = useState(row.tamanho || '');
  useEffect(() => { setModelo(row.modelo || ''); setCor(row.cor || ''); setTamanho(row.tamanho || ''); }, [row.modelo, row.cor, row.tamanho]);
  const ehPedido = row.registro_tipo === 'pedido_camisa';
  const podeConfirmarPagamento = ehPedido && !['pago', 'cancelado', 'estornado', 'substituido', 'vencido'].includes(row.pagamento_status);
  return (
    <article className="border-b border-m31-border p-4 last:border-b-0">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-m31-primary-tint text-m31-primary"><Shirt aria-hidden="true" className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-bold text-m31-ink">{row.numero_pedido != null && <span className="text-m31-primary">#M31{String(row.numero_pedido).padStart(3, '0')} · </span>}{row.nome}</h2>
          <p className="mt-0.5 truncate text-sm text-m31-text-muted">{row.modelo ? row.modelo.charAt(0).toUpperCase() + row.modelo.slice(1) : 'Camisa'}{row.cor ? ` · ${row.cor.charAt(0).toUpperCase() + row.cor.slice(1)}` : ''}{row.whatsapp ? ` · ${row.whatsapp}` : ''}</p>
          <span className="mt-1 inline-block rounded-full bg-m31-primary-tint px-2 py-0.5 text-[11px] font-bold text-m31-primary">{MODEL_LABELS[row.modelo] || row.modelo || 'Sem modelo'}</span>
          {Number(row.quantidade_item || 1) > 1 && <span className="ml-1 inline-block rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-bold text-stone-700">×{row.quantidade_item}</span>}
        </div>
        <StatusBadge row={row} />
      </div>

      {podeConfirmarPagamento && (
        <button type="button" disabled={pending} onClick={() => onConfirmPayment(row)} className="mt-3 min-h-10 rounded-xl border border-amber-300 bg-amber-50 px-4 text-sm font-bold text-amber-800 active:bg-amber-100 disabled:opacity-50">
          Confirmar pagamento
        </button>
      )}
      {ehPedido && row.comprovante && (
        <button type="button" disabled={pending} onClick={() => onVerComprovante(row)} className="mt-3 min-h-12 w-full rounded-xl border border-m31-border bg-white font-bold text-m31-primary active:bg-m31-primary-tint disabled:opacity-50">
          Ver comprovante
        </button>
      )}
      {ehPedido && row.pagamento_status === 'pago' && !['enviado', 'enfileirado', 'processando'].includes(row.aviso_dulce_status) && (
        <button type="button" disabled={pending} onClick={() => onResumeNotice(row)} className="mt-3 min-h-12 rounded-lg border border-border px-3 text-sm text-primary disabled:opacity-50">Conferir / retomar aviso</button>
      )}

      {row.pagamento_status === 'pago' && (
        <div className="mt-3">
          <button type="button" disabled={pending} onClick={() => setEditando((v) => !v)} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-m31-border bg-white text-sm font-bold text-m31-primary active:bg-m31-primary-tint disabled:opacity-50">
            <Pencil aria-hidden="true" className="h-4 w-4" /> Editar item do pedido
          </button>
          {editando && (
            <div className="mt-2 grid gap-2 rounded-xl bg-m31-primary-tint p-3">
              <label className="text-xs font-bold text-m31-text-muted">Modelo
                <select value={modelo} onChange={(e) => { setModelo(e.target.value); if (e.target.value !== 'jesus') setCor(''); }} className="mt-1 h-12 w-full rounded-lg border border-m31-border bg-white px-3 text-base text-m31-ink">
                  <option value="filhas">Filhas</option><option value="milagres">Milagres</option><option value="jesus">Jesus</option>
                </select>
              </label>
              {modelo === 'jesus' && <label className="text-xs font-bold text-m31-text-muted">Cor
                <select value={cor} onChange={(e) => setCor(e.target.value)} className="mt-1 h-12 w-full rounded-lg border border-m31-border bg-white px-3 text-base text-m31-ink">
                  <option value="">Sem cor</option><option value="preta">Preta</option><option value="cereja">Cereja</option>
                </select>
              </label>}
              <label className="text-xs font-bold text-m31-text-muted">Tamanho
                <select value={tamanho} onChange={(e) => setTamanho(e.target.value)} className="mt-1 h-12 w-full rounded-lg border border-m31-border bg-white px-3 text-base text-m31-ink">
                  {SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
              </label>
              <button type="button" disabled={pending || !tamanho} onClick={async () => { const ok = await onChangeItem(row, { modelo, cor, tamanho }); if (ok) setEditando(false); }} className="min-h-12 rounded-xl bg-m31-primary px-4 font-bold text-white disabled:opacity-50">Salvar alteração</button>
            </div>
          )}
        </div>
      )}

      <p className="mt-3 text-sm text-m31-text-muted">Tamanho: {row.tamanho || 'não informado'}{row.pagamento_status !== 'pago' ? ' · Confirme o pagamento antes de alterar ou entregar.' : ''}</p>
      {row.pagamento_status === 'pago' && <div className="mt-3">
        <button type="button" onClick={() => onConfirmDelivery(row)} disabled={row.entregue || pending} aria-label={row.entregue ? 'Camisa entregue' : `Confirmar entrega para ${row.nome}`} className={row.entregue ? 'flex h-14 min-w-14 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700' : 'flex h-14 min-w-14 items-center justify-center rounded-xl border border-m31-border bg-white text-m31-primary active:bg-m31-primary-tint disabled:opacity-50'}>
          <Check aria-hidden="true" className="mr-2 h-5 w-5" />{row.entregue ? 'Entregue' : 'Confirmar entrega'}
        </button>
      </div>}
    </article>
  );
}
