# Migração futura e roteiro de troca

Nenhuma exportação de clientes, importação real, convite, cobrança ou mensagem ocorreu nesta entrega. Use credenciais próprias para a exportação Base44; o runtime da nova aplicação não contém SDK Base44.

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

## Identidades e recuperação de senha

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
