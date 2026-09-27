import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { DadosProcuracao, Estado, PoderSeleccionado, construirDocumento, formatarNumeroDocumento, renderizarDocx, transitar } from '@proc/core';
import { AuditService } from '../common/audit.service';
import { CryptoService } from '../common/crypto.service';
import { Utilizador } from '../common/http';
import { Db, InjectDb, Tx } from '../db/db.module';
import * as s from '../db/schema';
import { PdfService } from '../documents/pdf.service';
import { StorageService } from '../documents/storage.service';
import { PoaService } from './poa.service';

interface CfgNumeracao { padrao: string; prefixo: string; serie: string; digitos: number }
const NUMERACAO_OMISSAO: CfgNumeracao = { padrao: '{PREFIXO}-{ANO}-{SEQ}', prefixo: 'PROC', serie: '', digitos: 6 };
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const codigoVerificacao = () => [...randomBytes(8)].map((b) => CROCKFORD[b % 32]).join('');

/**
 * EMISSÃO — operação atómica:
 *  lock da procuração → revalidação no servidor → número (sequência com lock de linha) → snapshot congelado e cifrado
 *  → PDF + DOCX a partir do MESMO AST → hashes → armazenamento → estado EMITIDA → histórico → auditoria → COMMIT.
 * Se algo falhar, a transacção é revertida e o número não é consumido (numeração sem lacunas).
 */
@Injectable()
export class EmissaoService {
  constructor(@InjectDb() private readonly db: Db, private readonly poa: PoaService, private readonly pdf: PdfService, private readonly storage: StorageService, private readonly audit: AuditService, private readonly crypto: CryptoService) {}

  private async alocarNumero(tx: Tx, orgId: string, ano: number): Promise<string> {
    const [cfgRow] = await tx.select().from(s.settings).where(and(eq(s.settings.orgId, orgId), eq(s.settings.key, 'numeracao')));
    const cfg = { ...NUMERACAO_OMISSAO, ...((cfgRow?.value as Partial<CfgNumeracao>) ?? {}) };
    await tx.insert(s.sequences).values({ orgId, code: 'PROC', prefix: cfg.prefixo, series: cfg.serie, pattern: cfg.padrao, digits: cfg.digitos, year: ano }).onConflictDoNothing();
    const [r] = await tx.update(s.sequences).set({ lastValue: sql`${s.sequences.lastValue} + 1` })
      .where(and(eq(s.sequences.orgId, orgId), eq(s.sequences.code, 'PROC'), eq(s.sequences.series, cfg.serie), eq(s.sequences.year, ano))).returning();
    // O formato vem sempre da configuração actual; a linha da sequência só guarda o contador (por série e ano)
    return formatarNumeroDocumento({ padrao: cfg.padrao, prefixo: cfg.prefixo, serie: cfg.serie, digitos: cfg.digitos }, ano, r.lastValue);
  }

  /** directa=true: emissão directa a partir do rascunho (permissão poa.issue_direct), sem revisão por terceiros. */
  async emitir(id: string, u: Utilizador, directa = false) {
    return this.db.transaction(async (tx) => {
      const [linha] = await tx.select().from(s.powersOfAttorney).where(and(eq(s.powersOfAttorney.id, id), eq(s.powersOfAttorney.orgId, u.orgId))).for('update');
      if (!linha) throw new NotFoundException();
      transitar(linha.status as Estado, directa ? 'EMITIR_DIRECTO' : 'EMITIR', { permissoes: new Set(u.permissoes) });
      const c = await this.poa.carregar(tx, id, u);
      const r = this.poa.avaliar(c);
      if (!r.pronta) throw new ConflictException({ message: 'Não é possível emitir: existem pendências.', checklist: r.checklist });
      if (!c.dados.oficiante.nome) throw new BadRequestException('Designe o oficiante antes de emitir.');

      const numero = await this.alocarNumero(tx, u.orgId, new Date().getUTCFullYear());
      const dados: DadosProcuracao = { ...c.dados, numero };
      const doc = construirDocumento(c.modelo, dados, { tipos: c.tiposDoc });
      const clausulas = c.dados.clausulas;
      // Snapshot: tudo o que o documento diz e de onde veio (versões exactas). Nunca é recalculado.
      const snapshot = {
        v: 1, numero, emitidaEm: new Date().toISOString(), emitidaPor: u.id, templateVersionId: linha.templateVersionId,
        poderes: [...c.dados.poderes, ...clausulas].map((p) => ({ codigo: p.versao.codigo, versaoId: p.versao.versaoId, versao: p.versao.numeroVersao, personalizado: !!p.personalizado, valores: p.valores })),
        dados, documento: doc,
      };
      const json = JSON.stringify(snapshot);
      const contentHash = CryptoService.sha256(json);
      const verif = codigoVerificacao();
      const rodapeExtra = `Verificação ${verif.slice(0, 4)}-${verif.slice(4)} · ${contentHash.slice(0, 12)}`;

      const [pdf, docx] = await Promise.all([this.pdf.gerar(doc, rodapeExtra), renderizarDocx(doc.rodape || doc.paginacao ? { ...doc, rodape: `${doc.rodape} · ${rodapeExtra}` } : doc)]);
      const ficheiros = [
        { kind: 'PDF' as const, buf: pdf, mime: 'application/pdf', ext: 'pdf' },
        { kind: 'DOCX' as const, buf: docx, mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx' },
      ];
      for (const f of ficheiros) {
        const key = this.storage.novaChave(f.ext);
        await this.storage.put(key, f.buf, f.mime);
        await tx.insert(s.documents).values({ poaId: id, kind: f.kind, storageKey: key, sha256: CryptoService.sha256(f.buf), size: f.buf.length, mime: f.mime, createdBy: u.id });
      }
      await tx.update(s.powersOfAttorney).set({
        status: 'EMITIDA', number: numero, snapshot: { enc: this.crypto.encrypt(json) }, contentHash, verificationCode: verif,
        issuedBy: u.id, issuedAt: new Date(), updatedBy: u.id, updatedAt: new Date(), lockVersion: linha.lockVersion + 1,
        ...(directa ? { validatedBy: u.id, validatedAt: new Date() } : {}),
      }).where(eq(s.powersOfAttorney.id, id));
      const powerIds = [...new Set([...c.dados.poderes, ...clausulas].filter((p) => !p.personalizado).map((p) => p.versao.poderId))];
      if (powerIds.length) await tx.update(s.powers).set({ usageCount: sql`${s.powers.usageCount} + 1` }).where(inArray(s.powers.id, powerIds));
      await this.poa.historico(tx, id, linha.status as Estado, 'EMITIDA', directa ? 'EMITIR_DIRECTO' : 'EMITIR', u, directa ? 'Emissão directa (sem revisão por terceiros)' : undefined);
      await this.audit.log(tx, u, directa ? 'POA_EMITIR_DIRECTO' : 'POA_EMITIR', 'poa', id, { numero, contentHash, pdfSha256: CryptoService.sha256(pdf), de: linha.status });
      return { id, numero, contentHash, codigoVerificacao: verif };
    });
  }

  /** Regista a versão assinada (digitalização PDF) e passa a ASSINADA. */
  async registarAssinatura(id: string, ficheiro: Buffer, u: Utilizador) {
    if (ficheiro.length > 20 * 1024 * 1024) throw new BadRequestException('Ficheiro demasiado grande (máx. 20 MB)');
    if (ficheiro.subarray(0, 5).toString('latin1') !== '%PDF-') throw new BadRequestException('A digitalização deve ser um PDF');
    return this.db.transaction(async (tx) => {
      const [p] = await tx.select().from(s.powersOfAttorney).where(and(eq(s.powersOfAttorney.id, id), eq(s.powersOfAttorney.orgId, u.orgId))).for('update');
      if (!p) throw new NotFoundException();
      transitar(p.status as Estado, 'REGISTAR_ASSINATURA', { permissoes: new Set(u.permissoes) });
      const key = this.storage.novaChave('pdf');
      await this.storage.put(key, ficheiro, 'application/pdf');
      await tx.insert(s.documents).values({ poaId: id, kind: 'DIGITALIZACAO_ASSINADA', storageKey: key, sha256: CryptoService.sha256(ficheiro), size: ficheiro.length, mime: 'application/pdf', createdBy: u.id });
      await tx.update(s.powersOfAttorney).set({ status: 'ASSINADA', updatedBy: u.id, updatedAt: new Date(), lockVersion: p.lockVersion + 1 }).where(eq(s.powersOfAttorney.id, id));
      await this.poa.historico(tx, id, 'EMITIDA', 'ASSINADA', 'REGISTAR_ASSINATURA', u);
      await this.audit.log(tx, u, 'POA_ASSINATURA', 'poa', id, { sha256: CryptoService.sha256(ficheiro) });
      return { id, estado: 'ASSINADA' };
    });
  }

  async descarregar(docId: string, u: Utilizador) {
    const [d] = await this.db.select({ d: s.documents, org: s.powersOfAttorney.orgId, numero: s.powersOfAttorney.number }).from(s.documents)
      .innerJoin(s.powersOfAttorney, eq(s.powersOfAttorney.id, s.documents.poaId)).where(eq(s.documents.id, docId));
    if (!d || d.org !== u.orgId) throw new NotFoundException();
    const buf = await this.storage.get(d.d.storageKey);
    if (CryptoService.sha256(buf) !== d.d.sha256) throw new ConflictException('Integridade do ficheiro comprometida — contacte o administrador.');
    await this.db.transaction((tx) => this.audit.log(tx, u, 'DOCUMENTO_DESCARREGAR', 'document', docId, undefined, { numero: d.numero, tipo: d.d.kind }));
    const ext = d.d.kind === 'DOCX' ? 'docx' : 'pdf';
    return { buf, mime: d.d.mime, nome: `${d.numero ?? 'procuracao'}${d.d.kind === 'DIGITALIZACAO_ASSINADA' ? '-assinada' : ''}.${ext}` };
  }
}
