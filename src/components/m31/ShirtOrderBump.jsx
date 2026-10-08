import { Shirt } from 'lucide-react';

const BORDO = '#7A1F2B';
const MAX_UNIDADES = 10;

const labelStyle = { fontSize: 12, fontWeight: 800, color: '#6B5D59', marginTop: 12, marginBottom: 6 };
const chipsStyle = { display: 'flex', flexWrap: 'wrap', gap: 8 };

function chipStyle(ativo) {
  return {
    minHeight: 40,
    padding: '0 14px',
    borderRadius: 12,
    border: ativo ? `1px solid ${BORDO}` : '1px solid #E4D8D3',
    background: ativo ? BORDO : '#fff',
    color: ativo ? '#fff' : '#3D3330',
    fontWeight: 700,
    fontSize: 13,
    cursor: 'pointer',
  };
}

// Order Bump de camisa — oferta única, opcional e multiunidade.
export default function ShirtOrderBump({ offer, enabled, units, onToggle, onChange, disabled = false }) {
  if (!offer?.ativo || !Array.isArray(offer.tipos) || offer.tipos.length === 0) return null;

  const tipos = offer.tipos;
  const precoUnitario = Number(offer.preco_unitario || 65);
  const precoPromocional = Number(offer.preco_promocional || 60);
  const lista = Array.isArray(units) ? units : [];

  const tipoDe = (modelo) => tipos.find((t) => t.modelo === modelo) || null;

  function atualizar(idx, patch) {
    onChange(lista.map((unidade, i) => (i === idx ? { ...unidade, ...patch } : unidade)));
  }

  function escolherTipo(idx, modelo) {
    const tipo = tipoDe(modelo);
    const corUnica = tipo && Array.isArray(tipo.cores) && tipo.cores.length === 1 ? tipo.cores[0].cor : '';
    atualizar(idx, { modelo, cor: corUnica || '', tamanho: '' });
  }

  function adicionar() {
    if (lista.length >= MAX_UNIDADES) return;
    onChange([...lista, { modelo: '', cor: '', tamanho: '' }]);
  }

  function remover(idx) {
    const restantes = lista.filter((_, i) => i !== idx);
    onChange(restantes.length > 0 ? restantes : [{ modelo: '', cor: '', tamanho: '' }]);
  }

  return (
    <div style={{ margin: '18px 0', border: `2px dashed ${BORDO}`, borderRadius: 16, background: '#FBF6F7', overflow: 'hidden' }}>
      <div style={{ background: '#C1272D', color: '#fff', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textAlign: 'center', padding: '8px 12px' }}>
        OFERTA EXCLUSIVA NO ATO DA INSCRIÇÃO
      </div>

      <label style={{ display: 'flex', gap: 12, padding: 16, alignItems: 'flex-start', cursor: disabled ? 'default' : 'pointer' }}>
        <input
          type="checkbox"
          checked={Boolean(enabled)}
          disabled={disabled}
          onChange={(e) => onToggle(e.target.checked)}
          style={{ width: 24, height: 24, marginTop: 2, accentColor: BORDO, flex: '0 0 auto' }}
        />
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: 15, fontWeight: 800, color: '#2D2020' }}>
            <Shirt size={16} style={{ verticalAlign: '-3px', marginRight: 6, color: BORDO }} />
            Garanta sua camisa no ato da inscrição
          </span>
          <span style={{ display: 'block', fontSize: 13, color: '#6B5D59', marginTop: 4, lineHeight: '18px' }}>
            Garanta sua camisa no ato da inscrição com preço promocional exclusivo. Compra opcional.
          </span>
          <span style={{ display: 'block', fontSize: 12, color: BORDO, fontWeight: 700, marginTop: 6 }}>
            1 camisa: R$ {precoUnitario.toFixed(2).replace('.', ',')} · 2 ou mais: R$ {precoPromocional.toFixed(2).replace('.', ',')} cada
          </span>
        </span>
      </label>

      {enabled && (
        <div style={{ padding: '0 16px 16px' }}>
          {lista.map((unidade, idx) => {
            const tipoSel = tipoDe(unidade.modelo);
            const temCores = Array.isArray(tipoSel?.cores) && tipoSel.cores.length > 0;
            return (
              <div key={idx} style={{ border: '1px solid #E7D8D2', borderRadius: 12, background: '#fff', padding: 12, marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 13, color: '#2D2020' }}>Camisa {idx + 1}</strong>
                  {lista.length > 1 && (
                    <button type="button" disabled={disabled} onClick={() => remover(idx)}
                      style={{ border: 0, background: 'transparent', color: BORDO, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      Remover
                    </button>
                  )}
                </div>

                <div style={labelStyle}>Tipo</div>
                <div style={chipsStyle}>
                  {tipos.map((tipo) => (
                    <button key={tipo.modelo} type="button" disabled={disabled}
                      onClick={() => escolherTipo(idx, tipo.modelo)} style={chipStyle(unidade.modelo === tipo.modelo)}>
                      {tipo.nome}
                    </button>
                  ))}
                </div>

                {temCores && (
                  <>
                    <div style={labelStyle}>Cor</div>
                    <div style={chipsStyle}>
                      {tipoSel.cores.map((cor) => (
                        <button key={cor.cor} type="button" disabled={disabled}
                          onClick={() => atualizar(idx, { cor: cor.cor })} style={chipStyle(unidade.cor === cor.cor)}>
                          {cor.nome}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {tipoSel ? (
                  <>
                    <div style={labelStyle}>Tamanho</div>
                    <div style={chipsStyle}>
                      {tipoSel.tamanhos.map((tamanho) => (
                        <button key={tamanho} type="button" disabled={disabled}
                          onClick={() => atualizar(idx, { tamanho })} style={chipStyle(unidade.tamanho === tamanho)}>
                          {tamanho}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ marginTop: 12, fontSize: 11, color: '#8A7C77' }}>Escolha o tipo para ver as opções.</div>
                )}
              </div>
            );
          })}

          <button type="button" disabled={disabled || lista.length >= MAX_UNIDADES} onClick={adicionar}
            style={{
              width: '100%',
              minHeight: 44,
              borderRadius: 12,
              border: `1px dashed ${BORDO}`,
              background: '#fff',
              color: BORDO,
              fontWeight: 800,
              fontSize: 13,
              cursor: lista.length >= MAX_UNIDADES ? 'default' : 'pointer',
            }}>
            + Adicionar outra camisa
          </button>
        </div>
      )}
    </div>
  );
}