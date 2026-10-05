import f0 from "./functions/m31-caravana-diagnostico/entry";
import f1 from "./functions/m31-caravana-flow/entry";
import f2 from "./functions/m31-caravana-recuperacao/entry";
import f3 from "./functions/m31-caravana-v2/entry";
import f4 from "./functions/m31AbrirSessaoOperacional/entry";
import f5 from "./functions/m31AdicionarGrupo74/entry";
import f6 from "./functions/m31AlertarGestor/entry";
import f7 from "./functions/m31AlertarPagamentoOrfao/entry";
import f8 from "./functions/m31AmostragemAuditoria/entry";
import f9 from "./functions/m31AprovarRecuperacao/entry";
import f10 from "./functions/m31AprovarSolicitacao/entry";
import f11 from "./functions/m31AsaasNotificacoes/entry";
import f12 from "./functions/m31AsaasWebhook/entry";
import f13 from "./functions/m31AtribuirOrdemOperacional/entry";
import f14 from "./functions/m31AuditarConversaoGrupo/entry";
import f15 from "./functions/m31AuditarEncerrados/entry";
import f16 from "./functions/m31AuditarGapQR/entry";
import f17 from "./functions/m31AuditarGapsLogs/entry";
import f18 from "./functions/m31AuditarPagamentosAsaas/entry";
import f19 from "./functions/m31AuditarRecuperar72h/entry";
import f20 from "./functions/m31AuditarSincroniaCodigos/entry";
import f21 from "./functions/m31AuditarWebhookAsaas/entry";
import f22 from "./functions/m31AuditorAutomatico/entry";
import f23 from "./functions/m31AuditoriaCompleta/entry";
import f24 from "./functions/m31AuditoriaCompleta403/entry";
import f25 from "./functions/m31AuditoriaGrupo/entry";
import f26 from "./functions/m31AuditoriaInscrita/entry";
import f27 from "./functions/m31AuditoriaIntercessao/entry";
import f28 from "./functions/m31AuditoriaPagamentoIntercessao/entry";
import f29 from "./functions/m31AuditoriaPagamentos72h/entry";
import f30 from "./functions/m31AuditoriaQRCode/entry";
import f31 from "./functions/m31AuditoriaReconciliacao5Dias/entry";
import f32 from "./functions/m31AuditoriaRecuperacao/entry";
import f33 from "./functions/m31AuditoriaWhatsAppCentralizado/entry";
import f34 from "./functions/m31AvisoCompraConfirmada/entry";
import f35 from "./functions/m31AvisoVoluntariaConfirmada/entry";
import f36 from "./functions/m31BackfillBillingType/entry";
import f37 from "./functions/m31BackfillPagamentoConfirmado/entry";
import f38 from "./functions/m31BackfillValorCartao/entry";
import f39 from "./functions/m31BackupGoogleDrive/entry";
import f40 from "./functions/m31BreakdownMetodosPagamento/entry";
import f41 from "./functions/m31BuscarComprovanteAsaas/entry";
import f42 from "./functions/m31BuscarGrupoIntercessao/entry";
import f43 from "./functions/m31BuscarJidGrupo/entry";
import f44 from "./functions/m31BuscarJulianna/entry";
import f45 from "./functions/m31BuscarPorTelefone/entry";
import f46 from "./functions/m31CalcularPrioridade/entry";
import f47 from "./functions/m31CamisaVendaPayment/entry";
import f48 from "./functions/m31CamisasOfertaPublica/entry";
import f49 from "./functions/m31CamisasOperacional/entry";
import f50 from "./functions/m31CancelarCadastroDuplicado/entry";
import f51 from "./functions/m31CancelarCobranca/entry";
import f52 from "./functions/m31CaravanaPayment/entry";
import f53 from "./functions/m31Cartinhas/entry";
import f54 from "./functions/m31CartinhasEspelho/entry";
import f55 from "./functions/m31CheckUazapiStatus/entry";
import f56 from "./functions/m31Checkin/entry";
import f57 from "./functions/m31ConciliacaoCanonica/entry";
import f58 from "./functions/m31ConcluirCadastroConvidada/entry";
import f59 from "./functions/m31ConcluirTransferencia/entry";
import f60 from "./functions/m31ConsultarAsaasPos28/entry";
import f61 from "./functions/m31ConsultarCadastroConvidada/entry";
import f62 from "./functions/m31ConsultarConfirmadosAsaas/entry";
import f63 from "./functions/m31ConsultarCustomerAsaas/entry";
import f64 from "./functions/m31ConsultarFalhaCheckout/entry";
import f65 from "./functions/m31ConsultarInscrita/entry";
import f66 from "./functions/m31ConsultarQuotaUazapi/entry";
import f67 from "./functions/m31ConsultarTransferencia/entry";
import f68 from "./functions/m31ContarRecovery/entry";
import f69 from "./functions/m31CorrigirGapsResetados/entry";
import f70 from "./functions/m31CorrigirLeads/entry";
import f71 from "./functions/m31CorrigirValoresAsaas/entry";
import f72 from "./functions/m31CreatePayment/entry";
import f73 from "./functions/m31CriarEdicao/entry";
import f74 from "./functions/m31CruzarNomesVoluntarias/entry";
import f75 from "./functions/m31DashboardSeguranca/entry";
import f76 from "./functions/m31DebugGrupos/entry";
import f77 from "./functions/m31DebugInvite/entry";
import f78 from "./functions/m31DebugMetadata/entry";
import f79 from "./functions/m31DebugMetadataDiscrepancia/entry";
import f80 from "./functions/m31DebugPendentes/entry";
import f81 from "./functions/m31DebugPhoneFormatos/entry";
import f82 from "./functions/m31DeletarInscricoesTeste/entry";
import f83 from "./functions/m31DespacharConfirmacoes/entry";
import f84 from "./functions/m31DespacharEmailsConfirmacao/entry";
import f85 from "./functions/m31DiagnosticarPaymentIdCompartilhado/entry";
import f86 from "./functions/m31DiagnosticarWebhook/entry";
import f87 from "./functions/m31DiagnosticoAsaasKey/entry";
import f88 from "./functions/m31DiagnosticoCpfBloqueados/entry";
import f89 from "./functions/m31DiagnosticoFinanceiroAsaas/entry";
import f90 from "./functions/m31DiagnosticoFluxoPagamento/entry";
import f91 from "./functions/m31DiagnosticoHigienizacao/entry";
import f92 from "./functions/m31DiagnosticoPagamentoSemInscricao/entry";
import f93 from "./functions/m31DiagnosticoRejeitadosGrupo/entry";
import f94 from "./functions/m31DiagnosticoSendMedia/entry";
import f95 from "./functions/m31DiagnosticoTentativasCartao/entry";
import f96 from "./functions/m31DispararVoluntarios/entry";
import f97 from "./functions/m31DisparoCobrancasPendentes/entry";
import f98 from "./functions/m31DispositivoCheckin/entry";
import f99 from "./functions/m31DrenarFila/entry";
import f100 from "./functions/m31EncerrarRegua/entry";
import f101 from "./functions/m31EnfileirarLoteGrupoPendentes/entry";
import f102 from "./functions/m31EnfileirarUltimos7Dias/entry";
import f103 from "./functions/m31EnviarBoasVindas/entry";
import f104 from "./functions/m31EnviarBoasVindasConvidada/entry";
import f105 from "./functions/m31EnviarComprovanteFornecedor/entry";
import f106 from "./functions/m31EnviarEmailExterno/entry";
import f107 from "./functions/m31EnviarLembreteTarefas/entry";
import f108 from "./functions/m31EnviarLinkCadastroConvidada/entry";
import f109 from "./functions/m31EnviarMensagemGovernada/entry";
import f110 from "./functions/m31ExtrairGrupoInscritadas/entry";
import f111 from "./functions/m31GarantirControleDiario/entry";
import f112 from "./functions/m31GerarCheckoutAdmin/entry";
import f113 from "./functions/m31GerarCobrancaAvulsa/entry";
import f114 from "./functions/m31GerarCobrancasLote1/entry";
import f115 from "./functions/m31GerarCupons/entry";
import f116 from "./functions/m31GerarLinkExcecao2Lote/entry";
import f117 from "./functions/m31GerarLinkTransferencia/entry";
import f118 from "./functions/m31GerarPixDireto/entry";
import f119 from "./functions/m31GetChurchId/entry";
import f120 from "./functions/m31HealthCheck/entry";
import f121 from "./functions/m31IdentificarOrigemTestes/entry";
import f122 from "./functions/m31ImportarParticipantes/entry";
import f123 from "./functions/m31ImportarPlanoMestre/entry";
import f124 from "./functions/m31LembreteVencimentoFornecedor/entry";
import f125 from "./functions/m31LiberadorFilaConfirmacoes/entry";
import f126 from "./functions/m31LiberarBoasVindasControlada/entry";
import f127 from "./functions/m31LimparTelefoneErrado/entry";
import f128 from "./functions/m31ListarAutomacoes/entry";
import f129 from "./functions/m31ListarDuplicadosRevisao/entry";
import f130 from "./functions/m31ListarIgrejasConhecidas/entry";
import f131 from "./functions/m31ListarParticipantesIntercessao/entry";
import f132 from "./functions/m31MarcarMembroGrupo/entry";
import f133 from "./functions/m31MensagemRecuperacaoManual/entry";
import f134 from "./functions/m31MesclarInscricaoDuplicada/entry";
import f135 from "./functions/m31MigrarCaravanas/entry";
import f136 from "./functions/m31MigrarEntradaGrupo/entry";
import f137 from "./functions/m31MigrarTarefasPlanoMestre/entry";
import f138 from "./functions/m31NegarSolicitacao/entry";
import f139 from "./functions/m31NotificarAtribuicaoTarefa/entry";
import f140 from "./functions/m31NotificarComentarioTarefa/entry";
import f141 from "./functions/m31NotificarInscricaoGrupo/entry";
import f142 from "./functions/m31NotificarStatusTarefa/entry";
import f143 from "./functions/m31OperarParticipante/entry";
import f144 from "./functions/m31PanoramaOperacional/entry";
import f145 from "./functions/m31PodeEnviarAutomacao/entry";
import f146 from "./functions/m31PreparacaoFilas/entry";
import f147 from "./functions/m31ProcessarWebhookAsaas/entry";
import f148 from "./functions/m31ReceberWebhookUazapi/entry";
import f149 from "./functions/m31ReconciliarAsaas/entry";
import f150 from "./functions/m31ReconciliarCodigos/entry";
import f151 from "./functions/m31ReconciliarConfirmacoes30min/entry";
import f152 from "./functions/m31ReconciliarDuplicatas/entry";
import f153 from "./functions/m31RecoveryBoasVindasGrupoB/entry";
import f154 from "./functions/m31RecuperarCheckout/entry";
import f155 from "./functions/m31RecuperarCheckoutsExpirados/entry";
import f156 from "./functions/m31RecuperarCheckoutsOrfaos/entry";
import f157 from "./functions/m31RecuperarFalhasTecnicas/entry";
import f158 from "./functions/m31RecuperarImpactadasLoteEsgotado/entry";
import f159 from "./functions/m31RecuperarInscricoesCritico/entry";
import f160 from "./functions/m31RecuperarLeads/entry";
import f161 from "./functions/m31RecuperarLinksPagamento/entry";
import f162 from "./functions/m31RecuperarPendentes15Dias/entry";
import f163 from "./functions/m31ReenviarCobranca/entry";
import f164 from "./functions/m31ReenviarEmail/entry";
import f165 from "./functions/m31ReenviarLinkGrupo/entry";
import f166 from "./functions/m31ReenviarLinkGrupoIndividual/entry";
import f167 from "./functions/m31ReenviarQRCode/entry";
import f168 from "./functions/m31RegistrarFalhaCheckout/entry";
import f169 from "./functions/m31RegistrarIntencao/entry";
import f170 from "./functions/m31ReguaAutomatica/entry";
import f171 from "./functions/m31ReguaFollowupGrupo/entry";
import f172 from "./functions/m31ReguaSegura/entry";
import f173 from "./functions/m31ReiniciarUazapi/entry";
import f174 from "./functions/m31RelatorioSincroniaAsaas/entry";
import f175 from "./functions/m31RelatorioWhatsAppCentralizado/entry";
import f176 from "./functions/m31RenderizarTemplate/entry";
import f177 from "./functions/m31ReprocessarBoasVindasPendentes/entry";
import f178 from "./functions/m31ResetPhantomBoasVindas/entry";
import f179 from "./functions/m31ResolverGrupo/entry";
import f180 from "./functions/m31ResolverInviteGrupo/entry";
import f181 from "./functions/m31ResumoCamisasDulce/entry";
import f182 from "./functions/m31ResumoOperacional/entry";
import f183 from "./functions/m31RetomarPagamento/entry";
import f184 from "./functions/m31ReverterExcecao2Lote/entry";
import f185 from "./functions/m31RotinaDuplicidades/entry";
import f186 from "./functions/m31SendWhatsApp/entry";
import f187 from "./functions/m31SimularWebhookTeste/entry";
import f188 from "./functions/m31SnapshotGrupo/entry";
import f189 from "./functions/m31SolicitarAcesso/entry";
import f190 from "./functions/m31SuporteObservador/entry";
import f191 from "./functions/m31UazapiStatus/entry";
import f192 from "./functions/m31ValidarEntregaConfirmacao/entry";
import f193 from "./functions/m31ValidarRecuperacao7Dias/entry";
import f194 from "./functions/m31ValidarRecuperacaoCheckouts/entry";
import f195 from "./functions/m31VerificarDuplicidade/entry";
import f196 from "./functions/m31VerificarGapsRiscoResetados/entry";
import f197 from "./functions/m31VerificarMensagensCobranca/entry";
import f198 from "./functions/m31VerificarPagamentoCPF/entry";
import f199 from "./functions/m31VerificarParcelamentos/entry";
import f200 from "./functions/m31VincularPagamentoManual/entry";
import f201 from "./functions/m31VoluntarioPayment/entry";
import f202 from "./functions/m31WhatsAppService/entry";
export const handlers = {
 "m31-caravana-diagnostico": f0,
 "m31-caravana-flow": f1,
 "m31-caravana-recuperacao": f2,
 "m31-caravana-v2": f3,
 "m31AbrirSessaoOperacional": f4,
 "m31AdicionarGrupo74": f5,
 "m31AlertarGestor": f6,
 "m31AlertarPagamentoOrfao": f7,
 "m31AmostragemAuditoria": f8,
 "m31AprovarRecuperacao": f9,
 "m31AprovarSolicitacao": f10,
 "m31AsaasNotificacoes": f11,
 "m31AsaasWebhook": f12,
 "m31AtribuirOrdemOperacional": f13,
 "m31AuditarConversaoGrupo": f14,
 "m31AuditarEncerrados": f15,
 "m31AuditarGapQR": f16,
 "m31AuditarGapsLogs": f17,
 "m31AuditarPagamentosAsaas": f18,
 "m31AuditarRecuperar72h": f19,
 "m31AuditarSincroniaCodigos": f20,
 "m31AuditarWebhookAsaas": f21,
 "m31AuditorAutomatico": f22,
 "m31AuditoriaCompleta": f23,
 "m31AuditoriaCompleta403": f24,
 "m31AuditoriaGrupo": f25,
 "m31AuditoriaInscrita": f26,
 "m31AuditoriaIntercessao": f27,
 "m31AuditoriaPagamentoIntercessao": f28,
 "m31AuditoriaPagamentos72h": f29,
 "m31AuditoriaQRCode": f30,
 "m31AuditoriaReconciliacao5Dias": f31,
 "m31AuditoriaRecuperacao": f32,
 "m31AuditoriaWhatsAppCentralizado": f33,
 "m31AvisoCompraConfirmada": f34,
 "m31AvisoVoluntariaConfirmada": f35,
 "m31BackfillBillingType": f36,
 "m31BackfillPagamentoConfirmado": f37,
 "m31BackfillValorCartao": f38,
 "m31BackupGoogleDrive": f39,
 "m31BreakdownMetodosPagamento": f40,
 "m31BuscarComprovanteAsaas": f41,
 "m31BuscarGrupoIntercessao": f42,
 "m31BuscarJidGrupo": f43,
 "m31BuscarJulianna": f44,
 "m31BuscarPorTelefone": f45,
 "m31CalcularPrioridade": f46,
 "m31CamisaVendaPayment": f47,
 "m31CamisasOfertaPublica": f48,
 "m31CamisasOperacional": f49,
 "m31CancelarCadastroDuplicado": f50,
 "m31CancelarCobranca": f51,
 "m31CaravanaPayment": f52,
 "m31Cartinhas": f53,
 "m31CartinhasEspelho": f54,
 "m31CheckUazapiStatus": f55,
 "m31Checkin": f56,
 "m31ConciliacaoCanonica": f57,
 "m31ConcluirCadastroConvidada": f58,
 "m31ConcluirTransferencia": f59,
 "m31ConsultarAsaasPos28": f60,
 "m31ConsultarCadastroConvidada": f61,
 "m31ConsultarConfirmadosAsaas": f62,
 "m31ConsultarCustomerAsaas": f63,
 "m31ConsultarFalhaCheckout": f64,
 "m31ConsultarInscrita": f65,
 "m31ConsultarQuotaUazapi": f66,
 "m31ConsultarTransferencia": f67,
 "m31ContarRecovery": f68,
 "m31CorrigirGapsResetados": f69,
 "m31CorrigirLeads": f70,
 "m31CorrigirValoresAsaas": f71,
 "m31CreatePayment": f72,
 "m31CriarEdicao": f73,
 "m31CruzarNomesVoluntarias": f74,
 "m31DashboardSeguranca": f75,
 "m31DebugGrupos": f76,
 "m31DebugInvite": f77,
 "m31DebugMetadata": f78,
 "m31DebugMetadataDiscrepancia": f79,
 "m31DebugPendentes": f80,
 "m31DebugPhoneFormatos": f81,
 "m31DeletarInscricoesTeste": f82,
 "m31DespacharConfirmacoes": f83,
 "m31DespacharEmailsConfirmacao": f84,
 "m31DiagnosticarPaymentIdCompartilhado": f85,
 "m31DiagnosticarWebhook": f86,
 "m31DiagnosticoAsaasKey": f87,
 "m31DiagnosticoCpfBloqueados": f88,
 "m31DiagnosticoFinanceiroAsaas": f89,
 "m31DiagnosticoFluxoPagamento": f90,
 "m31DiagnosticoHigienizacao": f91,
 "m31DiagnosticoPagamentoSemInscricao": f92,
 "m31DiagnosticoRejeitadosGrupo": f93,
 "m31DiagnosticoSendMedia": f94,
 "m31DiagnosticoTentativasCartao": f95,
 "m31DispararVoluntarios": f96,
 "m31DisparoCobrancasPendentes": f97,
 "m31DispositivoCheckin": f98,
 "m31DrenarFila": f99,
 "m31EncerrarRegua": f100,
 "m31EnfileirarLoteGrupoPendentes": f101,
 "m31EnfileirarUltimos7Dias": f102,
 "m31EnviarBoasVindas": f103,
 "m31EnviarBoasVindasConvidada": f104,
 "m31EnviarComprovanteFornecedor": f105,
 "m31EnviarEmailExterno": f106,
 "m31EnviarLembreteTarefas": f107,
 "m31EnviarLinkCadastroConvidada": f108,
 "m31EnviarMensagemGovernada": f109,
 "m31ExtrairGrupoInscritadas": f110,
 "m31GarantirControleDiario": f111,
 "m31GerarCheckoutAdmin": f112,
 "m31GerarCobrancaAvulsa": f113,
 "m31GerarCobrancasLote1": f114,
 "m31GerarCupons": f115,
 "m31GerarLinkExcecao2Lote": f116,
 "m31GerarLinkTransferencia": f117,
 "m31GerarPixDireto": f118,
 "m31GetChurchId": f119,
 "m31HealthCheck": f120,
 "m31IdentificarOrigemTestes": f121,
 "m31ImportarParticipantes": f122,
 "m31ImportarPlanoMestre": f123,
 "m31LembreteVencimentoFornecedor": f124,
 "m31LiberadorFilaConfirmacoes": f125,
 "m31LiberarBoasVindasControlada": f126,
 "m31LimparTelefoneErrado": f127,
 "m31ListarAutomacoes": f128,
 "m31ListarDuplicadosRevisao": f129,
 "m31ListarIgrejasConhecidas": f130,
 "m31ListarParticipantesIntercessao": f131,
 "m31MarcarMembroGrupo": f132,
 "m31MensagemRecuperacaoManual": f133,
 "m31MesclarInscricaoDuplicada": f134,
 "m31MigrarCaravanas": f135,
 "m31MigrarEntradaGrupo": f136,
 "m31MigrarTarefasPlanoMestre": f137,
 "m31NegarSolicitacao": f138,
 "m31NotificarAtribuicaoTarefa": f139,
 "m31NotificarComentarioTarefa": f140,
 "m31NotificarInscricaoGrupo": f141,
 "m31NotificarStatusTarefa": f142,
 "m31OperarParticipante": f143,
 "m31PanoramaOperacional": f144,
 "m31PodeEnviarAutomacao": f145,
 "m31PreparacaoFilas": f146,
 "m31ProcessarWebhookAsaas": f147,
 "m31ReceberWebhookUazapi": f148,
 "m31ReconciliarAsaas": f149,
 "m31ReconciliarCodigos": f150,
 "m31ReconciliarConfirmacoes30min": f151,
 "m31ReconciliarDuplicatas": f152,
 "m31RecoveryBoasVindasGrupoB": f153,
 "m31RecuperarCheckout": f154,
 "m31RecuperarCheckoutsExpirados": f155,
 "m31RecuperarCheckoutsOrfaos": f156,
 "m31RecuperarFalhasTecnicas": f157,
 "m31RecuperarImpactadasLoteEsgotado": f158,
 "m31RecuperarInscricoesCritico": f159,
 "m31RecuperarLeads": f160,
 "m31RecuperarLinksPagamento": f161,
 "m31RecuperarPendentes15Dias": f162,
 "m31ReenviarCobranca": f163,
 "m31ReenviarEmail": f164,
 "m31ReenviarLinkGrupo": f165,
 "m31ReenviarLinkGrupoIndividual": f166,
 "m31ReenviarQRCode": f167,
 "m31RegistrarFalhaCheckout": f168,
 "m31RegistrarIntencao": f169,
 "m31ReguaAutomatica": f170,
 "m31ReguaFollowupGrupo": f171,
 "m31ReguaSegura": f172,
 "m31ReiniciarUazapi": f173,
 "m31RelatorioSincroniaAsaas": f174,
 "m31RelatorioWhatsAppCentralizado": f175,
 "m31RenderizarTemplate": f176,
 "m31ReprocessarBoasVindasPendentes": f177,
 "m31ResetPhantomBoasVindas": f178,
 "m31ResolverGrupo": f179,
 "m31ResolverInviteGrupo": f180,
 "m31ResumoCamisasDulce": f181,
 "m31ResumoOperacional": f182,
 "m31RetomarPagamento": f183,
 "m31ReverterExcecao2Lote": f184,
 "m31RotinaDuplicidades": f185,
 "m31SendWhatsApp": f186,
 "m31SimularWebhookTeste": f187,
 "m31SnapshotGrupo": f188,
 "m31SolicitarAcesso": f189,
 "m31SuporteObservador": f190,
 "m31UazapiStatus": f191,
 "m31ValidarEntregaConfirmacao": f192,
 "m31ValidarRecuperacao7Dias": f193,
 "m31ValidarRecuperacaoCheckouts": f194,
 "m31VerificarDuplicidade": f195,
 "m31VerificarGapsRiscoResetados": f196,
 "m31VerificarMensagensCobranca": f197,
 "m31VerificarPagamentoCPF": f198,
 "m31VerificarParcelamentos": f199,
 "m31VincularPagamentoManual": f200,
 "m31VoluntarioPayment": f201,
 "m31WhatsAppService": f202
};
