# Configurações e credenciais do M31

O M31 precisa das contas de pagamentos, WhatsApp, e-mail, Google e OpenAI para operar todas as integrações. **Atualização de 08/10/2026:** staging e produção estão provisionados; produção recebeu o Worker, nove migrations e bindings das filas. As credenciais configuradas estão guardadas nos environments do GitHub e no Worker, com aprovação obrigatória para deploy de produção. Webhooks externos não foram registrados, não houve importação de dados para produção e integrações Google/Auth ainda precisam de configuração e validação. Esta lista cobre o frontend, o Worker, Supabase Auth, publicação e ferramentas de migração do projeto M31.

Conferência em 06/10/2026, a partir do commit `25c137d`, incluindo a preparação das integrações e do pipeline. Os nomes dos secrets e bindings foram consultados sem revelar seus valores. As configurações privadas de SMTP e do provider Google no Supabase precisam de confirmação no painel; o `config diff` não oferece evidência suficiente para afirmar sua presença ou ausência.

## Recuperado e validado

O Base44 foi conferido na sessão autenticada do Chrome externo. O app antigo já está conectado a `paulobituhostflow/projeto-m31`. O novo runtime e os secrets desta entrega ficam em `paulobituhostflow/m31-refactor`; não foi alterada a conexão do app antigo.

O arquivo de Downloads forneceu as chaves Asaas, UAZAPI, Brevo, OpenAI e SMTP. Valores do painel Secrets do Base44 são mascarados e os campos de atualização estão vazios; não é possível recuperá-los por essa tela. A URL do servidor UAZAPI, a planilha de camisas, o remetente e o convite VIP foram recuperados do código original.

| Item | Evidência e estado |
| --- | --- |
| Asaas | Consulta `GET /v3/myAccount` com HTTP 200 na conta de produção. API key e token de webhook guardados no GitHub `production`. Não usar essa chave no sandbox de staging |
| UAZAPI | Consulta `GET /instance/status` com HTTP 200 e instância conectada. Base URL e token guardados no GitHub `production`. A URL enviada pelo cliente é o receptor antigo, não a base do servidor UAZAPI |
| OpenAI | Consulta `GET /v1/models` com HTTP 200; modelos `gpt-5.4-mini` e `gpt-transcribe` disponíveis. Chave e seleção de modelos guardadas no GitHub `production`. Nenhuma geração ou transcrição paga foi executada |
| Brevo | Chave guardada no GitHub `production`. Consultas de conta/remetentes retornaram HTTP 401 por IP não reconhecido; não confirmar a chave como inválida nem a autorização do remetente antes de resolver a política de IP |
| SMTP do Auth | Senha SMTP guardada como `SUPABASE_AUTH_SMTP_PASSWORD` no GitHub `production`, fora da lista de bindings do Worker. Faltam usuário SMTP e confirmação das configurações do Supabase Auth |
| Remetente | `EMAIL_FROM` recuperado do código original e `EMAIL_FROM_NAME=M31` guardados em `production`. A autorização do remetente no Brevo ainda precisa de confirmação |
| Planilha e convite | ID da planilha de camisas guardado em `production`; convite VIP recuperado do `VIP_URL` da landing antiga e configurado como variable `WHATSAPP_GROUP_INVITE` de produção |
| Google OAuth | Há um arquivo OAuth Web em Downloads com somente um callback localhost de outra rota. Sua associação ao M31 não foi confirmada, e não contém refresh token. Não foi publicado nem usado para consentimento |

Nenhuma cobrança, mensagem, e-mail, chamada paga de IA ou alteração do webhook da operação antiga foi realizada.

## O que ainda pedir ao cliente

Não pedir novamente as chaves já entregues. Preferir acesso delegado ou compartilhamento protegido para o que falta.

| Serviço | Solicitação que permanece necessária |
| --- | --- |
| Homologação | API key Asaas sandbox; instância UAZAPI, planilhas e destinos dedicados de teste |
| Brevo | Acesso para resolver a restrição de IP da API e confirmar o remetente/domínio; usuário SMTP, host/porta e remetente do Supabase Auth. A senha SMTP já foi recebida |
| Google | Confirmar se o OAuth Web encontrado pertence ao M31; acesso ao projeto correto para ajustar callbacks, habilitar Drive/Sheets e autorizar a conta responsável, gerando um refresh token. Confirmar separadamente o login Google do Supabase |
| Produção | Domínio/subdomínio final e projeto/organização Supabase de produção; acesso delegado ao DNS e à infraestrutura correta |
| Operação | Confirmar grupos/JIDs, contatos de alertas, perfis e operações permitidas da equipe, já preservados na cópia de staging |
| Base44 | Manter o app e o login antigo disponíveis durante a migração da senha no primeiro acesso. Não pedir senhas dos usuários |

Asaas sandbox e produção usam URLs e chaves distintas, conforme a [documentação de autenticação](https://docs.asaas.com/docs/authentication). O SMTP do Supabase precisa de suas próprias configurações, conforme a [documentação do Supabase](https://supabase.com/docs/guides/auth/auth-smtp). No Brevo, a chave SMTP é diferente da API key, conforme a [documentação de SMTP](https://developers.brevo.com/docs/smtp-integration).

## Estado da infraestrutura

| Local | Configurado | Pendente |
| --- | --- | --- |
| GitHub environment `staging` | Secrets `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TOKEN_ENCRYPTION_KEY`; variable `APP_ORIGIN` | Destinos e providers dedicados de teste; o convite real não foi aplicado a staging |
| GitHub environment `production` | Secrets de integrações/SMTP, Cloudflare, Supabase e variable `APP_ORIGIN`; aprovação obrigatória por `paulobituhostflow` | Google OAuth/Drive/Sheets e validações de remetente/Auth; registrar webhooks nos providers |
| Worker `m31-staging` | Supabase/criptografia, URL sandbox Asaas, UAZAPI/Brevo configurados; filas vinculadas | Validar Asaas sandbox e destinos de teste antes de liberar efeitos externos |
| Worker `m31-production` | Publicado em `m31-production.paulobituadv.workers.dev`; secrets configurados; filas vinculadas | Google OAuth/Drive/Sheets; registrar e validar webhooks de Asaas/UAZAPI; validações de operação |
| Cloudflare | Workers `m31-staging` e `m31-production`; filas de jobs/DLQ para ambos | Domínio próprio de produção, se aprovado para o corte |
| Supabase de staging | Projeto `hnesgoayhihpuvvtfddm`, dados migrados, nove migrations | SMTP e login Google ainda precisam de confirmação/configuração |
| Supabase de produção | Projeto `czpimidslxtzodlaiwtg`, nove migrations, buckets/RLS criados | Auth/redirects Google/SMTP e importação de dados continuam pendentes |

O deploy agora envia os quatro secrets obrigatórios e os providers opcionais configurados no environment selecionado. Campos opcionais vazios são omitidos, preservando configurações remotas existentes. O arquivo temporário tem modo 0600, não sobrescreve arquivo existente e é removido ao final. A senha SMTP do Supabase Auth, chaves de exportação e credenciais administrativas ficam fora dos bindings do Worker. Cadastrar secrets no GitHub prepara um futuro deploy; não ativa uma integração nem configura automaticamente o Supabase Auth.

## Inventário de variáveis da aplicação

### Supabase e frontend

| Nome | Onde entra | Origem e necessidade |
| --- | --- | --- |
| `SUPABASE_URL` | GitHub Secret e Worker Secret | URL do projeto do ambiente. Já configurada em staging |
| `SUPABASE_PUBLISHABLE_KEY` | GitHub Secret e Worker Secret | Chave pública do mesmo projeto. Já configurada em staging |
| `SUPABASE_SERVICE_ROLE_KEY` | GitHub Secret e Worker Secret | Chave privilegiada do mesmo projeto, usada somente no servidor/ferramentas. Já configurada em staging |
| `TOKEN_ENCRYPTION_KEY` | GitHub Secret e Worker Secret | Gerada pela equipe, pelo menos 32 caracteres. Já configurada em staging; preservar a chave existente, pois protege tokens armazenados |
| `VITE_SUPABASE_URL` | Build do frontend | Derivada de `SUPABASE_URL` pelo workflow; não pedir outro valor |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Build do frontend | Derivada de `SUPABASE_PUBLISHABLE_KEY`; não pedir outro valor |
| `VITE_WHATSAPP_GROUP_INVITE` | Build do frontend | Derivada da variable GitHub `WHATSAPP_GROUP_INVITE`; configurada somente para produção |
| `WHATSAPP_GROUP_INVITE` | Variable GitHub e configuração/secret do Worker | Convite VIP recuperado do código original e cadastrado na variable GitHub de produção, repassada ao build e ao Worker pelo deploy. O frontend usa o valor no build e o Worker usa nos templates |

### Pagamentos WhatsApp e e-mail

| Nome | Onde entra | Origem e necessidade |
| --- | --- | --- |
| `ASAAS_API_KEY` | Worker Secret | Produção recuperada e guardada no GitHub; falta chave sandbox para staging |
| `ASAAS_BASE_URL` | Wrangler/configuração do Worker | Equipe define `https://api-sandbox.asaas.com/v3` em staging e `https://api.asaas.com/v3` em produção; staging já definido |
| `ASAAS_WEBHOOK_TOKEN` | Worker Secret e cadastro do webhook Asaas | Token antigo preservado no GitHub de produção; cadastrar o mesmo valor no novo receptor no corte final. Não usar a API key como token do webhook |
| `UAZAPI_BASE_URL` | Worker configuração/secret | Recuperada do código e validada por consulta da instância; guardada no GitHub de produção. Nome canônico no novo projeto |
| `UAZAPI_TOKEN` | Worker Secret | Token recebido e guardado no GitHub de produção; instância confirmada como conectada |
| `UAZAPI_WEBHOOK_TOKEN` | Worker Secret e configuração do webhook | Opcional para relays que enviam `x-webhook-token`. Entregas nativas usam o `token` do corpo, comparado a `UAZAPI_TOKEN`; não exigem header personalizado |
| `BREVO_API_KEY` | Worker Secret | Recebida e guardada no GitHub de produção; leitura bloqueada pela política de IP do Brevo |
| `EMAIL_FROM` | Worker configuração/secret | Recuperado do código e guardado no GitHub de produção; autorização no Brevo pendente |
| `EMAIL_FROM_NAME` | Worker configuração/secret | Nome remetente escolhido pelo cliente; opcional, padrão `M31` |
| `TEST_RECIPIENTS` | Worker configuração/secret de staging | Lista separada por vírgulas de e-mails, telefones e IDs de grupos autorizados para teste; necessária para mutações WhatsApp/Brevo em staging |

`UAZAPI_BASE` é um nome legado lido por funções portadas e resolvido a partir de `UAZAPI_BASE_URL`. Cadastrar o nome canônico. `UAZAPI_INSTANCE_TOKEN` aparece somente em uma lista de mocks; não é uma credencial adicional exigida pelo runtime.

### Google e OpenAI

| Nome | Onde entra | Origem e necessidade |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | Worker configuração/secret e helper OAuth | OAuth Web do Drive/Sheets, fornecido/criado na conta Google Cloud do cliente; pendente |
| `GOOGLE_CLIENT_SECRET` | Worker Secret e helper OAuth | Secret do mesmo OAuth client; pendente |
| `GOOGLE_REFRESH_TOKEN` | Worker Secret | Obtido pela equipe após consentimento da conta responsável; não pedir a senha Google ou um access token temporário; pendente |
| `GOOGLE_CAMISAS_SHEET_ID` | Worker configuração/secret | Recuperado do código e guardado no GitHub de produção; autorização OAuth pendente. A conta autorizada deve poder editar a planilha |
| `GOOGLE_CARTINHAS_SHEET_NAME` | Worker configuração/secret | Opcional; padrão `M31 independente <APP_ENV> — Espelho Privado Cartinhas`. A planilha permanece privada |
| `GOOGLE_BACKUP_FOLDER_NAME` | Worker configuração/secret | Opcional; padrão `M31 independente <APP_ENV> — Backup` |
| `OPENAI_API_KEY` | Worker Secret | Recebida e guardada no GitHub de produção; consulta de modelos aceita |
| `OPENAI_TEXT_MODEL` | Worker configuração/secret | `gpt-5.4-mini` configurado no GitHub de produção; sem padrão no código |
| `OPENAI_TRANSCRIPTION_MODEL` | Worker configuração/secret | `gpt-transcribe` configurado no GitHub de produção; sem padrão no código |

O helper `tools/google/authorize.mjs` usa o callback `http://127.0.0.1:9876/callback`, consentimento offline e os escopos `https://www.googleapis.com/auth/drive.file` e `https://www.googleapis.com/auth/spreadsheets`. O cliente deve autorizar a conta correta e o acesso aos arquivos necessários. O escopo Drive limita o acesso aos arquivos permitidos para o app. A configuração da tela de consentimento deve atender à operação contínua, conforme o [fluxo OAuth do Google](https://developers.google.com/identity/protocols/oauth2/web-server).

### Publicação e controle de execução

| Nome | Onde entra | Origem e necessidade |
| --- | --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Secret | Conta de publicação; já configurado em staging |
| `CLOUDFLARE_API_TOKEN` | GitHub Secret | Token de publicação gerado com acesso à conta/Worker/filas; já configurado em staging. A documentação de provisionamento registra validade até 03/01/2027; renovar antes do vencimento |
| `APP_ORIGIN` | Variable GitHub, Worker e ferramentas de migração | Origem HTTPS, sem rota. Staging já definido; cliente informa o domínio final de produção |
| `APP_ENV` | Wrangler | Equipe define `local`, `staging` ou `production`; staging já definido |
| `DEPLOY_ENV` | Workflow GitHub | Gerado a partir da escolha de ambiente no deploy; não pedir ao cliente |
| `PROVIDER_MODE` | Wrangler | `mock` somente local/testes; staging usa `live`. Não ativa disparos por si só |
| `EXTERNAL_SIDE_EFFECTS` | Wrangler | Staging está `false`; liberação controlada pela equipe depois da configuração e validação dos destinos |
| `AUTOMATIONS_ENABLED` | Wrangler | Staging está `false`; depende também de habilitar individualmente os workflows revisados |
| `LEGACY_PASSWORD_MIGRATION_ENABLED` | Wrangler | Staging está `true`; habilitar no ambiente de transição e desligar ao concluí-la |
| `LEGACY_BASE44_APP_ID` | Wrangler | ID do app antigo, já identificado/configurado; não precisa pedir novamente |

`ASSETS`, `JOBS` e `JOBS_DLQ` são bindings provisionados pela equipe na Cloudflare; não são valores secretos a pedir ao cliente. `DEV` e variáveis internas de Vite/Node/CI são fornecidos pelas ferramentas. Planos, limites e faturamento dos serviços são configurações das contas, não novas envs.

OpenAI live pode gerar custo mesmo com `EXTERNAL_SIDE_EFFECTS=false`. SMTP do Supabase e validação da senha no Base44 também têm seus próprios fluxos; essa flag controla os providers de mutação do Worker.

## Configurações de login no Supabase

Esses campos pertencem ao painel/API de configuração do Supabase Auth. Não são novas envs do Worker.

| Configuração | Campos ou valores necessários |
| --- | --- |
| SMTP autenticado | `smtp_host`, `smtp_port`, `smtp_user`, `smtp_pass`, `smtp_admin_email`, `smtp_sender_name` |
| Login Google | `external_google_enabled`, `external_google_client_id`, `external_google_secret` |
| Site URL | Origem final correspondente a `APP_ORIGIN` |
| Redirect allowlist | URLs do ambiente para `/m31-auth-callback`, `/m31-reset-password` e links de acesso usados pela aplicação |
| Callback OAuth Google em staging | `https://hnesgoayhihpuvvtfddm.supabase.co/auth/v1/callback` no Google Cloud |
| Callback OAuth Google em produção | `https://<project-ref-producao>.supabase.co/auth/v1/callback`, após definir o projeto |

O login Google e o OAuth Drive/Sheets têm destinos e propósitos diferentes. Credenciais de Drive no Worker não habilitam o botão de login Google no Supabase. A configuração do provider está na [documentação do Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google).

Os perfis de gestão são registros de `EventoM31Membro` e identidades associadas à conta Auth; o nome selecionado na tela não concede privilégios. O cliente deve confirmar quem pode acessar gestão, camisas, inscrições, cartinhas, financeiro e administração. A entrada dedicada é `/gestao`, o login geral é `/m31-login`, o painel operacional é `/m31-admin` e `/admin` exige permissão administrativa.

## Webhooks e configurações no banco

O webhook Asaas é `https://<origem>/api/webhooks/asaas`, com header `asaas-access-token` correspondente a `ASAAS_WEBHOOK_TOKEN`. O webhook UAZAPI é `https://<origem>/api/webhooks/uazapi`, aceitando também `/{evento}` e `/{evento}/{tipodemensagem}`. Entregas nativas autenticam com o campo raiz `token`, comparado em tempo constante a `UAZAPI_TOKEN`; ele é removido antes de gravar o job. Relays podem usar `x-webhook-token` correspondente a `UAZAPI_WEBHOOK_TOKEN`. Um header incorreto não permite fallback para o token do corpo. Eventos inconsistentes com a rota são rejeitados e reentregas são deduplicadas por evento/ID. O payload nativo `message` é adaptado ao handler legado, preservando identificação do grupo/remetente e texto. Não registrar o payload bruto com credenciais. A equipe configura as URLs finais por ambiente; o cliente fornece acesso à configuração dos providers.

Para os grupos, confirmar `chat_id`/JID e `invite_link` em `M31GrupoConfig`, por finalidade: `INSCRICOES_EQUIPE`, `INSCRITAS_OFICIAL`, `VOLUNTARIOS`, `COORDENADORES`, `INTERCESSAO` e `SUPORTE`. O nome de exibição não substitui o ID do grupo. Confirmar também os contatos de alertas operacionais e telefones autorizados em `EventoM31Config`, inclusive `whatsapp_dulce`, `whatsapp_edilandia` e `telefones_autorizados`.

Preços, lotes, eventos, templates, perfis, operações permitidas e destinos de notificações são dados/configurações no banco. Os registros importados precisam ser conferidos para a operação atual; não criar envs fictícias para cada campo.

## Ferramentas de migração e acesso administrativo

| Nome | Uso | Quem fornece |
| --- | --- | --- |
| `BASE44_APP_ID` | Exportador de dados | Já identificado; equipe seleciona o app de origem |
| `BASE44_TOKEN` | Autenticação temporária do exportador | Sessão/token autorizado de leitura para uma nova exportação, se necessária; não é secret permanente do Worker nem requisito para validar a senha antiga |
| `BASE44_FILE_HOSTS` | Lista de hosts permitidos para download no exportador | Equipe ajusta se houver arquivos em outros hosts; padrão `media.base44.com,base44.app` |
| `EXPORT_ENCRYPTION_KEY` | Criptografia dos exports, relatórios privados, links de recuperação e resultado do helper Google | Gerada e mantida pela equipe; preservar a chave dos exports existentes |
| `MIGRATION_TARGET` | Escolha explícita do destino da importação | Equipe define `local`, `staging` ou `production`; produção também exige os parâmetros de corte final do script |
| `SUPABASE_ACCESS_TOKEN` | Login CLI/Management API, quando necessário | Acesso administrativo delegado ou token da conta responsável; não é requisito do runtime. O CLI já está autenticado para a leitura de configuração realizada nesta conferência |
| `SUPABASE_DB_PASSWORD` | Conexão administrativa/migrations quando solicitada pelo CLI | Senha do banco do projeto correspondente, por prompt protegido ou cofre; não é env do Worker exigida pelo código |

A migração de senha no primeiro login valida o usuário no Base44 e grava uma nova representação criptográfica no Supabase. Ela depende de manter o app antigo disponível. Não depende de o cliente fornecer hashes ou uma lista com senhas pessoais.

## Integrações antigas que não são exigidas pelo M31 atual

O repositório antigo contém funções de outros módulos com `STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_INSTANCE_ID_DNA` e `ZAPI_TOKEN_DNA`. Esses serviços não são consumidos pelo runtime M31 migrado. Não pedir essas credenciais para esta entrega. `BASE44_SERVICE_ROLE_KEY` e o antigo `APP_URL` também não são requisitos do novo runtime; a origem é `APP_ORIGIN`.

## Referências do projeto

- [Modelo sem credenciais para integrações](client-integrations.env.example)
- [Publicação e configuração dos ambientes](DEPLOYMENT.md)
- [Variáveis locais do frontend](../.env.example)
- [Variáveis locais do Worker](../.dev.vars.example)
- Runtime de integrações: `worker/runtime/providers.ts`, `worker/runtime/integrations.ts` e `worker/runtime/legacy-password.ts`
- Publicação: `.github/workflows/deploy.yml`, `scripts/ci-secrets.mjs` e `wrangler.jsonc`
- Migração e consentimento Google: `tools/migration/` e `tools/google/authorize.mjs`
