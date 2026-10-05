// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const apiKey = config('ASAAS_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'ASAAS_API_KEY não configurada' }, { status: 500 });
    }

    // Verifica a conta ASAAS
    const contaRes = await fetch('__ASAAS_API__/account', {
      headers: { 'access_token': apiKey }
    });

    if (!contaRes.ok) {
      return Response.json({ 
        error: 'Erro ao conectar ASAAS',
        details: await contaRes.text()
      }, { status: 500 });
    }

    const conta = await contaRes.json();
    
    return Response.json({
      success: true,
      conta: {
        name: conta.name,
        email: conta.email,
        status: conta.status,
      },
      parcelamentos: {
        statusAtual: 'Parcelamentos estão disponíveis por padrão no ASAAS',
        informacoes: [
          'Parcelamento de 2 a 12x disponível para boleto',
          'Parcelamento automático de 2 a 12x para cartão de crédito',
          'Configurar nos dados da transação ao gerar cobrança'
        ]
      },
      proximas_cobracas: {
        instrucoes: 'Para oferecer parcelamento, use "billingType":"CREDIT_CARD" e "installmentCount" ao criar cobrança'
      }
    });
  } catch (error) {
    return Response.json({ 
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
})(req);
}
