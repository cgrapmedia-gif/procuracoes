/**
 * Construção do documento: modelo (JSON versionado) + dados -> AST neutro -> renderizadores HTML/PDF e DOCX.
 * Um único AST garante que pré-visualização, PDF e DOCX dizem exactamente o mesmo.
 */
import { dataCurta, dataPorExtenso } from './extenso';
import { concordar } from './genero';
import { FormaActuacao, Pessoa, PessoaContexto, QualidadeOutorgante, TipoDocumentoIdentificacao, TIPOS_DOCUMENTO_OMISSAO, contextoPessoa, formaActuacaoTexto, identificacaoConjunta } from './partes';
import { ConfigPoderes, PoderSeleccionado, comporPoderes, renderizarPoder } from './poderes';
import { renderizar } from './template';

export interface Run { texto: string; negrito?: boolean; marcador?: boolean }
export type Alinhamento = 'ESQUERDA' | 'CENTRO' | 'DIREITA' | 'JUSTIFICADO';

export type BlocoModelo =
  | { tipo: 'titulo'; texto: string; preencher?: boolean }
  | { tipo: 'paragrafo'; texto: string; alinhamento?: Alinhamento; preencher?: boolean; seExiste?: string; espacoAntes?: number }
  | { tipo: 'poderes' }                              // só usado em modo LISTA
  | { tipo: 'assinaturas'; itens: { rotulo: string; nome?: string }[] }
  | { tipo: 'espaco'; altura: number };

export interface DefinicaoModelo {
  pagina: { formato: 'A4'; margens: { topo: number; direita: number; fundo: number; esquerda: number } }; // cm
  tipografia: { fonte: string; fontesAlternativas?: string; tamanho: number; entrelinha: number };
  preenchimento: { activo: boolean; caracter: '-' | '.' | '_' };
  poderes: ConfigPoderes;
  cabecalho: { logotipo?: string; linhas: { texto: string; negrito?: boolean; tamanho?: number }[] };
  blocos: BlocoModelo[];
  rodape: { texto: string; paginacao: boolean };
}

export type BlocoDoc =
  | { tipo: 'titulo'; texto: string; preencher: boolean }
  | { tipo: 'paragrafo'; runs: Run[]; alinhamento: Alinhamento; preencher: boolean; espacoAntes?: number }
  | { tipo: 'alinea'; marcador: string; runs: Run[]; preencher: boolean }
  | { tipo: 'assinaturas'; itens: { rotulo: string; nome?: string }[] }
  | { tipo: 'espaco'; altura: number };

export interface DocumentoRenderizado {
  pagina: DefinicaoModelo['pagina'];
  tipografia: DefinicaoModelo['tipografia'];
  preenchimento: DefinicaoModelo['preenchimento'];
  cabecalho: { logotipo?: string; linhas: { texto: string; negrito?: boolean; tamanho?: number }[] };
  blocos: BlocoDoc[];
  rodape: string;
  paginacao: boolean;
  marcaAgua?: string;
}

export interface DadosProcuracao {
  numero?: string;                   // atribuído na emissão; rascunho usa "RASCUNHO"
  dataActo: string;                  // ISO
  local: string;
  tipoProcuracao: { codigo: string; nome: string };
  posto: { nome: string; nomeCompleto: string; morada: string };
  oficiante: { nome: string; cargo: string };
  outorgantes: { pessoa: Pessoa; qualidade?: QualidadeOutorgante }[];
  procuradores: Pessoa[];
  formaActuacao: FormaActuacao;
  formaActuacaoPersonalizada?: string;
  poderes: PoderSeleccionado[];     // já pela ordem final
  clausulas: PoderSeleccionado[];   // cláusulas finais (catálogo versionado, tipo CLAUSULA), pela ordem escolhida
  demo?: boolean;
}

export interface Contexto {
  documento: { numero: string; dataExtenso: string; dataCurta: string; local: string; tipo: string };
  posto: DadosProcuracao['posto'];
  oficiante: DadosProcuracao['oficiante'];
  outorgantes: PessoaContexto[];
  outorgante: PessoaContexto;
  outorgantesIdentificacao: string;
  procuradores: PessoaContexto[];
  procurador: PessoaContexto;
  procuradoresIdentificacao: string;
  formaActuacao: string;
  poderes: string;
  clausulas: string;
}

export function construirContexto(d: DadosProcuracao, tipos: TipoDocumentoIdentificacao[] = TIPOS_DOCUMENTO_OMISSAO, opts: { preVisualizacao?: boolean; cfgPoderes?: ConfigPoderes } = {}): { ctx: Contexto; alineas: { marcador: string; texto: string }[] } {
  if (!d.outorgantes.length) throw new Error('Procuração sem outorgante');
  if (!d.procuradores.length) throw new Error('Procuração sem procurador');
  const outorgantes = d.outorgantes.map((o) => contextoPessoa(o.pessoa, tipos, o.qualidade));
  const procuradores = d.procuradores.map((p) => contextoPessoa(p, tipos));
  const base = {
    documento: { numero: d.numero ?? 'RASCUNHO', dataExtenso: dataPorExtenso(d.dataActo), dataCurta: dataCurta(d.dataActo), local: d.local, tipo: d.tipoProcuracao.nome },
    posto: d.posto, oficiante: d.oficiante,
    outorgantes, outorgante: outorgantes[0], procuradores, procurador: procuradores[0],
  };
  const textos = d.poderes.map((p) => renderizarPoder(p, base, { preVisualizacao: opts.preVisualizacao }));
  const { prosa, alineas } = comporPoderes(textos, opts.cfgPoderes ?? { modo: 'PROSA' });
  const ctx: Contexto = {
    ...base,
    outorgantesIdentificacao: identificacaoConjunta(outorgantes).replace(/^(o Senhor|a Senhora) /, ''),
    procuradoresIdentificacao: identificacaoConjunta(procuradores),
    formaActuacao: formaActuacaoTexto(d.formaActuacao, procuradores.length, d.formaActuacaoPersonalizada),
    poderes: prosa,
    clausulas: d.clausulas.map((c) => renderizarPoder(c, base, { preVisualizacao: opts.preVisualizacao })).map((t) => (/[.!?]$/.test(t) ? t : `${t}.`)).join(' '),
  };
  return { ctx, alineas };
}

/** Converte "**negrito**" e "⟦placeholder⟧" em runs. */
export function parseRuns(texto: string): Run[] {
  const runs: Run[] = [];
  const re = /\*\*(.+?)\*\*|⟦(.+?)⟧/g;
  let i = 0, m: RegExpExecArray | null;
  while ((m = re.exec(texto))) {
    if (m.index > i) runs.push({ texto: texto.slice(i, m.index) });
    if (m[1] !== undefined) runs.push({ texto: m[1], negrito: true });
    else runs.push({ texto: `[${m[2]}]`, marcador: true });
    i = m.index + m[0].length;
  }
  if (i < texto.length) runs.push({ texto: texto.slice(i) });
  return runs;
}

function obterCaminho(o: unknown, caminho: string): unknown {
  return caminho.split('.').reduce<unknown>((acc, k) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[k] : undefined), o);
}

export function construirDocumento(modelo: DefinicaoModelo, dados: DadosProcuracao, opts: { preVisualizacao?: boolean; tipos?: TipoDocumentoIdentificacao[] } = {}): DocumentoRenderizado {
  const { ctx, alineas } = construirContexto(dados, opts.tipos, { preVisualizacao: opts.preVisualizacao, cfgPoderes: modelo.poderes });
  const r = (t: string) => renderizar(t, ctx).replace(/[ \t]+/g, ' ').replace(/ ([,.;:])/g, '$1').trim();
  const blocos: BlocoDoc[] = [];
  for (const b of modelo.blocos) {
    switch (b.tipo) {
      case 'titulo': blocos.push({ tipo: 'titulo', texto: r(b.texto), preencher: !!b.preencher }); break;
      case 'paragrafo': {
        if (b.seExiste) { const v = obterCaminho(ctx, b.seExiste); if (!v || (Array.isArray(v) && !v.length)) break; }
        const texto = r(b.texto);
        if (texto) blocos.push({ tipo: 'paragrafo', runs: parseRuns(texto), alinhamento: b.alinhamento ?? 'JUSTIFICADO', preencher: b.preencher ?? modelo.preenchimento.activo, espacoAntes: b.espacoAntes });
        break;
      }
      case 'poderes': for (const a of alineas) blocos.push({ tipo: 'alinea', marcador: a.marcador, runs: parseRuns(a.texto), preencher: modelo.preenchimento.activo }); break;
      case 'assinaturas': blocos.push({ tipo: 'assinaturas', itens: b.itens.map((i) => ({ rotulo: r(i.rotulo), nome: i.nome ? r(i.nome) : undefined })) }); break;
      case 'espaco': blocos.push({ tipo: 'espaco', altura: b.altura }); break;
    }
  }
  return {
    pagina: modelo.pagina, tipografia: modelo.tipografia, preenchimento: modelo.preenchimento,
    cabecalho: { logotipo: modelo.cabecalho.logotipo, linhas: modelo.cabecalho.linhas.map((l) => ({ ...l, texto: r(l.texto) })) },
    blocos, rodape: r(modelo.rodape.texto), paginacao: modelo.rodape.paginacao,
    marcaAgua: opts.preVisualizacao || !dados.numero ? `RASCUNHO${dados.demo ? ' · DEMO' : ''} — SEM VALOR JURÍDICO` : dados.demo ? 'DEMONSTRAÇÃO — SEM VALOR JURÍDICO' : undefined,
  };
}

/** Checklist de emissão (secção 32). */
export interface ItemChecklist { chave: string; rotulo: string; ok: boolean; detalhe?: string }
export function checklistEmissao(d: DadosProcuracao, errosRegras: number): ItemChecklist[] {
  const idValido = (p: Pessoa) => p.documento?.numero && (p.documento.vitalicio || !p.documento.validade || p.documento.validade >= d.dataActo);
  const pessoaOk = (p: Pessoa) => !!(p.nomeCompleto?.trim() && p.sexo && p.nacionalidade && idValido(p));
  const exp = [...d.outorgantes.map((o) => o.pessoa), ...d.procuradores].filter((p) => p.documento?.validade && !p.documento.vitalicio && p.documento.validade < d.dataActo);
  return [
    { chave: 'outorgante', rotulo: concordar(d.outorgantes.map((o) => o.pessoa).length ? d.outorgantes.map((o) => o.pessoa) : [{ sexo: 'M' }], { ms: 'Outorgante identificado', fs: 'Outorgante identificada', mp: 'Outorgantes identificados', fp: 'Outorgantes identificadas' }), ok: d.outorgantes.length > 0 && d.outorgantes.every((o) => pessoaOk(o.pessoa)) },
    { chave: 'procurador', rotulo: d.procuradores.length > 1 ? 'Procuradores identificados' : 'Procurador identificado', ok: d.procuradores.length > 0 && d.procuradores.every(pessoaOk) },
    { chave: 'documentos', rotulo: 'Documentos de identificação válidos na data do acto', ok: exp.length === 0, detalhe: exp.length ? `Expirado: ${exp.map((p) => p.nomeCompleto).join(', ')}` : undefined },
    { chave: 'actuacao', rotulo: 'Forma de actuação definida', ok: d.procuradores.length < 2 || !!d.formaActuacao },
    { chave: 'poderes', rotulo: 'Poderes configurados', ok: d.poderes.length > 0 },
    { chave: 'regras', rotulo: 'Campos obrigatórios e regras sem erros', ok: errosRegras === 0, detalhe: errosRegras ? `${errosRegras} erro(s)` : undefined },
    { chave: 'data', rotulo: 'Data do acto válida', ok: /^\d{4}-\d{2}-\d{2}$/.test(d.dataActo) },
    { chave: 'oficiante', rotulo: 'Oficiante designado', ok: !!d.oficiante?.nome },
  ];
}
