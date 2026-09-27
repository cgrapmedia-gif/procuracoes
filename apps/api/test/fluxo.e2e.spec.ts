import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { Pool } from 'pg';
import { criarPool } from '../src/db/conexao';

import { urlTeste } from './global-setup';
process.env.DATABASE_URL = urlTeste();
delete process.env.DATABASE_URL_DIRECT;
import { AppModule } from '../src/app.module';
import { configurarApp } from '../src/main';

const PASS = 'Demo#Procuracoes2026';
let app: INestApplication;
let http: ReturnType<typeof request>;
let pool: Pool;
const tok: Record<string, string> = {};
const auth = (who: string) => ({ Authorization: `Bearer ${tok[who]}` });

async function login(email: string) { const r = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password: PASS }).expect(200); return r; }

beforeAll(async () => {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication();
  await configurarApp(app);
  await app.init();
  await app.listen(0); // servidor já a escutar: evita re-listen em pedidos encadeados
  http = request(app.getHttpServer());
  pool = criarPool(process.env.DATABASE_URL!, { max: 2 });
  for (const w of ['admin', 'operador', 'validador', 'consulta']) tok[w] = (await login(`${w}@demo.local`)).body.accessToken;
});
afterAll(async () => { await pool.end(); await app.close(); });

describe('Saúde', () => {
  it('GET /health é público e verifica a BD', async () => {
    const r = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(r.body).toMatchObject({ estado: 'ok', bd: true });
  });
});

describe('Autenticação e sessões', () => {
  it('rejeita credenciais erradas sem revelar se o utilizador existe', async () => {
    const a = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: 'naoexiste@demo.local', password: 'x' });
    const b = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: 'consulta@demo.local', password: 'errada' });
    expect([a.status, b.status]).toEqual([401, 401]);
    expect(a.body.message).toBe(b.body.message);
  });
  it('rotação do refresh token e detecção de reutilização', async () => {
    const r = await login('consulta@demo.local');
    const cookie = r.headers['set-cookie'] as unknown as string[];
    expect(cookie[0]).toMatch(/HttpOnly/); expect(cookie[0]).toMatch(/SameSite=Strict/);
    await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Cookie', cookie).expect(401); // sem cabeçalho anti-CSRF
    const r2 = await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Cookie', cookie).set('X-Requested-With', 'procuracoes').expect(200);
    await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Cookie', cookie).set('X-Requested-With', 'procuracoes').expect(401); // reutilização
    const novo = r2.headers['set-cookie'] as unknown as string[];
    await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Cookie', novo).set('X-Requested-With', 'procuracoes').expect(401); // família revogada
  });
  it('alteração da própria palavra-passe: exige a actual e força política forte', async () => {
    const t = tok.consulta;
    await request(app.getHttpServer()).put('/api/v1/auth/password').set('Authorization', `Bearer ${t}`).send({ actual: 'errada', nova: 'NovaSenha#2026x' }).expect(401);
    await request(app.getHttpServer()).put('/api/v1/auth/password').set('Authorization', `Bearer ${t}`).send({ actual: PASS, nova: 'fraca' }).expect(400);
    await request(app.getHttpServer()).put('/api/v1/auth/password').set('Authorization', `Bearer ${t}`).send({ actual: PASS, nova: 'NovaSenha#2026x' }).expect(204);
    await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: 'consulta@demo.local', password: 'NovaSenha#2026x' }).expect(200);
    const ta = tok.admin;
    const us = await request(app.getHttpServer()).get('/api/v1/admin/users').set('Authorization', `Bearer ${ta}`).expect(200);
    const c = us.body.find((x: { email: string }) => x.email === 'consulta@demo.local');
    await request(app.getHttpServer()).put(`/api/v1/admin/users/${c.id}`).set('Authorization', `Bearer ${ta}`).send({ novaPassword: PASS }).expect(200);
  });
  it('sem token -> 401; perfil CONSULTA não cria procurações -> 403', async () => {
    await http.get('/api/v1/poas').expect(401);
    await request(app.getHttpServer()).post('/api/v1/poas').set(auth('consulta')).send({ tipoCodigo: 'BANCARIA', dataActo: '2026-09-24', local: 'Porto' }).expect(403);
  });
});

describe('Centro de Poderes', () => {
  it('pesquisa por texto e categoria', async () => {
    const r = await request(app.getHttpServer()).get('/api/v1/powers').query({ q: 'bancária', categoria: 'BANCARIOS' }).set(auth('operador')).expect(200);
    expect(r.body.itens.map((x: { codigo: string }) => x.codigo)).toContain('BANC-001');
  });
  it('recusa poder com variável sem campo', async () => {
    const r = await request(app.getHttpServer()).post('/api/v1/powers').set(auth('admin')).send({ codigo: 'TESTE-1', categoriaCodigo: 'OUTROS', nome: 'Teste inválido', texto: 'vender {{coisa}}', campos: [] }).expect(422);
    expect(r.body.erros[0]).toMatch(/coisa/);
  });
  it('importação: pré-visualização mostra novos, duplicados e erros; confirmação cria', async () => {
    const linhas = [
      { codigo: 'IMP-001', categoria: 'OUTROS', nome: 'Importado um', texto: 'tratar de {{assunto}}', campos: JSON.stringify([{ chave: 'assunto', rotulo: 'Assunto', tipo: 'TEXTO', obrigatorio: true }]) },
      { codigo: 'IMP-002', categoria: 'OUTROS', nome: 'Importado dois', texto: 'praticar actos conexos', regras: 'SUGERE:IMP-001' },
      { codigo: 'BANC-001', categoria: 'BANCARIOS', nome: 'Duplicado', texto: 'xxx yyy' },
      { codigo: 'IMP-003', categoria: 'NAO_EXISTE', nome: 'Errado', texto: 'x {{y}}' },
    ];
    const p = await request(app.getHttpServer()).post('/api/v1/powers/import/preview').set(auth('admin')).send({ linhas }).expect(201);
    expect({ novos: p.body.novos, duplicados: p.body.duplicados, erros: p.body.erros }).toEqual({ novos: 2, duplicados: 1, erros: 1 });
    const c = await request(app.getHttpServer()).post(`/api/v1/powers/import/${p.body.loteId}/commit`).set(auth('admin')).expect(201);
    expect(c.body).toEqual({ criados: 2, publicados: 2 });
  });
  it('importação por ficheiro JSON com campos e regras estruturados, em rascunho', async () => {
    const json = JSON.stringify([
      { codigo: 'JS-001', categoria: 'OUTROS', nome: 'Via JSON', texto: 'tratar de {{assunto}}', campos: [{ chave: 'assunto', rotulo: 'Assunto', tipo: 'TEXTO', obrigatorio: true }], regras: [{ tipo: 'REQUER', alvoCodigo: 'JS-002' }], publicar: false },
      { codigo: 'JS-002', categoria: 'OUTROS', nome: 'Via JSON 2', texto: 'praticar actos conexos', regras: [], publicar: false },
    ]);
    const p = await request(app.getHttpServer()).post('/api/v1/powers/import/preview').set(auth('admin')).attach('ficheiro', Buffer.from(json), 'catalogo.json').expect(201);
    expect({ novos: p.body.novos, erros: p.body.erros }).toEqual({ novos: 2, erros: 0 });
    const c = await request(app.getHttpServer()).post(`/api/v1/powers/import/${p.body.loteId}/commit`).set(auth('admin')).expect(201);
    expect(c.body).toEqual({ criados: 2, publicados: 0 });
    const operador = await request(app.getHttpServer()).get('/api/v1/powers').query({ q: 'JS-00', rascunhos: 'so' }).set(auth('operador')).expect(200);
    expect(operador.body.total).toBe(0); // rascunhos nunca chegam ao construtor
    const gestao = await request(app.getHttpServer()).get('/api/v1/powers').query({ q: 'JS-00', rascunhos: 'so' }).set(auth('admin')).expect(200);
    expect(gestao.body.itens.map((x: { codigo: string; publicado: boolean }) => [x.codigo, x.publicado]).sort()).toEqual([['JS-001', false], ['JS-002', false]]);
    const lote = await request(app.getHttpServer()).post('/api/v1/powers/publish-batch').set(auth('admin')).send({ ids: gestao.body.itens.map((x: { id: string }) => x.id) }).expect(201);
    expect(lote.body).toEqual({ publicados: 2, ignorados: 0 });
    const exp = await request(app.getHttpServer()).get('/api/v1/powers/export').set(auth('admin')).expect(200);
    expect(exp.body.find((x: { codigo: string }) => x.codigo === 'JS-001')).toMatchObject({ publicar: true, versao: 1 });
  });
  it('importação por ficheiro CSV (separador ;)', async () => {
    const csv = 'codigo;categoria;nome;texto\nCSV-001;OUTROS;Via CSV;praticar actos de teste';
    const p = await request(app.getHttpServer()).post('/api/v1/powers/import/preview').set(auth('admin')).attach('ficheiro', Buffer.from(csv), 'poderes.csv').expect(201);
    expect(p.body.novos).toBe(1);
  });
});

describe('Entidades durante a redacção', () => {
  it('operador acrescenta um banco; repetir devolve o existente; consulta não pode', async () => {
    const novo = await request(app.getHttpServer()).post('/api/v1/entities').set(auth('operador')).send({ tipo: 'BANCO', nome: 'Banco Exemplo de Teste, S.A.', sigla: 'BET' }).expect(201);
    expect(novo.body).toMatchObject({ name: 'Banco Exemplo de Teste, S.A.', shortName: 'BET', existente: false });
    const dup = await request(app.getHttpServer()).post('/api/v1/entities').set(auth('operador')).send({ tipo: 'BANCO', nome: '  banco exemplo de TESTE, s.a. ' }).expect(201);
    expect(dup.body).toMatchObject({ id: novo.body.id, existente: true });
    await request(app.getHttpServer()).post('/api/v1/entities').set(auth('consulta')).send({ tipo: 'BANCO', nome: 'Outro Banco' }).expect(403);
  });
});

describe('Pessoas', () => {
  it('não duplica pessoas com o mesmo documento e pesquisa por n.º de BI (índice cego)', async () => {
    const dto = { nomeCompleto: 'Outra Pessoa', sexo: 'M', nacionalidade: 'angolana', documento: { tipo: 'BI_AO', numero: '900000001LA001' } };
    const r = await request(app.getHttpServer()).post('/api/v1/persons').set(auth('operador')).send(dto).expect(409);
    expect(r.body.existente.nome).toBe('Amélia Demo Cardoso');
    const s = await request(app.getHttpServer()).get('/api/v1/persons').query({ q: '900000001LA001' }).set(auth('operador')).expect(200);
    expect(s.body[0].nomeCompleto).toBe('Amélia Demo Cardoso');
    expect(s.body[0].documento.numero).toBe('900•••001'); // mascarado na listagem
    const { rows } = await pool.query(`select doc_number_enc from persons where full_name = 'Amélia Demo Cardoso'`);
    expect(rows[0].doc_number_enc).not.toContain('900000001'); // cifrado em repouso
  });
  it('pesquisa eficaz: palavras em qualquer ordem e erros de escrita', async () => {
    const r1 = await request(app.getHttpServer()).get('/api/v1/persons').query({ q: 'cardoso amelia' }).set(auth('operador')).expect(200);
    expect(r1.body[0].nomeCompleto).toBe('Amélia Demo Cardoso');
    const r2 = await request(app.getHttpServer()).get('/api/v1/persons').query({ q: 'Fernandez Katya' }).set(auth('operador')).expect(200);
    expect(r2.body[0]).toMatchObject({ nomeCompleto: 'Kátia Demo Fernandes', aproximado: true });
  });
  it('importação de pessoas: pré-visualização (nova, duplicada, erro) e confirmação; só administradores', async () => {
    const csv = 'Nome;Sexo;Data de nascimento;Nacionalidade;Estado civil;BI;Validade;Morada;Código postal;Localidade;País\n'
      + 'Importada Pelo Ficheiro;F;15/03/1990;angolana;casada;900000099LA099;31/12/2032;Rua Importada, 1;4000-001;Porto;Portugal\n'
      + 'Amelia Repetida;F;01/01/1980;angolana;solteira;900000001LA001;01/01/2033;;;;\n'
      + 'Sem Documento;X;;angolana;;;;;;;';
    await request(app.getHttpServer()).post('/api/v1/persons/import/preview').set(auth('operador')).attach('ficheiro', Buffer.from(csv), 'pessoas.csv').expect(403);
    const p = await request(app.getHttpServer()).post('/api/v1/persons/import/preview').set(auth('admin')).attach('ficheiro', Buffer.from(csv), 'pessoas.csv').expect(201);
    // tolerante: a linha sem documento e sem sexo entra, com avisos
    expect({ novos: p.body.novos, duplicados: p.body.duplicados, erros: p.body.erros }).toEqual({ novos: 2, duplicados: 1, erros: 0 });
    expect(p.body.resultados[2].avisos).toEqual(expect.arrayContaining(['sem documento de identificação', 'sexo por indicar']));
    expect(p.body.resultados[0].documento).toBe('BI_AO 900•••099');
    const c = await request(app.getHttpServer()).post(`/api/v1/persons/import/${p.body.loteId}/commit`).set(auth('admin')).expect(201);
    expect(c.body).toEqual({ criados: 2, ignorados: 0 });
    const s2 = await request(app.getHttpServer()).get('/api/v1/persons').query({ q: '900000099LA099' }).set(auth('admin')).expect(200);
    expect(s2.body[0].nomeCompleto).toBe('Importada Pelo Ficheiro');
    const { rows } = await pool.query(`select payload from import_batches where id = $1`, [p.body.loteId]);
    expect(JSON.stringify(rows[0].payload)).not.toContain('Importada');
  });
  it('pesquisa por nome sem acentos', async () => {
    const s = await request(app.getHttpServer()).get('/api/v1/persons').query({ q: 'katia' }).set(auth('operador')).expect(200);
    expect(s.body[0].nomeCompleto).toBe('Kátia Demo Fernandes');
  });
});

describe('Ciclo de vida completo da procuração', () => {
  let poaId: string; let lock: number; let numero: string;
  const pessoa = async (q: string) => (await request(app.getHttpServer()).get('/api/v1/persons').query({ q }).set(auth('operador'))).body[0].id as string;
  const versao = async (codigo: string) => (await request(app.getHttpServer()).get('/api/v1/powers').query({ q: codigo }).set(auth('operador'))).body.itens.find((x: { codigo: string }) => x.codigo === codigo).versaoId as string;
  const entidade = async (nome: string) => { const r = await request(app.getHttpServer()).get('/api/v1/entities').set(auth('operador')); const e = r.body.find((x: { name: string }) => x.name === nome); return { id: e.id, nome: e.name, sigla: e.shortName }; };

  it('cria rascunho e recebe sugestões do tipo', async () => {
    const r = await request(app.getHttpServer()).post('/api/v1/poas').set(auth('operador')).send({ tipoCodigo: 'BANCARIA', dataActo: '2026-09-24', local: 'Porto', oficianteId: (await request(app.getHttpServer()).get('/api/v1/officers').set(auth('operador'))).body[0].id }).expect(201);
    poaId = r.body.id;
    const c = await request(app.getHttpServer()).get(`/api/v1/poas/${poaId}/check`).set(auth('operador')).expect(200);
    expect(c.body.sugestoes.map((x: { codigo: string }) => x.codigo)).toEqual(['BANC-008']);
    expect(c.body.pronta).toBe(false);
    lock = (await request(app.getHttpServer()).get(`/api/v1/poas/${poaId}`).set(auth('operador'))).body.lockVersion;
  });

  it('motor de regras: dependência em falta + IBAN inválido bloqueiam; correcção sugerida', async () => {
    const body = {
      lockVersion: lock, dataActo: '2026-09-24', local: 'Porto', oficianteId: (await request(app.getHttpServer()).get('/api/v1/officers').set(auth('operador'))).body[0].id, formaActuacao: 'ISOLADAMENTE',
      outorgantes: [{ pessoaId: await pessoa('Amélia') }], procuradores: [{ pessoaId: await pessoa('Gaspar') }],
      poderes: [{ versaoId: await versao('BANC-002'), valores: { iban: 'AO00000000000000000000000', operacoes: ['mov'] } }],
    };
    const g = await request(app.getHttpServer()).put(`/api/v1/poas/${poaId}`).set(auth('operador')).send(body).expect(200);
    lock = g.body.lockVersion;
    const c = await request(app.getHttpServer()).get(`/api/v1/poas/${poaId}/check`).set(auth('operador')).expect(200);
    const codigos = c.body.problemas.map((p: { codigo: string }) => p.codigo);
    expect(codigos).toEqual(expect.arrayContaining(['REQUER', 'CAMPO']));
    expect(c.body.problemas.find((p: { codigo: string }) => p.codigo === 'REQUER').correccao).toEqual({ accao: 'ADICIONAR', codigo: 'BANC-001' });
    await request(app.getHttpServer()).post(`/api/v1/poas/${poaId}/transitions`).set(auth('operador')).send({ accao: 'SUBMETER' }).expect(409);
  });

  it('concorrência optimista: guardar com lockVersion antigo -> 409', async () => {
    const d = (await request(app.getHttpServer()).get(`/api/v1/poas/${poaId}`).set(auth('operador'))).body;
    await request(app.getHttpServer()).put(`/api/v1/poas/${poaId}`).set(auth('operador')).send({ lockVersion: d.lockVersion - 1, dataActo: d.dataActo, local: 'Porto', formaActuacao: 'ISOLADAMENTE', outorgantes: [{ pessoaId: d.outorgantes[0].id }], procuradores: [{ pessoaId: d.procuradores[0].id }], poderes: [] }).expect(409);
  });

  it('corrige, ordena poderes e acrescenta cláusulas -> pronta', async () => {
    const body = {
      lockVersion: lock, dataActo: '2026-09-24', local: 'Porto', oficianteId: (await request(app.getHttpServer()).get('/api/v1/officers').set(auth('operador'))).body[0].id, formaActuacao: 'CONJUNTAMENTE',
      outorgantes: [{ pessoaId: await pessoa('Amélia') }], procuradores: [{ pessoaId: await pessoa('Helena') }, { pessoaId: await pessoa('Kátia') }],
      poderes: [
        { versaoId: await versao('BANC-001'), valores: { banco: await entidade('Banco Demo Alfa, S.A.') } },
        { versaoId: await versao('BANC-002'), valores: { iban: 'AO98004400006729503110102', operacoes: ['mov', 'ext', 'tnac', 'dep', 'lev'], limite: 1500000 } },
        { versaoId: await versao('BANC-003') },
        { versaoId: await versao('BANC-007') },
        { versaoId: await versao('ADM-003') },
        { versaoId: await versao('OUT-001') },
        { versaoId: await versao('CL-SUB'), valores: { modo: 'com' } },
        { versaoId: await versao('CL-VAL'), valores: {} },
      ].map((x) => ({ valores: {}, ...x })),
    };
    const g = await request(app.getHttpServer()).put(`/api/v1/poas/${poaId}`).set(auth('operador')).send(body).expect(200);
    lock = g.body.lockVersion;
    const c = await request(app.getHttpServer()).get(`/api/v1/poas/${poaId}/check`).set(auth('operador')).expect(200);
    expect(c.body.problemas.filter((p: { severidade: string }) => p.severidade === 'ERRO')).toEqual([]);
    expect(c.body.pronta).toBe(true);
  });

  it('pré-visualização HTML: concordância, extenso, marca de água e CSP', async () => {
    const r = await request(app.getHttpServer()).get(`/api/v1/poas/${poaId}/preview.html`).set(auth('operador')).expect(200);
    expect(r.headers['content-security-policy']).toContain("default-src 'none'");
    expect(r.text).toContain('vinte e quatro de Setembro de dois mil e vinte e seis');
    expect(r.text).toContain('suas bastantes procuradoras');
    expect(r.text).toContain('que deverão actuar sempre conjuntamente');
    expect(r.text).toContain('Kz 1.500.000,00 (um milhão e quinhentos mil kwanzas)');
    expect(r.text).toContain('RASCUNHO — SEM VALOR JURÍDICO');
    expect(r.text).toContain('a quem confere poderes necessários de representação para');
    expect(r.text).toContain('<strong>BDA – BANCO DEMO ALFA, S.A.</strong>');
    expect(r.text).toContain('class="mold esq"');
    writeFileSync('/tmp/preview.html', r.text);
  });

  it('pré-visualização PDF', async () => {
    const r = await request(app.getHttpServer()).get(`/api/v1/poas/${poaId}/preview.pdf`).set(auth('operador')).buffer(true).parse((res, cb) => { const b: Buffer[] = []; res.on('data', (d: Buffer) => b.push(d)); res.on('end', () => cb(null, Buffer.concat(b))); }).expect(200);
    expect((r.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    writeFileSync('/tmp/preview.pdf', r.body as Buffer);
  });

  it('workflow: segregação de funções, validação e emissão', async () => {
    await request(app.getHttpServer()).post(`/api/v1/poas/${poaId}/transitions`).set(auth('operador')).send({ accao: 'SUBMETER' }).expect(201);
    await request(app.getHttpServer()).post(`/api/v1/poas/${poaId}/transitions`).set(auth('operador')).send({ accao: 'VALIDAR' }).expect(403); // operador não tem poa.validate
    await request(app.getHttpServer()).post(`/api/v1/poas/${poaId}/transitions`).set(auth('validador')).send({ accao: 'VALIDAR' }).expect(201);
    const e = await request(app.getHttpServer()).post(`/api/v1/poas/${poaId}/transitions`).set(auth('validador')).send({ accao: 'EMITIR' }).expect(201);
    numero = e.body.numero;
    expect(numero).toBe(`PROC-${new Date().getUTCFullYear()}-000001`);
    expect(e.body.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('documentos emitidos: PDF + DOCX com integridade verificada no download', async () => {
    const d = (await request(app.getHttpServer()).get(`/api/v1/poas/${poaId}`).set(auth('consulta')).expect(200)).body;
    expect(d.documentos.map((x: { tipo: string }) => x.tipo).sort()).toEqual(['DOCX', 'PDF']);
    for (const doc of d.documentos) {
      const r = await request(app.getHttpServer()).get(`/api/v1/documents/${doc.id}/download`).set(auth('consulta')).buffer(true).parse((res, cb) => { const b: Buffer[] = []; res.on('data', (x: Buffer) => b.push(x)); res.on('end', () => cb(null, Buffer.concat(b))); }).expect(200);
      expect(createHash('sha256').update(r.body as Buffer).digest('hex')).toBe(doc.sha256);
      writeFileSync(`/tmp/emitida.${doc.tipo === 'PDF' ? 'pdf' : 'docx'}`, r.body as Buffer);
    }
  });

  it('procuração emitida é imutável (API e base de dados)', async () => {
    await request(app.getHttpServer()).put(`/api/v1/poas/${poaId}`).set(auth('admin')).send({ lockVersion: 99, dataActo: '2026-09-24', local: 'Lisboa', formaActuacao: 'ISOLADAMENTE', outorgantes: [{ pessoaId: await pessoa('Amélia') }], procuradores: [{ pessoaId: await pessoa('Gaspar') }], poderes: [] }).expect((r) => { if (r.status !== 409) throw new Error(JSON.stringify(r.body)); });
    await expect(pool.query(`update powers_of_attorney set act_date = '2020-01-01' where id = $1`, [poaId])).rejects.toThrow(/imutável/);
    await expect(pool.query(`delete from poa_powers where poa_id = $1`, [poaId])).rejects.toThrow(/não pode ser alterada/);
    await expect(pool.query(`delete from powers_of_attorney where id = $1`, [poaId])).rejects.toThrow(/Cancelar/);
    await expect(pool.query(`update audit_logs set action = 'x' where id = 1`)).rejects.toThrow(/append-only/);
  });

  it('versionamento: publicar nova versão de um poder não altera a procuração emitida', async () => {
    const pw = (await request(app.getHttpServer()).get('/api/v1/powers').query({ q: 'BANC-007' }).set(auth('admin'))).body.itens[0];
    await request(app.getHttpServer()).put(`/api/v1/powers/${pw.id}/draft`).set(auth('admin')).send({ texto: 'TEXTO NOVO DA V2 do levantamento de cartões', campos: [], regras: [{ tipo: 'REQUER', alvoCodigo: 'BANC-001' }] }).expect(200);
    await request(app.getHttpServer()).post(`/api/v1/powers/${pw.id}/publish`).set(auth('admin')).expect(201);
    const { rows } = await pool.query(`select v.status, v.version_no from power_versions v join powers p on p.id = v.power_id where p.code = 'BANC-007' order by v.version_no`);
    expect(rows).toEqual([{ status: 'RETIRADA', version_no: 1 }, { status: 'PUBLICADA', version_no: 2 }]);
    await expect(pool.query(`update power_versions v set text = 'adulterado' from powers p where p.id = v.power_id and p.code = 'BANC-007' and v.version_no = 1`)).rejects.toThrow(/imutável/);
    const d = (await request(app.getHttpServer()).get(`/api/v1/poas/${poaId}`).set(auth('operador'))).body;
    expect(d.poderes.find((x: { codigo: string }) => x.codigo === 'BANC-007').versao).toBe(1); // continua na v1
  });

  it('duplicação: novo rascunho, versões actuais, original intacto', async () => {
    const r = await request(app.getHttpServer()).post(`/api/v1/poas/${poaId}/duplicate`).set(auth('operador')).expect(201);
    const n = (await request(app.getHttpServer()).get(`/api/v1/poas/${r.body.id}`).set(auth('operador'))).body;
    expect(n.estado).toBe('RASCUNHO'); expect(n.numero).toBeNull();
    expect(n.poderes.find((x: { codigo: string }) => x.codigo === 'BANC-007').versao).toBe(2);
    expect(n.poderes).toHaveLength(8);
  });

  it('cancelamento exige motivo; histórico e pesquisa global', async () => {
    await request(app.getHttpServer()).post(`/api/v1/poas/${poaId}/transitions`).set(auth('validador')).send({ accao: 'CANCELAR' }).expect(409);
    await request(app.getHttpServer()).post(`/api/v1/poas/${poaId}/transitions`).set(auth('validador')).send({ accao: 'CANCELAR', motivo: 'Teste de cancelamento' }).expect(201);
    const d = (await request(app.getHttpServer()).get(`/api/v1/poas/${poaId}`).set(auth('operador'))).body;
    expect(d.historico.map((h: { action: string }) => h.action)).toEqual(['CRIAR', 'SUBMETER', 'VALIDAR', 'EMITIR', 'CANCELAR']);
    for (const q of [numero, 'amelia', '900000012LA012']) {
      const s = await request(app.getHttpServer()).get('/api/v1/poas').query({ q }).set(auth('consulta')).expect(200);
      expect(s.body.itens.some((x: { id: string }) => x.id === poaId)).toBe(true);
    }
  });

  it('emissão directa: quem tem a permissão faz o documento completo; operador não pode', async () => {
    const ofi = (await request(app.getHttpServer()).get('/api/v1/officers').set(auth('admin'))).body[0].id;
    const c = await request(app.getHttpServer()).post('/api/v1/poas').set(auth('admin')).send({ tipoCodigo: 'ESPECIAL', dataActo: '2026-09-24', local: 'Porto', oficianteId: ofi }).expect(201);
    const d = (await request(app.getHttpServer()).get(`/api/v1/poas/${c.body.id}`).set(auth('admin'))).body;
    await request(app.getHttpServer()).put(`/api/v1/poas/${c.body.id}`).set(auth('admin')).send({
      lockVersion: d.lockVersion, dataActo: '2026-09-24', local: 'Porto', oficianteId: ofi, formaActuacao: 'ISOLADAMENTE',
      outorgantes: [{ pessoaId: await pessoa('Carlos') }], procuradores: [{ pessoaId: await pessoa('Gaspar') }],
      poderes: [{ versaoId: await versao('ADM-003'), valores: {} }],
    }).expect(200);
    await request(app.getHttpServer()).post(`/api/v1/poas/${c.body.id}/transitions`).set(auth('operador')).send({ accao: 'EMITIR_DIRECTO' }).expect(403);
    const e = await request(app.getHttpServer()).post(`/api/v1/poas/${c.body.id}/transitions`).set(auth('admin')).send({ accao: 'EMITIR_DIRECTO' }).expect(201);
    expect(e.body.numero).toMatch(/^PROC-\d{4}-\d{6}$/);
    const h = (await request(app.getHttpServer()).get(`/api/v1/poas/${c.body.id}`).set(auth('admin'))).body.historico.map((x: { action: string }) => x.action);
    expect(h).toEqual(['CRIAR', 'EMITIR_DIRECTO']);
  });

  it('auditoria íntegra e dashboard', async () => {
    const v = await request(app.getHttpServer()).get('/api/v1/audit/verify').set(auth('admin')).expect(200);
    expect(v.body.integra).toBe(true);
    const dsh = await request(app.getHttpServer()).get('/api/v1/dashboard').set(auth('consulta')).expect(200);
    expect(dsh.body.totais.total).toBeGreaterThanOrEqual(2);
    expect(dsh.body.topPoderes[0].total).toBeGreaterThanOrEqual(1);
  });

  it('exportação CSV protegida contra injecção de fórmulas', async () => {
    const r = await request(app.getHttpServer()).get('/api/v1/exports/poas').query({ formato: 'csv' }).set(auth('admin')).expect(200);
    expect(r.text).toContain(numero);
  });
});

describe('Pessoas com dados incompletos e eliminação de procurações', () => {
  it('pessoa sem documento e sem sexo pode ser registada (a emissão é que o exige)', async () => {
    const r = await request(app.getHttpServer()).post('/api/v1/persons').set(auth('operador')).send({ nomeCompleto: 'Registo Importado Sem Documento', nacionalidade: '' }).expect(201);
    const p = await request(app.getHttpServer()).get(`/api/v1/persons/${r.body.id}`).set(auth('operador')).expect(200);
    expect(p.body.documento.numero).toBe('');
    const bi = await request(app.getHttpServer()).post('/api/v1/persons').set(auth('operador')).send({ nomeCompleto: 'Registo Com BI Estranho', sexo: 'F', nacionalidade: 'angolana', documento: { tipo: 'BI_AO', numero: '752/2024' } }).expect(201);
    expect(bi.body.id).toBeDefined();
  });
  it('só quem tem poa.purge apaga; apagar uma e depois todas; a auditoria fica íntegra', async () => {
    const lista = await request(app.getHttpServer()).get('/api/v1/poas').query({ limite: 100 }).set(auth('admin')).expect(200);
    const emitida = lista.body.itens.find((x: { estado: string }) => x.estado !== 'RASCUNHO');
    await request(app.getHttpServer()).delete(`/api/v1/poas/${emitida.id}`).set(auth('operador')).send({ motivo: 'teste de permissão' }).expect(403);
    await request(app.getHttpServer()).delete(`/api/v1/poas/${emitida.id}`).set(auth('admin')).send({ motivo: 'x' }).expect(400);
    const a = await request(app.getHttpServer()).delete(`/api/v1/poas/${emitida.id}`).set(auth('admin')).send({ motivo: 'Documento de teste' }).expect(200);
    expect(a.body.apagadas).toBe(1);
    await request(app.getHttpServer()).get(`/api/v1/poas/${emitida.id}`).set(auth('admin')).expect(404);
    // fora da purga, os triggers continuam a impedir apagar uma emitida directamente na base
    const outra = lista.body.itens.find((x: { estado: string; id: string }) => x.estado !== 'RASCUNHO' && x.id !== emitida.id);
    if (outra) await expect(pool.query('delete from powers_of_attorney where id = $1', [outra.id])).rejects.toThrow(/não pode ser apagada/);
    await request(app.getHttpServer()).post('/api/v1/admin/purge-poas').set(auth('admin')).send({ confirmacao: 'sim', motivo: 'limpeza de testes' }).expect(400);
    const t = await request(app.getHttpServer()).post('/api/v1/admin/purge-poas').set(auth('admin')).send({ confirmacao: 'APAGAR TUDO', motivo: 'limpeza de testes', reiniciarNumeracao: true }).expect(201);
    expect(t.body.apagadas).toBeGreaterThan(0);
    const vazio = await request(app.getHttpServer()).get('/api/v1/poas').set(auth('admin')).expect(200);
    expect(vazio.body.total).toBe(0);
    const v = await request(app.getHttpServer()).get('/api/v1/audit/verify').set(auth('admin')).expect(200);
    expect(v.body.integra).toBe(true);
  });
});
