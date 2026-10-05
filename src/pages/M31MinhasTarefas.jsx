/**
 * M31MinhasTarefas — Página mobile-first para voluntários e líderes.
 * Mostra apenas as tarefas da pessoa (por email) e da área dela (se líder).
 * Interface de bolso: cards grandes, botão concluir, comentário inline, FAB.
 *
 * Segurança: só pode concluir/editar tarefas da própria área.
 * Notificações de delegação: via m31EnviarMensagemGovernada (governada).
 */
import { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ClipboardList, LogOut } from 'lucide-react';
import TaskCard from '@/components/m31/minhas-tarefas/TaskCard';
import NewTaskModal from '@/components/m31/minhas-tarefas/NewTaskModal';
import CommitmentScreen from '@/components/m31/minhas-tarefas/CommitmentScreen';

const AREA_LABELS = {
  logistica: 'Logística', comunicacao: 'Comunicação', voluntarios: 'Voluntários',
  financeiro: 'Financeiro', checkin: 'Check-in', recepcao: 'Recepção',
  oracao: 'Oração', geral: 'Geral',
};

// Mapeia setor do voluntário (EventoM31Voluntario) → área da tarefa
const VOL_SETOR_TO_AREA = {
  intercessao: 'oracao', louvor: 'geral', alimentacao: 'geral',
  espaco_filhas: 'geral', lojinha: 'geral', sala_pastoral: 'geral',
  checkin: 'checkin', gerencia_culto: 'geral', midia: 'comunicacao', logistica: 'logistica',
};

const LEADER_PROFILES = ['super_admin', 'gestao_operacional', 'lider_setor', 'coordenador', 'coordenadora_geral'];

export default function M31MinhasTarefas() {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [showNewTask, setShowNewTask] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(u => { setUser(u); setLoadingAuth(false); }).catch(() => setLoadingAuth(false));
  }, []);

  // Voluntário (para whatsapp, nome, status de compromisso)
  const { data: voluntario = null } = useQuery({
    queryKey: ['m31_mt_vol', user?.email],
    queryFn: () => base44.entities.EventoM31Voluntario.filter({ email: user.email }).then(r => r?.[0] || null),
    enabled: !!user?.email,
  });

  // Membro (para perfil/setor — setor do membro bate 1:1 com área da tarefa)
  const { data: membro = null } = useQuery({
    queryKey: ['m31_mt_membro', user?.email],
    queryFn: () => base44.entities.EventoM31Membro.filter({ user_email: user.email, ativo: true }).then(r => r?.[0] || null),
    enabled: !!user?.email,
  });

  // Resolve área e nome
  const userArea = membro?.setor || (voluntario ? VOL_SETOR_TO_AREA[voluntario.setor] : null) || null;
  const userNome = voluntario?.nome || membro?.nome || user?.full_name || user?.email;
  const isLeader = LEADER_PROFILES.includes(membro?.perfil);
  const needsCommitment = voluntario && voluntario.status === 'pendente';

  // Tarefas
  const { data: allTarefas = [], isLoading: loadingTasks } = useQuery({
    queryKey: ['m31_minhas_tarefas', user?.email],
    queryFn: () => base44.entities.EventoM31Tarefa.list('-prazo', 200),
    enabled: !!user?.email,
    refetchInterval: 30000,
  });

  // Colegas da área (para delegação)
  const { data: colegas = [] } = useQuery({
    queryKey: ['m31_mt_colegas', userArea],
    queryFn: async () => {
      const [vols, mems] = await Promise.all([
        base44.entities.EventoM31Voluntario.filter({ status: 'ativo' }, '-created_date', 100),
        base44.entities.EventoM31Membro.filter({ setor: userArea, ativo: true }, '-created_date', 50),
      ]);
      const byEmail = new Map();
      mems.forEach(m => byEmail.set(m.user_email, { id: m.id, nome: m.nome, email: m.user_email, whatsapp: m.whatsapp }));
      vols.forEach(v => {
        if (VOL_SETOR_TO_AREA[v.setor] === userArea && !byEmail.has(v.email)) {
          byEmail.set(v.email, { id: v.id, nome: v.nome, email: v.email, whatsapp: v.whatsapp });
        }
      });
      return Array.from(byEmail.values());
    },
    enabled: !!userArea,
  });

  // Realtime
  useEffect(() => {
    const unsub = base44.entities.EventoM31Tarefa.subscribe(() => qc.invalidateQueries({ queryKey: ['m31_minhas_tarefas'] }));
    return unsub;
  }, []);

  const tarefasFiltradas = useMemo(() => {
    if (!allTarefas.length || !userArea) return [];
    return allTarefas
      .filter(t => {
        if (t.area !== userArea) return false;
        if (isLeader) return true;
        return t.responsavel_email === user.email || (t.membros_emails || []).includes(user.email);
      })
      .sort((a, b) => {
        if (a.status === 'concluido' && b.status !== 'concluido') return 1;
        if (a.status !== 'concluido' && b.status === 'concluido') return -1;
        return new Date(a.prazo || '9999-12-31') - new Date(b.prazo || '9999-12-31');
      });
  }, [allTarefas, userArea, isLeader, user]);

  const handleConcluir = async (tarefa) => {
    try {
      await base44.entities.EventoM31Tarefa.update(tarefa.id, {
        status: 'concluido',
        concluido_em: new Date().toISOString(),
        concluido_por_email: user.email,
        concluido_por_nome: userNome,
      });
      qc.invalidateQueries({ queryKey: ['m31_minhas_tarefas'] });
    } catch { /* ignore */ }
  };

  const handleConfirmCommitment = async () => {
    setConfirming(true);
    try {
      await base44.entities.EventoM31Voluntario.update(voluntario.id, { status: 'ativo' });
      // Envia confirmação via WhatsApp governado
      if (voluntario.whatsapp) {
        const msg = `Olá ${voluntario.nome?.split(' ')[0] || ''}! Confirmamos seu compromisso de servir no M31 Filhas 2026${userArea ? ` na área de ${AREA_LABELS[userArea] || userArea}` : ''}. Acesse /minhas-tarefas para acompanhar suas tarefas. Contamos com você! 💜`;
        try {
          await base44.functions.invoke('m31EnviarMensagemGovernada', {
            telefone: voluntario.whatsapp,
            email: voluntario.email,
            automacao: 'OPERACIONAL',
            origem: 'minhas_tarefas_compromisso',
            mensagens: [{ message: msg }],
          });
        } catch { /* governed layer may block; commitment still recorded */ }
      }
      qc.invalidateQueries({ queryKey: ['m31_mt_vol'] });
    } finally {
      setConfirming(false);
    }
  };

  // ── Render ──
  if (loadingAuth) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F9F8F6' }}>
      <div style={{ width: '28px', height: '28px', border: '2px solid #E5E7EB', borderTopColor: '#A8344A', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>;
  }

  if (!user) {
    base44.auth.redirectToLogin('/minhas-tarefas');
    return null;
  }

  if (!voluntario && !membro) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: '#F9F8F6' }}>
        <div style={{ textAlign: 'center', maxWidth: '320px' }}>
          <ClipboardList size={40} color="#D1D5DB" style={{ margin: '0 auto 12px' }} />
          <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#1F2937', marginBottom: '6px' }}>Você não está cadastrado</h2>
          <p style={{ fontSize: '14px', color: '#6B7280', marginBottom: '20px' }}>Entre em contato com a coordenação para ser inscrito como voluntária.</p>
          <button onClick={() => base44.auth.logout()} style={{ fontSize: '14px', color: '#A8344A', background: 'none', border: '1px solid #FECACA', borderRadius: '8px', padding: '8px 16px', cursor: 'pointer' }}>Sair</button>
        </div>
      </div>
    );
  }

  if (needsCommitment) {
    return <CommitmentScreen voluntario={voluntario} areaLabel={AREA_LABELS[userArea]} onConfirm={handleConfirmCommitment} saving={confirming} />;
  }

  const pendentes = tarefasFiltradas.filter(t => t.status !== 'concluido');
  const concluidas = tarefasFiltradas.filter(t => t.status === 'concluido');

  return (
    <div style={{ minHeight: '100vh', background: '#F9F8F6', paddingBottom: '80px' }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: '#FFFFFF', borderBottom: '1px solid #F3F0EC',
        padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: '11px', color: '#9CA3AF', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {AREA_LABELS[userArea] || userArea}{isLeader ? ' · Líder' : ' · Voluntária'}
          </div>
          <h1 style={{ fontSize: '18px', fontWeight: '700', color: '#1F2937', margin: 0, fontFamily: '"Inter", sans-serif' }}>
            Minhas Tarefas
          </h1>
        </div>
        <button onClick={() => base44.auth.logout()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF' }}>
          <LogOut size={18} />
        </button>
      </div>

      {/* Summary */}
      <div style={{ padding: '12px 16px 4px', display: 'flex', gap: '8px' }}>
        <div style={{ flex: 1, background: '#FFFFFF', borderRadius: '10px', padding: '10px 12px', border: '1px solid #F3F0EC' }}>
          <div style={{ fontSize: '22px', fontWeight: '700', color: '#A8344A', fontFamily: '"Inter", sans-serif' }}>{pendentes.length}</div>
          <div style={{ fontSize: '11px', color: '#6B7280' }}>Pendentes</div>
        </div>
        <div style={{ flex: 1, background: '#FFFFFF', borderRadius: '10px', padding: '10px 12px', border: '1px solid #F3F0EC' }}>
          <div style={{ fontSize: '22px', fontWeight: '700', color: '#059669', fontFamily: '"Inter", sans-serif' }}>{concluidas.length}</div>
          <div style={{ fontSize: '11px', color: '#6B7280' }}>Concluídas</div>
        </div>
      </div>

      {/* Task list */}
      <div style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {loadingTasks ? (
          <p style={{ textAlign: 'center', color: '#9CA3AF', fontSize: '14px', padding: '40px' }}>Carregando tarefas...</p>
        ) : tarefasFiltradas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <ClipboardList size={36} color='#D1D5DB' style={{ margin: '0 auto 8px' }} />
            <p style={{ color: '#6B7280', fontSize: '14px' }}>Nenhuma tarefa atribuída a você.</p>
            <p style={{ color: '#9CA3AF', fontSize: '12px', marginTop: '4px' }}>Use o botão + para criar uma demanda.</p>
          </div>
        ) : (
          <>
            {pendentes.map(t => <TaskCard key={t.id} tarefa={t} user={user} onConcluir={handleConcluir} />)}
            {concluidas.length > 0 && pendentes.length > 0 && (
              <div style={{ fontSize: '11px', fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '8px 4px 4px' }}>
                Concluídas
              </div>
            )}
            {concluidas.map(t => <TaskCard key={t.id} tarefa={t} user={user} onConcluir={handleConcluir} />)}
          </>
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => setShowNewTask(true)}
        style={{
          position: 'fixed', bottom: '20px', right: '20px',
          width: '56px', height: '56px', borderRadius: '50%',
          background: '#A8344A', color: '#FFFFFF', border: 'none', cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(168,52,74,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }}
      >
        <Plus size={26} />
      </button>

      {showNewTask && (
        <NewTaskModal
          user={user}
          userArea={userArea}
          userNome={userNome}
          colegas={colegas}
          onClose={() => setShowNewTask(false)}
        />
      )}
    </div>
  );
}