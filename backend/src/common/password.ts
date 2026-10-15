import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + scryptSync(password, salt, 64).toString('hex');
}
export function verifyPassword(password: string, hash: string) {
  const [salt, value] = hash.split(':');
  if (!salt || !value || !/^[a-f0-9]{128}$/.test(value)) return false;
  return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(value, 'hex'));
}
