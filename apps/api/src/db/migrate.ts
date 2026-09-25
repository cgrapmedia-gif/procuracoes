import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { criarPool, urlDirecta } from './conexao';
import path from 'node:path';

async function main() {
  const pool = criarPool(urlDirecta(), { max: 1, aplicacao: 'procuracoes-migrate' });
  await migrate(drizzle(pool), { migrationsFolder: path.join(__dirname, '../../drizzle') });
  await pool.end();
  console.log('Migrações aplicadas.');
}
main().catch((e) => { console.error(e); process.exit(1); });
