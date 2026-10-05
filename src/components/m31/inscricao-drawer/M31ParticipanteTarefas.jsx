/**
 * M31ParticipanteTarefas — Aba de Tarefas relacionadas à participante.
 * Busca tarefas onde a participante é responsável ou membro (por email).
 */
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { formatDateTimeBR } from '@/lib/dateUtils';
import { CheckCircle2, Clock, AlertCircle, Circle } from 'lucide-react';

const C = {
  text: '#2d2d2d', textSec: '#6b7280', textTer: '#9ca3af',
  border: 'rgba(0,0,0,0.08)', bg1: '#f8f8f9',
  brand: '#8B1A2B', success: '#10b981', warning: '#f59e0b', danger: '#ef4444', info: '#3b82f6',
};

const STATUS_CFG = {
  concluido: { label: 'Concluído', color: C.success, icon: CheckCircle2 },
  em_andamento: { label: 'Em andamento', color: C.info, icon: Clock },
  a_fazer: { label: 'A fazer', color: C.textTer, icon: Circle },
  critico: { label: 'Crítico', color: C.danger, icon: AlertCircle },
  atrasado: { label: 'Atrasado', color: C.danger, icon: AlertCircle },
  em_execucao: { label: 'Em execução', color: C.info, icon: Clock },
  atencao: { label: 'Atenção', color: C.warning, icon: AlertCircle },
  bloqueado: { label: 'Bloqueado', color: C.danger, icon: AlertCircle },
};

function diasRestantes(prazo) {
  if (!prazo) return null;
  const diff = Math.ceil((new Date(prazo + 'T12:00:00') - new Date()) / 86400000);
  if (diff < 0) return { text: 'Vencido', color: C.danger };
  if (diff === 0) return { text: 'Hoje', color: C.warning };
  if (diff <= 3) return { text: `${diff}d`, color: C.warning };
  return { text: `${diff}d`, color: C.textSec };
}

export default function M31ParticipanteTarefas({ email }) {
  const { data: tarefas = [], isLoading } = useQuery({
    queryKey: ['participante-tarefas', email],
    queryFn: async () => {
      const all = await base44.entities.EventoM31Tarefa.list('-updated_date', 200);
      return all.filter(t =>
        t.responsavel_email === email ||
        (Array.isArray(t.membros_emails) && t.membros_emails.includes(email))
      );
    },
    enabled: !!email,
  });

  if (isLoading) {
    return (
      <div style={{ padding: '32px', textAlign: 'center' }}>
        <div style={{ width: '24px', height: '24px', border: `2px solid ${C.border}`, borderTopColor: C.brand, borderRadius: '50%', animation: 'spin .8s linear infinite', display: 'inline-block' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (tarefas.length === 0) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: C.textTer, fontSize: '13px' }}>
        <div style={{ fontSize: '28px', marginBottom: '6px' }}>📋</div>
        Nenhuma tarefa vinculada a esta participante.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ fontSize: '11px', fontWeight: '600', color: C.textSec, textTransform: 'uppercase', marginBottom: '4px' }}>
        {tarefas.length} tarefa{tarefas.length !== 1 ? 's' : ''} vinculada{tarefas.length !== 1 ? 's' : ''}
      </div>
      {tarefas.map(t => {
        const cfg = STATUS_CFG[t.status] || STATUS_CFG.a_fazer;
        const Icon = cfg.icon;
        const prazo = diasRestantes(t.prazo);
        return (
          <div key={t.id} style={{
            padding: '10px 12px', background: C.bg1, borderRadius: '8px',
            borderLeft: `3px solid ${cfg.color}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <Icon size={14} color={cfg.color} style={{ flexShrink: 0, marginTop: '1px' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: C.text, marginBottom: '2px' }}>
                  {t.titulo}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '10px', color: C.textSec }}>{t.area}</span>
                  <span style={{ fontSize: '10px', color: cfg.color, fontWeight: '600' }}>{cfg.label}</span>
                  {prazo && (
                    <span style={{ fontSize: '10px', color: prazo.color, fontWeight: '600' }}>
                      {t.prazo ? `Prazo: ${formatDateTimeBR(t.prazo).split(' ')[0]}` : ''} ({prazo.text})
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}