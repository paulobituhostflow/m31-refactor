import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  RefreshCw, CheckCircle2, XCircle, AlertTriangle, Clock, Mail,
  MessageSquare, QrCode, Webhook, FileText, Search
} from 'lucide-react';

const CATEGORIAS = [
  { id: 'todos', label: 'Todos', color: 'bg-slate-100 text-slate-700 border-slate-300' },
  { id: 'correta', label: '1. Correto', color: 'bg-green-100 text-green-700 border-green-300' },
  { id: 'sem_inscricao', label: '2. Sem Inscrição', color: 'bg-red-100 text-red-700 border-red-300' },
  { id: 'inscricao_pendente', label: '3. Inscrição Pendente', color: 'bg-amber-100 text-amber-700 border-amber-300' },
  { id: 'sem_qr', label: '4. Sem QR/Confirmação', color: 'bg-orange-100 text-orange-700 border-orange-300' },
  { id: 'webhook_erro', label: '5. Webhook c/ Erro', color: 'bg-rose-100 text-rose-700 border-rose-300' },
];

const MAPA_CAMPO = {
  correta: 'pagamentos_corretos',
  sem_inscricao: 'pagamentos_sem_inscricao',
  inscricao_pendente: 'pagamentos_inscricao_pendente',
  sem_qr: 'pagamentos_sem_qr',
  webhook_erro: 'pagamentos_webhook_erro',
};

function formatarData(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatarCpf(cpf) {
  if (!cpf) return '—';
  const d = cpf.replace(/\D/g, '');
  if (d.length !== 11) return cpf;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
}

function Indicador({ ok, icon: Icon, label }) {
  return (
    <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${
      ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
    }`}>
      <Icon className="w-3 h-3" />
      <span>{label}</span>
      {ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
    </div>
  );
}

function WebhookBadge({ recebido, status, erro }) {
  if (!recebido) {
    return (
      <div className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700">
        <Webhook className="w-3 h-3" />
        <span>Ausente</span>
      </div>
    );
  }
  const cor = status === 'processado' ? 'bg-green-50 text-green-700'
    : status === 'falha' ? 'bg-red-50 text-red-700'
    : status === 'processando' ? 'bg-amber-50 text-amber-700'
    : 'bg-slate-50 text-slate-600';
  return (
    <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${cor}`}>
      <Webhook className="w-3 h-3" />
      <span className="capitalize">{status}</span>
    </div>
  );
}

function EtapaQuebra({ etapa }) {
  if (!etapa) return <span className="text-green-600 text-xs font-medium">✓ Fluxo completo</span>;
  return (
    <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 max-w-xs">
      <span className="font-semibold">Quebra: </span>{etapa}
    </div>
  );
}

function TabelaPagamentos({ pagamentos }) {
  if (!pagamentos || pagamentos.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-green-400" />
        <p className="text-sm">Nenhum pagamento nesta categoria.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left">
            <th className="px-2 py-2 font-semibold text-slate-600 whitespace-nowrap">Pagador / CPF</th>
            <th className="px-2 py-2 font-semibold text-slate-600 whitespace-nowrap">Payment ID</th>
            <th className="px-2 py-2 font-semibold text-slate-600 whitespace-nowrap">Confirmação</th>
            <th className="px-2 py-2 font-semibold text-slate-600 whitespace-nowrap">Asaas</th>
            <th className="px-2 py-2 font-semibold text-slate-600 whitespace-nowrap">Webhook</th>
            <th className="px-2 py-2 font-semibold text-slate-600 whitespace-nowrap">Inscrição</th>
            <th className="px-2 py-2 font-semibold text-slate-600 whitespace-nowrap">QR</th>
            <th className="px-2 py-2 font-semibold text-slate-600 whitespace-nowrap">WhatsApp</th>
            <th className="px-2 py-2 font-semibold text-slate-600 whitespace-nowrap">Email</th>
            <th className="px-2 py-2 font-semibold text-slate-600 whitespace-nowrap">Etapa da Quebra</th>
          </tr>
        </thead>
        <tbody>
          {pagamentos.map((p) => (
            <tr key={p.payment_id} className="border-b border-slate-100 hover:bg-slate-50/50 align-top">
              <td className="px-2 py-2">
                <div className="font-medium text-slate-800 truncate max-w-[140px]">{p.pagador_nome || '—'}</div>
                <div className="text-xs text-slate-500">{formatarCpf(p.pagador_cpf)}</div>
                {p.inscricao_tipo && (
                  <div className="text-xs text-slate-400 mt-0.5">{p.inscricao_tipo}</div>
                )}
              </td>
              <td className="px-2 py-2">
                <code className="text-xs text-slate-600">{p.payment_id?.slice(0, 16)}</code>
                {p.valor && <div className="text-xs text-slate-500">R$ {p.valor.toFixed(2)}</div>}
              </td>
              <td className="px-2 py-2 text-xs text-slate-600 whitespace-nowrap">
                {formatarData(p.data_confirmacao)}
              </td>
              <td className="px-2 py-2">
                <Badge variant="outline" className="text-xs">
                  {p.status_asaas}
                </Badge>
                {p.billing_type && (
                  <div className="text-xs text-slate-400 mt-0.5">{p.billing_type}</div>
                )}
              </td>
              <td className="px-2 py-2">
                <WebhookBadge recebido={p.webhook_recebido} status={p.webhook_status} erro={p.webhook_erro} />
                {p.webhook_erro && p.webhook_status !== 'processado' && (
                  <div className="text-xs text-red-500 mt-0.5 max-w-[120px] truncate" title={p.webhook_erro}>
                    {p.webhook_erro}
                  </div>
                )}
              </td>
              <td className="px-2 py-2">
                {p.inscricao_id ? (
                  <>
                    <div className="font-medium text-slate-700 truncate max-w-[120px]">{p.inscricao_nome || '—'}</div>
                    <Badge variant="outline" className="text-xs mt-0.5">
                      {p.inscricao_status}
                    </Badge>
                  </>
                ) : (
                  <span className="text-red-600 text-xs font-medium">Não vinculada</span>
                )}
              </td>
              <td className="px-2 py-2">
                <Indicador ok={p.qr_gerado} icon={QrCode} label="" />
              </td>
              <td className="px-2 py-2">
                <Indicador ok={p.whatsapp_enviado} icon={MessageSquare} label="" />
              </td>
              <td className="px-2 py-2">
                <Indicador ok={p.email_enviado} icon={Mail} label="" />
              </td>
              <td className="px-2 py-2">
                <EtapaQuebra etapa={p.etapa_quebra} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TabelaCamisas({ compras }) {
  if (!compras?.length) return <div className="text-center py-8 text-sm text-slate-500">Nenhuma compra de camisa confirmada nesta janela.</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-slate-200 bg-slate-50 text-left">
          {['Compra de camisa', 'Pedido', 'Valor', 'Status Asaas', 'Status do pedido', 'Resultado'].map(h => <th key={h} className="px-3 py-2 font-semibold text-slate-600 whitespace-nowrap">{h}</th>)}
        </tr></thead>
        <tbody>{compras.map(c => {
          const ok = c.resultado === 'correto';
          return <tr key={c.payment_id} className="border-b border-slate-100 align-top">
            <td className="px-3 py-2"><div className="font-medium text-slate-800">{c.pedido_nome || 'Pedido não localizado'}</div>{c.inscrita_tambem && <div className="text-xs text-slate-500 mt-0.5">Também inscrita: {c.inscricao_complementar_nome || 'sim'}</div>}</td>
            <td className="px-3 py-2"><div className="font-medium">{c.numero_pedido != null ? `#M31${String(c.numero_pedido).padStart(3, '0')}` : '—'}</div><code className="text-xs text-slate-400">{c.pedido_id?.slice(0, 12)}</code></td>
            <td className="px-3 py-2 whitespace-nowrap">R$ {Number(c.valor || 0).toFixed(2)}</td>
            <td className="px-3 py-2"><Badge variant="outline">{c.status_asaas || '—'}</Badge></td>
            <td className="px-3 py-2"><Badge variant="outline">{c.status_pedido || '—'}</Badge></td>
            <td className="px-3 py-2">{ok ? <span className="text-green-700 font-medium">✓ Correto</span> : <EtapaQuebra etapa={c.etapa_quebra} />}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  );
}

function ResumoCard({ label, valor, cor, icon: Icon, sub }) {
  return (
    <div className={`rounded-lg border p-3 ${cor}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4" />
        <span className="text-xs font-medium text-slate-600 uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-2xl font-bold text-slate-800">{valor}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function M31AuditoriaPagamentos72h() {
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [aba, setAba] = useState('todos');
  const [busca, setBusca] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const resp = await base44.functions.invoke('m31AuditoriaPagamentos72h', {});
      setDados(resp.data);
    } catch (e) {
      setErro(e.message || 'Erro ao carregar auditoria');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const pagamentosDaAba = () => {
    if (!dados) return [];
    let lista;
    if (aba === 'todos') {
      lista = [
        ...dados.pagamentos_corretos,
        ...dados.pagamentos_sem_inscricao,
        ...dados.pagamentos_inscricao_pendente,
        ...dados.pagamentos_sem_qr,
        ...dados.pagamentos_webhook_erro,
      ];
    } else {
      lista = dados[MAPA_CAMPO[aba]] || [];
    }
    if (busca.trim()) {
      const q = busca.toLowerCase();
      lista = lista.filter(p =>
        (p.pagador_nome || '').toLowerCase().includes(q) ||
        (p.pagador_cpf || '').includes(q.replace(/\D/g, '')) ||
        (p.payment_id || '').toLowerCase().includes(q) ||
        (p.inscricao_nome || '').toLowerCase().includes(q)
      );
    }
    return lista;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-600">Consultando pagamentos no Asaas e cruzando com o sistema…</p>
        </div>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <p className="text-sm text-red-600 mb-4">{erro}</p>
          <Button onClick={carregar} variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" /> Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  if (!dados) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h1 className="text-lg font-bold text-slate-800">Auditoria de Pagamentos — 72h</h1>
            <p className="text-xs text-slate-500">
              {dados.total_pagamentos_asaas} pagamentos confirmados no Asaas · {dados.total_webhooks_recebidos} webhooks recebidos · {dados.total_reconciliados_safety_net} reconciliados pelo safety net
            </p>
          </div>
          <Button onClick={carregar} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-1" /> Atualizar
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-[1400px] mx-auto">
        {/* Resumo Final */}
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-2">Resumo Executivo</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
            <ResumoCard label="Asaas (72h)" valor={dados.total_pagamentos_asaas} cor="bg-blue-50 border-blue-200" icon={FileText} />
            <ResumoCard label="Inscrições" valor={dados.total_pagamentos_inscricao ?? 0} cor="bg-violet-50 border-violet-200" icon={FileText} />
            <ResumoCard label="Camisas" valor={dados.total_compras_camisa ?? 0} cor="bg-pink-50 border-pink-200" icon={FileText} sub={`${dados.total_camisas_com_erro ?? 0} com divergência`} />
            <ResumoCard label="Webhooks" valor={dados.total_webhooks_recebidos} cor="bg-indigo-50 border-indigo-200" icon={Webhook} />
            <ResumoCard label="Safety Net" valor={dados.total_reconciliados_safety_net} cor="bg-cyan-50 border-cyan-200" icon={Search} sub="vinculados sem webhook" />
            <ResumoCard label="Corretos" valor={dados.total_correto} cor="bg-green-50 border-green-200" icon={CheckCircle2} />
            <ResumoCard label="Sem Inscrição" valor={dados.total_sem_inscricao} cor="bg-red-50 border-red-200" icon={XCircle} />
            <ResumoCard label="Inscr. Pendente" valor={dados.total_inscricao_pendente} cor="bg-amber-50 border-amber-200" icon={Clock} />
            <ResumoCard label="Sem QR/Wpp" valor={dados.total_sem_qr} cor="bg-orange-50 border-orange-200" icon={AlertTriangle} />
            <ResumoCard label="Pendentes Correção" valor={dados.total_pendentes_correcao} cor="bg-rose-50 border-rose-200" icon={AlertTriangle} sub="precisa ação" />
          </div>
        </div>

        {/* Fluxo de Etapas */}
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">Fluxo Esperado</h2>
          <div className="flex items-center gap-1 text-xs flex-wrap">
            {['Asaas confirmou', 'Webhook chegou', 'Pagamento vinculado', 'Inscrição aprovada', 'QR gerado', 'Confirmação enviada'].map((etapa, i) => (
              <React.Fragment key={i}>
                <div className="px-2 py-1 rounded bg-slate-100 text-slate-600 font-medium">{etapa}</div>
                {i < 5 && <span className="text-slate-300">→</span>}
              </React.Fragment>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-2">A coluna "Etapa da Quebra" indica exatamente onde o fluxo parou para cada pagamento.</p>
        </div>

        {/* Compras de camisa — fluxo financeiro independente */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-100">
            <span className="text-sm font-semibold text-slate-700">Compras de camisa · {dados.total_compras_camisa ?? 0}</span>
            <p className="text-xs text-slate-500 mt-0.5">Asaas → webhook → pedido da camisa → pago. Inscrição e QR não fazem parte desta conciliação.</p>
          </div>
          <TabelaCamisas compras={dados.compras_camisa || []} />
        </div>

        {/* Filtros de inscrições */}
        <div className="flex items-center gap-2 flex-wrap">
          {CATEGORIAS.map((cat) => {
            const count = cat.id === 'todos'
              ? (dados.total_correto + dados.total_sem_inscricao + dados.total_inscricao_pendente + dados.total_sem_qr + dados.total_webhook_erro)
              : dados[`total_${cat.id}`] || 0;
            return (
              <button
                key={cat.id}
                onClick={() => setAba(cat.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                  aba === cat.id ? cat.color + ' ring-2 ring-offset-1 ring-slate-300' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {cat.label} <span className="ml-1 opacity-60">({count})</span>
              </button>
            );
          })}
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar nome, CPF, payment_id…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-md w-56 focus:outline-none focus:ring-1 focus:ring-slate-300"
              />
            </div>
          </div>
        </div>

        {/* Tabela */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">
              {CATEGORIAS.find(c => c.id === aba)?.label} · {pagamentosDaAba().length} pagamento(s)
            </span>
          </div>
          <TabelaPagamentos pagamentos={pagamentosDaAba()} />
        </div>

        {/* Inscrições aprovadas sem QR (extras — não vinculadas a pagamentos 72h) */}
        {dados.inscricoes_aprovadas_sem_qr_extras && dados.inscricoes_aprovadas_sem_qr_extras.length > 0 && (
          <div className="bg-white rounded-lg border border-orange-200 overflow-hidden">
            <div className="px-3 py-2 border-b border-orange-100 bg-orange-50">
              <span className="text-sm font-semibold text-orange-700">
                Inscrições Aprovadas sem QR/Confirmação (fora da janela de pagamentos 72h) · {dados.inscricoes_aprovadas_sem_qr_extras.length}
              </span>
            </div>
            <TabelaPagamentos pagamentos={dados.inscricoes_aprovadas_sem_qr_extras} />
          </div>
        )}

        <p className="text-xs text-slate-400 text-center pb-4">
          Última busca: {formatarData(dados.timestamp_busca)} · Janela: {dados.janela_horas}h · Corte: {formatarData(dados.corte)}
        </p>
      </div>
    </div>
  );
}