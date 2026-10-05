import { useState } from 'react';
import { C, isConfirmado } from './CaravanasUtils';
import { IcoMerge } from './CaravanasIcons';
import { base44 } from '@/api/base44Client';

export default function CaravanaDuplicatas({ pares, inscricoes, onMerged }) {
  const [merging, setMerging] = useState(null);
  const [confirm, setConfirm] = useState(null);

  if (!pares || pares.length === 0) return null;

  const getMembros = (id) => inscricoes.filter(i => i.caravana_id === id);

  const handleMerge = async (mantida, removida) => {
    setMerging(removida.id);
    // Atualiza todos membros da caravana removida → mantida
    const membros = getMembros(removida.id);
    for (const m of membros) {
      await base44.entities.EventoM31Inscricao.update(m.id, {
        caravana_id: mantida.id,
        caravana_nome: mantida.nome,
      });
    }
    // Deleta caravana removida
    await base44.entities.EventoM31Caravana.delete(removida.id);
    setMerging(null);
    setConfirm(null);
    onMerged();
  };

  return (
    <div style={{ background: C.bg2, border: `1px solid rgba(239,68,68,0.3)`, borderRadius: '10px', overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(239,68,68,0.06)' }}>
        <span style={{ fontSize: '14px' }}>⚠️</span>
        <span style={{ fontSize: '13px', fontWeight: '600', color: C.text }}>Possíveis Caravanas Duplicadas</span>
        <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: '700', background: C.dangerSoft, color: C.danger, padding: '2px 7px', borderRadius: '100px' }}>{pares.length}</span>
      </div>

      {/* Modal de confirmação */}
      {confirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: C.bg2, border: `1px solid ${C.borderSt}`, borderRadius: '12px', padding: '24px', maxWidth: '400px', width: '100%' }}>
            <div style={{ fontSize: '15px', fontWeight: '700', color: C.text, marginBottom: '8px' }}>Fundir caravanas?</div>
            <div style={{ fontSize: '13px', color: C.textSec, marginBottom: '16px', lineHeight: 1.5 }}>
              Os membros de <strong style={{ color: C.danger }}>{confirm.removida.nome}</strong> serão movidos para <strong style={{ color: C.success }}>{confirm.mantida.nome}</strong> e a caravana duplicada será removida.
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setConfirm(null)} style={{ flex: 1, padding: '9px', background: 'none', border: `1px solid ${C.border}`, borderRadius: '6px', color: C.textSec, fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                Cancelar
              </button>
              <button
                onClick={() => handleMerge(confirm.mantida, confirm.removida)}
                disabled={!!merging}
                style={{ flex: 1, padding: '9px', background: C.brand, border: 'none', borderRadius: '6px', color: '#fff', fontSize: '13px', fontWeight: '600', cursor: merging ? 'not-allowed' : 'pointer', opacity: merging ? .7 : 1, fontFamily: 'Inter,sans-serif' }}>
                {merging ? 'Fundindo...' : 'Confirmar Fusão'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
        {pares.map((par, i) => {
          const [a, b] = par.caravanas;
          const mbA = getMembros(a.id);
          const mbB = getMembros(b.id);
          // A maior vira a mantida
          const mantida  = mbA.length >= mbB.length ? a : b;
          const removida = mbA.length >= mbB.length ? b : a;
          const mbMantida  = getMembros(mantida.id);
          const mbRemovida = getMembros(removida.id);

          return (
            <div key={i} style={{ padding: '14px 16px', borderBottom: i < pares.length - 1 ? `1px solid ${C.border}` : 'none' }}>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: '700', color: C.text, background: C.bg3, padding: '4px 10px', borderRadius: '6px' }}>{a.nome}</span>
                <span style={{ fontSize: '11px', color: C.textTer }}>vs</span>
                <span style={{ fontSize: '12px', fontWeight: '700', color: C.text, background: C.bg3, padding: '4px 10px', borderRadius: '6px' }}>{b.nome}</span>
                <span style={{ marginLeft: 'auto', fontSize: '10px', fontWeight: '700', color: C.warning, background: C.warningSoft, padding: '2px 8px', borderRadius: '100px' }}>
                  {Math.round(par.score * 100)}% similar
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                {[{ c: mantida, mb: mbMantida, label: 'Manter' }, { c: removida, mb: mbRemovida, label: 'Remover' }].map(({ c, mb, label }) => (
                  <div key={c.id} style={{ background: C.bg3, borderRadius: '7px', padding: '10px 12px' }}>
                    <div style={{ fontSize: '10px', fontWeight: '700', color: label === 'Manter' ? C.success : C.danger, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '4px' }}>{label}</div>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: C.text }}>{c.nome}</div>
                    <div style={{ fontSize: '11px', color: C.textSec, marginTop: '2px' }}>👤 {c.lider_nome || 'Sem líder'}</div>
                    <div style={{ fontSize: '11px', color: C.textSec }}>
                      <span style={{ color: C.success }}>{mb.filter(isConfirmado).length} ✓</span>
                      {' · '}
                      <span>{mb.length} total</span>
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setConfirm({ mantida, removida })}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 14px', background: C.brand, border: 'none', borderRadius: '6px', color: '#fff', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                <IcoMerge /> Fundir caravanas
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}