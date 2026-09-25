import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { Actor, Requer, Utilizador, ZodPipe } from '../common/http';
import { PersonsService, PessoaDto } from './persons.service';

@Controller('persons')
export class PersonsController {
  constructor(private readonly svc: PersonsService) {}
  @Get() @Requer('person.read') pesquisar(@Query('q') q: string | undefined, @Actor() u: Utilizador) { return this.svc.pesquisar(u, q); }
  @Get(':id') @Requer('person.read') obter(@Param('id', ParseUUIDPipe) id: string, @Actor() u: Utilizador) { return this.svc.obter(id, u); }
  @Post() @Requer('person.manage') criar(@Body(new ZodPipe(PessoaDto)) b: PessoaDto, @Actor() u: Utilizador) { return this.svc.criar(b, u); }
  @Put(':id') @Requer('person.manage') actualizar(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(PessoaDto)) b: PessoaDto, @Actor() u: Utilizador) { return this.svc.actualizar(id, b, u); }
}
