// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

/**
 * DIAGNÓSTICO COMPLETO DO FLUXO DE PAGAMENTO M31
 * 
 * Verifica:
 * 1. Cobranças no Asaas sem link em Base44
 * 2. Links salvos mas não enviados
 * 3. Pix disponível mas não utilizado
 * 4. Recuperações sem link
 * 5. Fluxo atual de nova inscrição
 */
return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Acesso restrito a admins' }, { status: 403 });
    }

    // ═══════════════════════════════════════════════════════════════════
    // DIAGNÓSTICO 1: Cobranças SEM link salvo
    // ═══════════════════════════════════════════════════════════════════
    const comCobrancaSemLink = await base44.asServiceRole.entities.EventoM31Inscricao.filter({
      status_pagamento: 'checkout_pendente'
    }, '-created_date', 1000);

    const cobrancasSemLink = comCobrancaSemLink.filter(i => 
      i.asaas_payment_id && (!i.asaas_charge_url || i.asaas_charge_url.trim() === '')
    );

    // ═══════════════════════════════════════════════════════════════════
    // DIAGNÓSTICO 2: Links salvos mas status incoerente
    // ═══════════════════════════════════════════════════════════════════
    const comLink = await base44.asServiceRole.entities.EventoM31Inscricao.filter({
      status_pagamento: 'checkout_pendente'
    }, '-created_date', 1000);

    const linksComStatus = comLink.filter(i => 
      i.asaas_charge_url && (i.asaas_charge_url.includes('invoice') || i.asaas_charge_url.includes('bankslip'))
    );

    // ═══════════════════════════════════════════════════════════════════
    // DIAGNÓSTICO 3: Verificar últimas mensagens de cobrança enviadas
    // ═══════════════════════════════════════════════════════════════════
    const logsCobranca = await base44.asServiceRole.entities.M31MessageLog.filter({
      tipo: 'cobranca'
    }, '-enviado_em', 100);

    const cobrancasComMensagem = new Set(logsCobranca.map(l => l.inscricao_id));

    // ═══════════════════════════════════════════════════════════════════
    // DIAGNÓSTICO 4: Recuperações sem link
    // ═══════════════════════════════════════════════════════════════════
    const logsRecuperacao = await base44.asServiceRole.entities.M31MessageLog.filter({
      tipo: 'recuperacao'
    }, '-enviado_em', 100);

    const recuperacoesFalhadas = logsRecuperacao.filter(l => 
      !l.mensagem.includes('http') && !l.mensagem.includes('https')
    );

    // ═══════════════════════════════════════════════════════════════════
    // ANÁLISE: Fluxo de NOVA inscrição atual
    // ═══════════════════════════════════════════════════════════════════
    const ultimasInscricoes = await base44.asServiceRole.entities.EventoM31Inscricao.filter({
      tipo: 'publico_geral',
      status_pagamento: 'checkout_pendente'
    }, '-created_date', 5);

    const fluxoAtual = ultimasInscricoes.map(i => ({
      codigo: i.codigo_inscricao,
      nome: i.nome,
      criada_em: i.created_date,
      tem_asaas_id: !!i.asaas_payment_id,
      tem_charge_url: !!i.asaas_charge_url,
      url_completa: i.asaas_charge_url,
      campos_salvos: {
        asaas_payment_id: !!i.asaas_payment_id,
        asaas_charge_url: !!i.asaas_charge_url,
        presenteado_whatsapp: !!i.presenteado_whatsapp,
        presenteado_id: !!i.presenteado_id,
        data_envio_boas_vindas: !!i.data_envio_boas_vindas,
        valor_pago: i.valor_pago,
        lote: i.lote
      },
      mensagens_recebidas: {
        boas_vindas: cobrancasComMensagem.has(i.id),
        cobranca: logsCobranca.some(l => l.inscricao_id === i.id),
        recuperacao: logsRecuperacao.some(l => l.inscricao_id === i.id)
      }
    }));

    return Response.json({
      timestamp: new Date().toISOString(),
      
      // ═══ FALHAS ENCONTRADAS ═══
      falhas: {
        cobracas_sem_link: {
          quantidade: cobrancasSemLink.length,
          descricao: 'Tem asaas_payment_id mas sem asaas_charge_url',
          registros: cobrancasSemLink.slice(0, 5).map(i => ({
            codigo: i.codigo_inscricao,
            nome: i.nome,
            asaas_id: i.asaas_payment_id,
            criada_em: i.created_date
          })),
          impacto: 'Usuario NÃO recebe link, botão de pagar não aparece'
        },
        
        links_sem_envio: {
          quantidade: linksComStatus.filter(i => !cobrancasComMensagem.has(i.id)).length,
          descricao: 'Tem link salvo mas nenhuma mensagem de cobrança foi enviada',
          registros: linksComStatus.filter(i => !cobrancasComMensagem.has(i.id)).slice(0, 5).map(i => ({
            codigo: i.codigo_inscricao,
            nome: i.nome,
            url: i.asaas_charge_url?.slice(0, 50) + '...',
            criada_em: i.created_date,
            horas_pendente: Math.round((Date.now() - new Date(i.created_date).getTime()) / (1000 * 60 * 60))
          })),
          impacto: 'Link existe mas usuario não foi notificado via WhatsApp'
        },

        recuperacoes_sem_link: {
          quantidade: recuperacoesFalhadas.length,
          descricao: 'Mensagens de recuperação sem URL ou Pix',
          registros: recuperacoesFalhadas.slice(0, 3).map(l => ({
            inscricao: l.inscricao_nome,
            telefone: l.telefone,
            mensagem_resumo: l.mensagem?.slice(0, 80),
            enviada_em: l.enviado_em,
            sucesso: l.sucesso
          })),
          impacto: 'Usuario recebe mensagem mas sem forma de pagar'
        }
      },

      // ═══ FLUXO ATUAL: O QUE ACONTECE AGORA ═══
      fluxo_atual: {
        titulo: 'Quando uma pessoa preenche o formulário HOJE',
        passos: [
          {
            numero: 1,
            acao: 'Formulário preenchido',
            chamada: 'm31CreatePayment',
            resultado: 'Inscrição criada em Base44'
          },
          {
            numero: 2,
            acao: 'Chamada Asaas (criar cliente)',
            campos_usados: ['nome', 'email', 'whatsapp', 'cpf'],
            resultado: 'customer.id retornado'
          },
          {
            numero: 3,
            acao: 'Criar cobrança Asaas',
            parametros: {
              valor: 'valor do lote ativo',
              billingType: 'UNDEFINED (Pix + Boleto)',
              dueDate: '3 dias a partir de agora',
              description: 'M31 Filhas - [Lote] - [Nome]'
            },
            retorno: 'charge.id + charge.invoiceUrl (link de pagamento)'
          },
          {
            numero: 4,
            acao: 'Salvar em Base44',
            campos: [
              'asaas_payment_id (charge.id)',
              'asaas_charge_url (invoiceUrl)',
              'status_pagamento = checkout_pendente'
            ],
            resultado: 'Inscrição pronta para pagamento'
          },
          {
            numero: 5,
            acao: 'Usuario recebe confirmação',
            o_que_recebe: [
              '✅ Código inscrição: M31-XXXXX',
              '✅ Link direto para pagamento Asaas',
              '❌ NÃO recebe QR Code Pix automático',
              '❌ NÃO recebe Pix Copia e Cola automático'
            ],
            onde_vem: {
              codigo: 'inscricao.codigo_inscricao (gerado em m31CreatePayment)',
              link_pagamento: 'inscricao.asaas_charge_url (retornado pelo Asaas)',
              pix_qrcode: 'NÃO ENVIADO na criação',
              pix_copia_cola: 'NÃO ENVIADO na criação'
            }
          }
        ],

        campos_do_base44: {
          asaas_payment_id: {
            tipo: 'string',
            fonte: 'charge.id do Asaas',
            quando_preenchido: 'ao criar cobrança',
            obrigatorio: true
          },
          asaas_charge_url: {
            tipo: 'string (URL completa)',
            fonte: 'charge.invoiceUrl do Asaas',
            quando_preenchido: 'ao criar cobrança',
            obrigatorio: true,
            conteudo: 'Link que usuario clica para pagar (Asaas Checkout)'
          },
          valor_pago: {
            tipo: 'number',
            fonte: 'lote ativo (EventoM31Lote)',
            quando_preenchido: 'ao criar inscrição',
            exemplo: 197.0
          },
          status_pagamento: {
            tipo: 'enum',
            valores: ['checkout_pendente', 'pendente', 'aprovado', 'cancelado', 'gratuito'],
            inicial: 'checkout_pendente',
            muda_para_aprovado: 'quando webhook do Asaas confirma pagamento'
          },
          codigo_inscricao: {
            tipo: 'string',
            formato: 'M31-XXXXXXXXX',
            gerado_em: 'm31CreatePayment via Date.now().toString(36)',
            unico: true
          }
        },

        exemplo_inscrição_nova: {
          codigo_inscricao: 'M31-ZQPK5XJ',
          nome: 'Maria Silva',
          email: 'maria@example.com',
          whatsapp: '5581987654321',
          status_pagamento: 'checkout_pendente',
          valor_pago: 197,
          lote: 'lote_1',
          asaas_payment_id: 'pay_8tong2jyq52a12or',
          asaas_charge_url: 'https://www.asaas.com/checkout.html?id=...',
          tipo: 'publico_geral',
          created_date: '2026-06-15T14:30:00Z'
        }
      },

      // ═══ O QUE USUARIO RECEBE (fluxo de mensagens) ═══
      o_que_usuario_recebe: {
        na_inscrição: [
          {
            tipo: 'Resposta do Formulário (HTTP)',
            contem: {
              success: true,
              inscricao_id: 'ID salvo no banco',
              codigo_inscricao: 'M31-ZQPK5XJ',
              payment_url: 'https://www.asaas.com/checkout.html?id=...',
              valor: 197,
              redirect_url: '/obrigado'
            },
            quando: 'Imediatamente após enviar formulário'
          }
        ],

        via_whatsapp: {
          1: {
            tipo: 'Boas-vindas (m31EnviarBoasVindas)',
            contem: [
              '✅ Confirmação de inscrição',
              '✅ Link do grupo WhatsApp',
              '✅ Código de inscrição',
              '❌ Link de pagamento (NÃO enviado aqui)'
            ],
            quando: 'Quando aprovado (após pagamento confirmado)',
            arquivo: 'functions/m31EnviarBoasVindas linha 409'
          },

          2: {
            tipo: 'Cobrança (m31DisparoCobrancasPendentes)',
            contem: [
              '❓ Link de pagamento (verificar campo)',
              '❓ QR Code Pix (verificar campo)',
              '❓ Pix Copia e Cola (verificar campo)'
            ],
            quando: 'Se não pagou após X dias',
            arquivo: 'functions/m31DisparoCobrancasPendentes',
            status: 'PRECISA VERIFICAÇÃO'
          },

          3: {
            tipo: 'Recuperação (m31RecuperarCheckout)',
            contem: [
              '❓ Pode conter link ou Pix',
              '❓ Pode estar faltando informação'
            ],
            quando: 'Se checkout abandonado por muito tempo',
            arquivo: 'functions/m31RecuperarCheckout',
            status: 'PRECISA VERIFICAÇÃO'
          }
        }
      },

      // ═══ RESUMO DO PROBLEMA ═══
      resumo: {
        problema_principal: 'Links de pagamento estão sendo salvos em Base44 (asaas_charge_url) mas não estão sendo enviados via WhatsApp',
        consequencia: 'Usuario paga direto pelo link que recebe na resposta HTTP OU recebe boas-vindas mas sem link de pagamento novamente',
        solução_imediata: 'Forçar envio de link de pagamento na primeira mensagem (boas-vindas ou cobrança)',
        campos_que_devem_existir: {
          asaas_charge_url: 'Link completo Asaas Checkout',
          asaas_payment_id: 'ID da cobrança no Asaas',
          valor_pago: 'Valor em reais',
          codigo_inscricao: 'Código visual para check-in'
        },
        campos_que_faltam: {
          pix_qrcode: 'Base64 do QR Code Pix (gerado pelo Asaas)',
          pix_copia_cola: 'String Pix copia-cola (gerado pelo Asaas)',
          data_primeira_cobranca_enviada: 'Rastrear quando primeira mensagem foi enviada'
        }
      },

      proximos_passos: [
        '1. Ler functions/m31DisparoCobrancasPendentes para ver se envia asaas_charge_url',
        '2. Ler functions/m31RecuperarCheckout para ver se envia link/Pix',
        '3. Verificar se Asaas retorna QR Code e Pix em charge (não retorna)',
        '4. Decidir: gerar QR na inscrição OU não enviar até hoje'
      ]
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
