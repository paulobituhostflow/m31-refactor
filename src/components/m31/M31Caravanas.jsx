import { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { TOKENS } from '@/lib/m31DesignTokens';
import { C, stringSimilarity, isConfirmado, isPendente } from './caravanas/CaravanasUtils';
import { IcoPlus, IcoSearch } from './caravanas/CaravanasIcons';
import CaravanaDashboard from './caravanas/CaravanaDashboard';
import CaravanaDuplicatas from './caravanas/CaravanaDuplicatas';
import CaravanaRanking from './caravanas/CaravanaRanking';
import CaravanaCard from './caravanas/CaravanaCard';
import CaravanaNovaForm from './caravanas/CaravanaNovaForm';
import CaravanaMesclarModal from './caravanas/CaravanaMesclarModal';

const SIMILARITY_THRESHOLD = 0.7;

export default function M31Caravanas() {
  const qc = useQueryClient();
  const [showForm,       setShowForm]       = useState(false);
  const [busca,          setBusca]          = useState('');
  const [highlighted,    setHighlighted]    = useState(null);
  const [showDuplicatas, setShowDuplicatas] = useState(false);
  const [showMesclar,    setShowMesclar]    = useState(false);

  const { data: caravanas = [], isLoading } = useQuery({
    queryKey: ['m31caravanas'],
    queryFn: () => base44.entities.EventoM31Caravana.list('-created_date', 100),
  });
  const { data: inscricoes = [] } = useQuery({
    queryKey: ['m31inscricoes_caravana'],
    // Conta pelo VÍNCULO (caravana_id), não pelo tipo de checkout — inclui vinculadas por grupo/público geral
    queryFn: () => base44.entities.EventoM31Inscricao.filter({ caravana_id: { $ne: null } }, '-created_date', 500),
  });

  // Scroll to highlighted card
  useEffect(() => {
    if (highlighted) {
      const el = document.getElementById(`caravana-${highlighted}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const t = setTimeout(() => setHighlighted(null), 3000);
      return () => clearTimeout(t);
    }
  }, [highlighted]);

  // ── STATS GLOBAIS ──
  const stats = useMemo(() => ({
    totalCaravanas: caravanas.length,
    totalMembros:   inscricoes.length,
    confirmados:    inscricoes.filter(isConfirmado).length,
    pendentes:      inscricoes.filter(isPendente).length,
    receita:        inscricoes.filter(isConfirmado).reduce((s, i) => s + (i.valor_pago || 0), 0),
  }), [caravanas, inscricoes]);

  // ── DETECÇÃO DE DUPLICATAS ──
  const pares = useMemo(() => {
    const result = [];
    for (let i = 0; i < caravanas.length; i++) {
      for (let j = i + 1; j < caravanas.length; j++) {
        const score = stringSimilarity(caravanas[i].nome || '', caravanas[j].nome || '');
        if (score >= SIMILARITY_THRESHOLD) {
          result.push({ caravanas: [caravanas[i], caravanas[j]], score });
        }
      }
    }
    return result;
  }, [caravanas]);

  // Mapa de id -> alertas externos (ex: duplicada)
  const alertasExternosPorId = useMemo(() => {
    const map = {};
    pares.forEach(p => {
      p.caravanas.forEach(c => {
        if (!map[c.id]) map[c.id] = [];
        if (!map[c.id].includes('duplicada')) map[c.id].push('duplicada');
      });
    });
    return map;
  }, [pares]);

  // ── FILTRO BUSCA ──
  const filtered = useMemo(() => {
    if (!busca) return caravanas;
    const b = busca.toLowerCase();
    return caravanas.filter(c =>
      c.nome?.toLowerCase().includes(b) ||
      c.lider_nome?.toLowerCase().includes(b) ||
      c.cidade_origem?.toLowerCase().includes(b)
    );
  }, [caravanas, busca]);

  if (isLoading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
      <div style={{ width: '24px', height: '24px', border: `2px solid ${C.border}`, borderTopColor: C.brand, borderRadius: TOKENS.radius.pill, animation: 'spin .8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const totalDuplicatas = pares.length;

  return (
    <div style={{ fontFamily: TOKENS.font.body, color: C.text, display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '100%' }}>

      {/* HEADER */}
       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
         <div>
           <h1 style={{ fontSize: '17px', fontWeight: '700', color: C.text, marginBottom: '1px', letterSpacing: '-.015em' }}>Caravanas</h1>
           <div style={{ fontSize: '11px', color: C.textTer }}>M31 Filhas · Imersão 2026</div>
         </div>
         <div style={{ display: 'flex', gap: '5px' }}>
           <button
             onClick={() => setShowMesclar(v => !v)}
             style={{
               display: 'inline-flex', alignItems: 'center', gap: '5px',
               padding: '7px 13px', background: C.warning, border: 'none',
               borderRadius: TOKENS.radius.md, color: TOKENS.onPrimary, fontSize: '12px', fontWeight: '600',
               cursor: 'pointer', fontFamily: TOKENS.font.body, flexShrink: 0,
             }}
             title="Mesclar caravanas"
           >
             ⚡ Mesclar
           </button>
           <button
             onClick={() => setShowForm(v => !v)}
             style={{
               display: 'inline-flex', alignItems: 'center', gap: '5px',
               padding: '7px 13px', background: C.brand, border: 'none',
               borderRadius: TOKENS.radius.md, color: TOKENS.onPrimary, fontSize: '12px', fontWeight: '600',
               cursor: 'pointer', fontFamily: TOKENS.font.body, flexShrink: 0,
             }}
           >
             <IcoPlus /> Nova
           </button>
         </div>
       </div>

      {/* FORM */}
      {showForm && <CaravanaNovaForm onClose={() => setShowForm(false)} />}

      {/* MESCLAR */}
      {showMesclar && (
        <CaravanaMesclarModal
          caravanas={caravanas}
          inscricoes={inscricoes}
          onClose={() => setShowMesclar(false)}
          onMerged={() => {
            qc.invalidateQueries({ queryKey: ['m31caravanas'] });
            qc.invalidateQueries({ queryKey: ['m31inscricoes_caravana'] });
          }}
        />
      )}

      {/* KPIs */}
      <CaravanaDashboard stats={stats} />

      {/* DUPLICATAS */}
      {totalDuplicatas > 0 && (
        <button
          onClick={() => setShowDuplicatas(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '10px 14px',
            background: TOKENS.dangerSoft, border: `1px solid ${TOKENS.dangerSoft}`,
            borderRadius: TOKENS.radius.md, cursor: 'pointer', fontFamily: TOKENS.font.body,
            textAlign: 'left', width: '100%',
          }}
        >
          <span style={{ width: '6px', height: '6px', borderRadius: TOKENS.radius.pill, background: C.danger, flexShrink: 0, marginTop: '1px' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: C.danger }}>
              {totalDuplicatas} possível{totalDuplicatas > 1 ? 'is' : ''} duplicata{totalDuplicatas > 1 ? 's' : ''}
            </div>
            <div style={{ fontSize: '11px', color: C.textTer, marginTop: '1px' }}>Toque para ver e fundir</div>
          </div>
          <span style={{ fontSize: '10px', color: C.textTer }}>{showDuplicatas ? '▴' : '▾'}</span>
        </button>
      )}
      {showDuplicatas && totalDuplicatas > 0 && (
        <CaravanaDuplicatas
          pares={pares}
          inscricoes={inscricoes}
          onMerged={() => {
            qc.invalidateQueries({ queryKey: ['m31caravanas'] });
            qc.invalidateQueries({ queryKey: ['m31inscricoes_caravana'] });
            setShowDuplicatas(false);
          }}
        />
      )}

      {/* RANKING */}
      {caravanas.length > 1 && (
        <CaravanaRanking
          caravanas={caravanas}
          inscricoes={inscricoes}
          onSelect={id => setHighlighted(id)}
        />
      )}

      {/* SEARCH */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        background: C.bg2, border: `1px solid ${C.border}`,
        borderRadius: TOKENS.radius.md, padding: '8px 12px',
      }}>
        <span style={{ color: C.textTer }}><IcoSearch /></span>
        <input
          style={{ background: 'none', border: 'none', outline: 'none', color: C.text, fontFamily: TOKENS.font.body, fontSize: '13px', flex: 1, minWidth: 0 }}
          placeholder="Buscar por nome, líder ou cidade..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
        />
        {busca && (
          <button onClick={() => setBusca('')} style={{ background: 'none', border: 'none', color: C.textTer, cursor: 'pointer', fontSize: '12px', padding: '0' }}>✕</button>
        )}
      </div>

      {/* LEGENDA COMPACTA */}
      <div style={{ display: 'flex', gap: '12px', fontSize: '10px', color: C.textTer, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '6px', height: '3px', borderRadius: '2px', background: C.success, display: 'inline-block' }} /> Confirmados
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '6px', height: '3px', borderRadius: '2px', background: C.warning, display: 'inline-block' }} /> Pendentes
        </span>
        <span>· Toque no card para ver membros</span>
      </div>

      {/* CARDS */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: C.textTer }}>
          <div style={{ fontSize: '11px', color: C.textSec, fontWeight: '500', marginBottom: '4px' }}>
            {busca ? 'Nenhuma caravana encontrada' : 'Nenhuma caravana cadastrada'}
          </div>
          <div style={{ fontSize: '11px' }}>{busca ? 'Tente uma busca diferente' : 'Clique em "Nova" para começar'}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {filtered.map(c => (
            <CaravanaCard
              key={c.id}
              caravana={c}
              membros={inscricoes.filter(i => i.caravana_id === c.id)}
              highlighted={highlighted === c.id}
              alertasExternos={alertasExternosPorId[c.id] || []}
              todasCaravanas={caravanas}
            />
          ))}
        </div>
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}