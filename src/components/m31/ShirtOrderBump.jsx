import { Shirt } from 'lucide-react';

const MODEL_LABELS = {
  equipe: 'Equipe',
  jesus: 'Jesus',
  milagres: 'Milagres',
  filhas: 'Filhas',
};

export default function ShirtOrderBump({ offer, selection, onChange, disabled = false }) {
  if (!offer?.ativo || !Array.isArray(offer.modelos) || offer.modelos.length === 0) return null;

  const selectedModel = offer.modelos.find((item) => item.id === selection?.modelo);
  const selected = Boolean(selection?.modelo && selection?.tamanho);

  function chooseModel(modelo) {
    const model = offer.modelos.find((item) => item.id === modelo);
    const sizeStillValid = model?.tamanhos?.some((item) => item.tamanho === selection?.tamanho);
    onChange({ modelo, tamanho: sizeStillValid ? selection.tamanho : '' });
  }

  function clear() {
    onChange({ modelo: '', tamanho: '' });
  }

  return (
    <div style={{ marginTop: 18, marginBottom: 18, border: '1px solid #E7D8D2', borderRadius: 16, overflow: 'hidden', background: '#FFFDFC' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', background: '#F8F0EC' }}>
        <span style={{ width: 38, height: 38, borderRadius: 12, display: 'grid', placeItems: 'center', background: '#fff', color: '#7A1F2B' }}><Shirt size={20} /></span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#2D2020' }}>Adicione sua camisa M31</div>
          <div style={{ fontSize: 12, color: '#7A6E6A', marginTop: 2 }}>Valor promocional de R$ {Number(offer.preco || 0).toFixed(2).replace('.', ',')} junto com a inscrição.</div>
        </div>
        {selected && <button type="button" onClick={clear} disabled={disabled} style={{ border: 0, background: 'transparent', color: '#7A1F2B', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Remover</button>}
      </div>

      <div style={{ padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#6B5D59', marginBottom: 8 }}>1. Escolha o modelo</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {offer.modelos.map((model) => (
            <button
              key={model.id}
              type="button"
              disabled={disabled}
              onClick={() => chooseModel(model.id)}
              style={{
                minHeight: 42,
                padding: '0 14px',
                borderRadius: 12,
                border: selection?.modelo === model.id ? '1px solid #7A1F2B' : '1px solid #E4D8D3',
                background: selection?.modelo === model.id ? '#7A1F2B' : '#fff',
                color: selection?.modelo === model.id ? '#fff' : '#3D3330',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {MODEL_LABELS[model.id] || model.id}
            </button>
          ))}
        </div>

        {selectedModel && (
          <>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#6B5D59', marginTop: 14, marginBottom: 8 }}>2. Escolha o tamanho</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {selectedModel.tamanhos.map((item) => (
                <button
                  key={item.tamanho}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange({ modelo: selectedModel.id, tamanho: item.tamanho })}
                  style={{
                    width: 48,
                    height: 44,
                    borderRadius: 12,
                    border: selection?.tamanho === item.tamanho ? '1px solid #7A1F2B' : '1px solid #E4D8D3',
                    background: selection?.tamanho === item.tamanho ? '#7A1F2B' : '#fff',
                    color: selection?.tamanho === item.tamanho ? '#fff' : '#3D3330',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  {item.tamanho}
                </button>
              ))}
            </div>
          </>
        )}

        {!selected && <div style={{ marginTop: 12, fontSize: 11, color: '#8A7C77' }}>Opcional. Se não quiser camisa, siga normalmente.</div>}
        {selected && <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: '#F3F8F3', color: '#37623B', fontSize: 12, fontWeight: 700 }}>Camisa {MODEL_LABELS[selection.modelo] || selection.modelo} · tamanho {selection.tamanho} adicionada ao pedido.</div>}
      </div>
    </div>
  );
}
