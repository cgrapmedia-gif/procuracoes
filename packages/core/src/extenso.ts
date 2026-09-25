/**
 * Números, datas e valores monetários por extenso (norma pt-AO / pt-PT, escala longa).
 * Ex.: 2026 -> "dois mil e vinte e seis"; 1e9 -> "mil milhões".
 */
export type Genero = 'M' | 'F';

const UNI_M = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
const UNI_F = ['', 'uma', 'duas', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
const DEZ_A_DEZANOVE = ['dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezasseis', 'dezassete', 'dezoito', 'dezanove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENT_M = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
const CENT_F = ['', 'cento', 'duzentas', 'trezentas', 'quatrocentas', 'quinhentas', 'seiscentas', 'setecentas', 'oitocentas', 'novecentas'];

function ate999(n: number, g: Genero): string {
  if (n === 0) return '';
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100);
  const r = n % 100;
  const partes: string[] = [];
  if (c) partes.push((g === 'F' ? CENT_F : CENT_M)[c]);
  if (r >= 10 && r < 20) partes.push(DEZ_A_DEZANOVE[r - 10]);
  else {
    const d = Math.floor(r / 10);
    const u = r % 10;
    if (d) partes.push(DEZENAS[d]);
    if (u) partes.push((g === 'F' ? UNI_F : UNI_M)[u]);
  }
  return partes.join(' e ');
}

// Escala longa: 10^6 milhão, 10^9 mil milhões, 10^12 bilião
const ESCALAS: { sing: string; plur: string; genero: Genero }[] = [
  { sing: '', plur: '', genero: 'M' },
  { sing: 'mil', plur: 'mil', genero: 'M' },
  { sing: 'um milhão', plur: 'milhões', genero: 'M' },
  { sing: 'mil milhões', plur: 'mil milhões', genero: 'M' },
  { sing: 'um bilião', plur: 'biliões', genero: 'M' },
];

/** Inteiro não-negativo por extenso. `genero` aplica-se às unidades/centenas finais (ex.: "duas horas"). */
export function numeroPorExtenso(valor: number, genero: Genero = 'M'): string {
  if (!Number.isInteger(valor) || valor < 0) throw new RangeError('Esperado inteiro não-negativo');
  if (valor >= 1e15) throw new RangeError('Valor fora do intervalo suportado');
  if (valor === 0) return 'zero';

  const grupos: number[] = [];
  let n = valor;
  while (n > 0) { grupos.push(n % 1000); n = Math.floor(n / 1000); }

  const blocos: { texto: string; valor: number }[] = [];
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i];
    if (!g) continue;
    const gen: Genero = i === 0 ? genero : i === 1 ? genero : 'M';
    let texto: string;
    if (i === 0) texto = ate999(g, gen);
    else if (i === 1) texto = g === 1 ? 'mil' : `${ate999(g, gen)} mil`;
    else if (i === 3) texto = g === 1 ? 'mil milhões' : `${ate999(g, 'M')} mil milhões`;
    else { const e = ESCALAS[i]; texto = g === 1 ? e.sing : `${ate999(g, 'M')} ${e.plur}`; }
    blocos.push({ texto, valor: g });
  }
  // Regra do "e": antes do último bloco se este for < 100 ou múltiplo de 100.
  if (blocos.length === 1) return blocos[0].texto;
  const ultimo = blocos[blocos.length - 1];
  const usaE = ultimo.valor < 100 || ultimo.valor % 100 === 0;
  const inicio = blocos.slice(0, -1).map((b) => b.texto).join(' ');
  return `${inicio}${usaE ? ' e ' : ' '}${ultimo.texto}`;
}

export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export interface OpcoesData { mesMaiusculo?: boolean }

/** 2026-02-10 -> "dez de Fevereiro de dois mil e vinte e seis" (ortografia institucional pré-AO por omissão). */
export function dataPorExtenso(data: Date | string, opts: OpcoesData = {}): string {
  const d = typeof data === 'string' ? parseDataISO(data) : data;
  const dia = d.getUTCDate();
  const mes = MESES[d.getUTCMonth()];
  const ano = d.getUTCFullYear();
  const mesTxt = opts.mesMaiusculo === false ? mes.toLowerCase() : mes;
  return `${numeroPorExtenso(dia)} de ${mesTxt} de ${numeroPorExtenso(ano)}`;
}

export function dataCurta(data: Date | string): string {
  const d = typeof data === 'string' ? parseDataISO(data) : data;
  const p = (x: number) => String(x).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

export function parseDataISO(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) throw new RangeError(`Data inválida: ${s}`);
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCMonth() !== +m[2] - 1) throw new RangeError(`Data inválida: ${s}`);
  return d;
}

export interface Moeda { codigo: string; simbolo: string; sing: string; plur: string; genero: Genero; centSing: string; centPlur: string }
export const MOEDAS: Record<string, Moeda> = {
  AOA: { codigo: 'AOA', simbolo: 'Kz', sing: 'kwanza', plur: 'kwanzas', genero: 'M', centSing: 'cêntimo', centPlur: 'cêntimos' },
  EUR: { codigo: 'EUR', simbolo: '€', sing: 'euro', plur: 'euros', genero: 'M', centSing: 'cêntimo', centPlur: 'cêntimos' },
  USD: { codigo: 'USD', simbolo: 'USD', sing: 'dólar norte-americano', plur: 'dólares norte-americanos', genero: 'M', centSing: 'cêntimo', centPlur: 'cêntimos' },
};

/** Formato numérico português: 50000000 -> "50.000.000,00" */
export function formatarNumero(valor: number, casas = 2): string {
  const [int, dec] = Math.abs(valor).toFixed(casas).split('.');
  const milhares = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${valor < 0 ? '-' : ''}${milhares}${casas ? ',' + dec : ''}`;
}

/** 50000000 AOA -> "cinquenta milhões de kwanzas" */
export function moedaPorExtenso(valor: number, codigo = 'AOA'): string {
  const m = MOEDAS[codigo];
  if (!m) throw new RangeError(`Moeda não suportada: ${codigo}`);
  const cents = Math.round(valor * 100);
  const inteiro = Math.floor(cents / 100);
  const cent = cents % 100;
  const partes: string[] = [];
  if (inteiro > 0 || cent === 0) {
    const txt = numeroPorExtenso(inteiro, m.genero);
    const redondo = inteiro >= 1e6 && inteiro % 1e6 === 0; // "um milhão DE kwanzas"
    partes.push(`${txt} ${redondo ? 'de ' : ''}${inteiro === 1 ? m.sing : m.plur}`);
  }
  if (cent > 0) partes.push(`${numeroPorExtenso(cent)} ${cent === 1 ? m.centSing : m.centPlur}`);
  return partes.join(' e ');
}

/** "Kz 50.000.000,00 (cinquenta milhões de kwanzas)" */
export function moedaCompleta(valor: number, codigo = 'AOA'): string {
  const m = MOEDAS[codigo];
  return `${m.simbolo} ${formatarNumero(valor)} (${moedaPorExtenso(valor, codigo)})`;
}
