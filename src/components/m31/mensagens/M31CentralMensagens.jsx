import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { MessageSquare, Search, Pencil, Power, Loader2, Smartphone, Mail } from 'lucide-react';
import { useM31Auth } from '@/lib/m31Auth';
import { CATEGORIAS, labelCategoria } from './centralMensagensUtils';
import CentralMensagensEditor from './CentralMensagensEditor';

function formatarData(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
}

export default function M31CentralMensagens() {
  const { user } = useM31Auth();
  const [busca, setBusca] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('todas');
  const [editando, setEditando] = useState(null);
  const [confirmToggle, setConfirmToggle] = useState(null);
  const [toggling, setToggling] = useState(false);

  const { data: templates = [], isLoading, refetch } = useQuery({
    queryKey: ['m31_message_templates'],
    queryFn: () => base44.entities.M31MessageTemplate.list('-alterado_em', 200),
  });

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return templates.filter((t) => {
      if (filtroCategoria !== 'todas' && t.categoria !== filtroCategoria) return false;
      if (!q) return true;
      return (
        (t.name || '').toLowerCase().includes(q) ||
        (t.descricao || '').toLowerCase().includes(q) ||
        (t.chave_unica || '').toLowerCase().includes(q) ||
        (t.content || '').toLowerCase().includes(q)
      );
    });
  }, [templates, busca, filtroCategoria]);

  // Agrupa por categoria
  const grupos = useMemo(() => {
    const map = {};
    for (const t of filtrados) {
      const cat = t.categoria || 'sem_categoria';
      (map[cat] = map[cat] || []).push(t);
    }
    return Object.entries(map).sort((a, b) => labelCategoria(a[0]).localeCompare(labelCategoria(b[0])));
  }, [filtrados]);

  const aplicarToggle = async () => {
    if (!confirmToggle) return;
    setToggling(true);
    try {
      await base44.entities.M31MessageTemplate.update(confirmToggle.id, {
        is_active: !confirmToggle.is_active,
        alterado_por: user?.email || 'desconhecido',
        alterado_em: new Date().toISOString(),
      });
      await refetch();
      setConfirmToggle(null);
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-lg bg-brand/15 flex items-center justify-center">
          <MessageSquare size={20} className="text-brand-bright" />
        </div>
        <div>
          <h1 className="text-xl font-jakarta font-semibold text-white">Central de Mensagens</h1>
          <p className="text-sm text-m31-text-muted">Edite e ative os modelos de mensagens automáticas do WhatsApp.</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-2 mt-5 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-m31-text-muted" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, finalidade ou conteúdo…"
            className="w-full pl-9 pr-3 py-2 rounded-md text-sm"
          />
        </div>
        <select
          value={filtroCategoria}
          onChange={(e) => setFiltroCategoria(e.target.value)}
          className="rounded-md text-sm px-3 py-2 sm:w-52"
        >
          <option value="todas">Todas as categorias</option>
          {CATEGORIAS.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-m31-text-muted">
          <Loader2 className="animate-spin" size={22} />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-16 text-m31-text-muted">Nenhum modelo encontrado.</div>
      ) : (
        <div className="space-y-6">
          {grupos.map(([cat, itens]) => (
            <div key={cat}>
              <h3 className="text-xs uppercase tracking-wide text-m31-text-muted mb-2 px-1">
                {labelCategoria(cat)} <span className="opacity-60">({itens.length})</span>
              </h3>
              <div className="space-y-2">
                {itens.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 bg-s1 border border-m31-border rounded-lg px-4 py-3 hover:border-m31-border-light transition-colors"
                  >
                    <div className="text-m31-text-muted">
                      {t.canal === 'email' ? <Mail size={16} /> : <Smartphone size={16} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white truncate">{t.name}</span>
                        {t.essencial && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-pill bg-amber-500/15 text-amber-400 shrink-0">essencial</span>
                        )}
                      </div>
                      <p className="text-xs text-m31-text-muted truncate">{t.descricao || t.chave_unica}</p>
                      <p className="text-[11px] text-m31-text-muted/70 mt-0.5">Alterado: {formatarData(t.alterado_em)}</p>
                    </div>

                    {/* Status */}
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-pill shrink-0 ${
                        t.is_active !== false ? 'bg-emerald-500/15 text-emerald-400' : 'bg-m31-hover text-m31-text-muted'
                      }`}
                    >
                      {t.is_active !== false ? 'Ativo' : 'Inativo'}
                    </span>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => setEditando(t)}
                        className="p-2 rounded-md hover:bg-m31-hover text-m31-text-muted hover:text-white"
                        title="Editar"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => setConfirmToggle(t)}
                        className={`p-2 rounded-md hover:bg-m31-hover ${t.is_active !== false ? 'text-emerald-400' : 'text-m31-text-muted'}`}
                        title={t.is_active !== false ? 'Desativar' : 'Ativar'}
                      >
                        <Power size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor */}
      {editando && (
        <CentralMensagensEditor
          template={editando}
          userEmail={user?.email}
          onClose={() => setEditando(null)}
          onSaved={refetch}
        />
      )}

      {/* Confirmação de toggle */}
      {confirmToggle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !toggling && setConfirmToggle(null)}>
          <div className="bg-s1 border border-m31-border rounded-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-jakarta font-semibold text-white">
              {confirmToggle.is_active !== false ? 'Desativar modelo?' : 'Ativar modelo?'}
            </h3>
            <p className="text-sm text-m31-text-muted mt-2">
              {confirmToggle.is_active !== false ? (
                <>Ao desativar <strong className="text-white">{confirmToggle.name}</strong>, o sistema deixará de disparar esta mensagem no fluxo de <strong className="text-white">{labelCategoria(confirmToggle.categoria)}</strong>.</>
              ) : (
                <>Ao ativar <strong className="text-white">{confirmToggle.name}</strong>, o sistema voltará a disparar esta mensagem no fluxo de <strong className="text-white">{labelCategoria(confirmToggle.categoria)}</strong>.</>
              )}
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setConfirmToggle(null)} disabled={toggling} className="text-sm px-3 py-2 rounded-md text-m31-text-muted hover:bg-m31-hover">
                Cancelar
              </button>
              <button
                onClick={aplicarToggle}
                disabled={toggling}
                className={`inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-md text-white ${
                  confirmToggle.is_active !== false ? 'bg-red-600 hover:bg-red-500' : 'bg-emerald-600 hover:bg-emerald-500'
                }`}
              >
                {toggling && <Loader2 size={14} className="animate-spin" />}
                {confirmToggle.is_active !== false ? 'Desativar' : 'Ativar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}