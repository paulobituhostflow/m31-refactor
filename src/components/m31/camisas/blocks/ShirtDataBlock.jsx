import { DEFAULT_CAMISAS_TEXTOS } from '../camisasLandingConfig';

const styles = {
  card: { background: '#FFFDFB', border: '1px solid #E8E0D4', borderRadius: 18, padding: 16, boxShadow: '0 8px 30px rgba(94,56,43,.06)' },
  title: { fontSize: 18, margin: '0 0 14px' },
  label: { display: 'grid', gap: 6, fontSize: 13, fontWeight: 700, marginBottom: 12 },
  optional: { fontWeight: 500, color: '#95827A' },
  input: { height: 48, border: '1px solid #DCCEC7', borderRadius: 12, padding: '0 13px', fontSize: 16, outline: 'none', background: '#FFF' },
};

// Etapa 3: dados da compradora. O CPF inicia OCULTO: só aparece, sem nenhum
// aviso ou mensagem, quando o WhatsApp informado não tem correspondência na
// base de inscritas (decisão do lookup silencioso do servidor).
export default function ShirtDataBlock({ nome, whatsapp, cpf, email, mostrarCpf, whatsappErro, onNome, onWhatsapp, onWhatsappBlur, onCpf, onEmail, tx }) {
  const t = { ...DEFAULT_CAMISAS_TEXTOS, ...(tx || {}) };
  return (
    <section style={styles.card}>
      <h2 style={styles.title}>{t.dados_titulo}</h2>
      <label style={styles.label}>{t.dados_nome}<input value={nome} onChange={(e) => onNome(e.target.value)} style={styles.input} autoComplete="name" /></label>
      <label style={styles.label}>{t.dados_whatsapp}<input value={whatsapp} onChange={(e) => onWhatsapp(e.target.value)} onBlur={onWhatsappBlur} style={{ ...styles.input, ...(whatsappErro ? { borderColor: '#C98181' } : {}) }} inputMode="tel" autoComplete="tel" /></label>
      {whatsappErro && <p style={{ margin: '-8px 0 12px', fontSize: 12, color: '#A9433B' }}>{whatsappErro}</p>}
      {mostrarCpf && (
        <label style={styles.label}>{t.dados_cpf}<input value={cpf} onChange={(e) => onCpf(e.target.value)} style={styles.input} inputMode="numeric" placeholder="000.000.000-00" /></label>
      )}
      <label style={styles.label}>{t.dados_email} <span style={styles.optional}>{t.dados_opcional}</span><input value={email} onChange={(e) => onEmail(e.target.value)} style={styles.input} type="email" autoComplete="email" /></label>
    </section>
  );
}