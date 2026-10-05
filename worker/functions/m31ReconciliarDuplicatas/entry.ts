// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31ReconciliarDuplicatas
 *
 * Trata inscrições duplicadas por CPF no banco de dados:
 *   - Para cada CPF com >1 inscrição ativa, elege uma inscrição principal
 *     (prioridade: aprovado > gratuito > checkout_pendente > pendente > abandonado > cancelado)
 *   - Marca as demais como duplicadas: dedup_key vira `CPF:{cpf}:DUP:{id}`
 *     (libera o unique index sem apagar o registro)
 *   - Adiciona marcador [DUPLICADA] nas observações com ID da inscrição principal
 *   - Garante que a principal tenha dedup_key canônico `CPF:{cpf}`
 *
 * Idempotente: pode ser executado múltiplas vezes sem efeito colateral.
 * Não apaga histórico — apenas marca.
 *
 * Usa asServiceRole (service-scoped), não depende de RLS ou user-scoped query.
 */

const PRIORIDADE_STATUS = {
  'aprovado': 5,
  'gratuito': 4,
  'checkout_pendente': 3,
  'pendente': 2,
  'checkout_abandonado': 1,
  'cancelado': 0,
};

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Acesso negado. Apenas administradores.' }, { status: 403 });
    }

    // Buscar todas as inscrições (service role, não user-scoped)
    const todas = await base44.asServiceRole.entities.EventoM31Inscricao.filter({}, '-created_date', 1000);

    // Filtrar apenas as que têm CPF válido (11 dígitos)
    const comCpf = (todas || []).filter(i => {
      const cpf = (i.cpf || '').replace(/\D/g, '');
      return cpf.length === 11;
    });

    // Agrupar por CPF
    const porCpf = {};
    for (const insc of comCpf) {
      const cpf = insc.cpf.replace(/\D/g, '');
      if (!porCpf[cpf]) porCpf[cpf] = [];
      porCpf[cpf].push(insc);
    }

    // CPFs com >1 inscrição = duplicatas
    const duplicatas = Object.entries(porCpf).filter(([_, arr]) => arr.length > 1);

    const resultado = {
      total_inscricoes: (todas || []).length,
      com_cpf_valido: comCpf.length,
      cpfs_duplicados: duplicatas.length,
      registros_em_duplicatas: duplicatas.reduce((s, [_, arr]) => s + arr.length, 0),
      processados: 0,
      marcados_como_duplicata: 0,
      principais_atualizados: 0,
      erros: [],
      detalhes: [],
    };

    for (const [cpf, inscricoes] of duplicatas) {
      try {
        // Ordenar por prioridade para eleger a principal
        const dedupCanonico = `CPF:${cpf}`;
        const ordenadas = [...inscricoes].sort((a, b) => {
          // Preferir a que já tem dedup_key canônico (idempotência)
          const aCanonico = a.dedup_key === dedupCanonico;
          const bCanonico = b.dedup_key === dedupCanonico;
          if (aCanonico !== bCanonico) return bCanonico ? 1 : -1;

          // Depois por prioridade de status
          const pa = PRIORIDADE_STATUS[a.status_pagamento] ?? 0;
          const pb = PRIORIDADE_STATUS[b.status_pagamento] ?? 0;
          if (pb !== pa) return pb - pa;

          // Depois por ter asaas_charge_url
          if (!!b.asaas_charge_url !== !!a.asaas_charge_url) return b.asaas_charge_url ? 1 : -1;

          // Por fim, mais recente
          return new Date(b.updated_date).getTime() - new Date(a.updated_date).getTime();
        });

        const principal = ordenadas[0];
        const restantes = ordenadas.slice(1);

        // 1. PRIMEIRO: marcar duplicatas (libera CPF:{cpf} se alguma tinha)
        for (const dup of restantes) {
          const novoDedupKey = `CPF:${cpf}:DUP:${dup.id}`;
          const marcador = `[DUPLICADA] Substituída por inscrição ${principal.id} (${principal.codigo_inscricao || 'sem código'}) em ${new Date().toISOString()}`;
          const obsAtual = dup.observacoes || '';
          const novaObs = obsAtual.includes('[DUPLICADA]') ? obsAtual : `${marcador}${obsAtual ? ' | ' + obsAtual : ''}`;

          // Pular se já está marcado com este dedup_key
          if (dup.dedup_key === novoDedupKey) continue;

          try {
            await base44.asServiceRole.entities.EventoM31Inscricao.update(dup.id, {
              dedup_key: novoDedupKey,
              observacoes: novaObs,
            });
            resultado.marcados_como_duplicata++;
          } catch (e) {
            resultado.erros.push({ cpf, id: dup.id, erro: e.message });
          }
        }

        // 2. DEPOIS: garantir que a principal tem dedup_key canônico
        if (principal.dedup_key !== dedupCanonico) {
          try {
            await base44.asServiceRole.entities.EventoM31Inscricao.update(principal.id, {
              dedup_key: dedupCanonico,
            });
            resultado.principais_atualizados++;
          } catch (e) {
            resultado.erros.push({ cpf, id: principal.id, erro: `Falha ao setar dedup_key canônico: ${e.message}` });
          }
        }

        resultado.processados++;
        resultado.detalhes.push({
          cpf,
          principal_id: principal.id,
          principal_nome: principal.nome,
          principal_status: principal.status_pagamento,
          principal_codigo: principal.codigo_inscricao,
          duplicatas_marcadas: restantes.length,
        });
      } catch (e) {
        resultado.erros.push({ cpf, erro: e.message });
      }
    }

    return Response.json(resultado);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
