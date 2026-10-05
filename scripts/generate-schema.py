import pathlib,json,re
root=pathlib.Path.cwd(); schemas=json.loads((root/'worker/catalog/entities.json').read_text())
def table(name):return 'm31_'+re.sub(r'([a-z0-9])([A-Z])',r'\1_\2',name).lower()
lines=['-- M31 independent schema. JSONB preserves undeclared historical fields.\nCREATE EXTENSION IF NOT EXISTS pgcrypto;\n']
lines.append('''CREATE TABLE public.m31_entity_catalog(name text PRIMARY KEY, table_name text UNIQUE NOT NULL);
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
''')
for name,schema in schemas.items():
 t=table(name);columns=['id text PRIMARY KEY',"payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object')",'revision bigint NOT NULL DEFAULT 1', 'created_at timestamptz NOT NULL DEFAULT now()', 'updated_at timestamptz NOT NULL DEFAULT now()']
 for field,definition in schema.get('properties',{}).items():
  if not re.fullmatch(r'[a-zA-Z_][a-zA-Z_0-9]*',field) or field in ['id','payload','revision','created_at','updated_at']:continue
  ft=definition.get('type')
  if ft in ['number','integer']:typ='numeric';expr=f"CASE WHEN jsonb_typeof(payload->'{field}')='number' THEN (payload->>'{field}')::numeric END"
  elif ft=='boolean':typ='boolean';expr=f"CASE WHEN jsonb_typeof(payload->'{field}')='boolean' THEN (payload->>'{field}')::boolean END"
  elif ft in ['array','object']:typ='jsonb';expr=f"payload->'{field}'"
  else:typ='text';expr=f"payload->>'{field}'"
  columns.append(f'"{field}" {typ} GENERATED ALWAYS AS ({expr}) STORED')
 lines.append(f'CREATE TABLE public.{t}(\n'+',\n'.join(columns)+');\n'+f"INSERT INTO public.m31_entity_catalog VALUES ('{name}','{t}');\nALTER TABLE public.{t} ENABLE ROW LEVEL SECURITY;\n")
 for field in ['cpf','email','user_email','inscricao_id','payment_id','codigo_inscricao','dedup_key','status','token']:
  if field in schema.get('properties',{}):lines.append(f'CREATE INDEX ON public.{t}("{field}");\n')
lines.append('''CREATE OR REPLACE FUNCTION public.m31_commit(changes jsonb, suppress_events boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
''')
(root/'supabase/migrations/20261005000100_m31.sql').write_text('\n'.join(lines))
print('Schema generated:',len(schemas),'domain tables')
