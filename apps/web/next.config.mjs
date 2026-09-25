/** @type {import('next').NextConfig} */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''),
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  "frame-src 'self' blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join('; ');

export default {
  reactStrictMode: true,
  // Na Vercel o build é gerido pela plataforma; fora dela (Docker) usa-se o servidor standalone.
  output: process.env.VERCEL ? undefined : 'standalone',
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
  poweredByHeader: false,
  transpilePackages: ['@proc/core'],
  // Handlebars: usar o build CommonJS (compilador incluído) em vez do index com hooks de Node.
  webpack(config) { config.resolve.alias = { ...config.resolve.alias, handlebars$: 'handlebars/dist/cjs/handlebars.js' }; return config; },
  // O reencaminhamento de /api/v1 para a API é feito em src/middleware.ts (em tempo de execução, com o segredo do proxy).
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'Content-Security-Policy', value: csp },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ] }];
  },
};
