import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql, SQL } from 'drizzle-orm';
import { z } from 'zod';
import {
  DadosProcuracao, DefinicaoModelo, Estado, PoderSeleccionado, Problema, TIPOS_DOCUMENTO_OMISSAO, VersaoPoder,
  avaliarRegras, checklistEmissao, construirDocumento, editavel, sugerirPoderes, transitar, accoesDisponiveis,
} from '@proc/core';
import { AuditService, diff } from '../common/audit.service';
import { CryptoService, normalizarNome } from '../common/crypto.service';
import { Utilizador } from '../common/http';
import { config } from '../config';
import { Db, InjectDb, Tx } from '../db/db.module';
import * as s from '../db/schema';
import { PersonsService } from '../persons/persons.service';
import { PowersService, paraVersaoPoder } from '../powers/powers.service';
import { CriarProcuracao, GuardarProcuracao, PesquisaProcuracoes } from './poa.schemas';

export interface Carregado {
  poa: typeof s.powersOfAttorney.$inferSelect;
  dados: DadosProcuracao;
  modelo: DefinicaoModelo;
  tiposDoc: typeof TIPOS_DOCUMENTO_OMISSAO;
  versoesActuais: Record<string, number>;
}

@Injectable()
export class PoaService {
  constructor(@InjectDb() readonly db: Db, private readonly pessoas: PersonsService, private readonly poderes: PowersService, private readonly audit: AuditService, private readonly crypto: CryptoService) {}

  async criar(dto: z.infer<typeof CriarProcuracao>, u: Utilizador) {
    return this.db.transaction(async (tx) => {
      const [tipo] = await tx.select().from(s.poaTypes).where(and(eq(s.poaTypes.code, dto.tipoCodigo), eq(s.poaTypes.active, true)));
      if (!tipo) throw new BadRequestException('Tipo de procuração inválido');
      const [tpl] = await tx.select().from(s.documentTemplates).where(eq(s.documentTemplates.id, tipo.templateId));
      if (!tpl?.currentVersionId) throw new BadRequestException('O tipo não tem modelo documental publicado');
      const [p] = await tx.insert(s.powersOfAttorney).values({
        orgId: u.orgId, poaTypeId: tipo.id, actDate: dto.dataActo, place: dto.local, officerId: dto.oficianteId, templateVersionId: tpl.currentVersionId, createdBy: u.id, isDemo: tipo.isDemo,
      }).returning();
      if (dto.modeloGuardadoId) await this.aplicarModeloGuardado(tx, p.id, dto.modeloGuardadoId, u);
      await this.historico(tx, p.id, null, 'RASCUNHO', 'CRIAR', u);
      await this.audit.log(tx, u, 'POA_CRIAR', 'poa', p.id, { tipo: tipo.code });
      return { id: p.id };
    });
  }

  /** Carrega poderes de uma "procuração recorrente" (modelo pessoal/institucional) nas versões actuais. */
  private async aplicarModeloGuardado(tx: Tx, poaId: string, modeloId: string, u: Utilizador) {
    const [m] = await tx.select().from(s.savedModels).where(and(eq(s.savedModels.id, modeloId), eq(s.savedModels.orgId, u.orgId)));
    if (!m || (m.scope === 'PESSOAL' && m.ownerId !== u.id)) throw new NotFoundException('Modelo não encontrado');
    const itens = m.items as { codigo: string; valores?: Record<string, unknown> }[];
    const cat = await this.poderes.catalogoPublicado(tx);
    let pos = 0;
    for (const it of itens) {
      const v = cat.get(it.codigo);
      if (!v) continue;
      const [pp] = await tx.insert(s.poaPowers).values({ poaId, powerVersionId: v.versaoId, position: pos++ }).returning();
      for (const [k, val] of Object.entries(it.valores ?? {})) if (v.campos.some((c) => c.chave === k)) await tx.insert(s.poaFieldValues).values({ poaPowerId: pp.id, fieldKey: k, value: val as object });
    }
  }

  private async obterLinha(tx: Tx, id: string, u: Utilizador, lock = false) {
    const q = tx.select().from(s.powersOfAttorney).where(and(eq(s.powersOfAttorney.id, id), eq(s.powersOfAttorney.orgId, u.orgId)));
    const [p] = lock ? await q.for('update') : await q;
    if (!p) throw new NotFoundException('Procuração não encontrada');
    return p;
  }

  /** Substitui por completo partes, poderes (pela ordem dada) e valores. Controlo de concorrência optimista. */
  async guardar(id: string, d: GuardarProcuracao, u: Utilizador) {
    return this.db.transaction(async (tx) => {
      const p = await this.obterLinha(tx, id, u, true);
      if (!editavel(p.status as Estado)) throw new ConflictException(`Procuração em ${p.status} não pode ser editada.`);
      if (p.lockVersion !== d.lockVersion) throw new ConflictException('A procuração foi alterada por outro utilizador. Recarregue antes de guardar.');
      const ids = [...d.outorgantes.map((o) => o.pessoaId), ...d.procuradores.map((x) => x.pessoaId)];
      const encontradas = await tx.select({ id: s.persons.id }).from(s.persons).where(and(inArray(s.persons.id, ids), eq(s.persons.orgId, u.orgId)));
      if (new Set(encontradas.map((x) => x.id)).size !== new Set(ids).size) throw new BadRequestException('Pessoa inexistente');
      if (d.outorgantes.some((o) => d.procuradores.some((x) => x.pessoaId === o.pessoaId))) throw new BadRequestException('A mesma pessoa não pode ser outorgante e procurador.');
      if (d.poderes.some((x) => 'personalizado' in x) && !u.permissoes.includes('poa.custom_power')) throw new ForbiddenException('Sem permissão para poderes personalizados.');
      const versaoIds = d.poderes.flatMap((x) => ('versaoId' in x ? [x.versaoId] : []));
      if (versaoIds.length) {
        const vs = await tx.select({ id: s.powerVersions.id, status: s.powerVersions.status }).from(s.powerVersions).where(inArray(s.powerVersions.id, versaoIds));
        if (vs.some((v) => v.status === 'RASCUNHO') || new Set(vs.map((v) => v.id)).size !== new Set(versaoIds).size) throw new BadRequestException('Só podem ser usadas versões publicadas do catálogo.');
      }
      if (d.oficianteId) { const [o] = await tx.select().from(s.officers).where(and(eq(s.officers.id, d.oficianteId), eq(s.officers.orgId, u.orgId), eq(s.officers.active, true))); if (!o) throw new BadRequestException('Oficiante inválido'); }

      const antes = await this.resumo(tx, id);
      await tx.delete(s.poaParties).where(eq(s.poaParties.poaId, id));
      await tx.delete(s.poaPowers).where(eq(s.poaPowers.poaId, id));
      let i = 0;
      for (const o of d.outorgantes) await tx.insert(s.poaParties).values({ poaId: id, personId: o.pessoaId, role: 'OUTORGANTE', position: i++, capacity: o.qualidade ? { tipo: 'REPRESENTANTE', texto: o.qualidade } : null });
      i = 0;
      for (const x of d.procuradores) await tx.insert(s.poaParties).values({ poaId: id, personId: x.pessoaId, role: 'PROCURADOR', position: i++ });
      i = 0;
      for (const x of d.poderes) {
        if ('versaoId' in x) {
          const [pp] = await tx.insert(s.poaPowers).values({ poaId: id, powerVersionId: x.versaoId, position: i++, useAlternative: x.usarAlternativo }).returning({ id: s.poaPowers.id });
          const vals = Object.entries(x.valores).filter(([, v]) => v !== undefined);
          if (vals.length) await tx.insert(s.poaFieldValues).values(vals.map(([k, v]) => ({ poaPowerId: pp.id, fieldKey: k.slice(0, 80), value: v as object })));
        } else await tx.insert(s.poaPowers).values({ poaId: id, position: i++, customName: x.personalizado.nome, customText: x.personalizado.texto });
      }
      await tx.update(s.powersOfAttorney).set({
        actDate: d.dataActo, place: d.local, officerId: d.oficianteId ?? null, actingMode: d.formaActuacao, actingCustom: d.formaActuacaoPersonalizada ?? null,
        lockVersion: p.lockVersion + 1, updatedBy: u.id, updatedAt: new Date(),
      }).where(eq(s.powersOfAttorney.id, id));
      const depois = await this.resumo(tx, id);
      await this.audit.log(tx, u, 'POA_EDITAR', 'poa', id, diff(antes, depois));
      return { id, lockVersion: p.lockVersion + 1 };
    });
  }

  /** Estrutura comparável para a auditoria (o que mudou). */
  private async resumo(tx: Tx, id: string) {
    const [p] = await tx.select().from(s.powersOfAttorney).where(eq(s.powersOfAttorney.id, id));
    const partes = await tx.select().from(s.poaParties).where(eq(s.poaParties.poaId, id)).orderBy(asc(s.poaParties.role), asc(s.poaParties.position));
    const pw = await tx.select({ pp: s.poaPowers, code: s.powers.code, v: s.powerVersions.versionNo }).from(s.poaPowers).leftJoin(s.powerVersions, eq(s.powerVersions.id, s.poaPowers.powerVersionId)).leftJoin(s.powers, eq(s.powers.id, s.powerVersions.powerId)).where(eq(s.poaPowers.poaId, id)).orderBy(asc(s.poaPowers.position));
    const vals = pw.length ? await tx.select().from(s.poaFieldValues).where(inArray(s.poaFieldValues.poaPowerId, pw.map((x) => x.pp.id))) : [];
    return {
      dataActo: p.actDate, local: p.place, oficiante: p.officerId, formaActuacao: p.actingMode,
      outorgantes: partes.filter((x) => x.role === 'OUTORGANTE').map((x) => x.personId), procuradores: partes.filter((x) => x.role === 'PROCURADOR').map((x) => x.personId),
      poderes: pw.map((x) => (x.code ? `${x.code}@v${x.v}` : `PERSONALIZADO:${x.pp.customName}`)),
      valores: Object.fromEntries(pw.map((x, i) => [`${i + 1}:${x.code ?? 'P'}`, Object.fromEntries(vals.filter((v) => v.poaPowerId === x.pp.id).map((v) => [v.fieldKey, v.value]))])),
    };
  }

  /** Reúne tudo o que é necessário para validar e gerar o documento. */
  async carregar(tx: Tx, id: string, u: Utilizador): Promise<Carregado> {
    const poa = await this.obterLinha(tx, id, u);
    const [tipo] = await tx.select().from(s.poaTypes).where(eq(s.poaTypes.id, poa.poaTypeId));
    const [org] = await tx.select().from(s.organizations).where(eq(s.organizations.id, poa.orgId));
    const [tv] = await tx.select().from(s.templateVersions).where(eq(s.templateVersions.id, poa.templateVersionId));
    const oficiante = poa.officerId ? (await tx.select().from(s.officers).where(eq(s.officers.id, poa.officerId)))[0] : undefined;
    const partes = await tx.select().from(s.poaParties).where(eq(s.poaParties.poaId, id)).orderBy(asc(s.poaParties.position));
    const pessoas = new Map<string, Awaited<ReturnType<PersonsService['obter']>>>();
    for (const x of partes) pessoas.set(x.personId, await this.pessoas.obter(x.personId, u, tx));
    const linhas = await tx.select({ pp: s.poaPowers, v: s.powerVersions, p: s.powers, cat: s.powerCategories.code })
      .from(s.poaPowers).leftJoin(s.powerVersions, eq(s.powerVersions.id, s.poaPowers.powerVersionId)).leftJoin(s.powers, eq(s.powers.id, s.powerVersions.powerId))
      .leftJoin(s.powerCategories, eq(s.powerCategories.id, s.powers.categoryId)).where(eq(s.poaPowers.poaId, id)).orderBy(asc(s.poaPowers.position));
    const vals = linhas.length ? await tx.select().from(s.poaFieldValues).where(inArray(s.poaFieldValues.poaPowerId, linhas.map((l) => l.pp.id))) : [];
    const poderes: PoderSeleccionado[] = linhas.map((l) => {
      const valores = Object.fromEntries(vals.filter((v) => v.poaPowerId === l.pp.id).map((v) => [v.fieldKey, v.value])) as PoderSeleccionado['valores'];
      if (l.v && l.p) return { instanciaId: l.pp.id, versao: paraVersaoPoder(l.p, l.v, l.cat ?? ''), valores, usarAlternativo: l.pp.useAlternative };
      const versao: VersaoPoder = { poderId: 'custom', versaoId: l.pp.id, numeroVersao: 0, codigo: `PERS-${l.pp.position + 1}`, nome: l.pp.customName ?? 'Poder personalizado', categoria: 'PERSONALIZADO', texto: escaparHbs(l.pp.customText ?? ''), campos: [], regras: [] };
      return { instanciaId: l.pp.id, versao, valores: {}, personalizado: true };
    });
    const clausulas = poderes.filter((x) => linhas.find((l) => l.pp.id === x.instanciaId)?.p?.kind === 'CLAUSULA');
    const soPoderes = poderes.filter((x) => !clausulas.includes(x));
    const tiposDoc = (await tx.select().from(s.identityDocumentTypes)).map((t) => ({ codigo: t.code, nome: t.name, modelo: t.template }));
    const actuais = await tx.select({ code: s.powers.code, v: s.powerVersions.versionNo }).from(s.powers).innerJoin(s.powerVersions, eq(s.powerVersions.id, s.powers.currentVersionId));
    const dados: DadosProcuracao = {
      numero: poa.number ?? undefined, dataActo: poa.actDate, local: poa.place, tipoProcuracao: { codigo: tipo.code, nome: tipo.name },
      posto: { nome: org.name, nomeCompleto: org.fullName, morada: org.address },
      oficiante: { nome: oficiante?.name ?? '', cargo: oficiante?.title ?? '' },
      outorgantes: partes.filter((x) => x.role === 'OUTORGANTE').map((x) => ({ pessoa: pessoas.get(x.personId)!, qualidade: (x.capacity as DadosProcuracao['outorgantes'][0]['qualidade']) ?? undefined })),
      procuradores: partes.filter((x) => x.role === 'PROCURADOR').map((x) => pessoas.get(x.personId)!),
      formaActuacao: poa.actingMode, formaActuacaoPersonalizada: poa.actingCustom ?? undefined,
      poderes: soPoderes, clausulas, demo: poa.isDemo,
    };
    return { poa, dados, modelo: tv.definition as DefinicaoModelo, tiposDoc, versoesActuais: Object.fromEntries(actuais.map((a) => [a.code, a.v])) };
  }

  avaliar(c: Carregado) {
    const todos = [...c.dados.poderes, ...c.dados.clausulas];
    const problemas: Problema[] = avaliarRegras(todos, { tipoProcuracao: c.dados.tipoProcuracao.codigo, dataActo: c.dados.dataActo, versoesActuais: c.versoesActuais });
    const erros = problemas.filter((p) => p.severidade === 'ERRO').length;
    const checklist = c.dados.outorgantes.length && c.dados.procuradores.length ? checklistEmissao(c.dados, erros)
      : [{ chave: 'partes', rotulo: 'Outorgante e procurador identificados', ok: false }];
    return { problemas, checklist, pronta: checklist.every((i) => i.ok) };
  }

  async verificar(id: string, u: Utilizador) {
    const c = await this.carregar(this.db, id, u);
    const r = this.avaliar(c);
    const cat = await this.poderes.catalogoPublicado();
    const [tipo] = await this.db.select().from(s.poaTypes).where(eq(s.poaTypes.id, c.poa.poaTypeId));
    const sugestoes = sugerirPoderes(c.dados.poderes, cat);
    // Sugestões do tipo de procuração (configuradas) quando ainda não há poderes
    if (!c.dados.poderes.length) for (const code of tipo.suggestedPowerCodes) { const v = cat.get(code); if (v) sugestoes.push({ codigo: v.codigo, nome: v.nome, motivo: `Habitual em "${tipo.name}"`, peso: 1 }); }
    return { ...r, sugestoes: sugestoes.map((x) => ({ ...x, versaoId: cat.get(x.codigo)?.versaoId })), accoes: accoesDisponiveis(c.poa.status as Estado, new Set(u.permissoes)), estado: c.poa.status };
  }

  /** Documento de pré-visualização (sempre com marca de água; campos em falta assinalados). */
  async documentoPreVisualizacao(id: string, u: Utilizador) {
    const c = await this.carregar(this.db, id, u);
    if (!c.dados.outorgantes.length || !c.dados.procuradores.length) throw new BadRequestException('Identifique outorgante e procurador para pré-visualizar.');
    return construirDocumento(c.modelo, { ...c.dados, numero: c.poa.number ?? undefined }, { preVisualizacao: !c.poa.number, tipos: c.tiposDoc });
  }

  async historico(tx: Tx, poaId: string, de: Estado | null, para: Estado, accao: string, u: Utilizador, motivo?: string) {
    await tx.insert(s.poaStatusHistory).values({ poaId, fromStatus: de, toStatus: para, action: accao, reason: motivo, actorId: u.id });
  }

  /** Transições simples (a EMISSÃO tem serviço próprio). */
  async transitar(id: string, accao: 'SUBMETER' | 'DEVOLVER' | 'VALIDAR' | 'CANCELAR' | 'ARQUIVAR', motivo: string | undefined, u: Utilizador) {
    return this.db.transaction(async (tx) => {
      const p = await this.obterLinha(tx, id, u, true);
      const para = transitar(p.status as Estado, accao, { permissoes: new Set(u.permissoes), motivo, criadorId: p.createdBy, actorId: u.id, segregacao: config().SEGREGACAO_FUNCOES === 'true' });
      if (accao === 'SUBMETER' || accao === 'VALIDAR') {
        const r = this.avaliar(await this.carregar(tx, id, u));
        if (!r.pronta) throw new ConflictException({ message: 'A procuração tem pendências.', checklist: r.checklist, problemas: r.problemas.filter((x) => x.severidade === 'ERRO') });
      }
      const set: Partial<typeof s.powersOfAttorney.$inferInsert> = { status: para, updatedBy: u.id, updatedAt: new Date(), lockVersion: p.lockVersion + 1 };
      if (accao === 'VALIDAR') Object.assign(set, { validatedBy: u.id, validatedAt: new Date() });
      if (accao === 'DEVOLVER') Object.assign(set, { validatedBy: null, validatedAt: null });
      if (accao === 'CANCELAR') Object.assign(set, { cancelledBy: u.id, cancelledAt: new Date(), cancelReason: motivo });
      await tx.update(s.powersOfAttorney).set(set).where(eq(s.powersOfAttorney.id, id));
      await this.historico(tx, id, p.status as Estado, para, accao, u, motivo);
      await this.audit.log(tx, u, `POA_${accao}`, 'poa', id, { de: p.status, para }, motivo ? { motivo } : undefined);
      return { id, estado: para };
    });
  }

  /** Duplica para novo rascunho: poderes passam para a versão publicada actual; valores de campos que já não existem são descartados. */
  async duplicar(id: string, u: Utilizador) {
    const c = await this.carregar(this.db, id, u);
    const cat = await this.poderes.catalogoPublicado();
    const descartados: string[] = [];
    return this.db.transaction(async (tx) => {
      const [tipo] = await tx.select().from(s.poaTypes).where(eq(s.poaTypes.id, c.poa.poaTypeId));
      const [tpl] = await tx.select().from(s.documentTemplates).where(eq(s.documentTemplates.id, tipo.templateId));
      const [n] = await tx.insert(s.powersOfAttorney).values({
        orgId: u.orgId, poaTypeId: c.poa.poaTypeId, actDate: new Date().toISOString().slice(0, 10), place: c.poa.place, officerId: c.poa.officerId, actingMode: c.poa.actingMode, actingCustom: c.poa.actingCustom,
        templateVersionId: tpl.currentVersionId!, duplicatedFromId: id, createdBy: u.id, isDemo: c.poa.isDemo,
      }).returning();
      const partes = await tx.select().from(s.poaParties).where(eq(s.poaParties.poaId, id));
      for (const x of partes) await tx.insert(s.poaParties).values({ poaId: n.id, personId: x.personId, role: x.role, position: x.position, capacity: x.capacity });
      const todos = [...c.dados.poderes, ...c.dados.clausulas];
      const origem = await tx.select().from(s.poaPowers).where(eq(s.poaPowers.poaId, id)).orderBy(asc(s.poaPowers.position));
      for (const o of origem) {
        const sel = todos.find((t) => t.instanciaId === o.id)!;
        if (sel.personalizado) { await tx.insert(s.poaPowers).values({ poaId: n.id, position: o.position, customName: o.customName, customText: o.customText }); continue; }
        const actual = cat.get(sel.versao.codigo);
        if (!actual) { descartados.push(`${sel.versao.nome} (poder desactivado)`); continue; }
        const [pp] = await tx.insert(s.poaPowers).values({ poaId: n.id, powerVersionId: actual.versaoId, position: o.position, useAlternative: o.useAlternative }).returning();
        for (const [k, v] of Object.entries(sel.valores)) {
          if (actual.campos.some((f) => f.chave === k)) await tx.insert(s.poaFieldValues).values({ poaPowerId: pp.id, fieldKey: k, value: v as object });
          else descartados.push(`${sel.versao.nome}: campo ${k}`);
        }
      }
      await this.historico(tx, n.id, null, 'RASCUNHO', 'DUPLICAR', u);
      await this.audit.log(tx, u, 'POA_DUPLICAR', 'poa', n.id, { origem: id, numeroOrigem: c.poa.number });
      return { id: n.id, descartados };
    });
  }

  async pesquisar(q: z.infer<typeof PesquisaProcuracoes>, u: Utilizador) {
    const P = s.powersOfAttorney;
    const cond: SQL[] = [eq(P.orgId, u.orgId)];
    if (q.estado) cond.push(eq(P.status, q.estado));
    if (q.tipo) cond.push(eq(s.poaTypes.code, q.tipo));
    if (q.numero) cond.push(ilike(P.number, `%${q.numero.replace(/[%_]/g, '')}%`));
    if (q.de) cond.push(gte(P.actDate, q.de));
    if (q.ate) cond.push(lte(P.actDate, q.ate));
    if (q.q?.trim()) {
      const t = q.q.trim();
      const pessoaMatch = sql`exists (select 1 from ${s.poaParties} pt join ${s.persons} pe on pe.id = pt.person_id where pt.poa_id = ${P.id} and (pe.search_name ilike ${`%${normalizarNome(t)}%`} or pe.nif_bidx = ${this.crypto.blindIndex(t, 'nif')} or pe.doc_number_bidx = ${this.crypto.blindIndex(t, 'doc')}))`;
      cond.push(or(ilike(P.number, `%${t.replace(/[%_]/g, '')}%`), pessoaMatch)!);
    }
    const rows = await this.db.select({
      id: P.id, numero: P.number, estado: P.status, dataActo: P.actDate, tipo: s.poaTypes.name, tipoCodigo: s.poaTypes.code, demo: P.isDemo, actualizadaEm: P.updatedAt,
      outorgantes: sql<string>`(select string_agg(pe.full_name, ', ' order by pt.position) from ${s.poaParties} pt join ${s.persons} pe on pe.id = pt.person_id where pt.poa_id = ${P.id} and pt.role = 'OUTORGANTE')`,
      procuradores: sql<string>`(select string_agg(pe.full_name, ', ' order by pt.position) from ${s.poaParties} pt join ${s.persons} pe on pe.id = pt.person_id where pt.poa_id = ${P.id} and pt.role = 'PROCURADOR')`,
      total: sql<number>`count(*) over()`.mapWith(Number),
    }).from(P).innerJoin(s.poaTypes, eq(s.poaTypes.id, P.poaTypeId)).where(and(...cond)).orderBy(desc(P.updatedAt)).limit(q.limite).offset((q.pagina - 1) * q.limite);
    return { total: rows[0]?.total ?? 0, itens: rows.map(({ total: _t, ...r }) => r) };
  }

  async detalhe(id: string, u: Utilizador) {
    const c = await this.carregar(this.db, id, u);
    const hist = await this.db.select({ h: s.poaStatusHistory, actor: s.users.name }).from(s.poaStatusHistory).innerJoin(s.users, eq(s.users.id, s.poaStatusHistory.actorId)).where(eq(s.poaStatusHistory.poaId, id)).orderBy(asc(s.poaStatusHistory.at));
    const docs = await this.db.select({ id: s.documents.id, tipo: s.documents.kind, sha256: s.documents.sha256, tamanho: s.documents.size, criadoEm: s.documents.createdAt }).from(s.documents).where(eq(s.documents.poaId, id)).orderBy(asc(s.documents.createdAt));
    const clausulas = c.dados.clausulas;
    const mapa = (x: PoderSeleccionado) => ({ instanciaId: x.instanciaId, versaoId: x.versao.versaoId, codigo: x.versao.codigo, nome: x.versao.nome, versao: x.versao.numeroVersao, personalizado: !!x.personalizado, textoPersonalizado: x.personalizado ? x.versao.texto.replace(/\\\{\{/g, '{{') : undefined, usarAlternativo: !!x.usarAlternativo, campos: x.versao.campos, valores: x.valores });
    return {
      id, numero: c.poa.number, estado: c.poa.status, lockVersion: c.poa.lockVersion, tipo: c.dados.tipoProcuracao, dataActo: c.dados.dataActo, local: c.dados.local, oficianteId: c.poa.officerId,
      formaActuacao: c.poa.actingMode, formaActuacaoPersonalizada: c.poa.actingCustom, demo: c.poa.isDemo, contentHash: c.poa.contentHash, codigoVerificacao: c.poa.verificationCode,
      outorgantes: c.dados.outorgantes.map((o) => ({ id: o.pessoa.id, nome: o.pessoa.nomeCompleto, sexo: o.pessoa.sexo, qualidade: o.qualidade && 'texto' in o.qualidade ? o.qualidade.texto : null })),
      procuradores: c.dados.procuradores.map((p) => ({ id: p.id, nome: p.nomeCompleto, sexo: p.sexo })),
      poderes: [...c.dados.poderes.map(mapa), ...clausulas.map((x) => ({ ...mapa(x), clausula: true }))],
      historico: hist.map((x) => ({ ...x.h, actor: x.actor })), documentos: docs,
    };
  }
}

/** Texto personalizado é literal: neutraliza sintaxe de template ({{ }}). */
const escaparHbs = (t: string) => t.replace(/\{\{/g, '\\{{');
