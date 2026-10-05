# Arquitetura e contratos

## Escopo e proveniência

Origem Git: `c342879566d47d7b53ed8387687933e9c850085d`. O inventário inclui as rotas M31, módulos compartilhados alcançados por essas rotas, todos os handlers M31 e as dependências entre funções. Páginas de outros produtos, SDK/plugin/editor Base44, arquivos locais de ambiente, exportações de clientes, builds e histórico Git da origem não entraram na cópia. Documentos históricos operacionais da origem também foram retirados; os catálogos de esquema e workflows foram mantidos.

O inventário de origem está em `migration/inventory.json`, sem handlers ausentes. Os paths `base44/functions/...` nesse documento descrevem a origem; a implementação correspondente está em `worker/functions/.../entry.ts`.

## Caminho de uma requisição

O navegador usa o cliente de compatibilidade para autenticar no Supabase e chamar a API na mesma origem. O Worker valida o token com Supabase Auth, procura uma associação ativa em `m31_identities` e carrega o membro legado ativo. O UUID de Auth e o ID comercial legado permanecem distintos. Uma conta criada no Auth não ganha privilégios automaticamente.

`/api/entities/:entity` aplica permissões, recortes de setor/usuário e remove tokens e conteúdo pastoral das respostas. Alterações de participantes, pedidos, estoque, configuração pastoral e financeiro utilizam `/api/domain/:entity` ou os handlers específicos. O SDK de compatibilidade encaminha essas escritas automaticamente. Operações em lote têm limite de 100 itens.

`/api/functions/:name` resolve somente nomes do registro explícito. Os payloads e `{data,status}` utilizados pela interface foram preservados. Erros HTTP expõem código e mensagem seguros; o cliente conserva `error.response.status` e `error.response.data`. Funções internas e filas recebem contexto de execução confiável; o campo `internal` enviado por um navegador não concede autorização.

Os handlers legados foram adaptados para módulos Workers: sem `Deno.serve`, `Deno.env`, `undici` ou imports SDK. A fronteira do runtime e seus serviços são TypeScript estrito; os corpos legados mantêm `@ts-nocheck` para preservar suas regras sem fingir uma conversão integral de tipos. Testes existentes exercitam os corpos portados; testes adicionais exercitam API, PostgreSQL, autorização e migração.

## Persistência e concorrência

Cada entidade tem ID `text`, payload JSONB integral, revisão e colunas derivadas tipadas/indexadas. Campos históricos desconhecidos ficam no payload, sem descarte. Campos de data comerciais permanecem iguais; `created_at`/`updated_at` do envelope registram a persistência no novo banco.

O `UnitOfWork` busca páginas pelo cursor `id`, ordena com desempate por ID e mantém as alterações da execução em memória. O limite de leitura é 100 mil registros por entidade/execução. `m31_commit` aplica um lote atomicamente, verificando revisões, imutabilidade de IDs e relações conhecidas, e grava eventos de Realtime/outbox na mesma transação. Gravações concorrentes retornam 409 em vez de sobrescrever o outro salvamento. Relações de domínio estão declaradas em `m31_relationship_catalog`; o importador verifica referências do snapshot antes de escrever.

Essa camada de compatibilidade ainda carrega as entidades consultadas para reproduzir os filtros legados. Não houve benchmark de carga real: uma futura otimização deve levar filtros/aggregations para SQL sem mudar seus contratos. Paginação por cursor evita deslocamentos causados por inserções antes da página, mas uma exportação realizada durante novas escritas não constitui um snapshot transacional; o bloqueio de escrita na exportação final é obrigatório.

Locks de operações críticas têm lease; operações idempotentes mantêm hash do pedido e resposta no banco. Os tokens comerciais ficam como hash e cópia AES-GCM protegida, necessária para reconstruir links existentes no backend. Nenhum token em claro é devolvido pelo CRUD genérico. A validade e o uso único continuam sob as regras dos handlers legados e revisão transacional.

Chamadas internas, consultas e integrações iniciadas pelos handlers são acompanhadas e aguardadas antes do commit. O Worker não depende de promises soltas para terminar alterações importantes.

## Limite de transação com providers

Uma chamada externa não participa da transação PostgreSQL. O runtime registra a tentativa antes de uma mutação, reutiliza a resposta concluída e recusa reenviar automaticamente um resultado incerto. Falha após cobrar e antes de persistir exige conferência/reconciliação; não há promessa de exactly-once financeiro entre sistemas independentes. Jobs nesses casos terminam como pendência de revisão.

Asaas/UAZAPI/Brevo têm URLs, remetente e credenciais por ambiente. Homologação exige Asaas sandbox e destinatários sintéticos autorizados para WhatsApp/e-mail. Nenhuma URL de grupo, planilha ou app antigo é aplicada como destino padrão. Os assets públicos de marca foram copiados para `public/assets`, com checksums no manifesto. QR Codes mantêm os códigos existentes; o renderer externo de QR utilizado pelas notificações legadas foi preservado, devendo ser conferido na homologação.

Google usa OAuth próprio e refresh token de conta dedicada. A planilha privada de cartinhas e o backup têm nomes distintos por ambiente; a planilha de camisas exige ID configurado. OpenAI utiliza Responses com schema estrito e `store:false`, além de Audio Transcriptions, com chave/modelos explícitos.

## Privacidade, arquivos e atualizações

Todas as tabelas têm RLS. Apenas a identidade do próprio usuário e eventos autorizados, contendo IDs e tipo da mudança, chegam diretamente ao Supabase cliente. Os dados de negócio passam pelo Worker; a service key permanece no backend.

Arquivos públicos são restritos ao branding. Arquivos privados requerem identidade ativa e autorização de dono, financeiro ou registro relacionado; vínculos são gravados junto com a alteração de domínio. Conteúdo de cartinhas, inclusive áudio importado, exige a autora configurada e membro ativo; o perfil admin não substitui essa autorização. URLs assinadas expiram em até dez minutos.

Realtime publica `m31_changes`, com escopo de perfil/setor e sem payload pastoral/financeiro. Entrega pelo serviço Realtime local e RLS por setor foram verificadas; a conexão ao projeto hospedado ainda depende da homologação. Eventos retêm somente metadados mínimos de autorização, permitindo que o recorte continue aplicável após a exclusão do registro.

## Jobs e falhas

Os 33 workflows preservam condições, argumentos, cron/intervalo, fuso e limites efetivos. Todos começam pausados; inicialização não reativa jobs nem importa seu estado antigo de execução. Ative somente os workflows recorrentes necessários. Reparos e disparos históricos exigem revisão individual.

Cron reserva jobs com lease e `SKIP LOCKED`; Queues recebe somente IDs do outbox. Consumidores verificam o lease, usam idempotência, limitam tentativas e registram falhas, com fila de falhas separada. Webhooks Asaas autenticados gravam recibo e job atomicamente; duplicatas não criam novo recibo/job. UAZAPI grava o job deduplicado antes de confirmar recebimento. A recuperação de jobs com lease expirado foi testada em SQL. Cron, entrega e retries foram exercitados no runtime local Wrangler/Miniflare com outbox no Supabase real. O job termina na quarta falha; Queues/DLQ hospedadas precisam de conferência na homologação.

O painel de saúde usa dados de workflows, outbox e tentativas de providers. `unknown` significa que ainda não houve observação suficiente; não é sucesso simulado.
