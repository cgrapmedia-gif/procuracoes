'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { dataHoraPT } from '@/lib/formato';
import { Casca } from '@/components/Casca';
import { Icone } from '@/components/Icone';
import { Campo, Gaveta, Giro, mensagemErro, useToast } from '@/components/ui';

interface U { id: string; email: string; nome: string; activo: boolean; ultimoLogin: string | null; perfis: string[] }
interface Perfil { id: string; code: string; name: string; permissoes: string[] }

export default function Utilizadores() {
  const qc = useQueryClient(); const toast = useToast();
  const us = useQuery({ queryKey: ['users'], queryFn: () => api<U[]>('/admin/users') });
  const perfis = useQuery({ queryKey: ['roles'], queryFn: () => api<Perfil[]>('/admin/roles') });
  const [g, setG] = useState(false); const [f, setF] = useState({ nome: '', email: '', password: '', perfis: ['OPERADOR'] }); const [erro, setErro] = useState('');
  async function criar() { setErro(''); try { await api('/admin/users', { body: f }); setG(false); qc.invalidateQueries({ queryKey: ['users'] }); toast('Utilizador criado.'); } catch (e) { setErro(mensagemErro(e)); } }
  const [reset, setReset] = useState<{ u: U | null; pw: string }>({ u: null, pw: '' });
  async function redefinir() { if (!reset.u) return; try { await api(`/admin/users/${reset.u.id}`, { method: 'PUT', body: { novaPassword: reset.pw } }); toast('Palavra-passe redefinida. Comunique-a ao utilizador por canal seguro e peça-lhe que a altere.'); setReset({ u: null, pw: '' }); } catch (e) { toast(mensagemErro(e), true); } }
  async function alternar(u: U) { try { await api(`/admin/users/${u.id}`, { method: 'PUT', body: { activo: !u.activo } }); qc.invalidateQueries({ queryKey: ['users'] }); } catch (e) { toast(mensagemErro(e), true); } }
  return (
    <Casca migalhas={['Administração', 'Utilizadores']}>
      <main className="conteudo">
        <div className="cabecalho"><div><h1>Utilizadores e perfis</h1><span className="muted">Desactivar um utilizador termina todas as suas sessões.</span></div><button className="btn primario" onClick={() => setG(true)}><Icone n="mais" t={16} />Novo utilizador</button></div>
        <section className="cartao" style={{ overflow: 'hidden' }}>
          {us.isLoading ? <div style={{ padding: 16 }}><Giro /></div> : (
            <table className="tabela"><thead><tr><th>Nome</th><th>Email</th><th>Perfis</th><th>Último acesso</th><th /></tr></thead>
              <tbody>{us.data?.map((u) => <tr key={u.id}><td style={{ fontWeight: 500 }}>{u.nome}{!u.activo && <span className="small" style={{ color: 'var(--carmim)' }}> inactivo</span>}</td><td className="muted">{u.email}</td><td>{u.perfis.map((p) => perfis.data?.find((x) => x.code === p)?.name ?? p).join(', ')}</td><td className="muted">{dataHoraPT(u.ultimoLogin)}</td><td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><button className="btn pequeno fantasma" onClick={() => setReset({ u, pw: '' })}>Redefinir palavra-passe</button> <button className="btn pequeno" onClick={() => alternar(u)}>{u.activo ? 'Desactivar' : 'Activar'}</button></td></tr>)}</tbody></table>
          )}
        </section>
        <section className="cartao"><div className="corpo"><h2>Perfis</h2>
          {perfis.data?.map((p) => <div key={p.id} style={{ borderTop: '1px solid var(--linha)', paddingTop: 10 }}><b style={{ fontWeight: 600 }}>{p.name}</b><div className="small muted">{p.permissoes.join(', ')}</div></div>)}
        </div></section>
        <Gaveta titulo={`Redefinir palavra-passe${reset.u ? ` de ${reset.u.nome}` : ''}`} aberta={!!reset.u} fechar={() => setReset({ u: null, pw: '' })} rodape={<><button className="btn fantasma" onClick={() => setReset({ u: null, pw: '' })}>Cancelar</button><button className="btn primario" onClick={redefinir}>Redefinir</button></>}>
          <p style={{ margin: 0 }}>Termina todas as sessões do utilizador e desbloqueia a conta.</p>
          <Campo rotulo="Nova palavra-passe temporária" obrigatorio ajuda="Mínimo 12 caracteres, com maiúscula, minúscula e dígito."><input className="entrada" type="password" autoComplete="new-password" value={reset.pw} onChange={(e) => setReset({ ...reset, pw: e.target.value })} /></Campo>
        </Gaveta>
        <Gaveta titulo="Novo utilizador" aberta={g} fechar={() => setG(false)} rodape={<><button className="btn fantasma" onClick={() => setG(false)}>Cancelar</button><button className="btn primario" onClick={criar}>Criar utilizador</button></>}>
          {erro && <div className="aviso erro">{erro}</div>}
          <Campo rotulo="Nome" obrigatorio><input className="entrada" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Campo>
          <Campo rotulo="Email" obrigatorio><input className="entrada" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Campo>
          <Campo rotulo="Palavra-passe inicial" obrigatorio ajuda="Mínimo 12 caracteres, com maiúscula, minúscula e dígito."><input className="entrada" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Campo>
          <fieldset style={{ border: 0, padding: 0 }}><legend style={{ fontWeight: 500, fontSize: 13, marginBottom: 6 }}>Perfis</legend>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{perfis.data?.map((p) => { const on = f.perfis.includes(p.code); return <button key={p.code} type="button" className="pilula" aria-pressed={on} onClick={() => setF({ ...f, perfis: on ? f.perfis.filter((x) => x !== p.code) : [...f.perfis, p.code] })}>{p.name}</button>; })}</div></fieldset>
        </Gaveta>
      </main>
    </Casca>
  );
}
