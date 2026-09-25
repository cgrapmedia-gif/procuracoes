/** Numeração configurável. A atribuição atómica é feita na BD (ver api/sequences); aqui só o formato. */
export interface ConfigNumeracao { padrao: string; prefixo: string; serie?: string; digitos: number }

/** Padrão com tokens {PREFIXO} {SERIE} {ANO} {SEQ}. Ex.: "{PREFIXO}-{ANO}-{SEQ}" -> PROC-2026-000001 */
export function formatarNumeroDocumento(cfg: ConfigNumeracao, ano: number, seq: number): string {
  if (!Number.isInteger(seq) || seq < 1) throw new RangeError('Sequência inválida');
  const s = cfg.padrao
    .replace('{PREFIXO}', cfg.prefixo)
    .replace('{SERIE}', cfg.serie ?? '')
    .replace('{ANO}', String(ano))
    .replace('{SEQ}', String(seq).padStart(cfg.digitos, '0'));
  return s.replace(/--+/g, '-').replace(/^-|-$/g, '');
}
