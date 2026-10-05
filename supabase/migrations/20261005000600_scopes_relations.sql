-- Explicit privileges: clients receive only sanitized Realtime events and their own identity.
GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT SELECT ON public.m31_changes,public.m31_identities TO authenticated;
CREATE OR REPLACE FUNCTION public.m31_change_record_visible(entity_name text,record_identity text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE identity m31_identities%ROWTYPE; member jsonb; item jsonb; sector text;
BEGIN
 SELECT * INTO identity FROM m31_identities WHERE auth_id=auth.uid() AND active;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT payload INTO member FROM m31_evento_m31_membro WHERE id=identity.member_id AND payload->>'ativo'='true';
 IF member IS NULL THEN RETURN false; END IF;
 IF member->>'perfil'='super_admin' THEN RETURN entity_name<>'M31CartinhaEntrada'; END IF;
 IF member->>'perfil' IN ('lider_setor','voluntario') THEN
  IF entity_name IN ('EventoM31Tarefa','TarefaComentario') THEN
   IF entity_name='EventoM31Tarefa' THEN SELECT payload INTO item FROM m31_evento_m31_tarefa WHERE id=record_identity;
   ELSE SELECT task.payload INTO item FROM m31_tarefa_comentario comment JOIN m31_evento_m31_tarefa task ON task.id=comment.payload->>'tarefa_id' WHERE comment.id=record_identity; END IF;
   IF member->>'perfil'='voluntario' THEN RETURN coalesce(item->>'responsavel_email'=identity.email OR (item->'membros_emails') ? identity.email,false); END IF;
   sector=coalesce(member->>'setor',member->>'area');
   RETURN sector IS NOT NULL AND (item->>'area'=sector OR item->>'setor'=sector OR item->>'area_id'=sector);
  END IF;
  IF entity_name IN ('EventoM31ChecklistItem','EventoM31Cronograma','M31Frente') AND member->>'perfil'='lider_setor' THEN
   sector=coalesce(member->>'setor',member->>'area');
   IF entity_name='EventoM31ChecklistItem' THEN SELECT payload INTO item FROM m31_evento_m31_checklist_item WHERE id=record_identity;
   ELSIF entity_name='EventoM31Cronograma' THEN SELECT payload INTO item FROM m31_evento_m31_cronograma WHERE id=record_identity;
   ELSE SELECT payload INTO item FROM m31_m31_frente WHERE id=record_identity; END IF;
   RETURN sector IS NOT NULL AND (item->>'area'=sector OR item->>'setor'=sector OR item->>'area_id'=sector);
  END IF;
 END IF;
 RETURN public.m31_can_see_change(entity_name);
END;$$;
REVOKE ALL ON FUNCTION public.m31_change_record_visible(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.m31_change_record_visible(text,text) TO authenticated;
DROP POLICY changes_scoped ON public.m31_changes;
CREATE POLICY changes_scoped ON public.m31_changes FOR SELECT TO authenticated USING(public.m31_change_record_visible(entity,record_id));
CREATE TABLE public.m31_relationship_catalog(entity text REFERENCES m31_entity_catalog(name),field text,target text REFERENCES m31_entity_catalog(name),PRIMARY KEY(entity,field));
ALTER TABLE public.m31_relationship_catalog ENABLE ROW LEVEL SECURITY;
INSERT INTO m31_relationship_catalog VALUES('M31TransferenciaInscricao','inscricao_id','EventoM31Inscricao'),('M31InscricaoTimeline','inscricao_id','EventoM31Inscricao'),('EventoM31Inscricao','caravana_id','EventoM31Caravana'),('TarefaComentario','tarefa_id','EventoM31Tarefa'),('SupplierPayment','contract_id','SupplierContract');
GRANT ALL ON public.m31_relationship_catalog TO service_role;
CREATE OR REPLACE FUNCTION public.m31_validate_references(changes jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE change jsonb; relation record; target_table text; exists_target boolean;
BEGIN
 FOR change IN SELECT value FROM jsonb_array_elements(changes) LOOP
  IF change->'data' IS NULL OR change->'data'='null'::jsonb THEN CONTINUE; END IF;
  FOR relation IN SELECT * FROM m31_relationship_catalog WHERE entity=change->>'entity' LOOP
   IF nullif(change->'data'->>relation.field,'') IS NULL THEN CONTINUE; END IF;
   SELECT table_name INTO target_table FROM m31_entity_catalog WHERE name=relation.target;
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE id=$1)',target_table) INTO exists_target USING change->'data'->>relation.field;
   IF NOT exists_target THEN RAISE EXCEPTION 'Missing related record: %.%',relation.entity,relation.field USING ERRCODE='23503'; END IF;
  END LOOP;
 END LOOP;
END;$$;
REVOKE ALL ON FUNCTION public.m31_validate_references(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.m31_validate_references(jsonb) TO service_role;
