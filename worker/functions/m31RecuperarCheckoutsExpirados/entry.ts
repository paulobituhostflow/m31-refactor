// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31RecuperarCheckoutsExpirados — Recuperação GLOBAL (sem limite de 72h)
 *
 * Diferenciais vs m31AuditarRecuperar72h:
 *   - Sem janela de tempo: varre TODAS as inscrições.
 *   - Foco: caravanas (30 já identificadas) + normais com checkout pendente/abandonado/
 *     expirado/sem pagamento + registros criados durante o bug do customer (caravana).
 *   - Encerra DEFINITIVAMENTE o ciclo antigo: recovery_attempts = 99.
 *   - Não gera cobrança para SEM_VINCULO sem inscrição existente e identificada.
 *   - Gera somente 1 (um) novo checkout por inscrição.
 *   - Envia apenas 1 (uma) mensagem de recuperação (nova versão de idempotência).
 *   - Salva novo checkout_id, link, validade e externalReference.
 *   - Registra envio, falha e resposta no histórico (M31InscricaoTimeline).
 *   - Audita erros 500 sem inscrição salva: logs de webhook, audit logs, DLQ e
 *     payloads de erro. NÃO declara "ninguém afetado" só porque não está no banco.
 *
 * Saída: duas listas separadas:
 *   - recuperaveis:   possuem nome + (telefone ou e-mail).
 *   - nao_recuperaveis: nenhum dado de contato preservado.
 *
 * Payload: { dry_run?: boolean, auto_aprovar_fila?: boolean, max_inscricoes?: number }
 */

const STATUS_ALVO = ['checkout_pendente', 'checkout_abandonado', 'pendente'];
const STATUS_CONFIRMADO_AS = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'DUNNING_RECEIVED'];
const STATUS_PENDENTE_AS = ['PENDING'];
const STATUS_EXPIRADO_AS = ['EXPIRED', 'CANCELED', 'OVERDUE', 'DELETED', 'REFUNDED'];
const VERSAO_RECUPERACAO = 'V2'; // nova versão — encerra ciclo antigo (V1)
const AUTOMACAO = 'RECUPERACAO_CHECKOUT_EXPIRADO';

function normalizePhone(phone: string): string {
  let d = (phone || '').replace(/\D/g, '');
  while (d.startsWith('5555')) d = d.slice(2);
  if (d.startsWith('55') && d.length >= 12) return d;
  if (d.length >= 10) return `55${d}`;
  return d;
}

function extrairCheckoutIdDaUrl(url: string): string | null {
  if (!url) return null;
  const match = url.match(/checkoutSession\/show\/([a-f0-9-]+)/i);
  return match ? match[1] : null;
}

async function fetchAsaas(url: string, options: any = {}, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err: any) {
    if (err?.name === 'AbortError') throw new Error(`Timeout Asaas: ${timeoutMs / 1000}s`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Consulta Asaas por 6 chaves em cascata: payment_id → checkout_id → CPF → externalReference → email → telefone. */
async function consultarAsaasMulti(insc: any, ASAAS_KEY: string) {
  const r: any = { status: null, payment_id: null, checkout_id: null, link: null, fonte: null, customer_id: null };

  if (insc.asaas_payment_id) {
    try {
      const resp = await fetchAsaas(`__ASAAS_API__/payments/${insc.asaas_payment_id}`, { headers: { 'access_token': ASAAS_KEY } });
      if (resp.status === 200) {
        const pay = await resp.json();
        r.status = pay.status; r.payment_id = pay.id; r.fonte = 'payment_id';
        if (pay.checkout) r.checkout_id = pay.checkout;
        return r;
      }
    } catch {}
  }

  const checkoutId = insc.asaas_checkout_id || extrairCheckoutIdDaUrl(insc.asaas_charge_url);
  if (checkoutId) {
    try {
      const resp = await fetchAsaas(`__ASAAS_API__/checkouts/${checkoutId}`, { headers: { 'access_token': ASAAS_KEY } });
      if (resp.status === 200) {
        const c = await resp.json();
        r.status = c.status; r.checkout_id = c.id; r.link = c.link; r.fonte = 'checkout_id';
        return r;
      }
    } catch {}
  }

  if (insc.cpf) {
    try {
      const resp = await fetchAsaas(`__ASAAS_API__/payments?cpfCnpj=${encodeURIComponent(insc.cpf)}&limit=10`, { headers: { 'access_token': ASAAS_KEY } });
      const data = await resp.json();
      if (data?.data?.length) {
        const conf = data.data.find((p: any) => STATUS_CONFIRMADO_AS.includes(p.status));
        const esc = conf || data.data[0];
        r.status = esc.status; r.payment_id = esc.id; r.checkout_id = esc.checkout || null; r.fonte = 'cpf';
        if (esc.customer) r.customer_id = esc.customer;
        return r;
      }
    } catch {}
  }

  if (insc.codigo_inscricao) {
    try {
      const resp = await fetchAsaas(`__ASAAS_API__/payments?externalReference=${encodeURIComponent(insc.codigo_inscricao)}&limit=5`, { headers: { 'access_token': ASAAS_KEY } });
      const data = await resp.json();
      if (data?.data?.length) {
        const conf = data.data.find((p: any) => STATUS_CONFIRMADO_AS.includes(p.status));
        const esc = conf || data.data[0];
        r.status = esc.status; r.payment_id = esc.id; r.fonte = 'external_reference';
        return r;
      }
    } catch {}
  }

  if (insc.email) {
    try {
      const resp = await fetchAsaas(`__ASAAS_API__/customers?email=${encodeURIComponent(insc.email)}&limit=3`, { headers: { 'access_token': ASAAS_KEY } });
      const data = await resp.json();
      if (data?.data?.length) {
        const cid = data.data[0].id;
        const pr = await fetchAsaas(`__ASAAS_API__/payments?customer=${cid}&limit=5`, { headers: { 'access_token': ASAAS_KEY } });
        const pd = await pr.json();
        if (pd?.data?.length) {
          const conf = pd.data.find((p: any) => STATUS_CONFIRMADO_AS.includes(p.status));
          const esc = conf || pd.data[0];
          r.status = esc.status; r.payment_id = esc.id; r.fonte = 'email';
          return r;
        }
      }
    } catch {}
  }

  if (insc.whatsapp) {
    const phone = normalizePhone(insc.whatsapp);
    try {
      const resp = await fetchAsaas(`__ASAAS_API__/customers?mobilePhone=${encodeURIComponent(phone)}&limit=3`, { headers: { 'access_token': ASAAS_KEY } });
      const data = await resp.json();
      if (data?.data?.length) {
        const cid = data.data[0].id;
        const pr = await fetchAsaas(`__ASAAS_API__/payments?customer=${cid}&limit=5`, { headers: { 'access_token': ASAAS_KEY } });
        const pd = await pr.json();
        if (pd?.data?.length) {
          const conf = pd.data.find((p: any) => STATUS_CONFIRMADO_AS.includes(p.status));
          const esc = conf || pd.data[0];
          r.status = esc.status; r.payment_id = esc.id; r.fonte = 'telefone';
          return r;
        }
      }
    } catch {}
  }

  return r;
}

async function criarNovoCheckout(insc: any, ASAAS_KEY: string): Promise<{ id: string; link: string; status: string; validade: string } | null> {
  const valor = insc.valor_pago || (insc.tipo === 'caravana' ? 97 : 129);
  const externalRef = insc.codigo_inscricao || `M31-REC-${Date.now().toString(36).toUpperCase()}`;
  const ehCaravana = insc.tipo === 'caravana';
  const minutosValidade = 1440;

  const payload: any = {
    billingTypes: ['PIX', 'CREDIT_CARD'],
    chargeTypes: ['DETACHED', 'INSTALLMENT'],
    installment: { maxInstallmentCount: 5 },
    minutesToExpire: minutosValidade,
    externalReference: externalRef,
    callback: {
      successUrl: '__APP_ORIGIN__/obrigado',
      cancelUrl: ehCaravana ? '__APP_ORIGIN__/m31-caravana' : '__APP_ORIGIN__/m31-inscricao',
      expiredUrl: ehCaravana ? '__APP_ORIGIN__/m31-caravana' : '__APP_ORIGIN__/m31-inscricao',
    },
    items: [{
      name: ehCaravana ? 'M31 Filhas - Caravana' : 'M31 Filhas - Inscricao',
      description: ehCaravana ? `M31 Filhas - Caravana - ${insc.nome}` : `M31 Filhas - ${insc.nome}`,
      value: valor, quantity: 1,
    }],
  };

  // Caravana: NÃO envia customer (fix do bug "O campo customer informado é inválido").
  if (!ehCaravana) {
    payload.customer = {
      name: insc.nome,
      email: insc.email,
      cpfCnpj: insc.cpf || undefined,
      mobilePhone: normalizePhone(insc.whatsapp),
    };
  }

  try {
    const resp = await fetchAsaas('__ASAAS_API__/checkouts', {
      method: 'POST',
      headers: { 'access_token': ASAAS_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const checkout = await resp.json();
    if (!checkout.link) return null;
    const validade = new Date(Date.now() + minutosValidade * 60 * 1000).toISOString();
    return { id: checkout.id, link: checkout.link, status: checkout.status || 'ACTIVE', validade };
  } catch (e) {
    return null;
  }
}

async function validarNomesFemininos(base44: any, nomes: string[]): Promise<Record<string, string>> {
  if (!nomes.length) return {};
  try {
    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `Você é um classificador de nomes brasileiros para um evento EXCLUSIVO PARA MULHERES (M31 Filhas — imersão feminina cristã).
Para cada nome, classifique em "feminino", "masculino" ou "incerto". Seja CONSERVADOR: na dúvida, "incerto".
Nomes: ${JSON.stringify(nomes)}
Retorne JSON { "classificacoes": [{ "nome": "...", "classificacao": "..." }] }.`,
      response_json_schema: {
        type: 'object',
        properties: {
          classificacoes: { type: 'array', items: { type: 'object', properties: {
            nome: { type: 'string' }, classificacao: { type: 'string', enum: ['feminino', 'masculino', 'incerto'] },
          } } },
        },
      },
    });
    const mapa: Record<string, string> = {};
    for (const c of (res?.classificacoes || [])) mapa[c.nome] = c.classificacao;
    return mapa;
  } catch { return {}; }
}

/** Idempotência da NOVA versão (V2) — independente do ciclo antigo (V1). */
async function checarIdempotenciaNovoCiclo(base44: any, participante_id: string) {
  const S = base44.asServiceRole.entities;
  const logs = await S.M31AutomacaoLog.filter(
    { participante_id, automacao: 'RECUPERACAO_CHECKOUT', versao: VERSAO_RECUPERACAO, status: 'enviado' },
    '-enviado_em', 5
  ).catch(() => []);
  if (logs.length > 0) {
    return { pode: false, motivo: 'ja_recuperado_novo_ciclo', contatos: logs.length };
  }
  return { pode: true, contatos: 0 };
}

function janelaWhatsAppAtiva() {
  const recife = new Date(Date.now() - 3 * 3600000);
  const h = recife.getUTCHours();
  if (h < 8 || h >= 20) return { ativa: false, motivo: 'fora_janela_08_20' };
  return { ativa: true };
}

function mensagemRecuperacao(tipo: string, primeiroNome: string, link: string, caravanaNome?: string): string {
  const nome = primeiroNome || 'querida';
  if (tipo === 'caravana') {
    // AUDITORIA: mensagem de caravana SÓ para inscrições tipo=caravana COM nome da caravana identificado.
    // Sem caravana_nome = dado faltante no formulário específico — mensagem genérica de inscrição (não menciona caravana).
    if (caravanaNome) {
      return `Oi, ${nome}! Tudo bem? 💛\n\nPercebemos que houve uma instabilidade na tentativa de inscrição da caravana *${caravanaNome}*, mas já corrigimos. Seu link está disponível aqui:\n\n${link}\n\nCaso já tenha pago, nos avise por aqui para conferirmos direitinho.`;
    }
    // Fallback seguro: tipo=caravana mas sem nome identificado — não afirma "caravana" sem saber qual.
    return `Oi, ${nome}! Tudo bem? 💛\n\nPercebemos que houve uma instabilidade na tentativa da sua inscrição, mas já corrigimos. Seu link está disponível aqui:\n\n${link}\n\nCaso já tenha pago, nos avise por aqui para conferirmos direitinho.`;
  }
  return `Oi, ${nome}! Tudo bem? 💛\n\nPercebemos que houve uma instabilidade na tentativa da sua inscrição, mas já corrigimos. Seu link está disponível aqui:\n\n${link}\n\nCaso já tenha pago, nos avise por aqui para conferirmos direitinho.`;
}

async function enviarEmailRecuperacao(insc: any, link: string, BREVO_KEY: string) {
  try {
    const primeiroNome = insc.nome?.split(' ')[0] || 'querida';
    const html = `<div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="color:#8B1A2B;margin-bottom:16px">Oi ${primeiroNome}! 🌸</h2>
      <p style="color:#2A1F1F;font-size:15px;line-height:1.6">Notamos que sua inscrição no M31 Filhas ainda não foi finalizada. Seu link de pagamento está pronto:</p>
      <div style="text-align:center;margin:24px 0"><a href="${link}" style="background:#8B1A2B;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Finalizar Inscrição</a></div>
      <p style="color:#6B5E5E;font-size:13px;line-height:1.5">Ou copie o link: ${link}<br><br>Qualquer dúvida, respondemos por aqui! 🙏<br><br>Equipe M31 Filhas</p></div>`;
    const resp = await fetch('__BREVO_API__/smtp/email', {
      method: 'POST',
      headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'M31 Filhas', email: 'contato@inscricoes.m31filhas.com.br' },
        to: [{ email: insc.email, name: insc.nome }],
        subject: 'Sua inscrição no M31 Filhas está quase pronta! 🌸',
        htmlContent: html,
      }),
    });
    if (resp.status >= 400) return { sucesso: false, erro: `Brevo ${resp.status}: ${(await resp.text()).substring(0, 200)}` };
    return { sucesso: true };
  } catch (e: any) { return { sucesso: false, erro: e.message }; }
}

/** Caminho rápido: apenas 1 chamada Asaas por CPF. Para registros do ciclo antigo. */
async function consultarAsaasCpfApenas(insc: any, ASAAS_KEY: string) {
  const r: any = { status: null, payment_id: null, checkout_id: null, link: null, fonte: null };
  if (!insc.cpf) return r;
  try {
    const resp = await fetchAsaas(`__ASAAS_API__/payments?cpfCnpj=${encodeURIComponent(insc.cpf)}&limit=5`, { headers: { 'access_token': ASAAS_KEY } });
    const data = await resp.json();
    if (data?.data?.length) {
      const conf = data.data.find((p: any) => STATUS_CONFIRMADO_AS.includes(p.status));
      const esc = conf || data.data[0];
      r.status = esc.status; r.payment_id = esc.id; r.checkout_id = esc.checkout || null; r.fonte = 'cpf';
    }
  } catch {}
  return r;
}

/** Extrai dados de contato de um payload de erro (webhook/DLQ/audit) para classificar recuperáveis. */
function extrairContatoDePayload(payload: any): { nome?: string; telefone?: string; email?: string; cpf?: string } {
  if (!payload) return {};
  const p = typeof payload === 'string' ? (() => { try { return JSON.parse(payload); } catch { return {}; } })() : payload;
  const pagamento = p?.payment || p?.data?.payment || p;
  const customer = pagamento?.customer || p?.customer;
  const nome = customer?.name || pagamento?.name || p?.name || p?.inscricao_nome || null;
  const email = customer?.email || pagamento?.email || p?.email || null;
  const cpf = customer?.cpfCnpj || pagamento?.cpfCnpj || p?.cpf || null;
  let telefone = customer?.mobilePhone || customer?.phone || pagamento?.mobilePhone || p?.whatsapp || p?.telefone || null;
  if (telefone && !telefone.startsWith('55')) telefone = normalizePhone(telefone);
  return { nome: nome || undefined, telefone: telefone || undefined, email: email || undefined, cpf: cpf || undefined };
}

function temContato(c: any): boolean {
  return !!(c && c.nome && (c.telefone || c.email));
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    try {
      const user = await base44.auth.me();
      if (user && user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    } catch { /* automação */ }

    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dry_run !== false;
    const autoAprovarFila = body?.auto_aprovar_fila === true;
    const maxInscricoes = body?.max_inscricoes || 80;

    const S = base44.asServiceRole.entities;
    const ASAAS_KEY = config('ASAAS_API_KEY');
    const BREVO_KEY = config('BREVO_API_KEY');

    // ═══ 1. BUSCAR TODAS AS INSCRIÇÕES ALVO (sem limite de tempo) ═══
    const inscricoes: any[] = [];
    for (const status of STATUS_ALVO) {
      const batch = await S.EventoM31Inscricao.filter({ status_pagamento: status }, '-created_date', 800);
      inscricoes.push(...batch);
    }
    // Incluir também asaas_checkout_status EXPIRED/CANCELED mesmo se status_pagamento não estiver nos alvos
    const expiradosPorStatus = await S.EventoM31Inscricao.filter(
      { asaas_checkout_status: 'EXPIRED' }, '-created_date', 300
    ).catch(() => []);
    const canceladosPorStatus = await S.EventoM31Inscricao.filter(
      { asaas_checkout_status: 'CANCELED' }, '-created_date', 300
    ).catch(() => []);
    inscricoes.push(...expiradosPorStatus, ...canceladosPorStatus);

    // Dedup por id
    const porId = new Map<string, any>();
    for (const i of inscricoes) if (i && i.id) porId.set(i.id, i);

    const candidatas = [...porId.values()]
      .filter(i => !['aprovado', 'cancelado', 'gratuito'].includes(i.status_pagamento))
      // NÃO excluir opt_out para registros do ciclo antigo (recovery_attempts >= 99):
      // o opt_out foi setado pelo ciclo antigo como forma de "encerrar a régua", não
      // foi pedido real da participante. Registros frescos (recovery < 99) com opt_out
      // genuíno continuam excluídos. A idempotência V2 previne reenvios.
      .filter(i => !i.opt_out || (i.recovery_attempts || 0) >= 99)
      .filter(i => !i.cadastro_pendente)
      .slice(0, maxInscricoes);

    // ═══ 2. EXCLUIR DUPLICADAS (mesmo CPF com outra inscrição ATIVA/aprovada) ═══
    const cpfSet = new Set<string>();
    const todasAtivas = await S.EventoM31Inscricao.filter({}, '-created_date', 2000).catch(() => []);
    for (const insc of candidatas) {
      if (insc.cpf) {
        const dup = todasAtivas.find(o =>
          o.id !== insc.id && o.cpf === insc.cpf &&
          ['aprovado', 'checkout_pendente'].includes(o.status_pagamento)
        );
        if (dup) cpfSet.add(insc.id);
      }
    }
    const auditaveis = candidatas.filter(i => !cpfSet.has(i.id));

    // ═══ 3. VALIDAR NOMES (imersão feminina) ═══
    const nomesUnicos = [...new Set(auditaveis.map(i => i.nome).filter(Boolean))];
    const nomesValidados = await validarNomesFemininos(base44, nomesUnicos);

    // ═══ 4. CONSULTAR ASAAS + CLASSIFICAR ═══
    const detalhes: any[] = [];
    const confirmados: any[] = [];
    const pendentes: any[] = [];
    const expirados: any[] = [];
    const semVinculoComInscricao: any[] = []; // sem_vinculo MAS tem inscrição identificada
    const semVinculoSemInscricao: any[] = []; // sem_vinculo SEM inscrição (não gera cobrança)
    const bloqueadosIdempotencia: any[] = [];
    const bloqueadosNome: any[] = [];
    const bloqueadosDuplicada: any[] = [];

    for (const insc of auditaveis) {
      const participante_id = insc.cpf || normalizePhone(insc.whatsapp);
      const nomeClassif = nomesValidados[insc.nome] || 'incerto';
      const ehDuplicada = cpfSet.has(insc.id);

      const detalhe: any = {
        inscricao_id: insc.id, nome: insc.nome, email: insc.email, whatsapp: insc.whatsapp,
        cpf: insc.cpf, status_pagamento: insc.status_pagamento,
        asaas_checkout_status: insc.asaas_checkout_status || null, tipo: insc.tipo,
        created_date: insc.created_date, valor_pago: insc.valor_pago,
        recovery_attempts_antigo: insc.recovery_attempts || 0,
        classificacao: null, asaas_status: null, asaas_fonte: null, acao: null, canal: null,
        nome_classificacao: nomeClassif, idempotencia: null, eh_duplicada: ehDuplicada,
      };

      if (ehDuplicada) {
        detalhe.classificacao = 'duplicada'; detalhe.acao = 'ignorar';
        bloqueadosDuplicada.push(detalhe); detalhes.push(detalhe); continue;
      }

      // Caminho rápido para registros do ciclo antigo (recovery_attempts >= 99):
      // o ciclo antigo já fez a cascata completa de 6 chaves e não encontrou pagamento.
      // Aqui fazemos apenas 1 chamada por CPF para checar se pagou DEPOIS do ciclo antigo.
      // Se confirmado → aprova. Senão → gera novo checkout. Reduz ~6 chamadas para 1.
      const ehCicloAntigo = (insc.recovery_attempts || 0) >= 99;
      const asaas = ehCicloAntigo
        ? await consultarAsaasCpfApenas(insc, ASAAS_KEY)
        : await consultarAsaasMulti(insc, ASAAS_KEY);
      detalhe.asaas_status = asaas.status; detalhe.asaas_fonte = asaas.fonte;
      detalhe.caminho = ehCicloAntigo ? 'cpf_apenas_ciclo_antigo' : 'cascata_completa';

      if (asaas.status && STATUS_CONFIRMADO_AS.includes(asaas.status)) {
        detalhe.classificacao = 'confirmado';
        confirmados.push({ insc, detalhe, asaas });
      } else if (asaas.status && STATUS_PENDENTE_AS.includes(asaas.status)) {
        detalhe.classificacao = 'pendente'; detalhe.link = asaas.link || insc.asaas_charge_url;
        pendentes.push({ insc, detalhe, asaas });
      } else if (asaas.status && STATUS_EXPIRADO_AS.includes(asaas.status)) {
        detalhe.classificacao = 'expirado'; detalhe.causa = `checkout_${asaas.status.toLowerCase()}`;
        expirados.push({ insc, detalhe, asaas });
      } else if (!asaas.status) {
        // SEM_VINCULO: não existe checkout no Asaas.
        // Só gera novo link se a inscrição existe E tem contato identificável.
        detalhe.classificacao = 'sem_vinculo'; detalhe.causa = 'checkout_inexistente';
        const temContatoIdentificavel = !!(insc.nome && (insc.whatsapp || insc.email));
        if (temContatoIdentificavel) {
          semVinculoComInscricao.push({ insc, detalhe, asaas });
        } else {
          detalhe.acao = 'sem_cobranca_sem_inscricao_identificada';
          detalhe.motivo_bloqueio = 'sem_vinculo_sem_contato';
          semVinculoSemInscricao.push({ insc, detalhe, asaas });
        }
      } else {
        detalhe.classificacao = 'sem_vinculo'; detalhe.causa = `status_inesperado:${asaas.status}`;
        detalhe.analise_manual = true;
        semVinculoSemInscricao.push({ insc, detalhe, asaas });
      }
      detalhes.push(detalhe);
    }

    // ═══ 5. APLICAR ÁRVORE DE DECISÃO ═══
    const acoesExecutadas: any[] = [];
    const janelaWa = janelaWhatsAppAtiva();
    let killSwitchAtivo = false;
    try {
      const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
      const controls = await S.M31WhatsAppControl.filter({ data: hoje });
      killSwitchAtivo = controls[0]?.bloqueado === true;
    } catch {}
    const canalWhatsAppDisponivel = janelaWa.ativa && !killSwitchAtivo;

    // 5a. CONFIRMADOS → aprovar + despachar
    for (const { insc, detalhe, asaas } of confirmados) {
      detalhe.acao = 'aprovar_e_despachar';
      if (!dryRun) {
        await S.EventoM31Inscricao.update(insc.id, {
          status_pagamento: 'aprovado',
          asaas_payment_id: asaas.payment_id || insc.asaas_payment_id,
          asaas_checkout_status: 'PAID',
          pagamento_confirmado_em: new Date().toISOString(),
          checkout_abandoned_at: null,
          fila_boas_vindas: true,
          webhook_processando: false,
          origem_pagamento: insc.origem_pagamento || 'asaas',
          recovery_attempts: 99, // encerra ciclo antigo
        }).catch(() => {});
        acoesExecutadas.push({ inscricao_id: insc.id, acao: 'aprovado', nome: insc.nome, tipo: insc.tipo });
        await S.M31InscricaoTimeline.create({
          inscricao_id: insc.id, cpf: insc.cpf || null,
          evento: 'pagamento_aprovado', etapa: 'recuperacao_expirados_global',
          status: 'sucesso',
          detalhe: `Confirmado no Asaas (fonte=${asaas.fonte}, payment_id=${asaas.payment_id}). Ciclo antigo encerrado (recovery_attempts=99).`,
          origem: 'm31RecuperarCheckoutsExpirados',
        }).catch(() => {});
      }
    }

    // 5b. PENDENTES + EXPIRADOS + SEM_VINCULO_COM_INSCRICAO → recuperar
    const recuperar = [...pendentes, ...expirados, ...semVinculoComInscricao];
    for (const { insc, detalhe, asaas } of recuperar) {
      const participante_id = insc.cpf || normalizePhone(insc.whatsapp);

      // Validar nome (imersão feminina)
      if (detalhe.nome_classificacao !== 'feminino') {
        detalhe.acao = 'analise_manual_nome';
        detalhe.motivo_bloqueio = `nome_${detalhe.nome_classificacao}`;
        bloqueadosNome.push(detalhe); continue;
      }

      // Idempotência do NOVO ciclo (V2)
      const idemp = await checarIdempotenciaNovoCiclo(base44, participante_id);
      detalhe.idempotencia = { pode: idemp.pode, contatos: idemp.contatos };
      if (!idemp.pode) {
        detalhe.acao = 'bloqueado_idempotencia';
        detalhe.motivo_bloqueio = idemp.motivo;
        bloqueadosIdempotencia.push(detalhe); continue;
      }

      // Gerar novo checkout para EXPIRADOS e SEM_VINCULO_COM_INSCRICAO (1 por inscrição)
      let linkFinal = detalhe.link || insc.asaas_charge_url;
      let checkoutIdFinal = asaas.checkout_id || insc.asaas_checkout_id;
      let validadeFinal: string | null = null;
      let externalRefFinal = insc.codigo_inscricao || null;

      if (detalhe.classificacao === 'expirado' || detalhe.classificacao === 'sem_vinculo') {
        detalhe.acao = 'gerar_novo_link_e_recuperar';
        if (!dryRun) {
          const novo = await criarNovoCheckout(insc, ASAAS_KEY);
          if (!novo) {
            detalhe.acao = 'falha_novo_checkout';
            detalhe.motivo_bloqueio = 'erro_gerar_checkout';
            await S.M31InscricaoTimeline.create({
              inscricao_id: insc.id, cpf: insc.cpf || null,
              evento: 'erro_recuperacao', etapa: 'recuperacao_expirados_global',
              status: 'falha',
              detalhe: `Falha ao gerar novo checkout (causa=${detalhe.causa}). Ciclo antigo não encerrado — será retryado.`,
              origem: 'm31RecuperarCheckoutsExpirados',
            }).catch(() => {});
            continue;
          }
          // Preservar histórico do link antigo
          const historico = insc.observacoes
            ? `${insc.observacoes}\n[REC-EXP ${new Date().toISOString()}] Link antigo: ${insc.asaas_charge_url} (causa: ${detalhe.causa})`
            : `[REC-EXP ${new Date().toISOString()}] Link antigo: ${insc.asaas_charge_url} (causa: ${detalhe.causa})`;
          await S.EventoM31Inscricao.update(insc.id, {
            asaas_charge_url: novo.link,
            asaas_checkout_id: novo.id,
            asaas_checkout_status: novo.status,
            status_pagamento: 'checkout_pendente',
            checkout_abandoned_at: null,
            observacoes: historico.substring(0, 2000),
            recovery_attempts: 99, // encerra ciclo antigo definitivamente
            opt_out: false, // limpa opt_out do ciclo antigo (não foi pedido real da participante)
          }).catch(() => {});
          linkFinal = novo.link;
          checkoutIdFinal = novo.id;
          validadeFinal = novo.validade;
          externalRefFinal = insc.codigo_inscricao || `M31-REC-${Date.now().toString(36).toUpperCase()}`;
          detalhe.novo_checkout_id = novo.id;
          detalhe.novo_link = novo.link;
          detalhe.nova_validade = novo.validade;
          detalhe.novo_external_reference = externalRefFinal;
        }
      } else {
        detalhe.acao = 'recuperar';
      }

      // Enviar UMA mensagem de recuperação
      if (canalWhatsAppDisponivel) {
        detalhe.canal = 'whatsapp';
        if (!dryRun) {
          const dedupKey = `${insc.id}:LINK_DE_PAGAMENTO:${VERSAO_RECUPERACAO}`;
          const jaNaFila = await S.M31FilaMensagem.filter({ dedup_key: dedupKey }, '-created_date', 1);
          if (jaNaFila.length === 0 || ['falha', 'cancelado'].includes(jaNaFila[0].status)) {
            const primeiroNome = insc.nome?.split(' ')[0] || 'querida';
            const mensagem = mensagemRecuperacao(insc.tipo, primeiroNome, linkFinal, insc.caravana_nome);
            await S.M31FilaMensagem.create({
              dedup_key: dedupKey, participante_id, cpf: insc.cpf || null,
              telefone: normalizePhone(insc.whatsapp), email: insc.email || null,
              automacao: 'LINK_DE_PAGAMENTO', template: 'recuperacao_link_pagamento',
              versao: VERSAO_RECUPERACAO, origem: 'm31RecuperarCheckoutsExpirados',
              inscricao_id: insc.id, inscricao_nome: insc.nome,
              mensagens: [{ message: mensagem, image_url: null }],
              status: 'pendente', aprovado_para_envio: autoAprovarFila, prioridade: 5,
            }).catch(() => {});
            await S.M31AutomacaoLog.create({
              participante_id, cpf: insc.cpf || null, telefone: normalizePhone(insc.whatsapp), email: insc.email || null,
              automacao: 'RECUPERACAO_CHECKOUT', template: 'recuperacao_link_pagamento',
              versao: VERSAO_RECUPERACAO, status: 'enviado', enviado_em: new Date().toISOString(),
              origem: 'm31RecuperarCheckoutsExpirados',
              idempotency_key: `${participante_id}:RECUPERACAO_CHECKOUT:${VERSAO_RECUPERACAO}`,
            }).catch(() => {});
            await S.M31InscricaoTimeline.create({
              inscricao_id: insc.id, cpf: insc.cpf || null,
              evento: 'safety_net_executado', etapa: 'recuperacao_expirados_global',
              status: 'sucesso',
              detalhe: `Recuperação WhatsApp: ${detalhe.acao} | classificacao=${detalhe.classificacao} | novo_checkout=${checkoutIdFinal} | validade=${validadeFinal || 'n/a'} | externalRef=${externalRefFinal}`,
              origem: 'm31RecuperarCheckoutsExpirados',
            }).catch(() => {});
            acoesExecutadas.push({ inscricao_id: insc.id, acao: detalhe.acao, canal: 'whatsapp', nome: insc.nome, tipo: insc.tipo });
          }
        }
      } else if (insc.email) {
        detalhe.canal = 'email';
        detalhe.motivo_email = !janelaWa.ativa ? 'fora_janela_whatsapp' : 'kill_switch_ativo';
        if (!dryRun) {
          const result = await enviarEmailRecuperacao(insc, linkFinal, BREVO_KEY);
          if (result.sucesso) {
            await S.M31AutomacaoLog.create({
              participante_id, cpf: insc.cpf || null, telefone: normalizePhone(insc.whatsapp), email: insc.email || null,
              automacao: 'RECUPERACAO_CHECKOUT', template: 'recuperacao_link_pagamento',
              versao: VERSAO_RECUPERACAO, status: 'enviado', enviado_em: new Date().toISOString(),
              origem: 'm31RecuperarCheckoutsExpirados:email',
              idempotency_key: `${participante_id}:RECUPERACAO_CHECKOUT:${VERSAO_RECUPERACAO}`,
            }).catch(() => {});
            await S.EventoM31Inscricao.update(insc.id, {
              last_contact_at: new Date().toISOString(),
              last_recovery_at: new Date().toISOString(),
              email_envio_status: 'enviado',
            }).catch(() => {});
            await S.M31InscricaoTimeline.create({
              inscricao_id: insc.id, cpf: insc.cpf || null,
              evento: 'safety_net_executado', etapa: 'recuperacao_expirados_global',
              status: 'sucesso',
              detalhe: `Recuperação E-mail: ${detalhe.acao} | classificacao=${detalhe.classificacao} (WhatsApp indisponível). novo_checkout=${checkoutIdFinal}`,
              origem: 'm31RecuperarCheckoutsExpirados:email',
            }).catch(() => {});
            acoesExecutadas.push({ inscricao_id: insc.id, acao: detalhe.acao, canal: 'email', nome: insc.nome, tipo: insc.tipo });
          } else {
            detalhe.erro_email = result.erro;
            await S.M31InscricaoTimeline.create({
              inscricao_id: insc.id, cpf: insc.cpf || null,
              evento: 'erro_recuperacao', etapa: 'recuperacao_expirados_global',
              status: 'falha',
              detalhe: `Falha no envio de e-mail: ${result.erro}`,
              origem: 'm31RecuperarCheckoutsExpirados:email',
            }).catch(() => {});
          }
        }
      } else {
        detalhe.acao = 'sem_canal_disponivel';
        detalhe.motivo_bloqueio = 'sem_whatsapp_ativo_e_sem_email';
      }
    }

    // ═══ 6. AUDITORIA DE ERROS 500 SEM INSCRIÇÃO SALVA ═══
    // NÃO declara "ninguém afetado" só porque não aparece no banco.
    // Varre: M31AsaasWebhookEvento (falha), M31AuditLog, M31DeadLetterQueue.
    const erros500: any[] = [];

    // 6a. Webhook eventos com falha
    const eventosFalha = await S.M31AsaasWebhookEvento.filter(
      { status: 'falha' }, '-recebido_em', 200
    ).catch(() => []);
    for (const ev of eventosFalha) {
      let payload: any = null;
      try { payload = ev.payload_json ? JSON.parse(ev.payload_json) : null; } catch {}
      const contato = extrairContatoDePayload(payload);
      // Tentar localizar inscrição
      let inscLocalizada: any = null;
      const ref = ev.external_reference || payload?.externalReference;
      if (ref) {
        const porCod = await S.EventoM31Inscricao.filter({ codigo_inscricao: ref }, '-created_date', 1).catch(() => []);
        inscLocalizada = porCod[0] || null;
      }
      if (!inscLocalizada && contato.cpf) {
        const porCpf = await S.EventoM31Inscricao.filter({ cpf: contato.cpf.replace(/\D/g, '') }, '-created_date', 1).catch(() => []);
        inscLocalizada = porCpf[0] || null;
      }
      if (!inscLocalizada && ev.payment_id) {
        const porPid = await S.EventoM31Inscricao.filter({ asaas_payment_id: ev.payment_id }, '-created_date', 1).catch(() => []);
        inscLocalizada = porPid[0] || null;
      }
      erros500.push({
        fonte: 'webhook_evento',
        event_id: ev.event_id,
        event_type: ev.event_type,
        payment_id: ev.payment_id,
        external_reference: ev.external_reference,
        erro: ev.erro,
        recebido_em: ev.recebido_em,
        inscricao_localizada: inscLocalizada ? inscLocalizada.id : null,
        contato_extraido: contato,
        recuperavel: temContato(contato),
      });
    }

    // 6b. Audit logs de erro
    const auditLogs = await S.M31AuditLog.filter(
      { severidade: 'erro' }, '-created_date', 100
    ).catch(() => []);
    for (const al of auditLogs) {
      const contato = extrairContatoDePayload(al.detalhe || al.payload);
      erros500.push({
        fonte: 'audit_log',
        id: al.id,
        categoria: al.categoria,
        detalhe: (al.detalhe || '').substring(0, 300),
        created_date: al.created_date,
        contato_extraido: contato,
        recuperavel: temContato(contato),
      });
    }

    // 6c. Dead Letter Queue
    const dlq = await S.M31DeadLetterQueue.filter({}, '-created_date', 100).catch(() => []);
    for (const d of dlq) {
      let payload: any = null;
      try { payload = d.payload ? (typeof d.payload === 'string' ? JSON.parse(d.payload) : d.payload) : null; } catch {}
      const contato = extrairContatoDePayload(payload);
      erros500.push({
        fonte: 'dlq',
        id: d.id,
        erro: d.erro || d.motivo,
        created_date: d.created_date,
        contato_extraido: contato,
        recuperavel: temContato(contato),
      });
    }

    // ═══ 7. DUAS LISTAS SEPARADAS: RECUPERÁVEIS / NÃO RECUPERÁVEIS ═══
    const recuperaveis: any[] = [];
    const naoRecuperaveis: any[] = [];

    // 7a. Das inscrições alvo (com inscrição no banco)
    for (const d of detalhes) {
      const contato = { nome: d.nome, telefone: d.whatsapp, email: d.email, cpf: d.cpf };
      const item = {
        origem: 'inscricao_db',
        inscricao_id: d.inscricao_id,
        nome: d.nome, telefone: d.whatsapp, email: d.email, cpf: d.cpf,
        tipo: d.tipo, status_pagamento: d.status_pagamento,
        classificacao: d.classificacao, acao: d.acao, canal: d.canal,
        asaas_status: d.asaas_status, asaas_fonte: d.asaas_fonte,
        novo_checkout_id: d.novo_checkout_id || null,
        novo_link: d.novo_link || null,
        nova_validade: d.nova_validade || null,
        novo_external_reference: d.novo_external_reference || null,
        motivo_bloqueio: d.motivo_bloqueio || null,
      };
      if (temContato(contato)) recuperaveis.push(item);
      else naoRecuperaveis.push(item);
    }

    // 7b. Dos erros 500 sem inscrição salva
    for (const e of erros500) {
      const c = e.contato_extraido || {};
      const item = {
        origem: e.fonte,
        event_id: e.event_id || e.id,
        event_type: e.event_type,
        payment_id: e.payment_id,
        external_reference: e.external_reference,
        erro: e.erro,
        recebido_em: e.recebido_em || e.created_date,
        inscricao_localizada: e.inscricao_localizada || null,
        nome: c.nome, telefone: c.telefone, email: c.email, cpf: c.cpf,
      };
      if (temContato(c)) recuperaveis.push(item);
      else naoRecuperaveis.push(item);
    }

    return Response.json({
      success: true,
      dry_run: dryRun,
      timestamp: new Date().toISOString(),
      janela: 'global_sem_limite_horas',
      canal_whatsapp_disponivel: canalWhatsAppDisponivel,
      janela_whatsapp: janelaWa,
      kill_switch_ativo: killSwitchAtivo,
      versao_recuperacao: VERSAO_RECUPERACAO,
      ciclo_antigo_encerrado: 'recovery_attempts=99',
      resumo: {
        total_candidatas: candidatas.length,
        total_auditaveis: auditaveis.length,
        caravanas: auditaveis.filter(i => i.tipo === 'caravana').length,
        normais: auditaveis.filter(i => i.tipo !== 'caravana').length,
        confirmados: confirmados.length,
        pendentes: pendentes.length,
        expirados: expirados.length,
        sem_vinculo_com_inscricao: semVinculoComInscricao.length,
        sem_vinculo_sem_inscricao: semVinculoSemInscricao.length,
        bloqueados_idempotencia: bloqueadosIdempotencia.length,
        bloqueados_nome: bloqueadosNome.length,
        bloqueados_duplicada: bloqueadosDuplicada.length,
        erros_500_auditados: erros500.length,
        acoes_executadas: dryRun ? 0 : acoesExecutadas.length,
        recuperaveis: recuperaveis.length,
        nao_recuperaveis: naoRecuperaveis.length,
      },
      recuperaveis: recuperaveis,
      nao_recuperaveis: naoRecuperaveis,
      erros_500_auditados: erros500,
      acoes_executadas: acoesExecutadas,
      detalhes,
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
})(req);
}
