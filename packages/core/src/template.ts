/**
 * Motor de templates seguro, baseado em Handlebars isolado:
 *  - só helpers conhecidos (knownHelpersOnly) — nada de código arbitrário;
 *  - modo estrito: variável inexistente = erro (não gera documento com lacunas silenciosas);
 *  - saída em TEXTO simples; o escaping HTML é feito pelo renderizador, não aqui.
 */
import Handlebars from 'handlebars';
import { dataCurta, dataPorExtenso, moedaCompleta, numeroPorExtenso } from './extenso';
import { ComSexo, concordar, juntarLista } from './genero';

const hb = Handlebars.create();

export class ErroTemplate extends Error {
  constructor(msg: string, public readonly origem: string) { super(msg); }
}

const HELPERS: Record<string, Handlebars.HelperDelegate> = {
  upper: (s: unknown) => String(s ?? '').toLocaleUpperCase('pt'),
  lower: (s: unknown) => String(s ?? '').toLocaleLowerCase('pt'),
  extenso: (n: unknown) => numeroPorExtenso(Number(n)),
  extensoData: (d: unknown) => dataPorExtenso(String(d)),
  dataCurta: (d: unknown) => dataCurta(String(d)),
  moeda: (n: unknown, codigo: unknown) => moedaCompleta(Number(n), typeof codigo === 'string' ? codigo : 'AOA'),
  /** {{flex pessoaOuLista "masc" "fem" ["mascPlural" "femPlural"]}} */
  flex: (alvo: unknown, ms: string, fs: string, ...resto: unknown[]) => {
    const extra = resto.slice(0, -1) as string[]; // último argumento = options do Handlebars
    const pessoas = alvo as ComSexo | ComSexo[];
    if (!pessoas || (Array.isArray(pessoas) && pessoas.length === 0)) throw new Error('flex: sem pessoas para concordar');
    return concordar(pessoas, { ms, fs, mp: extra[0], fp: extra[1] });
  },
  /** {{lista procuradores "identificacao"}} -> "A, B e C" */
  lista: (arr: unknown, prop: unknown, ...resto: unknown[]) => {
    const conj = resto.length > 1 ? String(resto[0]) : 'e';
    const itens = Array.isArray(arr) ? arr : [];
    return juntarLista(itens.map((x) => (typeof prop === 'string' ? String((x as Record<string, unknown>)[prop] ?? '') : String(x))), conj);
  },
  eq: (a: unknown, b: unknown) => a === b,
  gt: (a: unknown, b: unknown) => Number(a) > Number(b),
};
for (const [nome, fn] of Object.entries(HELPERS)) hb.registerHelper(nome, fn);

hb.unregisterHelper('lookup');
hb.unregisterHelper('log');
const KNOWN: Record<string, boolean> = { ...Object.fromEntries([...Object.keys(HELPERS), 'if', 'unless', 'each', 'with'].map((k) => [k, true])), lookup: false, log: false };



/** Valida o template (sintaxe + apenas helpers conhecidos). Não executa nem avalia código. */
export function compilar(src: string): void {
  if (validados.has(src)) return;
  try { hb.precompile(src, { strict: true, noEscape: true, knownHelpers: KNOWN, knownHelpersOnly: true }); }
  catch (e) { throw new ErroTemplate(`Template inválido: ${(e as Error).message}`, src); }
  validados.add(src);
}
const validados = new Set<string>();

/**
 * Interpretador do AST do Handlebars — sem `new Function`/eval. Funciona com CSP estrita no browser
 * e garante que servidor e browser produzem exactamente o mesmo texto.
 */
type No = hbs.AST.Node;
const proprio = (o: unknown, k: string) => o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);

function resolver(p: hbs.AST.PathExpression, pilha: unknown[], dados: Record<string, unknown>, estrito: boolean): unknown {
  if (p.data) return dados[p.parts[0]];
  let alvo = pilha[Math.max(0, pilha.length - 1 - p.depth)];
  if (p.parts.length === 0) return alvo; // this / .
  for (const parte of p.parts) {
    if (!proprio(alvo, parte)) {
      if (estrito) throw new Error(`"${p.original}" not defined`);
      return undefined;
    }
    alvo = (alvo as Record<string, unknown>)[parte];
  }
  return alvo;
}

function valor(n: hbs.AST.Expression, pilha: unknown[], dados: Record<string, unknown>, estrito = true): unknown {
  switch (n.type) {
    case 'StringLiteral': case 'NumberLiteral': case 'BooleanLiteral': return (n as hbs.AST.StringLiteral).value;
    case 'UndefinedLiteral': return undefined;
    case 'NullLiteral': return null;
    case 'PathExpression': return resolver(n as hbs.AST.PathExpression, pilha, dados, estrito);
    case 'SubExpression': { const s = n as hbs.AST.SubExpression; return chamar((s.path as hbs.AST.PathExpression).original, s.params, pilha, dados); }
    default: throw new ErroTemplate(`Expressão não suportada: ${n.type}`, '');
  }
}

function chamar(nome: string, params: hbs.AST.Expression[], pilha: unknown[], dados: Record<string, unknown>): unknown {
  const h = proprio(HELPERS, nome) ? HELPERS[nome] : undefined;
  if (!h) throw new Error(`Helper desconhecido: ${nome}`);
  return (h as (...a: unknown[]) => unknown)(...params.map((x) => valor(x, pilha, dados)), { hash: {}, data: dados });
}

const verdadeiro = (v: unknown) => !(v === undefined || v === null || v === false || v === '' || v === 0 || (Array.isArray(v) && v.length === 0));

function executar(nos: hbs.AST.Statement[], pilha: unknown[], dados: Record<string, unknown>): string {
  let out = '';
  for (const n of nos as No[]) {
    if (n.type === 'ContentStatement') out += (n as hbs.AST.ContentStatement).value;
    else if (n.type === 'MustacheStatement') {
      const m = n as hbs.AST.MustacheStatement;
      const caminho = m.path as hbs.AST.PathExpression;
      const v = m.params.length || proprio(HELPERS, caminho.original) ? chamar(caminho.original, m.params, pilha, dados) : valor(caminho, pilha, dados);
      out += v === undefined || v === null ? '' : String(v);
    } else if (n.type === 'BlockStatement') {
      const b = n as hbs.AST.BlockStatement;
      const nome = (b.path as hbs.AST.PathExpression).original;
      if (nome === 'if' || nome === 'unless') {
        const c = verdadeiro(valor(b.params[0], pilha, dados, false));
        const ramo = (nome === 'if' ? c : !c) ? b.program : b.inverse;
        if (ramo) out += executar(ramo.body, pilha, dados);
      } else if (nome === 'each') {
        const lista = valor(b.params[0], pilha, dados, false);
        if (Array.isArray(lista) && lista.length) lista.forEach((it, i) => { out += executar(b.program.body, [...pilha, it], { ...dados, index: i, first: i === 0, last: i === lista.length - 1 }); });
        else if (b.inverse) out += executar(b.inverse.body, pilha, dados);
      } else if (nome === 'with') {
        const v = valor(b.params[0], pilha, dados, false);
        if (verdadeiro(v)) out += executar(b.program.body, [...pilha, v], dados); else if (b.inverse) out += executar(b.inverse.body, pilha, dados);
      } else throw new Error(`Bloco não suportado: ${nome}`);
    }
    // CommentStatement e outros: ignorados
  }
  return out;
}

const cacheAst = new Map<string, hbs.AST.Program>();

export function renderizar(src: string, ctx: object): string {
  let ast = cacheAst.get(src);
  if (!ast) {
    compilar(src); // valida sintaxe e helpers permitidos (sem executar código)
    ast = hb.parse(src);
    cacheAst.set(src, ast);
  }
  try { return executar(ast.body, [ctx], {}); } catch (e) {
    if (e instanceof ErroTemplate) throw e;
    throw new ErroTemplate(`Erro ao preencher template: ${(e as Error).message}`, src);
  }
}

/** Extrai as variáveis de topo referidas num template (para validar contra os campos definidos do poder). */
export function variaveisDoTemplate(src: string): string[] {
  const ast = hb.parse(src);
  const encontrados = new Set<string>();
  const blocoLocais: string[][] = [];
  const visitarExpr = (n: hbs.AST.Expression | undefined) => {
    if (!n) return;
    if (n.type === 'PathExpression') {
      const p = n as hbs.AST.PathExpression;
      if (p.data || p.parts.length === 0 || p.original.startsWith('this') || p.original.startsWith('../')) return;
      if (blocoLocais.length > 0) return; // dentro de #each/#with o contexto muda
      encontrados.add(p.parts[0]);
    } else if (n.type === 'SubExpression') {
      const s = n as hbs.AST.SubExpression;
      s.params.forEach(visitarExpr);
    }
  };
  const visitar = (nodes: hbs.AST.Statement[]) => {
    for (const n of nodes) {
      if (n.type === 'MustacheStatement') {
        const m = n as hbs.AST.MustacheStatement;
        if (m.params.length === 0) visitarExpr(m.path as hbs.AST.Expression); else m.params.forEach(visitarExpr);
      } else if (n.type === 'BlockStatement') {
        const b = n as hbs.AST.BlockStatement;
        b.params.forEach(visitarExpr);
        const muda = ['each', 'with'].includes((b.path as hbs.AST.PathExpression).original);
        if (muda) blocoLocais.push([]);
        if (b.program) visitar(b.program.body);
        if (muda) blocoLocais.pop();
        if (b.inverse) visitar(b.inverse.body);
      }
    }
  };
  visitar(ast.body);
  return [...encontrados];
}
