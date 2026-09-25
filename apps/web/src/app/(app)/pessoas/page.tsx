'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dataPT } from '@/lib/formato';
import { PessoaResumo } from '@/lib/tipos';
import { Casca } from '@/components/Casca';
import { Icone } from '@/components/Icone';
import { PessoaGaveta } from '@/components/PessoaForm';
import { Giro, useToast } from '@/components/ui';

export default function Pessoas() {
  const { pode } = useAuth(); const qc = useQueryClient(); const toast = useToast();
  const [q, setQ] = useState(''); const [busca, setBusca] = useState('');
  const [gaveta, setG] = useState<{ aberta: boolean; id?: string }>({ aberta: false });
  const lista = useQuery({ queryKey: ['persons', busca], queryFn: () => api<PessoaResumo[]>(`/persons${busca ? `?q=${encodeURIComponent(busca)}` : ''}`) });
  const hoje = new Date().toISOString().slice(0, 10);
  return (
    <Casca migalhas={['Pessoas']}>
      <main className="conteudo">
        <div className="cabecalho"><div><h1>Pessoas</h1><span className="muted">Outorgantes, procuradores e outras pessoas referidas nas procurações.</span></div>
          {pode('person.manage') && <button className="btn primario" onClick={() => setG({ aberta: true })}><Icone n="mais" t={16} />Nova pessoa</button>}</div>
        <section className="cartao">
          <form style={{ display: 'flex', gap: 12, padding: 16 }} onSubmit={(e) => { e.preventDefault(); setBusca(q.trim()); }}>
            <label className="campo" style={{ flex: 1 }}><span className="sr">Pesquisar pessoas</span><input className="entrada" type="search" placeholder="Nome (com ou sem acentos), NIF ou n.º de documento exacto" value={q} onChange={(e) => setQ(e.target.value)} /></label>
            <button className="btn escuro">Pesquisar</button>
          </form>
          {lista.isLoading ? <div style={{ padding: 20 }}><Giro /></div> : (
            <table className="tabela"><thead><tr><th>Nome</th><th>Documento</th><th>Validade</th><th>Nacionalidade</th><th /></tr></thead>
              <tbody>{lista.data?.map((p) => {
                const expirado = !p.documento.vitalicio && p.documento.validade && p.documento.validade < hoje;
                return (
                  <tr key={p.id}><td style={{ fontWeight: 500 }}>{p.nomeCompleto} {p.demo && <span className="small muted">DEMO</span>}</td><td className="mono">{p.documento.tipo} {p.documento.numero}</td>
                    <td>{p.documento.vitalicio ? 'Vitalício' : expirado ? <span style={{ color: 'var(--carmim)', fontWeight: 600 }}>Expirado {dataPT(p.documento.validade)}</span> : dataPT(p.documento.validade)}</td>
                    <td className="muted">{p.nacionalidade}</td>
                    <td style={{ textAlign: 'right' }}>{pode('person.manage') && <button className="btn pequeno" onClick={() => setG({ aberta: true, id: p.id })}>Editar</button>}</td></tr>
                );
              })}</tbody></table>
          )}
        </section>
        <PessoaGaveta aberta={gaveta.aberta} pessoaId={gaveta.id} fechar={() => setG({ aberta: false })} aoGuardar={() => { qc.invalidateQueries({ queryKey: ['persons'] }); toast('Pessoa guardada.'); }} />
      </main>
    </Casca>
  );
}
