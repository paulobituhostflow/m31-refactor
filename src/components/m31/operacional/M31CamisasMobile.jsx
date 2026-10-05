import { useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import M31SkeletonList from './M31SkeletonList';
import { useM31OperationalShirts } from '@/hooks/useM31OperationalShirts';
import { useM31CamisasHub } from '@/hooks/useM31CamisasHub';
import HubDashboard from './camisas/hub/HubDashboard';
import HubQuickActions from './camisas/hub/HubQuickActions';
import HubDestaque from './camisas/hub/HubDestaque';
import HubModuleGrid from './camisas/hub/HubModuleGrid';
import HubUltimosPedidos from './camisas/hub/HubUltimosPedidos';
import HubPedidos from './camisas/hub/HubPedidos';
import HubEstoque from './camisas/hub/HubEstoque';
import HubProdutos from './camisas/hub/HubProdutos';
import HubClientes from './camisas/hub/HubClientes';
import HubChatIa from './camisas/hub/HubChatIa';
import NovoPedidoSheet from './camisas/hub/NovoPedidoSheet';
import NovoClienteSheet from './camisas/hub/NovoClienteSheet';
import PedidoQuickDrawer from './camisas/hub/PedidoQuickDrawer';
import { groupShirtRows } from '@/lib/groupShirtRows';
import ShirtPresaleConfig from './ShirtPresaleConfig';

const PLANILHA_URL = 'https://docs.google.com/spreadsheets/d/1aTvj2mYRs-F3LVcoohwlVdMF9bPwJbTenX4jLW3q9mc';

const TITULOS = {
  hub: 'Produtos, vendas e estoque.',
  pedidos: 'Pedidos',
  produtos: 'Produtos',
  estoque: 'Estoque',
  clientes: 'Clientes',
  chat: 'Chat IA',
};

const PREVIEW_DATA = {
  summary: { total: 74, pagas: 6, aguardando_pagamento: 68, a_entregar: 6, entregues: 1, precisam_acao: 68, sem_tamanho: 2 },
  rows: [
    { row_id: 'd1', registro_tipo: 'pedido_camisa', registro_id: 'demo', nome: 'Maria da Silva', origem: 'Pré-venda', modelo: 'jesus', cor: 'preta', whatsapp: '5581999999999', tamanho: 'M', pagamento_status: 'pendente', entregue: false, situacao: 'pagamento_pendente' },
    { row_id: 'd2', registro_tipo: 'pedido_camisa', registro_id: 'demo2', nome: 'Ana Souza', origem: 'WhatsApp', modelo: 'filhas', cor: '', whatsapp: '5581999999998', tamanho: 'G', pagamento_status: 'pago', entregue: false, situacao: 'a_entregar' },
    { row_id: 'd3', registro_tipo: 'pedido_camisa', registro_id: 'demo3', nome: 'Rita Nunes', origem: 'Venda', modelo: 'milagres', cor: '', whatsapp: '', tamanho: 'P', pagamento_status: 'pago', entregue: true, situacao: 'entregue' },
  ],
  inventory: [{ id: 'demo|', modelo: 'filhas', cor: '', nome: 'Filhas', recebidas: 0, entregues: 0, disponivel: 0, reservadas: 4, tamanhos: { P: { recebido: 0, entregues: 0, disponivel: 0, cadastrado: false } } }],
  produtos: [
    { id: 'p1', nome: 'Camisa Jesus Preta', modelo: 'jesus', cor: 'preta', preco: 65, tamanhos: ['P', 'M', 'G'] },
    { id: 'p2', nome: 'Camisa Filhas', modelo: 'filhas', cor: '', preco: 65, tamanhos: ['P', 'M', 'G'] },
  ],
  clientes: [
    { id: 'c1', nome: 'Maria da Silva', whatsapp: '5581999999999', email: '' },
    { id: 'c2', nome: 'Ana Souza', whatsapp: '5581999999998', email: '' },
  ],
};

function erroAmigavel(error, fallback) {
  const raw = typeof error === 'string' ? error : error?.message || '';
  const extraido = typeof raw === 'string' ? raw.match(/"error"\s*:\s*"([^"]+)"/)?.[1] : null;
  return extraido || (typeof raw === 'string' && raw ? raw : fallback);
}

// CENTRAL DA DULCE — hub de gestão de camisas (layout aprovado):
// cabeçalho compacto, ações rápidas, bloco de destaque, grade de módulos,
// resumo operacional e lista curta de pedidos. Sem produção, sem
// rolagem única: cada módulo abre no mesmo ambiente.
export default function M31CamisasMobile({ sessionId, preview = false, onBack }) {
  const query = useM31OperationalShirts(sessionId, { enabled: !preview });
  const hub = useM31CamisasHub(sessionId, { enabled: !preview });
  const [view, setView] = useState('hub');
  const [pedidoOpen, setPedidoOpen] = useState(false);
  const [clienteOpen, setClienteOpen] = useState(false);
  const [hubSearch, setHubSearch] = useState('');
  const [quickOrder, setQuickOrder] = useState(null);
  const [trocaSalva, setTrocaSalva] = useState(null);

  const summary = preview ? PREVIEW_DATA.summary : query.data?.summary;
  const rows = preview ? PREVIEW_DATA.rows : query.data?.rows || [];
  const inventory = preview ? PREVIEW_DATA.inventory : query.data?.inventory || [];
  const movimentosEstoque = preview ? [] : query.data?.movimentos_estoque || [];
  const grade = preview ? [] : query.data?.grade_producao || [];
  const planilhaUrl = preview ? PLANILHA_URL : query.data?.planilha_url;
  const produtos = preview ? PREVIEW_DATA.produtos : hub.produtos.data?.produtos || [];
  const clientes = preview ? PREVIEW_DATA.clientes : hub.clientes.data?.clientes || [];
  const pending = query.updateShirt.isPending || hub.mutateHub.isPending;
  const currentOrder = quickOrder ? groupShirtRows(rows).find((order) => order.row_id === quickOrder.row_id || order.itens.some((item) => item.row_id === quickOrder.row_id)) || quickOrder : null;
  const alertasEstoque = inventory.filter((combo) => combo.reservadas > combo.disponivel).length;

  const badges = useMemo(() => ({
    pedidos: summary?.precisam_acao || undefined,
    estoque: alertasEstoque || undefined,
  }), [summary, alertasEstoque]);

  async function mudarTamanho(row, tamanho) {
    if (preview) return;
    try {
      await query.updateShirt.mutateAsync({ action: 'ajustar_tamanho', row_id: row.row_id, tamanho });
      toast.success('Tamanho atualizado.');
    } catch (error) {
      toast.error(erroAmigavel(error, 'Não foi possível atualizar o tamanho.'));
    }
  }

  async function mudarItem(row, { modelo, cor, tamanho }) {
    if (preview) return true;
    try {
      await query.updateShirt.mutateAsync({ action: 'ajustar_item', row_id: row.row_id, modelo, cor, tamanho });
      toast.success('Troca realizada com sucesso.');
      setTrocaSalva({ ...row, modelo, cor, tamanho });
      return true;
    } catch (error) {
      toast.error(erroAmigavel(error, 'Não foi possível atualizar o item.'));
      return false;
    }
  }

  async function notificarTroca(row) {
    if (preview) return true;
    try {
      await query.updateShirt.mutateAsync({ action: 'notificar_troca', pedido_id: row.registro_id });
      toast.success('Mensagem de confirmação adicionada à fila.');
      setTrocaSalva(null);
      return true;
    } catch (error) {
      toast.error(erroAmigavel(error, 'A troca foi salva, mas não foi possível preparar a mensagem.'));
      return false;
    }
  }

  async function confirmarEntrega(row) {
    if (preview) return;
    if (row.pagamento_status !== 'pago') {
      toast.warning('A entrega só pode ser confirmada após o pagamento.');
      return;
    }
    try {
      await query.updateShirt.mutateAsync({ action: 'confirmar_entrega', row_id: row.row_id });
      toast.success('Entrega confirmada.');
    } catch (error) {
      toast.error(erroAmigavel(error, 'Não foi possível confirmar a entrega.'));
    }
  }

  async function confirmarPagamento(row) {
    if (preview) return toast.info('Prévia: nenhum pagamento real será confirmado.');
    try {
      const result = await query.updateShirt.mutateAsync({ action: 'confirmar_pagamento', pedido_id: row.registro_id });
      toast.success(result?.aviso === 'ja_avisiado' ? 'Pagamento confirmado. Aviso já tinha sido enviado à Dulce.' : 'Pagamento confirmado. Aviso de compra enviado à Dulce.');
    } catch (error) {
      toast.error(erroAmigavel(error, 'Não foi possível confirmar o pagamento.'));
    }
  }

  async function verComprovante(row) {
    if (preview) return toast.info('Prévia: nenhum comprovante real disponível.');
    try {
      const result = await query.updateShirt.mutateAsync({ action: 'ver_comprovante', pedido_id: row.registro_id });
      if (result?.url) window.open(result.url, '_blank');
      else toast.error('Comprovante indisponível.');
    } catch {
      toast.error('Comprovante indisponível.');
    }
  }

  async function atualizarEstoque(modelo, cor, tamanho, quantidade) {
    if (preview) return toast.info('Prévia: nenhuma quantidade real será salva.');
    try {
      await query.updateShirt.mutateAsync({ action: 'ajustar_estoque', modelo, cor, tamanho, quantidade });
      toast.success('Estoque atualizado.');
    } catch (error) {
      toast.error(erroAmigavel(error, 'Não foi possível atualizar o estoque.'));
    }
  }

  async function retomarAviso(row) {
    if (preview) return toast.info('Prévia: nenhum aviso real será criado.');
    try {
      await query.updateShirt.mutateAsync({ action: 'retomar_aviso_camisa', pedido_id: row.registro_id });
      toast.success('Aviso enviado diretamente à Dulce.');
    } catch {
      toast.error('Aviso ainda em conferência. O pagamento foi preservado; não force outro envio.');
    }
  }

  async function exportarPlanilha() {
    if (preview) return toast.info('Prévia: nenhuma exportação real.');
    try {
      const result = await query.updateShirt.mutateAsync({ action: 'exportar_planilha' });
      toast.success(`Pedidos exportados (${result?.exportados ?? 0}).`);
    } catch {
      toast.error('Não foi possível exportar a planilha.');
    }
  }

  async function criarPedido(payload) {
    if (preview) {
      toast.info('Prévia: nenhum pedido real será criado.');
      return true;
    }
    try {
      await hub.mutateHub.mutateAsync({ action: 'criar_pedido', ...payload });
      toast.success('Pedido registrado. Confirme o pagamento na lista de pedidos.');
      return true;
    } catch (error) {
      toast.error(erroAmigavel(error, 'Não foi possível registrar o pedido.'));
      return false;
    }
  }

  async function criarCliente(payload) {
    if (preview) {
      toast.info('Prévia: nenhuma cliente real será criada.');
      return true;
    }
    try {
      const result = await hub.mutateHub.mutateAsync({ action: 'criar_cliente', ...payload });
      toast.success(result?.ja_existia ? 'Cliente já cadastrada com esse WhatsApp.' : 'Cliente salva.');
      return true;
    } catch (error) {
      toast.error(erroAmigavel(error, 'Não foi possível salvar a cliente.'));
      return false;
    }
  }

  async function criarProduto(payload) {
    if (preview) {
      toast.info('Prévia: nenhum produto real será criado.');
      return true;
    }
    try {
      await hub.mutateHub.mutateAsync({ action: 'criar_produto', ...payload });
      toast.success('Produto cadastrado.');
      return true;
    } catch (error) {
      toast.error(erroAmigavel(error, 'Não foi possível cadastrar o produto.'));
      return false;
    }
  }

  async function receberEstoque(payload) {
    if (preview) {
      toast.info('Prévia: nenhum recebimento real será salvo.');
      return true;
    }
    try {
      await hub.mutateHub.mutateAsync({ action: 'receber_estoque', ...payload });
      toast.success('Recebimento registrado com histórico de compra.');
      return true;
    } catch (error) {
      toast.error(erroAmigavel(error, 'Não foi possível registrar o recebimento.'));
      return false;
    }
  }

  async function enviarChat(mensagem, historico) {
    if (preview) return { resposta: 'Prévia: o Chat IA responde apenas com dados reais na operação.' };
    return hub.mutateHub.mutateAsync({ action: 'chat', mensagem, historico });
  }

  function abrirModulo(id) {
    if (id === 'lojinha') {
      window.open('/m31-camisas', '_blank');
      return;
    }
    setView(id);
  }

  return (
    <section className="space-y-4">
      <header className="flex items-start gap-3">
        {(onBack || view !== 'hub') && (
          <button
            type="button"
            onClick={() => (view === 'hub' ? onBack?.() : setView('hub'))}
            aria-label="Voltar"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-m31-primary active:bg-m31-primary-tint"
          >
            <ArrowLeft aria-hidden="true" className="h-5 w-5" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-m31-primary">Central de Camisas</p>
          <h1 className="text-2xl font-bold tracking-tight text-m31-ink">{TITULOS[view]}</h1>
        </div>
      </header>
      {!preview && query.data?.warning && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{query.data.warning}</p>}
      {!preview && query.isError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">Não foi possível carregar os pedidos. Atualize a tela antes de realizar alterações.</p>}

      {view === 'hub' && (
        preview ? (
          <div className="space-y-4">
            <HubDashboard rows={rows} summary={summary} search={hubSearch} onSearch={setHubSearch} onOpenPedidos={() => setView('pedidos')} onOpenOrder={setQuickOrder} />
            <HubUltimosPedidos rows={rows} somentePagos limite={5} onOpenOrder={setQuickOrder} onVerTodos={() => setView('pedidos')} />
            <HubQuickActions onNovoPedido={() => setPedidoOpen(true)} onNovoCliente={() => setClienteOpen(true)} />
            <HubModuleGrid onOpen={abrirModulo} badges={badges} />
            <HubDestaque planilhaUrl={planilhaUrl} onExportar={exportarPlanilha} pending={pending} />
          </div>
        ) : query.isLoading ? <M31SkeletonList /> : (
          <div className="space-y-4">
            <HubDashboard rows={rows} summary={summary} search={hubSearch} onSearch={setHubSearch} onOpenPedidos={() => setView('pedidos')} onOpenOrder={setQuickOrder} />
            <HubUltimosPedidos rows={rows} somentePagos limite={5} onOpenOrder={setQuickOrder} onVerTodos={() => setView('pedidos')} />
            <HubQuickActions onNovoPedido={() => setPedidoOpen(true)} onNovoCliente={() => setClienteOpen(true)} />
            <HubModuleGrid onOpen={abrirModulo} badges={badges} />
            <HubDestaque planilhaUrl={planilhaUrl} onExportar={exportarPlanilha} pending={pending} />
          </div>
        )
      )}

      {view === 'pedidos' && (
        <HubPedidos
          rows={rows}
          pending={pending}
          onRefetch={query.refetch}
          onOpenOrder={setQuickOrder}
          onChangeSize={mudarTamanho}
          onChangeItem={mudarItem}
          onConfirmDelivery={confirmarEntrega}
          onConfirmPayment={confirmarPagamento}
          onVerComprovante={verComprovante}
          onResumeNotice={retomarAviso}
        />
      )}

      {view === 'produtos' && (
        <div className="space-y-4"><ShirtPresaleConfig config={query.data?.pre_venda} disabled={pending || (!preview && !query.data)} preview={preview} onSave={async (payload) => { if (preview) return; try { await query.updateShirt.mutateAsync(payload); toast.success('Pré-venda atualizada.'); } catch (error) { toast.error(erroAmigavel(error, 'Não foi possível salvar a pré-venda.')); } }} /><HubProdutos produtos={produtos} loading={!preview && hub.produtos.isLoading} pending={pending} preview={preview} onCriar={criarProduto} /></div>
      )}

      {view === 'estoque' && (
        <HubEstoque inventory={inventory} grade={grade} movimentos={movimentosEstoque} pending={pending} preview={preview} onUpdateEstoque={atualizarEstoque} onReceber={receberEstoque} />
      )}

      {view === 'clientes' && (
        <HubClientes clientes={clientes} loading={!preview && hub.clientes.isLoading} preview={preview} onNovo={() => setClienteOpen(true)} />
      )}

      {view === 'chat' && (
        <HubChatIa preview={preview} onEnviar={enviarChat} />
      )}

      <PedidoQuickDrawer
        row={currentOrder}
        open={Boolean(quickOrder)}
        onClose={() => { setQuickOrder(null); setTrocaSalva(null); }}
        pending={pending}
        trocaSalva={trocaSalva}
        onNotifyChange={notificarTroca}
        onConfirmPayment={confirmarPagamento}
        onVerComprovante={verComprovante}
        onChangeSize={mudarTamanho}
        onChangeItem={mudarItem}
        onConfirmDelivery={confirmarEntrega}
        onResumeNotice={retomarAviso}
      />
      <NovoPedidoSheet open={pedidoOpen} onOpenChange={setPedidoOpen} onSave={criarPedido} pending={pending} />
      <NovoClienteSheet open={clienteOpen} onOpenChange={setClienteOpen} onSave={criarCliente} pending={pending} />
    </section>
  );
}
