import { AlertCircle, Inbox, RefreshCw } from 'lucide-react';
import { useM31FinanceiroDashboard } from '@/hooks/useM31FinanceiroDashboard';
import FinFiltros from '@/components/m31/financeiro/FinFiltros';
import FinCards from '@/components/m31/financeiro/FinCards';
import FinGraficos from '@/components/m31/financeiro/FinGraficos';
import FinTabelas from '@/components/m31/financeiro/FinTabelas';
import FinPlanilha from '@/components/m31/financeiro/FinPlanilha';

function EstadoCentral({ icon: Icon, cor, titulo, msg, acao }) {
  return (
    <div style={{
      background: '#FFFFFF', border: '1px solid #E8ECF3', borderRadius: '12px',
      padding: '48px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
    }}>
      <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: `${cor}14`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={24} color={cor} />
      </div>
      <h3 style={{ fontFamily: 'Inter, sans-serif', fontSize: '16px', fontWeight: '600', color: '#1A1A2E', margin: 0 }}>{titulo}</h3>
      <p style={{ fontSize: '13px', color: '#6B7280', margin: 0, maxWidth: '360px' }}>{msg}</p>
      {acao}
    </div>
  );
}

export default function M31DashboardFinanceiro() {
  const {
    filtros, setFiltros, refetch, isLoading, isError, isEmpty,
    stats, graficos, tabelas, planilha, provedoresDisponiveis, atualizadoEm,
  } = useM31FinanceiroDashboard();

  const atualizadoStr = atualizadoEm
    ? new Date(atualizadoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h2 style={{ fontFamily: 'Inter, sans-serif', fontSize: '20px', fontWeight: '700', color: '#1A1A2E', margin: 0 }}>
            Centro de Controle Financeiro
          </h2>
          <p style={{ fontSize: '13px', color: '#6B7280', margin: '2px 0 0 0' }}>
            Fonte: inscrições reais · atualizado em {atualizadoStr}
          </p>
        </div>
      </div>

      {/* Filtros sempre visíveis */}
      <FinFiltros
        filtros={filtros}
        setFiltros={setFiltros}
        onRefresh={refetch}
        provedores={provedoresDisponiveis}
        isLoading={isLoading}
      />

      {/* Estados */}
      {isLoading && (
        <EstadoCentral icon={RefreshCw} cor="#3B82F6" titulo="Carregando dados financeiros"
          msg="Consultando as inscrições reais para calcular receita, taxas e divergências." />
      )}

      {!isLoading && isError && (
        <EstadoCentral icon={AlertCircle} cor="#EF4444" titulo="Falha ao carregar os dados"
          msg="Não foi possível consultar as inscrições. Os valores não são exibidos para evitar informações incorretas."
          acao={
            <button onClick={refetch} style={{ marginTop: '4px', height: '38px', padding: '0 18px', background: '#8B1A2B', color: '#FFFFFF', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
              Tentar novamente
            </button>
          } />
      )}

      {!isLoading && !isError && isEmpty && (
        <EstadoCentral icon={Inbox} cor="#6B7280" titulo="Sem dados no período"
          msg="Nenhuma inscrição encontrada. Ajuste os filtros ou aguarde novas transações." />
      )}

      {!isLoading && !isError && !isEmpty && (
        <>
          <FinPlanilha planilha={planilha} />
          <FinCards stats={stats} />
          <FinGraficos graficos={graficos} />
          <FinTabelas stats={stats} tabelas={tabelas} />
        </>
      )}
    </div>
  );
}