import { useEffect, useMemo, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import ShirtOrderTracking from '@/components/m31/camisas/ShirtOrderTracking';
import { trackShirtEvent } from '@/components/m31/camisas/shirtTracking';
import { MODELOS, TAMANHOS, WHATSAPP_DULCE, maskPhone, maskCpf, cpfValido, whatsappValido } from '@/components/m31/camisas/camisasCatalog';
import { loadCamisasLandingBlocks, loadCamisasTextos } from '@/components/m31/camisas/camisasLandingConfig';
import CamisasBlockRenderer from '@/components/m31/camisas/blocks/CamisasBlockRenderer';
import ShirtSelectionBlock from '@/components/m31/camisas/blocks/ShirtSelectionBlock';
import ShirtDataBlock from '@/components/m31/camisas/blocks/ShirtDataBlock';
import ShirtSummaryBlock from '@/components/m31/camisas/blocks/ShirtSummaryBlock';
import SupportWhatsAppIcon from '@/components/m31/forms/SupportWhatsAppIcon';

const CORES_JESUS = [['preta', 'Preta'], ['cereja', 'Cereja']];

function makeToken() {
  const saved = localStorage.getItem('m31_camisa_pedido_token');
  if (saved) return saved;
  const token = crypto.randomUUID();
  localStorage.setItem('m31_camisa_pedido_token', token);
  return token;
}

function novoPedidoToken() {
  const token = crypto.randomUUID();
  localStorage.setItem('m31_camisa_pedido_token', token);
  return token;
}

// O token vive somente enquanto representa o carrinho atual. Se a seleção
// divergir de um pedido que já ganhou cobrança, a próxima tentativa deve nascer
// como pedido novo — nunca mostrar o pedido anterior como conflito.
function limparPedidoAnterior() {
  localStorage.removeItem('m31_camisa_pedido_token');
  return novoPedidoToken();
}

export default function M31Camisas() {
  const [config, setConfig] = useState(null);
  const [blocks, setBlocks] = useState(null);
  const [textos, setTextos] = useState(null);
  const [nome, setNome] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [cpf, setCpf] = useState('');
  const [email, setEmail] = useState('');
  // Checkout inteligente: o CPF inicia OCULTO. Só é revelado, sem nenhum alerta,
  // quando o WhatsApp informado não tem correspondência na base de inscritas.
  const [cpfObrigatorio, setCpfObrigatorio] = useState(false);
  const [whatsappErro, setWhatsappErro] = useState('');
  // Grade unificada: quantidade por modelo|cor|tamanho — sem blocos "Camisa 1/2".
  const [quantidades, setQuantidades] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [paymentUrl, setPaymentUrl] = useState('');
  const [pedidoConflitante, setPedidoConflitante] = useState(null);
  // Nenhum meio de pagamento é escolhido automaticamente. A cliente precisa decidir.
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [installments, setInstallments] = useState(1);
  const [cardQuotes, setCardQuotes] = useState({});
  const [acompanhar, setAcompanhar] = useState(new URLSearchParams(window.location.search).has('pagamento'));
  const submittedRef = useRef(false);
  // Último telefone confirmado com cadastro (CPF resgatado no servidor).
  const telefoneCadastradoRef = useRef('');

  useEffect(() => {
    // Carregar configuração visual e textos em paralelo; falha isolada não deve
    // atrasar a renderização da lojinha.
    loadCamisasLandingBlocks().then(setBlocks);
    loadCamisasTextos().then(setTextos);
    base44.functions.invoke('m31CamisaVendaPayment', { action: 'config' })
      .then((r) => setConfig(r?.data || r))
      .catch(() => setConfig({ ativo: false, modelos: [] }));
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('pagamento') === 'sucesso') return;
    trackShirtEvent('shirt_form_view');
    const trackAbandoned = () => {
      if (!submittedRef.current) trackShirtEvent('shirt_form_abandoned');
    };
    let idleTimer = setTimeout(trackAbandoned, 180000);
    const resetIdle = () => { clearTimeout(idleTimer); idleTimer = setTimeout(trackAbandoned, 180000); };
    const events = ['click', 'keydown', 'touchstart', 'scroll'];
    events.forEach((ev) => window.addEventListener(ev, resetIdle, { passive: true }));
    const onUnload = () => trackAbandoned();
    window.addEventListener('beforeunload', onUnload);
    return () => {
      clearTimeout(idleTimer);
      window.removeEventListener('beforeunload', onUnload);
      events.forEach((ev) => window.removeEventListener(ev, resetIdle));
    };
  }, []);

  // Cada peça da grade vira um item {modelo, cor, tamanho} — mesmo formato
  // que o servidor valida. Itens derivados nunca ficam incompletos.
  const itens = useMemo(() => {
    const lista = [];
    for (const m of MODELOS) {
      const cores = m.id === 'jesus' ? CORES_JESUS.map(([id]) => id) : [''];
      for (const cor of cores) {
        for (const tamanho of TAMANHOS) {
          const qtd = Number(quantidades[`${m.id}|${cor}|${tamanho}`] || 0);
          for (let i = 0; i < qtd; i++) lista.push({ modelo: m.id, cor, tamanho });
        }
      }
    }
    return lista;
  }, [quantidades]);

  // Regra em tempo real: 1 camisa = preço unitário; 2 ou mais = preço
  // promocional por peça — o desconto entra sozinho na 2ª peça. Servidor é a fonte da verdade.
  const precoUnit = config?.promocional_ativo && itens.length >= 2
    ? Number(config?.preco_promocional || 0)
    : Number(config?.preco_unitario || 0);
  const total = Number((itens.length * precoUnit).toFixed(2));
  useEffect(() => {
    if (!itens.length) { setCardQuotes({}); return; }
    let active = true;
    Promise.all([1,2,3,4,5].map(async count => {
      const r = await base44.functions.invoke('m31CamisaVendaPayment', { action:'quote', quantidade:itens.length, payment_method:'CREDIT_CARD', installments:count });
      const q = r?.data || r;
      return [count, { total:Number(q.total), installmentValue:Number(q.installment_value), estimatedFee:Number(q.estimated_fee) }];
    })).then(entries => { if (active) setCardQuotes(Object.fromEntries(entries)); }).catch(() => { if (active) setCardQuotes({}); });
    return () => { active = false; };
  }, [itens.length, config?.preco_unitario, config?.preco_promocional, config?.promocional_ativo]);
  const paymentQuote = useMemo(() => {
    if (paymentMethod === 'PIX') return { total, installmentValue: total, estimatedFee: 0 };
    if (paymentMethod !== 'CREDIT_CARD') return { total: 0, installmentValue: 0, estimatedFee: 0 };
    return cardQuotes[installments] || { total: 0, installmentValue: 0, estimatedFee: 0 };
  }, [paymentMethod, installments, total, cardQuotes]);
  const modelosAtivos = useMemo(() => MODELOS.filter((m) => (config?.modelos || []).includes(m.id)), [config]);

  function mudarQuantidade(modelo, cor, tamanho, delta) {
    setPaymentUrl('');
    if (delta > 0 && itens.length >= 20) return;
    setQuantidades((atual) => {
      const chave = `${modelo}|${cor}|${tamanho}`;
      const novo = Math.max(0, Number(atual[chave] || 0) + delta);
      const copia = { ...atual };
      if (novo > 0) copia[chave] = novo; else delete copia[chave];
      return copia;
    });
  }

  // Lookup silencioso: o servidor normaliza o número e busca na base de
  // inscritas. Devolve o nome para autopreenchimento; o CPF nunca sai do
  // servidor. Falha na chamada conta como "não encontrado" — nunca bloqueia.
  async function buscarCadastroTelefone(valor) {
    const digits = String(valor || '').replace(/\D/g, '');
    if (digits.length < 10) return null;
    try {
      const response = await base44.functions.invoke('m31CamisaVendaPayment', { action: 'lookup', whatsapp: digits });
      const data = response?.data || response;
      return data?.encontrado ? { nome: String(data.nome || '').trim() } : null;
    } catch {
      return null;
    }
  }

  // Ao sair do campo de WhatsApp: inscrita reconhecida → CPF permanece
  // invisível (resgatado no servidor); sem correspondência → campo revelado
  // de forma fluida, sem nenhum aviso ou mensagem.
  async function conferirWhatsapp() {
    const digits = whatsapp.replace(/\D/g, '');
    if (!digits) { setWhatsappErro(''); return; }
    // WhatsApp incompleto/inválido nunca libera o CPF nem dispara o lookup.
    if (!whatsappValido(digits)) {
      setWhatsappErro('Digite um WhatsApp válido');
      telefoneCadastradoRef.current = '';
      setCpfObrigatorio(false);
      return;
    }
    setWhatsappErro('');
    const cadastro = await buscarCadastroTelefone(digits);
    if (cadastro) {
      telefoneCadastradoRef.current = digits;
      setCpfObrigatorio(false);
      setCpf('');
      // Inscrita reconhecida: nome autopreenchido (só se estiver vazio).
      setNome((atual) => atual.trim() ? atual : cadastro.nome);
    } else {
      telefoneCadastradoRef.current = '';
      setCpfObrigatorio(true);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setPaymentUrl('');
    setPedidoConflitante(null);
    const digits = whatsapp.replace(/\D/g, '');
    if (!whatsappValido(digits)) return setError('Digite um WhatsApp válido.');
    if (itens.length === 0) return setError('Escolha pelo menos uma camisa.');
    if (!paymentMethod) return setError('Escolha uma forma de pagamento.');
    let nomeEnviar = nome.trim();
    // CPF invisível quando o telefone tem cadastro (resgatado no servidor);
    // sem cadastro, exige preenchimento manual do campo revelado.
    let cpfEnviar = '';
    if (telefoneCadastradoRef.current !== digits) {
      const cadastro = await buscarCadastroTelefone(whatsapp);
      if (cadastro) {
        telefoneCadastradoRef.current = digits;
        setCpfObrigatorio(false);
        setCpf('');
        if (!nomeEnviar && cadastro.nome) { nomeEnviar = cadastro.nome; setNome(cadastro.nome); }
      } else {
        // Compradora não encontrada: permite concluir com CPF manual, que o
        // backend valida e usa para vincular a cobrança com segurança.
        telefoneCadastradoRef.current = '';
        setCpfObrigatorio(true);
        cpfEnviar = cpf.replace(/\D/g, '');
        if (!cpfValido(cpfEnviar)) return setError('Informe um CPF válido para concluir.');
      }
    }
    if (telefoneCadastradoRef.current === digits) cpfEnviar = '';
    if (nomeEnviar.length < 3) return setError('Informe seu nome completo.');
    setLoading(true);
    try {
      // pedido_token é identidade do pedido, não da compradora. Se o pedido
      // anterior deste navegador já foi pago/cancelado/estornado, inicia um
      // pedido novo sem bloquear a mesma pessoa por CPF/telefone.
      let pedidoToken = makeToken();
      try {
        const consulta = await base44.functions.invoke('m31CamisaVendaPayment', { action: 'consultar', pedido_token: pedidoToken });
        const anterior = consulta?.data || consulta;
        if (['pago', 'cancelado', 'estornado'].includes(anterior?.status_pagamento)) pedidoToken = novoPedidoToken();
      } catch (consultaErr) {
        if (consultaErr?.response?.status !== 404) throw consultaErr;
      }
      const response = await base44.functions.invoke('m31CamisaVendaPayment', {
        pedido_token: pedidoToken,
        nome: nomeEnviar,
        whatsapp: '55' + digits,
        cpf: cpfEnviar || null,
        email: email.trim().toLowerCase() || null,
        valor_esperado: paymentQuote.total,
        payment_method: paymentMethod,
        installments,
        itens,
      });
      const data = response?.data || response;
      if (data?.pago) {
        // O token identifica um PEDIDO, não uma pessoa. Pedido pago não pode
        // bloquear uma nova compra feita depois pela mesma compradora.
        novoPedidoToken();
        setError('');
        setPaymentUrl('');
        setQuantidades({});
        submittedRef.current = false;
        return;
      }
      if (data?.acompanhar) {
        submittedRef.current = true;
        setAcompanhar(true);
        return;
      }
      if (data?.em_conferencia) {
        setError(data.error || 'Tentativa em conferência. Aguarde e consulte seu pedido; não inicie outra compra.');
        return;
      }
      if (!data?.payment_url) throw new Error(data?.error || 'Não foi possível gerar o pagamento.');
      // Save the usable link before any optional tracking or navigation.
      setPaymentUrl(data.payment_url);
      submittedRef.current = true;
      trackShirtEvent('shirt_checkout_created');
      window.location.assign(data.payment_url);
    } catch (err) {
      const serverData = err?.response?.data || {};
      // Pedido anterior com cobrança não é erro da compradora. Uma nova seleção
      // representa uma NOVA COMPRA: troca o token do pedido e tenta uma única vez.
      if (serverData?.novo_pedido === true || serverData?.code === 'revisao_necessaria') {
        // Compatibilidade com backend/cache anterior: ambos significam que o
        // token local aponta para um pedido que já não é o carrinho atual.
        const tokenAnterior = localStorage.getItem('m31_camisa_pedido_token');
        const novoToken = limparPedidoAnterior();
        setPedidoConflitante(null);
        setError('');
        try {
          const retry = await base44.functions.invoke('m31CamisaVendaPayment', {
            pedido_token: novoToken, nome: nomeEnviar, whatsapp: '55' + digits,
            cpf: cpfEnviar || null, email: email.trim().toLowerCase() || null,
            valor_esperado: paymentQuote.total, payment_method: paymentMethod, installments, itens,
            // Vínculo da Regra da Lojinha: o pedido antigo (token desta
            // tentativa fracassada) nasce SUBSTITUÍDO junto com o novo pedido.
            substitui_pedido_token: tokenAnterior,
          });
          const d = retry?.data || retry;
          if (!d?.payment_url) throw new Error(d?.error || 'Não foi possível gerar o pagamento.');
          setPaymentUrl(d.payment_url);
          submittedRef.current = true;
          trackShirtEvent('shirt_checkout_created');
          window.location.assign(d.payment_url);
          return;
        } catch (retryErr) {
          setError(retryErr?.response?.data?.error || retryErr?.message || 'Não foi possível iniciar a nova compra.');
          return;
        }
      }
      const mensagem = serverData?.error || err?.message || 'Não foi possível gerar o pagamento agora.';
      // O CPF nunca é exibido no formulário; divergência de cadastro fica
      // bloqueada até a compradora corrigir o WhatsApp ou falar com o suporte.
      if (String(mensagem).toLowerCase().includes('cpf')) {
        telefoneCadastradoRef.current = '';
        setCpfObrigatorio(false);
      }
      setError(mensagem);
    } finally {
      setLoading(false);
    }
  }

  // URL parameters open tracking only. The server is the sole payment authority.

  const cardStyle = { background: '#FFFDFB', border: '1px solid #E8E0D4', borderRadius: 18, padding: 16, boxShadow: '0 8px 30px rgba(94,56,43,.06)' };

  // Fluxo linear: Oferta → Escolha (grade unificada) → Dados → Revisão → Finalizar.
  const purchaseFlow = acompanhar ? <ShirtOrderTracking /> : !config ? (
    <div style={cardStyle}>Carregando pré-venda...</div>
  ) : !config.ativo ? (
    <div style={cardStyle}><strong>Pré-venda ainda não liberada.</strong><p style={{ marginBottom: 0 }}>Assim que os valores forem confirmados, este link será ativado.</p></div>
  ) : (
    <form onSubmit={submit} style={{ display: 'grid', gap: 18 }}>
      <fieldset disabled={loading} style={{ display: 'contents' }}>
        <ShirtSelectionBlock modelos={modelosAtivos} quantidades={quantidades} precoUnit={precoUnit} total={total} loading={loading} onQuantidade={mudarQuantidade} tx={textos} />
        <ShirtDataBlock
          nome={nome} whatsapp={whatsapp} cpf={cpf} email={email} mostrarCpf={cpfObrigatorio} whatsappErro={whatsappErro}
          onNome={setNome}
          onWhatsapp={(v) => { setWhatsapp(maskPhone(v)); setWhatsappErro(''); }}
          onWhatsappBlur={conferirWhatsapp}
          onCpf={(v) => setCpf(maskCpf(v))}
          onEmail={setEmail}
          tx={textos}
        />
      </fieldset>
      <ShirtSummaryBlock
        itens={itens}
        total={total}
        precoUnit={precoUnit}
        loading={loading}
        error={error}
        pedidoConflitante={pedidoConflitante}
        paymentUrl={paymentUrl}
        tx={textos}
        paymentMethod={paymentMethod}
        onPaymentMethod={(method) => { setPaymentMethod(method); if (method === 'PIX') setInstallments(1); }}
        installments={installments}
        onInstallments={setInstallments}
        paymentQuote={paymentQuote}
        cardQuotes={cardQuotes}
      />
    </form>
  );

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        {!blocks ? (
          <div style={cardStyle}>Carregando...</div>
        ) : blocks.map((block) => (
          <CamisasBlockRenderer key={block.id} block={block} purchaseFlow={purchaseFlow} />
        ))}
      </section>

      <SupportWhatsAppIcon phone={WHATSAPP_DULCE} message="Olá, Dulce! Preciso de ajuda com o pedido de camisas do M31 💛" avoidBottomBar size={48} />
    </main>
  );
}

const styles = {
  page: { minHeight: '100vh', background: '#F7F3EE', padding: '18px 14px calc(120px + env(safe-area-inset-bottom))', fontFamily: 'Inter, Arial, sans-serif', color: '#2D2724' },
  shell: { maxWidth: 620, margin: '0 auto' },

};
