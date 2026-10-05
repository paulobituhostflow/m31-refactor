/**
 * AbaIngressosLotes — Preços, quantidades, lotes promocionais para caravanas.
 */
import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TOKENS } from '@/lib/m31DesignTokens';
import { feedback } from '@/components/m31/ui';
import { Save, Users, Ticket } from 'lucide-react';

export default function AbaIngressosLotes() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState({});

  const { data: lotes = [], isLoading } = useQuery({
    queryKey: ['m31_config_lotes'],
    queryFn: () => base44.entities.EventoM31Lote.list('ordem', 10),
  });

  useEffect(() => {
    if (lotes.length) {
      const map = {};
      lotes.forEach(l => { map[l.id] = { ...l }; });
      setEditing(map);
    }
  }, [lotes]);

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.EventoM31Lote.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['m31_config_lotes'] }); feedback.success('Lote atualizado.'); },
  });

  const toggleAtivoMutation = useMutation({
    mutationFn: async (lote) => {
      for (const l of lotes) {
        if (l.id !== lote.id && l.ativo) {
          await base44.entities.EventoM31Lote.update(l.id, { ativo: false });
        }
      }
      await base44.entities.EventoM31Lote.update(lote.id, { ativo: !lote.ativo });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['m31_config_lotes'] }); feedback.success('Lote ativo alterado.'); },
  });

  const inputStyle = { width: '100%', padding: '7px 10px', background: TOKENS.surface, border: `1.5px solid ${TOKENS.borderStrong}`, borderRadius: TOKENS.radius.md, fontSize: '13px', color: TOKENS.text, outline: 'none', fontFamily: TOKENS.font.body, boxSizing: 'border-box' };
  const labelStyle = { fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em', color: TOKENS.textSubtle, display: 'block', marginBottom: '3px' };
  const btnPrimary = { padding: '7px 14px', borderRadius: TOKENS.radius.md, fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: TOKENS.font.body, display: 'inline-flex', alignItems: 'center', gap: '5px', border: 'none', background: TOKENS.primary, color: '#FFFFFF' };

  if (isLoading) return <div style={{ textAlign: 'center', padding: '40px', color: TOKENS.textMuted, fontSize: '13px' }}>Carregando lotes...</div>;
  if (!lotes.length) return (
    <div style={{ padding: '40px', textAlign: 'center', background: TOKENS.surface, border: `1px solid ${TOKENS.border}`, borderRadius: TOKENS.radius.lg }}>
      <Ticket size={32} color={TOKENS.textSubtle} style={{ margin: '0 auto 8px' }} />
      <p style={{ fontSize: '14px', color: TOKENS.textMuted, margin: 0 }}>Nenhum lote cadastrado. Crie os lotes na aba "Lotes e Vagas" do menu Inscrições.</p>
    </div>
  );

  const handleField = (id, field, val) => {
    setEditing(prev => ({ ...prev, [id]: { ...prev[id], [field]: val === '' ? '' : (field.includes('valor') || field.includes('vagas') || field.includes('ordem')) ? Number(val) : val } }));
  };

  const handleSave = (lote) => {
    const e = editing[lote.id];
    if (!e) return;
    updateMutation.mutate({ id: lote.id, data: { valor: Number(e.valor), valor_caravana: e.valor_caravana ? Number(e.valor_caravana) : null, promocional_caravana: !!e.promocional_caravana, vagas_total: Number(e.vagas_total), data_inicio: e.data_inicio || null, data_fim: e.data_fim || null, nome: e.nome } });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {lotes.map(lote => {
        const e = editing[lote.id] || lote;
        const pct = lote.vagas_total > 0 ? Math.round((lote.vagas_usadas / lote.vagas_total) * 100) : 0;
        return (
          <div key={lote.id} style={{ background: TOKENS.surface, border: `1px solid ${lote.ativo ? TOKENS.primary : TOKENS.border}`, borderRadius: TOKENS.radius.lg, padding: '16px', boxShadow: TOKENS.shadowSm }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '15px', fontWeight: '700', color: TOKENS.text, fontFamily: TOKENS.font.heading }}>{e.nome || lote.nome}</span>
                {lote.ativo && <span style={{ padding: '2px 8px', borderRadius: TOKENS.radius.pill, fontSize: '10px', fontWeight: '700', background: TOKENS.successSoft, color: TOKENS.success }}>ATIVO</span>}
              </div>
              <button onClick={() => toggleAtivoMutation.mutate(lote)} style={{ padding: '5px 12px', borderRadius: TOKENS.radius.pill, fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: `1px solid ${lote.ativo ? TOKENS.borderStrong : TOKENS.success}`, background: lote.ativo ? TOKENS.surfaceSubtle : TOKENS.successSoft, color: lote.ativo ? TOKENS.textMuted : TOKENS.success }}>
                {lote.ativo ? 'Desativar' : 'Ativar'}
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '10px' }}>
              <div>
                <label style={labelStyle}>Nome do lote</label>
                <input style={inputStyle} value={e.nome || ''} onChange={ev => handleField(lote.id, 'nome', ev.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Valor (R$)</label>
                <input style={inputStyle} type="number" value={e.valor ?? ''} onChange={ev => handleField(lote.id, 'valor', ev.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Vagas total</label>
                <input style={inputStyle} type="number" value={e.vagas_total ?? ''} onChange={ev => handleField(lote.id, 'vagas_total', ev.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Ordem</label>
                <input style={inputStyle} type="number" value={e.ordem ?? ''} onChange={ev => handleField(lote.id, 'ordem', ev.target.value)} />
              </div>
            </div>

            {/* Datas */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div>
                <label style={labelStyle}>Início das vendas</label>
                <input style={inputStyle} type="date" value={e.data_inicio ? e.data_inicio.slice(0, 10) : ''} onChange={ev => handleField(lote.id, 'data_inicio', ev.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Fim das vendas</label>
                <input style={inputStyle} type="date" value={e.data_fim ? e.data_fim.slice(0, 10) : ''} onChange={ev => handleField(lote.id, 'data_fim', ev.target.value)} />
              </div>
            </div>

            {/* Preço promocional caravana */}
            <div style={{ padding: '10px 12px', background: TOKENS.surfaceSubtle, borderRadius: TOKENS.radius.md, marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <Users size={14} color={TOKENS.primary} />
                <span style={{ fontSize: '12px', fontWeight: '700', color: TOKENS.text }}>Preço promocional para caravanas</span>
                <button onClick={() => handleField(lote.id, 'promocional_caravana', !e.promocional_caravana)} style={{ marginLeft: 'auto', padding: '3px 10px', borderRadius: TOKENS.radius.pill, fontSize: '11px', fontWeight: '700', cursor: 'pointer', border: `1px solid ${e.promocional_caravana ? TOKENS.primary : TOKENS.borderStrong}`, background: e.promocional_caravana ? TOKENS.primary : TOKENS.surface, color: e.promocional_caravana ? '#FFFFFF' : TOKENS.textMuted }}>
                  {e.promocional_caravana ? 'Ativado' : 'Desativado'}
                </button>
              </div>
              {e.promocional_caravana && (
                <div>
                  <label style={labelStyle}>Valor promocional (R$)</label>
                  <input style={{ ...inputStyle, maxWidth: '200px' }} type="number" value={e.valor_caravana ?? ''} onChange={ev => handleField(lote.id, 'valor_caravana', ev.target.value)} placeholder="Ex: 99.00" />
                </div>
              )}
            </div>

            {/* Ocupação */}
            <div style={{ marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: TOKENS.textMuted, marginBottom: '4px' }}>
                <span>Ocupação</span>
                <span>{lote.vagas_usadas || 0} / {lote.vagas_total || 0} ({pct}%)</span>
              </div>
              <div style={{ height: '6px', background: TOKENS.surfaceSubtle, borderRadius: TOKENS.radius.pill, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: pct >= 90 ? TOKENS.danger : pct >= 70 ? TOKENS.warning : TOKENS.success, borderRadius: TOKENS.radius.pill, transition: 'width 0.6s ease' }} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => handleSave(lote)} disabled={updateMutation.isPending} style={btnPrimary}>
                <Save size={13} /> Salvar Lote
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}