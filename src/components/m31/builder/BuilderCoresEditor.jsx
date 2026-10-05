// Editor de cores do Builder 360 — paleta do tema + ajuste fino por elemento.
// Mudanças valem só para o formulário em edição e são publicadas ao salvar.
import { PALETA_CHAVES, ELEMENTOS_CORES, mergeCores, corElemento } from '@/lib/m31VisualTheme';

const SWATCHES = ['#8B1A2B', '#6B1422', '#7A2228', '#C4A265', '#F6E9EC', '#FAF7F2', '#111827', '#0D0D0D', '#16A34A', '#D97706'];

const subLabel = { fontSize: 11, fontWeight: 700, color: '#6B7280', margin: '10px 0 6px', textTransform: 'uppercase', letterSpacing: '0.05em' };

function ColorInput({ value, onChange, disabled }) {
  return (
    <input type="color" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
      style={{ width: 30, height: 30, border: '1px solid #E5E7EB', borderRadius: 6, cursor: disabled ? 'not-allowed' : 'pointer', padding: 1, background: '#fff', flexShrink: 0 }} />
  );
}

export default function BuilderCoresEditor({ formId, cores, onChange }) {
  const paleta = cores?.paleta || {};
  const elementos = cores?.elementos || {};
  const setPaleta = (k, v) => onChange({ ...cores, paleta: { ...paleta, [k]: v } });
  const setElemento = (id, v) => onChange({ ...cores, elementos: { ...elementos, [id]: v } });

  return (
    <div>
      <div style={subLabel}>Paleta do tema</div>
      {PALETA_CHAVES.map(({ id, label }) => (
        <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <ColorInput value={paleta[id] || '#FFFFFF'} onChange={(v) => setPaleta(id, v)} />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#374151', flex: 1 }}>{label}</span>
          <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#9CA3AF' }}>{paleta[id]}</span>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', margin: '2px 0 4px' }}>
        {SWATCHES.map((c) => (
          <button key={c} type="button" title="Aplicar na marca e no botão"
            onClick={() => onChange({ ...cores, paleta: { ...paleta, marca: c, botao: c } })}
            style={{ width: 22, height: 22, borderRadius: 6, background: c, border: '1px solid rgba(0,0,0,.12)', cursor: 'pointer', padding: 0 }} />
        ))}
      </div>
      <div style={{ fontSize: 10, color: '#9CA3AF', marginBottom: 4 }}>Toques rápidos aplicam na marca e no botão.</div>

      <div style={subLabel}>Ajuste por elemento</div>
      {ELEMENTOS_CORES.map(({ id, label }) => {
        const custom = !!elementos[id];
        const efetiva = custom ? elementos[id] : corElemento({ paleta, elementos }, id);
        return (
          <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <ColorInput value={efetiva || '#9CA3AF'} disabled={!custom} onChange={(v) => setElemento(id, v)} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#374151', flex: 1 }}>{label}</span>
            <button type="button" onClick={() => setElemento(id, custom ? '' : (efetiva || '#9CA3AF'))}
              style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999, cursor: 'pointer',
                border: `1px solid ${custom ? '#FECACA' : '#E5E7EB'}`, background: custom ? '#FEF2F2' : '#F9FAFB',
                color: custom ? '#B91C1C' : '#6B7280' }}>
              {custom ? '✕ Seguir paleta' : 'Cor própria'}
            </button>
          </div>
        );
      })}

      <button type="button" onClick={() => onChange(mergeCores(formId, null))}
        style={{ marginTop: 8, width: '100%', padding: '7px 10px', background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 11, fontWeight: 600, color: '#6B7280', cursor: 'pointer' }}>
        Restaurar cores padrão (bordô)
      </button>
    </div>
  );
}