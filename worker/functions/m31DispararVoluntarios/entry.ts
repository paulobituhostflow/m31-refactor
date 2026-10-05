// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

/**
 * m31DispararVoluntarios — Função simples de disparo direto via UAZAPI.
 * Sem camada de governança (cooldown/lock/idempotência).
 * Suporta envio individual ou em lote (por grupo).
 * Suporta lista de exclusão (excluir_ids).
 */

function normalizarTelefoneBR(t) {
  if (!t) return null;
  let d = String(t).replace(/\D/g, '');
  if (d.startsWith('5555')) d = d.slice(2);
  if (d.length === 10 || d.length === 11) d = '55' + d;
  if (d.length === 12) d = d.slice(0, 4) + '9' + d.slice(4);
  return d;
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { mensagem, voluntario_ids, excluir_ids, image_url, grupo_id } = body;

    if (!mensagem || !mensagem.trim()) {
      return Response.json({ error: 'Mensagem é obrigatória' }, { status: 400 });
    }

    // ── Resolver voluntários alvo ──
    let alvoIds = voluntario_ids || [];

    // Se grupo_id informado, buscar voluntários do grupo
    if (grupo_id) {
      const todos = await base44.asServiceRole.entities.EventoM31Voluntario.list('-created_date', 500);
      const doGrupo = todos.filter(v => v.grupo_ids && v.grupo_ids.includes(grupo_id));
      alvoIds = [...new Set([...alvoIds, ...doGrupo.map(v => v.id)])];
    }

    // Aplicar exclusões
    const excluirSet = new Set(excluir_ids || []);
    alvoIds = alvoIds.filter(id => !excluirSet.has(id));

    if (alvoIds.length === 0) {
      return Response.json({ error: 'Nenhum voluntário alvo após filtros/exclusões' }, { status: 400 });
    }

    // ── Buscar dados dos voluntários ──
    const todosVol = await base44.asServiceRole.entities.EventoM31Voluntario.list('-created_date', 500);
    const alvos = todosVol.filter(v => alvoIds.includes(v.id));

    // ── Filtrar apenas ativos com telefone ──
    const validos = alvos.filter(v => v.status !== 'inativo' && v.whatsapp);

    const token = config('UAZAPI_TOKEN');
    const baseUrl = (config('UAZAPI_BASE') || '__UAZAPI_API__').replace(/\/+$/, '');

    let enviados = 0;
    let falhas = 0;
    const detalhes = [];

    for (const vol of validos) {
      const phone = normalizarTelefoneBR(vol.whatsapp);
      if (!phone) {
        falhas++;
        detalhes.push({ id: vol.id, nome: vol.nome, telefone: vol.whatsapp, sucesso: false, erro: 'Telefone inválido' });
        continue;
      }

      // Substituir {nome} na mensagem
      const msgPersonalizada = mensagem.replace(/\{nome\}/g, vol.nome?.split(' ')[0] || vol.nome);

      try {
        let respText = '';
        let status = 0;

        if (image_url) {
          // Envio com imagem via /send/media
          const mediaBody = JSON.stringify({
            number: phone,
            phone: phone,
            type: 'image',
            file: image_url,
            caption: msgPersonalizada,
            text: msgPersonalizada,
          });

          const mediaResp = await fetch(`${baseUrl}/send/media`, {
            method: 'POST',
            headers: { 'token': token, 'Content-Type': 'application/json' },
            body: mediaBody,
          });
          respText = await mediaResp.text();
          status = mediaResp.status;
        } else {
          // Envio de texto via /send/text
          const textResp = await fetch(`${baseUrl}/send/text`, {
            method: 'POST',
            headers: { 'token': token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ number: phone, phone: phone, message: msgPersonalizada, text: msgPersonalizada }),
          });
          respText = await textResp.text();
          status = textResp.status;
        }

        const sucesso = status === 200;
        if (sucesso) enviados++; else falhas++;
        detalhes.push({ id: vol.id, nome: vol.nome, telefone: phone, sucesso, status, body: respText.slice(0, 200) });
      } catch (err) {
        falhas++;
        detalhes.push({ id: vol.id, nome: vol.nome, telefone: phone, sucesso: false, erro: err.message });
      }

      // Delay de 500ms entre envios para evitar rate limit
      await new Promise(r => setTimeout(r, 500));
    }

    return Response.json({
      sucesso: falhas === 0,
      total_alvos: validos.length,
      enviados,
      falhas,
      detalhes,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message, sucesso: false }, { status: 500 });
  }
})(req);
}
