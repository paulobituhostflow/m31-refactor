import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, AlertCircle, RefreshCw, Wifi, WifiOff } from 'lucide-react';

/**
 * M31StatusEnvioMensagens
 *
 * Central ÚNICA de monitoramento WhatsApp (UAZAPI).
 * Mostra:
 *   1. Status real da conexão UAZAPI (online/offline + número)
 *   2. Logs de mensagens enviadas (sucesso/erro)
 */
export default function M31StatusEnvioMensagens() {
  const [filtroTipo, setFiltroTipo] = useState('todos');

  // ── Status real da UAZAPI ──
  const { data: uazapi, isLoading: loadingStatus, refetch: refetchStatus } = useQuery({
    queryKey: ['m31uazapiStatus'],
    queryFn: () => base44.functions.invoke('m31CheckUazapiStatus', {}).then(r => r.data),
    refetchInterval: 60000,
  });

  // ── Logs de mensagens ──
  const { data: mensagens = [], isLoading } = useQuery({
    queryKey: ['m31MessageLog'],
    queryFn: async () => {
      const result = await base44.asServiceRole.entities.M31MessageLog.list('-enviado_em', 200);
      return result;
    },
    refetchInterval: 5000,
  });

  const stats = {
    total: mensagens.length,
    sucesso: mensagens.filter(m => m.sucesso).length,
    erro: mensagens.filter(m => !m.sucesso).length,
  };

  const filtradas = mensagens.filter(m => {
    if (filtroTipo === 'sucesso') return m.sucesso;
    if (filtroTipo === 'erro') return !m.sucesso;
    return true;
  });

  const online = uazapi?.connected === true;

  return (
    <div className="space-y-6">
      {/* ── Status da conexão UAZAPI ── */}
      <div className={`rounded-xl p-5 border shadow-sm ${
        loadingStatus
          ? 'bg-gray-50 border-gray-200'
          : online
            ? 'bg-green-50 border-green-200'
            : 'bg-red-50 border-red-200'
      }`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            {loadingStatus ? (
              <RefreshCw className="w-5 h-5 text-gray-400 animate-spin" />
            ) : online ? (
              <Wifi className="w-5 h-5 text-green-600" />
            ) : (
              <WifiOff className="w-5 h-5 text-red-600" />
            )}
            <div>
              <div className={`text-base font-bold ${
                loadingStatus ? 'text-gray-600'
                  : online ? 'text-green-700'
                    : 'text-red-700'
              }`}>
                {loadingStatus ? 'Verificando UAZAPI…' : online ? 'UAZAPI Online' : 'UAZAPI Offline'}
              </div>
              <div className="text-sm text-gray-500 mt-0.5">
                {loadingStatus
                  ? 'Consultando instância…'
                  : online
                    ? <>Número conectado: <strong className="text-gray-700">{uazapi?.phone || '—'}</strong></>
                    : 'Instância desconectada. Nenhuma mensagem será enviada.'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {online && uazapi?.mensagens_hoje != null && (
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-800 tabular-nums">{uazapi.mensagens_hoje}</div>
                <div className="text-xs text-gray-500">msgs hoje</div>
              </div>
            )}
            <button
              onClick={() => refetchStatus()}
              disabled={loadingStatus}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-white border border-gray-200 hover:bg-gray-50 transition disabled:opacity-50"
            >
              <RefreshCw size={14} className={loadingStatus ? 'animate-spin' : ''} />
              Atualizar
            </button>
          </div>
        </div>
      </div>

      {/* ── Cards de Estatísticas de Mensagens ── */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
          <div className="text-sm text-gray-500 mb-1">Total de Envios</div>
          <div className="text-3xl font-bold text-gray-800 tabular-nums">{stats.total}</div>
        </div>
        <div className="bg-green-50 rounded-lg p-4 border border-green-200 shadow-sm">
          <div className="text-sm text-green-700 mb-1">✓ Enviados com Sucesso</div>
          <div className="text-3xl font-bold text-green-700 tabular-nums">{stats.sucesso}</div>
        </div>
        <div className="bg-red-50 rounded-lg p-4 border border-red-200 shadow-sm">
          <div className="text-sm text-red-700 mb-1">✗ Com Erro</div>
          <div className="text-3xl font-bold text-red-700 tabular-nums">{stats.erro}</div>
        </div>
      </div>

      {/* ── Filtros ── */}
      <div className="flex gap-2 border-b border-gray-200 pb-4">
        <button
          onClick={() => setFiltroTipo('todos')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition ${
            filtroTipo === 'todos'
              ? 'text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          style={filtroTipo === 'todos' ? { background: '#7A1F2B' } : {}}
        >
          Todos ({stats.total})
        </button>
        <button
          onClick={() => setFiltroTipo('sucesso')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition ${
            filtroTipo === 'sucesso'
              ? 'bg-green-600 text-white'
              : 'bg-green-50 text-green-700 hover:bg-green-100'
          }`}
        >
          ✓ Sucesso ({stats.sucesso})
        </button>
        <button
          onClick={() => setFiltroTipo('erro')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition ${
            filtroTipo === 'erro'
              ? 'bg-red-600 text-white'
              : 'bg-red-50 text-red-700 hover:bg-red-100'
          }`}
        >
          ✗ Erro ({stats.erro})
        </button>
      </div>

      {/* ── Lista de Mensagens ── */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Carregando...</div>
        ) : filtradas.length === 0 ? (
          <div className="p-8 text-center text-gray-400">Nenhuma mensagem encontrada</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Nome</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Telefone</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Tipo</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Stage</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Data/Hora</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Erro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtradas.map(msg => (
                  <tr key={msg.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3">
                      {msg.sucesso ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-red-600" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{msg.inscricao_nome || '—'}</td>
                    <td className="px-4 py-3 text-sm font-mono text-xs text-gray-600">{msg.telefone || '—'}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {msg.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{msg.stage || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {msg.enviado_em ? new Date(msg.enviado_em).toLocaleString('pt-BR') : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-red-600">
                      {msg.erro ? (
                        <div className="max-w-xs truncate" title={msg.erro}>
                          {msg.erro}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}