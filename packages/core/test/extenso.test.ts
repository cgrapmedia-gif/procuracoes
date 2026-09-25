import { dataPorExtenso, moedaCompleta, moedaPorExtenso, numeroPorExtenso } from '../src';

describe('numeroPorExtenso', () => {
  it.each([
    [0, 'zero'], [1, 'um'], [16, 'dezasseis'], [21, 'vinte e um'], [100, 'cem'], [101, 'cento e um'], [110, 'cento e dez'],
    [200, 'duzentos'], [999, 'novecentos e noventa e nove'], [1000, 'mil'], [1001, 'mil e um'], [1100, 'mil e cem'],
    [1150, 'mil cento e cinquenta'], [2026, 'dois mil e vinte e seis'], [2023, 'dois mil e vinte e três'],
    [21000, 'vinte e um mil'], [1000000, 'um milhão'], [1000005, 'um milhão e cinco'], [2500000, 'dois milhões e quinhentos mil'], [2500001, 'dois milhões quinhentos mil e um'],
    [50000000, 'cinquenta milhões'], [1000000000, 'mil milhões'], [3000000000, 'três mil milhões'],
  ])('%i -> %s', (n, txt) => expect(numeroPorExtenso(n)).toBe(txt));
  it('género feminino', () => { expect(numeroPorExtenso(2, 'F')).toBe('duas'); expect(numeroPorExtenso(222, 'F')).toBe('duzentas e vinte e duas'); });
  it('rejeita inválidos', () => { expect(() => numeroPorExtenso(-1)).toThrow(); expect(() => numeroPorExtenso(1.5)).toThrow(); });
});

describe('datas e moeda', () => {
  it('data institucional (corpus: "dez de Fevereiro de dois mil e vinte e seis")', () => expect(dataPorExtenso('2026-02-10')).toBe('dez de Fevereiro de dois mil e vinte e seis'));
  it('dia um', () => expect(dataPorExtenso('2026-09-01')).toBe('um de Setembro de dois mil e vinte e seis'));
  it('rejeita data impossível', () => expect(() => dataPorExtenso('2026-02-30')).toThrow());
  it('kwanzas (corpus: "cinquenta milhões kwanzas")', () => expect(moedaCompleta(50000000, 'AOA')).toBe('Kz 50.000.000,00 (cinquenta milhões de kwanzas)'));
  it('euros com cêntimos', () => expect(moedaPorExtenso(1234.5, 'EUR')).toBe('mil duzentos e trinta e quatro euros e cinquenta cêntimos'));
  it('um euro', () => expect(moedaPorExtenso(1, 'EUR')).toBe('um euro'));
});
