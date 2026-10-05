// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

/**
 * AUDITORIA DE RECUPERAÇÃO
 * 
 * Pergunta 1: Critérios exatos para fila de recuperação
 * Pergunta 2: Próximas 20 pessoas elegíveis + histórico
 * 
 * NÃO DISPARA MENSAGENS
 */
return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user?.email || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const agora = new Date();
    const agoraMs = agora.getTime();

    // ═══════════════════════════════════════════════════════════════════
    // PERGUNTA 1: CRITÉRIOS EXATOS
    // ═══════════════════════════════════════════════════════════════════
    
    const JANELA_3H_MS = 3 * 60 * 60 * 1000;
    const JANELA_24H_MS = 24 * 60 * 60 * 1000;
    const MAX_TENTATIVAS = 2;
    const HORA_INICIO = 8;
    const HORA_FIM = 21;

    const horaRecife = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Recife' })).getHours();
    
    const criterios = {
      1: {
        descricao: "Status de pagamento deve ser checkout_pendente OU checkout_abandonado",
        campo: "status_pagamento",
        valores_validos: ["checkout_pendente", "checkout_abandonado"]
      },
      2: {
        descricao: "Tem telefone válido com 10-13 dígitos",
        campo: "whatsapp",
        regex: "/\d{10,13}/"
      },
      3: {
        descricao: "Não tem opt_out marcado",
        campo: "opt_out",
        valor_valido: false
      },
      4: {
        descricao: "Passou de 3 horas desde criação (T+3h)",
        campo: "created_date",
        minimo_ms: JANELA_3H_MS
      },
      5: {
        descricao: "Tentativas < 2 (max_tentativas = 2)",
        campo: "recovery_attempts",
        maximo: 1
      },
      6: {
        descricao: "Se tentativa = 1, deve ter passado 24h desde last_recovery_at",
        campo: "last_recovery_at",
        minimo_ms_se_tentativa_1: JANELA_24H_MS
      },
      7: {
        descricao: "Não pode estar em fila_recuperacao = true (já enfileirada)",
        campo: "fila_recuperacao",
        valor_valido: false
      },
      8: {
        descricao: "Janela horária de envio: 8h–21h BRT (atual: " + horaRecife + "h)",
        campo: "hora_recife",
        valida_agora: (horaRecife >= HORA_INICIO && horaRecife < HORA_FIM)
      }
    };

    // ═══════════════════════════════════════════════════════════════════
    // PERGUNTA 2: PRÓXIMAS 20 ELEGÍVEIS
    // ═══════════════════════════════════════════════════════════════════

    const [pendentes, abandonadas] = await Promise.all([
      base44.asServiceRole.entities.EventoM31Inscricao.filter(
        { status_pagamento: 'checkout_pendente' }, '-created_date', 500
      ),
      base44.asServiceRole.entities.EventoM31Inscricao.filter(
        { status_pagamento: 'checkout_abandonado' }, '-created_date', 500
      ),
    ]);

    const todas = [...pendentes, ...abandonadas];

    const elegveis = todas
      .filter(i => {
        // Critério 1
        if (!["checkout_pendente", "checkout_abandonado"].includes(i.status_pagamento)) return false;

        // Critério 2
        const tel = (i.whatsapp || '').replace(/\D/g, '');
        if (tel.length < 10 || tel.length > 13) return false;

        // Critério 3
        if (i.opt_out) return false;

        // Critério 4
        const criadoMs = new Date(i.created_date).getTime();
        if (agoraMs - criadoMs < JANELA_3H_MS) return false;

        // Critério 5
        const tentativas = i.recovery_attempts || 0;
        if (tentativas >= MAX_TENTATIVAS) return false;

        // Critério 6
        if (tentativas === 1 && i.last_recovery_at) {
          const ultimoMs = new Date(i.last_recovery_at).getTime();
          if (agoraMs - ultimoMs < JANELA_24H_MS) return false;
        }

        // Critério 7
        if (i.fila_recuperacao) return false;

        return true;
      })
      .sort((a, b) => {
        // Priorizar: tentativas=0 antes de tentativas=1
        const tentA = a.recovery_attempts || 0;
        const tentB = b.recovery_attempts || 0;
        if (tentA !== tentB) return tentA - tentB;
        // Depois por data criação (mais antigos primeiro)
        return new Date(a.created_date) - new Date(b.created_date);
      })
      .slice(0, 20);

    // ═══════════════════════════════════════════════════════════════════
    // BUSCAR LOGS DE MENSAGENS PARA CADA ELEGÍVEL
    // ═══════════════════════════════════════════════════════════════════

    const elegveisComHistorico = await Promise.all(
      elegveis.map(async (insc) => {
        const logsRecuperacao = await base44.asServiceRole.entities.M31MessageLog.filter(
          { inscricao_id: insc.id, tipo: 'recuperacao_checkout' },
          '-enviado_em',
          5
        );

        const ultimoLog = logsRecuperacao[0] || null;

        return {
          nome: insc.nome,
          telefone: insc.whatsapp,
          email: insc.email,
          status_pagamento: insc.status_pagamento,
          recovery_attempts: insc.recovery_attempts || 0,
          opt_out: insc.opt_out || false,
          fila_recuperacao: insc.fila_recuperacao || false,
          criada_em: insc.created_date,
          horas_desde_criacao: Math.round((agoraMs - new Date(insc.created_date).getTime()) / (1000 * 60 * 60)),
          last_recovery_at: insc.last_recovery_at,
          horas_desde_ultimo_envio: insc.last_recovery_at 
            ? Math.round((agoraMs - new Date(insc.last_recovery_at).getTime()) / (1000 * 60 * 60))
            : null,
          ultima_mensagem: ultimoLog ? {
            enviada_em: ultimoLog.enviado_em,
            sucesso: ultimoLog.sucesso,
            tipo: ultimoLog.tipo,
            resumo: ultimoLog.mensagem?.slice(0, 80),
            erro: ultimoLog.erro
          } : null,
          historico_logs: logsRecuperacao.map((l, idx) => ({
            numero: idx + 1,
            enviada_em: l.enviado_em,
            sucesso: l.sucesso,
            tipo: l.tipo
          }))
        };
      })
    );

    // ═══════════════════════════════════════════════════════════════════
    // RESUMO DOS FLUXOS
    // ═══════════════════════════════════════════════════════════════════

    return Response.json({
      timestamp: new Date().toISOString(),
      hora_recife_agora: `${horaRecife}h BRT`,

      pergunta_1: {
        titulo: "Critérios exatos para fila de recuperação",
        criterios,
        observacao: "Todos os 8 critérios devem passar SIMULTANEOUSLY (lógica AND)"
      },

      pergunta_2: {
        titulo: "Próximas 20 pessoas elegíveis AGORA",
        total_pendentes: pendentes.length,
        total_abandonadas: abandonadas.length,
        total_pool: todas.length,
        elegveis_agora: elegveis.length,
        max_mostrados: 20,
        lista: elegveisComHistorico,

        funcoes_responsaveis: {
          identificacao: "m31RecuperarCheckout",
          enfileiramento: "m31RecuperarCheckout (modo: !dispatchMode)",
          disparo: "m31RecuperarCheckout (modo: dispatchMode=true, header x-dispatch-mode: true)",
          chamada_interna: "m31SendWhatsApp (linha 294)",
          logging: "M31MessageLog.create + registrarLog()"
        },

        fluxo_de_uma_inscrição: {
          passo_1: "Identifica elegível nos critérios acima",
          passo_2: "Se !dispatchMode: marca fila_recuperacao=true, não envia",
          passo_3: "Se dispatchMode=true: chama m31SendWhatsApp",
          passo_4: "Se WhatsApp sucesso: update recovery_attempts+=1, last_recovery_at=now",
          passo_5: "Log em M31MessageLog com tipo='recuperacao_checkout'",
          passo_6: "Reenvio manual: chamar função com x-dispatch-mode: true novamente"
        }
      }
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
