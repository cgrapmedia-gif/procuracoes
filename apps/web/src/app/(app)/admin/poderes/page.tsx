'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Categoria, PoderCatalogo } from '@/lib/tipos';
import { Casca } from '@/components/Casca';
import { Icone } from '@/components/Icone';
import { Giro, Vazio, mensagemErro, useToast } from '@/components/ui';

export default function CentroPoderes() {
  const { pode } = useAuth(); const qc = useQueryClient(); const toast = useToast();
  const [sel, setSel] = useState<Set<string>>(new Set()); const [aPublicar, setAP] = useState(false);
  const [cat, setCat] = useState(''); const [q, setQ] = useState(''); const [activos, setAct] = useState<'true' | 'false' | 'todos'>('true'); const [soRascunhos, setSoR] = useState(false);
  const cats = useQuery({ queryKey: ['categorias'], queryFn: () => api<Categoria[]>('/power-categories') });
  const lista = useQuery({ queryKey: ['admin-poderes', cat, q, activos, soRascunhos], queryFn: () => api<{ total: number; itens: (PoderCatalogo & { publicado: boolean; rascunhoPendente: boolean })[] }>(`/powers?limite=200&rascunhos=${soRascunhos ? 'so' : 'true'}&activos=${activos}${cat ? `&categoria=${cat}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`) });
  const itens = lista.data?.itens ?? [];
  const pendentes = itens.filter((p) => !p.publicado || p.rascunhoPendente);
  const alternar = (id: string) => setSel((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  async function publicarSeleccionados() {
    if (!sel.size) return; setAP(true);
    try {
      const r = await api<{ publicados: number; ignorados: number }>('/powers/publish-batch', { body: { ids: [...sel] } });
      toast(`${r.publicados} publicados${r.ignorados ? `, ${r.ignorados} sem rascunho por publicar` : ''}.`);
      setSel(new Set()); qc.invalidateQueries({ queryKey: ['admin-poderes'] }); qc.invalidateQueries({ queryKey: ['catalogo'] });
    } catch (e) { toast(mensagemErro(e), true); } finally { setAP(false); }
  }
  async function exportar() {
    try {
      const dados = await api<unknown[]>('/powers/export');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' }));
      a.download = `catalogo-poderes-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    } catch (e) { toast(mensagemErro(e), true); }
  }
  return (
    <Casca migalhas={['Administração', 'Centro de Poderes']}>
      <main className="conteudo">
        <div className="cabecalho">
          <div><h1>Centro de Poderes</h1><span className="muted">Catálogo aprovado. Cada alteração ao texto cria uma nova versão; as procurações emitidas mantêm a versão com que foram emitidas.</span></div>
          <button className="btn" onClick={exportar}><Icone n="descarregar" t={16} />Exportar</button>
          {pode('power.import') && <Link className="btn" href="/admin/poderes/importar"><Icone n="carregar" t={16} />Importar</Link>}
          <Link className="btn primario" href="/admin/poderes/novo"><Icone n="mais" t={16} />Novo poder</Link>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="pilula" aria-pressed={!cat} onClick={() => setCat('')}>Todas</button>
          {cats.data?.map((c) => <button key={c.code} className="pilula" aria-pressed={cat === c.code} onClick={() => setCat(c.code)}>{c.name}</button>)}
        </div>
        <section className="cartao" style={{ overflow: 'hidden' }}>
          <div style={{ display: 'flex', gap: 12, padding: 16, flexWrap: 'wrap' }}>
            <label className="campo" style={{ flex: 1, minWidth: 240 }}><span className="sr">Pesquisar</span><input className="entrada" type="search" placeholder="Nome, código ou texto" value={q} onChange={(e) => setQ(e.target.value)} /></label>
            <select className="entrada" style={{ width: 180 }} aria-label="Estado" value={activos} onChange={(e) => setAct(e.target.value as 'true')}><option value="true">Activos</option><option value="false">Desactivados</option><option value="todos">Todos</option></select>
            <button className="pilula" aria-pressed={soRascunhos} onClick={() => setSoR(!soRascunhos)}>Só por publicar</button>
          </div>
          {pode('power.publish') && pendentes.length > 0 && (
            <div className="aviso atencao" style={{ margin: '0 16px 12px', alignItems: 'center' }}>
              <span style={{ flex: 1 }}>{pendentes.length} {pendentes.length === 1 ? 'poder tem' : 'poderes têm'} texto por publicar nesta lista. Reveja-os e publique de uma vez os seleccionados.</span>
              <button className="btn pequeno" onClick={() => setSel(new Set(pendentes.map((p) => p.id)))}>Seleccionar por publicar</button>
              <button className="btn pequeno primario" disabled={!sel.size || aPublicar} onClick={publicarSeleccionados}>{aPublicar ? 'A publicar…' : `Publicar seleccionados (${sel.size})`}</button>
            </div>
          )}
          {lista.isLoading ? <div style={{ padding: 16 }}><Giro /></div> : !lista.data?.itens.length ? <div style={{ padding: 16 }}><Vazio>Nenhum poder encontrado.</Vazio></div> : (
            <table className="tabela"><thead><tr><th style={{ width: 36 }}><span className="sr">Seleccionar</span></th><th>Código</th><th>Nome</th><th>Categoria</th><th>Versão</th><th>Campos</th><th>Regras</th><th>Utilizações</th></tr></thead>
              <tbody>{lista.data.itens.map((p) => (
                <tr key={p.id}><td><input type="checkbox" aria-label={`Seleccionar ${p.codigo}`} checked={sel.has(p.id)} onChange={() => alternar(p.id)} /></td><td className="mono">{p.codigo}</td><td><Link href={`/admin/poderes/${p.id}`} style={{ fontWeight: 500 }}>{p.nome}</Link>{p.tipo === 'CLAUSULA' && <span className="small muted"> (cláusula)</span>}{!p.activo && <span className="small" style={{ color: 'var(--carmim)' }}> desactivado</span>}{!p.publicado ? <span className="estado EM_REVISAO" style={{ marginLeft: 8 }}>Por publicar</span> : p.rascunhoPendente ? <span className="estado RASCUNHO" style={{ marginLeft: 8 }}>Nova versão em rascunho</span> : null}</td>
                  <td className="muted">{p.categoriaNome}</td><td>{p.versao ? `v${p.versao}` : '—'}</td><td>{p.campos.length}</td><td>{p.regras.length}</td><td>{p.utilizacoes}</td></tr>
              ))}</tbody></table>
          )}
        </section>
      </main>
    </Casca>
  );
}
