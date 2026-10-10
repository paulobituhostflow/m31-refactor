# Homologação hospedada — histórico inicial de 05/10/2026

**Atualização de 06/10/2026:** staging agora contém a cópia de dados e acessos descrita em [MIGRATION.md](MIGRATION.md). A publicação inicial e suas contagens abaixo são históricas.

**Atualização de 08/10/2026:** produção também foi provisionada e publicada; a seção de produção ao final registra o estado mais recente.

## Ambiente

- URL: https://m31-staging.paulobituadv.workers.dev
- Cloudflare: conta do cliente `d68b9866ccd1569a81be66d605d6072e`; Worker `m31-staging`.
- Supabase: projeto `m31-staging`, ref `hnesgoayhihpuvvtfddm`, organização M31 - Paulo Bitu, região `us-east-1`.
- Banco: PostgreSQL 17; sete migrations aplicadas por transação via Management API, com os mesmos nomes/versões do repositório no histórico `supabase_migrations.schema_migrations`.
- Catálogo: 69 entidades e 33 workflows registrados, todos pausados. Buckets: `m31-public` e `m31-private`.
- Filas: `m31-staging-jobs` (`495949a59aca48069f81c3321316356b`) e `m31-staging-dlq` (`7937982619fe43d382ec79f0713c5964`). Consumer com três retries e DLQ.
- Commit final da aplicação implantada: `e87b2ec819b696abc13b2affd724ff7903b3eb94`. Versão Worker publicada pela Action: `0c553786-2f61-4739-aaf1-ddb755344057`.

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

A [validação 37365521748](https://github.com/paulobituhostflow/m31-refactor/actions/runs/37365521748) e o [deploy 37365531388](https://github.com/paulobituhostflow/m31-refactor/actions/runs/37365531388) concluíram com **sucesso** no commit `e87b2ec`. O deploy executou verify, publicou secrets/Worker e confirmou o smoke remoto. A CI de validação executou verify e Playwright com fixtures; os casos E2E_LIVE não são executados pela CI. Nenhum segredo é incluído neste relatório.

## Limites e operação

`EXTERNAL_SIDE_EFFECTS=false` e `AUTOMATIONS_ENABLED=false`. Nenhum workflow ativo, webhook externo configurado, mensagem, cobrança, e-mail, planilha ou conteúdo de cliente migrado. Provider mode é `live`, mas credenciais externas não foram fornecidas e efeitos estão bloqueados. Google login/OAuth, SMTP, Asaas sandbox, UAZAPI, Brevo e OpenAI precisam de configuração e validação específicas antes do uso.

A conta de validação, sua identidade, membro, sessão operacional, registros auxiliares e arquivo foram removidos. A conferência final confirmou 69 entidades, 33 workflows, zero workflows habilitados, zero usuários Auth, participantes, arquivos, objetos Storage e jobs na outbox. Não foi criada uma conta operacional privilegiada para o cliente. O banco de staging começa sem os dados comerciais do Base44. Produção, domínio próprio, migração real e troca de endpoints não foram realizados.

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
- O token dedicado foi verificado e usado pelo deploy real no GitHub Actions. A versão final passou novamente no smoke HTTP após a publicação.
- A landing final foi conferida sem links para grupos WhatsApp herdados.
- Arquivos temporários do token CI, da sessão Supabase e da conta sintética foram removidos; secrets necessários permanecem em armazenamento protegido e no GitHub/Worker.

## Setup oficial Cloudflare para Codex

As instruções de [agent-setup/prompt.md](https://developers.cloudflare.com/agent-setup/prompt.md) foram executadas: 16 skills Cloudflare instaladas para Codex e MCP oficial `https://mcp.cloudflare.com/mcp` autenticado por OAuth com os acessos aprovados pelo usuário. Configuração anterior recebeu backup. Reabra o Codex para carregar o MCP na próxima sessão. O CLI opcional cf não foi instalado; o projeto continua usando Wrangler fixado no lockfile.


## Transição de logins e gestão — 06/10/2026

- Dados: 25.924 registros; 11 contas Auth (nove registradas e dois convites pendentes), nove identidades (oito ativas e uma inativa) e 11 membros. Nenhum hash antigo foi exportado. Convites não foram confirmados nem receberam perfil operacional.
- SQL: migration `20261006000200` aplicada somente ao projeto staging e registrada no histórico. Nove controles de transição preparados; oito contas elegíveis ativas. RPCs/tabela privadas recusam anon/authenticated.
- Teste remoto com credenciais sintéticas em memória: candidato elegível, conta inativa bloqueada, duas gravações simultâneas com exatamente um sucesso, bcrypt real, login com a mesma senha no Supabase, senha concorrente recusada, segundo commit bloqueado, perfil de gestão intacto. Conta/membro/identidade temporários removidos; controles voltaram a nove, outbox/provider_attempts/changes a zero e operations a quatro.
- Worker: senha antiga validada exclusivamente no endpoint do app original; destino revalidado por transação, limites por IP/e-mail, resposta e request limitados, timeout, sem redirects, senha/token ausentes nos logs e sem importação de privilégios do provider.
- Gestão: `/gestao` exige perfil autorizado. O escopo padrão do perfil resolve a lista importada vazia; nomes na conta compartilhada apenas restringem operações. Escopos explícitos e perfis de leitura continuam protegidos. Cookie de sessão em POST não consome mais o corpo antes do handler.
- Limite: resposta correta do Base44 coberta com fixtures; endpoint real confirmado com uma conta sintética inexistente. A própria pessoa deve realizar o primeiro login real com sua senha antiga. Base44 precisa permanecer ativo durante a transição.

Verificação local desta alteração: `npm run verify` passou (259 testes, lint com zero erros/131 avisos, tipos, builds e varredura de segredos). Playwright passou em 14 casos com fixtures; três casos da stack local ficaram ignorados nessa bateria. O teste remoto de senha descrito acima usou Supabase real, separadamente.

## Produção — 08/10/2026

- Worker: [m31-production](https://m31-production.paulobituadv.workers.dev), publicado no commit `786d71e19dff43299873a373fc8095a24d2c9741`, no PR #1 ainda aberto.
- Supabase: projeto `m31-production`, ref `czpimidslxtzodlaiwtg`, PostgreSQL 17. A conferência no SQL Editor confirmou as nove versões `20261005000100` a `20261005000700`, `20261006000100` e `20261006000200` em `supabase_migrations.schema_migrations`.
- Cloudflare Queues: `m31-production-jobs` (`1c0a483575cc4f1a8e993efebdcaad92`) está ligado a producer e consumer; `m31-production-dlq` (`c451d966fe174943a00a64e79161fb4d`) está ligado como producer/DLQ.
- A Action [37790353860](https://github.com/paulobituhostflow/m31-refactor/actions/runs/37790353860) passou por `npm run verify`, dry-run/aplicação das migrations, upload de secrets, deploy e smoke HTTP.
- O smoke final confirmou `/api/health` 200 com banco saudável, `/api/public-settings` 200 JSON e `/api/unknown-smoke` 404 JSON. O primeiro deploy (37789809307) encontrou o endpoint ainda propagando logo após a publicação; o smoke agora repete as consultas antes de falhar.
- Staging também foi conferido: contém as mesmas nove migrations e suas filas de jobs/DLQ seguem vinculadas. Nenhuma ação de migration foi necessária nesse ambiente.
- Produção ainda não recebeu dados reais do Base44, não tem webhooks Asaas/UAZAPI registrados e mantém `EXTERNAL_SIDE_EFFECTS=false` e `AUTOMATIONS_ENABLED=false`. Não houve cobrança, envio externo ou corte do domínio Base44. Google OAuth/Drive/Sheets e configuração/validação de Auth/SMTP permanecem pendentes.
