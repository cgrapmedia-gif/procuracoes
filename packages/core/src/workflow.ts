/** Máquina de estados da procuração. Transições explícitas + permissão exigida. */
export type Estado = 'RASCUNHO' | 'EM_REVISAO' | 'VALIDADA' | 'EMITIDA' | 'ASSINADA' | 'CANCELADA' | 'ARQUIVADA';
export type Accao = 'SUBMETER' | 'DEVOLVER' | 'VALIDAR' | 'EMITIR' | 'EMITIR_DIRECTO' | 'REGISTAR_ASSINATURA' | 'CANCELAR' | 'ARQUIVAR';

export const TRANSICOES: Record<Accao, { de: Estado[]; para: Estado; permissao: string; exigeMotivo?: boolean }> = {
  SUBMETER: { de: ['RASCUNHO'], para: 'EM_REVISAO', permissao: 'poa.submit' },
  DEVOLVER: { de: ['EM_REVISAO', 'VALIDADA'], para: 'RASCUNHO', permissao: 'poa.validate', exigeMotivo: true },
  VALIDAR: { de: ['EM_REVISAO'], para: 'VALIDADA', permissao: 'poa.validate' },
  EMITIR: { de: ['VALIDADA'], para: 'EMITIDA', permissao: 'poa.issue' },
  /** Emissão directa: quem tem esta permissão faz o documento completo sem passar por revisão de terceiros. */
  EMITIR_DIRECTO: { de: ['RASCUNHO', 'EM_REVISAO', 'VALIDADA'], para: 'EMITIDA', permissao: 'poa.issue_direct' },
  REGISTAR_ASSINATURA: { de: ['EMITIDA'], para: 'ASSINADA', permissao: 'poa.issue' },
  CANCELAR: { de: ['RASCUNHO', 'EM_REVISAO', 'VALIDADA', 'EMITIDA', 'ASSINADA'], para: 'CANCELADA', permissao: 'poa.cancel', exigeMotivo: true },
  ARQUIVAR: { de: ['ASSINADA', 'CANCELADA'], para: 'ARQUIVADA', permissao: 'poa.archive' },
};

/** Estados a partir dos quais o conteúdo é imutável. */
export const IMUTAVEIS: Estado[] = ['EMITIDA', 'ASSINADA', 'CANCELADA', 'ARQUIVADA'];
export const editavel = (e: Estado) => e === 'RASCUNHO';

export class TransicaoInvalida extends Error {}
export class SemPermissao extends Error {}

export function transitar(estado: Estado, accao: Accao, opts: { permissoes: Set<string>; motivo?: string; criadorId?: string; actorId?: string; segregacao?: boolean }): Estado {
  const t = TRANSICOES[accao];
  if (!opts.permissoes.has(t.permissao)) throw new SemPermissao(`Sem permissão (${t.permissao}).`);
  if (!t.de.includes(estado)) throw new TransicaoInvalida(`Não é possível ${accao.toLowerCase()} uma procuração no estado ${estado}.`);
  if (t.exigeMotivo && !opts.motivo?.trim()) throw new TransicaoInvalida('É obrigatório indicar o motivo.');
  // Segregação de funções: quem redige não valida o próprio documento (configurável).
  if (accao === 'VALIDAR' && opts.segregacao !== false && opts.criadorId && opts.criadorId === opts.actorId)
    throw new TransicaoInvalida('Segregação de funções: o autor não pode validar a própria procuração.');
  return t.para;
}

export const accoesDisponiveis = (estado: Estado, permissoes: Set<string>): Accao[] =>
  (Object.keys(TRANSICOES) as Accao[]).filter((a) => TRANSICOES[a].de.includes(estado) && permissoes.has(TRANSICOES[a].permissao));
