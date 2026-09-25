'use client';
import { useMemo, useState } from 'react';
import { DndContext, DragEndEvent, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { avaliarRegras, sugerirPoderes, VersaoPoder } from '@proc/core/browser';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { uid } from '@/lib/formato';
import { Categoria, ItemRascunho, PoderCatalogo } from '@/lib/tipos';
import { Icone } from '../Icone';
import { Campo, Modal, Vazio } from '../ui';
import { Rascunho, novoItem, paraMotor } from './rascunho';

/** Texto jurídico com os campos {{variavel}} destacados (nunca injecta HTML). */
export function TextoComCampos({ texto, campos }: { texto: string; campos: { chave: string; rotulo: string }[] }) {
  const partes = texto.split(/(\{\{[^}]+\}\})/g).filter(Boolean);
  return (
    <p className="texto-juridico">
      {partes.map((p, i) => {
        const m = /^\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}$/.exec(p);
        if (m) { const c = campos.find((x) => x.chave === m[1]); return c ? <span key={i} className="campo-marca">{c.rotulo}</span> : null; }
        if (p.startsWith('{{')) {
          const f = /^\{\{flex \w+ "([^"]*)" "([^"]*)"/.exec(p);
          return f ? <span key={i}>{f[1]}</span> : null; // concordância: mostra a forma masculina singular
        }
        return <span key={i}>{p}</span>;
      })}
    </p>
  );
}

function Escolhido({ item, n, problema, editavel, remover, mover, abrir, total }: { item: ItemRascunho; n: number; problema: boolean; editavel: boolean; remover: () => void; mover: (d: number) => void; abrir: () => void; total: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.uid, disabled: !editavel });
  const nCampos = item.campos.length;
  return (
    <div ref={setNodeRef} className={`escolhido${problema ? ' problema' : ''}`} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1, zIndex: isDragging ? 2 : undefined }}>
      {editavel && <button className="pega" aria-label={`Arrastar «${item.nome}»`} {...attributes} {...listeners}><Icone n="pega" t={16} traco={3} /></button>}
      <span className="num">{n}</span>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <button onClick={abrir} style={{ border: 0, background: 'none', padding: 0, textAlign: 'left', fontWeight: 500, cursor: 'pointer' }}>{item.nome}</button>
        {item.personalizado ? <span className="small" style={{ color: 'var(--ambar)' }}>Personalizado, requer validação</span> : nCampos > 0 && <span className="small" style={{ color: 'var(--ouro)' }}>{nCampos} {nCampos === 1 ? 'campo' : 'campos'} a preencher</span>}
        {problema && <span className="small" style={{ color: 'var(--carmim)', fontWeight: 600 }}>Regra por resolver</span>}
      </div>
      {editavel && <div style={{ display: 'flex', gap: 4 }}>
        <button className="btn icone" aria-label="Mover para cima" disabled={n === 1} onClick={() => mover(-1)}><Icone n="cima" t={15} /></button>
        <button className="btn icone" aria-label="Mover para baixo" disabled={n === total} onClick={() => mover(1)}><Icone n="baixo" t={15} /></button>
        <button className="btn icone" aria-label={`Remover «${item.nome}»`} onClick={remover}><Icone n="x" t={15} /></button>
      </div>}
    </div>
  );
}

export function Construtor({ r, actualizar, catalogo, categorias, tipoCodigo, editavel, clausulas = false }: {
  r: Rascunho; actualizar: (fn: (x: Rascunho) => Rascunho) => void; catalogo: PoderCatalogo[]; categorias: Categoria[]; tipoCodigo: string; editavel: boolean; clausulas?: boolean;
}) {
  const { pode } = useAuth(); const qc = useQueryClient();
  const doTipo = catalogo.filter((p) => (clausulas ? p.tipo === 'CLAUSULA' : p.tipo === 'PODER') && (!p.tiposPermitidos.length || p.tiposPermitidos.includes(tipoCodigo)));
  const cats = categorias.filter((c) => doTipo.some((p) => p.categoria === c.code));
  const [cat, setCat] = useState<string>(cats[0]?.code ?? '');
  const [q, setQ] = useState(''); const [fav, setFav] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [pers, setPers] = useState<{ aberta: boolean; nome: string; texto: string }>({ aberta: false, nome: '', texto: '' });
  const porCodigo = useMemo(() => new Map(catalogo.map((p) => [p.codigo, p])), [catalogo]);
  const itens = r.itens.filter((i) => i.clausula === clausulas);
  const outros = r.itens.filter((i) => i.clausula !== clausulas);
  const codigos = new Set(r.itens.map((i) => i.codigo));

  const termo = q.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  const lista = doTipo.filter((p) => (termo ? norm(`${p.nome} ${p.codigo} ${p.descricao ?? ''} ${p.texto}`).includes(termo) : fav ? p.favorito : p.categoria === cat));
  const detalhe = sel ? porCodigo.get(sel) : lista[0];

  const motor = paraMotor(r.itens, porCodigo);
  const problemas = avaliarRegras(motor, { tipoProcuracao: tipoCodigo, dataActo: r.dataActo }).filter((p) => p.codigo !== 'CAMPO');
  const comProblema = new Set(problemas.filter((p) => p.severidade === 'ERRO').map((p) => p.instanciaId));
  const catVers = new Map<string, VersaoPoder>([...porCodigo.values()].map((p) => [p.codigo, paraMotor([novoItem(p)], porCodigo)[0].versao]));
  const sugestoes = sugerirPoderes(motor.filter((m) => r.itens.find((i) => i.uid === m.instanciaId)?.clausula === clausulas), catVers).filter((s) => (porCodigo.get(s.codigo)?.tipo === 'CLAUSULA') === clausulas).slice(0, 4);

  const adicionar = (codigo: string) => { const p = porCodigo.get(codigo); if (!p || !editavel) return; actualizar((x) => ({ ...x, itens: [...x.itens, novoItem(p)] })); setSel(codigo); };
  const remover = (u: string) => actualizar((x) => ({ ...x, itens: x.itens.filter((i) => i.uid !== u) }));
  const reordenar = (novos: ItemRascunho[]) => actualizar((x) => ({ ...x, itens: clausulas ? [...outros, ...novos] : [...novos, ...outros] }));
  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  function fimArrasto(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const de = itens.findIndex((i) => i.uid === e.active.id); const para = itens.findIndex((i) => i.uid === e.over!.id);
    reordenar(arrayMove(itens, de, para));
  }
  async function favorito(p: PoderCatalogo) { await api(`/powers/${p.id}/favorite`, { method: p.favorito ? 'DELETE' : 'POST' }); qc.invalidateQueries({ queryKey: ['catalogo'] }); }
  const corrigir = (c?: { accao: string; codigo: string }) => {
    if (!c) return;
    if (c.accao === 'ADICIONAR') adicionar(c.codigo);
    if (c.accao === 'REMOVER') actualizar((x) => ({ ...x, itens: x.itens.filter((i) => i.codigo !== c.codigo) }));
  };

  return (
    <div className="construtor">
      <aside aria-label="Categorias">
        <span className="small muted" style={{ padding: '4px 12px 8px' }}>Categorias</span>
        <button className="cat" aria-pressed={fav && !termo} onClick={() => { setFav(true); setQ(''); }}><span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Icone n="estrela" t={15} cor="var(--ouro)" />Favoritos</span></button>
        {cats.map((c) => <button key={c.code} className="cat" aria-pressed={!fav && !termo && cat === c.code} onClick={() => { setCat(c.code); setFav(false); setQ(''); setSel(null); }}><span>{c.name}</span><small>{doTipo.filter((p) => p.categoria === c.code).length}</small></button>)}
      </aside>

      <section className="catalogo" aria-label="Catálogo">
        <label className="pesquisa busca" style={{ width: '100%', margin: 0, height: 44, background: 'var(--folha)' }}>
          <Icone n="pesquisa" /><span className="sr">Pesquisar no catálogo</span>
          <input type="search" placeholder={clausulas ? 'Pesquisar cláusulas' : 'Pesquisar poderes (ex.: IBAN, imóvel, passaporte)'} value={q} onChange={(e) => { setQ(e.target.value); setSel(null); }} />
        </label>
        <div className="lista-poderes">
          {lista.length === 0 && <Vazio>Nada encontrado no catálogo aprovado.</Vazio>}
          {lista.map((p) => (
            <button key={p.codigo} className="item-poder" aria-current={detalhe?.codigo === p.codigo} onClick={() => setSel(p.codigo)} onDoubleClick={() => !codigos.has(p.codigo) && adicionar(p.codigo)}>
              <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: 'block', fontWeight: 500 }}>{p.nome}</span><span className="small muted mono">{p.codigo} v{p.versao}</span></span>
              {codigos.has(p.codigo) && <span className="incluido"><Icone n="certo" t={13} traco={2.2} />Incluído</span>}
            </button>
          ))}
        </div>
        {detalhe && (
          <article className="detalhe-poder" aria-label="Detalhe do poder">
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span className="small muted">{detalhe.codigo}, versão {detalhe.versao} publicada{detalhe.utilizacoes ? `, usado ${detalhe.utilizacoes} vezes` : ''}{detalhe.demo ? ' (texto DEMO, sem validação jurídica)' : ''}</span>
                <h2>{detalhe.nome}</h2>
                {detalhe.descricao && <p className="muted" style={{ margin: 0 }}>{detalhe.descricao.replace(/^\[DEMO[^\]]*\]\s*/, '')}</p>}
              </div>
              <button className="btn icone fantasma" aria-label={detalhe.favorito ? 'Retirar dos favoritos' : 'Marcar como favorito'} aria-pressed={detalhe.favorito} onClick={() => favorito(detalhe)}><Icone n="estrela" cor={detalhe.favorito ? 'var(--ouro)' : 'currentColor'} /></button>
              {codigos.has(detalhe.codigo) ? <span className="estado EMITIDA" style={{ height: 40, borderRadius: 8 }}>Na procuração</span>
                : editavel && <button className="btn primario" onClick={() => adicionar(detalhe.codigo)}><Icone n="mais" t={16} />Adicionar {clausulas ? 'cláusula' : 'poder'}</button>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><span className="small" style={{ fontWeight: 600 }}>Texto jurídico</span>
              <TextoComCampos texto={detalhe.texto} campos={detalhe.campos} />
              <span className="small muted">Texto do catálogo aprovado. Alterações só no Centro de Poderes, como nova versão.</span></div>
            <div className="grelha" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
              <div><span className="small" style={{ fontWeight: 600 }}>Campos</span>{detalhe.campos.length ? detalhe.campos.map((c) => <div key={c.chave} style={{ fontSize: 13.5 }}>{c.rotulo}{c.obrigatorio && <span className="obrig" style={{ color: 'var(--carmim)' }}> *</span>}</div>) : <div className="muted small">Sem campos</div>}</div>
              <div><span className="small" style={{ fontWeight: 600 }}>Exige</span>{detalhe.regras.filter((x) => x.tipo === 'REQUER').map((x) => <div key={x.alvoCodigo} style={{ fontSize: 13.5, display: 'flex', gap: 6, alignItems: 'center' }}><Icone n="ligacao" t={14} cor="var(--azul)" />{porCodigo.get(x.alvoCodigo)?.nome ?? x.alvoCodigo}</div>)}{!detalhe.regras.some((x) => x.tipo === 'REQUER') && <div className="muted small">Nada</div>}</div>
              <div><span className="small" style={{ fontWeight: 600 }}>Incompatível com</span>{detalhe.regras.filter((x) => x.tipo === 'INCOMPATIVEL').map((x) => <div key={x.alvoCodigo} style={{ fontSize: 13.5, display: 'flex', gap: 6, alignItems: 'center' }}><Icone n="proibido" t={14} cor="var(--carmim)" />{porCodigo.get(x.alvoCodigo)?.nome ?? x.alvoCodigo}</div>)}{detalhe.exclusivo && <div style={{ fontSize: 13.5 }}>Qualquer outro poder (exclusivo)</div>}{!detalhe.regras.some((x) => x.tipo === 'INCOMPATIVEL') && !detalhe.exclusivo && <div className="muted small">Nada</div>}</div>
            </div>
          </article>
        )}
      </section>

      <aside className="em-construcao" aria-label="Procuração em construção">
        <div style={{ padding: '16px 16px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h3>{clausulas ? 'Cláusulas escolhidas' : 'Procuração em construção'}</h3><span className="small muted">{itens.length}</span>
        </div>
        <div className="lista">
          {itens.length === 0 && <Vazio>{clausulas ? 'Sem cláusulas finais. São opcionais.' : 'Adicione poderes do catálogo. A ordem aqui será exactamente a do documento.'}</Vazio>}
          <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={fimArrasto}>
            <SortableContext items={itens.map((i) => i.uid)} strategy={verticalListSortingStrategy}>
              {itens.map((i, idx) => <Escolhido key={i.uid} item={i} n={idx + 1} total={itens.length} editavel={editavel} problema={comProblema.has(i.uid)} remover={() => remover(i.uid)} abrir={() => { setSel(i.codigo); setQ(''); const c = porCodigo.get(i.codigo); if (c) { setCat(c.categoria); setFav(false); } }} mover={(d) => { const j = idx + d; if (j >= 0 && j < itens.length) reordenar(arrayMove(itens, idx, j)); }} />)}
            </SortableContext>
          </DndContext>
          {problemas.length > 0 && (
            <div className="aviso erro" style={{ flexDirection: 'column', gap: 8 }} role="status">
              <b style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Icone n="alerta" t={15} />Regras do catálogo</b>
              {problemas.map((p, k) => <div key={k} style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span style={{ flex: 1, fontSize: 13 }}>{p.mensagem}</span>{p.correccao && p.correccao.accao !== 'ACTUALIZAR_VERSAO' && editavel && <button className="btn pequeno" onClick={() => corrigir(p.correccao)}>{p.correccao.accao === 'ADICIONAR' ? 'Adicionar' : 'Remover'}</button>}</div>)}
            </div>
          )}
          {editavel && sugestoes.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
              <b className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Icone n="ideia" t={15} cor="var(--ouro)" />Relacionados no catálogo</b>
              {sugestoes.map((s) => <div key={s.codigo} className="sugestao"><div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 500 }}>{s.nome}</div><div className="small muted">{s.motivo}</div></div><button className="btn icone" aria-label={`Adicionar «${s.nome}»`} onClick={() => adicionar(s.codigo)}><Icone n="mais" t={15} /></button></div>)}
            </div>
          )}
          {editavel && !clausulas && pode('poa.custom_power') && <button className="btn fantasma pequeno" style={{ alignSelf: 'flex-start' }} onClick={() => setPers({ aberta: true, nome: '', texto: '' })}><Icone n="lapis" t={14} />Poder personalizado</button>}
        </div>
      </aside>

      <Modal titulo="Poder personalizado" aberta={pers.aberta} fechar={() => setPers((x) => ({ ...x, aberta: false }))}
        rodape={<><button className="btn fantasma" onClick={() => setPers((x) => ({ ...x, aberta: false }))}>Cancelar</button><button className="btn primario" disabled={pers.nome.length < 3 || pers.texto.length < 3} onClick={() => { actualizar((x) => ({ ...x, itens: [...x.itens, { uid: uid(), codigo: `PERS-${x.itens.length + 1}`, nome: pers.nome, versao: 0, clausula: false, usarAlternativo: false, campos: [], valores: {}, personalizado: { nome: pers.nome, texto: pers.texto } }] })); setPers({ aberta: false, nome: '', texto: '' }); }}>Acrescentar</button></>}>
        <div className="aviso atencao">Texto fora do catálogo aprovado. Fica assinalado e tem de ser validado antes da emissão.</div>
        <Campo rotulo="Nome" obrigatorio><input className="entrada" value={pers.nome} onChange={(e) => setPers((x) => ({ ...x, nome: e.target.value }))} /></Campo>
        <Campo rotulo="Texto" obrigatorio ajuda="Redigido como continuação de «a quem confere os poderes necessários para…»"><textarea className="entrada" value={pers.texto} onChange={(e) => setPers((x) => ({ ...x, texto: e.target.value }))} /></Campo>
      </Modal>
    </div>
  );
}
