import { validateEnvironment } from './config';

const configuration = () => ({
  DATABASE_URL: 'postgresql://test-only@localhost/foundation_test',
  JWT_SECRET: 'test-only-secret-at-least-thirty-two-characters',
  JWT_ISSUER: 'foundation-test',
  JWT_AUDIENCE: 'foundation-test',
  FRONTEND_URL: 'http://localhost:3000',
  NODE_ENV: 'test',
});
describe('foundation configuration boundary', () => {
  it('disables production startup when demo authentication is enabled', () => {
    expect(() =>
      validateEnvironment({
        ...configuration(),
        NODE_ENV: 'production',
        DEMO_AUTH_ENABLED: 'true',
      }),
    ).toThrow('Demo authentication cannot run in production');
  });
  it('allows production configuration with the demo adapter disabled', () => {
    expect(
      validateEnvironment({
        ...configuration(),
        NODE_ENV: 'production',
        DEMO_AUTH_ENABLED: 'false',
      }).HOST,
    ).toBe('127.0.0.1');
  });
  it.each(['DATABASE_URL', 'JWT_SECRET', 'JWT_ISSUER', 'JWT_AUDIENCE', 'FRONTEND_URL'])(
    'rejects missing %s rather than starting with a fallback secret or identity context',
    (key) => {
      expect(() => validateEnvironment({ ...configuration(), [key]: '' })).toThrow(
        'Missing configuration: ' + key,
      );
    },
  );
  it('rejects weak JWT secrets and non-PostgreSQL connection strings', () => {
    expect(() => validateEnvironment({ ...configuration(), JWT_SECRET: 'short' })).toThrow(
      'JWT_SECRET',
    );
    expect(() =>
      validateEnvironment({ ...configuration(), DATABASE_URL: 'file:local.db' }),
    ).toThrow('PostgreSQL');
  });
  it('bounds upload size and validates the frontend origin scheme', () => {
    expect(() =>
      validateEnvironment({ ...configuration(), MAX_FILE_BYTES: 21 * 1024 * 1024 }),
    ).toThrow('MAX_FILE_BYTES');
    expect(() =>
      validateEnvironment({ ...configuration(), FRONTEND_URL: 'ftp://localhost' }),
    ).toThrow('FRONTEND_URL');
  });
});
