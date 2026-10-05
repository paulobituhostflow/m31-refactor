# M31 — Catálogo de Modelos de Mensagem (Jornada da Inscrita)

> **Documento editável.** Este arquivo contém **todos os modelos de mensagem** cadastrados na Central de Mensagens (`M31MessageTemplate`), organizados pela jornada da inscrita — do abandono de checkout ao check-in no evento.
>
> Para cada modelo: **por que dispara**, **regra de gatilho** e o **texto atual** com variáveis `{{destacadas}}`.
>
> **Última atualização:** 19/07/2026 · **Total de modelos:** 17

---

## 📌 Legenda de variáveis

| Variável | Significado |
|---|---|
| `{{nome}}` | Nome da inscrita |
| `{{link_pagamento}}` | URL do checkout Asaas |
| `{{codigo_inscricao}}` | Código único de identificação (usado no check-in) |
| `{{link_grupo}}` | Link de convite para o grupo oficial do WhatsApp |
| `{{caravana_nome}}` | Nome da caravana vinculada |
| `{{cidade}}` | Cidade de origem |
| `{{pagador_nome}}` | Nome de quem pagou (quando pago por terceiro) |
| `{{link}}` | Link seguro (tokenizado) para completar cadastro |
| `{{pagador}}` | Nome de quem abençoou a inscrição (gift) |
| `{valor}` / `{link_checkout}` | Variáveis legadas (chave simples) |

---

## 🚪 JORNADA 1 — Recuperação de Checkout Abandonado

> **Objetivo:** Reativar leads que preencheram o formulário mas não finalizaram o pagamento no Asaas.
>
> **Gatilho principal:** A inscrição fica em `status_pagamento = checkout_pendente` por tempo determinado, com `recovery_attempts` controlado por cooldown.
>
> **Funções orquestradoras:** `m31RecuperarCheckout`, `m31RecuperarPendentes15Dias`, `m31ReguaAutomatica`, `m31ReguaSegura`

---

### 1.1 — Primeiro Contato (Follow-up D+1)

- **Chave:** _(sem chave_unica — modelo legado)_
- **Nome:** `Primeiro Contato`
- **Categoria:** _(sem categoria)_
- **Por que dispara:** Lead iniciou a inscrição há ~24h e ainda não pagou. Primeira tentativa de reengajamento.
- **Regra de gatilho:** `current_stage = d0` → após 24h sem pagamento → avança para `d1`

```
Oi {nome}! Vi que você iniciou sua inscrição no M31 mas ainda não concluiu. Sua vaga está reservada por tempo limitado 🙏

Valor: {valor}
Link para finalizar: {link_checkout}

Qualquer dúvida, é só responder aqui!
```

---

### 1.2 — Recuperação 1ª tentativa (Público Geral)

- **Chave:** `recuperacao_checkout_1a_geral`
- **Essencial:** ✅
- **Por que dispara:** Primeira recuperação oficial do fluxo novo. Inscrição de público geral parada no checkout.
- **Regra de gatilho:** `status_pagamento = checkout_pendente` + `recovery_attempts = 0` + cooldown respeitado

```
Oii *{{nome}}* 😊

Vi que você chegou a preencher o formulário mas sua inscrição ainda não foi finalizada 💛

Precisando de ajuda, pode falar comigo por aqui.

👉 *Pagar:* {{link_pagamento}}
```

---

### 1.3 — Recuperação 1ª tentativa (Caravana)

- **Chave:** `recuperacao_checkout_1a_caravana`
- **Essencial:** ✅
- **Por que dispara:** Mesma regra da 1ª geral, mas personalizada para inscritas via caravana (inclui nome da caravana).
- **Regra de gatilho:** `tipo = caravana` + `status_pagamento = checkout_pendente` + `recovery_attempts = 0`

```
Oii *{{nome}}* 😊

Vi que você começou sua inscrição da caravana *{{caravana_nome}}* mas ela ainda não foi finalizada 💛

Precisando de ajuda, pode falar comigo.

👉 *Pagar:* {{link_pagamento}}
```

---

### 1.4 — Recuperação 2ª tentativa (Público Geral)

- **Chave:** `recuperacao_checkout_2a_geral`
- **Essencial:** ✅
- **Por que dispara:** Segunda e última tentativa de recuperação. Cria urgência ("ainda dá tempo").
- **Regra de gatilho:** 24h após a 1ª tentativa + ainda `checkout_pendente` + `recovery_attempts = 1`

```
*{{nome}}*, ainda dá tempo! 🌸

Sua inscrição está esperando. Pague agora:
👉 {{link_pagamento}}

Pode me chamar se tiver dúvida 💛
```

---

### 1.5 — Recuperação 2ª tentativa (Caravana)

- **Chave:** `recuperacao_checkout_2a_caravana`
- **Essencial:** ✅
- **Por que dispara:** Segunda tentativa para caravana. Reforça que a inscrição "está quase vencendo".
- **Regra de gatilho:** 24h após 1ª tentativa de caravana + ainda pendente

```
*{{nome}}*, não deixa passar! 🌸

Sua inscrição na caravana *{{caravana_nome}}* está quase vencendo.

👉 {{link_pagamento}}

Qualquer dúvida, é só me chamar 💛
```

---

### 1.6 — Recuperação Checkout Iniciado (15 dias)

- **Chave:** `recuperacao_pendente_15dias`
- **Essencial:** ✅
- **Por que dispara:** Limpeza periódica de leads antigos. Busca inscrições com checkout iniciado há mais de 15 dias sem pagamento confirmado.
- **Regra de gatilho:** `m31RecuperarPendentes15Dias` — `status_pagamento = checkout_pendente` + `created_date` > 15 dias

```
Oi, {{nome}}! 💚

Vimos que sua inscrição para o M31 Filhas foi iniciada, mas ainda não consta como finalizada. Precisa de ajuda para finalizar?

Você pode concluir por aqui:
{{link_pagamento}}

_Se já tiver pago, pode desconsiderar esta mensagem._
```

---

### 1.7 — Urgência D+3

- **Chave:** _(sem chave_unica — modelo legado)_
- **Nome:** `Urgência D+3`
- **Por que dispara:** Terceiro dia da régua de follow-up legada. Apela para escassez de vagas.
- **Regra de gatilho:** `current_stage = d1` → após 2 dias sem pagamento → avança para `d3`

```
{nome}, as vagas do M31 estão acabando! Não perca a oportunidade de fazer parte desse momento especial.

Finalize agora ({valor}): {link_checkout}
```

---

### 1.8 — Última Chance D+7

- **Chave:** _(sem chave_unica — modelo legado)_
- **Nome:** `Última Chance D+7`
- **Por que dispara:** Última mensagem da régua legada. Após este estágio, o lead é encerrado.
- **Regra de gatilho:** `current_stage = d3` → após 4 dias sem pagamento → avança para `d7`, última antes de `encerrado`

```
{nome}, última mensagem! Sua inscrição no M31 ainda está aberta, mas as vagas estão se esgotando.

Se não quiser mais receber mensagens, responda SAIR.

Link: {link_checkout}
```

---

## 🎉 JORNADA 2 — Confirmação de Pagamento e Boas-vindas

> **Objetivo:** Recepcionar a inscrita após confirmação do pagamento, entregar o QR Code e o link do grupo oficial.
>
> **Gatilho principal:** Webhook Asaas `PAYMENT_CONFIRMED` ou `PAYMENT_RECEIVED` → `m31DespacharConfirmacoes` → `m31EnviarBoasVindas`.
>
> **Trava de idempotência:** `idempotency_key = CPF:BOAS_VINDAS:V1` — garante que a mesma pessoa nunca receba boas-vindas duas vezes.

---

### 2.1 — Boas-vindas — Confirmação padrão

- **Chave:** `boas_vindas_confirmacao`
- **Essencial:** ✅
- **Por que dispara:** Pagamento confirmado, inscrita com cadastro completo. É a mensagem principal de boas-vindas.
- **Regra de gatilho:** `status_pagamento = aprovado` + `cadastro_pendente = false` + sem `data_envio_boas_vindas` anterior + `liberada_para_envio = true`

```
Olá, {{nome}}!
Sua inscrição para o M31 Filhas foi confirmada. 🌸

🎟 Código da inscrição:
`{{codigo_inscricao}}`

📱 Seu QR Code segue abaixo.
Apresente este QR Code no credenciamento do evento.

👥 Grupo oficial:
{{link_grupo}}

📋 *Confira seus dados:*
Nome: {{nome}}
Se algum dado estiver incorreto, responda esta mensagem informando a correção.

Nos vemos no M31!
```

---

### 2.2 — Boas-vindas — Inscrição paga por terceiro (Pagador)

- **Chave:** `boas_vindas_confirmacao_pagador`
- **Essencial:** ✅
- **Por que dispara:** Variante usada quando o Asaas identifica que o pagamento foi feito por outra pessoa (terceiro/presenteador). Reconhece quem abençoou a inscrição.
- **Regra de gatilho:** Mesma da 2.1 + `pagador_nome` preenchido (consultado via API Asaas)

```
Olá, {{nome}}!
Sua inscrição para o M31 Filhas foi confirmada. 🌸

Sua inscrição foi abençoada por *{{pagador_nome}}*.

🎟 Código da inscrição:
`{{codigo_inscricao}}`

📱 Seu QR Code segue abaixo.
Apresente este QR Code no credenciamento do evento.

👥 Grupo oficial:
{{link_grupo}}

📋 *Confira seus dados:*
Nome: {{nome}}
Se algum dado estiver incorreto, responda esta mensagem informando a correção.

Nos vemos no M31!
```

---

### 2.3 — Boas-vindas — Reprocessamento (só grupo)

- **Chave:** `reprocesso_boas_vindas`
- **Essencial:** ✅
- **Por que dispara:** Inscrição aprovada mas que nunca recebeu boas-vindas (gap histórico). Versão focada apenas em entrar no grupo — sem reenviar QR Code.
- **Regra de gatilho:** `m31ReprocessarBoasVindasPendentes` — `status_pagamento = aprovado` + `data_envio_boas_vindas` vazio

```
Oi, {{nome}}! 💚

Sua inscrição no M31 Filhas está confirmada.

Agora falta só entrar no grupo oficial para receber os avisos importantes do evento:

{{link_grupo}}

*Seu código de inscrição:* `{{codigo_inscricao}}`
Guarde-o para o *check-in no dia do evento*.

Te esperamos lá 😊
```

---

## 🎁 JORNADA 3 — Presenteada (Gift Ticket)

> **Objetivo:** Onboarding específico para a segunda participante de uma compra gift. A presenteada não tem dados completos no momento do pagamento — recebe um link seguro para concluir o cadastro antes de receber o QR Code.
>
> **Gatilho principal:** Compradora paga → `m31EnviarLinkCadastroConvidada` envia link → presenteada completa → `m31DespacharConfirmacoes` dispara boas-vindas + QR.

---

### 3.1 — Presenteada — Concluir Cadastro

- **Chave:** `convidada_completar_cadastro`
- **Essencial:** ✅
- **Por que dispara:** A compradora pagou e a presenteada precisa completar seus dados. **NÃO é a boas-vindas final e NÃO contém QR Code** — o QR só é enviado após o cadastro completo.
- **Regra de gatilho:** `presenteado_por_id` preenchido + `cadastro_pendente = true` + `presenteado_link_enviado_em` vazio

```
Olá, {{nome}}! 🌸

Você foi abençoada por *{{pagador}}* com uma inscrição no *M31 Filhas*!

✅ *Sua inscrição já está paga.* Não há nada a pagar.

Falta só um passo: complete seus dados para garantir sua vaga e receber seu ingresso (QR Code).

👉 {{link}}

Assim que você concluir, enviamos seu QR Code de entrada por aqui. Nos vemos no M31! 💛
```

---

## 🎫 JORNADA 4 — Entrega e Reenvio de QR Code

> **Objetivo:** Garantir que toda inscrita aprovada tenha o QR Code de check-in entregue.
>
> **Gatilho principal:** Após boas-vindas (mensagem separada) ou reenvio manual pelo painel.
>
> **Funções orquestradoras:** `m31EnviarBoasVindas`, `m31ReenviarQRCode`

---

### 4.1 — QR Code — Legenda da imagem

- **Chave:** `qr_code_caption`
- **Essencial:** ✅
- **Por que dispara:** Legenda curta enviada junto com a imagem do QR Code, logo após a mensagem de boas-vindas.
- **Regra de gatilho:** Após `boas_vindas_confirmacao` enviada com sucesso + QR Code gerado (`qrcode_url` preenchido)

```
🎫 Seu QR Code de entrada M31 Filhas
```

---

### 4.2 — QR Code — Reenvio manual

- **Chave:** `qr_code_reenvio`
- **Essencial:** ✅
- **Por que dispara:** Reenvio acionado manualmente pelo painel administrativo (inscrita perdeu/solicitou reenvio).
- **Regra de gatilho:** Ação manual no painel → `m31ReenviarQRCode` com `inscricao_id` obrigatório

```
🔲 QR Code para check-in — *{{codigo_inscricao}}*

Apresente na entrada do evento.
```

---

## 💜 JORNADA 5 — Acolhimento no Grupo Oficial

> **Objetivo:** Recepcionar a inscrita quando ela entra no grupo oficial do WhatsApp (detectado via webhook UAZAPI de entrada em grupo).
>
> **Gatilho principal:** Webhook UAZAPI `participant_join` → `m31MarcarMembroGrupo` → dispara automação `ENTROU_NO_GRUPO`.
>
> **Idempotência:** Campo `saudacao_grupo_enviada` — garante que a saudação seja enviada apenas uma vez por pessoa.

---

### 5.1 — Acolhimento na entrada do grupo (completo)

- **Chave:** _(sem chave_unica — modelo legado)_
- **Nome:** `acolhimento_grupo_entrada`
- **Por que dispara:** Inscrita acabou de entrar no grupo oficial. Mensagem de boas-vindas da comunidade com orientações de conduta.
- **Regra de gatilho:** `entrou_no_grupo = true` + `saudacao_grupo_enviada = false`

```
Olá {nome}! 💜

Que alegria ter você aqui no grupo oficial das INSCRITAS M31 FILHAS! 🎉

Este é o nosso espaço de comunhão e comunicação do evento. Aqui você vai receber todos os recados importantes, orientações e novidades.

📌 *Algumas orientações:*
• Fique atenta aos avisos das administradoras
• Evite mensagens fora do assunto do evento
• Trate todas com carinho e respeito 🤍

Estamos em oração por você e mal podemos esperar para viver esse momento juntas! 🙌

Qualquer dúvida, é só chamar. Nos vemos no M31! ✨
```

---

### 5.2 — Acolhimento na entrada do grupo (curto)

- **Chave:** _(sem chave_unica — modelo legado)_
- **Nome:** `boas_vindas_grupo_entrada`
- **Por que dispara:** Versão curta da saudação de entrada no grupo. (Possivelmente redundante com a 5.1 — avaliar consolidação.)
- **Regra de gatilho:** Mesmo da 5.1 — verificar qual está em uso ativo.

```
Olá {nome}! 👋 Que alegria ter você com a gente no grupo oficial das INSCRITAS M31 FILHAS! 🎉 Este é nosso espaço de comunicação do evento — fique atenta aos recados importantes. Se tiver qualquer dúvida, é só chamar! 💜
```

---

## 📊 Resumo de Orquestração

### Funções backend por jornada

| Jornada | Função (escopo) | Quando roda |
|---|---|---|
| Recuperação | `m31RecuperarCheckout` | Lead parou no checkout |
| Recuperação | `m31RecuperarPendentes15Dias` | Limpeza de leads > 15 dias |
| Recuperação | `m31ReguaAutomatica` / `m31ReguaSegura` | Régua D1→D3→D7 |
| Boas-vindas | `m31DespacharConfirmacoes` | Webhook Asaas → 1 inscrição por execução |
| Boas-vindas | `m31EnviarBoasVindas` | Envio real (chamado pelo despachador) |
| Boas-vindas | `m31ReprocessarBoasVindasPendentes` | Gap histórico |
| Gift | `m31EnviarLinkCadastroConvidada` | Compradora pagou, presenteada pendente |
| Gift | `m31ConcluirCadastroConvidada` | Presenteada preencheu dados |
| QR Code | `m31ReenviarQRCode` | Reenvio manual pelo painel |
| Grupo | `m31MarcarMembroGrupo` | Webhook UAZAPI de entrada em grupo |

### Travas de segurança (aplicadas em TODAS as jornadas)

1. **Idempotência** — Chave `CPF:AUTOMACAO:VERSAO` impede disparo duplicado
2. **Cooldown** — Cada tipo de automação tem janela de espera por pessoa
3. **Lock de concorrência** — `M31AutomacaoLock` impede execução paralela
4. **Aprovação manual** — `M31FilaMensagem.aprovado_para_envio` trava disparos até gestor liberar
5. **Fail-closed** — Sem `go_live_corte_em` configurado, nada dispara automaticamente

---

*Documento gerado a partir dos dados reais da entidade `M31MessageTemplate` em 19/07/2026.*
*Para editar: abra a Central de Mensagens no painel administrativo (M31Admin → Central de Mensagens).*
