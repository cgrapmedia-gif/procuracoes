'use client';
import { useMemo, useState } from 'react';
import { comporPoderes, renderizarPoder, validarCampo, TEM_ABERTURA, NATUREZA_OMISSAO } from '@proc/core/browser';
import { PoderCatalogo } from '@/lib/tipos';
import { Icone } from '../Icone';
import { Vazio } from '../ui';
import { CampoDinamico } from './CampoDinamico';
import { Rascunho, paraMotor } from './rascunho';

/** Contexto mínimo das partes para pré-visualizar concordâncias sem ir ao servidor. */
export function contextoPartes(r: Rascunho) {
  const p = (x: { nome: string; sexo: 'M' | 'F' | null }) => ({ nome: x.nome, sexo: (x.sexo ?? 'M') as 'M' | 'F', nomeMaiusculas: x.nome.toUpperCase() });
  const outorgantes = r.outorgantes.length ? r.outorgantes.map(p) : [{ nome: '', sexo: 'M' as const, nomeMaiusculas: '' }];
  const procuradores = r.procuradores.length ? r.procuradores.map(p) : [{ nome: '', sexo: 'M' as const, nomeMaiusculas: '' }];
  return { outorgantes, outorgante: outorgantes[0], procuradores, procurador: procuradores[0], documento: { dataExtenso: '', numero: 'RASCUNHO' }, posto: {} };
}

export function textoPrevio(r: Rascunho, catalogo: Map<string, PoderCatalogo>, clausulas = false): { html: { t: string; campo: boolean; negrito?: boolean }[] } {
  const ctx = contextoPartes(r);
  const textos = paraMotor(r.itens.filter((i) => i.clausula === clausulas), catalogo).map((m) => { try { return renderizarPoder(m, ctx, { preVisualizacao: true }); } catch { return `[${m.versao.nome}]`; } });
  const prosa = clausulas ? textos.join(' ') : comporPoderes(textos, { modo: 'PROSA', separador: '; ', ultimoSeparador: '; e ' }).prosa;
  return { html: prosa.split(/(⟦[^⟧]+⟧|\*\*[^*]+\*\*)/g).filter(Boolean).map((t) => ({ t: t.replace(/[⟦⟧]|\*\*/g, ''), campo: t.startsWith('⟦'), negrito: t.startsWith('**') })) };
}

export function EtapaConfiguracao({ r, actualizar, catalogo, editavel, clausulas = false }: { r: Rascunho; actualizar: (fn: (x: Rascunho) => Rascunho) => void; catalogo: PoderCatalogo[]; editavel: boolean; clausulas?: boolean }) {
  const porCodigo = useMemo(() => new Map(catalogo.map((p) => [p.codigo, p])), [catalogo]);
  const itens = r.itens.filter((i) => i.clausula === clausulas);
  const [aberto, setAberto] = useState<string | null>(itens.find((i) => i.campos.length)?.uid ?? null);
  const estado = (uid: string) => { const i = r.itens.find((x) => x.uid === uid)!; if (!i.campos.length) return 'sem'; const n = i.campos.reduce((a, c) => a + validarCampo(c, i.valores[c.chave], { dataActo: r.dataActo }).length, 0); return n ? `${n}` : 'ok'; };
  const previo = textoPrevio(r, porCodigo, clausulas);
  const completos = itens.filter((i) => estado(i.uid) === 'ok').length; const semCampos = itens.filter((i) => estado(i.uid) === 'sem').length; const comErro = itens.length - completos - semCampos;
  const mudar = (uid: string, chave: string, v: unknown) => actualizar((x) => ({ ...x, itens: x.itens.map((i) => (i.uid === uid ? { ...i, valores: { ...i.valores, [chave]: v as never } } : i)) }));
  if (!itens.length) return <Vazio>Ainda não há {clausulas ? 'cláusulas' : 'poderes'} para configurar.</Vazio>;
  return (
    <div className="grelha" style={{ gridTemplateColumns: 'minmax(0, 1fr) 400px', alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {itens.map((i, n) => {
          const e = estado(i.uid); const open = aberto === i.uid && i.campos.length > 0;
          return (
            <section key={i.uid} className="cartao">
              <h3 style={{ margin: 0 }}>
                <button onClick={() => setAberto(open ? null : i.uid)} aria-expanded={open} disabled={!i.campos.length} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', background: 'none', border: 0, cursor: i.campos.length ? 'pointer' : 'default', textAlign: 'left', fontFamily: 'var(--sans)', fontSize: 15 }}>
                  <span className="escolhido" style={{ padding: 0, border: 0, background: 'none' }}><span className="num">{n + 1}</span></span>
                  <span style={{ flex: 1 }}><span style={{ fontWeight: 600 }}>{i.nome}</span><br /><span className="small muted mono">{i.codigo}{i.versao ? ` v${i.versao}` : ''}</span></span>
                  <span className="small" style={{ fontWeight: 600, color: e === 'ok' ? 'var(--verde)' : e === 'sem' ? 'var(--mudo)' : 'var(--carmim)' }}>{e === 'ok' ? 'Completo' : e === 'sem' ? 'Sem campos' : `${e} por corrigir`}</span>
                  {i.campos.length > 0 && <Icone n={open ? 'baixo' : 'seta'} t={16} />}
                </button>
              </h3>
              {open && <div style={{ padding: '4px 18px 18px', borderTop: '1px solid var(--linha)', display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 16 }}>
                {porCodigo.get(i.codigo)?.textoAlternativo && <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" disabled={!editavel} checked={i.usarAlternativo} onChange={(ev) => actualizar((x) => ({ ...x, itens: x.itens.map((y) => (y.uid === i.uid ? { ...y, usarAlternativo: ev.target.checked } : y)) }))} />Usar a redacção alternativa aprovada</label>}
                <div className="linha-form">{i.campos.map((c) => <div key={c.chave} style={{ gridColumn: ['SELECCAO_MULTIPLA', 'IMOVEL', 'MORADA', 'VEICULO', 'EMPRESA', 'TEXTO_LONGO'].includes(c.tipo) ? '1 / -1' : undefined }}><CampoDinamico def={c} valor={i.valores[c.chave]} dataActo={r.dataActo} desactivado={!editavel} mudar={(v) => mudar(i.uid, c.chave, v)} /></div>)}</div>
              </div>}
            </section>
          );
        })}
      </div>
      <aside style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 80 }}>
        <section className="cartao"><div className="corpo">
          <h2>Texto em tempo real</h2>
          <p className="texto-juridico" style={{ fontSize: 13, textAlign: 'justify' }}>{!clausulas && (TEM_ABERTURA.test(previo.html.map((p) => p.t).join('')) ? '… a quem ' : `… a quem confere ${r.naturezaPoderes?.trim() || NATUREZA_OMISSAO} para, `)}{previo.html.map((p, k) => (p.campo ? <mark key={k}>[{p.t}]</mark> : p.negrito ? <b key={k}>{p.t}</b> : <span key={k}>{p.t}</span>))}{!clausulas && '.'}</p>
          <span className="small muted">Os campos por preencher aparecem destacados. A concordância usa o sexo registado das partes.</span>
        </div></section>
        <section className="cartao"><div className="corpo" style={{ gap: 6 }}>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5 }}><Icone n="certo" t={15} cor="var(--verde)" traco={2.2} />{completos + semCampos} de {itens.length} prontos</span>
          {comErro > 0 && <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, color: 'var(--carmim)' }}><Icone n="alerta" t={15} />{comErro} com campos por corrigir</span>}
        </div></section>
      </aside>
    </div>
  );
}
