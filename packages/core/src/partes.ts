/**
 * Pessoas e partes (outorgantes, procuradores). Gera a identificação textual com concordância de género.
 */
import { dataCurta } from './extenso';
import { EstadoCivil, Sexo, concordar, estadoCivilTexto, juntarLista } from './genero';
import { Morada, formatarCampo } from './campos';

export interface DocumentoIdentificacao {
  tipo: string;                 // código de IdentityDocumentType (BI_AO, PASSAPORTE_AO, CC_PT, TR_PT…)
  numero: string;
  dataEmissao?: string;
  validade?: string;            // ISO
  vitalicio?: boolean;
}

export interface Pessoa {
  id: string;
  nomeCompleto: string;
  sexo: Sexo;
  dataNascimento?: string;
  nacionalidade: string;        // forma feminina: "angolana", "portuguesa"
  naturalidade?: string;        // "Município de Ingombota, Província de Luanda"
  estadoCivil?: EstadoCivil;
  conjuge?: string;
  regimeBens?: string;
  profissao?: string;
  documento: DocumentoIdentificacao;
  nif?: string;
  morada?: Morada;
  telefone?: string;
  email?: string;
  demo?: boolean;
}

export interface TipoDocumentoIdentificacao { codigo: string; nome: string; modelo: string }

/** Modelos por omissão (editáveis na administração). Variáveis: numero, emissao, validade, vitalicio. */
export const TIPOS_DOCUMENTO_OMISSAO: TipoDocumentoIdentificacao[] = [
  { codigo: 'BI_AO', nome: 'Bilhete de Identidade (Angola)', modelo: 'Bilhete de Identidade n.º {{numero}}, emitido pela Direcção Nacional do Arquivo de Identificação Civil e Criminal{{#if emissao}}, aos {{emissao}}{{/if}}{{#if vitalicio}}, vitalício{{else}}{{#if validade}}, válido até {{validade}}{{/if}}{{/if}}' },
  { codigo: 'PASSAPORTE_AO', nome: 'Passaporte (Angola)', modelo: 'Passaporte n.º {{numero}}, emitido pelo Serviço de Migração e Estrangeiros{{#if emissao}}, aos {{emissao}}{{/if}}{{#if validade}}, válido até {{validade}}{{/if}}' },
  { codigo: 'CC_PT', nome: 'Cartão de Cidadão (Portugal)', modelo: 'Cartão de Cidadão n.º {{numero}}{{#if validade}}, válido até {{validade}}{{/if}}' },
  { codigo: 'TR_PT', nome: 'Título de Residência (Portugal)', modelo: 'Título de Residência n.º {{numero}}, emitido pela AIMA{{#if validade}}, válido até {{validade}}{{/if}}' },
];

export type FormaActuacao = 'ISOLADAMENTE' | 'CONJUNTAMENTE' | 'QUALQUER_UM' | 'DOIS_CONJUNTAMENTE' | 'PERSONALIZADA';

export function formaActuacaoTexto(f: FormaActuacao, n: number, personalizada?: string): string {
  if (n <= 1) return '';
  switch (f) {
    case 'CONJUNTAMENTE': return 'que deverão actuar sempre conjuntamente';
    case 'QUALQUER_UM': case 'ISOLADAMENTE': return 'podendo actuar isoladamente, qualquer um deles, ou em conjunto';
    case 'DOIS_CONJUNTAMENTE': return 'devendo intervir sempre dois deles conjuntamente';
    case 'PERSONALIZADA': return personalizada ?? '';
  }
}

export type QualidadeOutorgante = { tipo: 'PROPRIO' } | { tipo: 'REPRESENTANTE'; texto: string };

export interface PessoaContexto extends Pessoa {
  nome: string;
  nomeMaiusculas: string;
  tratamento: string;            // "o Senhor" | "a Senhora"
  estadoCivilTexto: string;
  documentoTexto: string;
  moradaTexto: string;
  identificacao: string;         // bloco completo
  qualidadeTexto?: string;
}

import { renderizar } from './template';

export function documentoTexto(doc: DocumentoIdentificacao, tipos: TipoDocumentoIdentificacao[]): string {
  const t = tipos.find((x) => x.codigo === doc.tipo);
  if (!t) return `documento n.º ${doc.numero}`;
  return renderizar(t.modelo, {
    numero: doc.numero.toUpperCase(),
    emissao: doc.dataEmissao ? dataCurta(doc.dataEmissao) : '',
    validade: doc.validade ? dataCurta(doc.validade) : '',
    vitalicio: !!doc.vitalicio,
  });
}

export function contextoPessoa(p: Pessoa, tipos: TipoDocumentoIdentificacao[] = TIPOS_DOCUMENTO_OMISSAO, qualidade?: QualidadeOutorgante): PessoaContexto {
  const ec = p.estadoCivil ? estadoCivilTexto(p.estadoCivil, p.sexo) : '';
  const conj = p.estadoCivil === 'CASADO' && p.conjuge ? ` com ${p.conjuge}${p.regimeBens ? `, no regime de ${p.regimeBens}` : ''}` : '';
  const docTxt = documentoTexto(p.documento, tipos);
  const morada = p.morada ? formatarCampo({ chave: 'm', rotulo: 'Morada', tipo: 'MORADA', obrigatorio: false }, p.morada) : '';
  const portador = concordar(p, { ms: 'portador', fs: 'portadora' });
  const partes = [
    `**${p.nomeCompleto.toLocaleUpperCase('pt')}**`,
    ec && `${ec}${conj}`,
    p.profissao,
    `de nacionalidade ${p.nacionalidade}`,
    p.naturalidade && `${concordar(p, { ms: 'natural', fs: 'natural' })} de ${p.naturalidade}`,
    `${portador} do ${docTxt}`,
    p.nif && `NIF ${p.nif}`,
    morada && `residente habitualmente em ${morada}`,
  ].filter(Boolean);
  const qualidadeTexto = qualidade?.tipo === 'REPRESENTANTE' ? `que outorga na qualidade de ${qualidade.texto}` : undefined;
  if (qualidadeTexto) partes.push(qualidadeTexto);
  return {
    ...p,
    nome: p.nomeCompleto,
    nomeMaiusculas: p.nomeCompleto.toLocaleUpperCase('pt'),
    tratamento: concordar(p, { ms: 'o Senhor', fs: 'a Senhora' }),
    estadoCivilTexto: ec,
    documentoTexto: docTxt,
    moradaTexto: morada,
    identificacao: partes.join(', '),
    qualidadeTexto,
  };
}

/** "o Senhor X, ..., e a Senhora Y, ..." */
export function identificacaoConjunta(pessoas: PessoaContexto[]): string {
  return juntarLista(pessoas.map((p) => `${p.tratamento} ${p.identificacao}`), 'e');
}
