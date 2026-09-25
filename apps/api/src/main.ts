import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { config } from './config';

export async function configurarApp(app: import('@nestjs/common').INestApplication) {
  app.setGlobalPrefix('api/v1');
  // Em plataformas (Render) a API tem um URL público: só aceita pedidos que tragam o segredo que o frontend acrescenta.
  const segredo = config().PROXY_SECRET;
  if (segredo) {
    const esperado = Buffer.from(segredo);
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.path === '/api/v1/health') return next();
      const h = req.headers['x-proxy-secret'];
      const recebido = Buffer.from(typeof h === 'string' ? h : '');
      if (recebido.length === esperado.length && timingSafeEqual(recebido, esperado)) return next();
      res.status(403).json({ message: 'Acesso directo à API não permitido.' });
    });
  }
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], styleSrc: ["'unsafe-inline'"], imgSrc: ['data:'], frameAncestors: ["'self'"] } }, crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cookieParser());
  app.enableCors({ origin: config().CORS_ORIGIN.split(','), credentials: true, allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With'] });
  (app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void }).set('trust proxy', config().TRUST_PROXY_HOPS);
  app.enableShutdownHooks();
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: true });
  await configurarApp(app);
  await app.listen(config().PORT);
  console.log(`API em http://localhost:${config().PORT}/api/v1`);
}
if (require.main === module) bootstrap();
