// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31ExtrairGrupoInscritadas
 *
 * Extrai o JID real e os participantes do grupo "INSCRITAS M31 FILHAS"
 * via UAZAPI (GET /group/list).
 *
 * Fluxo:
 *   1. Lista todos os grupos da instância UAZAPI conectada
 *   2. Identifica o grupo "INSCRITAS M31 FILHAS" pelo nome
 *   3. Extrai JID (@g.us) + lista completa de participantes
 *   4. Atualiza M31GrupoConfig (finalidade INSCRITAS_OFICIAL) com o chat_id real
 *   5. Sincroniza participantes em M31GrupoMembro (snapshot de entrada/saída)
 *
 * O número de suporte/disparo já é admin do grupo, então a listagem funciona.
 *
 * Uso:
 *   base44.functions.invoke('m31ExtrairGrupoInscritadas', { sync_membros: true })
 *
 * Response:
 *   {
 *     success: boolean,
 *     grupo: { jid, nome, total_participantes, participantes: [...] },
 *     config_atualizada: boolean,
 *     membros_sincronizados: { adicionados, atualizados, sairam } | null
 *   }
 */

const CHURCH_SLUG_M31 = 'm31';
const FINALIDADE_ALVO = 'INSCRITAS_OFICIAL';
const NOME_BUSCA = 'inscritas m31 filhas';

// Normaliza telefone BR: insere o 9º dígito quando o grupo entrega 12 dígitos (55 + DDD + 8).
// As inscrições estão salvas com 13 dígitos (celular com 9). Sem isso, o match falha.
function normalizarTelefoneBR(phone) {
  const d = (phone || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('55')) {
    const ddd = d.slice(2, 4);
    const resto = d.slice(4);
    return `55${ddd}9${resto}`;
  }
  return d;
}

// Fallback caso o template não exista/esteja inativo
const ACOLHIMENTO_FALLBACK = `Olá {nome}! 💜\n\nQue alegria ter você aqui no grupo oficial das INSCRITAS M31 FILHAS! 🎉\n\nEste é o nosso espaço de comunhão e comunicação do evento — fique atenta aos recados importantes das administradoras.\n\nEstamos em oração por você. Nos vemos no M31! ✨`;

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const syncMembros = body?.sync_membros !== false; // default true
    // baseline=true → apenas registra membros atuais SEM disparar acolhimento (não são entradas reais)
    const baselineMode = body?.baseline === true;

    const token = config('UAZAPI_TOKEN');
    if (!token) {
      return Response.json({ error: 'UAZAPI_TOKEN não configurado' }, { status: 500 });
    }
    const baseUrl = (config('UAZAPI_BASE') || '__UAZAPI_API__').replace(/\/+$/, '');

    // ── 1. Listar todos os grupos (com participantes) ──────────────────────
    const listUrl = `${baseUrl}/group/list?force=true&noparticipants=false`;
    const resp = await fetch(listUrl, {
      method: 'GET',
      headers: { 'token': token },
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      return Response.json({
        error: 'UAZAPI /group/list falhou',
        status: resp.status,
        body: errBody,
      }, { status: 502 });
    }

    const data = await resp.json();
    // Resposta pode ser array direto ou { groups: [...] } ou { data: [...] }
    const grupos = Array.isArray(data) ? data
      : Array.isArray(data?.groups) ? data.groups
      : Array.isArray(data?.data) ? data.data
      : [];

    if (grupos.length === 0) {
      return Response.json({
        success: false,
        error: 'Nenhum grupo retornado pela UAZAPI. Verifique se o número de disparo é admin de algum grupo.',
        total_grupos: 0,
      }, { status: 404 });
    }

    // ── 2. Identificar o grupo "INSCRITAS M31 FILHAS" pelo nome ────────────
    // UAZAPI retorna campos em PascalCase: JID, Name, Participants
    const getNome = (g) => (g.Name || g.name || g.subject || g.nome || '').toLowerCase();
    const getJid = (g) => g.JID || g.id || g.jid || g.groupId;

    const grupoAlvo = grupos.find((g) => {
      const nome = getNome(g);
      return nome.includes('inscritas') && nome.includes('m31') && nome.includes('filhas');
    }) || grupos.find((g) => getNome(g).trim() === NOME_BUSCA);

    if (!grupoAlvo) {
      return Response.json({
        success: false,
        error: 'Grupo "INSCRITAS M31 FILHAS" não encontrado na listagem da UAZAPI',
        total_grupos: grupos.length,
        grupos_encontrados: grupos.map((g) => ({ nome: getNome(g), jid: getJid(g) })),
      }, { status: 404 });
    }

    const jid = getJid(grupoAlvo);
    const nomeGrupo = grupoAlvo.Name || grupoAlvo.name || grupoAlvo.subject || grupoAlvo.nome;

    // Participantes: UAZAPI usa PascalCase. Phone pode vir como "5581...@s.whatsapp.net" ou "5581..."
    const participantesRaw = Array.isArray(grupoAlvo.Participants) ? grupoAlvo.Participants
      : Array.isArray(grupoAlvo.participants) ? grupoAlvo.participants : [];

    const participantes = participantesRaw.map((p) => {
      // UAZAPI PascalCase: PhoneNumber = "5581...@s.whatsapp.net", JID/LID = "@lid"
      const phoneRaw = p.PhoneNumber || p.PN || p.phone || '';
      const phoneDigits = phoneRaw.replace(/\D/g, '');
      return {
        phone: phoneDigits,
        lid: p.LID || p.JID || p.lid || null,
        nome: p.DisplayName || p.Name || p.PushName || null,
        is_admin: !!(p.IsAdmin ?? p.isAdmin),
        is_super_admin: !!(p.IsSuperAdmin ?? p.isSuperAdmin),
      };
    }).filter((p) => p.phone.length >= 10);

    let configAtualizada = false;

    // ── 3. Atualizar M31GrupoConfig com o chat_id real ─────────────────────
    try {
      const configs = await base44.asServiceRole.entities.M31GrupoConfig.filter({
        finalidade: FINALIDADE_ALVO, ativo: true,
      });
      if (configs.length > 0) {
        const config = configs[0];
        if (config.chat_id !== jid) {
          await base44.asServiceRole.entities.M31GrupoConfig.update(config.id, {
            chat_id: jid,
            nome_grupo: nomeGrupo,
          });
          configAtualizada = true;
        }
      }
    } catch (e) {
      logger.error('[m31ExtrairGrupoInscritadas] Erro ao atualizar M31GrupoConfig:', e.message);
    }

    // ── 4. Sincronizar participantes em M31GrupoMembro (snapshot) ──────────
    let syncResult = null;
    if (syncMembros) {
      try {
        // Buscar church_id do M31
        const churches = await base44.asServiceRole.entities.Church.filter({ slug: CHURCH_SLUG_M31 });
        const churchId = churches?.[0]?.id || null;

        const now = new Date().toISOString();
        const phonesNow = participantes.map((p) => p.phone);

        // Carregar membros existentes deste grupo
        const existingMembros = await base44.asServiceRole.entities.M31GrupoMembro.filter({
          group_jid: jid,
        });
        const memberByPhone = {};
        existingMembros.forEach((m) => { memberByPhone[m.phone] = m; });

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
        }
        if (createsBatch.length > 0) {
          await base44.asServiceRole.entities.M31GrupoMembro.bulkCreate(createsBatch);
        }

        // Marcar como "saiu" quem estava ativa mas não veio neste snapshot (batch único)
        const leftMembrosData = existingMembros.filter(
          (m) => m.status === 'ativa' && !phonesNow.includes(m.phone)
        );
        const leftIds = leftMembrosData.map((m) => m.id);
        const leftPhones = leftMembrosData.map((m) => m.phone);
        if (leftIds.length > 0) {
          await base44.asServiceRole.entities.M31GrupoMembro.updateMany(
            { id: { $in: leftIds } }, { $set: { status: 'saiu' } }
          ).catch(() => {});
        }

        // ═══════════════════════════════════════════════════════════════════
        //  ENTRADA NO GRUPO = GATILHO DE VERIFICAÇÃO
        //  Nunca confirma pagamento nem gera QR aqui. Inscrições aprovadas são
        //  encaminhadas para a fila consumida pelo motor oficial m31EnviarBoasVindas.
        // ═══════════════════════════════════════════════════════════════════
        const newPhonesRaw = createsBatch.map((c) => c.phone);
        const newPhones = [...new Set(newPhonesRaw.flatMap((p) => [p, normalizarTelefoneBR(p)]))];
        let entryTagged = 0;
        let pendenciaEnviada = 0;
        let confirmacoesEnfileiradas = 0;
        let casosRevisao = 0;
        let ignoradoBaseline = 0;

        if (baselineMode) {
          ignoradoBaseline = createsBatch.length;
        } else if (newPhones.length > 0) {
          const inscricoesCandidatas = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
            { whatsapp: { $in: newPhones } }, '-created_date', 500
          ).catch(() => []);

          for (const membro of createsBatch) {
            const telefoneNormalizado = normalizarTelefoneBR(membro.phone);
            const matches = [...new Map(
              inscricoesCandidatas
                .filter((i) => normalizarTelefoneBR(i.whatsapp) === telefoneNormalizado)
                .map((i) => [i.id, i])
            ).values()];

            if (matches.length !== 1) {
              await base44.asServiceRole.entities.M31OperacaoIncidente.create({
                tipo: 'gap_grupo',
                severidade: 'alto',
                descricao: matches.length === 0
                  ? `Entrada no grupo sem correspondência segura para o telefone ${membro.phone} (${telefoneNormalizado}). Nenhuma mensagem enviada.`
                  : `Entrada no grupo com ${matches.length} inscrições para o telefone ${telefoneNormalizado}. Nenhuma mensagem enviada; revisar duplicidade.`,
                auto_gerado: true,
                origem: 'm31ExtrairGrupoInscritadas:verificacao_entrada',
                status: 'novo',
              }).catch(() => {});
              casosRevisao++;
              continue;
            }

            const insc = matches[0];
            const nowEntrada = new Date().toISOString();
            await base44.asServiceRole.entities.EventoM31Inscricao.update(insc.id, {
              entrou_no_grupo: true,
              data_entrada_grupo: nowEntrada,
              entrou_no_grupo_em: nowEntrada,
              origem_confirmacao_grupo: 'automacao',
            }).catch(() => {});
            entryTagged++;

            if (insc.status_pagamento === 'checkout_pendente') {
              // Entrou no grupo → consideramos que pagou. Nenhuma cobrança de comprovante é enviada.
              continue;
            }

            if (['aprovado', 'gratuito'].includes(insc.status_pagamento)) {
              const qrJaEnviado = insc.qr_envio_status === 'enviado_com_sucesso' || !!insc.qr_ultimo_envio_em;
              if (qrJaEnviado || insc.data_envio_boas_vindas) continue;

              await base44.asServiceRole.entities.EventoM31Inscricao.update(insc.id, {
                fila_boas_vindas: true,
                fila_boas_vindas_em: nowEntrada,
                status_envio_grupo: 'pendente',
              }).catch(() => {});
              confirmacoesEnfileiradas++;
              continue;
            }

            await base44.asServiceRole.entities.M31OperacaoIncidente.create({
              tipo: 'gap_grupo',
              severidade: 'alto',
              descricao: `${insc.nome || 'Participante'} entrou no grupo com status ${insc.status_pagamento || 'indefinido'}. Nenhuma mensagem enviada; revisar inscrição.`,
              inscricao_id: insc.id,
              auto_gerado: true,
              origem: 'm31ExtrairGrupoInscritadas:verificacao_entrada',
              status: 'novo',
            }).catch(() => {});
            casosRevisao++;
          }
        }

        // ═══════════════════════════════════════════════════════════════════
        //  AUTOMAÇÃO DE SAÍDA (SellFlux-style trigger)
        //  Membro saiu → Remove tag de ativo + Cria incidente de resgate
        // ═══════════════════════════════════════════════════════════════════
        let exitUntagged = 0;
        let incidentesCriados = 0;

        if (leftPhones.length > 0) {
          const leftPhonesAll = [...new Set(leftPhones.flatMap((p) => [p, normalizarTelefoneBR(p)]))];
          const leftInscricoes = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
            { whatsapp: { $in: leftPhonesAll } }, null, 500
          ).catch(() => []);

          if (leftInscricoes && leftInscricoes.length > 0) {
            // ── REMOVER TAG: entrou_no_grupo = false (tag M31_FILHAS_SAIU) ──
            const leftInscIds = leftInscricoes.map((i) => i.id);
            await base44.asServiceRole.entities.EventoM31Inscricao.updateMany(
              { id: { $in: leftInscIds } },
              { $set: { entrou_no_grupo: false } }
            ).catch(() => {});
            exitUntagged = leftInscricoes.length;

            // ── INCIDENTE DE RESGATE (para abordagem comercial) ──
            for (const insc of leftInscricoes) {
              await base44.asServiceRole.entities.M31OperacaoIncidente.create({
                tipo: 'gap_grupo',
                severidade: 'medio',
                descricao: `${insc.nome || 'Participante'} saiu do grupo INSCRITAS M31 FILHAS. Oportunidade de resgate pela equipe.`,
                inscricao_id: insc.id,
                auto_gerado: true,
                origem: 'm31ExtrairGrupoInscritadas',
                status: 'novo',
              }).catch(() => {});
              incidentesCriados++;
            }
          }
        }

        syncResult = {
          adicionados: createsBatch.length,
          atualizados: updatesBatch.length,
          sairam: leftIds.length,
          baseline: baselineMode,
          verificacao_entrada_grupo: {
            tags_aplicadas: entryTagged,
            pendencia_pagamento_enviada: pendenciaEnviada,
            confirmacoes_enfileiradas: confirmacoesEnfileiradas,
            casos_revisao: casosRevisao,
            ignorado_baseline: ignoradoBaseline,
          },
          automacao_saida: {
            tags_removidas: exitUntagged,
            incidentes_criados: incidentesCriados,
          },
        };
      } catch (e) {
        logger.error('[m31ExtrairGrupoInscritadas] Erro ao sincronizar M31GrupoMembro:', e.message);
        syncResult = { erro: e.message };
      }
    }

    return Response.json({
      success: true,
      grupo: {
        jid,
        nome: nomeGrupo,
        total_participantes: participantes.length,
        participantes: participantes.slice(0, 50), // limitar para não estourar response
      },
      config_atualizada: configAtualizada,
      membros_sincronizados: syncResult,
      total_grupos_listados: grupos.length,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
