import { DadosProcuracao, DefinicaoModelo, Pessoa, VersaoPoder } from '../src';

export const pessoa = (o: Partial<Pessoa> & Pick<Pessoa, 'id' | 'nomeCompleto' | 'sexo'>): Pessoa => ({
  nacionalidade: 'angolana', estadoCivil: 'SOLTEIRO', naturalidade: 'Município de Exemplo, Província de Luanda',
  documento: { tipo: 'BI_AO', numero: '000000001LA012', dataEmissao: '2023-01-10', validade: '2033-01-09' },
  morada: { linha: 'Rua Demonstração, n.º 1', codigoPostal: '4000-000', localidade: 'Porto', pais: 'Portugal' }, ...o,
});

export const BANC_REP: VersaoPoder = {
  poderId: 'p1', versaoId: 'p1v1', numeroVersao: 1, codigo: 'BANC-001', nome: 'Representação bancária', categoria: 'Bancários',
  texto: 'representar {{flex outorgante "o outorgante" "a outorgante"}} junto do {{banco}}',
  campos: [{ chave: 'banco', rotulo: 'Banco', tipo: 'TEXTO', obrigatorio: true }], regras: [],
};
export const BANC_MOV: VersaoPoder = {
  poderId: 'p2', versaoId: 'p2v1', numeroVersao: 1, codigo: 'BANC-002', nome: 'Movimentar conta', categoria: 'Bancários',
  texto: 'movimentar a conta com o IBAN {{iban}}, podendo efectuar {{operacoes}}{{#if limite}}, até ao limite de {{limite}}{{/if}}',
  campos: [
    { chave: 'iban', rotulo: 'IBAN', tipo: 'IBAN', obrigatorio: true },
    { chave: 'operacoes', rotulo: 'Operações', tipo: 'SELECCAO_MULTIPLA', obrigatorio: true, opcoes: [{ valor: 'dep', rotulo: 'depósitos' }, { valor: 'lev', rotulo: 'levantamentos' }] },
    { chave: 'limite', rotulo: 'Limite', tipo: 'MOEDA', obrigatorio: false, moeda: 'AOA' },
  ],
  regras: [{ tipo: 'REQUER', alvoCodigo: 'BANC-001' }],
};
export const GERAL: VersaoPoder = { poderId: 'p3', versaoId: 'p3v1', numeroVersao: 1, codigo: 'GER-001', nome: 'Plenos poderes', categoria: 'Geral', texto: 'praticar todos os actos', campos: [], regras: [], exclusivo: true };
export const IMOV_VENDA: VersaoPoder = {
  poderId: 'p4', versaoId: 'p4v1', numeroVersao: 1, codigo: 'IMOV-001', nome: 'Vender imóvel', categoria: 'Imobiliários',
  texto: 'vender o {{imovel}}, pelo preço mínimo de {{preco}}', campos: [{ chave: 'imovel', rotulo: 'Imóvel', tipo: 'IMOVEL', obrigatorio: true }, { chave: 'preco', rotulo: 'Preço mínimo', tipo: 'MOEDA', obrigatorio: true, moeda: 'EUR' }],
  regras: [{ tipo: 'SUGERE', alvoCodigo: 'REG-001' }, { tipo: 'INCOMPATIVEL', alvoCodigo: 'IMOV-009' }], tiposPermitidos: ['IMOVEL_VENDA', 'ESPECIAL'],
};

export const MODELO: DefinicaoModelo = {
  pagina: { formato: 'A4', margens: { topo: 2, direita: 2.3, fundo: 2, esquerda: 2.5 } },
  tipografia: { fonte: 'Merriweather', tamanho: 12, entrelinha: 1.5 },
  preenchimento: { activo: true, caracter: '-' },
  poderes: { modo: 'PROSA', separador: ', ', ultimoSeparador: ' e ' },
  cabecalho: { linhas: [{ texto: 'REPÚBLICA DE ANGOLA', negrito: true }, { texto: '{{posto.nome}}' }] },
  blocos: [
    { tipo: 'titulo', texto: 'PROCURAÇÃO', preencher: true },
    { tipo: 'paragrafo', texto: 'No dia {{documento.dataExtenso}}, perante mim, **{{upper oficiante.nome}}**, {{oficiante.cargo}}, {{flex outorgantes "compareceu como outorgante" "compareceu como outorgante" "compareceram como outorgantes" "compareceram como outorgantes"}}: {{outorgantesIdentificacao}}.' },
    { tipo: 'paragrafo', texto: 'Que constitui {{flex procuradores "seu bastante procurador" "sua bastante procuradora" "seus bastantes procuradores" "suas bastantes procuradoras"}} {{procuradoresIdentificacao}}{{#if formaActuacao}}, {{formaActuacao}}{{/if}}, a quem confere poderes para {{poderes}}.' },
    { tipo: 'paragrafo', texto: '{{clausulas}}', seExiste: 'clausulas' },
    { tipo: 'assinaturas', itens: [{ rotulo: '{{flex outorgante "O OUTORGANTE" "A OUTORGANTE"}}' }, { rotulo: '{{upper oficiante.cargo}}', nome: '{{upper oficiante.nome}}' }] },
  ],
  rodape: { texto: '{{documento.numero}}', paginacao: true },
};

export const dados = (o: Partial<DadosProcuracao> = {}): DadosProcuracao => ({
  dataActo: '2026-09-24', local: 'Porto', tipoProcuracao: { codigo: 'ESPECIAL', nome: 'Procuração Especial' },
  posto: { nome: 'Posto Consular DEMO', nomeCompleto: 'Posto Consular DEMO', morada: 'Rua Demo, Porto' },
  oficiante: { nome: 'Oficial Demonstração', cargo: 'Vice-Cônsul' },
  outorgantes: [{ pessoa: pessoa({ id: 'a', nomeCompleto: 'Ana Demo Silva', sexo: 'F' }) }],
  procuradores: [pessoa({ id: 'b', nomeCompleto: 'Bruno Demo Costa', sexo: 'M' })],
  formaActuacao: 'ISOLADAMENTE',
  poderes: [
    { instanciaId: 'i1', versao: BANC_REP, valores: { banco: 'Banco Demonstração, S.A.' } },
    { instanciaId: 'i2', versao: BANC_MOV, valores: { iban: 'AO98004400006729503110102', operacoes: ['dep', 'lev'], limite: 1500000 } },
  ],
  clausulas: [], ...o,
});
