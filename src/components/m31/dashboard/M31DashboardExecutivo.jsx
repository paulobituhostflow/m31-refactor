/**
 * M31DashboardExecutivo — Dashboard principal (Central de Navegação Operacional)
 * - Busca dados reais (inscrições, tarefas, lotes, caravanas)
 * - Todos os cards são clicáveis e direcionam para a tela filtrada
 */

import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import M31DashboardHeader from './M31DashboardHeader';
import M31ExecutiveMetricsBar from './M31ExecutiveMetricsBar';
import M31ExecutiveAttention from './M31ExecutiveAttention';
import M31DashboardFunil from './M31DashboardFunil';
import M31DashboardFinanceiro from './M31DashboardFinanceiro';
import M31DashboardOperacoesCompacto from './M31DashboardOperacoesCompacto';
import M31DashboardCaravanas from './M31DashboardCaravanas';
import M31ExecutiveSystemStatus from './M31ExecutiveSystemStatus';
import { computeM31Metrics } from '@/lib/m31Metrics';

export default function M31DashboardExecutivo({ user, onNavigate, onNavigateToOperacoes }) {
  // Aplicar Light Mode ao dashboard executivo
  useEffect(() => {
    document.body.classList.add('dashboard-executive');
    return () => document.body.classList.remove('dashboard-executive');
  }, []);

  // ── Busca dados reais ──
  const { data: inscricoes = [] } = useQuery({
    queryKey: ['m31dash_inscricoes'],
    queryFn: () => base44.entities.EventoM31Inscricao.list('-created_date', 2000),
    refetchInterval: 120000,
  });
  const { data: tarefas = [] } = useQuery({
    queryKey: ['m31dash_tarefas'],
    queryFn: () => base44.entities.EventoM31Tarefa.list('-created_date', 500),
    refetchInterval: 120000,
  });
  const { data: lotes = [] } = useQuery({
    queryKey: ['m31dash_lotes'],
    queryFn: () => base44.entities.EventoM31Lote.list('-ordem', 10),
  });

  // ── Cálculo de métricas reais (REGRA OFICIAL ÚNICA — m31Metrics) ──
  const metrics = useMemo(() => {
    const base = computeM31Metrics(inscricoes);
    // Cadastro incompleto não retira uma participante reconhecida da operação.
    // Headcount oficial continua vindo de computeM31Metrics/estado_canonico;
    // este recorte operacional não pode exigir telefone.
    const inscritasPagas = inscricoes.filter(i => ['aprovado', 'gratuito'].includes(i.status_pagamento));
    const checkins = inscritasPagas.filter(i => i.checkin_realizado).length;

    const now = new Date();
    const tarefasAtrasadas = tarefas.filter(t => {
      if (!t.prazo || t.status === 'concluido') return false;
      return new Date(t.prazo + 'T12:00:00') < now;
    }).length;

    // Lote crítico: > 80% ocupado
    let loteCritico = null;
    for (const l of lotes) {
      if (l.ativo && l.vagas_total > 0) {
        const pct = Math.round((l.vagas_usadas / l.vagas_total) * 100);
        if (pct >= 80 && (!loteCritico || pct > loteCritico.pct)) {
          loteCritico = { nome: l.nome?.replace('_', ' '), pct };
        }
      }
    }

    // Ranking de caravanas (apenas confirmadas)
    const caravanaMap = {};
    inscritasPagas.forEach((i) => {
      if (i.caravana_id) {
        if (!caravanaMap[i.caravana_id]) caravanaMap[i.caravana_id] = { id: i.caravana_id, nome: i.caravana_nome || 'Sem nome', membros: 0 };
        caravanaMap[i.caravana_id].membros++;
      }
    });
    const caravanas = Object.values(caravanaMap).sort((a, b) => b.membros - a.membros);

    // Auditoria pendente: pagamentos duplicados reais (dedup por CPF)
    const auditFlag = inscricoes.filter(i => i.observacoes && i.observacoes.includes('AUDITORIA PENDENTE'));
    const cpfAudit = new Map();
    auditFlag.forEach(i => {
      const cpf = (i.cpf || '').replace(/\D/g, '');
      if (cpf && !cpfAudit.has(cpf)) cpfAudit.set(cpf, i.valor_pago || 0);
    });
    const auditoriaPendenteValor = Array.from(cpfAudit.values()).reduce((s, v) => s + v, 0);

    return {
      ...base,
      checkins,
      tarefasAtrasadas,
      loteCritico,
      caravanas,
      auditoriaPendenteValor,
      auditoriaPendentePessoas: cpfAudit.size,
    };
  }, [inscricoes, tarefas, lotes]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* 1. Header Executivo */}
      <M31DashboardHeader eventName="M31 Filhas 2026" eventStatus="ativo" user={user} />

      {/* Container principal — seções lineares como relatório */}
      <div className="flex-1 px-4 sm:px-6 py-6 sm:py-8 max-w-6xl mx-auto w-full space-y-7">
        {/* 2. Metric Bar horizontal */}
        <section>
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-1 h-4 bg-primary rounded-full" />
            <h2 className="text-caption text-primary">Visão Geral</h2>
          </div>
          <M31ExecutiveMetricsBar data={metrics} onNavigate={onNavigate} />
        </section>

        {/* 3. O que precisa da sua atenção */}
        <section>
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-1 h-4 bg-primary rounded-full" />
            <h2 className="text-caption text-primary">O que precisa da sua atenção</h2>
          </div>
          <M31ExecutiveAttention data={metrics} onNavigate={onNavigate} />
        </section>

        {/* 4. Funil de inscrições */}
        <section>
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-1 h-4 bg-primary rounded-full" />
            <h2 className="text-caption text-primary">Funil de Inscrições</h2>
          </div>
          <div className="bg-card rounded-lg border border-border p-6 shadow-m31-sm">
            <M31DashboardFunil data={metrics} onNavigate={onNavigate} />
          </div>
        </section>

        {/* 5. Financeiro resumido */}
        <section>
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-1 h-4 bg-primary rounded-full" />
            <h2 className="text-caption text-primary">Financeiro</h2>
          </div>
          <div className="bg-card rounded-lg border border-border p-6 shadow-m31-sm">
            <M31DashboardFinanceiro data={metrics} onNavigate={onNavigate} />
          </div>
        </section>

        {/* 6. Centro de Operações */}
        <section>
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-1 h-4 bg-primary rounded-full" />
            <h2 className="text-caption text-primary">Centro de Operações</h2>
          </div>
          <div className="bg-card rounded-lg border border-border p-6 shadow-m31-sm">
            <M31DashboardOperacoesCompacto onNavigate={onNavigate} onNavigateToOperacoes={onNavigateToOperacoes} />
          </div>
        </section>

        {/* 7. Ranking de caravanas */}
        <section>
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-1 h-4 bg-primary rounded-full" />
            <h2 className="text-caption text-primary">Participação por Caravana</h2>
          </div>
          <div className="bg-card rounded-lg border border-border p-6 shadow-m31-sm">
            <M31DashboardCaravanas data={metrics.caravanas} onNavigate={onNavigate} />
          </div>
        </section>

        {/* 8. Status do sistema */}
        <section>
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-1 h-4 bg-primary rounded-full" />
            <h2 className="text-caption text-primary">Status do Sistema</h2>
          </div>
          <M31ExecutiveSystemStatus onNavigate={onNavigate} />
        </section>
      </div>
    </div>
  );
}