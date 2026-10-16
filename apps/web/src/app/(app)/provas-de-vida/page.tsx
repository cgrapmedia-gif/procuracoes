'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dataPT } from '@/lib/formato';
import { Casca } from '@/components/Casca';
import { Icone } from '@/components/Icone';
import { Giro, Vazio } from '@/components/ui';

interface Linha { id: string; numero: string | null; estado: string; dataActo: string; requerente: string; entidade: string; modalidade: string }
const ESTADO: Record<string, string> = { RASCUNHO: 'Rascunho', EMITIDA: 'Emitida', CANCELADA: 'Cancelada' };

export default function ProvasDeVida() {
  const { pode } = useAuth();
  const [q, setQ] = useState(''); const [busca, setBusca] = useState(''); const [estado, setEstado] = useState(''); const [pagina, setPagina] = useState(1);
  const lista = useQuery({ queryKey: ['declaracoes', busca, estado, pagina], queryFn: () => api<{ total: number; itens: Linha[] }>(`/declaracoes?pagina=${pagina}${busca ? `&q=${encodeURIComponent(busca)}` : ''}${estado ? `&estado=${estado}` : ''}`) });
  return (
    <Casca migalhas={['Provas de vida']}>
      <main className="conteudo">
        <div className="cabecalho">
          <div><h1>Provas de vida</h1><span className="muted">Declarações para manutenção do direito à pensão de reforma ou de sobrevivência.</span></div>
          {pode('decl.create') && <Link className="btn primario" href="/provas-de-vida/nova"><Icone n="mais" t={16} />Nova prova de vida</Link>}
        </div>
        <form className="cartao" style={{ padding: 12, display: 'flex', gap: 8, alignItems: 'center' }} onSubmit={(e) => { e.preventDefault(); setBusca(q.trim()); setPagina(1); }}>
          <label className="pesquisa" style={{ flex: 1, margin: 0 }}><Icone n="pesquisa" t={16} /><span className="sr">Pesquisar</span><input type="search" placeholder="Nome do requerente, número ou entidade" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <select className="entrada" style={{ width: 160 }} value={estado} onChange={(e) => { setEstado(e.target.value); setPagina(1); }}><option value="">Todos os estados</option>{Object.entries(ESTADO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <button className="btn">Pesquisar</button>
        </form>
        <section className="cartao" style={{ overflow: 'hidden' }}>
          {lista.isLoading ? <div style={{ padding: 16 }}><Giro /></div> : !lista.data?.itens.length ? <Vazio>Ainda não há provas de vida{busca ? ` para «${busca}»` : ''}.</Vazio> : (
            <table className="tabela"><thead><tr><th>Número</th><th>Requerente</th><th>Pensão</th><th>Entidade</th><th>Data</th><th>Estado</th></tr></thead>
              <tbody>{lista.data.itens.map((d) => (
                <tr key={d.id} className="clicavel" onClick={() => { window.location.href = `/provas-de-vida/${d.id}`; }}>
                  <td className="mono">{d.numero ?? '—'}</td><td style={{ fontWeight: 500 }}>{d.requerente}</td>
                  <td>{d.modalidade === 'SOBREVIVENCIA' ? 'Sobrevivência' : 'Reforma'}</td><td className="small">{d.entidade}</td><td>{dataPT(d.dataActo)}</td>
                  <td><span className={`estado ${d.estado === 'EMITIDA' ? 'EMITIDA' : d.estado === 'CANCELADA' ? 'CANCELADA' : 'RASCUNHO'}`}>{ESTADO[d.estado]}</span></td>
                </tr>
              ))}</tbody></table>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderTop: '1px solid var(--linha)' }}>
            <span className="small muted">{lista.data?.total ?? 0} no total · página {pagina}</span>
            <div style={{ display: 'flex', gap: 8 }}><button className="btn pequeno" disabled={pagina === 1} onClick={() => setPagina((x) => x - 1)}>Anterior</button><button className="btn pequeno" disabled={(lista.data?.itens.length ?? 0) < 25} onClick={() => setPagina((x) => x + 1)}>Seguinte</button></div>
          </div>
        </section>
      </main>
    </Casca>
  );
}
