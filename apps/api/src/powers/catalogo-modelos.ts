/**
 * Conversão do «Catálogo de Poderes — modelos» (extraído das procurações do posto) para o formato de importação.
 * Aceita o JSON { catalogo, campos, modelos } e o Excel com a folha «Modelos de Poderes».
 *
 * Cada texto-modelo passa a ser um poder do Centro de Poderes, com o texto ORIGINAL preservado:
 *  - os campos {{BANCO}}, {{Nº_CONTA}}, … passam a {{banco}}, {{numero_conta}}, … com tipo e rótulo;
 *  - um campo que aparece mais de uma vez no mesmo texto dá campos distintos (ex.: dois nomes diferentes);
 *  - o texto começa com a sua própria fórmula («confere os mais amplos poderes…»): o modelo documental
 *    detecta-o e não repete «confere poderes necessários de representação para».
 * Entram como rascunho, para revisão e publicação (individual ou em lote).
 */
export interface ModeloOrigem { id: string; dominio: string; utilizacoes?: number; codigos?: string[]; irrevogavel?: boolean; substabelecer?: boolean; texto: string; poderesIncluidos?: string }
type Linha = Record<string, unknown>;

const CATEGORIA: Record<string, string> = {
  'Bancário': 'BANCARIOS', 'Imóveis': 'IMOBILIARIOS', 'Menores': 'MENORES', 'Família': 'FAMILIA', 'Empresas': 'EMPRESARIAIS',
  'Forense / Judicial': 'JUDICIAIS', 'Sucessões': 'HERANCAS', 'Registo Civil': 'REGISTOS', 'Telecomunicações': 'SERVICOS',
  'Segurança Social / Pensões': 'LABORAIS', 'Administração Pública': 'ENT_PUBLICAS', 'Educação': 'SAUDE_EDUCACAO', 'Saúde': 'SAUDE_EDUCACAO',
  'Veículos': 'AUTOMOVEIS', 'Representação geral': 'GERAL', 'Laboral': 'LABORAIS', 'Fiscal': 'FISCAIS', 'Ordens profissionais': 'ENT_PUBLICAS',
  'Seguros': 'SEGUROS', 'Outros': 'OUTROS', 'Cláusulas': 'CLAUSULAS',
};

/** Campo do catálogo → [chave, tipo, rótulo]. */
const CAMPOS: Record<string, [string, string, string]> = {
  'BANCO': ['banco', 'ENTIDADE', 'Instituição bancária'], 'Nº_CONTA': ['numero_conta', 'TEXTO', 'Número de conta'], 'IBAN': ['iban', 'IBAN', 'IBAN'],
  'Nº': ['numero', 'TEXTO', 'Número (lote, registo, descrição…)'], 'LOCALIDADE': ['localidade', 'TEXTO', 'Localidade / bairro'], 'MUNICÍPIO': ['municipio', 'TEXTO', 'Município'],
  'PROVÍNCIA': ['provincia', 'TEXTO', 'Província'], 'NOME': ['nome', 'TEXTO', 'Nome'], 'AGÊNCIA': ['agencia', 'TEXTO', 'Agência bancária'],
  'TELEFONE': ['telefone', 'TEXTO', 'Telefone'], 'EMPRESA': ['empresa', 'TEXTO', 'Sociedade / empresa'], 'VALOR': ['valor', 'TEXTO', 'Valor'],
  'ANO': ['ano', 'TEXTO', 'Ano'], 'MORADA': ['morada', 'TEXTO', 'Morada / localização'], 'DATA': ['data', 'TEXTO', 'Data'], 'COMUNA': ['comuna', 'TEXTO', 'Comuna'],
  'NIF': ['nif', 'TEXTO', 'NIF'], 'DISTRITO': ['distrito', 'TEXTO', 'Distrito'], 'Nº_BI': ['numero_bi', 'TEXTO', 'N.º do Bilhete de Identidade'],
  'NATURALIDADE': ['naturalidade', 'TEXTO', 'Naturalidade'], 'NOME_CÔNJUGE': ['nome_conjuge', 'TEXTO', 'Nome do cônjuge'], 'Nº_CHASSI': ['numero_chassi', 'TEXTO', 'N.º do chassi'],
  'MODELO': ['modelo_viatura', 'TEXTO', 'Modelo da viatura'], 'MATRÍCULA': ['matricula', 'TEXTO', 'Matrícula'], 'NOME_MENOR': ['nome_menor', 'TEXTO', 'Nome do menor'],
  'Nº_PASSAPORTE': ['numero_passaporte', 'TEXTO', 'N.º do passaporte'], 'DATA_NASCIMENTO': ['data_nascimento', 'TEXTO', 'Data de nascimento'],
  'Nº_PROCESSO': ['numero_processo', 'TEXTO', 'N.º do processo'], 'APELIDO': ['apelido', 'TEXTO', 'Apelido'], 'Nº_ASSENTO': ['numero_assento', 'TEXTO', 'N.º do assento'],
  'NOME_FALECIDO': ['nome_falecido', 'TEXTO', 'Nome do falecido'], 'MARCA': ['marca_viatura', 'TEXTO', 'Marca da viatura'],
};
const slug = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/º/g, 'o').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'campo';

/** Fórmula de abertura: garante que o texto começa por um verbo de concessão. */
function abertura(t: string): { texto: string; rever: boolean } {
  let x = t.trim();
  x = x.replace(/^a\s+quem\s*,?\s*/i, '');
  x = x.replace(/^conferindo-lhe\b/i, 'confere');
  if (/^(nos termos|para\b|em representa)/i.test(x)) x = `confere poderes ${x}`;
  return { texto: x, rever: !/^(conferem?|concede|com\s+(os|as|o|a)\b|dando\b)/i.test(x) };
}

function converterTexto(t: string): { texto: string; campos: { chave: string; rotulo: string; tipo: string; obrigatorio: boolean }[] } {
  const ocorrencias: Record<string, number> = {};
  for (const m of t.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)) ocorrencias[m[1]] = (ocorrencias[m[1]] ?? 0) + 1;
  const vistos: Record<string, number> = {};
  const campos: { chave: string; rotulo: string; tipo: string; obrigatorio: boolean }[] = [];
  const texto = t.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, nome: string) => {
    const [base, tipo, rotulo] = CAMPOS[nome] ?? [slug(nome), 'TEXTO', nome.replace(/_/g, ' ').toLowerCase()];
    const n = (vistos[nome] = (vistos[nome] ?? 0) + 1);
    const repetido = ocorrencias[nome] > 1;
    const chave = repetido ? `${base}_${n}` : base;
    if (!campos.some((c) => c.chave === chave)) campos.push({ chave, rotulo: repetido ? `${rotulo} (${n}.ª referência)` : rotulo, tipo, obrigatorio: true });
    return `{{${chave}}}`;
  });
  return { texto, campos };
}

export function converterModelos(modelos: ModeloOrigem[], nomesPoderes: Record<string, string> = {}): Linha[] {
  return modelos.filter((m) => m?.id && m.texto?.trim()).map((m) => {
    const a = abertura(m.texto);
    const { texto, campos } = converterTexto(a.texto);
    const incluidos = (m.codigos ?? []).map((c) => nomesPoderes[c]).filter(Boolean) as string[];
    const principais = incluidos.filter((_, i) => !(m.codigos![i] ?? '').startsWith('CLA'));
    const base = (principais.length ? principais : incluidos).slice(0, 2).join('; ') || (m.poderesIncluidos ?? '').split(';').slice(0, 2).join(';') || m.dominio;
    const resto = Math.max(0, (principais.length || incluidos.length) - 2);
    const nome = `${m.id} · ${base}${resto ? ` (+${resto})` : ''}`.slice(0, 200);
    const descricao = [
      a.rever ? '[REVER ABERTURA] ' : '',
      `${m.dominio}. Usado em ${m.utilizacoes ?? 1} procuração(ões) do posto.`,
      m.codigos?.length ? ` Códigos: ${m.codigos.join(', ')}.` : '',
      incluidos.length || m.poderesIncluidos ? ` Inclui: ${incluidos.length ? incluidos.join('; ') : m.poderesIncluidos}.` : '',
      m.irrevogavel ? ' Irrevogável.' : '', m.substabelecer ? ' Com substabelecimento.' : '',
    ].join('').slice(0, 2000);
    return { codigo: m.id.toUpperCase().replace(/[^A-Z0-9_-]/g, '-'), categoria: CATEGORIA[m.dominio] ?? 'OUTROS', tipo: 'PODER', nome, descricao, texto, campos, regras: [], exclusivo: false, tiposPermitidos: [], publicar: false };
  });
}

/** JSON { catalogo, campos, modelos } → linhas de importação. */
export function eCatalogoModelos(j: unknown): j is { catalogo?: { codigo: string; poder: string }[]; modelos: ModeloOrigem[] } {
  return !!j && typeof j === 'object' && !Array.isArray(j) && Array.isArray((j as { modelos?: unknown }).modelos);
}
export function converterCatalogoJson(j: { catalogo?: { codigo: string; poder: string }[]; modelos: ModeloOrigem[] }): Linha[] {
  return converterModelos(j.modelos, Object.fromEntries((j.catalogo ?? []).map((c) => [c.codigo, c.poder])));
}

/** Linhas da folha Excel «Modelos de Poderes» → linhas de importação. */
export function converterFolhaModelos(linhas: Linha[]): Linha[] {
  const g = (l: Linha, ...k: string[]) => { for (const c of k) { const e = Object.keys(l).find((x) => x.toLowerCase().startsWith(c.toLowerCase())); if (e && l[e] !== undefined && l[e] !== null) return l[e]; } return undefined; };
  const sim = (v: unknown) => /^s(im)?$/i.test(String(v ?? '').trim()) || v === true;
  return converterModelos(linhas.map((l) => ({
    id: String(g(l, 'ID modelo', 'ID') ?? ''), dominio: String(g(l, 'Domínio') ?? 'Outros'), utilizacoes: Number(g(l, 'Nº procurações') ?? 1) || 1,
    codigos: String(g(l, 'Códigos') ?? '').split(',').map((x) => x.trim()).filter(Boolean),
    poderesIncluidos: String(g(l, 'Poderes incluídos') ?? ''), irrevogavel: sim(g(l, 'Irrevogável')), substabelecer: sim(g(l, 'Substabelecer')),
    texto: String(g(l, 'Texto-modelo', 'Texto') ?? ''),
  })));
}
