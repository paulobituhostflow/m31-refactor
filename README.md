# M31 independente — Cloudflare + Supabase

Cópia do M31 separada do repositório conectado ao Base44. Origem: `c342879566d47d7b53ed8387687933e9c850085d`. Git iniciado sem histórico anterior e publicado no repositório independente [paulobituhostflow/m31-refactor](https://github.com/paulobituhostflow/m31-refactor). A homologação está publicada em [M31 staging](https://m31-staging.paulobituadv.workers.dev/m31). Em 06/10/2026, a cópia de staging recebeu 25.924 registros da origem, nove contas registradas e dois convites pendentes. A gestão entra por [/gestao](https://m31-staging.paulobituadv.workers.dev/gestao); o login geral fica em `/m31-login`. A senha antiga pode ser migrada no primeiro login, mantendo o Base44 ativo durante a transição. Detalhes e limites em [MIGRATION.md](docs/MIGRATION.md).

React/Vite/Tailwind preservam as telas atuais. O Worker com Hono atende `/api/*`; Supabase fornece PostgreSQL, Auth, Storage e Realtime. Cron/Queues executam jobs com outbox. Integrações externas começam bloqueadas e o desenvolvimento utiliza providers sintéticos.

**Estado da entrega:** validação local concluída e homologação hospedada publicada. Auth, API, Storage privado, Realtime e execução Cron/Queues foram conferidos no ambiente do cliente. Validação e deploy pelo GitHub Actions terminaram com sucesso. Providers são simulados localmente; staging usa modo live, com efeitos externos bloqueados e workflows pausados. Consulte [a validação hospedada](docs/REMOTE_VALIDATION.md) e [a bateria local](docs/VALIDATION.md) para a cobertura e os limites.

## Desenvolvimento

Requisitos: Node 24, npm e Docker saudável com espaço para as imagens do Supabase. Estes comandos usam somente a stack local deste projeto:

```sh
npm ci
npm run db:start
npm run db:reset
npm run local:configure
npm run seed
npm run build
npm run dev:full
```

Interface: `http://127.0.0.1:5173`. Worker: `http://127.0.0.1:8787`. Supabase: `http://127.0.0.1:54321`. O seed cria apenas registros `VALIDACAO` e contas sintéticas. As senhas ficam em `reports/private/local-credentials.json`, ignorado pelo Git. `local:configure` grava as chaves locais em arquivos protegidos e preserva a chave de criptografia já existente. Não substitua essa chave depois de gravar tokens.

```sh
npm run verify
npm run test:e2e
npm run test:live
E2E_LIVE=1 E2E_BASE_URL=http://127.0.0.1:5173 npm run test:e2e
```

`test:live` e o último comando exigem Supabase, Worker e seed ativos; o Worker precisa iniciar com `npm run dev:api -- --test-scheduled` para validar Cron/Queues. Rode essas baterias em sequência para evitar contenção de memória com builds. Sem `E2E_LIVE`, Playwright usa fixtures de interface e deixa os testes da stack completa explicitamente pendentes. Não representa validação de Supabase Auth/Storage/Realtime.

## Organização

- `src/`: telas e componentes M31; `src/api/base44Client.js` mantém o nome legado, mas usa somente `/api` e Supabase.
- `worker/functions/`: 203 handlers e seus helpers portados; `worker/runtime/`: autenticação, autorização, transações, integrações, arquivos, filas e saúde.
- `worker/catalog/`: 69 entidades e 33 workflows da origem.
- `supabase/migrations/`: esquema, RLS, índices, revisão de gravação, relações, locks, outbox e arquivos.
- `tools/migration/`: exportador isolado, validação, importação, associação de identidades e preparação de links.
- `.github/workflows/`: validação de PRs e publicação manual, separada por ambiente.

[Arquitetura e contratos](docs/ARCHITECTURE.md) · [Inventário e cobertura](docs/migration/CHECKLIST.md) · [Publicação e configuração](docs/DEPLOYMENT.md) · [Migração e troca futura](docs/MIGRATION.md) · [Validação e pendências](docs/VALIDATION.md) · [Stack local no SSD](docs/LOCAL_VALIDATION.md).

## Próxima etapa

O repositório independente e o ambiente de homologação já existem. Produção exige recursos separados, domínio e credenciais próprios. Ainda faltam acesso operacional do cliente, configuração/homologação dos providers e ensaio de migração antes de qualquer troca. O repositório original continua conectado ao Base44 e não sofreu alterações. [CONTEXTO_PARA_CODEX.md](CONTEXTO_PARA_CODEX.md) orienta a continuidade.
