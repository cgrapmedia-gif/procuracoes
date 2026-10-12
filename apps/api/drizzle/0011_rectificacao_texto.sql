ALTER TABLE "powers_of_attorney" ADD COLUMN "rectifies_id" uuid;--> statement-breakpoint
ALTER TABLE "powers_of_attorney" ADD COLUMN "text_overrides" jsonb;--> statement-breakpoint
-- Poderes escritos (fora do catálogo): disponível para quem redige e emite
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, 'poa.custom_power' FROM roles r WHERE r.code IN ('OPERADOR', 'EMISSOR', 'VALIDADOR')
ON CONFLICT DO NOTHING;
