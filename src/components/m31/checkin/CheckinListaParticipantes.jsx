import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Search, EyeOff, CheckCircle, Loader2 } from 'lucide-react';

/**
 * Lista de participantes elegíveis a check-in, com busca e opção de
 * ocultar quem já fez check-in (modo fila).
 */
export default function CheckinListaParticipantes() {
  const [busca, setBusca] = useState('');
  const [ocultarFeitos, setOcultarFeitos] = useState(false);

  const { data: inscricoes = [], isLoading } = useQuery({
    queryKey: ['checkin_lista'],
    queryFn: async () => {
      const [aprovadas, gratuitas] = await Promise.all([
        base44.entities.EventoM31Inscricao.filter({ status_pagamento: 'aprovado' }, 'nome', 1000),
        base44.entities.EventoM31Inscricao.filter({ status_pagamento: 'gratuito' }, 'nome', 500),
      ]);
      return [...aprovadas, ...gratuitas];
    },
    refetchInterval: 30000,
  });

  const feitos = useMemo(() => inscricoes.filter(i => i.checkin_realizado).length, [inscricoes]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return inscricoes.filter(i => {
      if (ocultarFeitos && i.checkin_realizado) return false;
      if (!q) return true;
      return (i.nome || '').toLowerCase().includes(q) || (i.codigo_inscricao || '').toLowerCase().includes(q);
    });
  }, [inscricoes, busca, ocultarFeitos]);

  return (
    <div className="flex flex-col gap-3">
      {/* Progresso */}
      <div className="bg-card border border-border rounded-lg p-4 shadow-m31">
        <div className="flex items-center justify-between mb-2">
          <span className="text-caption text-muted-foreground">Progresso do Check-in</span>
          <span className="text-title text-foreground">
            {feitos} <span className="text-muted-foreground font-normal">/ {inscricoes.length}</span>
          </span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-grad-success rounded-full transition-all"
            style={{ width: inscricoes.length ? `${(feitos / inscricoes.length) * 100}%` : '0%' }}
          />
        </div>
      </div>

      {/* Busca + ocultar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por nome ou código..."
            className="w-full h-10 pl-9 pr-3 bg-card border border-input rounded-md text-sm outline-none focus:border-primary"
          />
        </div>
        <button
          onClick={() => setOcultarFeitos(v => !v)}
          className={`flex items-center gap-1.5 px-3 h-10 rounded-md border text-sm font-medium whitespace-nowrap transition-all ${
            ocultarFeitos ? 'border-primary bg-accent text-primary' : 'border-border bg-card text-muted-foreground'
          }`}
        >
          <EyeOff size={13} /> Ocultar feitos
        </button>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 size={22} className="animate-spin text-primary" />
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden shadow-m31 divide-y divide-border max-h-[480px] overflow-y-auto">
          {filtradas.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhuma participante encontrada.</p>
          )}
          {filtradas.slice(0, 300).map(i => (
            <div key={i.id} className={`flex items-center justify-between px-4 py-2.5 ${i.checkin_realizado ? 'bg-m31-success/5' : ''}`}>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{i.nome}</p>
                <p className="text-micro text-muted-foreground font-mono">{i.codigo_inscricao || '— sem código'}</p>
              </div>
              {i.checkin_realizado ? (
                <span className="flex items-center gap-1 text-micro font-semibold text-m31-success flex-shrink-0">
                  <CheckCircle size={12} />
                  {i.checkin_at ? new Date(i.checkin_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'Feito'}
                </span>
              ) : (
                <span className="text-micro text-muted-foreground flex-shrink-0">Aguardando</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}