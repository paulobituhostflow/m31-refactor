// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

const models = ['jesus', 'milagres', 'filhas'];
const sizes = ['PP', 'P', 'M', 'G', 'GG', 'XGG'];
const colors = ['preta', 'cereja'];
const asaasBase = '__ASAAS_API__';
const tokenPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHIRT_NET_PRICE = 65;
const ASAAS_CARD_RATE = 0.0277;
const ASAAS_FIXED_FEE = 0.29;
const ASAAS_ANTICIPATION_1X = 0.0105;
const ASAAS_ANTICIPATION_MONTHLY = 0.0139;
const CARD_INSTALLMENTS = Object.freeze([1, 2, 3, 4, 5]);
function cardTotal(baseTotal, installments) {
  const count = Number(installments);
  if (!CARD_INSTALLMENTS.includes(count)) throw new Error('Quantidade de parcelas inválida.');
  const base = Number(baseTotal || SHIRT_NET_PRICE);
  const anticipationRate = count === 1 ? ASAAS_ANTICIPATION_1X : ASAAS_ANTICIPATION_MONTHLY * count;
  // Gross-up da regra vigente: taxa percentual + antecipação incidem sobre o bruto;
  // tarifa fixa é somada à necessidade líquida. O servidor é a fonte da verdade.
  return Math.round(((base + ASAAS_FIXED_FEE) / (1 - ASAAS_CARD_RATE - anticipationRate)) * 100) / 100;
}
function cardQuote(baseTotal, installments) {
  const count = Number(installments);
  const total = cardTotal(baseTotal, count);
  return { total, installments: count, label: count === 1 ? '1x no cartão' : `${count}x de R$ ${(total / count).toFixed(2).replace('.', ',')}`, estimatedFee: Math.round((total - Number(baseTotal || SHIRT_NET_PRICE)) * 100) / 100 };
}
function paymentQuote(baseTotal, paymentMethod, installments) {
  if (paymentMethod === 'PIX') return { total: Math.round(Number(baseTotal) * 100) / 100, installments: 1, label: 'PIX', estimatedFee: 0 };
  return cardQuote(baseTotal, installments);
}

function cpfValid(cpf) {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = factor => {
    let sum = 0;
    for (let i = 0; i < factor - 1; i++) sum += Number(cpf[i]) * (factor - i);
    return ((sum * 10) % 11) % 10;
  };
  return digit(10) === Number(cpf[9]) && digit(11) === Number(cpf[10]);
}
// Resgata o CPF de uma inscrita pelo WhatsApp normalizado (55+DDD+número).
// Correspondência exige inscrição ativa com CPF válido e um ÚNICO CPF distinto
// por telefone — duplicidades e números duvidosos contam como não encontrado.
// Usado apenas no servidor; o CPF nunca é devolvido ao navegador.
async function buscarCpfPorWhatsapp(S, whatsapp) {
  const variantes = [whatsapp];
  const semDdi = whatsapp.replace(/^55(?=\d{10,11}$)/, '');
  if (semDdi !== whatsapp) variantes.push(semDdi);
  const candidatos = [];
  for (const tel of variantes) {
    const registros = await S.EventoM31Inscricao.filter({ whatsapp: tel }, '-created_date', 100);
    for (const registro of registros || []) {
      if (registro.status_pagamento === 'cancelado') continue;
      const cpfCandidato = String(registro.cpf || '').replace(/\D/g, '');
      if (cpfValid(cpfCandidato)) candidatos.push({ cpf: cpfCandidato, nome: String(registro.nome || '').trim() });
    }
  }
  const cpfs = new Set(candidatos.map(c => c.cpf));
  if (cpfs.size !== 1) return null;
  // Primeiro candidato = inscrição mais recente com aquele CPF.
  return { cpf: candidatos[0].cpf, nome: candidatos[0].nome || null };
}
function selectionKey(items) {
  return JSON.stringify((items || []).map(i => [i.modelo, i.tamanho, i.modelo === 'jesus' ? i.cor : null]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
}
function changed(result) { return (result?.updated ?? result?.modified_count ?? result?.modifiedCount ?? 0) === 1; }
function cents(value) { return Math.round(Number(value) * 100); }
function publicOrder(pedido) {
  return { codigo_pedido: pedido.numero_pedido != null ? `#M31${String(pedido.numero_pedido).padStart(3, '0')}` : null, itens: (pedido.itens_cobrados || pedido.itens || []).map(i => ({ modelo: i.modelo, tamanho: i.tamanho, cor: i.cor || null })), quantidade: pedido.quantidade, valor_total: pedido.valor_total, valor_cobrado: pedido.valor_cobrado || pedido.valor_total, payment_method: pedido.payment_method || 'UNKNOWN', installment_count: pedido.installment_count ?? null, status_pagamento: pedido.status_pagamento, cobranca_estado: pedido.cobranca_estado || null, pedido_versao: pedido.pedido_versao || 1 };
}
function chargeMatches(payment, pedido) {
  const expectedValue = Number(pedido.valor_cobrado || pedido.valor_total);
  const billingType = String(payment?.billingType || '').toUpperCase();
  const count = Number(payment?.installmentCount || payment?.installment?.installmentCount || 1);
  const paymentTotal = billingType === 'CREDIT_CARD' && count > 1 && Number.isFinite(Number(payment?.installmentValue))
    ? Number(payment.installmentValue) * count
    : Number(payment?.value);
  return Boolean(payment?.id && (!pedido.asaas_payment_id || payment.id === pedido.asaas_payment_id)
    && payment.externalReference === (pedido.external_reference || `M31CAMISA:${pedido.id}`)
    && Number.isFinite(paymentTotal) && cents(paymentTotal) === cents(expectedValue)
    && ['PIX', 'CREDIT_CARD'].includes(billingType)
    && !!pedido.payment_method && Number.isSafeInteger(Number(pedido.installment_count)) && Number(pedido.installment_count) >= 1
    && billingType === String(pedido.payment_method).toUpperCase()
    && count === Number(pedido.installment_count));
}
async function asaas(path, key, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try { return await fetch(`${asaasBase}${path}`, { ...options, headers: { access_token: key, 'Content-Type': 'application/json' }, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}
async function verifyExistingCharge(S, pedido, key) {
  const ref = pedido.external_reference || `M31CAMISA:${pedido.id}`;
  const path = pedido.asaas_payment_id ? `/payments/${encodeURIComponent(pedido.asaas_payment_id)}` : `/payments?externalReference=${encodeURIComponent(ref)}&limit=100`;
  const response = await asaas(path, key);
  if (!response.ok) throw new Error('Não foi possível conferir a cobrança anterior. Nenhuma nova cobrança foi criada.');
  const data = await response.json();
  const payments = pedido.asaas_payment_id ? [data] : data.data;
  if (!Array.isArray(payments) || data.hasMore || payments.length !== 1 || !chargeMatches(payments[0], pedido)) {
    return Response.json({ em_conferencia: true, pedido: publicOrder(pedido), error: 'Tentativa anterior em conferência. Não gere outro pedido; fale com a Dulce.' }, { status: 202 });
  }
  const payment = payments[0];
  // Recovery binds only an exact, unique charge; never creates or confirms payment.
  const result = await S.EventoM31CamisaPedido.updateMany(
    { id: pedido.id, asaas_payment_id: pedido.asaas_payment_id || null, cobranca_tentativa_id: pedido.cobranca_tentativa_id || null },
    { $set: { asaas_payment_id: payment.id, asaas_charge_url: payment.invoiceUrl || null, external_reference: ref, cobranca_estado: 'criada', cobranca_erro: null } }
  );
  if (!changed(result) && !pedido.asaas_payment_id) return Response.json({ em_conferencia: true }, { status: 202 });
  if (['CONFIRMED', 'RECEIVED'].includes(payment.status)) return Response.json({ acompanhar: true, pedido: publicOrder(pedido) });
  if (payment.deleted || payment.status !== 'PENDING' || !payment.invoiceUrl) return Response.json({ em_conferencia: true, error: 'Esta cobrança não está disponível para pagamento. Fale com a Dulce.', pedido: publicOrder(pedido) }, { status: 202 });
  return Response.json({ success: true, payment_url: payment.invoiceUrl, reutilizado: true, valor: pedido.valor_total, valor_cobrado: pedido.valor_cobrado || pedido.valor_total });
}

return (async (req) => {
  let S, base44Client, claimedPedido, attemptId;
  let mayHavePosted = false;
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Método não permitido.' }, { status: 405 });
    const body = await req.json();
    const action = body.action || 'criar';
    if (!['config', 'quote', 'consultar', 'criar', 'lookup'].includes(action)) return Response.json({ error: 'Ação inválida.' }, { status: 400 });
    const token = String(body.pedido_token || '').trim();
    if (!['config', 'quote', 'lookup'].includes(action) && !tokenPattern.test(token)) return Response.json({ error: 'Identificador do pedido inválido. Não gere outra compra; procure o suporte.' }, { status: 400 });
    // Intentional public checkout. Opaque UUID authorizes only one order; entity access is admin-only.
    const base44 = createClientFromRequest(req);
    S = base44.asServiceRole.entities;
    base44Client = base44;
    // Lookup silencioso do checkout inteligente: confirma apenas se o WhatsApp
    // tem cadastro com CPF válido na base de inscritas. Nunca devolve o CPF.
    if (action === 'lookup') {
      let tel = String(body.whatsapp || '').replace(/\D/g, '');
      if (tel.length === 10 || tel.length === 11) tel = `55${tel}`;
      if (!/^55\d{10,11}$/.test(tel)) return Response.json({ encontrado: false });
      const cadastro = await buscarCpfPorWhatsapp(S, tel);
      // Autopreenchimento do checkout: devolve apenas o NOME da inscrita para
      // pré-preencher o formulário. O CPF permanece exclusivamente no servidor.
      return Response.json({ encontrado: Boolean(cadastro), nome: cadastro?.nome || null }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (action === 'consultar') {
      const pedido = (await S.EventoM31CamisaPedido.filter({ pedido_token: token }, '-created_date', 1))[0];
      if (!pedido) return Response.json({ error: 'Pedido não encontrado neste navegador.' }, { status: 404 });
      return Response.json(publicOrder(pedido), { headers: { 'Cache-Control': 'no-store' } });
    }
    const cfg = (await S.EventoM31Config.list('-created_date', 1))[0] || {};
    const activeModels = Array.isArray(cfg.camisas_pre_venda_modelos_ativos) ? cfg.camisas_pre_venda_modelos_ativos.filter(m => models.includes(m)) : [];
    // REGRA DE PREÇO DA PRÉ-VENDA: 1 camisa = preço unitário (R$ 65);
    // 2 ou mais camisas = preço promocional por peça (R$ 60), até a data limite da promoção.
    const hoje = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Fortaleza' }).format(new Date());
    const precoUnitario = Number(cfg.camisas_pre_venda_preco_unitario) > 0 ? Number(cfg.camisas_pre_venda_preco_unitario) : Number(cfg.camisas_pre_venda_preco_1) > 0 ? Number(cfg.camisas_pre_venda_preco_1) : 65;
    const precoPromocional = Number(cfg.camisas_pre_venda_preco_promocional) > 0 ? Number(cfg.camisas_pre_venda_preco_promocional) : Number(cfg.camisas_pre_venda_preco_2) > 0 ? Number(cfg.camisas_pre_venda_preco_2) / 2 : 60;
    const promoAte = /^\d{4}-\d{2}-\d{2}$/.test(String(cfg.camisas_pre_venda_promo_ate || '')) ? String(cfg.camisas_pre_venda_promo_ate) : '2026-09-30';
    const promocionalAtivo = hoje <= promoAte;
    const totalFor = qty => Math.round((promocionalAtivo && qty >= 2 ? qty * precoPromocional : qty * precoUnitario) * 100) / 100;
    const active = cfg.camisas_pre_venda_ativo === true && activeModels.length > 0 && precoUnitario > 0;
    if (action === 'config') {
      return Response.json({ ativo: active, modelos: activeModels, preco_unitario: precoUnitario, preco_promocional: precoPromocional, promocional_ativo: promocionalAtivo, promo_ate: promoAte, tamanhos: sizes, cores_jesus: colors, card_installments: CARD_INSTALLMENTS });
    }
    if (action === 'quote') {
      const quantidade = Number(body.quantidade);
      const parcelas = Number(body.installments);
      const metodo = String(body.payment_method || 'PIX').toUpperCase();
      if (!Number.isSafeInteger(quantidade) || quantidade < 1 || quantidade > 20) return Response.json({ error: 'Quantidade inválida.' }, { status: 400 });
      if (!['PIX','CREDIT_CARD'].includes(metodo) || (metodo === 'CREDIT_CARD' && !CARD_INSTALLMENTS.includes(parcelas)) || (metodo === 'PIX' && parcelas !== 1)) return Response.json({ error: 'Forma de pagamento inválida.' }, { status: 400 });
      const base = totalFor(quantidade);
      const q = paymentQuote(base, metodo, parcelas);
      return Response.json({ base_total: base, total: q.total, installments: q.installments, installment_value: Math.round((q.total / q.installments) * 100) / 100, estimated_fee: q.estimatedFee });
    }
    const nome = String(body.nome || '').trim();
    const paymentMethod = String(body.payment_method || 'PIX').toUpperCase();
    const installmentCount = Number(body.installments || 1);
    if (!['PIX', 'CREDIT_CARD'].includes(paymentMethod)) return Response.json({ error: 'Forma de pagamento inválida.' }, { status: 400 });
    if (paymentMethod === 'CREDIT_CARD' && !CARD_INSTALLMENTS.includes(installmentCount)) return Response.json({ error: 'Escolha uma opção de parcelamento válida.' }, { status: 400 });
    if (paymentMethod === 'PIX' && installmentCount !== 1) return Response.json({ error: 'PIX não possui parcelas.' }, { status: 400 });
    let whatsapp = String(body.whatsapp || '').replace(/\D/g, '');
    if (whatsapp.length === 10 || whatsapp.length === 11) whatsapp = `55${whatsapp}`;
    const email = String(body.email || '').trim().toLowerCase();
    if (nome.length < 3 || nome.length > 160 || !/^55\d{10,11}$/.test(whatsapp)) return Response.json({ error: 'Informe nome e WhatsApp válidos.' }, { status: 400 });
    // Checkout inteligente: inscritas reconhecidas pelo WhatsApp não digitam
    // CPF — o servidor resgata da inscrição. Sem correspondência, o formulário
    // já pediu o CPF manualmente; ele chega preenchido aqui.
    let cpf = String(body.cpf || '').replace(/\D/g, '');
    if (!cpf) {
      const cadastro = await buscarCpfPorWhatsapp(S, whatsapp);
      if (!cadastro) return Response.json({ error: 'Adicione seu CPF para concluir o pagamento.' }, { status: 400 });
      cpf = cadastro.cpf;
    }
    if (!cpfValid(cpf)) return Response.json({ error: 'Informe um CPF válido.' }, { status: 400 });
    const hasDeclaration = Object.prototype.hasOwnProperty.call(body, 'ja_inscrita_m31');
    if (hasDeclaration && typeof body.ja_inscrita_m31 !== 'boolean') return Response.json({ error: 'Responda Sim ou Não sobre sua inscrição.' }, { status: 400 });
    if (!Array.isArray(body.itens) || body.itens.length < 1 || body.itens.length > 20) return Response.json({ error: 'Adicione pelo menos 1 camisa (máximo 20).' }, { status: 400 });
    const itens = body.itens.map(i => {
      const modelo = String(i?.modelo || '').trim().toLowerCase();
      return { modelo, tamanho: String(i?.tamanho || '').trim().toUpperCase(), cor: modelo === 'jesus' ? String(i?.cor || '').trim().toLowerCase() : null, entregue: false };
    });
    if (itens.some(i => !models.includes(i.modelo) || !sizes.includes(i.tamanho) || (i.modelo === 'jesus' && !colors.includes(i.cor)))) return Response.json({ error: 'Escolha modelo, tamanho e cor válidos.' }, { status: 400 });
    let pedido = (await S.EventoM31CamisaPedido.filter({ pedido_token: token }, '-created_date', 1))[0];
    const total = totalFor(itens.length);
    const quote = paymentQuote(total, paymentMethod, installmentCount);
    const expected = Number(body.valor_esperado ?? quote.total);
    if (!Number.isFinite(expected) || expected <= 0) return Response.json({ error: 'Preço inválido. Atualize a página.' }, { status: 400 });
    if (!pedido) {
      if (!active || itens.some(i => !activeModels.includes(i.modelo))) return Response.json({ error: 'Pré-venda indisponível ou modelo pausado.' }, { status: 409 });
      if (cents(expected) !== cents(quote.total)) return Response.json({ error: 'O preço mudou. Atualize a página antes de confirmar.' }, { status: 409 });
      const snapshot = itens.map(({ modelo, tamanho, cor }) => ({ modelo, tamanho, cor }));
      try {
        pedido = await S.EventoM31CamisaPedido.create({ pedido_token: token, nome, whatsapp, email: email || null,
          ...(hasDeclaration ? { ja_inscrita_m31: body.ja_inscrita_m31, inscricao_m31_declarada_em: new Date().toISOString() } : {}),
          itens, itens_cobrados: snapshot, quantidade: itens.length, valor_total: total, pedido_versao: 1,
          cobranca_fingerprint: `${selectionKey(snapshot)}:${cents(total)}:${paymentMethod}:${installmentCount}:${cents(quote.total)}`, cobranca_estado: 'nao_iniciada', status_pagamento: 'checkout_pendente', valor_cobrado: quote.total, payment_method: paymentMethod, installment_count: installmentCount, taxa_repassada: quote.estimatedFee, origem: 'formulario_camisas' });
      } catch (e) {
        pedido = (await S.EventoM31CamisaPedido.filter({ pedido_token: token }, '-created_date', 1))[0];
        if (!pedido) throw e;
      }
      // REGRA DA LOJINHA: pedido com cobrança + nova seleção nasce como pedido
      // NOVO; o pedido anterior (token substituído, informado pelo frontend ao
      // reenviar) vira SUBSTITUÍDO aqui, atomicamente, e sai de toda recuperação.
      // Somente PENDENTE real → SUBSTITUÍDO; a cobrança no Asaas não é tocada.
      if (typeof body.substitui_pedido_token === 'string' && tokenPattern.test(body.substitui_pedido_token)) {
        const antigo = (await S.EventoM31CamisaPedido.filter({ pedido_token: body.substitui_pedido_token }, '-created_date', 1))[0];
        if (antigo && antigo.id !== pedido.id && antigo.status_pagamento === 'checkout_pendente' && !antigo.pedido_substituido_por_id) {
          const marcou = await S.EventoM31CamisaPedido.updateMany(
            { id: antigo.id, status_pagamento: 'checkout_pendente', pedido_substituido_por_id: null },
            { $set: { status_pagamento: 'substituido', pedido_substituido_por_id: pedido.id, pedido_substituido_em: new Date().toISOString() } }
          );
          if (changed(marcou)) await S.EventoM31CamisaPedido.updateMany({ id: pedido.id, substitui_pedido_id: null }, { $set: { substitui_pedido_id: antigo.id } });
        }
      }
    }
    if (hasDeclaration && pedido.ja_inscrita_m31 == null) await S.EventoM31CamisaPedido.updateMany({ id: pedido.id, ja_inscrita_m31: null }, { $set: { ja_inscrita_m31: body.ja_inscrita_m31, inscricao_m31_declarada_em: new Date().toISOString() } });
    // Número operacional sequencial imutável (#001, #002...) — best-effort na
    // criação; garantido também na confirmação do pagamento.
    base44.asServiceRole.functions.invoke('m31AvisoCompraConfirmada', { action: 'atribuir_numero', pedido_id: pedido.id, internal_secret: config('UAZAPI_TOKEN') }).catch(() => {});
    if (selectionKey(pedido.itens_cobrados || pedido.itens) !== selectionKey(itens) || cents(expected) !== cents(pedido.valor_cobrado || quote.total) || pedido.payment_method !== paymentMethod || Number(pedido.installment_count || 1) !== installmentCount) {
      // O token identifica o PEDIDO, não a pessoa. Se este pedido já possui cobrança,
      // uma nova seleção no mesmo navegador é uma NOVA COMPRA legítima — não um erro.
      // O frontend recebe novo_pedido=true, gera outro pedido_token e reenvia uma única vez.
      if (pedido.asaas_payment_id || pedido.asaas_charge_url || ['criada','confirmada'].includes(pedido.cobranca_estado)) {
        return Response.json({ novo_pedido: true, motivo: 'pedido_anterior_ja_possui_cobranca', pedido_anterior: publicOrder(pedido) }, { status: 409 });
      }
      // Sem cobrança criada ainda, é seguro atualizar o mesmo carrinho/pedido.
      const snapshotNovo = itens.map(({ modelo, tamanho, cor }) => ({ modelo, tamanho, cor }));
      const upd = await S.EventoM31CamisaPedido.updateMany(
        { id: pedido.id, status_pagamento: 'checkout_pendente', asaas_payment_id: null, asaas_charge_url: null },
        { $set: { itens, itens_cobrados: snapshotNovo, quantidade: itens.length, valor_total: total,
          valor_cobrado: quote.total, payment_method: paymentMethod, installment_count: installmentCount, taxa_repassada: quote.estimatedFee,
          cobranca_fingerprint: `${selectionKey(snapshotNovo)}:${cents(total)}:${paymentMethod}:${installmentCount}:${cents(quote.total)}`, pedido_versao: (pedido.pedido_versao || 1) + 1,
          revisao_solicitada: null } }
      );
      if (!changed(upd)) return Response.json({ em_conferencia: true, error: 'O pedido mudou enquanto você confirmava. Tente novamente.' }, { status: 202 });
      pedido = { ...pedido, itens, itens_cobrados: snapshotNovo, quantidade: itens.length, valor_total: total, valor_cobrado: quote.total, payment_method: paymentMethod, installment_count: installmentCount, taxa_repassada: quote.estimatedFee, revisao_solicitada: null };
    }
    if (pedido.status_pagamento === 'pago') return Response.json({ pago: true, pedido: publicOrder(pedido) });
    if (['cancelado', 'estornado', 'revisar'].includes(pedido.status_pagamento)) return Response.json({ em_conferencia: true, pedido: publicOrder(pedido), error: 'Este pedido precisa de conferência da Dulce.' }, { status: 202 });
    const key = config('ASAAS_API_KEY');
    if (!key) throw new Error('Pagamento indisponível: configuração do provedor ausente.');
    if (['preparando', 'enviando'].includes(pedido.cobranca_estado)) {
      const since = Date.parse(pedido.cobranca_iniciada_em || '');
      if (!Number.isFinite(since) || Date.now() - since < 120000) return Response.json({ em_conferencia: true, error: 'Sua tentativa está em processamento. Aguarde antes de conferir novamente.' }, { status: 202 });
    }
    // Legacy orders with no state are ambiguous: query, never issue another financial POST.
    if (pedido.asaas_payment_id || pedido.asaas_charge_url || pedido.cobranca_estado !== 'nao_iniciada') return await verifyExistingCharge(S, pedido, key);
    if (!active || itens.some(i => !activeModels.includes(i.modelo))) return Response.json({ error: 'Pré-venda pausada. Nenhuma cobrança criada.' }, { status: 409 });
    attemptId = crypto.randomUUID();
    const ref = `M31CAMISA:${pedido.id}`;
    const lock = await S.EventoM31CamisaPedido.updateMany(
      { id: pedido.id, cobranca_estado: 'nao_iniciada', asaas_payment_id: null, asaas_charge_url: null, status_pagamento: 'checkout_pendente' },
      { $set: { cobranca_estado: 'preparando', cobranca_tentativa_id: attemptId, cobranca_iniciada_em: new Date().toISOString(), external_reference: ref } }
    );
    if (!changed(lock)) return Response.json({ em_conferencia: true, error: 'Já existe uma tentativa em andamento. Nenhuma nova cobrança foi criada.' }, { status: 202 });
    claimedPedido = pedido;
    const searchResp = await asaas(`/customers?cpfCnpj=${cpf}`, key);
    if (!searchResp.ok) throw new Error('Não foi possível consultar os dados do pagador.');
    const search = await searchResp.json();
    let customerId = search.data?.[0]?.id;
    if (!customerId) {
      const customerResp = await asaas('/customers', key, { method: 'POST', body: JSON.stringify({ name: nome, cpfCnpj: cpf, mobilePhone: whatsapp, ...(email ? { email } : {}), notificationDisabled: true }) });
      const customer = await customerResp.json();
      if (!customerResp.ok || !customer.id) throw new Error('Não foi possível cadastrar o pagador. Confira seus dados.');
      customerId = customer.id;
    }
    // BEGIN BASE44_ONLY_NOTIFICATIONS: also enforce for reused Asaas customers.
    const noticeResponse = await fetch('__ASAAS_API__/customers/' + customerId, {
      method: 'PUT', headers: { access_token: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationDisabled: true }),
      redirect: 'error', signal: AbortSignal.timeout(12000),
    });
    const noticeCustomer = await noticeResponse.json();
    if (!noticeResponse.ok || noticeCustomer.id !== customerId || noticeCustomer.notificationDisabled !== true)
      throw new Error('Não foi possível garantir a comunicação exclusiva pelo Base44. Nenhuma nova cobrança foi criada.');
    // END BASE44_ONLY_NOTIFICATIONS

    // Persist intent BEFORE the only financial POST; never clear this marker on uncertainty.
    mayHavePosted = true;
    const start = await S.EventoM31CamisaPedido.updateMany({ id: pedido.id, cobranca_estado: 'preparando', cobranca_tentativa_id: attemptId }, { $set: { cobranca_estado: 'enviando', cobranca_enviada_em: new Date().toISOString() } });
    if (!changed(start)) {
      // POST financeiro pode ter sido enviado sob outra tentativa: risco real.
      base44.asServiceRole.functions.invoke('m31AlertarGestor', {
        tipo_erro: 'cobranca_camisa_vinculo_incerto', gravidade: 'alto', origem: 'asaas',
        descricao: 'Tentativa financeira perdida após marcar envio ao Asaas — cobrança pode existir sem vínculo com o pedido.',
        possivel_causa: 'Concorrência de tentativas sobre o mesmo pedido',
        acao_recomendada: 'Conferir o pedido no painel de camisas e a cobrança no Asaas antes de qualquer novo envio',
        pessoa_nome: pedido.nome, pessoa_telefone: pedido.whatsapp, pessoa_id: pedido.id,
        chave_unica: `vinculo_incerto_camisa_${pedido.id}`,
        envio_direto: true,
      }).catch(() => {});
      return Response.json({ em_conferencia: true }, { status: 202 });
    }
    const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const paymentPayload = {
      customer: customerId,
      billingType: paymentMethod,
      dueDate,
      description: `Camisas M31 — ${itens.length} peça(s) — ${paymentMethod === 'PIX' ? 'PIX' : `${installmentCount}x no cartão`}`,
      externalReference: ref,
      ...(paymentMethod === 'CREDIT_CARD' && installmentCount > 1
        ? { installmentCount, totalValue: quote.total }
        : { value: quote.total }),
    };
    const paymentResp = await asaas('/payments', key, { method: 'POST', body: JSON.stringify(paymentPayload) });
    const payment = await paymentResp.json();
    if (!paymentResp.ok || !payment.id || !payment.invoiceUrl) throw new Error('Resposta financeira em conferência.');
    const bound = await S.EventoM31CamisaPedido.updateMany({ id: pedido.id, cobranca_tentativa_id: attemptId, cobranca_estado: 'enviando', asaas_payment_id: null }, { $set: { asaas_payment_id: payment.id, asaas_charge_url: payment.invoiceUrl, cobranca_estado: 'criada', cobranca_erro: null, valor_cobrado: quote.total, payment_method: paymentMethod, installment_count: installmentCount, taxa_repassada: quote.estimatedFee } });
    if (!changed(bound)) {
      // Cobrança criada no Asaas mas não vinculada ao pedido: risco financeiro.
      base44.asServiceRole.functions.invoke('m31AlertarGestor', {
        tipo_erro: 'cobranca_camisa_sem_vinculo', gravidade: 'alto', origem: 'asaas',
        descricao: 'Cobrança criada no Asaas, mas o vínculo com o pedido não foi confirmado — conferir antes de qualquer nova tentativa.',
        possivel_causa: 'Concorrência no vínculo do payment_id ao pedido',
        acao_recomendada: 'Conferir o pedido no painel de camisas e a cobrança no Asaas; nunca gerar nova cobrança',
        pessoa_nome: pedido.nome, pessoa_telefone: pedido.whatsapp, pessoa_id: pedido.id,
        chave_unica: `cobranca_sem_vinculo_camisa_${pedido.id}`,
        envio_direto: true,
      }).catch(() => {});
      return Response.json({ em_conferencia: true, error: 'Cobrança criada, aguardando conferência do vínculo. Não repita a compra.' }, { status: 202 });
    }
    // Nenhum aviso na criação do pedido: o único aviso operacional à Dulce é o
    // COMPRA CONFIRMADA, enviado quando o pagamento é confirmado.
    return Response.json({ success: true, payment_url: payment.invoiceUrl, valor: pedido.valor_total, valor_cobrado: quote.total, meios: [paymentMethod], parcelas_cartao: installmentCount });
  } catch (error) {
    if (claimedPedido) {
      await S.EventoM31CamisaPedido.updateMany({ id: claimedPedido.id, cobranca_tentativa_id: attemptId, cobranca_estado: { $in: ['preparando', 'enviando'] } }, { $set: { cobranca_estado: mayHavePosted ? 'conferencia' : 'nao_iniciada', cobranca_erro: mayHavePosted ? 'Resultado incerto; consultar tentativa anterior, nunca repetir POST.' : 'Falha anterior ao envio financeiro.' } });
    }
    // QUALQUER falha do checkout de camisas dispara alerta DIRETO ao gestor.
    // Efeito separado: nunca altera o desfecho devolvido à compradora.
    if (base44Client) {
      base44Client.asServiceRole.functions.invoke('m31AlertarGestor', {
        tipo_erro: 'falha_checkout_camisa', gravidade: mayHavePosted ? 'alto' : 'medio', origem: 'formulario',
        descricao: `Checkout de camisas falhou: ${error?.message || 'erro desconhecido'}${mayHavePosted ? ' — POST financeiro pode ter sido enviado: conferir no Asaas antes de qualquer nova tentativa.' : ''}`,
        possivel_causa: 'Falha no processamento do pedido ou na comunicação com o Asaas',
        acao_recomendada: 'Conferir o pedido no painel de camisas e o status da cobrança no Asaas',
        pessoa_nome: claimedPedido?.nome || null, pessoa_telefone: claimedPedido?.whatsapp || null,
        pessoa_id: claimedPedido?.id || null,
        chave_unica: `falha_checkout_camisa_${claimedPedido?.id || attemptId || 'sem_pedido'}`,
        envio_direto: true,
      }).catch(() => {});
    }
    return Response.json({ error: mayHavePosted ? 'Sua cobrança está em conferência. Nenhuma nova cobrança será criada ao tentar novamente.' : error?.message || 'Não foi possível avançar ao pagamento.', em_conferencia: mayHavePosted }, { status: mayHavePosted ? 202 : 502 });
  }
})(req);

}
