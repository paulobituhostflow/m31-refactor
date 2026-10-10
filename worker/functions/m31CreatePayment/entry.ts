// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

const TICKET_CARD_OPTIONS = Object.freeze({
  1: { total: 144.84 },
  2: { total: 147.47 },
  3: { total: 149.19 },
  4: { total: 151.95 },
  5: { total: 152.79 },
});
const CAMISA_PRECO_UNITARIO = 65;
const CAMISA_PRECO_PROMOCIONAL = 60;
const CAMISA_MINIMO_PROMOCAO = 2;
const CAMISA_MAX_UNIDADES = 10;
function calcularCamisas(quantidade) {
  const qtd = Math.max(0, Number(quantidade) || 0);
  const unitario = qtd >= CAMISA_MINIMO_PROMOCAO ? CAMISA_PRECO_PROMOCIONAL : CAMISA_PRECO_UNITARIO;
  return {
    quantidade: qtd,
    unitario,
    subtotal: Math.round(qtd * unitario * 100) / 100,
    desconto: Math.round(qtd * (CAMISA_PRECO_UNITARIO - unitario) * 100) / 100,
  };
}
function ticketQuote(baseTotal, paymentMethod, installments) {
  if (paymentMethod === 'PIX') return { total: Math.round(Number(baseTotal) * 100) / 100, installmentValue: Number(baseTotal), installments: 1 };
  const option = TICKET_CARD_OPTIONS[Number(installments)];
  if (!option) throw new Error('Quantidade de parcelas inválida.');
  const total = Math.round(option.total * (Number(baseTotal) / 139) * 100) / 100;
  return { total, installmentValue: Math.round((total / Number(installments)) * 100) / 100, installments: Number(installments) };
}

// ═══ NÚCLEO DE NORMALIZAÇÃO M31 — ONDA 2 (regra ÚNICA; espelho de src/lib/m31Normalizar.js) ═══
function m31Telefone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  while (d.startsWith('5555')) d = d.slice(2);
  if (!d) return { valor: '', desfecho: 'irrecuperavel', motivo: 'telefone_vazio' };
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return { valor: d, desfecho: 'certo', motivo: null };
  if (d.length === 10 || d.length === 11) return { valor: `55${d}`, desfecho: 'certo', motivo: null };
  if (d.length === 8 || d.length === 9) return { valor: d, desfecho: 'duvidoso', motivo: 'sem_ddd' };
  if (d.length > 13) return { valor: d, desfecho: 'duvidoso', motivo: 'digitos_excedentes' };
  return { valor: d, desfecho: 'irrecuperavel', motivo: 'telefone_curto' };
}
function m31Cpf(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (!d) return { valor: '', desfecho: 'certo', motivo: null };
  if (d.length === 11) return { valor: d, desfecho: 'certo', motivo: null };
  return { valor: d, desfecho: 'duvidoso', motivo: 'cpf_incompleto' };
}
function m31Email(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return { valor: '', desfecho: 'certo', motivo: null };
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { valor: v, desfecho: 'certo', motivo: null };
  return { valor: v, desfecho: 'duvidoso', motivo: 'email_suspeito' };
}
function m31Revisao(originais, resultados) {
  const motivos = resultados.filter((r) => r && r.desfecho === 'duvidoso').map((r) => r.motivo);
  if (motivos.length === 0) return { revisao_dados: false, revisao_motivos: [] };
  return {
    revisao_dados: true,
    revisao_motivos: motivos,
    revisao_valores_originais: JSON.stringify(originais).slice(0, 500),
    revisao_em: new Date().toISOString(),
  };
}
function sanitizePhone(phone) {
  return m31Telefone(phone).valor;
}

// fetch com timeout (default 15s) — evita travar o checkout se o Asaas ficar lento
async function fetchAsaas(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error(`Timeout: Asaas não respondeu em ${timeoutMs / 1000}s`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function isCheckoutExpirado(updatedDate, maxMinutos = 1440) {
  if (!updatedDate) return true;
  const idadeMs = Date.now() - new Date(updatedDate).getTime();
  return idadeMs > maxMinutos * 60 * 1000;
}

// ── ASAAS BEST PRACTICE: Verificar pagamentos pendentes por CPF ──────────────
// Seguindo a documentação do Asaas: antes de criar um novo checkout, verificar
// se o cliente (customer) já possui um pagamento PENDING no Asaas.
// Isto previne múltiplos checkouts para a mesma pessoa, mesmo que ela tenha
// inscrições diferentes no nosso banco.
async function checkExistingAsaasPayment(cpf, ASAAS_KEY, ASAAS_BASE) {
  if (!cpf || cpf.length < 11) return null;
  try {
    // 1. Buscar customer por CPF (Asaas deduplica customers por cpfCnpj)
    const custRes = await fetchAsaas(`${ASAAS_BASE}/customers?cpfCnpj=${cpf}`, {
      headers: { 'access_token': ASAAS_KEY }
    });
    const custData = await custRes.json();
    if (!custData?.data || custData.data.length === 0) return null;

    const customerId = custData.data[0].id;

    // 2. Listar pagamentos PENDING do customer
    const payRes = await fetchAsaas(`${ASAAS_BASE}/payments?customer=${customerId}&status=PENDING&limit=5`, {
      headers: { 'access_token': ASAAS_KEY }
    });
    const payData = await payRes.json();
    if (payData?.data && payData.data.length > 0) {
      const pending = payData.data[0];
      if (pending.invoiceUrl) {
        return { url: pending.invoiceUrl, payment_id: pending.id, value: pending.value };
      }
    }
    return null;
  } catch (e) {
    logger.log('[Asaas Dedup] Erro ao verificar pagamento existente:', e.message);
    return null;
  }
}

// ── ANCORA DETERMINÍSTICA: externalReference = {cpf}-M31FILHAS ────────────────
// Torna a duplicata impossível por construção. Antes de criar QUALQUER checkout,
// procura no Asaas uma cobrança já existente com este externalReference
// (independente de status). Se achar, devolve o pagamento/link para reutilizar
// — nunca cria um segundo. Cobre a brecha TOCTOU de submissões simultâneas,
// porque o externalReference é o mesmo para o mesmo CPF+evento.
function buildExternalRef(cpfLimpo, paymentMethod = 'PIX', installments = 1) {
  return cpfLimpo && cpfLimpo.length === 11 ? `${cpfLimpo}-M31FILHAS-${paymentMethod}-${installments}` : null;
}

async function findAsaasByExternalRef(externalRef, ASAAS_KEY, ASAAS_BASE) {
  if (!externalRef) return null;
  try {
    const res = await fetchAsaas(`${ASAAS_BASE}/payments?externalReference=${encodeURIComponent(externalRef)}&limit=10`, {
      headers: { 'access_token': ASAAS_KEY }
    });
    const data = await res.json();
    if (!data?.data || data.data.length === 0) return null;
    // Preferir cobrança já confirmada/recebida; senão a pendente; senão a primeira
    const confirmadas = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'DUNNING_RECEIVED'];
    const paga = data.data.find(p => confirmadas.includes(p.status));
    const pendente = data.data.find(p => p.status === 'PENDING');
    const escolhida = paga || pendente || data.data[0];
    return {
      payment_id: escolhida.id,
      url: escolhida.invoiceUrl || null,
      value: escolhida.value,
      status: escolhida.status,
      externalReference: escolhida.externalReference,
    };
  } catch (e) {
    logger.log('[Asaas ExternalRef] Erro ao buscar por externalReference:', e.message);
    return null;
  }
}

// ── Verificar se um erro é de unique constraint (E11000) ─────────────────────
function isDuplicateKeyError(err) {
  const msg = (err?.message || '').toLowerCase();
  return msg.includes('duplicate') || msg.includes('e11000') || msg.includes('dedup_key') || msg.includes('unique');
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    let { nome, email, whatsapp, cpf, cidade, estado, tipo, area_voluntario, caravana_id, caravana_nome, cupom_codigo, faz_parte_igreja, nome_igreja, isGift, presenteado_whatsapp, presenteado_nome, presenteado_email, inscricao_id, modelo_camisa, tamanho_camisa, camisas_selecionadas } = body;

    const ASAAS_KEY = config("ASAAS_API_KEY");
    const ASAAS_BASE = "__ASAAS_API__";
    const paymentMethod = String(body.payment_method || 'PIX').toUpperCase();
    const installmentCount = Number(body.installments || 1);
    if (!['PIX', 'CREDIT_CARD'].includes(paymentMethod)) return Response.json({ error: 'Forma de pagamento inválida.' }, { status: 400 });
    if (paymentMethod === 'CREDIT_CARD' && !TICKET_CARD_OPTIONS[installmentCount]) return Response.json({ error: 'Escolha uma parcela válida.' }, { status: 400 });
    if (paymentMethod === 'PIX' && installmentCount !== 1) return Response.json({ error: 'PIX não possui parcelas.' }, { status: 400 });
    if (tipo === 'caravana' && paymentMethod === 'CREDIT_CARD' && installmentCount > 2) return Response.json({ error: 'O fluxo de caravana ainda permite cartão em até 2x.' }, { status: 400 });

    // ═══ NORMALIZAÇÃO (regra única — Onda 2) ═══
    const telRes = m31Telefone(whatsapp);
    const cpfRes = m31Cpf(cpf);
    const emailRes = m31Email(email);
    const cpfLimpo = cpfRes.desfecho === 'certo' ? cpfRes.valor : '';
    const emailLimpo = emailRes.valor;
    const whatsappFull = telRes.valor;
    const revisao = m31Revisao({ whatsapp: whatsapp || '', cpf: cpf || '', email: email || '' }, [telRes, cpfRes, emailRes]);

    // ═══ DEDUP_KEY (chave de deduplicação atômica) ═══
    // CPF:{cpf} para inscrições com CPF | GIFT:{wa}:{ts} para presentes
    const dedupKey = cpfLimpo && cpfLimpo.length === 11
      ? `CPF:${cpfLimpo}`
      : `GIFT:${whatsappFull}:${Date.now()}`;

    // ═══ DECLARAR VARIÁVEIS (antes do bloco de dedup para evitar TDZ) ═══
    const codigo_inscricao = `M31-${Date.now().toString(36).toUpperCase()}`;
    let codigo_inscricao_usar = codigo_inscricao;
    let inscricao;
    let loteAtivo;
    let camisaItens: { modelo: string; cor: string | null; tamanho: string }[] = [];
    let camisaResumo = calcularCamisas(0);

    // ═══ DEDUP PRIMARY: buscar inscrição existente por dedup_key ═══
    // RODA SEMPRE — independe de inscricao_id vindo do frontend.
    // O dedup_key (CPF:{cpf}) é a fonte de verdade. Se existir uma inscrição
    // ativa com este CPF, ela toma prioridade sobre qualquer inscricao_id.
    // O unique index no create()/update() é a defesa atômica secundária.
    if (cpfLimpo && cpfLimpo.length === 11) {
      const existing = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
        { dedup_key: dedupKey }, '-updated_date', 1
      );
      if (existing && existing.length > 0) {
        const existingInsc = existing[0];

        // Já aprovado → bloquear (nunca permitir segunda inscrição paga)
        if (existingInsc.status_pagamento === 'aprovado') {
          return Response.json({
            error: 'Você já está inscrito no M31 Filhas!',
            duplicata: true,
            inscricao_existente: {
              id: existingInsc.id, nome: existingInsc.nome,
              codigo: existingInsc.codigo_inscricao, status: 'aprovado',
              mensagem: 'Sua inscrição já foi confirmada. Verifique seu WhatsApp.'
            }
          }, { status: 409 });
        }

        // Checkout pendente: NÃO retornar link antigo sem verificar no Asaas.
        // O updated_date é atualizado por qualquer update no registro, não reflete
        // quando o checkout foi criado. O Asaas expira a sessão em 24h após criação.
        // Deixar o fluxo continuar para que findAsaasByExternalRef verifique o real
        // estado no Asaas, e gere novo checkout se necessário.
        
        // Checkout expirado ou abandonado → reutilizar registro canônico
        // Sobrescreve inscricao_id do frontend com o registro correto do banco
        inscricao_id = existingInsc.id;
        inscricao = existingInsc;
        codigo_inscricao_usar = existingInsc.codigo_inscricao || codigo_inscricao;
      }
    }

    // === VOLUNTÁRIO: gratuito ===
    if (tipo === 'voluntario') {
      try {
        inscricao = await base44.asServiceRole.entities.EventoM31Inscricao.create({
          ...revisao, nome, email: emailLimpo, whatsapp: whatsappFull, cpf: cpfLimpo, cidade, estado,
          faz_parte_igreja: faz_parte_igreja ?? null,
          nome_igreja: nome_igreja || '',
          tipo: 'voluntario',
          origem_inscricao: 'VOLUNTARIO',
          dedup_key: dedupKey,
          area_voluntario,
          status_pagamento: 'gratuito',
          valor_pago: 0,
          codigo_inscricao,
          checkin_realizado: false
        });
      } catch (createErr) {
        if (isDuplicateKeyError(createErr)) {
          return Response.json({
            error: 'Você já possui uma inscrição no M31 Filhas!',
            duplicata: true,
          }, { status: 409 });
        }
        throw createErr;
      }
      return Response.json({ success: true, inscricao_id: inscricao.id, codigo_inscricao, tipo: 'gratuito', redirect_url: '/obrigado' });
    }

    // === CUPOM DE DOAÇÃO: gratuito ===
    if (tipo === 'doacao' && cupom_codigo) {
      const cupons = await base44.asServiceRole.entities.EventoM31Cupom.filter({ codigo: cupom_codigo.toUpperCase() });
      if (!cupons || cupons.length === 0) {
        return Response.json({ error: 'Cupom inválido' }, { status: 400 });
      }
      const cupom = cupons[0];
      if (cupom.usado) {
        return Response.json({ error: 'Este cupom já foi utilizado' }, { status: 400 });
      }

      try {
        inscricao = await base44.asServiceRole.entities.EventoM31Inscricao.create({
          ...revisao, nome, email: emailLimpo, whatsapp: whatsappFull, cpf: cpfLimpo, cidade, estado,
          faz_parte_igreja: faz_parte_igreja ?? null,
          nome_igreja: nome_igreja || '',
          tipo: 'doacao',
          origem_inscricao: 'CORTESIA',
          dedup_key: dedupKey,
          status_pagamento: 'gratuito',
          valor_pago: 0,
          cupom_usado: cupom_codigo.toUpperCase(),
          codigo_inscricao,
          checkin_realizado: false
        });
      } catch (createErr) {
        if (isDuplicateKeyError(createErr)) {
          return Response.json({
            error: 'Você já possui uma inscrição no M31 Filhas!',
            duplicata: true,
          }, { status: 409 });
        }
        throw createErr;
      }

      await base44.asServiceRole.entities.EventoM31Cupom.update(cupom.id, {
        usado: true, usado_por_email: email, usado_em: new Date().toISOString(), inscricao_id: inscricao.id
      });

      return Response.json({ success: true, inscricao_id: inscricao.id, codigo_inscricao, tipo: 'gratuito', redirect_url: '/obrigado' });
    }

    // === CARAVANA: pagamento via Asaas ===
    if (tipo === 'caravana') {
      if (!caravana_id) {
        return Response.json({ error: 'Caravana não informada' }, { status: 400 });
      }
      const lotes = await base44.asServiceRole.entities.EventoM31Lote.filter({ ativo: true });
      loteAtivo = lotes[0];
      if (!loteAtivo) return Response.json({ error: 'Nenhum lote ativo no momento' }, { status: 400 });
      const valor = loteAtivo.valor;

      // Reutilizar link se válido
      if (inscricao_id) {
        const inscExistenteCaravana = await base44.asServiceRole.entities.EventoM31Inscricao.get(inscricao_id);
        if (inscExistenteCaravana?.asaas_charge_url && !isCheckoutExpirado(inscExistenteCaravana.updated_date)) {
          return Response.json({
            success: true, inscricao_id: inscExistenteCaravana.id,
            codigo_inscricao: inscExistenteCaravana.codigo_inscricao || codigo_inscricao,
            payment_url: inscExistenteCaravana.asaas_charge_url, lote: loteAtivo.nome,
            valor: inscExistenteCaravana.valor_pago, tipo: 'pago', redirect_url: '/obrigado', reutilizado: true,
          });
        }
      }

      // ASAAS BEST PRACTICE: verificar pagamento pendente antes de criar checkout
      const asaasPending = await checkExistingAsaasPayment(cpfLimpo, ASAAS_KEY, ASAAS_BASE);
      if (asaasPending) {
        return Response.json({
          success: true, codigo_inscricao, payment_url: asaasPending.url,
          lote: loteAtivo.nome, valor, tipo: 'pago', redirect_url: '/obrigado',
          reutilizado_asaas: true,
        });
      }

      const checkoutRes = await fetchAsaas(`${ASAAS_BASE}/checkouts`, {
        method: 'POST',
        headers: { 'access_token': ASAAS_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billingTypes: ['PIX', 'CREDIT_CARD'],
          chargeTypes: ['DETACHED', 'INSTALLMENT'],
          installment: { maxInstallmentCount: 2 },
          minutesToExpire: 1440,
          externalReference: codigo_inscricao,
          customer: {
            name: nome,
            email: emailLimpo,
            cpfCnpj: cpfLimpo,
            mobilePhone: whatsappFull,
          },
          callback: {
            successUrl: '__APP_ORIGIN__/obrigado',
            cancelUrl: '__APP_ORIGIN__/m31-inscricao',
            expiredUrl: '__APP_ORIGIN__/m31-inscricao'
          },
          items: [{ name: `M31 Filhas - Caravana`, description: `Inscrição Caravana ${caravana_nome} - ${nome}`, value: valor, quantity: 1 }],
        })
      });
      const checkout = await checkoutRes.json();
      if (!checkout.link) return Response.json({ error: 'Erro ao criar checkout no Asaas', details: checkout }, { status: 500 });

      if (inscricao_id) {
        await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao_id, {
          asaas_charge_url: checkout.link, asaas_checkout_id: checkout.id || null, asaas_checkout_status: checkout.status || 'ACTIVE',
          status_pagamento: 'checkout_pendente', valor_pago: valor,
        });
        return Response.json({ success: true, inscricao_id, codigo_inscricao, payment_url: checkout.link, tipo: 'pago' });
      }

      try {
        inscricao = await base44.asServiceRole.entities.EventoM31Inscricao.create({
          ...revisao, nome, email: emailLimpo, whatsapp: whatsappFull, cpf: cpfLimpo, cidade, estado,
          faz_parte_igreja: faz_parte_igreja ?? null, nome_igreja: nome_igreja || '',
          tipo: 'caravana', origem_inscricao: 'CARAVANA', dedup_key: dedupKey,
          lote: loteAtivo.codigo, valor_pago: valor, status_pagamento: 'checkout_pendente',
          asaas_charge_url: checkout.link, asaas_checkout_id: checkout.id || null, asaas_checkout_status: checkout.status || 'ACTIVE',
          caravana_id, caravana_nome, codigo_inscricao, checkin_realizado: false
        });
      } catch (createErr) {
        if (isDuplicateKeyError(createErr)) {
          // Já existe inscrição com este CPF — atualizar com novo checkout
          const existing = await base44.asServiceRole.entities.EventoM31Inscricao.filter({ dedup_key: dedupKey }, '-updated_date', 1);
          if (existing.length > 0) {
            await base44.asServiceRole.entities.EventoM31Inscricao.update(existing[0].id, {
              asaas_charge_url: checkout.link, asaas_checkout_id: checkout.id || null, asaas_checkout_status: checkout.status || 'ACTIVE',
              status_pagamento: 'checkout_pendente', valor_pago: valor,
              ...revisao, nome, email: emailLimpo, whatsapp: whatsappFull, cpf: cpfLimpo, cidade, estado,
              caravana_id, caravana_nome,
            });
            return Response.json({ success: true, inscricao_id: existing[0].id, codigo_inscricao: existing[0].codigo_inscricao, payment_url: checkout.link, tipo: 'pago' });
          }
        }
        throw createErr;
      }

      const caravana = await base44.asServiceRole.entities.EventoM31Caravana.filter({ id: caravana_id });
      if (caravana[0]) {
        await base44.asServiceRole.entities.EventoM31Caravana.update(caravana_id, { total_membros: (caravana[0].total_membros || 0) + 1 });
      }
      return Response.json({ success: true, inscricao_id: inscricao.id, codigo_inscricao, payment_url: checkout.link, tipo: 'pago' });
    }

    // ═══ PÚBLICO GERAL: pagamento via Asaas ═══
    if (inscricao_id) {
      // Atualizar inscrição existente (lead ou checkout abandonado)
      inscricao = await base44.asServiceRole.entities.EventoM31Inscricao.get(inscricao_id);
      if (!inscricao) return Response.json({ error: 'Inscrição não encontrada' }, { status: 404 });

      codigo_inscricao_usar = inscricao.codigo_inscricao || codigo_inscricao;
      nome = nome || inscricao.nome;
      email = email || inscricao.email;
      whatsapp = whatsapp || inscricao.whatsapp;
      cpf = cpf || inscricao.cpf;
      cidade = cidade || inscricao.cidade;
      estado = estado || inscricao.estado;

      // Sempre usar o lote ATIVO (atual), não o lote antigo da inscrição.
      // Assim, inscrições pendentes que retornam ao formulário atualizam
      // para o lote/preço vigente (ex: 3º lote) ao gerar novo checkout.
      const lotesAtivos = await base44.asServiceRole.entities.EventoM31Lote.filter({ ativo: true });
      loteAtivo = (lotesAtivos && lotesAtivos.length > 0) ? lotesAtivos[0] : null;
      if (!loteAtivo) {
        const lotesIns = await base44.asServiceRole.entities.EventoM31Lote.filter({ codigo: inscricao.lote });
        loteAtivo = lotesIns[0];
      }
      if (!loteAtivo) return Response.json({ error: 'Nenhum lote ativo encontrado' }, { status: 400 });

      // Garantir que dedup_key está setada na inscrição existente
      if (!inscricao.dedup_key && cpfLimpo && cpfLimpo.length === 11) {
        const finalDedupKey = `CPF:${cpfLimpo}`;
        try {
          await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao_id, { dedup_key: finalDedupKey });
        } catch (dedupErr) {
          if (isDuplicateKeyError(dedupErr)) {
            // Outra inscrição já tem este CPF — bloquear
            return Response.json({
              error: 'Você já possui uma inscrição ativa no M31 Filhas. Verifique seu WhatsApp para o link de pagamento.',
              duplicata: true,
            }, { status: 409 });
          }
        }
      }
    } else {
      // Criar nova inscrição com dedup_key (unique index é a garantia atômica)
      const lotes = await base44.asServiceRole.entities.EventoM31Lote.filter({ ativo: true });
      loteAtivo = lotes[0];
      let loteEsgotado = false;
      let semLoteAtivo = false;

      if (!loteAtivo) {
        semLoteAtivo = true;
        const todosLotes = await base44.asServiceRole.entities.EventoM31Lote.list('-ordem', 10);
        loteAtivo = todosLotes[0];
        if (!loteAtivo) return Response.json({ error: 'Nenhum lote cadastrado no sistema. Contate o suporte.' }, { status: 500 });
      } else if (loteAtivo.vagas_usadas >= loteAtivo.vagas_total) {
        loteEsgotado = true;
      }

      if (loteEsgotado || semLoteAtivo) {
        const motivo = semLoteAtivo ? 'sem próximo lote configurado' : 'lote esgotado';
        try {
          await base44.asServiceRole.functions.invoke('m31AlertarGestor', {
            tipo_erro: 'inscricao_lote_esgotado', gravidade: 'alto', origem: 'formulario',
            descricao: `Inscrição criada com ${motivo}. Participante: ${nome} | Lote: ${loteAtivo.nome} (${loteAtivo.vagas_usadas}/${loteAtivo.vagas_total})`,
            possivel_causa: semLoteAtivo ? 'Nenhum lote marcado como ativo' : 'Capacidade do lote atingida',
            acao_recomendada: 'Ativar o próximo lote ou aumentar a capacidade',
            pessoa_nome: nome, pessoa_email: email, pessoa_telefone: whatsapp,
          });
        } catch (_) {}
      }

      const valorTotalIngresso = isGift && presenteado_whatsapp ? loteAtivo.valor * 2 : loteAtivo.valor;
      const quantidadeIngressos = isGift && presenteado_whatsapp ? 2 : 1;

      // TENTAR CRIAR COM DEDUP_KEY — unique index é a garantia atômica
      try {
        inscricao = await base44.asServiceRole.entities.EventoM31Inscricao.create({
          ...revisao, nome, email: emailLimpo, whatsapp: whatsappFull, cpf: cpfLimpo, cidade, estado,
          faz_parte_igreja: faz_parte_igreja ?? null, nome_igreja: nome_igreja || '',
          tipo: 'publico_geral', origem_inscricao: 'ASAAS', dedup_key: dedupKey,
          lote: loteAtivo.codigo, valor_pago: valorTotalIngresso,
          status_pagamento: 'checkout_pendente', codigo_inscricao, checkin_realizado: false
        });
      } catch (createErr) {
        if (isDuplicateKeyError(createErr)) {
          // ═══ DEFESA ATÔMICA: unique index detectou duplicata ═══
          // O filtro pode falhar em contexto não-autenticado, mas o unique index NUNCA falha.
          const existing = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
            { dedup_key: dedupKey }, '-updated_date', 1
          );
          if (existing && existing.length > 0) {
            const existingInsc = existing[0];

            // Já aprovado
            if (existingInsc.status_pagamento === 'aprovado') {
              return Response.json({
                error: 'Você já está inscrito no M31 Filhas!',
                duplicata: true,
                inscricao_existente: {
                  id: existingInsc.id, nome: existingInsc.nome,
                  codigo: existingInsc.codigo_inscricao, status: 'aprovado',
                }
              }, { status: 409 });
            }

            // Checkout pendente e válido
            if (existingInsc.asaas_charge_url && !isCheckoutExpirado(existingInsc.updated_date)
              && String(existingInsc.payment_method || 'PIX').toUpperCase() === paymentMethod
              && Number(existingInsc.installment_count || 1) === installmentCount) {
              return Response.json({
                success: true, inscricao_id: existingInsc.id,
                codigo_inscricao: existingInsc.codigo_inscricao,
                payment_url: existingInsc.asaas_charge_url,
                valor: existingInsc.valor_pago, tipo: 'pago', redirect_url: '/obrigado',
                reutilizado: true, dedup_atomic: true,
              });
            }

            // Checkout expirado — reutilizar registro, gerar novo checkout
            inscricao = existingInsc;
            codigo_inscricao_usar = existingInsc.codigo_inscricao || codigo_inscricao;

            // Atualizar dados da inscrição existente
            await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
              ...revisao, nome, email: emailLimpo, whatsapp: whatsappFull, cpf: cpfLimpo, cidade, estado,
              faz_parte_igreja: faz_parte_igreja ?? null, nome_igreja: nome_igreja || '',
              status_pagamento: 'checkout_pendente',
              valor_pago: isGift && presenteado_whatsapp ? loteAtivo.valor * 2 : loteAtivo.valor,
            });
          } else {
            // Filtro não retornou (possível RLS), mas unique index bloqueou.
            // Retornar mensagem genérica — o usuário deve contatar suporte.
            return Response.json({
              error: 'Você já possui uma inscrição ativa no M31 Filhas. Verifique seu WhatsApp ou contate o suporte para receber seu link de pagamento.',
              duplicata: true,
              dedup_atomic: true,
            }, { status: 409 });
          }
        } else {
          throw createErr;
        }
      }
    }

    // Validar Order Bump de camisa SOMENTE no fluxo público geral.
    // Preço vem do servidor; tipo, cor e tamanho precisam existir no catálogo ativo.
    const unidadesRecebidas = Array.isArray(camisas_selecionadas) ? camisas_selecionadas : [];
    if (unidadesRecebidas.length === 0 && (modelo_camisa || tamanho_camisa)) {
      unidadesRecebidas.push({ modelo: modelo_camisa, cor: body.cor_camisa, tamanho: tamanho_camisa });
    }
    if (unidadesRecebidas.length > 0) {
      if (inscricao?.asaas_charge_url) {
        return Response.json({ error: 'Camisa não pode ser adicionada a um checkout já existente. Conclua ou regularize o checkout atual.' }, { status: 409 });
      }
      if (unidadesRecebidas.length > CAMISA_MAX_UNIDADES) {
        return Response.json({ error: `Limite de ${CAMISA_MAX_UNIDADES} camisas por inscrição.` }, { status: 400 });
      }
      const produtosAtivos = await base44.asServiceRole.entities.M31ProdutoCamisa.filter({ ativo: true });
      const catalogo = new Map<string, any[]>();
      for (const produto of produtosAtivos || []) {
        if (!produto?.modelo) continue;
        if (!catalogo.has(produto.modelo)) catalogo.set(produto.modelo, []);
        catalogo.get(produto.modelo)!.push(produto);
      }
      for (const unidade of unidadesRecebidas) {
        const modelo = String(unidade?.modelo || '').trim().toLowerCase();
        const tamanho = String(unidade?.tamanho || '').trim().toUpperCase();
        const lista = catalogo.get(modelo);
        if (!lista?.length) return Response.json({ error: 'Camisa indisponível para venda.' }, { status: 409 });
        const tamanhosValidos = new Set<string>();
        for (const produto of lista) {
          (produto.tamanhos || []).forEach((item: string) => tamanhosValidos.add(String(item).toUpperCase()));
        }
        if (!tamanho || !tamanhosValidos.has(tamanho)) {
          return Response.json({ error: 'Selecione um tamanho válido para a camisa.' }, { status: 400 });
        }
        const coresDisponiveis = lista.filter((produto) => produto.cor).map((produto) => String(produto.cor).trim().toLowerCase());
        let cor = String(unidade?.cor || '').trim().toLowerCase();
        if (coresDisponiveis.length > 1) {
          if (!cor || !coresDisponiveis.includes(cor)) return Response.json({ error: 'Selecione a cor da camisa.' }, { status: 400 });
        } else {
          cor = coresDisponiveis[0] || '';
        }
        camisaItens.push({ modelo, cor: cor || null, tamanho });
      }
      camisaResumo = calcularCamisas(camisaItens.length);
    }

    // Cupom promocional reutilizável. O backend é a única autoridade do preço.
    // Não usa EventoM31Cupom.usado porque ESPOSADELGND é multiuso por definição.
    const cupomNormalizado = String(cupom_codigo || '').trim().toUpperCase();
    if (cupomNormalizado && cupomNormalizado !== 'ESPOSADELGND') {
      return Response.json({ error: 'Cupom inválido ou indisponível' }, { status: 400 });
    }
    const cupomAplicado = cupomNormalizado === 'ESPOSADELGND';
    const valorOriginalIngressoUnit = Number(loteAtivo.valor || 0);
    const valorFinalIngressoUnit = cupomAplicado ? 110 : valorOriginalIngressoUnit;
    const quantidadeIngressos = isGift && presenteado_whatsapp ? 2 : 1;
    const valorTotalIngresso = valorFinalIngressoUnit * quantidadeIngressos;
    const descontoCupom = cupomAplicado ? Math.round((valorOriginalIngressoUnit - valorFinalIngressoUnit) * quantidadeIngressos * 100) / 100 : 0;
    const valorTotalCompra = Math.round((valorTotalIngresso + camisaResumo.subtotal) * 100) / 100;
    const camisasPersistidas = camisaItens.map((unidade) => ({
      modelo: unidade.modelo,
      cor: unidade.cor,
      tamanho: unidade.tamanho,
      preco_unitario: camisaResumo.unitario,
      valor: camisaResumo.unitario,
      entregue: false,
    }));
    const quote = ticketQuote(valorTotalCompra, paymentMethod, installmentCount);

    await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
      comprou_camisa: camisaItens.length > 0,
      modelo_camisa: camisaItens.length === 1 ? camisaItens[0].modelo : null,
      tamanho_camisa: camisaItens.length === 1 ? camisaItens[0].tamanho : null,
      camisa_valor: camisaResumo.subtotal,
      camisa_status: camisaItens.length > 0 ? 'pagamento_pendente' : null,
      camisas: camisasPersistidas,
      cupom_usado: cupomAplicado ? cupomNormalizado : null,
      cupom_valor_original: cupomAplicado ? valorOriginalIngressoUnit : null,
      cupom_desconto: cupomAplicado ? descontoCupom : null,
      cupom_valor_final_ingresso: cupomAplicado ? valorFinalIngressoUnit : null,
      valor_pago: valorTotalCompra,
    });

    // ═══ ÂNCORA DETERMINÍSTICA (raiz da duplicata) ═══
    // externalReference = {cpf}-M31FILHAS. Se o Asaas já tem uma cobrança com
    // este reference, reutiliza SEMPRE — impossível criar uma segunda para o
    // mesmo CPF+evento, mesmo em submissões simultâneas.
    const externalRef = buildExternalRef(cpfLimpo, paymentMethod, installmentCount);
    const asaasExistente = await findAsaasByExternalRef(externalRef, ASAAS_KEY, ASAAS_BASE);
    if (asaasExistente) {
      const confirmadas = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'DUNNING_RECEIVED'];
      const jaPaga = confirmadas.includes(asaasExistente.status);
      await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
        lote: loteAtivo.codigo,
        asaas_charge_url: asaasExistente.url || inscricao.asaas_charge_url,
        asaas_payment_id: asaasExistente.payment_id,
        asaas_checkout_id: asaasExistente.payment_id || null,
        status_pagamento: jaPaga ? 'aprovado' : 'checkout_pendente',
        valor_pago: asaasExistente.value || valorTotalCompra,
      });
      return Response.json({
        success: true, inscricao_id: inscricao.id, codigo_inscricao: codigo_inscricao_usar,
        payment_url: asaasExistente.url, lote: loteAtivo?.nome || '', valor: asaasExistente.value || valorTotalCompra,
        tipo: 'pago', redirect_url: '/obrigado', reutilizado_asaas: true, ancora_external_ref: externalRef,
      });
    }

    // Reutilização por customer só é segura para PIX; no cartão a parcela
    // escolhida precisa gerar uma cobrança com total e installmentCount próprios.
    if (paymentMethod === 'PIX') {
      const asaasPending = await checkExistingAsaasPayment(cpfLimpo, ASAAS_KEY, ASAAS_BASE);
      if (asaasPending) {
        await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
          lote: loteAtivo.codigo,
          asaas_charge_url: asaasPending.url,
          asaas_payment_id: asaasPending.payment_id,
          asaas_checkout_id: asaasPending.payment_id || null,
          status_pagamento: 'checkout_pendente',
          valor_pago: asaasPending.value || valorTotalCompra,
        });
        return Response.json({
          success: true, inscricao_id: inscricao.id, codigo_inscricao: codigo_inscricao_usar,
          payment_url: asaasPending.url, lote: loteAtivo?.nome || '', valor: asaasPending.value || valorTotalCompra,
          tipo: 'pago', redirect_url: '/obrigado', reutilizado_asaas: true,
        });
      }
    }

    // Se é gift, criar inscrição "fantasma" do presenteado.
    // A criação NÃO pode depender de !inscricao_id: o formulário SEMPRE envia
    // inscricao_id (lead capturado cedo), então o guard antigo tornava o bloco
    // morto e a segunda participante nunca era criada. Agora criamos sempre que
    // isGift+telefone, desde que ainda não exista uma fantasma vinculada a esta compra.
    let inscricaoPresenteado = null;
    const fantasmaExistente = inscricao.presenteado_id
      ? await base44.asServiceRole.entities.EventoM31Inscricao.filter({ id: inscricao.presenteado_id })
      : [];
    if (isGift && presenteado_whatsapp && fantasmaExistente.length === 0) {
      const codigo_inscricao_presente = `M31-PRESENTE-${inscricao.id.slice(0, 8).toUpperCase()}`;
      const presenteadoDedupKey = `GIFT:${sanitizePhone(presenteado_whatsapp)}:${Date.now()}`;
      const nomePresenteado = (presenteado_nome || '').trim();
      const emailPresenteado = (presenteado_email || '').trim().toLowerCase();
      inscricaoPresenteado = await base44.asServiceRole.entities.EventoM31Inscricao.create({
        whatsapp: sanitizePhone(presenteado_whatsapp),
        nome: nomePresenteado || undefined,
        email: emailPresenteado || undefined,
        tipo: 'publico_geral', origem_inscricao: 'ASAAS', dedup_key: presenteadoDedupKey,
        // FINANCEIRO: a receita da compra pertence à COMPRADORA. A presenteada
        // fica com valor_pago 0 para que R$ 258 seja contado uma única vez.
        lote: loteAtivo.codigo, valor_pago: 0,
        status_pagamento: 'pendente', codigo_inscricao: codigo_inscricao_presente,
        presenteado_por_id: inscricao.id,
        observacoes: `Presente de ${nome}`,
        checkin_realizado: false
      });
    }

    // Criar cobrança fechada no Asaas. O cliente escolhe a parcela antes;
    // o invoiceUrl apenas coleta os dados do cartão ou exibe o PIX.
    const customerSearch = await fetchAsaas(`${ASAAS_BASE}/customers?cpfCnpj=${cpfLimpo}`, { headers: { 'access_token': ASAAS_KEY } });
    const customerData = await customerSearch.json();
    let customerId = customerData?.data?.[0]?.id;
    if (!customerId) {
      const customerRes = await fetchAsaas(`${ASAAS_BASE}/customers`, {
        method: 'POST',
        headers: { 'access_token': ASAAS_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nome, email: emailLimpo, cpfCnpj: cpfLimpo, mobilePhone: whatsappFull, notificationDisabled: true }),
      });
      const customer = await customerRes.json();
      if (!customerRes.ok || !customer.id) return Response.json({ error: 'Não foi possível cadastrar o pagador no Asaas.' }, { status: 502 });
      customerId = customer.id;
    }
    // BEGIN BASE44_ONLY_NOTIFICATIONS: also enforce for reused Asaas customers.
    const noticeResponse = await fetch('__ASAAS_API__/customers/' + customerId, {
      method: 'PUT', headers: { access_token: ASAAS_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationDisabled: true }),
      redirect: 'error', signal: AbortSignal.timeout(12000),
    });
    const noticeCustomer = await noticeResponse.json();
    if (!noticeResponse.ok || noticeCustomer.id !== customerId || noticeCustomer.notificationDisabled !== true)
      throw new Error('Não foi possível garantir a comunicação exclusiva pelo Base44. Nenhuma nova cobrança foi criada.');
    // END BASE44_ONLY_NOTIFICATIONS

    const paymentPayload = {
      customer: customerId,
      billingType: paymentMethod,
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      description: `M31 Filhas — ${quantidadeIngressos} ingresso(s) — ${paymentMethod === 'PIX' ? 'PIX' : `${installmentCount}x no cartão`}`,
      externalReference: externalRef || codigo_inscricao_usar,
      ...(paymentMethod === 'CREDIT_CARD' && installmentCount > 1 ? { installmentCount, totalValue: quote.total } : { value: quote.total }),
    };
    const paymentRes = await fetchAsaas(`${ASAAS_BASE}/payments`, { method: 'POST', headers: { 'access_token': ASAAS_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(paymentPayload) });
    const payment = await paymentRes.json();
    if (!paymentRes.ok || !payment.id || !payment.invoiceUrl) return Response.json({ error: 'Erro ao criar cobrança no Asaas', details: payment }, { status: 502 });
    const checkout = { id: payment.id, link: payment.invoiceUrl, status: payment.status };

    // Atualizar inscrição com os dados do checkout
    await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
      ...revisao, nome, email: emailLimpo, whatsapp: whatsappFull, cpf: cpfLimpo, cidade, estado,
      lote: loteAtivo.codigo,
      asaas_charge_url: checkout.link,
      asaas_checkout_id: checkout.id || null, asaas_checkout_status: checkout.status || 'ACTIVE',
      presenteado_whatsapp: presenteado_whatsapp || null,
      presenteado_id: inscricaoPresenteado?.id || null,
      status_pagamento: 'checkout_pendente',
      valor_pago: quote.total,
      payment_method: paymentMethod,
      installment_count: installmentCount,
      comprou_camisa: camisaItens.length > 0,
      modelo_camisa: camisaItens.length === 1 ? camisaItens[0].modelo : null,
      tamanho_camisa: camisaItens.length === 1 ? camisaItens[0].tamanho : null,
      camisa_valor: camisaResumo.subtotal,
      camisa_status: camisaItens.length > 0 ? 'pagamento_pendente' : null,
      camisas: camisasPersistidas,
      faz_parte_igreja: faz_parte_igreja ?? null,
      nome_igreja: nome_igreja || '',
      dedup_key: inscricao.dedup_key || dedupKey,
    });

    // Incrementar vagas usadas do lote apenas para inscrições novas
    if (!inscricao_id) {
      await base44.asServiceRole.entities.EventoM31Lote.update(loteAtivo.id, {
        vagas_usadas: loteAtivo.vagas_usadas + quantidadeIngressos
      });
    }

    return Response.json({
      success: true,
      inscricao_id: inscricao.id,
      codigo_inscricao: codigo_inscricao_usar,
      payment_url: checkout.link,
      lote: loteAtivo.nome,
      valor: quote.total || loteAtivo.valor,
      valor_total_base: valorTotalCompra,
      payment_method: paymentMethod,
      installment_count: installmentCount,
      quantidade: quantidadeIngressos,
      presenteado_id: inscricaoPresenteado?.id || null,
      tipo: 'pago',
      redirect_url: '/obrigado'
    });

  } catch (error) {
    try {
      const base44Alert = createClientFromRequest(req);
      await base44Alert.asServiceRole.functions.invoke('m31AlertarGestor', {
        tipo_erro: 'erro_formulario_inscricao',
        gravidade: 'critico',
        origem: 'formulario',
        descricao: `Erro ao processar inscrição: ${error.message}`,
        possivel_causa: 'Exceção não tratada no fluxo de inscrição/pagamento',
        acao_recomendada: 'Verificar logs da função m31CreatePayment e checar conexão com Asaas',
        dados_extras: { stack: error.stack?.slice(0, 500) },
      });
    } catch (_) {}
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
