import { ArgumentsHost, BadRequestException, Catch, CanActivate, ExceptionFilter, ExecutionContext, HttpException, Injectable, PipeTransform, SetMetadata, UnauthorizedException, ForbiddenException, createParamDecorator, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { ZodSchema } from 'zod';
import { TransicaoInvalida, ErroTemplate, SemPermissao } from '@proc/core';

export const PUBLIC = 'public';
export const Public = () => SetMetadata(PUBLIC, true);
export const PERMS = 'perms';
/** Exige TODAS as permissões indicadas. */
export const Requer = (...p: string[]) => SetMetadata(PERMS, p);

export interface Utilizador { id: string; orgId: string; nome: string; permissoes: string[]; ip?: string }
export const Actor = createParamDecorator((_: unknown, ctx: ExecutionContext): Utilizador => {
  const req = ctx.switchToHttp().getRequest<Request & { user: Utilizador }>();
  return { ...req.user, ip: req.ip };
});

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly reflector: Reflector) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest<Request & { user?: Utilizador }>();
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) throw new UnauthorizedException('Sessão inválida');
    try {
      const p = await this.jwt.verifyAsync<{ sub: string; org: string; nome: string; perms: string[] }>(h.slice(7));
      req.user = { id: p.sub, orgId: p.org, nome: p.nome, permissoes: p.perms };
    } catch { throw new UnauthorizedException('Sessão expirada'); }
    const exigidas = this.reflector.getAllAndOverride<string[]>(PERMS, [ctx.getHandler(), ctx.getClass()]) ?? [];
    const falta = exigidas.filter((x) => !req.user!.permissoes.includes(x));
    if (falta.length) throw new ForbiddenException(`Permissão necessária: ${falta.join(', ')}`);
    return true;
  }
}

export class ZodPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodSchema<T>) {}
  transform(value: unknown): T {
    const r = this.schema.safeParse(value);
    if (!r.success) throw new BadRequestException({ message: 'Dados inválidos', erros: r.error.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message })) });
    return r.data;
  }
}

/** Traduz erros de domínio e da BD para respostas HTTP claras, sem vazar detalhes internos. */
@Catch()
export class ErrosFilter implements ExceptionFilter {
  private readonly log = new Logger('Erros');
  catch(e: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (e instanceof HttpException) { const r = e.getResponse(); return res.status(e.getStatus()).json(typeof r === 'string' ? { message: r } : r); }
    if (e instanceof SemPermissao) return res.status(403).json({ message: e.message });
    if (e instanceof TransicaoInvalida) return res.status(409).json({ message: e.message });
    if (e instanceof ErroTemplate) return res.status(422).json({ message: e.message });
    const pg = e as { code?: string; message?: string; cause?: { code?: string; message?: string } };
    const c = pg.cause?.code ?? pg.code; const m = pg.cause?.message ?? pg.message;
    if (c === 'P0001') return res.status(409).json({ message: m }); // regras de integridade na BD
    if (c === '23505') return res.status(409).json({ message: 'Registo duplicado.' });
    if (c === '23503') return res.status(409).json({ message: 'Registo referenciado por outros dados.' });
    this.log.error(e);
    return res.status(500).json({ message: 'Erro interno.' });
  }
}
