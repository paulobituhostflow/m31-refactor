// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

/**
 * m31ImportarPlanoMestre
 * Importa um Plano-Mestre estruturado (Áreas, Frentes, Tarefas Mãe, Subtarefas, Checklists)
 * com idempotência total.
 *
 * IDEMPOTÊNCIA:
 * - Áreas: upsert por slug.
 * - Frentes: upsert por (area_id + slug).
 * - Tarefas: upsert por (import_key + ref) — chave única composta. Se a combinação
 *   já existe, ATUALIZA o registro; caso contrário, CRIA. Nunca duplica.
 * - Os 44 registros atuais (sem import_key) nunca são tocados — a importação só
 *   opera sobre registros cujo import_key bate com o do lote atual.
 *
 * Payload (dois modos):
 *
 * MODO 1 — file_url (recomendado para arquivos grandes):
 * {
 *   file_url: "https://.../plano-mestre.json",  // URL pública do JSON
 *   dry_run?: boolean  // override do dry_run do arquivo
 * }
 *
 * MODO 2 — inline:
 * {
 *   import_key: "plano_mestre_v1",   // OBRIGATÓRIO — identificador estável do lote
 *   areas: [{ slug, nome, ... }],
 *   frentes: [{ ref?, area_ref, slug, nome, ... }],
 *   tarefas: [{ ref, tarefa_pai_ref?, titulo, area_ref?, frente_ref?, checklist?, ... }],
 *   dry_run?: boolean   // true = só valida e retorna resumo, NÃO grava
 * }
 *
 * DRY RUN retorna: { criacoes, atualizacoes, conflitos, referencias_nao_resolvidas, duplicidades }
 *
 * Não dispara notificações em nenhuma hipótese.
 */
return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden — admin only' }, { status: 403 });

    let body = await req.json();

    // MODO file_url: busca o JSON de uma URL pública (para arquivos grandes)
    if (body.file_url) {
      const resp = await fetch(body.file_url);
      if (!resp.ok) return Response.json({ error: `Falha ao buscar file_url: ${resp.status}` }, { status: 400 });
      const fetched = await resp.json();
      // Override de dry_run via payload (útil para forçar dry_run mesmo se o arquivo tiver false)
      if (body.dry_run !== undefined) fetched.dry_run = body.dry_run;
      body = fetched;
    }

    const importKey = body.import_key;
    if (!importKey) return Response.json({ error: 'import_key é obrigatório' }, { status: 400 });

    const areas = Array.isArray(body.areas) ? body.areas : [];
    const frentes = Array.isArray(body.frentes) ? body.frentes : [];
    const tarefas = Array.isArray(body.tarefas) ? body.tarefas : [];
    const dryRun = !!body.dry_run;

    // ── Resultado detalhado ──
    const result = {
      dry_run: dryRun,
      import_key: importKey,
      criacoes: { areas: 0, frentes: 0, tarefas_mae: 0, subtarefas: 0 },
      atualizacoes: { areas: 0, frentes: 0, tarefas_mae: 0, subtarefas: 0 },
      conflitos: [],            // {tipo, ref, motivo}
      referencias_nao_resolvidas: [],  // {ref, campo, valor_procurado}
      duplicidades: []          // {chave, refs: []}
    };

    // ── Pré-carrega registros existentes ──
    const existingAreas = await base44.asServiceRole.entities.M31Area.list('-created_date', 200);
    const areaBySlug = new Map(existingAreas.map(a => [a.slug, a]));

    const existingFrentes = await base44.asServiceRole.entities.M31Frente.list('-created_date', 200);
    const frenteByKey = new Map(existingFrentes.map(f => [`${f.area_id}::${f.slug}`, f]));

    // Tarefas do LOTE ATUAL (apenas as com import_key === importKey) — nunca toca as 44 manuais
    const existingTasksInBatch = await base44.asServiceRole.entities.EventoM31Tarefa.filter({ import_key: importKey }, '-created_date', 500);
    const taskByRef = new Map(existingTasksInBatch.map(t => [t.ref, t]));

    // Mapas de resolução de referências
    const areaIdByRef = new Map();   // area_ref (slug) → id
    const frenteIdByRef = new Map();  // frente_ref (ref OU slug) → id
    const tarefaIdByRef = new Map();  // tarefa ref → id (preenchido durante upsert)

    // Pré-popula tarefaIdByRef com IDs já existentes no lote (para resolver tarefa_pai_ref antes da criação)
    existingTasksInBatch.forEach(t => { if (t.ref) tarefaIdByRef.set(t.ref, t.id); });

    // ── Detecta duplicidades de ref dentro do próprio JSON ──
    const refCounts = new Map();
    tarefas.forEach(t => { if (t.ref) refCounts.set(t.ref, (refCounts.get(t.ref) || 0) + 1); });
    refCounts.forEach((count, ref) => {
      if (count > 1) result.duplicidades.push({ chave: `ref=${ref}`, ocorrencias: count });
    });

    // ── 1. ÁREAS (upsert por slug) ──
    for (const a of areas) {
      if (!a.slug || !a.nome) { result.conflitos.push({ tipo: 'area', ref: a.slug || '?', motivo: 'slug ou nome ausente' }); continue; }
      const payload = {
        slug: a.slug, nome: a.nome, descricao: a.descricao || '',
        icone: a.icone || 'FolderInput', exige_frente: a.exige_frente ?? false,
        ordem: a.ordem ?? 0, ativo: true
      };
      const existing = areaBySlug.get(a.slug);
      let areaId;
      if (existing) {
        if (!dryRun) await base44.asServiceRole.entities.M31Area.update(existing.id, payload);
        areaId = existing.id;
        result.atualizacoes.areas++;
      } else {
        if (!dryRun) { const c = await base44.asServiceRole.entities.M31Area.create(payload); areaId = c.id; }
        else areaId = `dry_area_${a.slug}`;
        result.criacoes.areas++;
      }
      // Mapeia por slug E por ref (para resolver area_ref em frentes/tarefas)
      areaIdByRef.set(a.slug, areaId);
      if (a.ref) areaIdByRef.set(a.ref, areaId);
    }

    // ── 2. FRENTES (upsert por area_id + slug) ──
    for (const f of frentes) {
      const areaRef = f.area_ref || f.area_slug;
      const areaId = areaIdByRef.get(areaRef);
      if (!areaId) { result.referencias_nao_resolvidas.push({ ref: f.ref || f.slug, campo: 'area_ref', valor_procurado: areaRef }); continue; }
      if (!f.slug || !f.nome) { result.conflitos.push({ tipo: 'frente', ref: f.ref || f.slug || '?', motivo: 'slug ou nome ausente' }); continue; }
      // Normaliza status_definicao: "a_definir" → "em_refinamento" (enum do schema)
      const rawStatus = f.status_definicao || 'confirmada';
      const statusDef = rawStatus === 'a_definir' ? 'em_refinamento' : (['confirmada', 'em_refinamento'].includes(rawStatus) ? rawStatus : 'em_refinamento');
      const payload = {
        area_id: areaId, area_slug: areaRef, slug: f.slug, nome: f.nome,
        descricao: f.descricao || '', lider_perfil: f.lider_perfil || '',
        status_definicao: statusDef, ordem: f.ordem ?? 0, ativo: true
      };
      const key = `${areaId}::${f.slug}`;
      const existing = frenteByKey.get(key);
      let id;
      if (existing) {
        if (!dryRun) await base44.asServiceRole.entities.M31Frente.update(existing.id, payload);
        id = existing.id;
        result.atualizacoes.frentes++;
      } else {
        if (!dryRun) { const c = await base44.asServiceRole.entities.M31Frente.create(payload); id = c.id; }
        else id = `dry_frente_${f.ref || f.slug}`;
        result.criacoes.frentes++;
      }
      const refKey = f.ref || f.slug;
      frenteIdByRef.set(refKey, id);
      frenteIdByRef.set(f.slug, id);
    }

    // ── Normaliza checklist ──
    const normalizeChecklist = (raw) => {
      if (!Array.isArray(raw)) return [];
      return raw.map((item, i) => {
        const texto = typeof item === 'string' ? item : (item.texto || item.conteudo || '');
        return { id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`, texto, concluido: false };
      }).filter(it => it.texto);
    };

    // ── 3. Separa Mães e Subtarefas ──
    const maes = tarefas.filter(t => !t.tarefa_pai_ref);
    const subs = tarefas.filter(t => !!t.tarefa_pai_ref);

    const buildTaskPayload = (t, paiId) => {
      const areaId = t.area_ref ? (areaIdByRef.get(t.area_ref) || null) : null;
      const frenteId = t.frente_ref ? (frenteIdByRef.get(t.frente_ref) || frenteIdByRef.get(t.frente_ref) || null) : null;
      const payload = {
        titulo: t.titulo,
        descricao: t.descricao || '',
        tipo: t.tipo || 'operacional',
        impacto: t.impacto || 'medio',
        prioridade: t.prioridade || 'media',
        status: t.status || 'a_fazer',
        area_id: areaId,
        frente_id: frenteId,
        tarefa_pai_id: paiId || null,
        prazo: t.prazo || undefined,
        prazo_relativo_dias: t.prazo_relativo_dias ?? undefined,
        responsavel_email: t.responsavel_email || undefined,
        responsavel_nome: t.responsavel_nome || undefined,
        tags: t.tags || [],
        observacoes: t.observacoes || '',
        criterio_conclusao: t.criterio_conclusao || '',
        checklist: normalizeChecklist(t.checklist),
        edicao_id: t.edicao_id || undefined,
        pacote_id: t.pacote_id || undefined,
        tarefa_modelo_id: t.tarefa_modelo_id || undefined,
        criado_por_email: user.email,
        migrada_plano_mestre: true,
        import_key: importKey,
        ref: t.ref || undefined
      };
      Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);
      return payload;
    };

    // ── 4. Upsert Tarefas Mãe ──
    for (const t of maes) {
      if (!t.ref) { result.conflitos.push({ tipo: 'tarefa_mae', ref: '?', motivo: 'ref ausente — não é possível garantir idempotência' }); continue; }
      if (!t.titulo) { result.conflitos.push({ tipo: 'tarefa_mae', ref: t.ref, motivo: 'titulo ausente' }); continue; }
      const payload = buildTaskPayload(t, null);
      const existing = taskByRef.get(t.ref);
      if (existing) {
        if (!dryRun) await base44.asServiceRole.entities.EventoM31Tarefa.update(existing.id, payload);
        tarefaIdByRef.set(t.ref, existing.id);
        result.atualizacoes.tarefas_mae++;
      } else {
        if (!dryRun) { const c = await base44.asServiceRole.entities.EventoM31Tarefa.create(payload); tarefaIdByRef.set(t.ref, c.id); }
        else tarefaIdByRef.set(t.ref, `dry_task_${t.ref}`);
        result.criacoes.tarefas_mae++;
      }
    }

    // ── 5. Upsert Subtarefas ──
    for (const t of subs) {
      if (!t.ref) { result.conflitos.push({ tipo: 'subtarefa', ref: '?', motivo: 'ref ausente' }); continue; }
      if (!t.titulo) { result.conflitos.push({ tipo: 'subtarefa', ref: t.ref, motivo: 'titulo ausente' }); continue; }
      const paiId = tarefaIdByRef.get(t.tarefa_pai_ref);
      if (!paiId) { result.referencias_nao_resolvidas.push({ ref: t.ref, campo: 'tarefa_pai_ref', valor_procurado: t.tarefa_pai_ref }); continue; }
      const payload = buildTaskPayload(t, paiId);
      const existing = taskByRef.get(t.ref);
      if (existing) {
        if (!dryRun) await base44.asServiceRole.entities.EventoM31Tarefa.update(existing.id, payload);
        tarefaIdByRef.set(t.ref, existing.id);
        result.atualizacoes.subtarefas++;
      } else {
        if (!dryRun) { const c = await base44.asServiceRole.entities.EventoM31Tarefa.create(payload); tarefaIdByRef.set(t.ref, c.id); }
        else tarefaIdByRef.set(t.ref, `dry_task_${t.ref}`);
        result.criacoes.subtarefas++;
      }
    }

    result.total_checklist_itens = tarefas.reduce((acc, t) => acc + normalizeChecklist(t.checklist).length, 0);
    result.resumo = {
      areas: `${result.criacoes.areas} novas / ${result.atualizacoes.areas} atualizadas`,
      frentes: `${result.criacoes.frentes} novas / ${result.atualizacoes.frentes} atualizadas`,
      tarefas_mae: `${result.criacoes.tarefas_mae} novas / ${result.atualizacoes.tarefas_mae} atualizadas`,
      subtarefas: `${result.criacoes.subtarefas} novas / ${result.atualizacoes.subtarefas} atualizadas`,
      conflitos: result.conflitos.length,
      referencias_nao_resolvidas: result.referencias_nao_resolvidas.length,
      duplicidades: result.duplicidades.length
    };

    return Response.json({ success: true, ...result });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack?.slice(0, 500) }, { status: 500 });
  }
})(req);
}
