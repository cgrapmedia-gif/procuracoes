/**
 * Concordância de género e número.
 * Achado no corpus analisado: 9 documentos com "sua bastante procurador" — erro que o motor elimina.
 */
export type Sexo = 'M' | 'F';
export interface ComSexo { sexo: Sexo }

export interface Formas { ms: string; fs: string; mp?: string; fp?: string }

/** Escolhe a forma correcta para uma pessoa ou grupo. Plural feminino só se TODAS forem do sexo feminino. */
export function concordar(pessoas: ComSexo | ComSexo[], f: Formas): string {
  const lista = Array.isArray(pessoas) ? pessoas : [pessoas];
  if (lista.length === 0) throw new Error('Concordância sem pessoas');
  if (lista.length === 1) return lista[0].sexo === 'F' ? f.fs : f.ms;
  const todasF = lista.every((p) => p.sexo === 'F');
  const mp = f.mp ?? pluralizar(f.ms);
  const fp = f.fp ?? pluralizar(f.fs);
  return todasF ? fp : mp;
}

/** Pluralização simples, suficiente para as expressões usuais em procurações. */
export function pluralizar(expr: string): string {
  return expr.split(' ').map((w) => {
    const low = w.toLowerCase();
    const irregular: Record<string, string> = { seu: 'seus', sua: 'suas', o: 'os', a: 'as', do: 'dos', da: 'das', ao: 'aos', à: 'às', senhor: 'senhores', senhora: 'senhoras' };
    if (irregular[low]) return matchCase(w, irregular[low]);
    if (/(ão)$/i.test(w)) return w.replace(/ão$/i, 'ões');
    if (/(r|z)$/i.test(w)) return w + 'es';
    if (/l$/i.test(w)) return w.replace(/l$/i, 'is');
    if (/[aeiouáéíóúâêô]$/i.test(w)) return w + 's';
    return w;
  }).join(' ');
}

function matchCase(orig: string, alvo: string): string {
  if (orig === orig.toUpperCase() && orig !== orig.toLowerCase()) return alvo.toUpperCase();
  if (orig[0] === orig[0].toUpperCase()) return alvo[0].toUpperCase() + alvo.slice(1);
  return alvo;
}

export type EstadoCivil = 'SOLTEIRO' | 'CASADO' | 'DIVORCIADO' | 'VIUVO' | 'SEPARADO' | 'UNIAO_FACTO';
const ESTADO_CIVIL: Record<EstadoCivil, Formas> = {
  SOLTEIRO: { ms: 'solteiro', fs: 'solteira' },
  CASADO: { ms: 'casado', fs: 'casada' },
  DIVORCIADO: { ms: 'divorciado', fs: 'divorciada' },
  VIUVO: { ms: 'viúvo', fs: 'viúva' },
  SEPARADO: { ms: 'separado judicialmente de pessoas e bens', fs: 'separada judicialmente de pessoas e bens' },
  UNIAO_FACTO: { ms: 'em união de facto', fs: 'em união de facto' },
};
export function estadoCivilTexto(e: EstadoCivil, sexo: Sexo): string { return concordar({ sexo }, ESTADO_CIVIL[e]); }

/** Junta nomes: ["A","B","C"] -> "A, B e C" */
export function juntarLista(itens: string[], conj = 'e'): string {
  const v = itens.filter(Boolean);
  if (v.length <= 1) return v[0] ?? '';
  return `${v.slice(0, -1).join(', ')} ${conj} ${v[v.length - 1]}`;
}
