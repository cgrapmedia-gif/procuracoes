import { Injectable } from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config';

/**
 * Armazenamento de ficheiros. Chaves aleatórias (UUID), nunca derivadas do número ou do nome.
 * Os ficheiros NUNCA são servidos por URL pública: o download passa pela API (autorização + auditoria).
 * S3/MinIO: bucket privado com SSE e versionamento; "local" é só para desenvolvimento/testes.
 */
@Injectable()
export class StorageService {
  private readonly cfg = config();
  private readonly s3 = this.cfg.STORAGE_DRIVER === 's3'
    ? new S3Client({ endpoint: this.cfg.S3_ENDPOINT, region: this.cfg.S3_REGION, forcePathStyle: true, credentials: { accessKeyId: this.cfg.S3_ACCESS_KEY!, secretAccessKey: this.cfg.S3_SECRET_KEY! } })
    : null;

  novaChave(ext: string): string { const d = new Date(); return `poa/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${ext}`; }

  async put(key: string, body: Buffer, mime: string): Promise<void> {
    if (this.s3) { await this.s3.send(new PutObjectCommand({ Bucket: this.cfg.S3_BUCKET, Key: key, Body: body, ContentType: mime, ...(this.cfg.S3_SSE === 'none' ? {} : { ServerSideEncryption: this.cfg.S3_SSE }), ...(this.cfg.S3_CONDITIONAL_WRITES === 'true' ? { IfNoneMatch: '*' } : {}) })); return; }
    const p = this.local(key);
    await mkdir(path.dirname(p), { recursive: true });
    try { await access(p); throw new Error('Objecto já existe'); } catch (e) { if ((e as Error).message === 'Objecto já existe') throw e; }
    await writeFile(p, body, { mode: 0o600 });
  }

  async get(key: string): Promise<Buffer> {
    if (this.s3) { const r = await this.s3.send(new GetObjectCommand({ Bucket: this.cfg.S3_BUCKET, Key: key })); return Buffer.from(await r.Body!.transformToByteArray()); }
    return readFile(this.local(key));
  }

  private local(key: string): string {
    if (key.includes('..')) throw new Error('Chave inválida');
    return path.resolve(this.cfg.STORAGE_LOCAL_DIR, key);
  }
}
