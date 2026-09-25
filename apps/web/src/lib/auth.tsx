'use client';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Utilizador, aoSessaoExpirar, login as apiLogin, logout as apiLogout, renovarSessao } from './api';

interface Ctx { utilizador: Utilizador | null; aCarregar: boolean; pode: (p: string) => boolean; entrar: (e: string, p: string) => Promise<void>; sair: () => Promise<void> }
const AuthCtx = createContext<Ctx>(null as unknown as Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [utilizador, setU] = useState<Utilizador | null>(null);
  const [aCarregar, setL] = useState(true);
  const router = useRouter();
  useEffect(() => {
    renovarSessao().then((s) => setU(s?.utilizador ?? null)).finally(() => setL(false));
    aoSessaoExpirar(() => { setU(null); router.replace('/login?expirada=1'); });
    // renovação proactiva antes de o token de 15 min expirar
    const t = setInterval(() => { renovarSessao().then((s) => { if (s) setU(s.utilizador); }); }, 12 * 60_000);
    return () => clearInterval(t);
  }, [router]);
  const entrar = useCallback(async (e: string, p: string) => { const s = await apiLogin(e, p); setU(s.utilizador); }, []);
  const sair = useCallback(async () => { await apiLogout(); setU(null); router.replace('/login'); }, [router]);
  const pode = useCallback((p: string) => !!utilizador?.permissoes.includes(p), [utilizador]);
  return <AuthCtx.Provider value={{ utilizador, aCarregar, pode, entrar, sair }}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);
