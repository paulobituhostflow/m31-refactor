import { useState } from 'react';

/**
 * GiftTicketToggle
 * Component para abençoar outra pessoa com um ingresso
 * Aparece após os dados do comprador e antes do botão final
 */
export default function GiftTicketToggle({ 
  isGift, 
  onGiftChange, 
  giftWhatsapp, 
  onGiftWhatsappChange, 
  giftNome,
  onGiftNomeChange,
  giftEmail,
  onGiftEmailChange,
  loteAtivo,
  onTotalChange 
}) {
  const [giftWppTouched, setGiftWppTouched] = useState(false);
  const [giftNomeTouched, setGiftNomeTouched] = useState(false);

  function handleToggle(value) {
    onGiftChange(value);
    if (!value) {
      onGiftWhatsappChange('');
      onGiftNomeChange && onGiftNomeChange('');
      onGiftEmailChange && onGiftEmailChange('');
      setGiftWppTouched(false);
      setGiftNomeTouched(false);
    }
    // Recalcular total
    if (loteAtivo) {
      onTotalChange(value ? loteAtivo.valor * 2 : loteAtivo.valor);
    }
  }

  function maskPhone(raw) {
    const d = raw.replace(/\D/g,'').slice(0,11);
    if (!d) return '';
    if (d.length <= 2) return `(${d}`;
    if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2,3)} ${d.slice(3)}`;
    return `(${d.slice(0,2)}) ${d.slice(2,3)} ${d.slice(3,7)}-${d.slice(7)}`;
  }

  const wppDigits = giftWhatsapp.replace(/\D/g,'');
  const wppValido = wppDigits.length >= 10;
  const nomeValido = (giftNome || '').trim().split(/\s+/).filter(Boolean).length >= 2;

  return (
    <div className="m31-gift-card" style={{
      marginTop: 24,
      padding: 16,
      borderRadius: 12,
      background: '#FFFFFF',
      border: '1px solid var(--m31-slate-300)'
    }}>
      {/* Toggle Principal */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: isGift ? 16 : 0
      }}>
        <button
          type="button"
          onClick={() => handleToggle(!isGift)}
          style={{
            flex: '0 0 auto',
            width: 20,
            height: 20,
            borderRadius: '50%',
            border: `2px solid ${isGift ? '#8B1A2B' : 'var(--m31-slate-400)'}`,
            background: isGift ? '#8B1A2B' : 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease'
          }}
        >
          {isGift && (
            <svg viewBox="0 0 24 24" style={{width: 12, height: 12, stroke: 'white', strokeWidth: 3, fill: 'none'}}>
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          )}
        </button>
        <label style={{flex: 1, cursor: 'pointer', color: 'var(--m31-ink)', fontWeight: 500, fontSize: 14}}>
          Deseja abençoar outra pessoa com uma inscrição?
        </label>
      </div>

      {/* Campos Condicionais */}
      {isGift && (
        <div style={{
          animation: 'fadeIn 0.3s ease-out',
          marginTop: 12
        }}>
          <div className="m31-ds-field" style={{marginBottom: 14}}>
            <span className="m31-ds-label">
              WhatsApp da pessoa presenteada
              <span className="req">*</span>
            </span>
            <input
              type="tel"
              className={`m31-ds-input${giftWppTouched && !wppValido ? ' is-error' : wppValido ? ' is-valid' : ''}`}
              placeholder="(XX) X XXXX-XXXX"
              value={giftWhatsapp}
              onChange={(e) => onGiftWhatsappChange(maskPhone(e.target.value))}
              onBlur={() => setGiftWppTouched(true)}
              style={{marginTop: 8}}
            />
            <div className="m31-ds-field-hint" style={{marginTop: 6}}>
              <span>DDD + número</span>
              <span style={{fontWeight: 600, color: wppValido ? 'var(--m31-slate-500)' : 'var(--m31-slate-400)'}}>
                {wppDigits.length}/11
              </span>
            </div>
            {giftWppTouched && !wppValido && (
              <div className="m31-ds-field-feedback err" style={{marginTop: 6}}>
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                WhatsApp incompleto
              </div>
            )}
          </div>

          <div className="m31-ds-field" style={{marginBottom: 14}}>
            <span className="m31-ds-label">
              Nome da pessoa presenteada
              <span className="req">*</span>
            </span>
            <input
              type="text"
              className={`m31-ds-input${giftNomeTouched && !nomeValido ? ' is-error' : nomeValido ? ' is-valid' : ''}`}
              placeholder="Nome completo"
              value={giftNome || ''}
              onChange={(e) => onGiftNomeChange && onGiftNomeChange(e.target.value)}
              onBlur={() => setGiftNomeTouched(true)}
              style={{marginTop: 8}}
            />
            {giftNomeTouched && !nomeValido && (
              <div className="m31-ds-field-feedback err" style={{marginTop: 6}}>
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                Informe o nome completo
              </div>
            )}
          </div>

          <div className="m31-ds-info-box" style={{marginTop: 4}}>
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            <span>Ela receberá um link no WhatsApp para completar o e-mail e os demais dados. Você não precisa informar isso agora.</span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}