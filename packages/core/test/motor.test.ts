import { avaliarRegras, comporPoderes, construirDocumento, checklistEmissao, concordar, ErroTemplate, marcador, renderizar, renderizarHtml, renderizarDocx, sugerirPoderes, transitar, TransicaoInvalida, variaveisDoTemplate, verificarDefinicaoPoder, formatarNumeroDocumento, pluralizar } from '../src';
import { BANC_MOV, BANC_REP, GERAL, IMOV_VENDA, MODELO, dados, pessoa } from './fixtures';

describe('concordância', () => {
  const M = { sexo: 'M' as const }, F = { sexo: 'F' as const };
  const f = { ms: 'seu bastante procurador', fs: 'sua bastante procuradora' };
  it('singular', () => { expect(concordar(M, f)).toBe('seu bastante procurador'); expect(concordar(F, f)).toBe('sua bastante procuradora'); });
  it('plural misto é masculino; só feminino se todas F', () => { expect(concordar([M, F], f)).toBe('seus bastantes procuradores'); expect(concordar([F, F], f)).toBe('suas bastantes procuradoras'); });
  it('pluralizar', () => expect(pluralizar('o Senhor')).toBe('os Senhores'));
});

describe('motor de templates', () => {
  it('substitui variáveis e helpers', () => expect(renderizar('{{upper x}} {{extenso n}}', { x: 'ana', n: 21 })).toBe('ANA vinte e um'));
  it('modo estrito: variável em falta é erro', () => expect(() => renderizar('{{naoExiste}}', {})).toThrow(ErroTemplate));
  it('helper desconhecido é recusado (sem execução arbitrária)', () => expect(() => renderizar('{{naoRegistado x}}', {})).toThrow(/Template inválido/));
  it('não acede ao protótipo', () => expect(() => renderizar('{{constructor.name}}', {})).toThrow());
  it('extrai variáveis', () => expect(variaveisDoTemplate('{{a}} {{upper b}} {{#if c}}{{d}}{{/if}} {{#each l}}{{x}}{{/each}}').sort()).toEqual(['a', 'b', 'c', 'd', 'l']));
});

describe('definição de poderes', () => {
  it('detecta variável sem campo e campo obrigatório não usado', () => {
    const erros = verificarDefinicaoPoder({ texto: 'vender {{imovel}} a {{comprador}}', campos: [{ chave: 'imovel', rotulo: 'I', tipo: 'IMOVEL', obrigatorio: true }, { chave: 'preco', rotulo: 'P', tipo: 'MOEDA', obrigatorio: true }] });
    expect(erros).toEqual(expect.arrayContaining([expect.stringMatching(/comprador/), expect.stringMatching(/"preco" não é usado/)]));
  });
  it('aceita variáveis globais (partes)', () => expect(verificarDefinicaoPoder(BANC_REP)).toEqual([]));
});

describe('regras', () => {
  it('REQUER sem dependência -> erro com correcção automática', () => {
    const p = avaliarRegras([{ instanciaId: 'x', versao: BANC_MOV, valores: { iban: 'AO98004400006729503110102', operacoes: ['dep'] } }], { tipoProcuracao: 'ESPECIAL' });
    expect(renderizar('x', {})).toBe('x');
    expect(p).toEqual([expect.objectContaining({ codigo: 'REQUER', correccao: { accao: 'ADICIONAR', codigo: 'BANC-001' } })]);
  });
  it('exclusivo, tipo não permitido, IBAN inválido', () => {
    const p = avaliarRegras([
      { instanciaId: 'g', versao: GERAL, valores: {} },
      { instanciaId: 'v', versao: IMOV_VENDA, valores: { imovel: { morada: 'X' }, preco: 1 } },
      { instanciaId: 'm', versao: BANC_MOV, valores: { iban: 'AO00XXXX', operacoes: ['dep'] } },
    ], { tipoProcuracao: 'BANCARIA' });
    const cod = p.map((x) => x.codigo);
    expect(cod).toEqual(expect.arrayContaining(['EXCLUSIVO', 'TIPO', 'CAMPO', 'REQUER']));
  });
  it('aviso de versão desactualizada', () => {
    const p = avaliarRegras([{ instanciaId: 'r', versao: BANC_REP, valores: { banco: 'B' } }], { tipoProcuracao: 'X', versoesActuais: { 'BANC-001': 2 } });
    expect(p[0]).toMatchObject({ severidade: 'AVISO', codigo: 'VERSAO_DESACTUALIZADA' });
  });
  it('sugestões só a partir do catálogo, dependências primeiro', () => {
    const cat = new Map([BANC_REP, IMOV_VENDA, { ...BANC_REP, codigo: 'REG-001', nome: 'Conservatória' }].map((v) => [v.codigo, v]));
    const s = sugerirPoderes([{ instanciaId: '1', versao: BANC_MOV, valores: {} }, { instanciaId: '2', versao: IMOV_VENDA, valores: {} }], cat);
    expect(s.map((x) => x.codigo)).toEqual(['BANC-001', 'REG-001']);
  });
});

describe('composição', () => {
  it('prosa com separadores', () => expect(comporPoderes(['a.', 'b;', 'c'], { modo: 'PROSA', separador: ', ', ultimoSeparador: ' e ' }).prosa).toBe('a, b e c'));
  it('lista com alíneas', () => { const r = comporPoderes(['a', 'b'], { modo: 'LISTA' }); expect(r.alineas).toEqual([{ marcador: 'a)', texto: 'a;' }, { marcador: 'b)', texto: 'b.' }]); });
  it('marcadores além de z', () => { expect(marcador(25)).toBe('z)'); expect(marcador(26)).toBe('aa)'); expect(marcador(3, 'i)')).toBe('iv)'); });
});

describe('documento', () => {
  it('constrói o texto final com concordância, extenso e ordem dos poderes', () => {
    const doc = construirDocumento(MODELO, dados({ numero: 'PROC-2026-000001' }));
    const texto = doc.blocos.filter((b) => b.tipo === 'paragrafo').map((b) => (b as { runs: { texto: string }[] }).runs.map((r) => r.texto).join('')).join('\n');
    expect(texto).toContain('No dia vinte e quatro de Setembro de dois mil e vinte e seis');
    expect(texto).toContain('compareceu como outorgante: ANA DEMO SILVA, solteira');
    expect(texto).toContain('portadora do Bilhete de Identidade n.º 000000001LA012');
    expect(texto).toContain('seu bastante procurador o Senhor BRUNO DEMO COSTA, solteiro');
    expect(texto).toMatch(/representar a outorgante junto do Banco Demonstração, S\.A\. e movimentar a conta com o IBAN AO98 0044/);
    expect(texto).toContain('até ao limite de Kz 1.500.000,00 (um milhão e quinhentos mil kwanzas)');
    expect(doc.marcaAgua).toBeUndefined();
    expect(doc.rodape).toBe('PROC-2026-000001');
  });
  it('dois procuradoras -> plural feminino e forma de actuação', () => {
    const doc = construirDocumento(MODELO, dados({ procuradores: [pessoa({ id: 'c', nomeCompleto: 'Carla', sexo: 'F' }), pessoa({ id: 'd', nomeCompleto: 'Diana', sexo: 'F' })], formaActuacao: 'CONJUNTAMENTE' }));
    const t = JSON.stringify(doc.blocos);
    expect(t).toContain('suas bastantes procuradoras a Senhora');
    expect(t).toContain('que deverão actuar sempre conjuntamente');
  });
  it('pré-visualização marca campos em falta em vez de falhar', () => {
    const d = dados(); d.poderes[0].valores = {};
    const doc = construirDocumento(MODELO, d, { preVisualizacao: true });
    expect(JSON.stringify(doc.blocos)).toContain('"texto":"[Banco]","marcador":true');
    expect(doc.marcaAgua).toMatch(/RASCUNHO/);
    expect(construirDocumento(MODELO, dados({ numero: 'X', demo: true })).marcaAgua).toBe('DEMONSTRAÇÃO — SEM VALOR JURÍDICO');
  });
  it('HTML escapa conteúdo introduzido pelo utilizador (XSS)', () => {
    const d = dados(); d.poderes[0].valores = { banco: '<script>alert(1)</script>' };
    const html = renderizarHtml(construirDocumento(MODELO, d));
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });
  it('gera DOCX válido', async () => {
    const buf = await renderizarDocx(construirDocumento(MODELO, dados({ numero: 'PROC-2026-000001' })));
    expect(buf.subarray(0, 2).toString()).toBe('PK');
  });
  it('checklist detecta BI expirado', () => {
    const d = dados({ procuradores: [pessoa({ id: 'x', nomeCompleto: 'X', sexo: 'M', documento: { tipo: 'BI_AO', numero: '000000001LA012', validade: '2025-01-01' } })] });
    const c = checklistEmissao(d, 0);
    expect(c.find((i) => i.chave === 'documentos')).toMatchObject({ ok: false });
    expect(c.find((i) => i.chave === 'outorgante')).toMatchObject({ ok: true, rotulo: 'Outorgante identificada' });
  });
});

describe('workflow e numeração', () => {
  const todas = new Set(['poa.submit', 'poa.validate', 'poa.issue', 'poa.cancel', 'poa.archive']);
  it('fluxo normal', () => {
    let e = transitar('RASCUNHO', 'SUBMETER', { permissoes: todas });
    e = transitar(e, 'VALIDAR', { permissoes: todas, criadorId: 'u1', actorId: 'u2' });
    e = transitar(e, 'EMITIR', { permissoes: todas });
    expect(e).toBe('EMITIDA');
  });
  it('segregação de funções', () => expect(() => transitar('EM_REVISAO', 'VALIDAR', { permissoes: todas, criadorId: 'u1', actorId: 'u1' })).toThrow(TransicaoInvalida));
  it('não se emite rascunho; cancelar exige motivo', () => {
    expect(() => transitar('RASCUNHO', 'EMITIR', { permissoes: todas })).toThrow(TransicaoInvalida);
    expect(() => transitar('EMITIDA', 'CANCELAR', { permissoes: todas })).toThrow(/motivo/);
  });
  it('formato do número', () => {
    expect(formatarNumeroDocumento({ padrao: '{PREFIXO}-{ANO}-{SEQ}', prefixo: 'PROC', digitos: 6 }, 2026, 1)).toBe('PROC-2026-000001');
    expect(formatarNumeroDocumento({ padrao: '{PREFIXO}-{SERIE}-{ANO}-{SEQ}', prefixo: 'PROC', serie: 'A', digitos: 4 }, 2026, 42)).toBe('PROC-A-2026-0042');
  });
});

describe('segurança do template', () => {
  it('lookup e log estão desactivados', () => { expect(() => renderizar('{{lookup a "b"}}', { a: {} })).toThrow(/Template inválido/); });
  it('abreviaturas preservadas na composição', () => expect(comporPoderes(['junto do Banco X, S.A.', 'y.'], { modo: 'PROSA', separador: ', ', ultimoSeparador: ' e ' }).prosa).toBe('junto do Banco X, S.A. e y'));
});

describe('interpretador de templates (sem eval)', () => {
  it('blocos, subexpressões e dados', () => {
    expect(renderizar('{{#each l}}{{@index}}:{{upper this}}{{#unless @last}}, {{/unless}}{{/each}}', { l: ['a', 'b'] })).toBe('0:A, 1:B');
    expect(renderizar('{{#with p}}{{nome}}{{/with}} {{#if x}}sim{{else}}não{{/if}}', { p: { nome: 'Ana' }, x: 0 })).toBe('Ana não');
    expect(renderizar('{{upper (lower "ABC")}}', {})).toBe('ABC');
    expect(renderizar('{{#each vazio}}x{{else}}nada{{/each}}', { vazio: [] })).toBe('nada');
  });
  it('não lê propriedades herdadas', () => {
    expect(() => renderizar('{{a.constructor}}', { a: {} })).toThrow(/not defined/);
    expect(() => renderizar('{{toString}}', {})).toThrow();
  });
  it('não usa new Function', () => {
    const original = globalThis.Function;
    (globalThis as { Function: unknown }).Function = function () { throw new Error('eval proibido'); };
    try { expect(renderizar('{{flex p "o" "a"}} {{moeda n "EUR"}}', { p: { sexo: 'F' }, n: 2 })).toBe('a € 2,00 (dois euros)'); }
    finally { (globalThis as { Function: unknown }).Function = original; }
  });
});
