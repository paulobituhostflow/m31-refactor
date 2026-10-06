# Publicação

A homologação foi provisionada em 05/10/2026 na conta do cliente: [M31 staging](https://m31-staging.paulobituadv.workers.dev), usando o projeto Supabase `hnesgoayhihpuvvtfddm`. As sete migrations e as duas filas de staging foram aplicadas. Produção, dados reais e integrações externas continuam para a etapa posterior. Consulte `REMOTE_VALIDATION.md` para as evidências e limites da validação hospedada.

## Separação de ambientes

Crie dois projetos Supabase distintos (`m31-staging` e `m31-production`) e configure dois ambientes GitHub (`staging` e `production`). Configure aprovação obrigatória no ambiente de produção. Workers, filas, buckets do projeto Supabase, OAuth e credenciais devem ser distintos. O desenvolvimento não aceita URL remota do Supabase.

O arquivo Wrangler define os Workers `m31-staging`/`m31-production`, suas filas e Cron. Static Assets usa fallback SPA e `run_worker_first: ["/api/*"]`, mantendo API fora do fallback HTML. Os deploys não ativam efeitos externos nem workflows.

Depois de criar e revisar cada projeto Supabase, aplique as migrations, escolhendo explicitamente o projeto correto:

```sh
npx supabase login
npx supabase link --project-ref <PROJECT_REF_DO_AMBIENTE>
npx supabase db push --dry-run
npx supabase db push
```

Informe a senha no prompt protegido. Não coloque senha de banco em argumentos, URLs, Git ou logs. Não execute `db reset` em ambiente remoto. As migrations criam buckets `m31-public` e `m31-private`; não reutilize buckets/projetos da operação atual.

Após escolher a conta Cloudflare correta, prepare as quatro filas:

```sh
npx wrangler queues create m31-staging-jobs
npx wrangler queues create m31-staging-dlq
npx wrangler queues create m31-production-jobs
npx wrangler queues create m31-production-dlq
```

## Variáveis obrigatórias

Em cada environment do GitHub, cadastre os secrets:

- `CLOUDFLARE_API_TOKEN`, com permissões mínimas de Worker/Queues, e `CLOUDFLARE_ACCOUNT_ID`.
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_SERVICE_ROLE_KEY` do projeto daquele ambiente.
- `TOKEN_ENCRYPTION_KEY`, aleatória com pelo menos 32 caracteres, própria daquele ambiente. Não rotacione sem migrar/recriptografar os tokens existentes.

O grupo VIP público é configurado pela variable GitHub `WHATSAPP_GROUP_INVITE`, repassada ao build como `VITE_WHATSAPP_GROUP_INVITE`. Sem valor, a landing não mostra o link e o template de agradecimento começa com CTA vazio; nenhum convite da aplicação antiga é usado como fallback. O workflow também envia `WHATSAPP_GROUP_INVITE` ao Worker para os templates de mensagens.

Cadastre `APP_ORIGIN` como variable HTTPS contendo a origem final do ambiente. O workflow injeta as variáveis públicas no build Vite, os quatro secrets obrigatórios e as integrações opcionais preenchidas no Worker. `SUPABASE_AUTH_SMTP_PASSWORD` é exclusivo da configuração administrativa do Auth e não é enviado ao Worker. Chave publishable é pública; service role e chave de criptografia não entram no frontend.

Credenciais opcionais dos providers são secrets do environment GitHub correspondente. O workflow publica somente as que estiverem preenchidas; valores ausentes não apagam bindings remotos. Alternativamente, cadastre diretamente no Worker via prompt protegido:

```sh
npx wrangler secret put ASAAS_API_KEY --env staging
npx wrangler secret put ASAAS_WEBHOOK_TOKEN --env staging
npx wrangler secret put UAZAPI_BASE_URL --env staging
npx wrangler secret put UAZAPI_TOKEN --env staging
npx wrangler secret put UAZAPI_WEBHOOK_TOKEN --env staging
npx wrangler secret put BREVO_API_KEY --env staging
npx wrangler secret put EMAIL_FROM --env staging
npx wrangler secret put EMAIL_FROM_NAME --env staging
npx wrangler secret put TEST_RECIPIENTS --env staging
```

Repita apenas no ambiente necessário. A referência completa está em `.dev.vars.example`. Configure o remetente autenticado do Brevo, `WHATSAPP_GROUP_INVITE`, modelos/chave OpenAI e as opções Google explicitamente. A URL UAZAPI deve apontar para uma instância dedicada. Nunca configure homologação com destinatários, planilhas ou grupos dos clientes.

Em 06/10/2026, o environment `production` recebeu os secrets reais de Asaas, UAZAPI, Brevo, OpenAI, remetente, planilha e senha SMTP, além do convite VIP. A aprovação por `paulobituhostflow` está configurada. Produção ainda exige projeto Supabase, bindings/credenciais Cloudflare e `APP_ORIGIN`; não houve deploy de produção. Consulte `CLIENT_CONFIGURATION.md` para verificações e pendências.

## Auth e identidade

No Supabase, configure Site URL e redirect allowlist para o domínio daquele ambiente, com `/m31-auth-callback`, `/m31-reset-password` e links usados pelos convites. Mantenha signup público desabilitado até decidir como serão criadas contas. Associe UUIDs a identidades legadas e membros por mapa explícito; as ferramentas de migração criam essas associações inativas.

Ative o provider Google no Supabase com client ID/secret próprios. No Google Cloud, o callback de login é `https://<project-ref>.supabase.co/auth/v1/callback`. Isso é independente do OAuth de Drive/Sheets. Configure SMTP autenticado, por exemplo Brevo, para recuperação de senha do Supabase; nenhum e-mail real foi enviado nesta entrega.

## OAuth de Drive/Sheets

Crie credenciais OAuth para a conta dedicada do novo ambiente, habilite Drive/Sheets e configure o redirect `http://127.0.0.1:9876/callback` para a autorização administrativa local. O helper implementa consentimento, state, PKCE e troca por refresh token:

```sh
node tools/google/authorize.mjs
```

Ele exige `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e `EXPORT_ENCRYPTION_KEY` previamente carregados no ambiente protegido. O resultado fica criptografado em `reports/private/google-oauth.json.enc`, sem imprimir tokens. Nenhuma autorização foi solicitada nesta execução. Cadastre o refresh token como `GOOGLE_REFRESH_TOKEN` no Worker usando um processo protegido; configure também `GOOGLE_CAMISAS_SHEET_ID`, `GOOGLE_CARTINHAS_SHEET_NAME` e `GOOGLE_BACKUP_FOLDER_NAME`. A planilha de cartinhas deve permanecer privada, sem acesso público por link. Use consentimento em modo adequado à operação para não depender de um refresh token temporário de testes.

## Webhooks, domínio e jobs

Cadastre no sandbox Asaas `https://<dominio-staging>/api/webhooks/asaas`, com `asaas-access-token` idêntico ao `ASAAS_WEBHOOK_TOKEN`. UAZAPI usa `/api/webhooks/uazapi`, com sufixos opcionais `/{evento}/{tipodemensagem}`. O receptor autentica entregas nativas pelo `token` no corpo, comparado a `UAZAPI_TOKEN`, e remove essa credencial antes da persistência. O header `x-webhook-token`/`UAZAPI_WEBHOOK_TOKEN` fica disponível para relays, sem fallback quando o header informado estiver incorreto. O ID de evento/mensagem é obrigatório. Nenhum webhook de provider externo foi registrado nesta homologação.

Associe domínio e DNS ao Worker do ambiente após confirmar `APP_ORIGIN` e os redirects Auth. O app antigo não deve ser redirecionado nesta fase. Valide inscrições, parcelas, Pix, confirmação, camisas, caravana, cartinhas, arquivos, OAuth e todos os perfis com contas/destinos de teste.

Para liberar providers em homologação, altere explicitamente `EXTERNAL_SIDE_EFFECTS` em Wrangler, mantenha Asaas sandbox e preencha `TEST_RECIPIENTS`. OpenAI live exige chave/modelos e pode gerar custo mesmo com efeitos de mensagens bloqueados.

Para workflows: inicialize o catálogo com uma conta super_admin em `POST /api/admin/workflows/initialize`. Revise o catálogo, habilite `AUTOMATIONS_ENABLED` no ambiente, republique e ative cada workflow por `POST /api/admin/workflows/:id` com `{ "enabled": true }`. Não ative rotinas de reparo/disparo histórico em lote. Filas podem processar jobs já persistidos por webhooks mesmo com workflows recorrentes pausados; configure os webhooks somente após a conferência do ambiente.

## GitHub Actions

`validate.yml` roda lint, tipos, testes, build frontend/Worker e Playwright com fixtures. Não depende de Base44 e não cria infraestrutura. `deploy.yml` roda apenas por `workflow_dispatch`, selecionando staging ou production, verifica o código, valida as variáveis, publica o Worker e executa smoke HTTP. A publicação não aplica migrations nem provisiona filas; essas etapas precisam estar concluídas.

A promoção para produção é outra execução manual sobre o commit aprovado em homologação, sujeita à aprovação do environment GitHub. Configure essa proteção na UI do GitHub; o YAML não cria a política. A validação do commit `6217340` passou na [Action 37358696059](https://github.com/paulobituhostflow/m31-refactor/actions/runs/37358696059). O ambiente GitHub `staging` recebeu os secrets necessários e `APP_ORIGIN`; o deploy hospedado deve ser conferido pela execução manual do workflow. O token Cloudflare de CI tem validade até 03/01/2027 e precisa ser renovado antes de vencer.

Referências: [Static Assets SPA](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/), [RLS e service keys](https://supabase.com/docs/guides/database/postgres/row-level-security), [OAuth Google](https://developers.google.com/identity/protocols/oauth2/web-server), [OpenAI Responses e schemas](https://developers.openai.com/api/docs/guides/migrate-to-responses#6-update-structured-outputs-definitions), [Queues delivery](https://developers.cloudflare.com/queues/reference/delivery-guarantees/).
