-- Importação em massa de pessoas (CSV/Excel/JSON): permissão reservada aos administradores
INSERT INTO permissions (code, description)
VALUES ('person.import', 'Importar pessoas em massa (CSV/Excel)')
ON CONFLICT (code) DO NOTHING;
--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, 'person.import' FROM roles r WHERE r.code = 'ADMINISTRADOR'
ON CONFLICT DO NOTHING;
