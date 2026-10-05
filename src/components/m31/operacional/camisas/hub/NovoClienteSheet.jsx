import { useEffect, useState } from 'react';
import M31BottomSheet from '@/components/m31/operacional/M31BottomSheet';

const INITIAL = { nome: '', whatsapp: '', email: '', observacoes: '' };
const inputClass = 'h-12 w-full rounded-xl border border-m31-border bg-white px-3 text-base text-m31-ink outline-none focus:border-m31-primary';
const labelClass = 'block text-sm font-semibold text-m31-ink';

// + Novo cliente: cadastro simples da compradora — sem vínculo com
// inscrições do evento (regra fundamental da Central).
export default function NovoClienteSheet({ open, onOpenChange, onSave, pending }) {
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
      email: form.email,
      observacoes: form.observacoes,
    });
    if (ok) onOpenChange(false);
  }

  return (
    <M31BottomSheet open={open} onOpenChange={onOpenChange} title="Novo cliente">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="cliente-nome">Nome</label>
          <input id="cliente-nome" required value={form.nome} onChange={(event) => set('nome', event.target.value)} className={inputClass} placeholder="Maria da Silva" />
        </div>
        <div>
          <label className={labelClass} htmlFor="cliente-whatsapp">WhatsApp (com DDD)</label>
          <input id="cliente-whatsapp" required inputMode="tel" value={form.whatsapp} onChange={(event) => set('whatsapp', event.target.value)} className={inputClass} placeholder="81 99999-9999" />
        </div>
        <div>
          <label className={labelClass} htmlFor="cliente-email">E-mail (opcional)</label>
          <input id="cliente-email" type="email" inputMode="email" value={form.email} onChange={(event) => set('email', event.target.value)} className={inputClass} placeholder="maria@email.com" />
        </div>
        <div>
          <label className={labelClass} htmlFor="cliente-obs">Observações (opcional)</label>
          <textarea id="cliente-obs" rows={2} value={form.observacoes} onChange={(event) => set('observacoes', event.target.value)} className="w-full rounded-xl border border-m31-border bg-white px-3 py-2 text-base text-m31-ink outline-none focus:border-m31-primary" />
        </div>
        <button type="submit" disabled={pending} className="min-h-12 w-full rounded-xl bg-m31-primary font-bold text-white disabled:opacity-50">
          Salvar cliente
        </button>
      </form>
    </M31BottomSheet>
  );
}