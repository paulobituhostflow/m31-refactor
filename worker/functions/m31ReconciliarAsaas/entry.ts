// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31ReconciliarAsaas v2 — RECONCILIAÇÃO DEFINITIVA
 *
 * Safety net periódica (2h) + execução manual pelo painel.
 * Consulta o Asaas e corrige inscrições cujo pagamento está aprovado,
 * mesmo quando o webhook falhar. Pipeline completo:
 *
 *   Pagamento confirmado → Inscrição aprovada → QR Code gerado
 *   → Boas-vindas enviadas → Entrega registrada
 *
 * IDEMPOTÊNCIA:
 *   - pagamento_confirmado_em: append-only (nunca sobrescrito) — trava reprocessamento
 *   - idempotency_key CPF:CONFIRMACAO_COM_QR:V1 no M31AutomacaoLog — trava envio duplicado
 *   - QR Code: só gerado se qrcode_url vazio
 *   - Boas-vindas: só enviadas se data_envio_boas_vindas vazio
 *   - Falhas podem ser reprocessadas com segurança (não marcam enviado)
 *
 * MODOS:
 *   - modo='audit' (default manual): só relata, não altera
 *   - modo='corrigir' (default agendado): corrige + despacha
 *   - inscricao_id: processa apenas uma inscrição específica
 *
 * Antes de enviar recuperação de abandono, o m31RecuperarCheckout já consulta
 * o Asaas — esta função garante a outra ponta: detectar pagamentos que o
 * webhook não capturou e completar o fluxo de entrega.
 */

const ASAAS_BASE = '__ASAAS_API__';
const STATUS_CONFIRMADOS_ASAAS = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'DUNNING_RECEIVED'];
const STATUS_NAO_APROVADOS = ['checkout_pendente', 'checkout_abandonado', 'pendente'];
const MAX_POR_EXECUCAO = 30;

function normalizePhone(phone: string): string {
  let d = (phone || '').replace(/\D/g, '');
  while (d.startsWith('5555')) d = d.slice(2);
  if (d.startsWith('55') && d.length >= 12) return d;
  if (d.length >= 10) return `55${d}`;
  return d;
}

function gerarCodigoInscricao(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return `M31-${code}`;
}

// ── Consultar Asaas por CPF ──────────────────────────────────────────────────
async function consultarPagamentoAsaas(cpf: string): Promise<any | null> {
  const KEY = config('ASAAS_API_KEY');
  if (!KEY) return null;
  const cpfLimpo = (cpf || '').replace(/\D/g, '');
  if (cpfLimpo.length !== 11) return null;
  try {
    const custRes = await fetch(`${ASAAS_BASE}/customers?cpfCnpj=${cpfLimpo}`, {
      headers: { 'access_token': KEY },
    });
    const custData = await custRes.json();
    if (!custData?.data?.length) return null;
    for (const cust of custData.data.slice(0, 3)) {
      const payRes = await fetch(`${ASAAS_BASE}/payments?customer=${cust.id}&limit=20`, {
        headers: { 'access_token': KEY },
      });
      const payData = await payRes.json();
      const pago = (payData?.data || []).find((p: any) => STATUS_CONFIRMADOS_ASAAS.includes(p.status));
      if (pago) return pago;
    }
    return null;
  } catch (e) {
    logger.error('[ReconciliarAsaas] Erro ao consultar Asaas:', (e as Error).message);
    return null;
  }
}

// ── Consultar Asaas em lote (pagamentos confirmados últimos 72h) ──────────────
async function consultarPagamentosAsaasLote(desde: string): Promise<any[]> {
  const KEY = config('ASAAS_API_KEY');
  if (!KEY) return [];
  const todos: any[] = [];
  let offset = 0;
  let hasMore = true;
  while (hasMore) {
    const resp = await fetch(
      `${ASAAS_BASE}/payments?status=RECEIVED&dateCreated.ge=${desde}&limit=100&offset=${offset}`,
      { headers: { 'access_token': KEY } }
    );
    const data = await resp.json();
    todos.push(...(data.data || []));
    hasMore = data.hasMore || false;
    offset += 100;
    if (offset > 500) break;
  }
  // Também busca CONFIRMED (cartão pode vir como CONFIRMED)
  offset = 0;
  hasMore = true;
  while (hasMore) {
    const resp = await fetch(
      `${ASAAS_BASE}/payments?status=CONFIRMED&dateCreated.ge=${desde}&limit=100&offset=${offset}`,
      { headers: { 'access_token': KEY } }
    );
    const data = await resp.json();
    todos.push(...(data.data || []));
    hasMore = data.hasMore || false;
    offset += 100;
    if (offset > 500) break;
  }
  return todos;
}

// ── Resolver grupo oficial ───────────────────────────────────────────────────
async function resolverGrupo(base44: any): Promise<string | null> {
  try {
    const grupos = await base44.asServiceRole.entities.M31GrupoConfig.filter({ finalidade: 'INSCRITAS_OFICIAL', ativo: true });
    return grupos[0]?.invite_link || null;
  } catch { return null; }
}

// ── Enviar WhatsApp via UAZAPI ───────────────────────────────────────────────
async function enviarWhatsApp(telefone: string, mensagem: string, imageUrl?: string): Promise<{ sucesso: boolean; status: number; body: string }> {
  const token = config('UAZAPI_TOKEN');
  if (!token) return { sucesso: false, status: 0, body: 'UAZAPI_TOKEN não configurado' };
  const baseUrl = (config('UAZAPI_BASE') || '__UAZAPI_API__').replace(/\/+$/, '');
  const phoneSanitized = normalizePhone(telefone);
  try {
    if (imageUrl) {

      const resp = await fetch(`${baseUrl}/send/media`, {
        method: 'POST',
        headers: { 'token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: phoneSanitized, phone: phoneSanitized, type: 'image',
          file: imageUrl, caption: mensagem, text: mensagem }),
      });
      const body = await resp.text();
      return { sucesso: resp.status === 200, status: resp.status, body };
    }
    const resp = await fetch(`${baseUrl}/send/text`, {
      method: 'POST',
      headers: { 'token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: phoneSanitized, phone: phoneSanitized, message, text: mensagem }),
    });
    const body = await resp.text();
    return { sucesso: resp.status === 200, status: resp.status, body };
  } catch (e) {
    return { sucesso: false, status: 0, body: (e as Error).message };
  }
}

// ── Enviar email via Brevo ───────────────────────────────────────────────────
async function enviarEmail(inscricao: any, codigo: string, qrCodeUrl: string): Promise<boolean> {
  const BREVO_KEY = config('BREVO_API_KEY');
  if (!BREVO_KEY || !inscricao.email) return false;
  const htmlContent = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family: Arial, cambria; background: #0f0f0f; color: #f5f5f5; padding: 30px; max-width: 600px; margin: 0 auto;">
  <div style="text-align: center; margin-bottom: 24px;">
    <h1 style="color: #f43f5e; font-size: 24px; margin: 0;">M31 Filhas</h1>
    <p style="color: #aaa; margin: 4px 0 0;">Imersão Mulheres de Fé</p>
  </div>
  <div style="background: #1a0a0a; border: 1px solid #f43f5e33; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
    <h2 style="color: #f43f5e; margin-top: 0;">✅ Inscrição Confirmada!</h2>
    <p style="font-size: 16px;">Olá, <strong>${inscricao.nome}</strong>! Seu pagamento foi confirmado com sucesso. 🎉</p>
    <div style="background: #2a0f0f; border-radius: 8px; padding: 16px; margin: 20px 0; text-align: center;">
      <p style="color: #aaa; margin: 0 0 8px; font-size: 13px;">SEU CÓDIGO DE CHECK-IN</p>
      <p style="font-size: 28px; font-weight: bold; color: #f43f5e; letter-spacing: 3px; margin: 0; font-family: monospace;">${codigo}</p>
    </div>
    <div style="text-align: center; margin: 24px 0;">
      <p style="color: #aaa; font-size: 13px; margin-bottom: 12px;">QR CODE PARA CHECK-IN</p>
      <img src="${qrCodeUrl}" alt="QR Code" style="width: 200px; height: 200px; border-radius: 8px; background: #fff;" />
    </div>
    <hr style="border: 1px solid #333; margin: 20px 0;" />
    <p style="margin: 6px 0;"><strong>📅 Data:</strong> 21 de novembro</p>
    <p style="margin: 6px 0;"><strong>🕗 Horário:</strong> 9h às 19h</p>
    <p style="margin: 6px 0;"><strong>📍 Local:</strong> Igreja RIO Prado, Recife-PE</p>
  </div>
  <p style="color: #888; font-size: 13px; text-align: center;">Guarde este e-mail e apresente o QR Code ou código no dia do evento para fazer o check-in.<br/><em>M31 Filhas — Imersão Mulheres de Fé 🌸</em></p>
</body></html>`;
  try {
    const resp = await fetch('__BREVO_API__/smtp/email', {
      method: 'POST',
      headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'M31 Filhas', email: 'm31filhas@gmail.com' },
        to: [{ email: inscricao.email, name: inscricao.nome }],
        subject: `✅ Inscrição Confirmada — M31 Filhas | ${codigo}`,
        htmlContent,
      }),
    });
    return resp.status === 201;
  } catch { return false; }
}

// ── Verificar idempotência de governance (M31AutomacaoLog) ────────────────────
async function jaEnviouConfirmacao(base44: any, cpfNorm: string, telNorm: string): Promise<boolean> {
  const AUTOMACOES_CONFIRMACAO = ['BOAS_VINDAS', 'CONFIRMACAO_TEXTO', 'CONFIRMACAO_COM_QR', 'QR_CODE', 'CONFIRMACAO'];
  try {
    // Por CPF
    if (cpfNorm) {
      const porCpf = await base44.asServiceRole.entities.M31AutomacaoLog.filter(
        { cpf: cpfNorm, status: 'enviado', automacao: { $in: AUTOMACOES_CONFIRMACAO } }, '-enviado_em', 1);
      if (porCpf.length > 0) return true;
    }
    // Por telefone
    const porTel = await base44.asServiceRole.entities.M31AutomacaoLog.filter(
      { telefone: telNorm, status: 'enviado', automacao: { $in: AUTOMACOES_CONFIRMACAO } }, '-enviado_em', 1);
    if (porTel.length > 0) return true;
    return false;
  } catch { return false; }
}

async function registrarLogGovernanca(base44: any, p: any) {
  try {
    await base44.asServiceRole.entities.M31AutomacaoLog.create({
      participante_id: p.participante_id, inscricao_principal: p.inscricao_id || null,
      cpf: p.cpf || null, telefone: p.telefone || null, email: p.email || null,
      automacao: p.automacao, template: p.template || null, versao: 'V1',
      status: p.status, enviado_em: new Date().toISOString(),
      execution_id: p.execution_id, origem: p.origem || 'm31ReconciliarAsaas',
      motivo_bloqueio: p.motivo_bloqueio || null, idempotency_key: p.idempotency_key,
    });
  } catch (e) { logger.error('[ReconciliarAsaas] Erro log gov:', (e as Error).message); }
}

async function registrarTimeline(base44: any, inscricao_id: string, evento: string, status: string, detalhe: string) {
  try {
    await base44.asServiceRole.entities.M31InscricaoTimeline.create({
      inscricao_id, evento, status, detalhe, origem: 'm31ReconciliarAsaas',
    });
  } catch {}
}

// ── Construir linha de relatório para uma inscrição ──────────────────────────
function construirLinhaRelatorio(inscricao: any, pagamentoAsaas: any | null): any {
  const cpfNorm = (inscricao.cpf || '').replace(/\D/g, '');
  const pagamentoConfirmado = !!pagamentoAsaas;
  const webhookRecebido = !!inscricao.pagamento_confirmado_em && !!inscricao.asaas_payment_id;
  const qrGerado = !!inscricao.qrcode_url;
  const boasVindasEnviadas = !!inscricao.data_envio_boas_vindas;
  const entregaConfirmada = !!inscricao.conferida_manualmente;
  
  let motivoFalha: string | null = null;
  if (pagamentoConfirmado && inscricao.status_pagamento !== 'aprovado') {
    motivoFalha = 'pagamento_confirmado_asaas_sem_status_aprovado_db';
  } else if (pagamentoConfirmado && !qrGerado) {
    motivoFalha = 'qr_code_nao_gerado';
  } else if (pagamentoConfirmado && !boasVindasEnviadas) {
    motivoFalha = 'boas_vindas_nao_enviadas';
  } else if (pagamentoConfirmado && qrGerado && boasVindasEnviadas && !entregaConfirmada) {
    motivoFalha = null; // fluxo ok, falta conferência manual
  }

  return {
    id: inscricao.id,
    nome: inscricao.nome,
    cpf: cpfNorm,
    whatsapp: inscricao.whatsapp,
    email: inscricao.email,
    status_sistema: inscricao.status_pagamento,
    status_asaas: pagamentoAsaas?.status || 'nao_encontrado',
    pagamento_confirmado: pagamentoConfirmado,
    data_confirmacao: inscricao.pagamento_confirmado_em || (pagamentoAsaas?.paymentDate ? new Date(pagamentoAsaas.paymentDate).toISOString() : null),
    webhook_recebido: webhookRecebido,
    inscricao_aprovada: inscricao.status_pagamento === 'aprovado',
    qr_code_gerado: qrGerado,
    boas_vindas_enviadas: boasVindasEnviadas,
    entrega_confirmada: entregaConfirmada,
    motivo_falha: motivoFalha,
    valor_pago_asaas: pagamentoAsaas?.value || null,
    asaas_payment_id: pagamentoAsaas?.id || inscricao.asaas_payment_id || null,
    inconsistente: pagamentoConfirmado && (!webhookRecebido || inscricao.status_pagamento !== 'aprovado' || !qrGerado || !boasVindasEnviadas),
  };
}

return (async (req: Request): Promise<Response> => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const modo = body?.modo || 'corrigir';
    const inscricaoIdEspecifica = body?.inscricao_id || null;
    const apenasAuditar = modo === 'audit';

    // Auth check para execução manual
    try {
      const user = await base44.auth.me();
      if (user && user.role !== 'admin' && !apenasAuditar) {
        return Response.json({ error: 'Apenas administradores' }, { status: 403 });
      }
    } catch {
      // Execução via automação agendada — sem usuário, prosseguir
    }

    // ── Selecionar inscrições para auditar ──────────────────────────────────
    let candidatas: any[] = [];
    
    if (inscricaoIdEspecifica) {
      const found = await base44.asServiceRole.entities.EventoM31Inscricao.filter({ id: inscricaoIdEspecifica });
      candidatas = found;
    } else {
      // Bulk: não-aprovados + aprovados sem QR/boas-vindas
      const [pendentes, abandonados, pendentesPag, aprovadosSemBv] = await Promise.all([
        base44.asServiceRole.entities.EventoM31Inscricao.filter({ status_pagamento: 'checkout_pendente' }, '-created_date', MAX_POR_EXECUCAO),
        base44.asServiceRole.entities.EventoM31Inscricao.filter({ status_pagamento: 'checkout_abandonado' }, '-created_date', MAX_POR_EXECUCAO),
        base44.asServiceRole.entities.EventoM31Inscricao.filter({ status_pagamento: 'pendente' }, '-created_date', MAX_POR_EXECUCAO),
        base44.asServiceRole.entities.EventoM31Inscricao.filter({ status_pagamento: 'aprovado', data_envio_boas_vindas: null }, '-created_date', MAX_POR_EXECUCAO),
      ]);
      // Dedup por id
      const seen = new Set<string>();
      for (const arr of [pendentes, abandonados, pendentesPag, aprovadosSemBv]) {
        for (const i of arr) {
          if (!seen.has(i.id)) { seen.add(i.id); candidatas.push(i); }
        }
      }
      candidatas = candidatas.slice(0, MAX_POR_EXECUCAO);
    }

    // ── Para cada inscrição, consultar Asaas por CPF ─────────────────────────
    const linhas: any[] = [];
    const corrigidas: any[] = [];
    const pendentesAnalise: any[] = [];
    let grupoLink: string | null = null;

    for (const insc of candidatas) {
      const pagamentoAsaas = await consultarPagamentoAsaas(insc.cpf);
      const linha = construirLinhaRelatorio(insc, pagamentoAsaas);
      linhas.push(linha);

      // Se apenas auditoria, pular correção
      if (apenasAuditar) {
        if (linha.inconsistente) pendentesAnalise.push(linha);
        continue;
      }

      // ── CORREÇÃO: se pagamento confirmado no Asaas mas inconsistente no sistema ──
      if (pagamentoAsaas && linha.inconsistente) {
        const cpfNorm = (insc.cpf || '').replace(/\D/g, '');
        const telNorm = normalizePhone(insc.whatsapp || '');
        const idempotencyKey = `${cpfNorm}:CONFIRMACAO_COM_QR:V1`;

        // IDEMPOTÊNCIA 1: pagamento_confirmado_em append-only — já processado?
        if (insc.pagamento_confirmado_em) {
          // Já tem carimbo financeiro — pode ter sido corrigido antes mas falta QR/bv
          // Continuar para completar o fluxo
        }

        // Resolver grupo se ainda não foi
        if (!grupoLink) grupoLink = await resolverGrupo(base44);

        // Passo 1: Atualizar status + dados financeiros (se ainda não aprovado)
        const updateDados: any = {
          origem_pagamento: insc.origem_pagamento || 'asaas',
        };
        if (insc.status_pagamento !== 'aprovado') {
          updateDados.status_pagamento = 'aprovado';
        }
        if (!insc.asaas_payment_id) {
          updateDados.asaas_payment_id = pagamentoAsaas.id;
        }
        if (!insc.asaas_billing_type) {
          updateDados.asaas_billing_type = pagamentoAsaas.billingType || null;
        }
        // pagamento_confirmado_em: append-only — só seta se vazio
        if (!insc.pagamento_confirmado_em) {
          const dataConfirmacao = pagamentoAsaas.paymentDate || pagamentoAsaas.confirmedDate || pagamentoAsaas.clientPaymentDate;
          if (dataConfirmacao) {
            updateDados.pagamento_confirmado_em = new Date(dataConfirmacao).toISOString();
          }
        }
        if (!insc.valor_pago || insc.valor_pago === 0) {
          updateDados.valor_pago = pagamentoAsaas.value;
          updateDados.asaas_total_value = pagamentoAsaas.value;
        }
        updateDados.fila_recuperacao = false;
        updateDados.fila_boas_vindas = true;
        updateDados.fila_boas_vindas_em = new Date().toISOString();
        updateDados.liberada_para_envio = true;
        updateDados.liberada_para_envio_em = new Date().toISOString();
        updateDados.webhook_processando = false;

        await base44.asServiceRole.entities.EventoM31Inscricao.update(insc.id, updateDados);
        await registrarTimeline(base44, insc.id, 'reconciliacao_asaas_status_corrigido', 'sucesso',
          `Status corrigido de ${insc.status_pagamento} para aprovado. Pagamento ${pagamentoAsaas.id} (${pagamentoAsaas.status}) confirmado no Asaas. pagamento_confirmado_em setado.`);

        // Passo 2: Gerar QR Code se não existir
        let codigo = insc.codigo_inscricao || '';
        let qrCodeUrl = insc.qrcode_url || '';
        if (!codigo) {
          codigo = gerarCodigoInscricao();
        }
        if (!qrCodeUrl) {
          qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(codigo)}&bgcolor=FFFFFF&color=000000&format=png`;
          await base44.asServiceRole.entities.EventoM31Inscricao.update(insc.id, {
            codigo_inscricao: codigo,
            qrcode_token: qrCodeUrl, qrcode_url: qrCodeUrl,
            qrcode_gerado_em: new Date().toISOString(),
          });
        }

        // Passo 3: ENFILEIRAR na fila governada (NUNCA enviar diretamente via UAZAPI)
        // A reconciliação apenas prepara a inscrição e enfileira a mensagem.
        // O envio real exige aprovação manual no painel de filas (aprovado_para_envio=false).
        let enfileirado = false;
        let motivoFalhaEnvio: string | null = null;

        if (!insc.data_envio_boas_vindas) {
          // IDEMPOTÊNCIA 2: governance — já enviou confirmação por CPF/telefone?
          const jaEnviou = await jaEnviouConfirmacao(base44, cpfNorm, telNorm);
          if (jaEnviou) {
            // Outro processo já enviou — sincronizar estado
            await base44.asServiceRole.entities.EventoM31Inscricao.update(insc.id, {
              data_envio_boas_vindas: new Date().toISOString(),
              qr_envio_status: 'enviado_com_sucesso',
              status_envio_grupo: 'enviado',
              estado_jornada: 'jornada_concluida',
              fila_boas_vindas: false,
              liberada_para_envio: false,
            });
            await registrarTimeline(base44, insc.id, 'reconciliacao_confirmacao_ja_enviada', 'sucesso',
              'Governança detectou que confirmação já foi enviada por outro processo. Estado sincronizado para jornada_concluida.');
            enfileirado = true;
          } else {
            // Buscar template
            const tplRecs = await base44.asServiceRole.entities.M31MessageTemplate.filter(
              { chave_unica: 'confirmacao_com_qr', is_active: true }, '-updated_date', 1);
            const tplContent = tplRecs[0]?.content ||
              `Aqui está, {{primeiro_nome}}! 🌸\n🎟️ Código da sua inscrição:\n{{codigo_inscricao}}\n\n📲 Seu QR Code está na imagem.\nApresente-o no credenciamento do evento.\n\n👇 *Entre no grupo oficial da Imersão M31 Filhas:*\n{{link_grupo_whatsapp}}\n\nPor lá, você receberá todas as orientações e informações importantes do evento.\n\n☺️ Nos vemos no M31!`;
            const nome = insc.nome?.split(' ')[0] || 'Querida';
            const mensagem = tplContent
              .replace(/\{\{primeiro_nome\}\}/g, nome)
              .replace(/\{\{codigo_inscricao\}\}/g, codigo)
              .replace(/\{\{link_grupo_whatsapp\}\}/g, grupoLink || '');

            // ENFILEIRAR na fila governada — aprovado_para_envio=false (trava manual)
            // O drenador (m31DrenarFila) só envia após aprovação explícita no painel.
            try {
              await base44.asServiceRole.entities.M31FilaMensagem.create({
                dedup_key: idempotencyKey,
                participante_id: cpfNorm || telNorm,
                cpf: cpfNorm || null,
                telefone: telNorm,
                email: (insc.email || '').toLowerCase().trim() || null,
                automacao: 'CONFIRMACAO_COM_QR',
                template: 'confirmacao_com_qr',
                versao: 'V1',
                origem: 'm31ReconciliarAsaas',
                inscricao_id: insc.id,
                inscricao_nome: insc.nome,
                mensagens: [{ message: mensagem, image_url: qrCodeUrl }],
                status: 'pendente',
                aprovado_para_envio: false,
                prioridade: 5,
              });
              enfileirado = true;

              // Registrar governance log como pendente (não enviado — aguarda aprovação)
              const executionId = crypto.randomUUID();
              await registrarLogGovernanca(base44, {
                participante_id: cpfNorm || telNorm, inscricao_id: insc.id,
                cpf: cpfNorm || null, telefone: telNorm, email: (insc.email || '').toLowerCase().trim(),
                automacao: 'CONFIRMACAO_COM_QR', template: 'confirmacao_com_qr',
                status: 'pendente',
                execution_id: executionId, origem: 'm31ReconciliarAsaas',
                idempotency_key: idempotencyKey,
              });

              // Email pode ser enviado (não é WhatsApp — não causa bloqueio de conta)
              const emailOk = await enviarEmail(insc, codigo, qrCodeUrl);

              await base44.asServiceRole.entities.EventoM31Inscricao.update(insc.id, {
                qr_envio_status: 'reenvio_pendente',
                estado_jornada: 'pagamento_confirmado',
                email_envio_status: emailOk ? 'enviado' : 'pendente',
                email_boas_vindas_enviado_em: emailOk ? new Date().toISOString() : null,
                fila_boas_vindas: true,
                liberada_para_envio: false,
                webhook_processando: false,
              });
              await registrarTimeline(base44, insc.id, 'reconciliacao_confirmacao_enfileirada', 'sucesso',
                `Confirmação enfileirada na fila governada (M31FilaMensagem). Aguarda aprovação manual para envio via WhatsApp. Email: ${emailOk ? 'enviado' : 'pendente'}. QR Code gerado.`);
            } catch (e: any) {
              motivoFalhaEnvio = `erro_enfileiramento: ${e.message}`;
              await base44.asServiceRole.entities.EventoM31Inscricao.update(insc.id, {
                qr_envio_status: 'falha_envio',
                estado_jornada: 'pagamento_confirmado',
                webhook_processando: false,
              });
              await registrarTimeline(base44, insc.id, 'reconciliacao_enfileiramento_falhou', 'falha',
                `Falha ao enfileirar confirmação na fila governada: ${e.message}. Estado mantido em pagamento_confirmado.`);
            }
          }
        } else {
          // Boas-vindas já enviadas — apenas completar QR se faltar
          if (!insc.qrcode_url) {
            await base44.asServiceRole.entities.EventoM31Inscricao.update(insc.id, {
              qrcode_token: qrCodeUrl, qrcode_url: qrCodeUrl,
              qrcode_gerado_em: new Date().toISOString(),
            });
          }
          enfileirado = true;
        }

        corrigidas.push({
          ...linha,
          acao: enfileirado ? 'corrigido_e_enfileirado' : 'corrigido_enfileiramento_falhou',
          motivo_falha_envio: motivoFalhaEnvio,
        });
      } else if (!pagamentoAsaas && STATUS_NAO_APROVADOS.includes(insc.status_pagamento)) {
        // Pagamento não confirmado no Asaas — legítimo pendente/abandonado
        pendentesAnalise.push(linha);
      } else if (pagamentoAsaas && !linha.inconsistente) {
        // Já consistente — tudo ok
      }
    }

    // ── Relatório final ──────────────────────────────────────────────────────
    const totalAuditadas = linhas.length;
    const totalInconsistencias = linhas.filter(l => l.inconsistente).length;
    const totalCorrigidas = corrigidas.length;
    const totalPendentesAnalise = pendentesAnalise.length;

    return Response.json({
      success: true,
      modo,
      total_auditadas: totalAuditadas,
      total_inconsistencias: totalInconsistencias,
      total_corrigidas: totalCorrigidas,
      total_pendentes_analise: totalPendentesAnalise,
      causa_raiz: totalInconsistencias > 0
        ? 'Webhook do Asaas não disparou ou falhou na sincronização — pagamento confirmado no provedor mas não refletido no sistema'
        : null,
      linhas,
      corrigidas,
      pendentes_analise: pendentesAnalise,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
})(req);
}
