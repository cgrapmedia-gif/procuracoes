import type { DefinicaoCampo, RegraPoder, ValorCampo } from '@proc/core/browser';

export type Estado = 'RASCUNHO' | 'EM_REVISAO' | 'VALIDADA' | 'EMITIDA' | 'ASSINADA' | 'CANCELADA' | 'ARQUIVADA';
export const ESTADOS: Record<Estado, string> = { RASCUNHO: 'Rascunho', EM_REVISAO: 'Em revisão', VALIDADA: 'Validada', EMITIDA: 'Emitida', ASSINADA: 'Assinada', CANCELADA: 'Cancelada', ARQUIVADA: 'Arquivada' };
export type FormaActuacao = 'ISOLADAMENTE' | 'CONJUNTAMENTE' | 'QUALQUER_UM' | 'DOIS_CONJUNTAMENTE' | 'PERSONALIZADA';

export interface PoderCatalogo {
  id: string; codigo: string; tipo: 'PODER' | 'CLAUSULA'; nome: string; descricao: string | null; activo: boolean; categoria: string; categoriaNome: string;
  utilizacoes: number; versaoId: string; versao: number; texto: string; textoAlternativo: string | null; campos: DefinicaoCampo[]; regras: RegraPoder[];
  exclusivo: boolean; tiposPermitidos: string[]; demo: boolean; favorito: boolean;
}
export interface Categoria { id: string; code: string; name: string; sort: number }
export interface PessoaResumo { id: string; nomeCompleto: string; sexo: 'M' | 'F' | null; nacionalidade: string; documento: { tipo: string; numero: string; validade?: string; vitalicio?: boolean }; demo?: boolean }

export interface ItemRascunho {
  uid: string; versaoId?: string; codigo: string; nome: string; versao: number; clausula: boolean; usarAlternativo: boolean;
  campos: DefinicaoCampo[]; valores: Record<string, ValorCampo>; personalizado?: { nome: string; texto: string };
}
export interface Parte { pessoaId: string; nome: string; sexo: 'M' | 'F' | null; qualidade?: string | null }

export interface DetalheProcuracao {
  id: string; numero: string | null; estado: Estado; lockVersion: number; tipo: { codigo: string; nome: string }; dataActo: string; local: string; oficianteId: string | null;
  formaActuacao: FormaActuacao; formaActuacaoPersonalizada: string | null; demo: boolean; contentHash: string | null; codigoVerificacao: string | null;
  outorgantes: { id: string; nome: string; sexo: 'M' | 'F' | null; qualidade: string | null }[];
  procuradores: { id: string; nome: string; sexo: 'M' | 'F' | null }[];
  poderes: { instanciaId: string; versaoId: string; codigo: string; nome: string; versao: number; personalizado: boolean; textoPersonalizado?: string; usarAlternativo: boolean; campos: DefinicaoCampo[]; valores: Record<string, ValorCampo>; clausula?: boolean }[];
  historico: { id: string; fromStatus: Estado | null; toStatus: Estado; action: string; reason: string | null; at: string; actor: string }[];
  documentos: { id: string; tipo: 'PDF' | 'DOCX' | 'DIGITALIZACAO_ASSINADA'; sha256: string; tamanho: number; criadoEm: string }[];
}
export interface Problema { severidade: 'ERRO' | 'AVISO' | 'INFO'; codigo: string; instanciaId?: string; campo?: string; mensagem: string; correccao?: { accao: string; codigo: string } }
export interface Verificacao {
  problemas: Problema[]; checklist: { chave: string; rotulo: string; ok: boolean; detalhe?: string }[]; pronta: boolean;
  sugestoes: { codigo: string; nome: string; motivo: string; versaoId?: string }[]; accoes: string[]; estado: Estado;
}
