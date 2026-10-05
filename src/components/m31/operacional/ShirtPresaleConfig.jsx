import { useEffect, useState } from 'react';

export default function ShirtPresaleConfig({ config, disabled, preview, onSave }) {
  const [ativo, setAtivo] = useState(false);
  const [precoUnitario, setPrecoUnitario] = useState('');
  const [precoPromocional, setPrecoPromocional] = useState('');
  const [promoAte, setPromoAte] = useState('');
  const [modelos, setModelos] = useState([]);
  useEffect(() => {
    setAtivo(config?.ativo === true);
    setPrecoUnitario(config?.preco_unitario || '');
    setPrecoPromocional(config?.preco_promocional || '');
    setPromoAte(config?.promo_ate || '');
    setModelos(config?.modelos || []);
  }, [JSON.stringify(config)]);
  const invalid = [precoUnitario, precoPromocional].some(value => !Number.isFinite(Number(value)) || Number(value) <= 0) || !modelos.length || !promoAte;
  return <section className="rounded-xl border border-border bg-card p-4 text-card-foreground">
    <h2 className="font-semibold">Pré-venda de camisas</h2>
    <p className="mt-1 text-sm text-muted-foreground">Formulário separado. Não depende do estoque físico e não inclui inscrição.</p>
    <fieldset disabled={disabled} className="mt-3 space-y-3 disabled:opacity-50">
      <label className="flex min-h-12 items-center gap-3"><input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} />{ativo ? 'Ativa ao salvar' : 'Pausada ao salvar'}</label>
      <div className="grid grid-cols-2 gap-2"><label className="text-sm">Preço de uma camisa<input type="number" min="0.01" step="0.01" value={precoUnitario} onChange={e => setPrecoUnitario(e.target.value)} className="mt-1 h-12 w-full rounded-lg border border-input px-2" /></label><label className="text-sm">Preço por peça (2 ou mais)<input type="number" min="0.01" step="0.01" value={precoPromocional} onChange={e => setPrecoPromocional(e.target.value)} className="mt-1 h-12 w-full rounded-lg border border-input px-2" /></label></div>
      <label className="block text-sm">Promoção válida até<input type="date" value={promoAte} onChange={e => setPromoAte(e.target.value)} className="mt-1 h-12 w-full rounded-lg border border-input px-2" /></label>
      <div className="flex flex-wrap gap-2">{['jesus', 'milagres', 'filhas'].map(m => <label key={m} className="flex min-h-12 items-center gap-2 rounded-lg border border-border px-3 capitalize"><input type="checkbox" checked={modelos.includes(m)} onChange={() => setModelos(v => v.includes(m) ? v.filter(x => x !== m) : [...v, m])} />{m}</label>)}</div>
      <button type="button" disabled={ativo && invalid} onClick={() => onSave({ action: 'configurar_pre_venda', ativo, preco_unitario: Number(precoUnitario), preco_promocional: Number(precoPromocional), promo_ate: promoAte, modelos })} className="min-h-12 w-full rounded-lg bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-50">Salvar pré-venda</button>
    </fieldset>
    <p className="mt-2 text-xs text-muted-foreground">Após a data limite, todas as peças usam o preço unitário. Alterar preços não altera pedidos já criados.</p>
    {preview && <p className="mt-2 text-xs">Prévia: nenhuma alteração real será salva.</p>}
  </section>;
}
