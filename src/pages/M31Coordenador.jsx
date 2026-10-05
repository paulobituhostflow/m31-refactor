import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, AlertTriangle, Calendar, ChevronDown, ChevronUp, Send, Check } from 'lucide-react';

const STATUS_CONFIG = {
  critico:    { label: '🔴 Crítico',      color: '#F87171', bg: 'rgba(248,113,113,0.12)' },
  atrasado:   { label: '🟠 Atrasado',     color: '#FB923C', bg: 'rgba(251,146,60,0.12)' },
  atencao:    { label: '🟡 Atenção',      color: '#FBBF24', bg: 'rgba(251,191,36,0.12)' },
  em_execucao:{ label: '🔵 Em execução',  color: '#60A5FA', bg: 'rgba(96,165,250,0.12)' },
  concluido:  { label: '🟢 Concluído',    color: '#34D399', bg: 'rgba(52,211,153,0.12)' },
  a_fazer:    { label: '⚪ A Fazer',      color: '#9CA3AF', bg: 'rgba(156,163,175,0.10)' },
  em_andamento:{ label: '🔵 Em execução', color: '#60A5FA', bg: 'rgba(96,165,250,0.12)' },
  bloqueado:  { label: '🔴 Crítico',      color: '#F87171', bg: 'rgba(248,113,113,0.12)' },
};

const STATUS_OPTIONS = [
  { value: 'a_fazer',     label: '⚪ A Fazer' },
  { value: 'em_execucao', label: '🔵 Em execução' },
  { value: 'atencao',     label: '🟡 Atenção' },
  { value: 'atrasado',    label: '🟠 Atrasado' },
  { value: 'critico',     label: '🔴 Crítico' },
  { value: 'concluido',   label: '🟢 Concluído' },
];

const AREA_LABELS = {
  logistica: '🚛 Logística', comunicacao: '📸 Comunicação',
  voluntarios: '🙌 Voluntários', financeiro: '💰 Financeiro',
  checkin: '✅ Check-in', recepcao: '🤵 Recepção',
  oracao: '🙏 Oração', geral: '🗂️ Geral',
};

function TarefaCard({ tarefa, onUpdate, userName }) {
  const [expanded, setExpanded] = useState(false);
  const [obs, setObs] = useState(tarefa.observacoes || '');
  const [obsConc, setObsConc] = useState('');
  const [showConcluirModal, setShowConcluirModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const st = STATUS_CONFIG[tarefa.status] || STATUS_CONFIG.a_fazer;
  const vencida = tarefa.prazo && new Date(tarefa.prazo + 'T12:00') < new Date() && tarefa.status !== 'concluido';
  const concluida = tarefa.status === 'concluido';
  const checkDone = tarefa.checklist?.filter(i => i.concluido).length || 0;
  const checkTotal = tarefa.checklist?.length || 0;

  const handleStatusChange = (novoStatus) => {
    if (novoStatus === 'concluido') { setShowConcluirModal(true); return; }
    setSaving(true);
    onUpdate(tarefa.id, { status: novoStatus }).finally(() => setSaving(false));
  };

  const handleConcluir = () => {
    if (!obsConc.trim()) return;
    setSaving(true);
    onUpdate(tarefa.id, {
      status: 'concluido',
      observacao_conclusao: obsConc,
      concluido_por_nome: userName,
      concluido_em: new Date().toISOString(),
      observacoes: obs,
    }).then(() => { setShowConcluirModal(false); setSaving(false); });
  };

  const handleSaveObs = () => {
    setSaving(true);
    onUpdate(tarefa.id, { observacoes: obs }).finally(() => setSaving(false));
  };

  const toggleCheckItem = (id) => {
    const novoCl = tarefa.checklist.map(i => i.id === id ? { ...i, concluido: !i.concluido } : i);
    onUpdate(tarefa.id, { checklist: novoCl });
  };

  return (
    <>
      <div style={{
        backgroundColor: '#221318', border: `1px solid ${concluida ? 'rgba(52,211,153,0.20)' : 'rgba(255,255,255,0.08)'}`,
        borderLeft: `4px solid ${st.color}`, borderRadius: '10px', overflow: 'hidden',
        opacity: concluida ? 0.7 : 1,
      }}>
        {/* Header da tarefa */}
        <div style={{ padding: '14px 14px 10px', cursor: 'pointer' }} onClick={() => setExpanded(!expanded)}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', fontWeight: '600', color: '#F0E8EA', lineHeight: '1.4', flex: 1 }}>
              {tarefa.titulo}
            </span>
            {expanded ? <ChevronUp size={16} color="rgba(240,232,234,0.4)" /> : <ChevronDown size={16} color="rgba(240,232,234,0.4)" />}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
            <span style={{ backgroundColor: st.bg, color: st.color, borderRadius: '5px', padding: '2px 8px', fontSize: '11px', fontWeight: '600' }}>{st.label}</span>
            {tarefa.area && <span style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(240,232,234,0.55)', borderRadius: '5px', padding: '2px 8px', fontSize: '11px' }}>{AREA_LABELS[tarefa.area] || tarefa.area}</span>}
            {tarefa.prazo && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: vencida ? '#F87171' : 'rgba(240,232,234,0.38)', fontSize: '12px' }}>
                {vencida && <AlertTriangle size={11} />}
                <Calendar size={11} />
                {new Date(tarefa.prazo + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
              </span>
            )}
          </div>

          {checkTotal > 0 && (
            <div style={{ marginTop: '8px' }}>
              <div style={{ width: '100%', height: '3px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '2px' }}>
                <div style={{ width: `${Math.round(checkDone / checkTotal * 100)}%`, height: '3px', borderRadius: '2px', backgroundColor: '#C4556A' }} />
              </div>
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '11px', color: 'rgba(240,232,234,0.38)' }}>{checkDone}/{checkTotal} itens</span>
            </div>
          )}
        </div>

        {/* Expanded */}
        {expanded && (
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '14px' }}>
            {tarefa.descricao && (
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', color: 'rgba(240,232,234,0.65)', lineHeight: '1.6', marginBottom: '14px' }}>{tarefa.descricao}</p>
            )}

            {/* Checklist */}
            {tarefa.checklist?.length > 0 && (
              <div style={{ marginBottom: '14px' }}>
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '11px', fontWeight: '700', color: 'rgba(240,232,234,0.38)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Checklist</p>
                {tarefa.checklist.map(item => (
                  <div key={item.id} onClick={() => toggleCheckItem(item.id)} style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer',
                  }}>
                    <div style={{
                      width: '20px', height: '20px', borderRadius: '5px', flexShrink: 0,
                      backgroundColor: item.concluido ? '#34D399' : 'transparent',
                      border: `2px solid ${item.concluido ? '#34D399' : 'rgba(255,255,255,0.25)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {item.concluido && <Check size={12} color="#0d0307" strokeWidth={3} />}
                    </div>
                    <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', color: item.concluido ? 'rgba(240,232,234,0.35)' : '#F0E8EA', textDecoration: item.concluido ? 'line-through' : 'none', flex: 1 }}>
                      {item.texto}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Observações */}
            <div style={{ marginBottom: '14px' }}>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '11px', fontWeight: '700', color: 'rgba(240,232,234,0.38)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Observações</p>
              <textarea value={obs} onChange={e => setObs(e.target.value)}
                placeholder="Adicione uma observação..."
                style={{
                  width: '100%', backgroundColor: '#1A0E12', border: '1px solid rgba(255,255,255,0.10)',
                  borderRadius: '7px', padding: '10px 12px', color: '#F0E8EA', fontSize: '13px',
                  fontFamily: 'Inter, sans-serif', resize: 'vertical', minHeight: '70px', outline: 'none', boxSizing: 'border-box',
                }} />
              <button onClick={handleSaveObs} disabled={saving} style={{
                marginTop: '6px', display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 14px',
                backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: '6px', color: 'rgba(240,232,234,0.65)', fontSize: '12px', fontFamily: 'Inter, sans-serif', cursor: 'pointer',
              }}>
                <Send size={12} /> Salvar observação
              </button>
            </div>

            {/* Mudar status */}
            {!concluida && (
              <div>
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '11px', fontWeight: '700', color: 'rgba(240,232,234,0.38)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Atualizar Status</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {STATUS_OPTIONS.filter(s => s.value !== tarefa.status).map(s => {
                    const sc = STATUS_CONFIG[s.value];
                    return (
                      <button key={s.value} onClick={() => handleStatusChange(s.value)} style={{
                        padding: '7px 14px', backgroundColor: sc.bg, border: `1px solid ${sc.color}30`,
                        borderRadius: '7px', color: sc.color, fontSize: '12px', fontFamily: 'Inter, sans-serif',
                        fontWeight: '600', cursor: 'pointer',
                      }}>{s.label}</button>
                    );
                  })}
                </div>
              </div>
            )}

            {concluida && tarefa.observacao_conclusao && (
              <div style={{ backgroundColor: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.20)', borderRadius: '7px', padding: '10px 12px' }}>
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '11px', fontWeight: '700', color: '#34D399', marginBottom: '4px' }}>✓ Observação de conclusão</p>
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', color: 'rgba(240,232,234,0.65)' }}>{tarefa.observacao_conclusao}</p>
                {tarefa.concluido_por_nome && <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '11px', color: 'rgba(240,232,234,0.38)', marginTop: '4px' }}>por {tarefa.concluido_por_nome}</p>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal concluir */}
      {showConcluirModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.80)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '16px' }}>
          <div style={{ backgroundColor: '#221318', border: '1px solid rgba(52,211,153,0.25)', borderRadius: '16px 16px 12px 12px', width: '100%', maxWidth: '480px', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <CheckCircle size={22} color="#34D399" />
              <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: '700', fontSize: '16px', color: '#F0E8EA' }}>Concluir tarefa</span>
            </div>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', color: 'rgba(240,232,234,0.65)', marginBottom: '12px' }}>
              Descreva brevemente o que foi feito (obrigatório):
            </p>
            <textarea value={obsConc} onChange={e => setObsConc(e.target.value)}
              placeholder="Ex: Equipe definida, contatos confirmados, materiais separados..."
              style={{
                width: '100%', backgroundColor: '#1A0E12', border: `1px solid ${obsConc ? 'rgba(52,211,153,0.35)' : 'rgba(255,255,255,0.12)'}`,
                borderRadius: '8px', padding: '12px', color: '#F0E8EA', fontSize: '14px',
                fontFamily: 'Inter, sans-serif', resize: 'none', minHeight: '90px', outline: 'none', boxSizing: 'border-box',
              }} />
            <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
              <button onClick={() => setShowConcluirModal(false)} style={{
                flex: 1, padding: '12px', backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '8px', color: 'rgba(240,232,234,0.55)', fontSize: '14px', fontFamily: 'Inter, sans-serif', cursor: 'pointer',
              }}>Cancelar</button>
              <button onClick={handleConcluir} disabled={!obsConc.trim() || saving} style={{
                flex: 2, padding: '12px', backgroundColor: obsConc.trim() ? '#16a34a' : 'rgba(52,211,153,0.20)',
                border: 'none', borderRadius: '8px', color: obsConc.trim() ? '#fff' : '#34D399',
                fontSize: '14px', fontFamily: 'Inter, sans-serif', fontWeight: '700', cursor: obsConc.trim() ? 'pointer' : 'not-allowed',
              }}>
                {saving ? 'Salvando...' : '✓ Confirmar conclusão'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function M31Coordenador() {
  const urlParams = new URLSearchParams(window.location.search);
  const emailParam = urlParams.get('email') || '';
  const qc = useQueryClient();
  const [filtroStatus, setFiltroStatus] = useState('');
  const [userName, setUserName] = useState('');

  const { data: membro } = useQuery({
    queryKey: ['m31membro', emailParam],
    queryFn: () => base44.entities.EventoM31Membro.filter({ user_email: emailParam }, '-created_date', 1),
    enabled: !!emailParam,
    select: data => data?.[0],
  });

  const { data: tarefas = [], isLoading } = useQuery({
    queryKey: ['m31tarefas-coord', emailParam],
    queryFn: () => base44.entities.EventoM31Tarefa.filter({ responsavel_email: emailParam }, '-created_date', 200),
    enabled: !!emailParam,
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (membro) setUserName(membro.nome || emailParam);
  }, [membro, emailParam]);

  const updateTarefa = async (id, data) => {
    await base44.entities.EventoM31Tarefa.update(id, data);
    qc.invalidateQueries(['m31tarefas-coord', emailParam]);
    qc.invalidateQueries(['m31tarefas']);
  };

  if (!emailParam) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#100A0D', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <p style={{ color: 'rgba(240,232,234,0.38)', fontFamily: 'Inter, sans-serif', textAlign: 'center' }}>Link inválido. Solicite um novo link ao administrador.</p>
    </div>
  );

  const tarefasFiltradas = tarefas.filter(t => !filtroStatus || t.status === filtroStatus || (filtroStatus === 'em_execucao' && t.status === 'em_andamento'));
  const criticas = tarefas.filter(t => ['critico', 'bloqueado'].includes(t.status)).length;
  const pendentes = tarefas.filter(t => t.status !== 'concluido').length;
  const concluidas = tarefas.filter(t => t.status === 'concluido').length;
  const AREA = membro ? (AREA_LABELS[membro.area] || membro.area) : '';

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#100A0D', color: '#F0E8EA', maxWidth: '600px', margin: '0 auto' }}>
      {/* Header fixo */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#1A0E12', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '16px 16px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: 'rgba(196,85,106,0.20)', border: '2px solid rgba(196,85,106,0.40)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif', fontWeight: '700', fontSize: '15px', color: '#C4556A', flexShrink: 0 }}>
            {(membro?.nome || emailParam)?.[0]?.toUpperCase()}
          </div>
          <div>
            <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: '700', fontSize: '15px', color: '#F0E8EA' }}>{membro?.nome || emailParam}</div>
            {AREA && <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', color: 'rgba(240,232,234,0.45)' }}>{AREA}</div>}
          </div>
        </div>
        {/* KPIs rápidos */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {[
            { label: 'Total', value: tarefas.length, color: 'rgba(240,232,234,0.38)' },
            { label: 'Pendentes', value: pendentes, color: '#FBBF24' },
            { label: 'Críticas', value: criticas, color: '#F87171' },
            { label: 'Concluídas', value: concluidas, color: '#34D399' },
          ].map(k => (
            <div key={k.label} style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '8px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: '800', fontSize: '18px', color: k.color }}>{k.value}</div>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '10px', color: 'rgba(240,232,234,0.38)' }}>{k.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px' }}>
        {/* Filtro de status */}
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px', marginBottom: '16px' }}>
          <button onClick={() => setFiltroStatus('')} style={{
            padding: '6px 12px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.12)',
            backgroundColor: !filtroStatus ? 'rgba(196,85,106,0.25)' : 'transparent',
            color: !filtroStatus ? '#C4556A' : 'rgba(240,232,234,0.45)',
            fontSize: '12px', fontFamily: 'Inter, sans-serif', fontWeight: '600', whiteSpace: 'nowrap', cursor: 'pointer',
          }}>Todas</button>
          {STATUS_OPTIONS.map(s => {
            const sc = STATUS_CONFIG[s.value];
            const ativo = filtroStatus === s.value;
            return (
              <button key={s.value} onClick={() => setFiltroStatus(s.value)} style={{
                padding: '6px 12px', borderRadius: '20px', border: `1px solid ${ativo ? sc.color + '50' : 'rgba(255,255,255,0.10)'}`,
                backgroundColor: ativo ? sc.bg : 'transparent',
                color: ativo ? sc.color : 'rgba(240,232,234,0.45)',
                fontSize: '12px', fontFamily: 'Inter, sans-serif', fontWeight: '600', whiteSpace: 'nowrap', cursor: 'pointer',
              }}>{s.label}</button>
            );
          })}
        </div>

        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
            <div style={{ width: '28px', height: '28px', border: '2px solid rgba(255,255,255,0.10)', borderTopColor: '#C4556A', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : tarefasFiltradas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px', fontFamily: 'Inter, sans-serif', fontSize: '14px', color: 'rgba(240,232,234,0.30)' }}>
            Nenhuma tarefa encontrada.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {tarefasFiltradas.map(t => (
              <TarefaCard key={t.id} tarefa={t} onUpdate={updateTarefa} userName={membro?.nome || emailParam} />
            ))}
          </div>
        )}

        <div style={{ paddingBottom: '32px' }} />
      </div>
    </div>
  );
}