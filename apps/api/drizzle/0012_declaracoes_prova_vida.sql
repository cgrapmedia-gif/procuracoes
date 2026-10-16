CREATE TABLE "declarations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" varchar(30) DEFAULT 'PROVA_VIDA' NOT NULL,
	"status" varchar(20) DEFAULT 'RASCUNHO' NOT NULL,
	"number" text,
	"act_date" date NOT NULL,
	"officer_id" uuid,
	"person_id" uuid NOT NULL,
	"data" jsonb NOT NULL,
	"template_version_id" uuid,
	"text_overrides" jsonb,
	"snapshot" jsonb,
	"content_hash" varchar(64),
	"verification_code" varchar(16),
	"renewed_from_id" uuid,
	"lock_version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"issued_by" uuid,
	"issued_at" timestamp with time zone,
	"cancel_reason" text,
	CONSTRAINT "declarations_number_unique" UNIQUE("number")
);
--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "poa_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "declaration_id" uuid;--> statement-breakpoint
ALTER TABLE "officers" ADD COLUMN "signature_label" text;--> statement-breakpoint
ALTER TABLE "officers" ADD COLUMN "honorific" text;--> statement-breakpoint
ALTER TABLE "declarations" ADD CONSTRAINT "declarations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declarations" ADD CONSTRAINT "declarations_officer_id_officers_id_fk" FOREIGN KEY ("officer_id") REFERENCES "public"."officers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declarations" ADD CONSTRAINT "declarations_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declarations" ADD CONSTRAINT "declarations_template_version_id_template_versions_id_fk" FOREIGN KEY ("template_version_id") REFERENCES "public"."template_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declarations" ADD CONSTRAINT "declarations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declarations" ADD CONSTRAINT "declarations_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declarations" ADD CONSTRAINT "declarations_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "declarations_org_idx" ON "declarations" USING btree ("org_id","act_date");--> statement-breakpoint
CREATE INDEX "declarations_person_idx" ON "declarations" USING btree ("person_id");--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_declaration_id_declarations_id_fk" FOREIGN KEY ("declaration_id") REFERENCES "public"."declarations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Documento ligado a uma procuração OU a uma declaração
ALTER TABLE documents ADD CONSTRAINT documents_origem_chk CHECK ((poa_id IS NOT NULL) <> (declaration_id IS NOT NULL));
--> statement-breakpoint
-- Declarações emitidas: conteúdo imutável (só o estado pode mudar, para cancelar); apagar só na purga
CREATE OR REPLACE FUNCTION proc_declaracao_protegida() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'RASCUNHO' AND NOT proc_purga_activa() THEN RAISE EXCEPTION 'Declaração % já emitida: não pode ser apagada.', OLD.number USING ERRCODE = 'P0001'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'RASCUNHO' AND (NEW.number IS DISTINCT FROM OLD.number OR NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.content_hash IS DISTINCT FROM OLD.content_hash OR NEW.data IS DISTINCT FROM OLD.data OR NEW.act_date IS DISTINCT FROM OLD.act_date OR NEW.person_id IS DISTINCT FROM OLD.person_id) THEN
    RAISE EXCEPTION 'Declaração % já emitida: conteúdo imutável.', OLD.number USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER declaracao_protegida BEFORE UPDATE OR DELETE ON declarations FOR EACH ROW EXECUTE FUNCTION proc_declaracao_protegida();
--> statement-breakpoint
INSERT INTO permissions (code, description) VALUES
  ('decl.read', 'Consultar declarações (provas de vida)'),
  ('decl.create', 'Preparar declarações'),
  ('decl.issue', 'Emitir e cancelar declarações')
ON CONFLICT (code) DO NOTHING;
--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.code FROM roles r JOIN permissions p ON
  (r.code = 'ADMINISTRADOR' AND p.code IN ('decl.read','decl.create','decl.issue')) OR
  (r.code = 'EMISSOR' AND p.code IN ('decl.read','decl.create','decl.issue')) OR
  (r.code = 'VALIDADOR' AND p.code IN ('decl.read','decl.issue')) OR
  (r.code = 'OPERADOR' AND p.code IN ('decl.read','decl.create')) OR
  (r.code = 'CONSULTA' AND p.code = 'decl.read')
ON CONFLICT DO NOTHING;
