import { execSync } from 'node:child_process';
import { Client } from 'pg';

/**
 * BD de teste recriada, migrada e com seed DEMO a cada execução.
 *  - TEST_DATABASE_URL definido (ex.: branch "test" no Neon): limpa os schemas dessa base.
 *  - caso contrário (PostgreSQL local): DROP/CREATE da base procuracoes_test.
 * NUNCA aponte TEST_DATABASE_URL para a base de produção: é apagada.
 */
export function urlTeste(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const u = new URL(process.env.DATABASE_URL ?? 'postgres://proc:proc@localhost:5432/procuracoes');
  u.pathname = '/procuracoes_test';
  return u.toString();
}

export default async function () {
  const url = urlTeste();
  if (process.env.TEST_DATABASE_URL) {
    if (/prod/i.test(url)) throw new Error('Recusado: TEST_DATABASE_URL parece apontar para produção.');
    const { criarPool } = await import('../src/db/conexao');
    const pool = criarPool(url, { max: 1 });
    await pool.query('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await pool.end();
  } else {
    const admin = new Client({ connectionString: process.env.DATABASE_URL ?? 'postgres://proc:proc@localhost:5432/procuracoes' });
    await admin.connect();
    await admin.query('DROP DATABASE IF EXISTS procuracoes_test WITH (FORCE)');
    await admin.query('CREATE DATABASE procuracoes_test');
    await admin.end();
  }
  const env = { ...process.env, DATABASE_URL: url, DATABASE_URL_DIRECT: url };
  execSync('npx tsx src/db/migrate.ts', { env, stdio: 'inherit' });
  execSync('npx tsx src/db/seed/seed.ts', { env, stdio: 'inherit' });
}
