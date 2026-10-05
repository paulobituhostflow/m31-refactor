CREATE OR REPLACE FUNCTION public.m31_take_job(job_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 UPDATE m31_outbox SET status='processing',lease_until=now()+interval '5 minutes' WHERE id=job_id AND (status='leased' OR status='processing' AND lease_until<now()) RETURNING to_jsonb(m31_outbox.*) INTO result;
 RETURN result;
END;$$;
REVOKE ALL ON FUNCTION public.m31_take_job(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.m31_take_job(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.m31_event_matches(fn text, data jsonb, old_data jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
 CASE fn
 WHEN 'm31NotificarStatusTarefa' THEN RETURN data->>'status' IS DISTINCT FROM old_data->>'status' AND data->>'responsavel_email' IS NOT NULL;
 WHEN 'm31DespacharConfirmacoes' THEN RETURN data->>'liberada_para_envio' IS DISTINCT FROM old_data->>'liberada_para_envio' AND data->>'liberada_para_envio'='true' AND data->>'status_pagamento'='aprovado' AND data->>'data_envio_boas_vindas' IS NULL;
 WHEN 'm31AlertarGestor' THEN RETURN position('field_required' IN coalesce(data->>'tipo_erro',''))>0 AND data->>'origem'='formulario';
 WHEN 'm31AtribuirOrdemOperacional' THEN RETURN data->>'status_pagamento' IN ('aprovado','gratuito');
 WHEN 'm31SuporteObservador' THEN RETURN data->>'status_processamento'='novo';
 WHEN 'm31NotificarAtribuicaoTarefa' THEN RETURN data->>'responsavel_email' IS NOT NULL;
 ELSE RETURN true;
 END CASE;
END;$$;
-- Constraints cover duplicate provider events and message ingress, without changing historical financial classification.
CREATE UNIQUE INDEX webhook_event_unique ON public.m31_m31_asaas_webhook_evento((payload->>'event_id')) WHERE payload->>'event_id' IS NOT NULL;
CREATE UNIQUE INDEX shirt_ingress_unique ON public.m31_evento_m31_camisa_pedido((payload->>'origem_mensagem_id')) WHERE payload->>'origem_mensagem_id' IS NOT NULL;
