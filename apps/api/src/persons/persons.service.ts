import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Pessoa, biAngolaValido } from '@proc/core';
import { AuditService, diff } from '../common/audit.service';
import { CryptoService, normalizarNome } from '../common/crypto.service';
import { Utilizador } from '../common/http';
import { Db, InjectDb, Tx } from '../db/db.module';
import { persons } from '../db/schema';

const Data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data AAAA-MM-DD');
export const PessoaDto = z.object({
  nomeCompleto: z.string().min(3).max(200), sexo: z.enum(['M', 'F']), dataNascimento: Data.nullish(), nacionalidade: z.string().min(3).max(60),
  naturalidade: z.string().max(300).nullish(), estadoCivil: z.enum(['SOLTEIRO', 'CASADO', 'DIVORCIADO', 'VIUVO', 'SEPARADO', 'UNIAO_FACTO']).nullish(),
  conjuge: z.string().max(200).nullish(), regimeBens: z.string().max(200).nullish(), profissao: z.string().max(120).nullish(),
  documento: z.object({ tipo: z.string().max(30), numero: z.string().min(3).max(40), dataEmissao: Data.nullish(), validade: Data.nullish(), vitalicio: z.boolean().default(false) }),
  nif: z.string().max(20).nullish(),
  morada: z.object({ linha: z.string().min(3).max(300), codigoPostal: z.string().max(20).optional(), localidade: z.string().max(120).optional(), concelho: z.string().max(120).optional(), provincia: z.string().max(120).optional(), pais: z.string().max(60).optional() }).nullish(),
  telefone: z.string().max(30).nullish(), email: z.string().email().max(200).nullish(), observacoes: z.string().max(2000).nullish(),
}).superRefine((p, ctx) => {
  if (p.documento.tipo === 'BI_AO' && !biAngolaValido(p.documento.numero)) ctx.addIssue({ code: 'custom', path: ['documento', 'numero'], message: 'N.º de BI angolano inválido (ex.: 000000000LA000)' });
  if (!p.documento.vitalicio && p.documento.validade && p.documento.dataEmissao && p.documento.validade < p.documento.dataEmissao) ctx.addIssue({ code: 'custom', path: ['documento', 'validade'], message: 'Validade anterior à emissão' });
});
export type PessoaDto = z.infer<typeof PessoaDto>;

@Injectable()
export class PersonsService {
  constructor(@InjectDb() private readonly db: Db, private readonly crypto: CryptoService, private readonly audit: AuditService) {}

  private colunas(d: PessoaDto) {
    return {
      fullName: d.nomeCompleto.trim().replace(/\s+/g, ' '), searchName: normalizarNome(d.nomeCompleto), sex: d.sexo, birthDate: d.dataNascimento ?? null, nationality: d.nacionalidade.toLowerCase(),
      birthplace: d.naturalidade ?? null, civilStatus: d.estadoCivil ?? null, spouse: d.conjuge ?? null, propertyRegime: d.regimeBens ?? null, profession: d.profissao ?? null,
      docType: d.documento.tipo, docNumberEnc: this.crypto.encrypt(d.documento.numero.toUpperCase().replace(/\s/g, '')), docNumberBidx: this.crypto.blindIndex(d.documento.numero, 'doc')!,
      docIssueDate: d.documento.dataEmissao ?? null, docExpiry: d.documento.vitalicio ? null : d.documento.validade ?? null, docLifetime: d.documento.vitalicio,
      nifEnc: this.crypto.encrypt(d.nif), nifBidx: this.crypto.blindIndex(d.nif, 'nif'), address: d.morada ?? null,
      phoneEnc: this.crypto.encrypt(d.telefone), emailEnc: this.crypto.encrypt(d.email), notesEnc: this.crypto.encrypt(d.observacoes),
    };
  }

  /** Converte para o formato de domínio (decifrado). */
  paraDominio(r: typeof persons.$inferSelect): Pessoa & { telefone?: string; email?: string; observacoes?: string } {
    return {
      id: r.id, nomeCompleto: r.fullName, sexo: r.sex, dataNascimento: r.birthDate ?? undefined, nacionalidade: r.nationality, naturalidade: r.birthplace ?? undefined,
      estadoCivil: r.civilStatus ?? undefined, conjuge: r.spouse ?? undefined, regimeBens: r.propertyRegime ?? undefined, profissao: r.profession ?? undefined,
      documento: { tipo: r.docType, numero: this.crypto.decrypt(r.docNumberEnc)!, dataEmissao: r.docIssueDate ?? undefined, validade: r.docExpiry ?? undefined, vitalicio: r.docLifetime },
      nif: this.crypto.decrypt(r.nifEnc) ?? undefined, morada: (r.address as Pessoa['morada']) ?? undefined,
      telefone: this.crypto.decrypt(r.phoneEnc) ?? undefined, email: this.crypto.decrypt(r.emailEnc) ?? undefined, observacoes: this.crypto.decrypt(r.notesEnc) ?? undefined, demo: r.isDemo,
    };
  }

  /** Pesquisa por nome (sem acentos, parcial), NIF ou n.º de documento (exactos, via índice cego). */
  async pesquisar(u: Utilizador, q?: string, limite = 20) {
    const cond = [eq(persons.orgId, u.orgId)];
    if (q?.trim()) {
      const t = q.trim();
      cond.push(or(ilike(persons.searchName, `%${normalizarNome(t).replace(/[%_]/g, '\\$&')}%`), eq(persons.nifBidx, this.crypto.blindIndex(t, 'nif')!), eq(persons.docNumberBidx, this.crypto.blindIndex(t, 'doc')!))!);
    }
    const rows = await this.db.select().from(persons).where(and(...cond))
      .orderBy(q?.trim() ? sql`similarity(${persons.searchName}, ${normalizarNome(q ?? '')}) desc` : desc(persons.updatedAt)).limit(Math.min(limite, 50));
    return rows.map((r) => { const p = this.paraDominio(r); return { id: p.id, nomeCompleto: p.nomeCompleto, sexo: p.sexo, nacionalidade: p.nacionalidade, documento: { tipo: p.documento.tipo, numero: mascarar(p.documento.numero), validade: p.documento.validade, vitalicio: p.documento.vitalicio }, demo: p.demo }; });
  }

  async obter(id: string, u: Utilizador, tx: Tx = this.db) {
    const [r] = await tx.select().from(persons).where(and(eq(persons.id, id), eq(persons.orgId, u.orgId)));
    if (!r) throw new NotFoundException('Pessoa não encontrada');
    return this.paraDominio(r);
  }

  async criar(d: PessoaDto, u: Utilizador, opts: { demo?: boolean; tx?: Tx } = {}) {
    const run = async (tx: Tx) => {
      const bidx = this.crypto.blindIndex(d.documento.numero, 'doc')!;
      const [existe] = await tx.select({ id: persons.id, nome: persons.fullName }).from(persons).where(and(eq(persons.orgId, u.orgId), eq(persons.docType, d.documento.tipo), eq(persons.docNumberBidx, bidx)));
      if (existe) throw new ConflictException({ message: 'Já existe uma pessoa com este documento de identificação.', existente: existe });
      const [p] = await tx.insert(persons).values({ orgId: u.orgId, ...this.colunas(d), isDemo: !!opts.demo, createdBy: u.id }).returning({ id: persons.id });
      await this.audit.log(tx, u, 'PESSOA_CRIAR', 'person', p.id, { nome: d.nomeCompleto }); // sem dados sensíveis no log
      return p;
    };
    return opts.tx ? run(opts.tx) : this.db.transaction(run);
  }

  async actualizar(id: string, d: PessoaDto, u: Utilizador) {
    return this.db.transaction(async (tx) => {
      const [antes] = await tx.select().from(persons).where(and(eq(persons.id, id), eq(persons.orgId, u.orgId))).for('update');
      if (!antes) throw new NotFoundException();
      const [depois] = await tx.update(persons).set({ ...this.colunas(d), updatedAt: new Date() }).where(eq(persons.id, id)).returning();
      const alteracoes = Object.keys(diff(antes, depois)).filter((k) => !k.endsWith('Enc')); // regista QUE campos mudaram, não os valores cifrados
      await this.audit.log(tx, u, 'PESSOA_EDITAR', 'person', id, { campos: alteracoes.map((k) => k.replace(/Bidx$/, '')) });
      return { id };
    });
  }
}

export const mascarar = (s: string) => (s.length <= 6 ? '•••' : `${s.slice(0, 3)}•••${s.slice(-3)}`);
