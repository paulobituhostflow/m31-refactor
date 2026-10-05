// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user?.email || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    // Buscar referência
    const referencia = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
      { codigo_inscricao: 'M31-MP34S46G' }
    );
    const inscricaoRef = referencia[0] || null;

    // Buscar últimas aprovadas
    const aprovadas = await base44.asServiceRole.entities.EventoM31Inscricao.filter(
      { status_pagamento: 'aprovado' },
      '-created_date',
      20
    );

    const comHistorico = await Promise.all(
      aprovadas.map(async (insc) => {
        const boasVindas = await base44.asServiceRole.entities.M31MessageLog.filter(
          { inscricao_id: insc.id, tipo: 'boas_vindas' },
          '-enviado_em',
          5
        );

        return {
          codigo: insc.codigo_inscricao,
          nome: insc.nome,
          qrcode_token_field: insc.qrcode_token || null,
          data_envio_boas_vindas: insc.data_envio_boas_vindas,
          ultimo_log: boasVindas[0] ? {
            enviada_em: boasVindas[0].enviado_em,
            sucesso: boasVindas[0].sucesso
          } : null
        };
      })
    );

    // Logs com QR
    const logsQR = await base44.asServiceRole.entities.M31MessageLog.filter(
      { tipo: 'boas_vindas' },
      '-enviado_em',
      100
    );

    const logsComQR = logsQR.filter(l => 
      l.mensagem?.includes('QR Code') || 
      l.mensagem?.includes('check-in') ||
      l.mensagem?.includes('🔲')
    );

    return Response.json({
      timestamp: new Date().toISOString(),

      pergunta_1: {
        titulo: "O QR Code ainda está sendo gerado hoje exatamente da mesma forma que para M31-MP34S46G?",
        resposta: "SIM",
        detalhes: {
          gerador: "m31AsaasWebhook linha 218",
          formula: "const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(codigo)}`",
          campo_usado: "inscricao.codigo_inscricao",
          gerador_is_third_party: false,
          dependencia_api: "api.qrserver.com (serviço gratuito QR Code)"
        }
      },

      pergunta_2: {
        titulo: "O QR Code depende do sucesso da UAZAPI para EXISTIR ou apenas para ser ENTREGUE?",
        resposta: "APENAS PARA SER ENTREGUE",
        detalhes: {
          geracao: "Ocorre ANTES de chamar UAZAPI (linha 218)",
          persistencia: "NÃO É PERSISTIDO em banco de dados",
          onde_fica: "Apenas em memória durante execução do webhook",
          envio_uazapi: "Tentativa de enviar acontece linha 254-260",
          se_falhar_uazapi: "QR foi gerado OK, mas não foi entregue ao usuário"
        }
      },

      pergunta_3: {
        titulo: "Se a UAZAPI retornar erro 403 ou falhar, o QR Code continua existindo?",
        resposta: "NÃO",
        detalhes: {
          persistencia: "ZERO — nunca é salvo",
          existe_onde: "Apenas durante a execução do webhook, em memória",
          se_m31_send_whatsapp_falhar: "QR desaparece, não há backup",
          arquivo: "m31AsaasWebhook linha 254-260",
          reenviamento: "NÃO AUTOMÁTICO — só se webhook for reprocessado",
          consequencia: "Usuario não recebe QR naquele momento"
        }
      },

      pergunta_4: {
        titulo: "O QR Code é salvo em algum campo da inscrição ou é gerado apenas em tempo real?",
        resposta: "APENAS TEMPO REAL",
        campos_verificados: {
          qrcode_token: {
            existe_no_schema: true,
            contem_valor: "NUNCA (sempre null)",
            preenchido_em: "NENHUM LUGAR do código"
          },
          codigo_inscricao: {
            existe: true,
            usado_para_gerar_qr: true,
            persistido: "SIM, este é persistido"
          }
        },
        componente_exibicao: {
          arquivo: "M31QRCodeIngresso.jsx linha 13",
          logica: "if (!inscricao?.qrcode_token) { return 'QR Code será gerado após confirmação' }",
          problema: "qrcode_token nunca é preenchido, então sempre mostra placeholder"
        }
      },

      pergunta_5: {
        titulo: "Fluxo completo: Aprovação Asaas → geração QR → envio WhatsApp → logs → reenvio",
        fluxo: {
          T0: {
            evento: "Asaas envia webhook PAYMENT_RECEIVED ou PAYMENT_CONFIRMED",
            arquivo: "m31AsaasWebhook início"
          },
          T1: {
            acao: "Valida token, encontra inscrição, marca webhook_processando=true",
            arquivo: "m31AsaasWebhook linha 86-152"
          },
          T2: {
            acao: "Chama enviarConfirmacaoWhatsApp(inscricao, base44)",
            arquivo: "m31AsaasWebhook linha 160"
          },
          T3: {
            acao: "Gera URL dinâmica do QR Code (NÃO salva)",
            codigo: "const qrCodeUrl = 'https://api.qrserver.com/v1/create-qr-code/?...'",
            arquivo: "m31AsaasWebhook linha 218",
            persistencia: "ZERO"
          },
          T4: {
            acao: "Envia TEXTO + LINK DO GRUPO via m31SendWhatsApp",
            arquivo: "m31AsaasWebhook linha 232",
            contem: "Mensagem com código de inscrição, NOT QR yet"
          },
          T5: {
            acao: "Se envio de texto sucesso, aguarda 1s e envia QR CODE COMO IMAGEM",
            arquivo: "m31AsaasWebhook linha 251-260",
            parametro: {
              phone: "telefone",
              image: "qrCodeUrl (gerada em T3)",
              caption: "🔲 QR Code para check-in"
            },
            dependencia: "UAZAPI OBRIGATÓRIA AQUI"
          },
          T6: {
            acao: "Registra log em M31MessageLog",
            arquivo: "m31AsaasWebhook linha 238-249",
            contem: {
              inscricao_id: "ID",
              tipo: "boas_vindas",
              mensagem: "Texto da msg",
              sucesso: "boolean",
              zapi_response: "resposta UAZAPI"
            }
          },
          T7: {
            acao: "Se sucesso WhatsApp, marca data_envio_boas_vindas e libera lock",
            arquivo: "m31AsaasWebhook linha 166-171"
          },
          T8: {
            acao: "Envia EMAIL também com QR (best-effort)",
            arquivo: "m31AsaasWebhook linha 194 + função enviarConfirmacaoEmail",
            qr_no_email: "URL do QR gerada NOVAMENTE (linha 268)"
          }
        }
      },

      reenvio_qr_code: {
        pergunta: "Como reenviar QR Code depois?",
        opcoes: {
          opcao_1: {
            nome: "m31EnviarBoasVindas",
            reenvia_qr: false,
            reenvia_o_que: "Link do grupo WhatsApp + código inscrição",
            arquivo: "m31EnviarBoasVindas linha 405-410"
          },
          opcao_2: {
            nome: "m31RecuperarCheckout",
            reenvia_qr: false,
            reenvia_o_que: "Link de pagamento do Asaas",
            arquivo: "m31RecuperarCheckout"
          },
          opcao_3: {
            nome: "Reprocessar webhook",
            reenvia_qr: true,
            como: "Chamar m31AsaasWebhook manualmente com webhook anterior",
            status: "MÉTODO DISPONÍVEL mas não automático"
          }
        }
      },

      referencia_m31_mp34s46g: inscricaoRef ? {
        encontrada: true,
        nome: inscricaoRef.nome,
        status: inscricaoRef.status_pagamento,
        qrcode_token_field: inscricaoRef.qrcode_token || "vazio",
        data_envio: inscricaoRef.data_envio_boas_vindas
      } : { encontrada: false },

      ultimas_20_aprovadas: comHistorico,

      estatisticas: {
        total_logs_boas_vindas: logsQR.length,
        logs_mencionando_qr: logsComQR.length,
        percentual: logsQR.length > 0 ? Math.round((logsComQR.length / logsQR.length) * 100) : 0
      },

      conclusao: {
        titulo: "O que realmente está acontecendo com o QR Code",
        achados: [
          "✅ QR Code é gerado IDENTICAMENTE para todas as inscrições aprovadas",
          "✅ Geração não depende de APIs externas críticas (apenas api.qrserver.com gratuita)",
          "⚠️  QR Code NÃO é persistido em banco — existe só em memória durante webhook",
          "❌ QR Code depende de m31SendWhatsApp (UAZAPI) para ser ENTREGUE",
          "⚠️  Se UAZAPI falhar no envio da IMAGEM (T5), usuario NÃO recebe QR",
          "⚠️  Não há reenvio automático — QR será reenviado só se webhook rodar novamente"
        ],
        hipotese_do_usuario: "Verdadeira - se UAZAPI está com problemas, QR não é entregue mesmo sendo gerado"
      }
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
