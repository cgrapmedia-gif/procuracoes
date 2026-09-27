import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { AuditService } from '../common/audit.service';
import { Utilizador } from '../common/http';
import { Db, InjectDb, Tx } from '../db/db.module';
import * as s from '../db/schema';
import { StorageService } from '../documents/storage.service';

/**
 * Eliminação de procurações e dos respectivos documentos (PDF, DOCX, digitalizações).
 * Irreversível. Só administradores (permissão poa.purge), com motivo; fica registada na auditoria
 * (a auditoria nunca é apagada). Os triggers de integridade só o permitem dentro desta transacção.
 */
@Injectable()
export class PurgaService {
  private readonly log = new Logger('Purga');
  constructor(@InjectDb() private readonly db: Db, private readonly storage: StorageService, private readonly audit: AuditService) {}

  private async apagarIds(tx: Tx, ids: string[]): Promise<string[]> {
    if (!ids.length) return [];
    await tx.execute(sql`select set_config('procuracoes.purga', 'on', true)`);
    const docs = await tx.select({ key: s.documents.storageKey }).from(s.documents).where(inArray(s.documents.poaId, ids));
    await tx.delete(s.documents).where(inArray(s.documents.poaId, ids));
    await tx.delete(s.poaStatusHistory).where(inArray(s.poaStatusHistory.poaId, ids));
    const pps = await tx.select({ id: s.poaPowers.id }).from(s.poaPowers).where(inArray(s.poaPowers.poaId, ids));
    if (pps.length) await tx.delete(s.poaFieldValues).where(inArray(s.poaFieldValues.poaPowerId, pps.map((p) => p.id)));
    await tx.delete(s.poaPowers).where(inArray(s.poaPowers.poaId, ids));
    await tx.delete(s.poaParties).where(inArray(s.poaParties.poaId, ids));
    await tx.delete(s.powersOfAttorney).where(inArray(s.powersOfAttorney.id, ids));
    return docs.map((d) => d.key);
  }

  private async apagarFicheiros(keys: string[]) {
    for (const k of keys) await this.storage.apagar(k).catch((e) => this.log.warn(`Não foi possível apagar ${k}: ${(e as Error).message}`));
  }

  async apagarUma(id: string, motivo: string, u: Utilizador) {
    const keys = await this.db.transaction(async (tx) => {
      const [p] = await tx.select({ numero: s.powersOfAttorney.number, estado: s.powersOfAttorney.status }).from(s.powersOfAttorney).where(and(eq(s.powersOfAttorney.id, id), eq(s.powersOfAttorney.orgId, u.orgId)));
      if (!p) throw new NotFoundException('Procuração não encontrada');
      const k = await this.apagarIds(tx, [id]);
      await this.audit.log(tx, u, 'POA_APAGAR', 'poa', id, { numero: p.numero, estado: p.estado, motivo, ficheiros: k.length });
      return k;
    });
    await this.apagarFicheiros(keys);
    return { apagadas: 1, ficheiros: keys.length };
  }

  async apagarTodas(b: { confirmacao: string; motivo: string; reiniciarNumeracao: boolean }, u: Utilizador) {
    if (b.confirmacao !== 'APAGAR TUDO') throw new BadRequestException('Escreva exactamente APAGAR TUDO para confirmar.');
    const { keys, n } = await this.db.transaction(async (tx) => {
      const ids = (await tx.select({ id: s.powersOfAttorney.id }).from(s.powersOfAttorney).where(eq(s.powersOfAttorney.orgId, u.orgId))).map((r) => r.id);
      const k: string[] = [];
      for (let i = 0; i < ids.length; i += 500) k.push(...await this.apagarIds(tx, ids.slice(i, i + 500)));
      if (b.reiniciarNumeracao) await tx.delete(s.sequences).where(eq(s.sequences.orgId, u.orgId));
      await this.audit.log(tx, u, 'POAS_APAGAR_TODAS', 'organization', u.orgId, { procuracoes: ids.length, ficheiros: k.length, reiniciarNumeracao: b.reiniciarNumeracao, motivo: b.motivo });
      return { keys: k, n: ids.length };
    });
    await this.apagarFicheiros(keys);
    return { apagadas: n, ficheiros: keys.length, numeracaoReiniciada: b.reiniciarNumeracao };
  }
}
