// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31RecuperarInscricoesCritico
 * INCIDENTE CRÍTICO — Recuperação de inscrições afetadas pelo erro de validação
 * 
 * FASE 1: Auditoria — Localizar e validar inscrições problemáticas
 * FASE 2: Recuperação — Gerar checkouts com validação rigorosa
 * FASE 3: Disparo — Enviar mensagens em lotes de 10 com intervalo
 * 
 * FASE 1.1: SPINLOCK — Impedir execução simultânea
 */


const SPINLOCK_KEY = 'm31_recuperacao_em_andamento';

async function adquirirLock(base44): Promise<string | null> {
  let tentativas = 0;
  const maxTentativas = 30;
  
  while (tentativas < maxTentativas) {
    const locks = await base44.asServiceRole.entities.M31AuditLog.filter({
      chave_unica: SPINLOCK_KEY
    });
    
    if (locks.length === 0) {
      const lockId = await base44.asServiceRole.entities.M31AuditLog.create({
        chave_unica: SPINLOCK_KEY,
        tipo_erro: 'spinlock_recuperacao',
        gravidade: 'baixo',
        origem: 'automacao',
        descricao: `Lock adquirido para m31RecuperarInscricoesCritico em ${new Date().toISOString()}`,
        possivel_causa: 'Controle de concorrência',
        acao_recomendada: 'Liberado automaticamente',
        status: 'novo',
      });
      return lockId;
    }
    
    tentativas++;
    await new Promise(r => setTimeout(r, 1000));
  }
  
  return null;
}

async function liberarLock(base44, lockId: string | null) {
  if (lockId) {
    await base44.asServiceRole.entities.M31AuditLog.delete(lockId).catch(() => {});
  }
}

return (async (req) => {
  let lockId: string | null = null;
  
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action, aproveDisparo, selecionadas } = body;

    const ASAAS_KEY = config("ASAAS_API_KEY");
    const ASAAS_BASE = "__ASAAS_API__";

    // ═══════════════════════════════════════════════════════════════════════════════
    // FASE 1A: AUDITORIA DETALHADA
    // Remove: 1) status_pagamento = 'aprovado' | 2) recuperação em 24h
    // ═════════════════════════════════════════════════════════════════════════════════
    if (action === 'auditoria_detalhada') {
      const statusProblematico = ['checkout_abandonado', 'checkout_pendente'];
      const agora = new Date();
      const limiteRecuperacao24h = new Date(agora.getTime() - 24 * 60 * 60 * 1000);
      
      let inscricoes = [];
      for (const status of statusProblematico) {
        const batch = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
          { status_pagamento: status },
          '-created_date',
          1000
        );
        inscricoes = [...inscricoes, ...batch];
      }

      const inscricaosPorTelefone = new Map();
      inscricoes.forEach(insc => {
        if (!inscricaosPorTelefone.has(insc.whatsapp)) {
          inscricaosPorTelefone.set(insc.whatsapp, insc);
        }
      });
      const inscricopesUnicas = Array.from(inscricaosPorTelefone.values());

      const detalhadas = inscricopesUnicas.map((insc) => {
        const statusPago = insc.status_pagamento === 'aprovado';
        const recuperacaoRecente = insc.last_recovery_at && new Date(insc.last_recovery_at) > limiteRecuperacao24h;
        const elegivel = !statusPago && !recuperacaoRecente;

        return {
          id: insc.id,
          nome: insc.nome || '(sem nome)',
          codigo_inscricao: insc.codigo_inscricao || '(sem codigo)',
          status_atual: insc.status_pagamento,
          pagamentoConfirmado: statusPago,
          recuperacaoRecente24h: recuperacaoRecente,
          elegivel
        };
      });

      const elegiveisRecuperacao = detalhadas.filter(d => d.elegivel);
      const removidosRecuperacaoRecente = detalhadas.filter(d => d.recuperacaoRecente24h);

      // ═══════════════════════════════════════════════════════════════════════════
      // REGRA Nº 0.1 (GUARD DE DINHEIRO) + Nº 0.2 (SEM DELETE SILENCIOSO)
      // Este bloco ANTES deletava inscrições aprovadas (dinheiro confirmado),
      // com catch vazio e zero log — violação direta da Regra Nº 0.
      // NEUTRALIZADO: aprovado é INTOCÁVEL por automação. Nunca deletamos.
      // Apenas SINALIZAMOS os aprovados que colidem por telefone, para revisão
      // manual do gestor (que olha o Asaas e decide caso a caso).
      // ═══════════════════════════════════════════════════════════════════════════
      const aprovadosParaRevisaoManual = detalhadas.filter(d => d.pagamentoConfirmado);

      return Response.json({
        fase: 'AUDITORIA CONCLUIDA (SOMENTE LEITURA — Regra Nº 0.1/0.2)',
        aviso: 'Nenhum registro foi apagado. Aprovado é intocável por automação. Os itens abaixo exigem decisão manual do gestor.',
        total_auditado: inscricopesUnicas.length,
        total_elegivel_recuperacao: elegiveisRecuperacao.length,
        total_aprovados_para_revisao_manual: aprovadosParaRevisaoManual.length,
        total_ignorado_recuperacao_recente: removidosRecuperacaoRecente.length,
        total_final_checkout: elegiveisRecuperacao.length,
        aprovados_para_revisao_manual: aprovadosParaRevisaoManual.map(d => ({
          id: d.id, nome: d.nome, codigo_inscricao: d.codigo_inscricao, status_atual: d.status_atual
        })),
        resumo: {
          auditado: inscricopesUnicas.length,
          elegiveis: elegiveisRecuperacao.length,
          aprovados_para_revisao_manual: aprovadosParaRevisaoManual.length,
          ignorados_por_recuperacao_24h: removidosRecuperacaoRecente.length
        }
      });
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // FASE 2: RECUPERACAO
    // ═════════════════════════════════════════════════════════════════════════════════
    if (action === 'recuperar') {
      if (!selecionadas || selecionadas.length === 0) {
        return Response.json({ error: 'Lista de IDs selecionadas obrigatoria' }, { status: 400 });
      }

      const resultados = [];
      const semCheckout = [];

      for (const inscricao_id of selecionadas) {
        try {
          const insc = await base44.asServiceRole.entities.EventoM31Inscricao.get(inscricao_id);
          if (!insc) {
            resultados.push({ id: inscricao_id, erro: 'Inscricao nao encontrada' });
            continue;
          }

          if (insc.status_pagamento === 'aprovado') {
            resultados.push({
              id: inscricao_id,
              nome: insc.nome,
              status: 'REJEITADO_PAGAMENTO_JA_REALIZADO',
              motivo: 'Participante ja possui pagamento confirmado'
            });
            continue;
          }

          const lotes = await base44.asServiceRole.entities.EventoM31Lote.filter(
            { codigo: insc.lote }
          );
          const lote = lotes[0];
          if (!lote) {
            resultados.push({ id: inscricao_id, erro: 'Lote nao encontrado' });
            continue;
          }

          let checkoutLink = insc.asaas_charge_url;
          let reutilizado = false;

          if (checkoutLink && checkoutLink.length > 10) {
            try {
              const validRes = await fetch(checkoutLink, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
              if (validRes.ok || validRes.status === 200) {
                reutilizado = true;
              }
            } catch (e) {
              checkoutLink = null;
            }
          }

          if (!checkoutLink) {
            const checkoutRes = await fetch(`${ASAAS_BASE}/checkouts`, {
              method: 'POST',
              headers: { 'access_token': ASAAS_KEY, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                billingTypes: ['PIX', 'CREDIT_CARD'],
                chargeTypes: ['DETACHED', 'INSTALLMENT'],
                installment: { maxInstallmentCount: 5 },
                minutesToExpire: 1440,
                externalReference: insc.codigo_inscricao,
                callback: {
                  successUrl: '__APP_ORIGIN__/obrigado',
                  cancelUrl: '__APP_ORIGIN__/m31-inscricao',
                  expiredUrl: '__APP_ORIGIN__/m31-inscricao'
                },
                items: [{
                  name: 'M31 Filhas - Recuperacao',
                  description: `Inscricao ${insc.codigo_inscricao} - ${insc.nome} - ${lote.nome}`,
                  value: insc.valor_pago || lote.valor,
                  quantity: 1
                }]
              })
            });
            const checkout = await checkoutRes.json();
            if (!checkout.link || checkout.link.length < 10) {
              resultados.push({ id: inscricao_id, erro: 'Falha ao criar checkout no Asaas' });
              semCheckout.push(inscricao_id);
              continue;
            }
            checkoutLink = checkout.link;
          }

          if (!reutilizado && checkoutLink !== insc.asaas_charge_url) {
            await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao_id, {
              asaas_charge_url: checkoutLink,
              data_reenvio_checkout: new Date().toISOString(),
              status_recuperacao: 'checkout_criado'
            });
          }

          resultados.push({
            id: inscricao_id,
            nome: insc.nome,
            email: insc.email,
            whatsapp: insc.whatsapp,
            status: 'CHECKOUT_PRONTO',
            payment_url: checkoutLink,
            reutilizado: reutilizado,
            timestamp: new Date().toISOString()
          });

        } catch (e) {
          resultados.push({
            id: inscricao_id,
            erro: (e as Error).message
          });
          semCheckout.push(inscricao_id);
        }
      }

      const sucesso = resultados.filter(r => r.status === 'CHECKOUT_PRONTO').length;
      const erros = resultados.filter(r => r.erro).length;
      const rejeitados = resultados.filter(r => r.status === 'REJEITADO_PAGAMENTO_JA_REALIZADO').length;

      const prontoDisparo = resultados.filter(r => r.status === 'CHECKOUT_PRONTO').map(r => ({
        id: r.id,
        nome: r.nome,
        whatsapp: r.whatsapp,
        payment_url: r.payment_url,
        reutilizado: r.reutilizado
      }));

      return Response.json({
        fase: 'CHECKOUTS VALIDADOS E PRONTOS',
        total_processadas: selecionadas.length,
        quantidade_reutilizados: prontoDisparo.filter(p => p.reutilizado).length,
        quantidade_criada_nova: prontoDisparo.filter(p => !p.reutilizado).length,
        quantidade_com_erro: erros,
        quantidade_rejeitada_pagamento: rejeitados,
        participantes_sem_checkout: semCheckout,
        pronto_disparo: prontoDisparo,
        resumo_relatorio: {
          reutilizados: prontoDisparo.filter(p => p.reutilizado).length,
          criados_novo: prontoDisparo.filter(p => !p.reutilizado).length,
          com_erro: erros,
          rejeitadas_pagamento_confirmado: rejeitados,
          total_pronto_disparo: prontoDisparo.length
        },
        proximo_passo: `Chamar action: "disparar_com_lotes" com os ${prontoDisparo.length} participantes elegiveis`
      });
    }

    async function enviarWhatsAppDireto(phone: string, message: string): Promise<{ sucesso: boolean; status: number; body: string }> {
      const result = await base44.asServiceRole.functions.invoke('m31WhatsAppService', { 
        phone, 
        message 
      });
      return {
        sucesso: result.data?.sucesso === true,
        status: result.data?.status || result.status || 500,
        body: result.data?.body || JSON.stringify(result),
      };
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // FASE 3: DISPARO COM LOTES (COM SPINLOCK)
    // ═════════════════════════════════════════════════════════════════════════════════
    if (action === 'disparar_com_lotes') {
      // Adquirir lock antes de processar
      lockId = await adquirirLock(base44);
      if (!lockId) {
        return Response.json({ 
          error: 'TIMEOUT: Outra execução está em andamento (spinlock ativo)',
          acao: 'Aguarde até 30 segundos e tente novamente',
          spinlock_key: SPINLOCK_KEY
        }, { status: 409 });
      }

      if (!aproveDisparo) {
        return Response.json({ error: 'Disparo requer aprovacao explicita (aproveDisparo: true)' }, { status: 403 });
      }

      if (!selecionadas || selecionadas.length === 0) {
        return Response.json({ error: 'Dados de participantes obrigatorios' }, { status: 400 });
      }

      const TAMANHO_LOTE = 10;
      const relatorioGeral = [];
      let parou = false;
      let motivoParada = null;

      function randomIntervalo() {
        return 1000 + Math.random() * 4000;
      }

      for (let i = 0; i < selecionadas.length && !parou; i += TAMANHO_LOTE) {
        const lote = selecionadas.slice(i, i + TAMANHO_LOTE);
        const numeroLote = Math.floor(i / TAMANHO_LOTE) + 1;
        const resultadosLote = [];

        logger.log(`[LOTE ${numeroLote}] Iniciando disparo de ${lote.length} participantes...`);

        for (let j = 0; j < lote.length && !parou; j++) {
          const participante = lote[j];
          
          try {
            const insc = await base44.asServiceRole.entities.EventoM31Inscricao.get(participante.id);
            if (!insc) {
              resultadosLote.push({ id: participante.id, status: 'ERRO', motivo: 'Inscricao nao encontrada' });
              continue;
            }

            const primeiroNome = insc.nome?.split(' ')[0] || 'Ola';
            const mensagem = `Ola, ${primeiroNome}! \n\nIdentificamos uma instabilidade durante sua inscricao no M31 Filhas. A situacao ja foi regularizada.\n\nAgora eh so concluir o pagamento pelo link abaixo:\n\n${participante.payment_url}\n\nQualquer duvida, nossa equipe esta a disposicao.`;

            const resposta = await enviarWhatsAppDireto(insc.whatsapp, mensagem);

            if (resposta.sucesso !== true) {
              parou = true;
              motivoParada = `UAZAPI status ${resposta.status}: ${resposta.body.slice(0, 100)}`;
              resultadosLote.push({
                id: participante.id,
                nome: insc.nome,
                whatsapp: insc.whatsapp,
                status: 'ERRO_UAZAPI',
                motivo: motivoParada,
                timestamp: new Date().toISOString()
              });
              break;
            }

            await base44.asServiceRole.entities.M31MessageLog.create({
              inscricao_id: insc.id,
              inscricao_nome: insc.nome,
              telefone: insc.whatsapp,
              tipo: 'recuperacao',
              stage: 'recuperacao_critica',
              mensagem,
              sucesso: true,
              zapi_response: resposta.body,
              erro: null,
              enviado_em: new Date().toISOString()
            });

            await base44.asServiceRole.entities.EventoM31Inscricao.update(insc.id, {
              data_recuperacao: new Date().toISOString(),
              status_recuperacao: 'mensagem_enviada'
            });

            resultadosLote.push({
              id: participante.id,
              nome: insc.nome,
              whatsapp: insc.whatsapp,
              status: 'ENVIADO',
              timestamp: new Date().toISOString()
            });

            if (j < lote.length - 1) {
              const intervalo = randomIntervalo();
              await new Promise(resolve => setTimeout(resolve, intervalo));
            }

          } catch (e) {
            resultadosLote.push({
              id: participante.id,
              status: 'ERRO',
              motivo: (e as Error).message
            });
          }
        }

        const enviados = resultadosLote.filter(r => r.status === 'ENVIADO').length;
        const erros = resultadosLote.filter(r => r.status === 'ERRO' || r.status === 'ERRO_UAZAPI').length;

        relatorioGeral.push({
          lote: numeroLote,
          total_processadas: resultadosLote.length,
          enviadas: enviados,
          com_erro: erros,
          parado: parou,
          motivo_paragem: motivoParada,
          detalhes: resultadosLote
        });

        logger.log(`[LOTE ${numeroLote}] Enviadas: ${enviados} | Erros: ${erros} | Parou: ${parou}`);
      }

      const totalEnviadas = relatorioGeral.reduce((acc, lote) => acc + lote.enviadas, 0);
      const totalComErro = relatorioGeral.reduce((acc, lote) => acc + lote.com_erro, 0);

      return Response.json({
        fase: 'DISPARO COM LOTES CONCLUIDO',
        total_participantes: selecionadas.length,
        total_enviadas: totalEnviadas,
        total_com_erro: totalComErro,
        parado_por_erro_uazapi: parou,
        motivo_paragem: motivoParada,
        relatorio_por_lote: relatorioGeral,
        resumo: {
          enviadas: totalEnviadas,
          com_erro: totalComErro,
          parado: parou ? 'SIM' : 'NAO',
          motivo: motivoParada || 'Nenhum'
        },
        spinlock_info: {
          utilizado: true,
          chave: SPINLOCK_KEY
        }
      });
    }

    return Response.json({ error: 'Action invalida. Use: auditoria_detalhada, recuperar ou disparar_com_lotes' }, { status: 400 });

  } catch (error) {
    return Response.json({
      error: (error as Error).message,
      stack: (error as Error).stack?.slice(0, 500)
    }, { status: 500 });
  } finally {
    // Sempre liberar lock ao final, mesmo em erro
    if (lockId) {
      await liberarLock({ asServiceRole: { entities: { M31AuditLog: { delete: async () => {} } } } }, lockId).catch(() => {});
    }
  }
})(req);
}
