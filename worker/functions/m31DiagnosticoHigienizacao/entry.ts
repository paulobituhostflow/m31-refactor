// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31DiagnosticoHigienizacao — ONDA 1 do Plano de Segurança e Idempotência.
 *
 * Diagnóstico UNIFICADO (somente leitura por padrão) dos dados já inconsistentes.
 * Grupos analisados:
 *   1. telefones_ddi          — telefone com DDI 55 duplicado / formato inválido
 *   2. dlq_pendente           — itens na Dead Letter Queue aguardando tratamento
 *   3. asaas_travado          — eventos Asaas parados em 'recebido'/'processando'
 *   4. etapa_funil_ausente    — inscrição com Nome+WhatsApp sem etapa_funil (some do funil)
 *   5. aprovado_sem_origem    — pagamento aprovado sem origem_pagamento classificada
 *   6. aprovado_sem_timestamp — aprovado sem pagamento_confirmado_em (raiz da divergência de contadores)
 *   7. fila_enviado_sem_prova — item da fila marcado 'enviado' sem messageid de aceite
 *
 * Correção em lote OPT-IN por grupo: body { corrigir: 'telefones_ddi' | 'etapa_funil_ausente' }.
 * Apenas grupos seguros (não financeiros, não disparam mensagem) são corrigíveis nesta onda.
 * Toda correção retorna relatório antes/depois com contagem de registros alterados.
 */

const PAGE = 500;
const MAX_PAGES = 20;

function telefoneProblema(raw) {
  const d = (raw || '').replace(/\D/g, '');
  if (!d) return null;
  if (/^(55){2,}/.test(d)) return 'ddi_duplicado';
  if (d.startsWith('55') && d.length > 13) return 'digitos_excedentes';
  if (!d.startsWith('55') && d.length >= 10) return 'sem_ddi';
  if (d.length < 10) return 'curto_demais';
  return null;
}

function normalizarTelefone(raw) {
  let d = (raw || '').replace(/\D/g, '');
  while (d.startsWith('5555')) d = d.slice(2);
  if (d.startsWith('55')) return d;
  if (d.length >= 10) return `55${d}`;
  return d;
}

// Só é seguro gravar automaticamente quando o resultado tem formato brasileiro
// válido: 55 + DDD(2) + 8 ou 9 dígitos. Fora disso, exige conferência humana.
function telefoneValido(d) {
  return /^55\d{2}\d{8,9}$/.test(d || '');
}

async function carregarTodas(base44, entidade, query, sort) {
  const out = [];
  for (let p = 0; p < MAX_PAGES; p++) {
    const lote = await base44.asServiceRole.entities[entidade].filter(query, sort, PAGE, p * PAGE);
    if (!lote || lote.length === 0) break;
    out.push(...lote);
    if (lote.length < PAGE) break;
  }
  return out;
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden — admin only' }, { status: 403 });

    let corrigir = null;
    try {
      const body = await req.json();
      corrigir = body?.corrigir || null;
    } catch { /* sem body — apenas diagnóstico */ }

    const inscricoes = await carregarTodas(base44, 'EventoM31Inscricao', {}, '-created_date');
    const dlq = await carregarTodas(base44, 'M31DeadLetterQueue', {}, '-created_date');
    const eventosAsaas = await carregarTodas(base44, 'M31AsaasWebhookEvento', {}, '-recebido_em');
    const filaEnviados = await carregarTodas(base44, 'M31FilaMensagem', { status: 'enviado' }, '-processado_em');

    const APROVADOS = ['aprovado', 'gratuito'];

    const gTelefones = [];
    const gRevisaoOnda2 = [];
    const gEtapaFunil = [];
    const gSemOrigem = [];
    const gSemTimestamp = [];

    for (const i of inscricoes) {
      const prob = telefoneProblema(i.whatsapp);
      if (prob) {
        const proposto = normalizarTelefone(i.whatsapp);
        gTelefones.push({
          id: i.id, nome: i.nome, atual: i.whatsapp,
          proposto, problema: prob,
          auto: telefoneValido(proposto) && proposto !== (i.whatsapp || '').replace(/\D/g, ''),
        });
      }
      if (i.revisao_dados) {
        gRevisaoOnda2.push({
          id: i.id, nome: i.nome, whatsapp: i.whatsapp,
          motivos: (i.revisao_motivos || []).join(', '),
          originais: i.revisao_valores_originais || null,
        });
      }
      if (i.nome && i.whatsapp && !i.etapa_funil) {
        gEtapaFunil.push({ id: i.id, nome: i.nome, status_pagamento: i.status_pagamento });
      }
      if (APROVADOS.includes(i.status_pagamento)) {
        if (!i.origem_pagamento) {
          gSemOrigem.push({ id: i.id, nome: i.nome, origem_inscricao: i.origem_inscricao || null, valor_pago: i.valor_pago || 0 });
        }
        if (!i.pagamento_confirmado_em) {
          gSemTimestamp.push({ id: i.id, nome: i.nome, origem_pagamento: i.origem_pagamento || null, asaas_payment_id: i.asaas_payment_id || null });
        }
      }
    }

    const dlqPendente = dlq.filter((d) => !d.resolvido && d.status !== 'resolvido' && d.status !== 'descartado');
    const asaasTravado = eventosAsaas.filter((e) => e.status === 'recebido' || e.status === 'processando');
    const filaSemProva = filaEnviados.filter((f) => {
      const res = Array.isArray(f.resultados_mensagens) ? f.resultados_mensagens : [];
      return res.length === 0 || !res.some((r) => r.message_id);
    });

    const grupos = [
      {
        chave: 'telefones_ddi',
        titulo: 'Telefones com DDI inválido',
        descricao: 'WhatsApp com 55 duplicado, dígitos excedentes ou sem DDI — causa raiz de duplicatas e falhas de envio.',
        total: gTelefones.length,
        corrigivel: true,
        auto_corrigiveis: gTelefones.filter((t) => t.auto).length,
        revisao_manual: gTelefones.filter((t) => !t.auto).length,
        amostra: gTelefones.slice(0, 20),
      },
      {
        chave: 'revisao_onda2',
        titulo: 'Dados sinalizados na entrada',
        descricao: 'O núcleo de normalização recebeu telefone, CPF ou e-mail em formato duvidoso, preservou o valor informado e sinalizou para conferência humana — a inscrição seguiu no funil.',
        total: gRevisaoOnda2.length,
        corrigivel: false,
        amostra: gRevisaoOnda2.slice(0, 20),
      },
      {
        chave: 'etapa_funil_ausente',
        titulo: 'Inscrições fora do funil',
        descricao: 'Tem Nome + WhatsApp mas nenhuma etapa do funil registrada — a pessoa desaparece dos relatórios.',
        total: gEtapaFunil.length,
        corrigivel: true,
        amostra: gEtapaFunil.slice(0, 20),
      },
      {
        chave: 'aprovado_sem_timestamp',
        titulo: 'Pagamentos sem data financeira',
        descricao: 'Aprovadas sem pagamento_confirmado_em — origem da divergência entre contador e dashboard. Correção depende de evidência no Asaas (Onda 3).',
        total: gSemTimestamp.length,
        corrigivel: false,
        amostra: gSemTimestamp.slice(0, 20),
      },
      {
        chave: 'aprovado_sem_origem',
        titulo: 'Pagamentos sem origem classificada',
        descricao: 'Aprovadas sem origem_pagamento — impede reconciliação por canal. Classificação exige conferência humana.',
        total: gSemOrigem.length,
        corrigivel: false,
        amostra: gSemOrigem.slice(0, 20),
      },
      {
        chave: 'asaas_travado',
        titulo: 'Eventos Asaas travados',
        descricao: 'Eventos recebidos e nunca finalizados pelo worker. Reprocessamento idempotente por event_id é a Onda 3.',
        total: asaasTravado.length,
        corrigivel: false,
        amostra: asaasTravado.slice(0, 20).map((e) => ({ id: e.id, event_id: e.event_id, event_type: e.event_type, status: e.status, recebido_em: e.recebido_em })),
      },
      {
        chave: 'dlq_pendente',
        titulo: 'Itens na fila de erros (DLQ)',
        descricao: 'Falhas acumuladas aguardando classificação (reenviar / cancelar / terminal). Tratamento assistido é a Onda 4.',
        total: dlqPendente.length,
        corrigivel: false,
        amostra: dlqPendente.slice(0, 20).map((d) => ({ id: d.id, nome: d.inscricao_nome, etapa: d.etapa, erro: (d.erro || '').substring(0, 160) })),
      },
      {
        chave: 'fila_enviado_sem_prova',
        titulo: 'Mensagens sem prova de aceite',
        descricao: 'Marcadas como enviadas sem messageid da UAZAPI — podem nunca ter chegado. Revisão é a Onda 4.',
        total: filaSemProva.length,
        corrigivel: false,
        amostra: filaSemProva.slice(0, 20).map((f) => ({ id: f.id, nome: f.inscricao_nome, automacao: f.automacao, telefone: f.telefone })),
      },
    ];

    let correcao = null;

    if (corrigir === 'telefones_ddi') {
      const elegiveis = gTelefones.filter((t) => t.auto);
      const antes = elegiveis.length;
      let alterados = 0;
      const falhas = [];
      for (const t of elegiveis) {
        try {
          await base44.asServiceRole.entities.EventoM31Inscricao.update(t.id, { whatsapp: t.proposto });
          alterados++;
        } catch (e) {
          falhas.push({ id: t.id, erro: e.message });
        }
      }
      correcao = { grupo: 'telefones_ddi', antes, alterados, restantes: antes - alterados,
        revisao_manual: gTelefones.length - elegiveis.length, falhas };
    }

    if (corrigir === 'etapa_funil_ausente') {
      const antes = gEtapaFunil.length;
      let alterados = 0;
      const falhas = [];
      const agora = new Date().toISOString();
      for (const g of gEtapaFunil) {
        const etapa = APROVADOS.includes(g.status_pagamento)
          ? 'pagamento_confirmado'
          : (g.status_pagamento === 'checkout_pendente' || g.status_pagamento === 'pendente')
            ? 'checkout_criado'
            : 'contato_capturado';
        try {
          await base44.asServiceRole.entities.EventoM31Inscricao.update(g.id, {
            etapa_funil: etapa,
            etapa_funil_em: agora,
            ultima_acao: 'higienizacao_onda1',
          });
          alterados++;
        } catch (e) {
          falhas.push({ id: g.id, erro: e.message });
        }
      }
      correcao = { grupo: 'etapa_funil_ausente', antes, alterados, restantes: antes - alterados, falhas };
    }

    if (correcao) {
      await base44.asServiceRole.entities.EventoM31ActionLog.create({
        user_email: user.email,
        user_nome: user.full_name,
        user_perfil: user.role,
        acao: `Higienização Onda 1 — grupo ${correcao.grupo}: ${correcao.alterados} de ${correcao.antes} registros corrigidos`,
        modulo: 'auditoria',
      }).catch(() => {});
    }

    return Response.json({
      gerado_em: new Date().toISOString(),
      total_inscricoes: inscricoes.length,
      total_inconsistencias: grupos.reduce((s, g) => s + g.total, 0),
      grupos,
      correcao,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
