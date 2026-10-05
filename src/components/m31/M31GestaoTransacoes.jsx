import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Download, Trash2, Search, MessageSquare, User } from 'lucide-react';

const C = {
  bg: '#FFFFFF', border: '#E5E7EB',
  text: '#1A1A1A', muted: '#6B7280',
  subtle: '#9CA3AF', hover: '#F9FAFB',
  input: '#FFFFFF', inputBorder: '#D1D5DB',
  primary: '#7A1F2B', primaryHover: '#6B1A25',
};

const STATUS_BADGE = {
  aprovado: { bg: 'rgba(16,185,129,0.12)', color: '#10B981', label: 'Aprovado' },
  pendente: { bg: 'rgba(245,158,11,0.12)', color: '#F59E0B', label: 'Pendente' },
  pago: { bg: 'rgba(16,185,129,0.12)', color: '#10B981', label: 'Pago' },
  cancelado: { bg: 'rgba(239,68,68,0.12)', color: '#EF4444', label: 'Cancelado' },
};

const inputStyle = {
  height: '36px', boxSizing: 'border-box',
  backgroundColor: C.input, border: `1px solid ${C.inputBorder}`,
  borderRadius: '6px', padding: '0 12px',
  color: C.text, fontSize: '13px', fontFamily: 'Inter, sans-serif', outline: 'none', width: '100%',
};

const selStyle = {
  ...inputStyle, cursor: 'pointer',
};

function StatusBadge({ status }) {
  const s = STATUS_BADGE[status] || { bg: 'rgba(255,255,255,0.08)', color: C.muted, label: status };
  return (
    <span style={{
      backgroundColor: s.bg, color: s.color, borderRadius: '4px',
      padding: '2px 8px', fontSize: '12px', fontFamily: 'Inter, sans-serif', fontWeight: '500',
    }}>{s.label}</span>
  );
}

const CATEGORIAS_ENTRADA = ['dizimo', 'oferta', 'aluguel', 'servicos', 'venda', 'outra'];
const CATEGORIAS_SAIDA = ['fornecedor', 'salario', 'aluguel', 'servicos', 'utilidades', 'manutencao', 'outro'];

export default function M31GestaoTransacoes() {
  const [filtro, setFiltro] = useState('');
  const [tipo, setTipo] = useState('todos');
  const [status, setStatus] = useState('todos');
  const [origem, setOrigem] = useState('todos');
  const [fornecedor, setFornecedor] = useState('todos');
  const [categoria, setCategoria] = useState('todos');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    titulo: '', valor: '', tipo: 'saida', categoria: '',
    data_transacao: new Date().toISOString().split('T')[0],
    forma_pagamento: 'pix', parcelas: 1, status: 'pendente',
  });

  const queryClient = useQueryClient();

  const { data: transacoes = [] } = useQuery({
    queryKey: ['m31_transacoes'],
    queryFn: () => base44.entities.FinancialTransaction.list('-data_transacao', 500)
  });

  const { data: fornecedores = [] } = useQuery({
    queryKey: ['m31_fornecedores'],
    queryFn: () => base44.entities.FinancialSupplier.list('-created_date', 100)
  });

  const criarMutation = useMutation({
    mutationFn: (data) => base44.entities.FinancialTransaction.create({ ...data, valor: parseFloat(data.valor), origem: 'manual' }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['m31_transacoes'] }); resetForm(); }
  });

  const deletarMutation = useMutation({
    mutationFn: (id) => base44.entities.FinancialTransaction.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['m31_transacoes'] })
  });

  const resetForm = () => {
    setForm({ titulo: '', valor: '', tipo: 'saida', categoria: '', data_transacao: new Date().toISOString().split('T')[0], forma_pagamento: 'pix', parcelas: 1, status: 'pendente' });
    setShowForm(false);
  };

  const filtrados = transacoes.filter(t => {
    const matchTitulo = t.titulo?.toLowerCase().includes(filtro.toLowerCase());
    const matchTipo = tipo === 'todos' || t.tipo === tipo;
    const matchStatus = status === 'todos' || t.status === status;
    const matchOrigem = origem === 'todos' || t.origem === origem;
    const matchFornecedor = fornecedor === 'todos' || t.fornecedor_nome === fornecedor;
    const matchCategoria = categoria === 'todos' || t.categoria === categoria;
    return matchTitulo && matchTipo && matchStatus && matchOrigem && matchFornecedor && matchCategoria;
  });

  const fornecedoresUnicos = [...new Set(transacoes.map(t => t.fornecedor_nome).filter(Boolean))].sort();

  const exportarCSV = () => {
    const csv = [['Data', 'Título', 'Valor', 'Tipo', 'Status', 'Origem', 'Originador'],
      ...filtrados.map(t => [t.data_transacao, t.titulo, t.valor?.toFixed(2), t.tipo, t.status, t.origem, t.nome_originador || 'Manual'])
    ].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `transacoes-${new Date().toISOString().split('T')[0]}.csv`; a.click();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontFamily: 'Inter, sans-serif', fontSize: '18px', fontWeight: '600', color: C.text, margin: 0 }}>Transações Financeiras</h2>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', color: C.muted, marginTop: '2px' }}>{filtrados.length} transação(ões) encontrada(s)</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={exportarCSV} style={{
            display: 'flex', alignItems: 'center', gap: '6px', height: '36px', padding: '0 14px',
            backgroundColor: 'transparent', border: `1px solid ${C.inputBorder}`, borderRadius: '6px',
            color: C.muted, fontSize: '13px', fontFamily: 'Inter, sans-serif', cursor: 'pointer',
          }}>
            <Download size={14} /> Exportar
          </button>
          <button onClick={() => setShowForm(!showForm)} style={{
            display: 'flex', alignItems: 'center', gap: '6px', height: '36px', padding: '0 16px',
            backgroundColor: C.primary, border: 'none', borderRadius: '6px',
            color: '#fff', fontSize: '13px', fontFamily: 'Inter, sans-serif', fontWeight: '500', cursor: 'pointer',
          }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = C.primaryHover}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = C.primary}
          >
            <Plus size={15} /> Nova Transação
          </button>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div style={{ backgroundColor: C.bg, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '20px' }}>
          <h3 style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px', fontWeight: '600', color: C.text, marginBottom: '16px' }}>Nova Transação</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <input placeholder="Título *" value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} style={inputStyle} />
            <input placeholder="Valor (R$) *" type="number" value={form.valor} onChange={e => setForm({ ...form, valor: e.target.value })} style={inputStyle} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })} style={selStyle}>
              <option value="saida">Saída</option>
              <option value="entrada">Entrada</option>
            </select>
            <input placeholder="Categoria" value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })} style={inputStyle} />
            <input type="date" value={form.data_transacao} onChange={e => setForm({ ...form, data_transacao: e.target.value })} style={inputStyle} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
            <select value={form.forma_pagamento} onChange={e => setForm({ ...form, forma_pagamento: e.target.value })} style={selStyle}>
              <option value="pix">PIX</option>
              <option value="cartao">Cartão de Crédito</option>
              <option value="parcelado">Parcelado</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="transferencia">Transferência</option>
              <option value="boleto">Boleto</option>
            </select>
            {form.forma_pagamento === 'parcelado' && (
              <input placeholder="Nº de parcelas" type="number" min="1" max="12" value={form.parcelas} onChange={e => setForm({ ...form, parcelas: parseInt(e.target.value) })} style={inputStyle} />
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button onClick={resetForm} style={{
              height: '36px', padding: '0 16px', backgroundColor: 'transparent',
              border: `1px solid ${C.inputBorder}`, borderRadius: '6px',
              color: C.muted, fontSize: '13px', fontFamily: 'Inter, sans-serif', cursor: 'pointer',
            }}>Cancelar</button>
            <button onClick={() => criarMutation.mutate(form)} disabled={!form.titulo || !form.valor} style={{
              height: '36px', padding: '0 16px', backgroundColor: C.primary, border: 'none',
              borderRadius: '6px', color: '#fff', fontSize: '13px', fontFamily: 'Inter, sans-serif',
              fontWeight: '500', cursor: 'pointer', opacity: (!form.titulo || !form.valor) ? 0.5 : 1,
            }}>Criar Transação</button>
          </div>
        </div>
      )}

      {/* Filtros — search em linha própria, selects em scroll horizontal */}
      <div className="flex flex-col gap-2">
        <div style={{ position: 'relative' }}>
          <Search size={14} color={C.subtle} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
          <input placeholder="Buscar..." value={filtro} onChange={e => setFiltro(e.target.value)} style={{ ...inputStyle, paddingLeft: '32px', width: '100%' }} />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap scrollbar-none pb-2">
          <select value={tipo} onChange={e => setTipo(e.target.value)} style={{ ...selStyle, flexShrink: 0 }}>
            <option value="todos">Todos Tipos</option>
            <option value="entrada">Entrada</option>
            <option value="saida">Saída</option>
          </select>
          <select value={status} onChange={e => setStatus(e.target.value)} style={{ ...selStyle, flexShrink: 0 }}>
            <option value="todos">Todos Status</option>
            <option value="pendente">Pendente</option>
            <option value="aprovado">Aprovado</option>
            <option value="pago">Pago</option>
          </select>
          <select value={origem} onChange={e => setOrigem(e.target.value)} style={{ ...selStyle, flexShrink: 0 }}>
            <option value="todos">Todas Origens</option>
            <option value="whatsapp_bot">Bot WhatsApp</option>
            <option value="manual">Manual</option>
          </select>
          <select value={fornecedor} onChange={e => setFornecedor(e.target.value)} style={{ ...selStyle, flexShrink: 0 }}>
            <option value="todos">Todos Fornecedores</option>
            {fornecedoresUnicos.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <select value={categoria} onChange={e => setCategoria(e.target.value)} style={{ ...selStyle, flexShrink: 0 }}>
            <option value="todos">Todas Categorias</option>
            {tipo === 'todos' && <>
              <optgroup label="Entradas">
                {CATEGORIAS_ENTRADA.map(c => <option key={c} value={c}>{c}</option>)}
              </optgroup>
              <optgroup label="Saídas">
                {CATEGORIAS_SAIDA.map(c => <option key={c} value={c}>{c}</option>)}
              </optgroup>
            </>}
            {tipo === 'entrada' && CATEGORIAS_ENTRADA.map(c => <option key={c} value={c}>{c}</option>)}
            {tipo === 'saida' && CATEGORIAS_SAIDA.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Lista */}
      <div style={{ backgroundColor: C.bg, border: `1px solid ${C.border}`, borderRadius: '12px', overflow: 'hidden' }}>
        {filtrados.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: C.muted, fontFamily: 'Inter, sans-serif', fontSize: '14px' }}>
            Nenhuma transação encontrada
          </div>
        ) : filtrados.map((t, idx) => (
          <div key={t.id} style={{
            display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 20px',
            borderBottom: idx < filtrados.length - 1 ? `1px solid rgba(0,0,0,0.06)` : 'none',
          }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = C.hover}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', fontWeight: '500', color: C.text }}>{t.titulo}</span>
                <StatusBadge status={t.status} />
                {t.origem === 'whatsapp_bot' && (
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: '4px',
                    backgroundColor: 'rgba(0,0,0,0.04)', borderRadius: '4px',
                    padding: '2px 7px', fontSize: '11px', color: C.subtle, fontFamily: 'Inter, sans-serif',
                  }}>
                    <MessageSquare size={10} /> Bot
                  </span>
                )}
              </div>
              {t.nome_originador && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: C.subtle, fontFamily: 'Inter, sans-serif', marginTop: '3px' }}>
                  <User size={11} /> {t.nome_originador} · {t.data_transacao}
                </div>
              )}
              {!t.nome_originador && (
                <div style={{ fontSize: '12px', color: C.subtle, fontFamily: 'Inter, sans-serif', marginTop: '3px' }}>{t.data_transacao}</div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
              <span style={{
                fontFamily: 'Inter, sans-serif', fontSize: '15px', fontWeight: '600',
                color: t.tipo === 'entrada' ? '#34D399' : C.text,
              }}>
                {t.tipo === 'entrada' ? '+' : '-'} R$ {t.valor?.toFixed(2).replace('.', ',')}
              </span>
              <button onClick={() => deletarMutation.mutate(t.id)} title="Excluir"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.subtle, padding: '4px', display: 'flex' }}
                onMouseEnter={e => e.currentTarget.style.color = '#F87171'}
                onMouseLeave={e => e.currentTarget.style.color = C.subtle}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}