-- Retain only authorization metadata so deletion events remain visible after the record is removed.
ALTER TABLE public.m31_changes ADD COLUMN scope jsonb NOT NULL DEFAULT '{}';
CREATE OR REPLACE FUNCTION public.m31_change_scope_visible(event_scope jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE identity m31_identities%ROWTYPE; member jsonb; sector text;
BEGIN
 SELECT * INTO identity FROM m31_identities WHERE auth_id=auth.uid() AND active;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT payload INTO member FROM m31_evento_m31_membro WHERE id=identity.member_id AND payload->>'ativo'='true';
 IF member->>'perfil'='lider_setor' THEN sector=coalesce(member->>'setor',member->>'area');RETURN sector IS NOT NULL AND (event_scope->>'area'=sector OR event_scope->>'area_id'=sector OR event_scope->>'setor'=sector); END IF;
 IF member->>'perfil'='voluntario' THEN RETURN coalesce(event_scope->>'responsavel_email'=identity.email OR event_scope->'membros_emails' ? identity.email,false); END IF;
 RETURN false;
END;$$;
REVOKE ALL ON FUNCTION public.m31_change_scope_visible(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.m31_change_scope_visible(jsonb) TO authenticated;
DROP POLICY changes_scoped ON public.m31_changes;
CREATE POLICY changes_scoped ON public.m31_changes FOR SELECT TO authenticated USING(public.m31_change_record_visible(entity,record_id) OR entity IN ('EventoM31Tarefa','TarefaComentario','EventoM31ChecklistItem','EventoM31Cronograma','M31Frente') AND public.m31_change_scope_visible(scope));
