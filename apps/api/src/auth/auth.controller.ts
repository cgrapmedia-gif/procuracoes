import { Body, Controller, Get, HttpCode, Post, Put, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Actor, PermitidaComPasswordTemporaria, Public, Utilizador, ZodPipe } from '../common/http';
import { config } from '../config';
import { AuthService, Sessao } from './auth.service';

const COOKIE = 'proc_rt';
export const PasswordForte = z.string().min(12, 'mínimo 12 caracteres').max(200).regex(/[a-z]/, 'precisa de minúscula').regex(/[A-Z]/, 'precisa de maiúscula').regex(/\d/, 'precisa de dígito');
const AlterarPassword = z.object({ actual: z.string().min(1).max(200), nova: PasswordForte });
const Login = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Refresh token em cookie httpOnly+Secure+SameSite=Strict, limitado a /api/v1/auth. O access token vive só em memória no frontend. */
  private responder(res: Response, s: Sessao) {
    res.cookie(COOKIE, s.refreshToken, { httpOnly: true, secure: config().NODE_ENV === 'production', sameSite: 'strict', path: '/api/v1/auth', maxAge: config().REFRESH_TTL_DAYS * 86400_000 });
    return { accessToken: s.accessToken, expiresIn: s.expiresIn, utilizador: s.utilizador };
  }

  /** Defesa CSRF para os endpoints que usam o cookie: exige cabeçalho personalizado (não enviável cross-site sem CORS). */
  private exigirCabecalho(req: Request) { if (req.headers['x-requested-with'] !== 'procuracoes') throw new UnauthorizedException('Pedido inválido'); }

  @Public() @Post('login') @HttpCode(200) @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(@Body(new ZodPipe(Login)) b: z.infer<typeof Login>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.responder(res, await this.auth.login(b.email, b.password, { ip: req.ip, ua: req.headers['user-agent'] }));
  }

  @Public() @Post('refresh') @HttpCode(200) @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.exigirCabecalho(req);
    const t = req.cookies?.[COOKIE];
    if (!t) throw new UnauthorizedException('Sessão inválida');
    return this.responder(res, await this.auth.refresh(t, { ip: req.ip, ua: req.headers['user-agent'] }));
  }

  @Public() @Post('logout') @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.exigirCabecalho(req);
    await this.auth.logout(req.cookies?.[COOKIE]);
    res.clearCookie(COOKIE, { path: '/api/v1/auth' });
  }

  @Get('me') @PermitidaComPasswordTemporaria() me(@Actor() u: Utilizador) { return u; }

  /** Altera a própria palavra-passe. As outras sessões são terminadas; esta mantém-se com novo refresh token. */
  @Put('password') @PermitidaComPasswordTemporaria() @HttpCode(204) @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async password(@Body(new ZodPipe(AlterarPassword)) b: z.infer<typeof AlterarPassword>, @Actor() u: Utilizador, @Res({ passthrough: true }) res: Response) {
    await this.auth.alterarPassword(u.id, b.actual, b.nova, u.ip);
    res.clearCookie(COOKIE, { path: '/api/v1/auth' });
  }
}
