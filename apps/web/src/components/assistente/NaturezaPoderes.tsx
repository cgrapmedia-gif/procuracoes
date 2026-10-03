'use client';
import { NATUREZAS_PODERES, NATUREZA_OMISSAO } from '@proc/core/browser';
import { Campo } from '../ui';
import { Rascunho } from './rascunho';

/** Natureza dos poderes conferidos: «a quem confere [poderes especiais] para…». */
export function NaturezaPoderes({ r, actualizar, editavel, comAbertura }: { r: Rascunho; actualizar: (fn: (x: Rascunho) => Rascunho) => void; editavel: boolean; comAbertura: boolean }) {
  const actual = r.naturezaPoderes?.trim() || NATUREZA_OMISSAO;
  const pre = NATUREZAS_PODERES.find(([, , t]) => t === actual);
  const codigo = pre ? pre[0] : 'OUTRA';
  return (
    <section className="cartao"><div className="corpo">
      <h3>Natureza dos poderes</h3>
      <div className="linha-form">
        <Campo rotulo="Tipo de poderes" ajuda="Define a fórmula do documento: «a quem confere … para».">
          <select className="entrada" disabled={!editavel} value={codigo} onChange={(e) => {
            const v = e.target.value;
            actualizar((x) => ({ ...x, naturezaPoderes: v === 'OUTRA' ? (pre ? '' : x.naturezaPoderes) : v === 'REPRESENTACAO' ? null : NATUREZAS_PODERES.find(([c]) => c === v)![2] }));
          }}>
            {NATUREZAS_PODERES.map(([c, rot]) => <option key={c} value={c}>{rot}</option>)}
            <option value="OUTRA">Outra (escrever)</option>
          </select>
        </Campo>
        {codigo === 'OUTRA' && (
          <Campo rotulo="Fórmula" ajuda="Ex.: «poderes especiais e bastantes», «os mais amplos poderes por lei permitidos»">
            <input className="entrada" disabled={!editavel} value={r.naturezaPoderes ?? ''} onChange={(e) => actualizar((x) => ({ ...x, naturezaPoderes: e.target.value }))} />
          </Campo>
        )}
      </div>
      {comAbertura
        ? <div className="aviso info small">O texto do poder escolhido já traz a sua própria fórmula («confere …»), que é usada tal como está.</div>
        : <p className="texto-juridico small" style={{ margin: 0 }}>… a quem confere <b>{actual}</b> para, …</p>}
    </div></section>
  );
}
