/** Validadores de identificadores usados em procurações (Angola / Portugal). Funções puras. */

export function nifPortugalValido(nif: string): boolean {
  const s = nif.replace(/\s/g, '');
  if (!/^[125689]\d{8}$|^(45|70|71|72|74|75|77|79)\d{7}$/.test(s)) return false;
  let soma = 0;
  for (let i = 0; i < 8; i++) soma += Number(s[i]) * (9 - i);
  const resto = soma % 11;
  const dv = resto < 2 ? 0 : 11 - resto;
  return dv === Number(s[8]);
}

/** NIF angolano: pessoa singular = n.º do BI (ex. 000123456LA012); pessoa colectiva = 10 dígitos. */
export function nifAngolaValido(nif: string): boolean {
  const s = nif.replace(/\s/g, '').toUpperCase();
  return biAngolaValido(s) || /^\d{10}$/.test(s);
}

/** Bilhete de Identidade angolano: 9 dígitos + 2 letras (província) + 3 dígitos. */
export function biAngolaValido(bi: string): boolean {
  return /^\d{9}[A-Z]{2}\d{3}$/.test(bi.replace(/\s/g, '').toUpperCase());
}

const IBAN_LEN: Record<string, number> = { AO: 25, PT: 25, ES: 24, FR: 27, DE: 22, GB: 22, BR: 29, CH: 21, LU: 20, BE: 16, NL: 18, IT: 27 };

export function normalizarIban(iban: string): string { return iban.replace(/[\s.\-]/g, '').toUpperCase(); }

/** IBAN (ISO 13616, mod-97). Aceita IBAN angolano sem prefixo AO06? Não: exige formato completo. */
export function ibanValido(iban: string): boolean {
  const s = normalizarIban(iban);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(s)) return false;
  const len = IBAN_LEN[s.slice(0, 2)];
  if (len && s.length !== len) return false;
  const rearr = s.slice(4) + s.slice(0, 4);
  let resto = 0;
  for (const ch of rearr) {
    const v = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of v) resto = (resto * 10 + Number(d)) % 97;
  }
  return resto === 1;
}

export function formatarIban(iban: string): string { return normalizarIban(iban).replace(/(.{4})/g, '$1 ').trim(); }

export const codigoPostalPTValido = (cp: string) => /^\d{4}-\d{3}$/.test(cp.trim());
export const emailValido = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());
export const telefoneValido = (t: string) => /^\+?[0-9][0-9 ]{7,17}$/.test(t.trim());
