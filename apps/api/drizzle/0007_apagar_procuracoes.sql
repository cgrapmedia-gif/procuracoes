-- Eliminação controlada de procurações (administradores, com motivo e registo na auditoria).
-- Os triggers de integridade continuam activos para tudo o resto; só permitem apagar quando a transacção
-- activa a marca local procuracoes.purga (SET LOCAL). A auditoria continua estritamente append-only.
CREATE OR REPLACE FUNCTION proc_purga_activa() RETURNS boolean AS $$
  SELECT coalesce(current_setting('procuracoes.purga', true), '') = 'on'
$$ LANGUAGE sql STABLE;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION proc_poa_protegida() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'RASCUNHO' AND NOT proc_purga_activa() THEN RAISE EXCEPTION 'Procuração % (%) não pode ser apagada; use Cancelar.', OLD.number, OLD.status USING ERRCODE = 'P0001'; END IF;
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
CREATE OR REPLACE FUNCTION proc_filho_rascunho() RETURNS trigger AS $$
DECLARE v_poa uuid; v_estado text;
BEGIN
  IF TG_OP = 'DELETE' AND proc_purga_activa() THEN RETURN OLD; END IF;
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
CREATE OR REPLACE FUNCTION proc_append_only_purgavel() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND proc_purga_activa() THEN RETURN OLD; END IF;
  RAISE EXCEPTION '% é append-only.', TG_TABLE_NAME USING ERRCODE = 'P0001';
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS documents_append_only ON documents;
--> statement-breakpoint
CREATE TRIGGER documents_append_only BEFORE UPDATE OR DELETE ON documents FOR EACH ROW EXECUTE FUNCTION proc_append_only_purgavel();
--> statement-breakpoint
DROP TRIGGER IF EXISTS status_history_append_only ON poa_status_history;
--> statement-breakpoint
CREATE TRIGGER status_history_append_only BEFORE UPDATE OR DELETE ON poa_status_history FOR EACH ROW EXECUTE FUNCTION proc_append_only_purgavel();
--> statement-breakpoint
INSERT INTO permissions (code, description) VALUES ('poa.purge', 'Apagar procurações e os respectivos documentos (irreversível)') ON CONFLICT (code) DO NOTHING;
--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission_code) SELECT r.id, 'poa.purge' FROM roles r WHERE r.code = 'ADMINISTRADOR' ON CONFLICT DO NOTHING;
