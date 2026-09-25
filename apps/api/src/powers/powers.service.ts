import { BadRequestException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { DefinicaoCampo, RegraPoder, VersaoPoder, verificarDefinicaoPoder } from '@proc/core';
import { AuditService, diff } from '../common/audit.service';
import { CryptoService } from '../common/crypto.service';
import { Utilizador } from '../common/http';
import { Db, InjectDb, Tx } from '../db/db.module';
import { poaPowers, powerCategories, powerVersions, powers, powersOfAttorney, userFavoritePowers } from '../db/schema';
import { ActualizarMetadados, ConteudoVersao, CriarPoder, PesquisaPoderes } from './power.schemas';
import { z } from 'zod';

export const hashConteudo = (c: object) => CryptoService.sha256(JSON.stringify(c));

/** Converte linha da BD no formato de domínio usado pelo motor. */
export function paraVersaoPoder(p: { id: string; code: string; name: string }, v: typeof powerVersions.$inferSelect, categoria: string): VersaoPoder {
  return {
    poderId: p.id, versaoId: v.id, numeroVersao: v.versionNo, codigo: p.code, nome: p.name, categoria,
    texto: v.text, textoAlternativo: v.altText ?? undefined, campos: v.fields as DefinicaoCampo[], regras: v.rules as RegraPoder[],
    exclusivo: v.exclusive, tiposPermitidos: v.allowedTypes,
  };
}

@Injectable()
export class PowersService {
  constructor(@InjectDb() private readonly db: Db, private readonly audit: AuditService) {}

  async pesquisar(q: z.infer<typeof PesquisaPoderes>, u: Utilizador) {
    const cond = [];
    if (q.activos !== 'todos') cond.push(eq(powers.active, q.activos === 'true'));
    if (q.tipo) cond.push(eq(powers.kind, q.tipo));
    if (q.categoria) cond.push(eq(powerCategories.code, q.categoria));
    if (q.q) { const t = `%${q.q.replace(/[%_]/g, '\\$&')}%`; cond.push(or(ilike(powers.name, t), ilike(powers.code, t), ilike(powers.description, t), ilike(powerVersions.text, t))); }
    if (q.favoritos === 'true') cond.push(sql`exists (select 1 from ${userFavoritePowers} f where f.power_id = ${powers.id} and f.user_id = ${u.id})`);
    if (q.tipoProcuracao) cond.push(sql`(cardinality(${powerVersions.allowedTypes}) = 0 or ${q.tipoProcuracao} = any(${powerVersions.allowedTypes}))`);
    const gestao = q.rascunhos && u.permissoes.includes('power.manage');
    if (!gestao) cond.push(sql`${powers.currentVersionId} is not null`);
    else if (q.rascunhos === 'so') cond.push(sql`exists (select 1 from ${powerVersions} d where d.power_id = ${powers.id} and d.status = 'RASCUNHO')`);
    const recentes = q.recentes === 'true'
      ? sql`(select max(p.updated_at) from ${poaPowers} pp join ${powerVersions} v2 on v2.id = pp.power_version_id join ${powersOfAttorney} p on p.id = pp.poa_id where v2.power_id = ${powers.id} and p.created_by = ${u.id})`
      : null;
    if (recentes) cond.push(sql`${recentes} is not null`);
    const rows = await this.db.select({
      id: powers.id, codigo: powers.code, tipo: powers.kind, nome: powers.name, descricao: powers.description, activo: powers.active, obrigatorio: powers.required,
      categoria: powerCategories.code, categoriaNome: powerCategories.name, utilizacoes: powers.usageCount, versaoId: powerVersions.id, versao: powerVersions.versionNo,
      texto: powerVersions.text, textoAlternativo: powerVersions.altText, campos: powerVersions.fields, regras: powerVersions.rules, exclusivo: powerVersions.exclusive, tiposPermitidos: powerVersions.allowedTypes, demo: powers.isDemo,
      favorito: sql<boolean>`exists (select 1 from ${userFavoritePowers} f where f.power_id = ${powers.id} and f.user_id = ${u.id})`,
      publicado: sql<boolean>`${powers.currentVersionId} is not null`,
      rascunhoPendente: sql<boolean>`exists (select 1 from ${powerVersions} d where d.power_id = ${powers.id} and d.status = 'RASCUNHO')`,
      total: sql<number>`count(*) over()`.mapWith(Number),
    }).from(powers).innerJoin(powerCategories, eq(powerCategories.id, powers.categoryId)).leftJoin(powerVersions, gestao ? sql`${powerVersions.id} = coalesce(${powers.currentVersionId}, (select lv.id from power_versions lv where lv.power_id = ${powers.id} order by lv.version_no desc limit 1))` : eq(powerVersions.id, powers.currentVersionId))
      .where(and(...cond)).orderBy(...(recentes ? [desc(recentes)] : [asc(powerCategories.sort), asc(powers.sort), asc(powers.name)])).limit(q.limite).offset((q.pagina - 1) * q.limite);
    return { total: rows[0]?.total ?? 0, itens: rows.map(({ total: _t, ...r }) => r) };
  }

  async obter(id: string) {
    const [p] = await this.db.select().from(powers).where(eq(powers.id, id));
    if (!p) throw new NotFoundException('Poder não encontrado');
    const [cat] = await this.db.select().from(powerCategories).where(eq(powerCategories.id, p.categoryId));
    const versoes = await this.db.select().from(powerVersions).where(eq(powerVersions.powerId, id)).orderBy(desc(powerVersions.versionNo));
    return { ...p, categoria: cat, versoes };
  }

  /** Catálogo publicado em formato de domínio (para regras e sugestões). */
  async catalogoPublicado(tx: Tx = this.db): Promise<Map<string, VersaoPoder>> {
    const rows = await tx.select({ p: powers, v: powerVersions, cat: powerCategories.code }).from(powers)
      .innerJoin(powerVersions, eq(powerVersions.id, powers.currentVersionId)).innerJoin(powerCategories, eq(powerCategories.id, powers.categoryId)).where(eq(powers.active, true));
    return new Map(rows.map((r) => [r.p.code, paraVersaoPoder(r.p, r.v, r.cat)]));
  }

  validarConteudo(c: ConteudoVersao, codigo: string) {
    const erros = verificarDefinicaoPoder({ texto: c.texto, textoAlternativo: c.textoAlternativo ?? undefined, campos: c.campos as DefinicaoCampo[] });
    if (c.regras.some((r) => r.alvoCodigo === codigo)) erros.push('Um poder não pode ter regras sobre si próprio.');
    if (erros.length) throw new UnprocessableEntityException({ message: 'Definição do poder inválida', erros });
  }

  private async categoriaId(tx: Tx, code: string) {
    const [c] = await tx.select({ id: powerCategories.id }).from(powerCategories).where(eq(powerCategories.code, code));
    if (!c) throw new BadRequestException(`Categoria inexistente: ${code}`);
    return c.id;
  }

  async criar(dto: z.infer<typeof CriarPoder>, u: Utilizador, opts: { publicar?: boolean; demo?: boolean; tx?: Tx } = {}) {
    this.validarConteudo(dto, dto.codigo);
    const run = async (tx: Tx) => {
      const [p] = await tx.insert(powers).values({ code: dto.codigo, kind: dto.tipo, categoryId: await this.categoriaId(tx, dto.categoriaCodigo), name: dto.nome, description: dto.descricao, required: dto.obrigatorio, sort: dto.ordem, isDemo: !!opts.demo, createdBy: u.id }).returning();
      const [v] = await tx.insert(powerVersions).values({ powerId: p.id, versionNo: 1, ...this.colunasVersao(dto), createdBy: u.id }).returning();
      await this.audit.log(tx, u, 'PODER_CRIAR', 'power', p.id, { codigo: dto.codigo, nome: dto.nome });
      if (opts.publicar) await this.publicarVersao(tx, p.id, v.id, u);
      return { id: p.id, versaoId: v.id };
    };
    return opts.tx ? run(opts.tx) : this.db.transaction(run);
  }

  private colunasVersao(c: ConteudoVersao) {
    const conteudo = { text: c.texto, altText: c.textoAlternativo ?? null, fields: c.campos, rules: c.regras, exclusive: c.exclusivo, allowedTypes: c.tiposPermitidos };
    return { ...conteudo, changeNote: c.notaAlteracao, contentHash: hashConteudo(conteudo) };
  }

  async actualizarMetadados(id: string, dto: z.infer<typeof ActualizarMetadados>, u: Utilizador) {
    return this.db.transaction(async (tx) => {
      const [antes] = await tx.select().from(powers).where(eq(powers.id, id)).for('update');
      if (!antes) throw new NotFoundException();
      const set = { name: dto.nome ?? antes.name, description: dto.descricao === undefined ? antes.description : dto.descricao, required: dto.obrigatorio ?? antes.required, sort: dto.ordem ?? antes.sort, categoryId: dto.categoriaCodigo ? await this.categoriaId(tx, dto.categoriaCodigo) : antes.categoryId, updatedAt: new Date() };
      const [depois] = await tx.update(powers).set(set).where(eq(powers.id, id)).returning();
      await this.audit.log(tx, u, 'PODER_EDITAR', 'power', id, diff(antes, depois));
      return depois;
    });
  }

  /** Guarda o conteúdo jurídico: actualiza o rascunho existente ou cria nova versão (nunca altera uma publicada). */
  async guardarRascunho(id: string, c: ConteudoVersao, u: Utilizador) {
    return this.db.transaction(async (tx) => {
      const [p] = await tx.select().from(powers).where(eq(powers.id, id)).for('update');
      if (!p) throw new NotFoundException();
      this.validarConteudo(c, p.code);
      const [ult] = await tx.select().from(powerVersions).where(eq(powerVersions.powerId, id)).orderBy(desc(powerVersions.versionNo)).limit(1);
      if (ult?.status === 'RASCUNHO') {
        const [v] = await tx.update(powerVersions).set(this.colunasVersao(c)).where(eq(powerVersions.id, ult.id)).returning();
        await this.audit.log(tx, u, 'PODER_RASCUNHO_EDITAR', 'power_version', v.id, diff(ult, v));
        return v;
      }
      const [v] = await tx.insert(powerVersions).values({ powerId: id, versionNo: (ult?.versionNo ?? 0) + 1, ...this.colunasVersao(c), createdBy: u.id }).returning();
      await this.audit.log(tx, u, 'PODER_NOVA_VERSAO', 'power_version', v.id, { versao: v.versionNo });
      return v;
    });
  }

  async publicar(id: string, u: Utilizador) {
    return this.db.transaction(async (tx) => {
      const [ult] = await tx.select().from(powerVersions).where(and(eq(powerVersions.powerId, id), eq(powerVersions.status, 'RASCUNHO'))).orderBy(desc(powerVersions.versionNo)).limit(1);
      if (!ult) throw new BadRequestException('Não existe rascunho para publicar.');
      return this.publicarVersao(tx, id, ult.id, u);
    });
  }

  async publicarVersao(tx: Tx, powerId: string, versionId: string, u: Utilizador) {
    const [v] = await tx.select().from(powerVersions).where(eq(powerVersions.id, versionId));
    const alvos = (v.rules as RegraPoder[]).map((r) => r.alvoCodigo);
    if (alvos.length) {
      const existentes = await tx.select({ code: powers.code }).from(powers).where(inArray(powers.code, alvos));
      const falta = alvos.filter((a) => !existentes.some((e) => e.code === a));
      if (falta.length) throw new UnprocessableEntityException({ message: 'Regras referem poderes inexistentes', erros: falta });
    }
    const [p] = await tx.select().from(powers).where(eq(powers.id, powerId));
    if (p.currentVersionId) await tx.update(powerVersions).set({ status: 'RETIRADA' }).where(eq(powerVersions.id, p.currentVersionId));
    // Nota: 'published_at/by' são definidos na mesma operação que muda o estado (antes de ficar imutável).
    await tx.execute(sql`update power_versions set status = 'PUBLICADA', published_at = now(), published_by = ${u.id} where id = ${versionId}`);
    await tx.update(powers).set({ currentVersionId: versionId, updatedAt: new Date() }).where(eq(powers.id, powerId));
    await this.audit.log(tx, u, 'PODER_PUBLICAR', 'power_version', versionId, { versao: v.versionNo, hash: v.contentHash });
    return { powerId, versaoId: versionId, versao: v.versionNo };
  }

  async definirActivo(id: string, activo: boolean, u: Utilizador) {
    return this.db.transaction(async (tx) => {
      const [p] = await tx.update(powers).set({ active: activo, updatedAt: new Date() }).where(eq(powers.id, id)).returning();
      if (!p) throw new NotFoundException();
      await this.audit.log(tx, u, activo ? 'PODER_ACTIVAR' : 'PODER_DESACTIVAR', 'power', id);
      return p;
    });
  }

  async duplicar(id: string, novoCodigo: string, u: Utilizador) {
    const o = await this.obter(id);
    const base = o.versoes[0];
    return this.criar({
      codigo: novoCodigo, tipo: o.kind, categoriaCodigo: o.categoria.code, nome: `${o.name} (cópia)`, descricao: o.description ?? undefined, obrigatorio: o.required, ordem: o.sort,
      texto: base.text, textoAlternativo: base.altText, campos: base.fields as never, regras: base.rules as never, exclusivo: base.exclusive, tiposPermitidos: base.allowedTypes, notaAlteracao: `Duplicado de ${o.code} v${base.versionNo}`,
    }, u);
  }

  async favorito(id: string, marcar: boolean, u: Utilizador) {
    if (marcar) await this.db.insert(userFavoritePowers).values({ userId: u.id, powerId: id }).onConflictDoNothing();
    else await this.db.delete(userFavoritePowers).where(and(eq(userFavoritePowers.userId, u.id), eq(userFavoritePowers.powerId, id)));
    return { favorito: marcar };
  }
}
