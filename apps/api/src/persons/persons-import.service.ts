import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { AuditService } from '../common/audit.service';
import { CryptoService, normalizarNome } from '../common/crypto.service';
import { Utilizador } from '../common/http';
import { Db, InjectDb } from '../db/db.module';
import { importBatches, persons } from '../db/schema';
import { ImportService } from '../powers/import.service';
import { PersonsService, PessoaDto, mascarar } from './persons.service';

type Linha = Record<string, unknown>;
export interface ResultadoPessoa { linha: number; nome: string; documento: string; estado: 'NOVO' | 'DUPLICADO' | 'ERRO'; erros: string[] }

const chave = (k: string) => normalizarNome(k).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const SINONIMOS: Record<string, string[]> = {
  nomeCompleto: ['nome', 'nome_completo'], sexo: ['sexo', 'genero'], dataNascimento: ['data_nascimento', 'nascimento', 'data_de_nascimento'],
  nacionalidade: ['nacionalidade'], naturalidade: ['naturalidade', 'natural_de'], estadoCivil: ['estado_civil'], conjuge: ['conjuge'], regimeBens: ['regime_bens', 'regime_de_bens'],
  profissao: ['profissao'], docTipo: ['doc_tipo', 'tipo_documento', 'tipo_de_documento'], docNumero: ['doc_numero', 'numero_documento', 'n_documento', 'bi', 'numero_bi', 'documento'],
  docEmissao: ['doc_emissao', 'data_emissao', 'emissao', 'emitido_em'], docValidade: ['doc_validade', 'validade', 'valido_ate'], docVitalicio: ['doc_vitalicio', 'vitalicio'],
  nif: ['nif'], morada: ['morada', 'endereco'], codigoPostal: ['codigo_postal', 'cp'], localidade: ['localidade', 'cidade'], concelho: ['concelho', 'municipio'], provincia: ['provincia'], pais: ['pais'],
  telefone: ['telefone', 'telemovel', 'contacto'], email: ['email', 'e_mail', 'correio_electronico'], observacoes: ['observacoes', 'notas'],
};

function data(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return s; // deixa a validação apontar o erro
}
function sexo(v: unknown): 'M' | 'F' | string {
  const s = normalizarNome(String(v ?? ''));
  if (['m', 'masculino', 'homem', 'h', 'masc'].includes(s)) return 'M';
  if (['f', 'feminino', 'mulher', 'fem'].includes(s)) return 'F';
  return String(v ?? '');
}
function estadoCivil(v: unknown): string | null {
  const s = normalizarNome(String(v ?? ''));
  if (!s) return null;
  if (s.startsWith('solteir')) return 'SOLTEIRO';
  if (s.startsWith('casad')) return 'CASADO';
  if (s.startsWith('divorciad')) return 'DIVORCIADO';
  if (s.startsWith('viuv')) return 'VIUVO';
  if (s.startsWith('separad')) return 'SEPARADO';
  if (s.includes('uniao') || s.includes('facto')) return 'UNIAO_FACTO';
  return String(v).toUpperCase();
}
function tipoDoc(v: unknown): string {
  const s = normalizarNome(String(v ?? ''));
  if (!s || s === 'bi' || s.includes('bilhete')) return 'BI_AO';
  if (s.includes('passaporte')) return 'PASSAPORTE_AO';
  if (s === 'cc' || s.includes('cidadao')) return 'CC_PT';
  if (s === 'tr' || s.includes('residencia')) return 'TR_PT';
  return String(v).toUpperCase();
}

/** Importação em massa de pessoas (CSV, Excel, JSON): pré-visualização e confirmação. Os dados do lote ficam cifrados. */
@Injectable()
export class PersonsImportService {
  constructor(@InjectDb() private readonly db: Db, private readonly ficheiros: ImportService, private readonly pessoas: PersonsService, private readonly crypto: CryptoService, private readonly audit: AuditService) {}

  private mapear(l: Linha): unknown {
    const n: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(l)) n[chave(k)] = typeof v === 'string' ? v.trim() : v;
    const g = (campo: string) => { for (const s of SINONIMOS[campo]) if (n[s] !== undefined && n[s] !== '') return n[s]; return undefined; };
    const str = (campo: string) => { const v = g(campo); return v === undefined || v === null ? null : String(v).trim() || null; };
    const vitalicio = ['sim', 's', 'true', '1', 'x'].includes(normalizarNome(String(g('docVitalicio') ?? '')));
    const moradaLinha = str('morada');
    return {
      nomeCompleto: str('nomeCompleto') ?? '', sexo: sexo(g('sexo')), dataNascimento: data(g('dataNascimento')), nacionalidade: (str('nacionalidade') ?? 'angolana').toLowerCase(),
      naturalidade: str('naturalidade'), estadoCivil: estadoCivil(g('estadoCivil')), conjuge: str('conjuge'), regimeBens: str('regimeBens'), profissao: str('profissao'),
      documento: { tipo: tipoDoc(g('docTipo')), numero: (str('docNumero') ?? '').toUpperCase().replace(/\s/g, ''), dataEmissao: data(g('docEmissao')), validade: vitalicio ? null : data(g('docValidade')), vitalicio },
      nif: str('nif'), morada: moradaLinha ? { linha: moradaLinha, codigoPostal: str('codigoPostal') ?? undefined, localidade: str('localidade') ?? undefined, concelho: str('concelho') ?? undefined, provincia: str('provincia') ?? undefined, pais: str('pais') ?? undefined } : null,
      telefone: str('telefone'), email: str('email'), observacoes: str('observacoes'),
    };
  }

  async preVisualizar(nome: string, buf: Buffer, u: Utilizador) {
    const linhas = await this.ficheiros.lerFicheiro(nome, buf);
    if (!linhas.length) throw new BadRequestException('Ficheiro sem linhas');
    if (linhas.length > 5000) throw new BadRequestException('Máximo de 5000 pessoas por lote');
    const candidatos = linhas.map((l) => this.mapear(l));
    const bidxs = candidatos.map((c) => this.crypto.blindIndex((c as PessoaDto).documento?.numero, 'doc')).filter((x): x is string => !!x);
    const existentes = new Set(bidxs.length ? (await this.db.select({ b: persons.docNumberBidx, t: persons.docType }).from(persons).where(and(eq(persons.orgId, u.orgId), inArray(persons.docNumberBidx, bidxs)))).map((r) => `${r.t}|${r.b}`) : []);
    const vistos = new Set<string>(); const validos: PessoaDto[] = []; const resultados: ResultadoPessoa[] = [];
    candidatos.forEach((c, i) => {
      const r = PessoaDto.safeParse(c);
      const cc = c as PessoaDto;
      const base = { linha: i + 2, nome: cc.nomeCompleto || '—', documento: cc.documento?.numero ? `${cc.documento.tipo} ${mascarar(cc.documento.numero)}` : '—' };
      if (!r.success) { resultados.push({ ...base, estado: 'ERRO', erros: r.error.issues.map((x) => `${x.path.join('.') || 'linha'}: ${x.message}`) }); return; }
      const k = `${r.data.documento.tipo}|${this.crypto.blindIndex(r.data.documento.numero, 'doc')}`;
      if (existentes.has(k)) { resultados.push({ ...base, estado: 'DUPLICADO', erros: ['já existe uma pessoa com este documento'] }); return; }
      if (vistos.has(k)) { resultados.push({ ...base, estado: 'DUPLICADO', erros: ['documento repetido no ficheiro'] }); return; }
      vistos.add(k); validos.push(r.data); resultados.push({ ...base, estado: 'NOVO', erros: [] });
    });
    const summary = { total: linhas.length, novos: validos.length, duplicados: resultados.filter((r) => r.estado === 'DUPLICADO').length, erros: resultados.filter((r) => r.estado === 'ERRO').length };
    // Os dados pessoais do lote ficam cifrados; o resumo guardado só tem contagens.
    const [b] = await this.db.insert(importBatches).values({ kind: 'PERSONS', filename: nome, payload: { enc: this.crypto.encrypt(JSON.stringify(validos)) }, summary, createdBy: u.id }).returning({ id: importBatches.id });
    return { loteId: b.id, ...summary, resultados };
  }

  async confirmar(loteId: string, u: Utilizador) {
    return this.db.transaction(async (tx) => {
      const [b] = await tx.select().from(importBatches).where(and(eq(importBatches.id, loteId), eq(importBatches.kind, 'PERSONS'))).for('update');
      if (!b) throw new NotFoundException('Lote inexistente');
      if (b.status !== 'PREVIEW') throw new BadRequestException('Lote já processado');
      if (b.createdBy !== u.id) throw new BadRequestException('Só quem preparou o lote o pode confirmar');
      const itens = JSON.parse(this.crypto.decrypt((b.payload as { enc: string }).enc) ?? '[]') as PessoaDto[];
      let criados = 0, ignorados = 0;
      for (const p of itens) {
        try { await this.pessoas.criar(p, u, { tx }); criados++; } catch { ignorados++; } // entretanto criada por outra pessoa
      }
      await tx.update(importBatches).set({ status: 'CONFIRMADO', committedAt: new Date(), payload: { enc: null } }).where(eq(importBatches.id, loteId));
      await this.audit.log(tx, u, 'PESSOAS_IMPORTAR', 'import_batch', loteId, { criados, ignorados });
      return { criados, ignorados };
    });
  }
}
