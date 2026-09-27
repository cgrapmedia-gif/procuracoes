import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { AuditService } from '../common/audit.service';
import { Utilizador } from '../common/http';
import { Db, InjectDb } from '../db/db.module';
import { importBatches, powerCategories, powers } from '../db/schema';
import { CriarPoder } from './power.schemas';
import { PowersService } from './powers.service';

type Linha = Record<string, unknown>;
export interface ResultadoLinha { linha: number; codigo: string; estado: 'NOVO' | 'DUPLICADO' | 'ERRO'; erros: string[] }

/**
 * Importação em massa (CSV / Excel / JSON) em duas fases:
 *  1) pré-visualização — valida tudo e guarda o lote (nada é criado);
 *  2) confirmação — cria os poderes numa única transacção (tudo ou nada).
 * Colunas: codigo, categoria, nome, descricao, tipo, texto, texto_alternativo, campos (JSON), regras (JSON ou "REQUER:X;SUGERE:Y"), exclusivo, tipos_permitidos ("A;B"), publicar
 */
/** Texto de um ficheiro: UTF-8 ou, se não for UTF-8 válido, Windows-1252 (CSV gravado pelo Excel em português). */
export function decodificarTexto(buf: Buffer): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('windows-1252').decode(buf); }
}

@Injectable()
export class ImportService {
  constructor(@InjectDb() private readonly db: Db, private readonly powersSvc: PowersService, private readonly audit: AuditService) {}

  async lerFicheiro(nome: string, buf: Buffer): Promise<Linha[]> {
    const ext = nome.toLowerCase().split('.').pop();
    if (ext === 'json') { const j = JSON.parse(buf.toString('utf8')); if (!Array.isArray(j)) throw new BadRequestException('JSON deve ser uma lista'); return j; }
    if (ext === 'csv') {
      const r = Papa.parse<Linha>(decodificarTexto(buf).replace(/^\uFEFF/, ''), { header: true, skipEmptyLines: true, delimitersToGuess: [',', ';', '\t'] });
      if (r.errors.length) throw new BadRequestException({ message: 'CSV inválido', erros: r.errors.slice(0, 20).map((e) => `linha ${(e.row ?? 0) + 2}: ${e.message}`) });
      return r.data;
    }
    if (ext === 'xlsx') {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf as unknown as ArrayBuffer);
      const ws = wb.worksheets[0];
      const cab = (ws.getRow(1).values as unknown[]).slice(1).map((v) => String(v ?? '').trim());
      const out: Linha[] = [];
      ws.eachRow((row, n) => { if (n === 1) return; const vals = (row.values as unknown[]).slice(1); const l: Linha = {}; cab.forEach((c, i) => { const v = vals[i] as { text?: string } | unknown; l[c] = typeof v === 'object' && v && 'text' in (v as object) ? (v as { text: string }).text : v; }); out.push(l); });
      return out;
    }
    throw new BadRequestException('Formato não suportado (use .csv, .xlsx ou .json)');
  }

  private normalizar(l: Linha) {
    const s = (k: string) => (l[k] === undefined || l[k] === null ? undefined : String(l[k]).trim() || undefined);
    const json = (k: string) => { const v = l[k]; if (v === undefined || v === null || v === '') return undefined; if (typeof v !== 'string') return v; return JSON.parse(v); };
    // JSON traz listas já estruturadas; CSV/Excel trazem texto (JSON ou "REQUER:X;SUGERE:Y")
    let regras: unknown = [];
    if (Array.isArray(l.regras)) regras = l.regras;
    else {
      const regrasTxt = s('regras');
      if (regrasTxt) regras = regrasTxt.startsWith('[') ? JSON.parse(regrasTxt) : regrasTxt.split(';').filter(Boolean).map((x) => { const [tipo, alvo] = x.split(':').map((y) => y.trim()); return { tipo, alvoCodigo: alvo }; });
    }
    return {
      codigo: s('codigo'), tipo: s('tipo') ?? 'PODER', categoriaCodigo: s('categoria'), nome: s('nome'), descricao: s('descricao'),
      texto: s('texto'), textoAlternativo: s('texto_alternativo') ?? s('textoAlternativo'), campos: Array.isArray(l.campos) ? l.campos : json('campos') ?? [], regras,
      exclusivo: ['true', '1', 'sim', 's'].includes(String(l.exclusivo ?? '').toLowerCase()) || l.exclusivo === true,
      tiposPermitidos: Array.isArray(l.tiposPermitidos) ? l.tiposPermitidos : (s('tipos_permitidos')?.split(';').map((x) => x.trim()).filter(Boolean) ?? []),
      publicar: !['false', '0', 'nao', 'não', 'n'].includes(String(l.publicar ?? 'true').toLowerCase()),
    };
  }

  async preVisualizar(nome: string, linhas: Linha[], u: Utilizador) {
    if (linhas.length === 0) throw new BadRequestException('Ficheiro sem linhas');
    if (linhas.length > 5000) throw new BadRequestException('Máximo de 5000 poderes por lote');
    const cats = new Set((await this.db.select({ c: powerCategories.code }).from(powerCategories)).map((r) => r.c));
    const codigosFicheiro = linhas.map((l) => String(l.codigo ?? '').trim());
    const existentes = new Set((await this.db.select({ c: powers.code }).from(powers).where(inArray(powers.code, codigosFicheiro.filter(Boolean).length ? codigosFicheiro.filter(Boolean) : ['__']))).map((r) => r.c));
    const todosCodigos = new Set([...existentes, ...codigosFicheiro]);
    const vistos = new Set<string>();
    const resultados: ResultadoLinha[] = [];
    const validos: unknown[] = [];
    linhas.forEach((l, i) => {
      const erros: string[] = [];
      let n: ReturnType<ImportService['normalizar']> | undefined;
      try { n = this.normalizar(l); } catch (e) { erros.push(`JSON inválido em campos/regras: ${(e as Error).message}`); }
      const codigo = n?.codigo ?? String(l.codigo ?? '');
      if (n) {
        const r = CriarPoder.safeParse(n);
        if (!r.success) erros.push(...r.error.issues.map((x) => `${x.path.join('.') || 'linha'}: ${x.message}`));
        if (n.categoriaCodigo && !cats.has(n.categoriaCodigo)) erros.push(`categoria inexistente: ${n.categoriaCodigo}`);
        for (const rg of (n.regras as { alvoCodigo?: string }[]) ?? []) if (rg.alvoCodigo && !todosCodigos.has(rg.alvoCodigo)) erros.push(`regra refere código inexistente: ${rg.alvoCodigo}`);
        if (r.success) { try { this.powersSvc.validarConteudo(r.data, r.data.codigo); } catch (e) { const resp = (e as { getResponse?: () => { erros?: string[] } }).getResponse?.(); erros.push(...(resp?.erros ?? [(e as Error).message])); } }
        if (!erros.length && r.success) {
          if (existentes.has(codigo) || vistos.has(codigo)) { resultados.push({ linha: i + 2, codigo, estado: 'DUPLICADO', erros: [existentes.has(codigo) ? 'código já existe no catálogo' : 'código repetido no ficheiro'] }); vistos.add(codigo); return; }
          vistos.add(codigo); validos.push({ ...r.data, publicar: n.publicar });
        }
      }
      resultados.push({ linha: i + 2, codigo, estado: erros.length ? 'ERRO' : 'NOVO', erros });
    });
    const summary = { total: linhas.length, novos: resultados.filter((r) => r.estado === 'NOVO').length, duplicados: resultados.filter((r) => r.estado === 'DUPLICADO').length, erros: resultados.filter((r) => r.estado === 'ERRO').length };
    const [b] = await this.db.insert(importBatches).values({ kind: 'POWERS', filename: nome, payload: validos, summary: { ...summary, resultados }, createdBy: u.id }).returning({ id: importBatches.id });
    return { loteId: b.id, ...summary, resultados };
  }

  async confirmar(loteId: string, u: Utilizador) {
    return this.db.transaction(async (tx) => {
      const [b] = await tx.select().from(importBatches).where(eq(importBatches.id, loteId)).for('update');
      if (!b) throw new NotFoundException('Lote inexistente');
      if (b.status !== 'PREVIEW') throw new BadRequestException('Lote já processado');
      if (b.createdBy !== u.id) throw new BadRequestException('Só quem preparou o lote o pode confirmar');
      const itens = b.payload as (ReturnType<typeof CriarPoder.parse> & { publicar: boolean })[];
      // 1.º cria todos (as regras podem referir-se entre si), 2.º publica
      const criados: { id: string; versaoId: string; publicar: boolean }[] = [];
      for (const it of itens) criados.push({ ...(await this.powersSvc.criar(it, u, { tx })), publicar: it.publicar });
      for (const c of criados.filter((x) => x.publicar)) await this.powersSvc.publicarVersao(tx, c.id, c.versaoId, u);
      await tx.update(importBatches).set({ status: 'CONFIRMADO', committedAt: new Date() }).where(eq(importBatches.id, loteId));
      await this.audit.log(tx, u, 'PODERES_IMPORTAR', 'import_batch', loteId, { criados: criados.length });
      return { criados: criados.length, publicados: criados.filter((x) => x.publicar).length };
    });
  }
}
