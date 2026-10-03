import { z } from 'zod';

const Data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const CriarProcuracao = z.object({
  tipoCodigo: z.string().min(1), dataActo: Data, local: z.string().min(2).max(120), oficianteId: z.string().uuid().optional(), modeloGuardadoId: z.string().uuid().optional(),
});
export const PoderInput = z.union([
  z.object({ versaoId: z.string().uuid(), usarAlternativo: z.boolean().default(false), valores: z.record(z.unknown()).default({}) }),
  z.object({ personalizado: z.object({ nome: z.string().min(3).max(200), texto: z.string().min(3).max(5000) }) }),
]);
export const GuardarProcuracao = z.object({
  lockVersion: z.number().int(),
  dataActo: Data, local: z.string().min(2).max(120), oficianteId: z.string().uuid().nullish(),
  formaActuacao: z.enum(['ISOLADAMENTE', 'CONJUNTAMENTE', 'QUALQUER_UM', 'DOIS_CONJUNTAMENTE', 'PERSONALIZADA']),
  formaActuacaoPersonalizada: z.string().max(500).nullish(),
  naturezaPoderes: z.string().trim().max(300).nullish(),
  outorgantes: z.array(z.object({ pessoaId: z.string().uuid(), qualidade: z.string().max(500).nullish() })).min(1).max(10),
  procuradores: z.array(z.object({ pessoaId: z.string().uuid() })).min(1).max(10),
  poderes: z.array(PoderInput).max(300), // a ordem do array é a ordem no documento
});
export type GuardarProcuracao = z.infer<typeof GuardarProcuracao>;
export const Transicao = z.object({ accao: z.enum(['SUBMETER', 'DEVOLVER', 'VALIDAR', 'EMITIR', 'EMITIR_DIRECTO', 'CANCELAR', 'ARQUIVAR']), motivo: z.string().max(1000).optional() });
export const PesquisaProcuracoes = z.object({
  q: z.string().max(200).optional(), numero: z.string().max(60).optional(), estado: z.enum(['RASCUNHO', 'EM_REVISAO', 'VALIDADA', 'EMITIDA', 'ASSINADA', 'CANCELADA', 'ARQUIVADA']).optional(),
  tipo: z.string().optional(), minhas: z.enum(['true', 'false']).optional(), de: Data.optional(), ate: Data.optional(), limite: z.coerce.number().int().min(1).max(100).default(25), pagina: z.coerce.number().int().min(1).default(1),
});
