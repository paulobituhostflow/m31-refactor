import { useMemo } from 'react';
import { TOKENS as T } from '@/lib/m31DesignTokens';
import { TAREFA_AREA_BY_KEY, TAREFA_AREA_DEFAULT } from '@/lib/m31TarefaAreas';

const EVENT_DATE = new Date('2026-11-21T00:00:00');

function getSemanaLabel(inicio) {
  const fim = new Date(inicio);
  fim.setDate(fim.getDate() + 6);
  const opts = { month: 'short', day: 'numeric' };
  return `${inicio.toLocaleDateString('pt-BR', opts)} – ${fim.toLocaleDateString('pt-BR', opts)}`;
}

function gerarSemanas() {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const semanas = [];
  let cursor = new Date(hoje);
  cursor.setDate(cursor.getDate() - cursor.getDay());

  for (let i = 0; i < 24 && cursor <= EVENT_DATE; i++) {
    semanas.push({
      inicio: new Date(cursor),
      fim: new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 6),
      label: getSemanaLabel(cursor),
    });
    cursor.setDate(cursor.getDate() + 7);
  }
  return semanas;
}

export default function M31TarefasTimeline({ tarefas, onOpenTask }) {
  const semanas = useMemo(() => gerarSemanas(), []);

  const tarefasPorSemana = useMemo(() => {
    const map = {};
    semanas.forEach((_, i) => { map[i] = []; });
    tarefas.forEach(t => {
      if (!t.prazo || t.status === 'concluido') return;
      const d = new Date(t.prazo + 'T12:00:00');
      const idx = semanas.findIndex(s => d >= s.inicio && d <= s.fim);
      if (idx >= 0) map[idx].push(t);
    });
    return map;
  }, [tarefas, semanas]);

  const concluidasPorSemana = useMemo(() => {
    const map = {};
    semanas.forEach((_, i) => { map[i] = []; });
    tarefas.forEach(t => {
      if (!t.prazo || t.status !== 'concluido') return;
      const d = new Date(t.prazo + 'T12:00:00');
      const idx = semanas.findIndex(s => d >= s.inicio && d <= s.fim);
      if (idx >= 0) map[idx].push(t);
    });
    return map;
  }, [tarefas, semanas]);

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontFamily: T.font.body }}>
      {semanas.map((semana, idx) => {
        const tarefasSemana = tarefasPorSemana[idx] || [];
        const concluidasSemana = concluidasPorSemana[idx] || [];
        const totalSemana = tarefasSemana.length + concluidasSemana.length;
        if (totalSemana === 0) return null;

        const atual = hoje >= semana.inicio && hoje <= semana.fim;
        const pct = totalSemana > 0 ? Math.round(concluidasSemana.length / totalSemana * 100) : 0;

        return (
          <div key={idx} style={{
            background: T.surface,
            border: `1px solid ${atual ? T.primary : T.border}`,
            borderRadius: T.radius.lg,
            overflow: 'hidden',
            boxShadow: atual ? `0 0 0 1px ${T.primarySoft}` : 'none',
          }}>
            {/* Cabeçalho da semana */}
            <div style={{
              padding: '14px 20px 10px',
              borderBottom: `1px solid ${T.borderSubtle}`,
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}>
              <span style={{ fontSize: '14px', fontWeight: '600', color: T.text, flex: 1 }}>
                {semana.label}
              </span>
              <span style={{ fontSize: '12px', fontWeight: '500', color: T.textMuted }}>
                {totalSemana} {totalSemana > 1 ? 'pacotes' : 'pacote'}
              </span>
              <span style={{ fontSize: '12px', fontWeight: '600', color: pct === 100 ? T.success : T.textMuted, minWidth: '32px', textAlign: 'right' }}>
                {pct}%
              </span>
            </div>
            {/* Barra de progresso fina */}
            <div style={{ height: '3px', background: T.borderSubtle }}>
              <div style={{
                width: `${pct}%`, height: '100%',
                background: pct === 100 ? T.success : T.primary,
                transition: 'width 0.4s cubic-bezier(0.16,1,0.3,1)',
              }} />
            </div>

            {/* Tarefas */}
            <div>
              {tarefasSemana.map(t => {
                const area = TAREFA_AREA_BY_KEY[t.area] || TAREFA_AREA_BY_KEY[TAREFA_AREA_DEFAULT];
                const atrasada = new Date(t.prazo + 'T12:00:00') < hoje;
                const cor = atrasada ? T.danger : (area?.color || '#9CA3AF');
                return (
                  <div
                    key={t.id}
                    onClick={() => onOpenTask(t)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '11px 20px', cursor: 'pointer',
                      borderTop: `1px solid ${T.borderSubtle}`,
                      transition: `background ${T.transition.atomic}`,
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = T.surfaceHover}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: cor, flexShrink: 0, boxShadow: `0 0 0 3px ${cor}1A` }} />
                    <span style={{ fontSize: '14px', color: T.text, flex: 1, fontWeight: '400' }}>{t.titulo}</span>
                    {t.responsavel_nome && (
                      <span style={{ fontSize: '12px', color: T.textMuted, fontWeight: '500', flexShrink: 0 }}>
                        {t.responsavel_nome.split(' ')[0]}
                      </span>
                    )}
                  </div>
                );
              })}
              {concluidasSemana.map(t => {
                const area = TAREFA_AREA_BY_KEY[t.area] || TAREFA_AREA_BY_KEY[TAREFA_AREA_DEFAULT];
                const cor = area?.color || T.success;
                return (
                  <div
                    key={t.id}
                    onClick={() => onOpenTask(t)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '11px 20px', cursor: 'pointer', opacity: 0.55,
                      borderTop: `1px solid ${T.borderSubtle}`,
                      transition: `background ${T.transition.atomic}`,
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = T.surfaceHover}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: T.success, flexShrink: 0 }} />
                    <span style={{ fontSize: '14px', color: T.textMuted, flex: 1, textDecoration: 'line-through' }}>{t.titulo}</span>
                    <span style={{ fontSize: '12px', color: T.success, fontWeight: '600' }}>✓</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}