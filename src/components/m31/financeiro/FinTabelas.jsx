
const fmtBRL = n => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const th = { textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#6B7280', textTransform: 'uppercase', padding: '10px 12px', borderBottom: '1px solid #E8ECF3' };
const td = { fontSize: '13px', color: '#1A1A2E', padding: '10px 12px', borderBottom: '1px solid #F1F5F9' };

function Card({ titulo, children }) {
  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E8ECF3', borderRadius: '12px', overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #E8ECF3' }}>
        <h4 style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', fontWeight: '600', color: '#1A1A2E', margin: 0 }}>{titulo}</h4>
      </div>
      {children}
    </div>
  );
}

function Vazio({ msg }) {
  return <div style={{ padding: '28px', textAlign: 'center', color: '#9CA3AF', fontSize: '13px' }}>{msg}</div>;
}

export default function FinTabelas({ stats, tabelas }) {
  const { transacoesRecentes, caravanasResumo, voluntariosResumo } = tabelas;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Transações recentes */}
      <Card titulo={`Transações recentes (${transacoesRecentes.length})`}>
        {transacoesRecentes.length === 0 ? <Vazio msg="Nenhuma transação confirmada no período" /> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Nome</th><th style={th}>Valor</th><th style={th}>Método</th><th style={th}>Provedor</th><th style={th}>Data</th></tr></thead>
              <tbody>
                {transacoesRecentes.map(t => (
                  <tr key={t.id}>
                    <td style={td}>{t.nome}</td>
                    <td style={{ ...td, fontWeight: '600', color: '#059669' }}>{fmtBRL(t.valor)}</td>
                    <td style={td}>{t.metodo}</td>
                    <td style={td}>{t.provedor}</td>
                    <td style={{ ...td, color: '#6B7280' }}>{t.data}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Checkouts em aberto */}
      <Card titulo={`Checkouts em aberto (${stats.checkoutsAberto.length})`}>
        {stats.checkoutsAberto.length === 0 ? <Vazio msg="Nenhum checkout em aberto" /> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Nome</th><th style={th}>WhatsApp</th><th style={th}>Valor</th><th style={th}>Link</th></tr></thead>
              <tbody>
                {stats.checkoutsAberto.slice(0, 25).map(i => (
                  <tr key={i.id}>
                    <td style={td}>{i.nome}</td>
                    <td style={{ ...td, color: '#6B7280' }}>{i.whatsapp}</td>
                    <td style={{ ...td, fontWeight: '600' }}>{fmtBRL(i.valor_pago || i.asaas_total_value)}</td>
                    <td style={td}>
                      {i.asaas_charge_url
                        ? <a href={i.asaas_charge_url} target="_blank" rel="noreferrer" style={{ color: '#3B82F6', fontWeight: '500' }}>Abrir →</a>
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Divergências */}
      <Card titulo={`Divergências financeiras (${stats.divergencias.length})`}>
        {stats.divergencias.length === 0 ? <Vazio msg="Nenhuma divergência encontrada" /> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Nome</th><th style={th}>Valor</th><th style={th}>Motivo</th></tr></thead>
              <tbody>
                {stats.divergencias.slice(0, 25).map(i => {
                  const motivos = [];
                  if (!i.valor_pago) motivos.push('sem valor pago');
                  if (!i.asaas_payment_id) motivos.push('sem ID Asaas');
                  if (!i.pagamento_confirmado_em) motivos.push('sem data financeira');
                  return (
                    <tr key={i.id}>
                      <td style={td}>{i.nome}</td>
                      <td style={td}>{fmtBRL(i.valor_pago)}</td>
                      <td style={{ ...td, color: '#B45309' }}>{motivos.join(' · ')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Caravanas + Voluntários lado a lado */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' }}>
        <Card titulo={`Caravanas (${caravanasResumo.length})`}>
          {caravanasResumo.length === 0 ? <Vazio msg="Nenhuma caravana" /> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>Caravana</th><th style={th}>Inscritos</th><th style={th}>Receita</th></tr></thead>
                <tbody>
                  {caravanasResumo.map(c => (
                    <tr key={c.id}>
                      <td style={td}>{c.nome}</td>
                      <td style={td}>{c.inscritos}</td>
                      <td style={{ ...td, fontWeight: '600', color: '#059669' }}>{fmtBRL(c.receita)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card titulo="Voluntários">
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '20px' }}>
              <div><div style={{ fontSize: '22px', fontWeight: '700', color: '#1A1A2E' }}>{voluntariosResumo.total}</div><div style={{ fontSize: '11px', color: '#6B7280' }}>Total</div></div>
              <div><div style={{ fontSize: '22px', fontWeight: '700', color: '#10B981' }}>{voluntariosResumo.ativos}</div><div style={{ fontSize: '11px', color: '#6B7280' }}>Ativos</div></div>
              <div><div style={{ fontSize: '22px', fontWeight: '700', color: '#F59E0B' }}>{voluntariosResumo.pendentes}</div><div style={{ fontSize: '11px', color: '#6B7280' }}>Pendentes</div></div>
            </div>
            {voluntariosResumo.porSetor.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {voluntariosResumo.porSetor.map(s => (
                  <span key={s.setor} style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '100px', background: '#F1F5F9', color: '#475569' }}>
                    {s.setor}: {s.qtd}
                  </span>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}