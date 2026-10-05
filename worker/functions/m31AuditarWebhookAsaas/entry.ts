// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31AuditarWebhookAsaas — Auditoria da configuração real do webhook no Asaas
 *
 * DIAGNÓSTICO EM 4 PILARES:
 *   1. entrega_do_asaas       — webhook ativo, fila ativa, URL correta, eventos obrigatórios
 *   2. autenticacao_webhook   — token (não verificável via API) + evidência operacional (HTTP 200)
 *   3. localizacao_inscricao  — worker consegue localizar a inscrição (PAYMENT_CONFIRMED/RECEIVED)
 *   4. atualizacao_pagamento  — worker consegue atualizar o pagamento + enfileirar boas-vindas
 *
 * REGRAS:
 *   - authToken: null retornado pela GET NÃO é classificado como token ausente
 *     (o Asaas não expõe o token via GET — é write-only). Classifica como
 *     'token_nao_verificavel_via_api'. A autenticação é considerada OPERACIONAL quando
 *     há eventos recentes recebidos com HTTP 200 (presença em M31AsaasWebhookEvento).
 *   - NÃO solicita alteração manual do token com base no campo nulo.
 *   - NÃO resete eventos com base no campo nulo.
 *   - NÃO modifique a URL com base no campo nulo.
 *   - 401 não é persistido pelo receiver (rejeitado antes da escrita), então a
 *     ausência de 401 é inferida pela existência de eventos recentes.
 *
 * Payload: { corrigir?: boolean, reativar?: boolean }
 *   corrigir=true  → POST /v3/webhooks/{id} sincroniza URL+eventos+token+enabled (NÃO altera URL se já correta)
 *   reativar=true  → POST /v3/webhooks/{id} com interrupted=false, enabled=true
 */

const EVENTOS_OBRIGATORIOS = ['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'];
const EVENTOS_CONFIRMACAO = ['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'];
const ERROS_LOCALIZACAO = ['inscricao_nao_encontrada', 'inscricao_desapareceu'];
const ERROS_ATUALIZACAO = [
  'lock_falhou_concorrencia', 'lock_perdido_apos_aquisicao',
  'valor_total_indeterminado', 'template_ausente_fail_closed',
  'grupo_nao_configurado',
];

async function fetchAsaas(url: string, options: any = {}, timeoutMs = 15000): Promise<{ status: number; body: any; raw: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { ...options, signal: controller.signal });
    const raw = await resp.text();
    let body: any = null;
    try { body = JSON.parse(raw); } catch {}
    return { status: resp.status, body, raw };
  } catch (err: any) {
    return { status: 0, body: null, raw: err.message };
  } finally {
    clearTimeout(timer);
  }
}

/** URL correta = HTTPS + termina com /api/functions/m31AsaasWebhook (não compara host exato) */
function urlCorreta(url: string | null): boolean {
  if (!url) return false;
  if (!url.startsWith('https://')) return false;
  return /\/api\/functions\/m31AsaasWebhook\/?$/.test(url);
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    try {
      const user = await base44.auth.me();
      if (user && user.role !== 'admin') {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    } catch { /* automação */ }

    const body = await req.json().catch(() => ({}));
    const corrigir = body?.corrigir === true;
    const reativar = body?.reativar === true;

    const ASAAS_KEY = config('ASAAS_API_KEY');

    // ═══ 1. CONSULTAR CONFIGURAÇÃO ATUAL DO WEBHOOK ═══
    const listResp = await fetchAsaas('__ASAAS_API__/webhooks', {
      headers: { 'access_token': ASAAS_KEY },
    });

    const webhookAtual = listResp.body?.data?.[0] || listResp.body || null;

    // URL esperada do sistema (derivada do host do request — apenas para referência)
    const reqUrl = new URL(req.url);
    const baseHost = `${reqUrl.protocol}//${reqUrl.host}`;
    const urlEsperada = `${baseHost}/api/functions/m31AsaasWebhook`;

    // ═══ 2. EVENTOS RECENTES NO SISTEMA (evidência operacional) ═══
    const eventosRecentes = await base44.asServiceRole.entities.M31AsaasWebhookEvento.filter(
      {}, '-recebido_em', 50
    ).catch(() => []);

    const agora = Date.now();
    const JANELA_24H = 24 * 60 * 60 * 1000;
    const eventos24h = eventosRecentes.filter(e =>
      e.recebido_em && (agora - new Date(e.recebido_em).getTime()) < JANELA_24H
    );
    const eventosRecebidosOuProcessados = eventosRecentes.filter(e =>
      ['recebido', 'processando', 'processado', 'ignorado'].includes(e.status)
    );
    const eventosFalha = eventosRecentes.filter(e => e.status === 'falha');
    const eventosErroInterno = eventosRecentes.filter(e =>
      e.event_type === 'ERRO_INTERNO' || e.status === 'falha'
    );

    // Evidência de 401: não há registro direto (receiver rejeita antes de persistir).
    // Indiretamente: se NÃO há eventos recentes mas o webhook está ativo, pode indicar 401.
    // Se HÁ eventos recentes com status recebido/processado → auth operacional (passou 401).
    const temEventosRecentes = eventos24h.length > 0;
    const temEventosRecebidos = eventosRecebidosOuProcessados.length > 0;

    // ═══ 3. PILAR 1: ENTREGA DO ASAAS ═══
    const entregaAsaas: any = {
      status: 'ok',
      webhook_encontrado: false,
      enabled: null,
      interrupted: null,
      url_configurada: null,
      url_correta: false,
      eventos_configurados: [],
      eventos_obrigatorios: EVENTOS_OBRIGATORIOS,
      eventos_faltando: [],
      problemas: [],
    };

    if (webhookAtual) {
      entregaAsaas.webhook_encontrado = true;
      entregaAsaas.enabled = webhookAtual.enabled ?? webhookAtual.isActive ?? null;
      entregaAsaas.interrupted = webhookAtual.interrupted ?? null;
      entregaAsaas.url_configurada = webhookAtual.url || webhookAtual.webhookUrl || null;
      entregaAsaas.url_correta = urlCorreta(entregaAsaas.url_configurada);
      entregaAsaas.eventos_configurados = webhookAtual.events || [];

      if (entregaAsaas.enabled !== true) {
        entregaAsaas.problemas.push({ tipo: 'webhook_desativado', enabled: entregaAsaas.enabled });
      }
      if (entregaAsaas.interrupted === true) {
        entregaAsaas.problemas.push({
          tipo: 'fila_interrompida',
          motivo: 'Asaas interrompeu entregas — possivelmente por erros 4xx/5xx repetidos',
        });
      }
      if (!entregaAsaas.url_correta) {
        entregaAsaas.problemas.push({
          tipo: 'url_incorreta',
          configurada: entregaAsaas.url_configurada,
          esperada_padrao: 'https://<host>/api/functions/m31AsaasWebhook',
        });
      }
      for (const ev of EVENTOS_OBRIGATORIOS) {
        if (!entregaAsaas.eventos_configurados.includes(ev)) {
          entregaAsaas.eventos_faltando.push(ev);
          entregaAsaas.problemas.push({ tipo: 'evento_faltando', evento: ev });
        }
      }
      // Entregas recentes com HTTP 200 (presença de eventos recebidos)
      entregaAsaas.entregas_recentes_200 = temEventosRecentes;
      entregaAsaas.eventos_24h = eventos24h.length;
      if (!temEventosRecentes) {
        entregaAsaas.problemas.push({
          tipo: 'sem_entregas_recentes_24h',
          nota: 'Sem eventos recebidos nas últimas 24h — pode indicar 401 (auth divergente), webhook inativo, ou simplesmente sem pagamentos no período.',
        });
      }
    } else {
      entregaAsaas.status = 'critico';
      entregaAsaas.problemas.push({ tipo: 'webhook_nao_encontrado', http_status: listResp.status });
    }

    entregaAsaas.status = entregaAsaas.problemas.length === 0 ? 'ok'
      : entregaAsaas.problemas.some(p => p.tipo === 'webhook_nao_encontrado' || p.tipo === 'webhook_desativado') ? 'critico'
      : 'atencao';

    // ═══ 4. PILAR 2: AUTENTICAÇÃO DO WEBHOOK ═══
    // authToken null na GET é normal — Asaas não expõe o token (write-only).
    // Auth é OPERACIONAL quando há eventos recentes recebidos (passaram pelo guard 401).
    // Auth é QUEBRADA quando webhook ativo mas SEM eventos recentes (suspeita de 401).
    const authOperacional = temEventosRecebidos && entregaAsaas.enabled === true;
    const authSuspeita401 = entregaAsaas.webhook_encontrado && entregaAsaas.enabled === true
      && !temEventosRecebidos && eventosRecentes.length === 0;

    const autenticacaoWebhook: any = {
      status: authOperacional ? 'ok' : (authSuspeita401 ? 'suspeito' : 'indeterminado'),
      token_verificavel_via_api: false,
      token_status: 'token_nao_verificavel_via_api',
      token_nota: 'Asaas não expõe o authToken via GET /webhooks (write-only por segurança). Validação real ocorre no recebimento do evento: 401 = token divergente, 200 = token correto.',
      auth_operacional: authOperacional,
      evidencia_200: temEventosRecebidos
        ? `${eventosRecebidosOuProcessados.length} evento(s) recebido(s) com HTTP 200 (passaram pelo guard de token)`
        : 'nenhum evento recebido — sem evidência de HTTP 200',
      suspeita_401: authSuspeita401,
      problemas: [],
    };

    if (authSuspeita401) {
      autenticacaoWebhook.problemas.push({
        tipo: 'possivel_401',
        nota: 'Webhook ativo mas nenhum evento recebido no sistema. Se houve pagamentos recentes no Asaas, o token pode estar divergente (Asaas recebe 401 e não entrega). Verifique se o token no Asaas confere com o secret ASAAS_WEBHOOK_TOKEN.',
      });
    }
    // NUNCA classificar authToken:null como "token ausente" — é falso negativo.
    // NUNCA solicitar alteração manual do token com base no campo nulo.
    // NUNCA resetar eventos com base no campo nulo.
    // NUNCA modificar URL com base no campo nulo.

    // ═══ 5. PILAR 3: LOCALIZAÇÃO DA INSCRIÇÃO ═══
    // Analisa eventos de confirmação processados e verifica se o worker achou a inscrição.
    const eventosConfirmacao = eventosRecentes.filter(e =>
      EVENTOS_CONFIRMACAO.includes(e.event_type)
    );
    const localizacaoResultados = eventosConfirmacao.map(e => {
      let parsed: any = null;
      try { parsed = e.resultado ? JSON.parse(e.resultado) : null; } catch {}
      return {
        event_id: e.event_id,
        event_type: e.event_type,
        status: e.status,
        erro: e.erro || parsed?.erro || null,
        inscricao_id: parsed?.inscricao_id || null,
      };
    });
    const localizacaoFalhas = localizacaoResultados.filter(r =>
      r.erro && ERROS_LOCALIZACAO.includes(r.erro)
    );
    const localizacaoSucessos = localizacaoResultados.filter(r => r.inscricao_id);

    const localizacaoInscricao: any = {
      status: localizacaoFalhas.length === 0 ? 'ok' : (localizacaoSucessos.length > 0 ? 'atencao' : 'critico'),
      eventos_confirmacao_analisados: localizacaoResultados.length,
      sucessos: localizacaoSucessos.length,
      falhas: localizacaoFalhas.length,
      amostra_falhas: localizacaoFalhas.slice(0, 3),
      problemas: [],
    };
    if (localizacaoFalhas.length > 0) {
      localizacaoInscricao.problemas.push({
        tipo: 'inscricoes_nao_localizadas',
        quantidade: localizacaoFalhas.length,
        erros: [...new Set(localizacaoFalhas.map(f => f.erro))],
      });
    }

    // ═══ 6. PILAR 4: ATUALIZAÇÃO DO PAGAMENTO ═══
    // Verifica se o worker conseguiu atualizar a inscrição e enfileirar boas-vindas.
    const atualizacaoResultados = eventosConfirmacao.map(e => {
      let parsed: any = null;
      try { parsed = e.resultado ? JSON.parse(e.resultado) : null; } catch {}
      return {
        event_id: e.event_id,
        status: e.status,
        erro: e.erro || parsed?.erro || null,
        sucesso: parsed?.sucesso ?? false,
        inscricao_id: parsed?.inscricao_id || null,
      };
    });
    const atualizacaoFalhas = atualizacaoResultados.filter(r =>
      r.erro && ERROS_ATUALIZACAO.includes(r.erro)
    );
    const atualizacaoSucessos = atualizacaoResultados.filter(r => r.sucesso && r.inscricao_id);
    const atualizacaoPreCorte = atualizacaoResultados.filter(r =>
      r.erro && (r.erro === 'pre_corte_ou_sem_data_financeira' || r.erro === 'ja_processado')
    );
    const atualizacaoEnfileirado = atualizacaoResultados.filter(r => r.erro === 'enfileirado');

    const atualizacaoPagamento: any = {
      status: atualizacaoFalhas.length === 0 ? 'ok' : (atualizacaoSucessos.length > 0 ? 'atencao' : 'critico'),
      eventos_analisados: atualizacaoResultados.length,
      sucessos: atualizacaoSucessos.length,
      pre_corte_ou_ja_processado: atualizacaoPreCorte.length,
      enfileirados_boas_vindas: atualizacaoEnfileirado.length,
      falhas: atualizacaoFalhas.length,
      amostra_falhas: atualizacaoFalhas.slice(0, 3),
      problemas: [],
    };
    if (atualizacaoFalhas.length > 0) {
      atualizacaoPagamento.problemas.push({
        tipo: 'atualizacoes_falharam',
        quantidade: atualizacaoFalhas.length,
        erros: [...new Set(atualizacaoFalhas.map(f => f.erro))],
      });
    }

    // ═══ 7. AÇÕES CORRETIVAS (opcionais, explícitas) ═══
    const acoesExecutadas: string[] = [];
    let configCorrigida: any = null;
    let reativacao: any = null;

    if ((corrigir || reativar) && webhookAtual) {
      const webhookId = webhookAtual.id;
      const eventosCompletos = [...new Set([
        ...EVENTOS_OBRIGATORIOS,
        ...(webhookAtual.events || []),
      ])];

      const payloadCorrecao: any = {
        url: webhookAtual.url || webhookAtual.webhookUrl || urlEsperada,
        enabled: true,
        interrupted: false,
        events: eventosCompletos,
        authToken: config('ASAAS_WEBHOOK_TOKEN'),
        sendType: webhookAtual.sendType || 'SEQUENTIALLY',
      };

      const updateResp = await fetchAsaas(`__ASAAS_API__/webhooks/${webhookId}`, {
        method: 'POST',
        headers: { 'access_token': ASAAS_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadCorrecao),
      });

      const sucessoCorrecao = updateResp.status >= 200 && updateResp.status < 300;

      if (corrigir) {
        configCorrigida = {
          http_status: updateResp.status,
          sucesso: sucessoCorrecao,
          url: payloadCorrecao.url,
          enabled: true,
          interrupted: false,
          events: eventosCompletos,
          resposta: updateResp.body || updateResp.raw?.substring(0, 500),
        };
        if (sucessoCorrecao) acoesExecutadas.push('config_corrigida');
      }
      if (reativar) {
        reativacao = {
          http_status: updateResp.status,
          sucesso: sucessoCorrecao,
          resposta: updateResp.body || updateResp.raw?.substring(0, 500),
        };
        if (sucessoCorrecao) acoesExecutadas.push('fila_reativada');
      }
    }

    // ═══ 8. RESUMO FINAL ═══
    const diagnostico = {
      timestamp: new Date().toISOString(),
      http_status_consulta: listResp.status,

      // Config bruta do Asaas (para auditoria)
      config_asaas: webhookAtual ? {
        id: webhookAtual.id || null,
        name: webhookAtual.name || null,
        url: webhookAtual.url || webhookAtual.webhookUrl || null,
        enabled: webhookAtual.enabled ?? webhookAtual.isActive ?? null,
        interrupted: webhookAtual.interrupted ?? null,
        authToken: null, // sempre null na GET — write-only
        events: webhookAtual.events || [],
        sendType: webhookAtual.sendType || null,
      } : null,
      url_esperada_sistema: urlEsperada,

      // ═══ 4 PILARES ═══
      entrega_do_asaas: entregaAsaas,
      autenticacao_do_webhook: autenticacaoWebhook,
      localizacao_da_inscricao: localizacaoInscricao,
      atualizacao_do_pagamento: atualizacaoPagamento,

      // Ações
      acoes_executadas: acoesExecutadas,
      config_corrigida: configCorrigida,
      reativacao: reativacao,

      // Resumo consolidado
      resumo: {
        entrega_do_asaas: entregaAsaas.status,
        autenticacao_do_webhook: autenticacaoWebhook.status,
        localizacao_da_inscricao: localizacaoInscricao.status,
        atualizacao_do_pagamento: atualizacaoPagamento.status,
        total_problemas:
          entregaAsaas.problemas.length +
          autenticacaoWebhook.problemas.length +
          localizacaoInscricao.problemas.length +
          atualizacaoPagamento.problemas.length,
      },
    };

    return Response.json(diagnostico);
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
})(req);
}
