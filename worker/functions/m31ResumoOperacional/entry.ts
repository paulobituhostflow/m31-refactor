// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.
import { classifyOperationalData } from './operationalRules.js';
import { ehInscritaReconhecida } from './participacaoReconhecida.js';
import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

const PAGE_SIZE = 500;
const ACTION_BUCKETS = new Set(['reconciliation', 'pending', 'recovery']);
const ALLOWED_PROFILES = new Set(['gestao_operacional', 'super_admin', 'coordenacao_participantes', 'gestora_inscricoes', 'visualizacao', 'camisas', 'admin']);

function normalizarTelefone(valor: unknown): string | null {
  const digits = String(valor || '').replace(/\D/g, '');
  const nacional = digits.startsWith('55') && digits.length === 13 ? digits.slice(2) : digits;
  if (!/^\d{2}9\d{8}$/.test(nacional) || /^(\d)\1+$/.test(nacional)) return null;
  return `55${nacional}`;
}

function temNomeDeLider(valor: unknown): boolean {
  const nome = String(valor || '').trim().toLocaleLowerCase('pt-BR');
  return Boolean(nome && !['a definir', 'não informado', 'nao informado'].includes(nome));
}

/**
 * Datas empatadas tornam a paginação por created_date instável: uma auditoria
 * encontrou 1300 resultados, mas só 1296 ids distintos. Ordenar pelo id único
 * elimina os empates. Não apresentar um total parcial se o provider repetir ids.
 */
async function fetchAll(entity: any, filter: Record<string, unknown> = {}) {
  const byId = new Map<string, any>();
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await entity.filter(filter, '-id', PAGE_SIZE, offset);
    const previousSize = byId.size;
    for (const row of page) {
      if (byId.has(row.id)) throw new Error('pagination_inconsistent');
      byId.set(row.id, row);
    }
    if (page.length < PAGE_SIZE) return [...byId.values()];
    if (byId.size === previousSize) throw new Error('pagination_did_not_advance');
  }
}

function reasonFor(row: any, bucket: string) {
  if (bucket === 'reconciliation') return 'Dados financeiros ou identidade precisam de conferência.';
  if (row.status_pagamento === 'checkout_abandonado') return 'Checkout abandonado; avaliar recuperação.';
  if (['checkout_pendente', 'pendente'].includes(row.status_pagamento)) return 'Pagamento ainda não confirmado.';
  if (bucket === 'official' && !row.data_envio_boas_vindas) return 'Pagamento confirmado; boas-vindas pendente.';
  if (bucket === 'official' && row.qr_envio_status !== 'enviado_com_sucesso') return 'Boas-vindas registradas; QR Code ainda não confirmado.';
  if (bucket === 'official' && row.status_envio_grupo !== 'enviado') return 'QR disponível; acesso ao grupo ainda pendente.';
  if (bucket === 'official' && !row.entrou_no_grupo) return 'Acesso enviado; entrada no grupo ainda não confirmada.';
  return 'Fluxo regularizado.';
}

function summarizeType(inscricoes: any[], classified: any, tipo: string) {
  const rows = inscricoes.filter((row) => row.tipo === tipo);
  return { oficiais: rows.filter((row) => classified.bucketById[row.id] === 'official').length, acao: rows.filter((row) => ACTION_BUCKETS.has(classified.bucketById[row.id])).length };
}

function pageItems(rows: any[], body: any) {
  const view = String(body.view || 'acao');
  const search = String(body.search || '').trim().toLocaleLowerCase('pt-BR');
  const limit = Math.min(Math.max(Number(body.limit) || 25, 1), 25);
  const offset = Math.max(Number(body.cursor) || 0, 0);
  const filtered = rows.filter((row) => {
    if (view === 'oficiais' && row.bucket !== 'official') return false;
    if (view === 'acao' && row.bucket === 'official') return false;
    if (!search) return true;
    return `${row.nome || ''} ${row.whatsapp || ''} ${row.lider_nome || ''}`.toLocaleLowerCase('pt-BR').includes(search);
  });
  return { items: filtered.slice(offset, offset + limit), total: filtered.length, next_cursor: offset + limit < filtered.length ? offset + limit : null };
}

return (async (req: Request): Promise<Response> => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.email) return Response.json({ error: 'unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const session_id = String(body.session_id || '').trim();
    if (!session_id) return Response.json({ error: 'session_required' }, { status: 401 });
    const S = base44.asServiceRole.entities;
    const session = (await S.M31OperacaoSessao.filter({ session_id, ativa: true }, '-created_date', 1))[0];
    if (!session || session.auth_email !== user.email || new Date(session.expires_at).getTime() <= Date.now()) return Response.json({ error: 'session_expired' }, { status: 401 });
    const member = (await S.EventoM31Membro.filter({ user_email: user.email, ativo: true }, '-created_date', 1))[0] || (user.role === 'admin' ? { perfil: 'admin' } : null);
    if (!member || !ALLOWED_PROFILES.has(member.perfil)) return Response.json({ error: 'forbidden' }, { status: 403 });
    const allowedOperations = new Set(Array.isArray(session.operacoes_permitidas) ? session.operacoes_permitidas : []);
    const operacao = String(body.operacao || '').trim();
    if (operacao && !allowedOperations.has(operacao)) return Response.json({ error: 'operational_scope_forbidden' }, { status: 403 });

    if (body.action === 'atualizar_lider') {
      if (operacao !== 'caravanas') return Response.json({ error: 'operational_scope_forbidden' }, { status: 403 });
      const caravanaId = String(body.caravana_id || '').trim();
      const liderNome = String(body.lider_nome || '').trim();
      const liderWhatsapp = normalizarTelefone(body.lider_whatsapp);
      if (!caravanaId || !temNomeDeLider(liderNome) || !liderWhatsapp) return Response.json({ error: 'leader_data_invalid' }, { status: 400 });
      const allowedCaravanIds = new Set(Array.isArray(session.caravana_ids_permitidas) ? session.caravana_ids_permitidas : []);
      if (allowedCaravanIds.size > 0 && !allowedCaravanIds.has(caravanaId)) return Response.json({ error: 'caravan_scope_forbidden' }, { status: 403 });
      await S.EventoM31Caravana.update(caravanaId, { lider_nome: liderNome, lider_whatsapp: liderWhatsapp });
      return Response.json({ ok: true, caravana_id: caravanaId, lider_nome: liderNome, lider_whatsapp: liderWhatsapp });
    }

    const [inscricoes, transacoes, pendencias, caravanas, voluntarios] = await Promise.all([
      fetchAll(S.EventoM31Inscricao), fetchAll(S.M31TransacaoFinanceira), fetchAll(S.M31PendenciaConciliacao), fetchAll(S.EventoM31Caravana), fetchAll(S.EventoM31Voluntario),
    ]);
    const classified = classifyOperationalData({ inscricoes });
    const allowedCaravanIds = new Set(Array.isArray(session.caravana_ids_permitidas) ? session.caravana_ids_permitidas : []);

    if (operacao === 'inscritas') {
      // Gestão precisa pesquisar TODO o universo real de participantes, não apenas
      // a fila de cobrança. Excluímos somente voluntárias, testes, canceladas e
      // cópias já marcadas fora do universo; caravanas continuam participantes.
      const rows = inscricoes.filter((row) => ['publico_geral','caravana'].includes(row.tipo) && classified.bucketById[row.id] !== 'audit').map((row) => {
        const bucket = classified.bucketById[row.id];
        return { id: row.id, nome: row.nome || 'Sem nome', whatsapp: normalizarTelefone(row.whatsapp) || '', codigo_inscricao: row.codigo_inscricao || '', status_pagamento: row.status_pagamento, bucket, motivo: reasonFor(row, bucket), boas_vindas: Boolean(row.data_envio_boas_vindas), qr: row.qr_envio_status === 'enviado_com_sucesso', grupo_enviado: row.status_envio_grupo === 'enviado', entrou_grupo: row.entrou_no_grupo === true, camisa_status: row.camisa_status || 'sem_camisa' };
      });
      const byId = new Map(inscricoes.map((row: any) => [row.id, row]));
      const fullRows = rows.map((row: any) => {
        const original: any = byId.get(row.id);
        return { ...row, ...Object.fromEntries(['email', 'cpf', 'cidade', 'estado', 'caravana_id', 'caravana_nome', 'updated_date'].map((field) => [field, original[field]])) };
      });
      const canEdit = member.perfil !== 'visualizacao';
      return Response.json({ ...pageItems(fullRows, body), pode_editar: canEdit, pode_caravana: canEdit && allowedOperations.has('caravanas'), caravanas: allowedOperations.has('caravanas') ? caravanas.filter((caravana: any) => caravana.ativa !== false && (allowedCaravanIds.size === 0 || allowedCaravanIds.has(caravana.id))).map((caravana: any) => ({ id: caravana.id, nome: caravana.nome })) : [], gerado_em: new Date().toISOString() });
    }

    if (operacao === 'voluntarias') {
      const byInscricao = new Map(voluntarios.filter((v) => v.inscricao_id).map((v) => [v.inscricao_id, v]));
      const byPhone = new Map(voluntarios.map((v) => [normalizarTelefone(v.whatsapp), v]));
      const rows = inscricoes.filter((row) => row.tipo === 'voluntario').map((row) => {
        const bucket = classified.bucketById[row.id];
        const volunteer = byInscricao.get(row.id) || byPhone.get(normalizarTelefone(row.whatsapp));
        const tamanho = volunteer?.tamanho_camiseta || row.tamanho_camisa || '';
        return { id: row.id, nome: volunteer?.nome || row.nome || 'Sem nome', whatsapp: normalizarTelefone(volunteer?.whatsapp || row.whatsapp) || '', setor: volunteer?.setor || row.area_voluntario || 'Equipe', tamanho, bucket, pagamento: bucket === 'official' ? 'pago' : 'pendente', motivo: !tamanho ? 'Tamanho da camisa não informado.' : reasonFor(row, bucket) };
      });
      return Response.json({ ...pageItems(rows, body), gerado_em: new Date().toISOString() });
    }

    const participantesPorCaravana = new Map<string, any[]>();
    for (const row of inscricoes) {
      if (row.tipo !== 'caravana' || !row.caravana_id) continue;
      const current = participantesPorCaravana.get(row.caravana_id) || [];
      current.push(row); participantesPorCaravana.set(row.caravana_id, current);
    }
    const caravanasAtivas = caravanas.filter((row) => row.ativa !== false && (allowedCaravanIds.size === 0 || allowedCaravanIds.has(row.id)));
    const caravanRows = caravanasAtivas.map((caravana) => {
      const participants = participantesPorCaravana.get(caravana.id) || [];
      const official = participants.filter((row) => classified.bucketById[row.id] === 'official');
      const pending = participants.filter((row) => ACTION_BUCKETS.has(classified.bucketById[row.id]));
      const hasLeader = temNomeDeLider(caravana.lider_nome); const leaderPhone = normalizarTelefone(caravana.lider_whatsapp);
      const status = hasLeader && leaderPhone && pending.length === 0 ? 'regularizada' : 'acao';
      const motivo = !hasLeader ? 'Contato da líder ausente' : !leaderPhone ? 'WhatsApp da líder ausente ou inválido' : pending.length ? `${pending.length} participantes pendentes` : 'Regularizada';
      return { id: caravana.id, nome: caravana.nome, lider_nome: hasLeader ? caravana.lider_nome : '', lider_whatsapp: leaderPhone || '', cidade: caravana.cidade_origem || '', status, bucket: status === 'regularizada' ? 'official' : 'acao', confirmadas: official.length, pendentes: pending.length, motivo, participantes_pendentes: pending.slice(0, 50).map((row) => ({ id: row.id, nome: row.nome, whatsapp: normalizarTelefone(row.whatsapp) || '', motivo: reasonFor(row, classified.bucketById[row.id]) })) };
    }).sort((a, b) => (a.status === 'acao' ? -1 : 1) - (b.status === 'acao' ? -1 : 1) || a.nome.localeCompare(b.nome, 'pt-BR'));
    if (operacao === 'caravanas') return Response.json({ ...pageItems(caravanRows, body), gerado_em: new Date().toISOString() });

    const universoInscritas = inscricoes.filter((row) => ['publico_geral','caravana'].includes(row.tipo) && classified.bucketById[row.id] !== 'audit');
    const inscritas = {
      total: inscricoes.filter(ehInscritaReconhecida).length,
      cadastros: universoInscritas.length,
      confirmadas: universoInscritas.filter((row) => classified.bucketById[row.id] === 'official').length,
      aguardando_pagamento: universoInscritas.filter((row) => classified.bucketById[row.id] === 'pending').length,
      em_conciliacao: universoInscritas.filter((row) => classified.bucketById[row.id] === 'reconciliation').length,
      recuperacao: universoInscritas.filter((row) => classified.bucketById[row.id] === 'recovery').length,
    };
    const voluntariasBase = summarizeType(inscricoes, classified, 'voluntario');
    const caravanasComAcao = caravanRows.filter((row) => row.status === 'acao').length;
    const operationSummary: Record<string, unknown> = {};
    if (allowedOperations.has('inscritas')) operationSummary.inscritas = inscritas;
    if (allowedOperations.has('voluntarias')) operationSummary.voluntarias = { ativas: voluntariasBase.oficiais, acao: voluntariasBase.acao };
    if (allowedOperations.has('caravanas')) operationSummary.caravanas = { regularizadas: caravanRows.length - caravanasComAcao, acao: caravanasComAcao };
    if (allowedOperations.has('camisas')) {
      try {
        const result = await base44.functions.invoke('m31CamisasOperacional', { action: 'listar', session_id });
        const data = result?.data || result;
        operationSummary.camisas = data.warning ? { warning: data.warning } : { pagas: data.summary?.pagas, acao: data.summary?.precisam_acao };
      } catch { operationSummary.camisas = { warning: 'Resumo de camisas indisponível.' }; }
    }
    return Response.json({ gerado_em: new Date().toISOString(), counts: classified.counts, scope: [...allowedOperations], operations: operationSummary, alerts: { em_conciliacao: classified.counts.em_conciliacao, conflitos: classified.conflicts.length } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'summary_failed' }, { status: 500 });
  }
})(req);

}
