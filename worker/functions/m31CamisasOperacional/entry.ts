// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.
import { buildOperationalShirtRows, buildShirtRecordPatch } from './shirtOperationalRules.js';
import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

// Planilha DEDICADA de camisas (2026-09-15) — não é mais a planilha grande do evento.
const SHEET_ID = config('GOOGLE_CAMISAS_SHEET_ID') || 'CONFIGURATION_REQUIRED';
const SHEETS_API = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`;
const PLANILHA_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}`;
const SIZES = ['PP', 'P', 'M', 'G', 'GG', 'XGG'];
const SIZE_SET = new Set(SIZES);
// Aviso de camisa paga vai para o GRUPO de suporte (finalidade=SUPORTE) —
// somente o fluxo de camisas usa este canal. Sem fallback individual.
const FILA_ATIVA = ['pendente', 'processando', 'enviado', 'incerto', 'falha_terminal'];

const MODELS = [
  { id: 'equipe', nome: 'Equipe' },
  { id: 'jesus', nome: 'Jesus' },
  { id: 'milagres', nome: 'Milagres' },
  { id: 'filhas', nome: 'Filhas' },
];
const COMMERCIAL_MODELS = MODELS.filter((model) => model.id !== 'equipe');

// Combinações oficiais da grade de produção (Jesus Preta e Jesus Cereja separadas).
const COMBOS = [
  { modelo: 'jesus', cor: 'preta', nome: 'Jesus Preta' },
  { modelo: 'jesus', cor: 'cereja', nome: 'Jesus Cereja' },
  { modelo: 'milagres', cor: '', nome: 'Milagres' },
  { modelo: 'filhas', cor: '', nome: 'Filhas' },
];

function changed(result: any): boolean {
  return (result?.updated ?? result?.modified_count ?? result?.modifiedCount ?? 0) === 1;
}

function truthy(value: unknown) {
  return value === true || ['true', 'sim', 'pago', 'x'].includes(String(value || '').trim().toLowerCase());
}

function normalizarTelefone(valor: unknown): string {
  const digits = String(valor || '').replace(/\D/g, '');
  const nacional = digits.startsWith('55') && digits.length === 13 ? digits.slice(2) : digits;
  return /^\d{2}9\d{8}$/.test(nacional) ? `55${nacional}` : '';
}

function separarModeloCor(valor: unknown) {
  const bruto = String(valor || '').trim().toLowerCase();
  const cor = bruto.includes('cereja') ? 'cereja' : bruto.includes('preta') ? 'preta' : '';
  const modelo = MODELS.find((item) => bruto.includes(item.id))?.id || 'filhas';
  return { modelo, cor: modelo === 'jesus' ? cor : '' };
}

function quantidadeDoItem(item: any): number {
  const quantidade = Number(item?.quantidade_item ?? item?.quantidade ?? item?.quantity ?? item?.qty ?? 1);
  return Number.isFinite(quantidade) && quantidade > 0 ? Math.floor(quantidade) : 1;
}

function chaveOperacional(row: any): string {
  if (row.numero_pedido != null) return `pedido-numero:${row.numero_pedido}`;
  if (row.registro_tipo === 'pedido_camisa' && row.registro_id) return `pedido-id:${row.registro_id}`;
  if (row.pedido_id) return String(row.pedido_id);
  return `linha:${row.row_id}`;
}

function quantidadeDaLinha(row: any): number {
  return quantidadeDoItem(row);
}

async function validateSession(base44: any, user: any, sessionId: string) {
  const session = (await base44.asServiceRole.entities.M31OperacaoSessao.filter({ session_id: sessionId, ativa: true }, '-created_date', 1))[0];
  if (!session || session.auth_email !== user.email || new Date(session.expires_at).getTime() <= Date.now()) throw new Error('session_expired');
  if (!Array.isArray(session.operacoes_permitidas) || !session.operacoes_permitidas.includes('camisas')) throw new Error('operational_scope_forbidden');
  const member = (await base44.asServiceRole.entities.EventoM31Membro.filter({ user_email: user.email, ativo: true }, '-created_date', 1))[0] || (user.role === 'admin' ? { perfil: 'admin' } : null);
  if (!member || member.perfil === 'visualizacao') throw new Error('operational_scope_forbidden');
  return { ...session, perfil_conta: member.perfil };
}

function isDulceSession(session: any): boolean {
  return String(session?.operador_nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes('dulce');
}

function modelAllowedForSession(modelo: string, session: any): boolean {
  return !(isDulceSession(session) || session.perfil_conta === 'camisas') || COMMERCIAL_MODELS.some((model) => model.id === modelo);
}

async function sheetsRequest(accessToken: string, path: string, options: RequestInit = {}) {
  const response = await fetch(`${SHEETS_API}${path}`, { ...options, headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...(options.headers || {}) } });
  if (!response.ok) throw new Error(`google_sheets_${response.status}`);
  return response.status === 204 ? null : response.json();
}

// Somente VENDAS da planilha — a aba de voluntárias (Equipe) foi retirada
// da operação da Dulce por decisão de gestão (2026-09-15).
function buildRows(sales: any[][]) {
  const rows: any[] = [];
  sales.forEach((values, index) => {
    const [nome, modeloRaw, tamanho, preco, pago, entregue] = values;
    if (!String(nome || '').trim()) return;
    const size = String(tamanho || '').trim().toUpperCase();
    const { modelo, cor } = separarModeloCor(modeloRaw);
    const paid = truthy(pago); const delivered = truthy(entregue);
    rows.push({ row_id: `sheet:sale:${index + 2}`, registro_tipo: 'planilha_venda', nome, whatsapp: '', origem: 'Venda', modelo, cor, tamanho: SIZE_SET.has(size) ? size : '', quantidade_item: 1, valor: Number(preco) || 0, pagamento_status: paid ? 'pago' : 'pendente', entregue: delivered, observacao: cor ? `Cor: ${cor}` : '', situacao: !SIZE_SET.has(size) ? 'sem_tamanho' : !paid ? 'pagamento_pendente' : delivered ? 'entregue' : 'a_entregar' });
  });
  return rows;
}

function buildPedidoRows(pedidos: any[]) {
  const rows: any[] = [];
  for (const pedido of pedidos || []) {
    const pago = pedido.status_pagamento === 'pago';
    const itens = Array.isArray(pedido.itens) ? pedido.itens : [];
    itens.forEach((item: any, index: number) => {
      const tamanho = String(item?.tamanho || '').toUpperCase();
      const entregue = item?.entregue === true;
      const pagamento_status = pago ? 'pago' : pedido.status_pagamento === 'substituido' ? 'substituido' : ['revisar', 'vencido', 'cancelado', 'estornado'].includes(pedido.status_pagamento) ? pedido.status_pagamento : 'pendente';
      rows.push({
        row_id: `pedido:${pedido.id}:${index}`,
        registro_tipo: 'pedido_camisa',
        registro_id: pedido.id,
        item_index: index,
        numero_pedido: pedido.numero_pedido ?? null,
        nome: pedido.nome || 'Sem nome',
        whatsapp: normalizarTelefone(pedido.whatsapp) || pedido.whatsapp || '',
        origem: pedido.origem === 'whatsapp_suporte' ? 'WhatsApp' : 'Pré-venda',
        ja_inscrita_m31: typeof pedido.ja_inscrita_m31 === 'boolean' ? pedido.ja_inscrita_m31 : null,
        comprovante: Boolean(pedido.comprovante_uri),
        pagamento_confirmado_por: pedido.pagamento_confirmado_por || null,
        revisao_solicitada: pedido.revisao_solicitada || null,
        cobranca_estado: pedido.cobranca_estado || null,
        aviso_dulce_status: pedido.aviso_dulce_status || 'pendente',
        aviso_dulce_fila_id: pedido.aviso_dulce_fila_id || null,
        modelo: item?.modelo || 'filhas',
        cor: item?.cor || '',
        tamanho: SIZE_SET.has(tamanho) ? tamanho : '',
        quantidade_item: quantidadeDoItem(item),
        valor: Number(pedido.valor_total || 0),
        pagamento_status,
        entregue,
        entregue_em: item?.entregue_em || null,
        entregue_por: item?.entregue_por || null,
        observacao: item?.cor ? `Cor: ${item.cor}` : '',
        situacao: !SIZE_SET.has(tamanho) ? 'sem_tamanho' : pagamento_status === 'substituido' ? 'substituido' : pagamento_status === 'revisar' ? 'revisar_pagamento' : pagamento_status !== 'pago' ? 'pagamento_pendente' : entregue ? 'entregue' : 'a_entregar',
      });
    });
  }
  return rows;
}

function summary(rows: any[], pedidoRows: any[], recebidas: number) {
  rows = rows.filter((row) => !['substituido', 'cancelado', 'estornado', 'vencido'].includes(row.pagamento_status));
  const pedidos = new Map<string, any>();
  for (const row of rows) {
    const key = chaveOperacional(row);
    if (!pedidos.has(key)) pedidos.set(key, row);
  }
  const soma = (subset: any[]) => subset.reduce((total, row) => total + quantidadeDaLinha(row), 0);
  const pagos = rows.filter((row) => row.pagamento_status === 'pago');
  const pagosPorPedido = new Map<string, any>();
  for (const row of pagos) if (!pagosPorPedido.has(chaveOperacional(row))) pagosPorPedido.set(chaveOperacional(row), row);
  return {
    total: rows.length,
    pedidos: pedidos.size,
    camisas_vendidas: soma(rows),
    pagas: new Set(pagos.map(chaveOperacional)).size,
    pecas_pagas: soma(pagos),
    vendas_pagas: [...pagosPorPedido.values()].reduce((total, row) => total + Number(row.valor || 0), 0),
    aguardando_pagamento: new Set(rows.filter((r) => r.pagamento_status !== 'pago' && r.pagamento_status !== 'substituido').map(chaveOperacional)).size,
    a_produzir: soma(rows.filter((r) => r.pagamento_status === 'pago' && !r.entregue)),
    recebidas,
    entregues: soma(rows.filter((r) => r.entregue)),
    a_entregar: soma(rows.filter((r) => r.situacao === 'a_entregar')),
    sem_tamanho: soma(rows.filter((r) => r.situacao === 'sem_tamanho')),
    precisam_acao: new Set(rows.filter((r) => r.situacao !== 'entregue' && r.situacao !== 'substituido').map(chaveOperacional)).size,
  };
}

// Estoque físico por modelo/cor/tamanho. Enquanto nenhum recebimento existir
// para a combinação, 'cadastrado'=false → painel mostra "Ainda não recebido".
// Disponível = recebido - entregues (entrega exige pagamento confirmado).
function inventory(rows: any[], estoqueByKey: Record<string, number>) {
  return COMBOS.map((combo) => {
    const comboRows = rows.filter((row) => row.modelo === combo.modelo && (row.cor || '') === combo.cor);
    const tamanhos: Record<string, any> = {};
    let recebidasTotal = 0; let disponivelTotal = 0;
    for (const size of SIZES) {
      const key = `${combo.modelo}:${combo.cor}:${size}`;
      const cadastrado = estoqueByKey[key] !== undefined;
      const recebido = cadastrado ? Math.max(0, Number(estoqueByKey[key] || 0)) : 0;
      const entregues = comboRows.filter((row) => row.tamanho === size && row.entregue).reduce((total, row) => total + quantidadeDaLinha(row), 0);
      const demanda = comboRows.filter((row) => row.tamanho === size && row.pagamento_status === 'pago').reduce((total, row) => total + quantidadeDaLinha(row), 0);
      const reservadas = comboRows.filter((row) => row.tamanho === size && row.pagamento_status === 'pago' && !row.entregue).reduce((total, row) => total + quantidadeDaLinha(row), 0);
      // Estoque físico é controlado manualmente pela Dulce e NÃO é derivado
      // automaticamente de pedidos, trocas ou entregas.
      const disponivel = Math.max(0, recebido - entregues - reservadas);
      const falta_comprar = Math.max(0, demanda - recebido);
      tamanhos[size] = { recebido, demanda, reservadas, entregues, disponivel, falta_comprar, cadastrado };
      recebidasTotal += recebido; disponivelTotal += disponivel;
    }
    return {
      id: `${combo.modelo}|${combo.cor}`,
      modelo: combo.modelo,
      cor: combo.cor,
      nome: combo.nome,
      tamanhos,
      recebidas: recebidasTotal,
      demanda: comboRows.filter((row) => row.pagamento_status === 'pago').reduce((total, row) => total + quantidadeDaLinha(row), 0),
      reservadas: comboRows.filter((row) => row.pagamento_status === 'pago' && !row.entregue).reduce((total, row) => total + quantidadeDaLinha(row), 0),
      entregues: comboRows.filter((row) => row.entregue).reduce((total, row) => total + quantidadeDaLinha(row), 0),
      disponivel: disponivelTotal,
      falta_comprar: Math.max(0, comboRows.filter((row) => row.pagamento_status === 'pago').reduce((total, row) => total + quantidadeDaLinha(row), 0) - recebidasTotal),
    };
  });
}

// Grade para produção: soma TODAS as peças pagas (planilha, order bump da
// inscrição, formulário público e WhatsApp) por modelo+cor+tamanho.
// 'a_produzir' = peças pagas ainda não entregues.
function gradeProducao(rows: any[]) {
  const grade = new Map();
  for (const row of rows) {
    if (row.pagamento_status !== 'pago') continue;
    const modelo = row.modelo || '';
    const cor = row.cor || '';
    const key = `${modelo}|${cor}`;
    const comboDef = COMBOS.find((c) => c.modelo === modelo && c.cor === cor);
    let entry = grade.get(key);
    if (!entry) {
      entry = {
        id: key, modelo, cor,
        nome: comboDef?.nome || `${MODELS.find((m) => m.id === modelo)?.nome || modelo}${cor ? ` ${cor}` : ''}`,
        tamanhos: {} as Record<string, number>,
        total: 0,
        a_produzir: 0,
        ordem: comboDef ? COMBOS.indexOf(comboDef) : 99,
      };
      grade.set(key, entry);
    }
    const quantidade = quantidadeDaLinha(row);
    if (SIZE_SET.has(row.tamanho)) entry.tamanhos[row.tamanho] = (entry.tamanhos[row.tamanho] || 0) + quantidade;
    entry.total += quantidade;
    if (!row.entregue) entry.a_produzir += quantidade;
  }
  return [...grade.values()].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'));
}

return (async (req: Request) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user?.email) return Response.json({ error: 'unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const sessionId = String(body.session_id || '').trim();
    const session = await validateSession(base44, user, sessionId);
    if (!['listar', 'configurar_venda', 'configurar_pre_venda', 'ajustar_tamanho', 'ajustar_item', 'notificar_troca', 'confirmar_entrega', 'ajustar_estoque', 'retomar_aviso_camisa', 'confirmar_pagamento', 'ver_comprovante', 'exportar_planilha', 'criar_pedido', 'listar_clientes', 'criar_cliente', 'listar_produtos', 'criar_produto', 'receber_estoque', 'chat'].includes(body.action)) return Response.json({ error: 'unsupported_shirt_action' }, { status: 400 });

    if (body.action === 'retomar_aviso_camisa') {
      if (typeof body.pedido_id !== 'string' || !/^[a-zA-Z0-9_-]{10,64}$/.test(body.pedido_id)) return Response.json({ error: 'pedido_id inválido' }, { status: 400 });
      const result = await base44.asServiceRole.functions.invoke('m31AvisoCompraConfirmada', { action: 'retomar_aviso', pedido_id: body.pedido_id, internal_secret: config('UAZAPI_TOKEN') });
      const outcome = result?.data || result;
      return Response.json(outcome, { status: outcome?.ok || outcome?.sucesso ? 200 : 409 });
    }

    // CONFIRMAR PAGAMENTO (responsabilidade da operadora — um toque no painel).
    // Marca pago, registra quem/quando e dispara o aviso curto idempotente.
    // O comprovante anexado nunca confirma sozinho; cancelado/estornado exigem revisão.
    if (body.action === 'notificar_troca') {
      const pedidoId = String(body.pedido_id || '');
      if (!pedidoId) return Response.json({ error: 'pedido_id_required' }, { status: 400 });
      const pedido = await base44.asServiceRole.entities.EventoM31CamisaPedido.get(pedidoId).catch(() => null);
      if (!pedido) return Response.json({ error: 'shirt_order_not_found' }, { status: 404 });
      const telefone = String(pedido.whatsapp || '').replace(/\D/g, '');
      if (telefone.length < 10) return Response.json({ error: 'cliente_sem_whatsapp_valido' }, { status: 409 });
      const itens = Array.isArray(pedido.itens) ? pedido.itens : [];
      const descricao = itens.map((i: any) => [i.modelo, i.cor, i.tamanho].filter(Boolean).join(' ')).join(', ');
      const primeiroNome = String(pedido.nome || 'Filha').trim().split(/\s+/)[0];
      const mensagem = `Olá, ${primeiroNome}! 🤍 Sua alteração de camisa do M31 foi realizada com sucesso.\n\nSeu pedido ficou: *${descricao || 'atualizado'}*.\n\nSe precisar de algum ajuste, fale com a equipe M31.`;
      const fila = await base44.asServiceRole.entities.M31FilaMensagem.create({
        dedup_key: `CAMISA_TROCA:${pedido.id}:${Date.now()}`,
        participante_id: pedido.id,
        telefone,
        automacao: 'OPERACIONAL',
        template: 'camisa_troca_confirmada_v1',
        versao: 'V1',
        origem: 'm31CamisasOperacional',
        mensagens: [{ message: mensagem }],
        status: 'pendente',
        aprovado_para_envio: true,
        prioridade: 7,
      });
      await base44.asServiceRole.entities.EventoM31ActionLog.create({
        user_email: user.email, user_nome: session.operador_nome || user.email, user_perfil: 'camisas',
        acao: 'Enfileirou confirmação de troca de camisa', modulo: 'sistema',
        entidade_id: pedido.id, entidade_nome: pedido.nome || pedido.id,
        dados_anteriores: JSON.stringify({ fila_id: fila.id, telefone }),
      });
      return Response.json({ ok: true, enfileirado: true, fila_id: fila.id });
    }

    if (body.action === 'confirmar_pagamento') {
      if (typeof body.pedido_id !== 'string' || !/^[a-zA-Z0-9_-]{10,64}$/.test(body.pedido_id)) return Response.json({ error: 'pedido_id inválido' }, { status: 400 });
      const S = base44.asServiceRole.entities;
      const pedido = (await S.EventoM31CamisaPedido.filter({ id: body.pedido_id }, '-created_date', 1))[0];
      if (!pedido) return Response.json({ error: 'shirt_order_not_found' }, { status: 404 });
      if (['cancelado', 'estornado', 'substituido', 'vencido'].includes(pedido.status_pagamento)) return Response.json({ error: 'Pedido encerrado — revise antes de confirmar.' }, { status: 409 });
      if (pedido.status_pagamento !== 'pago') {
        const now = new Date().toISOString();
        const result = await S.EventoM31CamisaPedido.updateMany(
          { id: pedido.id, status_pagamento: pedido.status_pagamento },
          { $set: {
            status_pagamento: 'pago',
            ...(pedido.pagamento_confirmado_em ? {} : { pagamento_confirmado_em: now }),
            pagamento_confirmado_por: session.operador_nome || user.email,
            financeiro_verificado_em: now,
            aviso_dulce_status: 'pendente',
          } },
        );
        if (!changed(result)) return Response.json({ error: 'Pedido em conferência. Atualize e tente novamente.' }, { status: 409 });
      }
      // Aviso OPERACIONAL IMEDIATO à Dulce (COMPRA CONFIRMADA #NNN) — idempotente,
      // fora da fila comercial. Falha do aviso nunca altera o pedido pago.
      const avisoRes: any = await base44.asServiceRole.functions.invoke('m31AvisoCompraConfirmada', { pedido_id: pedido.id, internal_secret: config('UAZAPI_TOKEN') }).catch(() => null);
      const aviso = avisoRes?.aviso || avisoRes?.data?.aviso || 'aviso_indisponivel';
      return Response.json({ ok: true, pedido_id: pedido.id, aviso, operador: session.operador_nome || user.email });
    }

    // VER COMPROVANTE — URL assinada do arquivo no storage privado
    // (ou a URL externa quando o upload do comprovante falhou).
    if (body.action === 'ver_comprovante') {
      if (typeof body.pedido_id !== 'string' || !/^[a-zA-Z0-9_-]{10,64}$/.test(body.pedido_id)) return Response.json({ error: 'pedido_id inválido' }, { status: 400 });
      const S = base44.asServiceRole.entities;
      const pedido = (await S.EventoM31CamisaPedido.filter({ id: body.pedido_id }, '-created_date', 1))[0];
      if (!pedido) return Response.json({ error: 'shirt_order_not_found' }, { status: 404 });
      if (!pedido.comprovante_uri) return Response.json({ error: 'sem_comprovante' }, { status: 404 });
      if (/^https?:\/\//.test(pedido.comprovante_uri)) return Response.json({ url: pedido.comprovante_uri });
      const signed = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri: pedido.comprovante_uri, expires_in: 600 });
      if (!signed?.signed_url) return Response.json({ error: 'comprovante_indisponivel' }, { status: 404 });
      return Response.json({ url: signed.signed_url });
    }

    // ── HUB DA CENTRAL DA DULCE (2026-09-15) ──────────────────────
    // + Novo pedido pelo painel: mesma entidade dos fluxos WhatsApp e
    // pré-venda. NUNCA cria inscrição nem cobrança — a venda manual fica
    // em conferência de pagamento até a Dulce confirmar na lista.
    if (body.action === 'criar_pedido') {
      const S = base44.asServiceRole.entities;
      const nome = String(body.nome || '').trim();
      const whats = normalizarTelefone(body.whatsapp);
      const modelo = String(body.modelo || '');
      const cor = String(body.cor || '').toLowerCase();
      const tamanho = String(body.tamanho || '').toUpperCase();
      const quantidade = Math.floor(Number(body.quantidade));
      const valor = Number(body.valor_total);
      if (nome.length < 3 || !whats) return Response.json({ error: 'Informe nome e WhatsApp válidos.' }, { status: 400 });
      if (!modelAllowedForSession(modelo, session)) return Response.json({ error: 'Modelo Equipe não está disponível na Central comercial da Dulce.' }, { status: 400 });
      if (!MODELS.some((m) => m.id === modelo)) return Response.json({ error: 'Modelo inválido.' }, { status: 400 });
      if (cor && (modelo !== 'jesus' || !['preta', 'cereja'].includes(cor))) return Response.json({ error: 'Cor inválida para este modelo.' }, { status: 400 });
      if (!SIZE_SET.has(tamanho)) return Response.json({ error: 'Tamanho inválido.' }, { status: 400 });
      if (!Number.isFinite(quantidade) || quantidade < 1 || quantidade > 10) return Response.json({ error: 'Quantidade entre 1 e 10.' }, { status: 400 });
      if (!Number.isFinite(valor) || valor < 0) return Response.json({ error: 'Valor total inválido.' }, { status: 400 });
      const itens = Array.from({ length: quantidade }, () => ({ modelo, cor: modelo === 'jesus' ? cor : '', tamanho, entregue: false }));
      const pedido = await S.EventoM31CamisaPedido.create({
        pedido_token: crypto.randomUUID(), nome, whatsapp: whats,
        ja_inscrita_m31: body.ja_inscrita === true,
        itens, itens_cobrados: itens.map((i) => ({ modelo: i.modelo, tamanho: i.tamanho, cor: i.cor })),
        quantidade, valor_total: Math.round(valor * 100) / 100,
        status_pagamento: 'checkout_pendente', origem: 'manual_painel', cobranca_estado: 'nao_iniciada',
        observacoes: `Pedido registrado no painel por ${session.operador_nome || user.email}`,
      });
      base44.asServiceRole.functions.invoke('m31AvisoCompraConfirmada', { action: 'atribuir_numero', pedido_id: pedido.id, internal_secret: config('UAZAPI_TOKEN') }).catch(() => {});
      return Response.json({ ok: true, pedido_id: pedido.id, operador: session.operador_nome || user.email });
    }

    if (body.action === 'listar_clientes') {
      const clientes = await base44.asServiceRole.entities.M31ClienteCamisa.list('-created_date', 200);
      return Response.json({ clientes: clientes || [] });
    }

    if (body.action === 'criar_cliente') {
      const S = base44.asServiceRole.entities;
      const nome = String(body.nome || '').trim();
      const whats = normalizarTelefone(body.whatsapp);
      if (nome.length < 3 || !whats) return Response.json({ error: 'Informe nome e WhatsApp válidos.' }, { status: 400 });
      const existente = (await S.M31ClienteCamisa.filter({ whatsapp: whats }, '-created_date', 1))[0];
      if (existente) return Response.json({ ok: true, ja_existia: true, cliente_id: existente.id });
      const cliente = await S.M31ClienteCamisa.create({
        nome, whatsapp: whats,
        email: String(body.email || '').trim().toLowerCase() || null,
        observacoes: String(body.observacoes || '').trim() || null,
        criado_por: session.operador_nome || user.email,
      });
      return Response.json({ ok: true, cliente_id: cliente.id });
    }

    if (body.action === 'listar_produtos') {
      const produtos = await base44.asServiceRole.entities.M31ProdutoCamisa.filter({ ativo: true }, 'nome', 200);
      return Response.json({ produtos: (produtos || []).filter((produto: any) => modelAllowedForSession(produto.modelo, session)) });
    }

    if (body.action === 'criar_produto') {
      const S = base44.asServiceRole.entities;
      const nome = String(body.nome || '').trim();
      const modelo = String(body.modelo || '');
      const cor = String(body.cor || '').toLowerCase();
      const preco = Number(body.preco);
      const tamanhos = [...new Set((Array.isArray(body.tamanhos) ? body.tamanhos : []).map((t: string) => String(t).toUpperCase()))].filter((t) => SIZE_SET.has(t));
      if (nome.length < 3 || nome.length > 120) return Response.json({ error: 'Nome entre 3 e 120 caracteres.' }, { status: 400 });
      if (!modelAllowedForSession(modelo, session)) return Response.json({ error: 'Modelo Equipe não está disponível na Central comercial da Dulce.' }, { status: 400 });
      if (!MODELS.some((m) => m.id === modelo)) return Response.json({ error: 'Modelo inválido.' }, { status: 400 });
      if (cor && (modelo !== 'jesus' || !['preta', 'cereja'].includes(cor))) return Response.json({ error: 'Cor inválida para este modelo.' }, { status: 400 });
      if (!Number.isFinite(preco) || preco < 0) return Response.json({ error: 'Preço inválido.' }, { status: 400 });
      const foto = String(body.foto_url || '').trim();
      if (foto && !/^https?:\/\//.test(foto)) return Response.json({ error: 'Foto deve ser um link http(s).' }, { status: 400 });
      const produto = await S.M31ProdutoCamisa.create({
        nome, modelo, cor, preco: Math.round(preco * 100) / 100, tamanhos,
        foto_url: foto || null, descricao: String(body.descricao || '').trim() || null, ativo: true,
      });
      return Response.json({ ok: true, produto_id: produto.id });
    }

    // RECEBER ESTOQUE — lança um recebimento e registra a compra (histórico
    // de entradas) em M31CompraCamisa. Soma à quantidade já existente.
    if (body.action === 'receber_estoque') {
      const S = base44.asServiceRole.entities;
      const itens = (Array.isArray(body.itens) ? body.itens : []).map((i: any) => ({
        modelo: String(i?.modelo || ''), cor: String(i?.cor || '').toLowerCase(),
        tamanho: String(i?.tamanho || '').toUpperCase(), quantidade: Math.floor(Number(i?.quantidade)),
      }));
      if (!itens.length) return Response.json({ error: 'Informe ao menos um item.' }, { status: 400 });
      for (const item of itens) {
        if (!modelAllowedForSession(item.modelo, session)) return Response.json({ error: 'Modelo Equipe não está disponível na Central comercial da Dulce.' }, { status: 400 });
        if (!MODELS.some((m) => m.id === item.modelo) || !SIZE_SET.has(item.tamanho) || !Number.isFinite(item.quantidade) || item.quantidade < 0) return Response.json({ error: 'Item de estoque inválido.' }, { status: 400 });
        if (item.cor && (item.modelo !== 'jesus' || !['preta', 'cereja'].includes(item.cor))) return Response.json({ error: 'Cor inválida para este modelo.' }, { status: 400 });
      }
      const now = new Date().toISOString();
      const operador = session.operador_nome || user.email;
      const E = S.EventoM31CamisaEstoque;
      for (const item of itens) {
        const candidates = await E.filter({ modelo: item.modelo, tamanho: item.tamanho }, '-created_date', 10);
        const existing = candidates.find((r: any) => String(r.cor || '') === item.cor);
        if (existing) await E.update(existing.id, { quantidade: Math.max(0, Number(existing.quantidade) || 0) + item.quantidade, atualizado_por: operador, atualizado_em: now });
        else await E.create({ modelo: item.modelo, cor: item.cor, tamanho: item.tamanho, quantidade: item.quantidade, atualizado_por: operador, atualizado_em: now });
      }
      const valorTotal = Number(body.valor_total);
      await S.M31CompraCamisa.create({
        data: now, quantidades: itens,
        valor_total: Number.isFinite(valorTotal) && valorTotal >= 0 ? valorTotal : 0,
        fornecedor: String(body.fornecedor || '').trim() || null,
        registrado_por: operador,
      });
      await S.EventoM31ActionLog.create({
        user_email: user.email, user_nome: operador, user_perfil: 'camisas',
        acao: 'Recebeu estoque de camisas', modulo: 'sistema', entidade_id: `recebimento:${now}`,
        entidade_nome: itens.map((item: any) => `${item.modelo}${item.cor ? ` ${item.cor}` : ''} ${item.tamanho} × ${item.quantidade}`).join(' / '),
        dados_novos: JSON.stringify({ itens, fornecedor: String(body.fornecedor || '').trim() || null, valor_total: valorTotal }),
      });
      return Response.json({ ok: true, itens: itens.length, operador });
    }

    // CHAT IA — consultas com dados reais da operação (somente leitura).
    if (body.action === 'chat') {
      const mensagem = String(body.mensagem || '').trim();
      if (!mensagem) return Response.json({ error: 'Mensagem vazia.' }, { status: 400 });
      const historico = (Array.isArray(body.historico) ? body.historico : []).slice(-6);
      const S = base44.asServiceRole.entities;
      const [pedidos, estoque] = await Promise.all([
        S.EventoM31CamisaPedido.list('-created_date', 20),
        S.EventoM31CamisaEstoque.list(),
      ]);
      const contexto = {
        pedidos_recentes: (pedidos || []).map((p: any) => ({
          nome: p.nome, status_pagamento: p.status_pagamento, valor_total: p.valor_total, origem: p.origem,
          itens: (p.itens || []).map((i: any) => `${i.modelo || ''}${i.cor ? ` ${i.cor}` : ''} ${i.tamanho || ''}`.trim()).join(', '),
        })),
        estoque_recebido: (estoque || []).map((e: any) => `${e.modelo}${e.cor ? ` ${e.cor}` : ''} ${e.tamanho}: ${e.quantidade}`),
        planilha_de_vendas: PLANILHA_URL,
        lojinha_publica: '/m31-camisas',
      };
      const prompt = [
        'Você é o assistente de IA da Central de Camisas (operação da Dulce). Responda em português do Brasil, em no máximo 4 linhas, de forma objetiva e acolhedora.',
        'Use SOMENTE os dados da operação fornecidos abaixo. Não invente números, status ou nomes. Se a informação não estiver nos dados, diga que não tem essa informação na operação agora.',
        'Você pode ajudar com: consultas de pedidos e pagamentos, estoque recebido, e explicar como registrar uma venda no painel (botão + Novo pedido). Não prometa ações que não pode executar.',
        'Links oficiais que pode citar: planilha de vendas e formulário público da lojinha (/m31-camisas).',
        'Histórico recente da conversa (mais recente por último):', JSON.stringify(historico),
        'Dados reais da operação agora:', JSON.stringify(contexto),
        'Pergunta da Dulce:', mensagem,
      ].join('\n');
      const result = await base44.asServiceRole.integrations.Core.InvokeLLM({ prompt });
      return Response.json({ resposta: typeof result === 'string' ? result : String(result?.response || result || '') });
    }

    if (body.action === 'configurar_pre_venda') {
      const ativo = body.ativo === true;
      const modelos = Array.isArray(body.modelos) ? [...new Set(body.modelos.filter(m => ['jesus', 'milagres', 'filhas'].includes(m)))] : [];
      const precos = [1, 2, 3].map(q => Number(body.precos?.[q]));
      const C = base44.asServiceRole.entities.EventoM31Config;
      const cfg = (await C.list('-created_date', 1))[0];
      const unitario = Number(body.preco_unitario ?? body.precos?.[1]);
      const promocional = Number(body.preco_promocional ?? (Number(body.precos?.[2]) / 2));
      const promoAte = String(body.promo_ate ?? cfg?.camisas_pre_venda_promo_ate ?? '2026-09-30');
      if (ativo && (!modelos.length || !Number.isFinite(unitario) || unitario <= 0 || !Number.isFinite(promocional) || promocional <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(promoAte) || Number.isNaN(Date.parse(`${promoAte}T00:00:00Z`)))) return Response.json({ error: 'Informe preços válidos, data limite e pelo menos um modelo.' }, { status: 400 });
      const patch = { camisas_pre_venda_ativo: ativo, camisas_pre_venda_modelos_ativos: modelos,
        camisas_pre_venda_preco_unitario: Number.isFinite(unitario) && unitario > 0 ? Math.round(unitario * 100) / 100 : cfg?.camisas_pre_venda_preco_unitario || 65,
        camisas_pre_venda_preco_promocional: Number.isFinite(promocional) && promocional > 0 ? Math.round(promocional * 100) / 100 : cfg?.camisas_pre_venda_preco_promocional || 60,
        camisas_pre_venda_promo_ate: promoAte,
        ...Object.fromEntries([1, 2, 3].map(q => [`camisas_pre_venda_preco_${q}`, Math.round((q === 1 ? (Number.isFinite(unitario) && unitario > 0 ? unitario : 65) : q * (Number.isFinite(promocional) && promocional > 0 ? promocional : 60)) * 100) / 100])) };
      if (cfg) await C.update(cfg.id, patch); else await C.create(patch);
      return Response.json({ ok: true, operador: session.operador_nome || user.email });
    }

    if (body.action === 'configurar_venda') {
      const ativo = body.ativo === true;
      const preco = Number(body.preco);
      const modelos = Array.isArray(body.modelos) ? body.modelos.filter((m: string) => MODELS.some((model) => model.id === m)) : [];
      if (ativo && (!Number.isFinite(preco) || preco <= 0 || modelos.length === 0)) {
        return Response.json({ error: 'shirt_sale_config_invalid' }, { status: 400 });
      }
      const C = base44.asServiceRole.entities.EventoM31Config;
      const cfg = (await C.list('-created_date', 1))[0];
      const patch = {
        camisas_order_bump_ativo: ativo,
        camisas_preco_promocional: Number.isFinite(preco) && preco >= 0 ? preco : 0,
        camisas_modelos_ativos: modelos,
      };
      if (cfg) await C.update(cfg.id, patch); else await C.create(patch);
      return Response.json({ ok: true, ...patch, operador: session.operador_nome || user.email });
    }

    if (['ajustar_tamanho', 'ajustar_item', 'confirmar_entrega'].includes(body.action)) {
      const pedidoMatch = /^pedido:([^:]+):(\d+)$/.exec(String(body.row_id || ''));
      if (pedidoMatch) {
        const pedido = await base44.asServiceRole.entities.EventoM31CamisaPedido.get(pedidoMatch[1]);
        if (!pedido) return Response.json({ error: 'shirt_order_not_found' }, { status: 404 });
        const itemIndex = Number(pedidoMatch[2]);
        const itens = Array.isArray(pedido.itens) ? [...pedido.itens] : [];
        if (!itens[itemIndex]) return Response.json({ error: 'shirt_item_not_found' }, { status: 404 });
        if (body.action === 'ajustar_tamanho' || body.action === 'ajustar_item') {
          const tamanho = String(body.tamanho || itens[itemIndex].tamanho || '').toUpperCase();
          if (!SIZE_SET.has(tamanho)) return Response.json({ error: 'invalid_shirt_size' }, { status: 400 });
          if (pedido.status_pagamento !== 'pago') return Response.json({ error: 'Pedido ainda não pago: revisar a seleção com a compradora antes de alterar.' }, { status: 409 });

          const anterior = { ...itens[itemIndex] };
          let proximo = { ...itens[itemIndex], tamanho };
        if (body.action === 'ajustar_item') {
            const modelo = String(body.modelo || anterior.modelo || '').toLowerCase();
            const cor = String(body.cor ?? anterior.cor ?? '').toLowerCase();
            if (!modelAllowedForSession(modelo, session)) return Response.json({ error: 'Modelo Equipe não está disponível na Central comercial da Dulce.' }, { status: 400 });
            if (!MODELS.some((m) => m.id === modelo)) return Response.json({ error: 'invalid_shirt_model' }, { status: 400 });
            if (cor && (!['preta', 'cereja'].includes(cor) || modelo !== 'jesus')) return Response.json({ error: 'invalid_shirt_color' }, { status: 400 });
            proximo = { ...proximo, modelo, cor };
          }
          if (JSON.stringify(anterior) === JSON.stringify(proximo)) return Response.json({ ok: true, noop: true, row_id: body.row_id });
          itens[itemIndex] = proximo;
          await base44.asServiceRole.entities.EventoM31ActionLog.create({
            user_email: user.email,
            user_nome: session.operador_nome || user.email,
            user_perfil: 'camisas',
            acao: body.action === 'ajustar_item' ? 'Alterou item de camisa de pedido pago' : 'Alterou tamanho de camisa de pedido pago',
            modulo: 'sistema',
            entidade_id: pedido.id,
            entidade_nome: pedido.nome || pedido.whatsapp || pedido.id,
            dados_anteriores: JSON.stringify({ row_id: body.row_id, item: anterior, novo_item: proximo }),
          });
        } else {
          if (pedido.status_pagamento !== 'pago') return Response.json({ error: 'payment_not_confirmed' }, { status: 409 });
          if (itens[itemIndex].entregue === true) return Response.json({ ok: true, noop: true, row_id: body.row_id });
          itens[itemIndex] = { ...itens[itemIndex], entregue: true, entregue_em: new Date().toISOString(), entregue_por: session.operador_nome || user.email };
        }
        await base44.asServiceRole.entities.EventoM31CamisaPedido.update(pedido.id, { itens });
        return Response.json({ ok: true, row_id: body.row_id, action: body.action, operador: session.operador_nome || user.email });
      }
    }

    let accessToken = '';
    let sheetsWarning: string | null = null;
    if (body.action === 'listar' || body.action === 'exportar_planilha' || String(body.row_id || '').startsWith('sheet:')) {
      try { ({ accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive')); }
      catch { if (body.action !== 'listar') throw new Error('google_sheets_unavailable'); sheetsWarning = 'Planilha indisponível. As vendas legadas não estão incluídas neste resumo.'; }
    }

    // EXPORTAR PEDIDOS PARA A PLANILHA — reflexo/backup das vendas do app.
    // Reescreve a aba APP_PEDIDOS a cada exportação; o app continua sendo a
    // fonte de verdade das vendas novas.
    if (body.action === 'exportar_planilha') {
      const meta = await sheetsRequest(accessToken, '?fields=sheets.properties');
      const titles = (meta.sheets || []).map((s: any) => s.properties.title);
      if (!titles.includes('PEDIDOS')) {
        await sheetsRequest(accessToken, ':batchUpdate', { method: 'POST', body: JSON.stringify({ requests: [{ addSheet: { properties: { title: 'PEDIDOS' } } }] }) });
      }
      const pedidosExport = await base44.asServiceRole.entities.EventoM31CamisaPedido.list('-created_date', 500);
      const header = ['id', 'data_pedido', 'nome', 'whatsapp', 'inscrita_m31', 'itens', 'quantidade', 'valor_total', 'status_pagamento', 'pago_em', 'confirmado_por', 'entregues', 'origem'];
      const values = [header, ...(pedidosExport || []).map((p: any) => {
        const itens = p.itens_cobrados || p.itens || [];
        return [
          p.id, p.created_date || '', p.nome || '', p.whatsapp || '',
          p.ja_inscrita_m31 == null ? '' : (p.ja_inscrita_m31 ? 'sim' : 'nao'),
          itens.map((i: any) => `${i.modelo || ''}${i.cor ? ` ${i.cor}` : ''} ${i.tamanho || ''}`.trim()).join(' | '),
          p.quantidade ?? itens.length, p.valor_total ?? 0, p.status_pagamento || '',
          p.pagamento_confirmado_em || '', p.pagamento_confirmado_por || '',
          itens.filter((i: any) => i.entregue).length, p.origem || '',
        ];
      })];
      await sheetsRequest(accessToken, `/values/${encodeURIComponent('PEDIDOS!A2:M501')}:clear`, { method: 'POST' });
      await sheetsRequest(accessToken, `/values/${encodeURIComponent('PEDIDOS!A2')}?valueInputOption=USER_ENTERED`, { method: 'PUT', body: JSON.stringify({ range: 'PEDIDOS!A2', majorDimension: 'ROWS', values: values.slice(1) }) });
      return Response.json({ ok: true, exportados: (pedidosExport || []).length, planilha_url: PLANILHA_URL, operador: session.operador_nome || user.email });
    }

    if (['ajustar_tamanho', 'ajustar_item', 'confirmar_entrega'].includes(body.action)) {
      const inscriptionMatch = /^inscricao:([^:]+):(\d+)$/.exec(String(body.row_id || ''));
      if (inscriptionMatch) {
        const inscricao = await base44.asServiceRole.entities.EventoM31Inscricao.get(inscriptionMatch[1]);
        if (!inscricao) return Response.json({ error: 'shirt_row_not_found' }, { status: 404 });
        const rows = buildOperationalShirtRows({ inscricoes: [inscricao], voluntarios: [], bucketById: {} });
        const row = rows.find((item: any) => item.row_id === body.row_id);
        if (!row) return Response.json({ error: 'shirt_row_not_found' }, { status: 404 });
        const modelo = String(body.modelo || row.modelo || '').toLowerCase();
        if (!modelAllowedForSession(modelo, session)) return Response.json({ error: 'invalid_shirt_model' }, { status: 400 });
        const patch = buildShirtRecordPatch({ row, record: inscricao, action: body.action, tamanho: String(body.tamanho || row.tamanho || '').toUpperCase(), modelo, cor: String(body.cor ?? row.cor ?? '').toLowerCase(), operatorName: session.operador_nome || user.email });
        if (patch.noop) return Response.json({ ok: true, noop: true, row_id: body.row_id });
        await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, patch);
        await base44.asServiceRole.entities.EventoM31ActionLog.create({ user_email: user.email, user_nome: session.operador_nome || user.email, user_perfil: 'camisas', acao: 'Atualizou camisa da inscrição', modulo: 'sistema', entidade_id: inscricao.id, entidade_nome: inscricao.nome || inscricao.id, dados_anteriores: JSON.stringify({ row_id: body.row_id, item: inscricao.camisas?.[row.item_index] || { modelo: row.modelo, tamanho: row.tamanho } }), dados_novos: JSON.stringify(patch) });
        return Response.json({ ok: true, row_id: body.row_id, action: body.action, operador: session.operador_nome || user.email });
      }

      const match = /^sheet:(vol|sale):(\d+)$/.exec(String(body.row_id || ''));
      if (!match) return Response.json({ error: 'shirt_row_invalid' }, { status: 400 });
      const row = Number(match[2]); const isVolunteer = match[1] === 'vol';
      if (isVolunteer || row < 2) return Response.json({ error: 'legacy_item_edit_unsupported' }, { status: 400 });
      if (body.action === 'ajustar_item') {
        if (isVolunteer) return Response.json({ error: 'legacy_item_edit_unsupported' }, { status: 409 });
        const current = await sheetsRequest(accessToken, `/values/${encodeURIComponent(`VENDAS!A${row}:F${row}`)}`);
        const values = current.values?.[0] || [];
        if (!truthy(values[4])) return Response.json({ error: 'Pedido ainda não pago: revisar a seleção com a compradora antes de alterar.' }, { status: 409 });
        const modelo = String(body.modelo || '').toLowerCase();
        const cor = String(body.cor || '').toLowerCase();
        const tamanho = String(body.tamanho || '').toUpperCase();
        if (!modelAllowedForSession(modelo, session) || !MODELS.some((item) => item.id === modelo) || (cor && (modelo !== 'jesus' || !['preta', 'cereja'].includes(cor))) || !SIZE_SET.has(tamanho)) return Response.json({ error: 'invalid_shirt_item' }, { status: 400 });
        const valorModelo = `${modelo}${modelo === 'jesus' && cor ? ` ${cor}` : ''}`;
        await sheetsRequest(accessToken, `/values/${encodeURIComponent(`VENDAS!B${row}`)}?valueInputOption=USER_ENTERED`, { method: 'PUT', body: JSON.stringify({ range: `VENDAS!B${row}`, majorDimension: 'ROWS', values: [[valorModelo]] }) });
        await sheetsRequest(accessToken, `/values/${encodeURIComponent(`VENDAS!C${row}`)}?valueInputOption=USER_ENTERED`, { method: 'PUT', body: JSON.stringify({ range: `VENDAS!C${row}`, majorDimension: 'ROWS', values: [[tamanho]] }) });
        await base44.asServiceRole.entities.EventoM31ActionLog.create({ user_email: user.email, user_nome: session.operador_nome || user.email, user_perfil: 'camisas', acao: 'Editou item do pedido legado', modulo: 'sistema', entidade_id: `sheet:sale:${row}`, entidade_nome: values[0] || `Vendas ${row}`, dados_anteriores: JSON.stringify({ modelo: values[1] || '', tamanho: values[2] || '' }), dados_novos: JSON.stringify({ modelo, cor, tamanho }) });
        return Response.json({ ok: true, row_id: body.row_id, action: body.action, operador: session.operador_nome });
      }
      let column = isVolunteer ? 'C' : 'C'; let value: unknown = body.tamanho;
      if (body.action === 'ajustar_tamanho' && !SIZE_SET.has(String(value || '').toUpperCase())) return Response.json({ error: 'invalid_shirt_size' }, { status: 400 });
      if (body.action === 'confirmar_entrega') {
        const paidRange = isVolunteer ? `D${row}:G${row}` : `E${row}:E${row}`;
        const paid = await sheetsRequest(accessToken, `/values/${encodeURIComponent(`VENDAS!${paidRange}`)}`);
        const paidValues = paid.values?.[0] || [];
        const paymentConfirmed = isVolunteer ? truthy(paidValues[0]) || truthy(paidValues[3]) : truthy(paidValues[0]);
        if (!paymentConfirmed) return Response.json({ error: 'payment_not_confirmed' }, { status: 409 });
        column = isVolunteer ? 'E' : 'F'; value = true;
      }
      await sheetsRequest(accessToken, `/values/${encodeURIComponent(`VENDAS!${column}${row}`)}?valueInputOption=USER_ENTERED`, { method: 'PUT', body: JSON.stringify({ range: `VENDAS!${column}${row}`, majorDimension: 'ROWS', values: [[value]] }) });
      return Response.json({ ok: true, row_id: body.row_id, action: body.action, operador: session.operador_nome });
    }

    // AJUSTAR ESTOQUE — lançamento de recebimento por modelo/cor/tamanho.
    if (body.action === 'ajustar_estoque') {
      const modelo = String(body.modelo || '');
      const tamanho = String(body.tamanho || '').toUpperCase();
      const cor = String(body.cor || '').toLowerCase();
      const quantidade = Number(body.quantidade);
      if (!modelAllowedForSession(modelo, session)) return Response.json({ error: 'Modelo Equipe não está disponível na Central comercial da Dulce.' }, { status: 400 });
      if (!MODELS.some((model) => model.id === modelo) || !SIZE_SET.has(tamanho) || !Number.isFinite(quantidade) || quantidade < 0) return Response.json({ error: 'estoque_invalid' }, { status: 400 });
      if (cor && (!['preta', 'cereja'].includes(cor) || modelo !== 'jesus')) return Response.json({ error: 'estoque_cor_invalid' }, { status: 400 });
      const now = new Date().toISOString();
      const S = base44.asServiceRole.entities.EventoM31CamisaEstoque;
      const candidates = await S.filter({ modelo, tamanho }, '-created_date', 10);
      const existing = candidates.find((r: any) => String(r.cor || '') === cor);
      const anterior = existing ? Math.max(0, Number(existing.quantidade) || 0) : 0;
      const novaQuantidade = Math.floor(quantidade);
      if (existing) await S.update(existing.id, { quantidade: novaQuantidade, atualizado_por: session.operador_nome || user.email, atualizado_em: now });
      else await S.create({ modelo, cor, tamanho, quantidade: novaQuantidade, atualizado_por: session.operador_nome || user.email, atualizado_em: now });
      await base44.asServiceRole.entities.EventoM31ActionLog.create({
        user_email: user.email,
        user_nome: session.operador_nome || user.email,
        user_perfil: 'camisas',
        acao: 'Ajustou estoque físico de camisa',
        modulo: 'sistema',
        entidade_id: existing?.id || `estoque:${modelo}:${cor}:${tamanho}`,
        entidade_nome: [modelo, cor, tamanho].filter(Boolean).join(' · '),
        dados_anteriores: JSON.stringify({ anterior, novo: novaQuantidade, motivo: String(body.motivo || '').trim() || null }),
      });
      return Response.json({ ok: true, modelo, cor, tamanho, quantidade: novaQuantidade, anterior, operador: session.operador_nome });
    }

    const ranges = ['VENDAS!A2:F'];
    let data: any = {};
    if (accessToken) {
      try { data = await sheetsRequest(accessToken, `/values:batchGet?${ranges.map((range) => `ranges=${encodeURIComponent(range)}`).join('&')}`); }
      catch { sheetsWarning = 'Planilha indisponível. As vendas legadas não estão incluídas neste resumo.'; }
    }
    const [sales = []] = (data.valueRanges || []).map((range: any) => range.values || []);
    const estoqueRows = await base44.asServiceRole.entities.EventoM31CamisaEstoque.list();
    const estoqueByKey: Record<string, number> = {};
    let recebidas = 0;
    for (const row of estoqueRows || []) {
      estoqueByKey[`${row.modelo}:${String(row.cor ?? '')}:${row.tamanho}`] = Number(row.quantidade) || 0;
      recebidas += Math.max(0, Number(row.quantidade) || 0);
    }
    const sheetRows = buildRows(sales);
    const inscricoesCamisa = await base44.asServiceRole.entities.EventoM31Inscricao.filter({ comprou_camisa: true }, '-created_date', 500);
    const appRows = buildOperationalShirtRows({ inscricoes: inscricoesCamisa || [], voluntarios: [], bucketById: {} });
    const pedidosCamisa = await base44.asServiceRole.entities.EventoM31CamisaPedido.list('-created_date', 500);
    const pedidoRows = buildPedidoRows(pedidosCamisa || []);
    const rows = [...sheetRows, ...appRows, ...pedidoRows].filter((row) => modelAllowedForSession(row.modelo, session)).sort((a, b) => Number(a.entregue) - Number(b.entregue) || Number(a.pagamento_status === 'pago') - Number(b.pagamento_status === 'pago') || a.nome.localeCompare(b.nome, 'pt-BR'));
    const movimentosEstoque = (await base44.asServiceRole.entities.EventoM31ActionLog.filter({ modulo: 'sistema' }, '-created_date', 100))
      .filter((item: any) => String(item.acao || '').toLowerCase().includes('estoque'))
      .slice(0, 12);
    const cfg = (await base44.asServiceRole.entities.EventoM31Config.list('-created_date', 1))[0] || {};
    return Response.json({
      rows,
      summary: summary(rows, pedidoRows, recebidas),
      grade_producao: gradeProducao(rows),
      inventory: inventory(rows, estoqueByKey),
      movimentos_estoque: movimentosEstoque,
      planilha_url: PLANILHA_URL,
      synced_at: new Date().toISOString(),
      sync_source: sheetsWarning ? 'Base44 (planilha indisponível)' : 'Google Sheets + Base44',
      warning: sheetsWarning,
      pre_venda: { ativo: cfg.camisas_pre_venda_ativo === true, modelos: cfg.camisas_pre_venda_modelos_ativos || [], preco_unitario: Number(cfg.camisas_pre_venda_preco_unitario || cfg.camisas_pre_venda_preco_1) || 65, preco_promocional: Number(cfg.camisas_pre_venda_preco_promocional) || Number(cfg.camisas_pre_venda_preco_2) / 2 || 60, promo_ate: cfg.camisas_pre_venda_promo_ate || '2026-09-30' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'shirts_operational_failed';
    const status = message.includes('session') || message.includes('scope') ? 403 : message === 'payment_not_confirmed' ? 409 : message.startsWith('invalid_shirt_') ? 400 : 500;
    return Response.json({ error: message }, { status });
  }
})(req);

}
