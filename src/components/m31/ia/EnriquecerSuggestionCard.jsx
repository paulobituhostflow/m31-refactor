import { TOKENS as T } from '@/lib/m31DesignTokens';
import { Check, Plus } from 'lucide-react';

const CONFIANCA_CFG = {
  alto:  { label: 'Alta',  bg: 'rgba(22,163,74,0.10)',  text: '#16A34A', solid: '#16A34A' },
  medio: { label: 'Média', bg: 'rgba(217,119,6,0.10)',  text: '#B45309', solid: '#D97706' },
  baixo: { label: 'Baixa', bg: 'rgba(220,38,38,0.10)',  text: '#B91C1C', solid: '#DC2626' },
};

/**
 * Linha de tabela para preview de classificação de Frente.
 * Colunas: ☑ | Tarefa | Área | Frente atual | Frente sugerida | Motivo
 */
export default function EnriquecerSuggestionRow({ task, suggestion, areaNome, frenteAtualNome, checked, onToggle }) {
  const conf = CONFIANCA_CFG[suggestion.confianca] || CONFIANCA_CFG.baixo;
  const isNova = !suggestion.frente_id && !!suggestion.frente_nova_nome;
  const frenteSugerida = suggestion.frente_id
    ? suggestion.frente_nome_exibicao || areaNome
    : suggestion.frente_nova_nome || '—';

  return (
    <tr style={{ borderBottom: `1px solid ${T.border}` }}>
      {/* Checkbox */}
      <td style={{ padding: '10px 8px', width: '36px', textAlign: 'center', verticalAlign: 'middle' }}>
        <button onClick={onToggle} style={{
          width: '20px', height: '20px', borderRadius: T.radius.sm,
          border: checked ? 'none' : `1.5px solid ${T.borderStrong}`,
          background: checked ? T.primary : 'transparent',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', padding: 0,
        }}>
          {checked && <Check size={12} color="#fff" strokeWidth={3} />}
        </button>
      </td>

      {/* Tarefa */}
      <td style={{ padding: '10px 8px', fontSize: '13px', color: T.text, fontWeight: '500', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {task.titulo}
      </td>

      {/* Área */}
      <td style={{ padding: '10px 8px', fontSize: '12px', color: T.textMuted, whiteSpace: 'nowrap' }}>
        {areaNome}
      </td>

      {/* Frente atual */}
      <td style={{ padding: '10px 8px', fontSize: '12px', color: T.textSubtle, fontStyle: 'italic', whiteSpace: 'nowrap' }}>
        {frenteAtualNome || 'Sem frente'}
      </td>

      {/* Frente sugerida */}
      <td style={{ padding: '10px 8px', fontSize: '13px', whiteSpace: 'nowrap' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: '4px',
          color: isNova ? T.primary : T.text, fontWeight: isNova ? '600' : '500',
        }}>
          {isNova && <Plus size={11} color={T.primary} strokeWidth={3} />}
          {frenteSugerida}
        </span>
      </td>

      {/* Motivo */}
      <td style={{ padding: '10px 8px', fontSize: '12px', color: T.textMuted, maxWidth: '260px', lineHeight: '16px' }}>
        {suggestion.motivo}
      </td>

      {/* Confiança */}
      <td style={{ padding: '10px 8px', textAlign: 'center' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center',
          background: conf.bg, color: conf.text, borderRadius: T.radius.sm,
          padding: '2px 7px', fontSize: '10px', fontWeight: '700',
        }}>
          {conf.label}
        </span>
      </td>
    </tr>
  );
}