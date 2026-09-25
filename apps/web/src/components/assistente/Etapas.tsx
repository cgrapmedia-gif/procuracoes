import Link from 'next/link';
import { Icone } from '../Icone';

export const ETAPAS = ['Tipo', 'Outorgante', 'Procuradores', 'Poderes', 'Configuração', 'Cláusulas', 'Revisão', 'Pré-visualização', 'Emissão', 'Arquivo'];

/** Indicador de etapas. Com `id`, as etapas 2–10 são navegáveis (o rascunho é guardado continuamente, nada se perde). */
export function Etapas({ actual, id, bloqueadas = false }: { actual: number; id?: string; bloqueadas?: boolean }) {
  return (
    <ol className="etapas" aria-label="Etapas da procuração">
      {ETAPAS.map((e, i) => {
        const n = i + 1;
        const cls = n < actual ? 'feito' : n === actual ? 'actual' : '';
        const conteudo = <><span className="n">{n < actual ? <Icone n="certo" t={13} traco={2.4} /> : n}</span><span>{e}</span></>;
        const navegavel = id && n > 1 && (!bloqueadas || n >= 7);
        return (
          <li key={e} className={cls}>
            {navegavel ? <Link href={`/procuracoes/${id}?etapa=${n}`} aria-current={n === actual ? 'step' : undefined}>{conteudo}</Link> : <span className="e" aria-current={n === actual ? 'step' : undefined}>{conteudo}</span>}
            {n < ETAPAS.length && <span className="traco" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}
