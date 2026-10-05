import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { C, isConfirmado, isPendente } from './CaravanasUtils';

export default function CaravanaDeleteModal({ caravana, membros, outras_caravanas, onClose, onDeleted }) {
  const [step, setStep] = useState('confirm'); // confirm, choose_action, processing, done
  const [action, setAction] = useState(null); // 'mover', 'orfao'
  const [destino_id, setDestinoId] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const confirmados = membros.filter(isConfirmado).length;
  const pendentes = membros.filter(isPendente).length;

  const handleDelete = async () => {
    if (membros.length > 0 && !action) {
      setStep('choose_action');
      return;
    }

    if (action === 'mover' && !destino_id) {
      setError('Selecione uma caravana destino');
      return;
    }

    setDeleting(true);
    setError('');
    
    try {
      // Atualizar membros se necessário
      if (membros.length > 0) {
        if (action === 'mover') {
          const destino = outras_caravanas.find(c => c.id === destino_id);
          await Promise.all(membros.map(m =>
            base44.entities.EventoM31Inscricao.update(m.id, {
              caravana_id: destino_id,
              caravana_nome: destino.nome,
            })
          ));
          
          // Atualizar count da caravana destino
          const membrosDest = membros.length;
          const confirmadosDest = membros.filter(isConfirmado).length;
          await base44.entities.EventoM31Caravana.update(destino_id, {
            total_membros: (destino.total_membros || 0) + membrosDest,
            total_confirmados: (destino.total_confirmados || 0) + confirmadosDest,
          });
        } else if (action === 'orfao') {
          await Promise.all(membros.map(m =>
            base44.entities.EventoM31Inscricao.update(m.id, {
              caravana_id: null,
              caravana_nome: null,
            })
          ));
        }
      }

      // Registrar auditoria
      const user = await base44.auth.me();
      await base44.entities.EventoM31ActionLog.create({
        user_email: user?.email || 'desconhecido',
        user_nome: user?.full_name || 'Desconhecido',
        user_perfil: 'admin',
        acao: `Exclusão de caravana "${caravana.nome}" - ${membros.length} membros afetados`,
        modulo: 'caravanas',
        entidade_id: caravana.id,
        entidade_nome: caravana.nome,
        dados_anteriores: JSON.stringify({
          nome: caravana.nome,
          total_membros: membros.length,
          confirmados,
          pendentes,
          acao_membros: action,
          destino: action === 'mover' ? outras_caravanas.find(c => c.id === destino_id)?.nome : null,
        }),
      });

      // Deletar caravana
      await base44.entities.EventoM31Caravana.delete(caravana.id);

      setStep('done');
      setTimeout(() => {
        onDeleted();
        onClose();
      }, 1200);
    } catch (err) {
      setError(err.message || 'Erro ao excluir caravana');
      setDeleting(false);
    }
  };

  const overlay = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
    zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '20px', animation: 'fadeIn .15s ease',
  };

  const modal = {
    background: C.bg2, border: `1px solid ${C.borderSt}`,
    borderRadius: '14px', padding: '24px', width: '100%', maxWidth: '420px',
    maxHeight: '90vh', overflow: 'auto', animation: 'slideUp .2s cubic-bezier(0.22,1,0.36,1)',
  };

  return (
    <div style={overlay}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
      `}</style>

      {/* CONFIRMATION SCREEN */}
      {step === 'confirm' && (
        <div style={modal}>
          <div style={{ fontSize: '16px', fontWeight: '700', color: C.text, marginBottom: '8px' }}>
            Excluir caravana?
          </div>
          <div style={{ fontSize: '12px', color: C.textTer, marginBottom: '18px', lineHeight: 1.5 }}>
            Essa ação não poderá ser desfeita.
          </div>

          {/* CARAVANA INFO */}
          <div style={{
            background: C.bg3, border: `1px solid ${C.border}`,
            borderRadius: '8px', padding: '12px', marginBottom: '16px',
            fontSize: '13px',
          }}>
            <div style={{ fontWeight: '700', color: C.text, marginBottom: '8px' }}>
              {caravana.nome}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', color: C.textSec }}>
              <div>
                <div style={{ fontSize: '11px', color: C.textTer }}>Confirmados</div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: C.success }}>{confirmados}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: C.textTer }}>Pendentes</div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: C.warning }}>{pendentes}</div>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: '11px', color: C.textTer }}>Total de membros</div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: C.text }}>{membros.length}</div>
              </div>
            </div>
          </div>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: '6px', padding: '8px 12px', fontSize: '12px', color: C.danger,
              marginBottom: '16px',
            }}>
              {error}
            </div>
          )}

          {/* BUTTONS */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={onClose} style={{
              flex: 1, padding: '10px', background: 'none', border: `1px solid ${C.border}`,
              borderRadius: '6px', color: C.textSec, fontSize: '13px', fontWeight: '600',
              cursor: 'pointer', fontFamily: 'Inter,sans-serif', transition: 'all .15s',
            }} onMouseEnter={e => e.target.style.background = C.bg3}
            onMouseLeave={e => e.target.style.background = 'none'}>
              Cancelar
            </button>
            <button onClick={handleDelete} disabled={deleting} style={{
              flex: 1, padding: '10px', background: C.danger, border: 'none',
              borderRadius: '6px', color: '#fff', fontSize: '13px', fontWeight: '600',
              cursor: deleting ? 'not-allowed' : 'pointer', fontFamily: 'Inter,sans-serif',
              opacity: deleting ? 0.7 : 1, transition: 'all .15s',
            }}>
              {deleting ? 'Deletando...' : 'Excluir'}
            </button>
          </div>
        </div>
      )}

      {/* CHOOSE ACTION SCREEN */}
      {step === 'choose_action' && (
        <div style={modal}>
          <div style={{ fontSize: '16px', fontWeight: '700', color: C.text, marginBottom: '8px' }}>
            O que fazer com os {membros.length} membros?
          </div>
          <div style={{ fontSize: '12px', color: C.textTer, marginBottom: '16px' }}>
            Escolha como deseja proceder:
          </div>

          {/* OPTIONS */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
            {/* OPTION 1: MOVE */}
            <label style={{
              display: 'flex', alignItems: 'flex-start', gap: '12px',
              padding: '12px', background: C.bg3, border: `1.5px solid ${action === 'mover' ? C.brand : C.border}`,
              borderRadius: '8px', cursor: 'pointer', transition: 'all .15s',
            }}>
              <input type="radio" checked={action === 'mover'} onChange={() => { setAction('mover'); setError(''); }} 
                style={{ marginTop: '2px', width: '16px', height: '16px', cursor: 'pointer' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: C.text }}>Mover para outra caravana</div>
                <div style={{ fontSize: '11px', color: C.textTer, marginTop: '2px' }}>Os membros serão reassignados</div>
              </div>
            </label>

            {/* SHOW SELECT IF OPTION 1 SELECTED */}
            {action === 'mover' && (
              <select value={destino_id} onChange={e => setDestinoId(e.target.value)} style={{
                width: '100%', padding: '8px 12px', background: C.bg4, border: `1px solid ${C.border}`,
                borderRadius: '6px', color: C.text, fontSize: '12px', fontFamily: 'Inter,sans-serif',
                cursor: 'pointer', marginLeft: '28px',
              }}>
                <option value="">Selecione a caravana destino...</option>
                {outras_caravanas.map(c => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            )}

            {/* OPTION 2: ORPHAN */}
            <label style={{
              display: 'flex', alignItems: 'flex-start', gap: '12px',
              padding: '12px', background: C.bg3, border: `1.5px solid ${action === 'orfao' ? C.brand : C.border}`,
              borderRadius: '8px', cursor: 'pointer', transition: 'all .15s',
            }}>
              <input type="radio" checked={action === 'orfao'} onChange={() => { setAction('orfao'); setError(''); }}
                style={{ marginTop: '2px', width: '16px', height: '16px', cursor: 'pointer' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: C.text }}>Transformar em "Sem Caravana"</div>
                <div style={{ fontSize: '11px', color: C.textTer, marginTop: '2px' }}>Membros ficarão órfãos, sem caravana</div>
              </div>
            </label>
          </div>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: '6px', padding: '8px 12px', fontSize: '12px', color: C.danger,
              marginBottom: '16px',
            }}>
              {error}
            </div>
          )}

          {/* BUTTONS */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setStep('confirm')} style={{
              flex: 1, padding: '10px', background: 'none', border: `1px solid ${C.border}`,
              borderRadius: '6px', color: C.textSec, fontSize: '13px', fontWeight: '600',
              cursor: 'pointer', fontFamily: 'Inter,sans-serif', transition: 'all .15s',
            }}>
              Voltar
            </button>
            <button onClick={handleDelete} disabled={deleting || !action || (action === 'mover' && !destino_id)} style={{
              flex: 1, padding: '10px', background: C.danger, border: 'none',
              borderRadius: '6px', color: '#fff', fontSize: '13px', fontWeight: '600',
              cursor: 'pointer', fontFamily: 'Inter,sans-serif',
              opacity: (deleting || !action || (action === 'mover' && !destino_id)) ? 0.5 : 1,
            }}>
              {deleting ? 'Processando...' : 'Confirmar'}
            </button>
          </div>
        </div>
      )}

      {/* SUCCESS SCREEN */}
      {step === 'done' && (
        <div style={modal}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '56px', height: '56px', borderRadius: '50%',
              background: 'rgba(34,197,94,0.1)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
              fontSize: '28px',
            }}>✓</div>
            <div style={{ fontSize: '15px', fontWeight: '700', color: C.text, marginBottom: '6px' }}>
              Caravana excluída
            </div>
            <div style={{ fontSize: '12px', color: C.textTer, lineHeight: 1.5 }}>
              {action === 'mover' 
                ? `${membros.length} membros foram movidos para ${outras_caravanas.find(c => c.id === destino_id)?.nome}`
                : action === 'orfao'
                ? `${membros.length} membros agora estão sem caravana`
                : 'Operação concluída com sucesso'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}