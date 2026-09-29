/**
 * Cliente HTTP. O access token vive APENAS em memória (nunca localStorage);
 * a sessão é renovada pelo cookie httpOnly do refresh token (rotação no servidor).
 */
export class ApiError extends Error {
  constructor(public status: number, message: string, public body: Record<string, unknown> = {}) { super(message); }
  get erros(): string[] {
    const e = this.body.erros as unknown;
    if (!Array.isArray(e)) return [];
    return e.map((x) => (typeof x === 'string' ? x : `${(x as { campo?: string }).campo ? `${(x as { campo: string }).campo}: ` : ''}${(x as { mensagem?: string }).mensagem ?? JSON.stringify(x)}`));
  }
}

let accessToken: string | null = null;
let aRenovar: Promise<boolean> | null = null;
let aoExpirar: (() => void) | null = null;

export const definirToken = (t: string | null) => { accessToken = t; };
export const aoSessaoExpirar = (fn: () => void) => { aoExpirar = fn; };

export interface Sessao { accessToken: string; expiresIn: number; utilizador: Utilizador }
export interface Utilizador { id: string; nome: string; email: string; permissoes: string[]; perfis: string[]; trocarPassword?: boolean }

export async function renovarSessao(): Promise<Sessao | null> {
  const r = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'same-origin', headers: { 'X-Requested-With': 'procuracoes' } });
  if (!r.ok) return null;
  const s = (await r.json()) as Sessao;
  accessToken = s.accessToken;
  return s;
}

async function renovarUmaVez(): Promise<boolean> {
  aRenovar ??= renovarSessao().then((s) => !!s).finally(() => { setTimeout(() => { aRenovar = null; }, 0); });
  return aRenovar;
}

type Opcoes = { method?: string; body?: unknown; form?: FormData; bruto?: boolean; semRenovar?: boolean };

export async function api<T = unknown>(caminho: string, o: Opcoes = {}): Promise<T> {
  const headers: Record<string, string> = { 'X-Requested-With': 'procuracoes' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let body: BodyInit | undefined;
  if (o.form) body = o.form;
  else if (o.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(o.body); }
  const r = await fetch(`/api/v1${caminho}`, { method: o.method ?? (body ? 'POST' : 'GET'), headers, body, credentials: 'same-origin' });
  if (r.status === 401 && !o.semRenovar && !caminho.startsWith('/auth/')) {
    if (await renovarUmaVez()) return api<T>(caminho, { ...o, semRenovar: true });
    aoExpirar?.();
  }
  if (!r.ok) {
    let b: Record<string, unknown> = {};
    try { b = await r.json(); } catch { /* sem corpo */ }
    throw new ApiError(r.status, (b.message as string) ?? `Erro ${r.status}`, b);
  }
  if (o.bruto) return (await r.blob()) as T;
  if (r.status === 204) return undefined as T;
  const ct = r.headers.get('content-type') ?? '';
  return (ct.includes('json') ? r.json() : r.text()) as Promise<T>;
}

/** Descarrega um ficheiro autenticado e entrega-o ao browser sem URL pública. */
export async function descarregar(caminho: string, nome: string, abrir = false) {
  const blob = await api<Blob>(caminho, { bruto: true });
  const url = URL.createObjectURL(blob);
  if (abrir) window.open(url, '_blank', 'noopener');
  else { const a = document.createElement('a'); a.href = url; a.download = nome; a.click(); }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function login(email: string, password: string): Promise<Sessao> {
  const s = await api<Sessao>('/auth/login', { body: { email, password } });
  accessToken = s.accessToken;
  return s;
}
export async function logout() { try { await api('/auth/logout', { method: 'POST' }); } finally { accessToken = null; } }
