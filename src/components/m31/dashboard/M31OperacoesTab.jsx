/**
 * M31OperacoesTab — Aba de Operações com Automações, Filas e Alertas
 */

import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Zap, AlertCircle, PlayCircle } from 'lucide-react';

export default function M31OperacoesTab() {
  const [automacoes, setAutomacoes] = useState([]);
  const [filas, setFilas] = useState({
    boasVindas: { quantidade: 0, processando: 0, pendentes: 0, erros: 0 },
    cobrancas: { quantidade: 0, processando: 0, pendentes: 0, erros: 0 },
    recuperacao: { quantidade: 0, processando: 0, pendentes: 0, erros: 0 },
    disparos: { quantidade: 0, processando: 0, pendentes: 0, erros: 0 },
  });
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Carregar automações
      const automacoes = await base44.functions.invoke('m31ListarAutomacoes', {});
      setAutomacoes(automacoes?.data?.automacoes || []);

      // Carregar filas (mocked por enquanto)
      const inscricoes = await base44.entities.EventoM31Inscricao.filter({}, '-created_date', 500);
      
      setFilas({
        boasVindas: {
          quantidade: inscricoes.filter(i => i.fila_boas_vindas).length,
          processando: 0,
          pendentes: inscricoes.filter(i => i.fila_boas_vindas && i.boas_vindas_iniciada_em).length,
          erros: 0,
        },
        cobrancas: {
          quantidade: inscricoes.filter(i => i.status_pagamento === 'pendente').length,
          processando: 0,
          pendentes: inscricoes.filter(i => i.status_pagamento === 'pendente' && !i.last_recovery_at).length,
          erros: 0,
        },
        recuperacao: {
          quantidade: inscricoes.filter(i => i.fila_recuperacao).length,
          processando: inscricoes.filter(i => i.fila_recuperacao && i.status_fila_recuperacao === 'enviado').length,
          pendentes: inscricoes.filter(i => i.fila_recuperacao && i.status_fila_recuperacao === 'aguardando_aprovacao').length,
          erros: 0,
        },
        disparos: {
          quantidade: inscricoes.filter(i => i.qr_envio_status === 'enviado_com_sucesso').length,
          processando: 0,
          pendentes: inscricoes.filter(i => i.qr_envio_status === 'gerado_nao_enviado').length,
          erros: inscricoes.filter(i => i.qr_envio_status === 'falha_envio').length,
        },
      });

      // Detectar alertas críticos
      const novoAlerts = [];
      if (automacoes?.data?.alertas?.length > 0) {
        automacoes.data.alertas.forEach(alerta => {
          novoAlerts.push(alerta);
        });
      }
      setAlerts(novoAlerts.slice(0, 4)); // Máximo 4 alertas

      setLoading(false);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 sm:px-6 py-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Automações */}
        <div>
          <h2 className="text-lg font-bold text-gray-900 mb-4">Automações</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {automacoes.slice(0, 6).map((auto, idx) => (
              <div key={idx} className="bg-white rounded-xl border border-gray-100 p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Zap size={16} className={auto.status === 'ativa' ? 'text-green-600' : 'text-gray-400'} />
                    <h3 className="font-semibold text-gray-900">{auto.name}</h3>
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded-pill ${
                    auto.status === 'ativa' ? 'bg-green-100 text-green-700' : 
                    auto.status === 'pausada' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {auto.status === 'ativa' ? 'Ativa' : auto.status === 'pausada' ? 'Pausada' : 'Erro'}
                  </span>
                </div>

                <div className="space-y-2 text-xs text-gray-600 mb-4">
                  <div className="flex items-center justify-between">
                    <span>Última execução:</span>
                    <span className="font-medium text-gray-900">{auto.ultima_execucao || 'Nunca'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Próxima execução:</span>
                    <span className="font-medium text-gray-900">{auto.proxima_execucao || 'Não agendado'}</span>
                  </div>
                </div>

                <button className="w-full px-3 py-2 text-sm font-medium rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex items-center justify-center gap-2">
                  <PlayCircle size={14} />
                  Executar agora
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Filas */}
        <div>
          <h2 className="text-lg font-bold text-gray-900 mb-4">Filas Operacionais</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { nome: 'Boas-vindas', data: filas.boasVindas, icon: 'wave' },
              { nome: 'Cobranças', data: filas.cobrancas, icon: 'dollar' },
              { nome: 'Recuperação', data: filas.recuperacao, icon: 'alert' },
              { nome: 'Disparos', data: filas.disparos, icon: 'send' },
            ].map((fila, idx) => (
              <div key={idx} className="bg-white rounded-xl border border-gray-100 p-4">
                <h3 className="font-semibold text-gray-900 text-sm mb-3">{fila.nome}</h3>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Total</span>
                    <span className="font-bold text-gray-900">{fila.data.quantidade}</span>
                  </div>
                  {fila.data.processando > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Processando</span>
                      <span className="font-bold text-blue-600">{fila.data.processando}</span>
                    </div>
                  )}
                  {fila.data.pendentes > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Pendentes</span>
                      <span className="font-bold text-yellow-600">{fila.data.pendentes}</span>
                    </div>
                  )}
                  {fila.data.erros > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Erros</span>
                      <span className="font-bold text-red-600">{fila.data.erros}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Alertas Críticos */}
        {alerts.length > 0 && (
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-4">Alertas Críticos</h2>
            <div className="space-y-3">
              {alerts.map((alerta, idx) => (
                <div key={idx} className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                  <AlertCircle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-red-900">{alerta.titulo}</h3>
                    <p className="text-sm text-red-800 mt-1">{alerta.descricao}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {alerts.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
            <div className="text-4xl mb-3">✓</div>
            <p className="font-semibold text-gray-900">Tudo operacional</p>
            <p className="text-sm text-gray-500">Nenhum alerta crítico no momento</p>
          </div>
        )}
      </div>
    </div>
  );
}