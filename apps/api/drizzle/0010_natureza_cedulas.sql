ALTER TABLE "powers_of_attorney" ADD COLUMN "powers_nature" text;--> statement-breakpoint
-- Advogados: identificação pela cédula profissional
INSERT INTO identity_document_types (code, name, template) VALUES
  ('CEDULA_OAA', 'Cédula Profissional de Advogado (Angola)', 'Cédula Profissional n.º {{numero}}, emitida pela Ordem dos Advogados de Angola{{#if emissao}}, aos {{emissao}}{{/if}}{{#if validade}}, válida até {{validade}}{{/if}}'),
  ('CEDULA_OA_PT', 'Cédula Profissional de Advogado (Portugal)', 'Cédula Profissional n.º {{numero}}, emitida pela Ordem dos Advogados portuguesa{{#if emissao}}, aos {{emissao}}{{/if}}{{#if validade}}, válida até {{validade}}{{/if}}')
ON CONFLICT (code) DO NOTHING;
