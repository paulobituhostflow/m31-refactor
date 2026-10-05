import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Check, X, Mail, Globe, Clock, UserPlus } from 'lucide-react';

const PERFIS = [
  { value: 'voluntario', label: 'Voluntária' },
  { value: 'checkin', label: 'Check-in' },
  { value: 'coordenador', label: 'Coordenador' },
  { value: 'coordenadora_geral', label: 'Coord. Geral' },
  { value: 'gestora_inscricoes', label: 'Gestora de Inscrições' },
  { value: 'coordenacao_participantes', label: 'Coord. Participantes' },
  { value: 'gestao_operacional', label: 'Gestão Operacional' },
  { value: 'lider_setor', label: 'Líder de Setor' },
  { value: 'super_admin', label: 'Super Admin' },
];

const STATUS_CONFIG = {
  pendente: { label: 'Pendente', color: '#D97706', bg: '#FEF3C7' },
  aprovado: { label: 'Aprovado', color: '#059669', bg: '#D1FAE5' },
  negado: { label: 'Negado', color: '#DC2626', bg: '#FEE2E2' },
};

function formatData(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const offset = -3 * 60;
  const local = new Date(d.getTime() + offset * 60 * 1000);
  return local.toISOString().replace('T', ' ').slice(0, 19) + ' (Recife)';
}

export default function M31SolicitacoesAcesso({ user }) {
  const queryClient = useQueryClient();
  const [perfis, setPerfis] = useState({});
  const [processando, setProcessando] = useState(null);

  const { data: solicitacoes = [], isLoading } = useQuery({
    queryKey: ['m31_solicitacoes_acesso'],
    queryFn: () => base44.entities.M31SolicitacaoAcesso.list('-data_solicitacao', 100),
    refetchInterval: 30000,
  });

  const ordenadas = useMemo(() => {
    const peso = { pendente: 0, aprovado: 1, negado: 2 };
    return [...solicitacoes].sort((a, b) => {
      const pa = peso[a.status] ?? 3;
      const pb = peso[b.status] ?? 3;
      if (pa !== pb) return pa - pb;
      return new Date(b.data_solicitacao) - new Date(a.data_solicitacao);
    });
  }, [solicitacoes]);

  const stats = useMemo(() => ({
    pendente: solicitacoes.filter(s => s.status === 'pendente').length,
    aprovado: solicitacoes.filter(s => s.status === 'aprovado').length,
    negado: solicitacoes.filter(s => s.status === 'negado').length,
  }), [solicitacoes]);

  const handleAprovar = async (id) => {
    const perfil = perfis[id] || 'voluntario';
    setProcessando(id);
    try {
      await base44.functions.invoke('m31AprovarSolicitacao', { solicitacao_id: id, perfil });
      queryClient.invalidateQueries(['m31_solicitacoes_acesso']);
    } catch (err) {
      console.error('Erro ao aprovar:', err);
    } finally {
      setProcessando(null);
    }
  };

  const handleNegar = async (id) => {
    setProcessando(id);
    try {
      await base44.functions.invoke('m31NegarSolicitacao', { solicitacao_id: id });
      queryClient.invalidateQueries(['m31_solicitacoes_acesso']);
    } catch (err) {
      console.error('Erro ao negar:', err);
    } finally {
      setProcessando(null);
    }
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
        <div style={{ width: '24px', height: '24px', border: '2px solid #E5E7EB', borderTopColor: '#8B1A2B', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', color: '#1F2937' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '18px', fontWeight: '700', margin: '0 0 4px' }}>Solicitações de Acesso</h1>
        <p style={{ fontSize: '12px', color: '#6B7280', margin: 0 }}>Aprove ou negue acessos solicitados automaticamente</p>

        <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
          <StatCard label="Pendentes" value={stats.pendente} color="#D97706" bg="#FEF3C7" />
          <StatCard label="Aprovadas" value={stats.aprovado} color="#059669" bg="#D1FAE5" />
          <StatCard label="Negadas" value={stats.negado} color="#DC2626" bg="#FEE2E2" />
        </div>
      </div>

      {ordenadas.length === 0 ? (
        <div style={{ padding: '48px', textAlign: 'center', color: '#6B7280', fontSize: '14px', background: '#fff', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
          Nenhuma solicitação de acesso registrada.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {ordenadas.map((s) => {
            const st = STATUS_CONFIG[s.status] || STATUS_CONFIG.pendente;
            const isPendente = s.status === 'pendente';
            return (
              <div key={s.id} style={{
                background: '#fff',
                border: `1px solid ${isPendente ? '#FDE68A' : '#E5E7EB'}`,
                borderRadius: '10px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: '600', color: '#1F2937' }}>{s.nome}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                      <Mail size={12} color="#6B7280" />
                      <span style={{ fontSize: '12px', color: '#6B7280' }}>{s.email}</span>
                    </div>
                  </div>
                  <span style={{
                    fontSize: '11px', fontWeight: '700', padding: '4px 10px',
                    borderRadius: '100px', background: st.bg, color: st.color,
                  }}>
                    {st.label}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  <Detail icon={Globe} label="Provedor" value={s.provedor_login === 'google' ? 'Google' : s.provedor_login === 'email' ? 'E-mail' : '—'} />
                  <Detail icon={Clock} label="Data/Hora" value={formatData(s.data_solicitacao)} />
                  {s.ip && <Detail icon={Globe} label="IP" value={s.ip} />}
                  {s.processado_por && <Detail icon={Check} label="Processado por" value={s.processado_por} />}
                </div>

                {isPendente ? (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid #F3F4F6', paddingTop: '12px' }}>
                    <select
                      value={perfis[s.id] || 'voluntario'}
                      onChange={(e) => setPerfis(prev => ({ ...prev, [s.id]: e.target.value }))}
                      style={{
                        padding: '8px 12px', border: '1px solid #E5E7EB', borderRadius: '8px',
                        fontSize: '13px', color: '#1F2937', background: '#fff', outline: 'none',
                      }}
                    >
                      {PERFIS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                    <button
                      onClick={() => handleAprovar(s.id)}
                      disabled={processando === s.id}
                      style={{
                        padding: '8px 16px', background: '#059669', color: '#fff',
                        border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                        opacity: processando === s.id ? 0.6 : 1,
                      }}
                    >
                      <Check size={14} /> Aprovar acesso
                    </button>
                    <button
                      onClick={() => handleNegar(s.id)}
                      disabled={processando === s.id}
                      style={{
                        padding: '8px 16px', background: '#fff', color: '#DC2626',
                        border: '1px solid #FECACA', borderRadius: '8px', fontSize: '13px', fontWeight: '600',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                      }}
                    >
                      <X size={14} /> Negar
                    </button>
                    <button
                      onClick={() => { window.location.href = '/m31-admin?tab=equipe'; }}
                      style={{
                        padding: '8px 16px', background: '#fff', color: '#6B7280',
                        border: '1px solid #E5E7EB', borderRadius: '8px', fontSize: '13px', fontWeight: '600',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                      }}
                    >
                      <UserPlus size={14} /> Cadastrar membro
                    </button>
                  </div>
                ) : (
                  s.perfil_atribuido && (
                    <div style={{ fontSize: '12px', color: '#6B7280', borderTop: '1px solid #F3F4F6', paddingTop: '8px' }}>
                      Perfil atribuído: <strong>{s.perfil_atribuido}</strong>
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color, bg }) {
  return (
    <div style={{ background: bg, borderRadius: '8px', padding: '10px 16px', flex: '1 1 0', minWidth: '100px' }}>
      <div style={{ fontSize: '20px', fontWeight: '700', color }}>{value}</div>
      <div style={{ fontSize: '11px', color, fontWeight: '500' }}>{label}</div>
    </div>
  );
}

function Detail({ icon: Icon, label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <Icon size={12} color="#9CA3AF" />
      <span style={{ fontSize: '11px', color: '#9CA3AF' }}>{label}:</span>
      <span style={{ fontSize: '11px', color: '#4B5563', fontWeight: '500' }}>{value}</span>
    </div>
  );
}