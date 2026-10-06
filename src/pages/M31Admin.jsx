import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Lock } from 'lucide-react';
import M31OperacoesTab from '@/components/m31/dashboard/M31OperacoesTab';
import M31AdminLayout from '@/components/m31/M31AdminLayout';
import M31DashboardExecutivo from '@/components/m31/dashboard/M31DashboardExecutivo';
import M31Cupons from '@/components/m31/M31Cupons';
import M31Lotes from '@/components/m31/M31Lotes';
import M31ConfiguracaoEvento from '@/components/m31/M31ConfiguracaoEvento';
import M31GestaoTarefas from '@/components/m31/M31GestaoTarefas';
import M31GestaoEquipe from '@/components/m31/M31GestaoEquipe';
import M31GestaoFornecedores from '@/components/m31/M31GestaoFornecedores';
import M31DashboardFinanceiro from '@/components/m31/M31DashboardFinanceiro';
import M31PainelConciliacao from '@/components/m31/conciliacao/M31PainelConciliacao';
import M31GestaoTransacoes from '@/components/m31/M31GestaoTransacoes';
import M31ConfiguracaoBotWhatsApp from '@/components/m31/M31ConfiguracaoBotWhatsApp';
import M31ContasAPagarReceber from '@/components/m31/M31ContasAPagarReceber';

import M31EventBuilder from '@/components/m31/M31EventBuilder';
import M31ParticipantesHub from '@/components/m31/M31ParticipantesHub';
import M31GestaoVoluntarios from '@/components/m31/M31GestaoVoluntarios';
import M31LogsAcoes from '@/components/m31/M31LogsAcoes';
import M31DashboardDisparo from '@/components/m31/M31DashboardDisparo';
import M31AuditoriaErros from '@/components/m31/M31AuditoriaErros';
import M31AuditoriaGrupos from '@/components/m31/M31AuditoriaGrupos';
import M31GestaoGruposFluxo from '@/components/m31/M31GestaoGruposFluxo';
import M31HubSaude from '@/components/m31/M31HubSaude';
import M31StatusEnvioMensagens from '@/components/m31/M31StatusEnvioMensagens';
import M31BrandingPanel from '@/pages/M31BrandingPanel';
import M31HomeTab from '@/components/m31/M31HomeTab';
import M31CentralMensagens from '@/components/m31/mensagens/M31CentralMensagens';
import M31CheckinPanel from '@/components/m31/M31CheckinPanel';
import M31Cronograma from '@/components/m31/M31Cronograma';
import M31Logistica from '@/components/m31/M31Logistica';
import M31Cartinhas from '@/pages/M31Cartinhas';
import M31IntercessaoPagamentos from '@/pages/M31IntercessaoPagamentos';
import { useM31Auth } from '@/lib/m31Auth';
import { useM31UsageTracker } from '@/hooks/useM31UsageTracker';
import { filterVisibleTabs } from '@/lib/m31Tabs';

export default function M31Admin() {
  const { user, membro, loading, isSuperAdmin, isCoordenador, isCoordGeral, isGestoraInscr, isCoordParticipantes, pode, getDefaultTab } = useM31Auth();
  useM31UsageTracker(membro);

  // Lê a aba inicial da URL (?tab=xxx) e mantém sincronizado
  const getTabFromUrl = () => new URLSearchParams(window.location.search).get('tab') || null;
  const [tab, setTab] = useState(() => getTabFromUrl() || null);

  useEffect(() => {
    const handler = () => setTab(getTabFromUrl());
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  const handleTabChange = (id) => {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', id);
    window.history.pushState({}, '', url.toString());
    setTab(id);
  };

  // Navegação com filtros: ?tab=xxx&aba=yyy&status=zzz&caravana_id=aaa&filtroChip=bbb&lote=&grupo=&setor=&focus=
  const handleNavigate = (target, params = {}) => {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', target);
    ['aba', 'status', 'caravana_id', 'filtroChip', 'focus', 'lote', 'grupo', 'setor'].forEach(k => url.searchParams.delete(k));
    Object.entries(params).forEach(([k, v]) => { if (v != null) url.searchParams.set(k, v); });
    window.history.pushState({}, '', url.toString());
    setTab(target);
  };

  // Filtros de navegação lidos da URL (para repassar aos componentes)
  const navParams = new URLSearchParams(window.location.search);
  const initialAba = navParams.get('aba');
  const initialStatus = navParams.get('status');
  const initialCaravanaId = navParams.get('caravana_id');
  const initialFiltroChip = navParams.get('filtroChip');
  const initialLote = navParams.get('lote');
  const initialGrupo = navParams.get('grupo');
  const initialSetor = navParams.get('setor');
  const initialFocus = navParams.get('focus');

  const { data: _badgeLeads = [] } = useQuery({
    queryKey: ['m31badge_leads'],
    queryFn: () => base44.entities.EventoM31Inscricao.filter({ status_pagamento: 'checkout_abandonado' }, '-created_date', 200),
    enabled: !!user && isCoordenador,
    refetchInterval: 120000,
  });
  const { data: _badgeTarefas = [] } = useQuery({
    queryKey: ['m31badge_tarefas'],
    queryFn: async () => {
      const all = await base44.entities.EventoM31Tarefa.list('-prazo', 200);
      const hoje = new Date();
      return all.filter(t => ['a_fazer','em_andamento','bloqueado'].includes(t.status) && t.prazo && new Date(t.prazo) < hoje);
    },
    enabled: !!user,
    refetchInterval: 120000,
  });

  const badgeCounts = useMemo(() => ({
    leads: _badgeLeads.length,
    tarefas: _badgeTarefas.length,
    alertas: _badgeLeads.length + _badgeTarefas.length,
    saude: _badgeLeads.length + _badgeTarefas.length,
  }), [_badgeLeads, _badgeTarefas]);

  // Categorias filtradas por permissão (estrutura para o Accordion)
  // Permissões por perfil:
  // - Admin: vê tudo
  // - Coordenador: vê Participantes, Operações, Tarefas, Equipe, Logs
  // - Voluntário: vê apenas sua própria área (check-in, status)
  const permissoesPorPerfil = {
    super_admin: ['home', 'dashboard', 'saude', 'operacoes', 'participantes', 'checkin', 'config_evento', 'voluntarios', 'intercessao', 'tarefas', 'logistica', 'cronograma', 'cartinhas', 'financeiro', 'transacoes', 'fornecedores', 'contas', 'config_bot', 'equipe', 'solicitacoes', 'logs', 'disparos', 'importar', 'exportar', 'builder', 'auditoria', 'status_envios', 'central_mensagens', 'branding', 'conciliacao'],
    coordenador: ['home', 'dashboard', 'saude_op', 'operacoes', 'participantes', 'checkin', 'config_evento', 'tarefas', 'logistica', 'cronograma', 'cartinhas', 'equipe', 'solicitacoes', 'logs', 'voluntarios', 'disparos'],
    gestao_operacional: ['home', 'dashboard', 'operacoes', 'participantes', 'checkin', 'config_evento', 'voluntarios', 'tarefas', 'logistica', 'cronograma', 'fornecedores'],
    coordenadora_geral: ['home', 'dashboard', 'operacoes', 'participantes', 'checkin', 'voluntarios', 'tarefas', 'logistica', 'cronograma', 'fornecedores', 'contas'],
    gestora_inscricoes: ['home', 'dashboard', 'operacoes', 'participantes', 'checkin', 'voluntarios', 'tarefas', 'logistica', 'cronograma', 'fornecedores'],
    coordenacao_participantes: ['home', 'dashboard', 'operacoes', 'participantes', 'checkin', 'voluntarios', 'tarefas', 'logistica', 'cronograma', 'fornecedores'],
    visualizacao: ['home', 'participantes', 'config_evento', 'voluntarios', 'importar', 'exportar', 'tarefas', 'logistica', 'cronograma', 'fornecedores', 'operacoes', 'financeiro', 'transacoes', 'contas', 'equipe', 'conciliacao'],
    voluntario: ['home', 'checkin', 'status_envios'],
  };

  const abasPermitidas = permissoesPorPerfil[membro?.perfil] || 
    (isSuperAdmin ? permissoesPorPerfil.super_admin : 
     isCoordenador ? permissoesPorPerfil.coordenador : 
     []);

  const categorias = useMemo(
    () => filterVisibleTabs({ isSuperAdmin, isCoordenador, pode }).map(cat => ({
      ...cat,
      items: cat.items.filter(item => abasPermitidas.includes(item.id))
    })).filter(cat => cat.items.length > 0),
    [isSuperAdmin, isCoordenador, pode, abasPermitidas]
  );

  // Lista plana para encontrar a aba válida
  const todasAsTabs = useMemo(() => categorias.flatMap(c => c.items), [categorias]);

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F8F7F5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{
        width: '32px', height: '32px',
        border: '2px solid #E5E7EB',
        borderTopColor: '#5B1E2D',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (!user) {
    base44.auth.redirectToLogin(window.location.href);
    return null;
  }

  const temAcesso = isSuperAdmin || !!membro;
  if (!temAcesso) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#F8F7F5', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '32px', maxWidth: '360px', textAlign: 'center' }}>
          <div style={{ width: '48px', height: '48px', backgroundColor: '#FEF2F2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Lock size={20} color="#DC2626" />
          </div>
          <h2 style={{ fontFamily: 'Inter, sans-serif', fontSize: '16px', fontWeight: '600', color: '#1F2937', marginBottom: '8px' }}>Acesso Restrito</h2>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', color: '#6B7280', marginBottom: '20px', lineHeight: '1.5' }}>
            Você não tem permissão para acessar o painel M31. Entre em contato com o administrador.
          </p>
          <button
            onClick={() => base44.auth.logout()}
            style={{
              fontFamily: 'Inter, sans-serif', fontSize: '14px', fontWeight: '500',
              color: '#DC2626', background: 'none', border: '1px solid #FECACA',
              borderRadius: '6px', padding: '8px 16px', cursor: 'pointer',
            }}
          >
            Sair da conta
          </button>
        </div>
      </div>
    );
  }

  // Determina aba padrão por perfil
  const todasAsTabsPermitidas = categorias.flatMap(c => c.items);
  const tabAtual = todasAsTabsPermitidas.find(t => t.id === tab) ? tab : 
    (abasPermitidas.includes(getDefaultTab()) ? getDefaultTab() : 
     abasPermitidas[0] || 'participantes');

  const perfilLabel = membro?.perfil === 'super_admin' ? 'Super Admin'
    : membro?.perfil === 'coordenador' ? 'Coordenador'
    : membro?.perfil === 'coordenadora_geral' ? 'Coord. Geral'
    : membro?.perfil === 'gestora_inscricoes' ? 'Gestora de Inscrições'
    : membro?.perfil === 'coordenacao_participantes' ? 'Coord. Participantes'
    : membro?.perfil === 'voluntario' ? 'Voluntária'
    : isSuperAdmin ? 'Super Admin' : '';

  return (
    <M31AdminLayout
      tabAtual={tabAtual}
      categorias={categorias}
      onTabChange={handleTabChange}
      user={user}
      perfilLabel={perfilLabel}
      badgeCounts={badgeCounts}
    >
      {tabAtual === 'home'          && <M31HomeTab user={user} membro={membro} pode={pode} onNavigate={handleNavigate} />}
      {tabAtual === 'dashboard'     && (
        <M31DashboardExecutivo user={user} onNavigate={handleNavigate} onNavigateToOperacoes={() => handleTabChange('operacoes')} />
      )}
      {tabAtual === 'saude'         && <M31HubSaude alertCount={badgeCounts.alertas} />}
      {tabAtual === 'operacoes'     && <M31OperacoesTab />}
      {tabAtual === 'participantes' && (
        <M31ParticipantesHub
          key={`part-${initialAba || ''}-${initialStatus || ''}-${initialCaravanaId || ''}-${initialLote || ''}-${initialGrupo || ''}`}
          pode={pode}
          defaultAba={initialAba || 'inscricoes'}
          initialFiltroStatus={initialStatus}
          initialFiltroCaravanaId={initialCaravanaId}
          initialFiltroLote={initialLote}
          initialFiltroGrupo={initialGrupo}
          onNavigateTo={handleTabChange}
        />
      )}
      {tabAtual === 'voluntarios'   && <M31GestaoVoluntarios key={`vol-${initialSetor || ''}`} initialSetor={initialSetor} />}
      {tabAtual === 'checkin'       && <M31CheckinPanel />}
      {tabAtual === 'cupons'        && <M31Cupons />}
      {tabAtual === 'lotes'         && <M31Lotes />}
      {tabAtual === 'config_evento' && <M31ConfiguracaoEvento />}
      {tabAtual === 'tarefas'       && (
        <M31GestaoTarefas key={`tarefas-${initialFiltroChip || ''}`} pode={pode} userEmail={user.email} userName={user.full_name} membro={membro} initialFiltroChip={initialFiltroChip} />
      )}
      {tabAtual === 'conciliacao'   && <M31PainelConciliacao />}
      {tabAtual === 'financeiro'    && <M31DashboardFinanceiro />}
      {tabAtual === 'transacoes'    && <M31GestaoTransacoes />}
      {tabAtual === 'fornecedores'  && <M31GestaoFornecedores />}
      {tabAtual === 'contas'        && <M31ContasAPagarReceber />}
      {tabAtual === 'config_bot'    && <M31ConfiguracaoBotWhatsApp />}
      {tabAtual === 'equipe'        && <M31GestaoEquipe isSuperAdmin={isSuperAdmin} user={user} membro={membro} />}
      {tabAtual === 'logistica'    && <M31Logistica />}
      {tabAtual === 'cronograma'    && <M31Cronograma />}
      {tabAtual === 'cartinhas'     && <M31Cartinhas />}
      {tabAtual === 'intercessao'   && <M31IntercessaoPagamentos />}
      {tabAtual === 'logs'          && <M31LogsAcoes />}
      {tabAtual === 'disparos'      && <M31DashboardDisparo />}

      {tabAtual === 'builder'       && <M31EventBuilder user={user} />}
      {tabAtual === 'auditoria'     && <M31AuditoriaErros />}
      {tabAtual === 'auditoria_grupos' && <M31AuditoriaGrupos />}
      {tabAtual === 'gestao_fluxos' && <M31GestaoGruposFluxo />}
      {tabAtual === 'status_envios' && <M31StatusEnvioMensagens />}
      {tabAtual === 'central_mensagens' && <M31CentralMensagens />}
      {tabAtual === 'branding'      && <M31BrandingPanel />}

    </M31AdminLayout>
  );
}
