
/**
 * GiftConfirmScreen
 * Tela de confirmação "Você está abençoando…" mostrada antes do pagamento
 * no fluxo de inscrição presenteada. Reduz erro de telefone da presenteada.
 */
function formatPhone(raw) {
  const d = (raw || '').replace(/\D/g, '').replace(/^55/, '').slice(0, 11);
  if (!d) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export default function GiftConfirmScreen({ nome, whatsapp, totalValue, loading, onConfirm, onBack }) {
  return (
    <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
      <div className="m31-ds-form-head">
        <div className="m31-ds-title">Confirme o <em>presente</em></div>
        <div className="m31-ds-subtitle">
          Confira os dados da pessoa que você está abençoando. Ela receberá um link no WhatsApp para completar a própria inscrição.
        </div>
      </div>

      <div style={{
        background: '#FBF3F4',
        border: '1px solid #E7CDD1',
        borderRadius: 14,
        padding: 20,
        marginBottom: 20,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', color: '#8A2634', textTransform: 'uppercase', marginBottom: 14 }}>
          🎁 Você está abençoando
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: '#8B7B7B', marginBottom: 2 }}>Nome</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#2F2A2A' }}>{nome || '—'}</div>
        </div>

        <div>
          <div style={{ fontSize: 12, color: '#8B7B7B', marginBottom: 2 }}>WhatsApp</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#2F2A2A' }}>{formatPhone(whatsapp) || '—'}</div>
        </div>
      </div>

      <div className="m31-ds-info-box" style={{ marginBottom: 20 }}>
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        <span>Se o WhatsApp estiver errado, ela não receberá o link. Confira com atenção.</span>
      </div>

      <button className="m31-ds-btn-primary" onClick={onConfirm} disabled={loading}>
        {loading ? <>Registrando<span className="m31-ds-dots"><span/><span/><span/></span></> : <>Está correto — ir para pagamento →</>}
      </button>

      <button
        type="button"
        onClick={onBack}
        disabled={loading}
        style={{
          width: '100%', marginTop: 12, padding: '12px', background: 'transparent',
          border: 'none', color: '#8A2634', fontSize: 14, fontWeight: 600,
          cursor: loading ? 'not-allowed' : 'pointer', textDecoration: 'underline',
        }}
      >
        Corrigir os dados
      </button>
    </div>
  );
}