ALTER TABLE "persons" ALTER COLUMN "sex" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "persons" ALTER COLUMN "doc_number_enc" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "persons" ALTER COLUMN "doc_number_bidx" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "persons_doc_bidx_idx" ON "persons" USING btree ("doc_number_bidx");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "persons_org_updated_idx" ON "persons" USING btree ("org_id","updated_at");