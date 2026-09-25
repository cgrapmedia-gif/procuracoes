import { biAngolaValido, formatarIban, ibanValido, nifAngolaValido, nifPortugalValido, validarCampo, formatarCampo } from '../src';

describe('validadores', () => {
  it('NIF PT', () => { expect(nifPortugalValido('123456789')).toBe(true); expect(nifPortugalValido('123456780')).toBe(false); expect(nifPortugalValido('999999990')).toBe(true); });
  it('BI angolano', () => { expect(biAngolaValido('000000001LA012')).toBe(true); expect(biAngolaValido('12345LA')).toBe(false); });
  it('NIF AO (pessoa e empresa)', () => { expect(nifAngolaValido('000000001LA012')).toBe(true); expect(nifAngolaValido('5000000000')).toBe(true); expect(nifAngolaValido('50')).toBe(false); });
  it('IBAN', () => {
    expect(ibanValido('PT50 0002 0123 1234 5678 9015 4')).toBe(true);
    expect(ibanValido('PT50000201231234567890155')).toBe(false);
    expect(ibanValido('AO98 0044 0000 6729 5031 1010 2')).toBe(true);
    expect(formatarIban('pt50000201231234567890154')).toBe('PT50 0002 0123 1234 5678 9015 4');
  });
  it('campo obrigatório e validade expirada na data do acto', () => {
    expect(validarCampo({ chave: 'x', rotulo: 'Banco', tipo: 'TEXTO', obrigatorio: true }, '')).toEqual(['Banco: preenchimento obrigatório.']);
    expect(validarCampo({ chave: 'v', rotulo: 'Validade', tipo: 'DATA_VALIDADE', obrigatorio: true }, '2026-01-01', { dataActo: '2026-09-24' })[0]).toMatch(/expirada/);
  });
  it('formata selecção múltipla e imóvel', () => {
    expect(formatarCampo({ chave: 'ops', rotulo: 'Ops', tipo: 'SELECCAO_MULTIPLA', obrigatorio: true, opcoes: [{ valor: 'dep', rotulo: 'depósitos' }, { valor: 'lev', rotulo: 'levantamentos' }, { valor: 'tra', rotulo: 'transferências' }] }, ['dep', 'lev', 'tra'])).toBe('depósitos, levantamentos e transferências');
    expect(formatarCampo({ chave: 'i', rotulo: 'Imóvel', tipo: 'IMOVEL', obrigatorio: true }, { tipo: 'prédio urbano', morada: 'Rua Exemplo, 1', artigoMatricial: '1234', conservatoria: 'Conservatória do Registo Predial do Porto', descricaoPredial: '567' }))
      .toBe('prédio urbano sito em Rua Exemplo, 1, inscrito na matriz sob o artigo 1234, descrito na Conservatória do Registo Predial do Porto sob o n.º 567');
  });
});
