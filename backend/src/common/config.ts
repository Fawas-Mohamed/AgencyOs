export const SUPPORTED_FILE_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'text/plain'];
export function validateEnvironment(env: Record<string, unknown>) {
  const required = ['DATABASE_URL', 'JWT_SECRET', 'JWT_ISSUER', 'JWT_AUDIENCE', 'FRONTEND_URL'];
  for (const key of required)
    if (!env[key] || typeof env[key] !== 'string') throw new Error('Missing configuration: ' + key);
  if (String(env.JWT_SECRET).length < 32)
    throw new Error('JWT_SECRET must contain at least 32 characters');
  if (!/^postgres(ql)?:/.test(String(env.DATABASE_URL)))
    throw new Error('PostgreSQL DATABASE_URL required');
  const origin = new URL(String(env.FRONTEND_URL));
  if (!['http:', 'https:'].includes(origin.protocol)) throw new Error('Invalid FRONTEND_URL');
  const max = Number(env.MAX_FILE_BYTES ?? 5242880);
  if (!Number.isInteger(max) || max < 1 || max > 20 * 1024 * 1024)
    throw new Error('Invalid MAX_FILE_BYTES');
  if (env.NODE_ENV === 'production' && env.DEMO_AUTH_ENABLED === 'true')
    throw new Error('Demo authentication cannot run in production');
  const allowed = String(env.ALLOWED_FILE_TYPES ?? SUPPORTED_FILE_TYPES.join(','))
    .split(',')
    .map((value) => value.trim());
  if (!allowed.length || allowed.some((value) => !SUPPORTED_FILE_TYPES.includes(value)))
    throw new Error('ALLOWED_FILE_TYPES must be a nonempty subset of supported file types');
  return {
    ...env,
    ALLOWED_FILE_TYPES: [...new Set(allowed)].join(','),
    MAX_FILE_BYTES: max,
    PORT: Number(env.PORT ?? 5000),
    HOST: String(env.HOST ?? '127.0.0.1'),
  };
}
