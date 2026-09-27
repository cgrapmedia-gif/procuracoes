import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PersonsImportService } from './persons-import.service';
import { Actor, Requer, Utilizador, ZodPipe } from '../common/http';
import { PersonsService, PessoaDto } from './persons.service';

@Controller('persons')
export class PersonsController {
  constructor(private readonly svc: PersonsService, private readonly imp: PersonsImportService) {}

  @Post('import/preview') @Requer('person.import')
  @UseInterceptors(FileInterceptor('ficheiro', { limits: { fileSize: 10 * 1024 * 1024 } }))
  previewImport(@UploadedFile() f: Express.Multer.File | undefined, @Actor() u: Utilizador) {
    if (!f) throw new BadRequestException('Envie o ficheiro no campo "ficheiro" (.csv, .xlsx ou .json)');
    return this.imp.preVisualizar(f.originalname, f.buffer, u);
  }

  @Post('import/:lote/commit') @Requer('person.import')
  confirmarImport(@Param('lote', ParseUUIDPipe) lote: string, @Actor() u: Utilizador) { return this.imp.confirmar(lote, u); }
  @Get() @Requer('person.read') pesquisar(@Query('q') q: string | undefined, @Actor() u: Utilizador) { return this.svc.pesquisar(u, q); }
  @Get(':id') @Requer('person.read') obter(@Param('id', ParseUUIDPipe) id: string, @Actor() u: Utilizador) { return this.svc.obter(id, u); }
  @Post() @Requer('person.manage') criar(@Body(new ZodPipe(PessoaDto)) b: PessoaDto, @Actor() u: Utilizador) { return this.svc.criar(b, u); }
  @Put(':id') @Requer('person.manage') actualizar(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(PessoaDto)) b: PessoaDto, @Actor() u: Utilizador) { return this.svc.actualizar(id, b, u); }
}
