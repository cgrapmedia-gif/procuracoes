import { BadRequestException, Body, Controller, Delete, Get, Header, Param, ParseUUIDPipe, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { renderizarHtml } from '@proc/core';
import { Actor, Requer, Utilizador, ZodPipe } from '../common/http';
import { PdfService } from '../documents/pdf.service';
import { DadosDeclaracaoDto, DeclaracoesService, GuardarDeclaracao } from './declaracoes.service';

/** Provas de vida (declarações consulares). */
@Controller('declaracoes')
export class DeclaracoesController {
  constructor(private readonly svc: DeclaracoesService, private readonly pdf: PdfService) {}

  @Get() @Requer('decl.read')
  listar(@Query('q') q: string | undefined, @Query('estado') estado: string | undefined, @Query('pagina') pagina: string | undefined, @Actor() u: Utilizador) {
    return this.svc.listar(u, { q, estado, pagina: Number(pagina) || 1 });
  }

  @Get('numeracao') @Requer('decl.read') numeracao(@Actor() u: Utilizador) { return this.svc.numeracao(u); }

  @Put('numeracao') @Requer('catalog.manage')
  definirNumeracao(@Body(new ZodPipe(z.object({ padrao: z.string().min(5).max(80), digitos: z.number().int().min(1).max(8), proximo: z.number().int().min(1).max(999999).optional() }))) b: { padrao: string; digitos: number; proximo?: number }, @Actor() u: Utilizador) {
    return this.svc.definirNumeracao(b, u);
  }

  @Post() @Requer('decl.create')
  criar(@Body(new ZodPipe(DadosDeclaracaoDto)) b: DadosDeclaracaoDto, @Actor() u: Utilizador) { return this.svc.criar(b, u); }

  @Get(':id') @Requer('decl.read') detalhe(@Param('id', ParseUUIDPipe) id: string, @Actor() u: Utilizador) { this.pdf.aquecer(); return this.svc.detalhe(id, u); }

  @Put(':id') @Requer('decl.create')
  guardar(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(GuardarDeclaracao)) b: z.infer<typeof GuardarDeclaracao>, @Actor() u: Utilizador) { return this.svc.guardar(id, b, u); }

  @Get(':id/preview.html') @Requer('decl.read') @Header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:")
  async previa(@Param('id', ParseUUIDPipe) id: string, @Actor() u: Utilizador, @Res() res: Response) {
    res.type('html').send(renderizarHtml(await this.svc.preVisualizar(id, u)));
  }

  @Get(':id/blocos') @Requer('decl.read') blocos(@Param('id', ParseUUIDPipe) id: string, @Actor() u: Utilizador) { return this.svc.blocos(id, u); }

  @Post(':id/emitir') @Requer('decl.issue') emitir(@Param('id', ParseUUIDPipe) id: string, @Actor() u: Utilizador) { return this.svc.emitir(id, u); }

  @Post(':id/cancelar') @Requer('decl.issue')
  cancelar(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(z.object({ motivo: z.string().trim().min(5).max(500) }))) b: { motivo: string }, @Actor() u: Utilizador) { return this.svc.cancelar(id, b.motivo, u); }

  @Post(':id/renovar') @Requer('decl.create') renovar(@Param('id', ParseUUIDPipe) id: string, @Actor() u: Utilizador) { return this.svc.renovar(id, u); }

  @Delete(':id') @Requer('decl.create')
  apagar(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(z.object({ motivo: z.string().trim().min(3).max(500) }))) b: { motivo: string }, @Actor() u: Utilizador) { return this.svc.apagar(id, b.motivo, u); }

  @Get(':id/ficheiro/:tipo') @Requer('document.download')
  async ficheiro(@Param('id', ParseUUIDPipe) id: string, @Param('tipo') tipo: string, @Actor() u: Utilizador, @Res() res: Response) {
    if (!['pdf', 'docx'].includes(tipo)) throw new BadRequestException('Tipo inválido (pdf, docx)');
    const d = await this.svc.ficheiro(id, tipo === 'pdf' ? 'PDF' : 'DOCX', u);
    const ascii = d.nome.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^A-Za-z0-9._-]+/g, '_');
    res.set({ 'Content-Type': d.mime, 'Content-Disposition': `attachment; filename="${ascii}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }).send(d.buf);
  }
}
