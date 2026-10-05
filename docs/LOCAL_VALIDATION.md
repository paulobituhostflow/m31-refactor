# Validação local no SSD — 05/10/2026

## Ambiente utilizado

O Docker compartilhado tinha um erro de I/O no containerd. Para preservar os serviços dos outros projetos, foi criado o perfil separado `m31-validation` do Colima: 2 CPUs, 4 GiB de RAM, disco de dados de 40 GiB e disco de sistema de 12 GiB. Os discos da VM ficam no SSD externo, dentro de uma imagem APFS esparsa. O SSD ExFAT não foi formatado.

- Imagem: `/Volumes/981792018/Desenvolvimento/M31-Validation.sparsebundle`.
- Volume montado: `/Volumes/M31-Validation`.
- Dados da VM: `/Volumes/M31-Validation/colima/_lima`.
- Socket exclusivo: `unix:///Users/victorcorreia/.colima/m31-validation/docker.sock`.
- Projeto Supabase local: `m31-independent`.

PostgreSQL 17, Auth, PostgREST, Storage, Realtime, Kong e servidor local de e-mail foram iniciados. Studio, analytics/logs, Edge Runtime, pooler e transformação de imagens não são necessários para o runtime desta aplicação e foram excluídos desta validação. As sete migrations foram aplicadas no PostgreSQL real. O contexto Docker padrão continuou `colima`; nenhum serviço compartilhado foi reiniciado.

A stack e a VM foram encerradas ao final da validação para liberar memória. Seus volumes e dados sintéticos foram preservados no SSD.

## Retomar este ambiente

Conecte o SSD. Se `/Volumes/M31-Validation` ainda não estiver montado:

```sh
hdiutil attach '/Volumes/981792018/Desenvolvimento/M31-Validation.sparsebundle'
```

Inicie apenas o perfil de validação:

```sh
COLIMA_HOME=/Volumes/M31-Validation/colima \
LIMA_HOME=/Volumes/M31-Validation/colima/_lima \
DOCKER_CONFIG=/Volumes/M31-Validation/docker-config \
colima start m31-validation --activate=false --ssh-config=false
```

A partir da pasta desta cópia, use o socket exclusivo nesta sessão de terminal:

```sh
export DOCKER_HOST=unix:///Users/victorcorreia/.colima/m31-validation/docker.sock
npx --no-install supabase start -x logflare,vector,studio,edge-runtime,imgproxy,postgres-meta,supavisor
npm run local:configure
```

As contas e dados sintéticos são persistidos. `npm run seed` é necessário na primeira inicialização ou depois de um reset; não execute `db:reset` para apenas retomar a validação. As credenciais sintéticas estão em `reports/private/local-credentials.json`, protegido e ignorado pelo Git. Não cole seu conteúdo em logs ou documentos.

Em dois terminais distintos:

```sh
npm run dev:api -- --test-scheduled
```

```sh
npm run dev
```

Interface: `http://127.0.0.1:5173`; API: `http://127.0.0.1:8787`; Supabase: `http://127.0.0.1:54321`.

## Executar os testes

Execute build/verificação antes das baterias da stack. Alterar `dist` durante testes pode recarregar o Worker e interromper requisições em andamento. Para este computador, o navegador da stack real usa um worker de teste, limite de 60 segundos por caso e espera de 15 segundos para elementos; as mesmas verificações de conteúdo e autorização são mantidas.

```sh
npm run verify
npm run test:live
E2E_LIVE=1 E2E_BASE_URL=http://127.0.0.1:5173 npm run test:e2e
```

`test:live` recusa Supabase não local ou providers diferentes de `mock`; lê chaves e senhas diretamente dos arquivos protegidos, sem imprimi-las. Cria e remove seus próprios registros/arquivos sintéticos. O seed permanece disponível. Logs de operação e metadados de auditoria da validação podem permanecer no banco local. Traces Playwright são desabilitados na stack real para evitar capturar credenciais de login.

`/__scheduled` é a rota de teste do middleware de desenvolvimento do Wrangler, habilitada por `--test-scheduled`; precisa passar pelo Worker antes do fallback dos assets. O módulo da aplicação não registra esse endpoint HTTP em produção. A bateria aciona Cron e Queues locais, com outbox no PostgreSQL real, sem habilitar os 33 workflows pausados.

Asaas, WhatsApp, e-mail, Google e OpenAI usam fixtures. Nenhuma mensagem externa ou cobrança real é necessária para esta bateria. A configuração local mantém `EXTERNAL_SIDE_EFFECTS=false` e `AUTOMATIONS_ENABLED=false`.

## Encerrar com segurança

Pare Vite e Wrangler nos respectivos terminais. Em seguida, encerre apenas esta stack, preservando os volumes:

```sh
DOCKER_HOST=unix:///Users/victorcorreia/.colima/m31-validation/docker.sock \
npx --no-install supabase stop

COLIMA_HOME=/Volumes/M31-Validation/colima \
LIMA_HOME=/Volumes/M31-Validation/colima/_lima \
DOCKER_CONFIG=/Volumes/M31-Validation/docker-config \
colima stop m31-validation
```

Depois que a VM parar, desmonte a imagem antes de retirar o SSD:

```sh
hdiutil detach /Volumes/M31-Validation
```

Não use `--no-backup`, limpeza de volumes Docker ou comandos no perfil compartilhado para encerrar esta validação. A imagem é esparsa: seu limite virtual de 64 GiB não significa 64 GiB de espaço físico ocupado.
