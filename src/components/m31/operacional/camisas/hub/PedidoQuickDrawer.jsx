import { X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import ShirtOrderCard from '@/components/m31/operacional/camisas/ShirtOrderCard';

export default function PedidoQuickDrawer({ row, open, onClose, pending, trocaSalva, onNotifyChange, ...actions }) {
  const { data: historico = [] } = useQuery({
    queryKey: ['m31-camisa-historico', row?.registro_id],
    queryFn: () => base44.entities.EventoM31ActionLog.filter({ entidade_id: row.registro_id }, '-created_date', 50),
    enabled: Boolean(open && row?.registro_id),
  });
  if (!open || !row) return null;
  const itens = row.itens || [row];
  return <div className="fixed inset-0 z-[80]">
    <button type="button" aria-label="Fechar" onClick={onClose} className="absolute inset-0 bg-black/35" />
    <section className="absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-[28px] bg-white shadow-2xl">
      <div className="sticky top-0 z-10 flex min-h-14 items-center justify-between border-b border-m31-border bg-white px-4">
        <div><p className="text-xs font-bold uppercase tracking-wide text-m31-primary">Resumo da compra</p><h2 className="font-bold text-m31-ink">{row.numero_pedido != null ? `#M31${String(row.numero_pedido).padStart(3, '0')} · ` : ''}{row.nome}</h2><p className="text-xs text-m31-text-muted">{row.quantidade} camisa{row.quantidade === 1 ? '' : 's'} neste pedido · {(row.telefones || [row.whatsapp]).filter(Boolean).join(' / ') || 'Sem WhatsApp'}</p></div>
        <button type="button" onClick={onClose} aria-label="Fechar pedido" className="flex h-11 w-11 items-center justify-center rounded-full active:bg-m31-primary-tint"><X className="h-5 w-5" /></button>
      </div>
      <div className="border-b border-m31-border bg-m31-surface-warm px-4 py-3"><p className="text-xs font-bold uppercase tracking-wide text-m31-text-muted">Itens deste pedido</p><p className="mt-1 text-sm font-semibold text-m31-ink">{row.quantidade} camisa{row.quantidade === 1 ? '' : 's'}</p></div>
      <div>{itens.map((item, index) => <ShirtOrderCard key={item.row_id || index} row={item} pending={pending} {...actions} />)}</div>
      <div className="border-t border-m31-border px-4 py-4"><h3 className="text-sm font-bold text-m31-ink">Histórico de alterações</h3>{historico.length === 0 ? <p className="mt-2 text-xs text-m31-text-muted">Nenhuma alteração registrada ainda.</p> : <div className="mt-2 space-y-2">{historico.map((item) => <div key={item.id} className="border-l-2 border-m31-primary pl-3 text-xs"><p className="font-semibold text-m31-ink">{item.acao}</p><p className="mt-1 text-m31-text-muted">{item.created_date ? new Date(item.created_date).toLocaleString('pt-BR') : 'Data não informada'} · {item.user_nome || item.user_email || 'operador'}</p></div>)}</div>}</div>
      {trocaSalva && row.registro_tipo === 'pedido_camisa' && itens.some((item) => item.row_id === trocaSalva.row_id) && (
        <div className="sticky bottom-0 border-t border-m31-border bg-white p-4 shadow-[0_-8px_24px_rgba(0,0,0,.08)]">
          <p className="text-sm font-bold text-m31-ink">Item do pedido atualizado.</p>
          <p className="mt-1 text-sm text-m31-text-muted">Deseja avisar {String(row.nome || 'a cliente').split(' ')[0]} pelo WhatsApp?</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => onNotifyChange(row)} disabled={pending || !row.whatsapp} className="min-h-11 rounded-xl bg-m31-primary px-3 text-sm font-bold text-white disabled:opacity-50">Enviar confirmação</button>
            <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-m31-border px-3 text-sm font-bold text-m31-primary">Agora não</button>
          </div>
          {!row.whatsapp && <p className="mt-2 text-xs font-semibold text-amber-700">Sem WhatsApp válido: a troca foi salva, mas não é possível enviar mensagem.</p>}
        </div>
      )}
    </section>
  </div>;
}
