import { BadRequestException, Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Put, Query, Res, UploadedFile, UseInterceptors, Delete } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { z } from 'zod';
import { renderizarHtml } from '@proc/core';
import { Actor, Requer, Utilizador, ZodPipe } from '../common/http';
import { PdfService } from '../documents/pdf.service';
import { PurgaService } from './purga.service';
import { EmissaoService } from './emissao.service';
import { CriarProcuracao, GuardarProcuracao, PesquisaProcuracoes, Transicao } from './poa.schemas';
import { PoaService } from './poa.service';

@Controller()
export class PoaController {
  constructor(private readonly svc: PoaService, private readonly emissao: EmissaoService, private readonly pdf: PdfService, private readonly purga: PurgaService) {}

  /** Apagar uma procuração (qualquer estado) e os seus documentos. Irreversível; fica na auditoria. */
  @Delete('poas/:id') @Requer('poa.purge')
  apagar(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(z.object({ motivo: z.string().trim().min(5, 'Indique o motivo (mín. 5 caracteres)').max(500) }))) b: { motivo: string }, @Actor() u: Utilizador) {
    return this.purga.apagarUma(id, b.motivo, u);
  }

  /** Apagar TODAS as procurações e documentos (ex.: antes de começar a produção). */
  @Post('admin/purge-poas') @Requer('poa.purge')
  apagarTodas(@Body(new ZodPipe(z.object({ confirmacao: z.string(), motivo: z.string().trim().min(5).max(500), reiniciarNumeracao: z.boolean().default(false) }))) b: { confirmacao: string; motivo: string; reiniciarNumeracao: boolean }, @Actor() u: Utilizador) {
    return this.purga.apagarTodas(b, u);
  }

  @Get('poas') @Requer('poa.read') pesquisar(@Query(new ZodPipe(PesquisaProcuracoes)) q: z.infer<typeof PesquisaProcuracoes>, @Actor() u: Utilizador) { return this.svc.pesquisar(q, u); }
  @Post('poas') @Requer('poa.create') criar(@Body(new ZodPipe(CriarProcuracao)) b: z.infer<typeof CriarProcuracao>, @Actor() u: Utilizador) { return this.svc.criar(b, u); }
  @Get('poas/:id') @Requer('poa.read') detalhe(@Param('id', ParseUUIDPipe) id: string, @Actor() u: Utilizador) { return this.svc.detalhe(id, u); }
  @Put('poas/:id') @Requer('poa.edit') guardar(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(GuardarProcuracao)) b: GuardarProcuracao, @Actor() u: Utilizador) { return this.svc.guardar(id, b, u); }
  @Get('poas/:id/check') @Requer('poa.read') verificar(@Param('id', ParseUUIDPipe) id: string, @Actor() u: Utilizador) { this.pdf.aquecer(); return this.svc.verificar(id, u); }
  @Post('poas/:id/duplicate') @Requer('poa.create') duplicar(@Param('id', ParseUUIDPipe) id: string, @Actor() u: Utilizador) { return this.svc.duplicar(id, u); }

  @Post('poas/:id/transitions') @Requer('poa.read')
  transicao(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Transicao)) b: z.infer<typeof Transicao>, @Actor() u: Utilizador) {
    if (b.accao === 'EMITIR' || b.accao === 'EMITIR_DIRECTO') return this.emissao.emitir(id, u, b.accao === 'EMITIR_DIRECTO');
    return this.svc.transitar(id, b.accao, b.motivo, u);
  }

  /** Pré-visualização HTML (no ecrã). CSP restritiva: sem scripts, sem recursos externos. */
  @Get('poas/:id/preview.html') @Requer('poa.read')
  @Header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:")
  async previewHtml(@Param('id', ParseUUIDPipe) id: string, @Actor() u: Utilizador, @Res() res: Response) {
    this.pdf.aquecer(); // quem pré-visualiza costuma emitir a seguir: o Chromium fica pronto
    res.type('html').send(renderizarHtml(await this.svc.documentoPreVisualizacao(id, u)));
  }

  /** Pré-visualização PDF — o mesmo motor da emissão, com marca de água "RASCUNHO". */
  @Get('poas/:id/preview.pdf') @Requer('poa.read')
  async previewPdf(@Param('id', ParseUUIDPipe) id: string, @Actor() u: Utilizador, @Res() res: Response) {
    const buf = await this.pdf.gerar(await this.svc.documentoPreVisualizacao(id, u));
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="pre-visualizacao.pdf"', 'Cache-Control': 'no-store' }).send(buf);
  }

  @Post('poas/:id/signed-scan') @Requer('poa.issue')
  @UseInterceptors(FileInterceptor('ficheiro', { limits: { fileSize: 20 * 1024 * 1024 } }))
  assinada(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() f: Express.Multer.File | undefined, @Actor() u: Utilizador) {
    if (!f) throw new BadRequestException('Envie o PDF no campo "ficheiro"');
    return this.emissao.registarAssinatura(id, f.buffer, u);
  }

  @Get('documents/:id/download') @Requer('document.download')
  async download(@Param('id', ParseUUIDPipe) id: string, @Actor() u: Utilizador, @Res() res: Response) {
    const d = await this.emissao.descarregar(id, u);
    res.set({ 'Content-Type': d.mime, 'Content-Disposition': `attachment; filename="${d.nome}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }).send(d.buf);
  }
}
