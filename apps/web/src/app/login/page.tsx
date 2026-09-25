'use client';
import { FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Selo } from '@/components/Icone';
import { mensagemErro } from '@/components/ui';

function Formulario() {
  const { entrar } = useAuth();
  const router = useRouter();
  const sp = useSearchParams();
  const [email, setE] = useState(''); const [pw, setP] = useState(''); const [erro, setErro] = useState(''); const [aEnviar, setA] = useState(false);
  async function enviar(ev: FormEvent) {
    ev.preventDefault(); setErro(''); setA(true);
    try { await entrar(email, pw); router.replace(sp.get('voltar') ?? '/'); } catch (e) { setErro(mensagemErro(e)); } finally { setA(false); }
  }
  return (
    <form onSubmit={enviar} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {sp.get('expirada') && <div className="aviso info">A sessão expirou. Entre novamente.</div>}
      {erro && <div className="aviso erro" role="alert">{erro}</div>}
      <label className="campo"><span>Email</span><input className="entrada" type="email" autoComplete="username" required value={email} onChange={(e) => setE(e.target.value)} /></label>
      <label className="campo"><span>Palavra-passe</span><input className="entrada" type="password" autoComplete="current-password" required value={pw} onChange={(e) => setP(e.target.value)} /></label>
      <button className="btn primario" disabled={aEnviar} style={{ height: 44 }}>{aEnviar ? 'A entrar…' : 'Entrar'}</button>
    </form>
  );
}

export default function Login() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(360px, 480px)' }}>
      <section style={{ background: 'var(--tinta)', color: '#E9E6DF', padding: '56px 64px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><Selo /><span style={{ fontFamily: 'var(--serif)', fontSize: 20 }}>Procurações</span></div>
        <div style={{ maxWidth: 520 }}>
          <p style={{ fontFamily: 'var(--doc)', fontSize: 15, lineHeight: 1.9, color: '#C9C4B8', margin: 0 }}>
            …constitui seu bastante procurador, a quem confere os poderes necessários para, em seu nome e representação, praticar os actos seguintes…
          </p>
          <p className="small" style={{ color: '#8E929A', marginTop: 16 }}>Catálogo de poderes aprovado, modelos versionados, emissão com número único e registo de auditoria.</p>
        </div>
        <span className="small" style={{ color: '#8E929A' }}>Consulado Geral · Porto</span>
      </section>
      <section style={{ padding: '56px 48px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 24, background: 'var(--folha)' }}>
        <h1>Entrar</h1>
        <Suspense><Formulario /></Suspense>
        <p className="small muted">Ambiente de demonstração: admin, operador, validador ou consulta @demo.local — palavra-passe Demo#Procuracoes2026</p>
      </section>
    </main>
  );
}
