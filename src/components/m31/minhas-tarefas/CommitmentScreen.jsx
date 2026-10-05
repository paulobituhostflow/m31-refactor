/**
 * CommitmentScreen — Tela de termo de compromisso simples para voluntários pendentes.
 * Ao confirmar, atualiza status do voluntário para 'ativo' e envia confirmação via
 * WhatsApp através da camada governada (m31EnviarMensagemGovernada).
 */
import { HeartHandshake } from 'lucide-react';

export default function CommitmentScreen({ voluntario, areaLabel, onConfirm, saving }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'linear-gradient(180deg, #F9F8F6 0%, #F3F0EC 100%)' }}>
      <div style={{ background: '#FFFFFF', borderRadius: '20px', padding: '32px 24px', maxWidth: '420px', width: '100%', boxShadow: '0 4px 32px rgba(0,0,0,0.06)' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(168,52,74,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <HeartHandshake size={28} color="#8B1A2B" />
          </div>
          <h1 style={{ fontSize: '20px', fontWeight: '700', color: '#1F2937', margin: '0 0 8px', fontFamily: '"Inter", sans-serif' }}>
            Bem-vinda, {voluntario?.nome?.split(' ')[0] || 'voluntária'}!
          </h1>
          <p style={{ fontSize: '14px', color: '#6B7280', lineHeight: '1.5', margin: 0 }}>
            Você foi inscrita como voluntária no <strong>M31 Filhas 2026</strong>{areaLabel ? <> na área de <strong>{areaLabel}</strong></> : null}.
          </p>
        </div>

        <div style={{ background: '#F9F8F6', borderRadius: '12px', padding: '16px', marginBottom: '24px', border: '1px solid #F3F0EC' }}>
          <p style={{ fontSize: '13px', color: '#4B5563', lineHeight: '1.6', margin: 0 }}>
            Ao confirmar, você se compromete a participar ativamente das tarefas atribuídas à sua área,
            concluindo-as dentro dos prazos. Esta é uma confirmação simples do seu comprometimento com o evento.
          </p>
        </div>

        <button
          onClick={onConfirm}
          disabled={saving}
          style={{
            width: '100%', padding: '14px', borderRadius: '12px', border: 'none',
            background: '#8B1A2B', color: '#FFFFFF', fontSize: '15px', fontWeight: '700',
            cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
            fontFamily: '"Inter", sans-serif',
          }}
        >
          {saving ? 'Confirmando...' : 'Aceito e comprometo-me'}
        </button>

        <p style={{ fontSize: '11px', color: '#9CA3AF', textAlign: 'center', marginTop: '12px' }}>
          Você receberá uma confirmação no WhatsApp.
        </p>
      </div>
    </div>
  );
}