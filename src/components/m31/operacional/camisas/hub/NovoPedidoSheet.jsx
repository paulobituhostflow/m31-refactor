import { useEffect, useState } from 'react';
import M31BottomSheet from '@/components/m31/operacional/M31BottomSheet';

const MODELOS = [
  { id: 'jesus', nome: 'Jesus' },
  { id: 'milagres', nome: 'Milagres' },
  { id: 'filhas', nome: 'Filhas' },
];
const TAMANHOS = ['PP', 'P', 'M', 'G', 'GG', 'XGG'];
const INITIAL = { nome: '', whatsapp: '', modelo: 'filhas', cor: '', tamanho: 'M', quantidade: '1', valor_total: '', ja_inscrita: 'nao' };

const inputClass = 'h-12 w-full rounded-xl border border-m31-border bg-white px-3 text-base text-m31-ink outline-none focus:border-m31-primary';
const labelClass = 'block text-sm font-semibold text-m31-ink';

// + Novo pedido: venda manual registrada pela Dulce. Mesma entidade dos
// fluxos WhatsApp/pré-venda — nunca cria inscrição nem cobrança.
export default function NovoPedidoSheet({ open, onOpenChange, onSave, pending }) {
  const [form, setForm] = useState(INITIAL);
  useEffect(() => {
    if (open) setForm(INITIAL);
  }, [open]);
  function set(campo, valor) {
    setForm((atual) => ({ ...atual, [campo]: valor }));
  }

  async function submit(event) {
    event.preventDefault();
    const ok = await onSave({
      nome: form.nome,
      whatsapp: form.whatsapp,
      modelo: form.modelo,
      cor: form.modelo === 'jesus' ? form.cor : '',
      tamanho: form.tamanho,
      quantidade: Number(form.quantidade) || 0,
      valor_total: Number(String(form.valor_total).replace(',', '.')) || 0,
      ja_inscrita: form.ja_inscrita === 'sim',
    });
    if (ok) onOpenChange(false);
  }

  return (
    <M31BottomSheet open={open} onOpenChange={onOpenChange} title="Novo pedido">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="pedido-nome">Nome da compradora</label>
          <input id="pedido-nome" required value={form.nome} onChange={(event) => set('nome', event.target.value)} className={inputClass} placeholder="Maria da Silva" />
        </div>
        <div>
          <label className={labelClass} htmlFor="pedido-whatsapp">WhatsApp (com DDD)</label>
          <input id="pedido-whatsapp" required inputMode="tel" value={form.whatsapp} onChange={(event) => set('whatsapp', event.target.value)} className={inputClass} placeholder="81 99999-9999" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor="pedido-modelo">Modelo</label>
            <select id="pedido-modelo" value={form.modelo} onChange={(event) => set('modelo', event.target.value)} className={inputClass}>
              {MODELOS.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="pedido-tamanho">Tamanho</label>
            <select id="pedido-tamanho" value={form.tamanho} onChange={(event) => set('tamanho', event.target.value)} className={inputClass}>
              {TAMANHOS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
        {form.modelo === 'jesus' && (
          <div>
            <label className={labelClass} htmlFor="pedido-cor">Cor</label>
            <select id="pedido-cor" value={form.cor} onChange={(event) => set('cor', event.target.value)} className={inputClass}>
              <option value="">Selecione</option>
              <option value="preta">Preta</option>
              <option value="cereja">Cereja</option>
            </select>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor="pedido-qtd">Quantidade</label>
            <input id="pedido-qtd" required inputMode="numeric" type="number" min="1" max="10" value={form.quantidade} onChange={(event) => set('quantidade', event.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="pedido-valor">Valor total (R$)</label>
            <input id="pedido-valor" inputMode="decimal" value={form.valor_total} onChange={(event) => set('valor_total', event.target.value)} className={inputClass} placeholder="0,00" />
          </div>
        </div>
        <div>
          <label className={labelClass} htmlFor="pedido-inscrita">Já é inscrita no M31?</label>
          <select id="pedido-inscrita" value={form.ja_inscrita} onChange={(event) => set('ja_inscrita', event.target.value)} className={inputClass}>
            <option value="nao">Não</option>
            <option value="sim">Sim</option>
          </select>
        </div>
        <button type="submit" disabled={pending} className="min-h-12 w-full rounded-xl bg-m31-primary font-bold text-white disabled:opacity-50">
          Registrar pedido
        </button>
        <p className="text-xs text-m31-text-muted">
          O pedido entra com pagamento pendente — após conferir, confirme o pagamento na lista de pedidos.
        </p>
      </form>
    </M31BottomSheet>
  );
}
