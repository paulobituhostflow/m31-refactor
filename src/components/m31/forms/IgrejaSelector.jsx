
const OPCAO_NAO_PARTICIPO = '__NAO_PARTICIPO__';
const OPCAO_OUTRA = '__OUTRA__';

/**
 * Seletor de Igreja/Comunidade com 3 modos:
 * - Igreja conhecida (do banco) → seleciona do dropdown
 * - Outra (digitar) → abre campo de texto livre
 * - Não participo → limpa e desabilita
 *
 * Totalmente controlado: o pai gerencia `value` (texto) e `naoParticipo` (bool).
 */
export default function IgrejaSelector({ value, naoParticipo, knownChurches = [], onChange }) {
  const isKnown = !!(value && knownChurches.some(c => c === value));
  const usandoOutra = !!(value && !isKnown && !naoParticipo);

  const selectValue = naoParticipo
    ? OPCAO_NAO_PARTICIPO
    : isKnown ? value : usandoOutra ? OPCAO_OUTRA : '';

  function handleSelect(e) {
    const v = e.target.value;
    if (v === OPCAO_NAO_PARTICIPO) {
      onChange('', true);
    } else if (v === OPCAO_OUTRA) {
      onChange('', false);
    } else {
      onChange(v, false);
    }
  }

  function handleOutraText(e) {
    onChange(e.target.value, false);
  }

  return (
    <div>
      <div className="m31-ds-field">
        <span className="m31-ds-label">Igreja / Comunidade</span>
        <div className="m31-ds-select-wrap">
          <select className="m31-ds-select" value={selectValue} onChange={handleSelect}>
            <option value="">Selecione...</option>
            {knownChurches.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
            <option value={OPCAO_OUTRA}>Outra (digitar)</option>
            <option value={OPCAO_NAO_PARTICIPO}>Não participo de uma igreja/comunidade</option>
          </select>
        </div>
      </div>
      {usandoOutra && (
        <div className="m31-ds-field" style={{ marginTop: 12 }}>
          <span className="m31-ds-label">Nome da igreja<span className="req">*</span></span>
          <input
            className="m31-ds-input"
            type="text"
            value={value}
            onChange={handleOutraText}
            placeholder="Digite o nome da sua igreja"
          />
        </div>
      )}
    </div>
  );
}