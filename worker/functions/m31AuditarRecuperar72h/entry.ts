// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31AuditarRecuperar72h — Auditoria + Recuperação de inscrições das últimas 72h
 *
 * Fluxo:
 *   1. Busca inscrições dos últimos 72h com status: checkout_pendente,
 *      checkout_abandonado, pendente (inclui implícitos pagamento_erro/recusado/expirado
 *      via asaas_checkout_status).
 *   2. Exclui: aprovado, cancelado, gratuito, opt_out, duplicadas (mesmo CPF com outra ativa).
 *   3. Consulta Asaas por: payment_id → checkout_id → CPF → externalReference → email → phone.
 *   4. Classifica: CONFIRMADO | PENDENTE | EXPIRADO | SEM_VINCULO.
 *   5. Árvore de decisão:
 *      - CONFIRMADO → aprovar inscrição, remover abandono, despachar QR/boas-vindas.
 *      - PENDENTE → manter checkout, encaminhar para recuperação.
 *      - EXPIRADO → gerar novo link, preservar histórico, registrar causa.
 *      - SEM_VINCULO → análise manual, sem cobrança duplicada.
 *   6. Idempotência: máx 1 contato/24h, máx 2 contatos/72h (via M31AutomacaoLog).
 *   7. Validação de nome (imersão feminina) via LLM antes de enviar link.
 *   8. Canal: WhatsApp (se janela ativa 08-20h e kill-switch off) ou E-mail (fallback).
 *
 * Payload: { dry_run?: boolean, auto_aprovar_fila?: boolean, max_inscricoes?: number }
 */

// ═══ TRAVA DE PAUSA (04/08/2026) — REVERSÍVEL ═══
// Motivo: esta função aprovou 118 inscrições em 30/07 02:17 usando o mesmo
// payment_id (pay_by539pgbhhru8hdr, R$60) sem validar checkout/externalReference/valor.
// Não há automação agendada ativa apontando para ela; a trava abaixo impede
// qualquer execução (manual ou futura) até liberação explícita do gestor.
//
// CORREÇÃO APLICADA (04/08/2026) — lógica corrigida, pausa mantida para validação:
//   - Aprovação automática EXIGE âncora estrita e exclusiva: asaas_checkout_id da
//     inscrição === checkout do pagamento; OU externalReference === codigo_inscricao
//     (ou padrão CPF-M31FILHAS); OU installment_id do pedido matriz.
//   - CPF, telefone e e-mail apenas LOCALIZAM candidatos — nunca aprovam sozinhos.
//   - Teste de exclusividade: um payment_id não aprova várias inscrições
//     (dentro do batch ou já aprovadas no DB) → demove para sem_vinculo/análise manual.
//   - externalReference=null E checkout=null → sem_vinculo (análise manual).
//   - dry_run=true é o default.
// Reativação segura: 1) rodar dry_run=true; 2) validar 1 caso normal, 1 caravana,
//    1 voluntária; 3) só então setar PAUSA_ATIVA=false.
// REATIVADA (04/08/2026) — lógica de âncora estrita + exclusividade aplicada.
// dry_run=true permanece como default; passar { dry_run: false } para produção.
const PAUSA_ATIVA = false;

const JANELA_HORAS = 72;
const COOLDOWN_RECUPERACAO_H = 24;
const MAX_CONTATOS_72H = 2;
const STATUS_ALVO = ['checkout_pendente', 'checkout_abandonado', 'pendente'];
const STATUS_CONFIRMADO_AS = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'DUNNING_RECEIVED'];
const STATUS_PENDENTE_AS = ['PENDING'];
const STATUS_EXPIRADO_AS = ['EXPIRED', 'CANCELED', 'OVERDUE', 'DELETED', 'REFUNDED'];

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

/**
 * Consulta Asaas por múltiplos identificadores em cascata (LOOKUP apenas).
 * Retorna o PRIMEIRO resultado encontrado, INDEPENDENTE de vínculo estrito.
 * A validação de âncora (checkout/externalReference/installment) é feita
 * separadamente por validarAncoraEstrta — dados de contato (CPF/telefone/email)
 * localizam candidatos mas NUNCA aprovam inscrição sozinhos.
 */
async function consultarAsaasMulti(insc: any, ASAAS_KEY: string) {
  const resultado: any = {
    encontrou: false, status: null, payment_id: null, checkout_id: null,
    external_reference: null, installment_id: null, link: null,
    fonte: null, customer_id: null, valor: null,
  };

  function preencher(p: any, fonte: string) {
    resultado.encontrou = true;
    resultado.status = p.status;
    resultado.payment_id = p.id;
    resultado.fonte = fonte;
    if (p.checkout) resultado.checkout_id = p.checkout;
    if (p.externalReference) resultado.external_reference = p.externalReference;
    if (p.installment) resultado.installment_id = p.installment;
    if (p.value) resultado.valor = p.value;
    if (p.customer) resultado.customer_id = p.customer;
  }

  // 1. Payment ID (GET /payments/{id}) — referência direta, mas âncora ainda é validada
  if (insc.asaas_payment_id) {
    try {
      const resp = await fetchAsaas(`__ASAAS_API__/payments/${insc.asaas_payment_id}`, { headers: { 'access_token': ASAAS_KEY } });
      if (resp.status === 200) {
        const pay = await resp.json();
        preencher(pay, 'payment_id');
        return resultado;
      }
    } catch {}
  }

  // 2. Âncora gravada no checkout. No fluxo atual /payments, este campo
  // guarda um payment_id (pay_*), não um objeto /checkouts. Consultar o endpoint
  // errado fazia a reconciliação cair para CPF e perder a âncora determinística.
  let checkoutId = insc.asaas_checkout_id || extrairCheckoutIdDaUrl(insc.asaas_charge_url);
  if (checkoutId) {
    try {
      if (String(checkoutId).startsWith('pay_')) {
        const resp = await fetchAsaas(`__ASAAS_API__/payments/${checkoutId}`, { headers: { 'access_token': ASAAS_KEY } });
        if (resp.status === 200) { const pay = await resp.json(); preencher(pay, 'checkout_payment_id'); return resultado; }
      } else {
        const resp = await fetchAsaas(`__ASAAS_API__/checkouts/${checkoutId}`, { headers: { 'access_token': ASAAS_KEY } });
        if (resp.status === 200) {
          const checkout = await resp.json(); resultado.encontrou = true; resultado.status = checkout.status;
          resultado.checkout_id = checkout.id; resultado.link = checkout.link; resultado.fonte = 'checkout_id'; return resultado;
        }
      }
    } catch {}
  }

  // 3. CPF (lookup por contato — NÃO aprova sozinho)
  if (insc.cpf) {
    try {
      const resp = await fetchAsaas(`__ASAAS_API__/payments?cpfCnpj=${encodeURIComponent(insc.cpf)}&limit=10`, { headers: { 'access_token': ASAAS_KEY } });
      const data = await resp.json();
      if (data?.data && data.data.length > 0) {
        const confirmada = data.data.find((p: any) => STATUS_CONFIRMADO_AS.includes(p.status));
        const escolhida = confirmada || data.data[0];
        preencher(escolhida, 'cpf');
        return resultado;
      }
    } catch {}
  }

  // 4. External Reference (âncora de codigo_inscricao)
  if (insc.codigo_inscricao) {
    try {
      const resp = await fetchAsaas(`__ASAAS_API__/payments?externalReference=${encodeURIComponent(insc.codigo_inscricao)}&limit=5`, { headers: { 'access_token': ASAAS_KEY } });
      const data = await resp.json();
      if (data?.data && data.data.length > 0) {
        const confirmada = data.data.find((p: any) => STATUS_CONFIRMADO_AS.includes(p.status));
        const escolhida = confirmada || data.data[0];
        preencher(escolhida, 'external_reference');
        return resultado;
      }
    } catch {}
  }

  // 5. Email (lookup por contato — NÃO aprova sozinho)
  if (insc.email) {
    try {
      const resp = await fetchAsaas(`__ASAAS_API__/customers?email=${encodeURIComponent(insc.email)}&limit=3`, { headers: { 'access_token': ASAAS_KEY } });
      const data = await resp.json();
      if (data?.data && data.data.length > 0) {
        const customerId = data.data[0].id;
        const payResp = await fetchAsaas(`__ASAAS_API__/payments?customer=${customerId}&limit=5`, { headers: { 'access_token': ASAAS_KEY } });
        const payData = await payResp.json();
        if (payData?.data && payData.data.length > 0) {
          const confirmada = payData.data.find((p: any) => STATUS_CONFIRMADO_AS.includes(p.status));
          const escolhida = confirmada || payData.data[0];
          preencher(escolhida, 'email');
          return resultado;
        }
      }
    } catch {}
  }

  // 6. Telefone (lookup por contato — NÃO aprova sozinho)
  if (insc.whatsapp) {
    const phone = normalizePhone(insc.whatsapp);
    try {
      const resp = await fetchAsaas(`__ASAAS_API__/customers?mobilePhone=${encodeURIComponent(phone)}&limit=3`, { headers: { 'access_token': ASAAS_KEY } });
      const data = await resp.json();
      if (data?.data && data.data.length > 0) {
        const customerId = data.data[0].id;
        const payResp = await fetchAsaas(`__ASAAS_API__/payments?customer=${customerId}&limit=5`, { headers: { 'access_token': ASAAS_KEY } });
        const payData = await payResp.json();
        if (payData?.data && payData.data.length > 0) {
          const confirmada = payData.data.find((p: any) => STATUS_CONFIRMADO_AS.includes(p.status));
          const escolhida = confirmada || payData.data[0];
          preencher(escolhida, 'telefone');
          return resultado;
        }
      }
    } catch {}
  }

  return resultado;
}

/**
 * VALIDAÇÃO DE ÂNCORA ESTRTITA — a prova financeira de vínculo.
 * Dados de contato (CPF/telefone/email) localizam; não aprovam.
 * Aprovação automática só quando há match estrito e exclusivo entre:
 *   - asaas_checkout_id da inscrição === checkout do pagamento; ou
 *   - externalReference do pagamento === codigo_inscricao (ou padrão CPF-M31FILHAS); ou
 *   - installment_id corretamente ligado ao pedido matriz.
 * Sem âncora → sem_vinculo → análise manual.
 */
function validarAncoraEstrita(insc: any, asaas: any): {
  ancorado: boolean; tipo_ancora: string | null; motivo: string;
} {
  // 1. checkout_id
  const inscCheckout = insc.asaas_checkout_id || extrairCheckoutIdDaUrl(insc.asaas_charge_url);
  if (inscCheckout && asaas.checkout_id && inscCheckout === asaas.checkout_id) {
    return { ancorado: true, tipo_ancora: 'checkout_id', motivo: 'match_checkout_id' };
  }
  // 2. externalReference
  const extRef = asaas.external_reference;
  if (extRef) {
    if (insc.codigo_inscricao && extRef === insc.codigo_inscricao) {
      return { ancorado: true, tipo_ancora: 'external_reference', motivo: 'match_external_reference' };
    }
    if (insc.cpf) {
      const padraoCpf = new RegExp(`^${insc.cpf}-M31FILHAS$`);
      if (padraoCpf.test(extRef)) {
        return { ancorado: true, tipo_ancora: 'external_reference_cpf', motivo: 'match_external_reference_cpf_m31filhas' };
      }
    }
  }
  // 3. installment_id (pedido matriz)
  if (insc.asaas_installment_id && asaas.installment_id && insc.asaas_installment_id === asaas.installment_id) {
    return { ancorado: true, tipo_ancora: 'installment_id', motivo: 'match_installment_id' };
  }
  // Sem âncora
  const semExt = !extRef;
  const semCheckout = !asaas.checkout_id;
  let motivo = 'sem_ancora_estrict';
  if (semExt && semCheckout) motivo = 'pagamento_sem_externalReference_e_sem_checkout';
  return { ancorado: false, tipo_ancora: null, motivo };
}

async function criarNovoCheckout(insc: any, ASAAS_KEY: string): Promise<{ id: string; link: string; status: string } | null> {
  const valor = insc.valor_pago || 129;
  const externalRef = insc.codigo_inscricao || `M31-REC-${Date.now().toString(36).toUpperCase()}`;
  const ehCaravana = insc.tipo === 'caravana';

  // Caravana: NÃO envia customer (causa "O campo customer informado é inválido").
  // Asaas coleta os dados do cliente na página de checkout nativa.
  // Normal (publico_geral): envia customer para pré-preencher identificação.
  const payload: any = {
    billingTypes: ['PIX', 'CREDIT_CARD'],
    chargeTypes: ['DETACHED', 'INSTALLMENT'],
    installment: { maxInstallmentCount: 5 },
    minutesToExpire: 1440,
    externalReference: externalRef,
    callback: {
      successUrl: '__APP_ORIGIN__/obrigado',
      cancelUrl: ehCaravana ? '__APP_ORIGIN__/m31-caravana' : '__APP_ORIGIN__/m31-inscricao',
      expiredUrl: ehCaravana ? '__APP_ORIGIN__/m31-caravana' : '__APP_ORIGIN__/m31-inscricao',
    },
    items: [{
      name: ehCaravana ? 'M31 Filhas - Caravana' : 'M31 Filhas - Inscricao',
      description: ehCaravana
        ? `M31 Filhas - Caravana - ${insc.nome}`
        : `M31 Filhas - ${insc.nome}`,
      value: valor,
      quantity: 1,
    }],
  };

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
    return { id: checkout.id, link: checkout.link, status: checkout.status || 'ACTIVE' };
  } catch (e) {
    logger.log(`[AuditarRecuperar] Erro ao gerar checkout para ${insc.id}:`, e.message);
    return null;
  }
}

async function validarNomesFemininos(base44: any, nomes: string[]): Promise<Record<string, string>> {
  if (nomes.length === 0) return {};
  try {
    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `Você é um classificador de nomes brasileiros para um evento EXCLUSIVO PARA MULHERES (M31 Filhas — imersão feminina cristã).
Para cada nome abaixo, classifique em:
- "feminino": claramente um nome feminino
- "masculino": claramente um nome masculino
- "incerto": ambíguo, apelido neutro, ou impossível determinar

Seja CONSERVADOR: na dúvida, classifique como "incerto".

Nomes a classificar:
${JSON.stringify(nomes)}

Retorne um JSON com array "classificacoes", cada item { "nome": "...", "classificacao": "..." }.`,
      response_json_schema: {
        type: 'object',
        properties: {
          classificacoes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                nome: { type: 'string' },
                classificacao: { type: 'string', enum: ['feminino', 'masculino', 'incerto'] },
              },
            },
          },
        },
      },
    });
    const mapa: Record<string, string> = {};
    for (const c of (res?.classificacoes || [])) {
      mapa[c.nome] = c.classificacao;
    }
    return mapa;
  } catch (e) {
    logger.log('[AuditarRecuperar] Erro LLM validação nomes:', e.message);
    return {};
  }
}

async function checarIdempotencia(base44: any, participante_id: string): Promise<{ pode: boolean; contatos_24h: number; contatos_72h: number; motivo?: string }> {
  const S = base44.asServiceRole.entities;
  const agora = Date.now();
  const corte24h = new Date(agora - COOLDOWN_RECUPERACAO_H * 3600000).toISOString();
  const corte72h = new Date(agora - JANELA_HORAS * 3600000).toISOString();

  const logs = await S.M31AutomacaoLog.filter(
    { participante_id, automacao: 'RECUPERACAO_CHECKOUT', status: 'enviado' },
    '-enviado_em', 10
  );

  const contatos24h = logs.filter((l: any) => l.enviado_em && l.enviado_em >= corte24h).length;
  const contatos72h = logs.filter((l: any) => l.enviado_em && l.enviado_em >= corte72h).length;

  if (contatos72h >= MAX_CONTATOS_72H) {
    return { pode: false, contatos_24h: contatos24h, contatos_72h: contatos72h, motivo: 'limite_72h_excedido' };
  }
  if (contatos24h >= 1) {
    return { pode: false, contatos_24h: contatos24h, contatos_72h: contatos72h, motivo: 'cooldown_24h_ativo' };
  }
  return { pode: true, contatos_24h: contatos24h, contatos_72h: contatos72h };
}

function janelaWhatsAppAtiva(): { ativa: boolean; motivo?: string } {
  const recife = new Date(Date.now() - 3 * 3600000);
  const h = recife.getUTCHours();
  if (h < 8 || h >= 20) return { ativa: false, motivo: 'fora_janela_08_20' };
  return { ativa: true };
}

/**
 * Mensagem de recuperação por tipo de inscrição.
 * Normal (publico_geral) e Caravana têm textos distintos conforme briefing.
 */
function mensagemRecuperacao(tipo: string, primeiroNome: string, link: string): string {
  const nome = primeiroNome || 'querida';
  if (tipo === 'caravana') {
    return `Oi, ${nome}! Tudo bem? 💛\n\nPercebemos que houve uma instabilidade na tentativa de inscrição da caravana, mas já corrigimos. Seu link está disponível aqui:\n\n${link}\n\nCaso já tenha pago, nos avise por aqui para conferirmos direitinho.`;
  }
  return `Oi, ${nome}! Tudo bem? 💛\n\nPercebemos que houve uma instabilidade na tentativa da sua inscrição, mas já corrigimos. Seu link está disponível aqui:\n\n${link}\n\nCaso já tenha pago, nos avise por aqui para conferirmos direitinho.`;
}

async function enviarEmailRecuperacao(insc: any, link: string, BREVO_KEY: string): Promise<{ sucesso: boolean; erro?: string }> {
  try {
    const primeiroNome = insc.nome?.split(' ')[0] || 'querida';
    const html = `
      <div style="font-family: Inter, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #8B1A2B; margin-bottom: 16px;">Oi ${primeiroNome}! 🌸</h2>
        <p style="color: #2A1F1F; font-size: 15px; line-height: 1.6;">
          Notamos que sua inscrição no M31 Filhas ainda não foi finalizada. Seu link de pagamento está pronto:
        </p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${link}" style="background: #8B1A2B; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">
            Finalizar Inscrição
          </a>
        </div>
        <p style="color: #6B5E5E; font-size: 13px; line-height: 1.5;">
          Ou copie o link: ${link}<br><br>
          Qualquer dúvida, respondemos por aqui! 🙏<br><br>
          Equipe M31 Filhas
        </p>
      </div>`;
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
    if (resp.status >= 400) {
      const err = await resp.text();
      return { sucesso: false, erro: `Brevo ${resp.status}: ${err.substring(0, 200)}` };
    }
    return { sucesso: true };
  } catch (e) {
    return { sucesso: false, erro: e.message };
  }
}

return (async (req) => {
  // TRAVA DE PAUSA — retorna imediatamente sem ler/gravar nada.
  // Pausa TOTAL: nenhum payload destrava. Para reativar, setar PAUSA_ATIVA=false no código.
  if (PAUSA_ATIVA) {
    return Response.json({
      pausado: true,
      motivo: 'funcao_pausada_04_08_2026 — aprovacao_em_massa_payment_id_compartilhado',
      function: 'm31AuditarRecuperar72h',
      timestamp: new Date().toISOString(),
      instrucao: 'Para reativar, setar PAUSA_ATIVA=false no código. Nenhum payload destrava.'
    });
  }
  try {
    const base44 = createClientFromRequest(req);

    try {
      const user = await base44.auth.me();
      if (user && user.role !== 'admin') {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    } catch { /* automação agendada */ }

    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dry_run !== false;
    const autoAprovarFila = body?.auto_aprovar_fila === true;
    const maxInscricoes = body?.max_inscricoes || 100;

    const S = base44.asServiceRole.entities;
    const ASAAS_KEY = config('ASAAS_API_KEY');
    const BREVO_KEY = config('BREVO_API_KEY');

    const agora = Date.now();
    const corte72h = new Date(agora - JANELA_HORAS * 3600000).toISOString();

    // ═══ 1. BUSCAR INSCRIÇÕES DOS ÚLTIMOS 72h ═══
    const inscricoes: any[] = [];
    for (const status of STATUS_ALVO) {
      const batch = await S.EventoM31Inscricao.filter({ status_pagamento: status }, '-created_date', 300);
      inscricoes.push(...batch);
    }

    const candidatas = inscricoes
      .filter(i => i.created_date && new Date(i.created_date) >= new Date(corte72h))
      // Excluir aprovadas, canceladas, gratuitas
      .filter(i => !['aprovado', 'cancelado', 'gratuito'].includes(i.status_pagamento))
      // Excluir opt-out
      .filter(i => !i.opt_out)
      // Excluir presenteadas pendentes (cadastro_pendente)
      .filter(i => !i.cadastro_pendente)
      .slice(0, maxInscricoes);

    // ═══ 2. EXCLUIR DUPLICADAS (mesmo CPF com outra inscrição ATIVA) ═══
    const cpfSet = new Set<string>();
    const todasAtivas = await S.EventoM31Inscricao.filter({}, '-created_date', 2000);
    for (const insc of candidatas) {
      if (insc.cpf) {
        const duplicada = todasAtivas.find(o =>
          o.id !== insc.id && o.cpf === insc.cpf &&
          ['aprovado', 'checkout_pendente'].includes(o.status_pagamento)
        );
        if (duplicada) cpfSet.add(insc.id);
      }
    }

    const auditaveis = candidatas.filter(i => !cpfSet.has(i.id));

    // ═══ 2b. TENTATIVAS REGISTRADAS APENAS NOS LOGS DE WEBHOOK ═══
    // Eventos do Asaas recebidos mas com falha de processamento que NÃO têm
    // inscrição correspondente localizada no sistema. São "tentativas só nos logs".
    const eventosFalha = await S.M31AsaasWebhookEvento.filter(
      { status: 'falha' }, '-recebido_em', 50
    ).catch(() => []);
    const eventosFalha72h = eventosFalha.filter(e =>
      e.recebido_em && new Date(e.recebido_em) >= new Date(corte72h)
    );
    // Para cada evento com falha, tentar localizar inscrição por external_reference/payment_id
    const logsSemInscricao: any[] = [];
    for (const ev of eventosFalha72h) {
      let inscAssociada: any = null;
      const ref = ev.external_reference;
      if (ref) {
        const refAncora = /^(\d{11})-M31FILHAS$/.exec(ref);
        if (refAncora) {
          const porCpf = await S.EventoM31Inscricao.filter({ cpf: refAncora[1] }, '-created_date', 3);
          inscAssociada = porCpf[0] || null;
        } else {
          const porCod = await S.EventoM31Inscricao.filter({ codigo_inscricao: ref }, '-created_date', 1);
          inscAssociada = porCod[0] || null;
        }
      }
      if (!inscAssociada && ev.payment_id) {
        const porPid = await S.EventoM31Inscricao.filter({ asaas_payment_id: ev.payment_id }, '-created_date', 1);
        inscAssociada = porPid[0] || null;
      }
      if (!inscAssociada) {
        // Tentativa só nos logs — sem inscrição localizada
        logsSemInscricao.push({
          event_id: ev.event_id,
          event_type: ev.event_type,
          payment_id: ev.payment_id,
          external_reference: ev.external_reference,
          erro: ev.erro,
          recebido_em: ev.recebido_em,
        });
      } else {
        // Evento com falha MAS tem inscrição — incluir a inscrição na auditoria se ainda não estiver
        const jaIncluida = candidatas.some(c => c.id === inscAssociada.id);
        if (!jaIncluida && STATUS_ALVO.includes(inscAssociada.status_pagamento)) {
          candidatas.push(inscAssociada);
        }
      }
    }

    // ═══ 3. VALIDAR NOMES (imersão feminina) — batch LLM ═══
    const nomesUnicos = [...new Set(auditaveis.map(i => i.nome).filter(Boolean))];
    const nomesValidados = await validarNomesFemininos(base44, nomesUnicos);

    // ═══ 4. CONSULTAR ASAAS + CLASSIFICAR CADA INSCRIÇÃO ═══
    const detalhes: any[] = [];
    const confirmados: any[] = [];
    const pendentes: any[] = [];
    const expirados: any[] = [];
    const semVinculo: any[] = [];
    const bloqueadosIdempotencia: any[] = [];
    const bloqueadosNome: any[] = [];
    const bloqueadosDuplicada: any[] = [];

    for (const insc of candidatas) {
      const participante_id = insc.cpf || normalizePhone(insc.whatsapp);
      const nomeClassif = nomesValidados[insc.nome] || 'incerto';
      const ehDuplicada = cpfSet.has(insc.id);

      const detalhe: any = {
        inscricao_id: insc.id,
        nome: insc.nome,
        email: insc.email,
        whatsapp: insc.whatsapp,
        cpf: insc.cpf,
        status_pagamento: insc.status_pagamento,
        asaas_checkout_status: insc.asaas_checkout_status || null,
        tipo: insc.tipo,
        created_date: insc.created_date,
        valor_pago: insc.valor_pago,
        classificacao: null,
        asaas_status: null,
        asaas_fonte: null,
        acao: null,
        canal: null,
        nome_classificacao: nomeClassif,
        idempotencia: null,
        eh_duplicada: ehDuplicada,
      };

      if (ehDuplicada) {
        detalhe.classificacao = 'duplicada';
        detalhe.acao = 'ignorar';
        bloqueadosDuplicada.push(detalhe);
        detalhes.push(detalhe);
        continue;
      }

      // Consultar Asaas por múltiplos identificadores (LOOKUP — não aprova)
      const asaas = await consultarAsaasMulti(insc, ASAAS_KEY);
      detalhe.asaas_status = asaas.status;
      detalhe.asaas_fonte = asaas.fonte;
      detalhe.asaas_checkout_id = asaas.checkout_id;
      detalhe.asaas_external_reference = asaas.external_reference;
      detalhe.asaas_installment_id = asaas.installment_id;

      // VALIDAÇÃO DE ÂNCORA ESTRTITA — prova financeira de vínculo
      const ancora = validarAncoraEstrita(insc, asaas);
      detalhe.ancora = ancora;

      // Classificar — aprovação automática EXIGE âncora estrita
      if (asaas.status && STATUS_CONFIRMADO_AS.includes(asaas.status)) {
        if (ancora.ancorado) {
          detalhe.classificacao = 'confirmado';
          confirmados.push({ insc, detalhe, asaas });
        } else {
          // Pagamento encontrado por contato, mas SEM âncora estrita → análise manual
          detalhe.classificacao = 'sem_vinculo';
          detalhe.causa = ancora.motivo;
          detalhe.analise_manual = true;
          detalhe.motivo_bloqueio = 'pagamento_sem_ancora_estrict';
          semVinculo.push({ insc, detalhe, asaas });
        }
      } else if (asaas.status && STATUS_PENDENTE_AS.includes(asaas.status)) {
        // Pendente: só recuperamos o link se for o checkout da própria inscrição
        if (ancora.ancorado || asaas.fonte === 'checkout_id') {
          detalhe.classificacao = 'pendente';
          detalhe.link = asaas.link || insc.asaas_charge_url;
          pendentes.push({ insc, detalhe, asaas });
        } else {
          detalhe.classificacao = 'sem_vinculo';
          detalhe.causa = `pendente_sem_ancora:${ancora.motivo}`;
          detalhe.analise_manual = true;
          detalhe.motivo_bloqueio = 'pendente_sem_ancora_estrict';
          semVinculo.push({ insc, detalhe, asaas });
        }
      } else if (asaas.status && STATUS_EXPIRADO_AS.includes(asaas.status)) {
        if (ancora.ancorado || asaas.fonte === 'checkout_id') {
          detalhe.classificacao = 'expirado';
          detalhe.causa = `checkout_${asaas.status.toLowerCase()}`;
          expirados.push({ insc, detalhe, asaas });
        } else {
          detalhe.classificacao = 'sem_vinculo';
          detalhe.causa = `expirado_sem_ancora:${ancora.motivo}`;
          detalhe.analise_manual = true;
          detalhe.motivo_bloqueio = 'expirado_sem_ancora_estrict';
          semVinculo.push({ insc, detalhe, asaas });
        }
      } else if (!asaas.status) {
        // Sem vínculo no Asaas: checkout não existe / foi deletado.
        // Segundo a árvore de decisão: "Se o checkout estiver inválido ou não existir:
        // criar um novo link sem duplicar a inscrição."
        detalhe.classificacao = 'sem_vinculo';
        detalhe.causa = 'checkout_inexistente';
        semVinculo.push({ insc, detalhe, asaas });
      } else {
        // Status inesperado / ambíguo: dúvida de vínculo → análise manual
        detalhe.classificacao = 'sem_vinculo';
        detalhe.causa = `status_inesperado:${asaas.status}`;
        detalhe.analise_manual = true;
        semVinculo.push({ insc, detalhe, asaas });
      }

      detalhes.push(detalhe);
    }

    // ═══ 4b. TESTE DE EXCLUSIVIDADE — um payment_id não aprova várias inscrições ═══
    // Se o mesmo payment_id aparece em >1 confirmado do batch, OU já existe outra
    // inscrição aprovada no DB com o mesmo payment_id, demove TODOS para sem_vinculo
    // (análise manual). Previne repetição do incidente pay_by539 (118 inscrições).
    const confirmadosPorPid = new Map<string, any[]>();
    for (const c of confirmados) {
      const pid = c.asaas.payment_id;
      if (!pid) continue;
      if (!confirmadosPorPid.has(pid)) confirmadosPorPid.set(pid, []);
      confirmadosPorPid.get(pid)!.push(c);
    }
    const pidsDuplicados = new Set<string>();
    for (const [pid, items] of confirmadosPorPid) {
      if (items.length > 1) { pidsDuplicados.add(pid); continue; }
      try {
        const outras = await S.EventoM31Inscricao.filter(
          { asaas_payment_id: pid, status_pagamento: 'aprovado' }, '-created_date', 20
        );
        const externas = outras.filter((o: any) => !items.some(i => i.insc.id === o.id));
        if (externas.length > 0) pidsDuplicados.add(pid);
      } catch {}
    }
    const confirmadosUnicos: any[] = [];
    for (const c of confirmados) {
      if (c.asaas.payment_id && pidsDuplicados.has(c.asaas.payment_id)) {
        c.detalhe.classificacao = 'sem_vinculo';
        c.detalhe.causa = 'payment_id_compartilhado_entre_inscricoes';
        c.detalhe.analise_manual = true;
        c.detalhe.motivo_bloqueio = 'teste_exclusividade_falhou';
        semVinculo.push(c);
      } else {
        confirmadosUnicos.push(c);
      }
    }
    confirmados.length = 0;
    confirmados.push(...confirmadosUnicos);

    // ═══ 5. APLICAR ÁRVORE DE DECISÃO (se não for dry-run) ═══
    const acoesExecutadas: any[] = [];

    // Verificar janela WhatsApp e kill-switch
    const janelaWa = janelaWhatsAppAtiva();
    let killSwitchAtivo = false;
    try {
      const hoje = new Date(agora - 3 * 3600000).toISOString().slice(0, 10);
      const controls = await S.M31WhatsAppControl.filter({ data: hoje });
      killSwitchAtivo = controls[0]?.bloqueado === true;
    } catch {}

    const canalWhatsAppDisponivel = janelaWa.ativa && !killSwitchAtivo;

    // 5a. CONFIRMADOS → aprovar + despachar QR/boas-vindas
    for (const { insc, detalhe, asaas } of confirmados) {
      detalhe.acao = 'aprovar_e_despachar';
      if (!dryRun) {
        // Aprovar inscrição + remover abandono
        await S.EventoM31Inscricao.update(insc.id, {
          status_pagamento: 'aprovado',
          asaas_payment_id: asaas.payment_id || insc.asaas_payment_id,
          asaas_checkout_status: 'PAID',
          pagamento_confirmado_em: new Date().toISOString(),
          checkout_abandoned_at: null,
          fila_boas_vindas: true,
          webhook_processando: false,
          origem_pagamento: insc.origem_pagamento || 'asaas',
        }).catch(() => {});
        acoesExecutadas.push({ inscricao_id: insc.id, acao: 'aprovado', nome: insc.nome, tipo: insc.tipo });
        await S.M31InscricaoTimeline.create({
          inscricao_id: insc.id,
          cpf: insc.cpf || null,
          evento: 'pagamento_aprovado',
          etapa: 'recuperacao_72h',
          status: 'sucesso',
          detalhe: `Pagamento confirmado no Asaas (fonte=${asaas.fonte}, payment_id=${asaas.payment_id}, ancora=${detalhe.ancora?.tipo_ancora || 'nenhuma'}, motivo=${detalhe.ancora?.motivo || 'n/a'}) — aprovação automática via recuperação 72h APÓS validação de âncora estrita + teste de exclusividade. QR/boas-vindas despachados.`,
          origem: 'm31AuditarRecuperar72h',
        }).catch(() => {});
      }
    }

    // 5b. PENDENTES + EXPIRADOS + SEM_VINCULO (checkout inexistente) → recuperação
    // SEM_VINCULO com analise_manual=true fica fora (vai para análise manual).
    const semVinculoRecuperar = semVinculo.filter(s => !s.detalhe.analise_manual);
    const semVinculoManual = semVinculo.filter(s => s.detalhe.analise_manual);
    for (const s of semVinculoManual) {
      s.detalhe.acao = 'analise_manual';
      s.detalhe.motivo_bloqueio = s.detalhe.motivo_bloqueio || 'vinculo_nao_comprovado';
      // Registrar na timeline da inscrição o motivo do bloqueio para análise manual
      if (s.insc.id && !dryRun) {
        await S.M31InscricaoTimeline.create({
          inscricao_id: s.insc.id,
          cpf: s.insc.cpf || null,
          evento: 'recuperacao_bloqueada',
          etapa: 'recuperacao_72h',
          status: 'bloqueado',
          detalhe: `Análise manual: classificacao=${s.detalhe.classificacao} | causa=${s.detalhe.causa} | motivo_bloqueio=${s.detalhe.motivo_bloqueio} | asaas_fonte=${s.detalhe.asaas_fonte} | ancora=${s.detalhe.ancora?.tipo_ancora || 'nenhuma'} (${s.detalhe.ancora?.motivo || 'n/a'}) | payment_id=${s.asaas.payment_id || 'n/a'}. Dados de contato localizam, não comprovam vínculo financeiro.`,
          origem: 'm31AuditarRecuperar72h',
        }).catch(() => {});
      }
    }
    const recuperar = [...pendentes, ...expirados, ...semVinculoRecuperar];
    for (const { insc, detalhe, asaas } of recuperar) {
      const participante_id = insc.cpf || normalizePhone(insc.whatsapp);

      // Validar nome (imersão feminina)
      if (detalhe.nome_classificacao !== 'feminino') {
        detalhe.acao = 'analise_manual_nome';
        detalhe.motivo_bloqueio = `nome_${detalhe.nome_classificacao}`;
        bloqueadosNome.push(detalhe);
        continue;
      }

      // Checar idempotência
      const idemp = await checarIdempotencia(base44, participante_id);
      detalhe.idempotencia = { pode: idemp.pode, contatos_24h: idemp.contatos_24h, contatos_72h: idemp.contatos_72h };
      if (!idemp.pode) {
        detalhe.acao = 'bloqueado_idempotencia';
        detalhe.motivo_bloqueio = idemp.motivo;
        bloqueadosIdempotencia.push(detalhe);
        continue;
      }

      // Para expirados e sem_vinculo (checkout inexistente): gerar novo checkout
      let linkFinal = detalhe.link || insc.asaas_charge_url;
      let checkoutIdFinal = asaas.checkout_id || insc.asaas_checkout_id;

      if (detalhe.classificacao === 'expirado' || detalhe.classificacao === 'sem_vinculo') {
        detalhe.acao = 'gerar_novo_link_e_recuperar';
        if (!dryRun) {
          const novo = await criarNovoCheckout(insc, ASAAS_KEY);
          if (!novo) {
            detalhe.acao = 'falha_novo_checkout';
            detalhe.motivo_bloqueio = 'erro_gerar_checkout';
            continue;
          }
          // Preservar histórico: gravar link antigo em observacoes
          const historico = insc.observacoes
            ? `${insc.observacoes}\n[REC ${new Date().toISOString()}] Link antigo: ${insc.asaas_charge_url} (causa: ${detalhe.causa})`
            : `[REC ${new Date().toISOString()}] Link antigo: ${insc.asaas_charge_url} (causa: ${detalhe.causa})`;
          await S.EventoM31Inscricao.update(insc.id, {
            asaas_charge_url: novo.link,
            asaas_checkout_id: novo.id,
            asaas_checkout_status: novo.status,
            status_pagamento: 'checkout_pendente',
            checkout_abandoned_at: null,
            observacoes: historico.substring(0, 2000),
            recovery_attempts: (insc.recovery_attempts || 0) + 1,
          }).catch(() => {});
          linkFinal = novo.link;
          checkoutIdFinal = novo.id;
        }
      } else {
        detalhe.acao = 'recuperar';
      }

      // Selecionar canal
      if (canalWhatsAppDisponivel) {
        detalhe.canal = 'whatsapp';
        if (!dryRun) {
          const dedupKey = `${insc.id}:LINK_DE_PAGAMENTO:V1`;
          const jaNaFila = await S.M31FilaMensagem.filter({ dedup_key: dedupKey }, '-created_date', 1);
          if (jaNaFila.length === 0 || ['falha', 'cancelado'].includes(jaNaFila[0].status)) {
            const primeiroNome = insc.nome?.split(' ')[0] || 'querida';
            const mensagem = mensagemRecuperacao(insc.tipo, primeiroNome, linkFinal);
            await S.M31FilaMensagem.create({
              dedup_key: dedupKey,
              participante_id,
              cpf: insc.cpf || null,
              telefone: normalizePhone(insc.whatsapp),
              email: insc.email || null,
              automacao: 'LINK_DE_PAGAMENTO',
              template: 'recuperacao_link_pagamento',
              versao: 'V1',
              origem: 'm31AuditarRecuperar72h',
              inscricao_id: insc.id,
              inscricao_nome: insc.nome,
              mensagens: [{ message: mensagem, image_url: null }],
              status: 'pendente',
              aprovado_para_envio: autoAprovarFila,
              prioridade: 5,
            }).catch(() => {});
            await S.M31AutomacaoLog.create({
              participante_id,
              cpf: insc.cpf || null,
              telefone: normalizePhone(insc.whatsapp),
              email: insc.email || null,
              automacao: 'RECUPERACAO_CHECKOUT',
              template: 'recuperacao_link_pagamento',
              versao: 'V1',
              status: 'enviado',
              enviado_em: new Date().toISOString(),
              origem: 'm31AuditarRecuperar72h',
              idempotency_key: `${participante_id}:RECUPERACAO_CHECKOUT:V1`,
            }).catch(() => {});
            // Registrar no histórico da inscrição (timeline de observabilidade)
            await S.M31InscricaoTimeline.create({
              inscricao_id: insc.id,
              cpf: insc.cpf || null,
              evento: 'safety_net_executado',
              etapa: 'recuperacao_72h',
              status: 'sucesso',
              detalhe: `Recuperação WhatsApp: ${detalhe.acao} | classificacao=${detalhe.classificacao} | link=${linkFinal.substring(0, 60)}...`,
              origem: 'm31AuditarRecuperar72h',
            }).catch(() => {});
            acoesExecutadas.push({ inscricao_id: insc.id, acao: detalhe.acao, canal: 'whatsapp', nome: insc.nome, tipo: insc.tipo });
          }
        }
      } else if (insc.email) {
        // Fallback: e-mail via Brevo
        detalhe.canal = 'email';
        detalhe.motivo_email = !janelaWa.ativa ? 'fora_janela_whatsapp' : 'kill_switch_ativo';
        if (!dryRun) {
          const result = await enviarEmailRecuperacao(insc, linkFinal, BREVO_KEY);
          if (result.sucesso) {
            await S.M31AutomacaoLog.create({
              participante_id,
              cpf: insc.cpf || null,
              telefone: normalizePhone(insc.whatsapp),
              email: insc.email || null,
              automacao: 'RECUPERACAO_CHECKOUT',
              template: 'recuperacao_link_pagamento',
              versao: 'V1',
              status: 'enviado',
              enviado_em: new Date().toISOString(),
              origem: 'm31AuditarRecuperar72h:email',
              idempotency_key: `${participante_id}:RECUPERACAO_CHECKOUT:V1`,
            }).catch(() => {});
            await S.EventoM31Inscricao.update(insc.id, {
              last_contact_at: new Date().toISOString(),
              last_recovery_at: new Date().toISOString(),
              email_envio_status: 'enviado',
            }).catch(() => {});
            await S.M31InscricaoTimeline.create({
              inscricao_id: insc.id,
              cpf: insc.cpf || null,
              evento: 'safety_net_executado',
              etapa: 'recuperacao_72h',
              status: 'sucesso',
              detalhe: `Recuperação E-mail: ${detalhe.acao} | classificacao=${detalhe.classificacao} (WhatsApp indisponível)`,
              origem: 'm31AuditarRecuperar72h:email',
            }).catch(() => {});
            acoesExecutadas.push({ inscricao_id: insc.id, acao: detalhe.acao, canal: 'email', nome: insc.nome, tipo: insc.tipo });
          } else {
            detalhe.erro_email = result.erro;
          }
        }
      } else {
        detalhe.acao = 'sem_canal_disponivel';
        detalhe.motivo_bloqueio = 'sem_whatsapp_ativo_e_sem_email';
        semVinculo.push({ insc, detalhe, asaas });
      }
    }

    return Response.json({
      success: true,
      dry_run: dryRun,
      timestamp: new Date().toISOString(),
      janela_horas: JANELA_HORAS,
      corte: corte72h,
      canal_whatsapp_disponivel: canalWhatsAppDisponivel,
      janela_whatsapp: janelaWa,
      kill_switch_ativo: killSwitchAtivo,
      resumo: {
        total_auditados: auditaveis.length,
        confirmados: confirmados.length,
        pendentes: pendentes.length,
        expirados: expirados.length,
        sem_vinculo: semVinculo.length,
        sem_vinculo_recuperar: semVinculoRecuperar.length,
        analise_manual: semVinculoManual.length,
        bloqueados_idempotencia: bloqueadosIdempotencia.length,
        bloqueados_nome: bloqueadosNome.length,
        bloqueados_duplicada: bloqueadosDuplicada.length,
        logs_sem_inscricao: logsSemInscricao.length,
        acoes_executadas: dryRun ? 0 : acoesExecutadas.length,
      },
      tentativas_apenas_logs: logsSemInscricao,
      detalhes,
      acoes_executadas: acoesExecutadas,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
