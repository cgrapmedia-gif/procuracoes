import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Pool } from 'pg';
import { POOL } from '../db/db.module';
import { Public } from './http';

/** Verificação de saúde para o orquestrador/monitorização. Não expõe detalhes internos. */
@Controller('health')
export class HealthController {
  constructor(@Inject(POOL) private readonly pool: Pool) {}
  @Public() @SkipThrottle() @Get()
  async estado() {
    const t = Date.now();
    try { await this.pool.query('select 1'); } catch { throw new ServiceUnavailableException({ estado: 'indisponivel', bd: false }); }
    return { estado: 'ok', bd: true, latenciaBdMs: Date.now() - t };
  }
}
