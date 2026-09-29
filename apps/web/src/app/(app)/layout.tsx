'use client';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Giro } from '@/components/ui';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { utilizador, aCarregar } = useAuth();
  const router = useRouter();
  const path = usePathname();
  useEffect(() => { if (!aCarregar && !utilizador) router.replace(`/login?voltar=${encodeURIComponent(path)}`); }, [aCarregar, utilizador, router, path]);
  // Palavra-passe temporária: tem de ser alterada antes de usar a aplicação
  useEffect(() => { if (utilizador?.trocarPassword && path !== '/conta') router.replace('/conta?temporaria=1'); }, [utilizador, path, router]);
  if (aCarregar || !utilizador || (utilizador.trocarPassword && path !== '/conta')) return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><Giro rotulo="A verificar a sessão" /></div>;
  return <>{children}</>;
}
