/**
 * Ajusta o modelo documental EM USO para aceitar textos de poderes com fórmula própria e a natureza dos poderes
 * («confere os mais amplos poderes…», do catálogo de modelos do posto), SEM perder as personalizações
 * feitas no editor: só altera o troço «a quem … {{poderes}}» e publica uma nova versão.
 * Idempotente. Uso: DATABASE_URL_DIRECT=… npm run db:modelo-abertura -w @proc/api
 */
import 'reflect-metadata';
import { drizzle } from 'drizzle-orm/node-postgres';
import { desc, eq } from 'drizzle-orm';
import type { DefinicaoModelo } from '@proc/core';
import * as s from '../schema';
import { AuditService } from '../../common/audit.service';
import { CryptoService } from '../../common/crypto.service';
import { criarPool, urlDirecta } from '../conexao';
import type { Db } from '../db.module';

async function main() {
  const pool = criarPool(urlDirecta(), { max: 2, aplicacao: 'procuracoes-modelo-abertura' });
  const db = drizzle(pool, { schema: s }) as unknown as Db;
  const [admin] = await db.select({ id: s.users.id }).from(s.users).innerJoin(s.userRoles, eq(s.userRoles.userId, s.users.id)).innerJoin(s.roles, eq(s.roles.id, s.userRoles.roleId)).where(eq(s.roles.code, 'ADMINISTRADOR')).limit(1);
  for (const t of await db.select().from(s.documentTemplates)) {
    if (!t.currentVersionId) continue;
    const [v] = await db.select().from(s.templateVersions).where(eq(s.templateVersions.id, t.currentVersionId));
    const def = structuredClone(v.definition) as DefinicaoModelo;
    let mudou = false;
    for (const b of def.blocos) {
      if (b.tipo !== 'paragrafo' || !b.texto.includes('{{poderes}}')) continue;
      let novo = b.texto;
      if (!novo.includes('poderesComAbertura')) novo = novo.replace(/a quem ([\s\S]*?)\{\{poderes\}\}/, 'a quem {{#if poderesComAbertura}}{{poderes}}{{else}}$1{{poderes}}{{/if}}');
      // Natureza dos poderes escolhida em cada procuração
      if (!novo.includes('naturezaPoderes')) novo = novo.replace('poderes necessários de representação para', '{{naturezaPoderes}} para');
      if (novo !== b.texto) { b.texto = novo; mudou = true; }
    }
    if (!mudou) { console.log(`${t.code}: nada a alterar (já ajustado ou sem «a quem … {{poderes}}»).`); continue; }
    await db.transaction(async (tx) => {
      const [ult] = await tx.select().from(s.templateVersions).where(eq(s.templateVersions.templateId, t.id)).orderBy(desc(s.templateVersions.versionNo)).limit(1);
      await tx.update(s.templateVersions).set({ status: 'RETIRADA' }).where(eq(s.templateVersions.id, v.id));
      const [n] = await tx.insert(s.templateVersions).values({ templateId: t.id, versionNo: ult.versionNo + 1, status: 'PUBLICADA', definition: def, changeNote: 'Poderes com fórmula própria (catálogo do posto) e natureza dos poderes escolhida em cada procuração', contentHash: CryptoService.sha256(JSON.stringify(def)), createdBy: admin?.id, publishedBy: admin?.id, publishedAt: new Date() }).returning();
      await tx.update(s.documentTemplates).set({ currentVersionId: n.id }).where(eq(s.documentTemplates.id, t.id));
      await new AuditService().log(tx, admin ? { id: admin.id } : null, 'MODELO_PUBLICAR', 'template_version', n.id, { modelo: t.code, versao: n.versionNo, origem: 'db:modelo-abertura' });
      console.log(`${t.code}: publicada a versão ${n.versionNo} (personalizações mantidas).`);
    });
  }
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
