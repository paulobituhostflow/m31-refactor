// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31ReguaFollowupGrupo — Régua automática de follow-up de entrada no grupo
 * oficial para inscritas CONFIRMADAS.
 *
 * Etapas por pessoa (máximo: QR/link inicial + FU1 + FU2 — nenhuma etapa repetida):
 *   A. Já no grupo (M31GrupoMembro ativo, cruzamento por TELEFONE, nunca nome):
 *      - sem QR entregue → enfileira SOMENTE o lembrete de QR
 *        (template lembrete_qr_ja_no_grupo, sem link do grupo);
 *      - com QR entregue → régua encerrada, nada é enviado.
 *   B. Fora do grupo e sem QR/link entregues → classificada como fluxo inicial;
 *      o pipeline de confirmações existente é o dono dessa entrega.
 *   C. Fora do grupo com QR e link realmente enviados há ≥48h, sem FU1 →
 *      enfileira GRUPO_FOLLOWUP_1 (reforço para entrar no grupo).
 *   D. Fora do grupo com FU1 realmente enviado há ≥48h, sem FU2 → re-confere
 *      grupo/opt-out/cooldown/idempotência e enfileira GRUPO_FOLLOWUP_2
 *      ("[Primeiro nome]? 👀"). Após FU2 aceito, régua encerrada.
 *
 * EVIDÊNCIA REAL — "pendente na fila" NÃO significa enviado. Enviado é somente:
 *   - M31FilaMensagem status='enviado' (aceite UAZAPI com messageid), ou
 *   - M31AutomacaoLog status='enviado', ou
 *   - campos da inscrição gravados exclusivamente pós-aceite pelo drenador
 *     (qr_envio_status='enviado_com_sucesso', status_envio_grupo='enviado').
 *
 * SEGURANÇA (re-checagem imediata antes de enfileirar cada pessoa):
 *   telefone normalizado → M31GrupoMembro (status ativa, por telefone) →
 *   opt-out → cooldown 48h sobre último envio CONFIRMADO → idempotência
 *   ({tel}:GRUPO_FOLLOWUP_1:V1 / {tel}:GRUPO_FOLLOWUP_2:V1 / QR lembrete).
 *   Condição mudou = cancela sem disparo, com registro em timeline e log.
 *   O drenador (m31DrenarFila) refaz o re-check do grupo NO MOMENTO do disparo.
 *
 * Envio: enfileira aprovado_para_envio=true (envio automático via drenador,
 * dentro da janela comercial, sem forcar_envio). Templates fail-closed:
 *   grupo_followup_1, grupo_followup_2, lembrete_qr_ja_no_grupo.
 *
 * Ações:
 *   { action: 'simular' }  → classifica e devolve os números, NÃO enfileira.
 *   { action: 'executar' } → classifica e enfileira os elegíveis.
 * Porta de entrada: workflow agendado diário ou admin.
 */

const COOLDOWN_MS = 48 * 3600000;
const AUTOMACOES_EVIDENCIA = ['QR_CODE', 'CONFIRMACAO_COM_QR', 'CONFIRMACAO_TEXTO', 'GRUPO', 'BOAS_VINDAS', 'GRUPO_FOLLOWUP_1', 'GRUPO_FOLLOWUP_2'];
// Templates de boas-vindas que realmente entregavam QR + link do grupo
// (conteúdo histórico auditado — evidência legítima de envio):
const BOAS_VINDAS_COM_QR = ['boas_vindas_confirmacao', 'boas_vindas_confirmacao_pagador', 'confirmacao_v1'];
const BOAS_VINDAS_SO_LINK = ['reprocesso_boas_vindas'];
const STATUS_FILA_ATIVO = ['pendente', 'processando', 'enviado', 'incerto', 'falha_terminal'];
const MALE_FIRST = new Set(['jose', 'joao', 'carlos', 'paulo', 'pedro', 'antonio', 'marcos', 'lucas', 'gabriel', 'rafael', 'mateus', 'rodrigo', 'eduardo', 'fernando', 'thiago', 'vitor', 'felipe', 'bruno', 'diego', 'igor', 'davi', 'enzo', 'murilo']);

function normalizePhone(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  while (d.startsWith('5555')) d = d.slice(2);
  if (d.startsWith('55') && d.length >= 12) return d;
  if (d.length >= 10) return `55${d}`;
  return d;
}

// Chaves de cruzamento com membros do grupo: telefone bruto normalizado com
// tratamento de DDI duplicado (5555) e nono dígito brasileiro — nunca por nome.
function phoneKeys(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  while (d.startsWith('5555')) d = d.slice(2);
  if (!d.startsWith('55') && d.length >= 10) d = `55${d}`;
  if (d.length === 12 && d.startsWith('55')) d = d.slice(0, 4) + '9' + d.slice(4);
  const keys = new Set([d]);
  if (d.length === 13 && d.startsWith('55')) keys.add(d.slice(0, 4) + d.slice(5));
  return keys;
}

function variantsOf(tel) {
  const v = [tel];
  if (tel.length === 13 && tel.startsWith('55')) v.push(tel.slice(0, 4) + tel.slice(5));
  return v;
}

function semAcento(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function primeiroNome(nome) {
  return String(nome || '').trim().split(/\s+/)[0] || 'Querida';
}

function maxTime(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return a > b ? a : b;
}

function renderTemplate(content, vars) {
  let out = String(content || '');
  for (const [tag, valor] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{\\{\\s*${tag}\\s*\\}\\}`, 'g'), valor);
  }
  return out;
}

return (async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const acao = body?.action === 'executar' ? 'executar' : 'simular';
    const base44 = createClientFromRequest(req);
    // Admin (execução manual) ou automação agendada (sem usuário autenticado)
    try {
      const user = await base44.auth.me();
      if (user && user.role !== 'admin') return Response.json({ error: 'Apenas admin pode executar a régua' }, { status: 403 });
    } catch { /* workflow agendado — prosseguir */ }
    const S = base44.asServiceRole.entities;

    // ── 1. Grupo oficial por FINALIDADE — nunca por nome ──
    let grupo = null;
    try {
      const res = await base44.asServiceRole.functions.invoke('m31ResolverGrupo', { finalidade: 'INSCRITAS_OFICIAL' });
      grupo = res?.data || res;
    } catch (e) {
      return Response.json({ success: false, cancelado: true, motivo: 'grupo_nao_resolvido', erro: e?.message }, { status: 503 });
    }
    if (!grupo?.success || !grupo?.chat_id) {
      return Response.json({ success: false, cancelado: true, motivo: 'grupo_nao_configurado' }, { status: 503 });
    }
    const inviteLink = grupo.invite_link || null;

    // ── 2. Membros ativos do grupo oficial → chaves de telefone ──
    const groupKeys = new Set();
    const membrosGrupo = await S.M31GrupoMembro.filter({ group_jid: grupo.chat_id, status: 'ativa' }, '-ultima_deteccao', 2000);
    for (const m of membrosGrupo || []) for (const k of phoneKeys(m.phone)) groupKeys.add(k);

    // ── 3. Templates fail-closed (ausente/inativo = não enfileira) ──
    const tplFu1 = (await S.M31MessageTemplate.filter({ chave_unica: 'grupo_followup_1', is_active: true }, '-updated_date', 1))[0] || null;
    const tplFu2 = (await S.M31MessageTemplate.filter({ chave_unica: 'grupo_followup_2', is_active: true }, '-updated_date', 1))[0] || null;
    const tplQrLembrete = (await S.M31MessageTemplate.filter({ chave_unica: 'lembrete_qr_ja_no_grupo', is_active: true }, '-updated_date', 1))[0] || null;

    // ── 4. Confirmadas elegíveis (aprovadas, sem opt-out, sem cadastro pendente) ──
    const inscricoes = await S.EventoM31Inscricao.filter(
      { status_pagamento: 'aprovado', opt_out: { $ne: true }, cadastro_pendente: { $ne: true } },
      '-created_date', 1000);

    // ── 5. PESSOA é a unidade de controle: dedup por telefone normalizado ──
    const pessoas = new Map(); // tel → { tel, inscricao, nome, cpf }
    const inconsistencias = [];
    const optOutExcluidos = 0;
    for (const insc of inscricoes || []) {
      const tel = normalizePhone(insc.whatsapp);
      const nome = String(insc.nome || '').trim();
      if (!/^55\d{10,11}$/.test(tel)) {
        inconsistencias.push({ nome, whatsapp: String(insc.whatsapp || ''), motivo: 'telefone_invalido', inscricao_id: insc.id });
        continue;
      }
      const nomeChave = semAcento(nome);
      if (/teste/.test(nomeChave) || MALE_FIRST.has((nomeChave.split(' ')[0] || ''))) {
        inconsistencias.push({ nome, whatsapp: tel, motivo: 'registro_teste_ou_masculino', inscricao_id: insc.id });
        continue;
      }
      if (!pessoas.has(tel)) {
        pessoas.set(tel, { tel, inscricao: insc, nome, cpf: String(insc.cpf || '').replace(/\D/g, '') || null });
      }
    }
    const tels = [...pessoas.keys()];

    // ── 6. Histórico REAL de comunicação (fila + log enviados), em lote ──
    const hist = new Map(); // tel → { qr, qr_em, link, link_em, fu1, fu1_em, fu2, fu2_em, ultimo }
    function h(tel) {
      if (!hist.has(tel)) hist.set(tel, { qr: false, qr_em: null, link: false, link_em: null, fu1: false, fu1_em: null, fu2: false, fu2_em: null, ultimo: null });
      return hist.get(tel);
    }
    const varToTel = new Map();
    for (const tel of tels) for (const v of variantsOf(tel)) varToTel.set(v, tel);
    // Logs antigos podem não ter o campo telefone: a pessoa também é identificada
    // por participante_id (CPF normalizado ou telefone) — cruzamos pelos dois.
    const participanteToTel = new Map();
    for (const [tel, p] of pessoas) {
      for (const v of variantsOf(tel)) participanteToTel.set(v, tel);
      if (p.cpf) participanteToTel.set(p.cpf, tel);
    }

    function aplicarEvidencia(tel, automacao, template, em, comImagem = false) {
      const e = h(tel);
      if (!em) return;
      if (automacao === 'GRUPO') {
        e.link = true; e.link_em = maxTime(e.link_em, em);
      } else if (automacao === 'GRUPO_FOLLOWUP_1') {
        e.fu1 = true; e.fu1_em = maxTime(e.fu1_em, em);
      } else if (automacao === 'GRUPO_FOLLOWUP_2') {
        e.fu2 = true; e.fu2_em = maxTime(e.fu2_em, em);
      } else if (automacao === 'CONFIRMACAO_COM_QR') {
        // Confirmação com QR real; o convite do grupo só vai no template com convite
        e.qr = true; e.qr_em = maxTime(e.qr_em, em);
        if (template !== 'lembrete_qr_ja_no_grupo') {
          e.link = true; e.link_em = maxTime(e.link_em, em);
        }
      } else if (automacao === 'QR_CODE') {
        e.qr = true; e.qr_em = maxTime(e.qr_em, em);
      } else if (automacao === 'BOAS_VINDAS') {
        // Boas-vindas históricas: QR + link no template de confirmação (ou quando
        // a própria fila registra imagem de QR anexada), somente link no reprocesso.
        // Demais variantes: só contam para cooldown.
        if (BOAS_VINDAS_COM_QR.includes(template) || comImagem) {
          e.qr = true; e.qr_em = maxTime(e.qr_em, em);
          e.link = true; e.link_em = maxTime(e.link_em, em);
        } else if (BOAS_VINDAS_SO_LINK.includes(template)) {
          e.link = true; e.link_em = maxTime(e.link_em, em);
        }
      }
      // CONFIRMACAO_TEXTO: confirmação sem QR/link — apenas atualiza o último envio (cooldown)
      e.ultimo = maxTime(e.ultimo, em);
    }

    const todasVariantes = [...varToTel.keys()];
    for (let i = 0; i < todasVariantes.length; i += 50) {
      const bloco = todasVariantes.slice(i, i + 50);
      const filaEnviadas = await S.M31FilaMensagem.filter(
        { telefone: { $in: bloco }, status: 'enviado', automacao: { $in: AUTOMACOES_EVIDENCIA } },
        '-processado_em', 1000);
      for (const f of filaEnviadas || []) {
        const tel = varToTel.get(String(f.telefone || ''));
        const comImagem = Array.isArray(f.mensagens) && f.mensagens.some(m => m && m.image_url);
        if (tel) aplicarEvidencia(tel, f.automacao, f.template, f.processado_em, comImagem);
      }
      const logsEnviados = await S.M31AutomacaoLog.filter(
        { telefone: { $in: bloco }, status: 'enviado', automacao: { $in: AUTOMACOES_EVIDENCIA } },
        '-enviado_em', 1000);
      for (const l of logsEnviados || []) {
        const tel = varToTel.get(String(l.telefone || ''));
        if (tel) aplicarEvidencia(tel, l.automacao, l.template, l.enviado_em);
      }
      const idsBloco = [...new Set(bloco.flatMap(v => {
        const tel = varToTel.get(v);
        const p = tel ? pessoas.get(tel) : null;
        return [v, ...(p?.cpf ? [p.cpf] : [])];
      }))];
      const logsPorParticipante = await S.M31AutomacaoLog.filter(
        { participante_id: { $in: idsBloco }, status: 'enviado', automacao: { $in: AUTOMACOES_EVIDENCIA } },
        '-enviado_em', 1000);
      for (const l of logsPorParticipante || []) {
        const tel = participanteToTel.get(String(l.participante_id || '')) || varToTel.get(String(l.telefone || ''));
        if (tel) aplicarEvidencia(tel, l.automacao, l.template, l.enviado_em);
      }
    }

    // Timeline (era pré-fila): eventos de envio com SUCESSO são evidência real
    // de aceite — qr_enviado, grupo_enviado, boas_vindas_enviada.
    const cpfToTel = new Map();
    for (const [tel, p] of pessoas) if (p.cpf) cpfToTel.set(p.cpf, tel);
    const cpfs = [...cpfToTel.keys()];
    for (let i = 0; i < cpfs.length; i += 50) {
      const bloco = cpfs.slice(i, i + 50);
      const timeline = await S.M31InscricaoTimeline.filter(
        { cpf: { $in: bloco }, status: 'sucesso', evento: { $in: ['qr_enviado', 'grupo_enviado', 'boas_vindas_enviada'] } },
        '-created_date', 1000);
      for (const t of timeline || []) {
        const tel = cpfToTel.get(String(t.cpf || ''));
        if (!tel) continue;
        const em = t.created_date || null;
        const e = h(tel);
        if (t.evento === 'qr_enviado') { e.qr = true; e.qr_em = maxTime(e.qr_em, em); }
        else if (t.evento === 'grupo_enviado') { e.link = true; e.link_em = maxTime(e.link_em, em); }
        else if (t.evento === 'boas_vindas_enviada') {
          // Boas-vindas da era pré-fila: QR + convite do grupo na mesma mensagem
          e.qr = true; e.qr_em = maxTime(e.qr_em, em);
          e.link = true; e.link_em = maxTime(e.link_em, em);
        }
        e.ultimo = maxTime(e.ultimo, em);
      }
    }

    // Campos da inscrição gravados exclusivamente pós-aceite pelo drenador
    for (const [tel, p] of pessoas) {
      const e = h(tel);
      const insc = p.inscricao;
      if (insc.qr_envio_status === 'enviado_com_sucesso') {
        e.qr = true; e.qr_em = maxTime(e.qr_em, insc.qr_ultimo_envio_em || null);
        e.ultimo = maxTime(e.ultimo, insc.qr_ultimo_envio_em || null);
      }
      if (insc.status_envio_grupo === 'enviado') {
        e.link = true; e.link_em = maxTime(e.link_em, insc.data_envio_boas_vindas || null);
        e.ultimo = maxTime(e.ultimo, insc.data_envio_boas_vindas || null);
      }
    }

    const agora = Date.now();

    // ── 7. Dedup de idempotência (fila ativa + log) para as chaves da régua ──
    const chavesPessoa = new Map(); // dedup_key → { tel, tipo }
    for (const tel of tels) {
      chavesPessoa.set(`${tel}:GRUPO_FOLLOWUP_1:V1`, { tel, tipo: 'FU1' });
      chavesPessoa.set(`${tel}:GRUPO_FOLLOWUP_2:V1`, { tel, tipo: 'FU2' });
      chavesPessoa.set(`${tel}:QR_LEMBRETE_JA_NO_GRUPO:V1`, { tel, tipo: 'QR' });
    }
    const todasChaves = [...chavesPessoa.keys()];
    const chavesAtivas = new Set();
    for (let i = 0; i < todasChaves.length; i += 100) {
      const bloco = todasChaves.slice(i, i + 100);
      const naFila = await S.M31FilaMensagem.filter(
        { dedup_key: { $in: bloco }, status: { $in: STATUS_FILA_ATIVO } }, '-created_date', 1000);
      for (const f of naFila || []) chavesAtivas.add(f.dedup_key);
      const noLog = await S.M31AutomacaoLog.filter(
        { idempotency_key: { $in: bloco }, status: { $in: ['enviado', 'pendente'] } }, '-enviado_em', 1000);
      for (const l of noLog || []) chavesAtivas.add(l.idempotency_key);
    }

    // ── 8. CLASSIFICAÇÃO (ordem da decisão) ──
    const contagem = {
      no_grupo_regua_encerrada: 0,
      no_grupo_falta_qr: 0,
      precisa_fluxo_inicial: 0,
      aguardando_cooldown: 0,
      elegivel_fu1: 0,
      elegivel_fu2: 0,
      regua_concluida: 0,
      opt_out_excluidos: optOutExcluidos,
      inconsistencias: inconsistencias.length,
    };
    const elegiveis = [];      // { nome, tel, tipo, mensagem, dedup_key, automacao, template, prioridade, inscricao_id }
    const aguardando = [];      // cooldown até
    const execucao = { enfileirados_fu1: 0, enfileirados_fu2: 0, enfileirados_qr: 0, cancelados_recheck: 0, bloqueados_template: 0 };

    for (const [tel, p] of pessoas) {
      const e = h(tel);
      const noGrupo = [...phoneKeys(p.inscricao.whatsapp)].some(k => groupKeys.has(k));

      // A. JÁ ESTÁ NO GRUPO — não envia link, não envia follow-up
      if (noGrupo) {
        if (e.qr) { contagem.no_grupo_regua_encerrada++; continue; }
        // Ainda precisa receber o QR: apenas lembrete de QR, sem convite
        if (!tplQrLembrete?.content) { execucao.bloqueados_template++; contagem.inconsistencias++; continue; }
        const qrUrl = p.inscricao.qrcode_url || p.inscricao.qrcode_token || null;
        if (!qrUrl) { inconsistencias.push({ nome: p.nome, whatsapp: tel, motivo: 'no_grupo_sem_qr_gerado', inscricao_id: p.inscricao.id }); contagem.inconsistencias++; continue; }
        const mensagem = renderTemplate(tplQrLembrete.content, {
          primeiro_nome: primeiroNome(p.nome),
          codigo_inscricao: String(p.inscricao.codigo_inscricao || ''),
        });
        if (/\{\{[^}]+\}\}/.test(mensagem)) { execucao.bloqueados_template++; continue; }
        const dedupKey = `${tel}:QR_LEMBRETE_JA_NO_GRUPO:V1`;
        contagem.no_grupo_falta_qr++;
        if (!chavesAtivas.has(dedupKey)) {
          elegiveis.push({ nome: p.nome, tel, tipo: 'QR', mensagem, dedup_key: dedupKey, automacao: 'CONFIRMACAO_COM_QR', template: 'lembrete_qr_ja_no_grupo', prioridade: 4, inscricao_id: p.inscricao.id, qr_url: qrUrl });
        }
        continue;
      }

      // Fora do grupo
      if (e.fu2) { contagem.regua_concluida++; continue; }              // E. já recebeu FU2 — encerrada
      if (!e.qr || !e.link) { contagem.precisa_fluxo_inicial++; continue; } // B. fluxo existente é o dono
      const cooldownAte = e.ultimo ? new Date(new Date(e.ultimo).getTime() + COOLDOWN_MS).toISOString() : null;
      const emCooldown = !!e.ultimo && (agora - new Date(e.ultimo).getTime()) < COOLDOWN_MS;

      if (e.fu1) {
        // D. elegível FU2 — somente após FU1 REALMENTE enviado + cooldown 48h
        if (emCooldown) { contagem.aguardando_cooldown++; aguardando.push({ nome: p.nome, whatsapp: tel, cooldown_ate: cooldownAte, proxima_acao: 'GRUPO_FOLLOWUP_2' }); continue; }
        if (!tplFu2?.content) { execucao.bloqueados_template++; continue; }
        const mensagem = renderTemplate(tplFu2.content, { primeiro_nome: primeiroNome(p.nome) });
        if (/\{\{[^}]+\}\}/.test(mensagem)) { execucao.bloqueados_template++; continue; }
        const dedupKey = `${tel}:GRUPO_FOLLOWUP_2:V1`;
        contagem.elegivel_fu2++;
        if (!chavesAtivas.has(dedupKey)) {
          elegiveis.push({ nome: p.nome, tel, tipo: 'FU2', mensagem, dedup_key: dedupKey, automacao: 'GRUPO_FOLLOWUP_2', template: 'grupo_followup_2', prioridade: 6, inscricao_id: p.inscricao.id, qr_url: null });
        }
      } else {
        // C. elegível FU1 — QR e link realmente enviados + cooldown 48h
        if (emCooldown) { contagem.aguardando_cooldown++; aguardando.push({ nome: p.nome, whatsapp: tel, cooldown_ate: cooldownAte, proxima_acao: 'GRUPO_FOLLOWUP_1' }); continue; }
        if (!tplFu1?.content) { execucao.bloqueados_template++; continue; }
        if (!inviteLink) { execucao.bloqueados_template++; continue; }
        const mensagem = renderTemplate(tplFu1.content, { primeiro_nome: primeiroNome(p.nome), link_grupo: inviteLink });
        if (/\{\{[^}]+\}\}/.test(mensagem)) { execucao.bloqueados_template++; continue; }
        const dedupKey = `${tel}:GRUPO_FOLLOWUP_1:V1`;
        contagem.elegivel_fu1++;
        if (!chavesAtivas.has(dedupKey)) {
          elegiveis.push({ nome: p.nome, tel, tipo: 'FU1', mensagem, dedup_key: dedupKey, automacao: 'GRUPO_FOLLOWUP_1', template: 'grupo_followup_1', prioridade: 6, inscricao_id: p.inscricao.id, qr_url: null });
        }
      }
    }

    // ── 9. SIMULAÇÃO: devolve os números, NÃO dispara ──
    const relatorioElegiveis = elegiveis.map(el => {
      const e = h(el.tel);
      return {
        nome: el.nome,
        whatsapp: el.tel,
        no_grupo: false,
        qr_realmente_enviado: el.tipo === 'QR' ? true : e.qr,
        link_realmente_enviado: el.tipo === 'QR' ? true : e.link,
        fu1_realmente_enviado: e.fu1,
        fu2_realmente_enviado: e.fu2,
        ultimo_envio_confirmado: e.ultimo,
        cooldown_ate: null,
        proxima_acao: el.automacao,
      };
    });

    if (acao === 'simular') {
      return Response.json({
        success: true, acao, total_aprovadas: (inscricoes || []).length,
        pessoas_unicas: pessoas.size, classificacao: contagem,
        elegiveis: relatorioElegiveis, aguardando_cooldown: aguardando,
        inconsistencias: inconsistencias.slice(0, 50),
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    // ── 10. EXECUTAR: re-checagem de segurança imediata + enfileiramento ──
    const execId = crypto.randomUUID();
    const agoraIso = new Date().toISOString();
    for (const el of elegiveis) {
      const p = pessoas.get(el.tel);
      // Re-check 1: presença no grupo oficial AGORA (por telefone, status ativa)
      let entrou = false;
      try {
        const membrosFresh = await S.M31GrupoMembro.filter(
          { group_jid: grupo.chat_id, phone: { $in: variantsOf(el.tel) }, status: 'ativa' }, '-ultima_deteccao', 5);
        entrou = (membrosFresh || []).length > 0;
      } catch {
        // Falha na consulta = fail-closed: não enfileira nesta execução
        execucao.cancelados_recheck++;
        continue;
      }
      if (entrou && el.tipo !== 'QR') {
        await S.M31InscricaoTimeline.create({
          inscricao_id: el.inscricao_id, cpf: p.cpf, evento: 'grupo_followup_cancelado',
          etapa: 'regua_followup_grupo', status: 'pendente',
          detalhe: 'Entrou no grupo entre a seleção e o disparo — etapa cancelada sem envio.',
          origem: 'm31ReguaFollowupGrupo:recheck',
        }).catch(() => {});
        execucao.cancelados_recheck++;
        continue;
      }
      if (!entrou && el.tipo === 'QR') {
        // Saiu do grupo entre a seleção e o enfileiramento — deixa para o fluxo inicial
        execucao.cancelados_recheck++;
        continue;
      }
      // Re-check 2: opt-out atual
      try {
        const inscFresh = (await S.EventoM31Inscricao.filter({ id: el.inscricao_id }, '-created_date', 1))[0];
        if (inscFresh?.opt_out === true || inscFresh?.status_pagamento === 'cancelado') {
          await S.M31InscricaoTimeline.create({
            inscricao_id: el.inscricao_id, cpf: p.cpf, evento: 'grupo_followup_cancelado',
            etapa: 'regua_followup_grupo', status: 'pendente',
            detalhe: inscFresh?.opt_out === true ? 'Opt-out ativo no momento do disparo — cancelado.' : 'Inscrição cancelada — cancelado.',
            origem: 'm31ReguaFollowupGrupo:recheck',
          }).catch(() => {});
          execucao.cancelados_recheck++;
          continue;
        }
      } catch {
        execucao.cancelados_recheck++;
        continue;
      }
      // Re-check 3: idempotência (outra função já enviou a mesma etapa)
      const dedupFila = await S.M31FilaMensagem.filter({ dedup_key: el.dedup_key, status: { $in: STATUS_FILA_ATIVO } }, '-created_date', 1);
      const dedupLog = await S.M31AutomacaoLog.filter({ idempotency_key: el.dedup_key, status: { $in: ['enviado', 'pendente'] } }, '-enviado_em', 1);
      if (dedupFila.length > 0 || dedupLog.length > 0) { execucao.cancelados_recheck++; continue; }

      // Enfileira JÁ LIBERADO (envio automático via drenador; kill-switch,
      // hard cap diário e janela comercial seguem valendo no disparo)
      const mensagens = [{ message: el.mensagem, ...(el.qr_url ? { image_url: el.qr_url } : {}) }];
      await S.M31FilaMensagem.create({
        dedup_key: el.dedup_key,
        participante_id: p.cpf || el.tel,
        cpf: p.cpf,
        telefone: el.tel,
        email: String(p.inscricao.email || '').toLowerCase() || null,
        automacao: el.automacao,
        template: el.template,
        versao: 'V1',
        origem: 'm31ReguaFollowupGrupo',
        inscricao_id: el.inscricao_id,
        inscricao_nome: el.nome,
        mensagens,
        status: 'pendente',
        aprovado_para_envio: true,
        prioridade: el.prioridade,
        execution_id: execId,
      });
      await S.M31AutomacaoLog.create({
        participante_id: p.cpf || el.tel,
        inscricao_principal: el.inscricao_id,
        cpf: p.cpf, telefone: el.tel, email: String(p.inscricao.email || '').toLowerCase() || null,
        automacao: el.automacao, template: el.template, versao: 'V1',
        status: 'pendente', enviado_em: agoraIso,
        execution_id: execId, origem: 'm31ReguaFollowupGrupo:regua_agendada',
        idempotency_key: el.dedup_key,
      }).catch(() => {});
      await S.M31InscricaoTimeline.create({
        inscricao_id: el.inscricao_id, cpf: p.cpf,
        evento: 'grupo_followup_enfileirado', etapa: 'regua_followup_grupo',
        status: 'pendente',
        detalhe: `${el.automacao} enfileirado com aprovação automática (envio via drenador).`,
        origem: 'm31ReguaFollowupGrupo',
      }).catch(() => {});
      if (el.tipo === 'FU1') execucao.enfileirados_fu1++;
      else if (el.tipo === 'FU2') execucao.enfileirados_fu2++;
      else execucao.enfileirados_qr++;
    }

    return Response.json({
      success: true, acao, total_aprovadas: (inscricoes || []).length,
      pessoas_unicas: pessoas.size, classificacao: contagem, execucao,
      elegiveis: relatorioElegiveis, aguardando_cooldown: aguardando,
      inconsistencias: inconsistencias.slice(0, 50),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error?.message || 'falha_regua_followup_grupo' }, { status: 500 });
  }
})(req);
}
