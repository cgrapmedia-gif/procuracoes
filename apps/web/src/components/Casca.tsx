'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FormEvent, ReactNode, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { iniciais } from '@/lib/formato';
import { Icone, Selo } from './Icone';

const NAV: { rotulo: string; href: string; icone: string; perm?: string; grupo?: string }[] = [
  { rotulo: 'Painel', href: '/', icone: 'painel' },
  { rotulo: 'Procurações', href: '/procuracoes', icone: 'doc', perm: 'poa.read' },
  { rotulo: 'Nova procuração', href: '/procuracoes/nova', icone: 'mais', perm: 'poa.create' },
  { rotulo: 'Pessoas', href: '/pessoas', icone: 'pessoas', perm: 'person.read' },
  { rotulo: 'Centro de Poderes', href: '/admin/poderes', icone: 'camadas', perm: 'power.manage', grupo: 'Administração' },
  { rotulo: 'Modelos documentais', href: '/admin/modelos', icone: 'modelo', perm: 'template.read' },
  { rotulo: 'Auditoria', href: '/admin/auditoria', icone: 'escudo', perm: 'audit.read' },
  { rotulo: 'Utilizadores', href: '/admin/utilizadores', icone: 'utilizadores', perm: 'user.manage' },
];

export function Casca({ migalhas, children }: { migalhas: string[]; children: ReactNode }) {
  const { utilizador, pode, sair } = useAuth();
  const path = usePathname();
  const router = useRouter();
  const [q, setQ] = useState('');
  const activo = (h: string) => (h === '/' ? path === '/' : h === '/procuracoes' ? path === '/procuracoes' || (/^\/procuracoes\/(?!nova)/.test(path)) : path.startsWith(h));
  const visiveis = NAV.filter((n) => !n.perm || pode(n.perm));
  let grupoMostrado = false;
  function pesquisar(e: FormEvent) { e.preventDefault(); if (q.trim()) router.push(`/procuracoes?q=${encodeURIComponent(q.trim())}`); }
  return (
    <div className="app">
      <nav className="side" aria-label="Navegação principal">
        <div className="marca"><Selo /><div><b>Procurações</b><span>Consulado Geral · Porto</span></div></div>
        {visiveis.map((n) => {
          const g = n.grupo && !grupoMostrado ? (grupoMostrado = true, <div className="grupo" key={`g-${n.grupo}`}>{n.grupo}</div>) : null;
          return [g, <Link key={n.href} href={n.href} aria-current={activo(n.href) ? 'page' : undefined}><Icone n={n.icone} /><span>{n.rotulo}</span></Link>];
        })}
        <div className="fundo">
          <Link href="/conta" className="avatar" aria-label="A minha conta" title="A minha conta" style={{ padding: 0, height: 34, justifyContent: 'center' }}>{iniciais(utilizador?.nome ?? '?')}</Link>
          <div style={{ minWidth: 0 }}><div style={{ fontSize: 13, color: '#EDEBE6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{utilizador?.nome}</div><div style={{ fontSize: 11.5 }}>{utilizador?.perfis.join(', ').toLowerCase()}</div></div>
          <button onClick={sair} aria-label="Terminar sessão" title="Terminar sessão"><Icone n="sair" t={17} /></button>
        </div>
      </nav>
      <div className="main">
        <header className="topo">
          <div className="migalhas">{migalhas.map((m, i) => (i === migalhas.length - 1 ? <b key={i}>{m}</b> : <span key={i}>{m} <span aria-hidden="true">/</span></span>))}</div>
          <form className="pesquisa" role="search" onSubmit={pesquisar}>
            <Icone n="pesquisa" t={16} /><label className="sr" htmlFor="pg">Pesquisa global</label>
            <input id="pg" type="search" placeholder="Número, nome, NIF ou n.º de documento" value={q} onChange={(e) => setQ(e.target.value)} />
          </form>
        </header>
        {children}
      </div>
    </div>
  );
}
