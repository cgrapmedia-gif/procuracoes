'use client';
import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { dataPT } from '@/lib/formato';
import { PessoaResumo } from '@/lib/tipos';
import { Icone } from './Icone';

type Resultado = PessoaResumo & { dataNascimento?: string; naturalidade?: string; aproximado?: boolean };

/**
 * Pesquisa de pessoas: nome (palavras em qualquer ordem, com ou sem acentos, tolera erros), NIF ou n.º de documento.
 * Teclado: ↑/↓ para escolher, Enter para seleccionar, Esc para fechar.
 * Se a pessoa não existir, oferece criá-la já com o nome escrito.
 */
export function SeletorPessoa({ aoEscolher, excluir = [], rotulo = 'Pesquisar pessoa', aoCriar }: { aoEscolher: (p: PessoaResumo) => void; excluir?: string[]; rotulo?: string; aoCriar?: (nome: string) => void }) {
  const [q, setQ] = useState(''); const [res, setRes] = useState<Resultado[]>([]); const [aberto, setA] = useState(false);
  const [activo, setActivo] = useState(0); const [aProcurar, setAP] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hoje = new Date().toISOString().slice(0, 10);
  useEffect(() => {
    clearTimeout(t.current);
    if (q.trim().length < 2) { setRes([]); setAP(false); return; }
    setAP(true);
    t.current = setTimeout(() => { api<Resultado[]>(`/persons?q=${encodeURIComponent(q.trim())}`).then((r) => { setRes(r); setActivo(0); }).catch(() => setRes([])).finally(() => setAP(false)); }, 200);
  }, [q]);
  const lista = res.filter((r) => !excluir.includes(r.id));
  const podeCriar = !!aoCriar && q.trim().length >= 3;
  const total = lista.length + (podeCriar ? 1 : 0);
  const escolher = (p: Resultado) => { aoEscolher(p); setQ(''); setRes([]); setA(false); };
  const criar = () => { aoCriar?.(q.trim()); setQ(''); setRes([]); setA(false); };
  function tecla(e: KeyboardEvent<HTMLInputElement>) {
    if (!aberto || !total) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActivo((a) => (a + 1) % total); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActivo((a) => (a - 1 + total) % total); }
    if (e.key === 'Enter') { e.preventDefault(); if (activo < lista.length) escolher(lista[activo]); else if (podeCriar) criar(); }
    if (e.key === 'Escape') setA(false);
  }
  const mostrar = aberto && q.trim().length >= 2;
  return (
    <div style={{ position: 'relative' }}>
      <label className="pesquisa" style={{ width: '100%', margin: 0, background: 'var(--folha)', height: 44 }}>
        <Icone n="pesquisa" t={16} /><span className="sr">{rotulo}</span>
        <input type="search" placeholder="Nome (qualquer ordem), NIF ou n.º de documento" value={q} onFocus={() => setA(true)} onBlur={() => setTimeout(() => setA(false), 150)} onKeyDown={tecla}
          onChange={(e) => { setQ(e.target.value); setA(true); }} role="combobox" aria-expanded={mostrar} aria-controls="res-pessoas" aria-autocomplete="list" />
        {aProcurar && <span className="giro" style={{ width: 14, height: 14 }} aria-hidden="true" />}
      </label>
      {mostrar && (
        <ul id="res-pessoas" role="listbox" style={{ position: 'absolute', top: 48, left: 0, right: 0, margin: 0, padding: 6, listStyle: 'none', background: 'var(--folha)', border: '1px solid var(--linha)', borderRadius: 10, boxShadow: '0 8px 24px rgba(22,24,29,.12)', zIndex: 10, maxHeight: 360, overflow: 'auto' }}>
          {lista.length > 0 && lista[0].aproximado && <li className="small muted" style={{ padding: '4px 10px' }}>Sem correspondência exacta. Nomes parecidos:</li>}
          {lista.map((p, i) => {
            const expirado = !p.documento.vitalicio && p.documento.validade && p.documento.validade < hoje;
            return (
              <li key={p.id} role="option" aria-selected={i === activo}>
                <button type="button" className="item-poder" aria-current={i === activo} onMouseEnter={() => setActivo(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => escolher(p)}>
                  <span className="avatar" style={{ width: 30, height: 30, fontSize: 11, background: 'var(--realce)', color: 'var(--tinta)' }}>{p.nomeCompleto.split(' ').map((x) => x[0]).slice(0, 2).join('')}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ fontWeight: 600 }}>{p.nomeCompleto}</b>{p.demo && <span className="small muted"> DEMO</span>}<br />
                    <span className="small muted">{p.documento.tipo.replace('_AO', '').replace('_PT', '')} {p.documento.numero}{p.dataNascimento ? ` · nasc. ${dataPT(p.dataNascimento)}` : ''}{p.naturalidade ? ` · ${p.naturalidade.split(',')[0]}` : ''}</span>
                  </span>
                  {expirado && <span className="small" style={{ color: 'var(--carmim)', fontWeight: 600 }}>doc. expirado</span>}
                </button>
              </li>
            );
          })}
          {!aProcurar && lista.length === 0 && <li className="small muted" style={{ padding: '8px 10px' }}>Nenhuma pessoa encontrada.</li>}
          {podeCriar && (
            <li role="option" aria-selected={activo === lista.length}>
              <button type="button" className="item-poder" aria-current={activo === lista.length} style={{ color: 'var(--carmim)', fontWeight: 600 }} onMouseDown={(e) => e.preventDefault()} onClick={criar}>
                <Icone n="mais" t={15} />Registar nova pessoa «{q.trim()}»
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
