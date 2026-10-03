/**
 * Modelo de dados (Drizzle / PostgreSQL).
 * Princípios:
 *  - Tudo o que tem valor jurídico é VERSIONADO e IMUTÁVEL depois de publicado (triggers em 0001_integridade.sql).
 *  - A procuração aponta para versões (power_versions, template_versions), nunca para o registo "vivo".
 *  - Na emissão congela-se um snapshot completo + hash SHA-256; o PDF emitido nunca é regenerado.
 *  - Dados pessoais sensíveis cifrados (AES-256-GCM) com índice cego (HMAC) para pesquisa exacta.
 */
import { sql } from 'drizzle-orm';
import { bigserial, boolean, date, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const criado = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const actualizado = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const sexoEnum = pgEnum('sexo', ['M', 'F']);
export const estadoCivilEnum = pgEnum('estado_civil', ['SOLTEIRO', 'CASADO', 'DIVORCIADO', 'VIUVO', 'SEPARADO', 'UNIAO_FACTO']);
export const estadoVersaoEnum = pgEnum('estado_versao', ['RASCUNHO', 'PUBLICADA', 'RETIRADA']);
export const tipoPoderEnum = pgEnum('tipo_poder', ['PODER', 'CLAUSULA']);
export const estadoPoaEnum = pgEnum('estado_procuracao', ['RASCUNHO', 'EM_REVISAO', 'VALIDADA', 'EMITIDA', 'ASSINADA', 'CANCELADA', 'ARQUIVADA']);
export const papelParteEnum = pgEnum('papel_parte', ['OUTORGANTE', 'PROCURADOR']);
export const formaActuacaoEnum = pgEnum('forma_actuacao', ['ISOLADAMENTE', 'CONJUNTAMENTE', 'QUALQUER_UM', 'DOIS_CONJUNTAMENTE', 'PERSONALIZADA']);
export const tipoFicheiroEnum = pgEnum('tipo_ficheiro', ['PDF', 'DOCX', 'DIGITALIZACAO_ASSINADA']);
export const ambitoModeloEnum = pgEnum('ambito_modelo', ['PESSOAL', 'INSTITUCIONAL']);

// ─── Organização e acesso ────────────────────────────────────────────────────
export const organizations = pgTable('organizations', {
  id: id(), code: varchar('code', { length: 40 }).notNull().unique(), name: text('name').notNull(), fullName: text('full_name').notNull(),
  address: text('address').notNull(), city: text('city').notNull(), logo: text('logo'), isDemo: boolean('is_demo').notNull().default(false), createdAt: criado(),
});

export const users = pgTable('users', {
  id: id(), orgId: uuid('org_id').notNull().references(() => organizations.id), email: varchar('email', { length: 200 }).notNull(),
  name: text('name').notNull(), passwordHash: text('password_hash').notNull(), active: boolean('active').notNull().default(true),
  failedLogins: integer('failed_logins').notNull().default(0), lockedUntil: timestamp('locked_until', { withTimezone: true }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  /** Palavra-passe temporária (criada/redefinida por um administrador): tem de ser alterada no próximo acesso. */
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  createdAt: criado(), updatedAt: actualizado(),
}, (t) => ({ emailUq: uniqueIndex('users_email_uq').on(sql`lower(${t.email})`) }));

export const roles = pgTable('roles', { id: id(), code: varchar('code', { length: 40 }).notNull().unique(), name: text('name').notNull(), system: boolean('system').notNull().default(false) });
export const permissions = pgTable('permissions', { code: varchar('code', { length: 60 }).primaryKey(), description: text('description').notNull() });
export const rolePermissions = pgTable('role_permissions', {
  roleId: uuid('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }), permissionCode: varchar('permission_code', { length: 60 }).notNull().references(() => permissions.code),
}, (t) => ({ pk: primaryKey({ columns: [t.roleId, t.permissionCode] }) }));
export const userRoles = pgTable('user_roles', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }), roleId: uuid('role_id').notNull().references(() => roles.id),
}, (t) => ({ pk: primaryKey({ columns: [t.userId, t.roleId] }) }));

/** Sessões: refresh tokens opacos (só o hash é guardado), rotação com detecção de reutilização por família. */
export const refreshTokens = pgTable('refresh_tokens', {
  id: id(), userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }), familyId: uuid('family_id').notNull(),
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }), replacedBy: uuid('replaced_by'), ip: text('ip'), userAgent: text('user_agent'), createdAt: criado(),
});

/** Oficiante do acto (Vice-Cônsul, Cônsul-Geral, 3.º Secretário…). Normaliza os 10 grafismos distintos encontrados no corpus. */
export const officers = pgTable('officers', {
  id: id(), orgId: uuid('org_id').notNull().references(() => organizations.id), name: text('name').notNull(), title: text('title').notNull(),
  userId: uuid('user_id').references(() => users.id), active: boolean('active').notNull().default(true), createdAt: criado(),
});

// ─── Pessoas e entidades ─────────────────────────────────────────────────────
export const identityDocumentTypes = pgTable('identity_document_types', { code: varchar('code', { length: 30 }).primaryKey(), name: text('name').notNull(), template: text('template').notNull(), active: boolean('active').notNull().default(true) });

export const persons = pgTable('persons', {
  id: id(), orgId: uuid('org_id').notNull().references(() => organizations.id),
  fullName: text('full_name').notNull(), searchName: text('search_name').notNull(), sex: sexoEnum('sex'), // pode faltar em registos importados (a emissão exige-o)
  birthDate: date('birth_date'), nationality: text('nationality').notNull(), birthplace: text('birthplace'),
  civilStatus: estadoCivilEnum('civil_status'), spouse: text('spouse'), propertyRegime: text('property_regime'), profession: text('profession'),
  docType: varchar('doc_type', { length: 30 }).notNull().references(() => identityDocumentTypes.code),
  // Documento pode faltar em registos importados; a checklist de emissão exige-o
  docNumberEnc: text('doc_number_enc'), docNumberBidx: varchar('doc_number_bidx', { length: 64 }),
  docIssueDate: date('doc_issue_date'), docExpiry: date('doc_expiry'), docLifetime: boolean('doc_lifetime').notNull().default(false),
  nifEnc: text('nif_enc'), nifBidx: varchar('nif_bidx', { length: 64 }),
  address: jsonb('address'), phoneEnc: text('phone_enc'), emailEnc: text('email_enc'), notesEnc: text('notes_enc'),
  isDemo: boolean('is_demo').notNull().default(false), createdBy: uuid('created_by').references(() => users.id), createdAt: criado(), updatedAt: actualizado(),
}, (t) => ({
  docUq: uniqueIndex('persons_doc_uq').on(t.orgId, t.docType, t.docNumberBidx), // evita duplicar a mesma pessoa
  nifIdx: index('persons_nif_idx').on(t.nifBidx),
  nameIdx: index('persons_search_name_trgm').using('gin', sql`${t.searchName} gin_trgm_ops`),
  docIdx: index('persons_doc_bidx_idx').on(t.docNumberBidx),
  recentesIdx: index('persons_org_updated_idx').on(t.orgId, t.updatedAt),
}));

/** Entidades referenciáveis nos poderes (bancos, conservatórias, tribunais, segurança social…). */
export const entities = pgTable('entities', {
  id: id(), orgId: uuid('org_id').notNull().references(() => organizations.id), type: varchar('type', { length: 40 }).notNull(), name: text('name').notNull(),
  shortName: text('short_name'), nif: text('nif'), active: boolean('active').notNull().default(true), isDemo: boolean('is_demo').notNull().default(false), createdAt: criado(),
});

// ─── Catálogo de poderes (Centro de Poderes) ─────────────────────────────────
export const powerCategories = pgTable('power_categories', {
  id: id(), code: varchar('code', { length: 40 }).notNull().unique(), name: text('name').notNull(), description: text('description'),
  sort: integer('sort').notNull().default(0), active: boolean('active').notNull().default(true), createdAt: criado(),
});

export const powers = pgTable('powers', {
  id: id(), code: varchar('code', { length: 40 }).notNull().unique(), kind: tipoPoderEnum('kind').notNull().default('PODER'),
  categoryId: uuid('category_id').notNull().references(() => powerCategories.id), name: text('name').notNull(), description: text('description'),
  active: boolean('active').notNull().default(true), required: boolean('required').notNull().default(false), sort: integer('sort').notNull().default(0),
  currentVersionId: uuid('current_version_id'), usageCount: integer('usage_count').notNull().default(0),
  isDemo: boolean('is_demo').notNull().default(false), createdBy: uuid('created_by').references(() => users.id), createdAt: criado(), updatedAt: actualizado(),
}, (t) => ({ nameIdx: index('powers_name_trgm').using('gin', sql`${t.name} gin_trgm_ops`) }));

/**
 * Versão de um poder. Contém TUDO o que tem efeito jurídico: texto, texto alternativo, campos (PowerField),
 * regras (dependências, incompatibilidades, sugestões), exclusividade e tipos permitidos.
 * Publicada => imutável (trigger). Editar = criar nova versão.
 */
export const powerVersions = pgTable('power_versions', {
  id: id(), powerId: uuid('power_id').notNull().references(() => powers.id), versionNo: integer('version_no').notNull(),
  status: estadoVersaoEnum('status').notNull().default('RASCUNHO'), text: text('text').notNull(), altText: text('alt_text'),
  fields: jsonb('fields').notNull().default([]), rules: jsonb('rules').notNull().default([]),
  exclusive: boolean('exclusive').notNull().default(false), allowedTypes: text('allowed_types').array().notNull().default(sql`'{}'::text[]`),
  changeNote: text('change_note'), contentHash: varchar('content_hash', { length: 64 }),
  createdBy: uuid('created_by').references(() => users.id), createdAt: criado(),
  publishedBy: uuid('published_by').references(() => users.id), publishedAt: timestamp('published_at', { withTimezone: true }),
}, (t) => ({ uq: uniqueIndex('power_versions_uq').on(t.powerId, t.versionNo) }));

export const userFavoritePowers = pgTable('user_favorite_powers', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }), powerId: uuid('power_id').notNull().references(() => powers.id), createdAt: criado(),
}, (t) => ({ pk: primaryKey({ columns: [t.userId, t.powerId] }) }));

// ─── Tipos e modelos documentais ─────────────────────────────────────────────
export const documentTemplates = pgTable('document_templates', {
  id: id(), code: varchar('code', { length: 40 }).notNull().unique(), name: text('name').notNull(), currentVersionId: uuid('current_version_id'),
  isDemo: boolean('is_demo').notNull().default(false), createdAt: criado(),
});
export const templateVersions = pgTable('template_versions', {
  id: id(), templateId: uuid('template_id').notNull().references(() => documentTemplates.id), versionNo: integer('version_no').notNull(),
  status: estadoVersaoEnum('status').notNull().default('RASCUNHO'), definition: jsonb('definition').notNull(), changeNote: text('change_note'),
  contentHash: varchar('content_hash', { length: 64 }), createdBy: uuid('created_by').references(() => users.id), createdAt: criado(),
  publishedBy: uuid('published_by').references(() => users.id), publishedAt: timestamp('published_at', { withTimezone: true }),
}, (t) => ({ uq: uniqueIndex('template_versions_uq').on(t.templateId, t.versionNo) }));

export const poaTypes = pgTable('poa_types', {
  id: id(), code: varchar('code', { length: 40 }).notNull().unique(), name: text('name').notNull(), description: text('description'),
  templateId: uuid('template_id').notNull().references(() => documentTemplates.id), suggestedPowerCodes: text('suggested_power_codes').array().notNull().default(sql`'{}'::text[]`),
  active: boolean('active').notNull().default(true), sort: integer('sort').notNull().default(0), isDemo: boolean('is_demo').notNull().default(false),
});

// ─── Numeração ───────────────────────────────────────────────────────────────
export const sequences = pgTable('sequences', {
  id: id(), orgId: uuid('org_id').notNull().references(() => organizations.id), code: varchar('code', { length: 40 }).notNull(),
  prefix: varchar('prefix', { length: 20 }).notNull(), series: varchar('series', { length: 20 }).notNull().default(''), pattern: text('pattern').notNull(),
  digits: integer('digits').notNull().default(6), year: integer('year').notNull(), lastValue: integer('last_value').notNull().default(0),
}, (t) => ({ uq: uniqueIndex('sequences_uq').on(t.orgId, t.code, t.series, t.year) }));

// ─── Procurações ─────────────────────────────────────────────────────────────
export const powersOfAttorney = pgTable('powers_of_attorney', {
  id: id(), orgId: uuid('org_id').notNull().references(() => organizations.id), number: varchar('number', { length: 60 }).unique(),
  poaTypeId: uuid('poa_type_id').notNull().references(() => poaTypes.id), status: estadoPoaEnum('status').notNull().default('RASCUNHO'),
  actDate: date('act_date').notNull(), place: text('place').notNull(), officerId: uuid('officer_id').references(() => officers.id),
  actingMode: formaActuacaoEnum('acting_mode').notNull().default('ISOLADAMENTE'), actingCustom: text('acting_custom'),
  /** Natureza dos poderes («poderes especiais», «os mais amplos poderes…»); vazio = «poderes necessários de representação». */
  powersNature: text('powers_nature'),
  templateVersionId: uuid('template_version_id').notNull().references(() => templateVersions.id),
  snapshot: jsonb('snapshot'), contentHash: varchar('content_hash', { length: 64 }), verificationCode: varchar('verification_code', { length: 16 }),
  duplicatedFromId: uuid('duplicated_from_id'), lockVersion: integer('lock_version').notNull().default(1), isDemo: boolean('is_demo').notNull().default(false),
  createdBy: uuid('created_by').notNull().references(() => users.id), updatedBy: uuid('updated_by').references(() => users.id),
  validatedBy: uuid('validated_by').references(() => users.id), validatedAt: timestamp('validated_at', { withTimezone: true }),
  issuedBy: uuid('issued_by').references(() => users.id), issuedAt: timestamp('issued_at', { withTimezone: true }),
  cancelledBy: uuid('cancelled_by').references(() => users.id), cancelledAt: timestamp('cancelled_at', { withTimezone: true }), cancelReason: text('cancel_reason'),
  createdAt: criado(), updatedAt: actualizado(),
}, (t) => ({ statusIdx: index('poa_status_idx').on(t.orgId, t.status), dateIdx: index('poa_date_idx').on(t.orgId, t.actDate) }));

export const poaParties = pgTable('poa_parties', {
  id: id(), poaId: uuid('poa_id').notNull().references(() => powersOfAttorney.id, { onDelete: 'cascade' }), personId: uuid('person_id').notNull().references(() => persons.id),
  role: papelParteEnum('role').notNull(), position: integer('position').notNull(), capacity: jsonb('capacity'),
}, (t) => ({ uq: uniqueIndex('poa_parties_uq').on(t.poaId, t.role, t.personId), personIdx: index('poa_parties_person_idx').on(t.personId) }));

export const poaPowers = pgTable('poa_powers', {
  id: id(), poaId: uuid('poa_id').notNull().references(() => powersOfAttorney.id, { onDelete: 'cascade' }),
  powerVersionId: uuid('power_version_id').references(() => powerVersions.id), position: integer('position').notNull(),
  useAlternative: boolean('use_alternative').notNull().default(false),
  customName: text('custom_name'), customText: text('custom_text'), // poder personalizado (sem versão de catálogo)
});

export const poaFieldValues = pgTable('poa_field_values', {
  id: id(), poaPowerId: uuid('poa_power_id').notNull().references(() => poaPowers.id, { onDelete: 'cascade' }), fieldKey: varchar('field_key', { length: 80 }).notNull(), value: jsonb('value'),
}, (t) => ({ uq: uniqueIndex('poa_field_values_uq').on(t.poaPowerId, t.fieldKey) }));

export const poaStatusHistory = pgTable('poa_status_history', {
  id: id(), poaId: uuid('poa_id').notNull().references(() => powersOfAttorney.id), fromStatus: estadoPoaEnum('from_status'), toStatus: estadoPoaEnum('to_status').notNull(),
  action: varchar('action', { length: 40 }).notNull(), reason: text('reason'), actorId: uuid('actor_id').notNull().references(() => users.id), at: criado(),
});

/** Ficheiros gerados/carregados. Chaves de armazenamento aleatórias; download só via API autenticada. */
export const documents = pgTable('documents', {
  id: id(), poaId: uuid('poa_id').notNull().references(() => powersOfAttorney.id), kind: tipoFicheiroEnum('kind').notNull(),
  storageKey: text('storage_key').notNull().unique(), sha256: varchar('sha256', { length: 64 }).notNull(), size: integer('size').notNull(), mime: text('mime').notNull(),
  createdBy: uuid('created_by').notNull().references(() => users.id), createdAt: criado(),
});

/** Procurações recorrentes: conjunto ordenado de poderes (com valores opcionais) reutilizável. */
export const savedModels = pgTable('saved_models', {
  id: id(), orgId: uuid('org_id').notNull().references(() => organizations.id), scope: ambitoModeloEnum('scope').notNull(), ownerId: uuid('owner_id').references(() => users.id),
  name: text('name').notNull(), poaTypeId: uuid('poa_type_id').references(() => poaTypes.id), items: jsonb('items').notNull(), isDemo: boolean('is_demo').notNull().default(false), createdAt: criado(),
});

export const importBatches = pgTable('import_batches', {
  id: id(), kind: varchar('kind', { length: 30 }).notNull(), filename: text('filename'), status: varchar('status', { length: 20 }).notNull().default('PREVIEW'),
  payload: jsonb('payload').notNull(), summary: jsonb('summary').notNull(), createdBy: uuid('created_by').notNull().references(() => users.id), createdAt: criado(),
  committedAt: timestamp('committed_at', { withTimezone: true }),
});

/** Auditoria append-only com cadeia de hashes (qualquer alteração/remoção é detectável). */
export const auditLogs = pgTable('audit_logs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(), at: criado(), actorId: uuid('actor_id'), actorIp: text('actor_ip'),
  action: varchar('action', { length: 60 }).notNull(), entity: varchar('entity', { length: 60 }).notNull(), entityId: text('entity_id'),
  changes: jsonb('changes'), metadata: jsonb('metadata'), prevHash: varchar('prev_hash', { length: 64 }), hash: varchar('hash', { length: 64 }).notNull(),
}, (t) => ({ entityIdx: index('audit_entity_idx').on(t.entity, t.entityId), atIdx: index('audit_at_idx').on(t.at) }));

export const settings = pgTable('settings', {
  orgId: uuid('org_id').notNull().references(() => organizations.id), key: varchar('key', { length: 80 }).notNull(), value: jsonb('value').notNull(), updatedAt: actualizado(),
}, (t) => ({ pk: primaryKey({ columns: [t.orgId, t.key] }) }));
