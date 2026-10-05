/**
 * M31DashboardFinanceiro — Financeiro resumido com dados reais
 * Linhas clicáveis direcionam para Financeiro / Participantes pendentes.
 */
import { useState } from 'react';
import { Eye, EyeOff, ChevronRight } from 'lucide-react';

function AuditoriaPendenteRow({ valor, pessoas }) {
  const [visivel, setVisivel] = useState(false);
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-amber-50 border border-dashed border-amber-300">
      <div>
        <p className="text-caption text-amber-800">Auditoria pendente</p>
        <p className="text-xs text-amber-700/70 mt-0.5">
          {pessoas} pagtos duplicados · aguarda decisão
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span
          className="text-sm font-bold transition-all"
          style={{
            color: visivel ? '#9A3412' : 'transparent',
            textShadow: visivel ? 'none' : '0 0 8px rgba(154,52,18,0.4)',
          }}
        >
          {visivel ? valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ •••'}
        </span>
        <button
          onClick={() => setVisivel(!visivel)}
          className="p-0.5 cursor-pointer"
        >
          {visivel ? <EyeOff size={14} className="text-amber-800" /> : <Eye size={14} className="text-amber-800" />}
        </button>
      </div>
    </div>
  );
}

function FinanceRow({ label, value, change, positive, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between p-3 rounded-lg cursor-pointer text-left
                 bg-muted/50 hover:bg-accent transition-colors border-none"
    >
      <div>
        <p className="text-caption text-muted-foreground">{label}</p>
        <p className="text-sm font-bold text-foreground mt-0.5">{value}</p>
      </div>
      {change && (
        <div className={`text-xs font-semibold px-2 py-1 rounded-full ${positive ? 'bg-success/10 text-success' : 'bg-amber-100 text-amber-800'}`}>
          {change}
        </div>
      )}
    </button>
  );
}

export default function M31DashboardFinanceiro({ data = {}, onNavigate }) {
  const fmt = n => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const rows = [
    { label: 'Receita Confirmada', value: fmt(data.receitaConfirmada), onClick: () => onNavigate?.('financeiro') },
    { label: 'Pendente', value: fmt(data.receitaPendente), onClick: () => onNavigate?.('participantes', { aba: 'inscricoes', status: 'pendente' }) },
    { label: 'Ticket Médio', value: fmt(data.inscritasPagas > 0 ? data.receitaConfirmada / data.inscritasPagas : 0), onClick: () => onNavigate?.('financeiro') },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-h2 text-foreground">Financeiro</h3>
        <button
          onClick={() => onNavigate?.('transacoes')}
          className="text-xs font-medium text-primary flex items-center gap-1 hover:underline"
        >
          Ver extrato <ChevronRight size={12} />
        </button>
      </div>
      <div className="flex flex-col gap-1.5">
        {rows.map((r, i) => <FinanceRow key={i} {...r} />)}
        {data.auditoriaPendentePessoas > 0 && (
          <AuditoriaPendenteRow valor={data.auditoriaPendenteValor} pessoas={data.auditoriaPendentePessoas} />
        )}
      </div>
    </div>
  );
}