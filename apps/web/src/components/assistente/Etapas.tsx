import Link from 'next/link';
import { Icone } from '../Icone';

export const ETAPAS = ['Tipo', 'Outorgante', 'Procuradores', 'Poderes', 'Configuração', 'Cláusulas', 'Revisão', 'Pré-visualização', 'Emissão', 'Arquivo'];

/** Indicador de etapas. Com `id`, as etapas 2–10 são navegáveis (o rascunho é guardado continuamente, nada se perde). */
export const DICAS: Record<number, string> = {
  2: 'Pesquise pelo nome (qualquer ordem), NIF ou n.º do BI. Se a pessoa não existir, registe-a sem sair daqui.',
  3: 'Com mais de um procurador, escolha como actuam (isoladamente, em conjunto…).',
  4: 'Escolha os poderes do catálogo. A ordem da lista à direita é a ordem no documento; arraste para reordenar.',
  5: 'Preencha os campos de cada poder. O texto final à direita actualiza-se enquanto escreve.',
  6: 'Cláusulas finais são opcionais (substabelecimento, validade, artigo 262.º…).',
  7: 'Tudo a verde? Então pode seguir. Cada pendência tem um atalho para a corrigir.',
  8: 'É o documento tal como vai sair. Confira nomes, datas e poderes.',
  9: 'Submeta para revisão ou, se o seu perfil o permitir, emita directamente.',
  10: 'Descarregue o PDF, carregue a versão assinada e consulte o histórico.',
};

/** Estado de cada etapa: 'ok' (completa) ou 'falta' (tem pendências). */
export type EstadoEtapa = 'ok' | 'falta';

export function Etapas({ actual, id, bloqueadas = false, estados = {} }: { actual: number; id?: string; bloqueadas?: boolean; estados?: Partial<Record<number, EstadoEtapa>> }) {
  return (
    <ol className="etapas" aria-label="Etapas da procuração">
      {ETAPAS.map((e, i) => {
        const n = i + 1;
        const est = estados[n];
        const feito = est ? est === 'ok' : n < actual;
        const cls = n === actual ? 'actual' : est === 'falta' && n < actual ? 'falta' : feito ? 'feito' : '';
        const conteudo = <><span className="n" title={est === 'falta' ? 'Tem pendências' : feito ? 'Completa' : undefined}>{feito && n !== actual ? <Icone n="certo" t={13} traco={2.4} /> : est === 'falta' && n !== actual ? '!' : n}</span><span>{e}</span></>;
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
