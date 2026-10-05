# Homologação hospedada — 05/10/2026

## Ambiente

- URL: https://m31-staging.paulobituadv.workers.dev
- Cloudflare: conta do cliente `d68b9866ccd1569a81be66d605d6072e`; Worker `m31-staging`.
- Supabase: projeto `m31-staging`, ref `hnesgoayhihpuvvtfddm`, organização M31 - Paulo Bitu, região `us-east-1`.
- Banco: PostgreSQL 17; sete migrations aplicadas por transação via Management API, com os mesmos nomes/versões do repositório no histórico `supabase_migrations.schema_migrations`.
- Catálogo: 69 entidades e 33 workflows registrados, todos pausados. Buckets: `m31-public` e `m31-private`.
- Filas: `m31-staging-jobs` (`495949a59aca48069f81c3321316356b`) e `m31-staging-dlq` (`7937982619fe43d382ec79f0713c5964`). Consumer com três retries e DLQ.
- Primeiro deploy manual por Wrangler: versão `8a257411-b913-4e99-8c5a-c54ee7ee7907`; código de aplicação baseado no commit `6217340c8cd3fdbea2a3bd443f26766d53343099`, configuração de staging atualizada nesta entrega.

## Validação remota executada

- Build frontend com URL/chave pública do novo Supabase; guard de artefatos sem segredo privilegiado ou dependência de Base44.
- Smoke HTTP: `/api/health` 200, banco `ok`, ambiente `staging`, automações falsas; `/api/public-settings` JSON; rota API inexistente 404 JSON, sem fallback HTML.
- Static Assets: `/m31-login` e `/m31` retornam HTML 200; HTTPS propagado após o primeiro deploy.
- Supabase service role consegue consultar o catálogo via PostgREST.
- Login e-mail/senha com usuário sintético `VALIDACAO_DEPLOY_*`: sessão Supabase criada e `/api/auth/me` 200 no Worker.
- Perfil `visualizacao`: listagem autorizada de participantes/membros 200; cartinhas pelo endpoint genérico 403; criação de tarefa 403.
- Conta revogada bloqueada com 403, mesmo mantendo um JWT válido.
- Leitura direta de participantes com chave pública não retorna registros (RLS/permissões).
- RLS nas tabelas de negócio e de operação. A tabela de metadados `m31_entity_catalog` não usa RLS e não tem privilégios concedidos a anon/authenticated; é acessível pelo backend.
- Auth configurado com signup público desabilitado, Site URL de staging e redirects `/m31-auth-callback` e `/m31-reset-password`.

## Publicação pelo GitHub

O environment `staging` no repositório `paulobituhostflow/m31-refactor` recebeu os quatro secrets do Worker, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` e a variable `APP_ORIGIN`. O token dedicado `m31-staging-github-actions` concede Workers Scripts Write, Queues Write e Account Settings Read apenas na conta cliente, com vencimento em **03/01/2027**. Deve ser renovado antes dessa data. Deploys continuam manuais por `workflow_dispatch`; publicação em produção exige ambiente separado.

A primeira execução de deploy pelo GitHub é [37364817850](https://github.com/paulobituhostflow/m31-refactor/actions/runs/37364817850); uma nova execução será feita após a correção da sessão do perfil de leitura. Nenhum segredo é incluído neste relatório.

## Limites e operação

`EXTERNAL_SIDE_EFFECTS=false` e `AUTOMATIONS_ENABLED=false`. Nenhum workflow ativo, webhook externo configurado, mensagem, cobrança, e-mail, planilha ou conteúdo de cliente migrado. Provider mode é `live`, mas credenciais externas não foram fornecidas e efeitos estão bloqueados. Google login/OAuth, SMTP, Asaas sandbox, UAZAPI, Brevo e OpenAI precisam de configuração e validação específicas antes do uso.

A conta de validação, sua identidade, membro, sessão operacional, registros auxiliares e arquivo foram removidos. A conferência final confirmou ausência de membros sintéticos, arquivos e jobs de teste na outbox. Não foi criada uma conta operacional privilegiada para o cliente. O banco de staging começa sem os dados comerciais do Base44. Produção, domínio próprio, migração real e troca de endpoints não foram realizados.

Os testes completos locais, inclusive fluxos financeiros com providers simulados, estão em `VALIDATION.md` e `LOCAL_VALIDATION.md`; esse resultado não equivale à homologação de providers reais.

O repositório original permanece limpo no commit `c342879566d47d7b53ed8387687933e9c850085d`.

## Correção encontrada na navegação

O login do perfil `visualizacao` chegava à identificação operacional, mas a autorização da API bloqueava `m31AbrirSessaoOperacional`, embora o handler legado permitisse esse perfil. A autorização passou a permitir somente essa abertura adicional. O escopo continua vindo exclusivamente de `operacoes_permitidas` do membro, sem ampliação pelo nome informado; alterações de participantes e tarefas continuam bloqueadas. Teste de API com PostgreSQL cobre abertura, preservação do escopo e tentativa de alteração negada.

A inspeção da landing identificou dois convites WhatsApp fixos herdados do produto. Eles foram substituídos por configuração de ambiente; staging fica sem CTA para grupos reais até receber um convite de teste. Os links públicos configurados em dados migrados deverão ser conferidos posteriormente.

## Conferências adicionais concluídas

- 243 testes de regressão passaram após a correção do perfil de leitura, além de tipos e teste de build do Worker.
- Login e-mail/senha na interface, abertura da sessão operacional e listagem de inscritas concluídos; perfil de leitura mantém somente o escopo cadastrado. Logout voltou à tela de login.
- Gestão inspecionada em viewport de celular (390 × 844) e na dimensão normal do navegador.
- Upload/download Storage privado autorizado para a dona, conteúdo conferido e acesso anônimo negado com 401; arquivo removido.
- Realtime hospedado entregou INSERT autorizado em `m31_changes` com identificadores e sem payload de negócio; registro de teste removido.
- Cron hospedado acionou Queues, que executou `m31HealthCheck` e concluiu a outbox com uma tentativa. Nenhum provider foi chamado; job sintético removido.
- O token específico do GitHub foi verificado e usado em um deploy real pelo Wrangler: versão `6e06ec5f-5ad2-4fec-9681-7e46a156a887`, baseada na aplicação do commit `d86e68e`. O workflow remoto permanece em acompanhamento até resultado terminal.
