// Campos personalizados adicionados pelo builder — renderização no design system M31.
// Os valores são coletados e serializados para persistência segura (observações /
// campo livre do backend correspondente), sem alterar os payloads existentes.

export default function ExtrasFields({ extras, valores = {}, onChange, disabled }) {
  if (!extras || extras.length === 0) return null;
  return (
    <>
      {extras.map((f) => {
        const val = valores[f.id] ?? '';
        const req = <span style={{ color: 'var(--m31-brand-bright)', marginLeft: 2 }}>*</span>;
        if (f.type === 'toggle') {
          return (
            <div key={f.id} className="m31-ds-toggle-card">
              <div className="m31-ds-toggle-q">{f.label}{f.required && req}</div>
              <div className="m31-ds-toggle-opts">
                {[['sim', 'Sim'], ['nao', 'Não']].map(([v, label]) => (
                  <button key={v} type="button" disabled={disabled}
                    className={`m31-ds-toggle-btn${val === v ? ' active' : ''}`}
                    onClick={() => onChange(f.id, val === v ? '' : v)}>{label}</button>
                ))}
              </div>
              {f.helper && <div style={{ fontSize: 11, color: 'var(--m31-t3)', marginTop: 6 }}>{f.helper}</div>}
            </div>
          );
        }
        if (f.type === 'select') {
          return (
            <div key={f.id} className="m31-ds-field">
              <span className="m31-ds-label">{f.label}{f.required && req}</span>
              <div className="m31-ds-select-wrap">
                <select className="m31-ds-select" value={val} disabled={disabled} onChange={(e) => onChange(f.id, e.target.value)}>
                  <option value=""> </option>
                  {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              {f.helper && <div className="m31-ds-field-hint">{f.helper}</div>}
            </div>
          );
        }
        if (f.type === 'textarea') {
          return (
            <div key={f.id} className="m31-ds-field">
              <span className="m31-ds-label">{f.label}{f.required && req}</span>
              <textarea className="m31-ds-input" rows={3} value={val} disabled={disabled}
                placeholder={f.placeholder || ''} onChange={(e) => onChange(f.id, e.target.value)}
                style={{ width: '100%', paddingTop: 14, resize: 'vertical' }} />
              {f.helper && <div className="m31-ds-field-hint">{f.helper}</div>}
            </div>
          );
        }
        return (
          <div key={f.id} className="m31-ds-field">
            <span className="m31-ds-label">{f.label}{f.required && req}</span>
            <input className="m31-ds-input" type={f.type === 'email' ? 'email' : 'text'}
              inputMode={f.type === 'phone' ? 'tel' : undefined} value={val} disabled={disabled}
              placeholder={f.placeholder || ''} autoComplete="off"
              onChange={(e) => onChange(f.id, e.target.value)} />
            {f.helper && <div className="m31-ds-field-hint">{f.helper}</div>}
          </div>
        );
      })}
    </>
  );
}