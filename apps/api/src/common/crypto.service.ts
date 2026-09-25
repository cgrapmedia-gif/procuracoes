import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { config } from '../config';

/** Cifra de campos sensíveis (AES-256-GCM) + índice cego (HMAC-SHA256) para pesquisa exacta sem expor o valor. */
@Injectable()
export class CryptoService {
  private readonly key = Buffer.from(config().DATA_ENC_KEY, 'base64');
  private readonly bidxKey = config().DATA_BIDX_KEY;

  encrypt(plain: string): string;
  encrypt(plain: string | null | undefined): string | null;
  encrypt(plain: string | null | undefined): string | null {
    if (plain === null || plain === undefined || plain === '') return null;
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
    return `v1.${iv.toString('base64')}.${c.getAuthTag().toString('base64')}.${enc.toString('base64')}`;
  }

  decrypt(payload: string | null | undefined): string | null {
    if (!payload) return null;
    const [v, iv, tag, data] = payload.split('.');
    if (v !== 'v1') throw new Error('Formato de cifra desconhecido');
    const d = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
  }

  /** Normaliza (maiúsculas, sem espaços/pontuação) antes do HMAC, para "000 123 LA" == "000123la". */
  blindIndex(value: string | null | undefined, scope: string): string | null {
    if (!value) return null;
    return createHmac('sha256', this.bidxKey).update(`${scope}:${value.toUpperCase().replace(/[^A-Z0-9]/g, '')}`).digest('hex');
  }

  static sha256(data: Buffer | string): string { return createHash('sha256').update(data).digest('hex'); }
  static token(bytes = 32): string { return randomBytes(bytes).toString('base64url'); }
}

/** Normalização para pesquisa por nome: minúsculas, sem acentos. */
export const normalizarNome = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
