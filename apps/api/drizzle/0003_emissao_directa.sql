-- Emissão directa: quem tiver esta permissão faz a procuração completa (redige, confere e emite) sem revisão por terceiros.
INSERT INTO permissions (code, description)
VALUES ('poa.issue_direct', 'Emitir directamente, sem revisão por terceiros')
ON CONFLICT (code) DO NOTHING;
--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, 'poa.issue_direct' FROM roles r WHERE r.code = 'ADMINISTRADOR'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Novo perfil "Emissor autónomo" (só em bases já inicializadas; nas novas é criado pelo seed/bootstrap)
INSERT INTO roles (code, name, system)
SELECT 'EMISSOR', 'Emissor autónomo (faz a procuração completa)', true
WHERE EXISTS (SELECT 1 FROM roles WHERE code = 'ADMINISTRADOR')
ON CONFLICT (code) DO NOTHING;
--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.code FROM roles r
JOIN permissions p ON p.code IN ('power.read','person.read','person.manage','entity.create','poa.read','poa.create','poa.edit','poa.submit','poa.validate','poa.issue','poa.issue_direct','poa.cancel','poa.archive','document.download','template.read','export.run')
WHERE r.code = 'EMISSOR'
ON CONFLICT DO NOTHING;
