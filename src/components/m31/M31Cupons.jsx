import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Copy, Check, Download } from 'lucide-react';

export default function M31Cupons() {
  const qc = useQueryClient();
  const [qtd, setQtd] = useState(10);
  const [batch, setBatch] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiado, setCopiado] = useState(null);

  const { data: cupons = [], isLoading } = useQuery({
    queryKey: ['m31cupons'],
    queryFn: () => base44.entities.EventoM31Cupom.list('-created_date', 500),
  });

  const gerarCupons = async () => {
    setLoading(true);
    const res = await base44.functions.invoke('m31GerarCupons', { quantidade: qtd, batch: batch || undefined });
    setLoading(false);
    if (res.data?.success) {
      qc.invalidateQueries({ queryKey: ['m31cupons'] });
      setBatch('');
    } else {
      alert(res.data?.error || 'Erro ao gerar cupons');
    }
  };

  const copiar = (codigo) => {
    navigator.clipboard.writeText(codigo);
    setCopiado(codigo);
    setTimeout(() => setCopiado(null), 2000);
  };

  const exportarDisponiveis = () => {
    const disponiveis = cupons.filter(c => !c.usado);
    const csv = ['Código;Descrição', ...disponiveis.map(c => `${c.codigo};${c.descricao || ''}`)].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'cupons_doacao_m31.csv'; a.click();
  };

  const totalDisponiveis = cupons.filter(c => !c.usado).length;
  const totalUsados = cupons.filter(c => c.usado).length;

  return (
    <div className="space-y-6">
      {/* Gerar cupons */}
      <div className="bg-white rounded-lg p-5 border border-gray-200">
        <h3 className="text-gray-900 font-bold text-lg mb-4">🎟️ Gerar Cupons de Doação</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-gray-500 text-xs block mb-1">Quantidade</label>
            <Input type="number" min={1} max={500} value={qtd} onChange={e => setQtd(Number(e.target.value))}
              className="w-24 bg-gray-50 border-gray-200 text-gray-900 rounded-xl" />
          </div>
          <div className="flex-1 min-w-48">
            <label className="text-gray-500 text-xs block mb-1">Descrição / Nome do lote (opcional)</label>
            <Input value={batch} onChange={e => setBatch(e.target.value)} placeholder="Ex: Igreja ABC — Doação"
              className="bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400 rounded-xl" />
          </div>
          <Button onClick={gerarCupons} disabled={loading}
            style={{ background: '#7A1F2B' }} className="hover:opacity-90 rounded-xl px-6">
            {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Gerando...</> : '+ Gerar Cupons'}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <div className="text-gray-900 font-bold text-2xl">{cupons.length}</div>
          <div className="text-gray-500 text-sm">Total gerados</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
          <div className="text-green-600 font-bold text-2xl">{totalDisponiveis}</div>
          <div className="text-gray-500 text-sm">Disponíveis</div>
        </div>
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 text-center">
          <div className="text-rose-600 font-bold text-2xl">{totalUsados}</div>
          <div className="text-gray-500 text-sm">Utilizados</div>
        </div>
      </div>

      {/* Ações */}
      <div className="flex gap-3">
        <Button onClick={exportarDisponiveis} className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-xl">
          <Download className="w-4 h-4 mr-2" />Exportar disponíveis (CSV)
        </Button>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="flex justify-center py-8"><div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#7A1F2B', borderTopColor: 'transparent' }} /></div>
      ) : (
        <div className="space-y-2">
          {cupons.map(c => (
            <div key={c.id} className={`rounded-lg p-4 flex items-center gap-3 border ${c.usado ? 'bg-gray-50 border-gray-200 opacity-60' : 'bg-white border-gray-200'}`}>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-gray-900 font-mono font-bold tracking-widest">{c.codigo}</span>
                  {c.usado
                    ? <span className="text-xs bg-rose-50 text-rose-600 border border-rose-200 px-2 py-0.5 rounded-full">Usado</span>
                    : <span className="text-xs bg-green-50 text-green-600 border border-green-200 px-2 py-0.5 rounded-full">Disponível</span>}
                </div>
                {c.batch && <div className="text-gray-400 text-xs">{c.batch}</div>}
                {c.usado && c.usado_por_email && <div className="text-gray-400 text-xs">Usado por: {c.usado_por_email}</div>}
              </div>
              {!c.usado && (
                <button onClick={() => copiar(c.codigo)} className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors">
                  {copiado === c.codigo ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}