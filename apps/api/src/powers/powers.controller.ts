import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, UploadedFile, UseInterceptors, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { asc } from 'drizzle-orm';
import { z } from 'zod';
import { Actor, Requer, Utilizador, ZodPipe } from '../common/http';
import { Db, InjectDb } from '../db/db.module';
import { powerCategories } from '../db/schema';
import { AuditService } from '../common/audit.service';
import { ActualizarMetadados, ConteudoVersao, CriarPoder, PesquisaPoderes } from './power.schemas';
import { ImportService } from './import.service';
import { PowersService } from './powers.service';

const Categoria = z.object({ codigo: z.string().regex(/^[A-Z0-9_]{2,40}$/), nome: z.string().min(2).max(120), descricao: z.string().max(500).optional(), ordem: z.number().int().default(0) });

@Controller()
export class PowersController {
  constructor(private readonly svc: PowersService, private readonly imp: ImportService, @InjectDb() private readonly db: Db, private readonly audit: AuditService) {}

  @Get('power-categories') @Requer('power.read')
  categorias() { return this.db.select().from(powerCategories).orderBy(asc(powerCategories.sort), asc(powerCategories.name)); }

  @Post('power-categories') @Requer('power.manage')
  criarCategoria(@Body(new ZodPipe(Categoria)) b: z.infer<typeof Categoria>, @Actor() u: Utilizador) {
    return this.db.transaction(async (tx) => {
      const [c] = await tx.insert(powerCategories).values({ code: b.codigo, name: b.nome, description: b.descricao, sort: b.ordem }).returning();
      await this.audit.log(tx, u, 'CATEGORIA_CRIAR', 'power_category', c.id, b);
      return c;
    });
  }

  @Get('powers') @Requer('power.read')
  pesquisar(@Query(new ZodPipe(PesquisaPoderes)) q: z.infer<typeof PesquisaPoderes>, @Actor() u: Utilizador) { return this.svc.pesquisar(q, u); }

  @Get('powers/export') @Requer('power.manage')
  exportar() { return this.svc.exportar(); }

  @Post('powers/publish-batch') @Requer('power.publish')
  publicarLote(@Body(new ZodPipe(z.object({ ids: z.array(z.string().uuid()).min(1).max(500) }))) b: { ids: string[] }, @Actor() u: Utilizador) { return this.svc.publicarLote(b.ids, u); }

  @Get('powers/:id') @Requer('power.read')
  obter(@Param('id', ParseUUIDPipe) id: string) { return this.svc.obter(id); }

  @Post('powers') @Requer('power.manage')
  criar(@Body(new ZodPipe(CriarPoder)) b: z.infer<typeof CriarPoder>, @Actor() u: Utilizador) { return this.svc.criar(b, u); }

  @Put('powers/:id') @Requer('power.manage')
  metadados(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(ActualizarMetadados)) b: z.infer<typeof ActualizarMetadados>, @Actor() u: Utilizador) { return this.svc.actualizarMetadados(id, b, u); }

  @Put('powers/:id/draft') @Requer('power.manage')
  rascunho(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(ConteudoVersao)) b: z.infer<typeof ConteudoVersao>, @Actor() u: Utilizador) { return this.svc.guardarRascunho(id, b, u); }

  @Post('powers/:id/publish') @Requer('power.publish')
  publicar(@Param('id', ParseUUIDPipe) id: string, @Actor() u: Utilizador) { return this.svc.publicar(id, u); }

  @Post('powers/:id/duplicate') @Requer('power.manage')
  duplicar(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(z.object({ codigo: z.string().regex(/^[A-Z0-9][A-Z0-9_-]{1,39}$/) }))) b: { codigo: string }, @Actor() u: Utilizador) { return this.svc.duplicar(id, b.codigo, u); }

  @Post('powers/:id/deactivate') @Requer('power.manage') desactivar(@Param('id', ParseUUIDPipe) id: string, @Actor() u: Utilizador) { return this.svc.definirActivo(id, false, u); }
  @Post('powers/:id/activate') @Requer('power.manage') activar(@Param('id', ParseUUIDPipe) id: string, @Actor() u: Utilizador) { return this.svc.definirActivo(id, true, u); }
  @Post('powers/:id/favorite') @Requer('power.read') fav(@Param('id', ParseUUIDPipe) id: string, @Actor() u: Utilizador) { return this.svc.favorito(id, true, u); }
  @Delete('powers/:id/favorite') @Requer('power.read') unfav(@Param('id', ParseUUIDPipe) id: string, @Actor() u: Utilizador) { return this.svc.favorito(id, false, u); }

  @Post('powers/import/preview') @Requer('power.import')
  @UseInterceptors(FileInterceptor('ficheiro', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async preview(@UploadedFile() f: Express.Multer.File | undefined, @Body() body: { linhas?: unknown[] }, @Actor() u: Utilizador) {
    if (f) return this.imp.preVisualizar(f.originalname, await this.imp.lerFicheiro(f.originalname, f.buffer), u);
    if (Array.isArray(body?.linhas)) return this.imp.preVisualizar('api.json', body.linhas as Record<string, unknown>[], u);
    throw new BadRequestException('Envie um ficheiro (campo "ficheiro") ou { linhas: [...] }');
  }

  @Post('powers/import/:loteId/commit') @Requer('power.import')
  confirmar(@Param('loteId', ParseUUIDPipe) id: string, @Actor() u: Utilizador) { return this.imp.confirmar(id, u); }
}
