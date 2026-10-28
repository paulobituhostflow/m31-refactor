CREATE TABLE public.m31_m31_gestao_requisicao(
  id text PRIMARY KEY,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
  revision bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  "chave" text GENERATED ALWAYS AS (payload->>'chave') STORED,
  "tipo" text GENERATED ALWAYS AS (payload->>'tipo') STORED,
  "request_id" text GENERATED ALWAYS AS (payload->>'request_id') STORED,
  "payload_hash" text GENERATED ALWAYS AS (payload->>'payload_hash') STORED,
  "actor_id" text GENERATED ALWAYS AS (payload->>'actor_id') STORED,
  "estado" text GENERATED ALWAYS AS (payload->>'estado') STORED,
  "caravana_id" text GENERATED ALWAYS AS (payload->>'caravana_id') STORED,
  "inscricao_id" text GENERATED ALWAYS AS (payload->>'inscricao_id') STORED
);

INSERT INTO public.m31_entity_catalog VALUES ('M31GestaoRequisicao','m31_m31_gestao_requisicao');
ALTER TABLE public.m31_m31_gestao_requisicao ENABLE ROW LEVEL SECURITY;

CREATE INDEX m31_gestao_req_chave_idx ON public.m31_m31_gestao_requisicao("chave");
CREATE INDEX m31_gestao_req_request_idx ON public.m31_m31_gestao_requisicao("request_id");
CREATE INDEX m31_gestao_req_inscricao_idx ON public.m31_m31_gestao_requisicao("inscricao_id");

-- Seed inicial do lock CAS da Gestão Operacional para evitar erro de inicialização
INSERT INTO public.m31_m31_automacao_lock(id, payload)
VALUES (
  '6adae9ba185a8e81d260eb2e',
  jsonb_build_object(
    'chave', 'GESTAO:CADASTROS:CAS:v1',
    'ativo', false,
    'criado_em', now()::text
  )
)
ON CONFLICT (id) DO NOTHING;
