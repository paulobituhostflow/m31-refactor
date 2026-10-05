// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31AlertarGestor — Sistema de Auditoria e Alertas M31
 *
 * Registra erros na entidade M31AuditLog e notifica Paulo via WhatsApp.
 * Deduplica alertas do mesmo erro nos últimos 30 minutos.
 *
 * Payload esperado:
 * {
 *   tipo_erro: string,
 *   gravidade: 'critico' | 'alto' | 'medio' | 'baixo',
 *   origem: 'formulario' | 'webhook' | 'asaas' | 'zapi' | 'automacao' | 'sistema',
 *   descricao: string,
 *   possivel_causa: string,
 *   acao_recomendada: string,
 *   pessoa_nome?: string,
 *   pessoa_email?: string,
 *   pessoa_telefone?: string,
 *   pessoa_id?: string,
 *   dados_extras?: object,
 *   chave_unica?: string   // se não informado, gera automaticamente
 * }
 */

const PAULO_PHONE = '5581992008889';
const DEDUP_MINUTOS = 30;

// ═══ KILL-SWITCH: disparos de erro pro gestor DESATIVADOS temporariamente ═══
// Os erros continuam sendo registrados em M31AuditLog (painel de auditoria),
// mas NENHUMA mensagem WhatsApp é enviada. Para reativar, mude para false.
const ALERTAS_WHATSAPP_DESATIVADOS = true;

const EMOJI_GRAVIDADE = {
  critico: '🔴',
  alto:    '🟠',
  medio:   '🟡',
  baixo:   '🔵',
};

const LABEL_GRAVIDADE = {
  critico: 'CRÍTICO',
  alto:    'ALTO',
  medio:   'MÉDIO',
  baixo:   'BAIXO',
};

function toRecifeISO(date = new Date()) {
  const offset = -3 * 60;
  const local = new Date(date.getTime() + offset * 60 * 1000);
  return local.toISOString().replace('Z', '-03:00');
}

function formatHorario(isoUtc) {
  const d = new Date(isoUtc);
  return toRecifeISO(d).replace('T', ' ').slice(0, 19) + ' (Recife)';
}

function gerarChave(tipo_erro, pessoa_id, pessoa_email, pessoa_telefone) {
  const base = [tipo_erro, pessoa_id || pessoa_email || pessoa_telefone || 'sem_pessoa']
    .join('_')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .toLowerCase()
    .slice(0, 80);
  return base;
}



function montarMensagem({ gravidade, tipo_erro, descricao, pessoa_nome, pessoa_email, pessoa_telefone, pessoa_id, origem, possivel_causa, acao_recomendada }) {
  const emoji = EMOJI_GRAVIDADE[gravidade] || '⚠️';
  const label = LABEL_GRAVIDADE[gravidade] || gravidade.toUpperCase();
  const horario = formatHorario(new Date().toISOString());

  const pessoa = [
    pessoa_nome     ? `Nome: ${pessoa_nome}` : null,
    pessoa_telefone ? `Tel: ${pessoa_telefone}` : null,
    pessoa_email    ? `Email: ${pessoa_email}` : null,
    pessoa_id       ? `ID: ${pessoa_id}` : null,
  ].filter(Boolean).join('\n') || 'Não identificado';

  return (
    `${emoji} *ERRO NO SISTEMA M31*\n\n` +
    `*Gravidade:* ${label}\n\n` +
    `*Tipo:*\n${tipo_erro.replace(/_/g, ' ')}\n\n` +
    `*Descrição:*\n${descricao}\n\n` +
    `*Pessoa/Registro:*\n${pessoa}\n\n` +
    `*Onde ocorreu:*\n${origem}\n\n` +
    `*Possível causa:*\n${possivel_causa}\n\n` +
    `*Ação recomendada:*\n${acao_recomendada}\n\n` +
    `*Horário:*\n${horario}`
  );
}

// Envio DIRETO à UAZAPI (alerta operacional urgente) — mesma semântica dos
// avisos diretos à Dulce/Edilândia: aceito somente com HTTP 200 + messageid.
async function chamarUAZAPI(destino, message) {
  const token = config('UAZAPI_TOKEN');
  if (!token) return { resultado: 'falha', message_id: null, erro: 'UAZAPI_TOKEN não configurado' };
  const baseUrl = (config('UAZAPI_BASE') || '__UAZAPI_API__').replace(/\/+$/, '');
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    let resp;
    try {
      resp = await fetch(`${baseUrl}/send/text`, {
        method: 'POST',
        headers: { 'token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: destino, phone: destino, message, text: message }),
        signal: controller.signal,
      });
    } finally { clearTimeout(timer); }
    const body = await resp.text();
    let json = null;
    try { json = JSON.parse(body || ''); } catch { /* corpo não-JSON */ }
    const messageId = json ? (json.id || json.messageId || json.key?.id || json.message?.id || null) : null;
    if (resp.status === 200 && !json?.error && messageId && String(messageId).trim() !== '') {
      return { resultado: 'aceito', message_id: String(messageId), erro: null };
    }
    return { resultado: 'falha', message_id: null, erro: `HTTP ${resp.status}: ${(body || '').substring(0, 150)}` };
  } catch (e) {
    return { resultado: 'incerto', message_id: null, erro: `excecao_ou_timeout: ${e?.message}` };
  }
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const {
      tipo_erro,
      gravidade = 'medio',
      origem = 'sistema',
      descricao,
      possivel_causa = 'Verificar logs',
      acao_recomendada = 'Verificar manualmente no painel admin',
      pessoa_nome,
      pessoa_email,
      pessoa_telefone,
      pessoa_id,
      dados_extras,
    } = body;

    if (!tipo_erro || !descricao) {
      return Response.json({ error: 'tipo_erro e descricao são obrigatórios' }, { status: 400 });
    }

    const chave_unica = body.chave_unica || gerarChave(tipo_erro, pessoa_id, pessoa_email, pessoa_telefone);
    const agora = new Date().toISOString();
    const corteDedup = new Date(Date.now() - DEDUP_MINUTOS * 60 * 1000).toISOString();

    // Busca log existente pela chave única
    const existing = await base44.asServiceRole.entities.M31AuditLog.filter({ chave_unica });
    const logExistente = existing[0];

    let enviarAlerta = true;
    let logId = null;

    if (logExistente) {
      logId = logExistente.id;
      // Verifica deduplicação: já alertou nos últimos 30 min?
      if (logExistente.alerta_enviado_em && logExistente.alerta_enviado_em > corteDedup) {
        enviarAlerta = false;
      }
      // Atualiza o log existente
      await base44.asServiceRole.entities.M31AuditLog.update(logExistente.id, {
        descricao,
        possivel_causa,
        acao_recomendada,
        pessoa_nome: pessoa_nome || logExistente.pessoa_nome,
        pessoa_email: pessoa_email || logExistente.pessoa_email,
        pessoa_telefone: pessoa_telefone || logExistente.pessoa_telefone,
        pessoa_id: pessoa_id || logExistente.pessoa_id,
        dados_extras: dados_extras ? JSON.stringify(dados_extras) : logExistente.dados_extras,
        // Reabre se estava resolvido/ignorado e voltou a errar
        status: ['resolvido', 'ignorado'].includes(logExistente.status) ? 'novo' : logExistente.status,
        ...(enviarAlerta ? {
          alerta_enviado_em: agora,
          alert_count: (logExistente.alert_count || 1) + 1,
        } : {}),
      });
    } else {
      // Cria novo log
      const novoLog = await base44.asServiceRole.entities.M31AuditLog.create({
        chave_unica,
        tipo_erro,
        gravidade,
        origem,
        descricao,
        possivel_causa,
        acao_recomendada,
        pessoa_nome: pessoa_nome || null,
        pessoa_email: pessoa_email || null,
        pessoa_telefone: pessoa_telefone || null,
        pessoa_id: pessoa_id || null,
        dados_extras: dados_extras ? JSON.stringify(dados_extras) : null,
        status: 'novo',
        alerta_enviado_em: agora,
        alert_count: 1,
      });
      logId = novoLog.id;
    }

    // Envia WhatsApp se não está em dedup
    let zapiResult = null;
    let alertaEnviado = false;

    // ENVIO DIRETO (envio_direto=true): alerta operacional urgente — bypassa a
    // desativação temporária e a fila comercial, enviado imediatamente pela
    // UAZAPI ao gestor. Respeita apenas o kill-switch global (freio de
    // emergência). Usado pelo fluxo de compra de camisas: falhas de checkout
    // precisam chegar ao gestor na hora, sem aprovação manual de fila.
    if (enviarAlerta && body.envio_direto === true) {
      const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
      const control = (await base44.asServiceRole.entities.M31WhatsAppControl.filter({ data: hoje }, '-created_date', 1))[0];
      if (control?.bloqueado === true) {
        zapiResult = 'pendente_kill_switch';
      } else {
        const mensagem = montarMensagem({ gravidade, tipo_erro, descricao, pessoa_nome, pessoa_email, pessoa_telefone, pessoa_id, origem, possivel_causa, acao_recomendada });
        const resultado = await chamarUAZAPI(PAULO_PHONE, mensagem);
        zapiResult = `${resultado.resultado}${resultado.erro ? `: ${resultado.erro}` : resultado.message_id ? `: ${resultado.message_id}` : ''}`;
        alertaEnviado = resultado.resultado === 'aceito';
      }
    } else if (enviarAlerta && !ALERTAS_WHATSAPP_DESATIVADOS) {
      const churches = await base44.asServiceRole.entities.Church.filter({ slug: 'm31' });
      const church = churches[0];

      if (church) {
        const mensagem = montarMensagem({
          gravidade, tipo_erro, descricao, pessoa_nome, pessoa_email,
          pessoa_telefone, pessoa_id, origem, possivel_causa, acao_recomendada,
        });

          // REFATORADO: chamar m31WhatsAppService centralizado via invoke
          // Se falhar com 403 (exceção conhecida), usar fallback direto UAZAPI
          // ENFILEIRAR — m31WhatsAppService agora apenas enfileira em M31FilaMensagem.
          // Nenhum fallback direto à UAZAPI. Se o invoke falhar, o erro é logado
          // no M31AuditLog (já persistido acima) sem disparo de WhatsApp.
          try {
            const wpRes = await base44.asServiceRole.functions.invoke('m31WhatsAppService', {
              phone: PAULO_PHONE,
              message: mensagem,
            });
            zapiResult = wpRes.data?.body || wpRes.data;
            alertaEnviado = wpRes.data?.sucesso === true;
          } catch (e) {
            // Sem fallback UAZAPI direto. O erro já está registrado em M31AuditLog.
            logger.error('[AlertarGestor] Falha ao enfileirar alerta via m31WhatsAppService:', e?.message);
            zapiResult = `falha_enfileirar: ${e?.message}`;
            alertaEnviado = false;
          }
      }
    }

    return Response.json({
      success: true,
      log_id: logId,
      chave_unica,
      alerta_enviado: alertaEnviado,
      dedup_ativo: !enviarAlerta,
      zapi_result: zapiResult,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
