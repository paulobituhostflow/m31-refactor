import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { RefreshCw, Download, Loader2 } from 'lucide-react';
import IntercessaoTabela from '@/components/m31/intercessao/IntercessaoTabela';

const ABAS = [
  { id: 'pendentes', label: 'Pagamento pendente' },
  { id: 'sem_inscricao', label: 'Sem inscrição' },
  { id: 'sem_cadastro', label: 'Sem cadastro' },
  { id: 'pagas', label: 'Pagas' },
];

export default function M31IntercessaoPagamentos() {
  const [aba, setAba] = useState('pendentes');
  const [sincronizando, setSincronizando] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['intercessao_pagamentos'],
    queryFn: async () => {
      const res = await base44.functions.invoke('m31AuditoriaPagamentoIntercessao', {});
      return res.data;
    },
  });

  const sincronizar = async () => {
    setSincronizando(true);
    await base44.functions.invoke('m31AuditoriaPagamentoIntercessao', { sincronizar: true });
    await refetch();
    setSincronizando(false);
  };

  const linhas = data?.[aba] || [];
  const r = data?.resumo;

  const exportar = () => {
    const head = 'nome,whatsapp,situacao,camisa,setor\n';
    const body = linhas.map(l =>
      `"${l.nome || l.nome_whatsapp || ''}","${l.telefone}","${l.status_pagamento}","${l.camisa || ''}","${l.setor || ''}"`
    ).join('\n');
    const url = URL.createObjectURL(new Blob([head + body], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `intercessao-${aba}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-h1">Pagamentos da Intercessão</h1>
          <p className="text-sm text-muted-foreground">
            Membros do grupo de Intercessão, sem os administradores.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={sincronizar} disabled={sincronizando}>
            {sincronizando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Atualizar do grupo
          </Button>
          <Button variant="outline" onClick={exportar} disabled={!linhas.length}>
            <Download className="w-4 h-4 mr-2" /> Exportar
          </Button>
        </div>
      </div>

      {r && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            ['No grupo', r.consideradas],
            ['Admins fora', r.admins_excluidos],
            ['Pagas', r.pagas],
            ['A regularizar', r.a_regularizar],
            ['Sem cadastro', r.sem_cadastro],
          ].map(([label, valor]) => (
            <div key={label} className="bg-card border border-border rounded-card p-4">
              <p className="text-caption text-muted-foreground">{label}</p>
              <p className="text-h1">{valor}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {ABAS.map(a => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={`px-3 py-1.5 rounded-pill text-sm border ${
              aba === a.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground'
            }`}
          >
            {a.label} {data ? `(${(data[a.id] || []).length})` : ''}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-card">
        {isLoading
          ? <p className="text-sm text-muted-foreground p-6 text-center">Carregando…</p>
          : data?.error
            ? <p className="text-sm text-destructive p-6 text-center">{data.error}</p>
            : <IntercessaoTabela linhas={linhas} />}
      </div>
    </div>
  );
}