// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31RecuperarFalhasTecnicas — RECUPERAÇÃO OBRIGATÓRIA POR FALHA TÉCNICA
 *
 * Trata quem foi impedida de concluir a compra por falha nossa (erro 4xx/5xx no
 * checkout). NÃO é abandono comercial e a mensagem nunca afirma abandono.
 *
 * Fluxo (idempotente, sem sender próprio):
 *   1. Lê M31FalhaCheckout em aberto
 *   2. Cruza por telefone e CPF com EventoM31Inscricao (relê o estado atual)
 *   3. Já paga/gratuita → no-op (resolvida_paga)
 *   4. Já retomou e tem checkout gerado → resolvida_retomou
 *   5. WhatsApp inválido → sem_whatsapp (tratamento manual)
 *   6. Restantes → enfileira via m31EnviarMensagemGovernada (RECUPERACAO_CHECKOUT)
 *
 * Admin-only. dry_run=true apenas relata, sem enfileirar.
 */

const BASE_SITE = '__APP_ORIGIN__';
const VERSAO = 'FALHA_TECNICA_V2';

function normalizePhone(phone) {
  let d = (phone || '').replace(/\D/g, '');
  while (d.startsWith('5555')) d = d.slice(2);
  if (d.startsWith('55') && d.length >= 12) return d;
  if (d.length >= 10) return `55${d}`;
  return d;
}

function primeiroNome(nome) {
  return (nome || '').trim().split(/\s+/)[0] || 'tudo bem';
}

function montarLink(tipo, token, caravanaId) {
  if (tipo === 'caravana') {
    const params = new URLSearchParams();
    if (token) params.set('retomar', token);
    if (caravanaId) params.set('caravana_id', caravanaId);
    return `${BASE_SITE}/m31-caravana?${params.toString()}`;
  }
  return `${BASE_SITE}/m31-inscricao?retomar=${encodeURIComponent(token || '')}`;
}

function montarMensagem(nome, link, tipo, caravanaNome) {
  if (tipo === 'caravana') {
    const trecho = caravanaNome ? ` da caravana *${caravanaNome}*` : ' pela caravana';
    return `Oi, ${primeiroNome(nome)}! Identificamos que você tentou concluir sua inscrição${trecho}, mas tivemos uma instabilidade no momento de avançar para o pagamento. Já normalizamos o acesso. 💛\n\nVocê pode continuar por aqui com seus dados recuperados: ${link}`;
  }
  return `Oi, ${primeiroNome(nome)}! Identificamos que você iniciou sua inscrição no M31, mas tivemos uma instabilidade no momento de avançar para o pagamento. Já normalizamos o acesso. 💛\n\nVocê pode continuar sua inscrição por aqui (seus dados já ficam preenchidos): ${link}`;
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run !== false;

    // ── FONTE 1: incidentes registrados em M31FalhaCheckout ──
    const falhas = await base44.asServiceRole.entities.M31FalhaCheckout.filter(
      { status: 'aberta' }, '-ocorrido_em', 200
    );

    // ── FONTE 2: inscrições marcadas com falha técnica no próprio registro ──
    // (pessoa TENTOU avançar e o sistema impediu — nunca abandono)
    const comFalha = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
      { falha_tecnica: true }, '-falha_tecnica_em', 200
    );
    const telsFalhaCheckout = new Set(falhas.map((f) => normalizePhone(f.whatsapp || '')));
    for (const i of comFalha) {
      const tel = normalizePhone(i.whatsapp || '');
      if (!tel || telsFalhaCheckout.has(tel)) continue; // já coberta pela fonte 1
      falhas.push({
        id: null, inscricao_direta_id: i.id, token: i.retomada_token,
        nome: i.nome, email: i.email, whatsapp: tel, cpf: i.cpf,
        tipo: i.tipo, caravana_id: i.caravana_id, caravana_nome: i.caravana_nome,
        ocorrido_em: i.falha_tecnica_em, http_status: i.falha_tecnica_http,
      });
    }

    const relatorio = {
      afetadas: falhas.length,
      ja_concluiram_e_pagaram: 0,
      ja_retomaram_sem_pagar: 0,
      precisam_recuperacao: 0,
      com_whatsapp_valido: 0,
      sem_whatsapp: 0,
      enfileiradas: 0,
      bloqueadas_governanca: [],
      dry_run: dryRun,
      detalhe: [],
    };

    // Fecha o caso na fonte correta: incidente (fonte 1) ou própria inscrição (fonte 2)
    const fechar = async (f, patch) => {
      if (f.id) {
        await base44.asServiceRole.entities.M31FalhaCheckout.update(f.id, patch);
      } else if (f.inscricao_direta_id) {
        const enfileirada = patch.status === 'recuperacao_enfileirada';
        await base44.asServiceRole.entities.EventoM31Inscricao.update(f.inscricao_direta_id, {
          falha_tecnica: false,
          fila_recuperacao: enfileirada,
          status_fila_recuperacao: enfileirada ? 'aguardando_aprovacao' : null,
          fila_recuperacao_em: enfileirada ? new Date().toISOString() : null,
          ultima_acao: `recuperacao:${patch.status}`,
        });
      }
    }; 

    for (const f of falhas) {
      const tel = normalizePhone(f.whatsapp || '');
      const cpf = (f.cpf || '').replace(/\D/g, '');

      // ── 2. Cruzamento por telefone e CPF (relê o estado atual) ──
      let inscricoes = tel ? await base44.asServiceRole.entities.EventoM31Inscricao.filter({ whatsapp: tel }, '-created_date', 5) : [];
      if (inscricoes.length === 0 && cpf) {
        inscricoes = await base44.asServiceRole.entities.EventoM31Inscricao.filter({ cpf }, '-created_date', 5);
      }

      const atual = inscricoes.find((i) => i.id === f.inscricao_direta_id)
        || inscricoes.find((i) => i.status_pagamento !== 'cancelado')
        || inscricoes[0]
        || null;

      const paga = inscricoes.find((i) => ['aprovado', 'gratuito'].includes(i.status_pagamento));
      if (paga) {
        relatorio.ja_concluiram_e_pagaram++;
        if (!dryRun) {
          await fechar(f, {
            status: 'resolvida_paga', inscricao_id: paga.id,
            observacao: 'no-op: pagamento confirmado após a falha técnica',
          });
        }
        continue;
      }

      const retomou = inscricoes.find((i) => i.asaas_charge_url || i.asaas_checkout_id);
      if (retomou) {
        relatorio.ja_retomaram_sem_pagar++;
        if (!dryRun) {
          await fechar(f, {
            status: 'resolvida_retomou', inscricao_id: retomou.id,
            observacao: 'retomou o fluxo e gerou checkout — segue na régua normal de pagamento',
          });
        }
        continue;
      }

      relatorio.precisam_recuperacao++;

      if (!tel || tel.length < 12) {
        relatorio.sem_whatsapp++;
        if (!dryRun) {
          await fechar(f, {
            status: 'sem_whatsapp', observacao: 'WhatsApp inválido — recuperação manual',
          });
        }
        continue;
      }
      relatorio.com_whatsapp_valido++;

      if (dryRun) {
        relatorio.detalhe.push({ nome: f.nome, telefone: tel, ocorrido_em: f.ocorrido_em });
        continue;
      }

      const tipo = atual?.tipo || f.tipo || 'publico_geral';
      const token = atual?.retomada_token || f.token || '';
      const caravanaId = atual?.caravana_id || f.caravana_id || '';
      const caravanaNome = atual?.caravana_nome || f.caravana_nome || '';
      const link = montarLink(tipo, token, caravanaId);
      const res = await base44.functions.invoke('m31EnviarMensagemGovernada', {
        cpf: cpf || null,
        telefone: tel,
        email: f.email || null,
        automacao: 'RECUPERACAO_CHECKOUT',
        template: 'retomada_apos_instabilidade',
        versao: VERSAO,
        origem: 'm31RecuperarFalhasTecnicas',
        inscricao_id: inscricoes[0]?.id || null,
        inscricao_nome: f.nome || null,
        mensagens: [{ message: montarMensagem(f.nome, link, tipo, caravanaNome) }],
      });

      if (res.data?.enfileirado) {
        relatorio.enfileiradas++;
        await fechar(f, {
          status: 'recuperacao_enfileirada',
          fila_id: res.data.fila_id,
          recuperacao_em: new Date().toISOString(),
          inscricao_id: inscricoes[0]?.id || null,
          observacao: 'retomada após instabilidade — aguardando aprovação na fila',
        });
      } else {
        relatorio.bloqueadas_governanca.push({ nome: f.nome, telefone: tel, motivo: res.data?.motivo });
      }
    }

    return Response.json(relatorio);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
