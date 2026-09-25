import { Injectable } from '@nestjs/common';
import { desc, sql } from 'drizzle-orm';
import { CryptoService } from './crypto.service';
import { Tx } from '../db/db.module';
import { auditLogs } from '../db/schema';

/** JSON canónico (chaves ordenadas) — necessário porque o jsonb do PostgreSQL reordena as chaves. */
export function canonico(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonico).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonico(o[k])}`).join(',')}}`;
}

export const hashAuditoria = (prev: string | null, at: string, actor: string | null, action: string, entity: string, entityId: string | null, changes: unknown, metadata: unknown) =>
  CryptoService.sha256(canonico([prev, at, actor, action, entity, entityId, changes ?? null, metadata ?? null]));

export interface Actor { id: string; ip?: string }

/** Diferença superficial entre dois objectos (o que foi alterado). */
export function diff(antes: Record<string, unknown> | null, depois: Record<string, unknown> | null): Record<string, { de: unknown; para: unknown }> {
  const out: Record<string, { de: unknown; para: unknown }> = {};
  const chaves = new Set([...Object.keys(antes ?? {}), ...Object.keys(depois ?? {})]);
  for (const k of chaves) {
    if (['updatedAt', 'createdAt', 'lockVersion'].includes(k)) continue;
    const a = antes?.[k], b = depois?.[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) out[k] = { de: a ?? null, para: b ?? null };
  }
  return out;
}

@Injectable()
export class AuditService {
  /** Deve ser chamado DENTRO da transacção da operação auditada: ou fica tudo registado, ou nada. */
  async log(tx: Tx, actor: Actor | null, action: string, entity: string, entityId: string | null, changes?: unknown, metadata?: unknown) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('audit_chain'))`);
    const [last] = await tx.select({ hash: auditLogs.hash }).from(auditLogs).orderBy(desc(auditLogs.id)).limit(1);
    const at = new Date().toISOString();
    const prevHash = last?.hash ?? null;
    const norm = (x: unknown) => (x === undefined ? null : JSON.parse(JSON.stringify(x)));
    const hash = hashAuditoria(prevHash, at, actor?.id ?? null, action, entity, entityId, norm(changes), norm(metadata));
    await tx.insert(auditLogs).values({ at: new Date(at), actorId: actor?.id ?? null, actorIp: actor?.ip ?? null, action, entity, entityId, changes: norm(changes), metadata: norm(metadata), prevHash, hash });
  }
}
