import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Download, Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function M31ExportarIntercessao() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [csv, setCsv] = useState('');

  useEffect(() => {
    base44.functions
      .invoke('m31ListarParticipantesIntercessao', {})
      .then((res) => {
        const data = res.data || res;
        setStats(data.stats);
        setCsv(data.csv || '');
      })
      .catch((e) => setError(e.message || 'Erro ao gerar relatório'))
      .finally(() => setLoading(false));
  }, []);

  const baixar = () => {
    if (!csv) return;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `intercessao_cruzamento_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link to="/auditoria-grupos" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-h1 text-foreground">Cruzamento — Intercessão</h1>
            <p className="text-sm text-muted-foreground">Grupo WhatsApp × Cadastro de Voluntárias</p>
          </div>
        </div>

        {loading && (
          <div className="flex items-center gap-3 text-muted-foreground p-6 bg-card rounded-lg border border-border">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-body">Buscando participantes do grupo e cruzando com o cadastro…</span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-3 p-4 bg-destructive/5 border border-destructive/20 rounded-lg">
            <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-body font-medium text-destructive">Erro</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </div>
        )}

        {!loading && !error && stats && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Ativas" value={stats.ativos} tone="success" />
              <Stat label="Sairam do grupo" value={stats.sairam_do_grupo} tone="warning" />
              <Stat label="Sem cadastro" value={stats.sem_cadastro} tone="danger" />
            </div>

            <div className="bg-card border border-border rounded-lg p-5 space-y-4">
              <div>
                <p className="text-caption text-muted-foreground">Grupo</p>
                <p className="text-body font-medium text-foreground">{stats.total_grupo} no grupo · {stats.total_cadastro} no cadastro</p>
              </div>
              <p className="text-sm text-muted-foreground">
                CSV completo com todas as {stats.total_grupo + stats.sairam_do_grupo} entradas (grupo + cadastro).
              </p>
              <button
                onClick={baixar}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-md font-medium text-body hover:opacity-90 transition-opacity"
              >
                <Download className="w-4 h-4" />
                Baixar CSV
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }) {
  const tones = {
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-destructive',
  };
  return (
    <div className="bg-card border border-border rounded-lg p-4 text-center">
      <p className={`text-display ${tones[tone]}`}>{value}</p>
      <p className="text-caption text-muted-foreground mt-1">{label}</p>
    </div>
  );
}