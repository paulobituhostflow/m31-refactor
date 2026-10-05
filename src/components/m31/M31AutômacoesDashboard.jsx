/**
 * M31AutômacoesDashboard — Monitoramento e operação de automações M31
 * Parte da Central de Operações (FASE 1)
 */

import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Play, Pause, Eye, AlertCircle, CheckCircle, Clock, Zap } from 'lucide-react';
import { Card } from '@/components/ui/card';

const CATEGORY_COLORS = {
  'M31': '#7A1F2B',
  'Financeiro': '#16A34A',
  'WhatsApp': '#2563EB',
  'Check-in': '#F59E0B',
  'Sistema': '#8B5CF6',
};

const STATUS_ICONS = {
  'ativa': <CheckCircle size={16} className="text-green-600" />,
  'pausada': <Pause size={16} className="text-yellow-600" />,
  'erro': <AlertCircle size={16} className="text-red-600" />,
  'arquivada': <Clock size={16} className="text-gray-400" />,
};

const STATUS_LABELS = {
  'ativa': 'Ativa',
  'pausada': 'Pausada',
  'erro': 'Erro',
  'arquivada': 'Arquivada',
};

export default function M31AutômacoesDashboard() {
  const [automacoes, setAutomacoes] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedAuto, setSelectedAuto] = useState(null);
  const [filterStatus, setFilterStatus] = useState('todas');
  const [filterCategory, setFilterCategory] = useState('todas');

  // Carregar automações
  useEffect(() => {
    const fetchAutomacoes = async () => {
      try {
        const res = await base44.functions.invoke('m31ListarAutomacoes', {});
        setAutomacoes(res.data.automacoes || []);
        setResumo(res.data.resumo || {});
      } catch (err) {
        console.error('Erro ao carregar automações:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAutomacoes();
  }, []);

  // Filtrar automações
  const filtradas = automacoes.filter(a => {
    const statusOk = filterStatus === 'todas' || a.status === filterStatus;
    const catOk = filterCategory === 'todas' || a.categoria === filterCategory;
    return statusOk && catOk;
  });

  const categorias = [...new Set(automacoes.map(a => a.categoria))];

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Carregando automações...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      {/* INDICADORES */}
      <div className="grid grid-cols-5 gap-4">
        <Card className="p-4 text-center border-l-4" style={{ borderLeftColor: '#10B981' }}>
          <div className="text-2xl font-bold text-green-600">{resumo?.total || 0}</div>
          <div className="text-xs text-gray-600 mt-1">Total</div>
        </Card>
        <Card className="p-4 text-center border-l-4" style={{ borderLeftColor: '#10B981' }}>
          <div className="text-2xl font-bold text-green-600">{resumo?.ativas || 0}</div>
          <div className="text-xs text-gray-600 mt-1">Ativas</div>
        </Card>
        <Card className="p-4 text-center border-l-4" style={{ borderLeftColor: '#FBBF24' }}>
          <div className="text-2xl font-bold text-yellow-600">{resumo?.pausadas || 0}</div>
          <div className="text-xs text-gray-600 mt-1">Pausadas</div>
        </Card>
        <Card className="p-4 text-center border-l-4" style={{ borderLeftColor: '#EF4444' }}>
          <div className="text-2xl font-bold text-red-600">{resumo?.erro || 0}</div>
          <div className="text-xs text-gray-600 mt-1">Com erro</div>
        </Card>
        <Card className="p-4 text-center border-l-4" style={{ borderLeftColor: '#9CA3AF' }}>
          <div className="text-2xl font-bold text-gray-600">{resumo?.arquivadas || 0}</div>
          <div className="text-xs text-gray-600 mt-1">Arquivadas</div>
        </Card>
      </div>

      {/* FILTROS */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex gap-1">
          <button
            onClick={() => setFilterStatus('todas')}
            className={`px-3 py-1 text-sm rounded ${
              filterStatus === 'todas'
                ? 'text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            style={filterStatus === 'todas' ? { background: '#7A1F2B' } : {}}
          >
            Todas
          </button>
          {['ativa', 'pausada', 'erro', 'arquivada'].map(status => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-3 py-1 text-sm rounded flex items-center gap-1 ${
                filterStatus === status
                  ? 'text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              style={filterStatus === status ? { background: '#7A1F2B' } : {}}
            >
              {STATUS_ICONS[status]}
              {STATUS_LABELS[status]}
            </button>
          ))}
        </div>

        <div className="flex gap-1 border-l border-gray-300 pl-3">
          <button
            onClick={() => setFilterCategory('todas')}
            className={`px-3 py-1 text-sm rounded ${
              filterCategory === 'todas'
                ? 'text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            style={filterCategory === 'todas' ? { background: '#7A1F2B' } : {}}
          >
            Todas categorias
          </button>
          {categorias.map(cat => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-3 py-1 text-sm rounded ${
                filterCategory === cat
                  ? 'text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              style={
                filterCategory === cat ? { backgroundColor: CATEGORY_COLORS[cat] } : {}
              }
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* LISTA DE AUTOMAÇÕES */}
      <div className="space-y-3">
        {filtradas.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Nenhuma automação encontrada</div>
        ) : (
          filtradas.map(auto => (
            <Card key={auto.id} className="p-4 hover:shadow-md transition-shadow cursor-pointer">
              <div className="flex items-start justify-between">
                {/* COLUNA 1: Nome e categoria */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: CATEGORY_COLORS[auto.categoria] }}
                    />
                    <h3 className="font-semibold text-gray-900 truncate">{auto.nome}</h3>
                    {auto.status === 'erro' && (
                      <AlertCircle size={14} className="text-red-600" />
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mb-2">{auto.descricao}</p>

                  {/* Status e timing */}
                  <div className="flex flex-wrap gap-4 text-xs text-gray-600 mb-2">
                    <div className="flex items-center gap-1">
                      {STATUS_ICONS[auto.status]}
                      <span className="font-medium">{STATUS_LABELS[auto.status]}</span>
                    </div>
                    {auto.ultima_execucao && (
                      <div className="flex items-center gap-1">
                        <Clock size={12} />
                        Execução: {new Date(auto.ultima_execucao).toLocaleTimeString('pt-BR')}
                      </div>
                    )}
                    {auto.tempo_medio_execucao && (
                      <div className="flex items-center gap-1">
                        <Zap size={12} />
                        {auto.tempo_medio_execucao}ms
                      </div>
                    )}
                  </div>

                  {/* Erro se houver */}
                  {auto.ultimo_erro && (
                    <div className="bg-red-50 border border-red-200 rounded px-2 py-1 text-xs text-red-700 mt-2">
                      {auto.ultimo_erro}
                    </div>
                  )}

                  {/* Falhas recentes */}
                  {auto.falhas_recentes > 0 && (
                    <div className="text-xs text-orange-600 mt-1">
                      ⚠️ {auto.falhas_recentes} falha(s) recente(s)
                    </div>
                  )}
                </div>

                {/* COLUNA 2: Ações */}
                <div className="flex gap-2 ml-4 flex-shrink-0">
                  <button
                    title="Executar agora"
                    className="p-2 hover:bg-gray-100 rounded transition-colors"
                    onClick={() => alert('Execução manual não implementada nesta fase')}
                  >
                    <Play size={16} className="text-blue-600" />
                  </button>

                  <button
                    title={auto.ativa ? 'Pausar' : 'Ativar'}
                    className="p-2 hover:bg-gray-100 rounded transition-colors"
                    onClick={() => alert(`${auto.ativa ? 'Pausar' : 'Ativar'} não implementado nesta fase`)}
                  >
                    {auto.ativa ? (
                      <Pause size={16} className="text-yellow-600" />
                    ) : (
                      <Play size={16} className="text-green-600" />
                    )}
                  </button>

                  <button
                    title="Ver detalhes"
                    className="p-2 hover:bg-gray-100 rounded transition-colors"
                    onClick={() => setSelectedAuto(auto)}
                  >
                    <Eye size={16} className="text-gray-600" />
                  </button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* MODAL DE DETALHES */}
      {selectedAuto && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-2xl w-full max-h-[80vh] overflow-auto">
            <div className="p-6 border-b border-gray-200 flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{selectedAuto.nome}</h2>
                <p className="text-sm text-gray-500 mt-1">{selectedAuto.descricao}</p>
              </div>
              <button
                onClick={() => setSelectedAuto(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Status geral */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase">Status</label>
                  <div className="flex items-center gap-2 mt-1">
                    {STATUS_ICONS[selectedAuto.status]}
                    <span className="font-medium">{STATUS_LABELS[selectedAuto.status]}</span>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase">Categoria</label>
                  <div
                    className="inline-block px-2 py-1 rounded text-white text-sm mt-1"
                    style={{ backgroundColor: CATEGORY_COLORS[selectedAuto.categoria] }}
                  >
                    {selectedAuto.categoria}
                  </div>
                </div>
              </div>

              {/* Timing */}
              <div className="grid grid-cols-2 gap-4">
                {selectedAuto.ultima_execucao && (
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase">Última execução</label>
                    <div className="mt-1 text-sm text-gray-900">
                      {new Date(selectedAuto.ultima_execucao).toLocaleString('pt-BR')}
                    </div>
                  </div>
                )}
                {selectedAuto.proxima_execucao && (
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase">Próxima execução</label>
                    <div className="mt-1 text-sm text-gray-900">
                      {new Date(selectedAuto.proxima_execucao).toLocaleString('pt-BR')}
                    </div>
                  </div>
                )}
              </div>

              {/* Performance */}
              {selectedAuto.tempo_medio_execucao && (
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase">Performance</label>
                  <div className="mt-1 text-sm text-gray-900">
                    Tempo médio: <span className="font-mono">{selectedAuto.tempo_medio_execucao}ms</span>
                  </div>
                </div>
              )}

              {/* Falhas */}
              {selectedAuto.falhas_recentes > 0 && (
                <div className="bg-red-50 border border-red-200 rounded p-3">
                  <div className="text-sm font-semibold text-red-900">
                    {selectedAuto.falhas_recentes} falha(s) recente(s)
                  </div>
                  {selectedAuto.ultimo_erro && (
                    <div className="text-xs text-red-700 mt-1">{selectedAuto.ultimo_erro}</div>
                  )}
                </div>
              )}

              {/* Dependências */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Dependências</label>
                <div className="mt-2 space-y-2">
                  {selectedAuto.dependencias.funcoes.length > 0 && (
                    <div>
                      <span className="text-xs font-medium text-gray-600">Funções:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {selectedAuto.dependencias.funcoes.map(f => (
                          <span key={f} className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs">
                            {f}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedAuto.dependencias.entidades.length > 0 && (
                    <div>
                      <span className="text-xs font-medium text-gray-600">Entidades:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {selectedAuto.dependencias.entidades.map(e => (
                          <span key={e} className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs">
                            {e}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedAuto.dependencias.webhooks.length > 0 && (
                    <div>
                      <span className="text-xs font-medium text-gray-600">Webhooks:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {selectedAuto.dependencias.webhooks.map(w => (
                          <span key={w} className="bg-purple-100 text-purple-700 px-2 py-1 rounded text-xs">
                            {w}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}