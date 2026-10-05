// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31AuditoriaGrupo
 *
 * Auditoria e conciliação de membros de grupos WhatsApp vs inscrições do sistema.
 * Identifica "leads fantasmas": pessoas ativas no grupo mas sem cadastro ativo.
 *
 * Endpoints (via parâmetro 'formato'):
 *   - formato=json (default): retorna JSON estruturado com status_auditoria
 *   - formato=csv: retorna CSV (separador ;) para download
 *
 * Parâmetros:
 *   - chat_id: JID do grupo (default: 120363423189586769@g.us)
 *   - tipo: 'todos' | 'fantasmas' | 'conciliados' (default: todos)
 *   - formato: 'json' | 'csv' (default: json)
 *
 * Response JSON:
 *   {
 *     success: boolean,
 *     chat_id: string,
 *     total_auditados: number,
 *     total_conciliados: number,
 *     total_fantasmas: number,
 *     registros: [{
 *       phone_grupo: string,
 *       phone_normalizado: string,
 *       status_grupo: string,
 *       data_primeira_deteccao: string,
 *       data_ultima_deteccao: string,
 *       status_auditoria: 'CONCILIADO' | 'FANTASMA',
 *       nome: string | null,
 *       email: string | null,
 *       cpf: string | null,
 *       inscricao_id: string | null,
 *       status_pagamento: string | null,
 *       origem_inscricao: string | null,
 *     }]
 *   }
 */

const DDDS_VALIDOS = new Set([
  11,12,13,14,15,16,17,18,19, 21,22,24, 27,28,
  31,32,33,34,35,37,38, 41,42,43,44,45,46,47,48,49,
  51,53,54,55, 61, 62,64, 63,65,66, 67, 68, 69,
  71,73,74,75,77, 79, 81,87, 82,83,84,85,88,86,89,
  91,93,94, 92,97, 95,96,98,99
]);

/**
 * Normaliza telefone BR para E.164 sem "+": 55 + DDD(2) + 9 + 8 = 13 dígitos.
 * Resolve o mismatch: UAZAPI retorna 12 dígitos (sem 9º), inscrições têm 13 (com 9º).
 */
function normalizarTelefoneBR(raw: string): { ok: boolean; e164: string | null; motivo: string } {
  if (raw == null) return { ok: false, e164: null, motivo: 'vazio' };
  let d = String(raw).replace(/\D/g, '');
  if (!d) return { ok: false, e164: null, motivo: 'vazio' };

  // DDI 55 duplicado REAL: 14-15 dígitos começando "5555" -> remove um "55"
  if (d.length >= 14 && d.startsWith('5555')) d = d.slice(2);

  // remove DDI 55 pra trabalhar com número nacional
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);

  // remove 0 de trunk
  d = d.replace(/^0+/, '');

  // celular antigo sem o 9 (10 díg: DDD + 8) -> insere 9
  if (d.length === 10 && /^[6-9]/.test(d.slice(2))) {
    d = d.slice(0, 2) + '9' + d.slice(2);
  }

  if (d.length !== 11) return { ok: false, e164: null, motivo: `comprimento_${d.length}` };
  const ddd = parseInt(d.slice(0, 2), 10);
  if (!DDDS_VALIDOS.has(ddd)) return { ok: false, e164: null, motivo: `ddd_invalido_${ddd}` };
  if (d[2] !== '9') return { ok: false, e164: null, motivo: 'nao_e_celular' };

  return { ok: true, e164: '55' + d, motivo: 'ok' };
}

/**
 * Gera CSV (separador ;) a partir dos registros auditados.
 */
function gerarCSV(registros: any[]): string {
  const header = [
    'Telefone WhatsApp',
    'Status no Grupo',
    'Data de Detecção',
    'Status no Sistema',
    'Nome do Aluno',
    'Email'
  ].join(';');

  const linhas = registros.map((r) => {
    const dataFormatada = r.data_primeira_deteccao
      ? new Date(r.data_primeira_deteccao).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' })
      : '';

    // Escapar ponto-e-vírgula em campos de texto (envolver em aspas duplas)
    const escape = (val: string | null) => {
      if (!val) return '';
      const s = String(val);
      return s.includes(';') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    };

    return [
      r.phone_normalizado || r.phone_grupo,
      r.status_grupo,
      dataFormatada,
      r.status_auditoria === 'CONCILIADO' ? 'Cadastrado' : 'Não Encontrado',
      escape(r.nome),
      escape(r.email)
    ].join(';');
  });

  return [header, ...linhas].join('\n');
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);

    // Parse parâmetros (suporta query params e body JSON)
    let chat_id = url.searchParams.get('chat_id');
    let tipo = url.searchParams.get('tipo') || 'todos';
    let formato = url.searchParams.get('formato') || 'json';

    // Se vier de POST com body JSON, sobrescreve
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      chat_id = chat_id || body?.chat_id;
      tipo = body?.tipo || tipo;
      formato = body?.formato || formato;
    }

    // Defaults
    chat_id = chat_id || '120363423189586769@g.us';
    tipo = (tipo || 'todos').toLowerCase();
    formato = (formato || 'json').toLowerCase();

    // Validar tipo
    if (!['todos', 'fantasmas', 'conciliados'].includes(tipo)) {
      return Response.json({
        error: "Parâmetro 'tipo' inválido. Use: todos, fantasmas, ou conciliados"
      }, { status: 400 });
    }

    // Validar formato
    if (!['json', 'csv'].includes(formato)) {
      return Response.json({
        error: "Parâmetro 'formato' inválido. Use: json ou csv"
      }, { status: 400 });
    }

    // ── 1. Buscar membros ativos do grupo (LEFT JOIN base) ──────────────
    const membros = await base44.asServiceRole.entities.M31GrupoMembro.filter({
      group_jid: chat_id,
      status: 'ativa',
    }, 'primeira_deteccao', 500);

    if (!membros || membros.length === 0) {
      if (formato === 'csv') {
        const csvVazio = 'Telefone WhatsApp;Status no Grupo;Data de Detecção;Status no Sistema;Nome do Aluno;Email\n';
        return new Response(csvVazio, {
          status: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename=auditoria_${chat_id.replace('@g.us', '')}.csv`
          }
        });
      }
      return Response.json({
        success: true,
        chat_id,
        total_auditados: 0,
        total_conciliados: 0,
        total_fantasmas: 0,
        registros: [],
        mensagem: 'Nenhum membro ativo encontrado para este chat_id'
      });
    }

    // ── 2. Normalizar telefones dos membros ─────────────────────────────
    const membrosNormalizados = membros.map((m) => {
      const norm = normalizarTelefoneBR(m.phone);
      return {
        ...m,
        phone_normalizado: norm.ok ? norm.e164 : m.phone,
        normalizacao_ok: norm.ok,
        motivo_normalizacao: norm.motivo,
      };
    });

    // ── 3. Buscar inscrições correspondentes (LEFT JOIN) ────────────────
    // Coletar todos os E164 normalizados para buscar em batch
    const phonesParaBuscar = membrosNormalizados
      .filter((m) => m.phone_normalizado)
      .map((m) => m.phone_normalizado);

    // Buscar inscrições em batches de 50 (limite da API)
    const inscricoesMap = new Map<string, any>();

    for (let i = 0; i < phonesParaBuscar.length; i += 50) {
      const batch = phonesParaBuscar.slice(i, i + 50);
      const inscricoesBatch = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
        { whatsapp: { $in: batch } }, null, 50
      ).catch(() => []);

      if (inscricoesBatch && inscricoesBatch.length > 0) {
        for (const insc of inscricoesBatch) {
          const phoneKey = (insc.whatsapp || '').replace(/\D/g, '');
          // Preferir inscrição aprovada/gratuita sobre outras
          const existing = inscricoesMap.get(phoneKey);
          if (!existing ||
              (insc.status_pagamento === 'aprovado' || insc.status_pagamento === 'gratuito')) {
            inscricoesMap.set(phoneKey, insc);
          }
        }
      }
    }

    // ── 4. Montar resultado com status_auditoria ────────────────────────
    let registros = membrosNormalizados.map((m) => {
      const insc = inscricoesMap.get(m.phone_normalizado?.replace(/\D/g, '') || '');
      const conciliado = !!insc;

      return {
        phone_grupo: m.phone,
        phone_normalizado: m.phone_normalizado,
        status_grupo: m.status,
        data_primeira_deteccao: m.primeira_deteccao,
        data_ultima_deteccao: m.ultima_deteccao,
        status_auditoria: conciliado ? 'CONCILIADO' : 'FANTASMA',
        nome: insc?.nome || null,
        email: insc?.email || null,
        cpf: insc?.cpf || null,
        inscricao_id: insc?.id || null,
        status_pagamento: insc?.status_pagamento || null,
        origem_inscricao: insc?.origem_inscricao || null,
        lid: m.lid || null,
        nome_whatsapp: m.nome_whatsapp || null,
      };
    });

    // ── 5. Aplicar filtro por tipo ──────────────────────────────────────
    if (tipo === 'fantasmas') {
      registros = registros.filter((r) => r.status_auditoria === 'FANTASMA');
    } else if (tipo === 'conciliados') {
      registros = registros.filter((r) => r.status_auditoria === 'CONCILIADO');
    }

    const totalConciliados = membrosNormalizados.filter((m) =>
      inscricoesMap.has(m.phone_normalizado?.replace(/\D/g, '') || '')
    ).length;
    const totalFantasmas = membrosNormalizados.length - totalConciliados;

    // ── 6. Retornar no formato solicitado ───────────────────────────────
    if (formato === 'csv') {
      const csv = gerarCSV(registros);
      const filename = `auditoria_${chat_id.replace('@g.us', '')}_${tipo}.csv`;
      return new Response('\ufeff' + csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        }
      });
    }

    return Response.json({
      success: true,
      chat_id,
      filtro_tipo: tipo,
      total_auditados: membrosNormalizados.length,
      total_conciliados: totalConciliados,
      total_fantasmas: totalFantasmas,
      total_retornados: registros.length,
      registros,
    });

  } catch (error) {
    return Response.json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
})(req);
}
