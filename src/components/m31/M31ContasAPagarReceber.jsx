import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Plus, Trash2, AlertCircle } from 'lucide-react';

const formatCurrency = (value) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const formatDate = (date) => {
  if (!date) return '—';
  const d = new Date(date + 'T00:00:00');
  return d.toLocaleDateString('pt-BR');
};

export default function M31ContasAPagarReceber() {
  const [abaSelecionada, setAbaSelecionada] = useState('pagar');
  const [filtro, setFiltro] = useState('');
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editando, setEditando] = useState(null);
  const [formData, setFormData] = useState({
    descricao: '', valor: '', fornecedor: '', cliente: '',
    categoria: 'fornecedor', vencimento: '', forma_pagamento: 'pix',
    recorrente_mensal: false, observacoes: ''
  });

  const queryClient = useQueryClient();

  const { data: contasPagar = [] } = useQuery({
    queryKey: ['ContaPagar'],
    queryFn: () => base44.entities.ContaPagar.list()
  });

  const { data: contasReceber = [] } = useQuery({
    queryKey: ['ContaReceber'],
    queryFn: () => base44.entities.ContaReceber.list()
  });

  const criarMutation = useMutation({
    mutationFn: (dados) => {
      const entity = abaSelecionada === 'pagar' ? 'ContaPagar' : 'ContaReceber';
      return base44.entities[entity].create(dados);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [abaSelecionada === 'pagar' ? 'ContaPagar' : 'ContaReceber'] });
      setFormData({
        descricao: '', valor: '', fornecedor: '', cliente: '',
        categoria: 'fornecedor', vencimento: '', forma_pagamento: 'pix',
        recorrente_mensal: false, observacoes: ''
      });
      setMostrarForm(false);
    }
  });

  const deletarMutation = useMutation({
    mutationFn: (id) => {
      const entity = abaSelecionada === 'pagar' ? 'ContaPagar' : 'ContaReceber';
      return base44.entities[entity].delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [abaSelecionada === 'pagar' ? 'ContaPagar' : 'ContaReceber'] });
    }
  });

  const contas = abaSelecionada === 'pagar' ? contasPagar : contasReceber;

  const hoje = new Date().toISOString().split('T')[0];
  const resumo = useMemo(() => {
    const total = contas.filter(c => c.status === 'pendente').reduce((sum, c) => sum + c.valor, 0);
    const atrasos = contas.filter(c => c.status === 'atrasado').length;
    const vencemHoje = contas.filter(c => c.vencimento === hoje && c.status !== 'pago').length;

    return { total, atrasos, vencemHoje };
  }, [contas]);

  const contasFiltradas = contas.filter(c =>
    c.descricao.toLowerCase().includes(filtro.toLowerCase()) ||
    (c.fornecedor?.toLowerCase().includes(filtro.toLowerCase())) ||
    (c.cliente?.toLowerCase().includes(filtro.toLowerCase()))
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    const dados = {
      descricao: formData.descricao,
      valor: parseFloat(formData.valor),
      categoria: formData.categoria,
      vencimento: formData.vencimento,
      forma_pagamento: formData.forma_pagamento,
      recorrente_mensal: formData.recorrente_mensal,
      observacoes: formData.observacoes
    };

    if (abaSelecionada === 'pagar') {
      dados.fornecedor = formData.fornecedor;
    } else {
      dados.cliente = formData.cliente;
    }

    criarMutation.mutate(dados);
  };

  const categoriasPagar = ['fornecedor', 'salario', 'aluguel', 'servicos', 'utilidades', 'manutencao', 'outro'];
  const categoriasReceber = ['dizimo', 'oferta', 'aluguel', 'servicos', 'venda', 'outra'];

  return (
    <div className="bg-gray-900 text-white p-6 rounded-lg space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Contas a Pagar/Receber</h1>
        <p className="text-white/60">Gerencie suas obrigações e direitos financeiros</p>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gray-800 border-red-900/50 p-4">
          <p className="text-white/60 text-sm">A {abaSelecionada === 'pagar' ? 'Pagar' : 'Receber'}</p>
          <p className="text-2xl font-bold text-red-400">{formatCurrency(resumo.total)}</p>
          <p className="text-white/40 text-xs">{resumo.atrasos} atrasos</p>
        </Card>

        <Card className="bg-gray-800 border-green-900/50 p-4">
          <p className="text-white/60 text-sm">Recebido/Pago</p>
          <p className="text-2xl font-bold text-green-400">{abaSelecionada === 'pagar' ? 'R$ 0,00' : 'R$ 0,00'}</p>
          <p className="text-white/40 text-xs">0 {abaSelecionada === 'pagar' ? 'pagos' : 'recebidos'}</p>
        </Card>

        <Card className="bg-gray-800 border-blue-900/50 p-4">
          <p className="text-white/60 text-sm">Vence Hoje</p>
          <p className="text-2xl font-bold text-blue-400">{resumo.vencemHoje}</p>
          <p className="text-white/40 text-xs">Contas a {abaSelecionada === 'pagar' ? 'pagar' : 'receber'}</p>
        </Card>

        <Card className="bg-gray-800 border-purple-900/50 p-4">
          <p className="text-white/60 text-sm">Total</p>
          <p className="text-2xl font-bold text-purple-400">{contas.length}</p>
          <p className="text-white/40 text-xs">Contas registradas</p>
        </Card>
      </div>

      {/* Abas */}
      <div className="flex gap-4 border-b border-white/10">
        <button
          onClick={() => setAbaSelecionada('pagar')}
          className={`pb-3 px-4 font-semibold transition ${
            abaSelecionada === 'pagar'
              ? 'text-red-400 border-b-2 border-red-400'
              : 'text-white/60 hover:text-white'
          }`}
        >
          🔴 Contas a Pagar ({contasPagar.length})
        </button>
        <button
          onClick={() => setAbaSelecionada('receber')}
          className={`pb-3 px-4 font-semibold transition ${
            abaSelecionada === 'receber'
              ? 'text-green-400 border-b-2 border-green-400'
              : 'text-white/60 hover:text-white'
          }`}
        >
          💰 Contas a Receber ({contasReceber.length})
        </button>
      </div>

      {/* Form */}
      {mostrarForm && (
        <div className="bg-gray-800/50 border border-white/10 p-4 rounded-lg space-y-4">
          <h3 className="font-bold text-lg">
            Cadastrar Conta a {abaSelecionada === 'pagar' ? 'Pagar' : 'Receber'}
          </h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              placeholder="Descrição *"
              value={formData.descricao}
              onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
              className="bg-gray-700 border-white/20"
              required
            />
            <Input
              type="number"
              placeholder="Valor (R$) *"
              value={formData.valor}
              onChange={(e) => setFormData({ ...formData, valor: e.target.value })}
              className="bg-gray-700 border-white/20"
              step="0.01"
              required
            />

            {abaSelecionada === 'pagar' ? (
              <Input
                placeholder="Fornecedor"
                value={formData.fornecedor}
                onChange={(e) => setFormData({ ...formData, fornecedor: e.target.value })}
                className="bg-gray-700 border-white/20"
              />
            ) : (
              <Input
                placeholder="Cliente"
                value={formData.cliente}
                onChange={(e) => setFormData({ ...formData, cliente: e.target.value })}
                className="bg-gray-700 border-white/20"
              />
            )}

            <select
              value={formData.categoria}
              onChange={(e) => setFormData({ ...formData, categoria: e.target.value })}
              className="bg-gray-700 border border-white/20 rounded px-3 py-2 text-white"
            >
              {(abaSelecionada === 'pagar' ? categoriasPagar : categoriasReceber).map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            <Input
              type="date"
              value={formData.vencimento}
              onChange={(e) => setFormData({ ...formData, vencimento: e.target.value })}
              className="bg-gray-700 border-white/20"
              required
            />

            <select
              value={formData.forma_pagamento}
              onChange={(e) => setFormData({ ...formData, forma_pagamento: e.target.value })}
              className="bg-gray-700 border border-white/20 rounded px-3 py-2 text-white"
            >
              <option value="pix">PIX</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="cartao">Cartão</option>
              <option value="transferencia">Transferência</option>
              <option value="boleto">Boleto</option>
            </select>

            <Input
              placeholder="Observações"
              value={formData.observacoes}
              onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
              className="bg-gray-700 border-white/20 md:col-span-2"
            />

            <label className="flex items-center gap-2 md:col-span-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.recorrente_mensal}
                onChange={(e) => setFormData({ ...formData, recorrente_mensal: e.target.checked })}
                className="w-4 h-4"
              />
              <span className="text-white/70">Despesa recorrente mensal</span>
            </label>

            <div className="flex gap-2 md:col-span-2">
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700 flex-1">
                Salvar
              </Button>
              <Button
                type="button"
                onClick={() => setMostrarForm(false)}
                className="bg-gray-700 hover:bg-gray-600 flex-1"
              >
                Cancelar
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Controles */}
      <div className="flex justify-between items-center gap-4">
        <Input
          placeholder="Buscar por descrição, fornecedor ou cliente..."
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="bg-gray-800 border-white/20 flex-1"
        />
        <Button
          onClick={() => setMostrarForm(!mostrarForm)}
          className={mostrarForm ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-600 hover:bg-red-700'}
        >
          <Plus className="w-4 h-4 mr-2" />
          Nova Conta
        </Button>
      </div>

      {/* Lista de Contas */}
      <div className="space-y-2">
        {contasFiltradas.length === 0 ? (
          <p className="text-white/40 text-center py-8">Nenhuma conta encontrada</p>
        ) : (
          contasFiltradas.map(conta => (
            <div key={conta.id} className="bg-gray-800 p-4 rounded-lg flex justify-between items-start hover:bg-gray-750 transition">
              <div className="flex-1">
                <div className="flex items-start gap-3">
                  {conta.status === 'atrasado' && (
                    <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                  )}
                  <div className="flex-1">
                    <p className="font-semibold">{conta.descricao}</p>
                    <p className="text-white/60 text-sm">
                      {conta.fornecedor || conta.cliente || '—'} • {conta.categoria}
                    </p>
                    {conta.observacoes && (
                      <p className="text-white/50 text-xs mt-1">{conta.observacoes}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="text-right ml-4">
                <p className="font-bold text-lg">{formatCurrency(conta.valor)}</p>
                <p className="text-white/60 text-sm">Vence {formatDate(conta.vencimento)}</p>
                <div className="mt-2 flex gap-1 justify-end">
                  <span className={`text-xs px-2 py-1 rounded ${
                    conta.status === 'pendente' ? 'bg-yellow-900/30 text-yellow-400' :
                    conta.status === 'atrasado' ? 'bg-red-900/30 text-red-400' :
                    conta.status === 'pago' || conta.status === 'recebido' ? 'bg-green-900/30 text-green-400' :
                    'bg-gray-700 text-white/60'
                  }`}>
                    {conta.status}
                  </span>
                  <span className="text-xs px-2 py-1 rounded bg-gray-700 text-white/60">
                    {conta.forma_pagamento}
                  </span>
                </div>
              </div>

              <div className="flex gap-2 ml-4">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => deletarMutation.mutate(conta.id)}
                  className="text-red-400 hover:text-red-300"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}