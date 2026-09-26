/**
 * Publica o modelo documental do posto (formato do Word de referência) numa base de dados já existente.
 * Cria uma NOVA versão de CONSULAR_PROSA e CONSULAR_LISTA e retira a anterior.
 * As procurações emitidas e os rascunhos já criados mantêm a versão com que nasceram.
 * Idempotente: se a versão publicada já for igual, não faz nada.
 *
 * Uso: DATABASE_URL_DIRECT=... npm run db:modelo-posto -w @proc/api
 */
import 'reflect-metadata';
import { drizzle } from 'drizzle-orm/node-postgres';
import { desc, eq } from 'drizzle-orm';
import * as s from '../schema';
import { AuditService } from '../../common/audit.service';
import { CryptoService } from '../../common/crypto.service';
import { criarPool, urlDirecta } from '../conexao';
import { modeloConsular } from './modelo-consular';
import type { Db } from '../db.module';

async function main() {
  const pool = criarPool(urlDirecta(), { max: 2, aplicacao: 'procuracoes-modelo' });
  const db = drizzle(pool, { schema: s }) as unknown as Db;
  const audit = new AuditService();
  const [admin] = await db.select({ id: s.users.id }).from(s.users).innerJoin(s.userRoles, eq(s.userRoles.userId, s.users.id)).innerJoin(s.roles, eq(s.roles.id, s.userRoles.roleId)).where(eq(s.roles.code, 'ADMINISTRADOR')).limit(1);
  for (const modo of ['PROSA', 'LISTA'] as const) {
    const code = `CONSULAR_${modo}`;
    const def = modeloConsular(modo);
    const hash = CryptoService.sha256(JSON.stringify(def));
    const [t] = await db.select().from(s.documentTemplates).where(eq(s.documentTemplates.code, code));
    if (!t) { console.log(`${code}: não existe nesta base (corra primeiro o seed ou o bootstrap).`); continue; }
    const [actual] = t.currentVersionId ? await db.select().from(s.templateVersions).where(eq(s.templateVersions.id, t.currentVersionId)) : [];
    if (actual?.contentHash === hash) { console.log(`${code}: já está na versão do posto (v${actual.versionNo}).`); continue; }
    await db.transaction(async (tx) => {
      const [ult] = await tx.select().from(s.templateVersions).where(eq(s.templateVersions.templateId, t.id)).orderBy(desc(s.templateVersions.versionNo)).limit(1);
      if (t.currentVersionId) await tx.update(s.templateVersions).set({ status: 'RETIRADA' }).where(eq(s.templateVersions.id, t.currentVersionId));
      const [v] = await tx.insert(s.templateVersions).values({ templateId: t.id, versionNo: (ult?.versionNo ?? 0) + 1, status: 'PUBLICADA', definition: def, changeNote: 'Formato do posto (Word de referência): moldura, cabeçalho com insígnia, texto corrido, rodapé institucional', contentHash: hash, createdBy: admin?.id, publishedBy: admin?.id, publishedAt: new Date() }).returning();
      await tx.update(s.documentTemplates).set({ currentVersionId: v.id }).where(eq(s.documentTemplates.id, t.id));
      await audit.log(tx, admin ? { id: admin.id } : null, 'MODELO_PUBLICAR', 'template_version', v.id, { modelo: code, versao: v.versionNo, origem: 'script db:modelo-posto' });
      console.log(`${code}: publicada a versão ${v.versionNo}.`);
    });
  }
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
