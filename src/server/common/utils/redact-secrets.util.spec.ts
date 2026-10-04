import { redactSecrets } from './redact-secrets.util';

describe('redactSecrets', () => {
  it('blanks the secrets of a configuration and keeps the rest', () => {
    const config = {
      betterAuth: { enabled: true, secret: 'better-auth-secret' },
      email: { smtp: { auth: { pass: 'smtp-pass', user: 'mailer' }, host: 'smtp.example' } },
      env: 'production',
      jwt: { refresh: { secret: 'refresh-secret' }, secret: 'jwt-secret' },
      mongoose: { uri: 'mongodb://user:pw@mongo/db' },
      port: 3000,
    };
    const out = redactSecrets(config);
    expect(JSON.stringify(out)).not.toMatch(/better-auth-secret|smtp-pass|jwt-secret|refresh-secret|user:pw/);
    expect(out.env).toBe('production');
    expect(out.port).toBe(3000);
    expect(out.betterAuth.enabled).toBe(true);
    expect(out.email.smtp.host).toBe('smtp.example');
  });
});
