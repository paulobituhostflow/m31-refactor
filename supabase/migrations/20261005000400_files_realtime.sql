CREATE TABLE public.m31_file_links(file_id uuid REFERENCES public.m31_files(id) ON DELETE CASCADE,entity text REFERENCES public.m31_entity_catalog(name),record_id text NOT NULL,PRIMARY KEY(file_id,entity,record_id));
ALTER TABLE public.m31_file_links ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.m31_can_see_change(entity_name text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE identity m31_identities%ROWTYPE; member jsonb; profile text;
BEGIN
 SELECT * INTO identity FROM m31_identities WHERE auth_id=auth.uid() AND active;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT payload INTO member FROM m31_evento_m31_membro WHERE payload->>'user_email'=identity.email AND payload->>'ativo'='true' ORDER BY id LIMIT 1;
 profile=member->>'perfil';
 IF profile='super_admin' THEN RETURN true; END IF;
 IF entity_name='EventoM31Inscricao' AND EXISTS(SELECT 1 FROM m31_evento_m31_config WHERE payload->>'cartinha_autora_user_id'=identity.legacy_user_id) THEN RETURN true; END IF;
 IF entity_name~'(Finance|Financial|Transac|Conta|Payment|Contract|Pagamento|Concili|Cupom|Camisa|Asaas)' THEN RETURN profile IN ('coordenador','visualizacao') OR member->>'pode_ver_financeiro'='true'; END IF;
 IF entity_name IN ('EventoM31Inscricao','EventoM31Caravana','EventoM31Voluntario','M31InscricaoTimeline') THEN RETURN profile IN ('gestao_operacional','gestora_inscricoes','coordenacao_participantes','coordenadora_geral','coordenador','visualizacao','checkin') OR member->>'pode_ver_inscricoes'='true' OR member->>'pode_checkin'='true'; END IF;
 IF entity_name~'(Tarefa|Area|Checklist|Cronograma|Comentario|Solicitacao|Logistica|Frente|Responsavel)' THEN RETURN profile IN ('gestao_operacional','coordenadora_geral','coordenador','lider_setor','visualizacao'); END IF;
 RETURN false;
END;$$;
REVOKE ALL ON FUNCTION public.m31_can_see_change(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.m31_can_see_change(text) TO authenticated;
DROP POLICY changes_members ON public.m31_changes;
CREATE POLICY changes_scoped ON public.m31_changes FOR SELECT TO authenticated USING(public.m31_can_see_change(entity));
