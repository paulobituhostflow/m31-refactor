import { gestaoError } from './gestaoAccess.js';
import template from './camisasTemplate.json';

const link = row => row.camisas_link_token ? `https://inscricoes.m31filhas.com.br/m31-camisas?caravana_id=${encodeURIComponent(row.id)}&camisas_token=${encodeURIComponent(row.camisas_link_token)}` : null;

export async function shirtsForCaravana(S, caravana, client = null) {
  const orders = [];
  for (let skip = 0; skip < 10000; skip += 500) {
    const page = await S.EventoM31CamisaPedido.filter({ caravana_id: caravana.id }, '-id', 500, skip);
    if (!Array.isArray(page)) throw gestaoError(503, 'SHIRT_READ_FAILED', 'Não foi possível consultar os pedidos de camisas.');
    orders.push(...page);
    if (page.length < 500) break;
    if (skip === 9500) throw gestaoError(503, 'SHIRT_READ_INCOMPLETE', 'A lista de pedidos está incompleta.');
  }
  const resumo = { pedidos: orders.length, pedidos_pagos: 0, camisas_pagas: 0, pedidos_pendentes: 0, camisas_pendentes: 0, valor_pago: 0 };
  const grade = new Map();
  for (const p of orders) {
    const paid = p.status_pagamento === 'pago', pending = p.status_pagamento === 'checkout_pendente';
    if (paid) {
      resumo.pedidos_pagos++;
      resumo.camisas_pagas += Number(p.quantidade) || 0;
      resumo.valor_pago += Math.round(Number(p.valor_cobrado ?? p.valor_total) * 100);
    }
    if (pending) {
      resumo.pedidos_pendentes++;
      resumo.camisas_pendentes += Number(p.quantidade) || 0;
    }
    for (const item of p.itens_cobrados || p.itens || []) {
      const key = [item.modelo, item.cor || '', item.tamanho].join('|');
      if (!grade.has(key)) grade.set(key, { modelo: item.modelo, cor: item.cor || null, tamanho: item.tamanho, pagas: 0, pendentes: 0 });
      const q = Number(item.quantidade_item ?? item.quantidade ?? 1) || 1;
      if (paid) grade.get(key).pagas += q;
      if (pending) grade.get(key).pendentes += q;
    }
  }
  resumo.valor_pago /= 100;
  let preco = null, promoError = null;
  if (caravana.camisas_link_token && client) {
    try {
      const r = await client.functions.invoke('m31CentralComercial', { action: 'catalogo', form_id: 'camisas', caravana_id: caravana.id, camisas_token: caravana.camisas_link_token });
      const d = r?.data ?? r;
      preco = d?.forms?.find(f => f.id === 'camisas')?.current?.pix ?? null;
      if (!d?.ok || !preco) throw Error('Preço promocional não confirmado.');
    } catch {
      promoError = 'Não foi possível confirmar a condição promocional. Atualize antes de compartilhar.';
    }
  }
  return {
    resumo,
    grade: [...grade.values()],
    pedidos: orders.map(p => ({
      id: p.id,
      numero_pedido: p.numero_pedido ?? null,
      nome: p.nome,
      whatsapp: p.whatsapp,
      itens: (p.itens_cobrados || p.itens || []).map(i => ({ modelo: i.modelo, tamanho: i.tamanho, cor: i.cor || null, quantidade: Number(i.quantidade_item ?? i.quantidade ?? 1) || 1 })),
      quantidade: p.quantidade,
      valor_total: p.valor_total,
      valor_cobrado: p.valor_cobrado ?? p.valor_total,
      status_pagamento: p.status_pagamento,
      pagamento_confirmado_em: p.pagamento_confirmado_em || null,
    })),
    promocao: {
      link: promoError ? null : link(caravana),
      preco,
      error: promoError,
      notificar_lider: caravana.camisas_notificar_lider === true,
    },
  };
}

export async function generateShirtLink(client, S, ctx, current, body) {
  if (ctx.user.role !== 'admin') throw gestaoError(403, 'ADMIN_REQUIRED', 'Apenas o administrador pode definir o preço promocional de camisas.');
  if (current.ativa !== true) throw gestaoError(409, 'CARAVAN_INACTIVE', 'Ative a caravana antes de gerar o link.');
  const price = Number(body.preco), request = String(body.request_id || '');
  if (!Number.isFinite(price) || price <= 0 || price > 100000 || Math.abs(Math.round(price * 100) - price * 100) > 0.000001) {
    throw gestaoError(400, 'INVALID_PRICE', 'Informe um preço por camisa, com até duas casas decimais.');
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(request) || typeof body.notificar_lider !== 'boolean') {
    throw gestaoError(400, 'INVALID_REQUEST', 'Reabra a ficha antes de gerar o link.');
  }
  const panelResponse = await client.functions.invoke('m31CentralComercial', { action: 'painel' });
  const panel = panelResponse?.data ?? panelResponse;
  if (!panel?.ok || !panel.can_edit || !panel.configured || !panel.config_id) {
    throw gestaoError(409, 'COMMERCIAL_NOT_READY', 'Publique a política vigente na Central Comercial antes de gerar o link promocional.');
  }
  if (!current.camisas_link_token) {
    await S.EventoM31Caravana.updateMany({ id: current.id, camisas_link_token: null }, { $set: { camisas_link_token: crypto.randomUUID() } });
    current = await S.EventoM31Caravana.get(current.id);
    if (!current.camisas_link_token) throw gestaoError(409, 'LINK_NOT_CONFIRMED', 'Não foi possível confirmar o link. Reabra a ficha.');
  }
  const policy = structuredClone(panel.policy);
  policy.forms.camisas.exceptions = [...(policy.forms.camisas.exceptions || []).filter(x => x.caravana_id !== current.id),
    { caravana_id: current.id, label: `Camisas — ${current.nome}`.slice(0, 120), pix: price, card: price }];
  const savedResponse = await client.functions.invoke('m31CentralComercial', {
    action: 'salvar', policy, config_id: panel.config_id, expected_version: panel.version,
    request_id: request, reason: `Preço promocional de camisas da caravana ${current.nome}: R$ ${price.toFixed(2)} por peça.`
  });
  const saved = savedResponse?.data ?? savedResponse;
  if (!saved?.ok || !saved.saved) throw gestaoError(409, 'PRICE_NOT_CONFIRMED', saved?.error || 'A Central Comercial não confirmou o preço. Reabra a ficha.');
  if (body.notificar_lider) {
    const templates = await S.M31MessageTemplate.filter({ chave_unica: template.chave_unica }, '-created_date', 2);
    if (templates.length > 1 || templates[0]?.is_active === false) {
      throw gestaoError(409, 'LEADER_TEMPLATE_UNAVAILABLE', 'O preço foi salvo. Ative um único modelo de aviso à líder na Central de Mensagens antes de habilitar os avisos.');
    }
  }
  await S.EventoM31Caravana.update(current.id, { camisas_notificar_lider: body.notificar_lider });
  return shirtsForCaravana(S, await S.EventoM31Caravana.get(current.id), client);
}
