/**
 * M31FilasOperacionais — Visualização de filas operacionais
 * Parte da Central de Operações (FASE 1)
 */

import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { CheckCircle, Inbox } from 'lucide-react';
import M31AprovacaoFila from '@/components/m31/mensagens/M31AprovacaoFila';

const FILAS = [
  {
    id: 'fila_boas_vindas',
    nome: 'Boas-vindas',
    descricao: 'Inscrições aguardando envio de mensagem de boas-vindas',
    entidade: 'EventoM31Inscricao',
    filtro: { fila_boas_vindas: true, status_envio_grupo: { $ne: 'enviado' } },
    acao: 'Enviar boas-vindas',
    icone: '👋'
  },
  {
    id: 'fila_recuperacao',
    nome: 'Recuperação de pagamento',
    descricao: 'Inscrições pendentes aguardando aprovação manual para envio de cobrança',
    entidade: 'EventoM31Inscricao',
    filtro: { fila_recuperacao: true, status_fila_recuperacao: 'aguardando_aprovacao' },
    acao: 'Revisar para aprovação',
    icone: '💰'
  },
  {
    id: 'fila_qrcode',
    nome: 'QR Code pendente',
    descricao: 'Inscrições com QR Code gerado mas não enviado',
    entidade: 'EventoM31Inscricao',
    filtro: { qr_envio_status: 'gerado_nao_enviado' },
    acao: 'Enviar QR Code',
    icone: '📱'
  },
  {
    id: 'fila_grupo_wa',
    nome: 'Entrada no grupo',
    descricao: 'Inscrições com link do grupo enviado mas não confirmou entrada',
    entidade: 'EventoM31Inscricao',
    filtro: { status_envio_grupo: 'enviado', entrou_no_grupo: false },
    acao: 'Confirmar entrada',
    icone: '👥'
  },
];

export default function M31FilasOperacionais() {
  const [filas, setFilas] = useState(FILAS.map(f => ({ ...f, quantidade: 0, loading: true })));
  const [expandedFila, setExpandedFila] = useState(null);

  // Carregar contagens de cada fila
  useEffect(() => {
    const carregarFilas = async () => {
      try {
        // Para cada fila, contar registros
        const resultados = await Promise.all(
          FILAS.map(async fila => {
            try {
              const items = await base44.entities.EventoM31Inscricao.filter(fila.filtro);
              return {
                ...fila,
                quantidade: items.length || 0,
                loading: false,
              };
            } catch (err) {
              console.error(`Erro ao carregar fila ${fila.id}:`, err);
              return { ...fila, quantidade: 0, loading: false, erro: err.message };
            }
          })
        );

        setFilas(resultados);
      } catch (err) {
        console.error('Erro ao carregar filas:', err);
      }
    };

    carregarFilas();
  }, []);

  const totalItems = filas.reduce((acc, f) => acc + (f.quantidade || 0), 0);

  return (
    <div className="space-y-6 p-6">
      {/* APROVAÇÃO MANUAL DE DISPAROS — nada sai sem aprovação */}
      <M31AprovacaoFila />

      {/* RESUMO GERAL */}
      <Card className="p-6 bg-gradient-to-r from-rose-50 to-pink-50 border-rose-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Filas Operacionais</h3>
            <p className="text-sm text-gray-600 mt-1">
              {totalItems} item(ns) aguardando processamento
            </p>
          </div>
          <Inbox size={32} className="opacity-20" style={{ color: '#7A1F2B' }} />
        </div>
      </Card>

      {/* FILAS */}
      <div className="grid grid-cols-2 gap-4">
        {filas.map(fila => (
          <Card
            key={fila.id}
            className="p-4 cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setExpandedFila(expandedFila === fila.id ? null : fila.id)}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{fila.icone}</span>
                <div>
                  <h4 className="font-semibold text-gray-900">{fila.nome}</h4>
                  <p className="text-xs text-gray-500 mt-1">{fila.descricao}</p>
                </div>
              </div>
            </div>

            {/* Indicador de quantidade */}
            <div className="mt-4 flex items-center justify-between">
              {fila.loading ? (
                <div className="text-sm text-gray-500">Carregando...</div>
              ) : (
                <>
                  <div className="text-2xl font-bold text-gray-900">
                    {fila.quantidade}
                  </div>
                  {fila.quantidade > 0 && (
                    <div className="text-xs font-medium px-2 py-1 rounded bg-yellow-100 text-yellow-800">
                      Ação necessária
                    </div>
                  )}
                  {fila.quantidade === 0 && (
                    <div className="flex items-center gap-1 text-xs text-green-600">
                      <CheckCircle size={14} />
                      Limpo
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Botão de ação */}
            {fila.quantidade > 0 && (
              <button className="w-full mt-3 px-3 py-2 text-xs font-medium text-white rounded hover:opacity-90 transition-opacity" style={{ background: '#7A1F2B' }}>
                {fila.acao}
              </button>
            )}

            {/* Expandir detalhes */}
            {expandedFila === fila.id && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-xs text-gray-600">
                  Detalhes não implementados nesta fase.
                </p>
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* LEGENDA */}
      <Card className="p-4 bg-gray-50">
        <h4 className="text-xs font-semibold text-gray-700 uppercase mb-2">Sobre as filas</h4>
        <ul className="text-xs text-gray-600 space-y-1">
          <li>• <strong>Boas-vindas:</strong> Primeiro contato automático após inscrição aprovada</li>
          <li>• <strong>Recuperação:</strong> Inscrições pendentes que precisam de follow-up</li>
          <li>• <strong>QR Code:</strong> Código de entrada ainda não enviado</li>
          <li>• <strong>Entrada no grupo:</strong> Grupo enviado mas participante não entrou</li>
        </ul>
      </Card>
    </div>
  );
}