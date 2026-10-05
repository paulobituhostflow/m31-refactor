-- Receipt and processing job are persisted atomically, including retry after a lost HTTP response.
CREATE OR REPLACE FUNCTION public.m31_receive_asaas_event(event_payload jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE existing jsonb; duplicate boolean;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('asaas:'||(event_payload->>'event_id'),0));
 SELECT payload INTO existing FROM m31_m31_asaas_webhook_evento WHERE payload->>'event_id'=event_payload->>'event_id';
 duplicate=FOUND;
 IF NOT duplicate THEN
  INSERT INTO m31_m31_asaas_webhook_evento(id,payload) VALUES(event_payload->>'id',event_payload);
  existing=event_payload;
 END IF;
 IF existing->>'status'='recebido' THEN
  INSERT INTO m31_outbox(dedup_key,function_name,args) VALUES('asaas:'||(event_payload->>'event_id'),'m31ProcessarWebhookAsaas','{"max_eventos":5}'::jsonb) ON CONFLICT(dedup_key) DO NOTHING;
 END IF;
 RETURN duplicate;
END;$$;
REVOKE ALL ON FUNCTION public.m31_receive_asaas_event(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.m31_receive_asaas_event(jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.m31_claim_jobs(batch_size integer) RETURNS SETOF public.m31_outbox LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 RETURN QUERY UPDATE m31_outbox SET status='leased',lease_until=now()+interval '5 minutes',attempts=attempts+1 WHERE id IN (
  SELECT id FROM m31_outbox WHERE (status='pending' OR status IN ('leased','processing') AND lease_until<now()) AND available_at<=now()
  ORDER BY available_at,id LIMIT least(batch_size,100) FOR UPDATE SKIP LOCKED
 ) RETURNING *;
END;$$;
REVOKE ALL ON FUNCTION public.m31_claim_jobs(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.m31_claim_jobs(integer) TO service_role;
CREATE OR REPLACE FUNCTION public.m31_commit_files(changes jsonb,suppress_events boolean,file_links jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE link jsonb;
BEGIN
 PERFORM public.m31_commit(changes,suppress_events);
 FOR link IN SELECT value FROM jsonb_array_elements(file_links) LOOP
  INSERT INTO m31_file_links(file_id,entity,record_id) VALUES((link->>'file_id')::uuid,link->>'entity',link->>'record_id') ON CONFLICT DO NOTHING;
  IF link->>'scope'='cartinhas' THEN UPDATE m31_files SET purpose='cartinhas' WHERE id=(link->>'file_id')::uuid;
  ELSIF link->>'scope'='finance' THEN UPDATE m31_files SET purpose='finance' WHERE id=(link->>'file_id')::uuid AND purpose<>'cartinhas'; END IF;
 END LOOP;
END;$$;
REVOKE ALL ON FUNCTION public.m31_commit_files(jsonb,boolean,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.m31_commit_files(jsonb,boolean,jsonb) TO service_role;
