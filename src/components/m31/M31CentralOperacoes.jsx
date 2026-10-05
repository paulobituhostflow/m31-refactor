/**
 * M31CentralOperacoes — Centro centralizado de operações M31
 * FASE 1: Automações e Filas Operacionais
 * FASE 2: Health Check, Webhooks, Functions, Logs, Auditoria, Alertas
 * FASE 3: Dashboard Executivo (será integrado em M31AdminDashboard)
 */

import { useState } from 'react';
import M31AutômacoesDashboard from './M31AutômacoesDashboard';
import M31FilasOperacionais from './M31FilasOperacionais';
import { Card } from '@/components/ui/card';

export default function M31CentralOperacoes() {
  const [abaAtiva, setAbaAtiva] = useState('automacoes');

  const abas = [
    {
      id: 'automacoes',
      label: '⚙️ Automações',
      descricao: 'Monitoramento e operação de automações',
      componente: <M31AutômacoesDashboard />
    },
    {
      id: 'filas',
      label: '📥 Filas Operacionais',
      descricao: 'Visualização de filas de processamento',
      componente: <M31FilasOperacionais />
    },
    {
      id: 'health',
      label: '🏥 Health Check',
      descricao: 'Status do sistema e diagnóstico',
      componente: (
        <Card className="p-6 text-center text-gray-500">
          <p>Health Check — FASE 2 (em desenvolvimento)</p>
        </Card>
      )
    },
    {
      id: 'webhooks',
      label: '🔗 Webhooks',
      descricao: 'Monitoramento de webhooks ativos',
      componente: (
        <Card className="p-6 text-center text-gray-500">
          <p>Webhooks — FASE 2 (em desenvolvimento)</p>
        </Card>
      )
    },
    {
      id: 'logs',
      label: '📋 Logs & Auditoria',
      descricao: 'Histórico de operações e erros',
      componente: (
        <Card className="p-6 text-center text-gray-500">
          <p>Logs & Auditoria — FASE 2 (em desenvolvimento)</p>
        </Card>
      )
    },
  ];

  const abaAtual = abas.find(a => a.id === abaAtiva);

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="bg-gradient-to-r from-primary to-primary/80 text-white p-6 rounded-lg">
        <h1 className="text-2xl font-bold">🎛️ Centro de Operações M31</h1>
        <p className="text-white/80 mt-2">
          Monitoramento centralizado de automações, filas e saúde do sistema
        </p>
      </div>

      {/* ABAS */}
      <div className="border-b border-gray-200">
        <div className="flex overflow-x-auto gap-1">
          {abas.map(aba => (
            <button
              key={aba.id}
              onClick={() => setAbaAtiva(aba.id)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                abaAtiva === aba.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
              title={aba.descricao}
            >
              {aba.label}
            </button>
          ))}
        </div>
      </div>

      {/* CONTEÚDO DA ABA */}
      <div>
        {abaAtual && abaAtual.componente}
      </div>

      {/* RODAPÉ COM INFO SOBRE FASE */}
      <Card className="p-4 bg-blue-50 border-blue-200">
        <div className="text-sm text-blue-900">
          <strong>ℹ️ FASE 1 — Centro de Operações:</strong>
          <ul className="list-disc list-inside mt-2 space-y-1 text-blue-800">
            <li>✅ Automações: monitoramento completo e ações básicas</li>
            <li>✅ Filas Operacionais: visualização de filas de processamento</li>
            <li>⏳ FASE 2 (próxima): Health Check, Webhooks, Logs, Auditoria e Alertas</li>
            <li>⏳ FASE 3 (final): Dashboard Executivo integrado</li>
          </ul>
        </div>
      </Card>
    </div>
  );
}