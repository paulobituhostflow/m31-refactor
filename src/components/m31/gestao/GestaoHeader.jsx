import { useState, useRef, useEffect } from 'react';
import { Search, MoreHorizontal, Sparkles, Download, X, Wand2 } from 'lucide-react';
import { TOKENS as T } from '@/lib/m31DesignTokens';
import { TAREFA_AREA_GRUPOS } from '@/lib/m31TarefaAreas';

const TIPOS = [
  { value: '', label: 'Tipo' },
  { value: 'espiritual', label: 'Espiritual' },
  { value: 'estrategica', label: 'Estratégica' },
  { value: 'operacional', label: 'Operacional' },
  { value: 'comercial', label: 'Comercial' },
  { value: 'experiencia', label: 'Experiência' },
  { value: 'producao', label: 'Produção' },
  { value: 'voluntariado', label: 'Voluntariado' },
];

export default function GestaoHeader({
  edicaoNome, search, setSearch, filtroArea, setFiltroArea,
  filtroTipo, setFiltroTipo, filtroResponsavel, setFiltroResponsavel, responsaveis = [],
  onNovoPacote, onSugerirIA, onEnriquecerIA, onExportar, podeCriar, isMobile, hideAreaFilter,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [menuOpen]);

  if (isMobile) {
    // Mobile: title + search on row 1, actions menu on row 2 (no "Novo pacote" button)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ flexShrink: 0 }}>
            <h1 style={{ fontSize: '20px', fontWeight: '700', color: T.text, margin: 0, fontFamily: T.font.body }}>Tarefas</h1>
            {edicaoNome && <span style={{ fontSize: '12px', color: T.textMuted }}>{edicaoNome}</span>}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div ref={ref} style={{ position: 'relative' }}>
              <button onClick={() => setMenuOpen(o => !o)} aria-label="Ações" style={{ minWidth: '44px', minHeight: '44px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius.md, cursor: 'pointer', color: T.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MoreHorizontal size={18} />
              </button>
              {menuOpen && (
                <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius.md, boxShadow: T.shadowLg, zIndex: 51, minWidth: '180px', overflow: 'hidden' }}>
                  <button onClick={() => { setMenuOpen(false); onSugerirIA(); }} style={{ width: '100%', textAlign: 'left', padding: '12px 14px', minHeight: '44px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: T.text, fontFamily: T.font.body, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Sparkles size={16} color={T.primary} /> Sugerir com IA
                  </button>
                  <button onClick={() => { setMenuOpen(false); onEnriquecerIA(); }} style={{ width: '100%', textAlign: 'left', padding: '12px 14px', minHeight: '44px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: T.text, fontFamily: T.font.body, display: 'flex', alignItems: 'center', gap: '8px', borderTop: `1px solid ${T.borderSubtle}` }}>
                    <Wand2 size={16} color={T.primary} /> Enriquecer com IA
                  </button>
                  <button onClick={() => { setMenuOpen(false); onExportar(); }} style={{ width: '100%', textAlign: 'left', padding: '12px 14px', minHeight: '44px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: T.text, fontFamily: T.font.body, display: 'flex', alignItems: 'center', gap: '8px', borderTop: `1px solid ${T.borderSubtle}` }}>
                    <Download size={16} color={T.textMuted} /> Exportar CSV
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Busca + filtros */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: '0 10px', flex: 1, minHeight: '44px', minWidth: '160px' }}>
            <Search size={16} color={T.textSubtle} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome, tipo ou responsável..." style={{ background: 'none', border: 'none', outline: 'none', fontSize: '14px', color: T.text, width: '100%', fontFamily: T.font.body }} />
            {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textSubtle, padding: 0, display: 'flex' }}><X size={15} /></button>}
          </div>
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={{ minHeight: '44px', padding: '0 8px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius.md, fontSize: '13px', color: filtroTipo ? T.primary : T.textMuted, fontFamily: T.font.body, cursor: 'pointer', outline: 'none', fontWeight: filtroTipo ? '600' : '400' }}>
              {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <select value={filtroResponsavel} onChange={e => setFiltroResponsavel(e.target.value)} style={{ minHeight: '44px', maxWidth: '140px', padding: '0 8px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius.md, fontSize: '13px', color: filtroResponsavel ? T.primary : T.textMuted, fontFamily: T.font.body, cursor: 'pointer', outline: 'none', fontWeight: filtroResponsavel ? '600' : '400' }}>
              <option value="">Responsável</option>
              {responsaveis.map(r => <option key={r.email || r.nome} value={r.nome}>{r.nome}</option>)}
            </select>
            {!hideAreaFilter && (
              <select value={filtroArea} onChange={e => setFiltroArea(e.target.value)} style={{ minHeight: '44px', padding: '0 8px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius.md, fontSize: '13px', color: filtroArea ? T.primary : T.textMuted, fontFamily: T.font.body, cursor: 'pointer', outline: 'none', fontWeight: filtroArea ? '600' : '400' }}>
                <option value="">Áreas</option>
                {TAREFA_AREA_GRUPOS.map(g => (
                  <optgroup key={g.macro} label={`— ${g.macro} —`}>
                    {g.areas.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
                  </optgroup>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Desktop (mantém padrão existente)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
      <div style={{ flexShrink: 0 }}>
        <h1 style={{ fontSize: '20px', fontWeight: '700', color: T.text, margin: 0, fontFamily: T.font.body }}>Tarefas</h1>
        {edicaoNome && <span style={{ fontSize: '12px', color: T.textMuted }}>{edicaoNome}</span>}
      </div>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: '6px 10px', width: '260px' }}>
          <Search size={14} color={T.textSubtle} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome, tipo ou responsável…" style={{ background: 'none', border: 'none', outline: 'none', fontSize: '13px', color: T.text, width: '100%', fontFamily: T.font.body }} />
          {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textSubtle, padding: 0, display: 'flex' }}><X size={14} /></button>}
        </div>

        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={{ padding: '7px 10px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius.md, fontSize: '12px', color: filtroTipo ? T.primary : T.textMuted, fontFamily: T.font.body, cursor: 'pointer', outline: 'none', fontWeight: filtroTipo ? '600' : '400' }}>
          {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>

        <select value={filtroResponsavel} onChange={e => setFiltroResponsavel(e.target.value)} style={{ padding: '7px 10px', maxWidth: '150px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius.md, fontSize: '12px', color: filtroResponsavel ? T.primary : T.textMuted, fontFamily: T.font.body, cursor: 'pointer', outline: 'none', fontWeight: filtroResponsavel ? '600' : '400' }}>
          <option value="">Responsável</option>
          {responsaveis.map(r => <option key={r.email || r.nome} value={r.nome}>{r.nome}</option>)}
        </select>

        {!hideAreaFilter && (
          <select value={filtroArea} onChange={e => setFiltroArea(e.target.value)} style={{ padding: '7px 10px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius.md, fontSize: '12px', color: filtroArea ? T.primary : T.textMuted, fontFamily: T.font.body, cursor: 'pointer', outline: 'none', fontWeight: filtroArea ? '600' : '400' }}>
            <option value="">Todas as áreas</option>
            {TAREFA_AREA_GRUPOS.map(g => (
              <optgroup key={g.macro} label={`— ${g.macro} —`}>
                {g.areas.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
              </optgroup>
            ))}
          </select>
        )}

        <div ref={ref} style={{ position: 'relative' }}>
          <button onClick={() => setMenuOpen(o => !o)} aria-label="Ações" style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: '7px 10px', cursor: 'pointer', color: T.textMuted, display: 'flex', alignItems: 'center' }}>
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius.md, boxShadow: T.shadowLg, zIndex: 51, minWidth: '190px', overflow: 'hidden' }}>
              <button onClick={() => { setMenuOpen(false); onSugerirIA(); }} style={{ width: '100%', textAlign: 'left', padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: T.text, fontFamily: T.font.body, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={14} color={T.primary} /> Sugerir com IA
              </button>
              <button onClick={() => { setMenuOpen(false); onEnriquecerIA(); }} style={{ width: '100%', textAlign: 'left', padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: T.text, fontFamily: T.font.body, display: 'flex', alignItems: 'center', gap: '8px', borderTop: `1px solid ${T.borderSubtle}` }}>
                <Wand2 size={14} color={T.primary} /> Enriquecer com IA
              </button>
              <button onClick={() => { setMenuOpen(false); onExportar(); }} style={{ width: '100%', textAlign: 'left', padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: T.text, fontFamily: T.font.body, display: 'flex', alignItems: 'center', gap: '8px', borderTop: `1px solid ${T.borderSubtle}` }}>
                <Download size={14} color={T.textMuted} /> Exportar CSV
              </button>
            </div>
          )}
        </div>

        {podeCriar && (
          <button onClick={onNovoPacote} style={{ background: T.primary, color: T.onPrimary, border: 'none', borderRadius: T.radius.md, padding: '8px 14px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: T.font.body, display: 'flex', alignItems: 'center', gap: '6px' }}>
            + Nova tarefa
          </button>
        )}
      </div>
    </div>
  );
}