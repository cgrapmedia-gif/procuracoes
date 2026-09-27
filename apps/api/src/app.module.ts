import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModuleControllers } from './admin';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { CatalogController } from './catalog/catalog.controller';
import { AuditService } from './common/audit.service';
import { HealthController } from './common/health.controller';
import { CryptoService } from './common/crypto.service';
import { AuthGuard, ErrosFilter } from './common/http';
import { config } from './config';
import { DashboardController } from './dashboard/dashboard.controller';
import { DbModule } from './db/db.module';
import { PdfService } from './documents/pdf.service';
import { StorageService } from './documents/storage.service';
import { PersonsController } from './persons/persons.controller';
import { PersonsService } from './persons/persons.service';
import { PersonsImportService } from './persons/persons-import.service';
import { EmissaoService } from './poa/emissao.service';
import { PoaController } from './poa/poa.controller';
import { PoaService } from './poa/poa.service';
import { ImportService } from './powers/import.service';
import { PowersController } from './powers/powers.controller';
import { PowersService } from './powers/powers.service';

@Module({
  imports: [
    DbModule,
    JwtModule.register({ global: true, secret: config().JWT_SECRET, signOptions: { algorithm: 'HS256', issuer: 'procuracoes' }, verifyOptions: { algorithms: ['HS256'], issuer: 'procuracoes' } }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
  ],
  controllers: [HealthController, AuthController, PowersController, PersonsController, CatalogController, PoaController, DashboardController, ...AdminModuleControllers],
  providers: [
    AuthService, AuditService, CryptoService, PowersService, ImportService, PersonsService, PersonsImportService, PoaService, EmissaoService, PdfService, StorageService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: ErrosFilter },
  ],
})
export class AppModule {}
