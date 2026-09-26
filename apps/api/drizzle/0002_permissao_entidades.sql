-- Nova permissão: acrescentar entidades (bancos, conservatórias, tribunais…) sem sair da procuração.
INSERT INTO permissions (code, description)
VALUES ('entity.create', 'Acrescentar entidades (bancos, conservatórias…) durante a redacção')
ON CONFLICT (code) DO NOTHING;
--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, 'entity.create' FROM roles r WHERE r.code IN ('ADMINISTRADOR', 'OPERADOR', 'VALIDADOR')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Evita duplicar a mesma entidade (mesmo tipo e nome, ignorando maiúsculas e espaços)
CREATE UNIQUE INDEX IF NOT EXISTS entities_org_tipo_nome_uq ON entities (org_id, type, lower(regexp_replace(trim(name), '\s+', ' ', 'g')));
