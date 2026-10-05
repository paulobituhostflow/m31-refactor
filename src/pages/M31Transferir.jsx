import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { M31Logo } from '@/components/M31Logo';

const BRAND = '#8B1A2B';
const BG = '#0D0D0D';
const CARD = '#161616';
const TXT = '#F5F5F0';
const TXT_SEC = '#D0D0C8';
const TXT_TER = '#808078';
const BORDER = 'rgba(255,255,255,0.12)';

const MOTIVO_MSG = {
  nao_encontrado: 'Este link de transferência não é válido.',
  expirada: 'Este link de transferência expirou.',
  concluida: 'Esta transferência já foi concluída.',
  prazo_evento: 'O prazo para transferências deste evento já encerrou.',
};

function Field({ label, required, ...props }) {
  return (
    <div style={{ marginBottom: '16px', textAlign: 'left' }}>
      <label style={{ display: 'block', fontSize: '13px', color: TXT_SEC, marginBottom: '6px', fontWeight: 600 }}>
        {label} {required && <span style={{ color: '#EF6B7D' }}>*</span>}
      </label>
      <input
        {...props}
        style={{
          width: '100%', height: '48px', padding: '0 14px',
          background: '#1F1F1F', border: `1px solid ${BORDER}`, borderRadius: '10px',
          color: TXT, fontSize: '15px', outline: 'none', boxSizing: 'border-box',
        }}
      />
    </div>
  );
}

export default function M31Transferir() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState(null);
  const [form, setForm] = useState({ nome: '', cpf: '', whatsapp: '', email: '', cidade: '' });
  const [submitting, setSubmitting] = useState(false);
  const [erro, setErro] = useState(null);
  const [sucesso, setSucesso] = useState(false);

  // Força light-off / dark visual da landing (fundo escuro)
  useEffect(() => {
    document.body.style.backgroundColor = BG;
    return () => { document.body.style.backgroundColor = ''; };
  }, []);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const res = await base44.functions.invoke('m31ConsultarTransferencia', { token });
        if (ativo) setInfo(res.data);
      } catch {
        if (ativo) setInfo({ valido: false, motivo_invalido: 'nao_encontrado' });
      } finally {
        if (ativo) setLoading(false);
      }
    })();
    return () => { ativo = false; };
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro(null);
    setSubmitting(true);
    try {
      const res = await base44.functions.invoke('m31ConcluirTransferencia', { token, ...form });
      if (res.data?.success) {
        setSucesso(true);
      } else {
        setErro(res.data?.error || 'Não foi possível concluir a transferência.');
      }
    } catch (err) {
      const msg = err?.response?.data?.error || 'Não foi possível concluir a transferência.';
      setErro(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const wrap = {
    minHeight: '100vh', background: BG, color: TXT,
    fontFamily: 'system-ui, -apple-system, sans-serif',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
  };
  const inner = { maxWidth: '440px', width: '100%', textAlign: 'center' };

  if (loading) {
    return (
      <div style={wrap}>
        <div style={{ width: 36, height: 36, border: `4px solid ${BORDER}`, borderTopColor: BRAND, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // Sucesso
  if (sucesso) {
    return (
      <div style={wrap}>
        <div style={inner}>
          <div style={{ width: '120px', margin: '0 auto 32px' }}><M31Logo size="lg" /></div>
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>✅</div>
          <h1 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '12px' }}>Transferência concluída!</h1>
          <p style={{ fontSize: '15px', lineHeight: 1.6, color: TXT_SEC }}>
            A inscrição agora está no nome de <strong>{form.nome}</strong>. Todas as informações do evento serão enviadas para o novo WhatsApp cadastrado.
          </p>
          <p style={{ fontSize: '11px', color: TXT_TER, marginTop: '32px', letterSpacing: '0.05em' }}>
            M31 Filhas · Edição 2026
          </p>
        </div>
      </div>
    );
  }

  // Token inválido / expirado / concluído / fora do prazo
  if (!info?.valido) {
    return (
      <div style={wrap}>
        <div style={inner}>
          <div style={{ width: '120px', margin: '0 auto 32px' }}><M31Logo size="lg" /></div>
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>⚠️</div>
          <h1 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '12px' }}>Link indisponível</h1>
          <p style={{ fontSize: '15px', lineHeight: 1.6, color: TXT_SEC }}>
            {MOTIVO_MSG[info?.motivo_invalido] || 'Este link de transferência não está mais disponível.'}
          </p>
          <p style={{ fontSize: '13px', color: TXT_TER, marginTop: '16px' }}>
            Entre em contato com a organização para mais informações.
          </p>
        </div>
      </div>
    );
  }

  // Formulário do novo titular
  return (
    <div style={wrap}>
      <div style={{ ...inner, textAlign: 'left' }}>
        <div style={{ width: '120px', margin: '0 auto 28px' }}><M31Logo size="lg" /></div>

        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <div style={{ fontSize: '12px', color: BRAND, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {info.evento_nome}
          </div>
          <h1 style={{ fontSize: '21px', fontWeight: 'bold', marginTop: '8px' }}>
            Transferência de inscrição
          </h1>
          {info.titular_atual_nome && (
            <p style={{ fontSize: '14px', color: TXT_SEC, marginTop: '6px' }}>
              Você está transferindo a inscrição de <strong>{info.titular_atual_nome}</strong>.
            </p>
          )}
        </div>

        <div style={{
          background: 'rgba(139,26,43,0.12)', border: `1px solid rgba(139,26,43,0.35)`,
          borderRadius: '10px', padding: '12px 14px', margin: '18px 0 22px',
          fontSize: '12.5px', lineHeight: 1.55, color: TXT_SEC,
        }}>
          Esta transferência só é possível até a data limite definida pela organização. Após esse prazo, não será possível alterar a participante. Esta operação altera apenas a participante — o pagamento continua vinculado ao comprador original.
        </div>

        <form onSubmit={handleSubmit}>
          <Field label="Nome completo" required value={form.nome}
            onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Nome do novo titular" />
          <Field label="CPF" required value={form.cpf} inputMode="numeric"
            onChange={e => setForm({ ...form, cpf: e.target.value })} placeholder="Somente números" />
          <Field label="WhatsApp" required value={form.whatsapp} inputMode="tel"
            onChange={e => setForm({ ...form, whatsapp: e.target.value })} placeholder="(00) 00000-0000" />
          <Field label="E-mail" type="email" value={form.email}
            onChange={e => setForm({ ...form, email: e.target.value })} placeholder="opcional" />
          <Field label="Cidade" value={form.cidade}
            onChange={e => setForm({ ...form, cidade: e.target.value })} placeholder="opcional" />

          {erro && (
            <div style={{
              background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)',
              borderRadius: '10px', padding: '10px 14px', margin: '4px 0 16px',
              fontSize: '13px', color: '#F5A3AD',
            }}>
              {erro}
            </div>
          )}

          <button type="submit" disabled={submitting}
            style={{
              width: '100%', height: '54px', background: BRAND, color: '#FFF',
              border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: 'bold',
              letterSpacing: '0.4px', cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.7 : 1, marginTop: '6px',
              boxShadow: '0 4px 16px rgba(139,26,43,0.3)',
            }}>
            {submitting ? 'Transferindo...' : 'CONFIRMAR TRANSFERÊNCIA'}
          </button>
        </form>

        <p style={{ fontSize: '11px', color: TXT_TER, marginTop: '24px', letterSpacing: '0.05em', textAlign: 'center' }}>
          M31 Filhas · Edição 2026
        </p>
      </div>
    </div>
  );
}