import { Pool, PoolConfig } from 'pg';

/**
 * Cria o pool de ligações a partir de um URL PostgreSQL.
 * Compatível com Neon (serverless): SSL com verificação de certificado, tempos de ligação
 * tolerantes ao "arranque a frio" do compute e pool pequeno (o pooler do Neon faz o resto).
 *
 * Os parâmetros sslmode/channel_binding do URL copiado da consola Neon são convertidos em opções explícitas
 * do node-postgres (evita avisos e ambiguidades de interpretação do sslmode).
 */
export function criarPool(url: string, opcoes: { max?: number; aplicacao?: string } = {}): Pool {
  const u = new URL(url);
  const sslmode = u.searchParams.get('sslmode');
  const channelBinding = u.searchParams.get('channel_binding');
  u.searchParams.delete('sslmode');
  u.searchParams.delete('channel_binding');
  const neon = u.hostname.endsWith('.neon.tech');
  const usarSsl = neon || (sslmode !== null && sslmode !== 'disable');
  const cfg: PoolConfig & { enableChannelBinding?: boolean } = {
    connectionString: u.toString(),
    max: opcoes.max ?? Number(process.env.DB_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS ?? 15_000), // compute Neon suspenso demora ~0,5–3 s a acordar
    keepAlive: true,
    application_name: opcoes.aplicacao ?? 'procuracoes-api',
    ssl: usarSsl ? { rejectUnauthorized: sslmode !== 'no-verify' } : undefined,
  };
  if (channelBinding === 'require') cfg.enableChannelBinding = true;
  const pool = new Pool(cfg);
  // Uma ligação cortada pelo servidor (ex.: compute suspenso) não deve derrubar o processo.
  pool.on('error', (e) => console.error('[db] ligação inactiva terminada:', e.message));
  return pool;
}

/** URL para migrações e operações administrativas: a ligação DIRECTA (sem pooler), se configurada. */
export const urlDirecta = () => process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL!;
