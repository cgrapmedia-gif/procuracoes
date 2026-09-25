import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().url(),
  DATABASE_URL_DIRECT: z.string().url().optional(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET deve ter pelo menos 32 caracteres'),
  JWT_TTL_SECONDS: z.coerce.number().default(900),
  REFRESH_TTL_DAYS: z.coerce.number().default(7),
  DATA_ENC_KEY: z.string().refine((s) => Buffer.from(s, 'base64').length === 32, 'DATA_ENC_KEY: 32 bytes em base64'),
  DATA_BIDX_KEY: z.string().min(32),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  STORAGE_DRIVER: z.enum(['s3', 'local']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./.storage'),
  S3_ENDPOINT: z.string().optional(), S3_REGION: z.string().default('eu-west-1'), S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(), S3_SECRET_KEY: z.string().optional(),
  S3_SSE: z.enum(['AES256', 'aws:kms', 'none']).default('AES256'), // Cloudflare R2: 'none' (cifra sempre em repouso)
  S3_CONDITIONAL_WRITES: z.enum(['true', 'false']).default('true'),
  CHROMIUM_PATH: z.string().optional(),
  /** N.º de proxies à frente da API (ex.: Caddy + Next.js = 2). Determina o IP real usado no limite de pedidos e na auditoria. */
  /** Segredo partilhado com o frontend (proxy). Se definido, pedidos sem o cabeçalho x-proxy-secret são recusados. */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
  /** Segredo partilhado com o frontend (Vercel). Com ele definido, a API recusa pedidos que não venham pelo proxy do frontend. */
  PROXY_SECRET: z.string().min(32, 'PROXY_SECRET: mínimo 32 caracteres').optional(),
  SEGREGACAO_FUNCOES: z.enum(['true', 'false']).default('true'),
});
export type Config = z.infer<typeof Env>;

let cache: Config | undefined;
export function config(): Config {
  if (!cache) {
    const r = Env.safeParse(process.env);
    if (!r.success) throw new Error(`Configuração inválida:\n${r.error.issues.map((i) => ` - ${i.path.join('.')}: ${i.message}`).join('\n')}`);
    cache = r.data;
  }
  return cache;
}
