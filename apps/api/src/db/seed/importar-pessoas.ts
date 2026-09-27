/**
 * Importação em massa de pessoas (ex.: registo consular com centenas de milhares de linhas), directamente para a base.
 * Insere TODAS as linhas, com BI correcto ou não:
 *  - BI com formato não habitual: entra tal como está (assinalado no relatório);
 *  - sem BI (ou valor sem conteúdo, como "0"): entra sem documento;
 *  - BI repetido no ficheiro: a 1.ª linha fica com o documento; as seguintes entram sem documento e com o n.º nas observações;
 *  - BI que já existe na base: a linha é ignorada (a pessoa já existe);
 *  - sem nome: entra como "SEM NOME (linha N)".
 * Os números de documento, NIF, telefones e emails ficam cifrados, como no resto da plataforma.
 * A procuração só pode ser emitida quando os dados das partes estiverem completos (checklist).
 *
 * Uso (na pasta do projecto):
 *   DATABASE_URL_DIRECT=… DATA_ENC_KEY=… DATA_BIDX_KEY=… JWT_SECRET=… npm run db:importar-pessoas -w @proc/api -- "C:\caminho\Lista.csv" [--simular]
 * As chaves têm de ser AS MESMAS do Render (senão a plataforma não consegue ler os dados).
 */
import 'reflect-metadata';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, isNotNull, and } from 'drizzle-orm';
import * as s from '../schema';
import { AuditService } from '../../common/audit.service';
import { CryptoService } from '../../common/crypto.service';
import { ImportService } from '../../powers/import.service';
import { PersonsService, PessoaDto, avisosPessoa, mascarar } from '../../persons/persons.service';
import { mapearLinhaPessoa } from '../../persons/persons-import.service';
import { criarPool, urlDirecta } from '../conexao';
import type { Db } from '../db.module';

async function main() {
  const args = process.argv.slice(2);
  const ficheiro = args.find((a) => !a.startsWith('--'));
  const simular = args.includes('--simular');
  const orgCode = args.find((a) => a.startsWith('--org='))?.slice(6);
  if (!ficheiro) { console.error('Indique o ficheiro: npm run db:importar-pessoas -w @proc/api -- "ficheiro.csv"'); process.exit(1); }
  process.env.DATABASE_URL ??= urlDirecta();
  const pool = criarPool(urlDirecta(), { max: 3, aplicacao: 'procuracoes-importar-pessoas' });
  const db = drizzle(pool, { schema: s }) as unknown as Db;
  const crypto = new CryptoService();
  const pessoas = new PersonsService(db, crypto, new AuditService());

  const orgs = await db.select().from(s.organizations);
  const org = orgCode ? orgs.find((o) => o.code === orgCode) : orgs.find((o) => o.code !== 'DEMO') ?? orgs[0];
  if (!org) throw new Error('Nenhuma organização na base (corra primeiro o bootstrap).');
  const [admin] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.orgId, org.id)).limit(1);
  console.log(`Organização: ${org.name} (${org.code})${simular ? ' — SIMULAÇÃO, nada é gravado' : ''}`);

  const t0 = Date.now();
  const linhas = await (Object.create(ImportService.prototype) as ImportService).lerFicheiro(ficheiro, readFileSync(ficheiro)); // só o leitor de ficheiros
  console.log(`${linhas.length} linhas lidas em ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  // Documentos que já existem na base (índice cego)
  const existentes = new Set((await db.select({ t: s.persons.docType, b: s.persons.docNumberBidx }).from(s.persons).where(and(eq(s.persons.orgId, org.id), isNotNull(s.persons.docNumberBidx)))).map((r) => `${r.t}|${r.b}`));
  const vistos = new Set<string>();
  const relatorio: string[] = ['linha;nome;documento;resultado;observacoes'];
  const cont = { total: 0, inseridas: 0, jaExistiam: 0, semDocumento: 0, docRepetido: 0, biFormatoNaoHabitual: 0, semSexo: 0, semNome: 0, dataInvalida: 0 };
  let lote: (typeof s.persons.$inferInsert)[] = [];
  const gravar = async () => { if (!lote.length) return; if (!simular) await db.insert(s.persons).values(lote); cont.inseridas += lote.length; lote = []; };

  for (let i = 0; i < linhas.length; i++) {
    cont.total++;
    const nLinha = i + 2;
    const c = mapearLinhaPessoa(linhas[i]) as PessoaDto & { dataNascimento?: string | null };
    if (!c.nomeCompleto?.trim() || c.nomeCompleto.trim().length < 2) { c.nomeCompleto = `SEM NOME (linha ${nLinha})`; cont.semNome++; }
    const notas: string[] = [];
    if (c.dataNascimento && !/^\d{4}-\d{2}-\d{2}$/.test(c.dataNascimento)) { notas.push(`data de nascimento ilegível: ${c.dataNascimento}`); c.dataNascimento = null; cont.dataInvalida++; }
    const r = PessoaDto.safeParse(c);
    if (!r.success) { relatorio.push(`${nLinha};${c.nomeCompleto};;NÃO IMPORTADA;${r.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join(' | ')}`); continue; }
    let d = r.data;
    if (d.documento.numero) {
      const k = `${d.documento.tipo}|${crypto.blindIndex(d.documento.numero, 'doc')}`;
      if (existentes.has(k)) { cont.jaExistiam++; relatorio.push(`${nLinha};${d.nomeCompleto};${mascarar(d.documento.numero)};JÁ EXISTIA;ignorada`); continue; }
      if (vistos.has(k)) {
        cont.docRepetido++;
        notas.push(`N.º de documento repetido no ficheiro de importação: ${d.documento.numero}`);
        d = { ...d, documento: { ...d.documento, numero: null } };
      } else vistos.add(k);
    }
    const avisos = avisosPessoa(d);
    if (!d.documento.numero) cont.semDocumento++;
    if (avisos.includes('n.º de BI com formato não habitual')) cont.biFormatoNaoHabitual++;
    if (!d.sexo) cont.semSexo++;
    if (notas.length) d = { ...d, observacoes: [d.observacoes, ...notas].filter(Boolean).join(' · ') };
    lote.push({ orgId: org.id, ...pessoas.colunas(d), createdBy: admin?.id });
    if (avisos.length || notas.length) relatorio.push(`${nLinha};${d.nomeCompleto.replace(/;/g, ',')};${mascarar(d.documento.numero)};IMPORTADA COM AVISOS;${[...avisos, ...notas.map((x) => x.replace(/: .*/, ''))].join(' | ')}`);
    if (lote.length >= 1000) { await gravar(); if (cont.inseridas % 20000 === 0) console.log(`  … ${cont.inseridas} inseridas`); }
  }
  await gravar();
  if (!simular) await db.transaction((tx) => new AuditService().log(tx, admin ? { id: admin.id } : null, 'PESSOAS_IMPORTAR_MASSA', 'organization', org.id, { ficheiro: path.basename(ficheiro), ...cont }));
  const rel = path.resolve(path.dirname(ficheiro), `relatorio-importacao-pessoas-${new Date().toISOString().slice(0, 10)}.csv`);
  writeFileSync(rel, '\uFEFF' + relatorio.join('\n'));
  console.log(`\nConcluído em ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  console.table(cont);
  console.log(`Relatório (linhas com avisos ou ignoradas): ${rel}`);
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
