import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from '@node-rs/argon2';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../common/audit.service';
import { CryptoService } from '../common/crypto.service';
import { config } from '../config';
import { Db, InjectDb } from '../db/db.module';
import { refreshTokens, rolePermissions, roles, userRoles, users } from '../db/schema';

const MAX_FALHAS = 5;
const BLOQUEIO_MIN = 15;
// Hash fictício para igualar o tempo de resposta quando o utilizador não existe (anti-enumeração).
let hashFicticio: Promise<string> | undefined;

export const hashPassword = (p: string) => hash(p, { memoryCost: 19456, timeCost: 2, parallelism: 1 });

export interface Sessao { accessToken: string; refreshToken: string; expiresIn: number; utilizador: { id: string; nome: string; email: string; permissoes: string[]; perfis: string[]; trocarPassword: boolean } }

@Injectable()
export class AuthService {
  constructor(@InjectDb() private readonly db: Db, private readonly jwt: JwtService, private readonly audit: AuditService) {}

  async login(email: string, password: string, meta: { ip?: string; ua?: string }): Promise<Sessao> {
    const [u] = await this.db.select().from(users).where(sql`lower(${users.email}) = lower(${email})`).limit(1);
    if (!u) { hashFicticio ??= hashPassword('tempo-constante'); await verify(await hashFicticio, password).catch(() => false); throw new UnauthorizedException('Credenciais inválidas'); }
    if (!u.active) throw new UnauthorizedException('Credenciais inválidas');
    if (u.lockedUntil && u.lockedUntil > new Date()) throw new UnauthorizedException('Conta temporariamente bloqueada. Tente mais tarde.');
    const ok = await verify(u.passwordHash, password).catch(() => false);
    if (!ok) {
      const falhas = u.failedLogins + 1;
      await this.db.transaction(async (tx) => {
        await tx.update(users).set({ failedLogins: falhas >= MAX_FALHAS ? 0 : falhas, lockedUntil: falhas >= MAX_FALHAS ? new Date(Date.now() + BLOQUEIO_MIN * 60_000) : u.lockedUntil }).where(eq(users.id, u.id));
        await this.audit.log(tx, { id: u.id, ip: meta.ip }, falhas >= MAX_FALHAS ? 'AUTH_BLOQUEIO' : 'AUTH_FALHA', 'user', u.id);
      });
      throw new UnauthorizedException('Credenciais inválidas');
    }
    return this.db.transaction(async (tx) => {
      await tx.update(users).set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(users.id, u.id));
      await this.audit.log(tx, { id: u.id, ip: meta.ip }, 'AUTH_LOGIN', 'user', u.id);
      return this.emitir(tx as unknown as Db, u.id, randomUUID(), meta);
    });
  }

  /** Rotação: cada refresh token só pode ser usado uma vez. Reutilização => toda a família é revogada (roubo provável). */
  async refresh(token: string, meta: { ip?: string; ua?: string }): Promise<Sessao> {
    const h = CryptoService.sha256(token);
    // A revogação por reutilização tem de ser persistida: não pode ficar dentro de uma transacção que depois é revertida pelo erro.
    const r = await this.db.transaction(async (tx) => {
      const [rt] = await tx.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, h)).for('update');
      if (!rt) return { erro: 'Sessão inválida' } as const;
      if (rt.revokedAt) {
        await tx.update(refreshTokens).set({ revokedAt: new Date() }).where(and(eq(refreshTokens.familyId, rt.familyId), isNull(refreshTokens.revokedAt)));
        await this.audit.log(tx, { id: rt.userId, ip: meta.ip }, 'AUTH_REUTILIZACAO_TOKEN', 'user', rt.userId);
        return { erro: 'Sessão revogada' } as const;
      }
      if (rt.expiresAt < new Date()) return { erro: 'Sessão expirada' } as const;
      const [u] = await tx.select({ active: users.active }).from(users).where(eq(users.id, rt.userId));
      if (!u?.active) return { erro: 'Sessão inválida' } as const;
      const s = await this.emitir(tx as unknown as Db, rt.userId, rt.familyId, meta);
      await tx.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, rt.id));
      return { sessao: s } as const;
    });
    if ('erro' in r) throw new UnauthorizedException(r.erro);
    return r.sessao;
  }

  async logout(token: string | undefined) {
    if (!token) return;
    const [rt] = await this.db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, CryptoService.sha256(token)));
    if (rt) await this.db.update(refreshTokens).set({ revokedAt: new Date() }).where(and(eq(refreshTokens.familyId, rt.familyId), isNull(refreshTokens.revokedAt)));
  }

  /** Alteração da própria palavra-passe: exige a actual; termina as outras sessões. */
  async alterarPassword(userId: string, actual: string, nova: string, ip?: string) {
    const [u] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!u || !(await verify(u.passwordHash, actual).catch(() => false))) throw new UnauthorizedException('Palavra-passe actual incorrecta');
    if (actual === nova) throw new UnauthorizedException('A nova palavra-passe tem de ser diferente');
    await this.db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash: await hashPassword(nova), mustChangePassword: false, updatedAt: new Date() }).where(eq(users.id, userId));
      await tx.update(refreshTokens).set({ revokedAt: new Date() }).where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
      await this.audit.log(tx, { id: userId, ip }, 'AUTH_ALTERAR_PASSWORD', 'user', userId);
    });
  }

  async permissoes(db: Db, userId: string): Promise<{ perms: string[]; perfis: string[] }> {
    const rows = await db.select({ perm: rolePermissions.permissionCode, perfil: roles.code }).from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId)).leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id)).where(eq(userRoles.userId, userId));
    return { perms: [...new Set(rows.map((r) => r.perm).filter((x): x is string => !!x))].sort(), perfis: [...new Set(rows.map((r) => r.perfil))] };
  }

  private async emitir(db: Db, userId: string, familyId: string, meta: { ip?: string; ua?: string }): Promise<Sessao> {
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    const { perms, perfis } = await this.permissoes(db, userId);
    const cfg = config();
    const accessToken = await this.jwt.signAsync({ sub: u.id, org: u.orgId, nome: u.name, perms, ...(u.mustChangePassword ? { tp: 1 } : {}) }, { expiresIn: cfg.JWT_TTL_SECONDS });
    const refreshToken = CryptoService.token();
    await db.insert(refreshTokens).values({ userId, familyId, tokenHash: CryptoService.sha256(refreshToken), expiresAt: new Date(Date.now() + cfg.REFRESH_TTL_DAYS * 86400_000), ip: meta.ip, userAgent: meta.ua?.slice(0, 300) });
    return { accessToken, refreshToken, expiresIn: cfg.JWT_TTL_SECONDS, utilizador: { id: u.id, nome: u.name, email: u.email, permissoes: perms, perfis, trocarPassword: u.mustChangePassword } };
  }
}
