import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  RefreshCw, CheckCircle2, XCircle, AlertTriangle, Clock, Mail,
  MessageSquare, UserCheck, UserX, Ban, FileSearch, Play, Eye
} from 'lucide-react';

const CLASSIFICACOES = [
  { id: 'todos', label: 'Todos', cor: 'bg-slate-100 text-slate-700 border-slate-300' },
  { id: 'confirmado', label: 'Confirmado', cor: 'bg-green-100 text-green-700 border-green-300' },
  { id: 'pendente', label: 'Pendente', cor: 'bg-amber-100 text-amber-700 border-amber-300' },
  { id: 'expirado', label: 'Expirado', cor: 'bg-orange-100 text-orange-700 border-orange-300' },
  { id: 'sem_vinculo', label: 'Sem Vínculo', cor: 'bg-rose-100 text-rose-700 border-rose-300' },
  { id: 'duplicada', label: 'Duplicada', cor: 'bg-slate-200 text-slate-600 border-slate-400' },
  { id: 'bloqueado_nome', label: 'Nome ñ validado', cor: 'bg-purple-100 text-purple-700 border-purple-300' },
  { id: 'bloqueado_idempotencia', label: 'Cooldown ativo', cor: 'bg-blue-100 text-blue-700 border-blue-300' },
];

function formatarData(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatarCpf(cpf) {
  if (!cpf) return '—';
  const d = cpf.replace(/\D/g, '');
  return d.length === 11 ? `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}` : cpf;
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

function CanalBadge({ canal }) {
  if (!canal) return <span className="text-slate-400 text-xs">—</span>;
  if (canal === 'whatsapp') {
    return (
      <div className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700">
        <MessageSquare className="w-3 h-3" /> WhatsApp
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
      <Mail className="w-3 h-3" /> E-mail
    </div>
  );
}

function NomeBadge({ classif }) {
  if (!classif) return null;
  const cores = {
    feminino: 'bg-green-50 text-green-700',
    masculino: 'bg-red-50 text-red-700',
    incerto: 'bg-amber-50 text-amber-700',
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${cores[classif] || 'bg-slate-50 text-slate-600'}`}>
      {classif}
    </span>
  );
}

function TabelaRecuperacao({ detalhes }) {
  if (!detalhes || detalhes.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-green-400" />
        <p className="text-sm">Nenhuma inscrição nesta categoria.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left">
            <th className="px-2 py-2 font-semibold text-slate-600 whitespace-nowrap">Nome / CPF</th>
            <th className="px-2 py-2 font-semibold text-slate-600 whitespace-nowrap">Status</th>
            <th className="px-2 py-2 font-semibold text-slate-600 whitespace-nowrap">Asaas</th>
            <th className="px-2 py-2 font-semibold text-slate-600 whitespace-nowrap">Fonte</th>
            <th className="px-2 py-2 font-semibold text-slate-600 whitespace-nowrap">Classificação</th>
            <th className="px-2 py-2 font-semibold text-slate-600 whitespace-nowrap">Nome Val.</th>
            <th className="px-2 py-2 font-semibold text-slate-600 whitespace-nowrap">Idempotência</th>
            <th className="px-2 py-2 font-semibold text-slate-600 whitespace-nowrap">Ação</th>
            <th className="px-2 py-2 font-semibold text-slate-600 whitespace-nowrap">Canal</th>
            <th className="px-2 py-2 font-semibold text-slate-600 whitespace-nowrap">Motivo Bloqueio</th>
          </tr>
        </thead>
        <tbody>
          {detalhes.map((d) => (
            <tr key={d.inscricao_id} className="border-b border-slate-100 hover:bg-slate-50/50 align-top">
              <td className="px-2 py-2">
                <div className="font-medium text-slate-800 truncate max-w-[140px]">{d.nome || '—'}</div>
                <div className="text-xs text-slate-500">{formatarCpf(d.cpf)}</div>
                {d.email && <div className="text-xs text-slate-400 truncate max-w-[140px]">{d.email}</div>}
              </td>
              <td className="px-2 py-2">
                <Badge variant="outline" className="text-xs">{d.status_pagamento}</Badge>
                <div className="text-xs text-slate-400 mt-0.5">{formatarData(d.created_date)}</div>
              </td>
              <td className="px-2 py-2">
                <Badge variant="outline" className="text-xs">{d.asaas_status || '—'}</Badge>
              </td>
              <td className="px-2 py-2 text-xs text-slate-500">{d.asaas_fonte || '—'}</td>
              <td className="px-2 py-2">
                <Badge variant="outline" className="text-xs capitalize">{d.classificacao || '—'}</Badge>
                {d.causa && <div className="text-xs text-orange-600 mt-0.5">{d.causa}</div>}
              </td>
              <td className="px-2 py-2"><NomeBadge classif={d.nome_classificacao} /></td>
              <td className="px-2 py-2 text-xs text-slate-600">
                {d.idempotencia ? (
                  <div>
                    <div>24h: {d.idempotencia.contatos_24h}</div>
                    <div>72h: {d.idempotencia.contatos_72h}</div>
                    {d.idempotencia.pode ? (
                      <span className="text-green-600 font-medium">✓ Liberado</span>
                    ) : (
                      <span className="text-red-600 font-medium">✗ Bloq.</span>
                    )}
                  </div>
                ) : d.classificacao === 'confirmado' ? (
                  <span className="text-green-600">N/A</span>
                ) : '—'}
              </td>
              <td className="px-2 py-2 text-xs text-slate-700 font-medium">{d.acao || '—'}</td>
              <td className="px-2 py-2"><CanalBadge canal={d.canal} /></td>
              <td className="px-2 py-2 text-xs text-red-600 max-w-[160px]">
                {d.motivo_bloqueio || d.motivo_email || d.erro_email || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function M31AuditoriaRecuperacao72h() {
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [executando, setExecutando] = useState(false);
  const [erro, setErro] = useState(null);
  const [aba, setAba] = useState('todos');
  const [dryRun, setDryRun] = useState(true);
  const [autoAprovar, setAutoAprovar] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const resp = await base44.functions.invoke('m31AuditarRecuperar72h', { dry_run: true });
      setDados(resp.data);
    } catch (e) {
      setErro(e.message || 'Erro ao carregar auditoria');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const executar = async () => {
    setExecutando(true);
    setErro(null);
    try {
      const resp = await base44.functions.invoke('m31AuditarRecuperar72h', {
        dry_run: false,
        auto_aprovar_fila: autoAprovar,
      });
      setDados(resp.data);
    } catch (e) {
      setErro(e.message || 'Erro ao executar recuperação');
    } finally {
      setExecutando(false);
    }
  };

  const detalhesDaAba = () => {
    if (!dados?.detalhes) return [];
    let lista = dados.detalhes;
    if (aba !== 'todos') {
      if (aba === 'bloqueado_nome') {
        lista = lista.filter(d => d.acao === 'analise_manual_nome');
      } else if (aba === 'bloqueado_idempotencia') {
        lista = lista.filter(d => d.acao === 'bloqueado_idempotencia');
      } else {
        lista = lista.filter(d => d.classificacao === aba);
      }
    }
    return lista;
  };

  const contagemPorCategoria = (catId) => {
    if (!dados?.detalhes) return 0;
    if (catId === 'todos') return dados.detalhes.length;
    if (catId === 'bloqueado_nome') return dados.detalhes.filter(d => d.acao === 'analise_manual_nome').length;
    if (catId === 'bloqueado_idempotencia') return dados.detalhes.filter(d => d.acao === 'bloqueado_idempotencia').length;
    return dados.detalhes.filter(d => d.classificacao === catId).length;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-600">Auditando inscrições e consultando Asaas…</p>
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

  const r = dados.resumo || {};

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h1 className="text-lg font-bold text-slate-800">Auditoria + Recuperação — 72h</h1>
            <p className="text-xs text-slate-500">
              {r.total_auditados || 0} inscrições auditadas · Canal WhatsApp: {dados.canal_whatsapp_disponivel ? '✓ Ativo' : '✗ ' + (dados.janela_whatsapp?.motivo || (dados.kill_switch_ativo ? 'kill-switch' : 'indisp.'))}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={carregar} variant="outline" size="sm" disabled={executando}>
              <RefreshCw className="w-4 h-4 mr-1" /> Re-auditar
            </Button>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-[1400px] mx-auto">
        {/* Resumo Executivo */}
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-2">Resumo Executivo</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-2">
            <ResumoCard label="Auditados" valor={r.total_auditados} cor="bg-slate-50 border-slate-200" icon={FileSearch} />
            <ResumoCard label="Confirmados" valor={r.confirmados} cor="bg-green-50 border-green-200" icon={CheckCircle2} sub="→ aprovar + QR" />
            <ResumoCard label="Pendentes" valor={r.pendentes} cor="bg-amber-50 border-amber-200" icon={Clock} sub="→ recuperar" />
            <ResumoCard label="Expirados" valor={r.expirados} cor="bg-orange-50 border-orange-200" icon={AlertTriangle} sub="→ novo link" />
            <ResumoCard label="Sem Vínculo" valor={r.sem_vinculo} cor="bg-rose-50 border-rose-200" icon={XCircle} sub="→ manual" />
            <ResumoCard label="Bloq. Nome" valor={r.bloqueados_nome} cor="bg-purple-50 border-purple-200" icon={UserX} sub="imersão feminina" />
            <ResumoCard label="Bloq. Cooldown" valor={r.bloqueados_idempotencia} cor="bg-blue-50 border-blue-200" icon={Ban} sub="1/24h · 2/72h" />
            <ResumoCard label="Duplicadas" valor={r.bloqueados_duplicada} cor="bg-slate-100 border-slate-300" icon={Ban} />
            <ResumoCard label="Ações Exec." valor={r.acoes_executadas} cor="bg-cyan-50 border-cyan-200" icon={Play} sub={dados.dry_run ? '(dry-run)' : 'executadas'} />
          </div>
        </div>

        {/* Painel de Execução */}
        <div className="bg-white rounded-lg border border-slate-200 p-3 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="dryRun"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              className="w-4 h-4"
            />
            <label htmlFor="dryRun" className="text-sm text-slate-700 cursor-pointer">Modo auditoria (não executa ações)</label>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="autoAprovar"
              checked={autoAprovar}
              onChange={(e) => setAutoAprovar(e.target.checked)}
              className="w-4 h-4"
              disabled={dryRun}
            />
            <label htmlFor="autoAprovar" className={`text-sm cursor-pointer ${dryRun ? 'text-slate-400' : 'text-slate-700'}`}>
              Auto-aprovar fila WhatsApp
            </label>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            {autoAprovar && !dryRun && (
              <span className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Disparos serão automáticos
              </span>
            )}
            <Button
              onClick={executar}
              disabled={executando}
              variant={dryRun ? 'outline' : 'default'}
              size="sm"
            >
              {executando ? (
                <><RefreshCw className="w-4 h-4 mr-1 animate-spin" /> Executando…</>
              ) : dryRun ? (
                <><Eye className="w-4 h-4 mr-1" /> Auditar (somente leitura)</>
              ) : (
                <><Play className="w-4 h-4 mr-1" /> Executar Recuperação</>
              )}
            </Button>
          </div>
        </div>

        {/* Fluxo de Decisão */}
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">Árvore de Decisão</h2>
          <div className="text-xs text-slate-600 space-y-1">
            <div className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> <strong>Confirmado no Asaas:</strong> aprovar inscrição, remover abandono, despachar QR/boas-vindas (sem recuperação)</div>
            <div className="flex items-center gap-2"><Clock className="w-3.5 h-3.5 text-amber-500" /> <strong>Pendente no Asaas:</strong> manter checkout válido, encaminhar para recuperação</div>
            <div className="flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5 text-orange-500" /> <strong>Expirado/Erro:</strong> gerar novo link, preservar histórico, registrar causa</div>
            <div className="flex items-center gap-2"><XCircle className="w-3.5 h-3.5 text-rose-500" /> <strong>Sem vínculo seguro:</strong> análise manual, sem cobrança duplicada</div>
            <div className="flex items-center gap-2 pt-1 border-t border-slate-100 mt-1"><Ban className="w-3.5 h-3.5 text-slate-400" /> Não abordar: aprovadas, canceladas, reembolsadas, duplicadas, opt-out</div>
            <div className="flex items-center gap-2"><UserCheck className="w-3.5 h-3.5 text-purple-500" /> Validar nome (imersão feminina) antes de enviar link</div>
            <div className="flex items-center gap-2"><MessageSquare className="w-3.5 h-3.5 text-green-500" /> WhatsApp se janela ativa (08-20h) e kill-switch off; <Mail className="w-3.5 h-3.5 text-blue-500" /> E-mail como fallback</div>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-2 flex-wrap">
          {CLASSIFICACOES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setAba(cat.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                aba === cat.id ? cat.cor + ' ring-2 ring-offset-1 ring-slate-300' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {cat.label} <span className="ml-1 opacity-60">({contagemPorCategoria(cat.id)})</span>
            </button>
          ))}
        </div>

        {/* Tabela */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">
              {CLASSIFICACOES.find(c => c.id === aba)?.label} · {detalhesDaAba().length} inscrição(ões)
            </span>
            {dados.acoes_executadas && dados.acoes_executadas.length > 0 && !dados.dry_run && (
              <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> {dados.acoes_executadas.length} ações executadas
              </span>
            )}
          </div>
          <TabelaRecuperacao detalhes={detalhesDaAba()} />
        </div>

        <p className="text-xs text-slate-400 text-center pb-4">
          Última auditoria: {formatarData(dados.timestamp)} · Janela: {dados.janela_horas}h · Corte: {formatarData(dados.corte)}
        </p>
      </div>
    </div>
  );
}