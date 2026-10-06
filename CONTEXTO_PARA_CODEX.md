# M31: contexto da versão independente para o Codex do cliente

Atualizado em 06/10/2026. Este documento explica a mudança da aplicação Base44 para a cópia independente e orienta a continuidade do trabalho.

## 1. Ponto de partida e estado atual

O M31 existente foi copiado para funcionar com Cloudflare Workers e Supabase. A interface React foi reaproveitada, e os serviços antes fornecidos pelo Base44 foram substituídos por código e infraestrutura próprios.

| Referência | Valor |
| --- | --- |
| Repositório original, conectado ao Base44 | `paulobituhostflow/projeto-m31` |
| Commit original usado como base | `c342879566d47d7b53ed8387687933e9c850085d` |
| Novo repositório independente | [paulobituhostflow/m31-refactor](https://github.com/paulobituhostflow/m31-refactor) |
| Branch de migração | `feature/m31-data-migration`, PR #1 em rascunho |
| Commit da publicação inicial | `e87b2ec819b696abc13b2affd724ff7903b3eb94` |
| Homologação publicada | [M31 staging](https://m31-staging.paulobituadv.workers.dev/m31) · [Login da gestão](https://m31-staging.paulobituadv.workers.dev/gestao) |
| Validação desse commit | [GitHub Actions — sucesso](https://github.com/paulobituhostflow/m31-refactor/actions/runs/37365521748) |
| Deploy desse commit | [GitHub Actions — sucesso](https://github.com/paulobituhostflow/m31-refactor/actions/runs/37365531388) |

O novo Git começou sem o histórico anterior. Para comparar as versões, use o commit original acima e o novo repositório: o ancestral do Git novo não representa o histórico da aplicação Base44.

O código está no GitHub e a homologação está implantada em Cloudflare/Supabase na conta do cliente. A cópia de staging recebeu 25.924 registros, nove contas registradas e dois convites pendentes em 06/10/2026. A transição de senha antiga no primeiro login foi implementada apenas em staging, preservando os perfis; consulte [MIGRATION.md](docs/MIGRATION.md) para estado, requisitos e limites. Nenhum webhook de produção foi trocado e a aplicação Base44 permaneceu intacta. Alterações neste novo repositório não são sincronizadas com o Base44.

O escopo é o M31: inscrições, participantes, pagamentos, caravanas, Servir, camisas, cartinhas, check-in, portal, gestão, acessos, tarefas, logística, fornecedores e financeiro. Páginas de outros produtos ficaram fora; dependências compartilhadas necessárias ao M31 foram preservadas.

## 2. O que mudou de uma versão para a outra

| Camada | Versão original | Versão independente |
| --- | --- | --- |
| Interface | React, Vite, Tailwind e componentes da aplicação | Mesma base de interface, adaptada ao novo cliente/API |
| Hospedagem | Publicação pelo Base44 | Cloudflare Workers Static Assets, com fallback de SPA |
| Backend | Funções Deno e serviços Base44 | Worker com Hono e runtime em TypeScript |
| Dados | Entidades e APIs Base44 | PostgreSQL Supabase, migrations SQL e API própria |
| Login | Auth Base44 | Supabase Auth; senha e Google, com vínculo de identidade legada |
| Arquivos | Storage/conectores Base44 | Supabase Storage e acesso autorizado pelo Worker |
| Atualizações | Subscriptions Base44 | Supabase Realtime, com eventos restritos por usuário/setor |
| Automações | Workflows Base44 | Catálogo próprio, Cron, outbox transacional e Queues |
| Google | Conectores da plataforma | OAuth próprio para Drive/Sheets; login Google separado |
| IA e transcrição | Integrações da plataforma | OpenAI Responses com schema e Audio Transcriptions |
| Publicação e testes | Fluxo vinculado à plataforma | GitHub Actions para validação e deploy manual por ambiente |

Asaas, UAZAPI e Brevo continuam como providers do produto. A mudança está na implementação dos clientes, autorização, configuração por ambiente e controle dos efeitos externos. Suas contas e credenciais precisam ser configuradas posteriormente.

Layouts, navegação, URLs comerciais e regras existentes foram reaproveitados. Isso não representa uma certificação visual de cada tela, impressão e exportação: a homologação completa ainda precisa conferir esses casos.

## 3. Como navegar pelo código novo

| Caminho | Responsabilidade |
| --- | --- |
| `src/pages/` e `src/components/` | Interface e fluxos M31 preservados |
| `src/api/base44Client.js` | Cliente de compatibilidade: Auth Supabase e chamadas para `/api` |
| `src/lib/AuthContext.jsx` | Estado de autenticação da interface |
| `worker/index.ts` | Rotas HTTP, entrada do Worker e integração com eventos locais/filas |
| `worker/registry.ts` | Registro explícito das funções permitidas |
| `worker/functions/<nome>/entry.ts` | Handlers de negócio portados da origem |
| `worker/runtime/` | Auth, permissões, domínio, persistência, providers, arquivos, jobs e saúde |
| `worker/catalog/entities.json` | Catálogo das 69 entidades |
| `worker/catalog/workflows.json` | Catálogo dos 33 workflows e configuração efetiva |
| `supabase/migrations/` | Sete migrations: esquema, RLS, índices, relações, locks, jobs e arquivos |
| `tools/migration/` | Exportação Base44 isolada, validação, importação e identidades |
| `tools/google/authorize.mjs` | Autorização administrativa de Drive/Sheets |
| `tests/` | Regressões, banco, API, migração, stack real local e Playwright |
| `wrangler.jsonc` | Worker, Static Assets, filas, Cron e ambientes |
| `.github/workflows/validate.yml` | Validação de PRs e pushes em `main` |
| `.github/workflows/deploy.yml` | Deploy manual de `staging` ou `production` |
| `docs/migration/inventory.json` | Inventário e dependências da origem |
| `docs/migration/CHECKLIST.md` | Catálogos detalhados de handlers, entidades e workflows |

Há 203 handlers implementados e registrados. Esse número descreve o inventário portado; não significa que cada um foi homologado individualmente com providers reais.

O nome `base44` permanece em alguns imports para preservar os contratos da interface. O cliente interno não usa o serviço Base44: encaminha operações para Supabase e para a API do Worker. Não substitua esse arquivo pelo SDK antigo. A única dependência Base44 intencional fica no pacote isolado do exportador, para a migração futura somente de leitura.

## 4. Contratos e decisões que precisam ser preservados

### API e autenticação

- `/api/functions/:name` mantém nomes e payloads utilizados pelas telas, com registro explícito de funções.
- `/api/entities/:entity` fornece leituras e operações autorizadas; `/api/domain/:entity` trata escritas de domínios sensíveis. O cliente encaminha essas mutações automaticamente.
- Invocações preservam `{ data, status }`; erros conservam `error.response.status` e `error.response.data`.
- `/api/*` passa pelo Worker antes do fallback da SPA. A configuração Vite local encaminha a API para a porta 8787.
- O Worker verifica o token Supabase, a associação ativa em `m31_identities` e o membro legado. Criar uma conta Auth não concede acesso operacional.
- UUID de Auth e ID legado são identidades distintas. Preserve esse vínculo explícito e os perfis, setores e permissões individuais.
- Execuções internas recebem contexto confiável. Um campo `internal` enviado pelo navegador não autoriza um job.

### Dados, concorrência e finanças

Os IDs comerciais permanecem como texto. Cada entidade mantém payload JSONB, revisão e colunas derivadas/indexadas; campos históricos adicionais não são descartados. O backend usa `UnitOfWork` e a função SQL `m31_commit` para aplicar alterações atomicamente, verificar revisões e relações e persistir eventos junto com a gravação.

Conflitos de gravação retornam HTTP 409. Preserve esse comportamento nos autosaves; não transforme conflito em sobrescrita silenciosa. Paginação utiliza cursor por ID e desempate estável. A compatibilidade ainda pode carregar entidades para reproduzir filtros legados: não houve benchmark de carga real e otimizações futuras devem manter os contratos.

Operações críticas usam locks com lease e idempotência. Uma cobrança externa não participa da transação PostgreSQL: se o provider executar e o resultado ficar incerto, o sistema exige revisão/reconciliação em vez de repetir automaticamente a cobrança.

Tokens comerciais possuem hash e cópia criptografada AES-GCM para reconstrução controlada de links pelo backend. Validade e uso único permanecem sujeitos às regras de negócio. Não exponha tokens pelo CRUD nem troque `TOKEN_ENCRYPTION_KEY` sem um processo de recriptografia dos dados existentes.

### Cartinhas, arquivos e Realtime

RLS está habilitada. Dados de negócio passam pelo Worker; a chave privilegiada Supabase fica exclusivamente no backend. Realtime publica metadados/IDs de mudanças autorizadas, sem conteúdo pastoral ou financeiro.

Cartinhas, rascunhos, histórico e áudios exigem a autora autorizada e membro ativo. Ser administrador não substitui essa autorização. Arquivos privados usam vínculos com registros e acesso autorizado; URLs assinadas expiram em até dez minutos. O bucket público é reservado ao branding.

### Workflows e providers

Todos os 33 workflows começam pausados. Horários, condições e argumentos vêm do catálogo efetivo; títulos antigos podem descrever uma frequência diferente. Não ative reparos históricos ou disparos pontuais junto com as rotinas recorrentes.

Cron reserva jobs; Queues transporta IDs do outbox. Consumidores usam deduplicação, leases, tentativas limitadas e fila de falhas. Webhooks são autenticados e persistidos antes de confirmar recebimento. Eventos repetidos não devem duplicar recibos ou jobs.

`AUTOMATIONS_ENABLED=false` pausa o agendamento dos workflows, mas não representa uma pausa universal das filas: jobs já persistidos por webhooks podem ser consumidos. Cadastre webhooks somente depois de conferir o destino.

O ambiente local usa `PROVIDER_MODE=mock`, `EXTERNAL_SIDE_EFFECTS=false` e `AUTOMATIONS_ENABLED=false`. Staging/produção estão configurados para providers live, inicialmente com efeitos externos e automações desabilitados. Credenciais, URLs, remetentes, grupos e planilhas não apontam automaticamente para a operação antiga. OpenAI live pode gerar custo mesmo sem envio de mensagens.

## 5. Ajustes feitos durante a validação desta cópia

As correções de negócio presentes no commit original foram carregadas com a cópia. Não atribua à migração toda correção que já existia no M31. Os ajustes encontrados e realizados na validação da nova infraestrutura foram:

1. **Auth local:** configuração do provider de e-mail para permitir login por senha, mantendo cadastro público bloqueado, confirmado contra Auth real.
2. **Transferência pública:** autorização do token pendente, válido e vinculado à inscrição correta permite a troca de CPF/telefone, preservando pagamento, QR e histórico. Token consumido não permite nova conclusão.
3. **Asaas simulado:** o mock conserva `notificationDisabled`, valor e referência solicitados, permitindo testar checkout/pedidos sem cobrança real.
4. **Cron local:** roteamento de `/__scheduled` para o middleware de teste do Wrangler antes da SPA; não foi criado endpoint equivalente da aplicação em produção.
5. **Dashboard:** card de saúde conectado à API real; providers mock aparecem como `Simulado`, workflows pausados como `Pausadas`, e ausência de observações não aparece como sucesso.
6. **Sessão de leitura:** `visualizacao` pode abrir a sessão operacional, mantendo exclusivamente as operações cadastradas no membro. A API continua negando alterações; teste de regressão cobre esse contrato.
7. **Convites WhatsApp:** dois links fixos herdados foram substituídos por configuração `VITE_WHATSAPP_GROUP_INVITE`. Staging não encaminha visitantes a grupos reais. A variable GitHub `WHATSAPP_GROUP_INVITE` define o convite do frontend; templates do backend precisam da configuração correspondente no Worker.

Detalhes e evidências estão em [docs/VALIDATION.md](docs/VALIDATION.md) e [docs/REMOTE_VALIDATION.md](docs/REMOTE_VALIDATION.md).

## 6. O que foi validado e o que continua pendente

A tabela registra a bateria local de referência, anterior ao deploy:

| Verificação | Resultado |
| --- | --- |
| Regressões, API, banco e migração sintética | 242 testes passaram |
| Worker contra Supabase local real | 15 testes passaram |
| Playwright na validação local completa | 13 testes passaram: 10 com fixtures e 3 com stack real |
| Lint | 0 erros; 127 avisos de código legado |
| Tipos | Runtime Worker e ferramentas passaram |
| Build frontend, Worker e guarda de artefatos | Passaram |
| Migrations | Sete aplicadas em PostgreSQL 17 real e exercitadas em PGlite |
| Configuração staging/produção na etapa local | Empacotamento dry-run |
| GitHub Actions no commit `6217340` | Sucesso em `verify` e Playwright com fixtures |

Foram 270 testes na bateria local completa de referência. Após a correção da sessão de leitura, a regressão passou com 243 testes. A CI final do commit `e87b2ec` passou em verify e Playwright com fixtures; o deploy manual também passou, incluindo smoke remoto. A CI não sobe a stack Supabase real: sem `E2E_LIVE`, os três casos de navegador dependentes dessa stack ficam explicitamente ignorados. Não some a CI como outra homologação de serviços hospedados. Os corpos dos handlers portados ainda mantêm `@ts-nocheck`; o typecheck não certifica tipagem estrita integral do legado.

A stack local real incluiu Auth, PostgREST, Storage e Realtime, com Worker/Queues em Wrangler/Miniflare. Exercitou inscrição, pedido de duas camisas com uma cobrança, caravana/Servir, cartinhas e acesso por outro perfil, transferência, check-in repetido, arquivos privados, Realtime por setor, 1.006 registros com timestamps iguais, webhooks repetidos, retries e migração repetida sem novos jobs.

A homologação hospedada confirmou API/Auth, sessão operacional de leitura na interface, bloqueios de autorização, arquivo privado, Realtime e um job Cron/Queues sem provider externo. Os dados sintéticos foram removidos. Providers externos permaneceram simulados nos testes de negócio. Ainda faltam Google OAuth/SMTP reais, Asaas sandbox, UAZAPI/Brevo com destinos de teste, Google Drive/Sheets, OpenAI, injeção remota de falhas/retries/DLQ e conferência completa por perfil de telas, impressão, exportações, financeiro, fornecedores e logística. Não houve ensaio com dados reais, benchmark de volume ou comparação visual integral da aplicação.

## 7. Executar localmente em outra máquina

Requisitos: Node 24, npm e Docker saudável. A partir da raiz do novo repositório, para criar uma stack local nova:

```sh
npm ci
npm run db:start
npm run db:reset
npm run local:configure
npm run seed
npm run verify
```

`db:reset` é apenas para o banco local de desenvolvimento e apaga os dados desse banco. Não é necessário para retomar uma stack existente e não deve ser adaptado para um destino com clientes.

Em terminais separados, para desenvolvimento e validação de Cron local:

```sh
npm run dev:api -- --test-scheduled
```

```sh
npm run dev
```

Depois que os serviços estiverem ativos, execute as baterias em sequência:

```sh
npm run test:live
E2E_LIVE=1 E2E_BASE_URL=http://127.0.0.1:5173 npm run test:e2e
```

Frontend: `http://127.0.0.1:5173`; API: `http://127.0.0.1:8787`; Supabase: `http://127.0.0.1:54321`. O seed cria dados `VALIDACAO` e credenciais sintéticas em `reports/private/local-credentials.json`, ignorado pelo Git. Não imprima nem versione esse arquivo.

O ambiente usado pelo autor foi isolado no SSD externo e encerrado ao final. [docs/LOCAL_VALIDATION.md](docs/LOCAL_VALIDATION.md) descreve aquela máquina; os caminhos absolutos de Colima/SSD não são requisitos para a máquina do cliente. Builds e testes de navegador devem rodar em sequência para evitar recargas do Worker durante os testes.

## 8. Próxima etapa: homologação, dados e publicação

O código, as ferramentas e staging estão preparados. O ambiente de produção ainda precisa ser provisionado separadamente conforme [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

1. Preservar o Supabase staging existente; criar um projeto separado para produção. Aplicar migrations nesse projeto, conferir buckets/RLS e configurar Auth, redirects, Google e SMTP.
2. Preservar o Worker/filas staging; criar recursos separados para produção. Configurar domínio, `APP_ORIGIN`, secrets e environment GitHub com proteção de produção.
3. Configurar providers por ambiente, mantendo Asaas sandbox e destinos de teste na homologação. Login Google e OAuth Drive/Sheets são configurações distintas.
4. Criar/vincular as contas operacionais de homologação com permissões explícitas e validar os casos pendentes. Novos deploys continuam manuais; push em `main` só valida. As senhas do Base44 não funcionam automaticamente no Supabase.
5. Fazer ensaio de migração em homologação com credenciais de leitura Base44. Validar manifesto, checksums, contagens, relações, arquivos, pagamentos e identidades.
6. Planejar o corte aprovado: bloquear brevemente escritas/webhooks antigos, exportar snapshot final novo, importar e conferir antes de trocar domínio/endpoints.
7. Ativar somente workflows recorrentes revisados, acompanhar filas/falhas e operar com os backups disponíveis.

O deploy manual não cria filas nem aplica migrations. Esses pré-requisitos precisam existir antes da execução da Action.

O exportador está isolado em `tools/migration/` e usa credenciais próprias. O importador tem dry-run, retomada/idempotência e suprime eventos: importar dados não dispara mensagens, cobranças ou jobs. Nunca versione exports, chaves, links de recuperação ou credenciais. A leitura real de todas as entidades e arquivos privados no Base44 ainda precisa ser conferida.

Senhas Base44 não são transportadas. A associação de usuários usa mapa explícito e começa inativa; recuperação/convites e ativação devem ser conferidos por perfil. O importador não recupera conteúdo ausente nem corrige divergências financeiras automaticamente. Após novas escritas no sistema novo, voltar ao antigo exige reconciliação; trocar apenas o DNS não resolve a divergência.

O roteiro detalhado e os comandos estão em [docs/MIGRATION.md](docs/MIGRATION.md).

## 9. Orientação para o próximo Codex

Leia este documento, [README.md](README.md), [ARCHITECTURE.md](docs/ARCHITECTURE.md), [VALIDATION.md](docs/VALIDATION.md), [DEPLOYMENT.md](docs/DEPLOYMENT.md) e [MIGRATION.md](docs/MIGRATION.md) antes de continuar. Use o inventário para localizar dependências de cada mudança.

O relatório local registra a etapa anterior ao provisionamento. O estado atual está na seção 1 e em `docs/REMOTE_VALIDATION.md`: repositório publicado, CI/deploy aprovados, staging hospedado e sem dados reais migrados. Commits posteriores somente de documentação não alteram o commit da aplicação implantada.

Trabalhe no `m31-refactor`, confira a branch e preserve alterações locais. Não altere o repositório original conectado ao Base44, não reintroduza SDK/editor no runtime e não substitua os contratos da interface sem acompanhar seus consumidores. Preserve IDs, pagamentos, QR, autoria, histórico, permissões e isolamento dos ambientes.

Este documento fornece contexto; não constitui autorização para migrar clientes, publicar produção, enviar mensagens, cobrar, trocar webhooks ou ativar automações. Siga o escopo que o cliente solicitar na próxima tarefa e relate separadamente validação local, homologação e produção.

### Mensagem pronta para iniciar a conversa com o Codex

> Estamos continuando o M31 independente no repositório `paulobituhostflow/m31-refactor`. Leia `CONTEXTO_PARA_CODEX.md` e os documentos referenciados antes de alterar código. A versão foi derivada do commit `c342879566d47d7b53ed8387687933e9c850085d` do projeto ligado ao Base44; o commit `e87b2ec` da aplicação passou pela validação e foi implantado em staging pela CI. O frontend e as regras foram preservados, mas o runtime agora usa Cloudflare Workers e Supabase. Staging está publicado, sem dados reais migrados; providers e automações continuam bloqueados. Preserve o original e os contratos existentes. Minha próxima solicitação define quais etapas você deve executar.


## Atualização: infraestrutura de homologação

Em 05/10/2026 foi provisionado [M31 staging](https://m31-staging.paulobituadv.workers.dev) na conta Cloudflare `d68b9866ccd1569a81be66d605d6072e`, com as filas `m31-staging-jobs` e `m31-staging-dlq`. O [Supabase staging](https://supabase.com/dashboard/project/hnesgoayhihpuvvtfddm) está na organização M31 - Paulo Bitu e recebeu as sete migrations, 69 entidades e os buckets público/privado. O environment GitHub `staging` guarda os secrets do ambiente e a variável `APP_ORIGIN`; o token dedicado de Cloudflare vence em 03/01/2027.

O signup público está desabilitado. Não há usuários de clientes migrados, credenciais Google OAuth/SMTP/provider, webhooks externos ou workflows habilitados. A autenticação foi verificada com conta sintética temporária; isso não provisiona acesso operacional para o cliente. Verifique `docs/REMOTE_VALIDATION.md` e o workflow manual antes de publicar novas alterações.

A validação final e o deploy pelo GitHub terminaram com sucesso no commit `e87b2ec`. A versão Worker é `0c553786-2f61-4739-aaf1-ddb755344057`. O cadastro de 33 workflows está pausado; a conferência final encontrou zero usuários Auth, participantes, arquivos e jobs de outbox. A conta sintética usada nos testes foi removida. O setup oficial Cloudflare instalou as 16 skills para Codex e conectou o MCP oficial por OAuth; reabra o Codex para carregar essa conexão na próxima sessão.
