-- Keep historical Base44 duplicates without weakening uniqueness for new writes.
-- Populate this private ledger only from a verified migration snapshot. At least
-- one record for each key must remain outside the ledger as the canonical row.
CREATE TABLE public.m31_legacy_duplicate_keys (
  entity text REFERENCES public.m31_entity_catalog(name),
  record_id text NOT NULL,
  field text NOT NULL,
  protected_value text NOT NULL,
  PRIMARY KEY(entity, record_id, field),
  CHECK ((entity='EventoM31CamisaPedido' AND field='pedido_token') OR
         (entity='M31AsaasWebhookEvento' AND field='event_id'))
);
ALTER TABLE public.m31_legacy_duplicate_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.m31_legacy_duplicate_keys FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.m31_legacy_duplicate_keys TO service_role;

ALTER TABLE public.m31_evento_m31_camisa_pedido ADD COLUMN legacy_duplicate_key boolean NOT NULL DEFAULT false;
ALTER TABLE public.m31_m31_asaas_webhook_evento ADD COLUMN legacy_duplicate_key boolean NOT NULL DEFAULT false;

CREATE FUNCTION public.m31_mark_legacy_duplicate_key() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  NEW.legacy_duplicate_key := NEW.payload ? '_migration_source_hash' AND EXISTS (
    SELECT 1 FROM public.m31_legacy_duplicate_keys k
    WHERE k.entity=TG_ARGV[0] AND k.record_id=NEW.id AND k.field=TG_ARGV[1]
      AND k.protected_value=NEW.payload->>TG_ARGV[1]
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.m31_mark_legacy_duplicate_key() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER mark_legacy_shirt_key BEFORE INSERT OR UPDATE ON public.m31_evento_m31_camisa_pedido
FOR EACH ROW EXECUTE FUNCTION public.m31_mark_legacy_duplicate_key('EventoM31CamisaPedido','pedido_token');
CREATE TRIGGER mark_legacy_webhook_key BEFORE INSERT OR UPDATE ON public.m31_m31_asaas_webhook_evento
FOR EACH ROW EXECUTE FUNCTION public.m31_mark_legacy_duplicate_key('M31AsaasWebhookEvento','event_id');

DROP INDEX public.shirt_order_token_unique;
CREATE UNIQUE INDEX shirt_order_token_unique ON public.m31_evento_m31_camisa_pedido((payload->>'pedido_token'))
WHERE payload->>'pedido_token' IS NOT NULL AND NOT legacy_duplicate_key;
DROP INDEX public.webhook_event_unique;
CREATE UNIQUE INDEX webhook_event_unique ON public.m31_m31_asaas_webhook_evento((payload->>'event_id'))
WHERE payload->>'event_id' IS NOT NULL AND NOT legacy_duplicate_key;
