'use client';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api, descarregar } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dataPT } from '@/lib/formato';
import { ESTADOS, Estado } from '@/lib/tipos';
import { Casca } from '@/components/Casca';
import { Icone } from '@/components/Icone';
import { EstadoBadge, Giro, Vazio, mensagemErro, useToast } from '@/components/ui';

interface Linha { id: string; numero: string | null; estado: Estado; dataActo: string; tipo: string; tipoCodigo: string; outorgantes: string | null; procuradores: string | null; demo: boolean }
const POR_PAGINA = 20;

function Conteudo() {
  const sp = useSearchParams(); const router = useRouter(); const { pode } = useAuth(); const toast = useToast();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const estado = sp.get('estado') ?? ''; const tipo = sp.get('tipo') ?? ''; const de = sp.get('de') ?? ''; const ate = sp.get('ate') ?? ''; const pagina = Number(sp.get('pagina') ?? 1);
  useEffect(() => { setQ(sp.get('q') ?? ''); }, [sp]);
  const params = new URLSearchParams({ limite: String(POR_PAGINA), pagina: String(pagina), ...(sp.get('q') ? { q: sp.get('q')! } : {}), ...(estado ? { estado } : {}), ...(tipo ? { tipo } : {}), ...(de ? { de } : {}), ...(ate ? { ate } : {}) });
  const lista = useQuery({ queryKey: ['poas', params.toString()], queryFn: () => api<{ total: number; itens: Linha[] }>(`/poas?${params}`) });
  const tipos = useQuery({ queryKey: ['poa-types'], queryFn: () => api<{ codigo: string; nome: string }[]>('/poa-types') });
  const mudar = (k: string, v: string) => { const n = new URLSearchParams(sp.toString()); if (v) n.set(k, v); else n.delete(k); if (k !== 'pagina') n.delete('pagina'); router.replace(`/procuracoes?${n}`); };
  const total = lista.data?.total ?? 0;
  async function exportar(formato: 'csv' | 'xlsx') { try { await descarregar(`/exports/poas?formato=${formato}${de ? `&de=${de}` : ''}${ate ? `&ate=${ate}` : ''}`, `procuracoes.${formato}`); } catch (e) { toast(mensagemErro(e), true); } }
  return (
    <main className="conteudo">
      <div className="cabecalho">
        <div><h1>Procurações</h1><span className="muted">{lista.data ? `${total} ${total === 1 ? 'resultado' : 'resultados'}` : ' '}</span></div>
        {pode('export.run') && <><button className="btn" onClick={() => exportar('xlsx')}><Icone n="descarregar" t={16} />Excel</button><button className="btn" onClick={() => exportar('csv')}>CSV</button></>}
        {pode('poa.create') && <Link className="btn primario" href="/procuracoes/nova"><Icone n="mais" t={16} />Nova procuração</Link>}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} role="group" aria-label="Filtrar por estado">
        <button className="pilula" aria-pressed={!estado} onClick={() => mudar('estado', '')}>Todas</button>
        {(Object.keys(ESTADOS) as Estado[]).map((e) => <button key={e} className="pilula" aria-pressed={estado === e} onClick={() => mudar('estado', e)}>{ESTADOS[e]}</button>)}
      </div>
      <section className="cartao" style={{ overflow: 'hidden' }}>
        <form style={{ display: 'flex', gap: 12, padding: 16, alignItems: 'flex-end', flexWrap: 'wrap' }} onSubmit={(e) => { e.preventDefault(); mudar('q', q.trim()); }}>
          <label className="campo" style={{ flex: '1 1 260px' }}><span>Pesquisar</span><input className="entrada" type="search" placeholder="Número, nome, NIF ou n.º de documento" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <label className="campo"><span>Tipo</span><select className="entrada" value={tipo} onChange={(e) => mudar('tipo', e.target.value)}><option value="">Todos</option>{tipos.data?.map((t) => <option key={t.codigo} value={t.codigo}>{t.nome}</option>)}</select></label>
          <label className="campo"><span>De</span><input className="entrada" type="date" value={de} onChange={(e) => mudar('de', e.target.value)} /></label>
          <label className="campo"><span>Até</span><input className="entrada" type="date" value={ate} onChange={(e) => mudar('ate', e.target.value)} /></label>
          <button className="btn escuro">Pesquisar</button>
        </form>
        {lista.isLoading ? <div style={{ padding: 24 }}><Giro /></div> : lista.data?.itens.length === 0 ? <div style={{ padding: 16 }}><Vazio>Nenhuma procuração corresponde à pesquisa. Experimente pesquisar pelo n.º de BI ou NIF do outorgante.</Vazio></div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tabela">
              <thead><tr><th>Número</th><th>Outorgante</th><th>Procurador(es)</th><th>Tipo</th><th>Data do acto</th><th>Estado</th></tr></thead>
              <tbody>{lista.data?.itens.map((p) => (
                <tr key={p.id}>
                  <td className="mono"><Link href={`/procuracoes/${p.id}`}>{p.numero ?? 'sem número'}</Link></td>
                  <td style={{ fontWeight: 500 }}>{p.outorgantes ?? '—'}</td><td className="muted">{p.procuradores ?? '—'}</td>
                  <td>{p.tipo}</td><td className="muted">{dataPT(p.dataActo)}</td><td><EstadoBadge e={p.estado} /></td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
        {total > POR_PAGINA && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: '1px solid var(--linha)' }}>
            <span className="small muted">Página {pagina} de {Math.ceil(total / POR_PAGINA)}</span>
            <span style={{ display: 'flex', gap: 6 }}><button className="btn pequeno" disabled={pagina <= 1} onClick={() => mudar('pagina', String(pagina - 1))}>Anterior</button><button className="btn pequeno" disabled={pagina * POR_PAGINA >= total} onClick={() => mudar('pagina', String(pagina + 1))}>Seguinte</button></span>
          </div>
        )}
      </section>
    </main>
  );
}
export default function Procuracoes() { return <Casca migalhas={['Procurações']}><Suspense><Conteudo /></Suspense></Casca>; }
