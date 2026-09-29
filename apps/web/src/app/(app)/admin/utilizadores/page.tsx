'use client';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dataHoraPT } from '@/lib/formato';
import { Casca } from '@/components/Casca';
import { Icone } from '@/components/Icone';
import { Campo, Gaveta, Giro, Modal, mensagemErro, useToast } from '@/components/ui';

interface U { id: string; email: string; nome: string; activo: boolean; ultimoLogin: string | null; perfis: string[]; trocarPassword: boolean; bloqueadoAte: string | null }
interface Perfil { id: string; code: string; name: string; permissoes: string[] }

const DESCRICAO: Record<string, string> = {
  ADMINISTRADOR: 'Tudo: utilizadores, modelos, catálogo, auditoria, manutenção.',
  EMISSOR: 'Faz a procuração completa e emite, sem revisão por outro utilizador.',
  OPERADOR: 'Prepara procurações e submete-as para validação.',
  VALIDADOR: 'Revê, valida, emite, cancela e arquiva.',
  CONSULTA: 'Só consulta e descarrega documentos.',
};
const REGRAS: [string, (p: string) => boolean][] = [
  ['12 ou mais caracteres', (p) => p.length >= 12], ['uma letra minúscula', (p) => /[a-z]/.test(p)], ['uma letra maiúscula', (p) => /[A-Z]/.test(p)], ['um número', (p) => /\d/.test(p)],
];
const passwordValida = (p: string) => REGRAS.every(([, t]) => t(p));
const emailValido = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());

/** Palavra-passe temporária forte e legível (sem caracteres ambíguos). */
function gerarPassword(): string {
  const conj = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789'];
  const todos = conj.join('');
  const a = new Uint32Array(14); crypto.getRandomValues(a);
  const c = Array.from(a, (x, i) => (i < 3 ? conj[i] : todos)[x % (i < 3 ? conj[i].length : todos.length)]);
  for (let i = c.length - 1; i > 0; i--) { const j = a[i] % (i + 1); [c[i], c[j]] = [c[j], c[i]]; }
  return `${c.slice(0, 7).join('')}-${c.slice(7).join('')}`;
}

function RegrasPassword({ p }: { p: string }) {
  return <ul className="small" style={{ margin: '4px 0 0', padding: 0, listStyle: 'none', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
    {REGRAS.map(([r, t]) => <li key={r} style={{ color: t(p) ? 'var(--verde)' : 'var(--mudo)', display: 'flex', gap: 4, alignItems: 'center' }}><Icone n={t(p) ? 'certo' : 'x'} t={12} />{r}</li>)}
  </ul>;
}

function CampoPassword({ valor, mudar, rotulo }: { valor: string; mudar: (v: string) => void; rotulo: string }) {
  const [ver, setVer] = useState(false); const toast = useToast();
  return (
    <Campo rotulo={rotulo} obrigatorio>
      <div style={{ display: 'flex', gap: 6 }}>
        <input className="entrada mono" style={{ flex: 1 }} type={ver ? 'text' : 'password'} autoComplete="new-password" value={valor} onChange={(e) => mudar(e.target.value)} />
        <button type="button" className="btn" onClick={() => setVer(!ver)} aria-label={ver ? 'Esconder' : 'Mostrar'}><Icone n="olho" t={15} /></button>
        <button type="button" className="btn" onClick={() => { const p = gerarPassword(); mudar(p); setVer(true); }}>Gerar</button>
        {valor && <button type="button" className="btn" aria-label="Copiar" onClick={() => navigator.clipboard?.writeText(valor).then(() => toast('Copiada.'))}><Icone n="copiar" t={15} /></button>}
      </div>
      <RegrasPassword p={valor} />
      <span className="small muted">É temporária: o utilizador tem de a alterar no primeiro acesso. Comunique-a por canal seguro (pessoalmente ou por telefone).</span>
    </Campo>
  );
}

function EscolhaPerfis({ perfis, valor, mudar }: { perfis: Perfil[]; valor: string[]; mudar: (v: string[]) => void }) {
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <legend style={{ fontWeight: 500, fontSize: 13, marginBottom: 6 }}>Perfis <span style={{ color: 'var(--carmim)' }}>*</span></legend>
      {perfis.map((p) => {
        const on = valor.includes(p.code);
        return (
          <label key={p.code} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 10px', border: `1px solid ${on ? 'var(--tinta)' : 'var(--linha)'}`, borderRadius: 8, cursor: 'pointer', background: on ? 'var(--realce)' : undefined }}>
            <input type="checkbox" checked={on} onChange={() => mudar(on ? valor.filter((x) => x !== p.code) : [...valor, p.code])} style={{ marginTop: 3 }} />
            <span><b style={{ fontWeight: 600 }}>{p.name}</b><br /><span className="small muted">{DESCRICAO[p.code] ?? `${p.permissoes.length} permissões`}</span></span>
          </label>
        );
      })}
    </fieldset>
  );
}

/** Erros de validação do servidor, por campo (ex.: { email: 'email inválido' }). */
function errosPorCampo(e: unknown): Record<string, string> {
  const corpo = e instanceof ApiError ? (e.body as { erros?: { campo: string; mensagem: string }[] }) : undefined;
  return Array.isArray(corpo?.erros) ? Object.fromEntries(corpo.erros.map((x) => [x.campo, x.mensagem])) : {};
}

export default function Utilizadores() {
  const qc = useQueryClient(); const toast = useToast(); const { utilizador } = useAuth();
  const us = useQuery({ queryKey: ['users'], queryFn: () => api<U[]>('/admin/users') });
  const perfis = useQuery({ queryKey: ['roles'], queryFn: () => api<Perfil[]>('/admin/roles') });
  const [filtro, setFiltro] = useState('');
  const lista = useMemo(() => (us.data ?? []).filter((u) => !filtro || `${u.nome} ${u.email}`.toLowerCase().includes(filtro.toLowerCase())), [us.data, filtro]);

  // Criar
  const VAZIO = { nome: '', email: '', password: '', perfis: ['OPERADOR'] };
  const [novo, setNovo] = useState<{ aberta: boolean; f: typeof VAZIO; erros: Record<string, string>; geral: string; a: boolean }>({ aberta: false, f: VAZIO, erros: {}, geral: '', a: false });
  const nf = novo.f;
  const novoValido = nf.nome.trim().length >= 3 && emailValido(nf.email) && passwordValida(nf.password) && nf.perfis.length > 0;
  async function criar() {
    setNovo((x) => ({ ...x, a: true, erros: {}, geral: '' }));
    try {
      await api('/admin/users', { body: { ...nf, nome: nf.nome.trim(), email: nf.email.trim() } });
      qc.invalidateQueries({ queryKey: ['users'] });
      toast(`Utilizador ${nf.nome.trim()} criado. Comunique-lhe a palavra-passe temporária.`);
      setNovo({ aberta: false, f: VAZIO, erros: {}, geral: '', a: false });
    } catch (e) { setNovo((x) => ({ ...x, a: false, erros: errosPorCampo(e), geral: mensagemErro(e) })); }
  }

  // Editar
  const [ed, setEd] = useState<{ u: U | null; nome: string; perfis: string[]; erro: string }>({ u: null, nome: '', perfis: [], erro: '' });
  async function gravarEdicao() {
    if (!ed.u) return;
    try { await api(`/admin/users/${ed.u.id}`, { method: 'PUT', body: { nome: ed.nome.trim(), perfis: ed.perfis } }); qc.invalidateQueries({ queryKey: ['users'] }); toast('Utilizador actualizado. As permissões novas valem a partir do próximo acesso.'); setEd({ u: null, nome: '', perfis: [], erro: '' }); }
    catch (e) { setEd((x) => ({ ...x, erro: mensagemErro(e) })); }
  }

  // Redefinir palavra-passe
  const [reset, setReset] = useState<{ u: U | null; pw: string }>({ u: null, pw: '' });
  async function redefinir() {
    if (!reset.u) return;
    try { await api(`/admin/users/${reset.u.id}`, { method: 'PUT', body: { novaPassword: reset.pw } }); qc.invalidateQueries({ queryKey: ['users'] }); toast('Palavra-passe redefinida. A conta foi desbloqueada e o utilizador terá de a alterar no próximo acesso.'); setReset({ u: null, pw: '' }); }
    catch (e) { toast(mensagemErro(e), true); }
  }

  // Activar / desactivar (com confirmação)
  const [conf, setConf] = useState<U | null>(null);
  async function alternar(u: U) {
    try { await api(`/admin/users/${u.id}`, { method: 'PUT', body: { activo: !u.activo } }); qc.invalidateQueries({ queryKey: ['users'] }); toast(u.activo ? `${u.nome} desactivado; as sessões foram terminadas.` : `${u.nome} activado.`); }
    catch (e) { toast(mensagemErro(e), true); } finally { setConf(null); }
  }
  const nomePerfil = (c: string) => perfis.data?.find((x) => x.code === c)?.name ?? c;
  const bloqueado = (u: U) => !!u.bloqueadoAte && new Date(u.bloqueadoAte) > new Date();

  return (
    <Casca migalhas={['Administração', 'Utilizadores']}>
      <main className="conteudo">
        <div className="cabecalho">
          <div><h1>Utilizadores e perfis</h1><span className="muted">Contas nominais, uma por pessoa. As palavras-passe definidas aqui são temporárias.</span></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <label className="pesquisa" style={{ margin: 0 }}><Icone n="pesquisa" t={16} /><span className="sr">Filtrar</span><input type="search" placeholder="Filtrar por nome ou email" value={filtro} onChange={(e) => setFiltro(e.target.value)} /></label>
            <button className="btn primario" onClick={() => setNovo({ aberta: true, f: { ...VAZIO, password: gerarPassword() }, erros: {}, geral: '', a: false })}><Icone n="mais" t={16} />Novo utilizador</button>
          </div>
        </div>
        <section className="cartao" style={{ overflow: 'hidden' }}>
          {us.isLoading ? <div style={{ padding: 16 }}><Giro /></div> : (
            <table className="tabela"><thead><tr><th>Nome</th><th>Email</th><th>Perfis</th><th>Estado</th><th>Último acesso</th><th /></tr></thead>
              <tbody>{lista.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 500 }}>{u.nome}{u.id === utilizador?.id && <span className="small muted"> (você)</span>}</td>
                  <td className="muted">{u.email}</td>
                  <td>{u.perfis.map(nomePerfil).join(', ')}</td>
                  <td>{!u.activo ? <span className="estado CANCELADA">Inactivo</span> : bloqueado(u) ? <span className="estado EM_REVISAO">Bloqueado</span> : u.trocarPassword ? <span className="estado RASCUNHO">Palavra-passe temporária</span> : <span className="estado EMITIDA">Activo</span>}</td>
                  <td className="muted">{u.ultimoLogin ? dataHoraPT(u.ultimoLogin) : 'nunca'}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn pequeno fantasma" onClick={() => setEd({ u, nome: u.nome, perfis: u.perfis, erro: '' })}>Editar</button>{' '}
                    <button className="btn pequeno fantasma" onClick={() => setReset({ u, pw: gerarPassword() })}>{bloqueado(u) ? 'Desbloquear' : 'Redefinir palavra-passe'}</button>{' '}
                    {u.id !== utilizador?.id && <button className="btn pequeno" onClick={() => setConf(u)}>{u.activo ? 'Desactivar' : 'Activar'}</button>}
                  </td>
                </tr>
              ))}
              {!lista.length && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 24 }}>Nenhum utilizador{filtro ? ` com «${filtro}»` : ''}.</td></tr>}</tbody></table>
          )}
        </section>

        <Gaveta titulo="Novo utilizador" aberta={novo.aberta} fechar={() => setNovo((x) => ({ ...x, aberta: false }))}
          rodape={<><button className="btn fantasma" onClick={() => setNovo((x) => ({ ...x, aberta: false }))}>Cancelar</button><button className="btn primario" disabled={!novoValido || novo.a} onClick={criar}>{novo.a ? 'A criar…' : 'Criar utilizador'}</button></>}>
          {novo.geral && <div className="aviso erro" role="alert">{novo.geral}</div>}
          <Campo rotulo="Nome completo" obrigatorio erro={novo.erros.nome ?? (nf.nome && nf.nome.trim().length < 3 ? 'Mínimo 3 caracteres.' : undefined)}>
            <input className="entrada" value={nf.nome} onChange={(e) => setNovo((x) => ({ ...x, f: { ...x.f, nome: e.target.value } }))} autoComplete="off" />
          </Campo>
          <Campo rotulo="Email (é o nome de utilizador)" obrigatorio erro={novo.erros.email ?? (nf.email && !emailValido(nf.email) ? 'Email inválido.' : undefined)}>
            <input className="entrada" type="email" value={nf.email} onChange={(e) => setNovo((x) => ({ ...x, f: { ...x.f, email: e.target.value } }))} autoComplete="off" />
          </Campo>
          <CampoPassword rotulo="Palavra-passe temporária" valor={nf.password} mudar={(v) => setNovo((x) => ({ ...x, f: { ...x.f, password: v } }))} />
          {perfis.data && <EscolhaPerfis perfis={perfis.data} valor={nf.perfis} mudar={(v) => setNovo((x) => ({ ...x, f: { ...x.f, perfis: v } }))} />}
        </Gaveta>

        <Gaveta titulo={`Editar ${ed.u?.nome ?? ''}`} aberta={!!ed.u} fechar={() => setEd({ u: null, nome: '', perfis: [], erro: '' })}
          rodape={<><button className="btn fantasma" onClick={() => setEd({ u: null, nome: '', perfis: [], erro: '' })}>Cancelar</button><button className="btn primario" disabled={ed.nome.trim().length < 3 || !ed.perfis.length} onClick={gravarEdicao}>Guardar</button></>}>
          {ed.erro && <div className="aviso erro" role="alert">{ed.erro}</div>}
          <Campo rotulo="Nome completo" obrigatorio><input className="entrada" value={ed.nome} onChange={(e) => setEd((x) => ({ ...x, nome: e.target.value }))} /></Campo>
          <Campo rotulo="Email"><input className="entrada" value={ed.u?.email ?? ''} disabled /></Campo>
          {perfis.data && <EscolhaPerfis perfis={perfis.data} valor={ed.perfis} mudar={(v) => setEd((x) => ({ ...x, perfis: v }))} />}
        </Gaveta>

        <Gaveta titulo={`Redefinir palavra-passe${reset.u ? ` de ${reset.u.nome}` : ''}`} aberta={!!reset.u} fechar={() => setReset({ u: null, pw: '' })}
          rodape={<><button className="btn fantasma" onClick={() => setReset({ u: null, pw: '' })}>Cancelar</button><button className="btn primario" disabled={!passwordValida(reset.pw)} onClick={redefinir}>Redefinir</button></>}>
          <p style={{ margin: 0 }}>Termina todas as sessões do utilizador e desbloqueia a conta. No próximo acesso terá de definir uma palavra-passe pessoal.</p>
          <CampoPassword rotulo="Nova palavra-passe temporária" valor={reset.pw} mudar={(v) => setReset((x) => ({ ...x, pw: v }))} />
        </Gaveta>

        <Modal titulo={conf?.activo ? `Desactivar ${conf?.nome}?` : `Activar ${conf?.nome}?`} aberta={!!conf} fechar={() => setConf(null)}
          rodape={<><button className="btn fantasma" onClick={() => setConf(null)}>Cancelar</button><button className={`btn ${conf?.activo ? 'perigo' : 'primario'}`} onClick={() => conf && alternar(conf)}>{conf?.activo ? 'Desactivar' : 'Activar'}</button></>}>
          <p style={{ margin: 0 }}>{conf?.activo ? 'A pessoa deixa de conseguir entrar e as sessões abertas terminam de imediato. O histórico e a auditoria mantêm o nome.' : 'A pessoa volta a poder entrar com a palavra-passe actual.'}</p>
        </Modal>

        <section className="cartao"><div className="corpo"><h2>Perfis e permissões</h2>
          {perfis.data?.map((p) => <details key={p.id} style={{ borderTop: '1px solid var(--linha)', paddingTop: 10 }}><summary style={{ cursor: 'pointer' }}><b style={{ fontWeight: 600 }}>{p.name}</b> <span className="small muted">— {DESCRICAO[p.code] ?? ''}</span></summary><div className="small muted" style={{ marginTop: 6 }}>{p.permissoes.join(', ')}</div></details>)}
        </div></section>
      </main>
    </Casca>
  );
}
