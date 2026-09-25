import { z } from 'zod';
import { TIPOS_CAMPO } from '@proc/core';

export const CampoSchema = z.object({
  chave: z.string().regex(/^[a-z][a-z0-9_]{0,59}$/, 'chave: minúsculas, dígitos e _ (ex.: artigo_matricial)'),
  rotulo: z.string().min(1).max(120),
  tipo: z.enum(TIPOS_CAMPO),
  obrigatorio: z.boolean().default(false),
  ajuda: z.string().max(500).optional(),
  opcoes: z.array(z.object({ valor: z.string().min(1).max(80), rotulo: z.string().min(1).max(200) })).max(100).optional(),
  validacao: z.object({ regex: z.string().max(300).optional(), mensagemRegex: z.string().max(200).optional(), min: z.number().optional(), max: z.number().optional(), minComprimento: z.number().int().optional(), maxComprimento: z.number().int().optional(), pais: z.enum(['AO', 'PT']).optional() }).optional(),
  moeda: z.enum(['AOA', 'EUR', 'USD']).optional(),
  textoVerdadeiro: z.string().max(500).optional(), textoFalso: z.string().max(500).optional(),
}).superRefine((c, ctx) => {
  if (['LISTA', 'RADIO', 'SELECCAO_MULTIPLA'].includes(c.tipo) && !c.opcoes?.length) ctx.addIssue({ code: 'custom', message: `${c.chave}: o tipo ${c.tipo} exige opções` });
  if (c.validacao?.regex) { try { new RegExp(c.validacao.regex); } catch { ctx.addIssue({ code: 'custom', message: `${c.chave}: expressão regular inválida` }); } }
});

export const RegraSchema = z.object({ tipo: z.enum(['REQUER', 'INCOMPATIVEL', 'SUGERE']), alvoCodigo: z.string().min(1).max(40), mensagem: z.string().max(300).optional() });

export const ConteudoVersao = z.object({
  texto: z.string().min(3).max(20000),
  textoAlternativo: z.string().max(20000).nullish(),
  campos: z.array(CampoSchema).max(40).default([]),
  regras: z.array(RegraSchema).max(60).default([]),
  exclusivo: z.boolean().default(false),
  tiposPermitidos: z.array(z.string().max(40)).default([]),
  notaAlteracao: z.string().max(500).optional(),
});
export type ConteudoVersao = z.infer<typeof ConteudoVersao>;

export const CriarPoder = z.object({
  codigo: z.string().regex(/^[A-Z0-9][A-Z0-9_-]{1,39}$/, 'código em maiúsculas, ex.: BANC-001'),
  tipo: z.enum(['PODER', 'CLAUSULA']).default('PODER'),
  categoriaCodigo: z.string().min(1),
  nome: z.string().min(3).max(200),
  descricao: z.string().max(2000).optional(),
  obrigatorio: z.boolean().default(false),
  ordem: z.number().int().default(0),
}).merge(ConteudoVersao);

export const ActualizarMetadados = z.object({ nome: z.string().min(3).max(200).optional(), descricao: z.string().max(2000).nullish(), categoriaCodigo: z.string().optional(), obrigatorio: z.boolean().optional(), ordem: z.number().int().optional() });

export const PesquisaPoderes = z.object({
  q: z.string().max(200).optional(), categoria: z.string().optional(), tipo: z.enum(['PODER', 'CLAUSULA']).optional(),
  activos: z.enum(['true', 'false', 'todos']).default('true'), favoritos: z.enum(['true', 'false']).optional(), recentes: z.enum(['true', 'false']).optional(),
  tipoProcuracao: z.string().optional(),
  /** Gestão: incluir poderes ainda sem versão publicada (mostra a última versão). */
  rascunhos: z.enum(['true', 'false', 'so']).optional(),
  limite: z.coerce.number().int().min(1).max(200).default(50), pagina: z.coerce.number().int().min(1).default(1),
});
