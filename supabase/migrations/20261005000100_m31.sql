-- M31 independent schema. JSONB preserves undeclared historical fields.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.m31_entity_catalog(name text PRIMARY KEY, table_name text UNIQUE NOT NULL);
CREATE TABLE public.m31_identities(auth_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, legacy_user_id text UNIQUE NOT NULL, email text UNIQUE NOT NULL, full_name text NOT NULL DEFAULT '', member_id text, active boolean NOT NULL DEFAULT true);
ALTER TABLE public.m31_identities ENABLE ROW LEVEL SECURITY;
CREATE POLICY identity_self ON public.m31_identities FOR SELECT TO authenticated USING (auth_id=auth.uid());
CREATE TABLE public.m31_changes(sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, entity text NOT NULL, record_id text NOT NULL, operation text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.m31_changes ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.m31_outbox(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), dedup_key text UNIQUE NOT NULL, function_name text NOT NULL, args jsonb NOT NULL DEFAULT '{}', status text NOT NULL DEFAULT 'pending', available_at timestamptz NOT NULL DEFAULT now(), attempts integer NOT NULL DEFAULT 0, lease_until timestamptz, error_code text, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.m31_outbox ENABLE ROW LEVEL SECURITY;
CREATE INDEX outbox_due ON public.m31_outbox(status,available_at);
CREATE TABLE public.m31_workflows(id text PRIMARY KEY, name text NOT NULL, definition jsonb NOT NULL, enabled boolean NOT NULL DEFAULT false, next_run_at timestamptz, run_count bigint NOT NULL DEFAULT 0, last_run_at timestamptz, last_error text);
ALTER TABLE public.m31_workflows ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.m31_operations(key text PRIMARY KEY, scope text NOT NULL, input_hash text NOT NULL, status text NOT NULL DEFAULT 'processing', response jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.m31_operations ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.m31_provider_attempts(key text PRIMARY KEY, provider text NOT NULL, status text NOT NULL DEFAULT 'started', response jsonb, response_status integer, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.m31_provider_attempts ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.m31_files(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket text NOT NULL, path text UNIQUE NOT NULL, owner_id uuid REFERENCES auth.users(id), purpose text NOT NULL, original_name text NOT NULL, mime_type text NOT NULL, size bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.m31_files ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.m31_rate_limits(key text PRIMARY KEY, window_start timestamptz NOT NULL, hits integer NOT NULL DEFAULT 1);
ALTER TABLE public.m31_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.m31_brand_settings(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"logo_url" text GENERATED ALWAYS AS (payload->>'logo_url') STORED,
"logo_dark_url" text GENERATED ALWAYS AS (payload->>'logo_dark_url') STORED,
"logo_alt" text GENERATED ALWAYS AS (payload->>'logo_alt') STORED,
"favicon_url" text GENERATED ALWAYS AS (payload->>'favicon_url') STORED,
"updated_by_id" text GENERATED ALWAYS AS (payload->>'updated_by_id') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('BrandSettings','m31_brand_settings');
ALTER TABLE public.m31_brand_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.m31_church(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"name" text GENERATED ALWAYS AS (payload->>'name') STORED,
"slug" text GENERATED ALWAYS AS (payload->>'slug') STORED,
"network_id" text GENERATED ALWAYS AS (payload->>'network_id') STORED,
"pastor_name" text GENERATED ALWAYS AS (payload->>'pastor_name') STORED,
"pastor_email" text GENERATED ALWAYS AS (payload->>'pastor_email') STORED,
"logo_url" text GENERATED ALWAYS AS (payload->>'logo_url') STORED,
"address" text GENERATED ALWAYS AS (payload->>'address') STORED,
"cep" text GENERATED ALWAYS AS (payload->>'cep') STORED,
"city" text GENERATED ALWAYS AS (payload->>'city') STORED,
"state" text GENERATED ALWAYS AS (payload->>'state') STORED,
"phone" text GENERATED ALWAYS AS (payload->>'phone') STORED,
"whatsapp" text GENERATED ALWAYS AS (payload->>'whatsapp') STORED,
"instagram" text GENERATED ALWAYS AS (payload->>'instagram') STORED,
"youtube" text GENERATED ALWAYS AS (payload->>'youtube') STORED,
"pix_key" text GENERATED ALWAYS AS (payload->>'pix_key') STORED,
"pix_type" text GENERATED ALWAYS AS (payload->>'pix_type') STORED,
"pix_name" text GENERATED ALWAYS AS (payload->>'pix_name') STORED,
"bank_name" text GENERATED ALWAYS AS (payload->>'bank_name') STORED,
"bank_agency" text GENERATED ALWAYS AS (payload->>'bank_agency') STORED,
"bank_account" text GENERATED ALWAYS AS (payload->>'bank_account') STORED,
"bank_account_type" text GENERATED ALWAYS AS (payload->>'bank_account_type') STORED,
"bank_holder_name" text GENERATED ALWAYS AS (payload->>'bank_holder_name') STORED,
"asaas_api_key" text GENERATED ALWAYS AS (payload->>'asaas_api_key') STORED,
"asaas_environment" text GENERATED ALWAYS AS (payload->>'asaas_environment') STORED,
"asaas_wallet_id" text GENERATED ALWAYS AS (payload->>'asaas_wallet_id') STORED,
"asaas_webhook_token" text GENERATED ALWAYS AS (payload->>'asaas_webhook_token') STORED,
"cell_group_name" text GENERATED ALWAYS AS (payload->>'cell_group_name') STORED,
"category_1_name" text GENERATED ALWAYS AS (payload->>'category_1_name') STORED,
"category_2_name" text GENERATED ALWAYS AS (payload->>'category_2_name') STORED,
"category_3_name" text GENERATED ALWAYS AS (payload->>'category_3_name') STORED,
"birthday_message_template" text GENERATED ALWAYS AS (payload->>'birthday_message_template') STORED,
"welcome_message_template" text GENERATED ALWAYS AS (payload->>'welcome_message_template') STORED,
"kids_active_rooms" jsonb GENERATED ALWAYS AS (payload->'kids_active_rooms') STORED,
"kids_room_cameras" jsonb GENERATED ALWAYS AS (payload->'kids_room_cameras') STORED,
"kids_label_config" jsonb GENERATED ALWAYS AS (payload->'kids_label_config') STORED,
"subscription_plan" text GENERATED ALWAYS AS (payload->>'subscription_plan') STORED,
"subscription_status" text GENERATED ALWAYS AS (payload->>'subscription_status') STORED,
"subscription_expires_at" text GENERATED ALWAYS AS (payload->>'subscription_expires_at') STORED,
"subscription_blocked_at" text GENERATED ALWAYS AS (payload->>'subscription_blocked_at') STORED,
"max_menu_items" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'max_menu_items')='number' THEN (payload->>'max_menu_items')::numeric END) STORED,
"active" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'active')='boolean' THEN (payload->>'active')::boolean END) STORED);
INSERT INTO public.m31_entity_catalog VALUES ('Church','m31_church');
ALTER TABLE public.m31_church ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.m31_conta_pagar(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO public.m31_entity_catalog VALUES ('ContaPagar','m31_conta_pagar');
ALTER TABLE public.m31_conta_pagar ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.m31_conta_receber(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO public.m31_entity_catalog VALUES ('ContaReceber','m31_conta_receber');
ALTER TABLE public.m31_conta_receber ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.m31_event_page_config(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"event_key" text GENERATED ALWAYS AS (payload->>'event_key') STORED,
"event_name" text GENERATED ALWAYS AS (payload->>'event_name') STORED,
"status" text GENERATED ALWAYS AS (payload->>'status') STORED,
"landing_json" jsonb GENERATED ALWAYS AS (payload->'landing_json') STORED,
"form_json" jsonb GENERATED ALWAYS AS (payload->'form_json') STORED,
"updated_by_name" text GENERATED ALWAYS AS (payload->>'updated_by_name') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('EventPageConfig','m31_event_page_config');
ALTER TABLE public.m31_event_page_config ENABLE ROW LEVEL SECURITY;

CREATE INDEX ON public.m31_event_page_config("status");

CREATE TABLE public.m31_evento_m31_action_log(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"user_email" text GENERATED ALWAYS AS (payload->>'user_email') STORED,
"user_nome" text GENERATED ALWAYS AS (payload->>'user_nome') STORED,
"user_perfil" text GENERATED ALWAYS AS (payload->>'user_perfil') STORED,
"acao" text GENERATED ALWAYS AS (payload->>'acao') STORED,
"modulo" text GENERATED ALWAYS AS (payload->>'modulo') STORED,
"entidade_id" text GENERATED ALWAYS AS (payload->>'entidade_id') STORED,
"entidade_nome" text GENERATED ALWAYS AS (payload->>'entidade_nome') STORED,
"dados_anteriores" text GENERATED ALWAYS AS (payload->>'dados_anteriores') STORED,
"ip_address" text GENERATED ALWAYS AS (payload->>'ip_address') STORED,
"impersonado_por" text GENERATED ALWAYS AS (payload->>'impersonado_por') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('EventoM31ActionLog','m31_evento_m31_action_log');
ALTER TABLE public.m31_evento_m31_action_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX ON public.m31_evento_m31_action_log("user_email");

CREATE TABLE public.m31_evento_m31_camisa_estoque(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"modelo" text GENERATED ALWAYS AS (payload->>'modelo') STORED,
"tamanho" text GENERATED ALWAYS AS (payload->>'tamanho') STORED,
"quantidade" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'quantidade')='number' THEN (payload->>'quantidade')::numeric END) STORED,
"atualizado_por" text GENERATED ALWAYS AS (payload->>'atualizado_por') STORED,
"atualizado_em" text GENERATED ALWAYS AS (payload->>'atualizado_em') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('EventoM31CamisaEstoque','m31_evento_m31_camisa_estoque');
ALTER TABLE public.m31_evento_m31_camisa_estoque ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.m31_evento_m31_camisa_pedido(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"pedido_token" text GENERATED ALWAYS AS (payload->>'pedido_token') STORED,
"numero_pedido" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'numero_pedido')='number' THEN (payload->>'numero_pedido')::numeric END) STORED,
"nome" text GENERATED ALWAYS AS (payload->>'nome') STORED,
"whatsapp" text GENERATED ALWAYS AS (payload->>'whatsapp') STORED,
"email" text GENERATED ALWAYS AS (payload->>'email') STORED,
"ja_inscrita_m31" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'ja_inscrita_m31')='boolean' THEN (payload->>'ja_inscrita_m31')::boolean END) STORED,
"inscricao_m31_declarada_em" text GENERATED ALWAYS AS (payload->>'inscricao_m31_declarada_em') STORED,
"itens" jsonb GENERATED ALWAYS AS (payload->'itens') STORED,
"quantidade" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'quantidade')='number' THEN (payload->>'quantidade')::numeric END) STORED,
"valor_total" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'valor_total')='number' THEN (payload->>'valor_total')::numeric END) STORED,
"status_pagamento" text GENERATED ALWAYS AS (payload->>'status_pagamento') STORED,
"asaas_checkout_id" text GENERATED ALWAYS AS (payload->>'asaas_checkout_id') STORED,
"asaas_payment_id" text GENERATED ALWAYS AS (payload->>'asaas_payment_id') STORED,
"asaas_installment_id" text GENERATED ALWAYS AS (payload->>'asaas_installment_id') STORED,
"asaas_charge_url" text GENERATED ALWAYS AS (payload->>'asaas_charge_url') STORED,
"pagamento_confirmado_em" text GENERATED ALWAYS AS (payload->>'pagamento_confirmado_em') STORED,
"external_reference" text GENERATED ALWAYS AS (payload->>'external_reference') STORED,
"origem" text GENERATED ALWAYS AS (payload->>'origem') STORED,
"observacoes" text GENERATED ALWAYS AS (payload->>'observacoes') STORED,
"pedido_versao" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'pedido_versao')='number' THEN (payload->>'pedido_versao')::numeric END) STORED,
"itens_cobrados" jsonb GENERATED ALWAYS AS (payload->'itens_cobrados') STORED,
"cobranca_fingerprint" text GENERATED ALWAYS AS (payload->>'cobranca_fingerprint') STORED,
"cobranca_estado" text GENERATED ALWAYS AS (payload->>'cobranca_estado') STORED,
"cobranca_tentativa_id" text GENERATED ALWAYS AS (payload->>'cobranca_tentativa_id') STORED,
"cobranca_iniciada_em" text GENERATED ALWAYS AS (payload->>'cobranca_iniciada_em') STORED,
"cobranca_enviada_em" text GENERATED ALWAYS AS (payload->>'cobranca_enviada_em') STORED,
"cobranca_erro" text GENERATED ALWAYS AS (payload->>'cobranca_erro') STORED,
"revisao_solicitada" jsonb GENERATED ALWAYS AS (payload->'revisao_solicitada') STORED,
"financeiro_verificado_em" text GENERATED ALWAYS AS (payload->>'financeiro_verificado_em') STORED,
"financeiro_status_provedor" text GENERATED ALWAYS AS (payload->>'financeiro_status_provedor') STORED,
"pedido_substituido_por_id" text GENERATED ALWAYS AS (payload->>'pedido_substituido_por_id') STORED,
"pedido_substituido_em" text GENERATED ALWAYS AS (payload->>'pedido_substituido_em') STORED,
"substitui_pedido_id" text GENERATED ALWAYS AS (payload->>'substitui_pedido_id') STORED,
"aviso_dulce_status" text GENERATED ALWAYS AS (payload->>'aviso_dulce_status') STORED,
"aviso_dulce_message_id" text GENERATED ALWAYS AS (payload->>'aviso_dulce_message_id') STORED,
"aviso_dulce_enviado_em" text GENERATED ALWAYS AS (payload->>'aviso_dulce_enviado_em') STORED,
"aviso_dulce_fila_id" text GENERATED ALWAYS AS (payload->>'aviso_dulce_fila_id') STORED,
"aviso_dulce_claim" text GENERATED ALWAYS AS (payload->>'aviso_dulce_claim') STORED,
"aviso_dulce_claim_em" text GENERATED ALWAYS AS (payload->>'aviso_dulce_claim_em') STORED,
"aviso_dulce_erro" text GENERATED ALWAYS AS (payload->>'aviso_dulce_erro') STORED,
"aviso_novo_pedido_status" text GENERATED ALWAYS AS (payload->>'aviso_novo_pedido_status') STORED,
"aviso_novo_pedido_fila_id" text GENERATED ALWAYS AS (payload->>'aviso_novo_pedido_fila_id') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('EventoM31CamisaPedido','m31_evento_m31_camisa_pedido');
ALTER TABLE public.m31_evento_m31_camisa_pedido ENABLE ROW LEVEL SECURITY;

CREATE INDEX ON public.m31_evento_m31_camisa_pedido("email");

CREATE TABLE public.m31_evento_m31_caravana(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"nome" text GENERATED ALWAYS AS (payload->>'nome') STORED,
"lider_nome" text GENERATED ALWAYS AS (payload->>'lider_nome') STORED,
"lider_email" text GENERATED ALWAYS AS (payload->>'lider_email') STORED,
"lider_whatsapp" text GENERATED ALWAYS AS (payload->>'lider_whatsapp') STORED,
"cidade_origem" text GENERATED ALWAYS AS (payload->>'cidade_origem') STORED,
"total_membros" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'total_membros')='number' THEN (payload->>'total_membros')::numeric END) STORED,
"observacoes" text GENERATED ALWAYS AS (payload->>'observacoes') STORED,
"ativa" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'ativa')='boolean' THEN (payload->>'ativa')::boolean END) STORED,
"ordem" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'ordem')='number' THEN (payload->>'ordem')::numeric END) STORED);
INSERT INTO public.m31_entity_catalog VALUES ('EventoM31Caravana','m31_evento_m31_caravana');
ALTER TABLE public.m31_evento_m31_caravana ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.m31_evento_m31_checklist_item(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"area" text GENERATED ALWAYS AS (payload->>'area') STORED,
"item" text GENERATED ALWAYS AS (payload->>'item') STORED,
"fornecedor_nome" text GENERATED ALWAYS AS (payload->>'fornecedor_nome') STORED,
"fornecedor_id" text GENERATED ALWAYS AS (payload->>'fornecedor_id') STORED,
"responsavel" text GENERATED ALWAYS AS (payload->>'responsavel') STORED,
"custo_previsto" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'custo_previsto')='number' THEN (payload->>'custo_previsto')::numeric END) STORED,
"financeiro_texto" text GENERATED ALWAYS AS (payload->>'financeiro_texto') STORED,
"observacao" text GENERATED ALWAYS AS (payload->>'observacao') STORED,
"status" text GENERATED ALWAYS AS (payload->>'status') STORED,
"lote_importacao" text GENERATED ALWAYS AS (payload->>'lote_importacao') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('EventoM31ChecklistItem','m31_evento_m31_checklist_item');
ALTER TABLE public.m31_evento_m31_checklist_item ENABLE ROW LEVEL SECURITY;

CREATE INDEX ON public.m31_evento_m31_checklist_item("status");

CREATE TABLE public.m31_evento_m31_config(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"telefones_autorizados" jsonb GENERATED ALWAYS AS (payload->'telefones_autorizados') STORED,
"whatsapp_dulce" text GENERATED ALWAYS AS (payload->>'whatsapp_dulce') STORED,
"whatsapp_edilandia" text GENERATED ALWAYS AS (payload->>'whatsapp_edilandia') STORED,
"modo_envio_boas_vindas" text GENERATED ALWAYS AS (payload->>'modo_envio_boas_vindas') STORED,
"telefone_teste_autorizado" text GENERATED ALWAYS AS (payload->>'telefone_teste_autorizado') STORED,
"go_live_corte_em" text GENERATED ALWAYS AS (payload->>'go_live_corte_em') STORED,
"webhook_resposta_uazapi_ativo" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'webhook_resposta_uazapi_ativo')='boolean' THEN (payload->>'webhook_resposta_uazapi_ativo')::boolean END) STORED,
"camisas_order_bump_ativo" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'camisas_order_bump_ativo')='boolean' THEN (payload->>'camisas_order_bump_ativo')::boolean END) STORED,
"camisas_preco_promocional" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'camisas_preco_promocional')='number' THEN (payload->>'camisas_preco_promocional')::numeric END) STORED,
"camisas_modelos_ativos" jsonb GENERATED ALWAYS AS (payload->'camisas_modelos_ativos') STORED,
"camisas_pre_venda_ativo" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'camisas_pre_venda_ativo')='boolean' THEN (payload->>'camisas_pre_venda_ativo')::boolean END) STORED,
"camisas_pre_venda_preco_unitario" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'camisas_pre_venda_preco_unitario')='number' THEN (payload->>'camisas_pre_venda_preco_unitario')::numeric END) STORED,
"camisas_pre_venda_preco_promocional" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'camisas_pre_venda_preco_promocional')='number' THEN (payload->>'camisas_pre_venda_preco_promocional')::numeric END) STORED,
"camisas_pre_venda_promo_ate" text GENERATED ALWAYS AS (payload->>'camisas_pre_venda_promo_ate') STORED,
"camisas_pre_venda_preco_1" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'camisas_pre_venda_preco_1')='number' THEN (payload->>'camisas_pre_venda_preco_1')::numeric END) STORED,
"camisas_pre_venda_preco_2" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'camisas_pre_venda_preco_2')='number' THEN (payload->>'camisas_pre_venda_preco_2')::numeric END) STORED,
"camisas_pre_venda_preco_3" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'camisas_pre_venda_preco_3')='number' THEN (payload->>'camisas_pre_venda_preco_3')::numeric END) STORED,
"camisas_pre_venda_modelos_ativos" jsonb GENERATED ALWAYS AS (payload->'camisas_pre_venda_modelos_ativos') STORED,
"cartinha_data_evento" text GENERATED ALWAYS AS (payload->>'cartinha_data_evento') STORED,
"cartinha_meta_diaria" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'cartinha_meta_diaria')='number' THEN (payload->>'cartinha_meta_diaria')::numeric END) STORED,
"cartinha_estilo_exemplos" jsonb GENERATED ALWAYS AS (payload->'cartinha_estilo_exemplos') STORED,
"data_limite_transferencia" text GENERATED ALWAYS AS (payload->>'data_limite_transferencia') STORED,
"cartinha_autora_user_id" text GENERATED ALWAYS AS (payload->>'cartinha_autora_user_id') STORED,
"cartinha_lote_liberado" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'cartinha_lote_liberado')='boolean' THEN (payload->>'cartinha_lote_liberado')::boolean END) STORED,
"cartinha_lote_auditoria" jsonb GENERATED ALWAYS AS (payload->'cartinha_lote_auditoria') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('EventoM31Config','m31_evento_m31_config');
ALTER TABLE public.m31_evento_m31_config ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.m31_evento_m31_configuracao(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"titulo" text GENERATED ALWAYS AS (payload->>'titulo') STORED,
"descricao" text GENERATED ALWAYS AS (payload->>'descricao') STORED,
"data_inicio" text GENERATED ALWAYS AS (payload->>'data_inicio') STORED,
"data_fim" text GENERATED ALWAYS AS (payload->>'data_fim') STORED,
"local" text GENERATED ALWAYS AS (payload->>'local') STORED,
"cidade" text GENERATED ALWAYS AS (payload->>'cidade') STORED,
"estado" text GENERATED ALWAYS AS (payload->>'estado') STORED,
"preletores" jsonb GENERATED ALWAYS AS (payload->'preletores') STORED,
"perguntar_congregacao" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'perguntar_congregacao')='boolean' THEN (payload->>'perguntar_congregacao')::boolean END) STORED,
"perguntar_tamanho_camiseta" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'perguntar_tamanho_camiseta')='boolean' THEN (payload->>'perguntar_tamanho_camiseta')::boolean END) STORED,
"perguntar_cidade_origem" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'perguntar_cidade_origem')='boolean' THEN (payload->>'perguntar_cidade_origem')::boolean END) STORED,
"perguntar_estado" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'perguntar_estado')='boolean' THEN (payload->>'perguntar_estado')::boolean END) STORED,
"perguntar_como_conheceu" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'perguntar_como_conheceu')='boolean' THEN (payload->>'perguntar_como_conheceu')::boolean END) STORED,
"perguntar_ja_participou" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'perguntar_ja_participou')='boolean' THEN (payload->>'perguntar_ja_participou')::boolean END) STORED,
"perguntar_faz_parte_igreja" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'perguntar_faz_parte_igreja')='boolean' THEN (payload->>'perguntar_faz_parte_igreja')::boolean END) STORED,
"perguntar_nome_igreja" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'perguntar_nome_igreja')='boolean' THEN (payload->>'perguntar_nome_igreja')::boolean END) STORED,
"campos_extras" jsonb GENERATED ALWAYS AS (payload->'campos_extras') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('EventoM31Configuracao','m31_evento_m31_configuracao');
ALTER TABLE public.m31_evento_m31_configuracao ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.m31_evento_m31_cronograma(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"ordem" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'ordem')='number' THEN (payload->>'ordem')::numeric END) STORED,
"hora_inicio_original" text GENERATED ALWAYS AS (payload->>'hora_inicio_original') STORED,
"hora_inicio_normalizada" text GENERATED ALWAYS AS (payload->>'hora_inicio_normalizada') STORED,
"hora_fim_original" text GENERATED ALWAYS AS (payload->>'hora_fim_original') STORED,
"programacao" text GENERATED ALWAYS AS (payload->>'programacao') STORED,
"telao" text GENERATED ALWAYS AS (payload->>'telao') STORED,
"responsavel" text GENERATED ALWAYS AS (payload->>'responsavel') STORED,
"cena" text GENERATED ALWAYS AS (payload->>'cena') STORED,
"area" text GENERATED ALWAYS AS (payload->>'area') STORED,
"ambiente" text GENERATED ALWAYS AS (payload->>'ambiente') STORED,
"status" text GENERATED ALWAYS AS (payload->>'status') STORED,
"observacao" text GENERATED ALWAYS AS (payload->>'observacao') STORED,
"e_continuacao" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'e_continuacao')='boolean' THEN (payload->>'e_continuacao')::boolean END) STORED,
"lote_importacao" text GENERATED ALWAYS AS (payload->>'lote_importacao') STORED,
"media_url" text GENERATED ALWAYS AS (payload->>'media_url') STORED,
"media_tipo" text GENERATED ALWAYS AS (payload->>'media_tipo') STORED,
"media_vinculada" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'media_vinculada')='boolean' THEN (payload->>'media_vinculada')::boolean END) STORED);
INSERT INTO public.m31_entity_catalog VALUES ('EventoM31Cronograma','m31_evento_m31_cronograma');
ALTER TABLE public.m31_evento_m31_cronograma ENABLE ROW LEVEL SECURITY;

CREATE INDEX ON public.m31_evento_m31_cronograma("status");

CREATE TABLE public.m31_evento_m31_cupom(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"codigo" text GENERATED ALWAYS AS (payload->>'codigo') STORED,
"descricao" text GENERATED ALWAYS AS (payload->>'descricao') STORED,
"usado" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'usado')='boolean' THEN (payload->>'usado')::boolean END) STORED,
"usado_por_email" text GENERATED ALWAYS AS (payload->>'usado_por_email') STORED,
"usado_em" text GENERATED ALWAYS AS (payload->>'usado_em') STORED,
"inscricao_id" text GENERATED ALWAYS AS (payload->>'inscricao_id') STORED,
"gerado_por" text GENERATED ALWAYS AS (payload->>'gerado_por') STORED,
"batch" text GENERATED ALWAYS AS (payload->>'batch') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('EventoM31Cupom','m31_evento_m31_cupom');
ALTER TABLE public.m31_evento_m31_cupom ENABLE ROW LEVEL SECURITY;

CREATE INDEX ON public.m31_evento_m31_cupom("inscricao_id");

CREATE TABLE public.m31_evento_m31_inscricao(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"nome" text GENERATED ALWAYS AS (payload->>'nome') STORED,
"email" text GENERATED ALWAYS AS (payload->>'email') STORED,
"whatsapp" text GENERATED ALWAYS AS (payload->>'whatsapp') STORED,
"cpf" text GENERATED ALWAYS AS (payload->>'cpf') STORED,
"cidade" text GENERATED ALWAYS AS (payload->>'cidade') STORED,
"estado" text GENERATED ALWAYS AS (payload->>'estado') STORED,
"faz_parte_igreja" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'faz_parte_igreja')='boolean' THEN (payload->>'faz_parte_igreja')::boolean END) STORED,
"nome_igreja" text GENERATED ALWAYS AS (payload->>'nome_igreja') STORED,
"ja_participou_m31" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'ja_participou_m31')='boolean' THEN (payload->>'ja_participou_m31')::boolean END) STORED,
"como_conheceu" text GENERATED ALWAYS AS (payload->>'como_conheceu') STORED,
"tipo" text GENERATED ALWAYS AS (payload->>'tipo') STORED,
"origem_inscricao" text GENERATED ALWAYS AS (payload->>'origem_inscricao') STORED,
"origem_pagamento" text GENERATED ALWAYS AS (payload->>'origem_pagamento') STORED,
"dedup_key" text GENERATED ALWAYS AS (payload->>'dedup_key') STORED,
"ordem_operacional" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'ordem_operacional')='number' THEN (payload->>'ordem_operacional')::numeric END) STORED,
"estado_canonico" text GENERATED ALWAYS AS (payload->>'estado_canonico') STORED,
"evidencia_canonica" text GENERATED ALWAYS AS (payload->>'evidencia_canonica') STORED,
"qualidade_evidencia" text GENERATED ALWAYS AS (payload->>'qualidade_evidencia') STORED,
"duplicada_de_id" text GENERATED ALWAYS AS (payload->>'duplicada_de_id') STORED,
"financia_vagas_ids" jsonb GENERATED ALWAYS AS (payload->'financia_vagas_ids') STORED,
"canonica_calculada_em" text GENERATED ALWAYS AS (payload->>'canonica_calculada_em') STORED,
"lote" text GENERATED ALWAYS AS (payload->>'lote') STORED,
"valor_pago" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'valor_pago')='number' THEN (payload->>'valor_pago')::numeric END) STORED,
"status_pagamento" text GENERATED ALWAYS AS (payload->>'status_pagamento') STORED,
"etapa_funil" text GENERATED ALWAYS AS (payload->>'etapa_funil') STORED,
"etapa_funil_em" text GENERATED ALWAYS AS (payload->>'etapa_funil_em') STORED,
"ultima_acao" text GENERATED ALWAYS AS (payload->>'ultima_acao') STORED,
"revisao_dados" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'revisao_dados')='boolean' THEN (payload->>'revisao_dados')::boolean END) STORED,
"revisao_motivos" jsonb GENERATED ALWAYS AS (payload->'revisao_motivos') STORED,
"revisao_valores_originais" text GENERATED ALWAYS AS (payload->>'revisao_valores_originais') STORED,
"revisao_em" text GENERATED ALWAYS AS (payload->>'revisao_em') STORED,
"falha_tecnica" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'falha_tecnica')='boolean' THEN (payload->>'falha_tecnica')::boolean END) STORED,
"falha_tecnica_em" text GENERATED ALWAYS AS (payload->>'falha_tecnica_em') STORED,
"falha_tecnica_etapa" text GENERATED ALWAYS AS (payload->>'falha_tecnica_etapa') STORED,
"falha_tecnica_http" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'falha_tecnica_http')='number' THEN (payload->>'falha_tecnica_http')::numeric END) STORED,
"falha_tecnica_erro" text GENERATED ALWAYS AS (payload->>'falha_tecnica_erro') STORED,
"retomada_token" text GENERATED ALWAYS AS (payload->>'retomada_token') STORED,
"gateway" text GENERATED ALWAYS AS (payload->>'gateway') STORED,
"gateway_payment_id" text GENERATED ALWAYS AS (payload->>'gateway_payment_id') STORED,
"gateway_order_id" text GENERATED ALWAYS AS (payload->>'gateway_order_id') STORED,
"gateway_checkout_url" text GENERATED ALWAYS AS (payload->>'gateway_checkout_url') STORED,
"gateway_external_reference" text GENERATED ALWAYS AS (payload->>'gateway_external_reference') STORED,
"valor_base" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'valor_base')='number' THEN (payload->>'valor_base')::numeric END) STORED,
"valor_cobrado" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'valor_cobrado')='number' THEN (payload->>'valor_cobrado')::numeric END) STORED,
"taxa_repassada" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'taxa_repassada')='number' THEN (payload->>'taxa_repassada')::numeric END) STORED,
"asaas_payment_id" text GENERATED ALWAYS AS (payload->>'asaas_payment_id') STORED,
"asaas_installment_id" text GENERATED ALWAYS AS (payload->>'asaas_installment_id') STORED,
"asaas_charge_url" text GENERATED ALWAYS AS (payload->>'asaas_charge_url') STORED,
"asaas_checkout_id" text GENERATED ALWAYS AS (payload->>'asaas_checkout_id') STORED,
"asaas_checkout_status" text GENERATED ALWAYS AS (payload->>'asaas_checkout_status') STORED,
"asaas_billing_type" text GENERATED ALWAYS AS (payload->>'asaas_billing_type') STORED,
"asaas_installment_count" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'asaas_installment_count')='number' THEN (payload->>'asaas_installment_count')::numeric END) STORED,
"asaas_installment_value" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'asaas_installment_value')='number' THEN (payload->>'asaas_installment_value')::numeric END) STORED,
"asaas_total_value" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'asaas_total_value')='number' THEN (payload->>'asaas_total_value')::numeric END) STORED,
"pagador_nome" text GENERATED ALWAYS AS (payload->>'pagador_nome') STORED,
"presenteado_id" text GENERATED ALWAYS AS (payload->>'presenteado_id') STORED,
"presenteado_por_id" text GENERATED ALWAYS AS (payload->>'presenteado_por_id') STORED,
"presenteado_whatsapp" text GENERATED ALWAYS AS (payload->>'presenteado_whatsapp') STORED,
"cadastro_pendente" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'cadastro_pendente')='boolean' THEN (payload->>'cadastro_pendente')::boolean END) STORED,
"presenteado_token" text GENERATED ALWAYS AS (payload->>'presenteado_token') STORED,
"presenteado_whatsapp_original" text GENERATED ALWAYS AS (payload->>'presenteado_whatsapp_original') STORED,
"presenteado_link_enviado_em" text GENERATED ALWAYS AS (payload->>'presenteado_link_enviado_em') STORED,
"conferida_manualmente" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'conferida_manualmente')='boolean' THEN (payload->>'conferida_manualmente')::boolean END) STORED,
"cartinha_status" text GENERATED ALWAYS AS (payload->>'cartinha_status') STORED,
"cartinha_texto" text GENERATED ALWAYS AS (payload->>'cartinha_texto') STORED,
"cartinha_responsavel" text GENERATED ALWAYS AS (payload->>'cartinha_responsavel') STORED,
"cartinha_atualizada_em" text GENERATED ALWAYS AS (payload->>'cartinha_atualizada_em') STORED,
"cartinha_entregue_em" text GENERATED ALWAYS AS (payload->>'cartinha_entregue_em') STORED,
"comprou_camisa" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'comprou_camisa')='boolean' THEN (payload->>'comprou_camisa')::boolean END) STORED,
"modelo_camisa" text GENERATED ALWAYS AS (payload->>'modelo_camisa') STORED,
"tamanho_camisa" text GENERATED ALWAYS AS (payload->>'tamanho_camisa') STORED,
"camisa_valor" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'camisa_valor')='number' THEN (payload->>'camisa_valor')::numeric END) STORED,
"camisa_status" text GENERATED ALWAYS AS (payload->>'camisa_status') STORED,
"camisa_pagamento_id" text GENERATED ALWAYS AS (payload->>'camisa_pagamento_id') STORED,
"camisa_estoque_baixado_em" text GENERATED ALWAYS AS (payload->>'camisa_estoque_baixado_em') STORED,
"camisa_estoque_claim_token" text GENERATED ALWAYS AS (payload->>'camisa_estoque_claim_token') STORED,
"camisa_pendencia" text GENERATED ALWAYS AS (payload->>'camisa_pendencia') STORED,
"camisas" jsonb GENERATED ALWAYS AS (payload->'camisas') STORED,
"cupom_usado" text GENERATED ALWAYS AS (payload->>'cupom_usado') STORED,
"cupom_valor_original" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'cupom_valor_original')='number' THEN (payload->>'cupom_valor_original')::numeric END) STORED,
"cupom_desconto" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'cupom_desconto')='number' THEN (payload->>'cupom_desconto')::numeric END) STORED,
"cupom_valor_final_ingresso" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'cupom_valor_final_ingresso')='number' THEN (payload->>'cupom_valor_final_ingresso')::numeric END) STORED,
"area_voluntario" text GENERATED ALWAYS AS (payload->>'area_voluntario') STORED,
"caravana_id" text GENERATED ALWAYS AS (payload->>'caravana_id') STORED,
"caravana_nome" text GENERATED ALWAYS AS (payload->>'caravana_nome') STORED,
"checkin_realizado" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'checkin_realizado')='boolean' THEN (payload->>'checkin_realizado')::boolean END) STORED,
"checkin_at" text GENERATED ALWAYS AS (payload->>'checkin_at') STORED,
"codigo_inscricao" text GENERATED ALWAYS AS (payload->>'codigo_inscricao') STORED,
"observacoes" text GENERATED ALWAYS AS (payload->>'observacoes') STORED,
"recovery_attempts" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'recovery_attempts')='number' THEN (payload->>'recovery_attempts')::numeric END) STORED,
"last_recovery_at" text GENERATED ALWAYS AS (payload->>'last_recovery_at') STORED,
"checkout_abandoned_at" text GENERATED ALWAYS AS (payload->>'checkout_abandoned_at') STORED,
"last_contact_at" text GENERATED ALWAYS AS (payload->>'last_contact_at') STORED,
"next_contact_at" text GENERATED ALWAYS AS (payload->>'next_contact_at') STORED,
"priority" text GENERATED ALWAYS AS (payload->>'priority') STORED,
"opt_out" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'opt_out')='boolean' THEN (payload->>'opt_out')::boolean END) STORED,
"current_stage" text GENERATED ALWAYS AS (payload->>'current_stage') STORED,
"data_envio_boas_vindas" text GENERATED ALWAYS AS (payload->>'data_envio_boas_vindas') STORED,
"email_envio_status" text GENERATED ALWAYS AS (payload->>'email_envio_status') STORED,
"email_boas_vindas_enviado_em" text GENERATED ALWAYS AS (payload->>'email_boas_vindas_enviado_em') STORED,
"status_envio_grupo" text GENERATED ALWAYS AS (payload->>'status_envio_grupo') STORED,
"entrou_no_grupo" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'entrou_no_grupo')='boolean' THEN (payload->>'entrou_no_grupo')::boolean END) STORED,
"data_entrada_grupo" text GENERATED ALWAYS AS (payload->>'data_entrada_grupo') STORED,
"entrou_no_grupo_em" text GENERATED ALWAYS AS (payload->>'entrou_no_grupo_em') STORED,
"saudacao_grupo_enviada" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'saudacao_grupo_enviada')='boolean' THEN (payload->>'saudacao_grupo_enviada')::boolean END) STORED,
"saudacao_grupo_enviada_em" text GENERATED ALWAYS AS (payload->>'saudacao_grupo_enviada_em') STORED,
"origem_confirmacao_grupo" text GENERATED ALWAYS AS (payload->>'origem_confirmacao_grupo') STORED,
"webhook_processando" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'webhook_processando')='boolean' THEN (payload->>'webhook_processando')::boolean END) STORED,
"fila_boas_vindas" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'fila_boas_vindas')='boolean' THEN (payload->>'fila_boas_vindas')::boolean END) STORED,
"fila_boas_vindas_em" text GENERATED ALWAYS AS (payload->>'fila_boas_vindas_em') STORED,
"qrcode_token" text GENERATED ALWAYS AS (payload->>'qrcode_token') STORED,
"qrcode_url" text GENERATED ALWAYS AS (payload->>'qrcode_url') STORED,
"qrcode_gerado_em" text GENERATED ALWAYS AS (payload->>'qrcode_gerado_em') STORED,
"qr_envio_status" text GENERATED ALWAYS AS (payload->>'qr_envio_status') STORED,
"qr_tentativas_envio" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'qr_tentativas_envio')='number' THEN (payload->>'qr_tentativas_envio')::numeric END) STORED,
"qr_ultimo_envio_em" text GENERATED ALWAYS AS (payload->>'qr_ultimo_envio_em') STORED,
"fila_recuperacao" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'fila_recuperacao')='boolean' THEN (payload->>'fila_recuperacao')::boolean END) STORED,
"fila_recuperacao_em" text GENERATED ALWAYS AS (payload->>'fila_recuperacao_em') STORED,
"status_fila_recuperacao" text GENERATED ALWAYS AS (payload->>'status_fila_recuperacao') STORED,
"boas_vindas_iniciada_em" text GENERATED ALWAYS AS (payload->>'boas_vindas_iniciada_em') STORED,
"liberada_para_envio" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'liberada_para_envio')='boolean' THEN (payload->>'liberada_para_envio')::boolean END) STORED,
"liberada_para_envio_em" text GENERATED ALWAYS AS (payload->>'liberada_para_envio_em') STORED,
"pagamento_confirmado_em" text GENERATED ALWAYS AS (payload->>'pagamento_confirmado_em') STORED,
"estado_jornada" text GENERATED ALWAYS AS (payload->>'estado_jornada') STORED,
"cartinha_suporte" text GENERATED ALWAYS AS (payload->>'cartinha_suporte') STORED,
"cartinha_fisica_confirmada_em" text GENERATED ALWAYS AS (payload->>'cartinha_fisica_confirmada_em') STORED,
"cartinha_dias_concluidos" jsonb GENERATED ALWAYS AS (payload->'cartinha_dias_concluidos') STORED,
"cartinha_espelho_pendente" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'cartinha_espelho_pendente')='boolean' THEN (payload->>'cartinha_espelho_pendente')::boolean END) STORED,
"cartinha_versao" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'cartinha_versao')='number' THEN (payload->>'cartinha_versao')::numeric END) STORED,
"cartinha_historico" jsonb GENERATED ALWAYS AS (payload->'cartinha_historico') STORED,
"cartinha_titular" jsonb GENERATED ALWAYS AS (payload->'cartinha_titular') STORED,
"cartinha_conhecida_da_ju" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'cartinha_conhecida_da_ju')='boolean' THEN (payload->>'cartinha_conhecida_da_ju')::boolean END) STORED,
"cartinha_personalizada" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'cartinha_personalizada')='boolean' THEN (payload->>'cartinha_personalizada')::boolean END) STORED,
"cartinha_conhecida_titular_ref" text GENERATED ALWAYS AS (payload->>'cartinha_conhecida_titular_ref') STORED,
"cartinha_entrada_id" text GENERATED ALWAYS AS (payload->>'cartinha_entrada_id') STORED,
"cartinha_item_id" text GENERATED ALWAYS AS (payload->>'cartinha_item_id') STORED,
"cartinha_modo" text GENERATED ALWAYS AS (payload->>'cartinha_modo') STORED,
"cartinha_audio_uri" text GENERATED ALWAYS AS (payload->>'cartinha_audio_uri') STORED,
"cartinha_tipo_destinataria" text GENERATED ALWAYS AS (payload->>'cartinha_tipo_destinataria') STORED,
"cartinha_assinatura" text GENERATED ALWAYS AS (payload->>'cartinha_assinatura') STORED,
"cartinha_primeiro_nome" text GENERATED ALWAYS AS (payload->>'cartinha_primeiro_nome') STORED,
"cartinha_formato_versao" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'cartinha_formato_versao')='number' THEN (payload->>'cartinha_formato_versao')::numeric END) STORED,
"cartinha_vinculo_bloqueado" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'cartinha_vinculo_bloqueado')='boolean' THEN (payload->>'cartinha_vinculo_bloqueado')::boolean END) STORED,
"cartinha_vinculo_auditoria" jsonb GENERATED ALWAYS AS (payload->'cartinha_vinculo_auditoria') STORED,
"payment_method" text GENERATED ALWAYS AS (payload->>'payment_method') STORED,
"installment_count" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'installment_count')='number' THEN (payload->>'installment_count')::numeric END) STORED);
INSERT INTO public.m31_entity_catalog VALUES ('EventoM31Inscricao','m31_evento_m31_inscricao');
ALTER TABLE public.m31_evento_m31_inscricao ENABLE ROW LEVEL SECURITY;

CREATE INDEX ON public.m31_evento_m31_inscricao("cpf");

CREATE INDEX ON public.m31_evento_m31_inscricao("email");

CREATE INDEX ON public.m31_evento_m31_inscricao("codigo_inscricao");

CREATE INDEX ON public.m31_evento_m31_inscricao("dedup_key");

CREATE TABLE public.m31_evento_m31_lote(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"nome" text GENERATED ALWAYS AS (payload->>'nome') STORED,
"codigo" text GENERATED ALWAYS AS (payload->>'codigo') STORED,
"valor" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'valor')='number' THEN (payload->>'valor')::numeric END) STORED,
"valor_caravana" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'valor_caravana')='number' THEN (payload->>'valor_caravana')::numeric END) STORED,
"promocional_caravana" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'promocional_caravana')='boolean' THEN (payload->>'promocional_caravana')::boolean END) STORED,
"vagas_total" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'vagas_total')='number' THEN (payload->>'vagas_total')::numeric END) STORED,
"vagas_usadas" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'vagas_usadas')='number' THEN (payload->>'vagas_usadas')::numeric END) STORED,
"data_inicio" text GENERATED ALWAYS AS (payload->>'data_inicio') STORED,
"data_fim" text GENERATED ALWAYS AS (payload->>'data_fim') STORED,
"ativo" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'ativo')='boolean' THEN (payload->>'ativo')::boolean END) STORED,
"ordem" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'ordem')='number' THEN (payload->>'ordem')::numeric END) STORED);
INSERT INTO public.m31_entity_catalog VALUES ('EventoM31Lote','m31_evento_m31_lote');
ALTER TABLE public.m31_evento_m31_lote ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.m31_evento_m31_membro(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"user_email" text GENERATED ALWAYS AS (payload->>'user_email') STORED,
"nome" text GENERATED ALWAYS AS (payload->>'nome') STORED,
"whatsapp" text GENERATED ALWAYS AS (payload->>'whatsapp') STORED,
"perfil" text GENERATED ALWAYS AS (payload->>'perfil') STORED,
"setor" text GENERATED ALWAYS AS (payload->>'setor') STORED,
"area" text GENERATED ALWAYS AS (payload->>'area') STORED,
"ativo" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'ativo')='boolean' THEN (payload->>'ativo')::boolean END) STORED,
"operacoes_permitidas" jsonb GENERATED ALWAYS AS (payload->'operacoes_permitidas') STORED,
"ultimo_acesso" text GENERATED ALWAYS AS (payload->>'ultimo_acesso') STORED,
"total_acessos" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'total_acessos')='number' THEN (payload->>'total_acessos')::numeric END) STORED,
"tempo_total_uso_minutos" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'tempo_total_uso_minutos')='number' THEN (payload->>'tempo_total_uso_minutos')::numeric END) STORED,
"pode_checkin" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'pode_checkin')='boolean' THEN (payload->>'pode_checkin')::boolean END) STORED,
"pode_ver_dashboard" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'pode_ver_dashboard')='boolean' THEN (payload->>'pode_ver_dashboard')::boolean END) STORED,
"pode_ver_inscricoes" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'pode_ver_inscricoes')='boolean' THEN (payload->>'pode_ver_inscricoes')::boolean END) STORED,
"pode_ver_financeiro" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'pode_ver_financeiro')='boolean' THEN (payload->>'pode_ver_financeiro')::boolean END) STORED,
"observacoes" text GENERATED ALWAYS AS (payload->>'observacoes') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('EventoM31Membro','m31_evento_m31_membro');
ALTER TABLE public.m31_evento_m31_membro ENABLE ROW LEVEL SECURITY;

CREATE INDEX ON public.m31_evento_m31_membro("user_email");

CREATE TABLE public.m31_evento_m31_presenca(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"voluntario_id" text GENERATED ALWAYS AS (payload->>'voluntario_id') STORED,
"voluntario_nome" text GENERATED ALWAYS AS (payload->>'voluntario_nome') STORED,
"reuniao_id" text GENERATED ALWAYS AS (payload->>'reuniao_id') STORED,
"reuniao_titulo" text GENERATED ALWAYS AS (payload->>'reuniao_titulo') STORED,
"reuniao_data" text GENERATED ALWAYS AS (payload->>'reuniao_data') STORED,
"status" text GENERATED ALWAYS AS (payload->>'status') STORED,
"observacao" text GENERATED ALWAYS AS (payload->>'observacao') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('EventoM31Presenca','m31_evento_m31_presenca');
ALTER TABLE public.m31_evento_m31_presenca ENABLE ROW LEVEL SECURITY;

CREATE INDEX ON public.m31_evento_m31_presenca("status");

CREATE TABLE public.m31_evento_m31_reuniao(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"titulo" text GENERATED ALWAYS AS (payload->>'titulo') STORED,
"data" text GENERATED ALWAYS AS (payload->>'data') STORED,
"horario" text GENERATED ALWAYS AS (payload->>'horario') STORED,
"tipo" text GENERATED ALWAYS AS (payload->>'tipo') STORED,
"setor" text GENERATED ALWAYS AS (payload->>'setor') STORED,
"observacoes" text GENERATED ALWAYS AS (payload->>'observacoes') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('EventoM31Reuniao','m31_evento_m31_reuniao');
ALTER TABLE public.m31_evento_m31_reuniao ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.m31_evento_m31_tarefa(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"titulo" text GENERATED ALWAYS AS (payload->>'titulo') STORED,
"descricao" text GENERATED ALWAYS AS (payload->>'descricao') STORED,
"tipo" text GENERATED ALWAYS AS (payload->>'tipo') STORED,
"impacto" text GENERATED ALWAYS AS (payload->>'impacto') STORED,
"area" text GENERATED ALWAYS AS (payload->>'area') STORED,
"area_id" text GENERATED ALWAYS AS (payload->>'area_id') STORED,
"frente_id" text GENERATED ALWAYS AS (payload->>'frente_id') STORED,
"tarefa_pai_id" text GENERATED ALWAYS AS (payload->>'tarefa_pai_id') STORED,
"prioridade" text GENERATED ALWAYS AS (payload->>'prioridade') STORED,
"status" text GENERATED ALWAYS AS (payload->>'status') STORED,
"responsavel_email" text GENERATED ALWAYS AS (payload->>'responsavel_email') STORED,
"responsavel_nome" text GENERATED ALWAYS AS (payload->>'responsavel_nome') STORED,
"membros_emails" jsonb GENERATED ALWAYS AS (payload->'membros_emails') STORED,
"prazo" text GENERATED ALWAYS AS (payload->>'prazo') STORED,
"prazo_relativo_dias" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'prazo_relativo_dias')='number' THEN (payload->>'prazo_relativo_dias')::numeric END) STORED,
"checklist" jsonb GENERATED ALWAYS AS (payload->'checklist') STORED,
"anexos" jsonb GENERATED ALWAYS AS (payload->'anexos') STORED,
"observacoes" text GENERATED ALWAYS AS (payload->>'observacoes') STORED,
"observacao_conclusao" text GENERATED ALWAYS AS (payload->>'observacao_conclusao') STORED,
"concluido_por_email" text GENERATED ALWAYS AS (payload->>'concluido_por_email') STORED,
"concluido_por_nome" text GENERATED ALWAYS AS (payload->>'concluido_por_nome') STORED,
"criado_por_email" text GENERATED ALWAYS AS (payload->>'criado_por_email') STORED,
"concluido_em" text GENERATED ALWAYS AS (payload->>'concluido_em') STORED,
"tags" jsonb GENERATED ALWAYS AS (payload->'tags') STORED,
"edicao_id" text GENERATED ALWAYS AS (payload->>'edicao_id') STORED,
"pacote_id" text GENERATED ALWAYS AS (payload->>'pacote_id') STORED,
"tarefa_modelo_id" text GENERATED ALWAYS AS (payload->>'tarefa_modelo_id') STORED,
"dependencias_ids" jsonb GENERATED ALWAYS AS (payload->'dependencias_ids') STORED,
"criterio_conclusao" text GENERATED ALWAYS AS (payload->>'criterio_conclusao') STORED,
"favorito" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'favorito')='boolean' THEN (payload->>'favorito')::boolean END) STORED,
"migrada_plano_mestre" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'migrada_plano_mestre')='boolean' THEN (payload->>'migrada_plano_mestre')::boolean END) STORED,
"import_key" text GENERATED ALWAYS AS (payload->>'import_key') STORED,
"ref" text GENERATED ALWAYS AS (payload->>'ref') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('EventoM31Tarefa','m31_evento_m31_tarefa');
ALTER TABLE public.m31_evento_m31_tarefa ENABLE ROW LEVEL SECURITY;

CREATE INDEX ON public.m31_evento_m31_tarefa("status");

CREATE TABLE public.m31_evento_m31_voluntario(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"nome" text GENERATED ALWAYS AS (payload->>'nome') STORED,
"whatsapp" text GENERATED ALWAYS AS (payload->>'whatsapp') STORED,
"email" text GENERATED ALWAYS AS (payload->>'email') STORED,
"setor" text GENERATED ALWAYS AS (payload->>'setor') STORED,
"funcao" text GENERATED ALWAYS AS (payload->>'funcao') STORED,
"tamanho_camiseta" text GENERATED ALWAYS AS (payload->>'tamanho_camiseta') STORED,
"grupo_ids" jsonb GENERATED ALWAYS AS (payload->'grupo_ids') STORED,
"status" text GENERATED ALWAYS AS (payload->>'status') STORED,
"checkin_evento" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'checkin_evento')='boolean' THEN (payload->>'checkin_evento')::boolean END) STORED,
"checkin_evento_at" text GENERATED ALWAYS AS (payload->>'checkin_evento_at') STORED,
"inscricao_id" text GENERATED ALWAYS AS (payload->>'inscricao_id') STORED,
"observacoes" text GENERATED ALWAYS AS (payload->>'observacoes') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('EventoM31Voluntario','m31_evento_m31_voluntario');
ALTER TABLE public.m31_evento_m31_voluntario ENABLE ROW LEVEL SECURITY;

CREATE INDEX ON public.m31_evento_m31_voluntario("email");

CREATE INDEX ON public.m31_evento_m31_voluntario("inscricao_id");

CREATE INDEX ON public.m31_evento_m31_voluntario("status");

CREATE TABLE public.m31_financial_supplier(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"nome" text GENERATED ALWAYS AS (payload->>'nome') STORED,
"categoria" text GENERATED ALWAYS AS (payload->>'categoria') STORED,
"cnpj" text GENERATED ALWAYS AS (payload->>'cnpj') STORED,
"servicos" jsonb GENERATED ALWAYS AS (payload->'servicos') STORED,
"simples_nacional" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'simples_nacional')='boolean' THEN (payload->>'simples_nacional')::boolean END) STORED,
"meta_mensal" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'meta_mensal')='number' THEN (payload->>'meta_mensal')::numeric END) STORED,
"dia_fechamento" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'dia_fechamento')='number' THEN (payload->>'dia_fechamento')::numeric END) STORED,
"status" text GENERATED ALWAYS AS (payload->>'status') STORED,
"telefone" text GENERATED ALWAYS AS (payload->>'telefone') STORED,
"email" text GENERATED ALWAYS AS (payload->>'email') STORED,
"valor_praticado" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'valor_praticado')='number' THEN (payload->>'valor_praticado')::numeric END) STORED,
"responsavel_nome" text GENERATED ALWAYS AS (payload->>'responsavel_nome') STORED,
"contrato_url" text GENERATED ALWAYS AS (payload->>'contrato_url') STORED,
"valor_contrato" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'valor_contrato')='number' THEN (payload->>'valor_contrato')::numeric END) STORED,
"numero_parcelas" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'numero_parcelas')='number' THEN (payload->>'numero_parcelas')::numeric END) STORED,
"observacoes" text GENERATED ALWAYS AS (payload->>'observacoes') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('FinancialSupplier','m31_financial_supplier');
ALTER TABLE public.m31_financial_supplier ENABLE ROW LEVEL SECURITY;

CREATE INDEX ON public.m31_financial_supplier("email");

CREATE INDEX ON public.m31_financial_supplier("status");

CREATE TABLE public.m31_financial_transaction(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO public.m31_entity_catalog VALUES ('FinancialTransaction','m31_financial_transaction');
ALTER TABLE public.m31_financial_transaction ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.m31_inscricoes(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"name" text GENERATED ALWAYS AS (payload->>'name') STORED,
"email" text GENERATED ALWAYS AS (payload->>'email') STORED,
"phone" text GENERATED ALWAYS AS (payload->>'phone') STORED,
"cpf" text GENERATED ALWAYS AS (payload->>'cpf') STORED,
"cidade" text GENERATED ALWAYS AS (payload->>'cidade') STORED,
"estado" text GENERATED ALWAYS AS (payload->>'estado') STORED,
"ja_participou_m31" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'ja_participou_m31')='boolean' THEN (payload->>'ja_participou_m31')::boolean END) STORED,
"faz_parte_igreja" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'faz_parte_igreja')='boolean' THEN (payload->>'faz_parte_igreja')::boolean END) STORED,
"nome_igreja" text GENERATED ALWAYS AS (payload->>'nome_igreja') STORED,
"status" text GENERATED ALWAYS AS (payload->>'status') STORED,
"source" text GENERATED ALWAYS AS (payload->>'source') STORED,
"lote" text GENERATED ALWAYS AS (payload->>'lote') STORED,
"priority" text GENERATED ALWAYS AS (payload->>'priority') STORED,
"recovery_attempts" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'recovery_attempts')='number' THEN (payload->>'recovery_attempts')::numeric END) STORED,
"asaas_payment_id" text GENERATED ALWAYS AS (payload->>'asaas_payment_id') STORED,
"asaas_charge_url" text GENERATED ALWAYS AS (payload->>'asaas_charge_url') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('Inscricoes','m31_inscricoes');
ALTER TABLE public.m31_inscricoes ENABLE ROW LEVEL SECURITY;

CREATE INDEX ON public.m31_inscricoes("cpf");

CREATE INDEX ON public.m31_inscricoes("email");

CREATE INDEX ON public.m31_inscricoes("status");

CREATE TABLE public.m31_m31_area(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"slug" text GENERATED ALWAYS AS (payload->>'slug') STORED,
"nome" text GENERATED ALWAYS AS (payload->>'nome') STORED,
"descricao" text GENERATED ALWAYS AS (payload->>'descricao') STORED,
"icone" text GENERATED ALWAYS AS (payload->>'icone') STORED,
"exige_frente" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'exige_frente')='boolean' THEN (payload->>'exige_frente')::boolean END) STORED,
"ordem" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'ordem')='number' THEN (payload->>'ordem')::numeric END) STORED,
"ativo" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'ativo')='boolean' THEN (payload->>'ativo')::boolean END) STORED,
"alterado_por" text GENERATED ALWAYS AS (payload->>'alterado_por') STORED,
"alterado_em" text GENERATED ALWAYS AS (payload->>'alterado_em') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('M31Area','m31_m31_area');
ALTER TABLE public.m31_m31_area ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.m31_m31_asaas_webhook_evento(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"event_id" text GENERATED ALWAYS AS (payload->>'event_id') STORED,
"event_type" text GENERATED ALWAYS AS (payload->>'event_type') STORED,
"payment_id" text GENERATED ALWAYS AS (payload->>'payment_id') STORED,
"external_reference" text GENERATED ALWAYS AS (payload->>'external_reference') STORED,
"payload_json" text GENERATED ALWAYS AS (payload->>'payload_json') STORED,
"status" text GENERATED ALWAYS AS (payload->>'status') STORED,
"claim_token" text GENERATED ALWAYS AS (payload->>'claim_token') STORED,
"claim_em" text GENERATED ALWAYS AS (payload->>'claim_em') STORED,
"claim_expira_em" text GENERATED ALWAYS AS (payload->>'claim_expira_em') STORED,
"tentativas" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'tentativas')='number' THEN (payload->>'tentativas')::numeric END) STORED,
"recebido_em" text GENERATED ALWAYS AS (payload->>'recebido_em') STORED,
"processado_em" text GENERATED ALWAYS AS (payload->>'processado_em') STORED,
"erro" text GENERATED ALWAYS AS (payload->>'erro') STORED,
"resultado" text GENERATED ALWAYS AS (payload->>'resultado') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('M31AsaasWebhookEvento','m31_m31_asaas_webhook_evento');
ALTER TABLE public.m31_m31_asaas_webhook_evento ENABLE ROW LEVEL SECURITY;

CREATE INDEX ON public.m31_m31_asaas_webhook_evento("payment_id");

CREATE INDEX ON public.m31_m31_asaas_webhook_evento("status");

CREATE TABLE public.m31_m31_atendimento(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"tipo" text GENERATED ALWAYS AS (payload->>'tipo') STORED,
"telefone" text GENERATED ALWAYS AS (payload->>'telefone') STORED,
"remetente_nome" text GENERATED ALWAYS AS (payload->>'remetente_nome') STORED,
"mensagem_original" text GENERATED ALWAYS AS (payload->>'mensagem_original') STORED,
"recebido_em" text GENERATED ALWAYS AS (payload->>'recebido_em') STORED,
"status_processamento" text GENERATED ALWAYS AS (payload->>'status_processamento') STORED,
"codigo" text GENERATED ALWAYS AS (payload->>'codigo') STORED,
"intencao" text GENERATED ALWAYS AS (payload->>'intencao') STORED,
"inscricao_id" text GENERATED ALWAYS AS (payload->>'inscricao_id') STORED,
"inscricao_nome" text GENERATED ALWAYS AS (payload->>'inscricao_nome') STORED,
"cliente_identificado" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'cliente_identificado')='boolean' THEN (payload->>'cliente_identificado')::boolean END) STORED,
"nivel_confianca" text GENERATED ALWAYS AS (payload->>'nivel_confianca') STORED,
"dados_confirmados" jsonb GENERATED ALWAYS AS (payload->'dados_confirmados') STORED,
"dados_ausentes" jsonb GENERATED ALWAYS AS (payload->'dados_ausentes') STORED,
"acao_sugerida" text GENERATED ALWAYS AS (payload->>'acao_sugerida') STORED,
"rascunho_ia" text GENERATED ALWAYS AS (payload->>'rascunho_ia') STORED,
"motivacao" text GENERATED ALWAYS AS (payload->>'motivacao') STORED,
"alerta" text GENERATED ALWAYS AS (payload->>'alerta') STORED,
"status_aprovacao" text GENERATED ALWAYS AS (payload->>'status_aprovacao') STORED,
"historico_rascunhos" jsonb GENERATED ALWAYS AS (payload->'historico_rascunhos') STORED,
"texto_final" text GENERATED ALWAYS AS (payload->>'texto_final') STORED,
"aprovado_por" text GENERATED ALWAYS AS (payload->>'aprovado_por') STORED,
"aprovado_em" text GENERATED ALWAYS AS (payload->>'aprovado_em') STORED,
"enviado_ao_cliente_em" text GENERATED ALWAYS AS (payload->>'enviado_ao_cliente_em') STORED,
"regra_utilizada" text GENERATED ALWAYS AS (payload->>'regra_utilizada') STORED,
"feedback_atendimento_id" text GENERATED ALWAYS AS (payload->>'feedback_atendimento_id') STORED,
"erro" text GENERATED ALWAYS AS (payload->>'erro') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('M31Atendimento','m31_m31_atendimento');
ALTER TABLE public.m31_m31_atendimento ENABLE ROW LEVEL SECURITY;

CREATE INDEX ON public.m31_m31_atendimento("inscricao_id");

CREATE TABLE public.m31_m31_audit_log(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"chave_unica" text GENERATED ALWAYS AS (payload->>'chave_unica') STORED,
"tipo_erro" text GENERATED ALWAYS AS (payload->>'tipo_erro') STORED,
"gravidade" text GENERATED ALWAYS AS (payload->>'gravidade') STORED,
"origem" text GENERATED ALWAYS AS (payload->>'origem') STORED,
"descricao" text GENERATED ALWAYS AS (payload->>'descricao') STORED,
"pessoa_nome" text GENERATED ALWAYS AS (payload->>'pessoa_nome') STORED,
"pessoa_email" text GENERATED ALWAYS AS (payload->>'pessoa_email') STORED,
"pessoa_telefone" text GENERATED ALWAYS AS (payload->>'pessoa_telefone') STORED,
"pessoa_id" text GENERATED ALWAYS AS (payload->>'pessoa_id') STORED,
"possivel_causa" text GENERATED ALWAYS AS (payload->>'possivel_causa') STORED,
"acao_recomendada" text GENERATED ALWAYS AS (payload->>'acao_recomendada') STORED,
"status" text GENERATED ALWAYS AS (payload->>'status') STORED,
"alerta_enviado_em" text GENERATED ALWAYS AS (payload->>'alerta_enviado_em') STORED,
"alert_count" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'alert_count')='number' THEN (payload->>'alert_count')::numeric END) STORED,
"resolvido_em" text GENERATED ALWAYS AS (payload->>'resolvido_em') STORED,
"resolvido_por" text GENERATED ALWAYS AS (payload->>'resolvido_por') STORED,
"dados_extras" text GENERATED ALWAYS AS (payload->>'dados_extras') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('M31AuditLog','m31_m31_audit_log');
ALTER TABLE public.m31_m31_audit_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX ON public.m31_m31_audit_log("status");

CREATE TABLE public.m31_m31_auditoria_confirmacao_manual(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"inscricao_id" text GENERATED ALWAYS AS (payload->>'inscricao_id') STORED,
"etapa" text GENERATED ALWAYS AS (payload->>'etapa') STORED,
"confirmado" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'confirmado')='boolean' THEN (payload->>'confirmado')::boolean END) STORED,
"confirmado_por" text GENERATED ALWAYS AS (payload->>'confirmado_por') STORED,
"confirmado_em" text GENERATED ALWAYS AS (payload->>'confirmado_em') STORED,
"observacao" text GENERATED ALWAYS AS (payload->>'observacao') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('M31AuditoriaConfirmacaoManual','m31_m31_auditoria_confirmacao_manual');
ALTER TABLE public.m31_m31_auditoria_confirmacao_manual ENABLE ROW LEVEL SECURITY;

CREATE INDEX ON public.m31_m31_auditoria_confirmacao_manual("inscricao_id");

CREATE TABLE public.m31_m31_automacao_lock(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"chave" text GENERATED ALWAYS AS (payload->>'chave') STORED,
"criado_em" text GENERATED ALWAYS AS (payload->>'criado_em') STORED,
"expira_em" text GENERATED ALWAYS AS (payload->>'expira_em') STORED,
"ativo" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'ativo')='boolean' THEN (payload->>'ativo')::boolean END) STORED,
"execution_id" text GENERATED ALWAYS AS (payload->>'execution_id') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('M31AutomacaoLock','m31_m31_automacao_lock');
ALTER TABLE public.m31_m31_automacao_lock ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.m31_m31_automacao_log(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"participante_id" text GENERATED ALWAYS AS (payload->>'participante_id') STORED,
"inscricao_principal" text GENERATED ALWAYS AS (payload->>'inscricao_principal') STORED,
"cpf" text GENERATED ALWAYS AS (payload->>'cpf') STORED,
"telefone" text GENERATED ALWAYS AS (payload->>'telefone') STORED,
"email" text GENERATED ALWAYS AS (payload->>'email') STORED,
"automacao" text GENERATED ALWAYS AS (payload->>'automacao') STORED,
"template" text GENERATED ALWAYS AS (payload->>'template') STORED,
"versao" text GENERATED ALWAYS AS (payload->>'versao') STORED,
"status" text GENERATED ALWAYS AS (payload->>'status') STORED,
"enviado_em" text GENERATED ALWAYS AS (payload->>'enviado_em') STORED,
"cooldown_ate" text GENERATED ALWAYS AS (payload->>'cooldown_ate') STORED,
"execution_id" text GENERATED ALWAYS AS (payload->>'execution_id') STORED,
"origem" text GENERATED ALWAYS AS (payload->>'origem') STORED,
"motivo_bloqueio" text GENERATED ALWAYS AS (payload->>'motivo_bloqueio') STORED,
"motivo_cancelamento" text GENERATED ALWAYS AS (payload->>'motivo_cancelamento') STORED,
"idempotency_key" text GENERATED ALWAYS AS (payload->>'idempotency_key') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('M31AutomacaoLog','m31_m31_automacao_log');
ALTER TABLE public.m31_m31_automacao_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX ON public.m31_m31_automacao_log("cpf");

CREATE INDEX ON public.m31_m31_automacao_log("email");

CREATE INDEX ON public.m31_m31_automacao_log("status");

CREATE TABLE public.m31_m31_bloco_conteudo(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"edicao_id" text GENERATED ALWAYS AS (payload->>'edicao_id') STORED,
"area" text GENERATED ALWAYS AS (payload->>'area') STORED,
"pacote_id" text GENERATED ALWAYS AS (payload->>'pacote_id') STORED,
"tarefa_id" text GENERATED ALWAYS AS (payload->>'tarefa_id') STORED,
"tipo" text GENERATED ALWAYS AS (payload->>'tipo') STORED,
"titulo" text GENERATED ALWAYS AS (payload->>'titulo') STORED,
"conteudo" text GENERATED ALWAYS AS (payload->>'conteudo') STORED,
"itens" jsonb GENERATED ALWAYS AS (payload->'itens') STORED,
"url" text GENERATED ALWAYS AS (payload->>'url') STORED,
"ordem" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'ordem')='number' THEN (payload->>'ordem')::numeric END) STORED,
"criado_por_email" text GENERATED ALWAYS AS (payload->>'criado_por_email') STORED,
"criado_por_nome" text GENERATED ALWAYS AS (payload->>'criado_por_nome') STORED,
"criado_em" text GENERATED ALWAYS AS (payload->>'criado_em') STORED,
"atualizado_em" text GENERATED ALWAYS AS (payload->>'atualizado_em') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('M31BlocoConteudo','m31_m31_bloco_conteudo');
ALTER TABLE public.m31_m31_bloco_conteudo ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.m31_m31_cartinha_entrada(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"autora_id" text GENERATED ALWAYS AS (payload->>'autora_id') STORED,
"lote_id" text GENERATED ALWAYS AS (payload->>'lote_id') STORED,
"dedup_key" text GENERATED ALWAYS AS (payload->>'dedup_key') STORED,
"texto_original" text GENERATED ALWAYS AS (payload->>'texto_original') STORED,
"texto" text GENERATED ALWAYS AS (payload->>'texto') STORED,
"origem" text GENERATED ALWAYS AS (payload->>'origem') STORED,
"versao" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'versao')='number' THEN (payload->>'versao')::numeric END) STORED,
"estado" text GENERATED ALWAYS AS (payload->>'estado') STORED,
"itens" jsonb GENERATED ALWAYS AS (payload->'itens') STORED,
"revisoes" jsonb GENERATED ALWAYS AS (payload->'revisoes') STORED,
"plano_id" text GENERATED ALWAYS AS (payload->>'plano_id') STORED,
"confirmado_em" text GENERATED ALWAYS AS (payload->>'confirmado_em') STORED,
"audio_uri" text GENERATED ALWAYS AS (payload->>'audio_uri') STORED,
"audio_nome" text GENERATED ALWAYS AS (payload->>'audio_nome') STORED,
"audio_mime" text GENERATED ALWAYS AS (payload->>'audio_mime') STORED,
"audio_hash" text GENERATED ALWAYS AS (payload->>'audio_hash') STORED,
"transcricao_estado" text GENERATED ALWAYS AS (payload->>'transcricao_estado') STORED,
"transcricao_texto" text GENERATED ALWAYS AS (payload->>'transcricao_texto') STORED,
"transcricao_revisada" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'transcricao_revisada')='boolean' THEN (payload->>'transcricao_revisada')::boolean END) STORED,
"transcricao_iniciada_em" text GENERATED ALWAYS AS (payload->>'transcricao_iniciada_em') STORED,
"atualizada_em" text GENERATED ALWAYS AS (payload->>'atualizada_em') STORED,
"filtros" jsonb GENERATED ALWAYS AS (payload->'filtros') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('M31CartinhaEntrada','m31_m31_cartinha_entrada');
ALTER TABLE public.m31_m31_cartinha_entrada ENABLE ROW LEVEL SECURITY;

CREATE INDEX ON public.m31_m31_cartinha_entrada("dedup_key");

CREATE TABLE public.m31_m31_checkin_dispositivo(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"token" text GENERATED ALWAYS AS (payload->>'token') STORED,
"pin" text GENERATED ALWAYS AS (payload->>'pin') STORED,
"nome" text GENERATED ALWAYS AS (payload->>'nome') STORED,
"status" text GENERATED ALWAYS AS (payload->>'status') STORED,
"autorizado_por" text GENERATED ALWAYS AS (payload->>'autorizado_por') STORED,
"validado_em" text GENERATED ALWAYS AS (payload->>'validado_em') STORED,
"expira_em" text GENERATED ALWAYS AS (payload->>'expira_em') STORED,
"total_checkins" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'total_checkins')='number' THEN (payload->>'total_checkins')::numeric END) STORED);
INSERT INTO public.m31_entity_catalog VALUES ('M31CheckinDispositivo','m31_m31_checkin_dispositivo');
ALTER TABLE public.m31_m31_checkin_dispositivo ENABLE ROW LEVEL SECURITY;

CREATE INDEX ON public.m31_m31_checkin_dispositivo("status");

CREATE INDEX ON public.m31_m31_checkin_dispositivo("token");

CREATE TABLE public.m31_m31_cliente_camisa(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"nome" text GENERATED ALWAYS AS (payload->>'nome') STORED,
"whatsapp" text GENERATED ALWAYS AS (payload->>'whatsapp') STORED,
"email" text GENERATED ALWAYS AS (payload->>'email') STORED,
"observacoes" text GENERATED ALWAYS AS (payload->>'observacoes') STORED,
"criado_por" text GENERATED ALWAYS AS (payload->>'criado_por') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('M31ClienteCamisa','m31_m31_cliente_camisa');
ALTER TABLE public.m31_m31_cliente_camisa ENABLE ROW LEVEL SECURITY;

CREATE INDEX ON public.m31_m31_cliente_camisa("email");

CREATE TABLE public.m31_m31_compra_camisa(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"data" text GENERATED ALWAYS AS (payload->>'data') STORED,
"quantidades" jsonb GENERATED ALWAYS AS (payload->'quantidades') STORED,
"valor_total" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'valor_total')='number' THEN (payload->>'valor_total')::numeric END) STORED,
"fornecedor" text GENERATED ALWAYS AS (payload->>'fornecedor') STORED,
"registrado_por" text GENERATED ALWAYS AS (payload->>'registrado_por') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('M31CompraCamisa','m31_m31_compra_camisa');
ALTER TABLE public.m31_m31_compra_camisa ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.m31_m31_dead_letter_queue(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"inscricao_id" text GENERATED ALWAYS AS (payload->>'inscricao_id') STORED,
"inscricao_nome" text GENERATED ALWAYS AS (payload->>'inscricao_nome') STORED,
"cpf" text GENERATED ALWAYS AS (payload->>'cpf') STORED,
"telefone" text GENERATED ALWAYS AS (payload->>'telefone') STORED,
"etapa" text GENERATED ALWAYS AS (payload->>'etapa') STORED,
"erro" text GENERATED ALWAYS AS (payload->>'erro') STORED,
"tentativas" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'tentativas')='number' THEN (payload->>'tentativas')::numeric END) STORED,
"dados_extras" text GENERATED ALWAYS AS (payload->>'dados_extras') STORED,
"origem" text GENERATED ALWAYS AS (payload->>'origem') STORED,
"resolvido" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'resolvido')='boolean' THEN (payload->>'resolvido')::boolean END) STORED,
"resolvido_em" text GENERATED ALWAYS AS (payload->>'resolvido_em') STORED,
"resolvido_por" text GENERATED ALWAYS AS (payload->>'resolvido_por') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('M31DeadLetterQueue','m31_m31_dead_letter_queue');
ALTER TABLE public.m31_m31_dead_letter_queue ENABLE ROW LEVEL SECURITY;

CREATE INDEX ON public.m31_m31_dead_letter_queue("cpf");

CREATE INDEX ON public.m31_m31_dead_letter_queue("inscricao_id");

CREATE TABLE public.m31_m31_edicao_evento(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"nome" text GENERATED ALWAYS AS (payload->>'nome') STORED,
"data_evento" text GENERATED ALWAYS AS (payload->>'data_evento') STORED,
"plano_mestre_id" text GENERATED ALWAYS AS (payload->>'plano_mestre_id') STORED,
"plano_mestre_versao" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'plano_mestre_versao')='number' THEN (payload->>'plano_mestre_versao')::numeric END) STORED,
"status" text GENERATED ALWAYS AS (payload->>'status') STORED,
"responsaveis_por_area" jsonb GENERATED ALWAYS AS (payload->'responsaveis_por_area') STORED,
"criada_em" text GENERATED ALWAYS AS (payload->>'criada_em') STORED,
"encerrada_em" text GENERATED ALWAYS AS (payload->>'encerrada_em') STORED,
"total_tarefas" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'total_tarefas')='number' THEN (payload->>'total_tarefas')::numeric END) STORED,
"total_pacotes" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'total_pacotes')='number' THEN (payload->>'total_pacotes')::numeric END) STORED);
INSERT INTO public.m31_entity_catalog VALUES ('M31EdicaoEvento','m31_m31_edicao_evento');
ALTER TABLE public.m31_m31_edicao_evento ENABLE ROW LEVEL SECURITY;

CREATE INDEX ON public.m31_m31_edicao_evento("status");

CREATE TABLE public.m31_m31_falha_checkout(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"token" text GENERATED ALWAYS AS (payload->>'token') STORED,
"nome" text GENERATED ALWAYS AS (payload->>'nome') STORED,
"email" text GENERATED ALWAYS AS (payload->>'email') STORED,
"whatsapp" text GENERATED ALWAYS AS (payload->>'whatsapp') STORED,
"cpf" text GENERATED ALWAYS AS (payload->>'cpf') STORED,
"cidade" text GENERATED ALWAYS AS (payload->>'cidade') STORED,
"estado" text GENERATED ALWAYS AS (payload->>'estado') STORED,
"ja_participou_m31" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'ja_participou_m31')='boolean' THEN (payload->>'ja_participou_m31')::boolean END) STORED,
"como_conheceu" text GENERATED ALWAYS AS (payload->>'como_conheceu') STORED,
"faz_parte_igreja" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'faz_parte_igreja')='boolean' THEN (payload->>'faz_parte_igreja')::boolean END) STORED,
"nome_igreja" text GENERATED ALWAYS AS (payload->>'nome_igreja') STORED,
"is_gift" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'is_gift')='boolean' THEN (payload->>'is_gift')::boolean END) STORED,
"http_status" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'http_status')='number' THEN (payload->>'http_status')::numeric END) STORED,
"erro" text GENERATED ALWAYS AS (payload->>'erro') STORED,
"etapa" text GENERATED ALWAYS AS (payload->>'etapa') STORED,
"ocorrido_em" text GENERATED ALWAYS AS (payload->>'ocorrido_em') STORED,
"status" text GENERATED ALWAYS AS (payload->>'status') STORED,
"inscricao_id" text GENERATED ALWAYS AS (payload->>'inscricao_id') STORED,
"fila_id" text GENERATED ALWAYS AS (payload->>'fila_id') STORED,
"recuperacao_em" text GENERATED ALWAYS AS (payload->>'recuperacao_em') STORED,
"observacao" text GENERATED ALWAYS AS (payload->>'observacao') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('M31FalhaCheckout','m31_m31_falha_checkout');
ALTER TABLE public.m31_m31_falha_checkout ENABLE ROW LEVEL SECURITY;

CREATE INDEX ON public.m31_m31_falha_checkout("cpf");

CREATE INDEX ON public.m31_m31_falha_checkout("email");

CREATE INDEX ON public.m31_m31_falha_checkout("inscricao_id");

CREATE INDEX ON public.m31_m31_falha_checkout("status");

CREATE INDEX ON public.m31_m31_falha_checkout("token");

CREATE TABLE public.m31_m31_fila_grupo74(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"nome" text GENERATED ALWAYS AS (payload->>'nome') STORED,
"telefone" text GENERATED ALWAYS AS (payload->>'telefone') STORED,
"tipo" text GENERATED ALWAYS AS (payload->>'tipo') STORED,
"status" text GENERATED ALWAYS AS (payload->>'status') STORED,
"motivo" text GENERATED ALWAYS AS (payload->>'motivo') STORED,
"processado_em" text GENERATED ALWAYS AS (payload->>'processado_em') STORED,
"uazapi_response" text GENERATED ALWAYS AS (payload->>'uazapi_response') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('M31FilaGrupo74','m31_m31_fila_grupo74');
ALTER TABLE public.m31_m31_fila_grupo74 ENABLE ROW LEVEL SECURITY;

CREATE INDEX ON public.m31_m31_fila_grupo74("status");

CREATE TABLE public.m31_m31_fila_mensagem(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"dedup_key" text GENERATED ALWAYS AS (payload->>'dedup_key') STORED,
"participante_id" text GENERATED ALWAYS AS (payload->>'participante_id') STORED,
"cpf" text GENERATED ALWAYS AS (payload->>'cpf') STORED,
"telefone" text GENERATED ALWAYS AS (payload->>'telefone') STORED,
"email" text GENERATED ALWAYS AS (payload->>'email') STORED,
"automacao" text GENERATED ALWAYS AS (payload->>'automacao') STORED,
"template" text GENERATED ALWAYS AS (payload->>'template') STORED,
"versao" text GENERATED ALWAYS AS (payload->>'versao') STORED,
"origem" text GENERATED ALWAYS AS (payload->>'origem') STORED,
"inscricao_id" text GENERATED ALWAYS AS (payload->>'inscricao_id') STORED,
"inscricao_nome" text GENERATED ALWAYS AS (payload->>'inscricao_nome') STORED,
"mensagens" jsonb GENERATED ALWAYS AS (payload->'mensagens') STORED,
"status" text GENERATED ALWAYS AS (payload->>'status') STORED,
"aprovado_para_envio" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'aprovado_para_envio')='boolean' THEN (payload->>'aprovado_para_envio')::boolean END) STORED,
"aprovado_por" text GENERATED ALWAYS AS (payload->>'aprovado_por') STORED,
"aprovado_em" text GENERATED ALWAYS AS (payload->>'aprovado_em') STORED,
"forcar_envio" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'forcar_envio')='boolean' THEN (payload->>'forcar_envio')::boolean END) STORED,
"prioridade" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'prioridade')='number' THEN (payload->>'prioridade')::numeric END) STORED,
"agendado_para" text GENERATED ALWAYS AS (payload->>'agendado_para') STORED,
"tentativas" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'tentativas')='number' THEN (payload->>'tentativas')::numeric END) STORED,
"claim_id" text GENERATED ALWAYS AS (payload->>'claim_id') STORED,
"claim_em" text GENERATED ALWAYS AS (payload->>'claim_em') STORED,
"claim_expira_em" text GENERATED ALWAYS AS (payload->>'claim_expira_em') STORED,
"proxima_mensagem_idx" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'proxima_mensagem_idx')='number' THEN (payload->>'proxima_mensagem_idx')::numeric END) STORED,
"resultados_mensagens" jsonb GENERATED ALWAYS AS (payload->'resultados_mensagens') STORED,
"ultima_chamada_iniciada_em" text GENERATED ALWAYS AS (payload->>'ultima_chamada_iniciada_em') STORED,
"ultima_chamada_idx" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'ultima_chamada_idx')='number' THEN (payload->>'ultima_chamada_idx')::numeric END) STORED,
"erro" text GENERATED ALWAYS AS (payload->>'erro') STORED,
"execution_id" text GENERATED ALWAYS AS (payload->>'execution_id') STORED,
"processado_em" text GENERATED ALWAYS AS (payload->>'processado_em') STORED,
"uazapi_response" text GENERATED ALWAYS AS (payload->>'uazapi_response') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('M31FilaMensagem','m31_m31_fila_mensagem');
ALTER TABLE public.m31_m31_fila_mensagem ENABLE ROW LEVEL SECURITY;

CREATE INDEX ON public.m31_m31_fila_mensagem("cpf");

CREATE INDEX ON public.m31_m31_fila_mensagem("email");

CREATE INDEX ON public.m31_m31_fila_mensagem("inscricao_id");

CREATE INDEX ON public.m31_m31_fila_mensagem("dedup_key");

CREATE INDEX ON public.m31_m31_fila_mensagem("status");

CREATE TABLE public.m31_m31_frente(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"area_id" text GENERATED ALWAYS AS (payload->>'area_id') STORED,
"area_slug" text GENERATED ALWAYS AS (payload->>'area_slug') STORED,
"slug" text GENERATED ALWAYS AS (payload->>'slug') STORED,
"nome" text GENERATED ALWAYS AS (payload->>'nome') STORED,
"descricao" text GENERATED ALWAYS AS (payload->>'descricao') STORED,
"lider_perfil" text GENERATED ALWAYS AS (payload->>'lider_perfil') STORED,
"status_definicao" text GENERATED ALWAYS AS (payload->>'status_definicao') STORED,
"ordem" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'ordem')='number' THEN (payload->>'ordem')::numeric END) STORED,
"ativo" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'ativo')='boolean' THEN (payload->>'ativo')::boolean END) STORED,
"alterado_por" text GENERATED ALWAYS AS (payload->>'alterado_por') STORED,
"alterado_em" text GENERATED ALWAYS AS (payload->>'alterado_em') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('M31Frente','m31_m31_frente');
ALTER TABLE public.m31_m31_frente ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.m31_m31_grupo_config(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"finalidade" text GENERATED ALWAYS AS (payload->>'finalidade') STORED,
"chat_id" text GENERATED ALWAYS AS (payload->>'chat_id') STORED,
"invite_link" text GENERATED ALWAYS AS (payload->>'invite_link') STORED,
"nome_grupo" text GENERATED ALWAYS AS (payload->>'nome_grupo') STORED,
"church_id" text GENERATED ALWAYS AS (payload->>'church_id') STORED,
"ativo" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'ativo')='boolean' THEN (payload->>'ativo')::boolean END) STORED,
"automacao_ativa" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'automacao_ativa')='boolean' THEN (payload->>'automacao_ativa')::boolean END) STORED,
"welcome_message" text GENERATED ALWAYS AS (payload->>'welcome_message') STORED,
"tag_entrada" text GENERATED ALWAYS AS (payload->>'tag_entrada') STORED,
"tag_saida" text GENERATED ALWAYS AS (payload->>'tag_saida') STORED,
"observacoes" text GENERATED ALWAYS AS (payload->>'observacoes') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('M31GrupoConfig','m31_m31_grupo_config');
ALTER TABLE public.m31_m31_grupo_config ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.m31_m31_grupo_envio_log(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"finalidade" text GENERATED ALWAYS AS (payload->>'finalidade') STORED,
"nome_grupo" text GENERATED ALWAYS AS (payload->>'nome_grupo') STORED,
"chat_id" text GENERATED ALWAYS AS (payload->>'chat_id') STORED,
"qtd_mensagens" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'qtd_mensagens')='number' THEN (payload->>'qtd_mensagens')::numeric END) STORED,
"funcao_responsavel" text GENERATED ALWAYS AS (payload->>'funcao_responsavel') STORED,
"tipo_envio" text GENERATED ALWAYS AS (payload->>'tipo_envio') STORED,
"destinatario" text GENERATED ALWAYS AS (payload->>'destinatario') STORED,
"inscricao_id" text GENERATED ALWAYS AS (payload->>'inscricao_id') STORED,
"sucesso" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'sucesso')='boolean' THEN (payload->>'sucesso')::boolean END) STORED,
"erro" text GENERATED ALWAYS AS (payload->>'erro') STORED,
"cancelado" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'cancelado')='boolean' THEN (payload->>'cancelado')::boolean END) STORED,
"enviado_em" text GENERATED ALWAYS AS (payload->>'enviado_em') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('M31GrupoEnvioLog','m31_m31_grupo_envio_log');
ALTER TABLE public.m31_m31_grupo_envio_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX ON public.m31_m31_grupo_envio_log("inscricao_id");

CREATE TABLE public.m31_m31_grupo_membro(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"church_id" text GENERATED ALWAYS AS (payload->>'church_id') STORED,
"group_jid" text GENERATED ALWAYS AS (payload->>'group_jid') STORED,
"phone" text GENERATED ALWAYS AS (payload->>'phone') STORED,
"lid" text GENERATED ALWAYS AS (payload->>'lid') STORED,
"nome_whatsapp" text GENERATED ALWAYS AS (payload->>'nome_whatsapp') STORED,
"is_admin" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'is_admin')='boolean' THEN (payload->>'is_admin')::boolean END) STORED,
"is_super_admin" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'is_super_admin')='boolean' THEN (payload->>'is_super_admin')::boolean END) STORED,
"primeira_deteccao" text GENERATED ALWAYS AS (payload->>'primeira_deteccao') STORED,
"ultima_deteccao" text GENERATED ALWAYS AS (payload->>'ultima_deteccao') STORED,
"status" text GENERATED ALWAYS AS (payload->>'status') STORED,
"inscricao_id" text GENERATED ALWAYS AS (payload->>'inscricao_id') STORED,
"snapshot_count" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'snapshot_count')='number' THEN (payload->>'snapshot_count')::numeric END) STORED);
INSERT INTO public.m31_entity_catalog VALUES ('M31GrupoMembro','m31_m31_grupo_membro');
ALTER TABLE public.m31_m31_grupo_membro ENABLE ROW LEVEL SECURITY;

CREATE INDEX ON public.m31_m31_grupo_membro("inscricao_id");

CREATE INDEX ON public.m31_m31_grupo_membro("status");

CREATE TABLE public.m31_m31_grupo_mensagem(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"chat_id" text GENERATED ALWAYS AS (payload->>'chat_id') STORED,
"finalidade" text GENERATED ALWAYS AS (payload->>'finalidade') STORED,
"remetente_telefone" text GENERATED ALWAYS AS (payload->>'remetente_telefone') STORED,
"remetente_nome" text GENERATED ALWAYS AS (payload->>'remetente_nome') STORED,
"texto" text GENERATED ALWAYS AS (payload->>'texto') STORED,
"origem_mensagem_id" text GENERATED ALWAYS AS (payload->>'origem_mensagem_id') STORED,
"recebido_em" text GENERATED ALWAYS AS (payload->>'recebido_em') STORED,
"processada" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'processada')='boolean' THEN (payload->>'processada')::boolean END) STORED,
"resposta_ia" text GENERATED ALWAYS AS (payload->>'resposta_ia') STORED,
"respondida_em" text GENERATED ALWAYS AS (payload->>'respondida_em') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('M31GrupoMensagem','m31_m31_grupo_mensagem');
ALTER TABLE public.m31_m31_grupo_mensagem ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.m31_m31_inscricao_timeline(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"inscricao_id" text GENERATED ALWAYS AS (payload->>'inscricao_id') STORED,
"cpf" text GENERATED ALWAYS AS (payload->>'cpf') STORED,
"evento" text GENERATED ALWAYS AS (payload->>'evento') STORED,
"etapa" text GENERATED ALWAYS AS (payload->>'etapa') STORED,
"status" text GENERATED ALWAYS AS (payload->>'status') STORED,
"detalhe" text GENERATED ALWAYS AS (payload->>'detalhe') STORED,
"origem" text GENERATED ALWAYS AS (payload->>'origem') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('M31InscricaoTimeline','m31_m31_inscricao_timeline');
ALTER TABLE public.m31_m31_inscricao_timeline ENABLE ROW LEVEL SECURITY;

CREATE INDEX ON public.m31_m31_inscricao_timeline("cpf");

CREATE INDEX ON public.m31_m31_inscricao_timeline("inscricao_id");

CREATE INDEX ON public.m31_m31_inscricao_timeline("status");

CREATE TABLE public.m31_m31_message_log(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"inscricao_id" text GENERATED ALWAYS AS (payload->>'inscricao_id') STORED,
"inscricao_nome" text GENERATED ALWAYS AS (payload->>'inscricao_nome') STORED,
"telefone" text GENERATED ALWAYS AS (payload->>'telefone') STORED,
"tipo" text GENERATED ALWAYS AS (payload->>'tipo') STORED,
"stage" text GENERATED ALWAYS AS (payload->>'stage') STORED,
"mensagem" text GENERATED ALWAYS AS (payload->>'mensagem') STORED,
"sucesso" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'sucesso')='boolean' THEN (payload->>'sucesso')::boolean END) STORED,
"zapi_response" text GENERATED ALWAYS AS (payload->>'zapi_response') STORED,
"erro" text GENERATED ALWAYS AS (payload->>'erro') STORED,
"enviado_em" text GENERATED ALWAYS AS (payload->>'enviado_em') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('M31MessageLog','m31_m31_message_log');
ALTER TABLE public.m31_m31_message_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX ON public.m31_m31_message_log("inscricao_id");

CREATE TABLE public.m31_m31_message_template(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"chave_unica" text GENERATED ALWAYS AS (payload->>'chave_unica') STORED,
"name" text GENERATED ALWAYS AS (payload->>'name') STORED,
"descricao" text GENERATED ALWAYS AS (payload->>'descricao') STORED,
"categoria" text GENERATED ALWAYS AS (payload->>'categoria') STORED,
"escopo" text GENERATED ALWAYS AS (payload->>'escopo') STORED,
"canal" text GENERATED ALWAYS AS (payload->>'canal') STORED,
"trigger_stage" text GENERATED ALWAYS AS (payload->>'trigger_stage') STORED,
"content" text GENERATED ALWAYS AS (payload->>'content') STORED,
"conteudo_padrao" text GENERATED ALWAYS AS (payload->>'conteudo_padrao') STORED,
"variaveis_permitidas" jsonb GENERATED ALWAYS AS (payload->'variaveis_permitidas') STORED,
"is_active" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'is_active')='boolean' THEN (payload->>'is_active')::boolean END) STORED,
"essencial" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'essencial')='boolean' THEN (payload->>'essencial')::boolean END) STORED,
"alterado_por" text GENERATED ALWAYS AS (payload->>'alterado_por') STORED,
"alterado_em" text GENERATED ALWAYS AS (payload->>'alterado_em') STORED,
"conteudo_anterior" text GENERATED ALWAYS AS (payload->>'conteudo_anterior') STORED,
"sends_total" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'sends_total')='number' THEN (payload->>'sends_total')::numeric END) STORED,
"responses_total" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'responses_total')='number' THEN (payload->>'responses_total')::numeric END) STORED);
INSERT INTO public.m31_entity_catalog VALUES ('M31MessageTemplate','m31_m31_message_template');
ALTER TABLE public.m31_m31_message_template ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.m31_m31_operacao_incidente(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"tipo" text GENERATED ALWAYS AS (payload->>'tipo') STORED,
"severidade" text GENERATED ALWAYS AS (payload->>'severidade') STORED,
"descricao" text GENERATED ALWAYS AS (payload->>'descricao') STORED,
"inscricao_id" text GENERATED ALWAYS AS (payload->>'inscricao_id') STORED,
"metrica_valor" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'metrica_valor')='number' THEN (payload->>'metrica_valor')::numeric END) STORED,
"auto_gerado" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'auto_gerado')='boolean' THEN (payload->>'auto_gerado')::boolean END) STORED,
"origem" text GENERATED ALWAYS AS (payload->>'origem') STORED,
"alerta_enviado" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'alerta_enviado')='boolean' THEN (payload->>'alerta_enviado')::boolean END) STORED,
"status" text GENERATED ALWAYS AS (payload->>'status') STORED,
"resolvido_em" text GENERATED ALWAYS AS (payload->>'resolvido_em') STORED,
"resolvido_por" text GENERATED ALWAYS AS (payload->>'resolvido_por') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('M31OperacaoIncidente','m31_m31_operacao_incidente');
ALTER TABLE public.m31_m31_operacao_incidente ENABLE ROW LEVEL SECURITY;

CREATE INDEX ON public.m31_m31_operacao_incidente("inscricao_id");

CREATE INDEX ON public.m31_m31_operacao_incidente("status");

CREATE TABLE public.m31_m31_operacao_sessao(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"session_id" text GENERATED ALWAYS AS (payload->>'session_id') STORED,
"auth_email" text GENERATED ALWAYS AS (payload->>'auth_email') STORED,
"operador_nome" text GENERATED ALWAYS AS (payload->>'operador_nome') STORED,
"operador_whatsapp" text GENERATED ALWAYS AS (payload->>'operador_whatsapp') STORED,
"operacoes_permitidas" jsonb GENERATED ALWAYS AS (payload->'operacoes_permitidas') STORED,
"caravana_ids_permitidas" jsonb GENERATED ALWAYS AS (payload->'caravana_ids_permitidas') STORED,
"aberta_em" text GENERATED ALWAYS AS (payload->>'aberta_em') STORED,
"expires_at" text GENERATED ALWAYS AS (payload->>'expires_at') STORED,
"ativa" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'ativa')='boolean' THEN (payload->>'ativa')::boolean END) STORED);
INSERT INTO public.m31_entity_catalog VALUES ('M31OperacaoSessao','m31_m31_operacao_sessao');
ALTER TABLE public.m31_m31_operacao_sessao ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.m31_m31_pacote(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"edicao_id" text GENERATED ALWAYS AS (payload->>'edicao_id') STORED,
"pacote_modelo_id" text GENERATED ALWAYS AS (payload->>'pacote_modelo_id') STORED,
"area" text GENERATED ALWAYS AS (payload->>'area') STORED,
"titulo" text GENERATED ALWAYS AS (payload->>'titulo') STORED,
"descricao" text GENERATED ALWAYS AS (payload->>'descricao') STORED,
"objetivo" text GENERATED ALWAYS AS (payload->>'objetivo') STORED,
"prazo" text GENERATED ALWAYS AS (payload->>'prazo') STORED,
"prazo_relativo_dias" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'prazo_relativo_dias')='number' THEN (payload->>'prazo_relativo_dias')::numeric END) STORED,
"responsavel_email" text GENERATED ALWAYS AS (payload->>'responsavel_email') STORED,
"responsavel_nome" text GENERATED ALWAYS AS (payload->>'responsavel_nome') STORED,
"ordem" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'ordem')='number' THEN (payload->>'ordem')::numeric END) STORED,
"ativo" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'ativo')='boolean' THEN (payload->>'ativo')::boolean END) STORED,
"dependencias_ids" jsonb GENERATED ALWAYS AS (payload->'dependencias_ids') STORED,
"favorito" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'favorito')='boolean' THEN (payload->>'favorito')::boolean END) STORED);
INSERT INTO public.m31_entity_catalog VALUES ('M31Pacote','m31_m31_pacote');
ALTER TABLE public.m31_m31_pacote ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.m31_m31_pacote_modelo(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"plano_mestre_id" text GENERATED ALWAYS AS (payload->>'plano_mestre_id') STORED,
"plano_mestre_versao" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'plano_mestre_versao')='number' THEN (payload->>'plano_mestre_versao')::numeric END) STORED,
"area" text GENERATED ALWAYS AS (payload->>'area') STORED,
"titulo" text GENERATED ALWAYS AS (payload->>'titulo') STORED,
"descricao" text GENERATED ALWAYS AS (payload->>'descricao') STORED,
"objetivo" text GENERATED ALWAYS AS (payload->>'objetivo') STORED,
"prazo_relativo_dias" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'prazo_relativo_dias')='number' THEN (payload->>'prazo_relativo_dias')::numeric END) STORED,
"lider_perfil" text GENERATED ALWAYS AS (payload->>'lider_perfil') STORED,
"ordem" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'ordem')='number' THEN (payload->>'ordem')::numeric END) STORED,
"ativo" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'ativo')='boolean' THEN (payload->>'ativo')::boolean END) STORED,
"dependencias_ids" jsonb GENERATED ALWAYS AS (payload->'dependencias_ids') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('M31PacoteModelo','m31_m31_pacote_modelo');
ALTER TABLE public.m31_m31_pacote_modelo ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.m31_m31_pendencia_conciliacao(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"tipo_registro" text GENERATED ALWAYS AS (payload->>'tipo_registro') STORED,
"registro_id" text GENERATED ALWAYS AS (payload->>'registro_id') STORED,
"status_analise" text GENERATED ALWAYS AS (payload->>'status_analise') STORED,
"motivos_resolvidos" jsonb GENERATED ALWAYS AS (payload->'motivos_resolvidos') STORED,
"prioridade" text GENERATED ALWAYS AS (payload->>'prioridade') STORED,
"responsavel_revisao" text GENERATED ALWAYS AS (payload->>'responsavel_revisao') STORED,
"proxima_acao" text GENERATED ALWAYS AS (payload->>'proxima_acao') STORED,
"observacao" text GENERATED ALWAYS AS (payload->>'observacao') STORED,
"pagamento_terceiro" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'pagamento_terceiro')='boolean' THEN (payload->>'pagamento_terceiro')::boolean END) STORED,
"compra_presenteada" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'compra_presenteada')='boolean' THEN (payload->>'compra_presenteada')::boolean END) STORED,
"caravana_identificada" text GENERATED ALWAYS AS (payload->>'caravana_identificada') STORED,
"voluntario_identificado" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'voluntario_identificado')='boolean' THEN (payload->>'voluntario_identificado')::boolean END) STORED,
"gateway_corrigido" text GENERATED ALWAYS AS (payload->>'gateway_corrigido') STORED,
"tipo_corrigido" text GENERATED ALWAYS AS (payload->>'tipo_corrigido') STORED,
"origem_corrigida" text GENERATED ALWAYS AS (payload->>'origem_corrigida') STORED,
"inscricao_vinculada_manual" text GENERATED ALWAYS AS (payload->>'inscricao_vinculada_manual') STORED,
"encaminhar_contato" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'encaminhar_contato')='boolean' THEN (payload->>'encaminhar_contato')::boolean END) STORED,
"historico_alteracoes" jsonb GENERATED ALWAYS AS (payload->'historico_alteracoes') STORED,
"decisao" text GENERATED ALWAYS AS (payload->>'decisao') STORED,
"motivos_originais" jsonb GENERATED ALWAYS AS (payload->'motivos_originais') STORED,
"evidencias_consultadas" jsonb GENERATED ALWAYS AS (payload->'evidencias_consultadas') STORED,
"regra_aplicada" text GENERATED ALWAYS AS (payload->>'regra_aplicada') STORED,
"resultado_final" text GENERATED ALWAYS AS (payload->>'resultado_final') STORED,
"duplicidade_descartada_ids" jsonb GENERATED ALWAYS AS (payload->'duplicidade_descartada_ids') STORED,
"duplicidade_canonica_id" text GENERATED ALWAYS AS (payload->>'duplicidade_canonica_id') STORED,
"evidencia_validada" jsonb GENERATED ALWAYS AS (payload->'evidencia_validada') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('M31PendenciaConciliacao','m31_m31_pendencia_conciliacao');
ALTER TABLE public.m31_m31_pendencia_conciliacao ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.m31_m31_plano_mestre(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"versao" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'versao')='number' THEN (payload->>'versao')::numeric END) STORED,
"versao_anterior_id" text GENERATED ALWAYS AS (payload->>'versao_anterior_id') STORED,
"ativo" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'ativo')='boolean' THEN (payload->>'ativo')::boolean END) STORED,
"evento_data_referencia" text GENERATED ALWAYS AS (payload->>'evento_data_referencia') STORED,
"resumo_alteracao" text GENERATED ALWAYS AS (payload->>'resumo_alteracao') STORED,
"alterado_por" text GENERATED ALWAYS AS (payload->>'alterado_por') STORED,
"alterado_em" text GENERATED ALWAYS AS (payload->>'alterado_em') STORED,
"total_tarefas_modelo" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'total_tarefas_modelo')='number' THEN (payload->>'total_tarefas_modelo')::numeric END) STORED,
"total_pacotes_modelo" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'total_pacotes_modelo')='number' THEN (payload->>'total_pacotes_modelo')::numeric END) STORED);
INSERT INTO public.m31_entity_catalog VALUES ('M31PlanoMestre','m31_m31_plano_mestre');
ALTER TABLE public.m31_m31_plano_mestre ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.m31_m31_produto_camisa(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"nome" text GENERATED ALWAYS AS (payload->>'nome') STORED,
"modelo" text GENERATED ALWAYS AS (payload->>'modelo') STORED,
"cor" text GENERATED ALWAYS AS (payload->>'cor') STORED,
"descricao" text GENERATED ALWAYS AS (payload->>'descricao') STORED,
"foto_url" text GENERATED ALWAYS AS (payload->>'foto_url') STORED,
"preco" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'preco')='number' THEN (payload->>'preco')::numeric END) STORED,
"tamanhos" jsonb GENERATED ALWAYS AS (payload->'tamanhos') STORED,
"ativo" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'ativo')='boolean' THEN (payload->>'ativo')::boolean END) STORED);
INSERT INTO public.m31_entity_catalog VALUES ('M31ProdutoCamisa','m31_m31_produto_camisa');
ALTER TABLE public.m31_m31_produto_camisa ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.m31_m31_regra_suporte(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"conteudo" text GENERATED ALWAYS AS (payload->>'conteudo') STORED,
"categoria" text GENERATED ALWAYS AS (payload->>'categoria') STORED,
"aprovado_por" text GENERATED ALWAYS AS (payload->>'aprovado_por') STORED,
"aprovado_em" text GENERATED ALWAYS AS (payload->>'aprovado_em') STORED,
"validade" text GENERATED ALWAYS AS (payload->>'validade') STORED,
"atendimento_origem" text GENERATED ALWAYS AS (payload->>'atendimento_origem') STORED,
"versao" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'versao')='number' THEN (payload->>'versao')::numeric END) STORED,
"ativo" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'ativo')='boolean' THEN (payload->>'ativo')::boolean END) STORED);
INSERT INTO public.m31_entity_catalog VALUES ('M31RegraSuporte','m31_m31_regra_suporte');
ALTER TABLE public.m31_m31_regra_suporte ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.m31_m31_solicitacao_acesso(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"nome" text GENERATED ALWAYS AS (payload->>'nome') STORED,
"email" text GENERATED ALWAYS AS (payload->>'email') STORED,
"user_id" text GENERATED ALWAYS AS (payload->>'user_id') STORED,
"provedor_login" text GENERATED ALWAYS AS (payload->>'provedor_login') STORED,
"ip" text GENERATED ALWAYS AS (payload->>'ip') STORED,
"status" text GENERATED ALWAYS AS (payload->>'status') STORED,
"data_solicitacao" text GENERATED ALWAYS AS (payload->>'data_solicitacao') STORED,
"processado_em" text GENERATED ALWAYS AS (payload->>'processado_em') STORED,
"processado_por" text GENERATED ALWAYS AS (payload->>'processado_por') STORED,
"perfil_atribuido" text GENERATED ALWAYS AS (payload->>'perfil_atribuido') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('M31SolicitacaoAcesso','m31_m31_solicitacao_acesso');
ALTER TABLE public.m31_m31_solicitacao_acesso ENABLE ROW LEVEL SECURITY;

CREATE INDEX ON public.m31_m31_solicitacao_acesso("email");

CREATE INDEX ON public.m31_m31_solicitacao_acesso("status");

CREATE TABLE public.m31_m31_tarefa_modelo(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"plano_mestre_id" text GENERATED ALWAYS AS (payload->>'plano_mestre_id') STORED,
"plano_mestre_versao" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'plano_mestre_versao')='number' THEN (payload->>'plano_mestre_versao')::numeric END) STORED,
"pacote_modelo_id" text GENERATED ALWAYS AS (payload->>'pacote_modelo_id') STORED,
"area" text GENERATED ALWAYS AS (payload->>'area') STORED,
"titulo" text GENERATED ALWAYS AS (payload->>'titulo') STORED,
"descricao" text GENERATED ALWAYS AS (payload->>'descricao') STORED,
"tipo" text GENERATED ALWAYS AS (payload->>'tipo') STORED,
"impacto" text GENERATED ALWAYS AS (payload->>'impacto') STORED,
"prioridade" text GENERATED ALWAYS AS (payload->>'prioridade') STORED,
"prazo_relativo_dias" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'prazo_relativo_dias')='number' THEN (payload->>'prazo_relativo_dias')::numeric END) STORED,
"checklist_modelo" jsonb GENERATED ALWAYS AS (payload->'checklist_modelo') STORED,
"dependencias_ids" jsonb GENERATED ALWAYS AS (payload->'dependencias_ids') STORED,
"responsavel_perfil" text GENERATED ALWAYS AS (payload->>'responsavel_perfil') STORED,
"criterio_conclusao" text GENERATED ALWAYS AS (payload->>'criterio_conclusao') STORED,
"ordem" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'ordem')='number' THEN (payload->>'ordem')::numeric END) STORED,
"ativo" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'ativo')='boolean' THEN (payload->>'ativo')::boolean END) STORED);
INSERT INTO public.m31_entity_catalog VALUES ('M31TarefaModelo','m31_m31_tarefa_modelo');
ALTER TABLE public.m31_m31_tarefa_modelo ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.m31_m31_teste_unique(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"idempotency_key" text GENERATED ALWAYS AS (payload->>'idempotency_key') STORED,
"origem" text GENERATED ALWAYS AS (payload->>'origem') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('M31TesteUnique','m31_m31_teste_unique');
ALTER TABLE public.m31_m31_teste_unique ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.m31_m31_transacao_financeira(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"gateway" text GENERATED ALWAYS AS (payload->>'gateway') STORED,
"transaction_id" text GENERATED ALWAYS AS (payload->>'transaction_id') STORED,
"dedup_key" text GENERATED ALWAYS AS (payload->>'dedup_key') STORED,
"status" text GENERATED ALWAYS AS (payload->>'status') STORED,
"valor_bruto" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'valor_bruto')='number' THEN (payload->>'valor_bruto')::numeric END) STORED,
"valor_liquido" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'valor_liquido')='number' THEN (payload->>'valor_liquido')::numeric END) STORED,
"taxa" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'taxa')='number' THEN (payload->>'taxa')::numeric END) STORED,
"data_pagamento" text GENERATED ALWAYS AS (payload->>'data_pagamento') STORED,
"data_aprovacao_original" text GENERATED ALWAYS AS (payload->>'data_aprovacao_original') STORED,
"nome_pagador" text GENERATED ALWAYS AS (payload->>'nome_pagador') STORED,
"email" text GENERATED ALWAYS AS (payload->>'email') STORED,
"cpf" text GENERATED ALWAYS AS (payload->>'cpf') STORED,
"whatsapp" text GENERATED ALWAYS AS (payload->>'whatsapp') STORED,
"uuid_externo" text GENERATED ALWAYS AS (payload->>'uuid_externo') STORED,
"codigo_inscricao" text GENERATED ALWAYS AS (payload->>'codigo_inscricao') STORED,
"produto" text GENERATED ALWAYS AS (payload->>'produto') STORED,
"inscricao_id" text GENERATED ALWAYS AS (payload->>'inscricao_id') STORED,
"e_orfao" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'e_orfao')='boolean' THEN (payload->>'e_orfao')::boolean END) STORED,
"status_conciliacao" text GENERATED ALWAYS AS (payload->>'status_conciliacao') STORED,
"criterio_vinculo" text GENERATED ALWAYS AS (payload->>'criterio_vinculo') STORED,
"lote_importacao" text GENERATED ALWAYS AS (payload->>'lote_importacao') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('M31TransacaoFinanceira','m31_m31_transacao_financeira');
ALTER TABLE public.m31_m31_transacao_financeira ENABLE ROW LEVEL SECURITY;

CREATE INDEX ON public.m31_m31_transacao_financeira("cpf");

CREATE INDEX ON public.m31_m31_transacao_financeira("email");

CREATE INDEX ON public.m31_m31_transacao_financeira("inscricao_id");

CREATE INDEX ON public.m31_m31_transacao_financeira("codigo_inscricao");

CREATE INDEX ON public.m31_m31_transacao_financeira("dedup_key");

CREATE INDEX ON public.m31_m31_transacao_financeira("status");

CREATE TABLE public.m31_m31_transferencia_inscricao(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"inscricao_id" text GENERATED ALWAYS AS (payload->>'inscricao_id') STORED,
"token" text GENERATED ALWAYS AS (payload->>'token') STORED,
"token_expira_em" text GENERATED ALWAYS AS (payload->>'token_expira_em') STORED,
"status" text GENERATED ALWAYS AS (payload->>'status') STORED,
"iniciada_por" text GENERATED ALWAYS AS (payload->>'iniciada_por') STORED,
"titular_anterior_snapshot" jsonb GENERATED ALWAYS AS (payload->'titular_anterior_snapshot') STORED,
"titular_novo" jsonb GENERATED ALWAYS AS (payload->'titular_novo') STORED,
"ip_preenchimento" text GENERATED ALWAYS AS (payload->>'ip_preenchimento') STORED,
"criada_em" text GENERATED ALWAYS AS (payload->>'criada_em') STORED,
"concluida_em" text GENERATED ALWAYS AS (payload->>'concluida_em') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('M31TransferenciaInscricao','m31_m31_transferencia_inscricao');
ALTER TABLE public.m31_m31_transferencia_inscricao ENABLE ROW LEVEL SECURITY;

CREATE INDEX ON public.m31_m31_transferencia_inscricao("inscricao_id");

CREATE INDEX ON public.m31_m31_transferencia_inscricao("status");

CREATE INDEX ON public.m31_m31_transferencia_inscricao("token");

CREATE TABLE public.m31_m31_voluntario_grupo(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"nome" text GENERATED ALWAYS AS (payload->>'nome') STORED,
"codigo" text GENERATED ALWAYS AS (payload->>'codigo') STORED,
"regra_disparo" text GENERATED ALWAYS AS (payload->>'regra_disparo') STORED,
"setores_vinculados" jsonb GENERATED ALWAYS AS (payload->'setores_vinculados') STORED,
"ativo" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'ativo')='boolean' THEN (payload->>'ativo')::boolean END) STORED,
"observacoes" text GENERATED ALWAYS AS (payload->>'observacoes') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('M31VoluntarioGrupo','m31_m31_voluntario_grupo');
ALTER TABLE public.m31_m31_voluntario_grupo ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.m31_m31_whats_app_control(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"data" text GENERATED ALWAYS AS (payload->>'data') STORED,
"mensagens_enviadas_hoje" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'mensagens_enviadas_hoje')='number' THEN (payload->>'mensagens_enviadas_hoje')::numeric END) STORED,
"limite_diario" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'limite_diario')='number' THEN (payload->>'limite_diario')::numeric END) STORED,
"limite_diario_retomada" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'limite_diario_retomada')='number' THEN (payload->>'limite_diario_retomada')::numeric END) STORED,
"limite_por_execucao" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'limite_por_execucao')='number' THEN (payload->>'limite_por_execucao')::numeric END) STORED,
"modo_retomada" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'modo_retomada')='boolean' THEN (payload->>'modo_retomada')::boolean END) STORED,
"dias_sem_bloqueio" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'dias_sem_bloqueio')='number' THEN (payload->>'dias_sem_bloqueio')::numeric END) STORED,
"bloqueado" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'bloqueado')='boolean' THEN (payload->>'bloqueado')::boolean END) STORED,
"bloqueado_em" text GENERATED ALWAYS AS (payload->>'bloqueado_em') STORED,
"ultimo_envio_em" text GENERATED ALWAYS AS (payload->>'ultimo_envio_em') STORED,
"total_falhas_hoje" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'total_falhas_hoje')='number' THEN (payload->>'total_falhas_hoje')::numeric END) STORED,
"total_optouts_hoje" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'total_optouts_hoje')='number' THEN (payload->>'total_optouts_hoje')::numeric END) STORED,
"boas_vindas_enviadas" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'boas_vindas_enviadas')='number' THEN (payload->>'boas_vindas_enviadas')::numeric END) STORED,
"cobrancas_enviadas" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'cobrancas_enviadas')='number' THEN (payload->>'cobrancas_enviadas')::numeric END) STORED);
INSERT INTO public.m31_entity_catalog VALUES ('M31WhatsAppControl','m31_m31_whats_app_control');
ALTER TABLE public.m31_m31_whats_app_control ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.m31_query(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO public.m31_entity_catalog VALUES ('Query','m31_query');
ALTER TABLE public.m31_query ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.m31_supplier_contract(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"supplier_id" text GENERATED ALWAYS AS (payload->>'supplier_id') STORED,
"supplier_nome" text GENERATED ALWAYS AS (payload->>'supplier_nome') STORED,
"descricao" text GENERATED ALWAYS AS (payload->>'descricao') STORED,
"valor_total" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'valor_total')='number' THEN (payload->>'valor_total')::numeric END) STORED,
"forma_pagamento" text GENERATED ALWAYS AS (payload->>'forma_pagamento') STORED,
"numero_parcelas" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'numero_parcelas')='number' THEN (payload->>'numero_parcelas')::numeric END) STORED,
"contrato_url" text GENERATED ALWAYS AS (payload->>'contrato_url') STORED,
"observacoes" text GENERATED ALWAYS AS (payload->>'observacoes') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('SupplierContract','m31_supplier_contract');
ALTER TABLE public.m31_supplier_contract ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.m31_supplier_payment(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"supplier_id" text GENERATED ALWAYS AS (payload->>'supplier_id') STORED,
"supplier_nome" text GENERATED ALWAYS AS (payload->>'supplier_nome') STORED,
"contract_id" text GENERATED ALWAYS AS (payload->>'contract_id') STORED,
"descricao" text GENERATED ALWAYS AS (payload->>'descricao') STORED,
"numero_parcela" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'numero_parcela')='number' THEN (payload->>'numero_parcela')::numeric END) STORED,
"total_parcelas" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'total_parcelas')='number' THEN (payload->>'total_parcelas')::numeric END) STORED,
"valor" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'valor')='number' THEN (payload->>'valor')::numeric END) STORED,
"vencimento" text GENERATED ALWAYS AS (payload->>'vencimento') STORED,
"status" text GENERATED ALWAYS AS (payload->>'status') STORED,
"forma_pagamento" text GENERATED ALWAYS AS (payload->>'forma_pagamento') STORED,
"data_pagamento" text GENERATED ALWAYS AS (payload->>'data_pagamento') STORED,
"pago_por" text GENERATED ALWAYS AS (payload->>'pago_por') STORED,
"comprovante_url" text GENERATED ALWAYS AS (payload->>'comprovante_url') STORED,
"comprovante_enviado_whatsapp" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'comprovante_enviado_whatsapp')='boolean' THEN (payload->>'comprovante_enviado_whatsapp')::boolean END) STORED,
"comprovante_enviado_em" text GENERATED ALWAYS AS (payload->>'comprovante_enviado_em') STORED,
"lembrete_vencimento_enviado" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'lembrete_vencimento_enviado')='boolean' THEN (payload->>'lembrete_vencimento_enviado')::boolean END) STORED,
"registrado_por" text GENERATED ALWAYS AS (payload->>'registrado_por') STORED,
"observacoes" text GENERATED ALWAYS AS (payload->>'observacoes') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('SupplierPayment','m31_supplier_payment');
ALTER TABLE public.m31_supplier_payment ENABLE ROW LEVEL SECURITY;

CREATE INDEX ON public.m31_supplier_payment("status");

CREATE TABLE public.m31_tarefa_comentario(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"tarefa_id" text GENERATED ALWAYS AS (payload->>'tarefa_id') STORED,
"autor_email" text GENERATED ALWAYS AS (payload->>'autor_email') STORED,
"autor_nome" text GENERATED ALWAYS AS (payload->>'autor_nome') STORED,
"conteudo" text GENERATED ALWAYS AS (payload->>'conteudo') STORED,
"notificacoes_enviadas" jsonb GENERATED ALWAYS AS (payload->'notificacoes_enviadas') STORED);
INSERT INTO public.m31_entity_catalog VALUES ('TarefaComentario','m31_tarefa_comentario');
ALTER TABLE public.m31_tarefa_comentario ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.m31_tarefa_lembrete_config(
id text PRIMARY KEY,
payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
revision bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
"nome" text GENERATED ALWAYS AS (payload->>'nome') STORED,
"ativo" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'ativo')='boolean' THEN (payload->>'ativo')::boolean END) STORED,
"frequencia" text GENERATED ALWAYS AS (payload->>'frequencia') STORED,
"horario" text GENERATED ALWAYS AS (payload->>'horario') STORED,
"dias_antes_vencimento" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'dias_antes_vencimento')='number' THEN (payload->>'dias_antes_vencimento')::numeric END) STORED,
"incluir_atrasadas" boolean GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'incluir_atrasadas')='boolean' THEN (payload->>'incluir_atrasadas')::boolean END) STORED,
"template_whatsapp" text GENERATED ALWAYS AS (payload->>'template_whatsapp') STORED,
"areas_filtro" jsonb GENERATED ALWAYS AS (payload->'areas_filtro') STORED,
"ultimo_disparo" text GENERATED ALWAYS AS (payload->>'ultimo_disparo') STORED,
"total_enviados" numeric GENERATED ALWAYS AS (CASE WHEN jsonb_typeof(payload->'total_enviados')='number' THEN (payload->>'total_enviados')::numeric END) STORED);
INSERT INTO public.m31_entity_catalog VALUES ('TarefaLembreteConfig','m31_tarefa_lembrete_config');
ALTER TABLE public.m31_tarefa_lembrete_config ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.m31_commit(changes jsonb, suppress_events boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c jsonb; t text; rev bigint; original jsonb; related jsonb; event_scope jsonb; operation_name text; workflow record; args jsonb; jobkey text;
BEGIN
 IF jsonb_typeof(changes)<>'array' THEN RAISE EXCEPTION 'Invalid changes'; END IF;
 FOR c IN SELECT value FROM jsonb_array_elements(changes) ORDER BY value->>'entity',value->>'id' LOOP
  SELECT table_name INTO t FROM m31_entity_catalog WHERE name=c->>'entity';
  IF t IS NULL OR length(c->>'id')>512 THEN RAISE EXCEPTION 'Unknown entity'; END IF;
  EXECUTE format('SELECT revision,payload FROM public.%I WHERE id=$1 FOR UPDATE',t) INTO rev,original USING c->>'id';
  IF c->>'expected' IS NULL THEN
   IF rev IS NOT NULL THEN RAISE EXCEPTION 'Concurrent create' USING ERRCODE='40001'; END IF;
  ELSIF rev IS DISTINCT FROM (c->>'expected')::bigint THEN RAISE EXCEPTION 'Concurrent change' USING ERRCODE='40001'; END IF;
  IF c->'data'='null'::jsonb OR c->'data' IS NULL THEN
   EXECUTE format('DELETE FROM public.%I WHERE id=$1',t) USING c->>'id'; operation_name='delete';
  ELSE
   IF c->'data'->>'id' IS DISTINCT FROM c->>'id' THEN RAISE EXCEPTION 'Immutable id'; END IF;
   IF rev IS NULL THEN
    EXECUTE format('INSERT INTO public.%I(id,payload) VALUES($1,$2)',t) USING c->>'id',c->'data'; operation_name='create';
   ELSE
    EXECUTE format('UPDATE public.%I SET payload=$2,revision=revision+1,updated_at=now() WHERE id=$1',t) USING c->>'id',c->'data';operation_name='update';
   END IF;
  END IF;
  IF NOT suppress_events THEN
   event_scope=CASE WHEN c->'data' IS NULL OR c->'data'='null'::jsonb THEN original ELSE c->'data' END;
   IF c->>'entity'='TarefaComentario' THEN SELECT payload INTO event_scope FROM m31_evento_m31_tarefa WHERE id=event_scope->>'tarefa_id'; END IF;
   event_scope=jsonb_strip_nulls(jsonb_build_object('area',event_scope->'area','area_id',event_scope->'area_id','setor',event_scope->'setor','responsavel_email',event_scope->'responsavel_email','membros_emails',event_scope->'membros_emails'));
   INSERT INTO m31_changes(entity,record_id,operation,scope) VALUES(c->>'entity',c->>'id',operation_name,event_scope);
   FOR workflow IN SELECT * FROM m31_workflows WHERE enabled AND definition->'trigger'->'config'->>'trigger_type'='entity' AND definition->'trigger'->'config'->>'entity_name'=c->>'entity' AND (definition->'trigger'->'config'->'events') ? operation_name AND public.m31_event_matches(definition->'job'->>'function_name', c->'data', original) LOOP
    args=jsonb_build_object('_workflow_id',workflow.id,'trigger',jsonb_build_object('data',c->'data','old_data',original),'tarefa_id',c->>'id','responsavel_email',c->'data'->>'responsavel_email','responsavel_nome',c->'data'->>'responsavel_nome','titulo_tarefa',c->'data'->>'titulo','prazo',c->'data'->>'prazo','novo_status',c->'data'->>'status','event',jsonb_build_object('type',operation_name,'entity_name',c->>'entity','entity_id',c->>'id','data',c->'data','old_data',original));
    IF workflow.definition->'job'->>'function_name'='m31NotificarComentarioTarefa' THEN
     SELECT payload INTO related FROM m31_evento_m31_tarefa WHERE id=c->'data'->>'tarefa_id';
     args=args||jsonb_build_object('tarefa_id',c->'data'->>'tarefa_id','titulo_tarefa',related->>'titulo','autor_nome',c->'data'->>'autor_nome','conteudo',c->'data'->>'conteudo','comentario_id',c->>'id','emails_para_notificar',(SELECT coalesce(jsonb_agg(DISTINCT value),'[]'::jsonb) FROM jsonb_array_elements(coalesce(related->'membros_emails','[]'::jsonb)||CASE WHEN related->>'responsavel_email' IS NOT NULL THEN jsonb_build_array(related->>'responsavel_email') ELSE '[]'::jsonb END) WHERE value#>>'{}' IS DISTINCT FROM c->'data'->>'autor_email'));
    END IF;
    jobkey=workflow.id||':'||(c->>'id')||':'||coalesce((rev+1)::text,'1');
    INSERT INTO m31_outbox(dedup_key,function_name,args) SELECT jobkey,workflow.definition->'job'->>'function_name',coalesce(workflow.definition->'job'->'args','{}'::jsonb)||args ON CONFLICT(dedup_key) DO NOTHING;
   END LOOP;
  END IF;
 END LOOP;
 IF NOT suppress_events THEN PERFORM public.m31_validate_references(changes); END IF;
END;$$;
REVOKE ALL ON FUNCTION public.m31_commit(jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.m31_commit(jsonb,boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.m31_rate_limit(bucket text, maximum integer, seconds integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE count integer;
BEGIN
 INSERT INTO m31_rate_limits(key,window_start,hits) VALUES(bucket,now(),1) ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN m31_rate_limits.window_start<now()-make_interval(secs=>seconds) THEN 1 ELSE m31_rate_limits.hits+1 END,window_start=CASE WHEN m31_rate_limits.window_start<now()-make_interval(secs=>seconds) THEN now() ELSE m31_rate_limits.window_start END RETURNING hits INTO count;
 RETURN count<=maximum;
END;$$;
REVOKE ALL ON FUNCTION public.m31_rate_limit(text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.m31_rate_limit(text,integer,integer) TO service_role;
CREATE OR REPLACE FUNCTION public.m31_claim_jobs(batch_size integer) RETURNS SETOF public.m31_outbox LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 RETURN QUERY UPDATE m31_outbox SET status='leased',lease_until=now()+interval '5 minutes',attempts=attempts+1 WHERE id IN (SELECT id FROM m31_outbox WHERE (status='pending' OR status='leased' AND lease_until<now()) AND available_at<=now() ORDER BY available_at LIMIT least(batch_size,100) FOR UPDATE SKIP LOCKED) RETURNING *;
END;$$;
REVOKE ALL ON FUNCTION public.m31_claim_jobs(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.m31_claim_jobs(integer) TO service_role;
-- Realtime publishes only identifiers; domain payloads always go through the Worker.
CREATE POLICY changes_members ON public.m31_changes FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.m31_identities i WHERE i.auth_id=auth.uid() AND i.active));
ALTER PUBLICATION supabase_realtime ADD TABLE public.m31_changes;
INSERT INTO storage.buckets(id,name,public,file_size_limit) VALUES('m31-public','m31-public',true,10485760),('m31-private','m31-private',false,26214400) ON CONFLICT(id) DO NOTHING;
-- No direct authenticated write policy to business tables, outbox or Storage.
