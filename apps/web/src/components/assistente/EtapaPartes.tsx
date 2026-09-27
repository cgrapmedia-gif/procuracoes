'use client';
import { useState } from 'react';
import { Parte } from '@/lib/tipos';
import { Icone } from '../Icone';
import { PessoaGaveta } from '../PessoaForm';
import { SeletorPessoa } from '../SeletorPessoa';
import { Campo, Vazio } from '../ui';
import { Rascunho } from './rascunho';

const FORMAS = [['ISOLADAMENTE', 'Isoladamente (qualquer um deles)'], ['CONJUNTAMENTE', 'Sempre conjuntamente'], ['DOIS_CONJUNTAMENTE', 'Dois conjuntamente'], ['PERSONALIZADA', 'Regra definida na procuração']] as const;

export function EtapaPartes({ papel, r, actualizar, editavel }: { papel: 'outorgantes' | 'procuradores'; r: Rascunho; actualizar: (fn: (x: Rascunho) => Rascunho) => void; editavel: boolean }) {
  const [gaveta, setG] = useState<{ aberta: boolean; id?: string; nome?: string }>({ aberta: false });
  const lista = r[papel];
  const outros = papel === 'outorgantes' ? r.procuradores : r.outorgantes;
  const excluir = [...lista, ...outros].map((p) => p.pessoaId);
  const add = (p: Parte) => actualizar((x) => ({ ...x, [papel]: x[papel].some((y) => y.pessoaId === p.pessoaId) ? x[papel] : [...x[papel], p] }));
  const rem = (id: string) => actualizar((x) => ({ ...x, [papel]: x[papel].filter((y) => y.pessoaId !== id) }));
  const mover = (i: number, d: number) => actualizar((x) => { const a = [...x[papel]]; const j = i + d; if (j < 0 || j >= a.length) return x; [a[i], a[j]] = [a[j], a[i]]; return { ...x, [papel]: a }; });
  const titulo = papel === 'outorgantes' ? 'Outorgante' : 'Procuradores';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 900 }}>
      <div>
        <h2>{papel === 'outorgantes' ? 'Quem confere os poderes' : 'Quem recebe os poderes'}</h2>
        <p className="muted" style={{ margin: '4px 0 0' }}>{papel === 'outorgantes' ? 'Normalmente um outorgante. Pode acrescentar mais quando o acto é conjunto.' : 'Um ou vários procuradores. Com vários, defina como actuam.'}</p>
      </div>
      {editavel && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}><SeletorPessoa excluir={excluir} rotulo={`Pesquisar ${titulo.toLowerCase()}`} aoEscolher={(p) => add({ pessoaId: p.id, nome: p.nomeCompleto, sexo: p.sexo })} aoCriar={(nome) => setG({ aberta: true, nome })} /></div>
          <button className="btn" style={{ height: 44 }} onClick={() => setG({ aberta: true })}><Icone n="mais" t={16} />Nova pessoa</button>
        </div>
      )}
      {lista.length === 0 ? <Vazio>Ainda não há {papel}. Pesquise uma pessoa existente ou registe uma nova.</Vazio> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {lista.map((p, i) => (
            <div key={p.pessoaId} className="cartao" style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span className="avatar" style={{ background: 'var(--realce)', color: 'var(--tinta)' }}>{p.nome.split(' ').map((x) => x[0]).slice(0, 2).join('')}</span>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div><b style={{ fontWeight: 600 }}>{p.nome}</b> <span className="small muted">{p.sexo === 'F' ? 'feminino' : 'masculino'}</span></div>
                {papel === 'outorgantes' && (
                  <Campo rotulo="Qualidade em que outorga" opcional ajuda="Preencha só se outorga em representação, ex.: «Sócio Gerente da sociedade X, Lda.»">
                    <input className="entrada" disabled={!editavel} value={p.qualidade ?? ''} onChange={(e) => actualizar((x) => ({ ...x, outorgantes: x.outorgantes.map((o) => (o.pessoaId === p.pessoaId ? { ...o, qualidade: e.target.value } : o)) }))} />
                  </Campo>
                )}
              </div>
              {editavel && <div style={{ display: 'flex', gap: 4 }}>
                {lista.length > 1 && <><button className="btn icone" aria-label="Subir" disabled={i === 0} onClick={() => mover(i, -1)}><Icone n="cima" t={15} /></button><button className="btn icone" aria-label="Descer" disabled={i === lista.length - 1} onClick={() => mover(i, 1)}><Icone n="baixo" t={15} /></button></>}
                <button className="btn icone" aria-label="Editar dados da pessoa" onClick={() => setG({ aberta: true, id: p.pessoaId })}><Icone n="lapis" t={15} /></button>
                <button className="btn icone" aria-label="Retirar" onClick={() => rem(p.pessoaId)}><Icone n="x" t={15} /></button>
              </div>}
            </div>
          ))}
        </div>
      )}
      {papel === 'procuradores' && lista.length > 1 && (
        <div className="cartao"><div className="corpo">
          <h3>Forma de actuação</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} role="radiogroup" aria-label="Forma de actuação">
            {FORMAS.map(([v, rot]) => <button key={v} type="button" role="radio" aria-checked={r.formaActuacao === v} className="pilula" aria-pressed={r.formaActuacao === v} disabled={!editavel} onClick={() => actualizar((x) => ({ ...x, formaActuacao: v }))}>{rot}</button>)}
          </div>
          {r.formaActuacao === 'PERSONALIZADA' && <Campo rotulo="Regra" obrigatorio><input className="entrada" disabled={!editavel} value={r.formaActuacaoPersonalizada ?? ''} onChange={(e) => actualizar((x) => ({ ...x, formaActuacaoPersonalizada: e.target.value }))} placeholder="devendo os actos de disposição ser praticados conjuntamente" /></Campo>}
        </div></div>
      )}
      <PessoaGaveta aberta={gaveta.aberta} pessoaId={gaveta.id} nomeInicial={gaveta.nome} fechar={() => setG({ aberta: false })}
        aoGuardar={(p) => { if (gaveta.id) actualizar((x) => ({ ...x, [papel]: x[papel].map((y) => (y.pessoaId === p.id ? { ...y, nome: p.nomeCompleto, sexo: p.sexo } : y)) })); else add({ pessoaId: p.id, nome: p.nomeCompleto, sexo: p.sexo }); }} />
    </div>
  );
}
