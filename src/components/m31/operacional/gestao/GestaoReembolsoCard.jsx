import { RefreshCw, Clock3 } from 'lucide-react';

const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const FORMA = { PIX: 'Pix', CREDIT_CARD: 'Cartão' };
const EM_CURSO = ['aguardando_autorizacao', 'em_processamento', 'em_conferencia'];

// Ficha do reembolso: o estado exibido é sempre o do Asaas. Enquanto a operação
// não for confirmada, nada é apresentado como reembolsado.
export default function GestaoReembolsoCard({ reembolso, nome, refreshing, onRefresh }) {
  if (!reembolso) return null;
  const primeiro = String(nome || '').trim().split(/\s+/)[0] || '';
  const estado = reembolso.estado || null;
  const aguardando = reembolso.aguardando_autorizacao === true;
  const concluido = reembolso.reembolsado === true;
  const semReembolso = estado === 'sem_reembolso';
  const emCurso = EM_CURSO.includes(estado);
  const forma = FORMA[reembolso.forma] || reembolso.forma || 'Forma não informada';

  return (
    <section
      style={{
        border: `1px solid ${aguardando ? '#E4C27A' : '#E4D8D3'}`,
        background: aguardando ? '#FFFBF2' : '#FFF',
        borderRadius: 14,
        padding: '14px 14px 12px',
        margin: '10px 0',
      }}
      aria-live="polite"
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#2D2020' }}>
          Reembolso{primeiro ? ` — ${primeiro}` : ''}
        </h4>
        <strong style={{ fontSize: 15, color: '#2D2020', whiteSpace: 'nowrap' }}>{brl(reembolso.valor)}</strong>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
        {aguardando && <Clock3 size={15} aria-hidden="true" color="#8A6A1F" />}
        <span
          style={{
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: '0.02em',
            padding: '3px 8px',
            borderRadius: 6,
            background: aguardando ? '#F7E9C6' : concluido ? '#E4F5E9' : '#F1EDEA',
            color: aguardando ? '#7A5C12' : concluido ? '#15803D' : '#5B4E48',
          }}
        >
          {aguardando ? 'Aguardando autorização' : reembolso.rotulo}
        </span>
      </div>

      <p style={{ margin: '8px 0 0', fontSize: 13, color: '#5B4E48' }}>
        {semReembolso ? forma : `${forma} · Estorno solicitado`}
      </p>
      {!semReembolso && reembolso.mensagem && (
        <p style={{ margin: '4px 0 0', fontSize: 13, color: aguardando ? '#7A5C12' : '#6B5D59', fontWeight: aguardando ? 700 : 400 }}>
          {reembolso.mensagem}
        </p>
      )}
      {emCurso && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#8A7C76' }}>Ainda não reembolsado. Comprovante indisponível.</p>}

      {aguardando && onRefresh && (
        <button
          type="button"
          className="m31-gestao-btn"
          style={{ marginTop: 10 }}
          onClick={onRefresh}
          disabled={refreshing}
        >
          <RefreshCw size={16} aria-hidden="true" />{refreshing ? 'Consultando…' : 'Atualizar consulta'}
        </button>
      )}
    </section>
  );
}
