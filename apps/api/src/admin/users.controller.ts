import { BadRequestException, Body, ConflictException, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { AuditService } from '../common/audit.service';
import { Actor, Requer, Utilizador, ZodPipe } from '../common/http';
import { Db, InjectDb } from '../db/db.module';
import * as s from '../db/schema';
import { hashPassword } from '../auth/auth.service';

const Password = z.string().min(12, 'mínimo 12 caracteres').max(200).regex(/[a-z]/, 'minúscula').regex(/[A-Z]/, 'maiúscula').regex(/\d/, 'dígito');
const NovoUtilizador = z.object({ email: z.string().trim().email('email inválido'), nome: z.string().trim().min(3, 'nome: mínimo 3 caracteres').max(120), password: Password, perfis: z.array(z.string()).min(1, 'escolha pelo menos um perfil') });
const EditarUtilizador = z.object({ nome: z.string().min(3).max(120).optional(), activo: z.boolean().optional(), perfis: z.array(z.string()).min(1).optional(), novaPassword: Password.optional() });

@Controller('admin')
export class UsersController {
  constructor(@InjectDb() private readonly db: Db, private readonly audit: AuditService) {}

  @Get('users') @Requer('user.manage')
  async listar(@Actor() u: Utilizador) {
    const us = await this.db.select({ id: s.users.id, email: s.users.email, nome: s.users.name, activo: s.users.active, ultimoLogin: s.users.lastLoginAt, trocarPassword: s.users.mustChangePassword, bloqueadoAte: s.users.lockedUntil }).from(s.users).where(eq(s.users.orgId, u.orgId)).orderBy(s.users.name);
    const rs = await this.db.select({ userId: s.userRoles.userId, code: s.roles.code }).from(s.userRoles).innerJoin(s.roles, eq(s.roles.id, s.userRoles.roleId));
    return us.map((x) => ({ ...x, perfis: rs.filter((r) => r.userId === x.id).map((r) => r.code) }));
  }

  @Get('roles') @Requer('user.manage')
  async perfis() {
    const rs = await this.db.select().from(s.roles);
    const ps = await this.db.select().from(s.rolePermissions);
    return rs.map((r) => ({ ...r, permissoes: ps.filter((p) => p.roleId === r.id).map((p) => p.permissionCode) }));
  }

  @Post('users') @Requer('user.manage')
  criar(@Body(new ZodPipe(NovoUtilizador)) b: z.infer<typeof NovoUtilizador>, @Actor() u: Utilizador) {
    return this.db.transaction(async (tx) => {
      const [existe] = await tx.select({ id: s.users.id }).from(s.users).where(sql`lower(${s.users.email}) = ${b.email.toLowerCase()}`);
      if (existe) throw new ConflictException('Já existe um utilizador com este email.');
      // Palavra-passe inicial é temporária: tem de ser alterada no 1.º acesso
      const [n] = await tx.insert(s.users).values({ orgId: u.orgId, email: b.email.toLowerCase(), name: b.nome, passwordHash: await hashPassword(b.password), mustChangePassword: true }).returning({ id: s.users.id });
      const roles = await tx.select().from(s.roles).where(inArray(s.roles.code, b.perfis));
      for (const r of roles) await tx.insert(s.userRoles).values({ userId: n.id, roleId: r.id });
      await this.audit.log(tx, u, 'UTILIZADOR_CRIAR', 'user', n.id, { email: b.email, perfis: b.perfis });
      return n;
    });
  }

  @Put('users/:id') @Requer('user.manage')
  editar(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(EditarUtilizador)) b: z.infer<typeof EditarUtilizador>, @Actor() u: Utilizador) {
    if (id === u.id && (b.activo === false || (b.perfis && !b.perfis.includes('ADMINISTRADOR') && u.permissoes.includes('user.manage')))) throw new BadRequestException('Não pode desactivar a sua própria conta nem retirar-se de administrador.');
    return this.db.transaction(async (tx) => {
      const [alvo] = await tx.select({ id: s.users.id }).from(s.users).where(and(eq(s.users.id, id), eq(s.users.orgId, u.orgId)));
      if (!alvo) throw new BadRequestException('Utilizador inexistente');
      if (b.nome !== undefined || b.activo !== undefined) await tx.update(s.users).set({ ...(b.nome ? { name: b.nome } : {}), ...(b.activo !== undefined ? { active: b.activo } : {}), updatedAt: new Date() }).where(eq(s.users.id, id));
      if (b.novaPassword) await tx.update(s.users).set({ passwordHash: await hashPassword(b.novaPassword), failedLogins: 0, lockedUntil: null, mustChangePassword: true, updatedAt: new Date() }).where(eq(s.users.id, id));
      if (b.activo === false || b.novaPassword) await tx.update(s.refreshTokens).set({ revokedAt: new Date() }).where(eq(s.refreshTokens.userId, id));
      if (b.perfis) { await tx.delete(s.userRoles).where(eq(s.userRoles.userId, id)); for (const r of await tx.select().from(s.roles).where(inArray(s.roles.code, b.perfis))) await tx.insert(s.userRoles).values({ userId: id, roleId: r.id }); }
      await this.audit.log(tx, u, 'UTILIZADOR_EDITAR', 'user', id, { ...b, novaPassword: b.novaPassword ? '(redefinida)' : undefined });
      return { id };
    });
  }
}
