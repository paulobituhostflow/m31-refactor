// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31DiagnosticoRejeitadosGrupo (READ-ONLY)
 *
 * Diagnóstico dos números rejeitados pelo filtro de phone.length >= 10
 * no m31ExtrairGrupoInscritadas. Retorna cada número bruto + motivo de rejeição,
 classificados nos 3 buckets: recuperáveis, duplicados, inválidos.
 *
 * NÃO modifica dados. Apenas analisa.
 */

const DDDS_VALIDOS = new Set([
  11,12,13,14,15,16,17,18,19, 21,22,24, 27,28,
  31,32,33,34,35,37,38, 41,42,43,44,45,46,47,48,49,
  51,53,54,55, 61, 62,64, 63,65,66, 67, 68, 69,
  71,73,74,75,77, 79, 81,87, 82, 83, 84, 85,88, 86,89,
  91,93,94, 92,97, 95, 96, 98,99
]);

function normalizarTelefoneBR(raw: string) {
  if (raw == null) return { ok: false, e164: null, motivo: 'vazio' };
  let d = String(raw).replace(/\D/g, '');
  if (!d) return { ok: false, e164: null, motivo: 'vazio' };

  // DDI 55 duplicado REAL: 14-15 dígitos começando "5555" -> remove um "55"
  if (d.length >= 14 && d.startsWith('5555')) d = d.slice(2);

  // remove DDI 55 pra trabalhar com o número nacional
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);

  // remove 0 de trunk
  d = d.replace(/^0+/, '');

  // celular antigo sem o 9 (10 díg: DDD + 8) -> insere 9
  if (d.length === 10 && /^[6-9]/.test(d.slice(2))) {
    d = d.slice(0, 2) + '9' + d.slice(2);
  }

  if (d.length !== 11) {
    return { ok: false, e164: null, nacional: d, motivo: `comprimento_${d.length}` };
  }
  const ddd = parseInt(d.slice(0, 2), 10);
  if (!DDDS_VALIDOS.has(ddd)) {
    return { ok: false, e164: null, nacional: d, motivo: `ddd_invalido_${ddd}` };
  }
  if (d[2] !== '9') {
    return { ok: false, e164: null, nacional: d, motivo: 'nao_e_celular' };
  }
  return { ok: true, e164: '55' + d, nacional: d, motivo: 'ok' };
}

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const token = config('UAZAPI_TOKEN');
    const baseUrl = (config('UAZAPI_BASE') || '__UAZAPI_API__').replace(/\/+$/, '');

    // 1. Listar grupos
    const resp = await fetch(`${baseUrl}/group/list?force=true&noparticipants=false`, {
      method: 'GET',
      headers: { 'token': token },
    });

    if (!resp.ok) {
      return Response.json({ error: 'UAZAPI falhou', status: resp.status }, { status: 502 });
    }

    const data = await resp.json();
    const grupos = Array.isArray(data) ? data
      : Array.isArray(data?.groups) ? data.groups
      : Array.isArray(data?.data) ? data.data : [];

    const getNome = (g: any) => (g.Name || g.name || g.subject || '').toLowerCase();
    const grupoAlvo = grupos.find((g: any) => {
      const n = getNome(g);
      return n.includes('inscritas') && n.includes('m31') && n.includes('filhas');
    });

    if (!grupoAlvo) {
      return Response.json({ error: 'Grupo não encontrado', total_grupos: grupos.length }, { status: 404 });
    }

    const participantesRaw = Array.isArray(grupoAlvo.Participants) ? grupoAlvo.Participants
      : Array.isArray(grupoAlvo.participants) ? grupoAlvo.participants : [];

    // 2. Extrair phone bruto de cada participante (ANTES do filtro)
    const todosPhones = participantesRaw.map((p: any) => {
      const phoneRaw = p.PhoneNumber || p.PN || p.phone || '';
      const phoneDigits = phoneRaw.replace(/\D/g, '');
      return {
        phone_raw: phoneRaw,
        phone_digits: phoneDigits,
        lid: p.LID || p.JID || p.lid || null,
        nome: p.DisplayName || p.Name || p.PushName || null,
        length: phoneDigits.length,
      };
    });

    // 3. Separar rejeitados pelo filtro atual (length < 10)
    const rejeitados = todosPhones.filter((p) => p.length < 10);
    const aceitos = todosPhones.filter((p) => p.length >= 10);

    // 4. Rodar normalização em TODOS (aceitos + rejeitados) para ver quais seriam recuperáveis
    const analiseRejeitados = rejeitados.map((p) => {
      const norm = normalizarTelefoneBR(p.phone_raw);
      return {
        phone_raw: p.phone_raw,
        phone_digits: p.phone_digits,
        length: p.length,
        lid: p.lid,
        nome: p.nome,
        motivo_rejeicao_atual: `comprimento_${p.length}`,
        normalizacao: norm,
        classificacao: norm.ok ? 'a_recuperavel' : (norm.motivo?.includes('comprimento') ? 'c_invalido' : 'c_invalido'),
      };
    });

    // 5. Também analisar os ACEITOS que não matcharam inscrições
    // (para entender se o problema é só o filtro ou matching)
    const aceitosNormalizados = aceitos.map((p) => {
      const norm = normalizarTelefoneBR(p.phone_raw);
      return { phone_raw: p.phone_raw, phone_digits: p.phone_digits, norm };
    });

    // 6. Contar matches atuais com EventoM31Inscricao
    const phonesAceitos = aceitos.map((p) => p.phone_digits);
    const inscricoesMatch = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
      { whatsapp: { $in: phonesAceitos } }, null, 300
    ).catch(() => []);
    const matchedPhones = new Set((inscricoesMatch || []).map((i) => i.whatsapp?.replace(/\D/g, '')));
    const naoMatcharam = aceitos.filter((p) => !matchedPhones.has(p.phone_digits));

    // 7. Classificação final
    const recuperaveis = analiseRejeitados.filter((r) => r.normalizacao.ok);
    const invalidos = analiseRejeitados.filter((r) => !r.normalizacao.ok);

    return Response.json({
      success: true,
      total_participantes_raw: todosPhones.length,
      aceitos_pelo_filtro: aceitos.length,
      rejeitados_pelo_filtro: rejeitados.length,
      rejeitados_recuperaveis: recuperaveis.length,
      rejeitados_invalidos: invalidos.length,
      matched_com_inscricoes: inscricoesMatch?.length || 0,
      aceitos_nao_matcharam: naoMatcharam.length,
      rejeitados_detalhe: analiseRejeitados,
      nao_matcharam_detalhe: naoMatcharam.slice(0, 50).map((p) => ({
        phone_digits: p.phone_digits,
        length: p.length,
        lid: p.lid,
        nome: p.nome,
      })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
