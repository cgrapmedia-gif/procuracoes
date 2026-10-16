/**
 * Declarações consulares — começa pela PROVA DE VIDA (manutenção do direito a pensão de reforma ou de sobrevivência).
 * Usa o mesmo motor de modelos, a mesma composição (blocos → HTML/PDF/DOCX) e os mesmos dados de pessoas das procurações.
 * O texto reproduz as declarações emitidas pelo posto (D E C L A R A Ç Ã O N.º …/10.05/CGRAP/AAAA).
 */
import { MESES } from './extenso';
import { concordar, estadoCivilTexto, juntarLista, Sexo } from './genero';
import { contracao, formatarMorada } from './campos';
import { Pessoa } from './partes';
import { renderizar } from './template';
import { AjusteTexto, BlocoDoc, DefinicaoModelo, DocumentoRenderizado, aplicarAjustes, parseRuns } from './documento';

export type ModalidadePensao = 'REFORMA' | 'SOBREVIVENCIA';
export type RelacaoDependente = 'FILHO' | 'TUTELADO' | 'NETO' | 'OUTRO';

export interface DependenteProvaVida { pessoa: Pessoa; relacao: RelacaoDependente; relacaoTexto?: string }

export interface DadosProvaVida {
  numero?: string;
  dataActo: string;                     // AAAA-MM-DD
  local: string;
  posto: { nome: string; nomeCompleto: string; morada: string };
  signatario: { nome: string; cargo: string; rotulo?: string; qualidade?: string };
  requerente: Pessoa;
  modalidade: ModalidadePensao;
  /** Entidade a quem se destina (ex.: «Instituto Nacional de Segurança Social - INSS»). */
  entidade: string;
  /** Cartão do pensionista/beneficiário (ex.: «Cartão de Beneficiário do INSS», «Cartão de Pensionista»). */
  cartao?: { tipo: string; numero: string };
  /** Pensão de sobrevivência: quem faleceu (o assegurado). */
  falecido?: { nome: string; sexo?: Sexo; numero?: string };
  /** Menores / tutelados que comparecem com o requerente e são os beneficiários. */
  dependentes?: DependenteProvaVida[];
  ajustesTexto?: AjusteTexto[];
}

/** Entidades habituais (sugestões no formulário). */
export const ENTIDADES_PROVA_VIDA = [
  'Instituto Nacional de Segurança Social - INSS', 'Futuro - Fundo de Pensões', 'Fundo de Pensões da Sonangol', 'Montepio Geral de Angola',
  'Ministério das Finanças', 'GF – Gestão de Fundos', 'Fénix Seguros', 'Caixa de Segurança Social das Forças Armadas Angolanas',
];
export const CARTOES_PROVA_VIDA = ['Cartão de Beneficiário do INSS', 'Cartão de Pensionista', 'Cartão de Segurado', 'Cartão de Assegurado'];

/** «04 de Março de 2026» (formato das declarações do posto). */
export function dataDeclaracao(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${String(d).padStart(2, '0')} de ${MESES[m - 1]} de ${a}`;
}
const dataCurtaPT = (iso?: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');

/** Idade completa numa data. */
export function idadeEm(nascimento: string | undefined, dataRef: string): number | null {
  if (!nascimento) return null;
  const [an, mn, dn] = nascimento.slice(0, 10).split('-').map(Number);
  const [ar, mr, dr] = dataRef.slice(0, 10).split('-').map(Number);
  let i = ar - an; if (mr < mn || (mr === mn && dr < dn)) i--;
  return i >= 0 && i < 130 ? i : null;
}

/** «ao Instituto…», «à Caixa…». */
export function aoEntidade(e: string): string {
  const primeira = e.trim().split(/\s+/)[0]?.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '') ?? '';
  const fem = ['caixa', 'direccao', 'direcao', 'secretaria', 'seguradora', 'sociedade', 'companhia', 'empresa', 'administracao', 'agencia', 'entidade'];
  return `${fem.includes(primeira) ? 'à' : 'ao'} **${e.trim()}**`;
}

function identificacaoDependente(d: DependenteProvaVida, dataRef: string): string {
  const p = d.pessoa;
  const idade = idadeEm(p.dataNascimento, dataRef);
  const doc = p.documento?.numero
    ? `${concordar(p, { ms: 'titular', fs: 'titular' })} do bilhete de identidade n.º ${p.documento.numero}${p.documento.dataEmissao ? `, emitido aos ${dataCurtaPT(p.documento.dataEmissao)}` : ''}${p.documento.validade ? `, válido até ${dataCurtaPT(p.documento.validade)}` : ''}`
    : '';
  return [`**${p.nomeCompleto.toLocaleUpperCase('pt')}**`, idade !== null && `de ${idade} anos de idade`, p.naturalidade && `natural ${contracao(p.naturalidade, 'de')}`, doc].filter(Boolean).join(', ');
}

/** Frase de comparência: quem, com quem, identificação, cartão, morada e (sobrevivência) de quem são beneficiários. */
export function textoComparencia(d: DadosProvaVida): string {
  const r = d.requerente;
  const idade = idadeEm(r.dataNascimento, d.dataActo);
  const deps = d.dependentes ?? [];
  const partes: string[] = [
    `compareceu ${concordar(r, { ms: 'o Senhor', fs: 'a Senhora' })} **${r.nomeCompleto.toLocaleUpperCase('pt')}**`,
  ];
  if (idade !== null) partes.push(`de ${idade} anos de idade`);
  if (r.estadoCivil) partes.push(`no estado civil de ${estadoCivilTexto(r.estadoCivil, r.sexo ?? 'M')}`);
  if (r.naturalidade) partes.push(`natural ${contracao(r.naturalidade, 'de')}`);
  if (d.cartao?.numero) partes.push(`${concordar(r, { ms: 'titular', fs: 'titular' })} do ${d.cartao.tipo} com o n.º **${d.cartao.numero}**`);
  let txt = partes.join(', ');
  if (deps.length) {
    // «com o seu filho menor, X…», «com as filhas menores, A… e B…», «e sua tutelada, Y…»
    const grupos = deps.map((x) => {
      const rel = x.relacao === 'FILHO' ? concordar(x.pessoa, { ms: 'filho menor', fs: 'filha menor' }) : x.relacao === 'TUTELADO' ? concordar(x.pessoa, { ms: 'tutelado', fs: 'tutelada' }) : x.relacao === 'NETO' ? concordar(x.pessoa, { ms: 'neto menor', fs: 'neta menor' }) : (x.relacaoTexto ?? 'dependente');
      return { rel, txt: identificacaoDependente(x, d.dataActo) };
    });
    const mesmaRel = grupos.every((g) => g.rel === grupos[0].rel);
    if (deps.length === 1) txt += `, com ${concordar(deps[0].pessoa, { ms: 'o seu', fs: 'a sua' })} ${grupos[0].rel}, ${grupos[0].txt}`;
    else if (mesmaRel && deps[0].relacao === 'FILHO') txt += `, com ${concordar(deps.map((x) => x.pessoa), { ms: 'o seu', fs: 'a sua', mp: 'os seus', fp: 'as suas' })} ${concordar(deps.map((x) => x.pessoa), { ms: 'filho', fs: 'filha', mp: 'filhos', fp: 'filhas' })} menores, ${juntarLista(grupos.map((g) => g.txt))}`;
    else txt += `, com ${juntarLista(grupos.map((g) => `${g.rel}, ${g.txt}`))}`;
  }
  const morada = r.morada?.linha ? formatarMorada(r.morada) : '';
  if (morada) txt += `, ${deps.length ? 'residentes' : 'residente'} habitualmente ${contracao(morada, 'em')}`;
  if (d.modalidade === 'SOBREVIVENCIA' && d.falecido?.nome) {
    const quem = deps.length ? deps.map((x) => x.pessoa) : [r];
    const benef = concordar(quem, { ms: 'beneficiário', fs: 'beneficiária', mp: 'beneficiários', fp: 'beneficiárias' });
    const f = { sexo: d.falecido.sexo ?? 'M' } as { sexo: Sexo };
    txt += `, ${benef} ${concordar(f, { ms: 'do malogrado', fs: 'da malograda' })} **${d.falecido.nome.toLocaleUpperCase('pt')}**${d.falecido.numero ? `, com o número de ${concordar(f, { ms: 'segurado', fs: 'segurada' })} ${d.falecido.numero}` : ''}`;
  }
  return txt;
}

export function contextoProvaVida(d: DadosProvaVida): Record<string, unknown> {
  return {
    documento: { numero: d.numero ?? '____', data: dataDeclaracao(d.dataActo), local: d.local },
    posto: d.posto,
    signatario: { nome: d.signatario.nome, cargo: d.signatario.cargo, rotulo: d.signatario.rotulo || `O ${d.signatario.cargo}`, qualidade: d.signatario.qualidade ?? '' },
    comparencia: textoComparencia(d),
    entidade: d.entidade, aoEntidade: aoEntidade(d.entidade),
    pensao: d.modalidade === 'SOBREVIVENCIA' ? 'sobrevivência' : 'reforma',
  };
}

/** Constrói o documento (mesma estrutura das procurações: HTML, PDF e DOCX pelos mesmos renderizadores). */
export function construirProvaVida(modelo: DefinicaoModelo, d: DadosProvaVida, opts: { preVisualizacao?: boolean } = {}): DocumentoRenderizado {
  const ctx = contextoProvaVida(d);
  const r = (t: string) => renderizar(t, ctx).replace(/[ \t]+/g, ' ').replace(/ ([,.;:])/g, '$1').trim();
  const blocos: BlocoDoc[] = [];
  for (const b of modelo.blocos) {
    if (b.tipo === 'titulo') blocos.push({ tipo: 'titulo', texto: r(b.texto), preencher: !!b.preencher });
    else if (b.tipo === 'paragrafo') { const t = r(b.texto); if (t) blocos.push({ tipo: 'paragrafo', runs: parseRuns(t), alinhamento: b.alinhamento ?? 'JUSTIFICADO', preencher: b.preencher ?? modelo.preenchimento.activo, espacoAntes: b.espacoAntes }); }
    else if (b.tipo === 'assinaturas') blocos.push({ tipo: 'assinaturas', itens: b.itens.map((i) => ({ rotulo: r(i.rotulo), nome: i.nome ? r(i.nome) : undefined, alinhamento: i.alinhamento, qualidade: i.qualidade ? r(i.qualidade) : undefined, semLinha: i.semLinha })) });
    else if (b.tipo === 'espaco') blocos.push({ tipo: 'espaco', altura: b.altura });
  }
  const ajustes = aplicarAjustes(blocos, d.ajustesTexto);
  return {
    ajustes, pagina: modelo.pagina, tipografia: modelo.tipografia, preenchimento: modelo.preenchimento,
    cabecalho: { logotipo: modelo.cabecalho.logotipo, logotipoLarguraCm: modelo.cabecalho.logotipoLarguraCm, filete: modelo.cabecalho.filete, linhas: modelo.cabecalho.linhas.map((l) => ({ ...l, texto: r(l.texto) })) },
    blocos, rodape: r(modelo.rodape.texto), paginacao: modelo.rodape.paginacao, rodapeBloco: modelo.rodape.bloco, moldura: modelo.moldura, filetes: modelo.filetes,
    marcaAgua: opts.preVisualizacao && modelo.marcaAguaRascunho !== false ? 'RASCUNHO — SEM VALOR' : undefined,
  } as DocumentoRenderizado;
}
