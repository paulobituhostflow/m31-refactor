// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31AuditoriaIntercessao
 *
 * Auditoria COMPLETA do grupo "Intercessão M31 Filhas" na UAZAPI.
 *
 * NÃO envia mensagens. NÃO cria cobranças. NÃO converte ninguém.
 * Apenas identifica, sincroniza, cruza e classifica.
 *
 * Fluxo:
 *   1. Lista todos os grupos da UAZAPI (com participantes)
 *   2. Identifica o grupo "Intercessão M31 Filhas" por nome e/ou invite code
 *   3. Atualiza M31GrupoConfig (finalidade INTERCESSAO) com o JID correto
 *   4. Sincroniza membros em M31GrupoMembro (snapshot, origem=INTERCESSAO)
 *   5. Cruza com EventoM31Voluntario, EventoM31Inscricao
 *   6. Classifica cada número: voluntária, inscrita confirmada, pendente, não encontrada, duplicada, inválida
 *   7. Retorna relatório completo
 *
 * Uso:
 *   base44.functions.invoke('m31AuditoriaIntercessao', {})
 */

const FINALIDADE_ALVO = 'INTERCESSAO';
const INVITE_CODE_ESPERADO = 'FbHd7Uk5E5E6QpJDuAiMTu';

const DDDS_VALIDOS = new Set([
  11,12,13,14,15,16,17,18,19, 21,22,24, 27,28,
  31,32,33,34,35,37,38, 41,42,43,44,45,46,47,48,49,
  51,53,54,55, 61, 62,64, 63,65,66, 67, 68, 69,
  71,73,74,75,77, 79, 81,87, 82,83,84,85,88,86,89,
  91,93,94, 92,97, 95,96,98,99
]);

function normalizarTelefoneBR(raw) {
  if (raw == null) return { ok: false, e164: null, motivo: 'vazio' };
  let d = String(raw).replace(/\D/g, '');
  if (!d) return { ok: false, e164: null, motivo: 'vazio' };
  if (d.length >= 14 && d.startsWith('5555')) d = d.slice(2);
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  d = d.replace(/^0+/, '');
  if (d.length === 10 && /^[6-9]/.test(d.slice(2))) {
    d = d.slice(0, 2) + '9' + d.slice(2);
  }
  if (d.length !== 11) return { ok: false, e164: null, motivo: `comprimento_${d.length}` };
  const ddd = parseInt(d.slice(0, 2), 10);
  if (!DDDS_VALIDOS.has(ddd)) return { ok: false, e164: null, motivo: `ddd_invalido_${ddd}` };
  if (d[2] !== '9') return { ok: false, e164: null, motivo: 'nao_e_celular' };
  return { ok: true, e164: '55' + d, motivo: 'ok' };
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const token = config('UAZAPI_TOKEN');
    if (!token) return Response.json({ error: 'UAZAPI_TOKEN não configurado' }, { status: 500 });
    const baseUrl = (config('UAZAPI_BASE') || '__UAZAPI_API__').replace(/\/+$/, '');

    // ── 1. Listar todos os grupos COM participantes ──────────────────────
    const listUrl = `${baseUrl}/group/list?force=true&noparticipants=false`;
    const resp = await fetch(listUrl, {
      method: 'GET',
      headers: { 'token': token },
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      return Response.json({ error: 'UAZAPI /group/list falhou', status: resp.status, body: errBody }, { status: 502 });
    }

    const data = await resp.json();
    const grupos = Array.isArray(data) ? data
      : Array.isArray(data?.groups) ? data.groups
      : Array.isArray(data?.data) ? data.data
      : [];

    if (grupos.length === 0) {
      return Response.json({ success: false, error: 'Nenhum grupo retornado pela UAZAPI.' }, { status: 404 });
    }

    // ── 2. Identificar grupo "Intercessão M31 Filhas" ────────────────────
    const getNome = (g) => (g.Name || g.name || g.subject || g.nome || '').toLowerCase();
    const getJid = (g) => g.JID || g.id || g.jid || g.groupId;
    const getInvite = (g) => {
      // UAZAPI pode retornar invite link em vários campos
      const raw = g.InviteLink || g.invite_link || g.InviteCode || g.inviteCode || g.InviteUrl || g.invite_url || '';
      // Extrair apenas o code se vier URL completa
      const match = String(raw).match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/);
      return match ? match[1] : (raw || '');
    };

    const todosGruposDiag = grupos.map(g => ({
      nome: g.Name || g.name || g.subject || g.nome || '(sem nome)',
      jid: getJid(g),
      invite: getInvite(g),
      total_part: Array.isArray(g.Participants || g.participants) ? (g.Participants || g.participants).length : 0,
    }));

    // Tentar match por invite code primeiro
    let grupoAlvo = grupos.find(g => {
      const inv = getInvite(g);
      return inv && inv === INVITE_CODE_ESPERADO;
    });

    // Fallback: match por nome "intercess" + ("m31" ou "filhas")
    if (!grupoAlvo) {
      grupoAlvo = grupos.find(g => {
        const nome = getNome(g);
        return nome.includes('intercess') && (nome.includes('m31') || nome.includes('filhas'));
      });
    }

    // Fallback 2: apenas "intercess"
    if (!grupoAlvo) {
      grupoAlvo = grupos.find(g => getNome(g).includes('intercess'));
    }

    if (!grupoAlvo) {
      return Response.json({
        success: false,
        error: 'Grupo "Intercessão M31 Filhas" não encontrado na UAZAPI',
        invite_esperado: INVITE_CODE_ESPERADO,
        total_grupos: grupos.length,
        grupos_encontrados: todosGruposDiag,
      }, { status: 404 });
    }

    const jid = getJid(grupoAlvo);
    const nomeGrupo = grupoAlvo.Name || grupoAlvo.name || grupoAlvo.subject || grupoAlvo.nome || 'Intercessão M31 Filhas';
    const inviteEncontrado = getInvite(grupoAlvo);

    // Participantes
    const participantesRaw = Array.isArray(grupoAlvo.Participants) ? grupoAlvo.Participants
      : Array.isArray(grupoAlvo.participants) ? grupoAlvo.participants : [];

    const participantes = participantesRaw.map((p) => {
      const phoneRaw = p.PhoneNumber || p.PN || p.phone || '';
      const phoneDigits = phoneRaw.replace(/\D/g, '');
      return {
        phone: phoneDigits,
        lid: p.LID || p.JID || p.lid || null,
        nome: p.DisplayName || p.Name || p.PushName || null,
        is_admin: !!(p.IsAdmin ?? p.isAdmin),
        is_super_admin: !!(p.IsSuperAdmin ?? p.isSuperAdmin),
      };
    });

    // ── 3. Atualizar M31GrupoConfig ──────────────────────────────────────
    let configAcao = 'nenhuma';
    try {
      const configs = await base44.asServiceRole.entities.M31GrupoConfig.filter({ finalidade: FINALIDADE_ALVO });
      if (configs && configs.length > 0) {
        const config = configs[0];
        if (config.chat_id !== jid) {
          await base44.asServiceRole.entities.M31GrupoConfig.update(config.id, {
            chat_id: jid,
            nome_grupo: nomeGrupo,
            ativo: true,
          });
          configAcao = 'atualizado';
        } else {
          configAcao = 'ja_correto';
        }
      } else {
        await base44.asServiceRole.entities.M31GrupoConfig.create({
          finalidade: FINALIDADE_ALVO,
          chat_id: jid,
          nome_grupo: nomeGrupo,
          ativo: true,
          automacao_ativa: false,
        });
        configAcao = 'criado';
      }
    } catch (e) {
      configAcao = `erro: ${e.message}`;
    }

    // ── 4. Sincronizar membros em M31GrupoMembro (snapshot) ──────────────
    const now = new Date().toISOString();
    let syncAdicionados = 0;
    let syncAtualizados = 0;
    let syncSairam = 0;

    try {
      // Buscar church_id (opcional — pode não existir entidade Church)
      let churchId = 'm31';
      try {
        const churches = await base44.asServiceRole.entities.Church.filter({ slug: 'm31' });
        if (churches && churches.length > 0) churchId = churches[0].id;
      } catch (_) {}

      const phonesNow = participantes.map(p => p.phone);

      // Carregar membros existentes deste grupo
      const existingMembros = await base44.asServiceRole.entities.M31GrupoMembro.filter({ group_jid: jid });
      const memberByPhone = {};
      existingMembros.forEach(m => { memberByPhone[m.phone] = m; });

      const updatesBatch = [];
      const createsBatch = [];

      for (const p of participantes) {
        const existing = memberByPhone[p.phone];
        if (existing) {
          updatesBatch.push({
            id: existing.id,
            ultima_deteccao: now,
            status: 'ativa',
            is_admin: p.is_admin,
            is_super_admin: p.is_super_admin,
            lid: p.lid || existing.lid,
            nome_whatsapp: p.nome || existing.nome_whatsapp,
            snapshot_count: (existing.snapshot_count || 1) + 1,
          });
        } else {
          createsBatch.push({
            church_id: churchId,
            group_jid: jid,
            phone: p.phone,
            lid: p.lid || null,
            nome_whatsapp: p.nome || null,
            is_admin: p.is_admin,
            is_super_admin: p.is_super_admin,
            primeira_deteccao: now,
            ultima_deteccao: now,
            status: 'ativa',
            snapshot_count: 1,
          });
        }
      }

      if (updatesBatch.length > 0) {
        await base44.asServiceRole.entities.M31GrupoMembro.bulkUpdate(updatesBatch);
        syncAtualizados = updatesBatch.length;
      }
      if (createsBatch.length > 0) {
        await base44.asServiceRole.entities.M31GrupoMembro.bulkCreate(createsBatch);
        syncAdicionados = createsBatch.length;
      }

      // Marcar saídas
      const leftMembros = existingMembros.filter(m => m.status === 'ativa' && !phonesNow.includes(m.phone));
      if (leftMembros.length > 0) {
        const leftIds = leftMembros.map(m => m.id);
        await base44.asServiceRole.entities.M31GrupoMembro.updateMany(
          { id: { $in: leftIds } }, { $set: { status: 'saiu' } }
        ).catch(() => {});
        syncSairam = leftIds.length;
      }
    } catch (e) {
      logger.error('[m31AuditoriaIntercessao] Erro ao sincronizar:', e.message);
    }

    // ── 5. Cruzamento com sistema ────────────────────────────────────────
    // Normalizar todos os telefones dos participantes
    const participantesNorm = participantes.map(p => {
      const norm = normalizarTelefoneBR(p.phone);
      return {
        ...p,
        phone_normalizado: norm.ok ? norm.e164 : null,
        normalizacao_ok: norm.ok,
        motivo_normalizacao: norm.motivo,
      };
    });

    const phonesValidos = participantesNorm.filter(p => p.phone_normalizado).map(p => p.phone_normalizado);

    // Buscar voluntários (EventoM31Voluntario) por whatsapp
    const voluntariosMap = new Map();
    for (let i = 0; i < phonesValidos.length; i += 50) {
      const batch = phonesValidos.slice(i, i + 50);
      const vols = await base44.asServiceRole.entities.EventoM31Voluntario.filter(
        { whatsapp: { $in: batch } }, null, 50
      ).catch(() => []);
      if (vols && vols.length > 0) {
        for (const v of vols) {
          const key = (v.whatsapp || '').replace(/\D/g, '');
          voluntariosMap.set(key, v);
        }
      }
    }

    // Buscar inscrições (EventoM31Inscricao) por whatsapp
    const inscricoesMap = new Map();
    const inscricoesDuplicadasMap = new Map(); // phone -> count
    for (let i = 0; i < phonesValidos.length; i += 50) {
      const batch = phonesValidos.slice(i, i + 50);
      const inscs = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
        { whatsapp: { $in: batch } }, null, 50
      ).catch(() => []);
      if (inscs && inscs.length > 0) {
        for (const insc of inscs) {
          const key = (insc.whatsapp || '').replace(/\D/g, '');
          const count = (inscricoesDuplicadasMap.get(key) || 0) + 1;
          inscricoesDuplicadasMap.set(key, count);
          const existing = inscricoesMap.get(key);
          if (!existing ||
              (insc.status_pagamento === 'aprovado' || insc.status_pagamento === 'gratuito')) {
            inscricoesMap.set(key, insc);
          }
        }
      }
    }

    // ── 6. Classificar cada membro ───────────────────────────────────────
    const registros = participantesNorm.map(p => {
      const phoneKey = p.phone_normalizado ? p.phone_normalizado.replace(/\D/g, '') : '';
      const vol = voluntariosMap.get(phoneKey);
      const insc = inscricoesMap.get(phoneKey);
      const inscDups = inscricoesDuplicadasMap.get(phoneKey) || 0;

      let classificacao;
      let detalhes = {};

      if (!p.normalizacao_ok) {
        classificacao = 'TELEFONE_INVALIDO';
      } else if (vol && insc) {
        classificacao = 'VOLUNTARIA_E_INSCRITA';
        detalhes = {
          voluntario_id: vol.id,
          voluntario_setor: vol.setor,
          voluntario_status: vol.status,
          inscricao_id: insc.id,
          inscricao_status: insc.status_pagamento,
          inscricao_origem: insc.origem_inscricao,
          duplicada: inscDups > 1,
        };
      } else if (vol) {
        classificacao = 'VOLUNTARIA_CADASTRADA';
        detalhes = {
          voluntario_id: vol.id,
          voluntario_setor: vol.setor,
          voluntario_status: vol.status,
        };
      } else if (insc) {
        if (insc.status_pagamento === 'aprovado' || insc.status_pagamento === 'gratuito') {
          classificacao = 'INSCRITA_CONFIRMADA';
        } else {
          classificacao = 'INSCRICAO_PENDENTE';
        }
        detalhes = {
          inscricao_id: insc.id,
          inscricao_status: insc.status_pagamento,
          inscricao_origem: insc.origem_inscricao,
          duplicada: inscDups > 1,
        };
      } else {
        classificacao = 'NAO_ENCONTRADA';
      }

      return {
        phone_grupo: p.phone,
        phone_normalizado: p.phone_normalizado,
        nome_whatsapp: p.nome,
        lid: p.lid,
        is_admin: p.is_admin,
        classificacao,
        motivo_normalizacao: p.motivo_normalizacao,
        ...detalhes,
      };
    });

    // ── 7. Relatório final ───────────────────────────────────────────────
    const counts = registros.reduce((acc, r) => {
      acc[r.classificacao] = (acc[r.classificacao] || 0) + 1;
      return acc;
    }, {});

    const naoEncontrados = registros.filter(r => r.classificacao === 'NAO_ENCONTRADA');
    const telefoneInvalido = registros.filter(r => r.classificacao === 'TELEFONE_INVALIDO');
    const duplicadas = registros.filter(r => r.duplicada === true);

    const relatorio = {
      success: true,
      grupo: {
        nome: nomeGrupo,
        jid: jid,
        invite_code_encontrado: inviteEncontrado,
        invite_code_esperado: INVITE_CODE_ESPERADO,
        invite_match: inviteEncontrado === INVITE_CODE_ESPERADO,
        total_membros_whatsapp: participantes.length,
        total_grupos_listados_uazapi: grupos.length,
      },
      config_m31grupoconfig: {
        acao: configAcao,
        finalidade: FINALIDADE_ALVO,
        jid_atualizado: jid,
      },
      sincronizacao_m31grupomembro: {
        adicionados: syncAdicionados,
        atualizados: syncAtualizados,
        sairam: syncSairam,
        total_ativos_apos_sync: participantes.length,
      },
      cruzamento: {
        total_participantes: participantes.length,
        telefones_validos: phonesValidos.length,
        telefones_invalidos: telefoneInvalido.length,
      },
      classificacao: {
        voluntaria_cadastrada: counts['VOLUNTARIA_CADASTRADA'] || 0,
        voluntaria_e_inscrita: counts['VOLUNTARIA_E_INSCRITA'] || 0,
        inscrita_confirmada: counts['INSCRITA_CONFIRMADA'] || 0,
        inscricao_pendente: counts['INSCRICAO_PENDENTE'] || 0,
        nao_encontrada: counts['NAO_ENCONTRADA'] || 0,
        telefone_invalido: counts['TELEFONE_INVALIDO'] || 0,
        duplicadas: duplicadas.length,
      },
      listas: {
        nao_encontrados: naoEncontrados.map(r => ({
          phone: r.phone_normalizado || r.phone_grupo,
          nome_whatsapp: r.nome_whatsapp,
        })),
        telefone_invalido: telefoneInvalido.map(r => ({
          phone: r.phone_grupo,
          motivo: r.motivo_normalizacao,
        })),
        duplicadas: duplicadas.map(r => ({
          phone: r.phone_normalizado,
          nome: r.nome_whatsapp,
          inscricao_id: r.inscricao_id,
        })),
        voluntarias: registros.filter(r => r.classificacao === 'VOLUNTARIA_CADASTRADA' || r.classificacao === 'VOLUNTARIA_E_INSCRITA').map(r => ({
          phone: r.phone_normalizado,
          nome_whatsapp: r.nome_whatsapp,
          setor: r.voluntario_setor,
          status: r.voluntario_status,
        })),
        inscritas_confirmadas: registros.filter(r => r.classificacao === 'INSCRITA_CONFIRMADA' || r.classificacao === 'VOLUNTARIA_E_INSCRITA').map(r => ({
          phone: r.phone_normalizado,
          nome_whatsapp: r.nome_whatsapp,
          inscricao_id: r.inscricao_id,
          origem: r.inscricao_origem,
        })),
        inscricoes_pendentes: registros.filter(r => r.classificacao === 'INSCRICAO_PENDENTE').map(r => ({
          phone: r.phone_normalizado,
          nome_whatsapp: r.nome_whatsapp,
          inscricao_id: r.inscricao_id,
          status_pagamento: r.inscricao_status,
        })),
      },
      recomendacao: 'Revisar os ' + (counts['NAO_ENCONTRADA'] || 0) + ' números não encontrados. Membros do grupo de Intercessão devem ser tratados como VOLUNTÁRIAS, não como inscritas comuns. Não realizar onboarding automático.',
      todos_grupos_uazapi: todosGruposDiag,
    };

    return Response.json(relatorio);
  } catch (error) {
    return Response.json({ success: false, error: error.message, timestamp: new Date().toISOString() }, { status: 500 });
  }
})(req);
}
