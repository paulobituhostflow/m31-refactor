// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31AuditoriaInscrita — Auditoria completa de uma inscrição
 * Consolida: dados, logs de mensagens, ações, status Asaas
 */

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Apenas admin pode auditar' }, { status: 403 });
    }

    const { phone } = await req.json();
    if (!phone) {
      return Response.json({ error: 'Phone é obrigatório' }, { status: 400 });
    }

    const telefone = (phone || '').replace(/\D/g, '');
    
    // 1. Buscar inscrição
    const inscricoes = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
      { whatsapp: telefone },
      '-created_date', 10
    );

    if (inscricoes.length === 0) {
      return Response.json({
        encontrada: false,
        telefone,
        mensagem: 'Nenhuma inscrição encontrada'
      });
    }

    const insc = inscricoes[0]; // Mais recente

    // 2. Buscar logs de mensagens
    const logsMsg = await base44.asServiceRole.entities.M31MessageLog.filter(
      { 
        $or: [
          { inscricao_id: insc.id },
          { telefone: telefone }
        ]
      },
      '-enviado_em',
      50
    );

    // 3. Buscar logs de ações
    const logsAcoes = await base44.asServiceRole.entities.EventoM31ActionLog.filter(
      { 
        $or: [
          { entidade_id: insc.id },
          { pessoa_telefone: telefone }
        ]
      },
      '-created_date',
      50
    );

    // 4. Buscar audit logs
    const auditLogs = await base44.asServiceRole.entities.M31AuditLog.filter(
      { 
        $or: [
          { pessoa_id: insc.id },
          { pessoa_telefone: telefone }
        ]
      },
      '-created_date',
      50
    );

    // 5. Resumir status
    const resumo = {
      nome: insc.nome,
      email: insc.email,
      whatsapp: insc.whatsapp,
      cpf: insc.cpf,
      id: insc.id,
      created_at: insc.created_date,
      updated_at: insc.updated_date,
      
      // Pagamento
      status_pagamento: insc.status_pagamento,
      valor_pago: insc.valor_pago,
      lote: insc.lote,
      asaas_payment_id: insc.asaas_payment_id,
      asaas_charge_url: insc.asaas_charge_url,
      
      // Boas-vindas e grupo
      data_envio_boas_vindas: insc.data_envio_boas_vindas,
      status_envio_grupo: insc.status_envio_grupo,
      entrou_no_grupo: insc.entrou_no_grupo,
      
      // Recuperação
      recovery_attempts: insc.recovery_attempts,
      last_recovery_at: insc.last_recovery_at,
      last_contact_at: insc.last_contact_at,
      
      // Observações
      observacoes: insc.observacoes,
      current_stage: insc.current_stage,
      opt_out: insc.opt_out,
    };

    // 6. Timeline de eventos
    const timeline = [];

    // Adicionar criação
    timeline.push({
      tipo: 'inscricao_criada',
      data: insc.created_date,
      descricao: `Inscrição criada - Status: ${insc.status_pagamento}`,
    });

    // Adicionar mensagens
    logsMsg.forEach(log => {
      timeline.push({
        tipo: 'mensagem_whatsapp',
        data: log.enviado_em,
        descricao: `${log.tipo.toUpperCase()} - ${log.sucesso ? '✅ Sucesso' : '❌ Falha'} - Stage: ${log.stage}`,
        detalhes: {
          tipo: log.tipo,
          sucesso: log.sucesso,
          erro: log.erro,
          telefone: log.telefone,
        }
      });
    });

    // Adicionar ações administrativas
    logsAcoes.forEach(acao => {
      timeline.push({
        tipo: 'acao_admin',
        data: acao.created_date,
        descricao: `${acao.acao} (por ${acao.user_email})`,
        modulo: acao.modulo,
      });
    });

    // Adicionar auditoria de erros
    auditLogs.forEach(audit => {
      timeline.push({
        tipo: 'erro_auditado',
        data: audit.created_date,
        descricao: `${audit.tipo_erro} - Gravidade: ${audit.gravidade}`,
        status: audit.status,
      });
    });

    // Ordenar timeline
    timeline.sort((a, b) => new Date(b.data) - new Date(a.data));

    // 7. Diagnóstico
    const diagnostico = {
      multiplas_inscricoes: inscricoes.length > 1,
      pagamento_pendente: ['checkout_pendente', 'checkout_abandonado', 'pendente'].includes(insc.status_pagamento),
      boas_vindas_nao_enviadas: !insc.data_envio_boas_vindas,
      nao_entrou_grupo: !insc.entrou_no_grupo,
      sem_link_pagamento: !insc.asaas_charge_url,
      tentativas_recuperacao: insc.recovery_attempts,
      opt_out: insc.opt_out,
      alertas: []
    };

    // Montar alertas
    if (diagnostico.multiplas_inscricoes) {
      diagnostico.alertas.push(`⚠️ ${inscricoes.length} inscrições encontradas com este telefone`);
    }
    if (diagnostico.pagamento_pendente) {
      diagnostico.alertas.push(`❌ Pagamento em ${insc.status_pagamento}`);
    }
    if (diagnostico.sem_link_pagamento) {
      diagnostico.alertas.push(`❌ Sem link de pagamento no Asaas`);
    }
    if (diagnostico.nao_entrou_grupo) {
      diagnostico.alertas.push(`⚠️ Não entrou no grupo WhatsApp`);
    }
    if (insc.recovery_attempts > 5) {
      diagnostico.alertas.push(`⚠️ ${insc.recovery_attempts} tentativas de recuperação`);
    }
    if (insc.opt_out) {
      diagnostico.alertas.push(`🔴 MARCADA COMO OPT-OUT`);
    }

    return Response.json({
      encontrada: true,
      resumo,
      diagnostico,
      timeline: timeline.slice(0, 30), // Últimos 30 eventos
      stats: {
        total_inscricoes_encontradas: inscricoes.length,
        total_mensagens_log: logsMsg.length,
        total_acoes_log: logsAcoes.length,
        total_audit_logs: auditLogs.length,
      },
      todas_inscricoes: inscricoes.map(i => ({
        id: i.id,
        nome: i.nome,
        status_pagamento: i.status_pagamento,
        created_date: i.created_date,
      }))
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
