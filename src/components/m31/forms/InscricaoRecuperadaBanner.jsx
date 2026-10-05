
/**
 * Banner exibido quando uma inscrição existente é encontrada.
 * Mostra mensagem diferente para inscrições já aprovadas vs em andamento.
 */
export default function InscricaoRecuperadaBanner({ inscricao, forcarEmAndamento = false }) {
  if (!inscricao) return null;

  const aprovado = !forcarEmAndamento && (inscricao.status_pagamento === 'aprovado' || inscricao.status_pagamento === 'gratuito');

  return (
    <div
      className="m31-ds-info-box"
      style={{
        marginBottom: 16,
        borderColor: aprovado ? 'var(--m31-success, #16A34A)' : undefined,
        background: aprovado ? 'rgba(22,163,74,0.06)' : undefined,
      }}
    >
      <svg viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
        {aprovado
          ? <polyline points="20 6 9 17 4 12" />
          : <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></>
        }
      </svg>
      <span>
        {aprovado
          ? `Sua inscrição já está confirmada! Código: ${inscricao.codigo_inscricao || '—'}. Não é necessário pagar novamente.`
          : 'Encontramos sua inscrição em andamento. Recuperamos seus dados para que você possa completar o cadastro e realizar o pagamento.'
        }
      </span>
    </div>
  );
}