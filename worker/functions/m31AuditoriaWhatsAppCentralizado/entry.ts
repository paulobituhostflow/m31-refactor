// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31AuditoriaWhatsAppCentralizado
 * 
 * Auditoria completa de todas as funções que enviam WhatsApp no sistema.
 * Identifica duplicação de código e fornece relatório de refatoração.
 * 
 * ACHADOS:
 * - m31SendWhatsApp: função original (MANTER como fallback)
 * - m31DespacharConfirmacoes: tem enviarWhatsApp() interna (REFATORAR para m31WhatsAppService)
 * - m31EnviarBoasVindas: chama m31SendWhatsApp via invoke() (REFATORAR para direto)
 * - m31RecuperarInscricoesCritico: tem enviarWhatsAppDireto() interna (REFATORAR para m31WhatsAppService)
 * - m31AlertarGestor: chama m31SendWhatsApp via invoke() (REFATORAR para direto)
 * - m31ReguaAutomatica: presumivelmente chama UAZAPI (VERIFICAR)
 * - m31ReguaSegura: presumivelmente chama UAZAPI (VERIFICAR)
 * - m31ReenviarCobranca: presumivelmente chama UAZAPI (VERIFICAR)
 * - m31ReenviarQRCode: presumivelmente chama UAZAPI (VERIFICAR)
 * - m31ReenviarLinkGrupo: presumivelmente chama UAZAPI (VERIFICAR)
 * - m31NotificarInscricaoGrupo: chama m31SendWhatsApp via invoke() (REFATORAR)
 * - m31MensagemRecuperacaoManual: presumivelmente chama UAZAPI (VERIFICAR)
 * 
 * SOLUÇÃO:
 * Todas as funções devem chamar APENAS m31WhatsAppService.
 * 
 */

return (async (req) => {
  const auditoria = {
    timestamp: new Date().toISOString(),
    titulo: 'Auditoria de Duplicação de Código — WhatsApp',
    status_geral: '⚠️ DUPLICAÇÃO ENCONTRADA',
    
    funcoes_identificadas: [
      {
        nome: 'm31SendWhatsApp',
        tipo: 'ORIGINAL',
        status: '✅',
        problemas: 'NENHUM — Função base, pode ser mantida como fallback',
        implementacao: 'Direto à UAZAPI via fetch()',
        acao: 'MANTER como-está',
        linhas_codigo: 'aprox. 50 (incluindo HTTP/1.1 com undici)',
      },
      {
        nome: 'm31DespacharConfirmacoes',
        tipo: 'CONTÉM DUPLICAÇÃO',
        status: '❌',
        problemas: 'Função interna enviarWhatsApp() (linhas 21-82)',
        implementacao: 'Duplica lógica de fetch + undici',
        acao: 'REFATORAR para chamar m31WhatsAppService',
        linhas_codigo: '~60 linhas duplicadas',
      },
      {
        nome: 'm31EnviarBoasVindas',
        tipo: 'USA invoke()',
        status: '⚠️',
        problemas: 'Chama m31SendWhatsApp via invoke() — causa 403',
        implementacao: 'base44.functions.invoke("m31SendWhatsApp", ...)',
        acao: 'REFATORAR para chamar m31WhatsAppService diretamente',
        linhas_codigo: 'aprox. 40 linhas afetadas',
      },
      {
        nome: 'm31RecuperarInscricoesCritico',
        tipo: 'CONTÉM DUPLICAÇÃO',
        status: '❌',
        problemas: 'Função interna enviarWhatsAppDireto() (justa refatorada)',
        implementacao: 'Duplica lógica de UAZAPI fetch',
        acao: 'REFATORAR para chamar m31WhatsAppService',
        linhas_codigo: '~40 linhas duplicadas',
      },
      {
        nome: 'm31AlertarGestor',
        tipo: 'USA invoke()',
        status: '⚠️',
        problemas: 'Chama m31SendWhatsApp via invoke() — linha 181',
        implementacao: 'base44.functions.invoke("m31SendWhatsApp", ...)',
        acao: 'REFATORAR para chamar m31WhatsAppService diretamente',
        linhas_codigo: 'aprox. 5 linhas afetadas',
      },
      {
        nome: 'm31NotificarInscricaoGrupo',
        tipo: 'USA invoke()',
        status: '⚠️',
        problemas: 'Chama m31SendWhatsApp via invoke()',
        implementacao: 'base44.functions.invoke("m31SendWhatsApp", ...)',
        acao: 'REFATORAR para chamar m31WhatsAppService diretamente',
        linhas_codigo: 'aprox. 10 linhas afetadas',
      },
      {
        nome: 'm31ReguaAutomatica',
        tipo: 'A VERIFICAR',
        status: '❓',
        problemas: 'Pode conter envio via invoke() ou direto',
        implementacao: 'DESCONHECIDA',
        acao: 'VERIFICAR e REFATORAR se necessário',
        linhas_codigo: 'DESCONHECIDA',
      },
      {
        nome: 'm31ReguaSegura',
        tipo: 'A VERIFICAR',
        status: '❓',
        problemas: 'Pode conter envio via invoke() ou direto',
        implementacao: 'DESCONHECIDA',
        acao: 'VERIFICAR e REFATORAR se necessário',
        linhas_codigo: 'DESCONHECIDA',
      },
      {
        nome: 'm31ReenviarCobranca',
        tipo: 'A VERIFICAR',
        status: '❓',
        problemas: 'Pode conter envio via invoke() ou direto',
        implementacao: 'DESCONHECIDA',
        acao: 'VERIFICAR e REFATORAR se necessário',
        linhas_codigo: 'DESCONHECIDA',
      },
      {
        nome: 'm31ReenviarQRCode',
        tipo: 'A VERIFICAR',
        status: '❓',
        problemas: 'Pode conter envio via invoke() ou direto',
        implementacao: 'DESCONHECIDA',
        acao: 'VERIFICAR e REFATORAR se necessário',
        linhas_codigo: 'DESCONHECIDA',
      },
      {
        nome: 'm31ReenviarLinkGrupo',
        tipo: 'A VERIFICAR',
        status: '❓',
        problemas: 'Pode conter envio via invoke() ou direto',
        implementacao: 'DESCONHECIDA',
        acao: 'VERIFICAR e REFATORAR se necessário',
        linhas_codigo: 'DESCONHECIDA',
      },
      {
        nome: 'm31MensagemRecuperacaoManual',
        tipo: 'A VERIFICAR',
        status: '❓',
        problemas: 'Pode conter envio via invoke() ou direto',
        implementacao: 'DESCONHECIDA',
        acao: 'VERIFICAR e REFATORAR se necessário',
        linhas_codigo: 'DESCONHECIDA',
      },
    ],

    estatisticas: {
      total_funcoes_analisadas: 12,
      com_duplicacao_confirmada: 2, // m31DespacharConfirmacoes, m31RecuperarInscricoesCritico
      com_invoke_403: 3, // m31EnviarBoasVindas, m31AlertarGestor, m31NotificarInscricaoGrupo
      com_verificacao_pendente: 6, // Regua*, Reenviar*, Mensagem*
      total_linhas_duplicadas_estimadas: 160,
    },

    problema_root_cause: {
      descricao: 'Cada função implementa sua própria lógica de envio de WhatsApp',
      consequencias: [
        '1. Duplicação de código — maintém múltiplas cópias da mesma lógica',
        '2. Inconsistência — mudanças na UAZAPI exigem atualizar múltiplos lugares',
        '3. Bug 403 — uso de invoke() quando deveria ser direto',
        '4. Dificuldade de manutenção — hard cap, undici, sanitização espalhados',
      ],
    },

    solucao_proposta: {
      nome: 'm31WhatsAppService',
      descricao: 'Camada centralizada única para envio de WhatsApp',
      beneficios: [
        '✅ UMA ÚNICA implementação de envio',
        '✅ Mudanças na UAZAPI em UM ÚNICO lugar',
        '✅ Sem duplicação de código',
        '✅ Sem erro 403 de invoke()',
        '✅ Sanitização consistente de telefone',
        '✅ Logging centralizado (opcional)',
      ],
      arquitetura: `
      ┌─────────────────────────────────────┐
      │  Funções do M31                     │
      │  (m31Regua*, m31Reenviar*, etc)     │
      └──────────────┬──────────────────────┘
                     │
                     ▼
      ┌─────────────────────────────────────┐
      │  m31WhatsAppService (ÚNICA)         │
      │  - Sanitização de telefone          │
      │  - HTTP/1.1 via undici              │
      │  - Envio texto e imagem             │
      └──────────────┬──────────────────────┘
                     │
                     ▼
      ┌─────────────────────────────────────┐
      │  UAZAPI                             │
      │  /send/text  /send/media            │
      └─────────────────────────────────────┘
      `,
    },

    plano_refatoracao: {
      fase_1: {
        numero: 1,
        titulo: 'Criar m31WhatsAppService (FEITO)',
        tarefas: [
          '✅ Função centralizada m31WhatsAppService criada',
        ],
      },
      fase_2: {
        numero: 2,
        titulo: 'Refatorar funções com duplicação confirmada',
        tarefas: [
          '- m31DespacharConfirmacoes: remover enviarWhatsApp() interna',
          '- m31RecuperarInscricoesCritico: remover enviarWhatsAppDireto() interna',
          '- Ambas devem invocar m31WhatsAppService',
        ],
        impacto: 'Reduz ~80 linhas de código duplicado',
      },
      fase_3: {
        numero: 3,
        titulo: 'Refatorar funções que usam invoke() para chamar direto',
        tarefas: [
          '- m31EnviarBoasVindas: remover invoke() da m31SendWhatsApp',
          '- m31AlertarGestor: remover invoke() da m31SendWhatsApp',
          '- m31NotificarInscricaoGrupo: remover invoke() da m31SendWhatsApp',
          '- Todas devem invocar m31WhatsAppService',
        ],
        impacto: 'Elimina erro 403 e centraliza lógica',
      },
      fase_4: {
        numero: 4,
        titulo: 'Verificar e refatorar funções pendentes',
        tarefas: [
          '- m31ReguaAutomatica: verificar + refatorar',
          '- m31ReguaSegura: verificar + refatorar',
          '- m31ReenviarCobranca: verificar + refatorar',
          '- m31ReenviarQRCode: verificar + refatorar',
          '- m31ReenviarLinkGrupo: verificar + refatorar',
          '- m31MensagemRecuperacaoManual: verificar + refatorar',
        ],
        impacto: 'Garante 100% de centralização',
      },
      fase_5: {
        numero: 5,
        titulo: 'Testes de integração',
        tarefas: [
          '- Testar cada função refatorada com envio real',
          '- Confirmar que m31WhatsAppService está sendo chamado',
          '- Validar logs de envio em M31MessageLog',
        ],
      },
      fase_6: {
        numero: 6,
        titulo: 'Retomar disparos em massa',
        tarefas: [
          '- Após todas as refatorações, executar m31RecuperarInscricoesCritico',
          '- Monitorar m31WhatsAppService para performance',
        ],
      },
    },

    recomendacoes_futuras: [
      '1. Criar script de validação para detectar chamadas diretas a UAZAPI (anti-pattern)',
      '2. Implementar rate limiting em m31WhatsAppService',
      '3. Adicionar retry automático com backoff exponencial',
      '4. Centralizar log de mensagens em M31MessageLog (usar helper)',
      '5. Documentar padrão no README do projeto',
    ],
  };

  return Response.json(auditoria, { status: 200 });
})(req);
}
