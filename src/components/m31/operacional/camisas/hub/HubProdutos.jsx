import { useState } from 'react';
import { Plus, Shirt } from 'lucide-react';
import M31BottomSheet from '@/components/m31/operacional/M31BottomSheet';
import M31SkeletonList from '@/components/m31/operacional/M31SkeletonList';

const MODELOS = [
  { id: 'jesus', nome: 'Jesus' },
  { id: 'milagres', nome: 'Milagres' },
  { id: 'filhas', nome: 'Filhas' },
];
const TAMANHOS = ['PP', 'P', 'M', 'G', 'GG', 'XGG'];
const INITIAL = { nome: '', modelo: 'filhas', cor: '', preco: '', foto_url: '', descricao: '', tamanhos: ['P', 'M', 'G'] };

const inputClass = 'h-12 w-full rounded-xl border border-m31-border bg-white px-3 text-base text-m31-ink outline-none focus:border-m31-primary';
const labelClass = 'block text-sm font-semibold text-m31-ink';

// Produtos: catálogo da Central — cadastrar novo modelo com foto, preço,
// tamanhos e variação de cor.
export default function HubProdutos({ produtos, loading, pending, preview, onCriar }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(INITIAL);
  function set(campo, valor) {
    setForm((atual) => ({ ...atual, [campo]: valor }));
  }
  function toggleTamanho(tamanho) {
    setForm((atual) => ({
      ...atual,
      tamanhos: atual.tamanhos.includes(tamanho) ? atual.tamanhos.filter((t) => t !== tamanho) : [...atual.tamanhos, tamanho],
    }));
  }

  async function submit(event) {
    event.preventDefault();
    const ok = await onCriar({
      nome: form.nome,
      modelo: form.modelo,
      cor: form.modelo === 'jesus' ? form.cor : '',
      preco: Number(String(form.preco).replace(',', '.')) || 0,
      tamanhos: form.tamanhos,
      foto_url: form.foto_url,
      descricao: form.descricao,
    });
    if (ok) {
      setOpen(false);
      setForm(INITIAL);
    }
  }

  return (
    <section className="space-y-4">
      <button type="button" onClick={() => setOpen(true)} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-m31-primary text-base font-bold text-white active:opacity-80">
        <Plus aria-hidden="true" className="h-5 w-5" />
        Cadastrar produto
      </button>

      {loading ? <M31SkeletonList /> : (
        <div className="overflow-hidden rounded-xl border border-m31-border bg-white">
          {(produtos || []).length === 0 && <p className="p-6 text-center text-sm text-m31-text-muted">Nenhum produto cadastrado ainda.</p>}
          {(produtos || []).map((produto) => (
            <div key={produto.id} className="flex items-center gap-3 border-b border-m31-border p-4 last:border-b-0">
              {produto.foto_url ? (
                <img src={produto.foto_url} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
              ) : (
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-m31-primary-tint text-m31-primary">
                  <Shirt aria-hidden="true" className="h-5 w-5" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-sm text-m31-ink">{produto.nome}</strong>
                <span className="block truncate text-xs text-m31-text-muted">
                  {produto.tamanhos?.join(' · ') || 'sem tamanhos'}
                  {produto.preco ? ` · R$ ${Number(produto.preco).toFixed(2).replace('.', ',')}` : ''}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
      {preview && <p className="text-xs text-m31-text-muted">Prévia: nenhum produto real é alterado.</p>}

      <M31BottomSheet open={open} onOpenChange={setOpen} title="Cadastrar produto">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className={labelClass} htmlFor="produto-nome">Nome do produto</label>
            <input id="produto-nome" required value={form.nome} onChange={(event) => set('nome', event.target.value)} className={inputClass} placeholder="Camisa Jesus Preta" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="produto-modelo">Modelo</label>
              <select id="produto-modelo" value={form.modelo} onChange={(event) => set('modelo', event.target.value)} className={inputClass}>
                {MODELOS.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="produto-preco">Preço (R$)</label>
              <input id="produto-preco" inputMode="decimal" value={form.preco} onChange={(event) => set('preco', event.target.value)} className={inputClass} placeholder="0,00" />
            </div>
          </div>
          {form.modelo === 'jesus' && (
            <div>
              <label className={labelClass} htmlFor="produto-cor">Cor</label>
              <select id="produto-cor" value={form.cor} onChange={(event) => set('cor', event.target.value)} className={inputClass}>
                <option value="">Selecione</option>
                <option value="preta">Preta</option>
                <option value="cereja">Cereja</option>
              </select>
            </div>
          )}
          <div>
            <span className={labelClass}>Tamanhos disponíveis</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {TAMANHOS.map((tamanho) => (
                <button
                  key={tamanho}
                  type="button"
                  onClick={() => toggleTamanho(tamanho)}
                  className={form.tamanhos.includes(tamanho)
                    ? 'min-h-10 rounded-full bg-m31-primary px-4 text-sm font-bold text-white'
                    : 'min-h-10 rounded-full border border-m31-border bg-white px-4 text-sm font-semibold text-m31-text-muted'}
                >
                  {tamanho}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor="produto-foto">Foto (link, opcional)</label>
            <input id="produto-foto" inputMode="url" value={form.foto_url} onChange={(event) => set('foto_url', event.target.value)} className={inputClass} placeholder="https://" />
          </div>
          <div>
            <label className={labelClass} htmlFor="produto-descricao">Descrição (opcional)</label>
            <textarea id="produto-descricao" rows={2} value={form.descricao} onChange={(event) => set('descricao', event.target.value)} className="w-full rounded-xl border border-m31-border bg-white px-3 py-2 text-base text-m31-ink outline-none focus:border-m31-primary" />
          </div>
          <button type="submit" disabled={pending} className="min-h-12 w-full rounded-xl bg-m31-primary font-bold text-white disabled:opacity-50">
            Salvar produto
          </button>
        </form>
      </M31BottomSheet>
    </section>
  );
}
