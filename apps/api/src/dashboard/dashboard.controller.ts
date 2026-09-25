import { Controller, Get, Query, Res } from '@nestjs/common';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { Response } from 'express';
import ExcelJS from 'exceljs';
import { Actor, Requer, Utilizador } from '../common/http';
import { AuditService, hashAuditoria } from '../common/audit.service';
import { Db, InjectDb } from '../db/db.module';
import * as s from '../db/schema';

@Controller()
export class DashboardController {
  constructor(@InjectDb() private readonly db: Db, private readonly audit: AuditService) {}

  @Get('dashboard') @Requer('poa.read')
  async dashboard(@Actor() u: Utilizador) {
    const P = s.powersOfAttorney;
    const [tot] = await this.db.select({
      total: sql<number>`count(*)`.mapWith(Number),
      rascunhos: sql<number>`count(*) filter (where ${P.status} = 'RASCUNHO')`.mapWith(Number),
      emRevisao: sql<number>`count(*) filter (where ${P.status} = 'EM_REVISAO')`.mapWith(Number),
      validadas: sql<number>`count(*) filter (where ${P.status} = 'VALIDADA')`.mapWith(Number),
      emitidas: sql<number>`count(*) filter (where ${P.status} in ('EMITIDA','ASSINADA','ARQUIVADA'))`.mapWith(Number),
      canceladas: sql<number>`count(*) filter (where ${P.status} = 'CANCELADA')`.mapWith(Number),
      esteMes: sql<number>`count(*) filter (where date_trunc('month', ${P.createdAt}) = date_trunc('month', now()))`.mapWith(Number),
      esteAno: sql<number>`count(*) filter (where date_trunc('year', ${P.createdAt}) = date_trunc('year', now()))`.mapWith(Number),
    }).from(P).where(eq(P.orgId, u.orgId));
    const porMes = await this.db.select({ mes: sql<string>`to_char(date_trunc('month', ${P.actDate}), 'YYYY-MM')`, total: sql<number>`count(*)`.mapWith(Number) })
      .from(P).where(and(eq(P.orgId, u.orgId), gte(P.actDate, sql`(date_trunc('month', now()) - interval '11 months')::date`))).groupBy(sql`1`).orderBy(sql`1`);
    const porTipo = await this.db.select({ tipo: s.poaTypes.name, total: sql<number>`count(*)`.mapWith(Number) }).from(P).innerJoin(s.poaTypes, eq(s.poaTypes.id, P.poaTypeId)).where(eq(P.orgId, u.orgId)).groupBy(s.poaTypes.name).orderBy(desc(sql`2`));
    const topPoderes = await this.db.select({ codigo: s.powers.code, nome: s.powers.name, total: s.powers.usageCount }).from(s.powers).where(sql`${s.powers.usageCount} > 0`).orderBy(desc(s.powers.usageCount)).limit(10);
    return { totais: tot, porMes, porTipo, topPoderes };
  }

  @Get('audit') @Requer('audit.read')
  auditoria(@Query('entidade') entidade?: string, @Query('id') id?: string, @Query('limite') limite = '100') {
    return this.db.select({ a: s.auditLogs, actor: s.users.name }).from(s.auditLogs).leftJoin(s.users, eq(s.users.id, s.auditLogs.actorId))
      .where(and(entidade ? eq(s.auditLogs.entity, entidade) : undefined, id ? eq(s.auditLogs.entityId, id) : undefined)).orderBy(desc(s.auditLogs.id)).limit(Math.min(Number(limite) || 100, 500));
  }

  /** Verifica a cadeia de hashes da auditoria (detecta adulteração directa na BD). */
  @Get('audit/verify') @Requer('audit.read')
  async verificarCadeia() {
    const rows = await this.db.select().from(s.auditLogs).orderBy(s.auditLogs.id);
    let prev: string | null = null;
    for (const r of rows) {
      const h = hashAuditoria(prev, r.at.toISOString(), r.actorId, r.action, r.entity, r.entityId, r.changes, r.metadata);
      if (r.prevHash !== prev || r.hash !== h) return { integra: false, quebraNoRegisto: r.id };
      prev = r.hash;
    }
    return { integra: true, registos: rows.length };
  }

  /** Exportação (CSV/Excel) — só metadados, sem dados pessoais cifrados. */
  @Get('exports/poas') @Requer('export.run')
  async exportar(@Actor() u: Utilizador, @Res() res: Response, @Query('formato') formato = 'xlsx', @Query('de') de?: string, @Query('ate') ate?: string) {
    const P = s.powersOfAttorney;
    const rows = await this.db.select({
      numero: P.number, estado: P.status, dataActo: P.actDate, tipo: s.poaTypes.name,
      outorgantes: sql<string>`(select string_agg(pe.full_name, '; ') from ${s.poaParties} pt join ${s.persons} pe on pe.id = pt.person_id where pt.poa_id = ${P.id} and pt.role = 'OUTORGANTE')`,
      procuradores: sql<string>`(select string_agg(pe.full_name, '; ') from ${s.poaParties} pt join ${s.persons} pe on pe.id = pt.person_id where pt.poa_id = ${P.id} and pt.role = 'PROCURADOR')`,
      emitidaEm: P.issuedAt,
    }).from(P).innerJoin(s.poaTypes, eq(s.poaTypes.id, P.poaTypeId)).where(and(eq(P.orgId, u.orgId), de ? gte(P.actDate, de) : undefined, ate ? lte(P.actDate, ate) : undefined)).orderBy(P.actDate);
    await this.db.transaction((tx) => this.audit.log(tx, u, 'EXPORTAR', 'poa', null, undefined, { formato, linhas: rows.length }));
    const cab = ['Número', 'Estado', 'Data do acto', 'Tipo', 'Outorgantes', 'Procuradores', 'Emitida em'];
    const valores = rows.map((r) => [r.numero ?? '', r.estado, r.dataActo, r.tipo, r.outorgantes ?? '', r.procuradores ?? '', r.emitidaEm?.toISOString() ?? '']);
    if (formato === 'csv') {
      // Protecção contra CSV/formula injection
      const esc = (v: string) => { const t = /^[=+\-@]/.test(v) ? `'${v}` : v; return `"${t.replace(/"/g, '""')}"`; };
      return res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="procuracoes.csv"' }).send('\uFEFF' + [cab, ...valores].map((l) => l.map(esc).join(';')).join('\r\n'));
    }
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Procurações');
    ws.addRow(cab).font = { bold: true }; valores.forEach((v) => ws.addRow(v)); ws.columns.forEach((c) => { c.width = 22; });
    res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="procuracoes.xlsx"' }).send(Buffer.from(await wb.xlsx.writeBuffer()));
  }
}
