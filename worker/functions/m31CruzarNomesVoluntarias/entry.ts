// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31CruzarNomesVoluntarias
 *
 * Cruza voluntárias com nome placeholder ("Intercessão - 5209") com os nomes
 * de exibição (DisplayName/PushName) dos participantes dos grupos na UAZAPI.
 *
 * SOMENTE LEITURA na UAZAPI (GET /group/list) — nenhuma mensagem é enviada.
 *
 * Body: { aplicar?: boolean }  — default false (dry-run, só lista as propostas)
 * Quando aplicar=true: atualiza EventoM31Voluntario.nome e preserva o
 * placeholder anterior em observacoes.
 */

// Variantes do telefone BR para match (com/sem 9º dígito)
function variantes(phone: string): string[] {
  const d = (phone || '').toString().replace(/\D/g, '');
  const set = new Set<string>([d]);
  if (d.length === 13 && d.startsWith('55')) {
    // remove o 9º dígito: 55 + DDD + 9XXXXXXXX → 55 + DDD + XXXXXXXX
    set.add(d.slice(0, 4) + d.slice(5));
  }
  if (d.length === 12 && d.startsWith('55')) {
    // insere o 9º dígito
    set.add(d.slice(0, 4) + '9' + d.slice(4));
  }
  return [...set];
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const aplicar = body?.aplicar === true;

    const token = config('UAZAPI_TOKEN');
    if (!token) return Response.json({ error: 'UAZAPI_TOKEN não configurado' }, { status: 500 });
    const baseUrl = (config('UAZAPI_BASE') || '__UAZAPI_API__').replace(/\/+$/, '');

    // ── 1. Listar TODOS os grupos com participantes (uma única chamada, só leitura) ──
    const resp = await fetch(`${baseUrl}/group/list?force=true&noparticipants=false`, {
      method: 'GET', headers: { 'token': token },
    });
    if (!resp.ok) {
      return Response.json({ error: 'UAZAPI /group/list falhou', status: resp.status, body: (await resp.text()).substring(0, 300) }, { status: 502 });
    }
    const data = await resp.json();
    const grupos = Array.isArray(data) ? data : (data?.groups || data?.data || []);

    // Modo debug: devolve a estrutura bruta para diagnóstico
    if (body?.debug === true) {
      const g0 = grupos.find((g: any) => (g.Participants || g.participants || []).length > 0) || grupos[0];
      const parts0 = (g0?.Participants || g0?.participants || []).slice(0, 3);
      // Também tenta o endpoint de contatos
      let contatosAmostra: any = null;
      try {
        const cResp = await fetch(`${baseUrl}/contacts`, { method: 'GET', headers: { 'token': token } });
        const cBody = await cResp.text();
        contatosAmostra = { status: cResp.status, body: cBody.substring(0, 800) };
      } catch (e) { contatosAmostra = { erro: e.message }; }
      return Response.json({
        debug: true,
        grupo_amostra_chaves: g0 ? Object.keys(g0) : null,
        participantes_amostra: parts0,
        contatos_amostra: contatosAmostra,
      });
    }

    // ── 2. Mapa telefone → nome de exibição ──
    // 2a. Participantes dos grupos (DisplayName costuma vir vazio, mas custa nada)
    const nomePorTelefone: Record<string, { nome: string; grupo: string }> = {};
    let participantesComNome = 0, participantesTotal = 0;
    for (const g of grupos) {
      const nomeGrupo = g.Name || g.name || g.subject || '(sem nome)';
      const parts = Array.isArray(g.Participants) ? g.Participants : (g.participants || []);
      for (const p of parts) {
        participantesTotal++;
        const phoneRaw = p.PhoneNumber || p.PN || p.phone || '';
        const phone = phoneRaw.replace(/\D/g, '');
        const nome = p.DisplayName || p.Name || p.PushName || p.pushName || null;
        if (!phone || phone.length < 10) continue;
        if (nome && String(nome).trim()) {
          participantesComNome++;
          for (const v of variantes(phone)) {
            if (!nomePorTelefone[v]) nomePorTelefone[v] = { nome: String(nome).trim(), grupo: nomeGrupo };
          }
        }
      }
    }

    // 2b. Agenda de contatos da instância (GET /contacts) — fonte real dos nomes
    let contatosTotal = 0, contatosComNome = 0;
    try {
      const cResp = await fetch(`${baseUrl}/contacts`, { method: 'GET', headers: { 'token': token } });
      if (cResp.ok) {
        const contatos = await cResp.json();
        const lista = Array.isArray(contatos) ? contatos : (contatos?.contacts || contatos?.data || []);
        contatosTotal = lista.length;
        for (const c of lista) {
          const jid = c.jid || c.JID || '';
          if (!jid.includes('@s.whatsapp.net')) continue;
          const phone = jid.replace(/\D/g, '');
          const nome = (c.contact_name || c.contact_FirstName || '').trim();
          if (!phone || phone.length < 10 || !nome) continue;
          contatosComNome++;
          for (const v of variantes(phone)) {
            if (!nomePorTelefone[v]) nomePorTelefone[v] = { nome, grupo: 'agenda_contatos' };
          }
        }
      }
    } catch (e) {
      logger.warn('[CruzarNomes] /contacts indisponível:', e.message);
    }

    // ── 3. Voluntárias com nome placeholder ──
    const vols = await base44.asServiceRole.entities.EventoM31Voluntario.list('-created_date', 500);
    const placeholders = vols.filter((v: any) => !v.nome || /-\s*\d{3,5}\s*$/.test(v.nome || ''));

    const propostas: any[] = [];
    const semMatch: any[] = [];
    for (const v of placeholders) {
      const vars = variantes(v.whatsapp || '');
      const hit = vars.map(t => nomePorTelefone[t]).find(Boolean);
      if (hit) {
        propostas.push({ id: v.id, atual: v.nome, novo: hit.nome, fonte_grupo: hit.grupo, whatsapp: v.whatsapp });
      } else {
        semMatch.push({ id: v.id, atual: v.nome, whatsapp: v.whatsapp });
      }
    }

    // ── 4. Aplicar (opcional) ──
    let aplicadas = 0;
    if (aplicar) {
      for (const p of propostas) {
        const vol = placeholders.find((v: any) => v.id === p.id);
        const obs = [(vol?.observacoes || '').trim(), `Nome preenchido via WhatsApp (grupo: ${p.fonte_grupo}). Registro original: ${p.atual}`].filter(Boolean).join(' | ');
        await base44.asServiceRole.entities.EventoM31Voluntario.update(p.id, {
          nome: p.novo,
          observacoes: obs,
        });
        aplicadas++;
      }
    }

    return Response.json({
      success: true,
      modo: aplicar ? 'aplicado' : 'dry_run',
      grupos_lidos: grupos.length,
      participantes_total: participantesTotal,
      participantes_com_nome: participantesComNome,
      contatos_total: contatosTotal,
      contatos_com_nome: contatosComNome,
      voluntarias_placeholder: placeholders.length,
      com_match: propostas.length,
      sem_match: semMatch.length,
      aplicadas,
      propostas: propostas.slice(0, 80),
      sem_match_lista: semMatch.slice(0, 80),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
