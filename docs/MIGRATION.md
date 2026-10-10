# Migração futura e roteiro de troca

O roteiro abaixo separa a cópia em staging da troca final de produção. Use credenciais próprias para a exportação Base44; o runtime da nova aplicação não contém SDK Base44.

## Cópia de staging em 06/10/2026

Foram copiados e comparados integralmente 25.924 registros de 65 tabelas existentes na origem, incluindo 1.350 inscrições e 99 pedidos de camisa. As outras quatro entidades do catálogo retornaram HTTP 404 na origem e permaneceram vazias no destino. A captura ocorreu entre 13:00:35 e 13:01:53 UTC, sem bloqueio de escrita no Base44; portanto, é uma cópia de homologação, não um corte final.

A conferência por ID e hash canônico de todos os campos passou para as 69 tabelas de destino. As 33 automações permaneceram desativadas; outbox, eventos Realtime e tentativas de providers não aumentaram. A origem não recebeu gravações da migração. O backup e os relatórios ficam protegidos em `exports/m31-staging-20261006/`, fora do Git.

Foram preservadas 145 referências a inscrições ausentes na própria origem e as duplicatas históricas de duas chaves de pedido e 55 chaves de evento de webhook. Essas pendências não foram corrigidas nem apagadas durante a cópia. As nove contas de origem foram criadas no Supabase Auth, com os IDs legados preservados em `m31_identities`: oito associações estão ativas e uma permanece inativa por não ter membro operacional. Os quatro administradores legados conservaram o acesso: um perfil `admin` foi normalizado para `super_admin` e três membros administrativos foram criados com proveniência da conta original. Os cinco vínculos por e-mail exato conservaram suas permissões. Três membros sem conta correspondente permaneceram sem associação; nenhum endereço foi corrigido por suposição. Nenhum hash de senha foi disponibilizado pela API, CSV de usuários ou entidades. Não houve envio de e-mails. A transição de senha no primeiro login foi implementada posteriormente, conforme descrito abaixo. Links individuais para definição de senha foram preparados e guardados criptografados. A troca de produção continua pendente.

## Preparação e exportação

O exportador é isolado em `tools/migration`, com dependência própria, usada somente para leitura. Prepare-o antes da execução futura:

```sh
npm ci --prefix tools/migration
npm run migration:export -- exports/m31 --read-only
npm run migration:validate -- exports/m31
```

Carregue `BASE44_APP_ID`, `BASE44_TOKEN` e `EXPORT_ENCRYPTION_KEY` em um ambiente protegido. A chave deve ter pelo menos 32 caracteres. O SDK usa o acesso concedido à conta: é necessário confirmar posteriormente que ela consegue ler todas as 69 entidades e os arquivos privados. A ferramenta não usa escrita de entidades nem funções do produto; para arquivos privados, solicita somente URL temporária de leitura.

A paginação real usa cursor por ID. O manifesto registra páginas, cursor, contagens e SHA-256; chunks JSONL e arquivos são criptografados com AES-GCM. A reexecução retoma páginas verificadas. IDs repetidos ou checksum divergente interrompem a exportação. A lista de hosts de arquivos permitidos é `BASE44_FILE_HOSTS`, separada por vírgula; defaults: `media.base44.com,base44.app`. Confira os hosts efetivamente retornados pelo Storage antes de ampliar a lista. Redirects e downloads acima de 50 MiB são recusados.

`exports/`, `imports/` e relatórios privados ficam fora do Git. Preserve o snapshot e a chave em local protegido e separado. Um snapshot completo não é atualizado por reexecutar a mesma pasta: use uma pasta nova para cada exportação final. Não exporte enquanto o sistema antigo recebe alterações para a conferência de corte.

## Validação e importação

A validação recusa snapshots incompletos, IDs ausentes/repetidos, alterações de checksum, arquivos truncados, paths fora do snapshot e referências quebradas nos relacionamentos conhecidos. Os erros não recuperam conteúdo ausente nem alteram classificações financeiras.

```sh
npm run migration:import -- exports/m31 --dry-run
npm run migration:import -- exports/m31
```

A primeira chamada não precisa de credenciais do destino nem grava dados. A segunda exige `MIGRATION_TARGET=local` ou `staging`, Supabase URL/service key, `TOKEN_ENCRYPTION_KEY`, `EXPORT_ENCRYPTION_KEY` e `APP_ORIGIN`. Para a troca final, produção exige `MIGRATION_TARGET=production`, `--final-cutover` e `--ack-write-freeze`; esses flags só devem ser usados após aprovação e bloqueio de escrita.

A importação exige workflows pausados e chama `m31_commit` com `suppress_events:true`. Não gera Realtime, jobs, mensagens ou cobranças. Registros usam seus IDs originais, hash canônico de conteúdo e revisão; reexecutar não duplica. Um destino modificado após a importação não é sobrescrito por um snapshot atualizado: exige reconciliação. Os arquivos têm IDs determinísticos; referências de URL são substituídas pela API própria e referências `_uri` por `supabase://bucket/path`. Arquivos pastorais/financeiros recebem escopo privado e vínculos com seus registros. Somente arquivos exclusivamente de branding/config pública podem ir ao bucket público.

Datas, campos extras, QR Codes comerciais, referências de pagamento, pedidos, cartinhas, autoria e histórico são preservados. Tokens ficam hashed e criptografados para reconstrução controlada pelo backend; suas regras de validade e consumo continuam vigentes. `import-report.json` registra contagens, mas não constitui conferência financeira independente. A migração não corrige divergências financeiras nem inferências históricas.

### Duplicatas existentes na origem

A migration `20261006000100_legacy_duplicate_keys.sql` permite preservar pedidos e eventos que já compartilham uma chave no Base44. A tabela privada `m31_legacy_duplicate_keys` registra somente o ID histórico, o campo e seu valor protegido; tokens devem ser registrados com o mesmo hash usado pelo vault. Ela não recebe dados automaticamente.

Para cada grupo conferido no snapshot, mantenha pelo menos um registro fora dessa tabela, conservando a chave no índice único. Registre apenas os demais IDs como exceções históricas. O trigger exige correspondência exata de entidade, ID, campo e valor, além da marca de importação no payload. Novas duplicatas continuam recusadas, inclusive quando tentam informar o flag de exceção diretamente. Se a chave de um registro histórico mudar, ele volta a participar da restrição normal. O conteúdo financeiro, as datas e os tokens originais reconstruídos permanecem intactos.

Referências ausentes na origem continuam reprovadas pelo validador padrão. Uma cópia de diagnóstico em staging pode preservar esses registros mediante conferência exata com um relatório criptografado de IDs, referências e hashes. Esse procedimento não aprova o corte de produção nem autoriza apagar registros, criar participantes substitutos ou reclassificar pagamentos.

## Migração de logins em staging

O relatório seguro está em `exports/m31-staging-20261006/login-migration-summary.json`; o mapa de identidade, backup e links ficam criptografados na mesma pasta. Os links de preparação usam `/m31-reset-password#token_hash=...&type=recovery`: a página remove a credencial da URL antes de verificar o OTP de recuperação e permite à própria pessoa definir sua senha. Nunca publique nem registre esses links. Links expirados exigem nova preparação individual.

Os dois convites pendentes do painel Base44 também foram preservados no Auth: total de 11 contas, nove associações registradas (oito ativas e uma inativa) e dois convites sem confirmação de e-mail ou associação operacional. O inventário completo permanece criptografado no bucket privado e em backup local. Convite pendente não concede acesso.

Rotas de homologação: `/m31-login` para entrada, `/portal` para direcionamento por perfil, `/m31-admin` para gestão operacional e `/admin` para administradores. `/gestao` é a entrada da gestão simplificada. Perfis operacionais não recebem acesso administrativo: o guard usa o membro ativo conferido pelo backend, e o backend continua impondo suas permissões por operação. O portal direciona o perfil `cartinhas` à área própria.

### Senha antiga no primeiro login

A configuração `LEGACY_PASSWORD_MIGRATION_ENABLED=true` está limitada ao staging. O cliente tenta o Supabase primeiro; somente `invalid_credentials` chama `/api/auth/legacy-password`. O Worker valida a senha no endpoint de login do app Base44 original, com endereço fixo, timeout e sem redirects. Confere ID legado, e-mail, app, verificação, desativação e ausência de conta de serviço. O papel retornado pelo Base44 não altera as permissões do destino. Após a gravação, o cliente entra novamente pelo Supabase.

A migration `20261006000200_legacy_password_transition.sql` registra somente a impressão digital da credencial interna gerada pelo Supabase ao importar a conta. A tabela privada usa RLS e não concede acesso a anon/authenticated. As duas RPCs são exclusivas de service role. A gravação usa bcrypt com pgcrypto, trava conta/identidade/membro/controle, revalida seus estados e marca a conclusão atomicamente. Uma senha alterada, recuperação consumida, login já realizado, conta inativa, e-mail não confirmado, banimento ou identidade divergente impedem a migração. A operação nunca substitui uma senha escolhida no destino, confirma convites nem eleva perfis. Senha recebida e token de login antigo não são gravados em dados de aplicação ou logs.

Há limites por IP e e-mail, corpos limitados e rejeição de senhas acima de 72 bytes UTF-8 para evitar truncamento de bcrypt. Se o Base44 exigir CAPTCHA ou ficar indisponível, a transição falha sem liberar acesso. Mantenha o Base44 ativo até concluir as transições necessárias; acompanhe `completed_at` com service role e então desabilite a configuração. Os links privados de recuperação continuam disponíveis como caminho individual quando necessário; nenhum foi enviado automaticamente.

`/gestao` é a entrada operacional dedicada. A conta compartilhada possui perfil `gestao_operacional` no membro, embora o Auth legado use papel `user`. Quando a lista de operações importada está vazia, o backend usa o escopo desse perfil. Um escopo explícito prevalece. Nomes conhecidos apenas restringem esse escopo (Dulce: camisas; Thaysa: inscrições/caravanas; Edilândia: voluntárias); um nome desconhecido não herda acesso completo. Contas pessoais usam o próprio membro, e perfis de leitura continuam bloqueados para alterações. `/m31-login` apresenta o acesso geral, `/portal` direciona o perfil confirmado pelo backend e perfis desconhecidos/inativos seguem para `/m31-sem-acesso`.

A validação de senha correta no Base44 foi simulada nos testes, pois nenhuma senha antiga real foi fornecida. O endpoint real foi confirmado com uma tentativa sintética inválida, e a gravação/hash/login no Supabase foi validada com conta temporária real, incluindo concorrência e recusa de sobrescrita. O primeiro login de uma conta legada real ainda precisa ser realizado pela própria pessoa.

## Identidades e recuperação de senha — ferramenta genérica

Crie, fora do Git, um JSON explícito:

```json
[
  {
    "legacy_user_id": "ID_LEGADO",
    "email": "EMAIL_LEGADO",
    "member_id": "ID_MEMBRO_LEGADO",
    "full_name": "NOME",
    "auth_id": "UUID_EXISTENTE_OPCIONAL"
  }
]
```

```sh
npm run migration:identities -- reports/private/identity-map.json
npm run migration:invitations -- --prepare-links
```

O mapa exige correspondência exata entre membro e e-mail legado. UUID informado é conferido com Auth; conta existente sem UUID informado exige revisão explícita. Contas novas não dependem de senhas Base44, não recebem uma senha escolhida pela ferramenta nem acesso operacional. As associações começam com `active:false`.

O segundo comando usa `generateLink` de recuperação, sem enviar e-mail, e grava os links criptografados em `reports/private/recovery-links.json.enc`. Os links dão acesso à conta: não publique esse arquivo. O envio e a ativação das associações ficam para a etapa autorizada posterior, depois de conferir os perfis, setores e permissões. Referência: [Supabase generateLink](https://supabase.com/docs/reference/javascript/auth-admin-generatelink).

## Conferência e corte

1. Exporte uma cópia somente de leitura e valide o manifesto.
2. Importe em homologação com automações pausadas. Confira contagens por entidade, relações, valores por pedido/pagamento, QR Codes, autoria, histórico, links, arquivos e todas as identidades.
3. Execute o roteiro `VALIDATION.md` com a stack Supabase real e providers sandbox/destinos de teste. Resolva diferenças antes do corte.
4. Faça backup do destino. Combine o bloqueio de escrita no sistema antigo e garanta que os webhooks não produzirão alterações durante a janela.
5. Exporte um snapshot final em pasta nova; valide e importe no destino aprovado, ainda com jobs pausados. Não reclassifique divergências nem sobrescreva novas escritas.
6. Confira novamente pagamentos, camisas agrupadas, estoque, check-in, autoria e arquivos. Troque domínio, endpoints e webhooks somente depois da aprovação.
7. Ative os workflows recorrentes revisados. Monitore filas, falhas, providers e operação assistida; mantenha os backups e registros de corte.

Antes de novas escritas no novo sistema, o retorno pode apontar novamente para a aplicação antiga preservada. Depois de novas escritas, retornar exige reconciliação de participantes, pagamentos, pedidos, check-in, cartas e eventos recebidos. Não faça rollback apenas alterando DNS depois que os dois lados divergirem.
