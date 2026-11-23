import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createBetterAuthInstance } from '@lenne.tech/nest-server';
import { describe, expect, it } from 'vitest';

/**
 * The commented Microsoft Entra ID example in `src/config.env.ts` signs in through the redirect only.
 *
 * With `disableIdTokenSignIn: false` (and up to nest-server 12.10.x without the option, which 12.11.0
 * closes by default), Better-Auth's `POST /iam/sign-in/social` (and `/iam/link-social`) accepts a
 * Microsoft ID token directly. A signed-in user can read the ID token of their last
 * Microsoft sign-in back (`POST /iam/get-access-token`), and until about an hour after that sign-in
 * it opens a new session without asking Microsoft, also after the organization revoked the user's
 * access there. The redirect flow never takes that path.
 *
 * The first case also holds in a project that switched the example on (uncommented) and skips once
 * the project removed the Microsoft block altogether. The last case pins nest-server's default: a
 * provider without the option is closed as well.
 *
 * The cases build the REAL Better-Auth instance through nest-server with the example's options and
 * call Better-Auth's own handler. The token is not a JWT, so the verifier refuses it without a
 * network call; what matters is WHICH answer comes back.
 */

/** Minimal MongoDB `Db` stand-in: lookups find nothing, writes succeed. */
const fakeDb: any = {
  collection: () => ({
    aggregate: () => ({ toArray: async () => [] }),
    createIndex: async () => undefined,
    find: () => {
      const cursor: any = { limit: () => cursor, skip: () => cursor, sort: () => cursor, toArray: async () => [] };
      return cursor;
    },
    findOne: async () => null,
    insertOne: async () => ({ insertedId: 'x' }),
  }),
};

/** The options of the commented example, with the credentials an operator sets per stage. */
const EXAMPLE = {
  clientId: 'microsoft-client-id',
  clientSecret: 'microsoft-client-secret',
  disableDefaultScope: true,
  disableIdTokenSignIn: true,
  disableProfilePhoto: true,
  disableSignUp: false,
  scope: ['openid', 'profile', 'email'],
  tenantId: '11111111-2222-3333-4444-555555555555',
};

/** The code Better-Auth answers a sign-in with a submitted Microsoft ID token with. */
async function idTokenSignInCode(microsoft: Record<string, unknown>): Promise<string | undefined> {
  const result = createBetterAuthInstance({
    config: {
      enabled: true,
      secret: 'a-very-long-secret-that-is-at-least-32-characters-long-for-testing',
      socialProviders: { microsoft },
    } as any,
    db: fakeDb,
  } as any);
  expect(result).not.toBeNull();
  try {
    await result!.instance.api.signInSocial({
      body: { idToken: { token: 'replayed-id-token' }, provider: 'microsoft' },
    });
  } catch (error: any) {
    return error?.body?.code;
  }
  return undefined;
}

/** The `microsoft: { … }` block of src/config.env.ts, commented out or switched on; '' once removed. */
const MICROSOFT_BLOCK =
  readFileSync(join(import.meta.dirname, '../../src/config.env.ts'), 'utf8').match(
    /^[ \t]*(?:\/\/[ \t]*)?microsoft: \{[\s\S]*?^[ \t]*(?:\/\/[ \t]*)?\},/m,
  )?.[0] ?? '';

describe('Microsoft Entra ID example (src/config.env.ts)', () => {
  it.skipIf(!MICROSOFT_BLOCK)('keeps disableIdTokenSignIn: true in the microsoft block', () => {
    expect(MICROSOFT_BLOCK).toMatch(/^[ \t]*(?:\/\/[ \t]*)?disableIdTokenSignIn: true,/m);
  });

  it('refuses a submitted ID token with ID_TOKEN_NOT_SUPPORTED', async () => {
    expect(await idTokenSignInCode(EXAMPLE)).toBe('ID_TOKEN_NOT_SUPPORTED');
  });

  it('would verify a submitted ID token with the option set to false, so the option is what closes the path', async () => {
    const code = await idTokenSignInCode({ ...EXAMPLE, disableIdTokenSignIn: false });
    expect(code).toBeDefined();
    expect(code).not.toBe('ID_TOKEN_NOT_SUPPORTED');
  });

  it('refuses a submitted ID token without the option, the default since nest-server 12.11.0', async () => {
    const { disableIdTokenSignIn: _default, ...withoutOption } = EXAMPLE;
    expect(await idTokenSignInCode(withoutOption)).toBe('ID_TOKEN_NOT_SUPPORTED');
  });
});
