# Checklist de implementação

Origem: `c342879566d47d7b53ed8387687933e9c850085d`. Implementação não equivale à homologação integral de todos os handlers com credenciais reais.

362 módulos de interface da origem; 203 handlers; 69 entidades; 33 workflows. Não há handlers ausentes no inventário. Assets de marca são locais, com manifesto de checksums.

## Cobertura dos módulos

| Módulo | Executado | Pendente na infraestrutura real |
|---|---|---|
| Inscrição/pagamento | Regressões, API de intenção/idempotência, SQL | Checkout/Pix/cartão e conciliação sandbox |
| Caravanas/Servir | Regressões e navegação pública | Ciclo completo com Supabase/providers |
| Camisas | Regras de pedido/peças/agrupamento/pagamento | Checkout/estoque, Sheets e concorrência real |
| Cartinhas | Autosave, autoria, conflitos, transferência, impressão e lotes | Auth real, Storage/áudios, OpenAI e espelho Google |
| Check-in | Regressões e HTTP repetido preservando QR/pagamento | Dispositivos e navegador com Supabase |
| Gestão/tarefas/logística | UI/build, API de perfis/setor, RLS em PostgreSQL | Navegação de todos os perfis e anexos com Supabase |
| Fornecedores/financeiro | Schemas, domínio financeiro e relacionamentos | Contratos, parcelas, anexos e notificações reais |
| Jobs/webhooks | Outbox atômico, evento duplicado e recuperação de lease em SQL | Queues/retries/DLQ hospedados e providers |
| Migração | Fixtures criptografados, retomada, reexecução e preservação integral | Exportação Base44 e Auth/Storage reais |

## Handlers

Todos têm implementação e registro explícito. Saúde usa consultas do runtime. Rotinas de teste são bloqueadas em produção. Os corpos legados mantêm a fronteira tipada do runtime; sua existência no registro não significa que cada handler tenha sido executado nos testes.

| Handler | Implementado e registrado |
|---|---|
| `m31-caravana-diagnostico` | Sim |
| `m31-caravana-flow` | Sim |
| `m31-caravana-recuperacao` | Sim |
| `m31-caravana-v2` | Sim |
| `m31AbrirSessaoOperacional` | Sim |
| `m31AdicionarGrupo74` | Sim |
| `m31AlertarGestor` | Sim |
| `m31AlertarPagamentoOrfao` | Sim |
| `m31AmostragemAuditoria` | Sim |
| `m31AprovarRecuperacao` | Sim |
| `m31AprovarSolicitacao` | Sim |
| `m31AsaasNotificacoes` | Sim |
| `m31AsaasWebhook` | Sim |
| `m31AtribuirOrdemOperacional` | Sim |
| `m31AuditarConversaoGrupo` | Sim |
| `m31AuditarEncerrados` | Sim |
| `m31AuditarGapQR` | Sim |
| `m31AuditarGapsLogs` | Sim |
| `m31AuditarPagamentosAsaas` | Sim |
| `m31AuditarRecuperar72h` | Sim |
| `m31AuditarSincroniaCodigos` | Sim |
| `m31AuditarWebhookAsaas` | Sim |
| `m31AuditorAutomatico` | Sim |
| `m31AuditoriaCompleta` | Sim |
| `m31AuditoriaCompleta403` | Sim |
| `m31AuditoriaGrupo` | Sim |
| `m31AuditoriaInscrita` | Sim |
| `m31AuditoriaIntercessao` | Sim |
| `m31AuditoriaPagamentoIntercessao` | Sim |
| `m31AuditoriaPagamentos72h` | Sim |
| `m31AuditoriaQRCode` | Sim |
| `m31AuditoriaReconciliacao5Dias` | Sim |
| `m31AuditoriaRecuperacao` | Sim |
| `m31AuditoriaWhatsAppCentralizado` | Sim |
| `m31AvisoCompraConfirmada` | Sim |
| `m31AvisoVoluntariaConfirmada` | Sim |
| `m31BackfillBillingType` | Sim |
| `m31BackfillPagamentoConfirmado` | Sim |
| `m31BackfillValorCartao` | Sim |
| `m31BackupGoogleDrive` | Sim |
| `m31BreakdownMetodosPagamento` | Sim |
| `m31BuscarComprovanteAsaas` | Sim |
| `m31BuscarGrupoIntercessao` | Sim |
| `m31BuscarJidGrupo` | Sim |
| `m31BuscarJulianna` | Sim |
| `m31BuscarPorTelefone` | Sim |
| `m31CalcularPrioridade` | Sim |
| `m31CamisaVendaPayment` | Sim |
| `m31CamisasOfertaPublica` | Sim |
| `m31CamisasOperacional` | Sim |
| `m31CancelarCadastroDuplicado` | Sim |
| `m31CancelarCobranca` | Sim |
| `m31CaravanaPayment` | Sim |
| `m31Cartinhas` | Sim |
| `m31CartinhasEspelho` | Sim |
| `m31CheckUazapiStatus` | Sim |
| `m31Checkin` | Sim |
| `m31ConciliacaoCanonica` | Sim |
| `m31ConcluirCadastroConvidada` | Sim |
| `m31ConcluirTransferencia` | Sim |
| `m31ConsultarAsaasPos28` | Sim |
| `m31ConsultarCadastroConvidada` | Sim |
| `m31ConsultarConfirmadosAsaas` | Sim |
| `m31ConsultarCustomerAsaas` | Sim |
| `m31ConsultarFalhaCheckout` | Sim |
| `m31ConsultarInscrita` | Sim |
| `m31ConsultarQuotaUazapi` | Sim |
| `m31ConsultarTransferencia` | Sim |
| `m31ContarRecovery` | Sim |
| `m31CorrigirGapsResetados` | Sim |
| `m31CorrigirLeads` | Sim |
| `m31CorrigirValoresAsaas` | Sim |
| `m31CreatePayment` | Sim |
| `m31CriarEdicao` | Sim |
| `m31CruzarNomesVoluntarias` | Sim |
| `m31DashboardSeguranca` | Sim |
| `m31DebugGrupos` | Sim |
| `m31DebugInvite` | Sim |
| `m31DebugMetadata` | Sim |
| `m31DebugMetadataDiscrepancia` | Sim |
| `m31DebugPendentes` | Sim |
| `m31DebugPhoneFormatos` | Sim |
| `m31DeletarInscricoesTeste` | Sim |
| `m31DespacharConfirmacoes` | Sim |
| `m31DespacharEmailsConfirmacao` | Sim |
| `m31DiagnosticarPaymentIdCompartilhado` | Sim |
| `m31DiagnosticarWebhook` | Sim |
| `m31DiagnosticoAsaasKey` | Sim |
| `m31DiagnosticoCpfBloqueados` | Sim |
| `m31DiagnosticoFinanceiroAsaas` | Sim |
| `m31DiagnosticoFluxoPagamento` | Sim |
| `m31DiagnosticoHigienizacao` | Sim |
| `m31DiagnosticoPagamentoSemInscricao` | Sim |
| `m31DiagnosticoRejeitadosGrupo` | Sim |
| `m31DiagnosticoSendMedia` | Sim |
| `m31DiagnosticoTentativasCartao` | Sim |
| `m31DispararVoluntarios` | Sim |
| `m31DisparoCobrancasPendentes` | Sim |
| `m31DispositivoCheckin` | Sim |
| `m31DrenarFila` | Sim |
| `m31EncerrarRegua` | Sim |
| `m31EnfileirarLoteGrupoPendentes` | Sim |
| `m31EnfileirarUltimos7Dias` | Sim |
| `m31EnviarBoasVindas` | Sim |
| `m31EnviarBoasVindasConvidada` | Sim |
| `m31EnviarComprovanteFornecedor` | Sim |
| `m31EnviarEmailExterno` | Sim |
| `m31EnviarLembreteTarefas` | Sim |
| `m31EnviarLinkCadastroConvidada` | Sim |
| `m31EnviarMensagemGovernada` | Sim |
| `m31ExtrairGrupoInscritadas` | Sim |
| `m31GarantirControleDiario` | Sim |
| `m31GerarCheckoutAdmin` | Sim |
| `m31GerarCobrancaAvulsa` | Sim |
| `m31GerarCobrancasLote1` | Sim |
| `m31GerarCupons` | Sim |
| `m31GerarLinkExcecao2Lote` | Sim |
| `m31GerarLinkTransferencia` | Sim |
| `m31GerarPixDireto` | Sim |
| `m31GetChurchId` | Sim |
| `m31HealthCheck` | Sim |
| `m31IdentificarOrigemTestes` | Sim |
| `m31ImportarParticipantes` | Sim |
| `m31ImportarPlanoMestre` | Sim |
| `m31LembreteVencimentoFornecedor` | Sim |
| `m31LiberadorFilaConfirmacoes` | Sim |
| `m31LiberarBoasVindasControlada` | Sim |
| `m31LimparTelefoneErrado` | Sim |
| `m31ListarAutomacoes` | Sim |
| `m31ListarDuplicadosRevisao` | Sim |
| `m31ListarIgrejasConhecidas` | Sim |
| `m31ListarParticipantesIntercessao` | Sim |
| `m31MarcarMembroGrupo` | Sim |
| `m31MensagemRecuperacaoManual` | Sim |
| `m31MesclarInscricaoDuplicada` | Sim |
| `m31MigrarCaravanas` | Sim |
| `m31MigrarEntradaGrupo` | Sim |
| `m31MigrarTarefasPlanoMestre` | Sim |
| `m31NegarSolicitacao` | Sim |
| `m31NotificarAtribuicaoTarefa` | Sim |
| `m31NotificarComentarioTarefa` | Sim |
| `m31NotificarInscricaoGrupo` | Sim |
| `m31NotificarStatusTarefa` | Sim |
| `m31OperarParticipante` | Sim |
| `m31PanoramaOperacional` | Sim |
| `m31PodeEnviarAutomacao` | Sim |
| `m31PreparacaoFilas` | Sim |
| `m31ProcessarWebhookAsaas` | Sim |
| `m31ReceberWebhookUazapi` | Sim |
| `m31ReconciliarAsaas` | Sim |
| `m31ReconciliarCodigos` | Sim |
| `m31ReconciliarConfirmacoes30min` | Sim |
| `m31ReconciliarDuplicatas` | Sim |
| `m31RecoveryBoasVindasGrupoB` | Sim |
| `m31RecuperarCheckout` | Sim |
| `m31RecuperarCheckoutsExpirados` | Sim |
| `m31RecuperarCheckoutsOrfaos` | Sim |
| `m31RecuperarFalhasTecnicas` | Sim |
| `m31RecuperarImpactadasLoteEsgotado` | Sim |
| `m31RecuperarInscricoesCritico` | Sim |
| `m31RecuperarLeads` | Sim |
| `m31RecuperarLinksPagamento` | Sim |
| `m31RecuperarPendentes15Dias` | Sim |
| `m31ReenviarCobranca` | Sim |
| `m31ReenviarEmail` | Sim |
| `m31ReenviarLinkGrupo` | Sim |
| `m31ReenviarLinkGrupoIndividual` | Sim |
| `m31ReenviarQRCode` | Sim |
| `m31RegistrarFalhaCheckout` | Sim |
| `m31RegistrarIntencao` | Sim |
| `m31ReguaAutomatica` | Sim |
| `m31ReguaFollowupGrupo` | Sim |
| `m31ReguaSegura` | Sim |
| `m31ReiniciarUazapi` | Sim |
| `m31RelatorioSincroniaAsaas` | Sim |
| `m31RelatorioWhatsAppCentralizado` | Sim |
| `m31RenderizarTemplate` | Sim |
| `m31ReprocessarBoasVindasPendentes` | Sim |
| `m31ResetPhantomBoasVindas` | Sim |
| `m31ResolverGrupo` | Sim |
| `m31ResolverInviteGrupo` | Sim |
| `m31ResumoCamisasDulce` | Sim |
| `m31ResumoOperacional` | Sim |
| `m31RetomarPagamento` | Sim |
| `m31ReverterExcecao2Lote` | Sim |
| `m31RotinaDuplicidades` | Sim |
| `m31SendWhatsApp` | Sim |
| `m31SimularWebhookTeste` | Sim |
| `m31SnapshotGrupo` | Sim |
| `m31SolicitarAcesso` | Sim |
| `m31SuporteObservador` | Sim |
| `m31UazapiStatus` | Sim |
| `m31ValidarEntregaConfirmacao` | Sim |
| `m31ValidarRecuperacao7Dias` | Sim |
| `m31ValidarRecuperacaoCheckouts` | Sim |
| `m31VerificarDuplicidade` | Sim |
| `m31VerificarGapsRiscoResetados` | Sim |
| `m31VerificarMensagensCobranca` | Sim |
| `m31VerificarPagamentoCPF` | Sim |
| `m31VerificarParcelamentos` | Sim |
| `m31VincularPagamentoManual` | Sim |
| `m31VoluntarioPayment` | Sim |
| `m31WhatsAppService` | Sim |

## Entidades

| Entidade | Tabela com RLS |
|---|---|
| `BrandSettings` | `m31_brand_settings` |
| `Church` | `m31_church` |
| `ContaPagar` | `m31_conta_pagar` |
| `ContaReceber` | `m31_conta_receber` |
| `EventPageConfig` | `m31_event_page_config` |
| `EventoM31ActionLog` | `m31_evento_m31_action_log` |
| `EventoM31CamisaEstoque` | `m31_evento_m31_camisa_estoque` |
| `EventoM31CamisaPedido` | `m31_evento_m31_camisa_pedido` |
| `EventoM31Caravana` | `m31_evento_m31_caravana` |
| `EventoM31ChecklistItem` | `m31_evento_m31_checklist_item` |
| `EventoM31Config` | `m31_evento_m31_config` |
| `EventoM31Configuracao` | `m31_evento_m31_configuracao` |
| `EventoM31Cronograma` | `m31_evento_m31_cronograma` |
| `EventoM31Cupom` | `m31_evento_m31_cupom` |
| `EventoM31Inscricao` | `m31_evento_m31_inscricao` |
| `EventoM31Lote` | `m31_evento_m31_lote` |
| `EventoM31Membro` | `m31_evento_m31_membro` |
| `EventoM31Presenca` | `m31_evento_m31_presenca` |
| `EventoM31Reuniao` | `m31_evento_m31_reuniao` |
| `EventoM31Tarefa` | `m31_evento_m31_tarefa` |
| `EventoM31Voluntario` | `m31_evento_m31_voluntario` |
| `FinancialSupplier` | `m31_financial_supplier` |
| `FinancialTransaction` | `m31_financial_transaction` |
| `Inscricoes` | `m31_inscricoes` |
| `M31Area` | `m31_m31_area` |
| `M31AsaasWebhookEvento` | `m31_m31_asaas_webhook_evento` |
| `M31Atendimento` | `m31_m31_atendimento` |
| `M31AuditLog` | `m31_m31_audit_log` |
| `M31AuditoriaConfirmacaoManual` | `m31_m31_auditoria_confirmacao_manual` |
| `M31AutomacaoLock` | `m31_m31_automacao_lock` |
| `M31AutomacaoLog` | `m31_m31_automacao_log` |
| `M31BlocoConteudo` | `m31_m31_bloco_conteudo` |
| `M31CartinhaEntrada` | `m31_m31_cartinha_entrada` |
| `M31CheckinDispositivo` | `m31_m31_checkin_dispositivo` |
| `M31ClienteCamisa` | `m31_m31_cliente_camisa` |
| `M31CompraCamisa` | `m31_m31_compra_camisa` |
| `M31DeadLetterQueue` | `m31_m31_dead_letter_queue` |
| `M31EdicaoEvento` | `m31_m31_edicao_evento` |
| `M31FalhaCheckout` | `m31_m31_falha_checkout` |
| `M31FilaGrupo74` | `m31_m31_fila_grupo74` |
| `M31FilaMensagem` | `m31_m31_fila_mensagem` |
| `M31Frente` | `m31_m31_frente` |
| `M31GrupoConfig` | `m31_m31_grupo_config` |
| `M31GrupoEnvioLog` | `m31_m31_grupo_envio_log` |
| `M31GrupoMembro` | `m31_m31_grupo_membro` |
| `M31GrupoMensagem` | `m31_m31_grupo_mensagem` |
| `M31InscricaoTimeline` | `m31_m31_inscricao_timeline` |
| `M31MessageLog` | `m31_m31_message_log` |
| `M31MessageTemplate` | `m31_m31_message_template` |
| `M31OperacaoIncidente` | `m31_m31_operacao_incidente` |
| `M31OperacaoSessao` | `m31_m31_operacao_sessao` |
| `M31Pacote` | `m31_m31_pacote` |
| `M31PacoteModelo` | `m31_m31_pacote_modelo` |
| `M31PendenciaConciliacao` | `m31_m31_pendencia_conciliacao` |
| `M31PlanoMestre` | `m31_m31_plano_mestre` |
| `M31ProdutoCamisa` | `m31_m31_produto_camisa` |
| `M31RegraSuporte` | `m31_m31_regra_suporte` |
| `M31SolicitacaoAcesso` | `m31_m31_solicitacao_acesso` |
| `M31TarefaModelo` | `m31_m31_tarefa_modelo` |
| `M31TesteUnique` | `m31_m31_teste_unique` |
| `M31TransacaoFinanceira` | `m31_m31_transacao_financeira` |
| `M31TransferenciaInscricao` | `m31_m31_transferencia_inscricao` |
| `M31VoluntarioGrupo` | `m31_m31_voluntario_grupo` |
| `M31WhatsAppControl` | `m31_m31_whats_app_control` |
| `Query` | `m31_query` |
| `SupplierContract` | `m31_supplier_contract` |
| `SupplierPayment` | `m31_supplier_payment` |
| `TarefaComentario` | `m31_tarefa_comentario` |
| `TarefaLembreteConfig` | `m31_tarefa_lembrete_config` |

## Workflows efetivos

Todos começam pausados. O título não determina o horário.

| Nome | Função | Frequência/fuso |
|---|---|---|
| M31 Calcular Prioridade — 08:30 | `m31CalcularPrioridade` | 30 11 * * * · UTC |
| Notificar Mudança de Status da Tarefa | `m31NotificarStatusTarefa` | evento EventoM31Tarefa · evento |
| M31 — Régua Follow-up Grupo (09h) | `m31ReguaFollowupGrupo` | 0 9 * * * · America/Recife |
| M31 — Despachar Confirmações (aprovado sem boas-vindas) | `m31DespacharConfirmacoes` | evento EventoM31Inscricao · evento |
| M31 — Boas-vindas Automáticas (30min) | `m31EnviarBoasVindas` | 5 minutes · UTC |
| Monitor Erros Formulário M31 → Alertar Paulo | `m31AlertarGestor` | evento M31AuditLog · evento |
| Recuperação Checkout Ester — a cada 15min | `m31RecuperarCheckout` | 15 minutes · UTC |
| M31 — Reconciliação ASAAS (webhooks perdidos) | `m31ReconciliarAsaas` | 2 hours · UTC |
| Atribuir Nº Operacional Interno | `m31AtribuirOrdemOperacional` | evento EventoM31Inscricao · evento |
| Fila Confirmações Pagas — Liberador | `m31LiberadorFilaConfirmacoes` | 5 minutes · UTC |
| M31 - Recuperar Leads Abandonados | `m31RecuperarLeads` | 15 minutes · UTC |
| Suporte M31 — Processar atendimento (modo observador) | `m31SuporteObservador` | evento M31Atendimento · evento |
| Snapshot Grupo Inscritas (2h) | `m31ExtrairGrupoInscritadas` | 2 hours · UTC |
| Fila Global de Mensagens — Drenador (m31DrenarFila) | `m31DrenarFila` | */5 11-23 * * * · UTC |
| M31 Régua — Disparo 09:00 | `m31ReguaAutomatica` | 0 12 * * 1-6 · UTC |
| Auditor Automático M31 (1h) | `m31AuditorAutomatico` | 1 hours · UTC |
| Lembretes Diários de Tarefas (09:00) | `m31EnviarLembreteTarefas` | 0 12 * * * · UTC |
| Reconciliação Asaas — Safety Net | `m31ReconciliarAsaas` | 2 hours · UTC |
| Disparo Lote 1 - 10 em 10 a cada 15min | `m31GerarCobrancasLote1` | 15 minutes · UTC |
| Cartinhas — Espelho Privado (30min) | `m31CartinhasEspelho` | */30 * * * * · America/Recife |
| Notificar Novo Comentário em Tarefa | `m31NotificarComentarioTarefa` | evento TarefaComentario · evento |
| M31 — Régua Segura — 16h | `m31ReguaSegura` | 0 19 * * 1-6 · UTC |
| Notificar Atribuição de Tarefa | `m31NotificarAtribuicaoTarefa` | evento EventoM31Tarefa · evento |
| M31 — Worker Webhook Asaas (processa eventos recebidos) | `m31ProcessarWebhookAsaas` | 60 minutes · UTC |
| Reverter Excecao 2 Lote | `m31ReverterExcecao2Lote` | 30 minutes · UTC |
| Fila Recuperação Comercial — Checkouts | `m31RecuperarPendentes15Dias` | 5 minutes · UTC |
| M31 Régua — Disparo 18:00 | `m31ReguaAutomatica` | 0 21 * * 1-6 · UTC |
| Lembrete de vencimento — Fornecedores (Thalita) | `m31LembreteVencimentoFornecedor` | 0 12 * * * · UTC |
| Controle diário de WhatsApp — garantir registro do dia | `m31GarantirControleDiario` | 55 10 * * * · UTC |
| Alerta Pagamento Órfão Asaas | `m31AlertarPagamentoOrfao` | 30 minutes · UTC |
| M31 — Régua Segura — 10h | `m31ReguaSegura` | 0 13 * * 1-6 · UTC |
| M31 — Notificar Inscrição ao Grupo | `m31NotificarInscricaoGrupo` | evento EventoM31Inscricao · evento |
| Reconciliação Confirmações — Safety Net 30min | `m31ReconciliarConfirmacoes30min` | 60 minutes · UTC |
