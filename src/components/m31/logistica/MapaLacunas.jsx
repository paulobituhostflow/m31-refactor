import { useMemo } from 'react';
import {
  AlertTriangle, UserX, CalendarX,
  MapPinOff, CheckCircle2,
} from 'lucide-react';
import { resolverAreaSlug, isCritica } from '@/lib/m31OperacaoCalculos';

/**
 * Painel de Lacunas — cruza o mapa com M31Area e lista o que falta cadastrar.
 * Usa a hierarquia unificada (M31Area) e a biblioteca compartilhada de cálculos.
 */
export default function MapaLacunas({ tarefas = [], areas = [] }) {
  const areaIdToSlug = useMemo(() => {
    const m = new Map();
    areas.forEach(a => m.set(a.id, a.slug));
    return m;
  }, [areas]);

  const lacunas = useMemo(() => {
    const now = new Date();
    const areaMap = {};
    areas.forEach(a => {
      areaMap[a.slug] = { slug: a.slug, nome: a.nome, tarefas: 0, semResp: 0, semPrazo: 0, criticas: 0 };
    });

    const areasNaoMapeadas = new Set();
    tarefas.forEach(t => {
      const slug = resolverAreaSlug(t, areaIdToSlug);
      if (!slug || !areaMap[slug]) {
        const fallback = slug || '_sem_area';
        if (!areaMap[fallback]) areaMap[fallback] = { slug: fallback, nome: slug || 'Sem área', tarefas: 0, semResp: 0, semPrazo: 0, criticas: 0 };
        areasNaoMapeadas.add(t.area || t.area_id || 'sem_area');
        areaMap[fallback].tarefas++;
        if (!t.responsavel_nome && !t.responsavel_email) areaMap[fallback].semResp++;
        if (!t.prazo) areaMap[fallback].semPrazo++;
        if (isCritica(t, now)) areaMap[fallback].criticas++;
        return;
      }
      areaMap[slug].tarefas++;
      if (!t.responsavel_nome && !t.responsavel_email) areaMap[slug].semResp++;
      if (!t.prazo) areaMap[slug].semPrazo++;
      if (isCritica(t, now)) areaMap[slug].criticas++;
    });

    const allAreas = Object.values(areaMap);

    return {
      areasVazias: allAreas.filter(a => a.tarefas === 0 && areas.some(x => x.slug === a.slug)),
      tarefasSemResponsavel: tarefas.filter(t => !t.responsavel_nome && !t.responsavel_email),
      tarefasSemPrazo: tarefas.filter(t => !t.prazo),
      areasComCriticas: allAreas.filter(a => a.criticas > 0),
      areasNaoMapeadas: [...areasNaoMapeadas].filter(s => s !== 'sem_area'),
    };
  }, [tarefas, areas, areaIdToSlug]);

  const totalGaps =
    lacunas.areasVazias.length +
    lacunas.tarefasSemResponsavel.length +
    lacunas.tarefasSemPrazo.length +
    lacunas.areasComCriticas.length +
    lacunas.areasNaoMapeadas.length;

  const hasGaps = totalGaps > 0;

  const GAP_ITEMS = [
    {
      condition: lacunas.areasVazias.length > 0,
      icon: MapPinOff,
      title: 'Áreas sem tarefas',
      detail: lacunas.areasVazias.map(a => a.nome).join(', '),
      count: lacunas.areasVazias.length,
      tone: 'warning',
    },
    {
      condition: lacunas.tarefasSemResponsavel.length > 0,
      icon: UserX,
      title: 'Tarefas sem responsável',
      detail: lacunas.tarefasSemResponsavel.slice(0, 5).map(t => t.titulo).join(', '),
      count: lacunas.tarefasSemResponsavel.length,
      tone: 'warning',
    },
    {
      condition: lacunas.tarefasSemPrazo.length > 0,
      icon: CalendarX,
      title: 'Tarefas sem prazo definido',
      detail: lacunas.tarefasSemPrazo.slice(0, 5).map(t => t.titulo).join(', '),
      count: lacunas.tarefasSemPrazo.length,
      tone: 'warning',
    },
    {
      condition: lacunas.areasComCriticas.length > 0,
      icon: AlertTriangle,
      title: 'Áreas com tarefas críticas',
      detail: lacunas.areasComCriticas.map(a => `${a.nome} (${a.criticas})`).join(', '),
      count: lacunas.areasComCriticas.length,
      tone: 'danger',
    },
    {
      condition: lacunas.areasNaoMapeadas.length > 0,
      icon: AlertTriangle,
      title: 'Tarefas com área não mapeada',
      detail: lacunas.areasNaoMapeadas.join(', '),
      count: lacunas.areasNaoMapeadas.length,
      tone: 'danger',
    },
  ].filter(g => g.condition);

  const toneStyles = {
    danger: 'border-m31-danger/30 bg-m31-danger/5',
    warning: 'border-m31-warning/30 bg-m31-warning/5',
  };
  const toneText = {
    danger: 'text-m31-danger',
    warning: 'text-m31-warning',
  };

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className={hasGaps ? 'text-m31-warning' : 'text-m31-success'} />
          <h3 className="text-sm font-semibold text-foreground">Lacunas de Cadastro</h3>
        </div>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
          hasGaps ? 'bg-m31-warning/10 text-m31-warning' : 'bg-m31-success/10 text-m31-success'
        }`}>
          {hasGaps ? `${totalGaps} pendência${totalGaps > 1 ? 's' : ''}` : 'Tudo cadastrado'}
        </span>
      </div>

      <div className="p-4">
        {!hasGaps ? (
          <div className="flex items-center gap-2 text-sm text-m31-success py-2">
            <CheckCircle2 size={16} /> Todas as áreas estão com dados cadastrados. Nenhuma lacuna detectada.
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {GAP_ITEMS.map((gap, i) => {
              const Icon = gap.icon;
              return (
                <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${toneStyles[gap.tone]}`}>
                  <Icon size={16} className={`${toneText[gap.tone]} flex-shrink-0 mt-0.5`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-foreground">{gap.title}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-card ${toneText[gap.tone]}`}>
                        {gap.count}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">{gap.detail}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}