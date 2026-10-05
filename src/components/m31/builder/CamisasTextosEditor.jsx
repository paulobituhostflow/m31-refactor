// Editor dos textos das etapas do fluxo de compra da Lojinha de camisas.
// Salvo no form_json.textos do registro m31_camisas — a lógica financeira
// (preços da pré-venda, Pix, dedup) permanece travada no servidor.
import { DEFAULT_CAMISAS_TEXTOS } from '@/components/m31/camisas/camisasLandingConfig';
import { humanize } from './publicFormsCatalog';

const inputStyle = { width: '100%', padding: '7px 9px', border: '1px solid #E5E7EB', borderRadius: 7, fontSize: 12, color: '#1F2937', outline: 'none', fontFamily: 'Inter, sans-serif', background: '#FAFAFA' };
const labelStyle = { fontSize: 11, fontWeight: 600, color: '#6B7280', marginBottom: 3, display: 'block' };

const GRUPOS = [
  { titulo: 'Etapa 1 — Escolha dos modelos (grade unificada)', chaves: ['selecao_titulo', 'selecao_item', 'selecao_cor', 'selecao_tamanho', 'selecao_cada'] },
  { titulo: 'Etapa 2 — Dados da compradora', chaves: ['dados_titulo', 'dados_nome', 'dados_whatsapp', 'dados_cpf', 'dados_email', 'dados_opcional'] },
  { titulo: 'Etapa 3 — Revisão e pagamento', chaves: ['revisao_titulo', 'revisao_item', 'total_ajuda', 'btn_pagar', 'btn_gerando', 'nota'] },
];

export default function CamisasTextosEditor({ textos, onChange }) {
  const t = { ...DEFAULT_CAMISAS_TEXTOS, ...(textos || {}) };
  const set = (k) => (e) => onChange({ ...t, [k]: e.target.value });

  return (
    <div style={{ padding: '20px 16px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: '#8B1A2B', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
        Textos do fluxo de compra
      </div>
      <p style={{ fontSize: 12, color: '#9CA3AF', lineHeight: 1.5, marginBottom: 16 }}>
        Edite títulos, textos de apoio e botões de cada etapa. Os preços vêm da configuração
        de pré-venda e a validação de pagamento permanece travada — nada aqui altera valores.
      </p>

      {GRUPOS.map((g) => (
        <div key={g.titulo} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#374151', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>{g.titulo}</div>
          {g.chaves.map((k) => (
            <div key={k} style={{ marginBottom: 10 }}>
              <label style={labelStyle}>{humanize(k)}</label>
              {String(DEFAULT_CAMISAS_TEXTOS[k] || '').length > 60 ? (
                <textarea style={{ ...inputStyle, height: 64, resize: 'vertical' }} value={t[k] ?? ''} onChange={set(k)} />
              ) : (
                <input style={inputStyle} value={t[k] ?? ''} onChange={set(k)} />
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}