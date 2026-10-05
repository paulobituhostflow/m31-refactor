/**
 * M31GestaoFornecedores — CRUD de Fornecedores (Light Executive).
 * Usa design system canônico: TOKENS, PageHeader, EmptyState, Badge, feedback.
 */
import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, Trash2, Building2, Search, Wallet } from 'lucide-react';
import { TOKENS } from '@/lib/m31DesignTokens';
import { PageHeader, EmptyState, feedback } from '@/components/m31/ui';
import M31FornecedorFinanceiro from '@/components/m31/fornecedores/M31FornecedorFinanceiro';

export default function M31GestaoFornecedores() {
  const [filtro, setFiltro] = useState('');
  const [editando, setEditando] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    nome: '', categoria: 'outros', cnpj: '', telefone: '', email: '',
    responsavel_nome: '', status: 'ativo', observacoes: ''
  });
  const [financeiroDe, setFinanceiroDe] = useState(null);

  const qc = useQueryClient();

  const { data: fornecedores = [], isLoading } = useQuery({
    queryKey: ['m31_fornecedores'],
    queryFn: () => base44.entities.FinancialSupplier.list('-created_date', 100)
  });

  const criarMutation = useMutation({
    mutationFn: (data) => base44.entities.FinancialSupplier.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['m31_fornecedores'] }); resetForm(); feedback.success('Fornecedor criado.'); }
  });

  const atualizarMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.FinancialSupplier.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['m31_fornecedores'] }); resetForm(); feedback.success('Fornecedor atualizado.'); }
  });

  const deletarMutation = useMutation({
    mutationFn: (id) => base44.entities.FinancialSupplier.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['m31_fornecedores'] }); feedback.success('Fornecedor removido.'); }
  });

  const resetForm = () => {
    setForm({
      nome: '', categoria: 'outros', cnpj: '', telefone: '', email: '',
      responsavel_nome: '', status: 'ativo', observacoes: ''
    });
    setEditando(null);
    setShowForm(false);
  };

  const handleEditar = (fornecedor) => {
    setForm(fornecedor);
    setEditando(fornecedor.id);
    setShowForm(true);
  };

  const handleSalvar = async () => {
    if (!form.nome) { feedback.warning('Preencha o nome do fornecedor.'); return; }
    if (editando) {
      atualizarMutation.mutate({ id: editando, data: form });
    } else {
      criarMutation.mutate(form);
    }
  };

  const CATEGORIAS = [
    { value: 'midia', label: 'Mídia' },
    { value: 'grafica', label: 'Gráfica' },
    { value: 'logistica', label: 'Logística' },
    { value: 'alimentacao', label: 'Alimentação' },
    { value: 'outros', label: 'Outros' },
  ];
  const catLabel = (v) => CATEGORIAS.find(c => c.value === v)?.label || v;

  const filtrados = fornecedores.filter(f =>
    f.nome?.toLowerCase().includes(filtro.toLowerCase()) ||
    f.cnpj?.includes(filtro)
  );

  // ── Estilos base ──────────────────────────────────────────
  const inputStyle = {
    width: '100%', padding: '9px 12px', background: TOKENS.surface,
    border: `1.5px solid ${TOKENS.borderStrong}`, borderRadius: TOKENS.radius.md,
    fontSize: '13px', color: TOKENS.text, outline: 'none',
    fontFamily: TOKENS.font.body, boxSizing: 'border-box',
  };
  const labelStyle = { fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', color: TOKENS.textSubtle, display: 'block', marginBottom: '6px' };
  const btnBase = { padding: '8px 16px', borderRadius: TOKENS.radius.md, fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: TOKENS.font.body, display: 'inline-flex', alignItems: 'center', gap: '6px', border: 'none', transition: `all ${TOKENS.transition.atomic}` };
  const btnPrimary = { ...btnBase, background: TOKENS.primary, color: TOKENS.onPrimary };
  const btnGhost = { ...btnBase, background: 'transparent', border: `1px solid ${TOKENS.borderStrong}`, color: TOKENS.textMuted };

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: 'Financeiro' }, { label: 'Fornecedores' }]}
        title="Fornecedores"
        subtitle="Gestão de prestadores de serviço e contratos"
        action={
          <button style={btnPrimary} onClick={() => { resetForm(); setShowForm(!showForm); }}>
            <Plus size={14} /> Novo Fornecedor
          </button>
        }
      />

      {showForm && (
        <div style={{ background: TOKENS.surface, border: `1px solid ${TOKENS.border}`, borderRadius: TOKENS.radius.lg, padding: '20px', marginBottom: '16px', boxShadow: TOKENS.shadowSm }}>
          <div style={{ fontSize: '15px', fontWeight: '700', color: TOKENS.text, marginBottom: '16px' }}>
            {editando ? 'Editar fornecedor' : 'Novo fornecedor'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={labelStyle}>Nome *</label>
              <input style={inputStyle} value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Nome do fornecedor" />
            </div>
            <div>
              <label style={labelStyle}>Categoria</label>
              <select style={inputStyle} value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })}>
                {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>WhatsApp</label>
              <input style={inputStyle} value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} placeholder="(00) 90000-0000" />
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input style={inputStyle} type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="contato@empresa.com" />
            </div>
            <div>
              <label style={labelStyle}>CNPJ / CPF</label>
              <input style={inputStyle} value={form.cnpj} onChange={e => setForm({ ...form, cnpj: e.target.value })} placeholder="Opcional" />
            </div>
            <div>
              <label style={labelStyle}>Responsável</label>
              <input style={inputStyle} value={form.responsavel_nome} onChange={e => setForm({ ...form, responsavel_nome: e.target.value })} placeholder="Nome do responsável" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Observações</label>
              <input style={inputStyle} value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })} placeholder="Observações (opcional)" />
            </div>
          </div>

          <div style={{ marginTop: '14px', padding: '10px 12px', border: `1px solid ${TOKENS.borderSubtle}`, borderRadius: TOKENS.radius.md, background: TOKENS.surfaceSubtle, fontSize: '12px', color: TOKENS.textMuted }}>
            Os contratos e o controle de parcelas ficam dentro do fornecedor — clique em <strong>Financeiro</strong> após salvar.
          </div>

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
            <button style={btnGhost} onClick={resetForm}>Cancelar</button>
            <button style={btnPrimary} onClick={handleSalvar} disabled={criarMutation.isPending || atualizarMutation.isPending}>
              {editando ? 'Atualizar' : 'Criar'} Fornecedor
            </button>
          </div>
        </div>
      )}

      {/* Busca */}
      {fornecedores.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: TOKENS.surface, border: `1px solid ${TOKENS.borderStrong}`, borderRadius: TOKENS.radius.md, padding: '6px 12px', width: '280px', marginBottom: '14px' }}>
          <Search size={14} color={TOKENS.textSubtle} />
          <input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Buscar por nome ou CNPJ…" style={{ background: 'none', border: 'none', outline: 'none', fontSize: '13px', color: TOKENS.text, width: '100%', fontFamily: TOKENS.font.body }} />
        </div>
      )}

      {/* Lista / Empty State */}
      {filtrados.length === 0 ? (
        <div style={{ background: TOKENS.surface, border: `1px solid ${TOKENS.border}`, borderRadius: TOKENS.radius.lg, boxShadow: TOKENS.shadowSm }}>
          <EmptyState
            icon={Building2}
            title={fornecedores.length === 0 ? 'Nenhum fornecedor cadastrado' : 'Nenhum resultado'}
            description={fornecedores.length === 0 ? 'Comece adicionando prestadores de serviço e seus contratos.' : 'Ajuste sua busca para encontrar o fornecedor.'}
            action={fornecedores.length === 0 && !showForm ? (
              <button style={btnPrimary} onClick={() => setShowForm(true)}><Plus size={14} /> Novo Fornecedor</button>
            ) : undefined}
          />
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '10px' }}>
          {filtrados.map(f => (
            <div key={f.id} style={{ background: TOKENS.surface, border: `1px solid ${TOKENS.border}`, borderRadius: TOKENS.radius.lg, padding: '16px 18px', boxShadow: TOKENS.shadowSm, transition: `all ${TOKENS.transition.atomic}` }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = TOKENS.shadowMd; e.currentTarget.style.borderColor = TOKENS.borderStrong; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = TOKENS.shadowSm; e.currentTarget.style.borderColor = TOKENS.border; }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '15px', fontWeight: '600', color: TOKENS.text, fontFamily: TOKENS.font.heading }}>{f.nome}</span>
                    {f.categoria && <span style={{ fontSize: '11px', fontWeight: '600', color: TOKENS.textMuted, background: TOKENS.surfaceSubtle, border: `1px solid ${TOKENS.border}`, borderRadius: TOKENS.radius.pill, padding: '2px 9px' }}>{catLabel(f.categoria)}</span>}
                  </div>
                  {f.cnpj && <div style={{ fontSize: '12px', color: TOKENS.textMuted, marginTop: '2px' }}>{f.cnpj}</div>}
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button onClick={() => setFinanceiroDe(f)} style={{ ...btnGhost, padding: '6px 10px', color: TOKENS.primary, borderColor: TOKENS.primary }} title="Transações e pagamentos"><Wallet size={14} /> Financeiro</button>
                  <button onClick={() => handleEditar(f)} style={{ ...btnGhost, padding: '6px 10px' }} title="Editar"><Edit size={14} /></button>
                  <button onClick={() => deletarMutation.mutate(f.id)} style={{ ...btnGhost, padding: '6px 10px', color: TOKENS.danger, borderColor: TOKENS.dangerSoft }} title="Excluir"><Trash2 size={14} /></button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', fontSize: '12px', color: TOKENS.textMuted }}>
                {f.telefone && <span>📞 {f.telefone}</span>}
                {f.email && <span>✉️ {f.email}</span>}
                {f.responsavel_nome && <span>Resp.: {f.responsavel_nome}</span>}
                {f.observacoes && <span style={{ gridColumn: '1 / -1' }}>{f.observacoes}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {financeiroDe && (
        <M31FornecedorFinanceiro fornecedor={financeiroDe} onClose={() => setFinanceiroDe(null)} />
      )}
    </div>
  );
}