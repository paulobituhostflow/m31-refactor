import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { C } from './CaravanasUtils';

export default function CaravanaMesclarModal({ caravanas, inscricoes, onClose, onMerged }) {
  const [step, setStep] = useState(1); // 1=select origin, 2=select dest, 3=confirm
  const [selecionadas, setSelecionadas] = useState([]);
  const [destinoId, setDestinoId] = useState('');
  const [saving, setSaving] = useState(false);

  const destino = caravanas.find(c => c.id === destinoId);

  const handleSelectOrigin = (id) => {
    setSelecionadas(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleMesclar = async () => {
    if (selecionadas.length === 0 || !destinoId) return;
    setSaving(true);
    try {
      await base44.functions.invoke('m31MigrarCaravanas', {
        caravanas_ids_origem: selecionadas,
        caravana_id_destino: destinoId
      });
      onMerged();
      onClose();
    } catch (e) {
      alert('Erro ao mesclar: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const totalMembrosOrigin = selecionadas.reduce((s, id) => {
    return s + inscricoes.filter(i => i.caravana_id === id).length;
  }, 0);

  const totalMembrosDestino = destinoId
    ? inscricoes.filter(i => i.caravana_id === destinoId).length
    : 0;

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.75)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        background: C.bg2, border: `1px solid ${C.border}`,
        borderRadius: '12px', padding: '24px',
        width: '100%', maxWidth: '420px',
        maxHeight: '80vh', overflowY: 'auto'
      }}>
        <div style={{
          fontSize: '16px', fontWeight: '700',
          color: C.text, marginBottom: '4px'
        }}>
          Mesclar Caravanas
        </div>
        <div style={{
          fontSize: '12px', color: C.textTer, marginBottom: '20px'
        }}>
          Selecione as caravanas a mesclar e a caravana de destino
        </div>

        {step === 1 && (
          <div>
            <div style={{
              fontSize: '11px', fontWeight: '600',
              color: C.textSec, textTransform: 'uppercase',
              letterSpacing: '0.06em', marginBottom: '10px'
            }}>
              Caravanas para mesclar
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '20px' }}>
              {caravanas.map(c => {
                const membros = inscricoes.filter(i => i.caravana_id === c.id).length;
                return (
                  <label key={c.id} style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '10px 12px', background: C.bg3,
                    border: `1.5px solid ${selecionadas.includes(c.id) ? C.brand : C.border}`,
                    borderRadius: '8px', cursor: 'pointer',
                  }}>
                    <input
                      type="checkbox"
                      checked={selecionadas.includes(c.id)}
                      onChange={() => handleSelectOrigin(c.id)}
                      style={{ cursor: 'pointer' }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: C.text }}>
                        {c.nome}
                      </div>
                      <div style={{ fontSize: '11px', color: C.textTer, marginTop: '1px' }}>
                        {membros} membro{membros !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={onClose}
                style={{
                  flex: 1, padding: '10px', background: 'none',
                  border: `1px solid ${C.border}`, borderRadius: '6px',
                  color: C.textSec, fontSize: '13px', cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              <button
                onClick={() => setStep(2)}
                disabled={selecionadas.length === 0}
                style={{
                  flex: 1, padding: '10px', background: C.brand,
                  border: 'none', borderRadius: '6px',
                  color: '#fff', fontSize: '13px', fontWeight: '600',
                  cursor: selecionadas.length === 0 ? 'not-allowed' : 'pointer',
                  opacity: selecionadas.length === 0 ? 0.5 : 1
                }}
              >
                Próximo
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <div style={{
              fontSize: '11px', fontWeight: '600',
              color: C.textSec, textTransform: 'uppercase',
              letterSpacing: '0.06em', marginBottom: '10px'
            }}>
              Mesclar em (destino)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '20px' }}>
              {caravanas.map(c => {
                const membros = inscricoes.filter(i => i.caravana_id === c.id).length;
                const isDisabled = selecionadas.includes(c.id);
                return (
                  <label key={c.id} style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '10px 12px', background: isDisabled ? C.bg4 : C.bg3,
                    border: `1.5px solid ${destinoId === c.id ? C.brand : C.border}`,
                    borderRadius: '8px', cursor: isDisabled ? 'not-allowed' : 'pointer',
                    opacity: isDisabled ? 0.5 : 1
                  }}>
                    <input
                      type="radio"
                      name="destino"
                      value={c.id}
                      checked={destinoId === c.id}
                      onChange={() => setDestinoId(c.id)}
                      disabled={isDisabled}
                      style={{ cursor: isDisabled ? 'not-allowed' : 'pointer' }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: C.text }}>
                        {c.nome}
                      </div>
                      <div style={{ fontSize: '11px', color: C.textTer, marginTop: '1px' }}>
                        {membros} membro{membros !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setStep(1)}
                style={{
                  flex: 1, padding: '10px', background: 'none',
                  border: `1px solid ${C.border}`, borderRadius: '6px',
                  color: C.textSec, fontSize: '13px', cursor: 'pointer'
                }}
              >
                Voltar
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!destinoId}
                style={{
                  flex: 1, padding: '10px', background: C.brand,
                  border: 'none', borderRadius: '6px',
                  color: '#fff', fontSize: '13px', fontWeight: '600',
                  cursor: !destinoId ? 'not-allowed' : 'pointer',
                  opacity: !destinoId ? 0.5 : 1
                }}
              >
                Revisar
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <div style={{
              padding: '14px', background: 'rgba(59,130,246,0.08)',
              border: '1px solid rgba(59,130,246,0.2)',
              borderRadius: '8px', marginBottom: '20px'
            }}>
              <div style={{ fontSize: '12px', color: C.text, marginBottom: '8px' }}>
                <strong>Resumo da operação:</strong>
              </div>
              <ul style={{ fontSize: '12px', color: C.textSec, margin: 0, paddingLeft: '20px', lineHeight: 1.6 }}>
                <li>Caravanas a deletar: {selecionadas.length}</li>
                <li>Membros a migrar: {totalMembrosOrigin}</li>
                <li>Destino: <strong>{destino?.nome}</strong></li>
                <li>Total final: {totalMembrosDestino + totalMembrosOrigin} membros</li>
              </ul>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setStep(2)}
                style={{
                  flex: 1, padding: '10px', background: 'none',
                  border: `1px solid ${C.border}`, borderRadius: '6px',
                  color: C.textSec, fontSize: '13px', cursor: 'pointer'
                }}
              >
                Voltar
              </button>
              <button
                onClick={handleMesclar}
                disabled={saving}
                style={{
                  flex: 1, padding: '10px', background: C.danger,
                  border: 'none', borderRadius: '6px',
                  color: '#fff', fontSize: '13px', fontWeight: '600',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.7 : 1
                }}
              >
                {saving ? 'Mesclando...' : 'Confirmar Mesclagem'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}