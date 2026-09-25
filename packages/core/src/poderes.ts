/**
 * Poderes: definição versionada, instância seleccionada numa procuração e composição do texto.
 * A procuração referencia SEMPRE uma versão concreta do poder (nunca o poder "vivo").
 */
import { DefinicaoCampo, ValorCampo, formatarCampo } from './campos';
import { juntarLista } from './genero';
import { renderizar, variaveisDoTemplate } from './template';

export type TipoRegra = 'REQUER' | 'INCOMPATIVEL' | 'SUGERE';

export interface RegraPoder { tipo: TipoRegra; alvoCodigo: string; mensagem?: string }

export interface VersaoPoder {
  poderId: string;
  versaoId: string;
  numeroVersao: number;
  codigo: string;               // estável entre versões, ex.: BANC-001
  nome: string;
  categoria: string;
  texto: string;                // texto jurídico com {{variaveis}}
  textoAlternativo?: string;
  campos: DefinicaoCampo[];
  exclusivo?: boolean;          // não pode coexistir com outros poderes
  tiposPermitidos?: string[];   // códigos de tipo de procuração; vazio = todos
  regras: RegraPoder[];
}

export interface PoderSeleccionado {
  instanciaId: string;          // permite o mesmo poder duas vezes (ex.: dois imóveis)
  versao: VersaoPoder;
  valores: Record<string, ValorCampo>;
  usarAlternativo?: boolean;
  /** Poder personalizado (texto livre) — só com permissão POA_CUSTOM_POWER; fica marcado no documento e na auditoria. */
  personalizado?: boolean;
}

/** Garante coerência entre o texto e os campos: todas as variáveis têm campo e vice-versa. */
export function verificarDefinicaoPoder(v: Pick<VersaoPoder, 'texto' | 'textoAlternativo' | 'campos'>, variaveisGlobais: string[] = ['outorgante', 'outorgantes', 'procurador', 'procuradores', 'documento', 'posto']): string[] {
  const erros: string[] = [];
  const chaves = new Set(v.campos.map((c) => c.chave));
  const dup = v.campos.map((c) => c.chave).filter((c, i, a) => a.indexOf(c) !== i);
  if (dup.length) erros.push(`Campos duplicados: ${[...new Set(dup)].join(', ')}`);
  for (const [nome, txt] of [['texto', v.texto], ['textoAlternativo', v.textoAlternativo]] as const) {
    if (!txt) continue;
    let vars: string[] = [];
    try { vars = variaveisDoTemplate(txt); } catch (e) { erros.push(`${nome}: sintaxe inválida (${(e as Error).message.split('\n')[0]})`); continue; }
    for (const x of vars) if (!chaves.has(x) && !variaveisGlobais.includes(x)) erros.push(`${nome}: variável {{${x}}} não corresponde a nenhum campo.`);
  }
  const usados = new Set([...(safeVars(v.texto)), ...(v.textoAlternativo ? safeVars(v.textoAlternativo) : [])]);
  for (const c of v.campos) if (c.obrigatorio && !usados.has(c.chave)) erros.push(`Campo obrigatório "${c.chave}" não é usado no texto.`);
  return erros;
}
const safeVars = (t: string) => { try { return variaveisDoTemplate(t); } catch { return []; } };

export interface OpcoesRender {
  /** Em pré-visualização, campos vazios aparecem como ⟦Rótulo⟧ em vez de gerar erro. */
  preVisualizacao?: boolean;
}

export function renderizarPoder(p: PoderSeleccionado, ctxPartes: object, opts: OpcoesRender = {}): string {
  const valores: Record<string, unknown> = {};
  for (const c of p.versao.campos) {
    const bruto = p.valores[c.chave];
    const txt = formatarCampo(c, bruto);
    valores[c.chave] = txt === '' && opts.preVisualizacao && c.obrigatorio && c.tipo !== 'CHECKBOX' ? `⟦${c.rotulo}⟧` : txt;
  }
  const fonte = p.usarAlternativo && p.versao.textoAlternativo ? p.versao.textoAlternativo : p.versao.texto;
  return normalizarEspacos(renderizar(fonte, { ...ctxPartes, ...valores }));
}

export const normalizarEspacos = (s: string) => s.replace(/\s+/g, ' ').replace(/\s+([,.;:])/g, '$1').trim();

export type ModoPoderes = 'PROSA' | 'LISTA';
export interface ConfigPoderes { modo: ModoPoderes; separador?: string; ultimoSeparador?: string; numeracao?: 'a)' | '1.' | 'i)' }

const ROMANOS = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv', 'xv', 'xvi', 'xvii', 'xviii', 'xix', 'xx'];
export function marcador(i: number, estilo: ConfigPoderes['numeracao'] = 'a)'): string {
  if (estilo === '1.') return `${i + 1}.`;
  if (estilo === 'i)') return `${ROMANOS[i] ?? i + 1})`;
  // a) … z), aa) …
  let n = i, s = '';
  do { s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return `${s})`;
}

/** Remove pontuação final, preservando abreviaturas ("S.A.", "Lda."). */
export function limparFinal(t: string): string {
  let s = t.replace(/[\s;,]+$/, '');
  if (s.endsWith('.') && !/((\b[A-Za-z]\.){2,}|\b(Lda|Ltda|Ltd|Sr|Sra|Dr|Dra|Exmo|Exma|Inc|Cia|n\.º)\.)$/i.test(s)) s = s.slice(0, -1).replace(/[\s;,]+$/, '');
  return s;
}

/** Junta os textos pela ordem escolhida pelo utilizador. PROSA: uma frase contínua; LISTA: alíneas. */
export function comporPoderes(textos: string[], cfg: ConfigPoderes): { prosa: string; alineas: { marcador: string; texto: string }[] } {
  const limpos = textos.map(limparFinal);
  if (cfg.modo === 'LISTA') {
    const alineas = limpos.map((t, i) => ({ marcador: marcador(i, cfg.numeracao), texto: `${t}${i === limpos.length - 1 ? (t.endsWith('.') ? '' : '.') : ';'}` }));
    return { prosa: '', alineas };
  }
  const sep = cfg.separador ?? '; ';
  const ult = cfg.ultimoSeparador ?? '; e ';
  const prosa = limpos.length <= 1 ? (limpos[0] ?? '') : `${limpos.slice(0, -1).join(sep)}${ult}${limpos[limpos.length - 1]}`;
  return { prosa, alineas: [] };
}

export { juntarLista };
