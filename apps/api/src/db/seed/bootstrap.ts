/**
 * Arranque de PRODUÇÃO (sem dados de demonstração).
 * Cria: organização, permissões e perfis, primeiro administrador, oficiante, tipos de documento de identificação,
 * categorias, modelos documentais (estrutura consular), tipos de procuração e configuração de numeração.
 * O catálogo de poderes começa VAZIO: importe os textos aprovados pelo Centro de Poderes (ou docs/catalogo-inicial.json).
 *
 * Uso: variáveis BOOT_* (ver docs/GUIA-IMPLEMENTACAO.md) e `npm run db:bootstrap`.
 */
import 'reflect-metadata';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { TIPOS_DOCUMENTO_OMISSAO } from '@proc/core';
import * as s from '../schema';
import { AuditService } from '../../common/audit.service';
import { CryptoService } from '../../common/crypto.service';
import { hashPassword } from '../../auth/auth.service';
import { criarPool, urlDirecta } from '../conexao';
import { CATEGORIAS } from './poderes-demo';
import { modeloConsular } from './modelo-consular';
import { PERFIS, PERMISSOES, TIPOS_POA } from './seed';
import type { Db } from '../db.module';

const Env = z.object({
  BOOT_ORG_CODE: z.string().regex(/^[A-Z0-9_-]{2,40}$/),
  BOOT_ORG_NAME: z.string().min(3),
  BOOT_ORG_FULLNAME: z.string().min(3),
  BOOT_ORG_ADDRESS: z.string().min(5),
  BOOT_ORG_CITY: z.string().min(2),
  BOOT_ADMIN_EMAIL: z.string().email(),
  BOOT_ADMIN_NAME: z.string().min(3),
  BOOT_ADMIN_PASSWORD: z.string().min(12).regex(/[a-z]/).regex(/[A-Z]/).regex(/\d/),
  BOOT_OFFICER_NAME: z.string().min(3),
  BOOT_OFFICER_TITLE: z.string().min(3).default('Vice-Cônsul'),
  BOOT_NUM_PREFIX: z.string().default('PROC'),
  BOOT_NUM_SERIE: z.string().default(''),
});

async function main() {
  const r = Env.safeParse(process.env);
  if (!r.success) { console.error('Variáveis BOOT_* em falta ou inválidas:\n' + r.error.issues.map((i) => ` - ${i.path.join('.')}: ${i.message}`).join('\n')); process.exit(1); }
  const e = r.data;
  const pool = criarPool(urlDirecta(), { max: 2, aplicacao: 'procuracoes-bootstrap' });
  const db = drizzle(pool, { schema: s }) as unknown as Db;
  if ((await db.select().from(s.organizations).where(eq(s.organizations.code, e.BOOT_ORG_CODE))).length) { console.log(`A organização ${e.BOOT_ORG_CODE} já existe. Nada a fazer.`); await pool.end(); return; }
  const audit = new AuditService();

  await db.transaction(async (tx) => {
    const [org] = await tx.insert(s.organizations).values({ code: e.BOOT_ORG_CODE, name: e.BOOT_ORG_NAME, fullName: e.BOOT_ORG_FULLNAME, address: e.BOOT_ORG_ADDRESS, city: e.BOOT_ORG_CITY }).returning();
    await tx.insert(s.permissions).values(PERMISSOES.map(([code, description]) => ({ code, description }))).onConflictDoNothing();
    const roleIds: Record<string, string> = {};
    for (const [code, p] of Object.entries(PERFIS)) {
      const [existe] = await tx.select().from(s.roles).where(eq(s.roles.code, code));
      const role = existe ?? (await tx.insert(s.roles).values({ code, name: p.nome, system: true }).returning())[0];
      roleIds[code] = role.id;
      if (!existe) await tx.insert(s.rolePermissions).values((p.perms === 'todas' ? PERMISSOES.map(([c]) => c) : p.perms).map((permissionCode) => ({ roleId: role.id, permissionCode })));
    }
    const [admin] = await tx.insert(s.users).values({ orgId: org.id, email: e.BOOT_ADMIN_EMAIL.toLowerCase(), name: e.BOOT_ADMIN_NAME, passwordHash: await hashPassword(e.BOOT_ADMIN_PASSWORD) }).returning();
    await tx.insert(s.userRoles).values({ userId: admin.id, roleId: roleIds.ADMINISTRADOR });
    await tx.insert(s.officers).values({ orgId: org.id, name: e.BOOT_OFFICER_NAME, title: e.BOOT_OFFICER_TITLE });
    await tx.insert(s.identityDocumentTypes).values(TIPOS_DOCUMENTO_OMISSAO.map((t) => ({ code: t.codigo, name: t.nome, template: t.modelo }))).onConflictDoNothing();
    let ordem = 0;
    for (const [code, name] of CATEGORIAS) await tx.insert(s.powerCategories).values({ code, name, sort: ordem++ }).onConflictDoNothing();
    const templates: Record<string, string> = {};
    for (const modo of ['PROSA', 'LISTA'] as const) {
      const code = `CONSULAR_${modo}`;
      const [ex] = await tx.select().from(s.documentTemplates).where(eq(s.documentTemplates.code, code));
      if (ex) { templates[modo] = ex.id; continue; }
      const def = modeloConsular(modo);
      const [t] = await tx.insert(s.documentTemplates).values({ code, name: `Modelo consular — poderes em ${modo === 'PROSA' ? 'texto corrido' : 'alíneas'}` }).returning();
      const [v] = await tx.insert(s.templateVersions).values({ templateId: t.id, versionNo: 1, status: 'PUBLICADA', definition: def, changeNote: 'Versão inicial — rever com o jurídico antes da primeira emissão', contentHash: CryptoService.sha256(JSON.stringify(def)), createdBy: admin.id, publishedBy: admin.id, publishedAt: new Date() }).returning();
      await tx.update(s.documentTemplates).set({ currentVersionId: v.id }).where(eq(s.documentTemplates.id, t.id));
      templates[modo] = t.id;
    }
    ordem = 0;
    for (const [code, name, modo] of TIPOS_POA) await tx.insert(s.poaTypes).values({ code, name, templateId: templates[modo], suggestedPowerCodes: [], sort: ordem++ }).onConflictDoNothing();
    await tx.insert(s.settings).values({ orgId: org.id, key: 'numeracao', value: { padrao: e.BOOT_NUM_SERIE ? '{PREFIXO}-{SERIE}-{ANO}-{SEQ}' : '{PREFIXO}-{ANO}-{SEQ}', prefixo: e.BOOT_NUM_PREFIX, serie: e.BOOT_NUM_SERIE, digitos: 6 } });
    await audit.log(tx, { id: admin.id }, 'BOOTSTRAP', 'organization', org.id, { org: e.BOOT_ORG_CODE, admin: e.BOOT_ADMIN_EMAIL });
  });
  console.log(`Organização ${e.BOOT_ORG_CODE} criada. Entre com ${e.BOOT_ADMIN_EMAIL}. Próximo passo: importar o catálogo de poderes.`);
  await pool.end();
}
main().catch((x) => { console.error(x); process.exit(1); });
