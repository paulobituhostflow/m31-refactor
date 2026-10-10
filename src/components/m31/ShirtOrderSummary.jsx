function fmt(valor) {
  return `R$ ${Number(valor || 0).toFixed(2).replace('.', ',')}`;
}

function Linha({ label, value, strong, accent }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 6 }}>
      <span style={{ fontSize: strong ? 14 : 13, fontWeight: strong ? 800 : 400, color: strong ? '#2D2020' : '#5B4F4B' }}>{label}</span>
      <span style={{ fontSize: strong ? 15 : 13, fontWeight: strong ? 800 : 600, color: accent ? '#3C7A4A' : '#2D2020' }}>{value}</span>
    </div>
  );
}

// Resumo transparente exibido antes do botão final de pagamento.
export default function ShirtOrderSummary({
  valorInscricao = 0,
  itens = [],
  quantidade = 0,
  precoUnitario = 0,
  subtotal = 0,
  desconto = 0,
  total = 0,
  notaPagamento = '',
}) {
  return (
    <div style={{ margin: '16px 0', border: '1px solid #E8E0D4', borderRadius: 14, background: '#FFFDFB', padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: '#2D2020', marginBottom: 6 }}>Resumo do pedido</div>
      <Linha label="Inscrição" value={fmt(valorInscricao)} />

      {quantidade > 0 && (
        <>
          <div style={{ marginTop: 10, fontSize: 12, fontWeight: 800, color: '#6B5D59' }}>Camisas</div>
          {itens.map((item, i) => (
            <div key={i} style={{ fontSize: 13, color: '#3D3330', marginTop: 4 }}>Camisa {i + 1} · {item}</div>
          ))}
          <Linha label="Quantidade" value={`${quantidade} ${quantidade === 1 ? 'camisa' : 'camisas'}`} />
          <Linha label="Preço unitário" value={fmt(precoUnitario)} />
          <Linha label="Subtotal das camisas" value={fmt(subtotal)} />
          {desconto > 0 && <Linha label="Desconto (promoção)" value={`- ${fmt(desconto)}`} accent />}
        </>
      )}

      <div style={{ borderTop: '1px solid #E8E0D4', marginTop: 10, paddingTop: 8 }}>
        <Linha label="Total final" value={fmt(total)} strong />
      </div>

      {notaPagamento && <div style={{ fontSize: 11, color: '#8A7C77', marginTop: 6 }}>{notaPagamento}</div>}
    </div>
  );
}