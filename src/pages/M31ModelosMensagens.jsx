import { ArrowLeft, Download, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';

const CONTEUDO_MD = `# M31 — Catálogo de Modelos de Mensagem (Jornada da Inscrita)

> **Documento editável.** Todos os modelos de mensagem cadastrados na Central de Mensagens (M31MessageTemplate), organizados pela jornada da inscrita.
>
> **Última atualização:** 19/07/2026 · **Total de modelos:** 17

---

## 📌 Legenda de variáveis

| Variável | Significado |
|---|---|
| \`{{nome}}\` | Nome da inscrita |
| \`{{link_pagamento}}\` | URL do checkout Asaas |
| \`{{codigo_inscricao}}\` | Código único de identificação (usado no check-in) |
| \`{{link_grupo}}\` | Link de convite para o grupo oficial do WhatsApp |
| \`{{primeiro_nome}}\` | Primeiro nome da inscrita |
| \`{{link_grupo_whatsapp}}\` | Link do grupo oficial (variável do template unificado) |
| \`{{caravana_nome}}\` | Nome da caravana vinculada |
| \`{{cidade}}\` | Cidade de origem |
| \`{{pagador_nome}}\` | Nome de quem pagou (quando pago por terceiro) |
| \`{{link}}\` | Link seguro (tokenizado) para completar cadastro |
| \`{{pagador}}\` | Nome de quem abençoou a inscrição (gift) |

---

## 🚪 JORNADA 1 — Recuperação de Checkout Abandonado

> **Objetivo:** Reativar leads que preencheram o formulário mas não finalizaram o pagamento no Asaas.
> **Funções:** m31RecuperarCheckout, m31RecuperarPendentes15Dias, m31ReguaAutomatica, m31ReguaSegura

### 1.1 — Primeiro Contato (Follow-up D+1)
- **Por que dispara:** Lead iniciou há ~24h e não pagou. Primeira tentativa.
- **Regra:** current_stage = d0 → após 24h → avança para d1

\`\`\`
Oi {nome}! Vi que você iniciou sua inscrição no M31 mas ainda não concluiu. Sua vaga está reservada por tempo limitado 🙏

Valor: {valor}
Link para finalizar: {link_checkout}

Qualquer dúvida, é só responder aqui!
\`\`\`

### 1.2 — Recuperação 1ª tentativa (Público Geral)
- **Chave:** recuperacao_checkout_1a_geral
- **Por que dispara:** Primeira recuperação oficial. Inscrição parada no checkout.
- **Regra:** status_pagamento = checkout_pendente + recovery_attempts = 0

\`\`\`
Oii *{{nome}}* 😊

Vi que você chegou a preencher o formulário mas sua inscrição ainda não foi finalizada 💛

Precisando de ajuda, pode falar comigo por aqui.

👉 *Pagar:* {{link_pagamento}}
\`\`\`

### 1.3 — Recuperação 1ª tentativa (Caravana)
- **Chave:** recuperacao_checkout_1a_caravana
- **Por que dispara:** Mesma regra da 1ª geral, personalizada para caravana.
- **Regra:** tipo = caravana + checkout_pendente + recovery_attempts = 0

\`\`\`
Oii *{{nome}}* 😊

Vi que você começou sua inscrição da caravana *{{caravana_nome}}* mas ela ainda não foi finalizada 💛

Precisando de ajuda, pode falar comigo.

👉 *Pagar:* {{link_pagamento}}
\`\`\`

### 1.4 — Recuperação 2ª tentativa (Público Geral)
- **Chave:** recuperacao_checkout_2a_geral
- **Por que dispara:** Segunda e última tentativa. Cria urgência.
- **Regra:** 24h após 1ª + ainda checkout_pendente + recovery_attempts = 1

\`\`\`
*{{nome}}*, ainda dá tempo! 🌸

Sua inscrição está esperando. Pague agora:
👉 {{link_pagamento}}

Pode me chamar se tiver dúvida 💛
\`\`\`

### 1.5 — Recuperação 2ª tentativa (Caravana)
- **Chave:** recuperacao_checkout_2a_caravana
- **Por que dispara:** Segunda tentativa para caravana. Reforça vencimento.
- **Regra:** 24h após 1ª de caravana + ainda pendente

\`\`\`
*{{nome}}*, não deixa passar! 🌸

Sua inscrição na caravana *{{caravana_nome}}* está quase vencendo.

👉 {{link_pagamento}}

Qualquer dúvida, é só me chamar 💛
\`\`\`

### 1.6 — Recuperação Checkout Iniciado (15 dias)
- **Chave:** recuperacao_pendente_15dias
- **Por que dispara:** Limpeza de leads antigos (> 15 dias sem pagamento).
- **Regra:** m31RecuperarPendentes15Dias — checkout_pendente + created_date > 15 dias

\`\`\`
Oi, {{nome}}! 💚

Vimos que sua inscrição para o M31 Filhas foi iniciada, mas ainda não consta como finalizada. Precisa de ajuda para finalizar?

Você pode concluir por aqui:
{{link_pagamento}}

_Se já tiver pago, pode desconsiderar esta mensagem._
\`\`\`

### 1.7 — Urgência D+3
- **Nome:** Urgência D+3
- **Por que dispara:** Terceiro dia da régua legada. Apela para escassez.
- **Regra:** current_stage = d1 → após 2 dias → d3

\`\`\`
{nome}, as vagas do M31 estão acabando! Não perca a oportunidade de fazer parte desse momento especial.

Finalize agora ({valor}): {link_checkout}
\`\`\`

### 1.8 — Última Chance D+7
- **Nome:** Última Chance D+7
- **Por que dispara:** Última mensagem da régua legada. Depois o lead é encerrado.
- **Regra:** current_stage = d3 → após 4 dias → d7 → encerrado

\`\`\`
{nome}, última mensagem! Sua inscrição no M31 ainda está aberta, mas as vagas estão se esgotando.

Se não quiser mais receber mensagens, responda SAIR.

Link: {link_checkout}
\`\`\`

---

## 🎉 JORNADA 2 — Confirmação de Pagamento e Boas-vindas

> **Objetivo:** Recepcionar a inscrita após confirmação do pagamento, entregar QR Code e link do grupo.
> **Gatilho:** Webhook Asaas PAYMENT_CONFIRMED → m31DespacharConfirmacoes → m31EnviarBoasVindas
> **Idempotência:** CPF:BOAS_VINDAS:V1

### 2.1 — Boas-vindas — Confirmação padrão
- **Chave:** boas_vindas_confirmacao
- **Por que dispara:** Pagamento confirmado, cadastro completo. Mensagem principal.
- **Regra:** status_pagamento = aprovado + cadastro_pendente = false + sem data_envio_boas_vindas + liberada_para_envio = true

\`\`\`
Olá, {{nome}}!
Sua inscrição para o M31 Filhas foi confirmada. 🌸

🎟 Código da inscrição:
\`{{codigo_inscricao}}\`

📱 Seu QR Code segue abaixo.
Apresente este QR Code no credenciamento do evento.

👥 Grupo oficial:
{{link_grupo}}

📋 *Confira seus dados:*
Nome: {{nome}}
Se algum dado estiver incorreto, responda esta mensagem informando a correção.

Nos vemos no M31!
\`\`\`

### 2.2 — Boas-vindas — Inscrição paga por terceiro
- **Chave:** boas_vindas_confirmacao_pagador
- **Por que dispara:** Pagamento feito por outra pessoa (identificada no Asaas). Reconhece quem abençoou.
- **Regra:** Mesma da 2.1 + pagador_nome preenchido

\`\`\`
Olá, {{nome}}!
Sua inscrição para o M31 Filhas foi confirmada. 🌸

Sua inscrição foi abençoada por *{{pagador_nome}}*.

🎟 Código da inscrição:
\`{{codigo_inscricao}}\`

📱 Seu QR Code segue abaixo.
Apresente este QR Code no credenciamento do evento.

👥 Grupo oficial:
{{link_grupo}}

📋 *Confira seus dados:*
Nome: {{nome}}
Se algum dado estiver incorreto, responda esta mensagem informando a correção.

Nos vemos no M31!
\`\`\`

### 2.3 — Boas-vindas — Reprocessamento (só grupo)
- **Chave:** reprocesso_boas_vindas
- **Por que dispara:** Aprovada mas nunca recebeu boas-vindas (gap histórico). Sem QR Code.
- **Regra:** m31ReprocessarBoasVindasPendentes — aprovado + data_envio_boas_vindas vazio

\`\`\`
Oi, {{nome}}! 💚

Sua inscrição no M31 Filhas está confirmada.

Agora falta só entrar no grupo oficial para receber os avisos importantes do evento:

{{link_grupo}}

*Seu código de inscrição:* \`{{codigo_inscricao}}\`
Guarde-o para o *check-in no dia do evento*.

Te esperamos lá 😊
\`\`\`

---

## 🎁 JORNADA 3 — Presenteada (Gift Ticket)

> **Objetivo:** Onboarding da segunda participante de uma compra gift.
> **Gatilho:** Compradora paga → m31EnviarLinkCadastroConvidada → presenteada completa → m31DespacharConfirmacoes

### 3.1 — Presenteada — Concluir Cadastro
- **Chave:** convidada_completar_cadastro
- **Por que dispara:** Compradora pagou, presenteada precisa completar dados. NÃO é boas-vindas final, NÃO tem QR Code.
- **Regra:** presenteado_por_id preenchido + cadastro_pendente = true + presenteado_link_enviado_em vazio

\`\`\`
Olá, {{nome}}! 🌸

Você foi abençoada por *{{pagador}}* com uma inscrição no *M31 Filhas*!

✅ *Sua inscrição já está paga.* Não há nada a pagar.

Falta só um passo: complete seus dados para garantir sua vaga e receber seu ingresso (QR Code).

👉 {{link}}

Assim que você concluir, enviamos seu QR Code de entrada por aqui. Nos vemos no M31! 💛
\`\`\`

---

## 🎫 JORNADA 4 — Entrega e Reenvio de QR Code

> **Objetivo:** Garantir que toda inscrita aprovada tenha o QR Code de check-in entregue.
> **Funções:** m31EnviarBoasVindas, m31ReenviarQRCode

### 4.1 — QR Code — Legenda da imagem
- **Chave:** qr_code_caption
- **Por que dispara:** Legenda curta junto com a imagem do QR Code, após boas-vindas.
- **Regra:** Após boas_vindas_confirmacao enviada + qrcode_url preenchido

\`\`\`
🎫 Seu QR Code de entrada M31 Filhas
\`\`\`

### 4.2 — Confirmação com QR Code (template unificado)
- **Chave:** confirmacao_com_qr
- **Por que dispara:** Toda confirmação de inscrição (resposta humana no webhook, reenvio manual).
- **Regra:** Obrigatório: código + QR Code + link do grupo. Se qualquer campo estiver vazio, o envio é bloqueado.
- **Funções:** m31ReceberWebhookUazapi (CASO 1 e 2), m31ReenviarQRCode

\`\`\`
Aqui está, {{primeiro_nome}}! 🌸
🎟️ Código da sua inscrição:
{{codigo_inscricao}}

📲 Seu QR Code está na imagem.
Apresente-o no credenciamento do evento.

👇 *Entre no grupo oficial da Imersão M31 Filhas:*
{{link_grupo_whatsapp}}

Por lá, você receberá todas as orientações e informações importantes do evento.

☺️ Nos vemos no M31!
\`\`\`

---

## 💜 JORNADA 5 — Acolhimento no Grupo Oficial

> **Objetivo:** Recepcionar a inscrita ao entrar no grupo oficial do WhatsApp.
> **Gatilho:** Webhook UAZAPI participant_join → m31MarcarMembroGrupo → automação ENTROU_NO_GRUPO
> **Idempotência:** saudacao_grupo_enviada

### 5.1 — Acolhimento na entrada do grupo (completo)
- **Nome:** acolhimento_grupo_entrada
- **Por que dispara:** Inscrita acabou de entrar no grupo. Orientações de conduta.
- **Regra:** entrou_no_grupo = true + saudacao_grupo_enviada = false

\`\`\`
Olá {nome}! 💜

Que alegria ter você aqui no grupo oficial das INSCRITAS M31 FILHAS! 🎉

Este é o nosso espaço de comunhão e comunicação do evento. Aqui você vai receber todos os recados importantes, orientações e novidades.

📌 *Algumas orientações:*
• Fique atenta aos avisos das administradoras
• Evite mensagens fora do assunto do evento
• Trate todas com carinho e respeito 🤍

Estamos em oração por você e mal podemos esperar para viver esse momento juntas! 🙌

Qualquer dúvida, é só chamar. Nos vemos no M31! ✨
\`\`\`

### 5.2 — Acolhimento na entrada do grupo (curto)
- **Nome:** boas_vindas_grupo_entrada
- **Por que dispara:** Versão curta da saudação. (Avaliar consolidação com 5.1.)
- **Regra:** Mesma da 5.1

\`\`\`
Olá {nome}! 👋 Que alegria ter você com a gente no grupo oficial das INSCRITAS M31 FILHAS! 🎉 Este é nosso espaço de comunicação do evento — fique atenta aos recados importantes. Se tiver qualquer dúvida, é só chamar! 💜
\`\`\`

---

## 📊 Resumo de Orquestração

### Funções backend por jornada

| Jornada | Função | Quando roda |
|---|---|---|
| Recuperação | m31RecuperarCheckout | Lead parou no checkout |
| Recuperação | m31RecuperarPendentes15Dias | Limpeza > 15 dias |
| Recuperação | m31ReguaAutomatica / m31ReguaSegura | Régua D1→D3→D7 |
| Boas-vindas | m31DespacharConfirmacoes | Webhook Asaas → 1 inscrição/execução |
| Boas-vindas | m31EnviarBoasVindas | Envio real |
| Boas-vindas | m31ReprocessarBoasVindasPendentes | Gap histórico |
| Gift | m31EnviarLinkCadastroConvidada | Compradora pagou, presenteada pendente |
| Gift | m31ConcluirCadastroConvidada | Presenteada preencheu dados |
| QR Code | m31ReenviarQRCode | Reenvio manual |
| Grupo | m31MarcarMembroGrupo | Webhook UAZAPI entrada em grupo |

### Travas de segurança (TODAS as jornadas)

1. **Idempotência** — Chave CPF:AUTOMACAO:VERSAO impede disparo duplicado
2. **Cooldown** — Cada tipo de automação tem janela de espera por pessoa
3. **Lock de concorrência** — M31AutomacaoLock impede execução paralela
4. **Aprovação manual** — M31FilaMensagem.aprovado_para_envio trava disparos
5. **Fail-closed** — Sem go_live_corte_em configurado, nada dispara automaticamente

---

*Documento gerado a partir dos dados reais da entidade M31MessageTemplate em 19/07/2026.*
`;

export default function M31ModelosMensagens() {
  const baixar = () => {
    const blob = new Blob([CONTEUDO_MD], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'M31_Modelos_Mensagens_Jornadas.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-h1 text-foreground">Modelos de Mensagem — Jornadas</h1>
            <p className="text-sm text-muted-foreground">Catálogo completo dos 17 templates organizados por jornada</p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-body font-medium text-foreground">M31_Modelos_Mensagens_Jornadas.md</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Arquivo Markdown editável com todos os textos, regras de gatilho e variáveis de cada template.
              </p>
            </div>
          </div>

          <button
            onClick={baixar}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-md font-medium text-body hover:opacity-90 transition-opacity"
          >
            <Download className="w-4 h-4" />
            Baixar arquivo .md
          </button>
        </div>

        <div className="bg-accent/50 border border-border rounded-lg p-4">
          <p className="text-sm text-accent-foreground">
            O documento cobre 5 jornadas: <strong>Recuperação de Checkout</strong>, <strong>Boas-vindas</strong>,
            <strong> Gift</strong>, <strong>QR Code</strong> e <strong>Acolhimento no Grupo</strong> —
            com o porquê de cada disparo e a regra de gatilho aplicada.
          </p>
        </div>
      </div>
    </div>
  );
}