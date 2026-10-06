# Migração futura e roteiro de troca

O roteiro abaixo separa a cópia em staging da troca final de produção. Use credenciais próprias para a exportação Base44; o runtime da nova aplicação não contém SDK Base44.

## Cópia de staging em 06/10/2026

Foram copiados e comparados integralmente 25.924 registros de 65 tabelas existentes na origem, incluindo 1.350 inscrições e 99 pedidos de camisa. As outras quatro entidades do catálogo retornaram HTTP 404 na origem e permaneceram vazias no destino. A captura ocorreu entre 13:00:35 e 13:01:53 UTC, sem bloqueio de escrita no Base44; portanto, é uma cópia de homologação, não um corte final.

A conferência por ID e hash canônico de todos os campos passou para as 69 tabelas de destino. As 33 automações permaneceram desativadas; outbox, eventos Realtime e tentativas de providers não aumentaram. A origem não recebeu gravações da migração. O backup e os relatórios ficam protegidos em `exports/m31-staging-20261006/`, fora do Git.

Foram preservadas 145 referências a inscrições ausentes na própria origem e as duplicatas históricas de duas chaves de pedido e 55 chaves de evento de webhook. Essas pendências não foram corrigidas nem apagadas durante a cópia. As nove contas de origem foram criadas no Supabase Auth, com os IDs legados preservados em `m31_identities`: oito associações estão ativas e uma permanece inativa por não ter membro operacional. Os quatro administradores legados conservaram o acesso: um perfil `admin` foi normalizado para `super_admin` e três membros administrativos foram criados com proveniência da conta original. Os cinco vínculos por e-mail exato conservaram suas permissões. Três membros sem conta correspondente permaneceram sem associação; nenhum endereço foi corrigido por suposição. Não foram transferidas senhas nem enviados e-mails. Links individuais para definição de senha foram preparados e guardados criptografados. A troca de produção continua pendente.

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

Rotas de homologação: `/m31-login` para entrada, `/portal` para direcionamento por perfil, `/m31-admin` para gestão operacional e `/admin` para administradores. `/gestao` é a entrada da gestão simplificada. Perfis operacionais não recebem acesso administrativo: o guard usa o membro ativo conferido pelo backend, e o backend continua impondo suas permissões por operação. O portal direciona o perfil `cartinhas` à área própria.

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

O mapa exige correspondência exata entre membro e e-mail legado. UUID informado é conferido com Auth; conta existente sem UUID informado exige revisão explícita. Contas novas não dependem de senhas Base44, não recebem senha automática nem acesso operacional. As associações começam com `active:false`.

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
