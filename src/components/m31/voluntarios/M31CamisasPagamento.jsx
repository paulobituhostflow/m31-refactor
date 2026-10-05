import { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { consolidarVoluntarias } from '@/lib/m31VoluntariaConsolidado';
import CamisasResumoTamanhos from './CamisasResumoTamanhos';
import CamisasListaPessoas from './CamisasListaPessoas';

const FILTROS = [
  ['todas', 'Todas'],
  ['pagas', 'Pagas'],
  ['pendentes', 'Pendentes'],
  ['sem_camisa', 'Sem camisa'],
  ['divergencia', 'Revisar'],
];

function Kpi({ label, value, sub }) {
  return (
    <div className="bg-card border border-border rounded-card p-4">
      <div className="text-caption text-muted-foreground mb-2">{label}</div>
      <div className="text-h1 text-foreground leading-none">{value}</div>
      {sub && <div className="text-micro text-muted-foreground mt-2">{sub}</div>}
    </div>
  );
}

/**
 * Visão única e confiável de pagamento + camisa das voluntárias.
 * Somente leitura: consolida os dados existentes e sinaliza divergências.
 */
export default function M31CamisasPagamento() {
  const [filtro, setFiltro] = useState('todas');
  const [busca, setBusca] = useState('');

  const { data: inscricoes = [], isLoading } = useQuery({
    queryKey: ['m31camisas-inscricoes'],
    queryFn: () => base44.entities.EventoM31Inscricao.filter({ tipo: 'voluntario' }, '-created_date', 500),
  });
  const { data: cadastros = [] } = useQuery({
    queryKey: ['m31camisas-cadastros'],
    queryFn: () => base44.entities.EventoM31Voluntario.list('-created_date', 500),
  });

  const { pessoas, orfaos, stats, tamanhos } = useMemo(
    () => consolidarVoluntarias(inscricoes, cadastros),
    [inscricoes, cadastros],
  );

  const lista = useMemo(() => pessoas.filter((p) => {
    if (filtro === 'pagas' && !(p.pagamento === 'pago' || p.pagamento === 'isento')) return false;
    if (filtro === 'pendentes' && p.pagamento !== 'pendente') return false;
    if (filtro === 'sem_camisa' && p.tamanho) return false;
    if (filtro === 'divergencia' && p.divergencias.length === 0) return false;
    if (busca.trim()) {
      const q = busca.toLowerCase();
      if (!(p.nome || '').toLowerCase().includes(q) && !(p.whatsapp || '').includes(q)) return false;
    }
    return true;
  }), [pessoas, filtro, busca]);

  if (isLoading) {
    return <div className="p-12 text-center text-sm text-muted-foreground">Carregando voluntárias...</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <Kpi label="Voluntárias" value={stats.total} sub="inscrições ativas (uma por pessoa)" />
        <Kpi label="Pagas" value={stats.pagas} sub={stats.isentas ? `+ ${stats.isentas} isentas` : 'pagamento confirmado'} />
        <Kpi label="Pendentes" value={stats.pendentes} sub="sem pagamento confirmado" />
        <Kpi label="Camisa informada" value={stats.camisa_informada} sub={`${stats.camisa_faltando} ainda faltam`} />
        <Kpi label="Para revisar" value={stats.com_divergencia} sub="divergências sinalizadas" />
      </div>

      <CamisasResumoTamanhos tamanhos={tamanhos} faltando={stats.camisa_faltando} />

      {orfaos.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-card p-4">
          <div className="text-title text-amber-800">
            {orfaos.length} cadastro{orfaos.length > 1 ? 's' : ''} de voluntária sem inscrição vinculada
          </div>
          <div className="text-sm text-amber-800/80 mt-1">
            Não são contados como inscritas nem entram na contagem de camisas. Precisam de conferência humana —
            nada é vinculado automaticamente.
          </div>
          <div className="mt-3 max-h-40 overflow-y-auto flex flex-col gap-1">
            {orfaos.map((o) => (
              <div key={o.id} className="text-sm text-amber-900 flex flex-wrap gap-2">
                <span className="font-semibold">{o.nome}</span>
                <span className="opacity-70">{o.whatsapp || '—'}</span>
                {o.setor && <span className="opacity-70">· {o.setor}</span>}
                {o.tamanho && <span className="opacity-70">· camisa {o.tamanho}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={busca} onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou WhatsApp"
          className="flex-1 min-w-[180px] bg-card border border-border rounded-control px-3 py-2 text-body text-foreground outline-none"
        />
        <div className="flex gap-1 overflow-x-auto scrollbar-none">
          {FILTROS.map(([id, label]) => (
            <button key={id} onClick={() => setFiltro(id)}
              className={`text-sm font-semibold px-3 py-2 rounded-control border whitespace-nowrap ${
                filtro === id ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <CamisasListaPessoas pessoas={lista} />
    </div>
  );
}