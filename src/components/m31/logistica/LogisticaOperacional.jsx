import { useMemo } from 'react';
import { Users, Clock, Building2, MessageSquare } from 'lucide-react';
import { resolverAreaSlug } from '@/lib/m31OperacaoCalculos';

/**
 * Grid operacional abaixo do mapa.
 * Mostra: responsáveis por área, cronograma, fornecedores e observações.
 * Usa M31Area (via area_id ou fallback legado) — sem taxonomia paralela.
 */
export default function LogisticaOperacional({ tarefas = [], areas = [], cronograma = [], fornecedores = [] }) {
  const areaIdToSlug = useMemo(() => {
    const m = new Map();
    areas.forEach(a => m.set(a.id, a.slug));
    return m;
  }, [areas]);

  const areaSlugToNome = useMemo(() => {
    const m = new Map();
    areas.forEach(a => m.set(a.slug, a.nome));
    return m;
  }, [areas]);

  const responsaveisPorArea = useMemo(() => {
    const grupos = {};
    tarefas.forEach(t => {
      const slug = resolverAreaSlug(t, areaIdToSlug) || '_sem_area';
      if (!grupos[slug]) grupos[slug] = { slug, responsaveis: new Set(), total: 0 };
      grupos[slug].total++;
      if (t.responsavel_nome) grupos[slug].responsaveis.add(t.responsavel_nome);
    });
    return Object.values(grupos).sort((a, b) => b.total - a.total);
  }, [tarefas, areaIdToSlug]);

  const observacoes = useMemo(() =>
    tarefas.filter(t => t.observacoes).slice(0, 6),
  [tarefas]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Responsáveis por área */}
      <SectionCard icon={Users} title="Responsáveis por Área">
        {responsaveisPorArea.length === 0 ? (
          <Empty text="Nenhuma tarefa atribuída." />
        ) : (
          <div className="flex flex-col gap-2">
            {responsaveisPorArea.map(grp => (
              <div key={grp.slug} className="flex items-center justify-between text-xs gap-3">
                <span className="text-muted-foreground whitespace-nowrap">
                  {areaSlugToNome.get(grp.slug) || grp.slug}
                </span>
                <span className="font-medium text-foreground text-right truncate">
                  {grp.responsaveis.size > 0 ? Array.from(grp.responsaveis).join(', ') : '— sem responsável'}
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Cronograma */}
      <SectionCard icon={Clock} title="Cronograma do Evento">
        {cronograma.length === 0 ? (
          <Empty text="Cronograma vazio." />
        ) : (
          <div className="flex flex-col gap-1.5">
            {cronograma.slice(0, 8).map((item, i) => (
              <div key={item.id || i} className="flex items-center gap-3 text-xs">
                <span className="font-semibold text-primary flex-shrink-0 tabular-nums">
                  {item.hora_inicio_normalizada || item.hora_inicio_original || '—'}
                </span>
                <span className="text-foreground truncate">{item.programacao}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Fornecedores */}
      <SectionCard icon={Building2} title="Fornecedores" badge={`${fornecedores.length} ativos`}>
        {fornecedores.length === 0 ? (
          <Empty text="Nenhum fornecedor cadastrado." />
        ) : (
          <div className="flex flex-col gap-1.5">
            {fornecedores.slice(0, 8).map((f, i) => (
              <div key={f.id || i} className="flex items-center justify-between text-xs gap-3">
                <span className="text-foreground truncate">{f.nome}</span>
                <span className="text-muted-foreground flex-shrink-0 capitalize">{f.categoria}</span>
              </div>
            ))}
            {fornecedores.length > 8 && (
              <span className="text-xs text-muted-foreground mt-1">+ {fornecedores.length - 8} fornecedores...</span>
            )}
          </div>
        )}
      </SectionCard>

      {/* Observações operacionais */}
      {observacoes.length > 0 && (
        <SectionCard icon={MessageSquare} title="Observações Operacionais" wide>
          <div className="flex flex-col gap-2">
            {observacoes.map((t, i) => (
              <div key={t.id || i} className="text-xs">
                <span className="font-medium text-foreground">{t.titulo}: </span>
                <span className="text-muted-foreground">{t.observacoes}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

function SectionCard({ icon: Icon, title, badge, wide, children }) {
  return (
    <div className={`bg-card border border-border rounded-lg p-4 ${wide ? 'lg:col-span-2' : ''}`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon size={16} className="text-primary" />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {badge && <span className="text-xs text-muted-foreground">· {badge}</span>}
      </div>
      {children}
    </div>
  );
}

function Empty({ text }) {
  return <span className="text-xs text-muted-foreground">{text}</span>;
}