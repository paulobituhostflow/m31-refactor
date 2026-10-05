CREATE TABLE public.m31_locks(scope text PRIMARY KEY, owner text NOT NULL, lease_until timestamptz NOT NULL);
ALTER TABLE public.m31_locks ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.m31_acquire_lock(lock_scope text, lock_owner text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE acquired text;
BEGIN
 INSERT INTO m31_locks(scope,owner,lease_until) VALUES(lock_scope,lock_owner,now()+interval '5 minutes') ON CONFLICT(scope) DO UPDATE SET owner=excluded.owner,lease_until=excluded.lease_until WHERE m31_locks.lease_until<now() OR m31_locks.owner=excluded.owner RETURNING owner INTO acquired;
 RETURN coalesce(acquired=lock_owner,false);
END;$$;
REVOKE ALL ON FUNCTION public.m31_acquire_lock(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.m31_acquire_lock(text,text) TO service_role;
CREATE UNIQUE INDEX shirt_order_token_unique ON public.m31_evento_m31_camisa_pedido((payload->>'pedido_token')) WHERE payload->>'pedido_token' IS NOT NULL;
