'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { PessoaResumo } from '@/lib/tipos';
import { Icone } from './Icone';

/** Pesquisa de pessoas existentes (nome sem acentos, NIF ou n.º de documento), para nunca duplicar. */
export function SeletorPessoa({ aoEscolher, excluir = [], rotulo = 'Pesquisar pessoa' }: { aoEscolher: (p: PessoaResumo) => void; excluir?: string[]; rotulo?: string }) {
  const [q, setQ] = useState(''); const [res, setRes] = useState<PessoaResumo[]>([]); const [aberto, setA] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    clearTimeout(t.current);
    if (q.trim().length < 2) { setRes([]); return; }
    t.current = setTimeout(() => { api<PessoaResumo[]>(`/persons?q=${encodeURIComponent(q.trim())}`).then(setRes).catch(() => setRes([])); }, 250);
  }, [q]);
  const lista = res.filter((r) => !excluir.includes(r.id));
  return (
    <div style={{ position: 'relative' }}>
      <label className="pesquisa" style={{ width: '100%', margin: 0, background: 'var(--folha)', height: 44 }}>
        <Icone n="pesquisa" t={16} /><span className="sr">{rotulo}</span>
        <input type="search" placeholder="Nome, NIF ou n.º de documento" value={q} onFocus={() => setA(true)} onBlur={() => setTimeout(() => setA(false), 150)} onChange={(e) => setQ(e.target.value)} role="combobox" aria-expanded={aberto && lista.length > 0} aria-controls="res-pessoas" />
      </label>
      {aberto && lista.length > 0 && (
        <ul id="res-pessoas" role="listbox" style={{ position: 'absolute', top: 48, left: 0, right: 0, margin: 0, padding: 6, listStyle: 'none', background: 'var(--folha)', border: '1px solid var(--linha)', borderRadius: 10, boxShadow: '0 8px 24px rgba(22,24,29,.12)', zIndex: 10 }}>
          {lista.map((p) => (
            <li key={p.id} role="option" aria-selected="false">
              <button type="button" className="item-poder" onMouseDown={(e) => e.preventDefault()} onClick={() => { aoEscolher(p); setQ(''); setRes([]); }}>
                <span style={{ flex: 1 }}><b style={{ fontWeight: 500 }}>{p.nomeCompleto}</b><br /><span className="small muted">{p.documento.tipo} {p.documento.numero} · {p.nacionalidade}</span></span>
                {p.demo && <span className="small muted">DEMO</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
