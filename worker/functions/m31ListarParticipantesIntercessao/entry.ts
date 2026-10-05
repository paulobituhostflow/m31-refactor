// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

/**
 * m31ListarParticipantesIntercessao — SOMENTE LEITURA
 * Busca participantes ATUAIS do grupo de intercessão direto da UAZAPI.
 * Não escreve no banco. Retorna lista de { phone, nome } para cruzamento.
 */
return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const token = config('UAZAPI_TOKEN');
    if (!token) return Response.json({ error: 'UAZAPI_TOKEN não configurado' }, { status: 500 });
    const baseUrl = (config('UAZAPI_BASE') || '__UAZAPI_API__').replace(/\/+$/, '');

    // 1. Resolver JID do grupo de intercessão
    const configs = await base44.asServiceRole.entities.M31GrupoConfig.filter({ finalidade: 'INTERCESSAO', ativo: true });
    if (!configs || configs.length === 0) {
      return Response.json({ error: 'Grupo de intercessão não configurado em M31GrupoConfig' }, { status: 404 });
    }
    const groupJid = configs[0].chat_id;
    const nomeGrupo = configs[0].nome_grupo;

    if (!groupJid) {
      return Response.json({ error: 'chat_id vazio na config de intercessão' }, { status: 400 });
    }

    // 2. Buscar participantes atuais via UAZAPI /group/info
    const resp = await fetch(`${baseUrl}/group/info`, {
      method: 'POST',
      headers: { token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupjid: groupJid }),
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      return Response.json({ error: 'UAZAPI /group/info falhou', status: resp.status, body: errBody }, { status: 502 });
    }

    const data = await resp.json();
    const participants = Array.isArray(data.Participants) ? data.Participants
      : Array.isArray(data.participants) ? data.participants
      : [];

    // 3. Extrair telefone + nome — tentar múltiplas fontes de phone
    const rawSample = participants.slice(0, 3);

    // Normaliza telefone brasileiro: remove o "9" extra do celular (13→12 dígitos)
    // 5581998725209 (13) → 55818725209 (12) para comparar com UAZAPI
    function normPhone(d) {
      let p = String(d || '').replace(/\D/g, '');
      // Remove DDI duplicado
      if (p.startsWith('5555') && p.length > 13) p = p.slice(2);
      // 13 dígitos = 55 + DDD(2) + 9 + 8 dígitos → remove o "9" na posição 4
      if (p.length === 13 && p.startsWith('55')) p = p.slice(0, 4) + p.slice(5);
      // 11 dígitos = DDD(2) + 9 + 8 → remove o "9" na posição 2
      if (p.length === 11) p = p.slice(0, 2) + p.slice(3);
      return p;
    }

    const membros = participants.map(p => {
      const raw = p?.PhoneNumber || p?.phoneNumber || p?.phone || p?.JID || p?.jid || p?.id || p?.user || '';
      const phone = normPhone(raw);
      const nome = p?.DisplayName || p?.displayName || p?.Name || p?.name || '';
      const isAdmin = !!(p?.IsAdmin ?? p?.isAdmin);
      return { phone, nome, isAdmin, _raw: raw };
    }).filter(m => m.phone);

    // 4. Buscar voluntários cadastrados (setor intercessao)
    const voluntarios = await base44.asServiceRole.entities.EventoM31Voluntario.filter({ setor: 'intercessao' });

    // 5. Buscar inscrições vinculadas para status_pagamento
    const inscricaoIds = voluntarios.map(v => v.inscricao_id).filter(Boolean);
    const inscricoes = inscricaoIds.length > 0
      ? await base44.asServiceRole.entities.EventoM31Inscricao.filter({ _id: { $in: inscricaoIds } })
      : [];
    const inscricaoMap = {};
    inscricoes.forEach(i => { inscricaoMap[i.id] = i; });

    // 6. Cruzamento
    const volByPhone = {};
    voluntarios.forEach(v => {
      const phone = normPhone(v.whatsapp || '');
      if (phone) volByPhone[phone] = v;
    });

    const grupoByPhone = {};
    membros.forEach(m => { grupoByPhone[m.phone] = m; });

    // Todos os telefones únicos
    const todosPhones = new Set([...Object.keys(volByPhone), ...Object.keys(grupoByPhone)]);

    const cruzamento = [];
    for (const phone of todosPhones) {
      const noGrupo = !!grupoByPhone[phone];
      const vol = volByPhone[phone];
      const temCadastro = !!vol;
      const insc = vol?.inscricao_id ? inscricaoMap[vol.inscricao_id] : null;

      let categoria;
      if (noGrupo && temCadastro) categoria = 'ativo';
      else if (!noGrupo && temCadastro) categoria = 'saiu_do_grupo';
      else if (noGrupo && !temCadastro) categoria = 'sem_cadastro';

      cruzamento.push({
        telefone: phone,
        telefone_original_grupo: grupoByPhone[phone]?._raw || '',
        telefone_original_cadastro: vol?.whatsapp || '',
        nome_grupo: grupoByPhone[phone]?.nome || '',
        nome_cadastro: vol?.nome || '',
        no_grupo: noGrupo ? 'sim' : 'nao',
        tem_cadastro: temCadastro ? 'sim' : 'nao',
        status_pagamento: insc?.status_pagamento || '',
        status_voluntario: vol?.status || '',
        inscricao_id: vol?.inscricao_id || '',
        categoria
      });
    }

    // Estatísticas
    const stats = {
      total_grupo: membros.length,
      total_cadastro: voluntarios.length,
      ativos: cruzamento.filter(c => c.categoria === 'ativo').length,
      sairam_do_grupo: cruzamento.filter(c => c.categoria === 'saiu_do_grupo').length,
      sem_cadastro: cruzamento.filter(c => c.categoria === 'sem_cadastro').length
    };

    // CSV completo + CSV de ação (só saiu_do_grupo e sem_cadastro)
    const header = 'telefone,nome_grupo,nome_cadastro,no_grupo,tem_cadastro,status_pagamento,status_voluntario,categoria';
    const csvRows = cruzamento.map(c =>
      [c.telefone, `"${c.nome_grupo}"`, `"${c.nome_cadastro}"`, c.no_grupo, c.tem_cadastro, c.status_pagamento, c.status_voluntario, c.categoria].join(',')
    );
    const csv = [header, ...csvRows].join('\n');

    // Só entradas que precisam de ação
    const acao = cruzamento.filter(c => c.categoria !== 'ativo');
    const csvAcaoRows = acao.map(c =>
      [c.telefone, `"${c.nome_grupo}"`, `"${c.nome_cadastro}"`, c.no_grupo, c.tem_cadastro, c.status_pagamento, c.status_voluntario, c.categoria].join(',')
    );
    const csv_acao = [header, ...csvAcaoRows].join('\n');

    return Response.json({
      success: true,
      grupo: { nome: nomeGrupo, jid: groupJid },
      stats,
      csv
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
