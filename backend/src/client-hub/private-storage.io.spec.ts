import { randomUUID } from 'node:crypto';
import { promises as filesystem } from 'node:fs';
import path from 'node:path';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { PrivateStorageService } from './private-storage.service';

describe('private local object lifecycle', () => {
  const base = path.resolve('.data/storage-unit');
  let root: string;
  let storage: PrivateStorageService;
  const file = () => {
    const buffer = Buffer.from('Private client brief');
    return {
      originalname: 'brief.txt',
      mimetype: 'text/plain',
      size: buffer.length,
      buffer,
    } as Express.Multer.File;
  };
  beforeEach(() => {
    root = path.join(base, randomUUID());
    storage = new PrivateStorageService(
      new ConfigService({
        STORAGE_ROOT: root,
        MAX_FILE_BYTES: 100,
        ALLOWED_FILE_TYPES: ' text/plain ',
      }),
    );
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    if (path.dirname(root) !== base || !base.startsWith(process.cwd() + path.sep))
      throw new Error('Unsafe unit fixture cleanup');
    await filesystem.rm(root, { recursive: true, force: true });
  });
  it('publishes complete private objects under generated keys without leaving staging files', async () => {
    const key = await storage.put(file());
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    expect(await filesystem.readdir(root)).toEqual([key]);
    expect(await storage.read(key)).toEqual(file().buffer);
  });
  it('rejects traversal and malformed object keys without returning bytes', async () => {
    for (const key of ['../../private', '..\\private', '-'.repeat(36), randomUUID() + '/extra'])
      await expect(storage.read(key)).rejects.toMatchObject({ status: 404 });
  });
  it('removes failed uncommitted objects idempotently', async () => {
    const key = await storage.put(file());
    await storage.removeUncommitted(key);
    await storage.removeUncommitted(key);
    expect(await filesystem.readdir(root)).toEqual([]);
  });
  it('refuses storage inside the frontend application', () => {
    expect(
      () =>
        new PrivateStorageService(
          new ConfigService({
            STORAGE_ROOT: path.resolve('../frontend/public/files'),
          }),
        ),
    ).toThrow('outside the frontend');
  });
  it('cleans a staged object after publication fails and returns a safe storage error', async () => {
    jest
      .spyOn(filesystem, 'rename')
      .mockRejectedValueOnce(new Error('Private filesystem diagnostic'));
    await expect(storage.put(file())).rejects.toMatchObject({ status: 500 });
    expect(await filesystem.readdir(root)).toEqual([]);
  });
  it('rejects non-regular objects', async () => {
    const key = randomUUID();
    await filesystem.mkdir(path.join(root, key), { recursive: true });
    await expect(storage.read(key)).rejects.toMatchObject({ status: 404 });
  });
  it('dry-runs and then cleans only old unreferenced objects, preserving active/history references', async () => {
    const orphan = await storage.put(file());
    const retained = await storage.put(file());
    const fresh = await storage.put(file());
    const pending = randomUUID() + '.pending';
    await filesystem.writeFile(path.join(root, pending), 'Partial upload');
    await filesystem.writeFile(path.join(root, 'unmanaged.txt'), 'Not an upload object');
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
    for (const name of [orphan, retained, pending])
      await filesystem.utimes(path.join(root, name), old, old);
    const referenced = async (key: string) => key === retained;
    const dryRun = await storage.reconcile(referenced);
    expect(dryRun).toMatchObject({ eligible: 2, deleted: 0, retained: 2, failures: 0 });
    expect((await filesystem.readdir(root)).length).toBe(5);
    const applied = await storage.reconcile(referenced, true);
    expect(applied).toMatchObject({ deleted: 2, failures: 0 });
    expect((await filesystem.readdir(root)).sort()).toEqual(
      [retained, fresh, 'unmanaged.txt'].sort(),
    );
  });
  it('does not delete anything when the metadata lookup fails', async () => {
    const key = await storage.put(file());
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
    await filesystem.utimes(path.join(root, key), old, old);
    await expect(
      storage.reconcile(async () => {
        throw new Error('Database unavailable');
      }, true),
    ).rejects.toThrow('Database unavailable');
    expect(await storage.read(key)).toEqual(file().buffer);
  });
  it('leaves failed cleanup private for reconciliation without logging keys or paths', async () => {
    const key = await storage.put(file());
    const warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest
      .spyOn(filesystem, 'unlink')
      .mockRejectedValueOnce(Object.assign(new Error('Denied'), { code: 'EACCES' }));
    await storage.removeUncommitted(key);
    expect(warning).toHaveBeenCalledWith(
      'Private upload cleanup deferred to local storage reconciliation',
    );
    expect(await storage.read(key)).toEqual(file().buffer);
  });
});
