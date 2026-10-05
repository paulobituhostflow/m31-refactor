// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31ReceberWebhookUazapi — Receptor de webhooks da UAZAPI
 *
 * Recebe:
 * - Mensagens enviadas (monitorar status de entrega)
 * - Respostas de inscritas (mensagens recebidas)
 *
 * Filtra wasSentByApi=true para ignorar mensagens disparadas pelo sistema
 * (evita loop infinito)
 */

interface UazapiMessage {
  id?: string;
  phone?: string;
  number?: string;
  message?: string;
  text?: string;
  timestamp?: number;
  wasSentByApi?: boolean;
  isGroupMessage?: boolean;
  senderName?: string;
  fromMe?: boolean;
  status?: string;
  [key: string]: any;
}

function gerarCodigoInscricao(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `M31-${code}`;
}

// ENVIO DIRETO via UAZAPI — quando a participante responde, a janela de conversa
// está aberta. O QR é entregue IMEDIATAMENTE, sem passar pela fila de drenagem.
async function sendViaUAZAPI(phone: string, message: string, imageUrl?: string) {
  const token = config('UAZAPI_TOKEN');
  if (!token) throw new Error('UAZAPI_TOKEN não configurado');
  const baseUrl = (config('UAZAPI_BASE') || '__UAZAPI_API__').replace(/\/+$/, '');
  let d = (phone || '').replace(/\D/g, '');
  while (d.startsWith('5555')) d = d.slice(2);
  const phoneSanitized = d.startsWith('55') && d.length >= 12 ? d : (d.length >= 10 ? `55${d}` : d);
  if (imageUrl) {

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    let resp: any;
    try {
      resp = await fetch(`${baseUrl}/send/media`, {
        method: 'POST',
        headers: { 'token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: phoneSanitized, phone: phoneSanitized, type: 'image',
          file: imageUrl, caption: message || '', text: message || '' }),
        signal: controller.signal,
      });
    } finally { clearTimeout(timer); }
    const body = await resp.text();
    return { sucesso: resp.status === 200, status: resp.status, body };
  }
  const resp = await fetch(`${baseUrl}/send/text`, {
    method: 'POST',
    headers: { 'token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ number: phoneSanitized, phone: phoneSanitized, message, text: message }),
  });
  const body = await resp.text();
  return { sucesso: resp.status === 200, status: resp.status, body };
}

// ── DETECÇÃO DE RESPOSTA HUMANA ──────────────────────────────────
// Filtra mensagens automáticas/robôs para só disparar boas-vindas quando
// o contato é uma pessoa real engajada no WhatsApp (mais seguro anti-bloqueio).
function ehRespostaHumana(text: string, message: UazapiMessage): boolean {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim();
  if (t.length < 2) return false;
  // Opt-out (tratado separadamente — não dispara boas-vindas)
  if (/^(sair|parar|stop|unsubscribe|descancelar)$/i.test(t)) return false;
  // Auto-respostas comuns de robôs
  const botPatterns = [
    /^auto.?reply/i,
    /mensagem autom/i,
    /n[ãa]o posso atender agora/i,
    /estou dirigindo/i,
    /volto logo/i,
  ];
  if (botPatterns.some(p => p.test(t))) return false;
  if ((message as any).senderIsBusiness || (message as any).isBusiness) return false;
  return true;
}

// ── SUPORTE CAMISAS — registro de compra por mensagem única da Dulce ──
// A Dulce envia "REGISTRAR COMPRA" com os campos em uma única mensagem
// (a foto do comprovante vai anexada à mesma mensagem). O pedido entra em
// EventoM31CamisaPedido (origem whatsapp_suporte) como aguardando
// conferência — o comprovante NUNCA confirma pagamento sozinho.
// Idempotente por origem_mensagem_id: reentrega do webhook não duplica.
const DULCE_CAMISAS = '5581994060437';
const CAMISA_MODELOS_SUPORTE = ['jesus', 'milagres', 'filhas', 'equipe'];
const CAMISA_TAMANHOS_SUPORTE = ['PP', 'P', 'M', 'G', 'GG', 'XGG'];
const CAMISA_CORES_SUPORTE = ['preta', 'cereja'];
const FILA_BLOQUEIA_REENFILEIRAR = ['pendente', 'processando', 'enviado', 'incerto', 'falha_terminal'];

function semAcentoCamisa(value: string): string {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function parseCompraCamisa(text: string): Record<string, string> {
  const campos: Record<string, string> = {};
  for (const linha of String(text || '').split('\n')) {
    const m = /^\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ ]*?)\s*:\s*(.+?)\s*$/.exec(linha);
    if (!m) continue;
    campos[semAcentoCamisa(m[1])] = m[2].trim();
  }
  return campos;
}

function itensTextoCamisa(pedido: any): string {
  return (pedido.itens_cobrados || pedido.itens || [])
    .map((i: any) => `${i.modelo || ''}${i.cor ? ` ${i.cor}` : ''} ${i.tamanho || ''}`.trim())
    .join('\n');
}

async function responderDulce(S: any, texto: string, dedupKey: string) {
  const existentes = await S.M31FilaMensagem.filter({ dedup_key: dedupKey }, '-created_date', 5);
  if (existentes.find((f: any) => FILA_BLOQUEIA_REENFILEIRAR.includes(f.status))) return 'ja_na_fila';
  await S.M31FilaMensagem.create({
    dedup_key: dedupKey,
    participante_id: `DULCE:${DULCE_CAMISAS}`,
    telefone: DULCE_CAMISAS,
    automacao: 'SUPORTE_CAMISAS',
    template: 'suporte_camisas_resposta',
    versao: 'V1',
    origem: 'm31ReceberWebhookUazapi:camisas',
    inscricao_nome: 'Dulce — Camisas',
    mensagens: [{ message: texto }],
    status: 'pendente',
    aprovado_para_envio: true,
    prioridade: 1,
    execution_id: crypto.randomUUID(),
  });
  return 'enfileirado';
}

async function registrarCompraCamisaWhatsApp(base44: any, text: string, msgId: string, mediaUrl: string, senderName: string) {
  const S = base44.asServiceRole.entities;

  // Idempotência: a mesma mensagem (reentrega do webhook) nunca cria dois pedidos.
  const jaRegistrado = (await S.EventoM31CamisaPedido.filter({ origem_mensagem_id: msgId }, '-created_date', 1))[0];
  if (jaRegistrado) {
    await responderDulce(S, `Esse pedido já estava registrado ✅\n\nNome: ${jaRegistrado.nome}\nModelo/tamanho: ${itensTextoCamisa(jaRegistrado)}\nSituação: ${jaRegistrado.status_pagamento === 'pago' ? 'pago' : 'aguardando conferência'}`, `CAMISA_REGISTRO_RESPOSTA:${msgId}`);
    return { status: 'ja_registrado', pedido_id: jaRegistrado.id };
  }

  const campos = parseCompraCamisa(text);
  const nome = String(campos['nome'] || '').trim();
  const whatsDigitos = String(campos['whatsapp'] || '').replace(/\D/g, '');
  const whats = whatsDigitos.startsWith('55') ? whatsDigitos : `55${whatsDigitos}`;
  const modelo = semAcentoCamisa(campos['modelo']);
  const cor = semAcentoCamisa(campos['cor']);
  const tamanho = String(campos['tamanho'] || '').toUpperCase().trim();
  const quantidade = Number(String(campos['quantidade'] || '1').replace(/\D/g, '')) || 0;
  const inscrita = semAcentoCamisa(campos['inscrita']);
  const valorNumerico = Number(String(campos['valor'] || '').replace(/\./g, '').replace(',', '.')) || 0;
  const jaInscrita = ['sim', 's', 'si', 'yes'].includes(inscrita);

  const erros: string[] = [];
  if (nome.length < 3 || nome.length > 160) erros.push('Nome');
  if (!/^55\d{10,11}$/.test(whats)) erros.push('WhatsApp (com DDD)');
  if (!CAMISA_MODELOS_SUPORTE.includes(modelo)) erros.push('Modelo (jesus, milagres, filhas ou equipe)');
  if (modelo === 'jesus' && !CAMISA_CORES_SUPORTE.includes(cor)) erros.push('Cor (preta ou cereja)');
  if (!CAMISA_TAMANHOS_SUPORTE.includes(tamanho)) erros.push('Tamanho (PP, P, M, G, GG ou XGG)');
  if (quantidade < 1 || quantidade > 10) erros.push('Quantidade (1 a 10)');
  if (!['sim', 's', 'si', 'yes', 'nao', 'n', 'no'].includes(inscrita)) erros.push('Inscrita (sim ou nao)');

  if (erros.length > 0) {
    const formato = 'Nome: Maria da Silva\nWhatsApp: 81 99999-9999\nModelo: Jesus\nCor: Preta (somente modelo Jesus)\nTamanho: M\nQuantidade: 2\nInscrita: sim\nValor: 130,00 (opcional)';
    await responderDulce(S, `Não consegui registrar a compra — confira: ${erros.join(', ')}.\n\nEnvie assim (a foto do comprovante pode ir anexada na mesma mensagem):\n${formato}`, `CAMISA_REGISTRO_ERRO:${msgId}`);
    return { status: 'formato_invalido', erros };
  }

  const itens: any[] = [];
  for (let i = 0; i < quantidade; i++) {
    itens.push({ modelo, tamanho, cor: modelo === 'jesus' ? cor : '', entregue: false });
  }

  const pedido = await S.EventoM31CamisaPedido.create({
    pedido_token: crypto.randomUUID(),
    nome,
    whatsapp: whats,
    ja_inscrita_m31: jaInscrita,
    inscricao_m31_declarada_em: new Date().toISOString(),
    itens,
    itens_cobrados: itens.map((i: any) => ({ modelo: i.modelo, tamanho: i.tamanho, cor: i.cor })),
    quantidade,
    valor_total: valorNumerico > 0 ? valorNumerico : 0,
    status_pagamento: 'checkout_pendente',
    origem: 'whatsapp_suporte',
    origem_mensagem_id: msgId,
    cobranca_estado: 'nao_iniciada',
    observacoes: senderName ? `Registrado via WhatsApp por ${senderName}` : 'Registrado via WhatsApp',
  });

  // Comprovante: melhor esforço — storage privado; fallback mantém a URL do provedor.
  // Nunca altera status_pagamento.
  if (mediaUrl && /^https?:\/\//.test(mediaUrl)) {
    let comprovanteUri = mediaUrl;
    try {
      const resp = await fetch(mediaUrl);
      if (resp.ok) {
        const blob = await resp.blob();
        const upload = await base44.asServiceRole.integrations.Core.UploadPrivateFile({ file: blob });
        if (upload?.file_uri) comprovanteUri = upload.file_uri;
      }
    } catch { /* mantém a URL original como comprovante */ }
    await S.EventoM31CamisaPedido.update(pedido.id, { comprovante_uri: comprovanteUri, comprovante_em: new Date().toISOString() }).catch(() => {});
  }

  await responderDulce(S, [
    '✅ *Compra registrada!*',
    '',
    `Nome: ${nome}`,
    `Modelo/tamanho: ${itens.map((i: any) => `${i.modelo}${i.cor ? ` ${i.cor}` : ''} ${i.tamanho}`).join(' | ')}`,
    `Quantidade: ${quantidade}`,
    `Inscrita no M31: ${jaInscrita ? 'sim' : 'nao'}`,
    'Situação: aguardando conferência',
    '',
    'Conferido o pagamento, confirme no painel Camisas.',
  ].join('\n'), `CAMISA_REGISTRO_RESPOSTA:${msgId}`);

  return { status: 'registrado', pedido_id: pedido.id };
}

return (async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    logger.log('[UAZAPI Webhook] 📥 RAW PAYLOAD:', JSON.stringify(body).substring(0, 1200));

    // ── Normalizar payload: UAZAPI pode enviar flat OU aninhado em "data" ──
    const message: any = (body as any).data || body;
    const msgEvent = (body as any).event || message.event || (body as any).type || '';
    logger.log('[UAZAPI Webhook] Evento:', msgEvent || '(não especificado)');

    // ── Extrair telefone de vários formatos possíveis ──
    const rawPhone: string = message.phone || message.number || message.from ||
      (message.key?.remoteJid ? String(message.key.remoteJid).split('@')[0] : '') || '';
    // ── Extrair texto de vários formatos possíveis ──
    const text: string = message.message?.conversation || // Baileys
      message.message?.extendedTextMessage?.text || // Baileys extended
      message.message?.imageMessage?.caption || // Baileys foto com legenda (comprovante)
      message.body || // n8n style
      message.content ||
      message.text ||
      message.message ||
      '';
    const senderName: string = message.senderName || message.pushName || message.notifyName || '';
    const wasSentByApi = message.wasSentByApi === true || message.fromMe === true ||
      (message.key?.fromMe === true);
    const isGroupMsg = message.isGroupMessage === true ||
      (message.key?.remoteJid ? String(message.key.remoteJid).includes('@g.us') : false);

    // ── Ignorar mensagens enviadas pelo sistema (evita loop) ────────────
    if (wasSentByApi) {
      logger.log('[UAZAPI Webhook] ⏭️ Ignorado: wasSentByApi/fromMe=true (mensagem do sistema)');
      return Response.json({ success: true, ignored: 'wasSentByApi_or_fromMe' });
    }

    // ── Mensagens de GRUPO: apenas o grupo de SUPORTE entra no sistema ──
    // Demais grupos continuam ignorados. O grupo M31 Suporte (M31GrupoConfig
    // finalidade=SUPORTE) é ingerido no histórico (M31GrupoMensagem) —
    // fonte de contexto do Chat IA que atende à frente do grupo.
    if (isGroupMsg) {
      const groupJid = [message.key?.remoteJid, message.groupJid, message.chat, message.from, message.number, message.phone]
        .map((v: any) => String(v || ''))
        .find((v: string) => v.includes('@g.us')) || '';
      const participante = String(
        message.key?.participant || message.participant || message.author ||
        message.senderId || message.sender || '',
      ).split('@')[0].replace(/\D/g, '');
      logger.log(`[UAZAPI Webhook] 👥 Mensagem de grupo ${groupJid} — participante="${participante}"`);

      const base44 = createClientFromRequest(req);
      const S = base44.asServiceRole.entities;
      const cfgGrupo = (await S.M31GrupoConfig.filter({ chat_id: groupJid, ativo: true }, '-created_date', 1))[0];
      if (!cfgGrupo || cfgGrupo.finalidade !== 'SUPORTE') {
        logger.log('[UAZAPI Webhook] ⏭️ Ignorado: grupo sem finalidade SUPORTE');
        return Response.json({ success: true, ignored: 'isGroupMessage' });
      }

      // Idempotência: a mesma mensagem (reentrega do webhook) nunca entra duas vezes.
      const msgId = String(message.id || message.key?.id || `${groupJid}:${participante}:${message.timestamp || Date.now()}`);
      const jaRegistrada = (await S.M31GrupoMensagem.filter({ origem_mensagem_id: msgId }, '-created_date', 1))[0];
      if (jaRegistrada) {
        return Response.json({ success: true, grupo: 'suporte', ignored: 'duplicada' });
      }

      const telParticipante = participante.startsWith('55') ? participante : `55${participante}`;

      // Dulce — REGISTRAR COMPRA dentro do grupo (mesmo fluxo e trava do direto).
      if (telParticipante === DULCE_CAMISAS && /^registrar\s+compra/i.test(text)) {
        const mediaUrl = String(
          message.mediaUrl || message.media?.url || message.url ||
          message.message?.imageMessage?.url || message.file || '',
        ).trim();
        const resultado = await registrarCompraCamisaWhatsApp(base44, text, msgId, mediaUrl, senderName);
        logger.log('[UAZAPI Webhook] 🛍️ Camisas — registro da Dulce (grupo suporte):', JSON.stringify(resultado));
      }

      await S.M31GrupoMensagem.create({
        chat_id: groupJid,
        finalidade: 'SUPORTE',
        remetente_telefone: telParticipante || 'desconhecido',
        remetente_nome: senderName || null,
        texto: text,
        origem_mensagem_id: msgId,
        recebido_em: new Date().toISOString(),
      });
      logger.log('[UAZAPI Webhook] ✅ Mensagem de grupo registrada no histórico de suporte');
      return Response.json({ success: true, grupo: 'suporte', historico: true });
    }

    if (!rawPhone || !text) {
      logger.warn('[UAZAPI Webhook] ❌ Campos incompletos. phone=' + rawPhone + ' text=' + text +
        ' keys=' + Object.keys(message).join(','));
      return Response.json({ success: false, reason: 'missing_fields', phone: rawPhone, text }, { status: 400 });
    }

    logger.log(`[UAZAPI Webhook] ✅ Mensagem recebida — telefone="${rawPhone}" texto="${text}" sender="${senderName}"`);

    // ── Buscar inscrição associada ──────────────────────────────────────
    const base44 = createClientFromRequest(req);
    let normPhone = rawPhone.replace(/\D/g, '');
    // Corrigir DDI duplicado (known issue: 5555 prefix)
    while (normPhone.startsWith('5555')) normPhone = normPhone.slice(2);
    logger.log('[UAZAPI Webhook] Telefone normalizado:', normPhone);

    // ── Dulce — REGISTRAR COMPRA (camisas) por mensagem única ──────────
    // Apenas o número autorizado da Dulce cria pedidos de camisa por aqui.
    const telDulceCamisas = normPhone.startsWith('55') ? normPhone : `55${normPhone}`;
    if (telDulceCamisas === DULCE_CAMISAS && /^registrar\s+compra/i.test(text)) {
      const msgId = String(message.id || `${telDulceCamisas}:${message.timestamp || Date.now()}`);
      const mediaUrl = String(
        message.mediaUrl || message.media?.url || message.url ||
        message.message?.imageMessage?.url || message.file || '',
      ).trim();
      const resultado = await registrarCompraCamisaWhatsApp(base44, text, msgId, mediaUrl, senderName);
      logger.log('[UAZAPI Webhook] 🛍️ Camisas — registro da Dulce:', JSON.stringify(resultado));
      return Response.json({ success: true, camisas_suporte: resultado });
    }

    // ── Suporte M31 (modo observador): registrar atendimento ───────────
    // A automação de entidade em M31Atendimento dispara m31SuporteObservador.
    const ADMIN_PAULO = '5581992008889';
    const telSuporte = normPhone.startsWith('55') ? normPhone : `55${normPhone}`;
    await base44.asServiceRole.entities.M31Atendimento.create({
      tipo: telSuporte === ADMIN_PAULO ? 'feedback_admin' : 'cliente',
      telefone: telSuporte,
      remetente_nome: senderName || null,
      mensagem_original: text,
      recebido_em: new Date().toISOString(),
      status_processamento: 'novo',
    }).catch((e) => logger.error('[UAZAPI Webhook] Falha ao registrar atendimento:', (e as Error).message));

    // ── Buscar inscrição: tentar MÚLTIPLOS formatos de telefone ─────────
    const formatosTel = [
      normPhone,                                                    // 5581992008889
      normPhone.startsWith('55') ? normPhone.slice(2) : `55${normPhone}`, // 81992008889 ou 5581992008889
      normPhone.replace(/^55/, ''),                                // sem 55
      `55${normPhone.replace(/^55/, '')}`,                         // sempre com 55
    ];
    let inscricoes: any[] = [];
    let formatoMatched = '';
    for (const fmt of formatosTel) {
      if (inscricoes.length > 0) break;
      try {
        inscricoes = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
          { whatsapp: fmt }, '-updated_date', 5
        );
        if (inscricoes.length > 0) formatoMatched = fmt;
      } catch (e) { /* tenta próximo formato */ }
    }

    if (inscricoes.length === 0) {
      logger.warn(`[UAZAPI Webhook] ❌ Nenhuma inscrição para ${normPhone} (tentados: ${formatosTel.join(' | ')})`);
      return Response.json({ success: true, found: false, phone: normPhone });
    }

    logger.log(`[UAZAPI Webhook] 📋 Inscrição localizada: ${inscricoes[0].nome} (id=${inscricoes[0].id}) formato=${formatoMatched}`);
    const inscricao = inscricoes[0];
    // ── MÁQUINA DE ESTADOS: verificar se a jornada está em estado que aceita resposta ──
    // Aceita resposta mesmo em transição (processando_boas_vindas) — a participante
    // pode responder antes do sistema salvar o estado final.
    const estadoJornada = inscricao.estado_jornada || 'pendente';
    // V2: jornada_concluida e qr_enviado também aceitam resposta — o reenvio
    // é exatamente para inscritas que já receberam a confirmação direta mas
    // cuja entrega não foi confirmada (entrega_confirmada=false).
    const estadosQueAceitamResposta = [
      'pagamento_confirmado',
      'processando_boas_vindas',
      'aguardando_resposta',
      'qr_enviado',
      'jornada_concluida',
    ];
    // Compatibilidade histórica: inscrições que receberam boas-vindas ANTES do campo
    // estado_jornada existir ficaram em "pendente". Se data_envio_boas_vindas existe,
    // aceitar resposta mesmo em pendente (boas-vindas já foi entregue).
    const aceitaResposta = estadosQueAceitamResposta.includes(estadoJornada) ||
      (estadoJornada === 'pendente' && !!inscricao.data_envio_boas_vindas);
    const jaTemQR = inscricao.qr_envio_status === 'enviado_com_sucesso' ||
      estadoJornada === 'qr_enviado' || estadoJornada === 'jornada_concluida';

    logger.log(`[UAZAPI Webhook] 📊 Status inscrição — estado_jornada="${estadoJornada}" status_pagamento="${inscricao.status_pagamento}" qr_envio_status="${inscricao.qr_envio_status}" jaTemQR=${jaTemQR} data_boas_vindas=${inscricao.data_envio_boas_vindas || '(vazio)'} aceitaResposta=${aceitaResposta}`);

    // ── Registrar em MessageLog (para auditoria) ───────────────────────
    await base44.asServiceRole.entities.M31MessageLog.create({
      inscricao_id: inscricao.id,
      inscricao_nome: inscricao.nome,
      telefone: telSuporte,
      tipo: 'resposta_participante',
      stage: 'webhook_uazapi',
      mensagem: text,
      sucesso: true,
      zapi_response: JSON.stringify({
        tipo: 'resposta_webhook',
        message_id: message.id,
        timestamp: message.timestamp,
        fromMe: message.fromMe,
      }),
      enviado_em: new Date().toISOString()
    });

    // ── Atualizar último contato ────────────────────────────────────────
    await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
      last_contact_at: new Date().toISOString()
    }).catch(() => {});

    // ── RESPOSTA HUMANA → ENTREGAR QR CODE + GRUPO ───────────────────
    // A participante respondeu → janela de conversa aberta, momento seguro.
    // Só entrega QR se: pagamento confirmado, boas-vindas foi enviada (ou está
    // em processamento — aceita resposta antecipada), e QR ainda não entregue.
    //
    // ⚠️ GATE DE CONFIGURAÇÃO: o fluxo de entrega de QR via resposta fica
    // DESATIVADO por padrão (webhook_resposta_uazapi_ativo=false). As novas
    // inscrições recebem a confirmação completa diretamente no webhook do Asaas
    // e no despachador. Este fluxo só é reativado quando a UAZAPI for validada
    // em produção e o gestor ativar a config.
    try {
      const S = base44.asServiceRole.entities;

      // ── Verificar config: fluxo de resposta ativo? ──
      const cfgs = await S.EventoM31Config.list('-created_date', 1);
      const respostaAtiva = cfgs[0]?.webhook_resposta_uazapi_ativo === true;
      if (!respostaAtiva) {
        logger.log('[UAZAPI Webhook] 🔒 Fluxo de resposta DESATIVADO por config (webhook_resposta_uazapi_ativo=false). Inscrição já recebeu confirmação completa diretamente. Apenas registrando atendimento e log.');
        return Response.json({
          success: true,
          inscricao_id: inscricao.id,
          inscricao_nome: inscricao.nome,
          message_logged: true,
          qr_delivery_skipped: 'webhook_resposta_desativado',
        });
      }

      const cpfNorm = (inscricao.cpf || '').replace(/\D/g, '');
      const pessoa = cpfNorm || telSuporte;

      // ═══ BLOQUEIO ANTI-DUPLICIDADE: se o QR já foi enviado com sucesso, NUNCA reenviar.
      // A resposta da participante é a PROVA de entrega — apenas marcar entrega_confirmada=true.
      // Reenviar gera duplicidade (participante já tem a mensagem do despachador).
      if (jaTemQR) {
        if (!inscricao.entrega_confirmada) {
          await S.EventoM31Inscricao.update(inscricao.id, {
            entrega_confirmada: true,
          }).catch(() => {});
          logger.log(`[UAZAPI Webhook] ✅ entrega_confirmada=true (participante respondeu — prova de entrega). QR já enviado, NENHUM reenvio.`);
        } else {
          logger.log(`[UAZAPI Webhook] ⏭️ QR já enviado e entrega já confirmada — nenhuma ação necessária.`);
        }
        // Fechar atendimentos pendentes — a participante já está confirmada
        await S.M31Atendimento.updateMany(
          { telefone: telSuporte, tipo: 'cliente', status_aprovacao: { $nin: ['encerrado_sem_resposta', 'aprovado', 'editado_aprovado', 'rejeitado'] } },
          { $set: { status_processamento: 'processado', status_aprovacao: 'encerrado_sem_resposta', intencao: 'confirmacao_inscricao', observacao: 'Participante já tem QR — entrega confirmada por resposta' } }
        ).catch(() => {});
        return Response.json({
          success: true,
          inscricao_id: inscricao.id,
          inscricao_nome: inscricao.nome,
          message_logged: true,
          qr_delivery_skipped: 'qr_ja_enviado_entrega_confirmada',
        });
      }

      // ELEGIBILIDADE: só envia QR se NUNCA foi enviado (jaTemQR=false).
      // Participante que já tem QR não recebe duplicidade.
      const elegivel = ['aprovado', 'gratuito'].includes(inscricao.status_pagamento) &&
        inscricao.cadastro_pendente !== true &&
        inscricao.opt_out !== true &&
        aceitaResposta;
      const ehHumana = ehRespostaHumana(text, message);

      if (!elegivel) {
        const motivos = [];
        if (!['aprovado', 'gratuito'].includes(inscricao.status_pagamento)) motivos.push(`status_pagamento=${inscricao.status_pagamento}`);
        if (inscricao.cadastro_pendente === true) motivos.push('cadastro_pendente=true');
        if (inscricao.opt_out === true) motivos.push('opt_out=true');
        if (!aceitaResposta) motivos.push(`estado_jornada=${estadoJornada} (sem boas-vindas)`);
        logger.log(`[UAZAPI Webhook] 🚫 Não elegível para QR: ${motivos.join(', ')}`);
      } else if (!ehHumana) {
        logger.log(`[UAZAPI Webhook] 🚫 Mensagem não classificada como humana: "${text.substring(0, 50)}"`);
      } else {
        logger.log(`[UAZAPI Webhook] ✅ Elegível para entrega de QR (primeiro envio) — prosseguindo com envio direto`);
      }

      if (elegivel && ehHumana) {
        // ═══ MARCAR ENTREGA CONFIRMADA — a participante respondeu, prova de entrega ═══
        if (!inscricao.entrega_confirmada) {
          await S.EventoM31Inscricao.update(inscricao.id, {
            entrega_confirmada: true,
          }).catch(() => {});
          logger.log(`[UAZAPI Webhook] ✅ entrega_confirmada=true (participante respondeu — prova de entrega)`);
        }

        // ── Verificação ampliada: qualquer confirmação já enviada ──
        const confirmacoesEnviadas = await S.M31AutomacaoLog.filter(
          { participante_id: pessoa, automacao: { $in: ['BOAS_VINDAS', 'CONFIRMACAO_TEXTO', 'CONFIRMACAO_COM_QR'] }, status: 'enviado' },
          '-enviado_em', 5);
        const jaRecebeuConfirmacao = confirmacoesEnviadas.length > 0 || !!inscricao.data_envio_boas_vindas;
        logger.log(`[UAZAPI Webhook] Verificação confirmação: jaRecebeuConfirmacao=${jaRecebeuConfirmacao} (logs=${confirmacoesEnviadas.length} data_bw=${!!inscricao.data_envio_boas_vindas})`);

        if (!jaRecebeuConfirmacao) {
          logger.log(`[UAZAPI Webhook] → CASO 1: Sem boas-vindas prévia — enviando boas-vindas + QR completos`);
          // CASO 1: Nunca recebeu boas-vindas → mensagem completa + QR Code
          let codigo = inscricao.codigo_inscricao || '';
          if (!codigo) {
            codigo = gerarCodigoInscricao();
            await S.EventoM31Inscricao.update(inscricao.id, { codigo_inscricao: codigo });
          }
          const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(codigo)}&bgcolor=FFFFFF&color=000000&format=png`;
          let qrOk = false;
          try {
            const qrResp = await fetch(qrCodeUrl);
            qrOk = qrResp.status === 200 && (qrResp.headers.get('content-type') || '').startsWith('image/');
            await qrResp.body?.cancel();
          } catch (_) { qrOk = false; }
          const grupos = await S.M31GrupoConfig.filter({ finalidade: 'INSCRITAS_OFICIAL', ativo: true });
          const linkGrupo = grupos[0]?.invite_link || '';
          if (qrOk && codigo && linkGrupo) {
            // ── Template editável da confirmação com QR ──
            const tplRecs = await S.M31MessageTemplate.filter({ chave_unica: 'confirmacao_com_qr', is_active: true }, '-updated_date', 1);
            const tplContent = tplRecs[0]?.content || `Aqui está, {{primeiro_nome}}! 🌸\n🎟️ Código da sua inscrição:\n{{codigo_inscricao}}\n\n📲 Seu QR Code está na imagem.\nApresente-o no credenciamento do evento.\n\n👇 *Entre no grupo oficial da Imersão M31 Filhas:*\n{{link_grupo_whatsapp}}\n\nPor lá, você receberá todas as orientações e informações importantes do evento.\n\n☺️ Nos vemos no M31!`;
            const mensagem = tplContent
              .replace(/\{\{primeiro_nome\}\}/g, inscricao.nome?.split(' ')[0] || 'Querida')
              .replace(/\{\{codigo_inscricao\}\}/g, codigo)
              .replace(/\{\{link_grupo_whatsapp\}\}/g, linkGrupo);
            // ═══ ENVIO DIRETO — QR image com template como caption (uma mensagem) ═══
            const execId = crypto.randomUUID();
            const dedupKey = `CONFIRMACAO:${inscricao.id}:V2`;
            const qrRes = await sendViaUAZAPI(telSuporte, mensagem, qrCodeUrl);
            const tudoOk = qrRes.sucesso;
            logger.log(`[UAZAPI Webhook] 📤 CASO 1 envio: status=${qrRes.status} sucesso=${tudoOk} body=${(qrRes.body || '').substring(0, 200)}`);
            await S.M31AutomacaoLog.create({
              participante_id: pessoa, inscricao_principal: inscricao.id,
              cpf: cpfNorm || null, telefone: telSuporte, email: (inscricao.email || '').toLowerCase() || null,
              automacao: 'BOAS_VINDAS', template: 'confirmacao_com_qr', versao: 'V1',
              status: tudoOk ? 'enviado' : 'bloqueado', enviado_em: new Date().toISOString(),
              execution_id: execId, origem: 'm31ReceberWebhookUazapi:envio_direto',
              idempotency_key: dedupKey,
              motivo_bloqueio: tudoOk ? null : `qr=${qrRes.status}`,
            }).catch(() => {});
            await S.M31MessageLog.create({
              inscricao_id: inscricao.id, inscricao_nome: inscricao.nome, telefone: telSuporte,
              tipo: 'boas_vindas', stage: 'boas_vindas',
              mensagem: mensagem, sucesso: tudoOk,
              zapi_response: (qrRes.body || '').substring(0, 500),
              erro: tudoOk ? null : `falha_envio_direto: qr=${qrRes.status}`,
              enviado_em: new Date().toISOString(),
            }).catch(() => {});
            if (tudoOk) {
              await S.EventoM31Inscricao.update(inscricao.id, {
                estado_jornada: 'jornada_concluida',
                data_envio_boas_vindas: new Date().toISOString(),
                status_envio_grupo: 'enviado', liberada_para_envio: false,
                qr_envio_status: 'enviado_com_sucesso', qr_ultimo_envio_em: new Date().toISOString(),
                qrcode_token: qrCodeUrl, qrcode_url: qrCodeUrl, qrcode_gerado_em: new Date().toISOString(),
                entrega_confirmada: true,
              }).catch(() => {});
              // ═══ LIMPEZA DA FILA: QR entregue direto → SUPORTE pendente é redundante ═══
              await S.M31FilaMensagem.updateMany(
                { telefone: telSuporte, status: 'pendente', automacao: 'SUPORTE' },
                { $set: { status: 'cancelado', erro: 'qr_entregue_direto_webhook — suporte desnecessário', processado_em: new Date().toISOString() } }
              ).catch(() => {});
              // Fecha TODOS os atendimentos de cliente não resolvidos (novo OU já processado pelo observador)
              await S.M31Atendimento.updateMany(
                { telefone: telSuporte, tipo: 'cliente', status_aprovacao: { $nin: ['encerrado_sem_resposta', 'aprovado', 'editado_aprovado', 'rejeitado'] } },
                { $set: { status_processamento: 'processado', status_aprovacao: 'encerrado_sem_resposta', intencao: 'confirmacao_inscricao', observacao: 'QR entregue diretamente via webhook — atendimento resolvido automaticamente' } }
              ).catch(() => {});
            }
            logger.log(`[UAZAPI Webhook] Boas-vindas + QR enviados DIRETAMENTE (resposta humana) para ${inscricao.nome} — ok=${tudoOk}`);
          }
        } else if (jaRecebeuConfirmacao && !inscricao.entrega_confirmada) {
          // CASO 2 (primário): confirmação já enviada pelo fluxo direto, mas a entrega
          // não foi confirmada (entrega_confirmada=false). A participante respondeu →
          // janela aberta → reenviar QR como rede de segurança.
          logger.log(`[UAZAPI Webhook] → CASO 2: Confirmação enviada mas entrega não confirmada — reenviando QR`);
          // CASO 2: Recebeu boas-vindas mas QR não → reenviar só o QR
          const dedupQr = `REENVIO_QR:${inscricao.id}:V2`;
          const qrEnviado = await S.M31AutomacaoLog.filter(
            { idempotency_key: dedupQr, status: 'enviado' }, '-enviado_em', 1);
          const qrNaFila = await S.M31FilaMensagem.filter({ dedup_key: dedupQr }, '-created_date', 5);
          const qrBloqueante = qrNaFila.some(f =>
            ['pendente', 'processando', 'enviado', 'incerto', 'falha_terminal'].includes(f.status));
          if (qrEnviado.length === 0 && !qrBloqueante) {
            let codigo = inscricao.codigo_inscricao || '';
            if (!codigo) {
              codigo = gerarCodigoInscricao();
              await S.EventoM31Inscricao.update(inscricao.id, { codigo_inscricao: codigo });
            }
            const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(codigo)}&bgcolor=FFFFFF&color=000000&format=png`;
            let qrOk = false;
            try {
              const qrResp = await fetch(qrCodeUrl);
              qrOk = qrResp.status === 200 && (qrResp.headers.get('content-type') || '').startsWith('image/');
              await qrResp.body?.cancel();
            } catch (_) { qrOk = false; }
            const grupos = await S.M31GrupoConfig.filter({ finalidade: 'INSCRITAS_OFICIAL', ativo: true });
            const linkGrupo = grupos[0]?.invite_link || '';
            if (qrOk && codigo && linkGrupo) {
              // ── Template editável da confirmação com QR ──
              const tplRecs2 = await S.M31MessageTemplate.filter({ chave_unica: 'confirmacao_com_qr', is_active: true }, '-updated_date', 1);
              const tplContent2 = tplRecs2[0]?.content || `Aqui está, {{primeiro_nome}}! 🌸\n🎟️ Código da sua inscrição:\n{{codigo_inscricao}}\n\n📲 Seu QR Code está na imagem.\nApresente-o no credenciamento do evento.\n\n👇 *Entre no grupo oficial da Imersão M31 Filhas:*\n{{link_grupo_whatsapp}}\n\nPor lá, você receberá todas as orientações e informações importantes do evento.\n\n☺️ Nos vemos no M31!`;
              const caption = tplContent2
                .replace(/\{\{primeiro_nome\}\}/g, inscricao.nome?.split(' ')[0] || 'Querida')
                .replace(/\{\{codigo_inscricao\}\}/g, codigo)
                .replace(/\{\{link_grupo_whatsapp\}\}/g, linkGrupo);
              // ═══ ENVIO DIRETO — participante respondeu, janela aberta. Sem fila. ═══
              const execId = crypto.randomUUID();
              const qrRes = await sendViaUAZAPI(telSuporte, caption, qrCodeUrl);
              const tudoOk = qrRes.sucesso;
              logger.log(`[UAZAPI Webhook] 📤 CASO 2 envio: status=${qrRes.status} sucesso=${tudoOk} body=${(qrRes.body || '').substring(0, 200)}`);
              await S.M31AutomacaoLog.create({
                participante_id: pessoa, inscricao_principal: inscricao.id,
                cpf: cpfNorm || null, telefone: telSuporte, email: (inscricao.email || '').toLowerCase() || null,
                automacao: 'CONFIRMACAO_COM_QR', template: 'confirmacao_com_qr_v1', versao: 'V1',
                status: tudoOk ? 'enviado' : 'bloqueado', enviado_em: new Date().toISOString(),
                execution_id: execId, origem: 'm31ReceberWebhookUazapi:envio_direto',
                idempotency_key: dedupQr,
                motivo_bloqueio: tudoOk ? null : `qr=${qrRes.status}`,
              }).catch(() => {});
              await S.M31MessageLog.create({
                inscricao_id: inscricao.id, inscricao_nome: inscricao.nome, telefone: telSuporte,
                tipo: 'boas_vindas', stage: 'qr_code',
                mensagem: caption, sucesso: tudoOk,
                zapi_response: (qrRes.body || '').substring(0, 500),
                erro: tudoOk ? null : `falha_envio_direto: qr=${qrRes.status}`,
                enviado_em: new Date().toISOString(),
              }).catch(() => {});
              if (tudoOk) {
                await S.EventoM31Inscricao.update(inscricao.id, {
                  estado_jornada: 'jornada_concluida',
                  qr_envio_status: 'enviado_com_sucesso', qr_ultimo_envio_em: new Date().toISOString(),
                  qrcode_token: qrCodeUrl, qrcode_url: qrCodeUrl, qrcode_gerado_em: new Date().toISOString(),
                  data_envio_boas_vindas: inscricao.data_envio_boas_vindas || new Date().toISOString(),
                  status_envio_grupo: 'enviado',
                  entrega_confirmada: true,
                }).catch(() => {});
                // ═══ LIMPEZA DA FILA: QR reenviado direto → SUPORTE pendente é redundante ═══
                await S.M31FilaMensagem.updateMany(
                  { telefone: telSuporte, status: 'pendente', automacao: 'SUPORTE' },
                  { $set: { status: 'cancelado', erro: 'qr_reenviado_direto_webhook — suporte desnecessário', processado_em: new Date().toISOString() } }
                ).catch(() => {});
                // Fecha TODOS os atendimentos de cliente não resolvidos (novo OU já processado pelo observador)
                await S.M31Atendimento.updateMany(
                  { telefone: telSuporte, tipo: 'cliente', status_aprovacao: { $nin: ['encerrado_sem_resposta', 'aprovado', 'editado_aprovado', 'rejeitado'] } },
                  { $set: { status_processamento: 'processado', status_aprovacao: 'encerrado_sem_resposta', intencao: 'qr_code', observacao: 'QR reenviado diretamente via webhook — atendimento resolvido automaticamente' } }
                ).catch(() => {});
              }
              logger.log(`[UAZAPI Webhook] QR enviado DIRETAMENTE (resposta humana) para ${inscricao.nome} — ok=${tudoOk}`);
            }
          }
        }
      }
    } catch (e) {
      logger.error('[UAZAPI Webhook] Falha no disparo por resposta humana:', (e as Error).message);
    }

    logger.log(`[UAZAPI Webhook] ✅ Processado para ${inscricao.nome} (${inscricao.id})`);

    return Response.json({
      success: true,
      inscricao_id: inscricao.id,
      inscricao_nome: inscricao.nome,
      message_logged: true
    });

  } catch (error) {
    logger.error('[UAZAPI Webhook] 💥 ERRO NÃO TRATADO:', (error as Error).message);
    logger.error('[UAZAPI Webhook] Stack:', (error as Error).stack);
    return Response.json({
      error: (error as Error).message,
      success: false
    }, { status: 500 });
  }
})(req);
}
