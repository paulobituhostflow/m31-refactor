import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';

const LOTES_INICIAIS = [
  { nome: '1º Lote', codigo: 'lote_1', valor: 110, vagas_total: 300, vagas_usadas: 0, ativo: true, ordem: 1, data_fim: '2025-05-01' },
  { nome: '2º Lote', codigo: 'lote_2', valor: 129, vagas_total: 100, vagas_usadas: 0, ativo: false, ordem: 2 },
  { nome: '3º Lote', codigo: 'lote_3', valor: 139, vagas_total: 100, vagas_usadas: 0, ativo: false, ordem: 3 },
  { nome: '4º Lote', codigo: 'lote_4', valor: 149, vagas_total: 100, vagas_usadas: 0, ativo: false, ordem: 4 },
];

export default function M31Lotes() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);

  const { data: lotes = [], isLoading } = useQuery({
    queryKey: ['m31lotes'],
    queryFn: () => base44.entities.EventoM31Lote.list('ordem', 10),
  });

  const createDefault = async () => {
    setCreating(true);
    await base44.entities.EventoM31Lote.bulkCreate(LOTES_INICIAIS);
    qc.invalidateQueries({ queryKey: ['m31lotes'] });
    setCreating(false);
  };

  const toggleAtivo = async (lote) => {
    // Desativar todos, ativar só este
    for (const l of lotes) {
      if (l.id !== lote.id && l.ativo) {
        await base44.entities.EventoM31Lote.update(l.id, { ativo: false });
      }
    }
    await base44.entities.EventoM31Lote.update(lote.id, { ativo: !lote.ativo });
    qc.invalidateQueries({ queryKey: ['m31lotes'] });
  };

  const updateValor = async (lote, valor) => {
    await base44.entities.EventoM31Lote.update(lote.id, { valor: Number(valor) });
    qc.invalidateQueries({ queryKey: ['m31lotes'] });
  };

  if (isLoading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-rose-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-gray-900 font-bold text-lg">🔖 Gerenciar Lotes</h3>
        {lotes.length === 0 && (
          <Button onClick={createDefault} disabled={creating}
            style={{ background: '#7A1F2B' }} className="hover:opacity-90 rounded-xl">
            {creating ? 'Criando...' : '+ Criar Lotes Padrão'}
          </Button>
        )}
      </div>

      {lotes.length === 0 && (
        <div className="bg-white rounded-lg p-8 text-center border border-gray-200">
          <p className="text-gray-500 mb-4">Nenhum lote configurado ainda.</p>
          <p className="text-gray-400 text-sm">Clique em "Criar Lotes Padrão" para criar os 4 lotes do evento.</p>
        </div>
      )}

      <div className="space-y-3">
        {lotes.map(l => (
          <div key={l.id} className={`rounded-lg p-5 border transition-all ${l.ativo ? 'bg-[#FDF2F4] border-[#D4A8B0]' : 'bg-white border-gray-200'}`}>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-900 font-bold text-lg">{l.nome}</span>
                  {l.ativo && <span className="text-xs text-white px-2 py-0.5 rounded-full animate-pulse" style={{ background: '#7A1F2B' }}>🔥 ATIVO</span>}
                </div>
                <div className="text-gray-500 text-sm">{l.vagas_usadas || 0}/{l.vagas_total} vagas preenchidas</div>
                {l.data_fim && <div className="text-gray-400 text-xs">Encerra: {l.data_fim}</div>}
              </div>
              <div className="flex items-center gap-3">
                <div>
                  <label className="text-gray-400 text-xs block mb-1">Valor (R$)</label>
                  <input type="number" defaultValue={l.valor} onBlur={e => updateValor(l, e.target.value)}
                    className="w-24 bg-gray-50 border border-gray-200 text-gray-900 rounded-lg px-2 py-1 text-sm" />
                </div>
                <Button onClick={() => toggleAtivo(l)} size="sm"
                  className={l.ativo ? 'bg-gray-600 hover:bg-gray-700 text-white rounded-xl' : 'text-white rounded-xl hover:opacity-90'}
                  style={l.ativo ? {} : { background: '#7A1F2B' }}>
                  {l.ativo ? 'Desativar' : 'Ativar'}
                </Button>
              </div>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-3">
              <div className="h-2 rounded-full transition-all" style={{ width: `${Math.min(100, Math.round((l.vagas_usadas||0)/l.vagas_total*100))}%`, background: '#7A1F2B' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}