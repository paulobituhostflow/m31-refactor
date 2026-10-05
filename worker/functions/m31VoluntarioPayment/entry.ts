// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
// Função exclusiva para inscrição de Voluntários (M31 Servir)
// Valor: R$ 60 (camisa) + R$ 60 opcional (camisa doada)
// Fluxos: completo (checkout normal) | so_camisa (atualiza só tamanho, sem cobrança)

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

function isDuplicateKeyError(err) {
  const msg = (err?.message || '').toLowerCase();
  return msg.includes('duplicate') || msg.includes('e11000') || msg.includes('dedup_key') || msg.includes('unique');
}

function isConfirmada(insc) {
  return !!(insc && (insc.status_pagamento === 'aprovado' || insc.status_pagamento === 'gratuito'));
}

function isConfirmadaSemEvidencia(insc) {
  if (!isConfirmada(insc)) return false;
  if (insc.status_pagamento === 'gratuito' || insc.origem_inscricao === 'CORTESIA') return false;
  const temOrigem = insc.origem_pagamento && insc.origem_pagamento !== 'desconhecida';
  const temData = !!insc.pagamento_confirmado_em;
  return !temOrigem && !temData;
}

function isConfirmadaComEvidencia(insc) {
  if (!isConfirmada(insc)) return false;
  if (insc.status_pagamento === 'gratuito' || insc.origem_inscricao === 'CORTESIA') return true;
  const temOrigem = insc.origem_pagamento && insc.origem_pagamento !== 'desconhecida';
  const temData = !!insc.pagamento_confirmado_em;
  return temOrigem || temData;
}

async function marcarRevisaoOrigem(base44, inscricao) {
  if (!isConfirmadaSemEvidencia(inscricao)) return;
  const obsAtual = inscricao.observacoes || '';
  if (!obsAtual.includes('[REVISAR_ORIGEM_FINANCEIRA]')) {
    await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
      observacoes: (obsAtual + ' [REVISAR_ORIGEM_FINANCEIRA]').trim(),
    });
  }
}

const ASAAS_BASE = "__ASAAS_API__";

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const {
      mode,
      nome, apelido, email, whatsapp, cpf, nascimento,
      cidade, estado, igreja,
      serviu_antes, areas_serviu, reunioes_presenciais, disponivel_evento, chegar_cedo,
      setor, habilidades, sobre_servir,
      tamanho_camisa,
      doar_camisa, doacao_destino, doacao_nome, doacao_whatsapp, doacao_tamanho,
      valor, valor_total,
      inscricao_id,
    } = body;

    const ASAAS_KEY = config("ASAAS_API_KEY");
    const VALOR_CAMISA = 60;

    // Consulta pública segura para retomar o próprio formulário.
    if (mode === 'consultar') {
      const telQ = m31Telefone(whatsapp).valor;
      const cpfQ = m31Cpf(cpf).valor;
      const emailQ = m31Email(email).valor;
      let achadas = [];
      if (cpfQ && cpfQ.length === 11) achadas = await base44.asServiceRole.entities.EventoM31Inscricao.filter({ cpf: cpfQ, tipo: 'voluntario' }, '-updated_date', 10).catch(() => []);
      if ((!achadas || !achadas.length) && telQ && telQ.length >= 12) achadas = await base44.asServiceRole.entities.EventoM31Inscricao.filter({ whatsapp: telQ, tipo: 'voluntario' }, '-updated_date', 10).catch(() => []);
      if ((!achadas || !achadas.length) && emailQ && emailQ.includes('@')) achadas = await base44.asServiceRole.entities.EventoM31Inscricao.filter({ email: emailQ, tipo: 'voluntario' }, '-updated_date', 10).catch(() => []);
      const insc = (achadas || []).find(i => i.tipo === 'voluntario') || null;
      if (!insc) return Response.json({ found: false });
      const perfis = await base44.asServiceRole.entities.EventoM31Voluntario.filter({ inscricao_id: insc.id }, '-updated_date', 1).catch(() => []);
      const perfil = perfis?.[0] || null;
      let obs = {};
      try { obs = perfil?.observacoes ? JSON.parse(perfil.observacoes) : {}; } catch {}
      return Response.json({ found: true, inscricao: {
        id: insc.id, tipo: 'voluntario', confirmada: isConfirmadaComEvidencia(insc), perfil_encontrado: Boolean(perfil), nome: insc.nome || '', email: insc.email || '', whatsapp: insc.whatsapp || '', cpf: insc.cpf || '',
        igreja: insc.nome_igreja || '', setor: insc.area_voluntario || perfil?.setor || '', status_pagamento: insc.status_pagamento || '',
        codigo_inscricao: insc.codigo_inscricao || '', payment_url: insc.asaas_charge_url || '',
        tamanho_camisa: perfil?.tamanho_camiseta || insc.tamanho_camisa || obs?.tamanho_camisa || '',
        serviu_antes: obs?.serviu_antes === true ? 'sim' : (obs?.serviu_antes === false ? 'nao' : '')
      }});
    }
    if (!ASAAS_KEY) return Response.json({ error: 'Pagamento temporariamente indisponível. Fale com o suporte.' }, { status: 503 });

    // ═══ NORMALIZAÇÃO (regra única — Onda 2) ═══
    const telRes = m31Telefone(whatsapp);
    const cpfRes = m31Cpf(cpf);
    const emailRes = m31Email(email);
    const cpfLimpo = cpfRes.desfecho === 'certo' ? cpfRes.valor : '';
    const whatsappFull = telRes.valor;
    const emailLimpo = emailRes.valor;
    const revisao = m31Revisao({ whatsapp: whatsapp || '', cpf: cpf || '', email: email || '' }, [telRes, cpfRes, emailRes]);

    // ═══ BUSCAR INSCRIÇÃO EXISTENTE ═══
    let inscricao;

    if (inscricao_id) {
      try { inscricao = await base44.asServiceRole.entities.EventoM31Inscricao.get(inscricao_id); } catch {}
      if (inscricao && (inscricao.tipo !== 'voluntario' || !((cpfLimpo && inscricao.cpf === cpfLimpo) || (whatsappFull && inscricao.whatsapp === whatsappFull) || (emailLimpo && inscricao.email === emailLimpo)))) inscricao = undefined;
    }
    if (!inscricao && cpfLimpo && cpfLimpo.length === 11) {
      const existing = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
        { dedup_key: `VOL:CPF:${cpfLimpo}`, tipo: 'voluntario' }, '-updated_date', 1
      );
      if (existing && existing.length > 0) inscricao = existing[0];
    }
    if (!inscricao && cpfLimpo && cpfLimpo.length === 11) {
      const existing = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
        { cpf: cpfLimpo, tipo: 'voluntario' }, '-updated_date', 1
      );
      if (existing && existing.length > 0) inscricao = existing[0];
    }

    // Participação no evento e inscrição para SERVIR são vínculos distintos.
    // Uma mulher já confirmada em Público Geral/Caravana NÃO está quitada como
    // voluntária: o pagamento de R$ 60 do Servir (camisa) continua devido.
    // Nunca converter/sobrescrever a inscrição de participante para voluntário.
    if (!inscricao && whatsappFull) inscricao = (await base44.asServiceRole.entities.EventoM31Inscricao.filter({ whatsapp: whatsappFull, tipo: 'voluntario' }, '-updated_date', 1))[0];
    if (!inscricao && emailLimpo) inscricao = (await base44.asServiceRole.entities.EventoM31Inscricao.filter({ email: emailLimpo, tipo: 'voluntario' }, '-updated_date', 1))[0];

    // ═══ MODO SO_CAMISA: atualizar só o tamanho da camisa, sem checkout ═══
    if (mode === 'so_camisa') {
      if (!inscricao) {
        return Response.json({ error: 'Inscrição não encontrada para atualizar camisa.' }, { status: 400 });
      }
      if (!isConfirmadaComEvidencia(inscricao)) {
        return Response.json({ error: 'Sua inscrição ainda não está confirmada com pagamento. Complete o pagamento primeiro.' }, { status: 400 });
      }
      if (!tamanho_camisa) {
        return Response.json({ error: 'Tamanho da camisa é obrigatório.' }, { status: 400 });
      }

      // Atualizar perfil de voluntária existente (ou criar se não houver)
      const existingVols = await base44.asServiceRole.entities.EventoM31Voluntario.filter(
        { inscricao_id: inscricao.id }, '-updated_date', 1
      );
      if (existingVols && existingVols.length > 0) {
        await base44.asServiceRole.entities.EventoM31Voluntario.update(existingVols[0].id, {
          tamanho_camiseta: tamanho_camisa,
        });
      } else {
        await base44.asServiceRole.entities.EventoM31Voluntario.create({
          nome: inscricao.nome || nome,
          whatsapp: inscricao.whatsapp || whatsappFull,
          email: inscricao.email || emailLimpo,
          setor: inscricao.area_voluntario || setor || 'intercessao',
          tamanho_camiseta: tamanho_camisa,
          status: 'pendente',
          checkin_evento: false,
          inscricao_id: inscricao.id,
          observacoes: JSON.stringify({ tamanho_camisa, serviu_antes: serviu_antes || false }),
        });
      }

      return Response.json({
        success: true,
        inscricao_id: inscricao.id,
        codigo_inscricao: inscricao.codigo_inscricao,
        payment_url: null,
        modo: 'so_camisa',
        redirect_url: '/obrigado',
      });
    }

    // ═══ MODO COMPLETO (fluxo normal com checkout) ═══
    if (!nome || !email || !whatsapp || !setor || !tamanho_camisa) {
      return Response.json({ error: 'Campos obrigatórios faltando' }, { status: 400 });
    }
    const tamanhoNormalizado = String(tamanho_camisa || '').trim().toUpperCase();
    const tamanhosValidos = ['PP','P','M','G','GG','XG','XGG'];
    if (!tamanhosValidos.includes(tamanhoNormalizado)) {
      return Response.json({ error: 'Selecione um tamanho de camisa válido.' }, { status: 400 });
    }

    const valorFinal = VALOR_CAMISA + (doar_camisa ? VALOR_CAMISA : 0);
    const descricaoValor = doar_camisa
      ? `M31 Filhas - Voluntária ${setor} (camisa + camisa doada)`
      : `M31 Filhas - Voluntária ${setor} (inclui camisa)`;

    const dedupKey = cpfLimpo && cpfLimpo.length === 11
      ? `VOL:CPF:${cpfLimpo}`
      : `VOL:WPP:${whatsappFull || Date.now()}`;

    let codigo_inscricao = `M31-VOL-${Date.now().toString(36).toUpperCase()}`;

    // Marcar para revisão se aprovada sem evidência (auditoria, antes de decidir bloqueio)
    if (inscricao) {
      await marcarRevisaoOrigem(base44, inscricao);
    }

    // Já aprovada com evidência financeira → bloquear novo checkout (nunca cobrar de novo)
    // Aprovadas sem evidência (origem desconhecida) prosseguem para pagamento
    if (inscricao && isConfirmadaComEvidencia(inscricao)) {
      return Response.json({
        success: true,
        inscricao_id: inscricao.id,
        codigo_inscricao: inscricao.codigo_inscricao,
        payment_url: null,
        ja_aprovado: true,
        mensagem: 'Sua inscrição já está confirmada! Não é necessário pagar novamente.',
        redirect_url: '/obrigado',
      });
    }

    if (inscricao) {
      codigo_inscricao = inscricao.codigo_inscricao || codigo_inscricao;
    }

    // ═══ CRIAR CHECKOUT NO ASAAS ═══
    const checkoutRes = await fetch(`${ASAAS_BASE}/checkouts`, {
      method: 'POST',
      headers: { 'access_token': ASAAS_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        billingTypes: ['PIX', 'CREDIT_CARD'],
        chargeTypes: ['DETACHED', 'INSTALLMENT'],
        installment: { maxInstallmentCount: 3 },
        minutesToExpire: 1440,
        externalReference: codigo_inscricao,
        callback: {
          successUrl: '__APP_ORIGIN__/obrigado',
          cancelUrl: '__APP_ORIGIN__/m31-servir',
          expiredUrl: '__APP_ORIGIN__/m31-servir'
        },
        items: [{
          name: `M31 Filhas - Voluntaria`,
          description: `Setor: ${setor} - Camisa: ${tamanhoNormalizado}`,
          value: valorFinal,
          quantity: 1
        }]
      })
    });
    const checkout = await checkoutRes.json();
    if (!checkout.link) {
      return Response.json({ error: 'Erro ao criar checkout no Asaas', details: checkout }, { status: 500 });
    }

    // ═══ SALVAR / ATUALIZAR INSCRIÇÃO (preservando código e histórico) ═══
    if (inscricao) {
      // Atualizar inscrição existente com novo checkout
      await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
        ...revisao,
        nome, email: emailLimpo, whatsapp: whatsappFull, cpf: cpfLimpo,
        cidade, estado, nome_igreja: igreja || '',
        tipo: 'voluntario', area_voluntario: setor,
        origem_inscricao: 'VOLUNTARIO',
        tamanho_camisa: tamanhoNormalizado,
        valor_pago: valorFinal,
        status_pagamento: 'checkout_pendente',
        asaas_charge_url: checkout.link,
        asaas_checkout_id: checkout.id || null, asaas_checkout_status: checkout.status || 'ACTIVE',
        codigo_inscricao,
      });
    } else {
      // Criar nova inscrição com dedup_key
      try {
        inscricao = await base44.asServiceRole.entities.EventoM31Inscricao.create({
          ...revisao,
          nome,
          email: emailLimpo,
          whatsapp: whatsappFull,
          cpf: cpfLimpo,
          cidade,
          estado,
          nome_igreja: igreja || '',
          tipo: 'voluntario',
          area_voluntario: setor,
          origem_inscricao: 'VOLUNTARIO',
          tamanho_camisa: tamanhoNormalizado,
          dedup_key: dedupKey,
          valor_pago: valorFinal,
          status_pagamento: 'checkout_pendente',
          asaas_charge_url: checkout.link,
          asaas_checkout_id: checkout.id || null, asaas_checkout_status: checkout.status || 'ACTIVE',
          codigo_inscricao,
          checkin_realizado: false,
          observacoes: sobre_servir || '',
        });
      } catch (createErr) {
        if (isDuplicateKeyError(createErr)) {
          // Unique index detectou duplicata — buscar e atualizar
          const existing = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
            { dedup_key: dedupKey }, '-updated_date', 1
          );
          if (existing && existing.length > 0) {
            inscricao = existing[0];
            await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
              ...revisao,
        nome, email: emailLimpo, whatsapp: whatsappFull, cpf: cpfLimpo,
              cidade, estado, nome_igreja: igreja || '',
              tipo: 'voluntario', area_voluntario: setor,
              origem_inscricao: 'VOLUNTARIO',
              tamanho_camisa: tamanhoNormalizado,
              valor_pago: valorFinal,
              status_pagamento: 'checkout_pendente',
              asaas_charge_url: checkout.link,
              asaas_checkout_id: checkout.id || null, asaas_checkout_status: checkout.status || 'ACTIVE',
              codigo_inscricao,
            });
          } else {
            throw createErr;
          }
        } else {
          throw createErr;
        }
      }
    }

    // ═══ ATUALIZAR ou CRIAR perfil de voluntária (sem duplicar) ═══
    const existingVols = await base44.asServiceRole.entities.EventoM31Voluntario.filter(
      { inscricao_id: inscricao.id }, '-updated_date', 1
    );
    const volData = {
      nome,
      whatsapp: whatsappFull,
      email: emailLimpo,
      setor,
      funcao: habilidades?.join(', ') || '',
      tamanho_camiseta: tamanhoNormalizado,
      inscricao_id: inscricao.id,
      observacoes: JSON.stringify({
        apelido: apelido || '',
        nascimento: nascimento || '',
        igreja: igreja || '',
        cidade, estado,
        serviu_antes: serviu_antes || false,
        areas_serviu: areas_serviu || [],
        reunioes_presenciais: reunioes_presenciais || false,
        disponivel_evento: disponivel_evento || false,
        chegar_cedo: chegar_cedo || false,
        habilidades: habilidades || [],
        sobre_servir: sobre_servir || '',
        tamanho_camisa: tamanhoNormalizado,
        valor: valorFinal,
        doacao_camisa: doar_camisa || false,
        doacao_destino: doar_camisa ? doacao_destino : '',
        doacao_destinataria_nome: doar_camisa && doacao_destino === 'especifica' ? (doacao_nome || '') : '',
        doacao_destinataria_whatsapp: doar_camisa && doacao_destino === 'especifica' ? (doacao_whatsapp || '') : '',
        doacao_destinataria_tamanho: doar_camisa && doacao_destino === 'especifica' ? (doacao_tamanho || '') : '',
        doacao_status: doar_camisa ? 'pendente' : '',
      }),
    };
    if (existingVols && existingVols.length > 0) {
      await base44.asServiceRole.entities.EventoM31Voluntario.update(existingVols[0].id, volData);
    } else {
      await base44.asServiceRole.entities.EventoM31Voluntario.create({
        ...volData,
        status: 'pendente',
        checkin_evento: false,
      }).catch(() => {});
    }

    return Response.json({
      success: true,
      inscricao_id: inscricao.id,
      codigo_inscricao,
      payment_url: checkout.link,
      setor,
      valor: valorFinal,
      redirect_url: '/obrigado'
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);

}
