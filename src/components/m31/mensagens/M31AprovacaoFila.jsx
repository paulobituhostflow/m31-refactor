/**
 * M31AprovacaoFila — Aprovação manual de disparos da fila global
 * NENHUMA mensagem sai do sistema sem aprovação explícita aqui.
 */
import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { ShieldCheck, Check, X, Clock, Image as ImageIcon } from 'lucide-react';

export default function M31AprovacaoFila() {
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processando, setProcessando] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    const pendentes = await base44.entities.M31FilaMensagem.filter({ status: 'pendente' }, 'created_date', 100);
    setItens(pendentes);
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const aprovar = async (item) => {
    setProcessando(item.id);
    const user = await base44.auth.me().catch(() => null);
    await base44.entities.M31FilaMensagem.update(item.id, {
      aprovado_para_envio: true,
      aprovado_por: user?.email || 'desconhecido',
      aprovado_em: new Date().toISOString(),
    });
    setProcessando(null);
    carregar();
  };

  const cancelar = async (item) => {
    setProcessando(item.id);
    await base44.entities.M31FilaMensagem.update(item.id, {
      status: 'cancelado',
      erro: 'cancelado_manual_pelo_gestor',
      processado_em: new Date().toISOString(),
    });
    setProcessando(null);
    carregar();
  };

  const aguardandoAprovacao = itens.filter(i => i.aprovado_para_envio !== true);
  const aprovados = itens.filter(i => i.aprovado_para_envio === true);

  return (
    <Card className="p-6 border-2" style={{ borderColor: '#8B1A2B' }}>
      <div className="flex items-center gap-3 mb-4">
        <ShieldCheck size={24} style={{ color: '#8B1A2B' }} />
        <div>
          <h3 className="text-lg font-bold text-gray-900">Aprovação Manual de Disparos</h3>
          <p className="text-sm text-gray-600">
            Nenhuma mensagem é enviada sem sua aprovação. {aguardandoAprovacao.length} aguardando · {aprovados.length} aprovada(s) na fila.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Carregando fila...</p>
      ) : itens.length === 0 ? (
        <p className="text-sm text-green-700 flex items-center gap-2"><Check size={16} /> Fila vazia — nada aguardando envio.</p>
      ) : (
        <div className="space-y-3">
          {itens.map(item => {
            const aprovado = item.aprovado_para_envio === true;
            const msg = item.mensagens?.[0];
            return (
              <div key={item.id} className={`p-4 rounded-lg border ${aprovado ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">{item.inscricao_nome || item.telefone}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#F6E9EC', color: '#8B1A2B' }}>{item.automacao}</span>
                      {msg?.image_url && <span className="text-xs text-gray-500 flex items-center gap-1"><ImageIcon size={12} /> com imagem</span>}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{item.telefone}
                      {item.agendado_para && <> · <Clock size={11} className="inline" /> agendado {new Date(item.agendado_para).toLocaleString('pt-BR', { timeZone: 'America/Recife' })}</>}
                    </p>
                    {msg?.message && (
                      <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap bg-gray-50 rounded p-2 border border-gray-100">{msg.message}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    {aprovado ? (
                      <span className="text-xs font-medium text-green-700 flex items-center gap-1"><Check size={14} /> Aprovado</span>
                    ) : (
                      <button
                        onClick={() => aprovar(item)}
                        disabled={processando === item.id}
                        className="px-3 py-1.5 text-xs font-semibold text-white rounded hover:opacity-90 disabled:opacity-50"
                        style={{ background: '#16A34A' }}
                      >
                        <Check size={12} className="inline mr-1" />Aprovar envio
                      </button>
                    )}
                    <button
                      onClick={() => cancelar(item)}
                      disabled={processando === item.id}
                      className="px-3 py-1.5 text-xs font-semibold rounded border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      <X size={12} className="inline mr-1" />Cancelar
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}