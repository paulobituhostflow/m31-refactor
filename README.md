# M31 independente — Cloudflare + Supabase

Cópia do M31 separada do repositório conectado ao Base44. Origem: `c342879566d47d7b53ed8387687933e9c850085d`. Git iniciado sem histórico anterior e sem remote. Nenhum serviço foi publicado nem cliente exportado/importado nesta implementação.

React/Vite/Tailwind preservam as telas atuais. O Worker com Hono atende `/api/*`; Supabase fornece PostgreSQL, Auth, Storage e Realtime. Cron/Queues executam jobs com outbox. Integrações externas começam bloqueadas e o desenvolvimento utiliza providers sintéticos.

**Estado da entrega:** validação local concluída com PostgreSQL 17, Supabase Auth, PostgREST, Storage e Realtime reais, além do Worker e Queues locais. A stack isolada usa o SSD externo; o Docker dos outros projetos foi preservado. Integrações externas continuam simuladas. Consulte [o relatório de validação](docs/VALIDATION.md) para a cobertura e as etapas de homologação hospedada.

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

Você pode criar o novo repositório a partir desta pasta. Os ambientes de homologação e produção, seus projetos Supabase, filas, domínios e credenciais precisam ser criados e conferidos separadamente. O repositório original continua conectado ao Base44. A publicação e a migração real não fizeram parte desta execução.
