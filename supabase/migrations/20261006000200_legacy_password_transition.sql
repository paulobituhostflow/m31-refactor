-- Temporary, service-only migration. No password, Auth password hash or source token
-- is stored in app data. Supabase generates an unusable password during account import;
-- only its fingerprint is retained so a subsequently changed password cannot be replaced.
CREATE TABLE public.m31_password_migrations (
 auth_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 source_app text NOT NULL CHECK(source_app='69d51b279da069f623e291a6'),
 bootstrap_password_digest text NOT NULL,
 completed_at timestamptz
);
ALTER TABLE public.m31_password_migrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.m31_password_migrations FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.m31_password_migrations TO service_role;
INSERT INTO public.m31_password_migrations(auth_id,source_app,bootstrap_password_digest)
SELECT u.id,'69d51b279da069f623e291a6',encode(extensions.digest(coalesce(u.encrypted_password,''),'sha256'),'hex')
FROM auth.users u JOIN public.m31_identities i ON i.auth_id=u.id
WHERE u.last_sign_in_at IS NULL AND u.raw_app_meta_data->>'m31_source'='base44'
AND u.raw_app_meta_data->>'m31_migration'='20261006'
AND u.raw_app_meta_data->>'m31_legacy_user_id'=i.legacy_user_id AND u.email=i.email;

CREATE OR REPLACE FUNCTION public.m31_legacy_password_candidate(account_email text, source_app text)
RETURNS TABLE(auth_id uuid, legacy_user_id text, email text)
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT u.id,i.legacy_user_id,i.email
 FROM auth.users u JOIN public.m31_identities i ON i.auth_id=u.id
 JOIN public.m31_evento_m31_membro m ON m.id=i.member_id
 JOIN public.m31_password_migrations t ON t.auth_id=u.id
 WHERE $2='69d51b279da069f623e291a6' AND i.email=account_email AND u.email=i.email
 AND i.active AND m.payload->>'ativo'='true' AND m.payload->>'user_email'=i.email
 AND (u.banned_until IS NULL OR u.banned_until<=now())
 AND u.email_confirmed_at IS NOT NULL AND u.last_sign_in_at IS NULL
 AND t.source_app=$2 AND t.completed_at IS NULL
 AND t.bootstrap_password_digest=encode(extensions.digest(coalesce(u.encrypted_password,''),'sha256'),'hex')
 AND u.raw_app_meta_data->>'m31_source'='base44'
 AND u.raw_app_meta_data->>'m31_legacy_user_id'=i.legacy_user_id;
$$;

CREATE OR REPLACE FUNCTION public.m31_commit_legacy_password(candidate_auth_id uuid,expected_legacy_id text,expected_email text,source_app text,verified_password text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE chosen uuid;
BEGIN
 IF $4<>'69d51b279da069f623e291a6' OR $4 IS NULL OR verified_password IS NULL
 OR octet_length(verified_password) NOT BETWEEN 1 AND 72 THEN RETURN false; END IF;
 SELECT u.id INTO chosen FROM auth.users u JOIN public.m31_identities i ON i.auth_id=u.id
 JOIN public.m31_evento_m31_membro m ON m.id=i.member_id
 JOIN public.m31_password_migrations t ON t.auth_id=u.id
 WHERE u.id=candidate_auth_id AND i.legacy_user_id=expected_legacy_id AND i.email=expected_email
 AND u.email=i.email AND i.active AND m.payload->>'ativo'='true' AND m.payload->>'user_email'=i.email
 AND (u.banned_until IS NULL OR u.banned_until<=now())
 AND u.email_confirmed_at IS NOT NULL AND u.last_sign_in_at IS NULL
 AND t.source_app=$4 AND t.completed_at IS NULL
 AND t.bootstrap_password_digest=encode(extensions.digest(coalesce(u.encrypted_password,''),'sha256'),'hex')
 AND u.raw_app_meta_data->>'m31_source'='base44'
 AND u.raw_app_meta_data->>'m31_legacy_user_id'=i.legacy_user_id
 FOR UPDATE OF u,i,m,t;
 IF chosen IS NULL THEN RETURN false; END IF;
 UPDATE auth.users SET encrypted_password=extensions.crypt(verified_password,extensions.gen_salt('bf',10)),
 raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)||jsonb_build_object('m31_password_migrated_at',now(),'m31_source_app',$4),
 updated_at=now() WHERE id=chosen;
 UPDATE public.m31_password_migrations SET completed_at=now() WHERE auth_id=chosen;
 RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.m31_legacy_password_candidate(text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.m31_commit_legacy_password(uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.m31_legacy_password_candidate(text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.m31_commit_legacy_password(uuid,text,text,text,text) TO service_role;
