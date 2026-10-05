// Hook e utilitários de autorização para o painel M31
import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * PERFIS RBAC M31:
 * ─────────────────────────────────────────────────────────────
 * super_admin          → acesso total (financeiro, APIs, exclusões, impersonação)
 * gestao_operacional   → inscrições, caravanas, voluntários, exportar. Sem delete/financeiro/tokens
 * lider_setor          → apenas seu setor, presença, observações. Sem financeiro/exportação global
 * checkin              → apenas buscar participante + marcar check-in
 *
 * Perfis legados mantidos para compatibilidade:
 * coordenador, coordenadora_geral, gestora_inscricoes, coordenacao_participantes, voluntario
 */

export function useM31Auth() {
  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const sessionTracked = useRef(false);

  useEffect(() => {
    base44.auth.me()
      .then(u => { setUser(u); setLoadingUser(false); })
      .catch(() => setLoadingUser(false));
  }, []);

  const { data: membro, isLoading: loadingMembro } = useQuery({
    queryKey: ['m31membro', user?.email],
    queryFn: () => base44.entities.EventoM31Membro.filter({ user_email: user.email, ativo: true }),
    enabled: !!user?.email,
    select: data => data?.[0] || null,
  });

  // Registra último acesso (uma vez por sessão)
  useEffect(() => {
    if (membro?.id && !sessionTracked.current) {
      sessionTracked.current = true;
      base44.auth.trackAccess().catch(() => {});
    }
  }, [membro?.id]);

  const perfil = membro?.perfil;

  // ── Hierarquia de perfis ──────────────────────────────────
  const isSuperAdmin           = user?.role === 'admin' || perfil === 'super_admin';
  // legado
  const isCoordenador          = isSuperAdmin || perfil === 'coordenador';
  const isCoordGeral           = isSuperAdmin || perfil === 'coordenadora_geral' || isCoordenador;
  const isGestoraInscr         = isSuperAdmin || perfil === 'gestora_inscricoes' || isCoordenador;
  const isCoordParticipantes   = isSuperAdmin || isCoordenador || isGestoraInscr || perfil === 'coordenacao_participantes';
  // novos
  const isGestaoOp             = isSuperAdmin || perfil === 'gestao_operacional' || isCoordParticipantes;
  const isLiderSetor           = isSuperAdmin || perfil === 'lider_setor' || isGestaoOp;
  const isCheckin              = perfil === 'checkin';
  // Perfil de visualização (somente leitura): Home, Inscrições/Gestão e Automações
  const isVisualizacao         = perfil === 'visualizacao';

  // ── Mapa de permissões ────────────────────────────────────
  const pode = {
    // Dashboard
    verDashboard:       isSuperAdmin || isCoordGeral || isGestoraInscr || isGestaoOp || isVisualizacao || !!membro?.pode_ver_dashboard,

    // Alertas
    verAlertas:         isSuperAdmin || isCoordGeral || isGestaoOp,

    // Hub Participantes
    verParticipantes:   isCoordParticipantes || isGestaoOp || isVisualizacao || !!membro?.pode_ver_inscricoes || !!membro?.pode_checkin || isCheckin,

    // Inscrições
    verInscricoes:      isCoordParticipantes || isGestaoOp || isVisualizacao || !!membro?.pode_ver_inscricoes,

    // Check-in
    fazerCheckin:       isCoordParticipantes || isGestaoOp || isCheckin || !!membro?.pode_checkin,

    // Caravanas
    verCaravanas:       isCoordParticipantes || isGestaoOp,

    // Voluntários
    verVoluntariosHub:  isCoordParticipantes || isGestaoOp || isVisualizacao,
    verVoluntarios:     isCoordParticipantes || isGestaoOp || isVisualizacao,

    // Leads / Mensagens
    verLeads:           isSuperAdmin || isCoordenador || isGestaoOp || perfil === 'coordenacao_participantes' || isCoordGeral,
    verMensagens:       isSuperAdmin || isCoordenador || isGestaoOp || perfil === 'coordenacao_participantes' || isCoordGeral,

    // Tarefas
    verTarefas:         isSuperAdmin || isCoordGeral || isGestaoOp || isVisualizacao || perfil === 'lider_setor',
    criarTarefa:        isSuperAdmin || isCoordGeral || isGestaoOp,
    editarTarefa:       isSuperAdmin || isCoordGeral || isGestaoOp,
    deletarTarefa:      isSuperAdmin,  // SOMENTE super_admin pode deletar

    // Financeiro — BLOQUEADO para tudo abaixo de isCoordenador/gestao_op
    verFinanceiro:      isSuperAdmin || isCoordenador || isVisualizacao || !!membro?.pode_ver_financeiro,
    verTransacoes:      isSuperAdmin || isCoordenador || isVisualizacao,
    verContas:          isSuperAdmin || isCoordGeral || isVisualizacao,
    verFornecedores:    isSuperAdmin || isCoordGeral || isGestaoOp || isVisualizacao,

    // Comercial
    verCupons:          isSuperAdmin || isCoordenador || isVisualizacao,
    verLotes:           isSuperAdmin || isCoordenador || isGestaoOp || isVisualizacao,

    // Exportação — BLOQUEADO para lider_setor e checkin
    exportarDados:      isSuperAdmin || isCoordenador || isGestaoOp || isVisualizacao,

    // Equipe — leitura liberada também para visualização
    verEquipe:          isSuperAdmin || isVisualizacao,

    // Sistema / Config — SOMENTE super_admin e coordenador
    gerenciarMembros:   isSuperAdmin,
    configBot:          isSuperAdmin || isCoordenador,
    importarDados:      isSuperAdmin || isCoordenador || isVisualizacao,

    // Exclusão de dados — SOMENTE super_admin
    deletarRegistros:   isSuperAdmin,

    // Logs de ações — SOMENTE super_admin
    verLogs:            isSuperAdmin,

    // Impersonação — SOMENTE super_admin
    impersonar:         isSuperAdmin,

    // Setor do líder (relevante para perfil lider_setor)
    setorDoLider:       membro?.setor || membro?.area || null,
  };

  // ── Aba padrão por perfil ─────────────────────────────────
  const getDefaultTab = () => 'home';

  return {
    user,
    membro,
    loading: loadingUser || loadingMembro,
    isSuperAdmin,
    isCoordenador,
    isCoordGeral,
    isGestoraInscr,
    isCoordParticipantes,
    isGestaoOp,
    isLiderSetor,
    isCheckin,
    isVoluntario: !!membro,
    pode,
    getDefaultTab,
  };
}

/**
 * Registra uma ação de auditoria no log.
 * Chamar após ações críticas (editar, deletar, exportar, etc.)
 */
export async function logAction({ user, membro, acao, modulo, entidade_id = null, entidade_nome = null, dados_anteriores = null, impersonado_por = null }) {
  try {
    await base44.entities.EventoM31ActionLog.create({
      user_email:        user?.email || 'desconhecido',
      user_nome:         user?.full_name || membro?.nome || 'Desconhecido',
      user_perfil:       membro?.perfil || (user?.role === 'admin' ? 'super_admin' : 'desconhecido'),
      acao,
      modulo,
      entidade_id,
      entidade_nome,
      dados_anteriores:  dados_anteriores ? JSON.stringify(dados_anteriores) : null,
      impersonado_por,
    });
  } catch (_) {
    // silencia — log nunca deve quebrar a UX
  }
}