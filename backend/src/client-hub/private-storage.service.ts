import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ApiError } from '../common/http';
export function validateFile(file: Pick<Express.Multer.File,'size'|'buffer'|'mimetype'>, max: number, allowed: string[]) {
  if (file.size < 1 || file.size > max || file.buffer.length !== file.size) throw new ApiError(400,'INVALID_FILE_SIZE','File is empty or exceeds the configured size limit');
  if (!allowed.includes(file.mimetype)) throw new ApiError(400,'INVALID_FILE_TYPE','This file type is not allowed');
  const b = file.buffer;
  const signatures: Record<string, boolean> = {
    'application/pdf': b.subarray(0,5).equals(Buffer.from('%PDF-')),
    'image/png': b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),
    'image/jpeg': b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255,
    'text/plain': !b.includes(0) && Buffer.from(b.toString('utf8'),'utf8').equals(b),
  };
  if (!signatures[file.mimetype]) throw new ApiError(400,'INVALID_FILE_CONTENT','File content does not match its declared type');
}
@Injectable()
export class PrivateStorageService {
  private readonly root: string;
  constructor(private readonly config: ConfigService) { this.root = path.resolve(config.get<string>('STORAGE_ROOT') ?? '.data/files'); }
  private location(key: string) {
    if (!/^[0-9a-f-]{36}$/i.test(key)) throw new ApiError(404,'NOT_FOUND','Record not found');
    const candidate = path.resolve(this.root,key);
    if (path.dirname(candidate) !== this.root) throw new ApiError(404,'NOT_FOUND','Record not found');
    return candidate;
  }
  async put(file: Express.Multer.File) {
    validateFile(file,this.config.getOrThrow<number>('MAX_FILE_BYTES'),(this.config.get<string>('ALLOWED_FILE_TYPES') ?? 'application/pdf,image/png,image/jpeg,text/plain').split(','));
    await mkdir(this.root,{recursive:true,mode:0o700});
    const key = randomUUID();
    await writeFile(this.location(key),file.buffer,{flag:'wx',mode:0o600});
    return key;
  }
  async read(key: string) {
    try { return await readFile(this.location(key)); } catch { throw new ApiError(404,'FILE_UNAVAILABLE','File is unavailable'); }
  }
  async removeUncommitted(key: string) { await unlink(this.location(key)).catch(()=>undefined); }
}
