import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { isUUID } from 'class-validator';
import { lstat, mkdir, open, opendir, readFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { ApiError } from '../common/http';
import { PrivateStorage } from './private-storage';

import { SUPPORTED_FILE_TYPES } from '../common/config';

export function validateFile(
  file: Pick<Express.Multer.File, 'size' | 'buffer' | 'mimetype'>,
  max: number,
  allowed: string[],
) {
  if (file.size < 1 || file.size > max || file.buffer.length !== file.size)
    throw new ApiError(
      400,
      'INVALID_FILE_SIZE',
      'File is empty or exceeds the configured size limit',
    );
  if (!allowed.includes(file.mimetype))
    throw new ApiError(400, 'INVALID_FILE_TYPE', 'This file type is not allowed');
  const b = file.buffer;
  const signatures: Record<string, boolean> = {
    'application/pdf': b.subarray(0, 5).equals(Buffer.from('%PDF-')),
    'image/png': b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    'image/jpeg': b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255,
    'text/plain':
      Buffer.from(b.toString('utf8'), 'utf8').equals(b) &&
      !/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(b.toString('utf8')),
  };
  if (!signatures[file.mimetype])
    throw new ApiError(
      400,
      'INVALID_FILE_CONTENT',
      'File content does not match its declared type',
    );
}

@Injectable()
export class PrivateStorageService extends PrivateStorage {
  private readonly root: string;
  private readonly logger = new Logger(PrivateStorageService.name);
  constructor(private readonly config: ConfigService) {
    super();
    this.root = path.resolve(config.get<string>('STORAGE_ROOT') ?? '.data/files');
    for (const frontend of [path.resolve('frontend'), path.resolve('../frontend')]) {
      const relative = path.relative(frontend, this.root);
      if (
        !relative ||
        (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
      )
        throw new Error('Private storage must be outside the frontend application');
    }
  }
  private location(key: string) {
    if (!isUUID(key, '4')) throw new ApiError(404, 'NOT_FOUND', 'Record not found');
    const candidate = path.resolve(this.root, key);
    if (path.dirname(candidate) !== this.root)
      throw new ApiError(404, 'NOT_FOUND', 'Record not found');
    return candidate;
  }
  private async discard(location: string) {
    try {
      await unlink(location);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        this.logger.warn('Private upload cleanup deferred to local storage reconciliation');
    }
  }
  async put(file: Express.Multer.File) {
    validateFile(
      file,
      this.config.getOrThrow<number>('MAX_FILE_BYTES'),
      (this.config.get<string>('ALLOWED_FILE_TYPES') ?? SUPPORTED_FILE_TYPES.join(','))
        .split(',')
        .map((value) => value.trim()),
    );
    const key = randomUUID();
    const destination = this.location(key);
    const staging = destination + '.pending';
    let owned = false;
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      await mkdir(this.root, { recursive: true, mode: 0o700 });
      handle = await open(staging, 'wx', 0o600);
      owned = true;
      await handle.writeFile(file.buffer);
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(staging, destination);
      return key;
    } catch {
      await handle?.close().catch(() => undefined);
      if (owned) await this.discard(staging);
      throw new ApiError(500, 'STORAGE_WRITE_FAILED', 'The file could not be stored');
    }
  }
  async read(key: string) {
    try {
      const location = this.location(key);
      const information = await lstat(location);
      if (!information.isFile() || information.isSymbolicLink()) throw new Error('Invalid object');
      return await readFile(location);
    } catch {
      throw new ApiError(404, 'FILE_UNAVAILABLE', 'File is unavailable');
    }
  }
  async removeUncommitted(key: string) {
    await this.discard(this.location(key));
  }

  /** Local maintenance only: run apply with upload workers stopped; never delete referenced bytes. */
  async reconcile(
    isReferenced: (key: string) => Promise<boolean>,
    apply = false,
    now = new Date(),
  ) {
    const result = {
      scanned: 0,
      eligible: 0,
      deleted: 0,
      retained: 0,
      failures: 0,
      truncated: false,
    };
    const cutoff = now.getTime() - 24 * 60 * 60 * 1000;
    let directory;
    try {
      directory = await opendir(this.root);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return result;
      throw new ApiError(500, 'STORAGE_UNAVAILABLE', 'Private storage is unavailable');
    }
    for await (const entry of directory) {
      if (result.scanned >= 10000) {
        result.truncated = true;
        break;
      }
      result.scanned++;
      const key = entry.name.endsWith('.pending') ? entry.name.slice(0, -8) : entry.name;
      if (!isUUID(key, '4') || !entry.isFile() || entry.isSymbolicLink()) continue;
      const location = path.join(this.root, entry.name);
      const info = await lstat(location).catch(() => null);
      if (!info || !info.isFile() || info.isSymbolicLink()) continue;
      if (info.mtimeMs >= cutoff || (await isReferenced(key))) {
        result.retained++;
        continue;
      }
      result.eligible++;
      if (apply) {
        // Re-check metadata just before removing a stale unreferenced object.
        if (await isReferenced(key)) {
          result.retained++;
          continue;
        }
        try {
          await unlink(location);
          result.deleted++;
        } catch {
          result.failures++;
        }
      }
    }
    return result;
  }
}
