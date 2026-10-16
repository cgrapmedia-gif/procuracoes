import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { and, asc, desc, eq, ilike, isNotNull, or, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { AjusteTexto, DadosProvaVida, DefinicaoModelo, DocumentoRenderizado, construirProvaVida, formatarNumeroDocumento, renderizarDocx, textoDoBloco } from '@proc/core';
import { AuditService } from '../common/audit.service';
import { CryptoService, normalizarNome } from '../common/crypto.service';
import { Utilizador } from '../common/http';
import { Db, InjectDb, Tx } from '../db/db.module';
import * as s from '../db/schema';
import { modeloProvaVida } from '../db/seed/modelo-prova-vida';
import { PdfService } from '../documents/pdf.service';
import { StorageService } from '../documents/storage.service';
import { PersonsService } from '../persons/persons.service';

export const DadosDeclaracaoDto = z.object({
  pessoaId: z.string().uuid(),
  dataActo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  oficianteId: z.string().uuid().nullish(),
  modalidade: z.enum(['REFORMA', 'SOBREVIVENCIA']),
  entidade: z.string().trim().min(2).max(300),
  cartao: z.object({ tipo: z.string().trim().max(120), numero: z.string().trim().max(60) }).nullish(),
  falecido: z.object({ nome: z.string().trim().max(200), sexo: z.enum(['M', 'F']).nullish(), numero: z.string().trim().max(60).nullish() }).nullish(),
  dependentes: z.array(z.object({ pessoaId: z.string().uuid(), relacao: z.enum(['FILHO', 'TUTELADO', 'NETO', 'OUTRO']), relacaoTexto: z.string().max(80).nullish() })).max(10).default([]),
  ajustesTexto: z.array(z.object({ indice: z.number().int().min(0), original: z.string().max(30000), texto: z.string().max(30000) })).max(50).nullish(),
});
export type DadosDeclaracaoDto = z.infer<typeof DadosDeclaracaoDto>;
export const GuardarDeclaracao = DadosDeclaracaoDto.extend({ lockVersion: z.number().int() });

const NUM_OMISSAO = { padrao: '{SEQ}/10.05/CGRAP/{ANO}', prefixo: '', serie: '', digitos: 3 };
const CHAVE_NUM = 'numeracao_prova_vida';

/** Declarações de prova de vida: rascunho → emitida (→ cancelada). Mesmos princípios das procurações: snapshot congelado, PDF imutável, auditoria. */
@Injectable()
export class DeclaracoesService implements OnApplicationBootstrap {
  constructor(@InjectDb() private readonly db: Db, private readonly pessoas: PersonsService, private readonly pdf: PdfService, private readonly storage: StorageService, private readonly audit: AuditService, private readonly crypto: CryptoService) {}

  /** Garante o modelo no arranque, para aparecer logo em Modelos documentais. */
  async onApplicationBootstrap() { await this.garantirModelo().catch(() => undefined); }

  /** O modelo PROVA_VIDA é criado na primeira utilização (e depois editado em Modelos documentais). */
  async garantirModelo(tx: Tx = this.db, u?: Utilizador): Promise<string> {
    const [t] = await tx.select().from(s.documentTemplates).where(eq(s.documentTemplates.code, 'PROVA_VIDA'));
    if (t?.currentVersionId) return t.currentVersionId;
    const def = modeloProvaVida();
    const [tpl] = t ? [t] : await tx.insert(s.documentTemplates).values({ code: 'PROVA_VIDA', name: 'Declaração de prova de vida' }).returning();
    const [v] = await tx.insert(s.templateVersions).values({ templateId: tpl.id, versionNo: 1, status: 'PUBLICADA', definition: def, changeNote: 'Modelo inicial (declarações do posto, 2026)', contentHash: CryptoService.sha256(JSON.stringify(def)), createdBy: u?.id, publishedBy: u?.id, publishedAt: new Date() }).returning();
    await tx.update(s.documentTemplates).set({ currentVersionId: v.id }).where(eq(s.documentTemplates.id, tpl.id));
    return v.id;
  }

  private async linha(id: string, u: Utilizador, tx: Tx = this.db, bloquear = false) {
    const q = tx.select().from(s.declarations).where(and(eq(s.declarations.id, id), eq(s.declarations.orgId, u.orgId)));
    const [d] = bloquear ? await q.for('update') : await q;
    if (!d) throw new NotFoundException('Declaração não encontrada');
    return d;
  }

  private async validarPessoas(d: DadosDeclaracaoDto, u: Utilizador, tx: Tx) {
    const ids = [d.pessoaId, ...d.dependentes.map((x) => x.pessoaId)];
    for (const id of ids) await this.pessoas.obter(id, u, tx);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('A mesma pessoa aparece mais de uma vez.');
  }

  private dadosJson(d: DadosDeclaracaoDto) {
    return { modalidade: d.modalidade, entidade: d.entidade, cartao: d.cartao ?? null, falecido: d.falecido ?? null, dependentes: d.dependentes };
  }

  async criar(d: DadosDeclaracaoDto, u: Utilizador, renovadaDe?: string) {
    return this.db.transaction(async (tx) => {
      await this.validarPessoas(d, u, tx);
      const tv = await this.garantirModelo(tx, u);
      const [n] = await tx.insert(s.declarations).values({ orgId: u.orgId, kind: 'PROVA_VIDA', actDate: d.dataActo, officerId: d.oficianteId ?? null, personId: d.pessoaId, data: this.dadosJson(d), templateVersionId: tv, textOverrides: d.ajustesTexto?.length ? d.ajustesTexto : null, renewedFromId: renovadaDe ?? null, createdBy: u.id }).returning();
      await this.audit.log(tx, u, 'DECLARACAO_CRIAR', 'declaration', n.id, { tipo: 'PROVA_VIDA', renovadaDe });
      return { id: n.id };
    });
  }

  async guardar(id: string, d: z.infer<typeof GuardarDeclaracao>, u: Utilizador) {
    return this.db.transaction(async (tx) => {
      const r = await this.linha(id, u, tx, true);
      if (r.status !== 'RASCUNHO') throw new ConflictException('Declaração emitida: use «Renovar» ou cancele-a.');
      if (r.lockVersion !== d.lockVersion) throw new ConflictException('A declaração foi alterada por outro utilizador. Recarregue.');
      await this.validarPessoas(d, u, tx);
      await tx.update(s.declarations).set({ actDate: d.dataActo, officerId: d.oficianteId ?? null, personId: d.pessoaId, data: this.dadosJson(d), textOverrides: d.ajustesTexto === undefined ? r.textOverrides : d.ajustesTexto?.length ? d.ajustesTexto : null, lockVersion: r.lockVersion + 1, updatedBy: u.id, updatedAt: new Date() }).where(eq(s.declarations.id, id));
      await this.audit.log(tx, u, 'DECLARACAO_EDITAR', 'declaration', id, {});
      return { lockVersion: r.lockVersion + 1 };
    });
  }

  /** Dados completos para o documento (pessoas decifradas, signatário, posto). */
  async dados(id: string, u: Utilizador, tx: Tx = this.db): Promise<{ linha: typeof s.declarations.$inferSelect; dados: DadosProvaVida; modelo: DefinicaoModelo }> {
    const r = await this.linha(id, u, tx);
    const j = r.data as ReturnType<DeclaracoesService['dadosJson']>;
    const [org] = await tx.select().from(s.organizations).where(eq(s.organizations.id, u.orgId));
    const [of] = r.officerId ? await tx.select().from(s.officers).where(eq(s.officers.id, r.officerId)) : [];
    const tvId = r.templateVersionId ?? (await this.garantirModelo(tx, u));
    const [tv] = await tx.select().from(s.templateVersions).where(eq(s.templateVersions.id, tvId));
    const dados: DadosProvaVida = {
      numero: r.number ?? undefined, dataActo: String(r.actDate), local: org.city ?? 'Porto',
      posto: { nome: org.name, nomeCompleto: org.fullName, morada: org.address },
      signatario: { nome: of?.name ?? '', cargo: of?.title ?? '', rotulo: of?.signatureLabel ?? undefined, qualidade: of?.honorific ?? undefined },
      requerente: await this.pessoas.obter(r.personId, u, tx),
      modalidade: j.modalidade, entidade: j.entidade, cartao: j.cartao ?? undefined, falecido: j.falecido ? { nome: j.falecido.nome, sexo: j.falecido.sexo ?? undefined, numero: j.falecido.numero ?? undefined } : undefined,
      dependentes: await Promise.all((j.dependentes ?? []).map(async (x) => ({ pessoa: await this.pessoas.obter(x.pessoaId, u, tx), relacao: x.relacao, relacaoTexto: x.relacaoTexto ?? undefined }))),
      ajustesTexto: (r.textOverrides as AjusteTexto[] | null) ?? undefined,
    };
    return { linha: r, dados, modelo: tv.definition as DefinicaoModelo };
  }

  /** O que falta para emitir. */
  verificar(d: DadosProvaVida): string[] {
    const p: string[] = [];
    if (!d.requerente.sexo) p.push('Indique o sexo do requerente (para «o Senhor / a Senhora»).');
    if (!d.requerente.dataNascimento) p.push('Indique a data de nascimento do requerente (para a idade).');
    if (!d.requerente.naturalidade) p.push('Indique a naturalidade do requerente.');
    if (!d.requerente.morada?.linha) p.push('Indique a morada do requerente.');
    if (!d.entidade?.trim()) p.push('Indique a entidade a quem se destina.');
    if (d.modalidade === 'REFORMA' && !d.cartao?.numero) p.push('Indique o tipo e o número do cartão de pensionista/beneficiário.');
    if (d.modalidade === 'SOBREVIVENCIA' && !d.falecido?.nome) p.push('Indique o nome do falecido (assegurado).');
    if (!d.signatario.nome) p.push('Escolha quem assina.');
    for (const x of d.dependentes ?? []) if (!x.pessoa.dataNascimento) p.push(`Indique a data de nascimento de ${x.pessoa.nomeCompleto}.`);
    return p;
  }

  async detalhe(id: string, u: Utilizador) {
    const { linha: r, dados } = await this.dados(id, u);
    const j = r.data as ReturnType<DeclaracoesService['dadosJson']>;
    const docs = await this.db.select({ id: s.documents.id, tipo: s.documents.kind }).from(s.documents).where(eq(s.documents.declarationId, id)).orderBy(asc(s.documents.createdAt));
    return {
      id, numero: r.number, estado: r.status, dataActo: r.actDate, oficianteId: r.officerId, lockVersion: r.lockVersion, motivoCancelamento: r.cancelReason,
      pessoaId: r.personId, requerente: { id: dados.requerente.id, nome: dados.requerente.nomeCompleto, sexo: dados.requerente.sexo ?? null },
      modalidade: j.modalidade, entidade: j.entidade, cartao: j.cartao, falecido: j.falecido,
      dependentes: dados.dependentes!.map((x) => ({ pessoaId: x.pessoa.id, nome: x.pessoa.nomeCompleto, relacao: x.relacao, relacaoTexto: x.relacaoTexto ?? null })),
      ajustesTexto: (r.textOverrides as AjusteTexto[] | null) ?? [], pendencias: r.status === 'RASCUNHO' ? this.verificar(dados) : [],
      documentos: [...new Map(docs.map((d) => [d.tipo, d])).values()], renovadaDe: r.renewedFromId,
    };
  }

  async preVisualizar(id: string, u: Utilizador): Promise<DocumentoRenderizado> {
    const { linha, dados, modelo } = await this.dados(id, u);
    return construirProvaVida(modelo, dados, { preVisualizacao: linha.status === 'RASCUNHO' });
  }

  async blocos(id: string, u: Utilizador) {
    const { dados, modelo } = await this.dados(id, u);
    const doc = construirProvaVida(modelo, { ...dados, ajustesTexto: [] });
    return { blocos: doc.blocos.map((b, indice) => ({ indice, tipo: b.tipo, original: textoDoBloco(b) })).filter((b) => b.original !== null), ajustes: dados.ajustesTexto ?? [], desactualizados: 0 };
  }

  async listar(u: Utilizador, q: { q?: string; estado?: string; limite?: number; pagina?: number }) {
    const lim = Math.min(q.limite ?? 25, 100); const pag = Math.max(1, q.pagina ?? 1);
    const cond = [eq(s.declarations.orgId, u.orgId)];
    if (q.estado) cond.push(eq(s.declarations.status, q.estado));
    if (q.q?.trim()) { const t = `%${normalizarNome(q.q)}%`; cond.push(or(ilike(s.persons.searchName, t), ilike(s.declarations.number, `%${q.q.trim()}%`), sql`(${s.declarations.data}->>'entidade') ilike ${`%${q.q.trim()}%`}`)!); }
    const rows = await this.db.select({ id: s.declarations.id, numero: s.declarations.number, estado: s.declarations.status, dataActo: s.declarations.actDate, requerente: s.persons.fullName, data: s.declarations.data, actualizadaEm: s.declarations.updatedAt })
      .from(s.declarations).innerJoin(s.persons, eq(s.persons.id, s.declarations.personId)).where(and(...cond)).orderBy(desc(s.declarations.updatedAt)).limit(lim).offset((pag - 1) * lim);
    const [{ total }] = await this.db.select({ total: sql<number>`count(*)::int` }).from(s.declarations).innerJoin(s.persons, eq(s.persons.id, s.declarations.personId)).where(and(...cond));
    return { total, itens: rows.map((r) => ({ ...r, entidade: (r.data as { entidade: string }).entidade, modalidade: (r.data as { modalidade: string }).modalidade, data: undefined })) };
  }

  async numeracao(u: Utilizador) {
    const [c] = await this.db.select().from(s.settings).where(and(eq(s.settings.orgId, u.orgId), eq(s.settings.key, CHAVE_NUM)));
    const cfg = { ...NUM_OMISSAO, ...((c?.value as object) ?? {}) };
    const ano = new Date().getUTCFullYear();
    const [seq] = await this.db.select().from(s.sequences).where(and(eq(s.sequences.orgId, u.orgId), eq(s.sequences.code, 'DECL_PV'), eq(s.sequences.series, ''), eq(s.sequences.year, ano)));
    return { ...cfg, proximo: (seq?.lastValue ?? 0) + 1, exemplo: formatarNumeroDocumento(cfg, ano, (seq?.lastValue ?? 0) + 1) };
  }

  /** Formato e próximo número (para continuar a numeração em uso no posto, ex.: 620). */
  async definirNumeracao(b: { padrao: string; digitos: number; proximo?: number }, u: Utilizador) {
    if (!b.padrao.includes('{SEQ}')) throw new BadRequestException('O formato tem de conter {SEQ}.');
    const ano = new Date().getUTCFullYear();
    return this.db.transaction(async (tx) => {
      const valor = { ...NUM_OMISSAO, padrao: b.padrao, digitos: b.digitos };
      await tx.insert(s.settings).values({ orgId: u.orgId, key: CHAVE_NUM, value: valor }).onConflictDoUpdate({ target: [s.settings.orgId, s.settings.key], set: { value: valor, updatedAt: new Date() } });
      if (b.proximo && b.proximo > 0) {
        await tx.insert(s.sequences).values({ orgId: u.orgId, code: 'DECL_PV', prefix: '', series: '', pattern: b.padrao, digits: b.digitos, year: ano, lastValue: b.proximo - 1 })
          .onConflictDoUpdate({ target: [s.sequences.orgId, s.sequences.code, s.sequences.series, s.sequences.year], set: { lastValue: b.proximo - 1 } });
      }
      await this.audit.log(tx, u, 'NUMERACAO_DECLARACOES', 'setting', CHAVE_NUM, b);
      return this.numeracao(u);
    });
  }

  async emitir(id: string, u: Utilizador) {
    return this.db.transaction(async (tx) => {
      const r = await this.linha(id, u, tx, true);
      if (r.status !== 'RASCUNHO') throw new ConflictException('Esta declaração já foi emitida.');
      const { dados, modelo } = await this.dados(id, u, tx);
      const pend = this.verificar(dados);
      if (pend.length) throw new ConflictException({ message: 'Não é possível emitir: faltam dados.', pendencias: pend });
      const ano = Number(String(r.actDate).slice(0, 4));
      const [c] = await tx.select().from(s.settings).where(and(eq(s.settings.orgId, u.orgId), eq(s.settings.key, CHAVE_NUM)));
      const cfg = { ...NUM_OMISSAO, ...((c?.value as object) ?? {}) };
      await tx.insert(s.sequences).values({ orgId: u.orgId, code: 'DECL_PV', prefix: '', series: '', pattern: cfg.padrao, digits: cfg.digitos, year: ano }).onConflictDoNothing();
      const [seq] = await tx.update(s.sequences).set({ lastValue: sql`${s.sequences.lastValue} + 1` }).where(and(eq(s.sequences.orgId, u.orgId), eq(s.sequences.code, 'DECL_PV'), eq(s.sequences.series, ''), eq(s.sequences.year, ano))).returning();
      const numero = formatarNumeroDocumento(cfg, ano, seq.lastValue);
      const doc = construirProvaVida(modelo, { ...dados, numero });
      const snapshot = { v: 1, tipo: 'PROVA_VIDA', numero, emitidaEm: new Date().toISOString(), emitidaPor: u.id, templateVersionId: r.templateVersionId, dados: { ...dados, numero }, documento: doc };
      const json = JSON.stringify(snapshot);
      const contentHash = CryptoService.sha256(json);
      const verif = randomBytes(5).toString('hex').toUpperCase().slice(0, 8);
      const pdf = await this.pdf.gerar(doc, '');
      const key = this.storage.novaChave('pdf');
      await this.storage.put(key, pdf, 'application/pdf');
      await tx.insert(s.documents).values({ declarationId: id, kind: 'PDF', storageKey: key, sha256: CryptoService.sha256(pdf), size: pdf.length, mime: 'application/pdf', createdBy: u.id });
      await tx.update(s.declarations).set({ status: 'EMITIDA', number: numero, snapshot: { enc: this.crypto.encrypt(json) }, contentHash, verificationCode: verif, issuedBy: u.id, issuedAt: new Date(), updatedBy: u.id, updatedAt: new Date(), lockVersion: r.lockVersion + 1 }).where(eq(s.declarations.id, id));
      await this.audit.log(tx, u, 'DECLARACAO_EMITIR', 'declaration', id, { numero, contentHash });
      return { id, numero };
    });
  }

  async cancelar(id: string, motivo: string, u: Utilizador) {
    return this.db.transaction(async (tx) => {
      const r = await this.linha(id, u, tx, true);
      if (r.status !== 'EMITIDA') throw new ConflictException('Só se cancelam declarações emitidas.');
      await tx.update(s.declarations).set({ status: 'CANCELADA', cancelReason: motivo, updatedBy: u.id, updatedAt: new Date(), lockVersion: r.lockVersion + 1 }).where(eq(s.declarations.id, id));
      await this.audit.log(tx, u, 'DECLARACAO_CANCELAR', 'declaration', id, { numero: r.number, motivo });
      return { ok: true };
    });
  }

  /** Prova de vida é anual: cria um rascunho igual, com a data de hoje. */
  async renovar(id: string, u: Utilizador) {
    const r = await this.linha(id, u);
    const j = r.data as ReturnType<DeclaracoesService['dadosJson']>;
    return this.criar({ pessoaId: r.personId, dataActo: new Date().toISOString().slice(0, 10), oficianteId: r.officerId, modalidade: j.modalidade, entidade: j.entidade, cartao: j.cartao, falecido: j.falecido, dependentes: j.dependentes ?? [], ajustesTexto: null }, u, id);
  }

  async apagar(id: string, motivo: string, u: Utilizador) {
    const keys = await this.db.transaction(async (tx) => {
      const r = await this.linha(id, u, tx, true);
      if (r.status !== 'RASCUNHO' && !u.permissoes.includes('poa.purge')) throw new ForbiddenException('Só administradores apagam declarações emitidas.');
      await tx.execute(sql`select set_config('procuracoes.purga', 'on', true)`);
      const docs = await tx.select({ key: s.documents.storageKey }).from(s.documents).where(eq(s.documents.declarationId, id));
      await tx.delete(s.documents).where(eq(s.documents.declarationId, id));
      await tx.delete(s.declarations).where(eq(s.declarations.id, id));
      await this.audit.log(tx, u, 'DECLARACAO_APAGAR', 'declaration', id, { numero: r.number, estado: r.status, motivo });
      return docs.map((d) => d.key);
    });
    for (const k of keys) await this.storage.apagar(k).catch(() => undefined);
    return { apagada: true };
  }

  /** PDF ou DOCX de uma declaração emitida; regenera-o do snapshot se se perdeu (ou na 1.ª descarga do DOCX). */
  async ficheiro(id: string, tipo: 'PDF' | 'DOCX', u: Utilizador) {
    const r = await this.linha(id, u);
    if (!r.number || !r.snapshot) throw new ConflictException('A declaração ainda não foi emitida.');
    const linhas = await this.db.select().from(s.documents).where(and(eq(s.documents.declarationId, id), eq(s.documents.kind, tipo))).orderBy(desc(s.documents.createdAt));
    let buf: Buffer | undefined;
    for (const l of linhas) {
      const b = await this.storage.get(l.storageKey).catch(() => undefined);
      if (!b) continue;
      if (CryptoService.sha256(b) !== l.sha256) throw new ConflictException('Integridade do ficheiro comprometida — contacte o administrador.');
      buf = b; break;
    }
    if (!buf) {
      const json = this.crypto.decrypt((r.snapshot as { enc: string }).enc);
      const { documento } = JSON.parse(json!) as { documento: DocumentoRenderizado };
      buf = tipo === 'PDF' ? await this.pdf.gerar(documento, '') : await renderizarDocx(documento);
      const mime = tipo === 'PDF' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      const key = this.storage.novaChave(tipo === 'PDF' ? 'pdf' : 'docx');
      await this.storage.put(key, buf, mime);
      await this.db.transaction(async (tx) => {
        const [d] = await tx.insert(s.documents).values({ declarationId: id, kind: tipo, storageKey: key, sha256: CryptoService.sha256(buf!), size: buf!.length, mime, createdBy: u.id }).returning();
        await this.audit.log(tx, u, 'DOCUMENTO_GERAR', 'document', d.id, { numero: r.number, tipo, motivo: linhas.length ? 'ficheiro em falta' : 'primeira descarga' });
      });
    }
    const [p] = await this.db.select({ nome: s.persons.fullName }).from(s.persons).where(eq(s.persons.id, r.personId));
    await this.db.transaction((tx) => this.audit.log(tx, u, 'DOCUMENTO_DESCARREGAR', 'declaration', id, undefined, { numero: r.number, tipo }));
    const nome = `Prova_de_Vida_${r.number.replace(/\//g, '-')}_${p?.nome ?? 'requerente'}.${tipo === 'PDF' ? 'pdf' : 'docx'}`;
    return { buf, mime: tipo === 'PDF' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', nome };
  }

  /** Para a reparação geral de documentos. */
  async emitidasSemPdf(u: Utilizador) {
    const rows = await this.db.select({ id: s.declarations.id }).from(s.declarations).where(and(eq(s.declarations.orgId, u.orgId), isNotNull(s.declarations.number)));
    return rows.map((r) => r.id);
  }
}
