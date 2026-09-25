/**
 * Campos dinâmicos dos poderes: tipos, validação e formatação para inserção no texto jurídico.
 */
import { dataCurta, moedaCompleta, parseDataISO } from './extenso';
import { juntarLista } from './genero';
import { biAngolaValido, codigoPostalPTValido, emailValido, formatarIban, ibanValido, nifAngolaValido, nifPortugalValido, telefoneValido } from './validadores';

export const TIPOS_CAMPO = [
  'TEXTO', 'TEXTO_LONGO', 'NUMERO', 'MOEDA', 'DATA', 'DATA_VALIDADE', 'MORADA', 'CODIGO_POSTAL', 'NIF',
  'NUM_IDENTIFICACAO', 'IBAN', 'TELEFONE', 'EMAIL', 'LISTA', 'SELECCAO_MULTIPLA', 'CHECKBOX', 'RADIO',
  'ENTIDADE', 'PESSOA', 'IMOVEL', 'VEICULO', 'EMPRESA',
] as const;
export type TipoCampo = (typeof TIPOS_CAMPO)[number];

export interface DefinicaoCampo {
  chave: string;               // usado no texto: {{chave}}
  rotulo: string;
  tipo: TipoCampo;
  obrigatorio: boolean;
  ajuda?: string;
  opcoes?: { valor: string; rotulo: string }[];
  validacao?: { regex?: string; mensagemRegex?: string; min?: number; max?: number; minComprimento?: number; maxComprimento?: number; pais?: 'AO' | 'PT' };
  moeda?: string;              // para MOEDA (AOA, EUR, USD)
  textoVerdadeiro?: string;    // CHECKBOX: texto inserido quando marcado
  textoFalso?: string;
}

export interface Morada { linha: string; codigoPostal?: string; localidade?: string; concelho?: string; provincia?: string; pais?: string }
export interface Imovel { tipo?: string; morada: string; freguesia?: string; concelho?: string; artigoMatricial?: string; conservatoria?: string; descricaoPredial?: string }
export interface Veiculo { marca: string; modelo?: string; matricula: string; quadro?: string }
export interface Empresa { denominacao: string; nif?: string; sede?: string; matricula?: string }
export interface RefEntidade { id: string; nome: string; texto?: string }
export interface RefPessoa { id: string; nome: string; texto?: string }

export type ValorCampo = string | number | boolean | string[] | Morada | Imovel | Veiculo | Empresa | RefEntidade | RefPessoa | null | undefined;

export interface ContextoValidacao { dataActo?: string }

function vazio(v: ValorCampo): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/** Devolve lista de mensagens de erro (vazia se válido). */
export function validarCampo(def: DefinicaoCampo, valor: ValorCampo, ctx: ContextoValidacao = {}): string[] {
  const e: string[] = [];
  if (vazio(valor)) { if (def.obrigatorio && def.tipo !== 'CHECKBOX') e.push(`${def.rotulo}: preenchimento obrigatório.`); return e; }
  const s = typeof valor === 'string' ? valor.trim() : '';
  const v = def.validacao ?? {};
  switch (def.tipo) {
    case 'NUMERO': case 'MOEDA': {
      const n = typeof valor === 'number' ? valor : Number(String(valor).replace(',', '.'));
      if (!Number.isFinite(n)) e.push(`${def.rotulo}: valor numérico inválido.`);
      else { if (v.min !== undefined && n < v.min) e.push(`${def.rotulo}: mínimo ${v.min}.`); if (v.max !== undefined && n > v.max) e.push(`${def.rotulo}: máximo ${v.max}.`); }
      break;
    }
    case 'DATA': case 'DATA_VALIDADE': {
      try {
        const d = parseDataISO(s);
        if (def.tipo === 'DATA_VALIDADE' && ctx.dataActo && d < parseDataISO(ctx.dataActo)) e.push(`${def.rotulo}: expirada na data do acto.`);
      } catch { e.push(`${def.rotulo}: data inválida (AAAA-MM-DD).`); }
      break;
    }
    case 'NIF':
      if (v.pais === 'PT' ? !nifPortugalValido(s) : v.pais === 'AO' ? !nifAngolaValido(s) : !(nifPortugalValido(s) || nifAngolaValido(s))) e.push(`${def.rotulo}: NIF inválido.`);
      break;
    case 'NUM_IDENTIFICACAO': if (v.pais === 'AO' && !biAngolaValido(s)) e.push(`${def.rotulo}: n.º de BI inválido (ex.: 000000000LA000).`); break;
    case 'IBAN': if (!ibanValido(s)) e.push(`${def.rotulo}: IBAN inválido.`); break;
    case 'CODIGO_POSTAL': if (!codigoPostalPTValido(s)) e.push(`${def.rotulo}: código postal inválido (0000-000).`); break;
    case 'EMAIL': if (!emailValido(s)) e.push(`${def.rotulo}: email inválido.`); break;
    case 'TELEFONE': if (!telefoneValido(s)) e.push(`${def.rotulo}: telefone inválido.`); break;
    case 'LISTA': case 'RADIO':
      if (def.opcoes && !def.opcoes.some((o) => o.valor === valor)) e.push(`${def.rotulo}: opção inválida.`); break;
    case 'SELECCAO_MULTIPLA':
      if (!Array.isArray(valor) || (def.opcoes && valor.some((x) => !def.opcoes!.some((o) => o.valor === x)))) e.push(`${def.rotulo}: selecção inválida.`); break;
    case 'IMOVEL': if (!(valor as Imovel).morada) e.push(`${def.rotulo}: indique pelo menos a localização do imóvel.`); break;
    case 'VEICULO': if (!(valor as Veiculo).matricula) e.push(`${def.rotulo}: matrícula obrigatória.`); break;
    case 'EMPRESA': if (!(valor as Empresa).denominacao) e.push(`${def.rotulo}: denominação obrigatória.`); break;
    case 'ENTIDADE': case 'PESSOA': if (!(valor as RefEntidade).id) e.push(`${def.rotulo}: seleccione um registo.`); break;
    default: break;
  }
  if (s && v.minComprimento && s.length < v.minComprimento) e.push(`${def.rotulo}: mínimo ${v.minComprimento} caracteres.`);
  if (s && v.maxComprimento && s.length > v.maxComprimento) e.push(`${def.rotulo}: máximo ${v.maxComprimento} caracteres.`);
  if (s && v.regex && !new RegExp(v.regex).test(s)) e.push(v.mensagemRegex ?? `${def.rotulo}: formato inválido.`);
  return e;
}

const rotuloOpcao = (def: DefinicaoCampo, x: string) => def.opcoes?.find((o) => o.valor === x)?.rotulo ?? x;

/** Converte o valor em texto pronto a inserir no texto jurídico. */
export function formatarCampo(def: DefinicaoCampo, valor: ValorCampo): string {
  if (vazio(valor)) return def.tipo === 'CHECKBOX' ? (def.textoFalso ?? '') : '';
  switch (def.tipo) {
    case 'MOEDA': return moedaCompleta(Number(valor), def.moeda ?? 'AOA');
    case 'DATA': case 'DATA_VALIDADE': return dataCurta(String(valor));
    case 'IBAN': return formatarIban(String(valor));
    case 'NIF': case 'NUM_IDENTIFICACAO': return String(valor).toUpperCase().replace(/\s/g, '');
    case 'CHECKBOX': return valor ? (def.textoVerdadeiro ?? 'sim') : (def.textoFalso ?? '');
    case 'LISTA': case 'RADIO': return rotuloOpcao(def, String(valor));
    case 'SELECCAO_MULTIPLA': return juntarLista((valor as string[]).map((x) => rotuloOpcao(def, x)));
    case 'MORADA': { const m = valor as Morada; return [m.linha, m.codigoPostal && m.localidade ? `${m.codigoPostal} ${m.localidade}` : m.localidade, m.concelho && `concelho de ${m.concelho}`, m.provincia && `Província de ${m.provincia}`, m.pais].filter(Boolean).join(', '); }
    case 'IMOVEL': { const i = valor as Imovel; return [`${i.tipo ?? 'imóvel'} sito em ${i.morada}`, i.freguesia && `freguesia de ${i.freguesia}`, i.concelho && `concelho de ${i.concelho}`, i.artigoMatricial && `inscrito na matriz sob o artigo ${i.artigoMatricial}`, i.conservatoria && i.descricaoPredial && `descrito na ${i.conservatoria} sob o n.º ${i.descricaoPredial}`].filter(Boolean).join(', '); }
    case 'VEICULO': { const v = valor as Veiculo; return [`veículo automóvel da marca ${v.marca}`, v.modelo && `modelo ${v.modelo}`, `com a matrícula ${v.matricula}`, v.quadro && `n.º de quadro ${v.quadro}`].filter(Boolean).join(', '); }
    case 'EMPRESA': { const c = valor as Empresa; return [`${c.denominacao}`, c.nif && `NIF ${c.nif}`, c.sede && `com sede em ${c.sede}`, c.matricula && `matriculada sob o n.º ${c.matricula}`].filter(Boolean).join(', '); }
    case 'ENTIDADE': case 'PESSOA': { const r = valor as RefEntidade; return r.texto ?? r.nome; }
    default: return String(valor);
  }
}
