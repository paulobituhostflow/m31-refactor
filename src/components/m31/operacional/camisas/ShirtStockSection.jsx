import { useState } from 'react';
import { ChevronDown, PackageOpen } from 'lucide-react';

const SIZES = ['PP', 'P', 'M', 'G', 'GG', 'XGG'];

function ComboEstoque({ combo, disabled, onUpdateEstoque }) {
  const [open, setOpen] = useState(false);
  const cadastrado = SIZES.some((size) => combo.tamanhos?.[size]?.cadastrado);
  return (
    <div className="border-b border-m31-border last:border-b-0">
      <button type="button" onClick={() => setOpen((current) => !current)} className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <span>
          <strong className="block text-m31-ink">{combo.nome}</strong>
          <span className="text-xs text-m31-text-muted">
            {cadastrado ? `${combo.recebidas} recebidas · ${combo.entregues} entregues` : 'Ainda não recebido'}
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className="text-right">
            <strong className="block tabular-nums text-m31-ink">{cadastrado ? combo.disponivel : '—'}</strong>
            <span className="block text-[10px] font-medium text-m31-text-muted">disponível</span>
          </span>
          <ChevronDown aria-hidden="true" className={open ? 'h-5 w-5 rotate-180 text-m31-text-muted' : 'h-5 w-5 text-m31-text-muted'} />
        </span>
      </button>
      {open && (
        <div className="grid grid-cols-3 gap-2 bg-m31-surface-warm px-3 py-3">
          {SIZES.map((size) => {
            const info = combo.tamanhos?.[size] || { recebido: 0, entregues: 0, disponivel: 0, cadastrado: false };
            return (
              <div key={size} className="rounded-lg bg-white p-2 text-center">
                <span className="block text-[10px] font-bold text-m31-text-muted">{size}</span>
                <input
                  key={`${size}:${info.recebido}`}
                  type="number"
                  min="0"
                  inputMode="numeric"
                  defaultValue={info.cadastrado ? info.recebido : ''}
                  placeholder="0"
                  disabled={disabled}
                  aria-label={`Recebidas ${size} — ${combo.nome}`}
                  onBlur={(event) => {
                    const value = Math.max(0, Math.floor(Number(event.target.value) || 0));
                    if (value !== info.recebido) onUpdateEstoque(combo.modelo, combo.cor, size, value);
                  }}
                  className="mt-1 h-9 w-full rounded-lg border border-m31-border px-1 text-center text-sm font-bold tabular-nums text-m31-ink outline-none focus:border-m31-primary disabled:opacity-50"
                />
                <span className="mt-1 block text-[10px] font-medium text-m31-text-muted">
                  {info.cadastrado ? `${info.disponivel} disp. · ${info.entregues} entregues` : 'não recebido'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ShirtStockSection({ inventory, disabled, onUpdateEstoque, preview }) {
  const algumRecebido = (inventory || []).some((combo) => SIZES.some((size) => combo.tamanhos?.[size]?.cadastrado));
  return (
    <section aria-labelledby="shirt-stock-title" className="space-y-2">
      <div className="flex items-end justify-between">
        <h2 id="shirt-stock-title" className="text-lg font-bold text-m31-ink">Estoque físico</h2>
        <span className="text-xs text-m31-text-muted">Toque para lançar recebimento</span>
      </div>
      {!algumRecebido && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-900">
          <PackageOpen aria-hidden="true" className="h-5 w-5 shrink-0" />
          <div>
            <strong>Ainda não recebido.</strong>
            <br />
            Em pré-venda, as peças pagas contam como "a produzir". Quando as camisas chegarem do fornecedor, informe as quantidades abaixo.
          </div>
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-m31-border bg-m31-surface">
        {(inventory || []).map((combo) => (
          <ComboEstoque key={combo.id} combo={combo} disabled={disabled} onUpdateEstoque={onUpdateEstoque} />
        ))}
      </div>
      {preview && <p className="text-xs text-m31-text-muted">Prévia: nenhuma quantidade real será salva.</p>}
    </section>
  );
}