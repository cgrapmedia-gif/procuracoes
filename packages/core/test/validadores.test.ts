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

import { contracao, formatarMorada } from '../src';
describe('estilo do posto (morada, preposições, entidades)', () => {
  it('morada como nas procurações do posto', () => {
    expect(formatarMorada({ linha: 'Rua Maria Lina Alves Maia, 66', codigoPostal: '4470-397', localidade: 'Maia', pais: 'Portugal' })).toBe('Rua Maria Lina Alves Maia, 66, Código Postal 4470-397, concelho de Maia – Portugal');
    expect(formatarMorada({ linha: 'Rua Casa S/N.º, Alto Liro', concelho: 'Baía Farta', provincia: 'Benguela' })).toBe('Rua Casa S/N.º, Alto Liro, concelho de Baía Farta, Província de Benguela');
  });
  it('contracções', () => {
    expect(contracao('Rua X', 'em')).toBe('na Rua X');
    expect(contracao('Largo Y', 'em')).toBe('no Largo Y');
    expect(contracao('Município de Baía Farta, Província de Benguela', 'de')).toBe('do Município de Baía Farta, Província de Benguela');
    expect(contracao('Luanda', 'de')).toBe('de Luanda');
  });
  it('entidade em maiúsculas e negrito, com sigla', () => {
    const def = { chave: 'banco', rotulo: 'Banco', tipo: 'ENTIDADE' as const, obrigatorio: true };
    expect(formatarCampo(def, { id: '1', nome: 'Banco Angolano de Investimento', sigla: 'BAI' })).toBe('**BAI – BANCO ANGOLANO DE INVESTIMENTO**');
    expect(formatarCampo(def, { id: '1', nome: 'Banco Demo, S.A.' })).toBe('**BANCO DEMO, S.A.**');
  });
});

import { contextoPessoa, NATUREZAS_PODERES } from '../src';
describe('localidade, cédula de advogado e natureza dos poderes', () => {
  it('designação da localidade', () => {
    expect(formatarMorada({ linha: 'Rua 21, casa 5', concelho: 'Prenda', designacao: 'BAIRRO', provincia: 'Luanda', pais: 'Angola' })).toBe('Rua 21, casa 5, bairro Prenda, Província de Luanda – Angola');
    expect(formatarMorada({ linha: 'Rua X, 1', codigoPostal: '4050-160', concelho: 'Cedofeita', designacao: 'FREGUESIA' })).toBe('Rua X, 1, Código Postal 4050-160, freguesia de Cedofeita');
    expect(formatarMorada({ linha: 'Rua Y', concelho: 'Viana', designacao: 'MUNICIPIO' })).toBe('Rua Y, município de Viana');
  });
  it('advogado identificado pela cédula profissional («portadora da Cédula…»)', () => {
    const c = contextoPessoa({ id: 'x', nomeCompleto: 'Dra. Exemplo', sexo: 'F', nacionalidade: 'angolana', profissao: 'advogada', documento: { tipo: 'CEDULA_OAA', numero: '1234' } } as never);
    expect(c.identificacao).toContain('portadora da Cédula Profissional n.º 1234, emitida pela Ordem dos Advogados de Angola');
  });
  it('naturezas disponíveis', () => { expect(NATUREZAS_PODERES.map((n) => n[0])).toContain('ESPECIAIS'); });
});
