import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { DadosProcuracao, DocumentoRenderizado, Estado, PoderSeleccionado, construirDocumento, formatarNumeroDocumento, renderizarDocx, transitar } from '@proc/core';
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

      // Rectificação: mantém o número da original com o sufixo -R1, -R2…; a original fica cancelada
      let original: typeof linha | undefined;
      if (linha.rectifiesId) {
        [original] = await tx.select().from(s.powersOfAttorney).where(eq(s.powersOfAttorney.id, linha.rectifiesId)).for('update');
        if (!original?.number) throw new ConflictException('A procuração rectificada já não existe.');
      }
      const numero = original ? `${original.number!.replace(/-R\d+$/, '')}-R${await this.proximaRectificacao(tx, original.number!.replace(/-R\d+$/, ''))}` : await this.alocarNumero(tx, u.orgId, new Date().getUTCFullYear());
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

      // Só o PDF é gerado na emissão (mais rápido); o DOCX é gerado do snapshot na primeira descarga
      const pdf = await this.pdf.gerar(doc, rodapeExtra);
      const ficheiros = [{ kind: 'PDF' as const, buf: pdf, mime: 'application/pdf', ext: 'pdf' }];
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
      await this.poa.historico(tx, id, linha.status as Estado, 'EMITIDA', directa ? 'EMITIR_DIRECTO' : 'EMITIR', u, original ? `Rectificação da procuração ${original.number}` : directa ? 'Emissão directa (sem revisão por terceiros)' : undefined);
      if (original && original.status !== 'CANCELADA') {
        await tx.update(s.powersOfAttorney).set({ status: 'CANCELADA', updatedBy: u.id, updatedAt: new Date(), lockVersion: original.lockVersion + 1 }).where(eq(s.powersOfAttorney.id, original.id));
        await this.poa.historico(tx, original.id, original.status as Estado, 'CANCELADA', 'CANCELAR', u, `Substituída pela rectificação ${numero}`);
      }
      await this.audit.log(tx, u, directa ? 'POA_EMITIR_DIRECTO' : 'POA_EMITIR', 'poa', id, { numero, contentHash, pdfSha256: CryptoService.sha256(pdf), de: linha.status });
      return { id, numero, contentHash, codigoVerificacao: verif };
    });
  }

  private async proximaRectificacao(tx: Tx, base: string): Promise<number> {
    const r = await tx.select({ n: s.powersOfAttorney.number }).from(s.powersOfAttorney).where(sql`${s.powersOfAttorney.number} like ${base + '-R%'}`);
    return Math.max(0, ...r.map((x) => Number(/-R(\d+)$/.exec(x.n ?? '')?.[1] ?? 0))) + 1;
  }

  /** Lê o snapshot congelado da emissão (é a fonte de verdade do documento). */
  private snapshotDe(p: typeof s.powersOfAttorney.$inferSelect): { documento: DocumentoRenderizado; dados: DadosProcuracao } {
    const enc = (p.snapshot as { enc?: string } | null)?.enc;
    const json = enc ? this.crypto.decrypt(enc) : null;
    if (!json) throw new ConflictException('Snapshot da procuração indisponível.');
    return JSON.parse(json);
  }

  /** Gera de novo um ficheiro a partir do snapshot (mesmo conteúdo, congelado na emissão) e guarda-o. */
  private async regenerar(p: typeof s.powersOfAttorney.$inferSelect, kind: 'PDF' | 'DOCX', u: Utilizador, motivo: string) {
    const { documento } = this.snapshotDe(p);
    const rodapeExtra = p.verificationCode && p.contentHash ? `Verificação ${p.verificationCode.slice(0, 4)}-${p.verificationCode.slice(4)} · ${p.contentHash.slice(0, 12)}` : '';
    const buf = kind === 'PDF' ? await this.pdf.gerar(documento, rodapeExtra) : await renderizarDocx(documento.rodape || documento.paginacao ? { ...documento, rodape: `${documento.rodape} · ${rodapeExtra}` } : documento);
    const mime = kind === 'PDF' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const key = this.storage.novaChave(kind === 'PDF' ? 'pdf' : 'docx');
    await this.storage.put(key, buf, mime);
    const [doc] = await this.db.transaction(async (tx) => {
      const r = await tx.insert(s.documents).values({ poaId: p.id, kind, storageKey: key, sha256: CryptoService.sha256(buf), size: buf.length, mime, createdBy: u.id }).returning();
      await this.audit.log(tx, u, 'DOCUMENTO_GERAR', 'document', r[0].id, { numero: p.number, tipo: kind, motivo, contentHash: p.contentHash });
      return r;
    });
    return { doc, buf };
  }

  /**
   * Ficheiro de uma procuração emitida, por tipo (PDF, DOCX, digitalização assinada).
   * Se o ficheiro se perdeu (ex.: armazenamento temporário do servidor), é regenerado a partir do snapshot
   * congelado na emissão — o texto é exactamente o mesmo — e a regeneração fica registada na auditoria.
   */
  async obterDocumento(poaId: string, kind: 'PDF' | 'DOCX' | 'DIGITALIZACAO_ASSINADA', u: Utilizador) {
    const [p] = await this.db.select().from(s.powersOfAttorney).where(and(eq(s.powersOfAttorney.id, poaId), eq(s.powersOfAttorney.orgId, u.orgId)));
    if (!p) throw new NotFoundException();
    if (!p.snapshot || !p.number) throw new ConflictException('A procuração ainda não foi emitida.');
    const linhas = await this.db.select().from(s.documents).where(and(eq(s.documents.poaId, poaId), eq(s.documents.kind, kind))).orderBy(desc(s.documents.createdAt));
    let buf: Buffer | undefined; let doc = linhas[0];
    for (const l of linhas) {
      const b = await this.storage.get(l.storageKey).catch(() => undefined);
      if (!b) continue;
      if (CryptoService.sha256(b) !== l.sha256) throw new ConflictException('Integridade do ficheiro comprometida — contacte o administrador.');
      buf = b; doc = l; break;
    }
    if (!buf) {
      if (kind === 'DIGITALIZACAO_ASSINADA') throw new NotFoundException('A digitalização assinada não está disponível (perdeu-se no armazenamento). Volte a carregá-la no passo Arquivo.');
      ({ doc, buf } = await this.regenerar(p, kind, u, linhas.length ? 'ficheiro em falta no armazenamento' : 'primeira descarga'));
    }
    await this.db.transaction((tx) => this.audit.log(tx, u, 'DOCUMENTO_DESCARREGAR', 'document', doc.id, undefined, { numero: p.number, tipo: kind }));
    const [out] = await this.db.select({ nome: s.persons.fullName }).from(s.poaParties).innerJoin(s.persons, eq(s.persons.id, s.poaParties.personId))
      .where(and(eq(s.poaParties.poaId, poaId), eq(s.poaParties.role, 'OUTORGANTE'))).orderBy(asc(s.poaParties.position)).limit(1);
    const ext = kind === 'DOCX' ? 'docx' : 'pdf';
    const nome = `Procuracao_${p.number}_${out?.nome ?? 'outorgante'}${kind === 'DIGITALIZACAO_ASSINADA' ? '_assinada' : ''}.${ext}`;
    return { buf, mime: doc.mime, nome };
  }

  async descarregar(docId: string, u: Utilizador) {
    const [d] = await this.db.select({ poaId: s.documents.poaId, kind: s.documents.kind }).from(s.documents).where(eq(s.documents.id, docId));
    if (!d || !d.poaId) throw new NotFoundException();
    return this.obterDocumento(d.poaId, d.kind as 'PDF', u);
  }

  /** Verifica todas as procurações emitidas e regenera os PDF que se perderam. */
  async repararDocumentos(u: Utilizador) {
    const emitidas = await this.db.select().from(s.powersOfAttorney).where(and(eq(s.powersOfAttorney.orgId, u.orgId), isNotNull(s.powersOfAttorney.number)));
    const r = { verificadas: 0, regeneradas: 0, digitalizacoesEmFalta: [] as string[], erros: [] as string[] };
    for (const p of emitidas) {
      if (!p.snapshot) continue;
      r.verificadas++;
      const pdfs = await this.db.select().from(s.documents).where(and(eq(s.documents.poaId, p.id), eq(s.documents.kind, 'PDF'))).orderBy(desc(s.documents.createdAt));
      let ok = false;
      for (const l of pdfs) if (await this.storage.existe(l.storageKey)) { ok = true; break; }
      if (!ok) { try { await this.regenerar(p, 'PDF', u, 'reparação: ficheiro em falta'); r.regeneradas++; } catch (e) { r.erros.push(`${p.number}: ${(e as Error).message}`); } }
      const scans = await this.db.select().from(s.documents).where(and(eq(s.documents.poaId, p.id), eq(s.documents.kind, 'DIGITALIZACAO_ASSINADA')));
      if (scans.length) { let temScan = false; for (const l of scans) if (await this.storage.existe(l.storageKey)) { temScan = true; break; } if (!temScan) r.digitalizacoesEmFalta.push(p.number!); }
    }
    await this.db.transaction((tx) => this.audit.log(tx, u, 'DOCUMENTOS_REPARAR', 'organization', u.orgId, { ...r, digitalizacoesEmFalta: r.digitalizacoesEmFalta.length }));
    return r;
  }

  /** Regista a versão assinada (digitalização PDF) e passa a ASSINADA. */
  async registarAssinatura(id: string, ficheiro: Buffer, u: Utilizador) {
    if (ficheiro.length > 20 * 1024 * 1024) throw new BadRequestException('Ficheiro demasiado grande (máx. 20 MB)');
    if (ficheiro.subarray(0, 5).toString('latin1') !== '%PDF-') throw new BadRequestException('A digitalização deve ser um PDF');
    return this.db.transaction(async (tx) => {
      const [p] = await tx.select().from(s.powersOfAttorney).where(and(eq(s.powersOfAttorney.id, id), eq(s.powersOfAttorney.orgId, u.orgId))).for('update');
      if (!p) throw new NotFoundException();
      const substituir = p.status === 'ASSINADA'; // nova digitalização (ex.: a anterior perdeu-se)
      if (!substituir) transitar(p.status as Estado, 'REGISTAR_ASSINATURA', { permissoes: new Set(u.permissoes) });
      const key = this.storage.novaChave('pdf');
      await this.storage.put(key, ficheiro, 'application/pdf');
      await tx.insert(s.documents).values({ poaId: id, kind: 'DIGITALIZACAO_ASSINADA', storageKey: key, sha256: CryptoService.sha256(ficheiro), size: ficheiro.length, mime: 'application/pdf', createdBy: u.id });
      if (!substituir) {
        await tx.update(s.powersOfAttorney).set({ status: 'ASSINADA', updatedBy: u.id, updatedAt: new Date(), lockVersion: p.lockVersion + 1 }).where(eq(s.powersOfAttorney.id, id));
        await this.poa.historico(tx, id, 'EMITIDA', 'ASSINADA', 'REGISTAR_ASSINATURA', u);
      }
      await this.audit.log(tx, u, 'POA_ASSINATURA', 'poa', id, { sha256: CryptoService.sha256(ficheiro) });
      return { id, estado: 'ASSINADA' };
    });
  }


}
