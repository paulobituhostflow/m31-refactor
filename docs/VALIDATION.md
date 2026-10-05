# Validação da entrega — 05/10/2026

## Resultado e limites

A cópia independente foi implementada e compilada. As verificações abaixo usam código local, dados sintéticos e fixtures. **A stack completa de Supabase não foi validada neste computador:** o download das imagens Docker falhou inicialmente por falta de espaço e, depois, por erro de entrada/saída do armazenamento do containerd. Não foram removidos volumes de outros projetos, reiniciados serviços existentes ou provisionados serviços remotos para contornar essa falha.

Isso impede afirmar que todos os fluxos já estão homologados com Supabase Auth, PostgREST, Storage e Realtime reais. Os testes de SQL/API ajudam a verificar o comportamento, mas não substituem essa etapa. Nenhuma credencial de cliente, exportação real, mensagem, cobrança, publicação ou troca de produção foi utilizada.

## Verificações executadas

| Verificação                 | Resultado                               | Alcance                                                                                          |
| --------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `npm run lint`              | Passou; 0 erros, 127 avisos             | Avisos de variáveis não utilizadas herdadas da interface                                         |
| `npm run typecheck`         | Passou                                  | Runtime Worker, serviços e ferramentas novos; corpos de handlers legados conservam `@ts-nocheck` |
| `npm test`                  | 240 passaram; 0 falhas, 0 ignorados     | Regras de domínio, SQL, API, autorização, providers e migração sintética                         |
| `npm run build`             | Passou                                  | React/Vite; aviso de bundle grande, sem benchmark real de carga                                  |
| `npm run build:worker`      | Passou                                  | Compilação e empacotamento local do Worker; sem publicação                                       |
| `npm run check:artifacts`   | Passou                                  | Dependências/URLs de runtime Base44 ausentes; nenhum padrão de segredo privilegiado no build     |
| `npm run test:e2e`          | 10 passaram; 3 ignorados explicitamente | Navegação com fixtures; os três testes da stack real dependem de `E2E_LIVE=1`                    |
| Migrations SQL              | Sete aplicadas nos testes               | PostgreSQL PGlite; namespaces Auth/Storage preparados pelo harness, sem serviços Supabase reais  |
| Wrangler staging/production | Empacotamento `--dry-run`               | Verificação dos ambientes e bindings; nenhum recurso remoto criado                               |

`npm run verify` executou lint, tipos, os 240 testes, build da interface, build do Worker e conferência dos artefatos, terminando com sucesso. Os testes de navegador passaram em uma execução posterior. O catálogo contém 69 entidades, 203 handlers e 33 workflows; essa contagem representa a implementação inventariada, **não 203 fluxos homologados individualmente**.

## Evidências de comportamento

- SQL real em PGlite: commits atômicos, revisão concorrente, rollback de lotes, relações conhecidas, locks, duplicatas de webhook, leases expirados e RLS por setor/identidade, incluindo revogação e eventos de exclusão.
- API Hono real contra SQL real através de transporte de teste: registro público e cookie de retomada, idempotência, check-in repetido, preservação de QR/pagamento, paginação com 1.006 registros e datas iguais, bloqueio de escrita genérica privilegiada e isolamento de conteúdo pastoral.
- Identidade e arquivos na API: autorização de autora, tentativa de acesso por outro perfil, arquivo privado e vínculo ao registro. Auth e Storage são fixtures HTTP nesse conjunto; não comprovam login/URL assinada do Supabase hospedado.
- Workflows: inicialização dos 33 itens pausados, nomes de steps exportados normalizados, argumentos e funções registrados, frequência/fuso efetivos. Os testes não executaram Cloudflare Queues, Cron ou DLQ remotos.
- Migração: exportação criptografada de 603 registros com interrupção/retomada e datas iguais; checksums, chave incorreta, duplicatas e manifesto inválido. Importação de 207 registros no PostgreSQL de teste, interrupção/reexecução, ausência de jobs, preservação dos fixtures e recusa de sobrescrever destino alterado. Downloads reais Base44 e uploads reais Supabase não foram realizados.
- Interface: oito URLs públicas, navegação mobile e contrato de login compatível com `access_token`, sem requisições aos assets Base44. Não houve comparação visual exaustiva de todas as telas, impressão ou exportações por perfil.
- Providers: contratos, bloqueio de efeitos externos, restrições de sandbox/destinatários, registro de tentativas e resultados incertos verificados com respostas sintéticas. Asaas, UAZAPI, Brevo, Google e OpenAI não foram chamados com credenciais reais.

## Etapa obrigatória antes de publicação

Com Docker saudável e espaço disponível, execute o roteiro do README: iniciar Supabase, aplicar migrations, configurar ambiente local, seed, build e `dev:full`. Rode `E2E_LIVE=1 E2E_BASE_URL=http://127.0.0.1:5173 npm run test:e2e` e confira manualmente os fluxos abaixo. Corrija as diferenças encontradas antes de homologação/produção.

1. Login por senha e Google, callback e recuperação; associação explícita de conta, membro ativo, setores, permissões e revogação.
2. Inscrição, Pix/parcelamento sandbox, webhook repetido, retomada e transferência/substituição sem perder pagamento, QR, autoria ou histórico.
3. Caravanas, Servir e camisas: agrupamento por pedido, quantidade por peça, cobrança contabilizada uma vez e estoque concorrente.
4. Cartinhas: autosave em abas concorrentes, conflito 409, autoria, rascunho/histórico, anexos e áudio; outra conta não acessa conteúdo nem URLs temporárias.
5. Check-in repetido, portal, tarefas/logística, fornecedores, contratos e financeiro; conferência de relatórios, impressão, exportações, responsividade e links públicos.
6. Storage privado, expiração de URLs e Realtime autorizado, inclusive depois de excluir registro ou revogar conta.
7. Integrações em sandbox/destinos de teste, OAuth Google próprio e schemas/transcrição OpenAI; falha entre resposta de provider e commit exige reconciliação.
8. Queues/Cron reais: duplicatas, retries limitados, lease expirado, DLQ e reprocessamento idempotente. Workflows históricos permanecem pausados até revisão individual.
9. Migração com arquivos sintéticos e identidades no Supabase completo; importar novamente sem duplicação, sem automações e sem alterações silenciosas em histórico/financeiro.
10. Ensaio em homologação dos passos de corte e conferência de dados descritos em `MIGRATION.md`; somente depois preparar a migração real.

## Preservação e entrega

Origem: `c342879566d47d7b53ed8387687933e9c850085d`. O checkout original foi conferido limpo, no mesmo commit. A cópia tem Git próprio, sem remote ou histórico da origem, e arquivos de ambiente/exportações/cache/build ignorados. Os documentos de arquitetura, publicação e migração descrevem a configuração futura. Provisionamento, novo GitHub, dados reais e troca da operação permanecem fora desta execução.
