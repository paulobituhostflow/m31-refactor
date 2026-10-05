/**
 * M31PendenciasConciliacao — Auditoria de Inscrições (mobile-first).
 * Cada linha representa uma EventoM31Inscricao com pendência.
 * NÃO cria inscrições. NÃO dispara WhatsApp/QR/automação.
 * Mobile: cards. Desktop: tabela com coluna fixa e scroll horizontal.
 */
import { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { TOKENS } from '@/lib/m31DesignTokens';
import { PageHeader, feedback } from '@/components/m31/ui';
import { useM31PendenciasConciliacao, matchesFilter, resolverMotivoPendencia } from '@/hooks/useM31PendenciasConciliacao';
import PendenciaCards from './PendenciaCards';
import PendenciaFilters from './PendenciaFilters';
import PendenciaMobileCard from './PendenciaMobileCard';
import PendenciaTable from './PendenciaTable';
import PendenciaActionDrawer from './PendenciaActionDrawer';
import { Search, Download, SlidersHorizontal } from 'lucide-react';

function exportCSV(pendencias) {
  const headers = ['Nome', 'WhatsApp', 'Email', 'CPF', 'Cidade/UF', 'Tipo', 'Origem', 'Gateway', 'Status Pag', 'Valor', 'Código', 'Motivos', 'Prioridade', 'Status Análise', 'Responsável', 'Observação'];
  const rows = pendencias.map(p => [p.nome, p.whatsapp, p.email, p.cpf, `${p.cidade}/${p.estado}`, p.tipo_inscricao, p.origem, p.gateway, p.status_pagamento, p.valor, p.codigo_inscricao, p.motivos.join('; '), p.prioridade, p.status_analise, p.responsavel_revisao, p.observacao].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(','));
  const csv = [headers.map(h => `"${h}"`).join(','), ...rows].join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'auditoria_inscricoes.csv'; a.click();
  URL.revokeObjectURL(url);
}

export default function M31PendenciasConciliacao() {
  const { pendencias, resumoCamadas, isLoading, refetch } = useM31PendenciasConciliacao();
  const [user, setUser] = useState(null);
  const [selectedFilters, setSelectedFilters] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPendencia, setSelectedPendencia] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768);

  useEffect(() => { base44.auth.me().then(setUser).catch(() => {}); }, []);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const toggleFilter = (id) => setSelectedFilters(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]);

  const handleToggleMotivo = async (p, motivo) => {
    try {
      const novos = await resolverMotivoPendencia(p, motivo, user?.email);
      refetch();
      if ((p.motivos || []).every(m => novos.includes(m))) feedback.success('Todos os motivos resolvidos — pendência concluída ✓');
      else feedback.success('Motivo atualizado.');
    } catch (err) {
      feedback.error('Erro ao atualizar motivo: ' + (err.message || 'desconhecido'));
    }
  };

  const filtered = useMemo(() => {
    const exibindoResolvidas = selectedFilters.includes('resolvido');
    const pediuCamadaSecundaria = selectedFilters.some(f => ['dados_a_completar','sugestao_conciliacao'].includes(f));
    let result = exibindoResolvidas
      ? pendencias
      : pendencias.filter(p => !['resolvido', 'corrigido', 'descartado'].includes(p.status_analise));
    // Fila principal = somente contradição/falha que exige decisão ou ação.
    // Qualidade cadastral e sugestões permanecem pesquisáveis nos filtros avançados.
    if (!pediuCamadaSecundaria && selectedFilters.length === 0) result = result.filter(p => p.auditoria_real?.length > 0);
    if (selectedFilters.length > 0) result = result.filter(p => selectedFilters.some(f => matchesFilter(p, f)));
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      result = result.filter(p => (p.nome || '').toLowerCase().includes(term) || (p.email || '').toLowerCase().includes(term) || (p.whatsapp || '').includes(term) || (p.cpf || '').includes(term) || (p.codigo_inscricao || '').toLowerCase().includes(term));
    }
    return result;
  }, [pendencias, selectedFilters, searchTerm]);

  const inputStyle = { padding: '8px 10px 8px 32px', background: TOKENS.surface, border: `1.5px solid ${TOKENS.borderStrong}`, borderRadius: TOKENS.radius.md, fontSize: '13px', color: TOKENS.text, outline: 'none', fontFamily: TOKENS.font.body, flex: 1, minWidth: 0 };

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: 'Inscrições' }, { label: 'Auditoria' }]}
        title="Auditoria de Inscrições"
        subtitle="Revise e organize inscrições com dados incompletos ou inconsistentes"
      />

      {/* Search + Export */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
          <Search size={14} color={TOKENS.textSubtle} style={{ position: 'absolute', left: '10px', pointerEvents: 'none' }} />
          <input style={inputStyle} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar por nome, WhatsApp, CPF, e-mail, código..." />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          style={{ padding: '8px 12px', borderRadius: TOKENS.radius.md, border: `1px solid ${showFilters ? TOKENS.primary : TOKENS.borderStrong}`, background: showFilters ? TOKENS.primarySoft : TOKENS.surface, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', fontWeight: '600', color: showFilters ? TOKENS.primary : TOKENS.textMuted }}
        >
          <SlidersHorizontal size={14} /> Filtros {selectedFilters.length > 0 && `(${selectedFilters.length})`}
        </button>
        <button onClick={() => exportCSV(filtered)} style={{ padding: '8px 12px', borderRadius: TOKENS.radius.md, border: `1px solid ${TOKENS.borderStrong}`, background: TOKENS.surface, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', fontWeight: '600', color: TOKENS.textMuted }}>
          <Download size={14} /> CSV
        </button>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: TOKENS.textMuted, fontSize: '14px' }}>
          <div style={{ width: '28px', height: '28px', border: `2px solid ${TOKENS.border}`, borderTopColor: TOKENS.primary, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          Computando pendências...
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      ) : (
        <>
          <PendenciaCards pendencias={pendencias} resumoCamadas={resumoCamadas} />

          {showFilters && (
            <PendenciaFilters
              selected={selectedFilters}
              onToggle={toggleFilter}
              onClear={() => setSelectedFilters([])}
              resultCount={filtered.length}
            />
          )}

          {filtered.length === 0 ? (
            <div style={{ background: TOKENS.surface, border: `1px solid ${TOKENS.border}`, borderRadius: TOKENS.radius.lg, padding: '40px', textAlign: 'center', boxShadow: TOKENS.shadowSm }}>
              <p style={{ fontSize: '14px', color: TOKENS.textMuted, margin: 0 }}>Nenhuma pendência encontrada.</p>
            </div>
          ) : isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filtered.map(p => <PendenciaMobileCard key={p.id} pendencia={p} onClick={setSelectedPendencia} onToggleMotivo={handleToggleMotivo} />)}
            </div>
          ) : (
            <PendenciaTable pendencias={filtered} onRowClick={setSelectedPendencia} />
          )}
        </>
      )}

      <PendenciaActionDrawer
        pendencia={selectedPendencia}
        user={user}
        onClose={() => setSelectedPendencia(null)}
        onNext={() => {
          if (!selectedPendencia || filtered.length === 0) return setSelectedPendencia(null);
          const idx = filtered.findIndex(p => p.id === selectedPendencia.id);
          setSelectedPendencia(filtered[idx + 1] || filtered[idx > 0 ? idx - 1 : 0] || null);
        }}
      />
    </div>
  );
}