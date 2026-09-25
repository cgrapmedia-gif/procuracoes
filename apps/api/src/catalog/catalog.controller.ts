import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { and, asc, desc, eq, isNull, or } from 'drizzle-orm';
import { z } from 'zod';
import { DefinicaoModelo, construirDocumento, renderizar } from '@proc/core';
import { AuditService } from '../common/audit.service';
import { CryptoService } from '../common/crypto.service';
import { Actor, Requer, Utilizador, ZodPipe } from '../common/http';
import { Db, InjectDb } from '../db/db.module';
import * as s from '../db/schema';

const Oficiante = z.object({ nome: z.string().min(3).max(200), cargo: z.string().min(3).max(120), utilizadorId: z.string().uuid().optional() });
const Entidade = z.object({ tipo: z.string().min(2).max(40), nome: z.string().min(2).max(200), sigla: z.string().max(40).optional(), nif: z.string().max(20).optional() });
const ModeloGuardado = z.object({ nome: z.string().min(3).max(120), ambito: z.enum(['PESSOAL', 'INSTITUCIONAL']), tipoCodigo: z.string().optional(), itens: z.array(z.object({ codigo: z.string(), valores: z.record(z.unknown()).optional() })).min(1).max(200) });

@Controller()
export class CatalogController {
  constructor(@InjectDb() private readonly db: Db, private readonly audit: AuditService) {}

  @Get('poa-types') @Requer('poa.read')
  tipos() { return this.db.select({ id: s.poaTypes.id, codigo: s.poaTypes.code, nome: s.poaTypes.name, descricao: s.poaTypes.description, sugeridos: s.poaTypes.suggestedPowerCodes, demo: s.poaTypes.isDemo }).from(s.poaTypes).where(eq(s.poaTypes.active, true)).orderBy(asc(s.poaTypes.sort)); }

  @Get('officers') @Requer('poa.read')
  oficiantes(@Actor() u: Utilizador) { return this.db.select({ id: s.officers.id, nome: s.officers.name, cargo: s.officers.title }).from(s.officers).where(and(eq(s.officers.orgId, u.orgId), eq(s.officers.active, true))); }

  @Post('officers') @Requer('catalog.manage')
  criarOficiante(@Body(new ZodPipe(Oficiante)) b: z.infer<typeof Oficiante>, @Actor() u: Utilizador) {
    return this.db.transaction(async (tx) => { const [o] = await tx.insert(s.officers).values({ orgId: u.orgId, name: b.nome, title: b.cargo, userId: b.utilizadorId }).returning(); await this.audit.log(tx, u, 'OFICIANTE_CRIAR', 'officer', o.id, b); return o; });
  }

  @Get('identity-document-types') @Requer('person.read')
  tiposDocumento() { return this.db.select().from(s.identityDocumentTypes).where(eq(s.identityDocumentTypes.active, true)); }

  @Get('entities') @Requer('poa.read')
  entidades(@Actor() u: Utilizador, @Query('tipo') tipo?: string) {
    return this.db.select().from(s.entities).where(and(eq(s.entities.orgId, u.orgId), eq(s.entities.active, true), tipo ? eq(s.entities.type, tipo) : undefined)).orderBy(asc(s.entities.name));
  }
  @Post('entities') @Requer('catalog.manage')
  criarEntidade(@Body(new ZodPipe(Entidade)) b: z.infer<typeof Entidade>, @Actor() u: Utilizador) {
    return this.db.transaction(async (tx) => { const [e] = await tx.insert(s.entities).values({ orgId: u.orgId, type: b.tipo, name: b.nome, shortName: b.sigla, nif: b.nif }).returning(); await this.audit.log(tx, u, 'ENTIDADE_CRIAR', 'entity', e.id, b); return e; });
  }

  // ─── Modelos documentais (versionados como os poderes) ───
  @Get('templates') @Requer('template.read')
  modelos() { return this.db.select().from(s.documentTemplates).orderBy(asc(s.documentTemplates.name)); }

  @Get('templates/:id/versions') @Requer('template.read')
  versoes(@Param('id', ParseUUIDPipe) id: string) { return this.db.select().from(s.templateVersions).where(eq(s.templateVersions.templateId, id)).orderBy(desc(s.templateVersions.versionNo)); }

  /** Cria nova versão (rascunho). Valida a definição compilando todos os textos e gerando um documento de teste. */
  @Post('templates/:id/versions') @Requer('template.manage')
  async novaVersao(@Param('id', ParseUUIDPipe) id: string, @Body() b: { definicao: DefinicaoModelo; nota?: string }, @Actor() u: Utilizador) {
    if (!b?.definicao?.blocos) throw new BadRequestException('Definição inválida');
    const textos = [...b.definicao.cabecalho.linhas.map((l) => l.texto), ...b.definicao.blocos.flatMap((x) => ('texto' in x ? [x.texto] : 'itens' in x ? x.itens.flatMap((i) => [i.rotulo, i.nome ?? '']) : [])), b.definicao.rodape.texto];
    for (const t of textos) renderizarTeste(t);
    return this.db.transaction(async (tx) => {
      const [ult] = await tx.select().from(s.templateVersions).where(eq(s.templateVersions.templateId, id)).orderBy(desc(s.templateVersions.versionNo)).limit(1);
      if (!ult) throw new NotFoundException();
      const [v] = await tx.insert(s.templateVersions).values({ templateId: id, versionNo: ult.versionNo + 1, definition: b.definicao, changeNote: b.nota, contentHash: CryptoService.sha256(JSON.stringify(b.definicao)), createdBy: u.id }).returning();
      await this.audit.log(tx, u, 'MODELO_NOVA_VERSAO', 'template_version', v.id, { versao: v.versionNo });
      return v;
    });
  }

  @Post('templates/:id/versions/:vid/publish') @Requer('template.publish')
  publicarVersao(@Param('id', ParseUUIDPipe) id: string, @Param('vid', ParseUUIDPipe) vid: string, @Actor() u: Utilizador) {
    return this.db.transaction(async (tx) => {
      const [t] = await tx.select().from(s.documentTemplates).where(eq(s.documentTemplates.id, id)).for('update');
      const [v] = await tx.select().from(s.templateVersions).where(and(eq(s.templateVersions.id, vid), eq(s.templateVersions.templateId, id)));
      if (!t || !v || v.status !== 'RASCUNHO') throw new BadRequestException('Versão inválida');
      if (t.currentVersionId) await tx.update(s.templateVersions).set({ status: 'RETIRADA' }).where(eq(s.templateVersions.id, t.currentVersionId));
      await tx.update(s.templateVersions).set({ status: 'PUBLICADA', publishedAt: new Date(), publishedBy: u.id }).where(eq(s.templateVersions.id, vid));
      await tx.update(s.documentTemplates).set({ currentVersionId: vid }).where(eq(s.documentTemplates.id, id));
      await this.audit.log(tx, u, 'MODELO_PUBLICAR', 'template_version', vid, { versao: v.versionNo });
      return { publicado: v.versionNo }; // rascunhos já criados mantêm a versão com que nasceram; emitidas nunca mudam
    });
  }

  // ─── Procurações recorrentes ───
  @Get('saved-models') @Requer('poa.read')
  modelosGuardados(@Actor() u: Utilizador) {
    return this.db.select().from(s.savedModels).where(and(eq(s.savedModels.orgId, u.orgId), or(eq(s.savedModels.scope, 'INSTITUCIONAL'), eq(s.savedModels.ownerId, u.id)))).orderBy(asc(s.savedModels.scope), asc(s.savedModels.name));
  }
  @Post('saved-models') @Requer('poa.create')
  async criarModeloGuardado(@Body(new ZodPipe(ModeloGuardado)) b: z.infer<typeof ModeloGuardado>, @Actor() u: Utilizador) {
    if (b.ambito === 'INSTITUCIONAL' && !u.permissoes.includes('catalog.manage')) throw new BadRequestException('Só administradores criam modelos institucionais');
    const tipo = b.tipoCodigo ? (await this.db.select().from(s.poaTypes).where(eq(s.poaTypes.code, b.tipoCodigo)))[0] : undefined;
    return this.db.transaction(async (tx) => {
      const [m] = await tx.insert(s.savedModels).values({ orgId: u.orgId, scope: b.ambito, ownerId: b.ambito === 'PESSOAL' ? u.id : null, name: b.nome, poaTypeId: tipo?.id, items: b.itens }).returning();
      await this.audit.log(tx, u, 'MODELO_GUARDADO_CRIAR', 'saved_model', m.id, { nome: b.nome, ambito: b.ambito });
      return m;
    });
  }
}

function renderizarTeste(t: string) {
  try { renderizar(t, new Proxy({}, { get: () => 'x', has: () => true })); }
  catch (e) { if (/inválido/.test((e as Error).message)) throw new BadRequestException((e as Error).message); }
}
export const _usarImports = [construirDocumento, isNull];
