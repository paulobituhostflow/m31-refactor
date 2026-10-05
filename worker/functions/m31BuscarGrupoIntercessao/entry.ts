// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31BuscarGrupoIntercessao
 *
 * Busca o grupo "Intercessão M31 Filhas" na UAZAPI e o cadastra em M31GrupoConfig
 * com finalidade INTERCESSAO.
 *
 * Fluxo:
 *   1. Lista todos os grupos da instância UAZAPI
 *   2. Identifica grupo cujo nome contém "intercess" + ("m31" ou "filhas")
 *   3. Cria ou atualiza M31GrupoConfig (finalidade INTERESSAO) com chat_id e nome
 *
 * Uso:
 *   base44.functions.invoke('m31BuscarGrupoIntercessao', {})
 */

const FINALIDADE_ALVO = 'INTERCESSAO';

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const token = config('UAZAPI_TOKEN');
    if (!token) {
      return Response.json({ error: 'UAZAPI_TOKEN não configurado' }, { status: 500 });
    }
    const baseUrl = (config('UAZAPI_BASE') || '__UAZAPI_API__').replace(/\/+$/, '');

    // ── 1. Listar todos os grupos ──────────────────────────────────────────
    const listUrl = `${baseUrl}/group/list?force=true&noparticipants=true`;
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
    const grupos = Array.isArray(data) ? data
      : Array.isArray(data?.groups) ? data.groups
      : Array.isArray(data?.data) ? data.data
      : [];

    if (grupos.length === 0) {
      return Response.json({
        success: false,
        error: 'Nenhum grupo retornado pela UAZAPI.',
        total_grupos: 0,
      }, { status: 404 });
    }

    // ── 2. Buscar grupo de intercessão ─────────────────────────────────────
    const getNome = (g) => (g.Name || g.name || g.subject || g.nome || '').toLowerCase();
    const getJid = (g) => g.JID || g.id || g.jid || g.groupId;

    // Listar todos os grupos encontrados para diagnóstico
    const todosGrupos = grupos.map(g => ({
      nome: g.Name || g.name || g.subject || g.nome || '(sem nome)',
      jid: getJid(g),
    }));

    // Buscar grupo que contenha "intercess" E ("m31" OU "filhas")
    let grupoEncontrado = null;
    for (const g of grupos) {
      const nome = getNome(g);
      if (nome.includes('intercess') && (nome.includes('m31') || nome.includes('filhas'))) {
        grupoEncontrado = g;
        break;
      }
    }

    // Fallback: apenas "intercess" se não encontrou com m31/filhas
    if (!grupoEncontrado) {
      for (const g of grupos) {
        const nome = getNome(g);
        if (nome.includes('intercess')) {
          grupoEncontrado = g;
          break;
        }
      }
    }

    if (!grupoEncontrado) {
      return Response.json({
        success: false,
        error: 'Grupo de Intercessão não encontrado na UAZAPI.',
        total_grupos: grupos.length,
        grupos_encontrados: todosGrupos,
      }, { status: 404 });
    }

    const nomeGrupo = grupoEncontrado.Name || grupoEncontrado.name || grupoEncontrado.subject || grupoEncontrado.nome || 'Intercessão M31 Filhas';
    const chatId = getJid(grupoEncontrado);

    // ── 3. Criar ou atualizar M31GrupoConfig ───────────────────────────────
    const configs = await base44.asServiceRole.entities.M31GrupoConfig.filter({ finalidade: FINALIDADE_ALVO });

    let config;
    let acao;
    if (configs && configs.length > 0) {
      config = await base44.asServiceRole.entities.M31GrupoConfig.update(configs[0].id, {
        chat_id: chatId,
        nome_grupo: nomeGrupo,
        ativo: true,
      });
      acao = 'atualizado';
    } else {
      config = await base44.asServiceRole.entities.M31GrupoConfig.create({
        finalidade: FINALIDADE_ALVO,
        chat_id: chatId,
        nome_grupo: nomeGrupo,
        ativo: true,
        automacao_ativa: true,
      });
      acao = 'criado';
    }

    return Response.json({
      success: true,
      acao,
      grupo: {
        nome: nomeGrupo,
        jid: chatId,
      },
      config,
      total_grupos_uazapi: grupos.length,
      grupos_encontrados: todosGrupos,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
