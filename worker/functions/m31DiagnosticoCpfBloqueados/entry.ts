// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31DiagnosticoCpfBloqueados
 *
 * Identifica mulheres que podem ter sido bloqueadas pela validação de CPF
 * nos últimos 7 dias.
 *
 * Como o sistema NÃO registra tentativas bloqueadas (retorna erro HTTP),
 * a estratégia é:
 *
 * 1. Buscar todas as inscrições criadas nos últimos 7 dias
 * 2. Buscar TODAS as inscrições com status APROVADO para os CPFs encontrados
 * 3. Qualquer CPF que aparece nos últimos 7 dias com status NÃO aprovado,
 *    mas que TAMBÉM tem uma inscrição aprovada = foi bloqueada em nova tentativa.
 * 4. CPFs que aparecem 2+ vezes nos últimos 7 dias = tentativas múltiplas.
 *
 * Também retorna: inscrições recentes com status abandonado/pendente
 * que são candidatas à recuperação.
 */

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const agora = new Date();
    const sete_dias_atras = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Buscar TODAS as inscrições (precisamos comparar CPFs)
    const todasInscricoes = await base44.asServiceRole.entities.EventoM31Inscricao.list('-created_date', 2000);

    // Filtrar as dos últimos 7 dias
    const recentes = todasInscricoes.filter(i => i.created_date >= sete_dias_atras);

    // Agrupar por CPF (limpo)
    const porCpf = {};
    for (const i of todasInscricoes) {
      const cpf = i.cpf?.replace(/\D/g, '');
      if (!cpf || cpf.length !== 11) continue;
      if (!porCpf[cpf]) porCpf[cpf] = [];
      porCpf[cpf].push(i);
    }

    // Casos de bloqueio real:
    // CPF que tem APROVADO + tentativa recente NÃO aprovada
    const bloqueadasPorCpfAprovado = [];

    for (const i of recentes) {
      const cpf = i.cpf?.replace(/\D/g, '');
      if (!cpf || cpf.length !== 11) continue;

      const todasDoCpf = porCpf[cpf] || [];
      const aprovadas = todasDoCpf.filter(x => x.status_pagamento === 'aprovado');

      // Se esta inscrição NÃO é aprovada, mas existe outra aprovada com mesmo CPF
      if (i.status_pagamento !== 'aprovado' && aprovadas.length > 0) {
        // Esta tentativa foi bloqueada
        const aprovada = aprovadas[0];
        bloqueadasPorCpfAprovado.push({
          caso: 'cpf_com_aprovada_existente',
          nome: i.nome,
          whatsapp: i.whatsapp,
          email: i.email,
          cpf: cpf,
          data_tentativa: i.created_date,
          status_tentativa: i.status_pagamento,
          inscricao_tentativa_id: i.id,
          inscricao_aprovada_id: aprovada.id,
          inscricao_aprovada_data: aprovada.created_date,
          observacao: 'Tentou criar nova inscrição mas foi bloqueada pois já tinha inscrição aprovada com este CPF',
        });
      }
    }

    // Casos adicionais: CPFs com múltiplas inscrições nos últimos 7 dias (sem aprovada)
    const cpfsRecentes = {};
    for (const i of recentes) {
      const cpf = i.cpf?.replace(/\D/g, '');
      if (!cpf || cpf.length !== 11) continue;
      if (!cpfsRecentes[cpf]) cpfsRecentes[cpf] = [];
      cpfsRecentes[cpf].push(i);
    }

    const multiplas = [];
    for (const [cpf, lista] of Object.entries(cpfsRecentes)) {
      if (lista.length > 1) {
        const temAprovada = lista.some(x => x.status_pagamento === 'aprovado');
        if (!temAprovada) {
          // Múltiplas tentativas sem nenhuma aprovada = problema no fluxo
          multiplas.push({
            caso: 'multiplas_tentativas_sem_aprovacao',
            cpf,
            nome: lista[0].nome,
            whatsapp: lista[0].whatsapp,
            email: lista[0].email,
            total_tentativas: lista.length,
            tentativas: lista.map(x => ({
              id: x.id,
              data: x.created_date,
              status: x.status_pagamento,
            })),
            observacao: 'Tentou se inscrever múltiplas vezes nos últimos 7 dias sem nunca ter aprovação',
          });
        }
      }
    }

    // Inscrições recentes recuperáveis (sem bloqueio de CPF, mas status ruim)
    const recuperaveis = recentes.filter(i => {
      const cpf = i.cpf?.replace(/\D/g, '');
      const todasDoCpf = porCpf[cpf] || [];
      const aprovadas = todasDoCpf.filter(x => x.status_pagamento === 'aprovado');
      return (
        aprovadas.length === 0 &&
        ['checkout_abandonado', 'checkout_pendente', 'pendente'].includes(i.status_pagamento)
      );
    }).map(i => ({
      nome: i.nome,
      whatsapp: i.whatsapp,
      email: i.email,
      cpf: i.cpf?.replace(/\D/g, ''),
      data: i.created_date,
      status: i.status_pagamento,
      id: i.id,
      link_pagamento: i.asaas_charge_url || null,
    }));

    return Response.json({
      referencia: `Últimos 7 dias (desde ${sete_dias_atras.slice(0, 10)})`,
      total_inscrições_recentes: recentes.length,

      bloqueadas_por_cpf_aprovado: {
        total: bloqueadasPorCpfAprovado.length,
        lista: bloqueadasPorCpfAprovado,
      },

      multiplas_tentativas_sem_aprovacao: {
        total: multiplas.length,
        lista: multiplas,
      },

      recuperaveis_sem_bloqueio: {
        total: recuperaveis.length,
        nota: 'Estas têm inscrição recente com status ruim mas SEM inscrição aprovada com mesmo CPF — são recuperáveis normalmente',
        lista: recuperaveis,
      },
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
