/** Private object adapter. Providers must never expose public URLs or accept filenames as keys. */
export abstract class PrivateStorage {
  abstract put(file: Express.Multer.File): Promise<string>;
  abstract read(key: string): Promise<Buffer>;
  /** Removes only an object whose metadata transaction did not commit. */
  abstract removeUncommitted(key: string): Promise<void>;
}
