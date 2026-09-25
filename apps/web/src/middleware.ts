import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy de /api/v1/* para a API (Render ou outra), na mesma origem do frontend:
 *  - o cookie de sessão (SameSite=Strict, Path=/api/v1/auth) funciona sem CORS;
 *  - acrescenta o segredo partilhado PROXY_SECRET, que a API exige — o URL público da API não é usável directamente;
 *  - lido em tempo de execução: mudar API_URL/PROXY_SECRET não obriga a novo build.
 */
export function middleware(req: NextRequest) {
  const api = process.env.API_URL ?? 'http://localhost:3001';
  const destino = new URL(`${req.nextUrl.pathname}${req.nextUrl.search}`, api);
  const headers = new Headers(req.headers);
  headers.delete('x-proxy-secret'); // nunca aceitar um valor vindo do browser
  if (process.env.PROXY_SECRET) headers.set('x-proxy-secret', process.env.PROXY_SECRET);
  return NextResponse.rewrite(destino, { request: { headers } });
}

export const config = { matcher: '/api/v1/:path*' };
