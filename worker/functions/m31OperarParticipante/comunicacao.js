import { assertGestaoCaravana, assertLegacyGestaoWriter, gestaoError } from './gestaoAccess.js';
import { withGestaoCreateLock } from './gestaoMutationLock.js';
import { loadOfficialGroup, groupDecision } from './groupMembership.js';

const ORIGIN = 'm31GestaoComunicacaoIndividual';
const BUSY = ['pendente', 'processando', 'incerto', 'verificacao_manual', 'falha_terminal'];
const QR_TYPES = ['QR_CODE','CONFIRMACAO_COM_QR','CONFIRMACAO_PRESENTEADA','CONFIRMACAO_TEXTO','BOAS_VINDAS'];
const summary = r => ({ id: r.id, status: r.status, template: r.template || null, enviado_em: r.processado_em || null,
  criado_em: r.created_date || null, motivo: r.motivo_obsolescencia || r.motivo_reagendamento || r.motivo_bloqueio || r.erro || null });
const mobile = raw => {
  let p = String(raw || '').replace(/\D/g, '');
  if (/^0055\d{10,11}$/.test(p)) p = p.slice(2);
  if (/^\d{10,11}$/.test(p)) p = '55' + p;
  return /^55[1-9]\d\d{8,9}$/.test(p) ? p : null;
};
export const giftReference = row => Boolean(row.presenteado_por_id || row.cadastro_pendente || String(row.codigo_inscricao || '').startsWith('M31-PRESENTE-'));

export async function enrichGifts(S, ctx, rows) {
  if (!rows.length) return rows;
  const ids = rows.map(r => r.id), parents = [...new Set(rows.map(r => r.presenteado_por_id).filter(Boolean))];
  const candidates = await S.EventoM31Inscricao.filter({ $or: [{ id: { $in: parents } }, { presenteado_id: { $in: ids } }] }, '-id', 201, 0,
    ['id','nome','whatsapp','codigo_inscricao','caravana_id','presenteado_id','duplicada_de_id','classificacao_registro','status_pagamento','estado_canonico','updated_date']);
  if (candidates.length > 200) throw gestaoError(503, 'GIFT_LINK_LIMIT', 'Há muitos vínculos para conferir. Abra uma ficha individual.');
  return rows.map(row => {
    const direct = row.presenteado_por_id ? candidates.find(p => p.id === row.presenteado_por_id) : null;
    const reverse = candidates.filter(p => p.presenteado_id === row.id);
    const present = giftReference(row) || reverse.length > 0;
    if (!present) return { ...row, presente: null };
    let state = 'nao_localizado', parent = direct || (reverse.length === 1 ? reverse[0] : null);
    if (reverse.length > 1 || (direct && reverse.some(p => p.id !== direct.id))
      || (row.presenteado_por_id && !direct) || (direct?.presenteado_id && direct.presenteado_id !== row.id)) state = 'divergente';
    else if (parent) state = 'vinculado';
    if (state === 'vinculado') {
      try {
        if (!ctx.areas.includes('inscritas') && !(ctx.areas.includes('caravanas') && parent.caravana_id && parent.caravana_id === row.caravana_id)) throw Error('restricted');
        assertGestaoCaravana(ctx, parent.caravana_id);
      }
      catch { state = 'restrito'; }
    }
    const safeParent = state === 'vinculado' ? { id: parent.id, nome: parent.nome || 'Nome não informado', whatsapp: mobile(parent.whatsapp),
      codigo_inscricao: parent.codigo_inscricao || null } : null;
    return { ...row, presente: { status: state, cadastro_pendente: row.cadastro_pendente === true, quem_abencoou: safeParent,
      nome_informado: !parent && state === 'nao_localizado' ? row.pagador_nome || null : null,
      aviso: state === 'divergente' ? 'Vínculo do presente precisa de conferência.' : state === 'restrito' ? 'Dados de quem presenteou fora do seu acesso.' : state === 'nao_localizado' ? 'Quem presenteou ainda não foi localizado pelo vínculo da inscrição.' : null } };
  });
}

let groupCache = null, groupLoading = null;
export async function currentGroup(S, deps = {}) {
  if (deps.group) return deps.group;
  if (groupCache && Date.now() - Date.parse(groupCache.fetched_at) < 45_000) return groupCache;
  if (!groupLoading) groupLoading = loadOfficialGroup(S, async jid => {
    const token = deps.token || (typeof process !== 'undefined' ? process.env?.UAZAPI_TOKEN : null) || (typeof Deno !== 'undefined' ? Deno.env?.get('UAZAPI_TOKEN') : null);
    if (!token) throw Error('grupo_consulta_indisponivel');
    const base = (deps.base || (typeof process !== 'undefined' ? process.env?.UAZAPI_BASE : null) || (typeof Deno !== 'undefined' ? Deno.env?.get('UAZAPI_BASE') : null) || 'https://altermkt.uazapi.com').replace(/\/+$/, '');
    const response = await fetch(base + '/group/info', { method: 'POST', headers: { token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupjid: jid, getParticipants: true }), signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw Error('grupo_consulta_indisponivel');
    return response.json();
  }).then(snapshot => (groupCache = snapshot)).finally(() => { groupLoading = null; });
  return groupLoading;
}

export async function verifyGroup(S, row, deps = {}) {
  if (!mobile(row.whatsapp)) return { estado: 'desconhecido', label: 'WhatsApp inválido para consulta', fonte: 'consulta_atual', verificado_em: null };
  try {
    const snapshot = await currentGroup(S, deps), decision = groupDecision(snapshot, row.whatsapp);
    const state = decision.in_group === true ? 'presente' : decision.in_group === false ? 'ausente' : 'desconhecido';
    return { estado: state, label: state === 'presente' ? 'No grupo agora' : state === 'ausente' ? 'Não localizado no grupo agora' : 'Não foi possível confirmar a ausência',
      fonte: 'consulta_atual', verificado_em: snapshot.fetched_at, motivo: decision.reason };
  } catch { return { estado: 'desconhecido', label: 'Consulta indisponível. Tente novamente.', fonte: 'consulta_atual', verificado_em: null }; }
}

export async function communicationHistory(S, row) {
  return (await S.M31FilaMensagem.filter({ inscricao_id: row.id }, '-created_date', 12, 0,
    ['id','status','template','automacao','processado_em','created_date','motivo_obsolescencia','motivo_reagendamento','motivo_bloqueio','erro'])).map(summary);
}

async function digest(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))].map(x => x.toString(16).padStart(2, '0')).join('');
}

function unavailable(row) {
  if (row.duplicada_de_id || row.classificacao_registro === 'teste' || row.is_sample || row.is_legado
    || row.status_pagamento === 'cancelado' || ['fora_do_universo','cancelada','cancelado'].includes(row.estado_canonico)) return 'Inscrição fora do envio operacional. Confira a situação da vaga.';
  if (row.opt_out || row.gestao_manual_pendente || row.gestao_automacoes_suspensas) return 'O contato está bloqueado ou a automação está suspensa. Regularize a restrição antes de enviar.';
  if (!mobile(row.whatsapp)) return 'Atualize o WhatsApp com DDD antes de enviar.';
  return null;
}

async function template(S, key, vars) {
  const records = await S.M31MessageTemplate.filter({ chave_unica: key, is_active: true }, '-updated_date', 1);
  if (!records[0]?.content || /<html|<body/i.test(records[0].content)) throw gestaoError(409, 'MESSAGE_TEMPLATE_REQUIRED', 'Modelo de WhatsApp indisponível. Confira os modelos de mensagem.');
  const text = records[0].content.replace(/\{\{([^{}]+)\}\}/g, (_, name) => vars[name.trim()] ?? `{{${name}}}`);
  if (/\{\{[^{}]+\}\}/.test(text)) throw gestaoError(409, 'MESSAGE_TEMPLATE_INCOMPLETE', 'O modelo exige dados que ainda não estão disponíveis.');
  return { key, text, version: records[0].updated_date || records[0].id };
}

const safeImage = value => { try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null; } catch { return null; } };

export async function communicationPlan(client, ctx, row, kind, deps = {}) {
  if (!['confirmacao','grupo','cadastro'].includes(kind)) throw gestaoError(400, 'INVALID_MESSAGE_KIND', 'Selecione uma das opções de mensagem.');
  const S = client.asServiceRole.entities;
  const [enriched] = await enrichGifts(S, ctx, [row]);
  const parentId = enriched.presente?.quem_abencoou?.id;
  const parent = parentId ? await S.EventoM31Inscricao.get(parentId) : null;
  const gift = enriched.presente;
  const parentValid = parent && row.presenteado_por_id === parent.id && parent.presenteado_id === row.id && !parent.duplicada_de_id && parent.status_pagamento === 'aprovado' && parent.estado_canonico === 'confirmada'
    && !parent.gestao_manual_pendente && !parent.gestao_automacoes_suspensas;
  let reason = unavailable(row);
  const financiallyReady = ['aprovado','gratuito'].includes(row.status_pagamento)
    && (gift ? parentValid : ['confirmada','isenta'].includes(row.estado_canonico));
  if (!reason && !financiallyReady) reason = 'A inscrição precisa de conferência de pagamento ou do vínculo do presente antes desse envio.';
  if (!reason && kind === 'cadastro' && (!gift || !row.cadastro_pendente)) reason = 'Esta inscrição não tem cadastro de presenteada pendente.';
  if (!reason && kind === 'cadastro' && !row.presenteado_token) reason = 'O link de conclusão ainda não existe. Confira o cadastro presenteado antes de enviar.';
  if (!reason && kind === 'confirmacao' && row.cadastro_pendente) reason = 'A presenteada precisa concluir o cadastro antes do envio do QR. Use Completar cadastro.';
  if (!reason && kind === 'confirmacao' && !['confirmada','isenta'].includes(row.estado_canonico)) reason = 'A participação ainda precisa de validação. O pagamento aprovado sozinho não libera o QR.';
  if (!reason && kind === 'confirmacao' && !row.codigo_inscricao) reason = 'Esta inscrição ainda não tem uma credencial válida.';
  if (!reason && kind === 'confirmacao') {
    try { await assertLegacyGestaoWriter(client, ctx.user); } catch { reason = 'Seu perfil não permite reenviar o QR. Peça a um responsável autorizado.'; }
  }
  if (reason) return { ok: true, dry_run: true, permitido: false, kind, motivo: reason, mensagens_enviadas: 0, registros_atualizados: 0 };
  const groups = await S.M31GrupoConfig.filter({ finalidade: 'INSCRITAS_OFICIAL', ativo: true }, '-id', 2);
  const invite = groups.length === 1 && /^https:\/\/chat\.whatsapp\.com\/[a-zA-Z0-9]+$/.test(String(groups[0].invite_link || '')) ? groups[0].invite_link : null;
  if (!invite) throw gestaoError(503, 'GROUP_NOT_CONFIGURED', 'O link do grupo oficial não está configurado corretamente.');
  const group = kind === 'grupo' ? await verifyGroup(S, row, deps) : null;
  if (group && group.estado !== 'ausente') return { ok: true, dry_run: true, permitido: false, kind, grupo: group,
    motivo: group.estado === 'presente' ? 'A participante já está no grupo. Não é necessário reenviar o convite.' : 'Confirme a situação atual no grupo antes de enviar o lembrete.', mensagens_enviadas: 0, registros_atualizados: 0 };
  const key = kind === 'grupo' ? 'grupo_followup_1' : kind === 'cadastro' ? 'convidada_completar_cadastro' : 'confirmacao_com_qr';
  const link = kind === 'cadastro' ? 'https://inscricoes.m31filhas.com.br/completar-cadastro/' + encodeURIComponent(row.presenteado_token) : '';
  const tpl = await template(S, key, { primeiro_nome: String(row.nome || '').split(' ')[0], nome: row.nome || 'Querida', pagador: parent?.nome || '',
    link, codigo_inscricao: row.codigo_inscricao || '', link_grupo: invite, link_grupo_whatsapp: invite });
  const history = await S.M31FilaMensagem.filter({ inscricao_id: row.id, $or: [{ template: key }, ...(kind === 'confirmacao' ? [{ automacao: { $in: QR_TYPES } }] : [])] }, '-created_date', 30);
  if (history.length === 30) return { ok: true, dry_run: true, permitido: false, kind, motivo: 'Há muitos registros de comunicação nesta inscrição. Confira o histórico com a coordenação antes de reenviar.', mensagens_enviadas: 0, registros_atualizados: 0 };
  const cutoff = Date.now() - 24 * 3600_000;
  const busy = history.find(q => BUSY.includes(q.status));
  const recent = history.find(q => q.status === 'enviado' && Date.parse(q.processado_em || q.created_date) >= cutoff);
  if (busy || (recent && kind !== 'confirmacao')) return { ok: true, dry_run: true, permitido: false, kind, motivo: busy ? 'Já existe uma mensagem na fila ou com resultado que exige conferência. Confira o histórico antes de repetir.' : 'Esta mensagem já foi enviada nas últimas 24 horas.', fila: summary(busy || recent), mensagens_enviadas: 0, registros_atualizados: 0 };
  const qrHistory = kind === 'confirmacao' ? await S.M31QRCodeEnvio.filter({ inscricao_id: row.id, status: { $in: ['enviado','reenvio_manual','reservado','incerto'] } }, '-created_date', 10) : [];
  if (qrHistory.some(q => ['reservado','incerto'].includes(q.status))) return { ok: true, dry_run: true, permitido: false, kind, motivo: 'O QR tem envio em andamento ou resultado incerto. Confira antes de reenviar.', mensagens_enviadas: 0, registros_atualizados: 0 };
  const requiresReason = kind === 'confirmacao' && (qrHistory.length > 0 || history.some(q => q.status === 'enviado') || Boolean(row.data_envio_boas_vindas));
  if (requiresReason && ctx.user.role !== 'admin') return { ok: true, dry_run: true, permitido: false, kind, motivo: 'Um administrador precisa autorizar o reenvio do QR já enviado.', mensagens_enviadas: 0, registros_atualizados: 0 };
  const image = kind === 'confirmacao' ? safeImage(row.qrcode_url) || safeImage(row.qrcode_token)
    || `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(row.codigo_inscricao)}&bgcolor=FFFFFF&color=000000&format=png` : null;
  const planHash = await digest({ id: row.id, version: row.updated_date, kind, phone: mobile(row.whatsapp), text: tpl.text, image, template_version: tpl.version,
    parent: parent ? [parent.id, parent.updated_date, parent.presenteado_id] : null, qr: qrHistory.map(q => [q.id,q.status,q.enviado_em]), history: history.map(q => [q.id,q.status]) });
  return { ok: true, dry_run: true, permitido: true, kind, plano_hash: planHash, version: row.updated_date,
    destinatario: { nome: row.nome, whatsapp: mobile(row.whatsapp) }, template: key, mensagem: tpl.text, imagem: image,
    grupo: group, requer_motivo: requiresReason, mensagens_enviadas: 0, registros_atualizados: 0 };
}

export async function executeCommunication(client, ctx, row, body) {
  if (body.confirmar_envio !== true) throw gestaoError(400, 'MESSAGE_CONFIRM_REQUIRED', 'Confira a prévia e confirme o envio individual.');
  const plan = await communicationPlan(client, ctx, row, body.kind);
  if (!plan.permitido) throw gestaoError(409, 'MESSAGE_BLOCKED', plan.motivo);
  if (!body.plano_hash || body.plano_hash !== plan.plano_hash || body.expected_version !== row.updated_date) throw gestaoError(409, 'CONFLICT', 'Os dados ou a comunicação mudaram. Gere uma nova prévia antes de enviar.');
  if (plan.requer_motivo && String(body.motivo || '').trim().length < 4) throw gestaoError(400, 'REASON_REQUIRED', 'Informe o motivo do reenvio do QR.');
  if (body.kind === 'confirmacao') {
    const response = await client.functions.invoke('m31ReenviarQRCode', { inscricao_id: row.id, canal: 'whatsapp', confirmar_reenvio: plan.requer_motivo === true, motivo: String(body.motivo || 'Envio individual solicitado na Gestão').trim(), expected_version: row.updated_date });
    const result = response?.data ?? response;
    if (result?.error || result?.success === false) throw gestaoError(409, 'QR_MESSAGE_BLOCKED', result?.detalhe || result?.mensagem || result?.error || 'O QR não foi enfileirado. Confira a ficha.');
    return { ok: true, enfileirado: true, kind: body.kind, idempotente: result?.idempotente === true, mensagem: 'Solicitação de QR registrada. Acompanhe o estado na fila; isso ainda não confirma o envio.' };
  }
  return withGestaoCreateLock(client, async () => {
    const S = client.asServiceRole.entities;
    const current = await S.EventoM31Inscricao.get(row.id);
    if (current.updated_date !== row.updated_date) throw gestaoError(409, 'CONFLICT', 'A inscrição mudou. Gere uma nova prévia.');
    const day = new Date().toISOString().slice(0, 10), key = `GESTAO_COMUNICACAO:${row.id}:${body.kind}:${day}`;
    const existing = await S.M31FilaMensagem.filter({ dedup_key: key }, '-created_date', 2);
    if (existing.length) return { ok: true, enfileirado: true, idempotente: true, fila: summary(existing[0]), mensagem: 'A solicitação já está registrada. Acompanhe o histórico.' };
    const queued = await S.M31FilaMensagem.create({ dedup_key: key, inscricao_id: row.id, inscricao_nome: row.nome, participante_id: row.id,
      telefone: plan.destinatario.whatsapp, automacao: 'SUPORTE', template: plan.template, origem: ORIGIN, versao: 'V1',
      mensagens: [{ message: plan.mensagem, image_url: null }], status: 'pendente', aprovado_para_envio: true, aprovado_por: ctx.user.email,
      aprovado_em: new Date().toISOString(), prioridade: 1, forcar_envio: false, execution_id: crypto.randomUUID() });
    await S.EventoM31ActionLog.create({ user_id: ctx.user.id, user_email: ctx.user.email, user_nome: ctx.member.nome || ctx.user.email,
      user_perfil: ctx.member.perfil, modulo: 'inscricoes', entidade_id: row.id, entidade_nome: row.nome,
      acao: 'Enfileirou comunicação individual', resultado: 'sucesso', session_id: ctx.session.session_id,
      dados_novos: JSON.stringify({ kind: body.kind, fila_id: queued.id, template: plan.template, provider_called: false }) }).catch(() => {});
    return { ok: true, enfileirado: true, fila: summary(queued), mensagem: 'Mensagem colocada na fila de envio. Acompanhe o resultado no histórico.' };
  });
}
