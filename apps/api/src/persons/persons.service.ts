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
/**
 * Dados de uma pessoa. Tolerante com registos incompletos (ex.: importados do registo consular):
 * sexo, documento e nacionalidade podem faltar e o n.º de BI pode ter formato não habitual.
 * A procuração só pode ser emitida quando os dados das partes estiverem completos (checklist de emissão).
 */
export const PessoaDto = z.object({
  nomeCompleto: z.string().trim().min(2).max(300), sexo: z.enum(['M', 'F']).nullish(), dataNascimento: Data.nullish(), nacionalidade: z.string().max(60).default(''),
  naturalidade: z.string().max(300).nullish(), estadoCivil: z.enum(['SOLTEIRO', 'CASADO', 'DIVORCIADO', 'VIUVO', 'SEPARADO', 'UNIAO_FACTO']).nullish(),
  conjuge: z.string().max(200).nullish(), regimeBens: z.string().max(200).nullish(), profissao: z.string().max(120).nullish(),
  documento: z.object({ tipo: z.string().max(30).default('BI_AO'), numero: z.string().max(40).nullish(), dataEmissao: Data.nullish(), validade: Data.nullish(), vitalicio: z.boolean().default(false) }).default({ tipo: 'BI_AO', vitalicio: false }),
  nif: z.string().max(20).nullish(),
  morada: z.object({ linha: z.string().max(300).default(''), codigoPostal: z.string().max(20).optional(), localidade: z.string().max(120).optional(), concelho: z.string().max(120).optional(), distrito: z.string().max(120).optional(), provincia: z.string().max(120).optional(), pais: z.string().max(60).optional() }).nullish(),
  telefone: z.string().max(200).nullish(), email: z.string().max(300).nullish(), observacoes: z.string().max(4000).nullish(),
}).superRefine((p, ctx) => {
  if (!p.documento.vitalicio && p.documento.validade && p.documento.dataEmissao && p.documento.validade < p.documento.dataEmissao) ctx.addIssue({ code: 'custom', path: ['documento', 'validade'], message: 'Validade anterior à emissão' });
});
/** Avisos (não bloqueiam a gravação): documento em falta ou com formato não habitual, sexo em falta. */
export function avisosPessoa(p: PessoaDto): string[] {
  const a: string[] = [];
  const n = p.documento.numero?.trim();
  if (!n) a.push('sem documento de identificação');
  else if (p.documento.tipo === 'BI_AO' && !biAngolaValido(n)) a.push('n.º de BI com formato não habitual');
  if (!p.sexo) a.push('sexo por indicar');
  if (!p.nacionalidade) a.push('nacionalidade por indicar');
  return a;
}
export type PessoaDto = z.infer<typeof PessoaDto>;

@Injectable()
export class PersonsService {
  constructor(@InjectDb() private readonly db: Db, private readonly crypto: CryptoService, private readonly audit: AuditService) {}

  /** Colunas (cifradas) para gravar — usado também pelo importador em massa. */
  colunas(d: PessoaDto) {
    return {
      fullName: d.nomeCompleto.trim().replace(/\s+/g, ' '), searchName: normalizarNome(d.nomeCompleto), sex: d.sexo ?? null, birthDate: d.dataNascimento ?? null, nationality: (d.nacionalidade ?? '').toLowerCase(),
      birthplace: d.naturalidade ?? null, civilStatus: d.estadoCivil ?? null, spouse: d.conjuge ?? null, propertyRegime: d.regimeBens ?? null, profession: d.profissao ?? null,
      docType: d.documento.tipo || 'BI_AO', docNumberEnc: d.documento.numero?.trim() ? this.crypto.encrypt(d.documento.numero.toUpperCase().replace(/\s/g, '')) : null, docNumberBidx: d.documento.numero?.trim() ? this.crypto.blindIndex(d.documento.numero, 'doc') : null,
      docIssueDate: d.documento.dataEmissao ?? null, docExpiry: d.documento.vitalicio ? null : d.documento.validade ?? null, docLifetime: d.documento.vitalicio,
      nifEnc: this.crypto.encrypt(d.nif), nifBidx: this.crypto.blindIndex(d.nif, 'nif'), address: d.morada ?? null,
      phoneEnc: this.crypto.encrypt(d.telefone), emailEnc: this.crypto.encrypt(d.email), notesEnc: this.crypto.encrypt(d.observacoes),
    };
  }

  /** Converte para o formato de domínio (decifrado). */
  paraDominio(r: typeof persons.$inferSelect): Pessoa & { telefone?: string; email?: string; observacoes?: string } {
    return {
      id: r.id, nomeCompleto: r.fullName, sexo: (r.sex ?? undefined) as Pessoa['sexo'], dataNascimento: r.birthDate ?? undefined, nacionalidade: r.nationality, naturalidade: r.birthplace ?? undefined,
      estadoCivil: r.civilStatus ?? undefined, conjuge: r.spouse ?? undefined, regimeBens: r.propertyRegime ?? undefined, profissao: r.profession ?? undefined,
      documento: { tipo: r.docType, numero: this.crypto.decrypt(r.docNumberEnc) ?? '', dataEmissao: r.docIssueDate ?? undefined, validade: r.docExpiry ?? undefined, vitalicio: r.docLifetime },
      nif: this.crypto.decrypt(r.nifEnc) ?? undefined, morada: (r.address as Pessoa['morada']) ?? undefined,
      telefone: this.crypto.decrypt(r.phoneEnc) ?? undefined, email: this.crypto.decrypt(r.emailEnc) ?? undefined, observacoes: this.crypto.decrypt(r.notesEnc) ?? undefined, demo: r.isDemo,
    };
  }

  /**
   * Pesquisa de pessoas mais eficaz:
   *  - nome: todas as palavras escritas têm de aparecer, em qualquer ordem, sem acentos ("maria silva" encontra "Maria da Conceição Silva");
   *  - erros de escrita: se não houver resultados exactos, procura nomes semelhantes (trigramas: "cawaia" encontra "Cawaya");
   *  - NIF e n.º de documento: correspondência exacta, sem espaços nem maiúsculas (índice cego — os números estão cifrados);
   *  - resultados ordenados pela semelhança ao texto pesquisado.
   */
  async pesquisar(u: Utilizador, q?: string, limite = 20) {
    const max = Math.min(limite, 50);
    const base = eq(persons.orgId, u.orgId);
    const t = q?.trim() ?? '';
    const mapear = (rows: (typeof persons.$inferSelect)[]) => rows.map((r) => {
      const p = this.paraDominio(r);
      return { id: p.id, nomeCompleto: p.nomeCompleto, sexo: p.sexo, nacionalidade: p.nacionalidade, dataNascimento: p.dataNascimento, naturalidade: p.naturalidade, documento: { tipo: p.documento.tipo, numero: mascarar(p.documento.numero), validade: p.documento.validade, vitalicio: p.documento.vitalicio }, demo: p.demo };
    });
    if (!t) return mapear(await this.db.select().from(persons).where(base).orderBy(desc(persons.updatedAt)).limit(max));
    const norm = normalizarNome(t);
    const palavras = norm.split(' ').filter((w) => w.length >= 2).map((w) => w.replace(/[%_\\]/g, ''));
    const exactos = [eq(persons.nifBidx, this.crypto.blindIndex(t, 'nif')!), eq(persons.docNumberBidx, this.crypto.blindIndex(t, 'doc')!)];
    // Muitas palavras curtas com dezenas de milhares de pessoas: limita a ordenação por semelhança aos primeiros candidatos
    const porNome = palavras.length ? and(...palavras.map((w) => ilike(persons.searchName, `%${w}%`))) : undefined;
    const rows = await this.db.select().from(persons).where(and(base, or(...exactos, ...(porNome ? [porNome] : []))))
      .orderBy(sql`similarity(${persons.searchName}, ${norm}) desc`, desc(persons.updatedAt)).limit(max);
    if (rows.length || norm.length < 3) return mapear(rows);
    // Sem resultados: tolera erros de escrita
    const semelhantes = await this.db.select().from(persons)
      .where(and(base, sql`(${persons.searchName} % ${norm} or ${norm} <% ${persons.searchName})`)) // operadores que usam o índice de trigramas
      .orderBy(sql`greatest(similarity(${persons.searchName}, ${norm}), word_similarity(${norm}, ${persons.searchName})) desc`).limit(max);
    return mapear(semelhantes).map((x) => ({ ...x, aproximado: true }));
  }

  async obter(id: string, u: Utilizador, tx: Tx = this.db) {
    const [r] = await tx.select().from(persons).where(and(eq(persons.id, id), eq(persons.orgId, u.orgId)));
    if (!r) throw new NotFoundException('Pessoa não encontrada');
    return this.paraDominio(r);
  }

  async criar(d: PessoaDto, u: Utilizador, opts: { demo?: boolean; tx?: Tx } = {}) {
    const run = async (tx: Tx) => {
      const bidx = this.crypto.blindIndex(d.documento.numero, 'doc');
      const [existe] = bidx ? await tx.select({ id: persons.id, nome: persons.fullName }).from(persons).where(and(eq(persons.orgId, u.orgId), eq(persons.docType, d.documento.tipo || 'BI_AO'), eq(persons.docNumberBidx, bidx))) : [];
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

export const mascarar = (s?: string | null) => (!s ? '' : s.length <= 6 ? '•••' : `${s.slice(0, 3)}•••${s.slice(-3)}`);
