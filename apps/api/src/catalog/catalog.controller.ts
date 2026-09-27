import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { and, asc, desc, eq, isNull, or } from 'drizzle-orm';
import { z } from 'zod';
import { DefinicaoModelo, construirDocumento, renderizar } from '@proc/core';
import { AuditService } from '../common/audit.service';
import { CryptoService } from '../common/crypto.service';
import { Actor, Requer, Utilizador, ZodPipe } from '../common/http';
import { Db, InjectDb } from '../db/db.module';
import * as s from '../db/schema';

const Organizacao = z.object({ nome: z.string().trim().min(3).max(200), nomeCompleto: z.string().trim().min(3).max(300), morada: z.string().trim().min(5).max(500), cidade: z.string().trim().min(2).max(100) });
const Oficiante = z.object({ nome: z.string().min(3).max(200), cargo: z.string().min(3).max(120), utilizadorId: z.string().uuid().optional() });
export const TIPOS_ENTIDADE = ['BANCO', 'CONSERVATORIA', 'TRIBUNAL', 'SEGURANCA_SOCIAL', 'ADMIN_TRIBUTARIA', 'OPERADORA', 'SEGURADORA', 'EMPRESA', 'SERVICO_PUBLICO', 'OUTRA'] as const;
const Entidade = z.object({ tipo: z.enum(TIPOS_ENTIDADE), nome: z.string().trim().min(3, 'Indique o nome oficial completo').max(200), sigla: z.string().max(40).optional(), nif: z.string().max(20).optional() });
const ModeloGuardado = z.object({ nome: z.string().min(3).max(120), ambito: z.enum(['PESSOAL', 'INSTITUCIONAL']), tipoCodigo: z.string().optional(), itens: z.array(z.object({ codigo: z.string(), valores: z.record(z.unknown()).optional() })).min(1).max(200) });

@Controller()
export class CatalogController {
  constructor(@InjectDb() private readonly db: Db, private readonly audit: AuditService) {}

  @Get('poa-types') @Requer('poa.read')
  tipos() { return this.db.select({ id: s.poaTypes.id, codigo: s.poaTypes.code, nome: s.poaTypes.name, descricao: s.poaTypes.description, sugeridos: s.poaTypes.suggestedPowerCodes, demo: s.poaTypes.isDemo }).from(s.poaTypes).where(eq(s.poaTypes.active, true)).orderBy(asc(s.poaTypes.sort)); }

  @Get('officers') @Requer('poa.read')
  oficiantes(@Actor() u: Utilizador, @Query('todos') todos?: string) {
    return this.db.select({ id: s.officers.id, nome: s.officers.name, cargo: s.officers.title, activo: s.officers.active }).from(s.officers)
      .where(and(eq(s.officers.orgId, u.orgId), todos === 'true' ? undefined : eq(s.officers.active, true))).orderBy(asc(s.officers.name));
  }

  @Put('officers/:id') @Requer('catalog.manage')
  editarOficiante(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Oficiante.partial().extend({ activo: z.boolean().optional() }))) b: { nome?: string; cargo?: string; activo?: boolean }, @Actor() u: Utilizador) {
    return this.db.transaction(async (tx) => {
      const [o] = await tx.update(s.officers).set({ ...(b.nome ? { name: b.nome } : {}), ...(b.cargo ? { title: b.cargo } : {}), ...(b.activo !== undefined ? { active: b.activo } : {}) }).where(and(eq(s.officers.id, id), eq(s.officers.orgId, u.orgId))).returning();
      if (!o) throw new NotFoundException();
      await this.audit.log(tx, u, 'OFICIANTE_EDITAR', 'officer', id, b);
      return o;
    });
  }

  /** Dados do posto usados no documento (nome no cabeçalho, nome completo e morada no texto). */
  @Get('organization') @Requer('poa.read')
  async organizacao(@Actor() u: Utilizador) {
    const [o] = await this.db.select({ nome: s.organizations.name, nomeCompleto: s.organizations.fullName, morada: s.organizations.address, cidade: s.organizations.city }).from(s.organizations).where(eq(s.organizations.id, u.orgId));
    return o;
  }

  @Put('organization') @Requer('catalog.manage')
  editarOrganizacao(@Body(new ZodPipe(Organizacao)) b: z.infer<typeof Organizacao>, @Actor() u: Utilizador) {
    return this.db.transaction(async (tx) => {
      const [antes] = await tx.select().from(s.organizations).where(eq(s.organizations.id, u.orgId));
      await tx.update(s.organizations).set({ name: b.nome, fullName: b.nomeCompleto, address: b.morada, city: b.cidade }).where(eq(s.organizations.id, u.orgId));
      await this.audit.log(tx, u, 'POSTO_EDITAR', 'organization', u.orgId, { de: { nome: antes.name, nomeCompleto: antes.fullName, morada: antes.address }, para: b });
      return b;
    });
  }

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
  /**
   * Acrescentar entidade durante a redacção (ex.: um banco que ainda não está na lista).
   * Se já existir uma com o mesmo tipo e nome (ou sigla), devolve essa em vez de duplicar.
   */
  @Post('entities') @Requer('entity.create')
  async criarEntidade(@Body(new ZodPipe(Entidade)) b: z.infer<typeof Entidade>, @Actor() u: Utilizador) {
    const nome = b.nome.trim().replace(/\s+/g, ' ');
    const sigla = b.sigla?.trim().replace(/\s+/g, ' ') || null;
    const norm = (x: string) => x.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
    const mesmas = await this.db.select().from(s.entities).where(and(eq(s.entities.orgId, u.orgId), eq(s.entities.type, b.tipo)));
    const existente = mesmas.find((e) => norm(e.name) === norm(nome) || (!!sigla && !!e.shortName && norm(e.shortName) === norm(sigla)));
    if (existente) return { ...existente, existente: true };
    return this.db.transaction(async (tx) => {
      const [e] = await tx.insert(s.entities).values({ orgId: u.orgId, type: b.tipo, name: nome, shortName: sigla, nif: b.nif?.trim() || null }).returning();
      await this.audit.log(tx, u, 'ENTIDADE_CRIAR', 'entity', e.id, { tipo: b.tipo, nome, sigla });
      return { ...e, existente: false };
    });
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
