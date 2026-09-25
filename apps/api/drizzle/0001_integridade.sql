-- Integridade jurídica garantida na base de dados (defesa em profundidade: mesmo um bug na API não consegue violar).

CREATE OR REPLACE FUNCTION proc_versao_imutavel() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'RASCUNHO' THEN RAISE EXCEPTION 'Versão publicada não pode ser apagada (%.%)', TG_TABLE_NAME, OLD.id USING ERRCODE = 'P0001'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'RASCUNHO' AND (to_jsonb(NEW) - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'status') THEN
    RAISE EXCEPTION 'Versão publicada é imutável (%.%). Crie uma nova versão.', TG_TABLE_NAME, OLD.id USING ERRCODE = 'P0001';
  END IF;
  IF OLD.status = 'RETIRADA' AND NEW.status <> 'RETIRADA' THEN RAISE EXCEPTION 'Versão retirada não pode ser reactivada' USING ERRCODE = 'P0001'; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER power_versions_imutavel BEFORE UPDATE OR DELETE ON power_versions FOR EACH ROW EXECUTE FUNCTION proc_versao_imutavel();
--> statement-breakpoint
CREATE TRIGGER template_versions_imutavel BEFORE UPDATE OR DELETE ON template_versions FOR EACH ROW EXECUTE FUNCTION proc_versao_imutavel();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION proc_poa_protegida() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'RASCUNHO' THEN RAISE EXCEPTION 'Procuração % (%) não pode ser apagada; use Cancelar.', OLD.number, OLD.status USING ERRCODE = 'P0001'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status IN ('EMITIDA','ASSINADA','CANCELADA','ARQUIVADA') AND (
       NEW.number IS DISTINCT FROM OLD.number OR NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
    OR NEW.act_date IS DISTINCT FROM OLD.act_date OR NEW.poa_type_id IS DISTINCT FROM OLD.poa_type_id OR NEW.template_version_id IS DISTINCT FROM OLD.template_version_id
    OR NEW.officer_id IS DISTINCT FROM OLD.officer_id OR NEW.acting_mode IS DISTINCT FROM OLD.acting_mode OR NEW.issued_at IS DISTINCT FROM OLD.issued_at) THEN
    RAISE EXCEPTION 'Procuração % já emitida: conteúdo imutável.', OLD.number USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER poa_protegida BEFORE UPDATE OR DELETE ON powers_of_attorney FOR EACH ROW EXECUTE FUNCTION proc_poa_protegida();
--> statement-breakpoint

-- Partes, poderes e valores só se alteram enquanto a procuração está em RASCUNHO.
CREATE OR REPLACE FUNCTION proc_filho_rascunho() RETURNS trigger AS $$
DECLARE v_poa uuid; v_estado text;
BEGIN
  IF TG_TABLE_NAME = 'poa_field_values' THEN
    SELECT pp.poa_id INTO v_poa FROM poa_powers pp WHERE pp.id = COALESCE(NEW.poa_power_id, OLD.poa_power_id);
  ELSE
    v_poa := COALESCE(NEW.poa_id, OLD.poa_id);
  END IF;
  SELECT status INTO v_estado FROM powers_of_attorney WHERE id = v_poa;
  IF v_estado IS NOT NULL AND v_estado <> 'RASCUNHO' THEN
    RAISE EXCEPTION 'Procuração em estado % não pode ser alterada.', v_estado USING ERRCODE = 'P0001';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER poa_parties_rascunho BEFORE INSERT OR UPDATE OR DELETE ON poa_parties FOR EACH ROW EXECUTE FUNCTION proc_filho_rascunho();
--> statement-breakpoint
CREATE TRIGGER poa_powers_rascunho BEFORE INSERT OR UPDATE OR DELETE ON poa_powers FOR EACH ROW EXECUTE FUNCTION proc_filho_rascunho();
--> statement-breakpoint
CREATE TRIGGER poa_field_values_rascunho BEFORE INSERT OR UPDATE OR DELETE ON poa_field_values FOR EACH ROW EXECUTE FUNCTION proc_filho_rascunho();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION proc_append_only() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION '% é append-only.', TG_TABLE_NAME USING ERRCODE = 'P0001'; END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION proc_append_only();
--> statement-breakpoint
CREATE TRIGGER documents_append_only BEFORE UPDATE OR DELETE ON documents FOR EACH ROW EXECUTE FUNCTION proc_append_only();
--> statement-breakpoint
CREATE TRIGGER status_history_append_only BEFORE UPDATE OR DELETE ON poa_status_history FOR EACH ROW EXECUTE FUNCTION proc_append_only();
