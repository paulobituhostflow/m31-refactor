import { useState } from 'react';
import {
  Layers, ChevronDown, AlertTriangle, User,
  ArrowRight, RefreshCw,
} from 'lucide-react';
import { AREA_COLORS } from '@/lib/m31Areas';

const STATUS_CONCLUIDO = ['concluido'];

function healthLevel(area) {
  if (area.criticas.length >= 3) return 'danger';
  if (area.criticas.length >= 1) return 'warning';
  if (area.totalTarefas > 0 && area.progresso.pct === 100) return 'success';
  return 'neutral';
}

const HEALTH_DOT = {
  danger: 'bg-m31-danger',
  warning: 'bg-m31-warning',
  success: 'bg-m31-success',
  neutral: 'bg-muted-foreground/30',
};

/**
 * Mapa da Operação — Centro de Operações (somente leitura).
 * Fonte única: EventoM31Tarefa agregada por M31Area → M31Frente.
 * Não duplica status, checklist, responsável ou prazo.
 */
export default function MapaOperacao({ areasData = [], totals, processandoPendente = false, onRefresh, isFetching }) {
  const [expandedArea, setExpandedArea] = useState(null);

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers size={16} className="text-primary" />
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Mapa da Operação</h2>
          {processandoPendente && (
            <span className="flex items-center gap-1 text-[10px] font-semibold text-m31-warning bg-m31-warning/10 px-2 py-0.5 rounded-full">
              <RefreshCw size={10} className="animate-spin" /> Dados sincronizando
            </span>
          )}
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-muted transition-colors"
          >
            <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} /> Atualizar
          </button>
        )}
      </div>

      {/* Root node — Evento */}
      <div className="flex justify-center">
        <div className="bg-primary text-primary-foreground rounded-xl px-6 py-3.5 shadow-md text-center min-w-[220px]">
          <div className="text-sm font-bold tracking-wide">M31 FILHAS 2026</div>
          <div className="flex items-center justify-center gap-3 mt-1.5 text-xs opacity-90">
            <span>{totals.tarefas} tarefas</span>
            <span className="opacity-50">·</span>
            <span>{totals.checklist} checklist</span>
            <span className="opacity-50">·</span>
            <span>{totals.fornecedores} fornec.</span>
          </div>
          {/* Progress bar global */}
          <div className="mt-2 h-1.5 bg-primary-foreground/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-foreground rounded-full transition-all"
              style={{ width: `${totals.progresso}%` }}
            />
          </div>
          {/* Próxima ação global */}
          {totals.proximaAcao && (
            <div className="mt-2 text-xs opacity-80 flex items-center justify-center gap-1">
              <ArrowRight size={10} /> Próxima: <span className="font-medium truncate max-w-[180px]">{totals.proximaAcao.titulo}</span>
            </div>
          )}
        </div>
      </div>

      {/* Connector */}
      <div className="w-px h-5 bg-border mx-auto" />

      {/* Area nodes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {areasData.map(areaData => {
          const isExpanded = expandedArea === areaData.area.id;
          const health = healthLevel(areaData);
          const progress = areaData.progresso.pct;
          const areaSlug = areaData.area.slug;
          const colorMeta = AREA_COLORS[areaSlug] || { solid: '#6B7280' };
          const Icon = Layers; // fallback genérico; o ícone real vem de M31Area.icone

          return (
            <div
              key={areaData.area.id}
              className={[
                'bg-card border rounded-lg overflow-hidden transition-all shadow-sm hover:shadow-md',
                isExpanded ? 'border-primary/40 ring-1 ring-primary/10' : 'border-border',
              ].join(' ')}
            >
              {/* Area header (clickable) */}
              <button
                onClick={() => setExpandedArea(isExpanded ? null : areaData.area.id)}
                className="w-full flex items-center gap-2.5 p-3 text-left"
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: colorMeta.soft || `${colorMeta.solid}14` }}
                >
                  <Icon size={15} style={{ color: colorMeta.solid }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${HEALTH_DOT[health]}`} />
                    <span className="text-xs font-semibold text-foreground truncate">{areaData.area.nome}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {areaData.totalTarefas === 0
                      ? <span className="text-m31-warning">Sem tarefas</span>
                      : <>{areaData.totalTarefas} tarefas · {areaData.progresso.done} concluídas{areaData.criticas.length > 0 && ` · ${areaData.criticas.length} críticas`}</>
                    }
                  </div>
                </div>
                <ChevronDown
                  size={14}
                  className="text-muted-foreground flex-shrink-0 transition-transform"
                  style={{ transform: isExpanded ? 'rotate(180deg)' : 'none' }}
                />
              </button>

              {/* Progress bar */}
              <div className="h-1 bg-muted mx-3 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${progress}%`, background: colorMeta.solid }}
                />
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="p-3 pt-2.5 flex flex-col gap-3 animate-in fade-in duration-200">
                  {/* Próxima ação da área */}
                  {areaData.proximaAcao && (
                    <div className="flex items-start gap-1.5 text-xs bg-primary/5 rounded-md px-2 py-1.5">
                      <ArrowRight size={11} className="text-primary flex-shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="font-medium text-primary truncate">{areaData.proximaAcao.titulo}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {areaData.proximaAcao.responsavel_nome || 'Sem responsável'}
                          {areaData.proximaAcao.prazo && ` · ${new Date(areaData.proximaAcao.prazo + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Frentes */}
                  {areaData.frentes.map((frenteData, i) => {
                    const f = frenteData.frente;
                    return (
                      <div key={f.id || i} className="border-l-2 border-border pl-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold text-foreground truncate">{f.nome}</span>
                          <span className="text-[10px] text-muted-foreground flex-shrink-0">{frenteData.progresso.pct}%</span>
                        </div>
                        {/* Mini progress bar da frente */}
                        <div className="mt-1 h-0.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${frenteData.progresso.pct}%`, background: colorMeta.solid }} />
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1">
                          {frenteData.tarefas.length} tar. · {frenteData.criticas.length} crít.
                        </div>

                        {/* Tarefas críticas da frente */}
                        {frenteData.criticas.length > 0 && (
                          <div className="mt-1.5 flex flex-col gap-0.5">
                            {frenteData.criticas.slice(0, 3).map((t, j) => (
                              <div key={t.id || j} className="flex items-start gap-1 text-[11px]">
                                <span className="text-m31-danger flex-shrink-0">•</span>
                                <span className="text-foreground truncate">{t.titulo}</span>
                              </div>
                            ))}
                            {frenteData.criticas.length > 3 && (
                              <span className="text-[10px] text-muted-foreground">+ {frenteData.criticas.length - 3} críticas</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Responsáveis */}
                  {areaData.totalTarefas > 0 && (() => {
                    const respMap = new Map();
                    areaData.frentes.forEach(fd => fd.tarefas.forEach(t => {
                      const r = t.responsavel_nome || '—';
                      respMap.set(r, (respMap.get(r) || 0) + 1);
                    }));
                    if (respMap.size === 0) return null;
                    return (
                      <div>
                        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
                          <User size={10} /> Responsáveis
                        </div>
                        <div className="flex flex-col gap-0.5">
                          {[...respMap.entries()].slice(0, 4).map(([nome, count]) => (
                            <div key={nome} className="flex items-center justify-between text-xs">
                              <span className="text-foreground truncate">{nome}</span>
                              <span className="text-muted-foreground flex-shrink-0">{count} tar.</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Sem responsável */}
                  {areaData.frentes.some(fd => fd.tarefas.some(t => !t.responsavel_nome)) && (() => {
                    const semResp = areaData.frentes.reduce((acc, fd) => acc + fd.tarefas.filter(t => !t.responsavel_nome).length, 0);
                    return (
                      <div className="flex items-center gap-1.5 text-xs text-m31-warning bg-m31-warning/5 rounded-md px-2 py-1.5">
                        <AlertTriangle size={11} /> {semResp} tarefa(s) sem responsável
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {areasData.length === 0 && (
        <div className="p-12 text-center text-sm text-muted-foreground bg-card border border-border rounded-lg">
          <Layers size={32} className="mx-auto mb-2 text-muted-foreground/30" />
          Nenhuma área com dados operacionais ainda.
        </div>
      )}
    </div>
  );
}