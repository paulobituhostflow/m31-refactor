
// Visão "Planilha Financeira" — espelha o relatório contábil oficial do M31.
// Cabeçalho verde-petróleo, agrupamento por descrição, totais e receita comprovada por gateway.

const brl = (v) =>
  'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const VERDE = '#1F4E4A';       // verde petróleo do título
const VERDE_HEADER = '#2C5F5A'; // header das colunas
const AMARELO = '#FDE9C8';     // faixa de total (bege/laranja claro)
const VERDE_CLARO = '#DCEAD9'; // linhas destacadas (revisar caravana/voluntárias)

function tipoCor(tipo) {
  return tipo === 'Receita' ? '#1F4E4A' : '#B45309';
}

export default function FinPlanilha({ planilha }) {
  if (!planilha) return null;
  const { metaParticipantes, linhas, totalParticipantes, arrecadacaoBruta, gateway } = planilha;

  const th = {
    background: VERDE_HEADER, color: '#FFFFFF', fontSize: '12px', fontWeight: '700',
    padding: '8px 12px', textAlign: 'left', border: '1px solid #FFFFFF',
    fontFamily: 'Inter, sans-serif',
  };
  const td = {
    fontSize: '13px', color: '#1A1A2E', padding: '7px 12px',
    border: '1px solid #E5E7EB', fontFamily: 'Inter, sans-serif',
  };
  const tdNum = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
      {/* Título */}
      <div style={{ background: VERDE, color: '#FFFFFF', textAlign: 'center', padding: '14px', fontFamily: 'Inter, sans-serif', fontSize: '18px', fontWeight: '700', letterSpacing: '0.05em' }}>
        FINANCEIRO
      </div>

      <div style={{ overflowX: 'auto', padding: '16px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
          <thead>
            <tr>
              <th style={th}>Descrição</th>
              <th style={{ ...th, textAlign: 'center', width: '90px' }}>Quantidade</th>
              <th style={{ ...th, textAlign: 'right', width: '130px' }}>Valor individual</th>
              <th style={{ ...th, textAlign: 'right', width: '130px' }}>Valor coletivo</th>
              <th style={{ ...th, width: '100px' }}>Tipo de Verba</th>
              <th style={th}>Observações</th>
            </tr>
          </thead>
          <tbody>
            {/* Meta */}
            <tr>
              <td style={{ ...td, fontWeight: '700' }}>Meta:</td>
              <td style={{ ...tdNum, fontWeight: '700' }}>{metaParticipantes}</td>
              <td style={td}></td>
              <td style={td}></td>
              <td style={td}></td>
              <td style={{ ...td, color: '#6B7280' }}>Meta de participantes</td>
            </tr>

            {linhas.map((l) => {
              const destaque = l.chave === 'car_sem' || l.chave.startsWith('vol_');
              return (
                <tr key={l.chave} style={destaque ? { background: VERDE_CLARO } : undefined}>
                  <td style={td}>{l.descricao}</td>
                  <td style={tdNum}>{l.quantidade}</td>
                  <td style={tdNum}>{brl(l.valorIndividual)}</td>
                  <td style={tdNum}>{brl(l.valorColetivo)}</td>
                  <td style={{ ...td, color: tipoCor(l.tipo), fontWeight: '600' }}>{l.tipo}</td>
                  <td style={{ ...td, color: '#6B7280', fontSize: '12px' }}>{l.obs}</td>
                </tr>
              );
            })}

            {/* Total de participantes */}
            <tr style={{ background: AMARELO }}>
              <td style={{ ...td, fontWeight: '700', border: '1px solid #E8C99A' }}>Total de participantes:</td>
              <td style={{ ...tdNum, fontWeight: '700', border: '1px solid #E8C99A' }}>{totalParticipantes}</td>
              <td style={{ ...td, fontWeight: '700', border: '1px solid #E8C99A' }}>Arrecadação</td>
              <td style={{ ...tdNum, fontWeight: '700', border: '1px solid #E8C99A' }}>{brl(arrecadacaoBruta)}</td>
              <td style={{ ...td, border: '1px solid #E8C99A' }}></td>
              <td style={{ ...td, border: '1px solid #E8C99A' }}></td>
            </tr>
          </tbody>
        </table>

        {/* Receita comprovada por gateway */}
        <div style={{ marginTop: '20px' }}>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', fontWeight: '700', color: '#7A1F2B', marginBottom: '8px', letterSpacing: '0.03em' }}>
            RECEITA COMPROVADA — registros financeiros
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', maxWidth: '640px' }}>
            <tbody>
              <tr>
                <td style={td}>Mercado Pago — recebido (bruto)</td>
                <td style={tdNum}>{brl(gateway.mpBruto)}</td>
                <td style={{ ...td, color: '#6B7280', fontSize: '12px' }}>transações approved no MP</td>
              </tr>
              <tr>
                <td style={td}>Asaas — recebido (bruto)</td>
                <td style={tdNum}>{brl(gateway.asaasBruto)}</td>
                <td style={{ ...td, color: '#6B7280', fontSize: '12px' }}>Confirmada + Recebida</td>
              </tr>
              <tr style={{ background: '#F9FAFB' }}>
                <td style={{ ...td, fontWeight: '700' }}>TOTAL RECEBIDO (bruto)</td>
                <td style={{ ...tdNum, fontWeight: '700' }}>{brl(gateway.totalBruto)}</td>
                <td style={td}></td>
              </tr>
              <tr style={{ background: '#F9FAFB' }}>
                <td style={{ ...td, fontWeight: '700' }}>TOTAL RECEBIDO (líquido, após taxas)</td>
                <td style={{ ...tdNum, fontWeight: '700', color: '#1F4E4A' }}>{brl(gateway.totalLiquido)}</td>
                <td style={{ ...td, color: '#6B7280', fontSize: '12px' }}>taxas estimadas: {brl(gateway.taxas)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}