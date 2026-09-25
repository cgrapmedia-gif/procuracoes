import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { NodePgDatabase, drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { criarPool } from './conexao';
import { config } from '../config';
import * as schema from './schema';

export const DB = Symbol('DB');
export const POOL = Symbol('POOL');
export type Db = NodePgDatabase<typeof schema>;
/** Transacção ou base de dados — os serviços aceitam ambos. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0] | Db;
export const InjectDb = () => Inject(DB);

@Global()
@Module({
  providers: [
    { provide: POOL, useFactory: () => criarPool(config().DATABASE_URL) },
    { provide: DB, inject: [POOL], useFactory: (pool: Pool) => drizzle(pool, { schema }) },
  ],
  exports: [DB, POOL],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(POOL) private readonly pool: Pool) {}
  async onApplicationShutdown() { await this.pool.end(); }
}
